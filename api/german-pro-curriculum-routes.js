/* ====================== german-pro-curriculum-routes.js ======================
   موديل الذكاء الاصطناعي هو اللي بيبني خطة كل مستوى ودروسه (كلمات + قواعد + حوار + تمارين متنوعة)،
   والمرجع بتاعه هو german-syllabus.js (قواعد كل مستوى من المصادر الرسمية). هو ملزم يغطّي كل قاعدة
   في القايمة وحرّ يضيف قواعد إضافية يشوفها مهمة.
   • الخطة والدروس بتتولّد مرة واحدة وتتخزّن في الداتابيز (Cache مشترك لكل الطلاب) — يعني أول طالب
     بس هو اللي بيستنى، والباقي فوري. الأدمن يقدر يجهّز المستوى كله مقدّمًا.
   • كل رد من الموديل بيعدّي على Validator صارم قبل ما يتخزّن (بيشيل أي تمرين ناقص/غلط في الشكل).
   • الوحدة بتتولّد على مراحل قصيرة (كلمات ← قواعد + حوار + تمارين بالتوازي) عشان تناسب مهلة Vercel.
   الملف ده لازم يكون جنب index.js و german-syllabus.js في نفس الفولدر. */
const { LEVELS, TRACKS, LEVEL_IDS } = require('./german-syllabus');

const ART_KEYS = ['owl', 'owl:nurse', 'owl:grad', 'nurseF', 'nurseF2', 'nurseM', 'doctor', 'patientM', 'patientF', 'child', 'student', 'studentF', 'chef', 'office', 'shop', 'grandpa'];
const DEFAULT_ART = { talk: ['owl', 'student'], life: ['owl', 'shop'], nurse: ['owl:nurse', 'patientM'] };
const AR_RE = /[\u0600-\u06FF]/;
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const uniq = (arr) => [...new Set(arr)];
const isStr = (s, min = 1) => typeof s === 'string' && s.trim().length >= min;

/* ============================ Validators ============================ */
function sanitizeOpts(opts, max = 4) {
    if (!Array.isArray(opts)) return null;
    const cleaned = opts.map(o => clip(o, 90)).filter(Boolean);
    const u = uniq(cleaned);
    if (u.length !== cleaned.length || u.length < 2 || u.length > max) return null;
    return u;
}
function langOf(s) { return AR_RE.test(s) ? 'ar' : 'de'; }

