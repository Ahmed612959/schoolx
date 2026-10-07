'use strict';
/**
 * translate-routes.js — مترجم صفحات الكتب الطبية (إنجليزي → عربي) لطلاب التمريض
 *
 * بيتركّب في السيرفر الرئيسي بسطرين بس (قبل app.get('*') الأخير):
 *   require('./translate-routes')(app, { mongoose, rateLimit, verifyToken, isAdmin, connectToDatabase, Student });
 *
 * متغيرات البيئة (Vercel → Settings → Environment Variables):
 *   GEMINI_KEY_1، GEMINI_KEY_2، ...  (إجباري واحد على الأقل) مفاتيح Gemini من Google AI Studio، بأي اسم يبدأ بـ GEMINI_API_KEY أو GEMINI_KEY. الطلبات بتتوزّع بينهم وبيتحوّل تلقائي لو واحد فشل.
 *   (اختياري) GROQ_KEY_1 + TR_GROQ_MODEL ، OPENROUTER_KEY_1 + TR_OPENROUTER_MODEL  احتياطي للنصوص بس
 *   TR_GEMINI_MODEL         (اختياري) الافتراضي gemini-flash-latest
 *   TR_FREE_DAILY_PAGES     (اختياري) الصفحات المجانية يوميًا — الافتراضي 3
 *   TR_FREE_DAILY_ACTIONS   (اختياري) عمليات شرح/MCQ/شات مجانية يوميًا — الافتراضي 10
 *   TR_REFERRAL_BONUS       (اختياري) صفحات هدية لكل كود دعوة — الافتراضي 5
 *   TR_PRICE_MONTHLY / TR_PRICE_TERM / TR_PRICE_GROUP  (اختياري) أسعار الباقات بالجنيه
 */
const crypto = require('crypto');

const MODEL = process.env.TR_GEMINI_MODEL || 'gemini-flash-latest';
const PROMPT_VERSION = 'v2';
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
        case 'tip': {
            const items = Array.isArray(o.items) ? o.items.map(s => str(String(s || ''), 400)).filter(Boolean).slice(0, 6) : [];
            const mnemonic = str(o.mnemonic, 300);
            return items.length || mnemonic ? { t: 'tip', items, mnemonic } : null;
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
const TRANSLATE_SYSTEM = `You are a senior nursing/medical educator AND an expert medical translator. You translate pages of English nursing and medical textbooks into Arabic for students at an Egyptian technical nursing institute. Your Arabic must read like it was written by an Arabic-speaking nursing lecturer, never like a machine translation.

TRANSLATION QUALITY RULES (most important):
1. Meaning first. Read each passage, understand the clinical idea, then re-express it in natural Arabic. NEVER translate word-by-word and never copy English sentence structure. Split long English sentences into shorter clear Arabic sentences. Prefer active voice and plain wording. Avoid awkward calques (for example do not write "من المهم ملاحظة أن" when "لازم نلاحظ" or a direct statement is clearer in Modern Standard Arabic).
2. Register: clear, correct Modern Standard Arabic, simple enough for an institute student, but scientifically exact. Do not simplify away medical meaning.
3. Terminology: use the standard Arabic term used in Arabic medical and nursing references (hypertension = ارتفاع ضغط الدم, hyperkalemia = فرط بوتاسيوم الدم, edema = وذمة, vital signs = العلامات الحيوية). If a term has no established Arabic equivalent, use a clear descriptive Arabic phrase and keep the English in parentheses.
4. First mention of a medical term: Arabic term then English in parentheses, e.g. "فرط بوتاسيوم الدم (Hyperkalemia)". Later mentions: Arabic only. First mention of an abbreviation: Arabic meaning followed by the abbreviation, e.g. "تعداد الدم الكامل (CBC)".
5. Standard nursing labels (use these exact Arabic forms): Assessment = التقييم, Nursing diagnosis = التشخيص التمريضي, Planning = التخطيط, Implementation = التنفيذ, Evaluation = التقويم, Rationale = التعليل (السبب العلمي), Nursing interventions = التدخلات التمريضية, Patient education = تثقيف المريض, Signs and symptoms = العلامات والأعراض, Risk factors = عوامل الخطورة, Complications = المضاعفات, Contraindications = موانع الاستعمال, Side effects = الآثار الجانبية, Expected outcomes = النتائج المتوقعة.
6. Keep in Latin script exactly as written: drug names, abbreviations, units (mg, mmHg, mEq/L), lab values and numbers (use Western digits 0-9). Never change a number, dose, frequency or route.
7. Patient-safety accuracy: negations (do not, avoid, never), contraindications, warnings, doses and "before/after" ordering must keep EXACTLY the same meaning. Translate them with extra care.
8. Never add facts that are not on the page and never skip content. If a word is illegible write "[غير واضح]" in the Arabic field, but use medical context to restore words that are only slightly blurry.
9. If a MANDATORY GLOSSARY is provided you MUST use exactly those Arabic terms for those English terms.
10. Silent self-check for every block before you output it: (a) same meaning as the English, nothing added or missing, (b) sounds natural when read aloud in Arabic, (c) terms are consistent with the rest of the page and the glossary. Fix anything that fails the check.

PAGE READING:
- Read the page image(s) in natural reading order (columns top-to-bottom). Transcribe the English text faithfully into "en". Ignore page numbers, running headers/footers and copyright lines.
- Split the page into logical blocks: headings, paragraphs (long paragraphs split at sentence boundaries into blocks of at most 3-4 sentences), each bullet or numbered item as its own block, boxed notes.
- For diagrams/figures add a block k="cap" with the caption and a short description of what the figure shows.

OUTPUT FORMAT - STRICT: JSON Lines. Exactly one compact JSON object per line. No markdown, no code fences, no commentary, no pretty-printing. Types in this order:
{"t":"title","en":"short page title in English","ar":"عنوانه بالعربي"}   (first line, exactly once)
{"t":"b","k":"h|p|li|cap|note","en":"original English text","ar":"Arabic translation"}   (one per block; h=heading, p=paragraph, li=list item, cap=figure caption/description, note=boxed note/warning/tip)
{"t":"tbl","en":[["cell","cell"],["cell","cell"]],"ar":[["خلية","خلية"],["خلية","خلية"]]}   (for a table printed on the page; first row = headers; en and ar grids must have the same shape)
{"t":"term","en":"Medical term","ar":"المصطلح بالعربي","def":"شرح مبسط للمصطلح في جملة أو اتنين"}   (6 to 15 of the most important terms, after all blocks)
{"t":"key","items":["نقطة رئيسية","..."]}   (exactly once, after the terms; 4 to 8 key points in Arabic summarizing the page)
{"t":"tip","items":["نقطة بتيجي كتير في الامتحان","..."],"mnemonic":"حيلة حفظ قصيرة بالعربي أو فاضي"}   (exactly once, after key; 3 to 5 exam-focused points based ONLY on this page; mnemonic is optional and may be an empty string)
{"t":"cmp","title":"عنوان المقارنة","headers":["","أ","ب"],"rows":[["الصفة","...","..."]]}   (ONLY if the page naturally compares two or more conditions/drugs/types; otherwise omit)
If the image is not a readable book page output only: {"t":"err","msg":"سبب قصير بالعربي"}`;

const EXPLAIN_SYSTEM = `You are a warm, patient Egyptian nursing instructor who is loved by students because everything becomes easy after you explain it. Explain the given passage in SIMPLE EGYPTIAN COLLOQUIAL ARABIC (عامية مصرية بسيطة ومحترمة), as if explaining to a friend the night before an exam. Keep important medical terms in English in parentheses the first time. Stay faithful to the passage; never invent facts or contradict it.

Return JSON only, with exactly these keys (use an empty string or empty array if a part does not apply; never pad):
{
 "simple": "الشرح المبسط: 3 إلى 6 جمل قصيرة، الفكرة الأساسية الأول ثم التفاصيل",
 "analogy": "تشبيه من الحياة اليومية يوضح الفكرة (جملة أو اتنين). سيبها فاضية لو أي تشبيه هيضلل",
 "example": "مثال إكلينيكي واقعي: مريض/حالة، وإيه اللي النرس بتلاحظه وبتعمله",
 "nursing": ["إيه اللي النرس لازم تعمله أو تراقبه بخصوص الفكرة دي (من 2 إلى 4 نقاط قصيرة)"],
 "mnemonic": "حيلة حفظ أو اختصار سهل (اختياري)",
 "exam": ["نقطة بتيجي في الامتحان (من 2 إلى 3 نقاط)"],
 "check": {"q":"سؤال قصير يختبر بيه الطالب نفسه","a":"إجابته في جملة"}
}
Write the values in Egyptian colloquial Arabic. No markdown symbols, no asterisks.
If the user asks for MODE=simpler: use even shorter sentences and everyday words, as if the student has no background at all.
If the user asks for MODE=deeper: also explain the mechanism (why and how it happens in the body) and the link to related concepts, still in colloquial Arabic and still clear.`;

const QUIZ_SYSTEM = `You are an experienced nursing exam writer. From the provided textbook content ONLY, write:
- MCQs in English (exam style, exactly 4 options, exactly one correct). Mix recall, understanding and short clinical-scenario questions. Distractors must be plausible and from the same topic. Avoid "all of the above"/"none of the above" and avoid giving away the answer by length. Add a short Arabic explanation ("why") that says why the correct option is right and, briefly, why the most tempting wrong option is wrong.
- Flashcards: "front" in English (a term or short question), "back" in Arabic (a clear answer; include the English term in parentheses when useful). One idea per card.
Return JSON only: {"mcqs":[{"q":"...","options":["A","B","C","D"],"answer":0,"why":"..."}],"flashcards":[{"front":"...","back":"..."}]}
"answer" is the zero-based index of the correct option. Vary the position of the correct answer.`;

const CHAT_SYSTEM = `You are a friendly, sharp nursing tutor chatting with an Egyptian nursing student about ONE textbook page. The PAGE CONTENT (English text with its Arabic translation) is your main source.

How to answer:
- Reply in simple clear Arabic (Egyptian-friendly, respectful). Keep medical terms in English in parentheses when helpful.
- Start directly with the answer. No greetings, no repeating the question, no filler.
- Keep it short and well organized: short paragraphs. For lists use lines that start with a dash and a space, or numbers like 1. 2. 3.
- WRITE PLAIN TEXT ONLY: never use asterisks, never use markdown (no ** bold, no # headings, no backticks, no tables, no code blocks), and no emojis.
- If the answer is not on the page, say so in one short sentence, then give a brief standard medical answer and start it with the words "معلومة عامة:".
- Never invent things the page does not say. If the student asks you to quiz them, ask ONE question at a time and wait for the answer.
- If asked to summarize, give 4 to 6 short points.`;

const SUMMARY_SYSTEM = `You are a senior nursing educator preparing a revision summary of a whole textbook chapter for an Egyptian nursing student. Use ONLY the provided content (English text with its Arabic translation). Write in clear simple Arabic. Do not invent facts.
Return JSON only:
{
 "overview": "فقرة قصيرة (2 إلى 3 جمل) تشرح الفصل كله",
 "sections": [{"title": "عنوان محور بالعربي", "points": ["نقطة مختصرة", "..."]}],
 "mustKnow": ["أهم 6 إلى 10 معلومات لازم تتحفظ"],
 "terms": [{"en": "Term", "ar": "المصطلح"}],
 "pitfalls": ["لخبطة شائعة بين مفهومين أو خطأ بيقع فيه الطلبة (من 2 إلى 4)"],
 "plan": "خطة مراجعة مقترحة في سطرين"
}
3 to 6 sections, 3 to 6 points each, up to 12 terms. Plain Arabic text only: no asterisks, no markdown.`;

const DEFINE_SYSTEM = `You are a medical dictionary for Egyptian nursing students. For the given English medical term return JSON only: {"en":"the term","ar":"standard Arabic medical equivalent as used in Arabic medical references","def":"شرح مبسط بالعربي في جملة أو اتنين، من غير تعقيد"}.`;

// تنظيف ردود الشات من علامات الماركداون (نجوم/هاشتاج/باكتيك/جداول) — الرد يوصل نص نضيف
function cleanChat(t) {
    return String(t || '')
        .replace(/```[a-z]*\n?/gi, '').replace(/`/g, '')
        .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')
        .replace(/^[ \t]*[*•][ \t]+/gm, '- ')
        .replace(/\*\*|__/g, '').replace(/\*/g, '')
        .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$\n?/gm, '')
        .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (m, c) => c.split('|').map(x => x.trim()).filter(Boolean).join(' - '))
        .replace(/\n{3,}/g, '\n\n').trim();
}

