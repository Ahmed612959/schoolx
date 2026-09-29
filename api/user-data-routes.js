/* =========================================================================
   user-data-routes.js — حفظ بيانات الطالب (محادثات / مهارات / تقدّم) في MongoDB
   -------------------------------------------------------------------------
   بيتركّب في index.js بسطر واحد (شوف التعليمات).
   • كل عنصر (محادثة أو مفتاح إعدادات) = سطر مستقل في كوليكشن chatx_user_data.
   • التحميل بيتم صفحات صغيرة، والسيرفر بيقصّ الصفحة على حجم ~2.5MB،
     فمفيش رد بيقرّب من حد 4.5MB بتاع Vercel.
   • الرفع دفعات صغيرة (العميل بيقسّمها)، وكل عنصر بيتخزن لوحده.
   • التعارض: آخر تعديل يكسب (t الأكبر). لو نسخة السيرفر أحدث بيرجّعها في stale.
   ========================================================================= */
module.exports = function registerUserDataRoutes(app, deps) {
    const { mongoose, verifyToken, connectToDatabase, rateLimit } = deps;

    // ------------------------------------------------------------- حدود الأمان
    const MAX_ITEMS_PER_PUT = 200;             // عناصر في الطلب الواحد
    const MAX_VALUE_CHARS = 1500000;           // أقصى حجم لعنصر واحد (حروف)
    const MAX_KEYS_PER_USER = 5000;            // أقصى عدد عناصر للطالب
    const MAX_PAGE_BYTES = 2.5 * 1024 * 1024;  // أقصى حجم لصفحة التحميل (بايت)
    const MAX_PAGE_LIMIT = 100;                // أقصى عدد عناصر في الصفحة
    const OVERLAP_MS = 3000;                   // تداخل بسيط بين المرات عشان ما يضيعش تعديل في نفس الميلي ثانية
    const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000; // علامات الحذف بتتمسح بعد 90 يوم
    const MAX_FUTURE_SKEW_MS = 60 * 1000;      // منع وقت من المستقبل يقفل المفتاح

    // ------------------------------------------------------------- الموديل
    const schema = new mongoose.Schema({
        owner: { type: String, required: true },   // username بحروف صغيرة
        k: { type: String, required: true },       // chat:<id> أو sx_...
        kind: { type: Number, default: 0 },        // 0 = إعدادات/مهارات (أولًا) ، 1 = محادثة
        v: { type: String, default: '' },          // JSON مُسلسَل
        t: { type: Number, required: true },       // وقت التعديل من العميل (ms)
        srvT: { type: Number, required: true },    // وقت الاستلام على السيرفر (ms)
        d: { type: Boolean, default: false },      // محذوف؟
        size: { type: Number, default: 0 },        // حجم v بالبايت
        expireAt: { type: Date }                   // TTL لعلامات الحذف فقط
    }, { versionKey: false, minimize: false, collection: 'chatx_user_data' });

    schema.index({ owner: 1, k: 1 }, { unique: true });
    // الفهرس ده بيغطي استعلام التحميل بالكامل (من غير ما يقرأ محتوى المحادثات)
    schema.index({ owner: 1, kind: 1, srvT: -1, k: 1, d: 1, size: 1 });
    schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

    const UserData = mongoose.models.ChatxUserData || mongoose.model('ChatxUserData', schema);

    let indexesReady = null;
    function ensureIndexes() {
        if (!indexesReady) indexesReady = UserData.init().catch(function () { indexesReady = null; });
        return indexesReady;
    }

    // ------------------------------------------------------------- أدوات
    function ownerOf(req) {
        const u = req.user;
        if (!u || (u.type !== 'student' && u.type !== 'admin') || !u.username) return null;
        return String(u.username).toLowerCase();
    }
    // بيرجّع 1 للمحادثة، 0 لباقي المفاتيح المسموحة، -1 لو المفتاح مرفوض
    function keyKind(k) {
        if (typeof k !== 'string' || k.length > 140) return -1;
        if (k.indexOf('chat:') === 0) return /^chat:[A-Za-z0-9_\-.:]{1,120}$/.test(k) ? 1 : -1;
        return /^(sx_|chatx_)[A-Za-z0-9_\-.]{1,120}$/.test(k) ? 0 : -1;
    }
    function toInt(x, def) { const n = parseInt(x, 10); return isFinite(n) ? n : def; }

    const userDataLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1500,
        message: { success: false, error: 'طلبات مزامنة كتير — استنى شوية وجرب تاني' },
        trustProxy: true,
        keyGenerator: (req) => (req.user && req.user.username) || req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });

    // ------------------------------------------------------------- GET: التحميل
    // ?since=<ms>&until=<ms>&offset=<n>&limit=<n>
    app.get('/api/user-data', verifyToken, userDataLimiter, async (req, res) => {
        try {
            const owner = ownerOf(req);
            if (!owner) return res.status(403).json({ success: false, error: 'الحساب ده مش مدعوم للمزامنة' });
            await connectToDatabase();
            await ensureIndexes();

            const serverTime = Date.now();
            const since = Math.max(0, toInt(req.query.since, 0));
            const until = Math.min(serverTime, toInt(req.query.until, serverTime));
            const offset = Math.max(0, toInt(req.query.offset, 0));
            const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, toInt(req.query.limit, 20)));

            const range = { $lte: until };
            if (since > 0) range.$gt = Math.max(0, since - OVERLAP_MS);
            const q = { owner: owner, srvT: range };
            if (since <= 0) q.d = false; // التحميل الكامل مالوش لازمة بعلامات الحذف

            // 1) استعلام مغطّى بالفهرس: المفاتيح + الأحجام بس (سريع حتى لو المحادثات كبيرة)
            const [total, head] = await Promise.all([
                UserData.countDocuments(q),
                UserData.find(q, { _id: 0, k: 1, size: 1 })
                    .sort({ kind: 1, srvT: -1, k: 1 })
                    .skip(offset).limit(limit).lean()
            ]);

            // 2) نقصّ الصفحة على حد الحجم (العنصر الأول دايمًا داخل)
            const keys = [];
            let bytes = 0;
            for (let i = 0; i < head.length; i++) {
                const sz = head[i].size || 0;
                if (keys.length && bytes + sz > MAX_PAGE_BYTES) break;
                keys.push(head[i].k);
                bytes += sz;
            }

            // 3) نجيب المحتوى للمفاتيح دي بس
            let items = [];
            if (keys.length) {
                const docs = await UserData.find({ owner: owner, k: { $in: keys } }, { _id: 0, k: 1, v: 1, t: 1, d: 1 }).lean();
                const byKey = {};
                docs.forEach(function (x) { byKey[x.k] = x; });
                keys.forEach(function (k) {
                    const x = byKey[k];
                    if (!x) return;
                    items.push(x.d ? { k: x.k, t: x.t, d: true } : { k: x.k, v: x.v, t: x.t });
                });
            }
            res.json({ success: true, serverTime: serverTime, total: total, items: items });
        } catch (error) {
            console.error('user-data GET error:', error && error.message);
            res.status(500).json({ success: false, error: 'خطأ في تحميل البيانات' });
        }
    });

    // ------------------------------------------------------------- PUT: الرفع
    // body: { items: [{k, v, t, d?}] }  →  { success, serverTime, stale: [k...] }
    app.put('/api/user-data', verifyToken, userDataLimiter, async (req, res) => {
        try {
            const owner = ownerOf(req);
            if (!owner) return res.status(403).json({ success: false, error: 'الحساب ده مش مدعوم للمزامنة' });
            const items = req.body && req.body.items;
            if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, error: 'items مطلوبة' });
            if (items.length > MAX_ITEMS_PER_PUT) return res.status(413).json({ success: false, error: 'عدد العناصر أكبر من المسموح في الطلب الواحد' });

            await connectToDatabase();
            await ensureIndexes();

            const serverTime = Date.now();
            const ops = [];
            const opKeys = [];
            const invalid = [];

            for (let i = 0; i < items.length; i++) {
                const it = items[i] || {};
                const kind = keyKind(it.k);
                let t = Number(it.t);
                if (kind < 0 || !isFinite(t) || t <= 0) { invalid.push(it.k); continue; }
                t = Math.min(Math.floor(t), serverTime + MAX_FUTURE_SKEW_MS);
                const del = it.d === true;
                if (!del && (typeof it.v !== 'string' || it.v.length > MAX_VALUE_CHARS)) { invalid.push(it.k); continue; }

                const set = {
                    kind: kind,
                    v: del ? '' : it.v,
                    t: t,
                    srvT: serverTime,
                    d: del,
                    size: del ? 0 : Buffer.byteLength(it.v, 'utf8')
                };
                const update = { $set: set };
                if (del) set.expireAt = new Date(serverTime + TOMBSTONE_TTL_MS);
                else update.$unset = { expireAt: '' };

                // بنكتب بس لو نسخة السيرفر أقدم أو مساوية. لو أحدث → الفلتر مش هيطابق،
                // والـ upsert هيتعارض مع الفهرس الفريد (11000) → نعتبره stale
                ops.push({ updateOne: { filter: { owner: owner, k: it.k, t: { $lte: t } }, update: update, upsert: true } });
                opKeys.push(it.k);
            }

            // حد أقصى لعدد عناصر الطالب (حماية من الإغراق)
            if (ops.length) {
                const existing = await UserData.countDocuments({ owner: owner });
                if (existing + ops.length > MAX_KEYS_PER_USER + 200) {
                    return res.status(413).json({ success: false, error: 'وصلت للحد الأقصى من البيانات المحفوظة' });
                }
            }

            const stale = [];
            if (ops.length) {
                try {
                    await UserData.collection.bulkWrite(ops, { ordered: false });
                } catch (err) {
                    const errs = err && (err.writeErrors || (err.result && err.result.getWriteErrors && err.result.getWriteErrors())) || [];
                    if (!errs.length) throw err;
                    errs.forEach(function (e) {
                        const code = e.code != null ? e.code : (e.err && e.err.code);
                        const idx = e.index != null ? e.index : (e.err && e.err.index);
                        if (code === 11000 && idx != null && opKeys[idx]) stale.push(opKeys[idx]);
                        else throw err; // أي خطأ تاني حقيقي
                    });
                }
            }
            res.json({ success: true, serverTime: serverTime, stale: stale, rejected: invalid.length });
        } catch (error) {
            console.error('user-data PUT error:', error && error.message);
            res.status(500).json({ success: false, error: 'خطأ في حفظ البيانات' });
        }
    });
};