function sanitizeExercise(e, depth = 0) {
    if (!e || typeof e !== 'object') return null;
    const t = String(e.t || e.type || '').toLowerCase();
    const expl = clip(e.expl || e.explanation || '', 320);
    const p = clip(e.p || '', 160);
    const base = { t, expl, ...(p ? { p } : {}) };
    switch (t) {
        case 'mcq': case 'pic': {
            const opts = sanitizeOpts(e.opts || e.options);
            const a = Number.isInteger(e.a) ? e.a : parseInt(e.a, 10);
            const q = clip(e.q, 200);
            if (!opts || !q || !(a >= 0 && a < opts.length)) return null;
            const emoji = isStr(e.emoji) && e.emoji.length <= 8 ? e.emoji : '';
            return { ...base, t: 'mcq', q, qLang: e.qLang === 'de' || e.qLang === 'ar' ? e.qLang : langOf(q), opts, optLang: opts.every(o => langOf(o) === 'ar') ? 'ar' : 'de', a, ...(emoji ? { emoji } : {}) };
        }
        case 'fill': {
            const s = clip(e.s, 200); const opts = sanitizeOpts(e.opts || e.options);
            const a = Number.isInteger(e.a) ? e.a : parseInt(e.a, 10);
            if (!s || (s.match(/___/g) || []).length !== 1 || !opts || !(a >= 0 && a < opts.length)) return null;
            return { ...base, s, sAr: clip(e.sAr, 200), opts, a };
        }
        case 'build': case 'order': {
            const a = clip(e.a, 160); const n = a.split(' ').filter(Boolean).length;
            if (!a || n < 2 || n > 12) return null;
            const extra = Array.isArray(e.extra) ? e.extra.map(x => clip(x, 30)).filter(Boolean).slice(0, 3) : [];
            const alts = Array.isArray(e.alts) ? e.alts.map(x => clip(x, 160)).filter(Boolean).slice(0, 3) : [];
            const q = clip(e.q, 200);
            if (t === 'build' && !q) return null;
            return { ...base, t, q, a, extra: t === 'build' ? extra : [], alts };
        }
        case 'type': {
            const q = clip(e.q, 200); const a = clip(e.a, 120);
            if (!q || !a) return null;
            const alts = Array.isArray(e.alts) ? e.alts.map(x => clip(x, 120)).filter(Boolean).slice(0, 4) : [];
            return { ...base, q, qLang: e.qLang === 'de' || e.qLang === 'ar' ? e.qLang : langOf(q), a, alts };
        }
        case 'tf': {
            const q = clip(e.q, 220);
            const a = e.a === true || e.a === 'true' ? true : (e.a === false || e.a === 'false' ? false : null);
            if (!q || a === null) return null;
            return { ...base, q, qAr: clip(e.qAr, 220), a };
        }
        case 'err': {
            const s = clip(e.s, 160); const tokens = s.split(' ').filter(Boolean);
            const w = Number.isInteger(e.w) ? e.w : parseInt(e.w, 10);
            const fix = clip(e.fix, 60);
            if (tokens.length < 3 || !(w >= 0 && w < tokens.length) || !fix) return null;
            return { ...base, s, w, fix };
        }
        case 'conj': {
            const v = clip(e.v, 40);
            const rows = Array.isArray(e.rows) ? e.rows.map(r => Array.isArray(r) ? [clip(r[0], 20), clip(r[1], 40)] : null).filter(r => r && r[0] && r[1]) : [];
            if (!v || rows.length < 4 || rows.length > 7) return null;
            let hide = Array.isArray(e.hide) ? e.hide.filter(i => Number.isInteger(i) && i >= 0 && i < rows.length) : [];
            if (hide.length < 2) hide = rows.map((_, i) => i).filter(i => i !== 0);
            return { ...base, v, rows, hide: uniq(hide) };
        }
        case 'sort': {
            const buckets = Array.isArray(e.buckets) ? e.buckets.map(b => clip(b, 40)).filter(Boolean) : [];
            const items = Array.isArray(e.items) ? e.items.map(i => Array.isArray(i) ? [clip(i[0], 40), parseInt(i[1], 10)] : null).filter(i => i && i[0] && i[1] >= 0 && i[1] < buckets.length) : [];
            if (buckets.length < 2 || buckets.length > 3 || items.length < 4 || items.length > 8 || uniq(items.map(i => i[0])).length !== items.length) return null;
            return { ...base, buckets, items };
        }
        case 'dlg': {
            const lines = Array.isArray(e.lines) ? e.lines.map(l => Array.isArray(l) ? [clip(l[0], 4), clip(l[1], 160)] : null).filter(l => l && l[1]) : [];
            const opts = sanitizeOpts(e.opts || e.options);
            const a = Number.isInteger(e.a) ? e.a : parseInt(e.a, 10);
            if (!lines.length || !opts || !(a >= 0 && a < opts.length)) return null;
            return { ...base, lines, opts, a };
        }
        case 'read': {
            if (depth > 0) return null;
            const ps = e.passage || {};
            const de = clip(ps.de, 700); const ar = clip(ps.ar, 700);
            if (de.length < 20) return null;
            const qs = (Array.isArray(e.qs) ? e.qs : []).map(q => sanitizeExercise(q, depth + 1)).filter(q => q && (q.t === 'mcq' || q.t === 'tf')).slice(0, 4);
            if (qs.length < 2) return null;
            return { ...base, passage: { title: clip(ps.title, 80), de, ar }, qs };
        }
        case 'match': {
            const pairs = Array.isArray(e.pairs) ? e.pairs.map(pr => Array.isArray(pr) ? [clip(pr[0], 50), clip(pr[1], 50)] : null).filter(pr => pr && pr[0] && pr[1]) : [];
            if (pairs.length < 4 || pairs.length > 6 || uniq(pairs.map(x => x[0])).length !== pairs.length || uniq(pairs.map(x => x[1])).length !== pairs.length) return null;
            return { ...base, pairs };
        }
        case 'listen': {
            const text = clip(e.text, 160); const opts = sanitizeOpts(e.opts || e.options);
            const a = Number.isInteger(e.a) ? e.a : parseInt(e.a, 10);
            if (!text || !opts || opts.length < 3 || !(a >= 0 && a < opts.length)) return null;
            return { ...base, text, opts, a };
        }
        case 'dict': case 'speak': {
            const text = clip(e.text, 160);
            if (!text || text.split(' ').length > 14 || AR_RE.test(text)) return null;
            return { ...base, text, ar: clip(e.ar, 200) };
        }
        default: return null;
    }
}
function sanitizeExercises(raw, min) {
    const list = Array.isArray(raw?.exercises) ? raw.exercises : (Array.isArray(raw) ? raw : []);
    const seen = new Set(); const out = [];
    for (const e of list) {
        const s = sanitizeExercise(e);
        if (!s) continue;
        const sig = JSON.stringify([s.t, s.q || s.s || s.a || s.text || s.v || s.passage?.de || s.lines]);
        if (seen.has(sig)) continue;
        seen.add(sig); out.push(s);
    }
    return out.length >= min ? out : null;
}