// ====================== مزودو الذكاء الاصطناعي مع تحويل تلقائي (Failover) ======================
// كل جزء في الصفحة (ترجمة / شرح / شات / أسئلة / ملخص / مصطلحات) له "مسار" = قائمة مزودين بالترتيب.
// لو أول مزود فشل (مفتاح غلط، 429، خطأ سيرفر، مهلة، رد فاضي) بنحوّل للتاني لحد ما واحد ينجح.
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const AI_FEATURES = [
    { id: 'translate', label: 'ترجمة الصفحات', vision: true },
    { id: 'explain', label: 'زر اشرحلي' },
    { id: 'chat', label: 'شات اسأل عن الصفحة' },
    { id: 'quiz', label: 'الأسئلة والامتحان' },
    { id: 'summary', label: 'ملخص الفصل' },
    { id: 'define', label: 'معاني المصطلحات' }
];
const FEATURE_IDS = AI_FEATURES.map(f => f.id);
const AI_TYPES = ['gemini', 'openai', 'anthropic'];
const AI_TIMEOUT_MS = Number(process.env.TR_AI_TIMEOUT_MS) || 40000;        // مهلة المحاولة الواحدة (بدون بث)
const AI_FIRST_BYTE_MS = Number(process.env.TR_AI_FIRST_BYTE_MS) || 32000;  // مهلة أول رد في البث
const AI_IDLE_MS = 30000;                                                    // مهلة السكون بين أجزاء البث
const AI_BUDGET_MS = Number(process.env.TR_AI_BUDGET_MS) || 50000;          // بعد الوقت ده مش بنبدأ مزود جديد (حد Vercel 60 ثانية)

