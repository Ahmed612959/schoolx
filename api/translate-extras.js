'use strict';
/**
 * ترجمان — مميزات إضافية (ملف منفصل بيتحمّل من translate-routes.js):
 *  1) الإحصائيات والستريك والنقاط والشارات  2) لوحة التقدم  3) مجموعات المذاكرة
 *  4) الخريطة الذهنية  5) اسأل كتابك كله  6) صحّح ترجمتي  7) تذكير يومي (Push + كرون)
 * كل الـ endpoints تحت /api/translate/... ومحمية بـ verifyToken (ما عدا الكرون: محمي بـ CRON_SECRET).
 */
const TZ = 'Africa/Cairo';
const dayStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
const hourCairo = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const DAILY_GOAL = 30;

// المستوى: 100 نقطة للأول، وكل مستوى بعده أصعب 25%
function levelOf(xp) {
    let level = 1, need = 100, left = Math.max(0, xp | 0);
    while (left >= need) { left -= need; level++; need = Math.round(need * 1.25); }
    return { level, into: left, need };
}

const BADGES = [
    { id: 'first_page', e: '🌱', n: 'أول خطوة', d: 'ترجمت أول صفحة', t: (s) => (s.c.pages || 0) >= 1 },
    { id: 'pages_10', e: '📚', n: 'قارئ نهم', d: 'ترجمت 10 صفحات', t: (s) => (s.c.pages || 0) >= 10 },
    { id: 'pages_50', e: '🏛️', n: 'مكتبة متنقلة', d: 'ترجمت 50 صفحة', t: (s) => (s.c.pages || 0) >= 50 },
    { id: 'streak_3', e: '🔥', n: 'ولّعت', d: '3 أيام مذاكرة ورا بعض', t: (s) => s.best >= 3 },
    { id: 'streak_7', e: '⚡', n: 'أسبوع كامل', d: '7 أيام ورا بعض', t: (s) => s.best >= 7 },
    { id: 'streak_30', e: '👑', n: 'شهر من الإصرار', d: '30 يوم ورا بعض', t: (s) => s.best >= 30 },
    { id: 'quiz_20', e: '🎯', n: 'بطل الأسئلة', d: '20 إجابة صح', t: (s) => (s.c.mcqRight || 0) >= 20 },
    { id: 'quiz_100', e: '🧠', n: 'عقل طبي', d: '100 إجابة صح', t: (s) => (s.c.mcqRight || 0) >= 100 },
    { id: 'fix_5', e: '✍️', n: 'مترجم صاعد', d: 'صحّحت 5 ترجمات بنفسك', t: (s) => (s.c.fixes || 0) >= 5 },
    { id: 'fix_90', e: '💎', n: 'ترجمة ذهبية', d: 'جبت 90 أو أكتر في ترجمتك', t: (s) => (s.c.bestScore || 0) >= 90 },
    { id: 'map_3', e: '🗺️', n: 'رسّام الخرائط', d: '3 خرائط ذهنية', t: (s) => (s.c.maps || 0) >= 3 },
    { id: 'ask_10', e: '🔍', n: 'فضولي', d: '10 أسئلة لكتابك', t: (s) => (s.c.asks || 0) >= 10 },
    { id: 'team', e: '🤝', n: 'روح الفريق', d: 'دخلت مجموعة مذاكرة', t: (s) => (s.c.groups || 0) >= 1 },
    { id: 'lvl_5', e: '🏅', n: 'المستوى 5', d: 'وصلت المستوى 5', t: (s) => levelOf(s.xp).level >= 5 }
];
const pubBadge = (b) => ({ id: b.id, e: b.e, n: b.n, d: b.d });