function sanitizeVocab(raw) {
    const list = Array.isArray(raw?.vocab) ? raw.vocab : (Array.isArray(raw) ? raw : []);
    const seen = new Set(); const out = [];
    for (const v of list) {
        const de = clip(v?.de, 60), ar = clip(v?.ar, 80);
        if (!de || !ar || !AR_RE.test(ar) || seen.has(de.toLowerCase())) continue;
        seen.add(de.toLowerCase());
        const item = { de, ar };
        if (isStr(v.emoji) && v.emoji.trim().length <= 8 && !/^[A-Za-z0-9 ]+$/.test(v.emoji)) item.emoji = v.emoji.trim();
        if (isStr(v.ex, 4)) { item.ex = clip(v.ex, 140); item.exAr = clip(v.exAr, 160); }
        if (isStr(v.pl)) item.pl = clip(v.pl, 60);
        out.push(item);
    }
    return out.length >= 8 ? out.slice(0, 12) : null;
}

function sanitizeLesson(raw) {
    const gr = raw?.grammar || {};
    const sections = (Array.isArray(gr.sections) ? gr.sections : []).map(s => {
        const textAr = clip(s?.textAr, 900);
        if (!textAr) return null;
        const out = { headingAr: clip(s.headingAr, 120), textAr };
        const tb = s.table;
        if (tb && Array.isArray(tb.head) && Array.isArray(tb.rows) && tb.head.length >= 2 && tb.head.length <= 6) {
            const head = tb.head.map(h => clip(h, 30));
            const rows = tb.rows.filter(r => Array.isArray(r)).map(r => r.slice(0, head.length).map(c => clip(c, 40))).filter(r => r.length === head.length).slice(0, 10);
            if (rows.length) out.table = { head, rows };
        }
        const ex = (Array.isArray(s.examples) ? s.examples : []).map(x => ({ de: clip(x?.de, 140), ar: clip(x?.ar, 160) })).filter(x => x.de && x.ar).slice(0, 5);
        if (ex.length) out.examples = ex;
        return out;
    }).filter(Boolean).slice(0, 4);
    const lines = (Array.isArray(raw?.dialogue?.lines) ? raw.dialogue.lines : []).map(l => ({ who: String(l?.who || 'A').toUpperCase() === 'B' ? 'B' : 'A', de: clip(l?.de, 160), ar: clip(l?.ar, 180) })).filter(l => l.de && l.ar).slice(0, 14);
    if (!sections.length || lines.length < 6) return null;
    return {
        grammar: { titleAr: clip(gr.titleAr, 120), titleDe: clip(gr.titleDe, 120), sections, tipsAr: (Array.isArray(gr.tipsAr) ? gr.tipsAr : []).map(x => clip(x, 220)).filter(Boolean).slice(0, 4) },
        dialogue: { titleAr: clip(raw.dialogue.titleAr, 100), lines }
    };
}

function sanitizePlan(raw, level) {
    const def = LEVELS[level];
    const src = Array.isArray(raw?.units) ? raw.units : [];
    const validIds = new Set(def.grammar.map(g => g.id));
    const byId = Object.fromEntries(def.grammar.map(g => [g.id, g]));
    let units = src.map((u, i) => {
        const titleDe = clip(u?.titleDe, 70), titleAr = clip(u?.titleAr, 80);
        if (!titleDe || !titleAr) return null;
        const track = TRACKS[u.track] ? u.track : 'life';
        const gids = uniq((Array.isArray(u.grammarIds) ? u.grammarIds : []).filter(id => validIds.has(id)));
        const extra = (Array.isArray(u.extraGrammar) ? u.extraGrammar : []).map(x => ({ de: clip(x?.de, 90), ar: clip(x?.ar, 120) })).filter(x => x.de && x.ar).slice(0, 2);
        const art = uniq((Array.isArray(u.art) ? u.art : [u.art]).filter(a => ART_KEYS.includes(a))).slice(0, 3);
        return {
            track, titleDe, titleAr, themeDe: clip(u.themeDe, 90), descAr: clip(u.descAr, 260),
            emoji: isStr(u.emoji) && u.emoji.trim().length <= 8 ? u.emoji.trim() : '📘',
            art: art.length ? art : DEFAULT_ART[track], grammarIds: gids, extraGrammar: extra
        };
    }).filter(Boolean).slice(0, 16);
    if (units.length < 8) return null;
    // تأكيد تغطية كل قواعد المرجع: أي قاعدة مش موزّعة تتضاف للوحدة الأخف حملًا
    const covered = new Set(units.flatMap(u => u.grammarIds));
    for (const gm of def.grammar) {
        if (covered.has(gm.id)) continue;
        const target = units.reduce((best, u) => (u.grammarIds.length < best.grammarIds.length ? u : best), units[0]);
        target.grammarIds.push(gm.id); covered.add(gm.id);
    }
    const lv = level.toLowerCase();
    units = units.map((u, i) => ({
        id: `${lv}-u${i + 1}`, index: i + 1, ...u,
        grammar: [...u.grammarIds.map(id => ({ id, de: byId[id].de, ar: byId[id].ar, extra: false })), ...u.extraGrammar.map(x => ({ de: x.de, ar: x.ar, extra: true }))]
    }));
    if (units.filter(u => u.track === 'nurse').length < 2) return null;
    return { level, titleAr: def.titleAr, goalAr: def.goalAr, units };
}