const SAFETY = ['HARASSMENT', 'HATE_SPEECH', 'SEXUALLY_EXPLICIT', 'DANGEROUS_CONTENT']
    .map(c => ({ category: 'HARM_CATEGORY_' + c, threshold: 'BLOCK_ONLY_HIGH' })); // كتب طبية: مصطلحات حساسة طبيعية
// وضع "التفكير" في Gemini بياخد من حد التوكنز ويقدر يسيب الرد فاضي. بنقفله، ولو الموديل ما يدعمش بنرجع من غيره تلقائي.
const THINK = { off: true };

function mkErr(msg, status, code) {
    const e = new Error(msg);
    if (status != null) e.status = status;
    e.code = code || 'ai_call_failed';
    return e;
}
async function errDetail(r, label) {
    let d = null, txt = '';
    try {
        if (typeof r.text === 'function') { txt = await r.text(); try { d = JSON.parse(txt); } catch (_) {} }
        else if (typeof r.json === 'function') d = await r.json();
    } catch (_) {}
    const m = d && ((d.error && (d.error.message || (typeof d.error === 'string' ? d.error : ''))) || d.message);
    return String(m || (label + ' ' + r.status + (txt ? ': ' + txt.slice(0, 160) : ''))).slice(0, 300);
}
async function fetchWithRetry(url, options, retries = 0) {
    for (let a = 0; ; a++) {
        let r;
        try { r = await fetch(url, options); }
        catch (e) {
            if ((options.signal && options.signal.aborted) || a >= retries) throw e;
            await sleep(700 * (a + 1));
            continue;
        }
        if (r.ok || a >= retries || ![429, 500, 502, 503, 504].includes(r.status)) return r;
        await sleep(900 * (a + 1));
    }
}
function withTimeout(parent, ms) {
    const ctrl = new AbortController(); let timedOut = false, timer = null;
    const onAbort = () => ctrl.abort();
    if (parent) { if (parent.aborted) ctrl.abort(); else parent.addEventListener('abort', onAbort, { once: true }); }
    const arm = (m) => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, m); };
    arm(ms);
    return { signal: ctrl.signal, arm, done() { clearTimeout(timer); if (parent) parent.removeEventListener('abort', onAbort); }, get timedOut() { return timedOut; } };
}
async function* sseData(r) {
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    const take = (line) => { line = line.replace(/\r$/, ''); if (!line.startsWith('data:')) return null; const p = line.slice(5).trim(); return p && p !== '[DONE]' ? p : null; };
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) { const p = take(buf.slice(0, nl)); buf = buf.slice(nl + 1); if (p) yield p; }
    }
    const tail = take(buf); if (tail) yield tail;
}
function parseJsonLoose(text) {
    const cleaned = String(text).replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(cleaned); }
    catch (_) {
        const objs = extractObjects(cleaned);
        if (objs.length) return objs[0];
        throw mkErr('رد الذكاء الاصطناعي مكانش مفهوم، جرب تاني', null, 'ai_bad_json');
    }
}
const finishMap = (r) => ({ length: 'MAX_TOKENS', max_tokens: 'MAX_TOKENS', stop: 'STOP', end_turn: 'STOP', content_filter: 'BLOCKED' }[r] || String(r || '').toUpperCase());