// ---------- بحث بسيط في صفحات الطالب (للسؤال عن الكتاب كله) ----------
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'why', 'are', 'is', 'of', 'in', 'to', 'a', 'an', 'يعني', 'ايه', 'إيه', 'هو', 'هي', 'في', 'من', 'على', 'عن', 'ده', 'دي', 'ليه', 'لية', 'اشرح', 'اشرحلي', 'قولي']);
function tokens(s) {
    const out = [];
    String(s || '').toLowerCase().replace(/[\u064B-\u0652]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[a-z]{3,}|[\u0600-\u06FF]{2,}/g, (w) => {
            if (/^[a-z]/.test(w)) { if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); } else { w = w.replace(/^(وال|بال|كال|فال|لل)/, 'ال'); if (w.length > 3 && w.startsWith('ال')) w = w.slice(2); }
            if (!STOP.has(w)) out.push(w);
            return '';
        });
    return out;
}
function buildChunks(docs) {
    const chunks = [];
    docs.forEach((d) => {
        let page = 1;
        (Array.isArray(d.items) ? d.items : []).forEach((it) => {
            if (!it) return;
            if (it.t === 'page') { page = it.n || page; return; }
            let text = '';
            if (it.t === 'b') text = [it.en, it.ar].filter(Boolean).join('\n');
            else if (it.t === 'tbl') text = [it.en, it.ar].map((g) => (Array.isArray(g) ? g.map((r) => (Array.isArray(r) ? r.join(' | ') : '')).join('\n') : '')).join('\n');
            else if (it.t === 'term') text = [it.en, it.ar, it.def].filter(Boolean).join(' = ');
            text = text.trim(); if (text.length < 8) return;
            chunks.push({ id: String(d._id), title: d.title || 'صفحة', page, text: text.slice(0, 1800), tk: new Set(tokens(text)) });
        });
    });
    return chunks;
}
function retrieve(question, chunks, maxChars) {
    const q = Array.from(new Set(tokens(question)));
    if (!q.length) return [];
    const df = {}; q.forEach((w) => { df[w] = 0; });
    chunks.forEach((c) => q.forEach((w) => { if (c.tk.has(w)) df[w]++; }));
    const N = chunks.length || 1;
    const scored = chunks.map((c) => { let s = 0; q.forEach((w) => { if (c.tk.has(w)) s += Math.log(1 + N / (1 + df[w])); }); return { c, s }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const out = []; let used = 0;
    for (const x of scored) { if (used + x.c.text.length > maxChars) continue; out.push(x.c); used += x.c.text.length; if (out.length >= 24) break; }
    return out;
}

const MINDMAP_SYSTEM = `You build concise MIND MAPS for Egyptian nursing students from textbook content (English text with Arabic translation). Use ONLY the provided content; never invent facts.
Return JSON only: {"title":"short Arabic title","branches":[{"t":"branch label","kids":["leaf","leaf"]}]}
Rules: 4 to 7 branches, each with 2 to 5 kids. Labels are short (max 6 words), in simple Arabic with the key English medical term in parentheses when useful. Leaves are key facts, causes, signs, nursing actions, or numbers. No sentences, no markdown.`;
const CORRECT_SYSTEM = `You are a kind but precise Arabic medical-translation teacher for Egyptian nursing students. The student translated an English textbook passage into Arabic. Compare their translation with the English and judge accuracy of meaning, medical terminology, completeness and natural Arabic.
Return JSON only: {"score":0-100,"verdict":"one short encouraging Egyptian-Arabic sentence","good":["what is right (max 3)"],"fixes":[{"wrong":"student's phrase","right":"better Arabic","why":"short reason in simple Arabic"}],"better":"a polished Arabic translation of the whole passage","terms":[{"en":"term","ar":"standard Arabic medical equivalent"}]}
Be fair: reward correct meaning even when wording differs. Max 5 fixes, max 6 terms. Write explanations in simple Egyptian-flavoured Arabic.`;
const ASK_SYSTEM = `You are a sharp, friendly nursing tutor answering an Egyptian nursing student's question using ONLY the student's own saved textbook excerpts below (English text with Arabic translation, each tagged like [#3 Title p.2]).
Answer in simple Egyptian Arabic, keep medical terms in English in parentheses, and mention which chapter/page title the information came from. If the excerpts do not contain the answer, say so honestly and do not invent. Use short paragraphs or simple lists. No markdown headers.`;

module.exports = function registerExtras(app, ctx) {
    const { mongoose, Student, verifyToken, apiLimiter, connectToDatabase, ai, reserveAction, refundAction, actionDenied, str, cleanChat, aiErr, aiStatus, TrHistory, sendPushToUser } = ctx;
    const { Schema } = mongoose;
    const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

    const TrStats = model('TrStats', new Schema({
        username: { type: String, required: true, unique: true },
        xp: { type: Number, default: 0 }, streak: { type: Number, default: 0 }, best: { type: Number, default: 0 }, lastDay: { type: String, default: '' },
        c: { type: Schema.Types.Mixed, default: {} }, badges: { type: [String], default: [] },
        daily: { type: Schema.Types.Mixed, default: {} }, cap: { type: Schema.Types.Mixed, default: {} },
        reminder: { type: Schema.Types.Mixed, default: { on: false, hour: 18 } }, lastPush: { type: String, default: '' }
    }, { timestamps: true }));
    const TrGroup = model('TrGroup', new Schema({
        name: { type: String, required: true }, code: { type: String, required: true, unique: true }, owner: { type: String, required: true, index: true },
        members: { type: [String], default: [], index: true },
        shared: { type: Schema.Types.Mixed, default: [] }, msgs: { type: Schema.Types.Mixed, default: [] }
    }, { timestamps: true }));

    const blank = (username) => ({ username, xp: 0, streak: 0, best: 0, lastDay: '', c: {}, badges: [], daily: {}, cap: {}, reminder: { on: false, hour: 18 }, lastPush: '' });

    // يضيف نقاط/عدّادات ويحدّث الستريك والشارات (كتابة واحدة)
    async function award(username, o) {
        o = o || {};
        const day = dayStr();
        const s = Object.assign(blank(username), (await TrStats.findOne({ username }).lean()) || {});
        s.c = Object.assign({}, s.c); s.daily = Object.assign({}, s.daily); s.badges = (s.badges || []).slice();
        if (s.lastDay !== day) { s.streak = s.lastDay === addDays(day, -1) ? (s.streak || 0) + 1 : 1; s.best = Math.max(s.best || 0, s.streak); s.lastDay = day; }
        const gained = Math.max(0, Math.round(o.xp || 0));
        s.xp = (s.xp || 0) + gained;
        Object.keys(o.inc || {}).forEach((k) => { s.c[k] = (s.c[k] || 0) + o.inc[k]; });
        Object.keys(o.max || {}).forEach((k) => { s.c[k] = Math.max(s.c[k] || 0, o.max[k]); });
        const d = Object.assign({ xp: 0 }, s.daily[day]); d.xp += gained; s.daily[day] = d;
        Object.keys(s.daily).sort().slice(0, -35).forEach((k) => { delete s.daily[k]; }); // آخر 35 يوم بس
        const fresh = BADGES.filter((b) => !s.badges.includes(b.id) && b.t(s));
        fresh.forEach((b) => s.badges.push(b.id));
        await TrStats.updateOne({ username }, { $set: { xp: s.xp, streak: s.streak, best: s.best, lastDay: s.lastDay, c: s.c, badges: s.badges, daily: s.daily } }, { upsert: true });
        return { gained, xp: s.xp, streak: s.streak, newBadges: fresh.map(pubBadge), level: levelOf(s.xp).level };
    }
    const weekXp = (daily, day) => { let t = 0; for (let i = 0; i < 7; i++) t += (daily && daily[addDays(day, -i)] && daily[addDays(day, -i)].xp) || 0; return t; };

    function statsPayload(s0) {
        const s = Object.assign(blank(s0 && s0.username), s0 || {});
        const day = dayStr(), lv = levelOf(s.xp);
        const alive = s.lastDay === day || s.lastDay === addDays(day, -1); // الستريك لسه شغال؟
        const days = []; for (let i = 13; i >= 0; i--) { const k = addDays(day, -i); days.push({ day: k, xp: (s.daily[k] && s.daily[k].xp) || 0 }); }
        const mcqT = s.c.mcqTotal || 0;
        return {
            xp: s.xp, level: lv.level, into: lv.into, need: lv.need,
            streak: alive ? s.streak : 0, best: s.best, doneToday: s.lastDay === day, todayXp: (s.daily[day] && s.daily[day].xp) || 0, goal: DAILY_GOAL,
            week: weekXp(s.daily, day), days,
            counters: { pages: s.c.pages || 0, quizzes: s.c.quizzes || 0, mcqTotal: mcqT, mcqRight: s.c.mcqRight || 0, accuracy: mcqT ? Math.round(((s.c.mcqRight || 0) / mcqT) * 100) : null,
                fixes: s.c.fixes || 0, avgScore: s.c.fixes ? Math.round((s.c.scoreSum || 0) / s.c.fixes) : null, bestScore: s.c.bestScore || 0, maps: s.c.maps || 0, asks: s.c.asks || 0, reviews: s.c.reviews || 0 },
            badges: BADGES.map((b) => Object.assign(pubBadge(b), { got: (s.badges || []).includes(b.id) })),
            reminder: { on: !!(s.reminder && s.reminder.on), hour: Number.isInteger(s.reminder && s.reminder.hour) ? s.reminder.hour : 18 }
        };
    }
    const wrap = (name, fn) => async (req, res) => { try { await connectToDatabase(); await fn(req, res); } catch (e) { console.error(name + ':', e && e.message); if (!res.headersSent) res.status(500).json({ error: 'حصل خطأ في السيرفر، جرب تاني' }); } };

    // ====================== 1) الإحصائيات ======================
    app.get('/api/translate/stats', verifyToken, apiLimiter, wrap('stats', async (req, res) => {
        const s = await TrStats.findOne({ username: req.user.username }).lean();
        const out = statsPayload(s || { username: req.user.username });
        out.groups = await TrGroup.countDocuments({ members: req.user.username });
        res.json(out);
    }));

    // أحداث من الفرونت (صفحة اتترجمت / إجابات أسئلة / مراجعة كروت) بسقف يومي لكل نوع
    const CAPS = { page: 100, mcq: 120, review: 60 };
    app.post('/api/translate/stats/event', verifyToken, apiLimiter, wrap('stats-event', async (req, res) => {
        const b = req.body || {}, type = String(b.type || ''), username = req.user.username;
        if (!CAPS[type]) return res.status(400).json({ error: 'نوع غير معروف' });
        const day = dayStr();
        const cur = (await TrStats.findOne({ username }).lean()) || {};
        const cap = cur.cap && cur.cap.day === day ? Object.assign({}, cur.cap) : { day };
        let xp = 0; const inc = {};
        if (type === 'page') { const n = Math.min(20, Math.max(1, Number(b.n) || 1)); xp = n * 10; inc.pages = n; }
        else if (type === 'mcq') { const total = Math.min(40, Math.max(1, Number(b.total) || 1)), right = Math.min(total, Math.max(0, Number(b.right) || 0)); xp = right * 2 + 3; inc.mcqTotal = total; inc.mcqRight = right; inc.quizzes = 1; }
        else { const n = Math.min(30, Math.max(1, Number(b.n) || 1)); xp = n; inc.reviews = n; }
        const left = Math.max(0, CAPS[type] - (cap[type] || 0));
        xp = Math.min(xp, left); cap[type] = (cap[type] || 0) + xp;
        if (xp === 0) Object.keys(inc).forEach((k) => delete inc[k]); // السقف اليومي خلص: مفيش عدّادات كمان
        else if (type === 'page') inc.pages = Math.max(1, Math.round(xp / 10));
        await TrStats.updateOne({ username }, { $set: { cap } }, { upsert: true });
        res.json(await award(username, { xp, inc }));
    }));

    // ====================== 7) التذكير ======================
    app.put('/api/translate/reminder', verifyToken, apiLimiter, wrap('reminder', async (req, res) => {
        const on = !!(req.body && req.body.on), hour = Math.min(23, Math.max(0, parseInt(req.body && req.body.hour, 10) || 18));
        await TrStats.updateOne({ username: req.user.username }, { $set: { reminder: { on, hour } } }, { upsert: true });
        res.json({ success: true, reminder: { on, hour } });
    }));
    // بيتنادى من Vercel Cron: Authorization: Bearer CRON_SECRET  (أو ?key=CRON_SECRET). ?all=1 بيتجاهل الساعة (للخطة المجانية: كرون يومي واحد)
    app.get('/api/translate/cron/reminders', async (req, res) => {
        try {
            const secret = process.env.CRON_SECRET || '', auth = String(req.headers.authorization || '');
            if (!secret || !(auth === 'Bearer ' + secret || String(req.query.key || '') === secret)) return res.status(401).json({ error: 'غير مصرح' });
            if (!sendPushToUser) return res.json({ sent: 0, note: 'sendPushToUser مش متمرّر من index.js' });
            await connectToDatabase();
            const day = dayStr(), hr = hourCairo(), all = String(req.query.all || '') === '1';
            const users = await TrStats.find({ 'reminder.on': true, lastDay: { $ne: day }, lastPush: { $ne: day } }).select('username streak reminder lastDay').limit(3000).lean();
            const due = users.filter((u) => all || (u.reminder && u.reminder.hour === hr));
            const site = process.env.TR_SITE_URL || 'https://translation-sigma-six.vercel.app';
            let sent = 0;
            for (let i = 0; i < due.length; i += 20) {
                await Promise.all(due.slice(i, i + 20).map(async (u) => {
                    const alive = u.lastDay === addDays(day, -1) && u.streak > 0;
                    const body = alive ? `سلسلتك ${u.streak} ${u.streak > 10 ? 'يوم' : 'أيام'} 🔥 ذاكر صفحة النهاردة علشان ما تتقطعش` : 'ابدأ مذاكرة النهاردة، صفحة واحدة تكفي 📚';
                    let ok = false; try { ok = await sendPushToUser(u.username, { title: 'ترجمان 📚', body, link: site + '/#/translate' }); } catch (_) {}
                    if (ok) { sent++; await TrStats.updateOne({ username: u.username }, { $set: { lastPush: day } }); }
                }));
            }
            res.json({ ok: true, due: due.length, sent });
        } catch (e) { console.error('cron reminders:', e.message); res.status(500).json({ error: 'خطأ' }); }
    });

    // ====================== 4) الخريطة الذهنية ======================
    const cleanLabel = (v, n) => cleanChat(str(String(v || ''), n)).replace(/^[-•\d.\s]+/, '');
    app.post('/api/translate/mindmap', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 500) : [];
            const text = items.filter((i) => i && i.en).map((i) => str(i.en, 1500) + (i.ar ? '\n' + str(i.ar, 1500) : '')).join('\n\n').slice(0, 22000);
            if (text.length < 120) return res.status(400).json({ error: 'المحتوى قليل لعمل خريطة ذهنية' });
            await connectToDatabase();
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const r = await ai.generate('mindmap', { system: MINDMAP_SYSTEM, json: true, maxTokens: 4000, temperature: 0.3, contents: [{ role: 'user', parts: [{ text }] }] });
            const branches = (Array.isArray(r.branches) ? r.branches : []).map((b) => ({ t: cleanLabel(b && b.t, 70), kids: (Array.isArray(b && b.kids) ? b.kids : []).map((k) => cleanLabel(k, 90)).filter(Boolean).slice(0, 5) })).filter((b) => b.t).slice(0, 7);
            if (branches.length < 2) { await refundAction(req.user, day); return res.status(502).json({ error: 'مقدرتش أعمل الخريطة، جرب تاني' }); }
            const out = { title: cleanLabel(r.title, 80) || 'خريطة ذهنية', branches };
            const id = req.body.id;
            if (id && mongoose.isValidObjectId(id)) await TrHistory.updateOne({ _id: id, username: req.user.username }, { $set: { mindmap: out } });
            out.award = await award(req.user.username, { xp: 15, inc: { maps: 1 } });
            res.json(out);
        } catch (e) { await refundAction(req.user, day); console.error('mindmap:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== 5) اسأل كتابك كله ======================
    app.post('/api/translate/ask-all', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const question = str(req.body && req.body.question, 800);
            if (question.length < 3) return res.status(400).json({ error: 'اكتب سؤالك' });
            await connectToDatabase();
            const q = { username: req.user.username };
            if (req.body.folder) q.folder = str(String(req.body.folder), 60);
            const docs = await TrHistory.find(q).sort({ createdAt: -1 }).limit(150).select('title items').lean();
            if (!docs.length) return res.json({ answer: 'لسه مفيش صفحات محفوظة في سجلك. ترجم كام صفحة الأول وارجع اسألني عنها.', sources: [], empty: true });
            const picked = retrieve(question, buildChunks(docs), 15000);
            if (!picked.length) return res.json({ answer: 'مش لاقي في صفحاتك المحفوظة حاجة قريبة من سؤالك. جرب تكتب المصطلح الإنجليزي أو كلمة تانية من الموضوع.', sources: [], empty: true });
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const ctxText = picked.map((c, i) => `[#${i + 1} ${c.title} p.${c.page}]\n${c.text}`).join('\n\n');
            const hist = (Array.isArray(req.body.history) ? req.body.history : []).slice(-6).map((m) => ({ role: m && m.role === 'model' ? 'model' : 'user', parts: [{ text: str(m && m.text, 2000) || '.' }] }));
            while (hist.length && hist[0].role !== 'user') hist.shift();
            const contents = [{ role: 'user', parts: [{ text: `EXCERPTS:\n"""\n${ctxText}\n"""` }] }, { role: 'model', parts: [{ text: 'تمام، قريت مقتطفاتك. اسأل.' }] }].concat(hist, [{ role: 'user', parts: [{ text: question }] }]);
            const answer = cleanChat(await ai.generate('chat', { system: ASK_SYSTEM, contents, maxTokens: 6000, temperature: 0.3 })).slice(0, 8000);
            if (!answer) { await refundAction(req.user, day); return res.status(502).json({ error: 'الذكاء الاصطناعي مرجّعش رد، جرب تاني' }); }
            const seen = new Set(), sources = [];
            picked.forEach((c) => { if (!seen.has(c.id) && sources.length < 5) { seen.add(c.id); sources.push({ id: c.id, title: c.title }); } });
            const aw = await award(req.user.username, { xp: 5, inc: { asks: 1 } });
            res.json({ answer, sources, award: aw });
        } catch (e) { await refundAction(req.user, day); console.error('ask-all:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== 3) صحّح ترجمتي ======================
    app.post('/api/translate/correct', verifyToken, apiLimiter, async (req, res) => {
        let day = null;
        try {
            const en = str(req.body && req.body.en, 1800), mine = str(req.body && req.body.mine, 2500);
            if (en.length < 8) return res.status(400).json({ error: 'مفيش نص إنجليزي للمقارنة' });
            if (mine.length < 5) return res.status(400).json({ error: 'اكتب ترجمتك الأول' });
            await connectToDatabase();
            day = await reserveAction(req.user);
            if (!day) return actionDenied(res);
            const r = await ai.generate('correct', { system: CORRECT_SYSTEM, json: true, maxTokens: 4000, temperature: 0.2, contents: [{ role: 'user', parts: [{ text: `ENGLISH PASSAGE:\n${en}\n\nSTUDENT'S ARABIC TRANSLATION:\n${mine}` }] }] });
            const score = Math.max(0, Math.min(100, Math.round(Number(r.score)) || 0));
            const list = (v, n, m) => (Array.isArray(v) ? v.map((x) => cleanChat(str(String(x || ''), m))).filter(Boolean).slice(0, n) : []);
            const out = {
                score, verdict: cleanChat(str(r.verdict, 200)), good: list(r.good, 3, 220),
                fixes: (Array.isArray(r.fixes) ? r.fixes : []).map((f) => ({ wrong: str(f && f.wrong, 220), right: str(f && f.right, 220), why: cleanChat(str(f && f.why, 260)) })).filter((f) => f.wrong && f.right).slice(0, 5),
                better: cleanChat(str(r.better, 2500)),
                terms: (Array.isArray(r.terms) ? r.terms : []).map((t) => ({ en: str(t && t.en, 80), ar: str(t && t.ar, 120) })).filter((t) => t.en && t.ar).slice(0, 6)
            };
            if (!out.better && !out.fixes.length && !out.verdict) { await refundAction(req.user, day); return res.status(502).json({ error: 'مقدرتش أصحّح، جرب تاني' }); }
            out.award = await award(req.user.username, { xp: 2 + Math.round(score / 12), inc: { fixes: 1, scoreSum: score }, max: { bestScore: score } });
            res.json(out);
        } catch (e) { await refundAction(req.user, day); console.error('correct:', e.message); res.status(aiStatus(e)).json(aiErr(e)); }
    });

    // ====================== 6) مجموعات المذاكرة ======================
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const genCode = () => { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; };
    const MAX_MEMBERS = 40, MAX_MEMBER_OF = 8, MAX_OWNED = 3;
    const gid = (req) => (mongoose.isValidObjectId(req.params.id) ? req.params.id : null);
    const isMember = (g, u) => g && Array.isArray(g.members) && g.members.includes(u);
    async function namesOf(users) {
        const map = {};
        try { (await Student.find({ username: { $in: users } }).select('username fullName').lean()).forEach((s) => { map[s.username] = s.fullName || s.username; }); } catch (_) {}
        users.forEach((u) => { if (!map[u]) map[u] = u; });
        return map;
    }
    const gSummary = (g, u) => ({ id: String(g._id), name: g.name, code: g.code, members: (g.members || []).length, mine: g.owner === u, shared: (g.shared || []).length });

    app.post('/api/translate/groups', verifyToken, apiLimiter, wrap('group-create', async (req, res) => {
        const name = str(req.body && req.body.name, 40); if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم للمجموعة' });
        const u = req.user.username;
        if (await TrGroup.countDocuments({ owner: u }) >= MAX_OWNED) return res.status(400).json({ error: `تقدر تعمل ${MAX_OWNED} مجموعات بس` });
        if (await TrGroup.countDocuments({ members: u }) >= MAX_MEMBER_OF) return res.status(400).json({ error: 'وصلت للحد الأقصى من المجموعات' });
        let g = null;
        for (let i = 0; i < 6 && !g; i++) { try { g = await TrGroup.create({ name, code: genCode(), owner: u, members: [u], shared: [], msgs: [] }); } catch (e) { if (!(e && e.code === 11000)) throw e; } }
        if (!g) return res.status(500).json({ error: 'مقدرتش أعمل كود للمجموعة، جرب تاني' });
        await award(u, { xp: 5, inc: { groups: 1 } });
        res.json(gSummary(g, u));
    }));
    app.post('/api/translate/groups/join', verifyToken, apiLimiter, wrap('group-join', async (req, res) => {
        const code = str(req.body && req.body.code, 10).toUpperCase().replace(/[^A-Z0-9]/g, ''), u = req.user.username;
        const g = code ? await TrGroup.findOne({ code }).lean() : null;
        if (!g) return res.status(404).json({ error: 'الكود ده مش صحيح' });
        if (isMember(g, u)) return res.json(gSummary(g, u));
        if ((g.members || []).length >= MAX_MEMBERS) return res.status(400).json({ error: 'المجموعة اتملت' });
        if (await TrGroup.countDocuments({ members: u }) >= MAX_MEMBER_OF) return res.status(400).json({ error: 'وصلت للحد الأقصى من المجموعات' });
        const members = (g.members || []).concat(u);
        await TrGroup.updateOne({ _id: g._id }, { $set: { members } });
        await award(u, { xp: 5, inc: { groups: 1 } });
        res.json(gSummary(Object.assign({}, g, { members }), u));
    }));
    app.get('/api/translate/groups', verifyToken, apiLimiter, wrap('group-list', async (req, res) => {
        const list = await TrGroup.find({ members: req.user.username }).sort({ createdAt: -1 }).limit(20).lean();
        res.json(list.map((g) => gSummary(g, req.user.username)));
    }));
    app.get('/api/translate/groups/:id', verifyToken, apiLimiter, wrap('group-get', async (req, res) => {
        const id = gid(req); if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
        const u = req.user.username, g = await TrGroup.findOne({ _id: id }).lean();
        if (!isMember(g, u)) return res.status(404).json({ error: 'المجموعة مش موجودة' });
        const names = await namesOf(g.members), day = dayStr();
        const st = await TrStats.find({ username: { $in: g.members } }).select('username xp streak daily lastDay').lean();
        const by = {}; st.forEach((s) => { by[s.username] = s; });
        const board = g.members.map((m) => { const s = by[m] || {}; const alive = s.lastDay === day || s.lastDay === addDays(day, -1); return { u: m, name: names[m], week: weekXp(s.daily, day), xp: s.xp || 0, streak: alive ? s.streak || 0 : 0, me: m === u, owner: m === g.owner }; })
            .sort((a, b) => b.week - a.week || b.xp - a.xp);
        res.json(Object.assign(gSummary(g, u), { board, shared: (g.shared || []).slice().reverse(), msgs: (g.msgs || []).slice(-60).map((m) => Object.assign({}, m, { n: names[m.u] || m.n || m.u })) }));
    }));
    app.get('/api/translate/groups/:id/msgs', verifyToken, apiLimiter, wrap('group-msgs', async (req, res) => {
        const id = gid(req); if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
        const g = await TrGroup.findOne({ _id: id }).select('members msgs').lean();
        if (!isMember(g, req.user.username)) return res.status(404).json({ error: 'المجموعة مش موجودة' });
        const after = Number(req.query.after) || 0, names = await namesOf(g.members);
        res.json((g.msgs || []).filter((m) => m.at > after).slice(-60).map((m) => Object.assign({}, m, { n: names[m.u] || m.n || m.u })));
    }));
    app.post('/api/translate/groups/:id/msg', verifyToken, apiLimiter, wrap('group-msg', async (req, res) => {
        const id = gid(req); if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
        const text = str(req.body && req.body.text, 400); if (!text) return res.status(400).json({ error: 'الرسالة فاضية' });
        const u = req.user.username, g = await TrGroup.findOne({ _id: id }).lean();
        if (!isMember(g, u)) return res.status(404).json({ error: 'المجموعة مش موجودة' });
        const msgs = (g.msgs || []).slice(-79), now = Date.now();
        const mine = msgs.filter((m) => m.u === u && now - m.at < 10000);
        if (mine.length >= 4) return res.status(429).json({ error: 'براحة شوية، استنى كام ثانية' });
        const m = { u, t: text, at: now }; msgs.push(m);
        await TrGroup.updateOne({ _id: g._id }, { $set: { msgs } });
        res.json({ success: true, msg: m });
    }));
    app.post('/api/translate/groups/:id/share', verifyToken, apiLimiter, wrap('group-share', async (req, res) => {
        const id = gid(req), docId = req.body && req.body.docId;
        if (!id || !mongoose.isValidObjectId(docId)) return res.status(400).json({ error: 'معرّف غير صالح' });
        const u = req.user.username, g = await TrGroup.findOne({ _id: id }).lean();
        if (!isMember(g, u)) return res.status(404).json({ error: 'المجموعة مش موجودة' });
        const doc = await TrHistory.findOne({ _id: docId, username: u }).select('title titleAr pages').lean();
        if (!doc) return res.status(404).json({ error: 'الصفحة دي مش في سجلك' });
        const shared = (g.shared || []).filter((s) => s.docId !== String(doc._id));
        if (shared.length >= 40) return res.status(400).json({ error: 'المجموعة وصلت للحد الأقصى من الملفات المشتركة' });
        shared.push({ docId: String(doc._id), title: doc.title, titleAr: doc.titleAr || '', pages: doc.pages || 1, by: u, at: Date.now() });
        await TrGroup.updateOne({ _id: g._id }, { $set: { shared } });
        res.json({ success: true });
    }));
    async function sharedDoc(req, res) {
        const id = gid(req), docId = req.params.docId;
        if (!id || !mongoose.isValidObjectId(docId)) { res.status(400).json({ error: 'معرّف غير صالح' }); return null; }
        const g = await TrGroup.findOne({ _id: id }).lean();
        if (!isMember(g, req.user.username) || !(g.shared || []).some((s) => s.docId === docId)) { res.status(404).json({ error: 'الملف مش متاح' }); return null; }
        const doc = await TrHistory.findOne({ _id: docId }).select('title titleAr pages items').lean();
        if (!doc) { res.status(404).json({ error: 'صاحب الملف مسحه' }); return null; }
        return { g, doc };
    }
    app.get('/api/translate/groups/:id/doc/:docId', verifyToken, apiLimiter, wrap('group-doc', async (req, res) => { const r = await sharedDoc(req, res); if (r) res.json({ title: r.doc.title, titleAr: r.doc.titleAr, pages: r.doc.pages, items: r.doc.items }); }));
    app.post('/api/translate/groups/:id/doc/:docId/copy', verifyToken, apiLimiter, wrap('group-copy', async (req, res) => {
        const r = await sharedDoc(req, res); if (!r) return;
        const u = req.user.username;
        if (await TrHistory.countDocuments({ username: u }) >= 300) return res.status(400).json({ error: 'السجل ممتلئ (300)، احذف حاجة الأول' });
        const d = await TrHistory.create({ username: u, title: r.doc.title, titleAr: r.doc.titleAr || '', folder: str('من مجموعة ' + r.g.name, 60), subject: '', pages: r.doc.pages || 1, items: r.doc.items });
        res.json({ success: true, id: d._id });
    }));
    app.post('/api/translate/groups/:id/leave', verifyToken, apiLimiter, wrap('group-leave', async (req, res) => {
        const id = gid(req); if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
        const u = req.user.username, g = await TrGroup.findOne({ _id: id }).lean();
        if (!isMember(g, u)) return res.status(404).json({ error: 'المجموعة مش موجودة' });
        const members = g.members.filter((m) => m !== u);
        if (!members.length) { await TrGroup.deleteOne({ _id: g._id }); return res.json({ success: true, deleted: true }); }
        const set = { members, shared: (g.shared || []).filter((s) => s.by !== u) };
        if (g.owner === u) set.owner = members[0];
        await TrGroup.updateOne({ _id: g._id }, { $set: set });
        res.json({ success: true });
    }));
    app.delete('/api/translate/groups/:id', verifyToken, apiLimiter, wrap('group-delete', async (req, res) => {
        const id = gid(req); if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
        const g = await TrGroup.findOne({ _id: id }).lean();
        if (!g || g.owner !== req.user.username) return res.status(403).json({ error: 'صاحب المجموعة بس يقدر يمسحها' });
        await TrGroup.deleteOne({ _id: g._id }); res.json({ success: true });
    }));

    console.log('✅ translate-extras جاهزة (إحصائيات، مجموعات، خريطة ذهنية، اسأل كتابك، تصحيح، تذكير)');
};
module.exports.__test = { levelOf, tokens, buildChunks, retrieve, dayStr, addDays, BADGES };