/* ============================ Prompts ============================ */
const SYS_BASE = `You are a senior CEFR-certified German (DaF) curriculum designer and a native-level German author.
Your learners are Arabic-speaking (Egyptian) nursing students who want to use German in everyday life AND in German-speaking hospitals.
Rules that always apply:
- Output ONLY one valid JSON object. No markdown, no comments, no text outside the JSON.
- German must be 100% correct, natural, and strictly appropriate to the requested CEFR level (you may reuse structures from lower levels, never use structures from higher levels).
- Never invent German words. Nouns always appear with their article (der/die/das) in vocabulary lists.
- Arabic must be accurate, clear Modern Standard Arabic with simple wording (explanations may sound friendly). Every German sentence you write must have a correct Arabic translation where a translation field exists.
- Nursing/hospital content must be realistic (real wards, real phrases used with patients, doctors and colleagues) and polite (use "Sie" with patients).`;

const EX_SCHEMA = `Exercise object types (field "t"). ALL text is plain strings. Indices are 0-based integers. Every exercise MUST have "expl": a 1-2 sentence Arabic explanation of why the answer is right.
1. mcq   {"t":"mcq","p":"<Arabic instruction>","q":"<question text>","qLang":"de|ar","opts":[3-4 unique strings],"a":<index of correct option>,"expl":"..."}
2. fill  {"t":"fill","p":"اختر الكلمة الصحيحة","s":"Ich ___ Krankenschwester.","sAr":"<Arabic translation of the full sentence>","opts":["bin","bist","ist"],"a":0,"expl":"..."}   (s contains exactly one ___)
3. build {"t":"build","p":"ترجم إلى الألمانية","q":"<Arabic sentence>","a":"<correct German sentence>","extra":[0-3 wrong distractor words],"alts":[other correct German sentences if any],"expl":"..."}
4. order {"t":"order","p":"رتّب الكلمات","q":"<Arabic hint>","a":"<correct German sentence>","expl":"..."}
5. type  {"t":"type","p":"اكتب بالألمانية","q":"<Arabic or German prompt>","a":"<answer>","alts":[accepted variants],"expl":"..."}
6. tf    {"t":"tf","p":"صح أم خطأ؟","q":"<German statement>","qAr":"<Arabic translation>","a":true|false,"expl":"..."}
7. err   {"t":"err","p":"اضغط على الكلمة الخطأ","s":"<German sentence with exactly one wrong word>","w":<index of the wrong word when split by spaces>,"fix":"<the corrected word>","expl":"..."}
8. conj  {"t":"conj","p":"أكمل التصريف","v":"<infinitive>","rows":[["ich","..."],["du","..."],["er/sie/es","..."],["wir","..."],["ihr","..."],["sie/Sie","..."]],"hide":[indices of forms the student must type, at least 2],"expl":"..."}
9. sort  {"t":"sort","p":"صنّف الكلمات","buckets":["der","die","das"],"items":[["Tisch",0],["Lampe",1],["Bett",2],["Arzt",0]],"expl":"..."}   (2-3 buckets, 4-8 items, each item = [word, bucketIndex])
10. dlg  {"t":"dlg","p":"اختر الرد المناسب","lines":[["A","Guten Morgen, Herr Schmidt."],["B","..."]],"opts":[3-4 German replies],"a":<index>,"expl":"..."}
11. read {"t":"read","passage":{"title":"...","de":"<German text 40-90 words>","ar":"<Arabic translation>"},"qs":[2-3 items of type mcq or tf about the passage]}
12. match {"t":"match","p":"طابق الكلمات","pairs":[["der Arzt","الطبيب"],... 4-6 unique pairs],"expl":"..."}
13. listen{"t":"listen","p":"اسمع واختر ما سمعت","text":"<German phrase spoken aloud>","opts":[3-4 similar-sounding German phrases],"a":<index of the spoken one>,"expl":"..."}
14. dict  {"t":"dict","p":"اسمع واكتب","text":"<German sentence, max 12 words>","ar":"<Arabic translation>","expl":"..."}
15. speak {"t":"speak","p":"انطق الجملة","text":"<German sentence, max 10 words>","ar":"<Arabic translation>"}`;

