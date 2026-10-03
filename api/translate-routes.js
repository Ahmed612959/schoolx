'use strict';
/**
 * translate-routes.js — مترجم صفحات الكتب الطبية (إنجليزي → عربي) لطلاب التمريض
 *
 * بيتركّب في السيرفر الرئيسي بسطرين بس (قبل app.get('*') الأخير):
 *   require('./translate-routes')(app, { mongoose, rateLimit, verifyToken, isAdmin, connectToDatabase, Student });
 *
 * متغيرات البيئة (Vercel → Settings → Environment Variables):
 *   GEMINI_API_KEY          (إجباري)  مفتاح Gemini من Google AI Studio — على السيرفر بس، عمره ما يتكتب في الفرونت.
 *   TR_GEMINI_MODEL         (اختياري) الافتراضي gemini-flash-latest
 *   TR_FREE_DAILY_PAGES     (اختياري) الصفحات المجانية يوميًا — الافتراضي 3
 *   TR_FREE_DAILY_ACTIONS   (اختياري) عمليات شرح/MCQ/شات مجانية يوميًا — الافتراضي 10
 *   TR_REFERRAL_BONUS       (اختياري) صفحات هدية لكل كود دعوة — الافتراضي 5
 *   TR_PRICE_MONTHLY / TR_PRICE_TERM / TR_PRICE_GROUP  (اختياري) أسعار الباقات بالجنيه
 */
const crypto = require('crypto');

const MODEL = process.env.TR_GEMINI_MODEL || 'gemini-flash-latest';
const PROMPT_VERSION = 'v1';
const FREE_DAILY_PAGES = Number(process.env.TR_FREE_DAILY_PAGES) || 3;
const FREE_DAILY_ACTIONS = Number(process.env.TR_FREE_DAILY_ACTIONS) || 10;
const REFERRAL_BONUS = Number(process.env.TR_REFERRAL_BONUS) || 5;
const PREMIUM_KEY = 'translator'; // نفس نظام premiumFeatures الموجود في السيرفر
const MAX_IMAGES = 2;             // صور في الطلب الواحد (الفرونت بيبعت صفحة صفحة)
const MAX_B64_CHARS = 2800000;    // ~2MB لكل صورة بعد الضغط (حد Vercel للطلب الكلي 4.5MB)
const PLANS = {
    monthly: { label: 'شهري', days: 30, price: Number(process.env.TR_PRICE_MONTHLY) || 50 },
    term: { label: 'ترم كامل', days: 120, price: Number(process.env.TR_PRICE_TERM) || 150 },
    group: { label: 'جروب (حتى 10 طلاب)', days: 30, price: Number(process.env.TR_PRICE_GROUP) || 200 }
};
const HL_COLORS = ['y', 'g', 'p', 'b'];

// ====================== أدوات عامة ======================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const todayEG = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const str = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const termKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const makeCode = () => crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
const geminiKey = () => process.env.GEMINI_API_KEY || '';

// ====================== تنظيف ناتج الموديل (JSON Lines) ======================
// كل سطر = كائن JSON مستقل → لو الرد اتقطع في النص، اللي اتبعت قبل كده يفضل سليم.
function createLineParser(onObj) {
    let buf = '';
    const handle = (line) => {
        line = line.trim().replace(/^```(?:json|jsonl)?/i, '').replace(/```$/, '').trim();
        if (!line || line[0] !== '{') return;
        try { onObj(JSON.parse(line)); } catch (_) { /* سطر تالف — نتجاهله */ }
    };
    return {
        push(txt) {
            buf += txt;
            let i;
            while ((i = buf.indexOf('\n')) !== -1) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
        },
        end() { if (buf.trim()) handle(buf); buf = ''; }
    };
}

// خطة بديلة لو الموديل كتب JSON متعدد الأسطر: بنستخرج الكائنات بمطابقة الأقواس.
function extractObjects(raw) {
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') { if (depth === 0) start = i; depth++; }
        else if (c === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                try { out.push(JSON.parse(raw.slice(start, i + 1))); } catch (_) {}
                start = -1;
            }
            if (depth < 0) depth = 0;
        }
    }
    return out;
}

function normalizeItem(o) {
    if (!o || typeof o !== 'object') return null;
    const grid = (v) => Array.isArray(v)
        ? v.slice(0, 40).map(r => Array.isArray(r) ? r.slice(0, 10).map(c => str(String(c == null ? '' : c), 500)) : [])
        : [];
    switch (o.t) {
        case 'title': {
            const en = str(o.en, 200), ar = str(o.ar, 200);
            return en || ar ? { t: 'title', en, ar } : null;
        }
        case 'b': {
            const k = ['h', 'p', 'li', 'cap', 'note'].includes(o.k) ? o.k : 'p';
            const en = str(o.en, 5000), ar = str(o.ar, 6000);
            return en || ar ? { t: 'b', k, en, ar } : null;
        }
        case 'tbl': {
            const en = grid(o.en), ar = grid(o.ar);
            return en.length || ar.length ? { t: 'tbl', en, ar } : null;
        }
        case 'term': {
            const en = str(o.en, 120), ar = str(o.ar, 160), def = str(o.def, 600);
            return en && ar ? { t: 'term', en, ar, def } : null;
        }
        case 'key': {
            const items = Array.isArray(o.items) ? o.items.map(s => str(String(s || ''), 400)).filter(Boolean).slice(0, 12) : [];
            return items.length ? { t: 'key', items } : null;
        }
        case 'cmp': {
            const headers = Array.isArray(o.headers) ? o.headers.slice(0, 6).map(s => str(String(s || ''), 120)) : [];
            const rows = Array.isArray(o.rows) ? o.rows.slice(0, 14).map(r => Array.isArray(r) ? r.slice(0, 6).map(c => str(String(c == null ? '' : c), 300)) : []) : [];
            return headers.length && rows.length ? { t: 'cmp', title: str(o.title, 160), headers, rows } : null;
        }
        case 'err':
            return { t: 'err', msg: str(o.msg, 300) || 'الصورة مش واضحة أو مش صفحة كتاب' };
        default:
            return null;
    }
}

