'use strict';
/**
 * translate-pro.js — أدوات المشتركين في «ترجمان» (كلها للمشتركين بس)
 *
 * بيتركّب تلقائي من translate-routes.js (في آخر registerTranslateRoutes). مفيش حاجة تتعمل في السيرفر الرئيسي.
 *
 * AI (كلها بتستخدم موديلات Premium أول ما تتضاف من صفحة الموديلات):
 *   POST /api/translate/pro/ai/:tool   tool = tutor | notes | mnemonic | case | careplan | drugs | abbr | quizx | grade | procedure | handout | compare | review | planner
 * مراجعة متباعدة (SRS):   GET /pro/srs/due ، GET /pro/srs/stats ، POST /pro/srs/add ، POST /pro/srs/grade ، DELETE /pro/srs/:id
 * كراسة الأخطاء:          GET /pro/mistakes ، POST /pro/mistakes ، POST /pro/mistakes/:id/resolve ، POST /pro/mistakes/to-srs ، DELETE /pro/mistakes/:id
 * قاموس:                  POST /pro/glossary/import
 * إعدادات:                GET /pro/status ، PUT /pro/model
 */
const crypto = require('crypto');

module.exports = function registerPro(app, deps) {
    const { mongoose, rateLimit, verifyToken, connectToDatabase, ai, premiumFor, TrGlossary, TrProfile, termKey, str, cleanChat, aiErr, aiStatus, todayEG } = deps;
    const { Schema } = mongoose;
    const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

    // ====================== Models ======================
    const srsSchema = new Schema({
        username: { type: String, required: true }, key: { type: String, required: true },
        front: String, back: String, source: { type: String, default: '' },
        ease: { type: Number, default: 2.5 }, interval: { type: Number, default: 0 }, reps: { type: Number, default: 0 }, lapses: { type: Number, default: 0 },
        due: { type: String, default: '' }, last: { type: String, default: '' }
    }, { timestamps: true });
    srsSchema.index({ username: 1, key: 1 }, { unique: true });
    srsSchema.index({ username: 1, due: 1 });
    const TrSrs = model('TrSrs', srsSchema);

    const mistakeSchema = new Schema({
        username: { type: String, required: true }, key: { type: String, required: true },
        q: String, options: { type: [String], default: [] }, answer: Number, why: { type: String, default: '' }, picked: { type: Number, default: -1 },
        doc: { type: String, default: '' }, count: { type: Number, default: 1 }, resolved: { type: Boolean, default: false }, lastAt: { type: Date, default: Date.now }
    }, { timestamps: true });
    mistakeSchema.index({ username: 1, key: 1 }, { unique: true });
    mistakeSchema.index({ username: 1, resolved: 1, lastAt: -1 });
    const TrMistake = model('TrMistake', mistakeSchema);

    const savedSchema = new Schema({ username: { type: String, required: true, index: true }, tool: String, title: String, doc: { type: String, default: '' }, data: Schema.Types.Mixed }, { timestamps: true });
    savedSchema.index({ username: 1, createdAt: -1 });
    const TrProSaved = model('TrProSaved', savedSchema);

    // ====================== Helpers ======================
    const hash = (s) => crypto.createHash('sha1').update(String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 20);
    const S = (v, n) => cleanChat(str(String(v == null ? '' : v), n));
    const A = (v, n, m) => (Array.isArray(v) ? v.map(x => S(x, m).replace(/^[-•]\s+/, '')).filter(Boolean).slice(0, n) : []);
    const OA = (v, n, fn) => (Array.isArray(v) ? v.slice(0, n).map(x => (x && typeof x === 'object' ? fn(x) : null)).filter(Boolean) : []);
    const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

    const aiLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, keyGenerator: (req) => (req.user && req.user.username) || 'anon', message: { error: 'طلبات كتير في وقت قصير — استنى شوية وجرب تاني' } });
    const dataLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 240, keyGenerator: (req) => (req.user && req.user.username) || 'anon', message: { error: 'طلبات كتير — استنى شوية وجرب تاني' } });

    // كل المسارات هنا للمشتركين (والأدمن) بس
    async function proGuard(req, res, next) {
        try {
            await connectToDatabase();
            const pr = await premiumFor(req.user);
            if (pr) { req.premium = pr; return next(); }
        } catch (e) { return res.status(500).json({ error: 'خطأ مؤقت، جرب تاني' }); }
        return res.status(403).json({ error: 'الميزة دي للمشتركين في الباقة بس', code: 'premium_only' });
    }

    // نص الصفحة/الفصل اللي بنبعته للموديل
    function contentOf(b, max) {
        const items = Array.isArray(b && b.items) ? b.items.slice(0, 400) : [];
        const parts = items.filter(i => i && (i.en || i.ar)).map(i => (str(i.en, 1500) + (i.ar ? '\n' + str(i.ar, 1800) : '')));
        let t = parts.join('\n\n');
        if (!t && b && b.text) t = str(b.text, max);
        return t.slice(0, max);
    }
    const STYLE = ' Write in clear simple Arabic (Egyptian-friendly for an Egyptian nursing-institute student), keep medical terms in English in parentheses when useful. Plain text only: no markdown, no asterisks, no emojis. Use ONLY the provided content as your source of facts; never invent drug doses, lab ranges or numbers that are not in it. If a part does not apply return an empty string or empty array.';

    // ====================== أدوات الذكاء الاصطناعي ======================
    const TOOLS = {
        // ---- 1) المعلّم الذكي (سقراط): بيسأل سؤال سؤال ويقيّم إجابتك ----
        tutor: {
            feature: 'tutor', max: 3000, temp: 0.5, need: 80, chars: 14000,
            system: 'You are a warm Socratic nursing tutor chatting with an Egyptian nursing student about the provided content. Ask ONE question at a time, from easy to hard, never giving the answer first. When the student answers, judge it fairly against the content, give short feedback in Egyptian colloquial Arabic, then ask the next question. Questions can be recall, why/how, or a short clinical scenario. Return JSON only: {"feedback":"تقييم إجابة الطالب في 1-3 جمل، وصحّح لو غلط (فاضي لو ده أول سؤال)","verdict":"correct|partial|wrong|none","next":"السؤال التالي","hint":"تلميح صغير لو السؤال صعب (اختياري)","done":false}. Set done=true only when the student asks to stop.' + STYLE,
            user: (b, text) => {
                const hist = (Array.isArray(b.history) ? b.history : []).slice(-8).map(x => `Q: ${str(x && x.q, 400)}\nStudent: ${str(x && x.a, 600)}`).join('\n\n');
                const ans = str(b.answer, 800), lastQ = str(b.lastQ, 400);
                return `CONTENT:\n"""\n${text}\n"""\n\nPREVIOUS TURNS:\n${hist || '(none)'}\n\n` + (ans ? `LAST QUESTION: ${lastQ}\nSTUDENT ANSWER: ${ans}\n\nEvaluate the answer, then ask the next question.` : 'Start with the first question (feedback must be empty, verdict "none").');
            },
            clean: (r) => ({ feedback: S(r.feedback, 700), verdict: ['correct', 'partial', 'wrong', 'none'].includes(r.verdict) ? r.verdict : 'none', next: S(r.next, 500), hint: S(r.hint, 300), done: !!r.done }),
            ok: (o) => o.next || o.feedback
        },
        // ---- 2) ملاحظات كورنيل ----
        notes: {
            feature: 'notes', max: 6000, temp: 0.3, need: 100, chars: 20000,
            system: 'You are a study-skills coach. Turn the content into CORNELL NOTES. Return JSON only: {"title":"عنوان","cues":[{"cue":"كلمة مفتاحية أو سؤال قصير","note":"الملاحظة (1-3 جمل)"}],"summary":"ملخص من 2-3 جمل لآخر الصفحة"}. 8 to 14 cues in the order of the content.' + STYLE,
            user: (b, t) => `Content:\n${t}`,
            clean: (r) => ({ title: S(r.title, 140), cues: OA(r.cues, 16, c => ({ cue: S(c.cue, 160), note: S(c.note, 500) })).filter(c => c.cue && c.note), summary: S(r.summary, 600) }),
            ok: (o) => o.cues.length
        },
        // ---- 3) حيل الحفظ ----
        mnemonic: {
            feature: 'mnemonic', max: 5000, temp: 0.8, need: 40, chars: 12000,
            system: 'You are a creative nursing educator who invents memorable mnemonics for Egyptian students. For the most testable lists/concepts in the content create mnemonics. Allowed types: "acronym" (first letters), "rhyme" (a short Egyptian-Arabic rhyme or jingle), "story" (a tiny funny story), "visual" (an image to imagine). Prefer the requested STYLE when possible. Return JSON only: {"items":[{"topic":"الموضوع","type":"acronym|rhyme|story|visual","mnemonic":"الحيلة","breakdown":["حرف أو كلمة = معناها"],"tip":"إزاي تفتكرها (اختياري)"}]}. 4 to 6 items. Keep medical accuracy.' + STYLE,
            user: (b, t) => `STYLE: ${['acronym', 'rhyme', 'story', 'visual'].includes(b.style) ? b.style : 'mixed'}\n\nContent:\n${t}`,
            clean: (r) => ({ items: OA(r.items, 8, x => ({ topic: S(x.topic, 140), type: ['acronym', 'rhyme', 'story', 'visual'].includes(x.type) ? x.type : 'acronym', mnemonic: S(x.mnemonic, 600), breakdown: A(x.breakdown, 10, 160), tip: S(x.tip, 300) })).filter(x => x.topic && x.mnemonic) }),
            ok: (o) => o.items.length
        },
        // ---- 4) حالة إكلينيكية تفاعلية ----
        case: {
            feature: 'case', max: 7000, temp: 0.6, need: 80, chars: 16000,
            system: 'You are a clinical nursing instructor. Write ONE realistic clinical case scenario (a patient) based on the condition/topic in the content, at the requested LEVEL, then 4 to 5 MCQs about nursing assessment, priorities and interventions. Return JSON only: {"title":"عنوان الحالة","patient":"وصف المريض (السن، الشكوى، التاريخ المرضي)","vitals":"العلامات الحيوية والنتائج المهمة","questions":[{"q":"السؤال","options":["A","B","C","D"],"answer":0,"why":"التعليل"}],"priority":["أهم 3 إجراءات تمريضية بالترتيب"]}. Exactly 4 options, answer is the zero-based index. Do not give numbers/lab values that contradict the content.' + STYLE,
            user: (b, t) => `LEVEL: ${['easy', 'hard'].includes(b.level) ? b.level : 'medium'}\n\nContent:\n${t}`,
            clean: (r) => ({ title: S(r.title, 160), patient: S(r.patient, 900), vitals: S(r.vitals, 500), priority: A(r.priority, 5, 300),
                questions: OA(r.questions, 6, q => { const options = A(q.options, 4, 300); const answer = Number.isInteger(q.answer) ? q.answer : -1; return { q: S(q.q, 600), options, answer, why: S(q.why, 600) }; }).filter(q => q.q && q.options.length === 4 && q.answer >= 0 && q.answer < 4) }),
            ok: (o) => o.patient && o.questions.length
        },
        // ---- 5) خطة رعاية تمريضية ----
        careplan: {
            feature: 'careplan', max: 8000, temp: 0.3, need: 80, chars: 16000,
            system: 'You are a senior nursing instructor. Build a NURSING CARE PLAN (nursing process) for the main condition/topic in the content, in the ADPIE style. Return JSON only: {"condition":"الحالة","assessment":["أهم بيانات التقييم (subjective/objective)"],"diagnoses":[{"nanda":"Nursing diagnosis in English (NANDA style)","ar":"التشخيص بالعربي","related":"related to / as evidenced by","goal":"الهدف القابل للقياس","interventions":[{"action":"التدخل التمريضي","rationale":"التعليل العلمي"}],"evaluation":"إزاي نقيّم تحقق الهدف"}]}. 2 to 4 diagnoses, 3 to 5 interventions each, ordered by priority. Base interventions on the content; keep to standard safe nursing practice.' + STYLE,
            user: (b, t) => `Content:\n${t}`,
            clean: (r) => ({ condition: S(r.condition, 200), assessment: A(r.assessment, 10, 300),
                diagnoses: OA(r.diagnoses, 5, d => ({ nanda: S(d.nanda, 240), ar: S(d.ar, 240), related: S(d.related, 400), goal: S(d.goal, 400), evaluation: S(d.evaluation, 400), interventions: OA(d.interventions, 7, i => ({ action: S(i.action, 400), rationale: S(i.rationale, 400) })).filter(i => i.action) })).filter(d => d.nanda || d.ar) }),
            ok: (o) => o.diagnoses.length
        },
        // ---- 6) كروت الأدوية ----
        drugs: {
            feature: 'drugs', max: 8000, temp: 0.2, need: 60, chars: 16000,
            system: 'You are a nursing pharmacology instructor. Find the drugs / drug classes MENTIONED in the content and make a study card for each (max 8). Return JSON only: {"drugs":[{"name":"Generic name or class","ar":"الاسم بالعربي","class":"التصنيف","action":"بيشتغل إزاي","uses":"بيتستخدم في إيه","side":["أعراض جانبية مهمة"],"nursing":["مسؤوليات النرس قبل/أثناء/بعد الإعطاء"],"teach":["تعليمات للمريض"],"warning":"تحذير مهم أو موانع (اختياري)"}]}. NEVER write doses, frequencies or lab ranges unless they appear in the content. If no drug is mentioned return {"drugs":[]}.' + STYLE,
            user: (b, t) => `Content:\n${t}`,
            clean: (r) => ({ drugs: OA(r.drugs, 10, d => ({ name: S(d.name, 120), ar: S(d.ar, 140), cls: S(d.class, 160), action: S(d.action, 400), uses: S(d.uses, 400), side: A(d.side, 8, 200), nursing: A(d.nursing, 8, 300), teach: A(d.teach, 6, 300), warning: S(d.warning, 400) })).filter(d => d.name) }),
            ok: () => true
        },
        // ---- 7) اختصارات وقيم معملية ----
        abbr: {
            feature: 'abbr', max: 6000, temp: 0.1, need: 40, chars: 16000,
            system: 'You extract abbreviations and lab values from nursing textbook content. Return JSON only: {"abbreviations":[{"abbr":"CBC","full":"Complete Blood Count","ar":"تعداد الدم الكامل"}],"labs":[{"test":"Potassium","normal":"3.5-5.0 mEq/L","note":"ملاحظة قصيرة لو فيه (اختياري)"}]}. Include ONLY abbreviations that appear in the content, and ONLY lab values/normal ranges that are explicitly written in the content (copy numbers exactly). Up to 30 abbreviations and 20 labs.' + STYLE,
            user: (b, t) => `Content:\n${t}`,
            clean: (r) => ({ abbreviations: OA(r.abbreviations, 40, a => ({ abbr: S(a.abbr, 30), full: S(a.full, 160), ar: S(a.ar, 160) })).filter(a => a.abbr && a.full), labs: OA(r.labs, 30, l => ({ test: S(l.test, 120), normal: S(l.normal, 120), note: S(l.note, 240) })).filter(l => l.test && l.normal) }),
            ok: () => true
        },
        // ---- 8) أسئلة متنوعة (صح/غلط، أكمل، مقالي، توصيل) ----
        quizx: {
            feature: 'quizx', max: 7000, temp: 0.5, need: 60, chars: 16000,
            system: 'You are an experienced nursing exam writer. From the content ONLY write questions of the requested KIND. Return JSON only with the matching key:\n- tf: {"tf":[{"s":"statement in English","a":true,"why":"سبب بالعربي"}]} (8 statements, about half false)\n- fill: {"fill":[{"s":"English sentence with ____ for the blank","a":"the missing word/phrase","alts":["accepted alternative"]}]} (8 items)\n- short: {"short":[{"q":"short-answer question in English","model":"model answer in Arabic (2-4 sentences)","points":["key point the answer must include"]}]} (4 items)\n- match: {"match":[{"l":"term","r":"short matching definition"}]} (8 pairs, unique definitions)\nContent language rules: questions in English, explanations in Arabic.',
            user: (b, t) => `KIND: ${['tf', 'fill', 'short', 'match'].includes(b.kind) ? b.kind : 'tf'}\n\nContent:\n${t}`,
            clean: (r, b) => ({ kind: ['tf', 'fill', 'short', 'match'].includes(b.kind) ? b.kind : 'tf',
                tf: OA(r.tf, 12, x => ({ s: S(x.s, 400), a: x.a === true || x.a === 'true', why: S(x.why, 400) })).filter(x => x.s),
                fill: OA(r.fill, 12, x => ({ s: S(x.s, 400), a: S(x.a, 120), alts: A(x.alts, 4, 120) })).filter(x => x.s && x.a && /_{2,}/.test(x.s)),
                short: OA(r.short, 6, x => ({ q: S(x.q, 400), model: S(x.model, 800), points: A(x.points, 6, 240) })).filter(x => x.q && x.model),
                match: OA(r.match, 12, x => ({ l: S(x.l, 160), r: S(x.r, 300) })).filter(x => x.l && x.r) }),
            ok: (o) => o.tf.length || o.fill.length || o.short.length || o.match.length
        },
        // تصحيح إجابة مقالية
        grade: {
            feature: 'quizx', max: 2000, temp: 0.2, need: 0, chars: 3000,
            system: 'You grade a nursing student\'s short answer against the model answer and key points. Be fair and encouraging; accept correct answers in different words or Egyptian colloquial Arabic. Return JSON only: {"score":0-100,"verdict":"جملة قصيرة","good":["اللي كان صح"],"missed":["نقاط ناقصة"],"better":"إجابة مثالية مختصرة"}.' + STYLE,
            user: (b) => `QUESTION: ${str(b.q, 400)}\nMODEL ANSWER: ${str(b.model, 800)}\nKEY POINTS: ${(Array.isArray(b.points) ? b.points : []).map(x => str(x, 240)).join(' | ')}\nSTUDENT ANSWER: ${str(b.mine, 1200)}`,
            clean: (r) => ({ score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))), verdict: S(r.verdict, 200), good: A(r.good, 5, 240), missed: A(r.missed, 6, 240), better: S(r.better, 800) }),
            ok: () => true, custom: true
        },
        // ---- 9) قائمة إجراء تمريضي ----
        procedure: {
            feature: 'procedure', max: 8000, temp: 0.2, need: 60, chars: 16000,
            system: 'You are a nursing skills lab instructor. Turn the nursing procedure in the content (or the one named in TOPIC) into a CHECKLIST for practice and OSCE. If the content only names the procedure without steps, use standard safe nursing practice and say so in "note". Return JSON only: {"procedure":"اسم الإجراء","purpose":"الهدف","equipment":["الأدوات"],"steps":[{"step":"الخطوة","rationale":"ليه بنعملها","critical":false}],"documentation":"إيه اللي بيتسجل","complications":["مضاعفات يلاحظها النرس"],"note":"ملاحظة (اختياري)"}. 8 to 18 steps in the right order; critical=true for safety-critical steps (hand hygiene, patient identification, asepsis, etc.).' + STYLE,
            user: (b, t) => `TOPIC: ${str(b.topic, 120) || '(choose the main procedure in the content)'}\n\nContent:\n${t}`,
            clean: (r) => ({ procedure: S(r.procedure, 160), purpose: S(r.purpose, 400), equipment: A(r.equipment, 20, 160), documentation: S(r.documentation, 500), complications: A(r.complications, 8, 240), note: S(r.note, 300),
                steps: OA(r.steps, 24, x => ({ step: S(x.step, 400), rationale: S(x.rationale, 400), critical: !!x.critical })).filter(x => x.step) }),
            ok: (o) => o.steps.length
        },
        // ---- 10) نشرة توعية للمريض ----
        handout: {
            feature: 'handout', max: 5000, temp: 0.4, need: 60, chars: 14000,
            system: 'You write a PATIENT EDUCATION handout in very simple Egyptian colloquial Arabic (عامية مصرية بسيطة ومحترمة) a patient with basic education can follow, based on the condition/topic in the content. Return JSON only: {"title":"عنوان النشرة","intro":"جملتين تعريف مبسط","dos":["اعمل"],"donts":["ماتعملش"],"warn":["علامات خطر لازم ترجع فيها للدكتور فورًا"],"diet":"نصايح الأكل والنشاط (اختياري)","follow":"المتابعة والأدوية (من غير جرعات)"}. 4 to 8 items per list. No doses.' + STYLE,
            user: (b, t) => `Content:\n${t}`,
            clean: (r) => ({ title: S(r.title, 160), intro: S(r.intro, 500), dos: A(r.dos, 10, 240), donts: A(r.donts, 10, 240), warn: A(r.warn, 8, 240), diet: S(r.diet, 500), follow: S(r.follow, 500) }),
            ok: (o) => o.dos.length || o.donts.length
        },
        // ---- 11) جدول مقارنة ----
        compare: {
            feature: 'compare', max: 5000, temp: 0.2, need: 40, chars: 14000,
            system: 'You create a COMPARISON between two or more related concepts (diseases, drugs, types...). If A and B are given use them; otherwise pick the most useful comparison from the content. Return JSON only: {"title":"عنوان المقارنة","columns":["الأول","التاني"],"rows":[{"aspect":"وجه المقارنة","values":["...","..."]}],"tip":"نصيحة تفرّق بيهم في الامتحان"}. 2 to 4 columns, 5 to 9 rows, short cells. values length must equal columns length.' + STYLE,
            user: (b, t) => `A: ${str(b.a, 100) || '(auto)'}\nB: ${str(b.b, 100) || '(auto)'}\n\nContent:\n${t}`,
            clean: (r) => { const cols = A(r.columns, 4, 120); return { title: S(r.title, 160), columns: cols, tip: S(r.tip, 400), rows: OA(r.rows, 12, x => ({ aspect: S(x.aspect, 160), values: (Array.isArray(x.values) ? x.values : []).slice(0, cols.length).map(v => S(v, 300)) })).filter(x => x.aspect && cols.length && x.values.length === cols.length) }; },
            ok: (o) => o.columns.length >= 2 && o.rows.length
        },
        // ---- 12) مراجعة جودة الترجمة ----
        review: {
            feature: 'review', max: 7000, temp: 0.1, need: 0, chars: 24000,
            system: 'You are a meticulous medical translation reviewer (English to Arabic) for nursing textbooks. You receive numbered blocks, each with EN and AR. Find REAL problems only: wrong meaning, missing or added information, changed numbers/doses/units, lost negations, wrong medical terms, and awkward unnatural Arabic. Do NOT nitpick correct translations. Return JSON only: {"score":0-100,"verdict":"جملة قصيرة","issues":[{"n":3,"type":"meaning|number|negation|omission|term|style","current":"الجزء الغلط من الترجمة","suggest":"التصحيح المقترح","why":"السبب"}],"praise":"اللي كان ممتاز (اختياري)"}. "n" is the block number. If everything is fine return an empty issues array and a high score.' + STYLE,
            user: (b) => `Blocks:\n${(Array.isArray(b.items) ? b.items : []).slice(0, 60).map((x, i) => `[${Number.isInteger(x && x.n) ? x.n : i + 1}]\nEN: ${str(x && x.en, 900)}\nAR: ${str(x && x.ar, 1100)}`).join('\n\n')}`,
            clean: (r) => ({ score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))), verdict: S(r.verdict, 240), praise: S(r.praise, 300),
                issues: OA(r.issues, 30, x => ({ n: Number.isInteger(x.n) ? x.n : null, type: ['meaning', 'number', 'negation', 'omission', 'term', 'style'].includes(x.type) ? x.type : 'meaning', current: S(x.current, 400), suggest: S(x.suggest, 500), why: S(x.why, 400) })).filter(x => x.suggest) }),
            ok: () => true, custom: true
        },
        // ---- 13) خطة مذاكرة ----
        planner: {
            feature: 'planner', max: 6000, temp: 0.4, need: 0, chars: 6000, custom: true,
            system: 'You are a study coach for an Egyptian nursing student. Build a realistic revision plan using the given SKELETON of days (do not change the labels). For each slot write a focus and 2-4 concrete tasks that use the student\'s documents/weak topics. Include active recall and past-question practice; leave the last slot for a full mock exam and light review. Return JSON only: {"slots":[{"i":0,"focus":"التركيز","tasks":["مهمة"]}],"tips":["نصايح قصيرة للمذاكرة"]}. One object per skeleton slot, same order.' + STYLE,
            user: (b, t, ctx) => `Exam in ${ctx.days} day(s). Study minutes per day: ${ctx.mins}.\n\nSKELETON:\n${ctx.slots.map((x, i) => `${i}: ${x.label}`).join('\n')}\n\nDOCUMENTS:\n${(Array.isArray(b.docs) ? b.docs : []).slice(0, 25).map(d => `- ${str(d && d.title, 100)} (${Math.max(1, Number(d && d.pages) || 1)} pages)`).join('\n') || '(none listed)'}\n\nWEAK TOPICS:\n${(Array.isArray(b.weak) ? b.weak : []).slice(0, 20).map(x => '- ' + str(x, 120)).join('\n') || '(none)'}`,
            clean: (r, b, ctx) => ({ days: ctx.days, mins: ctx.mins, slots: ctx.slots.map((sl, i) => { const g = (Array.isArray(r.slots) ? r.slots : []).find(x => x && Number(x.i) === i) || (r.slots || [])[i] || {}; return { label: sl.label, date: sl.date, focus: S(g.focus, 240), tasks: A(g.tasks, 6, 300) }; }), tips: A(r.tips, 6, 300) }),
            ok: (o) => o.slots.some(x => x.focus || x.tasks.length)
        }
    };

    app.post('/api/translate/pro/ai/:tool', verifyToken, aiLimiter, proGuard, async (req, res) => {
        const key = String(req.params.tool || ''), T = Object.prototype.hasOwnProperty.call(TOOLS, key) ? TOOLS[key] : null;
        if (!T) return res.status(404).json({ error: 'الأداة دي مش موجودة' });
        try {
            const b = req.body || {};
            let ctx = null, text = '';
            if (key === 'planner') {
                const today = todayEG(), exam = /^\d{4}-\d{2}-\d{2}$/.test(String(b.examDate || '')) ? String(b.examDate) : '';
                const days = exam ? daysBetween(today, exam) : 0;
                if (!exam || days < 1 || days > 180) return res.status(400).json({ error: 'اختار تاريخ امتحان من بكرة لحد 6 شهور' });
                const mins = Math.max(15, Math.min(480, Number(b.minutes) || 60));
                const slots = [];
                if (days <= 21) { for (let i = 0; i < days; i++) slots.push({ label: `يوم ${i + 1}`, date: addDays(today, i) }); }
                else { const w = Math.min(12, Math.ceil(days / 7)); for (let i = 0; i < w; i++) slots.push({ label: `أسبوع ${i + 1}`, date: addDays(today, i * 7) }); }
                ctx = { days, mins, slots };
            } else if (T.chars) {
                text = contentOf(b, T.chars);
                if (T.need && text.length < T.need) return res.status(400).json({ error: 'المحتوى قليل لعمل الأداة دي' });
            }
            const userText = T.user(b, text, ctx);
            const r = await ai.generate(T.feature, { premium: req.premium, system: T.system, json: true, maxTokens: T.max, temperature: T.temp, contents: [{ role: 'user', parts: [{ text: userText }] }] });
            const out = T.clean(r && typeof r === 'object' ? r : {}, b, ctx);
            if (!T.ok(out)) return res.status(502).json({ error: 'مقدرتش أطلّع نتيجة مفيدة، جرب تاني أو غيّر المحتوى' });
            res.json(out);
        } catch (e) { console.error('pro/' + key + ':', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== المحفوظات: احفظ أي نتيجة أداة وافتحها بعدين ======================
    const SAVABLE = ['notes', 'mnemonic', 'case', 'careplan', 'drugs', 'abbr', 'quizx', 'procedure', 'handout', 'compare', 'review'];
    app.post('/api/translate/pro/saved', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const b = req.body || {}, tool = String(b.tool || '');
            if (!SAVABLE.includes(tool)) return res.status(400).json({ error: 'الأداة دي مش قابلة للحفظ' });
            const username = req.user.username, T = TOOLS[tool];
            if (JSON.stringify(b.data || {}).length > 80000) return res.status(400).json({ error: 'النتيجة كبيرة' });
            const data = T.clean(b.data && typeof b.data === 'object' ? b.data : {}, { kind: b.data && b.data.kind }, null);
            if (!T.ok(data)) return res.status(400).json({ error: 'مفيش نتيجة صالحة للحفظ' });
            if (await TrProSaved.countDocuments({ username }) >= 200) return res.status(400).json({ error: 'وصلت للحد الأقصى (200 محفوظة)، امسح القديم' });
            const doc = await TrProSaved.create({ username, tool, title: S(b.title, 140) || T.feature, doc: str(b.doc, 100), data });
            res.json({ success: true, id: String(doc._id) });
        } catch (e) { console.error('saved add:', e.message); res.status(500).json({ error: 'خطأ في الحفظ' }); }
    });
    app.get('/api/translate/pro/saved', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const q = { username: req.user.username }; if (req.query.tool && SAVABLE.includes(String(req.query.tool))) q.tool = String(req.query.tool);
            const list = await TrProSaved.find(q).sort({ createdAt: -1 }).limit(120).lean();
            res.json({ list: list.map(x => ({ id: String(x._id), tool: x.tool, title: x.title, doc: x.doc, at: x.createdAt })) });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.get('/api/translate/pro/saved/:id', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            const x = await TrProSaved.findOne({ _id: req.params.id, username: req.user.username }).lean();
            if (!x) return res.status(404).json({ error: 'مش موجود' });
            res.json({ id: String(x._id), tool: x.tool, title: x.title, doc: x.doc, data: x.data });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.delete('/api/translate/pro/saved/:id', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' }); await TrProSaved.deleteOne({ _id: req.params.id, username: req.user.username }); res.json({ success: true }); }
        catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    // ====================== المراجعة المتباعدة (SRS) ======================
    // SM-2 مبسّط: 0 تاني، 1 صعب، 2 كويس، 3 سهل
    function schedule(c, q) {
        let ease = c.ease || 2.5, interval = c.interval || 0, reps = c.reps || 0, lapses = c.lapses || 0;
        if (q === 0) { reps = 0; lapses++; interval = 0; ease = Math.max(1.3, ease - 0.2); }
        else {
            reps++;
            if (q === 1) { ease = Math.max(1.3, ease - 0.15); interval = reps === 1 ? 1 : Math.max(1, Math.round(interval * 1.2)); }
            else if (q === 2) interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(2, Math.round(interval * ease));
            else { ease += 0.15; interval = reps === 1 ? 3 : reps === 2 ? 6 : Math.max(3, Math.round(interval * ease * 1.3)); }
        }
        interval = Math.min(interval, 365);
        return { ease: Math.round(ease * 100) / 100, interval, reps, lapses };
    }
    const srsOut = (c) => ({ id: String(c._id), front: c.front, back: c.back, source: c.source, reps: c.reps, interval: c.interval, due: c.due });

    app.post('/api/translate/pro/srs/add', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const cards = (Array.isArray(req.body && req.body.cards) ? req.body.cards : []).slice(0, 200)
                .map(c => ({ front: str(c && c.front, 600), back: S(c && c.back, 1200), source: str(c && c.source, 80) })).filter(c => c.front && c.back);
            if (!cards.length) return res.status(400).json({ error: 'مفيش كروت صالحة' });
            const username = req.user.username, total = await TrSrs.countDocuments({ username });
            if (total >= 3000) return res.status(400).json({ error: 'وصلت للحد الأقصى (3000 كارت)، امسح كروت قديمة' });
            const today = todayEG();
            const ops = cards.map(c => ({ updateOne: { filter: { username, key: hash(c.front) }, update: { $setOnInsert: { front: c.front, back: c.back, source: c.source, due: today, ease: 2.5, interval: 0, reps: 0, lapses: 0 } }, upsert: true } }));
            const r = await TrSrs.bulkWrite(ops, { ordered: false });
            res.json({ success: true, added: r.upsertedCount || 0, skipped: cards.length - (r.upsertedCount || 0) });
        } catch (e) { console.error('srs add:', e.message); res.status(500).json({ error: 'خطأ في إضافة الكروت' }); }
    });
    app.get('/api/translate/pro/srs/due', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const today = todayEG(), limit = Math.min(60, Math.max(5, Number(req.query.limit) || 30));
            const q = { username: req.user.username, due: { $lte: today } };
            const [cards, due] = await Promise.all([TrSrs.find(q).sort({ due: 1, reps: 1 }).limit(limit).lean(), TrSrs.countDocuments(q)]);
            res.json({ cards: cards.map(srsOut), due });
        } catch (e) { console.error('srs due:', e.message); res.status(500).json({ error: 'خطأ' }); }
    });
    app.get('/api/translate/pro/srs/stats', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const today = todayEG(), username = req.user.username;
            const days = [1, 2, 3, 4, 5, 6, 7].map(n => addDays(today, n));
            const [total, due, mature, ...fc] = await Promise.all([
                TrSrs.countDocuments({ username }), TrSrs.countDocuments({ username, due: { $lte: today } }),
                TrSrs.countDocuments({ username, interval: { $gte: 21 } }), ...days.map(d => TrSrs.countDocuments({ username, due: d }))
            ]);
            res.json({ total, due, mature, tomorrow: fc[0], forecast: fc.map((n, i) => ({ date: days[i], n })) });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.post('/api/translate/pro/srs/grade', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const id = String((req.body && req.body.id) || ''), q = Number(req.body && req.body.q);
            if (!mongoose.isValidObjectId(id) || ![0, 1, 2, 3].includes(q)) return res.status(400).json({ error: 'بيانات غير صالحة' });
            const c = await TrSrs.findOne({ _id: id, username: req.user.username });
            if (!c) return res.status(404).json({ error: 'الكارت مش موجود' });
            const n = schedule(c, q), today = todayEG();
            c.set({ ease: n.ease, interval: n.interval, reps: n.reps, lapses: n.lapses, last: today, due: n.interval === 0 ? today : addDays(today, n.interval) });
            await c.save();
            res.json({ success: true, interval: n.interval, due: c.due, again: n.interval === 0 });
        } catch (e) { console.error('srs grade:', e.message); res.status(500).json({ error: 'خطأ' }); }
    });
    app.delete('/api/translate/pro/srs/:id', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' }); await TrSrs.deleteOne({ _id: req.params.id, username: req.user.username }); res.json({ success: true }); }
        catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    // ====================== كراسة الأخطاء ======================
    app.post('/api/translate/pro/mistakes', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const username = req.user.username;
            const list = (Array.isArray(req.body && req.body.items) ? req.body.items : []).slice(0, 60).map(m => {
                const options = A(m && m.options, 4, 300), answer = Number.isInteger(m && m.answer) ? m.answer : -1;
                return { q: str(m && m.q, 600), options, answer, why: S(m && m.why, 700), picked: Number.isInteger(m && m.picked) ? m.picked : -1, doc: str(m && m.doc, 100) };
            }).filter(m => m.q && m.options.length === 4 && m.answer >= 0 && m.answer < 4);
            if (!list.length) return res.json({ success: true, saved: 0 });
            if (await TrMistake.countDocuments({ username }) >= 1500) return res.status(400).json({ error: 'كراسة الأخطاء امتلأت، امسح اللي حفظته' });
            const ops = list.map(m => ({ updateOne: { filter: { username, key: hash(m.q) },
                update: { $set: { q: m.q, options: m.options, answer: m.answer, why: m.why, picked: m.picked, doc: m.doc, resolved: false, lastAt: new Date() }, $inc: { count: 1 } }, upsert: true } }));
            await TrMistake.bulkWrite(ops, { ordered: false });
            res.json({ success: true, saved: list.length });
        } catch (e) { console.error('mistakes add:', e.message); res.status(500).json({ error: 'خطأ في حفظ الأخطاء' }); }
    });
    app.get('/api/translate/pro/mistakes', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const q = { username: req.user.username }; if (req.query.all !== '1') q.resolved = false;
            const list = await TrMistake.find(q).sort({ count: -1, lastAt: -1 }).limit(300).lean();
            res.json({ list: list.map(m => ({ id: String(m._id), q: m.q, options: m.options, answer: m.answer, why: m.why, doc: m.doc, count: m.count, resolved: m.resolved, lastAt: m.lastAt })) });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.post('/api/translate/pro/mistakes/:id/resolve', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' });
            await TrMistake.updateOne({ _id: req.params.id, username: req.user.username }, { $set: { resolved: req.body && req.body.resolved === false ? false : true } });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.post('/api/translate/pro/mistakes/to-srs', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const username = req.user.username, list = await TrMistake.find({ username, resolved: false }).sort({ count: -1 }).limit(100).lean();
            if (!list.length) return res.json({ success: true, added: 0 });
            const today = todayEG();
            const ops = list.map(m => {
                const front = m.q + '\n\n' + m.options.map((o, i) => String.fromCharCode(65 + i) + ') ' + o).join('\n');
                const back = 'الإجابة: ' + String.fromCharCode(65 + m.answer) + ') ' + m.options[m.answer] + (m.why ? '\n\n' + m.why : '');
                return { updateOne: { filter: { username, key: hash(m.q) }, update: { $setOnInsert: { front, back, source: 'كراسة الأخطاء', due: today, ease: 2.5, interval: 0, reps: 0, lapses: 0 } }, upsert: true } };
            });
            const r = await TrSrs.bulkWrite(ops, { ordered: false });
            res.json({ success: true, added: r.upsertedCount || 0 });
        } catch (e) { console.error('mistakes to-srs:', e.message); res.status(500).json({ error: 'خطأ' }); }
    });
    app.delete('/api/translate/pro/mistakes/:id', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try { if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'معرّف غير صالح' }); await TrMistake.deleteOne({ _id: req.params.id, username: req.user.username }); res.json({ success: true }); }
        catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });

    // ====================== استيراد القاموس (CSV) ======================
    app.post('/api/translate/pro/glossary/import', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const username = req.user.username;
            const terms = (Array.isArray(req.body && req.body.terms) ? req.body.terms : []).slice(0, 500)
                .map(t => ({ en: str(t && t.en, 120), ar: str(t && t.ar, 160), def: str(t && t.def, 600) })).filter(t => t.en && t.ar);
            if (!terms.length) return res.status(400).json({ error: 'مفيش مصطلحات صالحة (محتاج عمود إنجليزي وعمود عربي)' });
            const count = await TrGlossary.countDocuments({ username });
            if (count >= 1500) return res.status(400).json({ error: 'القاموس وصل للحد الأقصى (1500)' });
            const ops = terms.slice(0, Math.max(0, 1500 - count) + terms.length).map(t => ({ updateOne: { filter: { username, key: termKey(t.en) }, update: { $set: { en: t.en, ar: t.ar, def: t.def, source: 'manual' } }, upsert: true } }));
            const r = await TrGlossary.bulkWrite(ops, { ordered: false });
            res.json({ success: true, added: r.upsertedCount || 0, updated: r.modifiedCount || 0 });
        } catch (e) { console.error('glossary import:', e.message); res.status(500).json({ error: 'خطأ في الاستيراد' }); }
    });

    // ====================== حالة المشترك + اختيار الموديل ======================
    app.get('/api/translate/pro/status', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const today = todayEG(), username = req.user.username;
            const [srsDue, mistakes, models, prof] = await Promise.all([
                TrSrs.countDocuments({ username, due: { $lte: today } }), TrMistake.countDocuments({ username, resolved: false }),
                ai.premiumModels(), TrProfile.findOne({ username }).select('prefModel').lean()
            ]);
            res.json({ pro: true, srsDue, mistakes, models, prefModel: (prof && prof.prefModel) || '' });
        } catch (e) { res.status(500).json({ error: 'خطأ' }); }
    });
    app.put('/api/translate/pro/model', verifyToken, dataLimiter, proGuard, async (req, res) => {
        try {
            const m = str(req.body && req.body.model, 120);
            if (m) { const list = await ai.premiumModels(); if (!list.some(x => x.model === m)) return res.status(400).json({ error: 'الموديل ده مش متاح دلوقتي' }); }
            await TrProfile.updateOne({ username: req.user.username }, { $set: { prefModel: m } }, { upsert: true });
            res.json({ success: true, prefModel: m });
        } catch (e) { console.error('pro model:', e.message); res.status(500).json({ error: 'خطأ في الحفظ' }); }
    });

    console.log('✅ translate-pro جاهزة (/api/translate/pro/*)');
};

module.exports.__test = {};