function levelRefBlock(def) {
    return def.grammar.map(g => `- ${g.id}: ${g.de} | ${g.ar}${g.note ? ' | ' + g.note : ''}`).join('\n');
}

function planPrompt(level) {
    const def = LEVELS[level];
    return {
        system: SYS_BASE,
        user: `TASK: Design the complete, professional learning plan for CEFR level ${level} (${def.titleAr}) of a German course for Egyptian nursing students.
Level goal (Arabic): ${def.goalAr}

REFERENCE GRAMMAR SYLLABUS for ${level} (official-list based). EVERY id below must be assigned to at least one unit (put ids in "grammarIds"). A unit should carry 1-3 syllabus ids that belong together pedagogically. Order units from easiest to hardest; introduce prerequisites first (e.g. sein/haben and verb conjugation before modal verbs; Perfekt before Nebensätze):
${levelRefBlock(def)}

You MAY add extra grammar points you believe are important for ${level} and that are NOT in the list (put them in "extraGrammar" as {"de":"...","ar":"..."}, at most 2 per unit). Do not remove or skip listed ids.

THEME SUGGESTIONS (choose, adapt or replace — but keep all three tracks):
- track "talk" (general conversation): ${def.talkThemes.join('; ')}
- track "life" (daily life, all areas of life): ${def.dailyThemes.join('; ')}
- track "nurse" (nursing & hospital German): ${def.nurseThemes.join('; ')}

PLAN RULES:
- Exactly ${def.unitCount} units. Balance: at least 3 "nurse" units, at least 2 "talk" units, the rest "life". Interleave tracks (do not put all nurse units at the end).
- Every unit needs a concrete, useful communicative goal (not just a grammar topic). Nursing units must teach real hospital situations at this level.
- Available "art" keys (choose 1-3 that fit the unit): ${ART_KEYS.join(', ')}.
- "emoji" = one emoji that represents the unit.
- "titleAr" and "descAr" (1-2 sentences) are in Arabic; "titleDe" and "themeDe" in German.

OUTPUT JSON SHAPE:
{"units":[{"titleDe":"...","titleAr":"...","themeDe":"...","track":"talk|life|nurse","emoji":"👋","descAr":"...","art":["owl","student"],"grammarIds":["${def.grammar[0].id}"],"extraGrammar":[{"de":"...","ar":"..."}]}]}`,
        maxTokens: 4200
    };
}

function unitInfoBlock(level, plan, unit) {
    const grammar = unit.grammar.map(g => `- ${g.id || 'extra'}: ${g.de} | ${g.ar}`).join('\n');
    return `CEFR level: ${level}
Unit ${unit.index} of ${plan.units.length}
Track: ${unit.track} (${TRACKS[unit.track].ar})
Title: ${unit.titleDe} — ${unit.titleAr}
Theme: ${unit.themeDe || unit.titleDe}
Goal: ${unit.descAr}
Grammar focus of this unit:
${grammar || '- (none)'}`;
}

function vocabPrompt(level, plan, unit) {
    return {
        system: SYS_BASE,
        user: `${unitInfoBlock(level, plan, unit)}

TASK: Create the vocabulary set for this unit: exactly 10 items that a ${level} learner really needs for this unit's theme${unit.track === 'nurse' ? ' (realistic hospital/nursing words and short phrases used with patients and colleagues)' : ''}. Mix nouns, verbs and useful short phrases. Prefer high-frequency words. For nouns use "der/die/das + word". Provide the plural in "pl" for nouns (e.g. "die Ärzte"). "emoji" = a single fitting emoji when one exists (omit the field otherwise). Each item needs one short natural example sentence "ex" at ${level} level (using the word) and its Arabic translation "exAr".
JSON: {"vocab":[{"de":"der Arzt","pl":"die Ärzte","ar":"الطبيب","emoji":"👨‍⚕️","ex":"Der Arzt kommt gleich.","exAr":"الطبيب سيأتي حالًا."}]}`,
        maxTokens: 3200
    };
}