// ---------- Gemini ----------
const geminiUrl = (p, stream) => `${(p.baseUrl || GEMINI_BASE).replace(/\/+$/, '')}/models/${encodeURIComponent(p.model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
// التفكير: Gemini 3.x بيستخدم thinkingLevel (والـ 3.5 Flash بيفكّر "medium" افتراضيًا وده بطيء)، و 2.x بيستخدم thinkingBudget.
// TR_GEMINI_THINKING = minimal (افتراضي) | low | medium | high | off
function geminiThinking(p) {
    const mode = String(process.env.TR_GEMINI_THINKING || 'minimal').toLowerCase();
    if (!THINK.off || mode === 'off') return {};
    if (/gemini-(1|2)\./.test(p.model || '')) return { thinkingConfig: { thinkingBudget: 0 } };
    return { thinkingConfig: { thinkingLevel: ['minimal', 'low', 'medium', 'high'].includes(mode) ? mode : 'minimal' } };
}
function geminiBody(p, a) {
    return JSON.stringify({
        system_instruction: { parts: [{ text: a.system }] },
        contents: a.contents,
        safetySettings: SAFETY,
        generationConfig: Object.assign(
            { maxOutputTokens: a.maxTokens, temperature: a.temperature },
            a.json ? { responseMimeType: 'application/json' } : {},
            geminiThinking(p)
        )
    });
}
async function geminiPost(p, stream, a, signal) {
    for (let pass = 0; pass < 2; pass++) {
        const r = await fetchWithRetry(geminiUrl(p, stream), {
            method: 'POST', headers: { 'x-goog-api-key': p.key, 'Content-Type': 'application/json' }, signal, body: geminiBody(p, a)
        }, a.retries);
        if (r.ok) return r;
        const detail = await errDetail(r, 'Gemini');
        if (r.status === 400 && THINK.off && pass === 0 && /think/i.test(detail)) { THINK.off = false; continue; }
        throw mkErr(detail, r.status);
    }
}
const geminiText = (cand) => ((cand && cand.content && cand.content.parts) || []).filter(x => !x.thought).map(x => x.text || '').join('');
async function* geminiStream(p, a, signal) {
    const r = await geminiPost(p, true, a, signal);
    for await (const payload of sseData(r)) {
        let j; try { j = JSON.parse(payload); } catch (_) { continue; }
        const cand = j.candidates && j.candidates[0], text = geminiText(cand);
        if (text) yield { text };
        if (cand && cand.finishReason) yield { finish: cand.finishReason };
        if (j.promptFeedback && j.promptFeedback.blockReason) yield { finish: 'BLOCKED' };
    }
}
async function geminiGen(p, a, signal) {
    const r = await geminiPost(p, false, a, signal);
    const d = await r.json();
    return geminiText(d.candidates && d.candidates[0]).trim();
}

// ---------- OpenAI-compatible (OpenAI, Groq, OpenRouter, DeepSeek, Mistral, Together, xAI...) ----------
const isOpenAIHost = (u) => { try { return /(^|\.)api\.openai\.com$/i.test(new URL(u).hostname); } catch (_) { return false; } };
function openaiMessages(system, contents) {
    const msgs = [{ role: 'system', content: system }];
    for (const c of contents) {
        const role = c.role === 'model' ? 'assistant' : 'user';
        const parts = (c.parts || []).map(pt => pt.inline_data
            ? { type: 'image_url', image_url: { url: `data:${pt.inline_data.mime_type};base64,${pt.inline_data.data}` } }
            : { type: 'text', text: String(pt.text == null ? '' : pt.text) || '.' });
        const textOnly = parts.every(x => x.type === 'text'), last = msgs[msgs.length - 1];
        if (textOnly) {
            const t = parts.map(x => x.text).join('\n');
            if (last.role === role && typeof last.content === 'string' && last.role !== 'system') last.content += '\n\n' + t; else msgs.push({ role, content: t });
        } else msgs.push({ role, content: parts });
    }
    return msgs;
}
async function openaiPost(p, stream, a, signal) {
    const url = p.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const body = { model: p.model, messages: openaiMessages(a.system, a.contents), stream: !!stream };
    if (isOpenAIHost(p.baseUrl)) body.max_completion_tokens = a.maxTokens; else body.max_tokens = a.maxTokens;
    if (a.temperature != null) body.temperature = a.temperature;
    if (a.json && !p.noJsonMode) body.response_format = { type: 'json_object' };
    for (let pass = 0; pass < 4; pass++) {
        const r = await fetchWithRetry(url, {
            method: 'POST', headers: { Authorization: 'Bearer ' + p.key, 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body)
        }, a.retries);
        if (r.ok) return r;
        const detail = await errDetail(r, 'API');
        if (r.status === 400 || r.status === 422) {
            if (/temperature/i.test(detail) && 'temperature' in body) { delete body.temperature; continue; }
            if (/response_format|json_object|json mode/i.test(detail) && body.response_format) { delete body.response_format; continue; }
            if (/max_tokens/i.test(detail) && body.max_tokens != null) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; continue; }
        }
        throw mkErr(detail, r.status);
    }
    throw mkErr('رفض المزود الطلب بعد عدة محاولات', 400);
}
async function* openaiStream(p, a, signal) {
    const r = await openaiPost(p, true, a, signal);
    for await (const payload of sseData(r)) {
        let j; try { j = JSON.parse(payload); } catch (_) { continue; }
        if (j.error) throw mkErr(j.error.message || 'خطأ من المزود', 500);
        const ch = j.choices && j.choices[0]; if (!ch) continue;
        const t = ch.delta && ch.delta.content;
        if (typeof t === 'string' && t) yield { text: t };
        if (ch.finish_reason) yield { finish: finishMap(ch.finish_reason) };
    }
}
async function openaiGen(p, a, signal) {
    const r = await openaiPost(p, false, a, signal);
    const d = await r.json();
    const m = d.choices && d.choices[0] && d.choices[0].message, c = m && m.content;
    return (Array.isArray(c) ? c.map(x => x.text || '').join('') : String(c || '')).trim();
}

// ---------- Anthropic (Claude) ----------
function anthropicMessages(contents) {
    const out = [];
    for (const c of contents) {
        const role = c.role === 'model' ? 'assistant' : 'user';
        const blocks = (c.parts || []).map(pt => pt.inline_data
            ? { type: 'image', source: { type: 'base64', media_type: pt.inline_data.mime_type, data: pt.inline_data.data } }
            : { type: 'text', text: String(pt.text == null ? '' : pt.text) || '.' });
        const last = out[out.length - 1];
        if (last && last.role === role) last.content.push(...blocks); else out.push({ role, content: blocks });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
}
async function anthropicPost(p, stream, a, signal) {
    const url = p.baseUrl.replace(/\/+$/, '') + '/messages';
    const body = { model: p.model, max_tokens: a.maxTokens, system: a.system, messages: anthropicMessages(a.contents), stream: !!stream };
    if (a.temperature != null) body.temperature = Math.min(1, a.temperature);
    for (let pass = 0; pass < 2; pass++) {
        const r = await fetchWithRetry(url, {
            method: 'POST', headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body)
        }, a.retries);
        if (r.ok) return r;
        const detail = await errDetail(r, 'Claude');
        if (r.status === 400 && /temperature/i.test(detail) && 'temperature' in body) { delete body.temperature; continue; }
        throw mkErr(detail, r.status);
    }
}
async function* anthropicStream(p, a, signal) {
    const r = await anthropicPost(p, true, a, signal);
    for await (const payload of sseData(r)) {
        let j; try { j = JSON.parse(payload); } catch (_) { continue; }
        if (j.type === 'error') throw mkErr((j.error && j.error.message) || 'خطأ من المزود', 500);
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text) yield { text: j.delta.text };
        if (j.type === 'message_delta' && j.delta && j.delta.stop_reason) yield { finish: finishMap(j.delta.stop_reason) };
    }
}
async function anthropicGen(p, a, signal) {
    const r = await anthropicPost(p, false, a, signal);
    const d = await r.json();
    return ((d.content || []).filter(x => x.type === 'text').map(x => x.text || '').join('')).trim();
}
const ADAPTERS = {
    gemini: { stream: geminiStream, gen: geminiGen },
    openai: { stream: openaiStream, gen: openaiGen },
    anthropic: { stream: anthropicStream, gen: anthropicGen }
};

// ---------- مزودو البيئة (المصدر الوحيد للمفاتيح) ----------
// أي متغير في Vercel اسمه يبدأ بـ GEMINI_API_KEY أو GEMINI_KEY (مثلاً GEMINI_KEY_1 و GEMINI_KEY_2 و GEMINI_KEY_ALI) بيتحسب مفتاح Gemini.
// ممكن المتغير الواحد يحتوي أكتر من مفتاح مفصولين بفاصلة. الطلبات بتتوزّع بين المفاتيح، ولو واحد فشل بنحوّل للتاني.
// احتياطي اختياري: GROQ_KEY_* مع TR_GROQ_MODEL، و OPENROUTER_KEY_* مع TR_OPENROUTER_MODEL. وكمان TR_AI_PROVIDERS (JSON).
function envProviders() {
    const out = [], seen = new Set(), names = Object.keys(process.env).sort();
    const scan = (re, make) => names.forEach(n => {
        if (!re.test(n)) return;
        String(process.env[n] || '').split(',').map(x => x.trim()).filter(Boolean).forEach((k, j) => {
            if (seen.has(k)) return; seen.add(k); make(n, k, j > 0 ? '#' + (j + 1) : '');
        });
    });
    scan(/^GEMINI(_API)?_KEY/i, (n, k, sfx) => out.push({ id: `env-gemini-${n}${sfx}`, name: `Gemini · ${n}${sfx}`, type: 'gemini', baseUrl: GEMINI_BASE, model: MODEL, key: k, vision: true, enabled: true, priority: 0, source: 'env' }));
    if (process.env.TR_GROQ_MODEL) scan(/^GROQ(_API)?_KEY/i, (n, k, sfx) => out.push({ id: `env-groq-${n}${sfx}`, name: `Groq · ${n}${sfx}`, type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: process.env.TR_GROQ_MODEL, key: k, vision: false, enabled: true, priority: 10, source: 'env' }));
    if (process.env.TR_OPENROUTER_MODEL) scan(/^OPENROUTER(_API)?_KEY/i, (n, k, sfx) => out.push({ id: `env-openrouter-${n}${sfx}`, name: `OpenRouter · ${n}${sfx}`, type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: process.env.TR_OPENROUTER_MODEL, key: k, vision: false, enabled: true, priority: 20, source: 'env', noJsonMode: true }));
    try {
        const arr = JSON.parse(process.env.TR_AI_PROVIDERS || '[]');
        (Array.isArray(arr) ? arr : []).forEach((x, i) => {
            if (!x || !AI_TYPES.includes(x.type) || !x.key || !x.model) return;
            const base = x.baseUrl || (x.type === 'gemini' ? GEMINI_BASE : x.type === 'anthropic' ? 'https://api.anthropic.com/v1' : '');
            if (!base) return;
            out.push({ id: `env-json-${i + 1}`, name: str(x.name, 60) || `${x.type} ${i + 1}`, type: x.type, baseUrl: base, model: String(x.model), key: String(x.key),
                vision: x.vision != null ? !!x.vision : x.type !== 'openai', enabled: true, priority: Number.isFinite(x.priority) ? x.priority : 50 + i, source: 'env', noJsonMode: !!x.noJsonMode });
        });
    } catch (_) {}
    return out;
}

// ---------- تشفير مفاتيح المزودين المحفوظة في قاعدة البيانات (AES-256-GCM) ----------
const secretKey = () => { const s = process.env.TR_KEYS_SECRET || process.env.JWT_SECRET || ''; return s ? crypto.createHash('sha256').update('tr-ai-keys:' + s).digest() : null; };
function encKey(plain) {
    const k = secretKey(); if (!k) throw mkErr('اضبط TR_KEYS_SECRET (أو JWT_SECRET) على السيرفر الأول علشان نقدر نحفظ المفاتيح مشفّرة', 400, 'no_secret');
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv);
    const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
function decKey(s) {
    const k = secretKey(); if (!k || !s) return '';
    const [iv, tag, enc] = String(s).split('.').map(x => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
const maskKey = (k) => (!k ? '' : k.length > 12 ? k.slice(0, 4) + '…' + k.slice(-4) : '••••');

// ---------- تصنيف الأعطال: إيه اللي نريّحه مؤقتًا ----------
function cooldownFor(e) {
    const st = e && e.status;
    if (e && e.code === 'ai_timeout') return 30000;
    if (st === 429) return 60000;
    if (st === 401 || st === 403 || st === 404) return 15 * 60000;
    if (st >= 500) return 30000;
    if (st == null && !['ai_bad_response', 'ai_bad_json'].includes(e && e.code)) return 30000; // خطأ شبكة
    return 0; // 400 أو رد فاضي/مش مفهوم: مش عطل في المزود نفسه
}
const isAbort = (e, signal) => !!(signal && signal.aborted && e && e.name === 'AbortError');
function aggregateErr(attempts) {
    const pick = attempts.find(x => ![401, 403, 404].includes(x.e.status)) || attempts[attempts.length - 1];
    const e = mkErr(pick.e.message, pick.e.status, pick.e.code);
    e.attempts = attempts.map(x => `${x.p.name}: ${x.e.status != null ? x.e.status + ' ' : ''}${String(x.e.message).slice(0, 120)}`);
    return e;
}
// رسالة عربي مفهومة للطالب + التفصيل الأصلي للأدمن
function aiErr(e) {
    const st = e && e.status, raw = String((e && e.message) || '');
    let msg = raw;
    if (e && e.code === 'ai_unavailable') msg = 'مفيش مزود ذكاء اصطناعي متفعّل للجزء ده على السيرفر';
    else if (e && e.code === 'ai_timeout') msg = 'الذكاء الاصطناعي اتأخر في الرد، جرب تاني';
    else if (st === 429) msg = 'ضغط كبير على الذكاء الاصطناعي دلوقتي، جرب تاني بعد دقيقة';
    else if (st === 401 || st === 403 || /api key/i.test(raw)) msg = 'مفتاح الذكاء الاصطناعي على السيرفر غير صالح أو متوقف';
    else if (st === 404) msg = 'موديل الذكاء الاصطناعي غير موجود، راجع إعدادات السيرفر';
    else if (st >= 500) msg = 'خدمة الذكاء الاصطناعي واقفة مؤقتًا، جرب تاني';
    else if (e && (e.code === 'ai_bad_response' || e.code === 'ai_bad_json')) msg = /[\u0600-\u06FF]/.test(raw) ? raw : 'الرد مكانش مفهوم، جرب تاني';
    else if (!/[\u0600-\u06FF]/.test(msg)) msg = 'حصلت مشكلة مع الذكاء الاصطناعي، جرب تاني';
    return { error: msg, detail: (e && e.attempts ? e.attempts.join(' | ') : raw).slice(0, 500) };
}

// ---------- الراوتر: بيختار سلسلة المزودين ويحوّل عند الفشل ----------
function createAIRouter({ TrAIProvider, TrAIConfig, TrAIStat }) {
    let cache = null, cacheAt = 0;
    const TTL = 15000;
    const invalidate = () => { cache = null; };

    async function load() {
        if (cache && Date.now() - cacheAt < TTL) return cache;
        let dbp = [], cfg = null, stats = [];
        try {
            [dbp, cfg, stats] = await Promise.all([TrAIProvider.find({}).lean(), TrAIConfig.findOne({ key: 'main' }).lean(), TrAIStat.find({}).lean()]);
        } catch (e) { console.error('ai config load failed:', e.message); }
        const env = envProviders();
        const db = []; // المفاتيح بتيجي من متغيرات البيئة بس
        const health = {}; (stats || []).forEach(s => { health[s.pid] = s; });
        cache = { providers: env.concat(db), routes: {}, health, disabledEnv: [] };
        cacheAt = Date.now();
        return cache;
    }
    function buildChain(st, feature, vision) {
        const all = st.providers.filter(p => p.enabled && p.key && AI_TYPES.includes(p.type) && (!vision || p.vision));
        // نفس الأولوية = توزيع عشوائي بين المفاتيح علشان الحمل يتقسم عليهم، والأقل أولوية بيتجرّب بعدهم
        const groups = new Map(); all.forEach(p => { const k = p.priority; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
        const list = [];
        Array.from(groups.keys()).sort((x, y) => x - y).forEach(k => {
            const g = groups.get(k);
            for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
            list.push(...g);
        });
        const now = Date.now(), cooling = (p) => (st.health[p.id] && st.health[p.id].cooldownUntil > now);
        return list.filter(p => !cooling(p)).concat(list.filter(cooling)); // المريّحين في الآخر (لكن بنجربهم لو الباقي فشل)
    }
    const persist = (pid, update) => { try { Promise.resolve(TrAIStat.updateOne({ pid }, update, { upsert: true })).catch(() => {}); } catch (_) {} };
    function markOk(p, ms) {
        if (cache) { const h = cache.health[p.id] || (cache.health[p.id] = { pid: p.id }); h.cooldownUntil = 0; h.ok = (h.ok || 0) + 1; h.lastOkAt = new Date(); h.lastMs = ms; }
        persist(p.id, { $inc: { ok: 1 }, $set: { lastOkAt: new Date(), cooldownUntil: 0, lastMs: ms } });
    }
    function markFail(p, e) {
        const cd = cooldownFor(e), msg = String((e && e.message) || '').slice(0, 200);
        if (cache) { const h = cache.health[p.id] || (cache.health[p.id] = { pid: p.id }); h.fail = (h.fail || 0) + 1; h.lastError = msg; h.lastErrorAt = new Date(); if (cd) h.cooldownUntil = Date.now() + cd; }
        const set = { lastError: msg, lastErrorAt: new Date() }; if (cd) set.cooldownUntil = Date.now() + cd;
        persist(p.id, { $inc: { fail: 1 }, $set: set });
    }
    async function chainFor(feature, vision) {
        const st = await load(), chain = buildChain(st, feature, vision);
        if (!chain.length) throw mkErr('no providers', 503, 'ai_unavailable');
        return chain;
    }
    async function available(feature, vision) { try { return (await chainFor(feature, vision)).length > 0; } catch (_) { return false; } }

    async function generate(feature, a) {
        const chain = await chainFor(feature, !!a.vision);
        const args = Object.assign({ temperature: 0.4, maxTokens: 2000 }, a, { retries: chain.length > 1 ? 0 : 1 });
        const attempts = [], t0 = Date.now();
        for (const p of chain) {
            if (attempts.length && Date.now() - t0 > AI_BUDGET_MS) break;
            const t1 = Date.now(), wt = withTimeout(a.signal, AI_TIMEOUT_MS);
            try {
                const text = await ADAPTERS[p.type].gen(p, args, wt.signal);
                if (!text) throw mkErr('الذكاء الاصطناعي مرجّعش رد', null, 'ai_bad_response');
                const out = a.json ? parseJsonLoose(text) : text;
                markOk(p, Date.now() - t1); return out;
            } catch (e0) {
                const e = wt.timedOut ? mkErr('انتهت مهلة المزود', 0, 'ai_timeout') : e0;
                if (isAbort(e0, a.signal)) throw e0;
                attempts.push({ p, e }); markFail(p, e);
            } finally { wt.done(); }
        }
        throw aggregateErr(attempts);
    }

    // بث: التحويل للمزود التاني ممكن بس قبل ما أول جزء من الرد يوصل للطالب
    async function* stream(feature, a) {
        const chain = await chainFor(feature, !!a.vision);
        const args = Object.assign({ temperature: 0.4, maxTokens: 2000 }, a, { retries: chain.length > 1 ? 0 : 1 });
        const attempts = [], t0 = Date.now();
        for (const p of chain) {
            if (attempts.length && Date.now() - t0 > AI_BUDGET_MS) break;
            const t1 = Date.now(), wt = withTimeout(a.signal, AI_FIRST_BYTE_MS);
            let started = false, pending = [];
            try {
                for await (const ev of ADAPTERS[p.type].stream(p, args, wt.signal)) {
                    wt.arm(AI_IDLE_MS);
                    if (ev.text) { started = true; for (const x of pending) yield x; pending = []; yield ev; }
                    else if (started) yield ev; else pending.push(ev);
                }
                if (!started) throw mkErr('الذكاء الاصطناعي مرجّعش رد', null, 'ai_bad_response');
                markOk(p, Date.now() - t1);
                for (const x of pending) yield x;
                return;
            } catch (e0) {
                const e = wt.timedOut ? mkErr('انتهت مهلة المزود', 0, 'ai_timeout') : e0;
                if (isAbort(e0, a.signal)) throw e0;
                markFail(p, e);
                if (started) { e.partial = true; throw e; }   // خلاص بعتنا جزء من الرد، مينفعش نبدّل المزود
                attempts.push({ p, e });
            } finally { wt.done(); }
        }
        throw aggregateErr(attempts);
    }

    async function test(p) {
        const t1 = Date.now(), wt = withTimeout(null, AI_TIMEOUT_MS);
        try {
            const text = await ADAPTERS[p.type].gen(p, { system: 'You are a connectivity test.', contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], maxTokens: 30, temperature: 0, retries: 0 }, wt.signal);
            if (!text) throw mkErr('رجّع رد فاضي', null, 'ai_bad_response');
            const ms = Date.now() - t1; markOk(p, ms); return { ok: true, ms, sample: text.slice(0, 40) };
        } catch (e0) {
            const e = wt.timedOut ? mkErr('انتهت مهلة المزود', 0, 'ai_timeout') : e0;
            markFail(p, e); return { ok: false, status: e.status || 0, error: String(e.message).slice(0, 300) };
        } finally { wt.done(); }
    }
    return { load, invalidate, generate, stream, available, test, markOk, markFail, buildChain };
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

    // مزودو الذكاء الاصطناعي (المفاتيح مشفّرة) + مسارات كل جزء + عدّادات الصحة
    const TrAIProvider = model('TrAIProvider', new Schema({
        name: String, type: String, baseUrl: String, model: String, keyEnc: String,
        vision: { type: Boolean, default: false }, enabled: { type: Boolean, default: true },
        priority: { type: Number, default: 100 }, noJsonMode: { type: Boolean, default: false }
    }, { timestamps: true }));
    const TrAIConfig = model('TrAIConfig', new Schema({
        key: { type: String, unique: true }, routes: { type: Schema.Types.Mixed, default: {} }, disabledEnv: { type: [String], default: [] }
    }, { timestamps: true }));
    const TrAIStat = model('TrAIStat', new Schema({
        pid: { type: String, unique: true }, ok: { type: Number, default: 0 }, fail: { type: Number, default: 0 },
        lastError: String, lastErrorAt: Date, lastOkAt: Date, lastMs: Number, cooldownUntil: { type: Number, default: 0 }
    }));
    const ai = createAIRouter({ TrAIProvider, TrAIConfig, TrAIStat });

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
            return day;
        }
        const ok = await TrUsage.findOneAndUpdate(
            { username: user.username, day, actions: { $lt: FREE_DAILY_ACTIONS } }, { $inc: { actions: 1 } }
        );
        return ok ? day : null;
    }
    async function refundAction(user, day) {
        try { if (day) await TrUsage.updateOne({ username: user.username, day, actions: { $gt: 0 } }, { $inc: { actions: -1 } }); }
        catch (e) { console.error('refund action failed', e.message); }
    }
    const actionDenied = (res) => res.status(402).json({
        error: `خلّصت عمليات الذكاء الاصطناعي المجانية النهاردة (${FREE_DAILY_ACTIONS}). ارجع بكرة أو فعّل الباقة.`, code: 'quota_exceeded'
    });

    async function requirePremium(req, res, what) {
        const profile = await getProfile(req.user.username);
        if (await isUnlimited(req.user, profile)) return true;
        res.status(403).json({ error: `${what} للمشتركين في الباقة بس`, code: 'premium_only' });
        return false;
    }

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
            plans: PLANS, maxBatch: unlimited ? 50 : 20,
            daysLeft: profile.planUntil && profile.planUntil > new Date() ? Math.ceil((profile.planUntil - Date.now()) / 86400000) : null
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

            if (!(await ai.available('translate', true))) return res.status(503).json({ error: 'خدمة الترجمة مش مفعّلة حاليًا (مفيش مفتاح Gemini على السيرفر، ضيف GEMINI_KEY_1 في Vercel)' });

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
                    for await (const ev of ai.stream('translate', { system: TRANSLATE_SYSTEM, contents: [{ role: 'user', parts }], vision: true, maxTokens: 16384, temperature: 0.2, signal: controller.signal })) {
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

    // ====================== 2) شرح بالعامية + تشبيه + مثال إكلينيكي ======================
    app.post('/api/translate/explain', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const en = str(req.body && req.body.en, 3000), ar = str(req.body && req.body.ar, 3500);
            const mode = ['simpler', 'deeper'].includes(req.body && req.body.mode) ? req.body.mode : 'normal';
            if (!en && !ar) return res.status(400).json({ error: 'النص مطلوب' });
            await connectToDatabase();
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const r = await ai.generate('explain', {
                system: EXPLAIN_SYSTEM, json: true, maxTokens: 8000, temperature: 0.5,
                contents: [{ role: 'user', parts: [{ text: `MODE=${mode}\n\nEnglish passage:\n${en}\n\nArabic translation:\n${ar}` }] }]
            });
            const list = (v, n) => (Array.isArray(v) ? v.map(x => cleanChat(str(String(x || ''), 400)).replace(/^[-•]\s+/, '')).filter(Boolean).slice(0, n) : []);
            const chk = r.check && typeof r.check === 'object' ? { q: cleanChat(str(r.check.q, 300)), a: cleanChat(str(r.check.a, 500)) } : null;
            res.json({
                mode,
                simple: cleanChat(str(r.simple, 3000)), analogy: cleanChat(str(r.analogy, 800)), example: cleanChat(str(r.example, 2000)),
                nursing: list(r.nursing, 5), mnemonic: cleanChat(str(r.mnemonic, 400)), exam: list(r.exam, 4),
                check: chk && chk.q && chk.a ? chk : null
            });
        } catch (e) { await refundAction(req.user, day); console.error('explain:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== 3) MCQs + Flashcards ======================
    app.post('/api/translate/quiz', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 400) : [];
            const text = items.filter(i => i && i.en).map(i => str(i.en, 1500)).join('\n').slice(0, req.body && req.body.exam ? 26000 : 14000);
            if (text.length < 60) return res.status(400).json({ error: 'المحتوى قليل لتوليد أسئلة' });
            const exam = !!(req.body && req.body.exam);
            const mcqN = exam ? Math.min(25, Math.max(10, Number(req.body.mcq) || 20)) : Math.min(10, Math.max(3, Number(req.body.mcq) || 6));
            const fcN = exam ? 0 : Math.min(15, Math.max(4, Number(req.body.flash) || 10));
            await connectToDatabase();
            if (exam && !(await requirePremium(req, res, 'الامتحان التجريبي'))) return;
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const ask = exam
                ? `Write a mock exam of ${mcqN} MCQs covering the WHOLE content evenly (about 30% easy, 50% medium, 20% hard). Return "flashcards": [].\n\nContent:\n${text}`
                : `Write ${mcqN} MCQs and ${fcN} flashcards from this content:\n\n${text}`;
            const r = await ai.generate('quiz', {
                system: QUIZ_SYSTEM, json: true, maxTokens: exam ? 14000 : 8000, temperature: 0.5,
                contents: [{ role: 'user', parts: [{ text: ask }] }]
            });
            const mcqs = (Array.isArray(r.mcqs) ? r.mcqs : []).map(q => {
                const options = Array.isArray(q.options) ? q.options.map(o => str(String(o || ''), 300)).filter(Boolean).slice(0, 4) : [];
                const answer = Number.isInteger(q.answer) ? q.answer : -1;
                return { q: str(q.q, 600), options, answer, why: cleanChat(str(q.why, 700)) };
            }).filter(q => q.q && q.options.length === 4 && q.answer >= 0 && q.answer < 4).slice(0, mcqN);
            const flashcards = (Array.isArray(r.flashcards) ? r.flashcards : [])
                .map(f => ({ front: str(f.front, 300), back: cleanChat(str(f.back, 600)) })).filter(f => f.front && f.back).slice(0, fcN);
            if (!mcqs.length && !flashcards.length) { await refundAction(req.user, day); return res.status(502).json({ error: 'مقدرتش أولّد أسئلة، جرب تاني' }); }
            res.json({ mcqs, flashcards });
        } catch (e) { await refundAction(req.user, day); console.error('quiz:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== 4) شات "اسأل عن الصفحة" (بث تدريجي اختياري) ======================
    app.post('/api/translate/chat', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const question = str(req.body && req.body.question, 1500);
            const context = str(req.body && req.body.context, 20000);
            if (!question) return res.status(400).json({ error: 'السؤال مطلوب' });
            if (!context) return res.status(400).json({ error: 'مفيش محتوى صفحة للسؤال عنه' });
            await connectToDatabase();
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const hist = (Array.isArray(req.body.history) ? req.body.history : []).slice(-10)
                .map(m => ({ role: m && m.role === 'model' ? 'model' : 'user', parts: [{ text: str(m && m.text, 3000) || '.' }] }));
            while (hist.length && hist[0].role !== 'user') hist.shift();
            const contents = [{ role: 'user', parts: [{ text: `PAGE CONTENT:\n"""\n${context}\n"""` }] },
                { role: 'model', parts: [{ text: 'تمام، قريت محتوى الصفحة. اسأل.' }] }]
                .concat(hist, [{ role: 'user', parts: [{ text: question }] }]);

            if (!req.body.stream) {
                const answer = await ai.generate('chat', { system: CHAT_SYSTEM, contents, maxTokens: 8000, temperature: 0.4 });
                return res.json({ answer: cleanChat(answer).slice(0, 8000) });
            }

            res.status(200);
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            if (res.flushHeaders) res.flushHeaders();
            const send = (o) => { res.write('data: ' + JSON.stringify(o) + '\n\n'); if (res.flush) res.flush(); };
            const controller = new AbortController();
            res.on('close', () => { if (!res.writableEnded) controller.abort(); });
            let got = false, finish = null, failed = null;
            try {
                for await (const ev of ai.stream('chat', { system: CHAT_SYSTEM, contents, maxTokens: 8000, temperature: 0.4, signal: controller.signal })) {
                    if (ev.text) { got = true; send({ t: 'delta', text: ev.text }); }
                    if (ev.finish) finish = ev.finish;
                }
            } catch (e) { if (!controller.signal.aborted) failed = e; }
            if (controller.signal.aborted) return;
            if (!got) {
                // لو البث فشل أو رجع فاضي، نجرب نفس الطلب كرد كامل مرة واحدة
                try {
                    const full = cleanChat(await ai.generate('chat', { system: CHAT_SYSTEM, contents, maxTokens: 8000, temperature: 0.4 }));
                    if (full) { got = true; failed = null; send({ t: 'delta', text: full }); }
                } catch (e2) { failed = e2; }
            }
            if (!got) {
                await refundAction(req.user, day);
                console.error('chat stream failed:', failed && failed.message);
                const ae = failed ? aiErr(failed) : { error: 'الذكاء الاصطناعي مرجّعش رد، جرب تاني', detail: '' };
                send({ t: 'fatal', msg: ae.error, detail: ae.detail });
            } else {
                send({ t: 'done', truncated: finish === 'MAX_TOKENS' || !!failed });
            }
            return res.end();
        } catch (e) {
            await refundAction(req.user, day);
            console.error('chat:', e.message);
            if (res.headersSent) { try { res.write('data: ' + JSON.stringify({ t: 'fatal', msg: 'حصل خطأ في السيرفر' }) + '\n\n'); } catch (_) {} return res.end(); }
            res.status(aiStatus(e)).json(aiErr(e));
        }
    });

    // ====================== 4-ب) ملخص الفصل (للمشتركين) ======================
    app.post('/api/translate/summary', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 500) : [];
            const text = items.filter(i => i && i.en).map(i => str(i.en, 1500) + (i.ar ? '\n' + str(i.ar, 1800) : '')).join('\n\n').slice(0, 26000);
            if (text.length < 120) return res.status(400).json({ error: 'المحتوى قليل لعمل ملخص' });
            await connectToDatabase();
            if (!(await requirePremium(req, res, 'ملخص الفصل'))) return;
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const r = await ai.generate('summary', { system: SUMMARY_SYSTEM, json: true, maxTokens: 9000, temperature: 0.3, contents: [{ role: 'user', parts: [{ text }] }] });
            const arr = (v, n, m) => (Array.isArray(v) ? v.map(x => cleanChat(str(String(x || ''), m)).replace(/^[-•]\s+/, '')).filter(Boolean).slice(0, n) : []);
            const sections = (Array.isArray(r.sections) ? r.sections : []).map(sc => ({ title: cleanChat(str(sc && sc.title, 140)), points: arr(sc && sc.points, 8, 400) })).filter(sc => sc.title && sc.points.length).slice(0, 8);
            const terms = (Array.isArray(r.terms) ? r.terms : []).map(t => ({ en: str(t && t.en, 100), ar: str(t && t.ar, 140) })).filter(t => t.en && t.ar).slice(0, 14);
            const out = { overview: cleanChat(str(r.overview, 900)), sections, mustKnow: arr(r.mustKnow, 12, 300), terms, pitfalls: arr(r.pitfalls, 6, 300), plan: cleanChat(str(r.plan, 500)) };
            if (!out.overview && !sections.length) { await refundAction(req.user, day); return res.status(502).json({ error: 'مقدرتش أعمل الملخص، جرب تاني' }); }
            res.json(out);
        } catch (e) { await refundAction(req.user, day); console.error('summary:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
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
        let day = null;
        try {
            const term = str(req.body && req.body.term, 120);
            if (!term) return res.status(400).json({ error: 'اكتب المصطلح' });
            await connectToDatabase();
            const have = await TrGlossary.findOne({ username: req.user.username, key: termKey(term) }).select('en ar def -_id').lean();
            if (have) return res.json(Object.assign({ fromGlossary: true }, have));
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const r = await ai.generate('define', {
                system: DEFINE_SYSTEM, json: true, maxTokens: 2000, temperature: 0.2,
                contents: [{ role: 'user', parts: [{ text: `Term: ${term}` }] }]
            });
            const out = { en: str(r.en, 120) || term, ar: str(r.ar, 160), def: str(r.def, 600) };
            if (!out.ar) { await refundAction(req.user, day); return res.status(502).json({ error: 'مقدرتش ألاقي معنى المصطلح' }); }
            await saveTerms(req.user.username, [out]);
            res.json(Object.assign({ fromGlossary: false }, out));
        } catch (e) { await refundAction(req.user, day); console.error('define:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
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

    // ====================== 9) إدارة مزودي الذكاء الاصطناعي (أدمن) ======================
    const validBaseUrl = (u) => {
        try {
            const x = new URL(u), h = x.hostname;
            if (x.protocol !== 'https:' || !h.includes('.')) return false;
            if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
            return true;
        } catch (_) { return false; }
    };
    const defaultBase = (t) => (t === 'gemini' ? GEMINI_BASE : t === 'anthropic' ? 'https://api.anthropic.com/v1' : '');
    const isId = (v) => typeof v === 'string' && v.length > 0 && v.length < 80;
    function readProviderBody(b, partial) {
        const out = {}, err = (m) => { const e = new Error(m); e.bad = true; throw e; };
        if (!partial || b.name !== undefined) { out.name = str(b.name, 60); if (!out.name) err('اكتب اسم للمزود'); }
        if (!partial || b.type !== undefined) { out.type = String(b.type || ''); if (!AI_TYPES.includes(out.type)) err('نوع المزود غير صحيح'); }
        if (!partial || b.model !== undefined) { out.model = str(b.model, 120); if (!out.model) err('اكتب اسم الموديل'); }
        if (!partial || b.baseUrl !== undefined) {
            const t = out.type || b.type || 'openai';
            out.baseUrl = str(b.baseUrl, 300) || defaultBase(t);
            if (!out.baseUrl) err('اكتب رابط الـ API (Base URL)');
            if (!validBaseUrl(out.baseUrl)) err('رابط الـ API لازم يكون https ودومين عام');
            out.baseUrl = out.baseUrl.replace(/\/+$/, '');
        }
        if (b.vision !== undefined) out.vision = !!b.vision;
        if (b.enabled !== undefined) out.enabled = !!b.enabled;
        if (b.noJsonMode !== undefined) out.noJsonMode = !!b.noJsonMode;
        if (b.priority !== undefined) { const n = Number(b.priority); out.priority = Number.isFinite(n) ? Math.max(-1000, Math.min(1000, Math.round(n))) : 100; }
        if (b.apiKey !== undefined && String(b.apiKey).trim()) {
            const k = String(b.apiKey).trim();
            if (k.length < 8 || k.length > 500 || /\s/.test(k)) err('المفتاح غير صحيح (من غير مسافات)');
            out.keyEnc = encKey(k);
        } else if (!partial) err('اكتب مفتاح الـ API');
        return out;
    }
    const aiErrStatus = (e) => (e.bad || e.code === 'no_secret' ? 400 : 500);
    const publicAI = (p, st) => {
        const h = st.health[p.id] || {};
        return {
            id: p.id, name: p.name, type: p.type, baseUrl: p.baseUrl, model: p.model, vision: !!p.vision, enabled: !!p.enabled, priority: p.priority,
            source: p.source, keyMask: maskKey(p.key), keyBroken: !!p.keyBroken, noJsonMode: !!p.noJsonMode,
            stats: { ok: h.ok || 0, fail: h.fail || 0, lastError: h.lastError || '', lastErrorAt: h.lastErrorAt || null, lastOkAt: h.lastOkAt || null, lastMs: h.lastMs || 0 },
            cooling: !!(h.cooldownUntil && h.cooldownUntil > Date.now()), cooldownUntil: h.cooldownUntil || 0
        };
    };

    app.get('/api/translate/admin/ai', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase(); ai.invalidate();
            const st = await ai.load();
            res.json({ features: AI_FEATURES, routes: st.routes || {}, providers: st.providers.map(p => publicAI(p, st)), secretReady: true, model: MODEL });
        } catch (e) { console.error('ai admin get:', e.message); res.status(500).json({ error: 'خطأ في جلب إعدادات الذكاء الاصطناعي' }); }
    });

    app.post('/api/translate/admin/ai/providers/:id/test', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase(); ai.invalidate();
            const st = await ai.load(), p = st.providers.find(x => x.id === String(req.params.id));
            if (!p) return res.status(404).json({ error: 'المزود مش موجود' });
            if (!p.key) return res.json({ ok: false, status: 0, error: 'المفتاح مش مقروء. اتأكد من TR_KEYS_SECRET أو JWT_SECRET وأعد إدخال المفتاح' });
            res.json(await ai.test(p));
        } catch (e) { console.error('ai test:', e.message); res.status(500).json({ error: 'خطأ في الاختبار' }); }
    });

    app.post('/api/translate/admin/ai/providers/:id/reset', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase();
            await TrAIStat.updateOne({ pid: String(req.params.id) }, { $set: { cooldownUntil: 0 } }, { upsert: true });
            ai.invalidate(); res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });


    console.log('✅ translate-routes جاهزة (/api/translate/*)');
}

module.exports = registerTranslateRoutes;
module.exports.__test = { createLineParser, extractObjects, normalizeItem, termKey, cleanChat, aiErr, THINK, ADAPTERS, parseJsonLoose, envProviders, encKey, decKey, maskKey, mkErr, createAIRouter, cooldownFor, sseData };