// ====================== البرومبتات ======================
const TRANSLATE_SYSTEM = `You are a senior nursing/medical educator and professional medical translator. You translate pages of English nursing and medical textbooks into Arabic for students at an Egyptian technical nursing institute.

TRANSLATION QUALITY RULES (most important):
1. Translate by MEANING, sentence by sentence — NEVER word-by-word. Understand the clinical idea first, then write it the way an Arabic medical lecturer would explain it. If a literal translation sounds awkward, unclear or machine-like, rephrase it naturally.
2. Use clear, correct, simple Modern Standard Arabic with scientifically accurate terminology as used in Arabic medical/nursing references (e.g. hypertension = ارتفاع ضغط الدم, hyperkalemia = فرط بوتاسيوم الدم).
3. The first time a medical term appears, write the Arabic term followed by the English term in parentheses, e.g. "فرط بوتاسيوم الدم (Hyperkalemia)". Later occurrences can be Arabic only.
4. Keep in Latin script exactly as written: drug names, abbreviations (BP, ECG, IV, ICU, CBC...), units (mg, mmHg, mEq/L), lab values, and numbers (use Western digits 0-9).
5. Keep lists, steps and numbering in order. Keep the meaning of labels such as "Rationale", "Nursing diagnosis", "Assessment".
6. Never add facts that are not on the page and never skip content. If something is illegible, write "[غير واضح]" in the Arabic field and keep what you can read in English.
7. If a MANDATORY GLOSSARY is provided you MUST use exactly those Arabic terms for those English terms.

PAGE READING:
- Read the page image(s) in natural reading order (columns top-to-bottom). Transcribe the English text faithfully into "en". Ignore page numbers, running headers/footers and copyright lines.
- Split the page into logical blocks: headings, paragraphs (split long paragraphs at sentence boundaries into blocks of at most 3-4 sentences), each bullet or numbered item as its own block, boxed notes.
- For diagrams/figures add a block k="cap" with the caption and a short description of what the figure shows.

OUTPUT FORMAT — STRICT: JSON Lines. Exactly one compact JSON object per line. No markdown, no code fences, no commentary, no pretty-printing. Types in this order:
{"t":"title","en":"short page title in English","ar":"عنوانه بالعربي"}   (first line, exactly once)
{"t":"b","k":"h|p|li|cap|note","en":"original English text","ar":"Arabic translation"}   (one per block; h=heading, p=paragraph, li=list item, cap=figure caption/description, note=boxed note/warning/tip)
{"t":"tbl","en":[["cell","cell"],["cell","cell"]],"ar":[["خلية","خلية"],["خلية","خلية"]]}   (for a table printed on the page; first row = headers; en and ar grids must have the same shape)
{"t":"term","en":"Medical term","ar":"المصطلح بالعربي","def":"شرح مبسط للمصطلح في جملة أو اتنين"}   (5 to 15 of the most important terms, after all blocks)
{"t":"key","items":["نقطة رئيسية","..."]}   (exactly once, after the terms; 4 to 8 key points in Arabic summarizing the page)
{"t":"cmp","title":"عنوان المقارنة","headers":["","أ","ب"],"rows":[["الصفة","...","..."]]}   (ONLY if the page naturally compares two or more conditions/drugs/types; otherwise omit)
If the image is not a readable book page output only: {"t":"err","msg":"سبب قصير بالعربي"}`;

const EXPLAIN_SYSTEM = `You are a friendly Egyptian nursing instructor. Explain the given passage to a nursing institute student in SIMPLE EGYPTIAN COLLOQUIAL ARABIC (عامية مصرية بسيطة ومحترمة), as if explaining to a friend before an exam. Keep key medical terms in English in parentheses. Do not contradict the passage and do not invent facts.
Then give ONE short realistic clinical example from nursing practice (a patient scenario and what the nurse notices/does).
Return JSON only: {"simple":"الشرح المبسط","example":"المثال الإكلينيكي","tip":"نصيحة حفظ أو نقطة بتيجي في الامتحان (جملة واحدة، اختياري)"}`;

const QUIZ_SYSTEM = `You are a nursing exam writer. From the provided textbook content ONLY, write:
- MCQs in English (exam style, 4 options, exactly one correct, plausible distractors, test understanding not trivia) with a short Arabic explanation of why the answer is correct.
- Flashcards: "front" in English (a term or short question), "back" in Arabic (answer, include the English term in parentheses when useful).
Return JSON only: {"mcqs":[{"q":"...","options":["A","B","C","D"],"answer":0,"why":"..."}],"flashcards":[{"front":"...","back":"..."}]}
"answer" is the zero-based index of the correct option.`;

const CHAT_SYSTEM = `You are a helpful nursing tutor answering a student's question about a textbook page. Use the PAGE CONTENT as the primary source and answer in simple Arabic (Egyptian-friendly, clear). If the answer is not in the page, say so in one short sentence first, then give a brief standard medical answer clearly labeled "معلومة عامة:". Never invent things the page does not say. Keep answers concise and well organized.`;

const DEFINE_SYSTEM = `You are a medical dictionary for Egyptian nursing students. For the given English medical term return JSON only: {"en":"the term","ar":"standard Arabic medical equivalent","def":"شرح مبسط بالعربي في جملة أو اتنين"}.`;

// ====================== Gemini ======================
const GEN_URL = (stream) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
const SAFETY = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT']
    .map(c => ({ category: 'HARM_CATEGORY_' + c, threshold: 'BLOCK_ONLY_HIGH' })); // كتب طبية: مصطلحات حساسة طبيعية

async function errDetail(r) {
    try { const d = await r.json(); return d?.error?.message || ('Gemini ' + r.status); } catch (_) { return 'Gemini ' + r.status; }
}

async function fetchWithRetry(url, options, retries = 2) {
    for (let a = 0; ; a++) {
        let r;
        try { r = await fetch(url, options); }
        catch (e) {
            if ((options.signal && options.signal.aborted) || a >= retries) throw e;
            await sleep(1000 * (a + 1));
            continue;
        }
        if (r.ok || a >= retries || ![429, 500, 503, 504].includes(r.status)) return r;
        await sleep(1200 * (a + 1));
    }
}

function geminiBody({ system, contents, maxTokens, temperature, json }) {
    return JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        safetySettings: SAFETY,
        generationConfig: Object.assign(
            { maxOutputTokens: maxTokens, temperature },
            json ? { responseMimeType: 'application/json' } : {}
        )
    });
}