function lessonPrompt(level, plan, unit, vocab) {
    return {
        system: SYS_BASE,
        user: `${unitInfoBlock(level, plan, unit)}
Unit vocabulary: ${vocab.map(v => v.de).join(', ')}

TASK A — GRAMMAR EXPLANATION (in Arabic, for Arabic speakers): explain each grammar point of this unit in 1-3 sections ("sections"), clearly and practically, like the best learning sites (rule → form table → examples → common mistakes). Compare with Arabic when it helps. Use tables for conjugation/declension/word order when useful ("table": {"head":[...],"rows":[[...]]}, max 6 columns, max 10 rows). Give 2-4 German examples per section with Arabic translation. Add 2-3 short "tipsAr".
TASK B — DIALOGUE: a natural dialogue of 8-10 lines between speakers A and B in a realistic situation for this unit (${unit.track === 'nurse' ? 'in a hospital/ward: e.g. nurse–patient, nurse–doctor or nurse–colleague, polite Sie-form where appropriate' : 'everyday situation'}), using the unit vocabulary and the target grammar. Each line has German "de" and Arabic "ar".
JSON: {"grammar":{"titleAr":"...","titleDe":"...","sections":[{"headingAr":"...","textAr":"...","table":{"head":["..."],"rows":[["..."]]},"examples":[{"de":"...","ar":"..."}]}],"tipsAr":["..."]},"dialogue":{"titleAr":"...","lines":[{"who":"A","de":"...","ar":"..."},{"who":"B","de":"...","ar":"..."}]}}`,
        maxTokens: 4200
    };
}

function grammarExPrompt(level, plan, unit, vocab) {
    return {
        system: SYS_BASE,
        user: `${unitInfoBlock(level, plan, unit)}
Unit vocabulary: ${vocab.map(v => v.de).join(', ')}

TASK: Create exactly 12 GRAMMAR practice exercises that drill the unit's grammar focus using the unit vocabulary and realistic ${unit.track === 'nurse' ? 'hospital' : 'everyday'} situations. Use at least 6 different types from: fill, build, order, err, conj (only if the grammar involves verb forms), sort (only if it fits, e.g. articles/cases), mcq, type. Go from easy to harder. Never repeat the same sentence. Every German sentence must be correct and natural. For "fill" make exactly one option correct. For "build" the answer must be a single natural sentence of 3-9 words.
${EX_SCHEMA}
JSON: {"exercises":[ ... 12 exercise objects ... ]}`,
        maxTokens: 6500
    };
}

function reviewExPrompt(level, plan, unit, vocab) {
    return {
        system: SYS_BASE,
        user: `${unitInfoBlock(level, plan, unit)}
Unit vocabulary: ${vocab.map(v => `${v.de} = ${v.ar}`).join('; ')}

TASK: Create exactly 10 REVIEW / SKILL exercises for the end-of-unit test: reading, listening, dialogue and vocabulary. Include: 1 "read" (passage of 40-90 words at ${level} level about this unit's theme, with 3 questions of type mcq/tf), 2 "dlg", 1 "listen", 1 "dict", 1 "speak", 1 "match" (5 pairs from the unit vocabulary), and 3 more from mcq / tf / type about the vocabulary or passage-independent facts. German must be correct and natural.
${EX_SCHEMA}
JSON: {"exercises":[ ... 10 exercise objects ... ]}`,
        maxTokens: 6500
    };
}

/* ============================ Store (Mongo) ============================ */
function createMongoStore(connectToDatabase) {
    const mongoose = require('mongoose');
    const schema = new mongoose.Schema({
        key: { type: String, required: true, unique: true, index: true },
        data: { type: mongoose.Schema.Types.Mixed },
        model: { type: String, default: '' }
    }, { timestamps: true, minimize: false });
    const Doc = mongoose.models.GermanCurriculumDoc || mongoose.model('GermanCurriculumDoc', schema);
    return {
        async get(key) { await connectToDatabase(); const d = await Doc.findOne({ key }).lean(); return d ? { data: d.data, model: d.model, at: d.updatedAt } : null; },
        async set(key, data, model = '') { await connectToDatabase(); await Doc.findOneAndUpdate({ key }, { data, model }, { upsert: true, new: true, setDefaultsOnInsert: true }); },
        async delPrefix(prefix) { await connectToDatabase(); const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const r = await Doc.deleteMany({ key: new RegExp('^' + esc) }); return r.deletedCount || 0; },
        async list(prefix, limit = 100) { await connectToDatabase(); const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const rows = await Doc.find({ key: new RegExp('^' + esc) }).sort({ createdAt: -1 }).limit(limit).lean(); return rows.map(r => ({ key: r.key, data: r.data, at: r.createdAt })); }
    };
}