async function* streamGemini({ system, parts, maxTokens, temperature, signal }) {
    if (!geminiKey()) { const e = new Error('خدمة الترجمة مش مفعّلة (GEMINI_API_KEY مش مضبوط على السيرفر)'); e.code = 'ai_unavailable'; throw e; }
    const r = await fetchWithRetry(GEN_URL(true), {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(), 'Content-Type': 'application/json' },
        signal,
        body: geminiBody({ system, contents: [{ role: 'user', parts }], maxTokens, temperature })
    });
    if (!r.ok) { const e = new Error(await errDetail(r)); e.code = 'ai_call_failed'; e.status = r.status; throw e; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, nl).replace(/\r$/, '');
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let j;
            try { j = JSON.parse(payload); } catch (_) { continue; }
            const cand = j.candidates && j.candidates[0];
            const text = ((cand && cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('');
            if (text) yield { text };
            if (cand && cand.finishReason) yield { finish: cand.finishReason };
            if (j.promptFeedback && j.promptFeedback.blockReason) yield { finish: 'BLOCKED' };
        }
    }
}

async function generate({ system, contents, maxTokens = 2000, temperature = 0.4, json = false }) {
    if (!geminiKey()) { const e = new Error('خدمة الذكاء الاصطناعي مش مفعّلة'); e.code = 'ai_unavailable'; throw e; }
    const r = await fetchWithRetry(GEN_URL(false), {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(), 'Content-Type': 'application/json' },
        body: geminiBody({ system, contents, maxTokens, temperature, json })
    });
    if (!r.ok) { const e = new Error(await errDetail(r)); e.code = 'ai_call_failed'; e.status = r.status; throw e; }
    const d = await r.json();
    const text = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
        .filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!text) { const e = new Error('الذكاء الاصطناعي مرجّعش رد — جرب تاني'); e.code = 'ai_bad_response'; throw e; }
    if (!json) return text;
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(cleaned); }
    catch (_) {
        const objs = extractObjects(cleaned);
        if (objs.length) return objs[0];
        const e = new Error('رد الذكاء الاصطناعي مكانش مفهوم — جرب تاني'); e.code = 'ai_bad_json'; throw e;
    }
}

const aiStatus = (e) => (e.code === 'ai_unavailable' ? 503 : 502);

// ====================== التركيب ======================
function registerTranslateRoutes(app, deps) {
    const { mongoose, rateLimit, verifyToken, isAdmin, connectToDatabase, Student } = deps;
    const { Schema } = mongoose;
    const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

    // ---------- Models ----------
    const usageSchema = new Schema({
        username: { type: String, required: true }, day: { type: String, required: true },
        pages: { type: Number, default: 0 }, cachedPages: { type: Number, default: 0 }, actions: { type: Number, default: 0 }
    }, { timestamps: true });
    usageSchema.index({ username: 1, day: 1 }, { unique: true });
    const TrUsage = model('TrUsage', usageSchema);

    const profileSchema = new Schema({
        username: { type: String, required: true, unique: true },
        referralCode: { type: String, unique: true, sparse: true },
        bonusPages: { type: Number, default: 0 },
        referredBy: { type: String, default: '' },
        planUntil: { type: Date, default: null },
        planName: { type: String, default: '' }
    }, { timestamps: true });
    const TrProfile = model('TrProfile', profileSchema);

    const cacheSchema = new Schema({
        hash: { type: String, required: true, unique: true },
        items: { type: Schema.Types.Mixed, required: true },
        hits: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }
    });
    const TrCache = model('TrCache', cacheSchema);

    const historySchema = new Schema({
        username: { type: String, required: true, index: true },
        title: { type: String, default: '' }, titleAr: { type: String, default: '' },
        folder: { type: String, default: 'عام' }, subject: { type: String, default: '' },
        pages: { type: Number, default: 1 }, favorite: { type: Boolean, default: false },
        items: { type: Schema.Types.Mixed, default: [] },
        highlights: { type: Schema.Types.Mixed, default: {} },
        blockNotes: { type: Schema.Types.Mixed, default: {} },
        quiz: { type: Schema.Types.Mixed, default: null }
    }, { timestamps: true });
    historySchema.index({ username: 1, createdAt: -1 });
    const TrHistory = model('TrHistory', historySchema);

    const glossarySchema = new Schema({
        username: { type: String, required: true }, key: { type: String, required: true },
        en: String, ar: String, def: { type: String, default: '' }, source: { type: String, default: 'auto' }
    }, { timestamps: true });
    glossarySchema.index({ username: 1, key: 1 }, { unique: true });
    const TrGlossary = model('TrGlossary', glossarySchema);

    const paymentSchema = new Schema({
        username: String, fullName: String, plan: String, amount: Number,
        method: { type: String, enum: ['etisalat_cash', 'vodafone_cash', 'fawry', 'instapay'] },
        reference: String, note: { type: String, default: '' },
        groupUsernames: { type: [String], default: [] },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        handledBy: { type: String, default: '' }
    }, { timestamps: true });
    const TrPayment = model('TrPayment', paymentSchema);

    // ---------- Limiters (بالـ username مش بالـ IP — عشان شبكة المعهد/الواي فاي مش تتحسب كلها واحد) ----------
    const keyGen = (req) => (req.user && req.user.username) || 'anon'; // كل المسارات وراء verifyToken فـ username موجود دايمًا
    const pageLimiter = rateLimit({
        windowMs: 10 * 60 * 1000, max: 25, keyGenerator: keyGen,
        message: { error: 'طلبات ترجمة كتير في وقت قصير — استنى شوية وجرب تاني' }
    });
    const apiLimiter = rateLimit({
        windowMs: 10 * 60 * 1000, max: 150, keyGenerator: keyGen,
        message: { error: 'طلبات كتير في وقت قصير — استنى شوية وجرب تاني' }
    });
    const payLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, max: 6, keyGenerator: keyGen,
        message: { error: 'محاولات كتير — جرب بعد شوية' }
    });

    // ---------- Profile / Quota ----------
    async function getProfile(username) {
        let p = await TrProfile.findOne({ username });
        if (p) return p;
        for (let i = 0; i < 5; i++) {
            try { return await TrProfile.create({ username, referralCode: makeCode() }); }
            catch (e) {
                if (e.code === 11000) { const ex = await TrProfile.findOne({ username }); if (ex) return ex; continue; }
                throw e;
            }
        }
        throw new Error('profile_create_failed');
    }

    async function isUnlimited(user, profile) {
        if (user.type === 'admin') return true;
        if (profile.planUntil && profile.planUntil > new Date()) return true;
        const s = await Student.findOne({ username: user.username }).select('premiumFeatures').lean();
        return !!(s && (s.premiumFeatures || []).includes(PREMIUM_KEY));
    }

    async function ensureUsage(username, day) {
        try { await TrUsage.updateOne({ username, day }, { $setOnInsert: { pages: 0, cachedPages: 0, actions: 0 } }, { upsert: true }); }
        catch (e) { if (e.code !== 11000) throw e; }
    }

    async function reservePages(user, n) {
        const profile = await getProfile(user.username);
        const unlimited = await isUnlimited(user, profile);
        const day = todayEG();
        await ensureUsage(user.username, day);
        if (unlimited) {
            await TrUsage.updateOne({ username: user.username, day }, { $inc: { pages: n } });
            return { ok: true, unlimited: true, day, fromFree: n, fromBonus: 0 };
        }
        // الجزء المجاني: بنزوّد بشرط ذري إن العداد + n ما يعدّيش الحد
        const full = await TrUsage.findOneAndUpdate(
            { username: user.username, day, pages: { $lte: FREE_DAILY_PAGES - n } },
            { $inc: { pages: n } }, { new: true }
        );
        if (full) return { ok: true, unlimited: false, day, fromFree: n, fromBonus: 0 };
        const usage = await TrUsage.findOne({ username: user.username, day });
        const take = Math.max(0, Math.min(n, FREE_DAILY_PAGES - (usage ? usage.pages : 0)));
        const needBonus = n - take;
        const bonus = await TrProfile.findOneAndUpdate(
            { username: user.username, bonusPages: { $gte: needBonus } },
            { $inc: { bonusPages: -needBonus } }
        );
        if (!bonus) return { ok: false };
        if (take > 0) await TrUsage.updateOne({ username: user.username, day }, { $inc: { pages: take } });
        return { ok: true, unlimited: false, day, fromFree: take, fromBonus: needBonus };
    }

    async function refundPages(user, r) {
        try {
            if (r.fromFree) await TrUsage.updateOne({ username: user.username, day: r.day }, { $inc: { pages: -r.fromFree } });
            if (r.fromBonus) await TrProfile.updateOne({ username: user.username }, { $inc: { bonusPages: r.fromBonus } });
        } catch (e) { console.error('refund failed', e.message); }
    }

    async function reserveAction(user) {
        const profile = await getProfile(user.username);
        const day = todayEG();
        await ensureUsage(user.username, day);
        if (await isUnlimited(user, profile)) {
            await TrUsage.updateOne({ username: user.username, day }, { $inc: { actions: 1 } });
            return true;
        }
        const ok = await TrUsage.findOneAndUpdate(
            { username: user.username, day, actions: { $lt: FREE_DAILY_ACTIONS } }, { $inc: { actions: 1 } }
        );
        return !!ok;
    }
    const actionDenied = (res) => res.status(402).json({
        error: `خلّصت عمليات الذكاء الاصطناعي المجانية النهاردة (${FREE_DAILY_ACTIONS}). ارجع بكرة أو فعّل الباقة.`, code: 'quota_exceeded'
    });

    async function quotaSnapshot(user) {
        const profile = await getProfile(user.username);
        const unlimited = await isUnlimited(user, profile);
        const day = todayEG();
        const u = await TrUsage.findOne({ username: user.username, day }).lean();
        const used = u ? u.pages : 0, actions = u ? u.actions : 0;
        return {
            unlimited, planUntil: profile.planUntil, freeDaily: FREE_DAILY_PAGES, usedToday: used,
            bonusPages: profile.bonusPages || 0,
            pagesLeft: unlimited ? null : Math.max(0, FREE_DAILY_PAGES - used) + (profile.bonusPages || 0),
            actionsLeft: unlimited ? null : Math.max(0, FREE_DAILY_ACTIONS - actions),
            referralCode: profile.referralCode, referredBy: profile.referredBy || '', referralBonus: REFERRAL_BONUS,
            plans: PLANS
        };
    }

    // ---------- Glossary helpers ----------
    async function loadGlossary(username, sessionTerms) {
        const saved = await TrGlossary.find({ username }).sort({ updatedAt: -1 }).limit(120).select('en ar -_id').lean();
        const map = new Map();
        saved.forEach(g => map.set(termKey(g.en), { en: g.en, ar: g.ar }));
        (Array.isArray(sessionTerms) ? sessionTerms.slice(0, 60) : []).forEach(t => {
            const en = str(t && t.en, 120), ar = str(t && t.ar, 160);
            if (en && ar) map.set(termKey(en), { en, ar });
        });
        return Array.from(map.values());
    }

    async function saveTerms(username, terms) {
        if (!terms.length) return;
        const count = await TrGlossary.countDocuments({ username });
        if (count >= 1500) return;
        const ops = terms.slice(0, 30).map(t => ({
            updateOne: {
                filter: { username, key: termKey(t.en) },
                // $setOnInsert: أول ترجمة للمصطلح هي اللي تثبت — ده اللي بيضمن الاتساق بين الصفحات
                update: { $setOnInsert: { en: t.en, ar: t.ar, def: t.def || '', source: 'auto' } },
                upsert: true
            }
        }));
        await TrGlossary.bulkWrite(ops, { ordered: false }).catch(() => {});
    }

    function validateImages(images) {
        if (!Array.isArray(images) || !images.length) return { error: 'مفيش صورة مبعوتة' };
        if (images.length > MAX_IMAGES) return { error: `الحد الأقصى ${MAX_IMAGES} صور في الطلب الواحد` };
        const out = [];
        for (const im of images) {
            let data = String((im && im.data) || ''), mime = String((im && im.mime) || 'image/jpeg');
            const m = data.match(/^data:([\w/+.-]+);base64,/);
            if (m) { mime = m[1]; data = data.slice(m[0].length); }
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return { error: 'نوع الصورة مش مدعوم (JPG أو PNG أو WebP بس)' };
            if (!data) return { error: 'الصورة فاضية' };
            if (data.length > MAX_B64_CHARS) return { error: 'الصورة كبيرة جدًا — صغّرها وجرب تاني' };
            if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data.slice(0, 2000))) return { error: 'الصورة تالفة' };
            out.push({ mime, data });
        }
        return { images: out };
    }

    // ====================== 1) ترجمة صفحة (بث تدريجي SSE) ======================
    app.post('/api/translate/page', verifyToken, pageLimiter, async (req, res) => {
        let reservation = null;
        try {
            const v = validateImages(req.body && req.body.images);
            if (v.error) return res.status(400).json({ error: v.error });
            const images = v.images;
            const subject = str((req.body.subject || '').replace(/[\r\n]+/g, ' '), 40);

            await connectToDatabase();

            // --- Cache بـ hash الصورة: لو اتترجمت قبل كده من أي طالب → من غير تكلفة API ولا خصم من الرصيد ---
            const h = crypto.createHash('sha256').update(PROMPT_VERSION);
            images.forEach(im => h.update(im.data));
            const hash = h.digest('hex');

            const sse = () => {
                res.status(200);
                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-transform'); // no-transform: يمنع compression من تجميع البث
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');
                if (res.flushHeaders) res.flushHeaders();
            };
            const send = (obj) => { res.write('data: ' + JSON.stringify(obj) + '\n\n'); if (res.flush) res.flush(); };

            const cached = await TrCache.findOneAndUpdate({ hash }, { $inc: { hits: 1 } }).lean();
            if (cached && Array.isArray(cached.items) && cached.items.length) {
                const day = todayEG();
                await ensureUsage(req.user.username, day);
                await TrUsage.updateOne({ username: req.user.username, day }, { $inc: { cachedPages: images.length } });
                sse();
                send({ t: 'meta', cached: true });
                for (const it of cached.items) send(it);
                send({ t: 'done', cached: true, charged: 0, hash });
                return res.end();
            }

            if (!geminiKey()) return res.status(503).json({ error: 'خدمة الترجمة مش مفعّلة حاليًا' });

            // --- الرصيد: قبل ما نبدأ بث أي حاجة (عشان نرجّع 402 واضحة) ---
            reservation = await reservePages(req.user, images.length);
            if (!reservation.ok) {
                return res.status(402).json({
                    error: `خلّصت صفحاتك المجانية النهاردة (${FREE_DAILY_PAGES}). ارجع بكرة، أو ادعُ صاحبك بكود الدعوة، أو فعّل الباقة.`,
                    code: 'quota_exceeded'
                });
            }

            const glossary = await loadGlossary(req.user.username, req.body.sessionTerms);
            let userText = `Translate the attached page${images.length > 1 ? 's (in order)' : ''} following the rules and the strict JSON Lines format.`;
            if (subject) userText += ` Subject area: ${subject}.`;
            if (glossary.length) userText += '\n\nMANDATORY GLOSSARY (English => Arabic) — use exactly these Arabic terms:\n' + glossary.map(g => `${g.en} => ${g.ar}`).join('\n');
            const parts = [{ text: userText }].concat(images.map(im => ({ inline_data: { mime_type: im.mime, data: im.data } })));

            sse();
            const controller = new AbortController();
            res.on('close', () => { if (!res.writableEnded) controller.abort(); });

            let items = [], finish = null, gotBlock = false, lastErr = null, raw = '';
            for (let attempt = 0; attempt < 2 && !gotBlock; attempt++) {
                items = []; finish = null; raw = '';
                const parser = createLineParser((o) => {
                    const it = normalizeItem(o);
                    if (!it) return;
                    items.push(it);
                    if (it.t === 'b' || it.t === 'tbl') gotBlock = true;
                    send(it);
                });
                try {
                    for await (const ev of streamGemini({ system: TRANSLATE_SYSTEM, parts, maxTokens: 16384, temperature: 0.2, signal: controller.signal })) {
                        if (ev.text) { raw += ev.text; parser.push(ev.text); }
                        if (ev.finish) finish = ev.finish;
                    }
                    parser.end();
                    lastErr = null;
                } catch (e) {
                    lastErr = e;
                    if (controller.signal.aborted) break;
                }
                // خطة بديلة: لو الموديل كتب JSON متعدد الأسطر ومفيش ولا بلوك اتفهم
                if (!gotBlock && !lastErr && raw.length > 20 && !items.some(i => i.t === 'err')) {
                    extractObjects(raw).forEach(o => {
                        const it = normalizeItem(o);
                        if (!it) return;
                        items.push(it);
                        if (it.t === 'b' || it.t === 'tbl') gotBlock = true;
                        send(it);
                    });
                }
                if (items.some(i => i.t === 'err')) break; // مش صفحة — مفيش داعي لإعادة المحاولة
                if (!gotBlock && attempt === 0 && !controller.signal.aborted) send({ t: 'retry' });
            }

            if (controller.signal.aborted) { await refundPages(req.user, reservation); return; }

            if (!gotBlock) {
                await refundPages(req.user, reservation);
                const err = items.find(i => i.t === 'err');
                const msg = err ? err.msg : (lastErr ? 'حصلت مشكلة في الاتصال بالذكاء الاصطناعي — جرب تاني (الرصيد اتردّ)' : 'مقدرتش أقرا الصفحة — جرب صورة أوضح (الرصيد اتردّ)');
                send({ t: 'fatal', msg, refunded: true });
                return res.end();
            }

            const truncated = finish === 'MAX_TOKENS' || !!lastErr;
            if (finish === 'BLOCKED') send({ t: 'warn', code: 'blocked', msg: 'جزء من الصفحة اتحجب من فلتر الأمان' });
            if (truncated) send({ t: 'warn', code: 'truncated', msg: 'الصفحة كثيفة والترجمة وقفت في النص — جرّب تقص الصورة نصين وترجم كل نص لوحده' });

            // نخزّن في الكاش بس لو الترجمة كاملة
            const clean = items.filter(i => i.t !== 'err');
            if (!truncated && finish !== 'BLOCKED' && clean.length) {
                TrCache.updateOne({ hash }, { $setOnInsert: { items: clean, hits: 0 } }, { upsert: true }).catch(() => {});
            }
            saveTerms(req.user.username, items.filter(i => i.t === 'term')).catch(() => {});

            const snap = await quotaSnapshot(req.user).catch(() => null);
            send({ t: 'done', cached: false, charged: images.length, hash, truncated, pagesLeft: snap ? snap.pagesLeft : null });
            return res.end();
        } catch (e) {
            console.error('❌ translate/page:', e.message);
            if (reservation && reservation.ok) await refundPages(req.user, reservation);
            if (res.headersSent) {
                try { res.write('data: ' + JSON.stringify({ t: 'fatal', msg: 'حصل خطأ في السيرفر — الرصيد اتردّ', refunded: true }) + '\n\n'); } catch (_) {}
                return res.end();
            }
            return res.status(500).json({ error: 'خطأ في الترجمة' });
        }
    });

    // ====================== 2) شرح بالعامية + مثال إكلينيكي ======================
    app.post('/api/translate/explain', verifyToken, apiLimiter, async (req, res) => {
        try {
            const en = str(req.body && req.body.en, 3000), ar = str(req.body && req.body.ar, 3500);
            if (!en && !ar) return res.status(400).json({ error: 'النص مطلوب' });
            await connectToDatabase();
            if (!(await reserveAction(req.user))) return actionDenied(res);
            const r = await generate({
                system: EXPLAIN_SYSTEM, json: true, maxTokens: 3000, temperature: 0.5,
                contents: [{ role: 'user', parts: [{ text: `English passage:\n${en}\n\nArabic translation:\n${ar}` }] }]
            });
            res.json({ simple: str(r.simple, 3000), example: str(r.example, 2000), tip: str(r.tip, 400) });
        } catch (e) { console.error('explain:', e.message); res.status(aiStatus(e)).json({ error: e.message || 'تعذر الشرح' }); }
    });

    // ====================== 3) MCQs + Flashcards ======================
    app.post('/api/translate/quiz', verifyToken, apiLimiter, async (req, res) => {
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 80) : [];
            const text = items.filter(i => i && i.en).map(i => str(i.en, 1500)).join('\n').slice(0, 14000);
            if (text.length < 60) return res.status(400).json({ error: 'المحتوى قليل لتوليد أسئلة' });
            const mcqN = Math.min(10, Math.max(3, Number(req.body.mcq) || 6));
            const fcN = Math.min(15, Math.max(4, Number(req.body.flash) || 10));
            await connectToDatabase();
            if (!(await reserveAction(req.user))) return actionDenied(res);
            const r = await generate({
                system: QUIZ_SYSTEM, json: true, maxTokens: 6000, temperature: 0.5,
                contents: [{ role: 'user', parts: [{ text: `Write ${mcqN} MCQs and ${fcN} flashcards from this content:\n\n${text}` }] }]
            });
            const mcqs = (Array.isArray(r.mcqs) ? r.mcqs : []).map(q => {
                const options = Array.isArray(q.options) ? q.options.map(o => str(String(o || ''), 300)).filter(Boolean).slice(0, 4) : [];
                const answer = Number.isInteger(q.answer) ? q.answer : -1;
                return { q: str(q.q, 600), options, answer, why: str(q.why, 700) };
            }).filter(q => q.q && q.options.length === 4 && q.answer >= 0 && q.answer < 4).slice(0, mcqN);
            const flashcards = (Array.isArray(r.flashcards) ? r.flashcards : [])
                .map(f => ({ front: str(f.front, 300), back: str(f.back, 600) })).filter(f => f.front && f.back).slice(0, fcN);
            if (!mcqs.length && !flashcards.length) return res.status(502).json({ error: 'مقدرتش أولّد أسئلة — جرب تاني' });
            res.json({ mcqs, flashcards });
        } catch (e) { console.error('quiz:', e.message); res.status(aiStatus(e)).json({ error: e.message || 'تعذر توليد الأسئلة' }); }
    });

    // ====================== 4) شات "اسأل عن الصفحة" ======================
    app.post('/api/translate/chat', verifyToken, apiLimiter, async (req, res) => {
        try {
            const question = str(req.body && req.body.question, 1000);
            const context = str(req.body && req.body.context, 20000);
            if (!question) return res.status(400).json({ error: 'السؤال مطلوب' });
            if (!context) return res.status(400).json({ error: 'مفيش محتوى صفحة للسؤال عنه' });
            await connectToDatabase();
            if (!(await reserveAction(req.user))) return actionDenied(res);
            const hist = (Array.isArray(req.body.history) ? req.body.history : []).slice(-6)
                .map(m => ({ role: m && m.role === 'model' ? 'model' : 'user', parts: [{ text: str(m && m.text, 1500) || '.' }] }));
            while (hist.length && hist[0].role !== 'user') hist.shift();
            const contents = [{ role: 'user', parts: [{ text: `PAGE CONTENT:\n"""\n${context}\n"""` }] },
                { role: 'model', parts: [{ text: 'تمام، قريت محتوى الصفحة. اسأل.' }] }]
                .concat(hist, [{ role: 'user', parts: [{ text: question }] }]);
            const answer = await generate({ system: CHAT_SYSTEM, contents, maxTokens: 2500, temperature: 0.4 });
            res.json({ answer: str(answer, 6000) });
        } catch (e) { console.error('chat:', e.message); res.status(aiStatus(e)).json({ error: e.message || 'تعذر الرد' }); }
    });

    // ====================== 5) القاموس ======================
    app.get('/api/translate/glossary', verifyToken, apiLimiter, async (req, res) => {
        try {
            await connectToDatabase();
            const list = await TrGlossary.find({ username: req.user.username }).sort({ en: 1 }).limit(1500).select('en ar def source -_id').lean();
            res.json(list);
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في جلب القاموس' }); }
    });

    app.put('/api/translate/glossary', verifyToken, apiLimiter, async (req, res) => {
        try {
            const en = str(req.body && req.body.en, 120), ar = str(req.body && req.body.ar, 160), def = str(req.body && req.body.def, 600);
            if (!en || !ar) return res.status(400).json({ error: 'المصطلح والترجمة مطلوبين' });
            await connectToDatabase();
            await TrGlossary.updateOne({ username: req.user.username, key: termKey(en) },
                { $set: { en, ar, def, source: 'manual' } }, { upsert: true });
            res.json({ success: true });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في حفظ المصطلح' }); }
    });

    app.delete('/api/translate/glossary/:key', verifyToken, apiLimiter, async (req, res) => {
        try {
            await connectToDatabase();
            await TrGlossary.deleteOne({ username: req.user.username, key: termKey(decodeURIComponent(req.params.key)) });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'خطأ في حذف المصطلح' }); }
    });

    app.post('/api/translate/define', verifyToken, apiLimiter, async (req, res) => {
        try {
            const term = str(req.body && req.body.term, 120);
            if (!term) return res.status(400).json({ error: 'اكتب المصطلح' });
            await connectToDatabase();
            const have = await TrGlossary.findOne({ username: req.user.username, key: termKey(term) }).select('en ar def -_id').lean();
            if (have) return res.json(Object.assign({ fromGlossary: true }, have));
            if (!(await reserveAction(req.user))) return actionDenied(res);
            const r = await generate({
                system: DEFINE_SYSTEM, json: true, maxTokens: 800, temperature: 0.2,
                contents: [{ role: 'user', parts: [{ text: `Term: ${term}` }] }]
            });
            const out = { en: str(r.en, 120) || term, ar: str(r.ar, 160), def: str(r.def, 600) };
            if (!out.ar) return res.status(502).json({ error: 'مقدرتش ألاقي معنى المصطلح' });
            await saveTerms(req.user.username, [out]);
            res.json(Object.assign({ fromGlossary: false }, out));
        } catch (e) { console.error('define:', e.message); res.status(aiStatus(e)).json({ error: e.message || 'تعذر البحث عن المصطلح' }); }
    });

    // ====================== 6) السجل والمفضلة والمجلدات ======================
    app.get('/api/translate/history', verifyToken, apiLimiter, async (req, res) => {
        try {
            await connectToDatabase();
            const q = { username: req.user.username };
            if (req.query.folder) q.folder = str(String(req.query.folder), 60);
            if (req.query.favorite === '1') q.favorite = true;
            if (req.query.q) {
                const re = new RegExp(escapeRegex(str(String(req.query.q), 50)), 'i');
                q.$or = [{ title: re }, { titleAr: re }, { subject: re }];
            }
            const list = await TrHistory.find(q).sort({ createdAt: -1 }).limit(200)
                .select('title titleAr folder subject pages favorite createdAt').lean();
            const folders = await TrHistory.aggregate([
                { $match: { username: req.user.username } },
                { $group: { _id: '$folder', count: { $sum: 1 } } }, { $sort: { _id: 1 } }
            ]);
            res.json({ list, folders: folders.map(f => ({ name: f._id, count: f.count })) });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في جلب السجل' }); }
    });

    app.get('/api/translate/history/:id', verifyToken, apiLimiter, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            await connectToDatabase();
            const doc = await TrHistory.findOne({ _id: req.params.id, username: req.user.username }).lean();
            if (!doc) return res.status(404).json({ error: 'مش موجود' });
            res.json(doc);
        } catch (e) { res.status(500).json({ error: 'خطأ في جلب الصفحة' }); }
    });

    app.post('/api/translate/history', verifyToken, apiLimiter, async (req, res) => {
        try {
            const b = req.body || {};
            const items = (Array.isArray(b.items) ? b.items : []).map(i => (i && i.t === 'page') ? { t: 'page', n: Number(i.n) || 0 } : normalizeItem(i)).filter(Boolean);
            if (!items.some(i => i.t === 'b' || i.t === 'tbl')) return res.status(400).json({ error: 'مفيش محتوى للحفظ' });
            if (JSON.stringify(items).length > 900000) return res.status(413).json({ error: 'المحتوى كبير جدًا للحفظ' });
            await connectToDatabase();
            const total = await TrHistory.countDocuments({ username: req.user.username });
            if (total >= 300) {
                const old = await TrHistory.findOne({ username: req.user.username, favorite: false }).sort({ createdAt: 1 }).select('_id');
                if (old) await TrHistory.deleteOne({ _id: old._id });
                else return res.status(400).json({ error: 'السجل ممتلئ (300) — احذف حاجة من المفضلة الأول' });
            }
            const titleItem = items.find(i => i.t === 'title');
            const doc = await TrHistory.create({
                username: req.user.username,
                title: str(b.title, 120) || (titleItem && titleItem.en) || 'صفحة مترجمة',
                titleAr: (titleItem && titleItem.ar) || '',
                folder: str(b.folder, 60) || 'عام', subject: str(b.subject, 40),
                pages: Math.min(200, Math.max(1, Number(b.pages) || 1)), items
            });
            res.json({ success: true, id: doc._id });
        } catch (e) { console.error('history save:', e.message); res.status(500).json({ error: 'خطأ في الحفظ' }); }
    });

    app.patch('/api/translate/history/:id', verifyToken, apiLimiter, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            const b = req.body || {}, set = {};
            if (b.title !== undefined) set.title = str(b.title, 120);
            if (b.folder !== undefined) set.folder = str(b.folder, 60) || 'عام';
            if (b.subject !== undefined) set.subject = str(b.subject, 40);
            if (b.favorite !== undefined) set.favorite = !!b.favorite;
            if (b.highlights && typeof b.highlights === 'object') {
                const hl = {};
                Object.keys(b.highlights).slice(0, 600).forEach(k => { if (/^\d+$/.test(k) && HL_COLORS.includes(b.highlights[k])) hl[k] = b.highlights[k]; });
                set.highlights = hl;
            }
            if (b.blockNotes && typeof b.blockNotes === 'object') {
                const bn = {};
                Object.keys(b.blockNotes).slice(0, 300).forEach(k => { const t = str(b.blockNotes[k], 1000); if (/^\d+$/.test(k) && t) bn[k] = t; });
                set.blockNotes = bn;
            }
            if (b.quiz && typeof b.quiz === 'object') {
                if (JSON.stringify(b.quiz).length > 100000) return res.status(413).json({ error: 'الأسئلة كبيرة جدًا للحفظ' });
                set.quiz = b.quiz;
            }
            if (!Object.keys(set).length) return res.status(400).json({ error: 'مفيش تعديل' });
            await connectToDatabase();
            const r = await TrHistory.updateOne({ _id: req.params.id, username: req.user.username }, { $set: set });
            if (!r.matchedCount) return res.status(404).json({ error: 'مش موجود' });
            res.json({ success: true });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في التعديل' }); }
    });

    app.delete('/api/translate/history/:id', verifyToken, apiLimiter, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            await connectToDatabase();
            await TrHistory.deleteOne({ _id: req.params.id, username: req.user.username });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'خطأ في الحذف' }); }
    });

    // ====================== 7) حسابي: الرصيد، كود الدعوة، الدفع ======================
    app.get('/api/translate/me', verifyToken, apiLimiter, async (req, res) => {
        try { await connectToDatabase(); res.json(await quotaSnapshot(req.user)); }
        catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في جلب الرصيد' }); }
    });

    app.post('/api/translate/redeem', verifyToken, apiLimiter, async (req, res) => {
        try {
            const code = str(req.body && req.body.code, 12).toUpperCase();
            if (!/^[A-Z0-9]{4,12}$/.test(code)) return res.status(400).json({ error: 'الكود غير صحيح' });
            await connectToDatabase();
            const me = await getProfile(req.user.username);
            if (me.referredBy) return res.status(400).json({ error: 'انت استخدمت كود دعوة قبل كده' });
            if (me.referralCode === code) return res.status(400).json({ error: 'مينفعش تستخدم كودك انت' });
            const owner = await TrProfile.findOne({ referralCode: code });
            if (!owner) return res.status(404).json({ error: 'الكود مش موجود' });
            // شرط ذري: بيتنفذ مرة واحدة بس لكل حساب
            const claimed = await TrProfile.findOneAndUpdate({ username: req.user.username, referredBy: '' },
                { $set: { referredBy: owner.username }, $inc: { bonusPages: REFERRAL_BONUS } });
            if (!claimed) return res.status(400).json({ error: 'انت استخدمت كود دعوة قبل كده' });
            await TrProfile.updateOne({ username: owner.username }, { $inc: { bonusPages: REFERRAL_BONUS } });
            res.json({ success: true, bonus: REFERRAL_BONUS });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في تفعيل الكود' }); }
    });

    // طلب اشتراك: الطالب يحوّل بـ اتصالات كاش ويكتب رقم العملية → الأدمن يراجع ويفعّل.
    // (مفيش ربط تلقائي ببوابة دفع — التحقق يدوي من الأدمن.)
    app.post('/api/translate/payment', verifyToken, payLimiter, async (req, res) => {
        try {
            if (req.user.type !== 'student') return res.status(403).json({ error: 'الدفع للطلاب بس' });
            const b = req.body || {};
            const plan = PLANS[b.plan] ? b.plan : null;
            if (!plan) return res.status(400).json({ error: 'اختار باقة' });
            if (b.method !== 'etisalat_cash') return res.status(400).json({ error: 'اختار طريقة الدفع' });
            const reference = str(b.reference, 60);
            if (reference.length < 5) return res.status(400).json({ error: 'اكتب رقم العملية أو رقم التليفون اللي حوّلت منه' });
            await connectToDatabase();
            const pending = await TrPayment.countDocuments({ username: req.user.username, status: 'pending' });
            if (pending >= 3) return res.status(429).json({ error: 'عندك طلبات لسه تحت المراجعة — استنى الأدمن يراجعها' });
            const group = plan === 'group' && Array.isArray(b.groupUsernames)
                ? b.groupUsernames.map(u => str(String(u || ''), 40).toLowerCase()).filter(Boolean).slice(0, 10) : [];
            await TrPayment.create({
                username: req.user.username, fullName: str(req.user.fullName, 80), plan, amount: PLANS[plan].price,
                method: b.method, reference, note: str(b.note, 300), groupUsernames: group
            });
            res.json({ success: true, message: 'وصل طلبك — هيتفعّل بعد مراجعة الأدمن' });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في إرسال الطلب' }); }
    });

    app.get('/api/translate/payment/mine', verifyToken, apiLimiter, async (req, res) => {
        try {
            await connectToDatabase();
            res.json(await TrPayment.find({ username: req.user.username }).sort({ createdAt: -1 }).limit(10).select('plan amount method status createdAt -_id').lean());
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    // ====================== 8) الأدمن: مراجعة الدفع + Analytics ======================
    app.get('/api/translate/admin/payments', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase();
            const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
            res.json(await TrPayment.find({ status }).sort({ createdAt: -1 }).limit(200).lean());
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    app.post('/api/translate/admin/payments/:id/approve', verifyToken, isAdmin, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            await connectToDatabase();
            const p = await TrPayment.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { $set: { status: 'approved', handledBy: req.user.username } });
            if (!p) return res.status(404).json({ error: 'الطلب مش موجود أو اتعالج قبل كده' });
            const plan = PLANS[p.plan] || PLANS.monthly;
            const override = Array.isArray(req.body && req.body.usernames) ? req.body.usernames : null;
            const users = Array.from(new Set([p.username].concat(override || p.groupUsernames || []).map(u => String(u).toLowerCase()).filter(Boolean))).slice(0, 11);
            const activated = [];
            for (const u of users) {
                const exists = await Student.findOne({ username: u }).select('_id').lean();
                if (!exists) continue;
                const prof = await getProfile(u);
                const base = prof.planUntil && prof.planUntil > new Date() ? prof.planUntil.getTime() : Date.now();
                await TrProfile.updateOne({ username: u }, { $set: { planUntil: new Date(base + plan.days * 86400000), planName: p.plan } });
                activated.push(u);
            }
            res.json({ success: true, activated });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في التفعيل' }); }
    });

    app.post('/api/translate/admin/payments/:id/reject', verifyToken, isAdmin, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            await connectToDatabase();
            const p = await TrPayment.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { $set: { status: 'rejected', handledBy: req.user.username } });
            if (!p) return res.status(404).json({ error: 'الطلب مش موجود أو اتعالج قبل كده' });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    app.get('/api/translate/admin/analytics', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase();
            const since = new Date(Date.now() - 14 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
            const since30 = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
            const [daily, topUsers, bySubject, cache, pending] = await Promise.all([
                TrUsage.aggregate([{ $match: { day: { $gte: since } } },
                    { $group: { _id: '$day', pages: { $sum: '$pages' }, cachedPages: { $sum: '$cachedPages' }, actions: { $sum: '$actions' }, users: { $sum: 1 } } },
                    { $sort: { _id: 1 } }]),
                TrUsage.aggregate([{ $match: { day: { $gte: since30 } } },
                    { $group: { _id: '$username', pages: { $sum: '$pages' } } }, { $sort: { pages: -1 } }, { $limit: 10 }]),
                TrHistory.aggregate([{ $group: { _id: '$subject', docs: { $sum: 1 }, pages: { $sum: '$pages' } } }, { $sort: { pages: -1 } }]),
                TrCache.aggregate([{ $group: { _id: null, entries: { $sum: 1 }, hits: { $sum: '$hits' } } }]),
                TrPayment.countDocuments({ status: 'pending' })
            ]);
            res.json({
                daily: daily.map(d => ({ day: d._id, pages: d.pages, cachedPages: d.cachedPages, actions: d.actions, activeUsers: d.users })),
                topUsers: topUsers.map(u => ({ username: u._id, pages: u.pages })),
                bySubject: bySubject.map(s => ({ subject: s._id || 'غير محدد', docs: s.docs, pages: s.pages })),
                cache: cache[0] ? { entries: cache[0].entries, hits: cache[0].hits } : { entries: 0, hits: 0 },
                pendingPayments: pending
            });
        } catch (e) { console.error(e.message); res.status(500).json({ error: 'خطأ في الإحصائيات' }); }
    });

    console.log('✅ translate-routes جاهزة (/api/translate/*)');
}

module.exports = registerTranslateRoutes;
module.exports.__test = { createLineParser, extractObjects, normalizeItem, streamGemini, termKey };