/* ============================ Routes ============================ */
function registerGermanCurriculum(app, deps) {
    const { verifyToken, isAdmin, connectToDatabase, Student, callAIJSONWithFailover } = deps;
    const store = deps.store || createMongoStore(connectToDatabase);
    const inflight = new Map();
    const once = (key, fn) => {
        if (inflight.has(key)) return inflight.get(key);
        const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    };
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('AI timeout'), { code: 'ai_timeout' })), ms))]);

    async function requireGermanAccess(req, res, next) {
        try {
            if (req.user?.type === 'admin') return next();
            if (req.user?.type !== 'student') return res.status(403).json({ error: 'غير مصرح' });
            await connectToDatabase();
            const st = await Student.findOne({ username: req.user.username }).select('premiumFeatures');
            if (st && (st.premiumFeatures || []).includes('premium_german_pro')) return next();
            res.status(403).json({ error: 'الميزة دي متاحة بس لطلاب German Pro' });
        } catch (e) { res.status(500).json({ error: 'خطأ في التحقق من الصلاحية' }); }
    }
    const levelOf = (req, res) => {
        const L = String(req.params.level || '').toUpperCase();
        if (!LEVELS[L]) { res.status(400).json({ error: 'مستوى غير معروف' }); return null; }
        return L;
    };

    // بيستدعي الموديل + Validator، وبيعيد المحاولة مرة لو الناتج ناقص/غلط
    async function generatePart(label, prompt, sanitize, attempts = 2) {
        let lastErr;
        for (let i = 0; i < attempts; i++) {
            try {
                const out = await withTimeout(callAIJSONWithFailover(prompt.system, prompt.user, prompt.maxTokens), 58000);
                const clean = sanitize(out.result);
                if (clean) return { data: clean, model: out.usedModel };
                lastErr = new Error(`${label}: الناتج غير مكتمل بعد الفحص`);
                console.error(`⚠️ German curriculum ${label}: validation failed (attempt ${i + 1})`);
            } catch (e) { lastErr = e; console.error(`⚠️ German curriculum ${label}: ${e.message}`); }
        }
        throw lastErr || new Error(`${label} failed`);
    }

    async function getPlan(L) {
        const cached = await store.get(`${L}:plan`);
        if (cached) return cached.data;
        return once(`plan:${L}`, async () => {
            const again = await store.get(`${L}:plan`); if (again) return again.data;
            const { data, model } = await generatePart(`plan ${L}`, planPrompt(L), raw => sanitizePlan(raw, L));
            await store.set(`${L}:plan`, data, model);
            return data;
        });
    }

    app.get('/api/german-pro/curriculum/levels', verifyToken, requireGermanAccess, async (req, res) => {
        try {
            const out = [];
            for (const id of LEVEL_IDS) {
                const d = LEVELS[id]; const p = await store.get(`${id}:plan`);
                out.push({ id, titleAr: d.titleAr, goalAr: d.goalAr, sourceAr: d.sourceAr, grammarCount: d.grammar.length, unitCount: d.unitCount, planReady: !!p });
            }
            res.json({ levels: out });
        } catch (e) { res.status(500).json({ error: 'تعذر جلب المستويات' }); }
    });

    app.get('/api/german-pro/curriculum/:level/syllabus', verifyToken, requireGermanAccess, (req, res) => {
        const L = levelOf(req, res); if (!L) return;
        const d = LEVELS[L];
        res.json({ level: { id: L, titleAr: d.titleAr, goalAr: d.goalAr, sourceAr: d.sourceAr, unitCount: d.unitCount }, grammar: d.grammar, themes: { talk: d.talkThemes, life: d.dailyThemes, nurse: d.nurseThemes } });
    });

    app.get('/api/german-pro/curriculum/:level/plan', verifyToken, requireGermanAccess, async (req, res) => {
        const L = levelOf(req, res); if (!L) return;
        try { res.json({ plan: await getPlan(L) }); }
        catch (e) { console.error('❌ plan', L, e.message); res.status(503).json({ error: 'المعلم لسه بيجهّز الخطة — جرّب تاني بعد لحظات', code: e.code || 'plan_failed' }); }
    });

    app.post('/api/german-pro/curriculum/:level/plan/regenerate', verifyToken, isAdmin, async (req, res) => {
        const L = levelOf(req, res); if (!L) return;
        if (req.body?.confirm !== true) return res.status(400).json({ error: 'أرسل confirm:true — ده هيمسح خطة المستوى ودروسه كلها' });
        try { const n = await store.delPrefix(`${L}:`); res.json({ ok: true, deleted: n }); }
        catch (e) { res.status(500).json({ error: 'تعذر المسح' }); }
    });

    const PARTS = ['vocab', 'lesson', 'gx', 'rx'];
    async function loadParts(L, n) {
        const rows = await Promise.all(PARTS.map(p => store.get(`${L}:u${n}:${p}`)));
        return Object.fromEntries(PARTS.map((p, i) => [p, rows[i]]));
    }
    const assemble = (plan, unit, parts) => ({
        id: unit.id, index: unit.index, level: plan.level, track: unit.track, titleDe: unit.titleDe, titleAr: unit.titleAr, emoji: unit.emoji, art: unit.art, descAr: unit.descAr, grammar: unit.grammar,
        vocab: parts.vocab.data, lesson: parts.lesson.data, gx: parts.gx.data, rx: parts.rx.data,
        meta: { models: PARTS.map(p => parts[p].model).filter(Boolean) }
    });

    app.get('/api/german-pro/curriculum/:level/unit/:n', verifyToken, requireGermanAccess, async (req, res) => {
        const L = levelOf(req, res); if (!L) return;
        const n = parseInt(req.params.n, 10);
        try {
            const planDoc = await store.get(`${L}:plan`);
            if (!planDoc) return res.status(409).json({ error: 'الخطة لسه متجهزتش', code: 'plan_missing' });
            const plan = planDoc.data;
            const unit = plan.units.find(u => u.index === n);
            if (!unit) return res.status(404).json({ error: 'الوحدة مش موجودة' });

            let parts = await loadParts(L, n);
            if (!parts.vocab) { // المرحلة 1: الكلمات (الباقي بيعتمد عليها)
                await once(`vocab:${L}:${n}`, async () => {
                    if (await store.get(`${L}:u${n}:vocab`)) return;
                    const r = await generatePart(`vocab ${L}/${n}`, vocabPrompt(L, plan, unit), sanitizeVocab);
                    await store.set(`${L}:u${n}:vocab`, r.data, r.model);
                });
                parts = await loadParts(L, n);
            }
            if (parts.vocab) { // المرحلة 2: القواعد + الحوار + التمارين بالتوازي — كل جزء بيتخزّن أول ما يخلص
                const vocab = parts.vocab.data;
                const jobs = [];
                const job = (name, prompt, sanitize) => once(`${name}:${L}:${n}`, async () => {
                    if (await store.get(`${L}:u${n}:${name}`)) return;
                    const r = await generatePart(`${name} ${L}/${n}`, prompt, sanitize);
                    await store.set(`${L}:u${n}:${name}`, r.data, r.model);
                }).catch(() => null);
                if (!parts.lesson) jobs.push(job('lesson', lessonPrompt(L, plan, unit, vocab), sanitizeLesson));
                if (!parts.gx) jobs.push(job('gx', grammarExPrompt(L, plan, unit, vocab), raw => sanitizeExercises(raw, 8)));
                if (!parts.rx) jobs.push(job('rx', reviewExPrompt(L, plan, unit, vocab), raw => sanitizeExercises(raw, 6)));
                if (jobs.length) { await Promise.all(jobs); parts = await loadParts(L, n); }
            }
            const pending = PARTS.filter(p => !parts[p]);
            if (pending.length) return res.json({ ready: false, pending, retryAfterMs: 1500 });
            res.json({ ready: true, unit: assemble(plan, unit, parts) });
        } catch (e) {
            console.error('❌ unit', L, n, e.message);
            res.status(503).json({ error: 'المعلم لسه بيجهّز الوحدة — جرّب تاني بعد لحظات', code: e.code || 'unit_failed' });
        }
    });

    app.post('/api/german-pro/curriculum/:level/unit/:n/regenerate', verifyToken, isAdmin, async (req, res) => {
        const L = levelOf(req, res); if (!L) return;
        const n = parseInt(req.params.n, 10);
        try { const c = await store.delPrefix(`${L}:u${n}:`); res.json({ ok: true, deleted: c }); }
        catch (e) { res.status(500).json({ error: 'تعذر المسح' }); }
    });

    // بلاغ الطالب عن خطأ في تمرين/شرح (بيوصل للأدمن عشان يعيد توليد الوحدة)
    app.post('/api/german-pro/curriculum/report', verifyToken, requireGermanAccess, async (req, res) => {
        try {
            const b = req.body || {};
            const L = String(b.level || '').toUpperCase();
            if (!LEVELS[L]) return res.status(400).json({ error: 'مستوى غير معروف' });
            const rec = { level: L, unit: parseInt(b.unit, 10) || 0, part: clip(b.part, 20), snapshot: clip(JSON.stringify(b.snapshot || {}), 1500), note: clip(b.note, 300), by: req.user.username || '', at: new Date().toISOString() };
            await store.set(`report:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, rec);
            res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: 'تعذر إرسال البلاغ' }); }
    });
    app.get('/api/german-pro/curriculum/reports', verifyToken, isAdmin, async (req, res) => {
        try { res.json({ reports: (await store.list('report:', 100)).map(r => r.data) }); }
        catch (e) { res.status(500).json({ error: 'تعذر جلب البلاغات' }); }
    });
}

module.exports = registerGermanCurriculum;
module.exports._test = { sanitizeExercise, sanitizeExercises, sanitizeVocab, sanitizeLesson, sanitizePlan, planPrompt, vocabPrompt, lessonPrompt, grammarExPrompt, reviewExPrompt, ART_KEYS };
