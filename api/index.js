require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
// ====================== إعدادات Vercel ======================
app.set('trust proxy', 1);
// ====================== MIDDLEWARE الأساسي ======================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ====================== CORS لـ Vercel ======================
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://schoolx-eta.vercel.app',
    'https://school-system-fiv.vercel.app',
    // مشروع chatx (تطبيق الطالب) — مضاف هنا مباشرة (مش بس عن طريق
    // EXTRA_ALLOWED_ORIGINS) عشان الاعتماد عليه في env var كان بيتنسى ويسبب
    // CORS errors في تسجيل الدخول وكل طلب بعده.
    'https://chatx-wheat.vercel.app',
    // دومينات إضافية (لو احتجت دومين تاني بسرعة من غير ما تعدّل الكود) بتتحط
    // كـ Environment Variable: EXTRA_ALLOWED_ORIGINS = "https://x.vercel.app,https://y.com"
    ...(process.env.EXTRA_ALLOWED_ORIGINS
        ? process.env.EXTRA_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
        : [])
];
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    // من غير السطر ده، المتصفح مايقدرش يقرا Content-Disposition/Content-Length
    // في استجابات التحميل (حتى لو الطلب نجح) — وده كان بيبوّظ استخراج اسم الملف
    // وحساب نسبة التقدم أثناء التحميل من الفرونت إند.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ====================== منع الكاش تماماً (يمنع 304) ======================
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    next();
});

// ====================== Helmet ======================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ====================== Rate Limiting ======================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'لقد تجاوزت الحد المسموح من الطلبات' },
    trustProxy: true,
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown'
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
    trustProxy: true,
    keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown'
});

// ====================== متغيرات البيئة ======================
// ⚠️ لازم JWT_SECRET يتحط كـ Environment Variable ثابت في الإنتاج. الـ fallback
// العشوائي هنا موجود بس عشان السيرفر ميقعش لو حد نسي يضبطه، لكنه بيولّد سر
// مختلف مع كل cold start على Vercel (كل instance سيرفرلس ليها نسخة لوحدها) —
// يعني أي توكن اتعمل على instance معينة ممكن يفشل التحقق منه على instance تانية،
// وده بيسبب تسجيل خروج عشوائي للمستخدمين. لو حصل ده، دي علامة إنك نسيت تضبط
// JWT_SECRET في Vercel Environment Variables — اتأكد إنه string طويل وعشوائي
// وثابت (متغيرش بين الديبلويز) عشان الجلسات تفضل شغالة صح.
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET غير مضبوط في Environment Variables — بيتولّد سر عشوائي مؤقت لكل instance، وده هيسبب تسجيل خروج عشوائي للمستخدمين. اضبطه فورًا في إعدادات Vercel.');
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// مفتاح Qwen (عن طريق DashScope — Alibaba Cloud) لتوليد الصور — نفس القيمة دي
// بتستخدم كـ fallback لو مفيش مفتاح محفوظ لـ "qwen" في لوحة الأدمن (ApiKeySetting).
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
// مفاتيح الموديلات "العادية" (المجانية) اللي بيستخدمها الشات الرئيسي في مشروع
// chatx المنفصل — نفس أسماء الـ Environment Variables بالظبط عشان لو كانت
// متضبطة على نفس الحساب تشتغل هنا من غير أي إعداد إضافي. بنستخدمهم بس كـ
// احتياطي (fallback) لفيتشرز نصية زي "تحسين وصف الصورة" — Cerebras وOneHop
// (النسخة القديمة، claude-opus) مستبعدين عمدًا لأنهم مخصصين لميزة premium_ai.
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
// ONEHOP_API_KEY في مشروع chatx بقى فعليًا مفتاح OpenRouter (بنفس الاسم القديم
// بطلب صاحب المشروع) بيتنادى بموديل مجاني ثابت — عاملينه هنا كخطوة احتياطية
// منفصلة لأنه مفتاح/quota مختلف عن OPENROUTER_API_KEY العادي.
const ONEHOP_API_KEY = process.env.ONEHOP_API_KEY || '';
// موديل Qwen النصي (chat) عن طريق DashScope — ممكن يكون نفس مفتاح الصور
// (DASHSCOPE_API_KEY) شغال، فبنجرب QWEN_API_KEY الأول وإلا نرجع لنفس مفتاح
// الصور كـ fallback.
const QWEN_CHAT_API_KEY = process.env.QWEN_API_KEY || DASHSCOPE_API_KEY;
// رابط خدمة بايثون المنفصلة (استخراج نص من ملفات + فحص تشابه TF-IDF).
// شوف python-service/README.md لتفاصيل النشر والربط. لو فاضي، الفيتشرز اللي
// بتعتمد عليها (توليد أسئلة/تلخيص من ملفات المكتبة، فحص التشابه) بترجع رسالة
// واضحة "الخدمة مش متاحة" بدل ما تفشل بصمت أو توقف باقي السيرفر.
const PY_SERVICE_URL = (process.env.PY_SERVICE_URL || '').replace(/\/$/, '');

// ====================== Firebase Admin (للبوش نوتيفيكيشن) ======================
// على Vercel: حط JSON الخاص بـ Service Account (اللي نزلته من Firebase Console →
// Project settings → Service accounts → Generate new private key) كـ Environment
// Variable واحد اسمه FIREBASE_SERVICE_ACCOUNT، والقيمة هي محتوى الملف كامل كـ نص JSON.
const admin = require('firebase-admin');
let firebaseApp = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        firebaseApp = admin.apps.length ? admin.app() : admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin initialized');
    } else {
        console.log('⚠️ FIREBASE_SERVICE_ACCOUNT env var مش موجود — البوش نوتيفيكيشن معطل');
    }
} catch (e) {
    console.error('❌ فشل تهيئة Firebase Admin:', e.message);
}

// دالة إرسال إشعار push لطالب/أدمن بالـ username بتاعه. بترجع true/false، ومتوقفش
// أي endpoint لو فشلت (الإشعار مكمّل، مش أساسي، فمينفعش يكسر باقي الطلب).
async function sendPushToUser(username, { title, body, link, data }) {
    if (!firebaseApp) return false;
    try {
        await connectToDatabase();
        const tokens = await PushToken.find({ username }).select('fcmToken');
        if (!tokens.length) return false;
        // data لازم كل قيمه تكون string (متطلب FCM) — بنحول أي حاجة تانية (أرقام مثلاً) نصيًا.
        const dataPayload = data
            ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
            : undefined;
        const results = await Promise.allSettled(tokens.map(t =>
            admin.messaging().send({
                token: t.fcmToken,
                notification: { title, body },
                data: dataPayload,
                webpush: link ? { fcmOptions: { link } } : undefined
            })
        ));
        // أي توكن باظ (الطالب مسح الموقع من المتصفح مثلاً) نمسحه من الداتابيز
        const deadTokens = [];
        results.forEach((r, i) => {
            if (r.status === 'rejected') deadTokens.push(tokens[i].fcmToken);
        });
        if (deadTokens.length) await PushToken.deleteMany({ fcmToken: { $in: deadTokens } });
        return true;
    } catch (e) {
        console.error('❌ فشل إرسال Push:', e.message);
        return false;
    }
}

// بيبعت إشعار push لكل التوكنات المسجّلة (كل الطلاب اللي فعّلوا الإشعارات) — مستخدمة
// للإعلانات العامة من الأدمن. نفس منطق sendPushToUser بس من غير فلترة بـ username.
async function sendPushBroadcast({ title, body, link, data }) {
    if (!firebaseApp) return { sent: 0 };
    try {
        await connectToDatabase();
        const tokens = await PushToken.find().select('fcmToken');
        if (!tokens.length) return { sent: 0 };
        const dataPayload = data
            ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))
            : undefined;
        const results = await Promise.allSettled(tokens.map(t =>
            admin.messaging().send({
                token: t.fcmToken,
                notification: { title, body },
                data: dataPayload,
                webpush: link ? { fcmOptions: { link } } : undefined
            })
        ));
        const deadTokens = [];
        results.forEach((r, i) => { if (r.status === 'rejected') deadTokens.push(tokens[i].fcmToken); });
        if (deadTokens.length) await PushToken.deleteMany({ fcmToken: { $in: deadTokens } });
        return { sent: tokens.length - deadTokens.length };
    } catch (e) {
        console.error('❌ فشل إرسال Push Broadcast:', e.message);
        return { sent: 0 };
    }
}

// ====================== بصمة الجهاز — لكشف مشاركة الحسابات ======================
// بنستنتج نوع الجهاز/النظام/المتصفح من User-Agent نفسه (سيرفر-سايد، الطالب مقدرش
// يتلاعب فيه بسهولة زي أي قيمة تانية بيبعتها الفرونت إند). بصمة الجهاز التفصيلية
// (fingerprint hash) بتيجي جاهزة من الفرونت إند لإنها بتعتمد على تفاصيل مش متاحة
// للسيرفر أصلاً (دقة الشاشة، الـ canvas، إلخ) — شوف تعليق الفرونت إند لتفاصيلها.
function parseDeviceInfo(userAgent) {
    const ua = String(userAgent || '');
    let deviceType = 'desktop';
    if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) deviceType = 'tablet';
    else if (/Mobi|iPhone|Android/i.test(ua)) deviceType = 'mobile';

    let os = 'unknown';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'unknown';
    if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/EdgA|Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/CriOS|Chrome/i.test(ua)) browser = 'Chrome';
    else if (/FxiOS|Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua)) browser = 'Safari';

    return { deviceType, os, browser };
}

// بيسجّل حدث جلسة (دخول/منع/اختلاف بصمة) — مش بيوقف الطلب لو فشل التسجيل نفسه،
// لإن ده تحليل مساعد للأدمن مش جزء أساسي من عملية الدخول.
async function logSessionEvent({ username, userType, event, fingerprint, req }) {
    try {
        const { deviceType, os, browser } = parseDeviceInfo(req.headers['user-agent']);
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
        await SessionEvent.create({ username, userType, event, fingerprint: fingerprint || '', deviceType, os, browser, ip: String(ip).split(',')[0].trim() });
    } catch (e) { /* تسجيل تحليلي بس — فشله مايوقفش تسجيل الدخول نفسه */ }
}

// ====================== Cloudflare R2 Storage و Multer ======================
const multer = require('multer');
const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// تكوين Cloudflare R2 (متوافق مع S3 API)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET || 'files';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''); // من غير / في الآخر

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    // ⚠️ نسخ جديدة من aws-sdk v3 بتضيف تلقائيًا x-amz-checksum-crc32 و
    // x-amz-sdk-checksum-algorithm لكل طلب (حتى الروابط الموقّعة/presigned).
    // R2 مش بيدعمهم زي AWS الأصلي، فده بيفشّل الـ CORS preflight بتاع
    // رفع الملفات المباشر من المتصفح (PUT signed URL). تعطيلهم هنا يخلي
    // التوقيع "نضيف" زي الوضع القديم قبل ما الميزة دي تتفعّل افتراضيًا.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
});

// ====================== إعداد Multer ======================
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 500 * 1024 * 1024, // 500MB على R2 (كان 50MB في Supabase)
        files: 10
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'txt'];
        const ext = file.originalname.split('.').pop().toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم'), false);
        }
    }
});

// تنضيف أي جزء من المسار (اسم ملف أو فولدر) عشان يبقى متوافق مع مفاتيح S3/R2
// (زي ما كانت بالظبط، نفس المنطق)
function sanitizeForStorage(str) {
    const safe = String(str)
        .replace(/[^\x00-\x7F]/g, '')   // شيل أي حروف عربية/غير ASCII
        .replace(/\s+/g, '_')            // مسافات -> underscore
        .replace(/[^\w\-.]/g, '_')       // أي رمز غريب -> underscore
        .replace(/_+/g, '_')
        .replace(/^[_.]+|[_.]+$/g, '');
    return safe || 'file';
}

// تنضيف اسم ملف مع الحفاظ على الامتداد دايمًا (.pdf, .docx, ...).
// ⚠️ سبب إضافة الدالة دي: sanitizeForStorage القديمة كانت بتشيل أي حرف عربي،
// فلو اسم الملف كله عربي (زي "ملخص الكيمياء.pdf")، بعد شيل الحروف العربية
// كان بيفضل ".pdf" بس، وبعدين خطوة تنظيف النقط في الأول/الآخر كانت بتشيل
// النقطة دي كمان فيبقى المفتاح المخزّن في R2 من غير امتداد خالص (زي
// "170000000-pdf" بدل "170000000-ملخص_الكيمياء.pdf"). ده كان بيبوّظ معاينة
// الملفات في الفرونت إند (اللي بتحدد نوع الملف عن طريق آخر جزء بعد نقطة في
// الرابط)، فكل ملف اسمه عربي كان بيروح على معاينة "النوع مش مدعوم" ويحوّل
// للتحميل المباشر بدل ما يتفتح جوه الموقع.
function sanitizeFileName(str) {
    const original = String(str || '');
    const dotIndex = original.lastIndexOf('.');
    // امتداد صالح: بعد آخر نقطة، من 1 لـ 10 حروف/أرقام إنجليزي بس (عشان
    // نتفادى نتوهم إن نقطة عادية جوه اسم الملف هي بداية امتداد)
    const hasExt = dotIndex > -1 && /^[A-Za-z0-9]{1,10}$/.test(original.slice(dotIndex + 1));
    const base = hasExt ? original.slice(0, dotIndex) : original;
    const ext = hasExt ? original.slice(dotIndex + 1).toLowerCase() : '';

    const safeBase = sanitizeForStorage(base);
    return ext ? `${safeBase}.${ext}` : safeBase;
}

// دالة رفع ملف إلى R2 من Buffer (نفس الاسم والشكل القديم عشان باقي الكود
// اللي بينادي عليها متتغيرش). contentType اختياري — مهم بالذات للفيديو
// (متصفحات كتير بترفض تشغيل <video> من غير Content-Type صحيح، عكس الصور
// اللي المتصفح بيتساهل فيها أكتر).
const uploadToCloudinary = async (buffer, folder, fileName, contentType) => {
    const safeFolder = folder ? folder.split('/').map(sanitizeForStorage).join('/') : '';
    const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;
    const path = safeFolder ? `${safeFolder}/${safeName}` : safeName;

    await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: path,
        Body: buffer,
        ...(contentType ? { ContentType: contentType } : {})
    }));

    return {
        secure_url: `${R2_PUBLIC_URL}/${path}`, // نفس اسم الحقل القديم عشان الكود اللي بيستخدمها متتغيرش
        public_id: path
    };
};

// دالة حذف ملف من R2 (نفس الاسم والشكل القديم)
const deleteFromSupabase = async (path) => {
    await r2.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: path
    }));
};

// ====================== دالة حفظ معلومات الملف في قاعدة البيانات ======================
const saveFileInfo = async (fileData, user) => {
    try {
        const { name, url, publicId, size, type, grade, subject } = fileData;
        
        if (!name || !url || !grade || !subject) {
            throw new Error('جميع الحقول مطلوبة');
        }

        const File = mongoose.models.File || mongoose.model('File', fileSchema);
        
        const newFile = new File({
            name: name,
            url: url,
            publicId: publicId,
            size: size || 0,
            type: type || name.split('.').pop().toLowerCase(),
            grade: grade,
            subject: subject,
            uploadedBy: user?.username || 'admin'
        });

        await newFile.save();
        return newFile;
    } catch (error) {
        throw new Error('خطأ في حفظ معلومات الملف: ');
    }
};

// ====================== تصدير الدوال ======================
module.exports = {
    r2,
    uploadToCloudinary,
    deleteFromSupabase,
    saveFileInfo
};
// ====================== اتصال MongoDB مُعاد استخدامه ======================
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
    const opts = {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
    };
    const conn = await mongoose.connect(MONGODB_URI, opts);
    cachedDb = conn;
    console.log('✅ MongoDB connected');
    return conn;
}

// ====================== دوال التشفير ======================
async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(32).toString('hex');
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}

async function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
            if (err) return reject(err);
            // مقارنة بزمن ثابت (constant-time) بدل === العادية، عشان نمنع
            // timing attack ممكن يستخدمه مهاجم يقارن زمن الرد عشان يستنتج
            // بايتات الـ hash الصح واحد واحد. لازم الطولين يتطابقوا الأول
            // (Buffer.compare/timingSafeEqual بيرموا exception لو الطول مختلف).
            const keyBuf = Buffer.from(key, 'hex');
            const derivedBuf = Buffer.from(derivedKey.toString('hex'), 'hex');
            if (keyBuf.length !== derivedBuf.length) return resolve(false);
            resolve(crypto.timingSafeEqual(keyBuf, derivedBuf));
        });
    });
}

// ====================== النماذج (Schemas) ======================
const adminSchema = new mongoose.Schema({
    fullName: String,
    username: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'admin' },
    lastLogin: Date,
    lastIP: String,
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    profile: { phone: String, email: String },
    refreshToken: String,
    // ====== جلسة واحدة فقط في نفس الوقت (single active session) ======
    // activeSessionId: معرّف عشوائي بيتولّد مع كل تسجيل دخول ناجح، ومتحفوظ هنا
    // في الداتابيز (مش بس في التوكن) عشان نقدر نتحقق منه وقت أي محاولة دخول جديدة.
    // sessionLastSeenAt: بيتحدّث كل شوية من الجهاز الشغال (endpoint /api/heartbeat)
    // طول ما التطبيق مفتوح عنده — لو عدّى عليه وقت طويل من غير تحديث (يعني الجهاز
    // قفل التطبيق من غير تسجيل خروج صريح)، بنعتبر الجلسة "ماتت" ونسمح لجهاز تاني يدخل.
    activeSessionId: { type: String, default: null },
    sessionLastSeenAt: { type: Date, default: null },
    activeSessionFingerprint: { type: String, default: null }
}, { timestamps: true });

const studentSchema = new mongoose.Schema({
    fullName: String,
    studentCode: { type: String, required: true, unique: true },
    username: { type: String, unique: true },
    password: String,
    grade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    semester: String,
    // النوع (ذكر/أنثى) — null يعني لسه متحددش من الأدمن، فبيظهر "غير محدد" في الواجهة
    gender: { type: String, enum: ['male', 'female', null], default: null },
    subjects: Array, // legacy field - لم يعد يُستخدم، تم استبداله بـ subjectsFirst/subjectsSecond
    subjectsFirst: { type: Array, default: [] },  // درجات الترم الأول (النظام الحالي)
    subjectsSecond: { type: Array, default: [] }, // درجات نهاية العام / الترم الثاني (النظام الجديد - مجموع 510)
    role: { type: String, default: 'student' },
    lastLogin: Date,
    lastIP: String,
    profile: {
        phone: String,
        parentName: String,
        parentId: String,
        parentPhone: String // ✅ رقم واتساب ولي الأمر - لاستخدامه في تنبيهات الغياب/المخالفات التلقائية
    },
    // مميزات Premium مفعّلة للطالب ده بس (مصفوفة مفاتيح، مش boolean واحد) — الأدمن يقدر
    // يفعّل ميزة معينة لطالب معين من غير الباقي. المفاتيح المتاحة حاليًا:
    // premium_ai (نموذج أقوى + رسايل بلا حد تقريبًا) / premium_mock_exams (امتحانات محاكاة شاملة)
    // premium_prompts (مكتبة برومبتس ذكية) / premium_theme (تصميم مميز) / premium_drug_library (مكتبة أدوية شخصية)
    // premium_clinical_sim (محاكي مواقف إكلينيكية) / premium_lecture_audio (ملخص صوتي للمحاضرات)
    // premium_video_sim (محاكاة قرارات بفيديو/مشهد متفرّع)
    premiumFeatures: { type: [String], default: [] },
    // لو موجودة وتاريخها في المستقبل، الطالب متوقف مؤقتًا ومش هيقدر يسجل دخول لحد ما
    // التاريخ ده يعدي (أو الأدمن يمسحها يدويًا قبل كده). null = مش موقف.
    // نفس فكرة lockedUntil الموجودة أصلًا، بس ده إيقاف يدوي من الأدمن مش قفل تلقائي بسبب فشل باسورد.
    suspendedUntil: { type: Date, default: null },
    suspendedReason: { type: String, default: '' },
    refreshToken: String,
    // ====== جلسة واحدة فقط في نفس الوقت — نفس فكرة الحقول المشروحة في adminSchema فوق ======
    activeSessionId: { type: String, default: null },
    sessionLastSeenAt: { type: Date, default: null },
    activeSessionFingerprint: { type: String, default: null }
}, { timestamps: true });

const violationSchema = new mongoose.Schema({
    studentId: String,
    type: String,
    reason: String,
    penalty: String,
    parentSummons: Boolean,
    date: String
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
    text: String,
    date: String
}, { timestamps: true });

// توكنات أجهزة الطلاب/الأدمن اللي فعّلوا الإشعارات (طالب واحد ممكن يكون عنده
// أكتر من توكن لو بيستخدم أكتر من جهاز/متصفح — كلهم بيستقبلوا الإشعار)
const pushTokenSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    fcmToken: { type: String, required: true, unique: true }
}, { timestamps: true });

// ====== سجل أحداث الجلسات — لكشف مشاركة الحسابات بدقة عالية ======
// كل حدث (دخول ناجح / محاولة دخول اتمنعت لإن الحساب شغال على جهاز تاني / اختلاف
// بصمة جهاز أثناء heartbeat) بيتسجّل هنا مع بصمة الجهاز الكاملة (نوعه، نظامه،
// متصفحه) — ده اللي بيدّي الأدمن دقة عالية بدل ما يعتمد بس على IP (اللي ممكن يبقى
// نفسه لجهازين على نفس شبكة الواي فاي، فمش دليل كافي لوحده).
// expires: 60 يوم — تنضيف تلقائي (TTL index) عشان الكولكشن مايكبرش من غير حد.
const sessionEventSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    userType: { type: String, enum: ['student', 'admin'], default: 'student' },
    event: { type: String, enum: ['login', 'blocked', 'heartbeat_mismatch'], required: true },
    fingerprint: String, // هاش بصمة الجهاز (متولّد من الفرونت إند)
    deviceType: String,  // mobile / tablet / desktop / unknown
    os: String,           // Android / iOS / Windows / macOS / Linux / unknown
    browser: String,      // Chrome / Safari / Firefox / Edge / Samsung Internet / unknown
    ip: String,
    at: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 }
});
const SessionEvent = mongoose.models.SessionEvent || mongoose.model('SessionEvent', sessionEventSchema);

// ====== بنك الأسئلة الشائعة (مجهول المصدر تمامًا) ======
// عمدًا معندهاش أي حقل studentId/username — مفيش وسيلة تقنية تربط السؤال بصاحبه،
// مش بس "إخفاء" في العرض. askCount بيتزود لو سؤال مشابه (بعد التطبيع) اتسأل قبل
// كده، فالأسئلة اللي بتظهر للكل هي فعلاً اللي أكتر من طالب سألها، مش أي سؤال فردي.
const sharedQuestionSchema = new mongoose.Schema({
    normalizedText: { type: String, index: true },
    displayText: String,
    answerText: String,
    askCount: { type: Number, default: 1 },
    lastAskedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });
const SharedQuestion = mongoose.models.SharedQuestion || mongoose.model('SharedQuestion', sharedQuestionSchema);

const attendanceSchema = new mongoose.Schema({
    studentCode: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
    note: { type: String, default: '' },
    recordedBy: { type: String, default: '' }
}, { timestamps: true });

// ✅ تتبع حالة "تنبيهات الغياب" (تم الإرسال / تم التجاهل) عشان لوحة الأدمن متفضلش
// تعرض نفس التنبيه تاني بعد ما يتصرف فيه، لحد ما الوضع يتغيّر فعليًا (يزيد الغياب
// المتتالي أو تتغير النسبة) — عندها بيتغير "signature" ويظهر كتنبيه جديد من تاني.
const attendanceAlertSchema = new mongoose.Schema({
    studentCode: { type: String, required: true, index: true },
    signature: { type: String, required: true }, // مثال: "consecutive:4" أو "percentage:32"
    status: { type: String, enum: ['sent', 'dismissed'], default: 'dismissed' },
    actedBy: { type: String, default: '' },
    actedAt: { type: Date, default: Date.now }
}, { timestamps: true });
attendanceAlertSchema.index({ studentCode: 1, signature: 1 }, { unique: true });

const examSchema = new mongoose.Schema({
    name: { type: String, required: true },
    stage: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    duration: { type: Number, required: true },
    questions: [{
        type: { type: String, required: true },
        text: { type: String, required: true },
        options: [String],
        correctAnswer: String,
        correctAnswers: [String]
    }]
}, { timestamps: true });

const examResultSchema = new mongoose.Schema({
    examCode: { type: String, required: true },
    studentId: { type: String, required: true },
    score: { type: Number, required: true },
    completionTime: { type: Date, default: Date.now }
});

// ====================== أرشيف النتائج (بعد انتهاء السنة الدراسية) ======================
// لما السنة تخلص، بتترحل نتايج الطلاب (subjects) من مستند الطالب الحي لسجل أرشيف منفصل،
// وبيتم تصفير subjects في مستند الطالب عشان يبدأ سنة جديدة بنتيجة فاضية.
// النتيجة: أي بحث للطالب على Home.html (اللي بيقرا من Student.subjects الحي) مش هيلاقي
// حاجة، بينما الأدمن (مدير أو مدرس) يقدر يستعرض الأرشيف من صفحة لوحة التحكم.
const archivedResultSchema = new mongoose.Schema({
    studentCode: { type: String, required: true, index: true },
    fullName: String,
    username: String,
    grade: { type: String, enum: ['first', 'second', 'third'] },
    academicYear: { type: String, required: true, index: true }, // مثال: "2025-2026"
    subjects: Array, // legacy - لقطة قديمة من درجات الطالب وقت الأرشفة
    subjectsFirst: { type: Array, default: [] },  // لقطة من درجات الترم الأول وقت الأرشفة
    subjectsSecond: { type: Array, default: [] }, // لقطة من درجات نهاية العام وقت الأرشفة
    profile: { phone: String, parentName: String, parentId: String },
    archivedBy: String,
    archivedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// إضافات السيرفر الخاصة ببنك "صحة المجتمع" (Community Health Nursing)
// انسخ الكتلة دي كاملة والصقها في index.js بعد تعريف الموديلات الحالية
// (بعد سطر: const ExamResult = mongoose.models.ExamResult || ...)
// كل حاجة هنا مستقلة تمامًا (موديلات جديدة + userId بلاحقة _comm1) فمش هتلمس
// بيانات بنك التشريح (an1) ولا أي بنك تاني خالص
// ==========================================================================

// ====================== موديلات خاصة ببنك صحة المجتمع (Community Health) ======================

const comm1HomeworkSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, required: true },
    categoryFilter: { type: String, default: 'all' },
    deadline: { type: String, required: true },
    targetGrade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] }
}, { timestamps: true });

const Comm1Homework = mongoose.models.Comm1Homework || mongoose.model('Comm1Homework', comm1HomeworkSchema);

const comm1HomeworkSubmissionSchema = new mongoose.Schema({
    homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comm1Homework', required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentCode: { type: String, required: true },
    answers: { type: Array, default: [] },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

const Comm1HomeworkSubmission = mongoose.models.Comm1HomeworkSubmission ||
    mongoose.model('Comm1HomeworkSubmission', comm1HomeworkSubmissionSchema);

const comm1TournamentSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'عنوان البطولة مطلوب'], trim: true, maxlength: 100 },
    code: { type: String, unique: true, required: true, uppercase: true, match: /^[A-Z0-9]{6}$/ },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true, trim: true },
    questionCount: { type: Number, default: 20, min: 5, max: 100 },
    categoryFilter: { type: String, default: 'all', enum: ['all', 'mcq', 'truefalse', 'complete', 'explain', 'list', 'situations', 'definitions'] },
    timeLimitMinutes: { type: Number, default: 10, min: 5, max: 120 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: {
        type: [{
            text: { type: String, required: true },
            translation: { type: String, default: '' },
            cat: { type: String, required: true },
            options: { type: [String], default: [] },
            correct: { type: mongoose.Schema.Types.Mixed },
            completion: { type: String, default: '' }
        }],
        validate: { validator: arr => arr && arr.length > 0, message: 'يجب إضافة سؤال واحد على الأقل' }
    },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true, trim: true },
        score: { type: Number, default: 0, min: 0, max: 100 },
        correctCount: { type: Number, default: 0 },
        wrongCount: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: [{ questionIndex: Number, answer: String, isCorrect: Boolean }],
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });

comm1TournamentSchema.index({ code: 1 });
comm1TournamentSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Comm1Tournament = mongoose.models.Comm1Tournament || mongoose.model('Comm1Tournament', comm1TournamentSchema);

// ====================== Progress: نفس نمط progress-an1 بالظبط (userId + '_comm1') ======================

app.get('/api/progress-comm1', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId });
        if (!progress) { progress = new Progress({ userId }); await progress.save(); }
        res.json(progress);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
});

app.post('/api/progress-comm1/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        res.json({ success: true, xp: progress.xp });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث XP' }); }
});

app.post('/api/progress-comm1/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.bookmarks.includes(questionId)) progress.bookmarks.push(questionId); }
        else { progress.bookmarks = progress.bookmarks.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
});

app.post('/api/progress-comm1/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.hardQuestions.includes(questionId)) progress.hardQuestions.push(questionId); }
        else { progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
});

app.post('/api/progress-comm1/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.notes.set(questionId, note);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
});

app.post('/api/progress-comm1/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), total: total || 0, correct: correct || 0, score: score || 0, chapter: chapter || 'all' });
        if (req.body.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.concat(req.body.wrongQuestions);
            if (progress.wrongQuestions.length > 200) progress.wrongQuestions = progress.wrongQuestions.slice(-200);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
});

app.post('/api/progress-comm1/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress.achievements.includes(achievementId)) progress.achievements.push(achievementId);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
});

app.post('/api/progress-comm1/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = (req.user.id || req.user.username) + '_comm1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
});

// ====================== الواجبات (Homework) — موديل Comm1Homework منفصل ======================

app.post('/api/homework-comm1', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, deadline, targetGrade, questions } = req.body;
        if (!title || !chapterId || !questionCount || !deadline || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة، ويجب اختيار الأسئلة' });
        }
        const newHomework = new Comm1Homework({
            title, chapterId, chapterName: chapterName || 'فصل غير معروف', questionCount,
            categoryFilter: categoryFilter || 'all', deadline, targetGrade: targetGrade || 'first',
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newHomework.save();
        res.json({ success: true, message: 'تم إنشاء الواجب بنجاح', homework: newHomework });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' }); }
});

app.get('/api/homework-comm1/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworks = await Comm1Homework.find().sort({ createdAt: -1 });
        if (!homeworks || homeworks.length === 0) return res.status(200).json([]);
        const homeworkWithStats = await Promise.all(homeworks.map(async (hw) => {
            const submissions = await Comm1HomeworkSubmission.find({ homeworkId: hw._id });
            const totalStudents = await Student.countDocuments({ grade: hw.targetGrade || 'first' });
            let avgScore = '0';
            if (submissions.length > 0) {
                const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
                avgScore = (totalScore / submissions.length).toFixed(1);
            }
            return {
                _id: hw._id, id: hw._id, title: hw.title, chapterId: hw.chapterId,
                chapterName: hw.chapterName, questionCount: hw.questionCount, categoryFilter: hw.categoryFilter,
                deadline: hw.deadline, targetGrade: hw.targetGrade, createdBy: hw.createdBy,
                isActive: hw.isActive, questions: hw.questions || [], totalStudents, submittedCount: submissions.length,
                avgScore, createdAt: hw.createdAt, updatedAt: hw.updatedAt
            };
        }));
        res.status(200).json(homeworkWithStats);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات: ' }); }
});

app.get('/api/homework-comm1/pending', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const today = new Date().toISOString().split('T')[0];
        const homeworks = await Comm1Homework.find({ targetGrade: student.grade, isActive: true, deadline: { $gte: today } }).sort({ deadline: 1 });
        const pendingHomeworks = await Promise.all(homeworks.map(async (hw) => {
            const submission = await Comm1HomeworkSubmission.findOne({ homeworkId: hw._id, studentId: req.user.username });
            return { ...hw._doc, id: hw._id, isSubmitted: !!submission, hasSubmission: !!submission, myScore: submission ? submission.score : null };
        }));
        res.status(200).json(pendingHomeworks);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' }); }
});

app.get('/api/homework-comm1/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homework = await Comm1Homework.findById(req.params.id);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        if (student.grade !== homework.targetGrade) return res.status(403).json({ error: 'هذا الواجب ليس لصفك' });
        const existingSubmission = await Comm1HomeworkSubmission.findOne({ homeworkId: homework._id, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        const questionsWithoutAnswers = (homework.questions || []).map(q => ({ ...q, correct: undefined, correctAnswer: undefined, completion: undefined, answer: undefined }));
        res.status(200).json({ ...homework._doc, id: homework._id, questions: questionsWithoutAnswers });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجب: ' }); }
});

app.post('/api/homework-comm1/:id/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworkId = req.params.id;
        const { answers, timeTaken, tabSwitches } = req.body;
        const homework = await Comm1Homework.findById(homeworkId);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existingSubmission = await Comm1HomeworkSubmission.findOne({ homeworkId, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });

        let correctCount = 0;
        const detailedAnswers = [];
        const questions = homework.questions || [];
        for (const answer of answers || []) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            let isCorrect = false;
            const userAnswer = (answer.answer || '').toString().trim();
            if (question.cat === 'mcq') {
                isCorrect = userAnswer === (question.correct || '').toString().trim();
            } else if (question.cat === 'truefalse') {
                isCorrect = String(question.correct).toLowerCase().trim() === userAnswer.toLowerCase().trim();
            } else {
                const correctStr = (question.completion || question.answer || '').toLowerCase().trim();
                isCorrect = userAnswer.length > 3 && correctStr.length > 0 &&
                    (userAnswer.toLowerCase().includes(correctStr) || correctStr.includes(userAnswer.toLowerCase()));
            }
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: userAnswer, isCorrect });
        }
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const submission = new Comm1HomeworkSubmission({
            homeworkId: homework._id, studentId: req.user.username, studentName: student.fullName || 'طالب',
            studentCode: student.studentCode || '---', answers: detailedAnswers, score, totalQuestions,
            timeTaken: timeTaken || 0, tabSwitches: tabSwitches || 0
        });
        await submission.save();
        res.json({ success: true, message: 'تم تسليم الواجب بنجاح', score });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسليم الواجب: ' }); }
});

app.get('/api/homework-comm1/:id/submissions', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'admin') {
            const submissions = await Comm1HomeworkSubmission.find({ homeworkId: req.params.id }).sort({ submittedAt: -1 });
            const detailedSubmissions = await Promise.all(submissions.map(async (sub) => {
                const student = await Student.findOne({ username: sub.studentId }).select('fullName studentCode');
                return { ...sub._doc, id: sub._id, studentName: student ? student.fullName : sub.studentName, studentCode: student ? student.studentCode : sub.studentCode };
            }));
            return res.json(detailedSubmissions);
        }
        const submission = await Comm1HomeworkSubmission.findOne({ homeworkId: req.params.id, studentId: req.user.username });
        if (!submission) return res.status(404).json({ error: 'لم تجد تسليم لهذا الواجب' });
        res.json([submission]);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التسليمات: ' }); }
});

app.delete('/api/homework-comm1/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await Comm1Homework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await Comm1HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الواجب: ' }); }
});

// ====================== البطولات (Tournaments) — موديل Comm1Tournament منفصل ======================

async function generateUniqueComm1Code() {
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) { code = generateTournamentCode(); exists = await Comm1Tournament.findOne({ code }); attempts++; }
    if (exists) throw new Error('فشل توليد كود فريد بعد عدة محاولات');
    return code;
}

app.post('/api/tournaments-comm1', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, timeLimitMinutes, startDate, endDate, questions } = req.body;
        if (!title || !chapterId || !startDate || !endDate) return res.status(400).json({ success: false, error: 'جميع الحقول المطلوبة يجب ملؤها' });
        if (!questions || !Array.isArray(questions) || questions.length === 0) return res.status(400).json({ success: false, error: 'يجب إضافة سؤال واحد على الأقل للبطولة' });
        if (startDate > endDate) return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
        const uniqueCode = await generateUniqueComm1Code();
        const newTournament = new Comm1Tournament({
            title: title.trim(), code: uniqueCode, chapterId, chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length, categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: Math.min(Math.max(timeLimitMinutes || 10, 5), 120), startDate, endDate,
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newTournament.save();
        res.status(201).json({ success: true, message: 'تم إنشاء البطولة بنجاح', tournament: newTournament });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' }); }
});

app.get('/api/tournaments-comm1/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        const tournaments = await Comm1Tournament.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } })
            .select('title code chapterName questionCount timeLimitMinutes startDate endDate participants').sort({ createdAt: -1 }).lean();
        const result = tournaments.map(t => {
            const participants = t.participants || [];
            const userParticipant = participants.find(p => p.studentId === req.user.username);
            return {
                _id: t._id, title: t.title, code: t.code, chapterName: t.chapterName, questionCount: t.questionCount,
                timeLimitMinutes: t.timeLimitMinutes, startDate: t.startDate, endDate: t.endDate,
                participantsCount: participants.length, hasParticipated: !!userParticipant,
                myScore: userParticipant ? userParticipant.score : null
            };
        });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' }); }
});

app.post('/api/tournaments-comm1/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال كود البطولة' });
        const cleanCode = code.toUpperCase().trim();
        const tournament = await Comm1Tournament.findOne({ code: cleanCode, isActive: true });
        if (!tournament) return res.status(404).json({ success: false, error: 'كود البطولة غير صحيح أو البطولة غير متاحة' });
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) return res.status(400).json({ success: false, error: `البطولة لم تبدأ بعد. ستبدأ في ${tournament.startDate}` });
        if (tournament.endDate < today) return res.status(400).json({ success: false, error: 'انتهت مدة البطولة' });
        const alreadyJoined = tournament.participants.find(p => p.studentId === req.user.username);
        if (alreadyJoined) return res.status(400).json({ success: false, error: 'لقد شاركت في هذه البطولة مسبقاً', alreadyParticipated: true, score: alreadyJoined.score });
        const questionsWithoutAnswers = tournament.questions.map(q => ({ text: q.text || '', translation: q.translation || '', cat: q.cat || 'mcq', options: q.options || [] }));
        res.json({ success: true, tournamentId: tournament._id, title: tournament.title, chapterName: tournament.chapterName, timeLimitMinutes: tournament.timeLimitMinutes || 10, endDate: tournament.endDate, questions: questionsWithoutAnswers, message: 'تم التحقق بنجاح. ابدأ الحل الآن!' });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' }); }
});

app.post('/api/tournaments-comm1/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        const tournament = await Comm1Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة مغلقة وغير متاحة للمشاركة' });
        const existingParticipant = tournament.participants.find(p => p.studentId === req.user.username);
        if (existingParticipant) return res.status(400).json({ success: false, error: 'لقد شاركت بالفعل في هذه البطولة' });

        let correctCount = 0;
        const detailedAnswers = [];
        for (const answer of answers || []) {
            const question = tournament.questions[answer.questionIndex];
            if (!question) { detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect: false }); continue; }
            const isCorrect = correctAnswer(question, answer.answer || '');
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect });
        }
        const totalQuestions = tournament.questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const wrongCount = totalQuestions - correctCount;
        let studentName = req.user.username;
        const student = await Student.findOne({ username: req.user.username });
        if (student) studentName = student.fullName || student.username;

        tournament.participants.push({ studentId: req.user.username, studentName, score, correctCount, wrongCount, timeTaken: timeTaken || 0, answers: detailedAnswers, submittedAt: new Date() });
        tournament.participants.sort((a, b) => b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken);
        await tournament.save();

        const userRank = tournament.participants.findIndex(p => p.studentId === req.user.username) + 1;
        const xpRewards = { 1: 50, 2: 30, 3: 20 };
        const xpReward = xpRewards[userRank] || 10;
        await Progress.findOneAndUpdate({ userId: (req.user.username) + '_comm1' }, { $inc: { xp: xpReward } }, { upsert: true, new: true });

        res.json({ success: true, score, rank: userRank, correctCount, wrongCount, totalQuestions, xpEarned: xpReward, message: `أحسنت! حصلت على ${score}%` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' }); }
});

app.get('/api/tournaments-comm1/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Comm1Tournament.findById(req.params.id).select('title chapterName participants winner1 winner2 winner3').lean();
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(p => p.studentId === req.user.username);
            if (!isParticipant) return res.status(403).json({ success: false, error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' });
        }
        const participants = (tournament.participants || []).map((p, index) => ({ rank: index + 1, studentName: p.studentName, score: p.score, correctCount: p.correctCount || 0, wrongCount: p.wrongCount || 0, timeTaken: p.timeTaken, submittedAt: p.submittedAt }));
        res.json({ success: true, title: tournament.title, chapterName: tournament.chapterName, participants, top3: participants.slice(0, 3), totalParticipants: participants.length });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' }); }
});

app.post('/api/tournaments-comm1/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Comm1Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة منتهية بالفعل' });
        tournament.isActive = false;
        const participants = tournament.participants || [];
        if (participants[0]) tournament.winner1 = participants[0].studentId;
        if (participants[1]) tournament.winner2 = participants[1].studentId;
        if (participants[2]) tournament.winner3 = participants[2].studentId;
        const winnerRewards = [{ id: tournament.winner1, xp: 100 }, { id: tournament.winner2, xp: 60 }, { id: tournament.winner3, xp: 30 }];
        for (const reward of winnerRewards) {
            if (reward.id) await Progress.findOneAndUpdate({ userId: reward.id + '_comm1' }, { $inc: { xp: reward.xp } }, { upsert: true });
        }
        await tournament.save();
        res.json({ success: true, message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح', winners: { first: participants[0]?.studentName || 'لا يوجد', second: participants[1]?.studentName || 'لا يوجد', third: participants[2]?.studentName || 'لا يوجد' } });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' }); }
});

// ====================== المراجعة الذكية (Smart Review) — خاصة بصحة المجتمع ======================

app.post('/api/smart-review-comm1', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_comm1';
        const { questions: allQuestions, chapterId } = req.body;
        if (!allQuestions || allQuestions.length === 0) return res.status(400).json({ success: false, error: 'لا توجد أسئلة مرسلة من الواجهة' });

        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress._id) await progress.save();

        const wrongQuestions = progress.wrongQuestions || [];
        const difficulties = progress.difficulties || {};
        const hardQuestionIds = Object.entries(difficulties).filter(([k, v]) => v === 'hard').map(([k]) => k);
        const quizHistory = progress.quizHistory || [];
        const now = new Date();
        const oneWeekAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentlySolved = new Set(quizHistory.filter(h => h.date && h.date > oneWeekAgoStr && h.questionId).map(h => h.questionId));
        const solvedQuestions = new Set(quizHistory.filter(h => h.questionId).map(h => h.questionId));

        const reviewQuestions = [];
        for (const q of allQuestions) {
            if (wrongQuestions.some(w => w.questionId === q.questionId)) { reviewQuestions.push({ ...q, reason: '❌ أجبت عليها خطأ' }); continue; }
            if (hardQuestionIds.includes(q.questionId)) { reviewQuestions.push({ ...q, reason: '🔴 صنفتها صعبة' }); continue; }
            if (!recentlySolved.has(q.questionId) && solvedQuestions.has(q.questionId)) { reviewQuestions.push({ ...q, reason: '⏰ مر أكثر من أسبوع' }); continue; }
            if (!solvedQuestions.has(q.questionId) && reviewQuestions.length < 30) reviewQuestions.push({ ...q, reason: '🆕 لم تحل من قبل' });
        }

        const shuffled = reviewQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, Math.max(10, shuffled.length)));
        const reasons = selected.map(q => q.reason);
        const questionsWithoutAnswers = selected.map(q => { const n = { ...q }; delete n.correct; delete n.correctAnswer; delete n.completion; delete n.answer; delete n.reason; return n; });

        let chapterName = 'جميع الفصول';
        if (chapterId && chapterId !== 'all') { const firstQ = allQuestions.find(q => q.chapterId === chapterId); if (firstQ) chapterName = firstQ.chapterName || chapterId; }

        res.json({ success: true, questions: questionsWithoutAnswers, total: selected.length, reasons, chapterName, message: `تم اختيار ${selected.length} سؤال للمراجعة الذكية من ${chapterName}` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' }); }
});

app.post('/api/smart-review-comm1/save-progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_comm1';
        const { questionId, isCorrect, chapterId } = req.body;
        if (!questionId) return res.status(400).json({ error: 'معرف السؤال مطلوب' });
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), questionId, correct: isCorrect, type: 'smart_review', chapterId: chapterId || 'all' });
        if (!isCorrect) {
            if (!progress.wrongQuestions.some(w => w.questionId === questionId)) progress.wrongQuestions.push({ questionId, date: new Date().toISOString(), source: 'smart_review' });
        } else {
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ التقدم: ' }); }
});

// ==========================================================================
// ملاحظات:
// - verifyToken و isAdmin و isManager و connectToDatabase و hashPassword و Progress
//   و Student و Admin و generateTournamentCode و correctAnswer كلها معرّفة بالفعل
//   فوق في ملفك (index.js)، وهنا بس بنعيد استخدامها — من غير ما نلمسها أو نكررها.
// - الموديلات الجديدة (Comm1Homework, Comm1HomeworkSubmission, Comm1Tournament)
//   منفصلة 100% عن موديلات بنك التشريح (An1Homework...) وباقي البنوك — صفر تعارض بيانات.
// - كل مسارات الـ Progress هنا بتستخدم نفس موديل Progress المشترك، لكن بمفتاح
//   userId مختلف (لاحقة '_comm1' بدلاً من '_an1')، فبيانات الطالب في هذا البنك
//   منفصلة تمامًا عن بياناته في أي بنك آخر حتى لو كان نفس الحساب.
// - تسجيل الدخول (/api/login, /api/verify-session, /api/logout) فضل مشترك
//   عمدًا، لأن الطالب/الأدمن نفسه بيدخل بنفس الحساب على كل البنوك.
// ==========================================================================


// ==========================================================================
// إضافات السيرفر الخاصة ببنك "مبادئ وأسس التمريض" (Fundamentals of Nursing)
// انسخ الكتلة دي كاملة والصقها في server.js بعد كتلة إضافات البنوك التانية
// موديلات جديدة (FonHomework, FonHomeworkSubmission, FonTournament) — صفر
// تعارض مع أي بنك تاني
//
// ✅ فيها 3 إصلاحات مهمة عن باقي البنوك (لو حابب تطبقهم على GS/Anatomy
//    كمان قولي وابعتهملك بنفس الإصلاحات):
//    1) راوت /api/progress-fon/wrong مخصص بمنطق add/remove/clear صحيح
//       (بدل الاعتماد على /quiz اللي كان بيعمل concat فيرجع السؤال المحذوف)
//    2) /api/progress-fon/quiz بقى بسيط: بيسجل سجل الاختبار بس، مبقاش
//       بيلمس wrongQuestions خالص (فصلناها في راوت /wrong)
//    3) /api/smart-review-fon بقى بيبعت الإجابة الصحيحة مع كل سؤال (كانت
//       بتتمسح غلط زي راوت الواجبات، فكان التصحيح مستحيل يحصل في المتصفح)
// ==========================================================================

// ====================== موديلات خاصة ببنك مبادئ وأسس التمريض ======================

const fonHomeworkSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, required: true },
    categoryFilter: { type: String, default: 'all' },
    deadline: { type: String, required: true },
    targetGrade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] }
}, { timestamps: true });

const FonHomework = mongoose.models.FonHomework || mongoose.model('FonHomework', fonHomeworkSchema);

const fonHomeworkSubmissionSchema = new mongoose.Schema({
    homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'FonHomework', required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentCode: { type: String, required: true },
    answers: { type: Array, default: [] },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

const FonHomeworkSubmission = mongoose.models.FonHomeworkSubmission ||
    mongoose.model('FonHomeworkSubmission', fonHomeworkSubmissionSchema);

const fonTournamentSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'عنوان البطولة مطلوب'], trim: true, maxlength: 100 },
    code: { type: String, unique: true, required: true, uppercase: true, match: /^[A-Z0-9]{6}$/ },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true, trim: true },
    questionCount: { type: Number, default: 20, min: 5, max: 100 },
    categoryFilter: { type: String, default: 'all', enum: ['all', 'mcq', 'truefalse', 'complete', 'explain', 'list', 'situations', 'definitions'] },
    timeLimitMinutes: { type: Number, default: 10, min: 5, max: 120 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: {
        type: [{
            text: { type: String, required: true },
            translation: { type: String, default: '' },
            cat: { type: String, required: true },
            options: { type: [String], default: [] },
            correct: { type: mongoose.Schema.Types.Mixed },
            completion: { type: String, default: '' }
        }],
        validate: { validator: arr => arr && arr.length > 0, message: 'يجب إضافة سؤال واحد على الأقل' }
    },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true, trim: true },
        score: { type: Number, default: 0, min: 0, max: 100 },
        correctCount: { type: Number, default: 0 },
        wrongCount: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: [{ questionIndex: Number, answer: String, isCorrect: Boolean }],
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });

fonTournamentSchema.index({ code: 1 });
fonTournamentSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const FonTournament = mongoose.models.FonTournament || mongoose.model('FonTournament', fonTournamentSchema);

// ====================== Progress: XP / Bookmarks / Hard / Notes / Achievements / Difficulty ======================

app.get('/api/progress-fon', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId });
        if (!progress) { progress = new Progress({ userId }); await progress.save(); }
        res.json(progress);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
});

app.post('/api/progress-fon/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        res.json({ success: true, xp: progress.xp });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث XP' }); }
});

app.post('/api/progress-fon/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.bookmarks.includes(questionId)) progress.bookmarks.push(questionId); }
        else { progress.bookmarks = progress.bookmarks.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
});

app.post('/api/progress-fon/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.hardQuestions.includes(questionId)) progress.hardQuestions.push(questionId); }
        else { progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
});

app.post('/api/progress-fon/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.notes.set(questionId, note);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
});

// ✅ إصلاح: /quiz دلوقتي بيسجل سجل الاختبار بس، ومابيلمسش wrongQuestions
// (فصلناها في راوت /wrong المخصص تحت عشان الحذف يبقى استبدال صحيح مش إضافة)
app.post('/api/progress-fon/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), total: total || 0, correct: correct || 0, score: score || 0, chapter: chapter || 'all' });
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
});

// ✅ راوت جديد مخصص للأسئلة الخاطئة: add / remove / clear
// ده اللي بيحل مشكلة "السؤال بيرجع يظهر بعد ما بحله صح"
app.post('/api/progress-fon/wrong', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action, wrongEntry } = req.body; // action: 'add' | 'remove' | 'clear'
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });

        if (action === 'add') {
            if (!progress.wrongQuestions.some(w => w.questionId === questionId)) {
                progress.wrongQuestions.push(wrongEntry || { questionId, date: new Date().toISOString() });
            }
        } else if (action === 'remove') {
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        } else if (action === 'clear') {
            progress.wrongQuestions = [];
        } else {
            return res.status(400).json({ error: 'action غير صحيح (المطلوب: add أو remove أو clear)' });
        }

        if (progress.wrongQuestions.length > 200) progress.wrongQuestions = progress.wrongQuestions.slice(-200);

        await progress.save();
        res.json({ success: true, wrongQuestions: progress.wrongQuestions });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الأسئلة الخاطئة: ' }); }
});

app.post('/api/progress-fon/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress.achievements.includes(achievementId)) progress.achievements.push(achievementId);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
});

app.post('/api/progress-fon/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = (req.user.id || req.user.username) + '_fon';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
});

// ====================== الواجبات (Homework) — موديل FonHomework منفصل ======================

app.post('/api/homework-fon', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, deadline, targetGrade, questions } = req.body;
        if (!title || !chapterId || !questionCount || !deadline || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة، ويجب اختيار الأسئلة' });
        }
        const newHomework = new FonHomework({
            title, chapterId, chapterName: chapterName || 'فصل غير معروف', questionCount,
            categoryFilter: categoryFilter || 'all', deadline, targetGrade: targetGrade || 'first',
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newHomework.save();
        res.json({ success: true, message: 'تم إنشاء الواجب بنجاح', homework: newHomework });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' }); }
});

app.get('/api/homework-fon/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworks = await FonHomework.find().sort({ createdAt: -1 });
        if (!homeworks || homeworks.length === 0) return res.status(200).json([]);
        const homeworkWithStats = await Promise.all(homeworks.map(async (hw) => {
            const submissions = await FonHomeworkSubmission.find({ homeworkId: hw._id });
            const totalStudents = await Student.countDocuments({ grade: hw.targetGrade || 'first' });
            let avgScore = '0';
            if (submissions.length > 0) {
                const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
                avgScore = (totalScore / submissions.length).toFixed(1);
            }
            return {
                _id: hw._id, id: hw._id, title: hw.title, chapterId: hw.chapterId,
                chapterName: hw.chapterName, questionCount: hw.questionCount, categoryFilter: hw.categoryFilter,
                deadline: hw.deadline, targetGrade: hw.targetGrade, createdBy: hw.createdBy,
                isActive: hw.isActive, questions: hw.questions || [], totalStudents, submittedCount: submissions.length,
                avgScore, createdAt: hw.createdAt, updatedAt: hw.updatedAt
            };
        }));
        res.status(200).json(homeworkWithStats);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات: ' }); }
});

app.get('/api/homework-fon/pending', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const today = new Date().toISOString().split('T')[0];
        const homeworks = await FonHomework.find({ targetGrade: student.grade, isActive: true, deadline: { $gte: today } }).sort({ deadline: 1 });
        const pendingHomeworks = await Promise.all(homeworks.map(async (hw) => {
            const submission = await FonHomeworkSubmission.findOne({ homeworkId: hw._id, studentId: req.user.username });
            return { ...hw._doc, id: hw._id, isSubmitted: !!submission, hasSubmission: !!submission, myScore: submission ? submission.score : null };
        }));
        res.status(200).json(pendingHomeworks);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' }); }
});

app.get('/api/homework-fon/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homework = await FonHomework.findById(req.params.id);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        if (student.grade !== homework.targetGrade) return res.status(403).json({ error: 'هذا الواجب ليس لصفك' });
        const existingSubmission = await FonHomeworkSubmission.findOne({ homeworkId: homework._id, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        const questionsWithoutAnswers = (homework.questions || []).map(q => ({ ...q, correct: undefined, correctAnswer: undefined, completion: undefined, answer: undefined }));
        res.status(200).json({ ...homework._doc, id: homework._id, questions: questionsWithoutAnswers });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجب: ' }); }
});

app.post('/api/homework-fon/:id/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworkId = req.params.id;
        const { answers, timeTaken, tabSwitches } = req.body;
        const homework = await FonHomework.findById(homeworkId);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existingSubmission = await FonHomeworkSubmission.findOne({ homeworkId, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });

        let correctCount = 0;
        const detailedAnswers = [];
        const questions = homework.questions || [];
        for (const answer of answers || []) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            let isCorrect = false;
            const userAnswer = (answer.answer || '').toString().trim();
            if (question.cat === 'mcq') {
                isCorrect = userAnswer === (question.correct || '').toString().trim();
            } else if (question.cat === 'truefalse') {
                isCorrect = String(question.correct).toLowerCase().trim() === userAnswer.toLowerCase().trim();
            } else {
                const correctStr = (question.completion || question.answer || '').toLowerCase().trim();
                isCorrect = userAnswer.length > 3 && correctStr.length > 0 &&
                    (userAnswer.toLowerCase().includes(correctStr) || correctStr.includes(userAnswer.toLowerCase()));
            }
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: userAnswer, isCorrect });
        }
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const submission = new FonHomeworkSubmission({
            homeworkId: homework._id, studentId: req.user.username, studentName: student.fullName || 'طالب',
            studentCode: student.studentCode || '---', answers: detailedAnswers, score, totalQuestions,
            timeTaken: timeTaken || 0, tabSwitches: tabSwitches || 0
        });
        await submission.save();
        res.json({ success: true, message: 'تم تسليم الواجب بنجاح', score });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسليم الواجب: ' }); }
});

app.get('/api/homework-fon/:id/submissions', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'admin') {
            const submissions = await FonHomeworkSubmission.find({ homeworkId: req.params.id }).sort({ submittedAt: -1 });
            const detailedSubmissions = await Promise.all(submissions.map(async (sub) => {
                const student = await Student.findOne({ username: sub.studentId }).select('fullName studentCode');
                return { ...sub._doc, id: sub._id, studentName: student ? student.fullName : sub.studentName, studentCode: student ? student.studentCode : sub.studentCode };
            }));
            return res.json(detailedSubmissions);
        }
        const submission = await FonHomeworkSubmission.findOne({ homeworkId: req.params.id, studentId: req.user.username });
        if (!submission) return res.status(404).json({ error: 'لم تجد تسليم لهذا الواجب' });
        res.json([submission]);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التسليمات: ' }); }
});

app.delete('/api/homework-fon/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await FonHomework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await FonHomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الواجب: ' }); }
});

// ====================== البطولات (Tournaments) — موديل FonTournament منفصل ======================

async function generateUniqueFonCode() {
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) { code = generateTournamentCode(); exists = await FonTournament.findOne({ code }); attempts++; }
    if (exists) throw new Error('فشل توليد كود فريد بعد عدة محاولات');
    return code;
}

app.post('/api/tournaments-fon', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, timeLimitMinutes, startDate, endDate, questions } = req.body;
        if (!title || !chapterId || !startDate || !endDate) return res.status(400).json({ success: false, error: 'جميع الحقول المطلوبة يجب ملؤها' });
        if (!questions || !Array.isArray(questions) || questions.length === 0) return res.status(400).json({ success: false, error: 'يجب إضافة سؤال واحد على الأقل للبطولة' });
        if (startDate > endDate) return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
        const uniqueCode = await generateUniqueFonCode();
        const newTournament = new FonTournament({
            title: title.trim(), code: uniqueCode, chapterId, chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length, categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: Math.min(Math.max(timeLimitMinutes || 10, 5), 120), startDate, endDate,
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newTournament.save();
        res.status(201).json({ success: true, message: 'تم إنشاء البطولة بنجاح', tournament: newTournament });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' }); }
});

app.get('/api/tournaments-fon/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        const tournaments = await FonTournament.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } })
            .select('title code chapterName questionCount timeLimitMinutes startDate endDate participants').sort({ createdAt: -1 }).lean();
        const result = tournaments.map(t => {
            const participants = t.participants || [];
            const userParticipant = participants.find(p => p.studentId === req.user.username);
            return {
                _id: t._id, title: t.title, code: t.code, chapterName: t.chapterName, questionCount: t.questionCount,
                timeLimitMinutes: t.timeLimitMinutes, startDate: t.startDate, endDate: t.endDate,
                participantsCount: participants.length, hasParticipated: !!userParticipant,
                myScore: userParticipant ? userParticipant.score : null
            };
        });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' }); }
});

app.post('/api/tournaments-fon/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال كود البطولة' });
        const cleanCode = code.toUpperCase().trim();
        const tournament = await FonTournament.findOne({ code: cleanCode, isActive: true });
        if (!tournament) return res.status(404).json({ success: false, error: 'كود البطولة غير صحيح أو البطولة غير متاحة' });
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) return res.status(400).json({ success: false, error: `البطولة لم تبدأ بعد. ستبدأ في ${tournament.startDate}` });
        if (tournament.endDate < today) return res.status(400).json({ success: false, error: 'انتهت مدة البطولة' });
        const alreadyJoined = tournament.participants.find(p => p.studentId === req.user.username);
        if (alreadyJoined) return res.status(400).json({ success: false, error: 'لقد شاركت في هذه البطولة مسبقاً', alreadyParticipated: true, score: alreadyJoined.score });
        const questionsWithoutAnswers = tournament.questions.map(q => ({ text: q.text || '', translation: q.translation || '', cat: q.cat || 'mcq', options: q.options || [] }));
        res.json({ success: true, tournamentId: tournament._id, title: tournament.title, chapterName: tournament.chapterName, timeLimitMinutes: tournament.timeLimitMinutes || 10, endDate: tournament.endDate, questions: questionsWithoutAnswers, message: 'تم التحقق بنجاح. ابدأ الحل الآن!' });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' }); }
});

app.post('/api/tournaments-fon/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        const tournament = await FonTournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة مغلقة وغير متاحة للمشاركة' });
        const existingParticipant = tournament.participants.find(p => p.studentId === req.user.username);
        if (existingParticipant) return res.status(400).json({ success: false, error: 'لقد شاركت بالفعل في هذه البطولة' });

        let correctCount = 0;
        const detailedAnswers = [];
        for (const answer of answers || []) {
            const question = tournament.questions[answer.questionIndex];
            if (!question) { detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect: false }); continue; }
            const isCorrect = correctAnswer(question, answer.answer || '');
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect });
        }
        const totalQuestions = tournament.questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const wrongCount = totalQuestions - correctCount;
        let studentName = req.user.username;
        const student = await Student.findOne({ username: req.user.username });
        if (student) studentName = student.fullName || student.username;

        tournament.participants.push({ studentId: req.user.username, studentName, score, correctCount, wrongCount, timeTaken: timeTaken || 0, answers: detailedAnswers, submittedAt: new Date() });
        tournament.participants.sort((a, b) => b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken);
        await tournament.save();

        const userRank = tournament.participants.findIndex(p => p.studentId === req.user.username) + 1;
        const xpRewards = { 1: 50, 2: 30, 3: 20 };
        const xpReward = xpRewards[userRank] || 10;
        await Progress.findOneAndUpdate({ userId: (req.user.username) + '_fon' }, { $inc: { xp: xpReward } }, { upsert: true, new: true });

        res.json({ success: true, score, rank: userRank, correctCount, wrongCount, totalQuestions, xpEarned: xpReward, message: `أحسنت! حصلت على ${score}%` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' }); }
});

app.get('/api/tournaments-fon/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await FonTournament.findById(req.params.id).select('title chapterName participants winner1 winner2 winner3').lean();
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(p => p.studentId === req.user.username);
            if (!isParticipant) return res.status(403).json({ success: false, error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' });
        }
        const participants = (tournament.participants || []).map((p, index) => ({ rank: index + 1, studentName: p.studentName, score: p.score, correctCount: p.correctCount || 0, wrongCount: p.wrongCount || 0, timeTaken: p.timeTaken, submittedAt: p.submittedAt }));
        res.json({ success: true, title: tournament.title, chapterName: tournament.chapterName, participants, top3: participants.slice(0, 3), totalParticipants: participants.length });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' }); }
});

app.post('/api/tournaments-fon/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await FonTournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة منتهية بالفعل' });
        tournament.isActive = false;
        const participants = tournament.participants || [];
        if (participants[0]) tournament.winner1 = participants[0].studentId;
        if (participants[1]) tournament.winner2 = participants[1].studentId;
        if (participants[2]) tournament.winner3 = participants[2].studentId;
        const winnerRewards = [{ id: tournament.winner1, xp: 100 }, { id: tournament.winner2, xp: 60 }, { id: tournament.winner3, xp: 30 }];
        for (const reward of winnerRewards) {
            if (reward.id) await Progress.findOneAndUpdate({ userId: reward.id + '_fon' }, { $inc: { xp: reward.xp } }, { upsert: true });
        }
        await tournament.save();
        res.json({ success: true, message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح', winners: { first: participants[0]?.studentName || 'لا يوجد', second: participants[1]?.studentName || 'لا يوجد', third: participants[2]?.studentName || 'لا يوجد' } });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' }); }
});

// ====================== المراجعة الذكية (Smart Review) — خاصة بمبادئ وأسس التمريض ======================
// ✅ إصلاح: هنا مبنمسحش حقول الإجابة (correct/completion/answer) قبل الإرسال،
//    عكس راوت الواجبات، لأن التصحيح هنا بيحصل فوراً في المتصفح مش عبر تسليم للسيرفر.
//    لو مسحناها زي الواجبات، هيبقى مستحيل نعرف صح ولا غلط -> ده كان سبب العطل.

app.post('/api/smart-review-fon', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_fon';
        const { questions: allQuestions, chapterId } = req.body;
        if (!allQuestions || allQuestions.length === 0) return res.status(400).json({ success: false, error: 'لا توجد أسئلة مرسلة من الواجهة' });

        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress._id) await progress.save();

        const wrongQuestions = progress.wrongQuestions || [];
        const difficulties = progress.difficulties || {};
        const hardQuestionIds = Object.entries(difficulties).filter(([k, v]) => v === 'hard').map(([k]) => k);
        const quizHistory = progress.quizHistory || [];
        const now = new Date();
        const oneWeekAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentlySolved = new Set(quizHistory.filter(h => h.date && h.date > oneWeekAgoStr && h.questionId).map(h => h.questionId));
        const solvedQuestions = new Set(quizHistory.filter(h => h.questionId).map(h => h.questionId));

        const reviewQuestions = [];
        for (const q of allQuestions) {
            if (wrongQuestions.some(w => w.questionId === q.questionId)) { reviewQuestions.push({ ...q, reason: '❌ أجبت عليها خطأ' }); continue; }
            if (hardQuestionIds.includes(q.questionId)) { reviewQuestions.push({ ...q, reason: '🔴 صنفتها صعبة' }); continue; }
            if (!recentlySolved.has(q.questionId) && solvedQuestions.has(q.questionId)) { reviewQuestions.push({ ...q, reason: '⏰ مر أكثر من أسبوع' }); continue; }
            if (!solvedQuestions.has(q.questionId) && reviewQuestions.length < 30) reviewQuestions.push({ ...q, reason: '🆕 لم تحل من قبل' });
        }

        const shuffled = reviewQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, Math.max(10, shuffled.length)));
        const reasons = selected.map(q => q.reason);

        // ✅ هنا الإصلاح: بنبعت السؤال زي ما هو (بإجابته) من غير ما نمسح حاجة
        const questionsWithAnswers = selected.map(q => { const n = { ...q }; delete n.reason; return n; });

        let chapterName = 'جميع الفصول';
        if (chapterId && chapterId !== 'all') { const firstQ = allQuestions.find(q => q.chapterId === chapterId); if (firstQ) chapterName = firstQ.chapterName || chapterId; }

        res.json({ success: true, questions: questionsWithAnswers, total: selected.length, reasons, chapterName, message: `تم اختيار ${selected.length} سؤال للمراجعة الذكية من ${chapterName}` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' }); }
});

app.post('/api/smart-review-fon/save-progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_fon';
        const { questionId, isCorrect, chapterId } = req.body;
        if (!questionId) return res.status(400).json({ error: 'معرف السؤال مطلوب' });
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), questionId, correct: isCorrect, type: 'smart_review', chapterId: chapterId || 'all' });
        if (!isCorrect) {
            if (!progress.wrongQuestions.some(w => w.questionId === questionId)) progress.wrongQuestions.push({ questionId, date: new Date().toISOString(), source: 'smart_review' });
        } else {
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ التقدم: ' }); }
});

// ==========================================================================
// ملاحظة مهمة: لو حابب أبعتلك نفس الـ 3 إصلاحات (راوت /wrong المخصص +
// إلغاء مسح الإجابة في المراجعة الذكية) لبنك الجراحة العامة والتشريح كمان
// (server_gs_additions.js و server_an_additions.js) قولي وابعتهملك فوراً —
// نفس العلة موجودة فيهم بالظبط لأنهم اتبنوا من نفس القالب.
// ==========================================================================



// ==========================================================================
// إضافات السيرفر الخاصة ببنك "الجراحة العامة" (General Surgery)
// انسخ الكتلة دي كاملة والصقها في server.js بعد تعريف الموديلات الحالية
// (بعد سطر: const ExamResult = mongoose.models.ExamResult || ...)
// كل حاجة هنا مستقلة تمامًا (موديلات جديدة) فمش هتلمس بيانات أي بنك تاني
// ==========================================================================

// ====================== موديلات خاصة ببنك الجراحة العامة ======================

const gsHomeworkSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, required: true },
    categoryFilter: { type: String, default: 'all' },
    deadline: { type: String, required: true },
    targetGrade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] }
}, { timestamps: true });

const GsHomework = mongoose.models.GsHomework || mongoose.model('GsHomework', gsHomeworkSchema);

const gsHomeworkSubmissionSchema = new mongoose.Schema({
    homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'GsHomework', required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentCode: { type: String, required: true },
    answers: { type: Array, default: [] },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

const GsHomeworkSubmission = mongoose.models.GsHomeworkSubmission ||
    mongoose.model('GsHomeworkSubmission', gsHomeworkSubmissionSchema);

const gsTournamentSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'عنوان البطولة مطلوب'], trim: true, maxlength: 100 },
    code: { type: String, unique: true, required: true, uppercase: true, match: /^[A-Z0-9]{6}$/ },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true, trim: true },
    questionCount: { type: Number, default: 20, min: 5, max: 100 },
    categoryFilter: { type: String, default: 'all', enum: ['all', 'mcq', 'truefalse', 'complete', 'explain', 'list', 'situations', 'definitions'] },
    timeLimitMinutes: { type: Number, default: 10, min: 5, max: 120 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: {
        type: [{
            text: { type: String, required: true },
            translation: { type: String, default: '' },
            cat: { type: String, required: true },
            options: { type: [String], default: [] },
            correct: { type: mongoose.Schema.Types.Mixed },
            completion: { type: String, default: '' }
        }],
        validate: { validator: arr => arr && arr.length > 0, message: 'يجب إضافة سؤال واحد على الأقل' }
    },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true, trim: true },
        score: { type: Number, default: 0, min: 0, max: 100 },
        correctCount: { type: Number, default: 0 },
        wrongCount: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: [{ questionIndex: Number, answer: String, isCorrect: Boolean }],
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });

gsTournamentSchema.index({ code: 1 });
gsTournamentSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const GsTournament = mongoose.models.GsTournament || mongoose.model('GsTournament', gsTournamentSchema);

// ====================== Progress: نفس نمط progress-internal بالظبط ======================

app.get('/api/progress-gs', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId });
        if (!progress) { progress = new Progress({ userId }); await progress.save(); }
        res.json(progress);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
});

app.post('/api/progress-gs/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        res.json({ success: true, xp: progress.xp });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث XP' }); }
});

app.post('/api/progress-gs/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.bookmarks.includes(questionId)) progress.bookmarks.push(questionId); }
        else { progress.bookmarks = progress.bookmarks.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
});

app.post('/api/progress-gs/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.hardQuestions.includes(questionId)) progress.hardQuestions.push(questionId); }
        else { progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
});

app.post('/api/progress-gs/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.notes.set(questionId, note);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
});

app.post('/api/progress-gs/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), total: total || 0, correct: correct || 0, score: score || 0, chapter: chapter || 'all' });
        if (req.body.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.concat(req.body.wrongQuestions);
            if (progress.wrongQuestions.length > 200) progress.wrongQuestions = progress.wrongQuestions.slice(-200);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
});

app.post('/api/progress-gs/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress.achievements.includes(achievementId)) progress.achievements.push(achievementId);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
});

app.post('/api/progress-gs/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = (req.user.id || req.user.username) + '_gs';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
});

// ====================== الواجبات (Homework) — موديل GsHomework منفصل ======================

app.post('/api/homework-gs', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, deadline, targetGrade, questions } = req.body;
        if (!title || !chapterId || !questionCount || !deadline || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة، ويجب اختيار الأسئلة' });
        }
        const newHomework = new GsHomework({
            title, chapterId, chapterName: chapterName || 'فصل غير معروف', questionCount,
            categoryFilter: categoryFilter || 'all', deadline, targetGrade: targetGrade || 'first',
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newHomework.save();
        res.json({ success: true, message: 'تم إنشاء الواجب بنجاح', homework: newHomework });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' }); }
});

app.get('/api/homework-gs/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworks = await GsHomework.find().sort({ createdAt: -1 });
        if (!homeworks || homeworks.length === 0) return res.status(200).json([]);
        const homeworkWithStats = await Promise.all(homeworks.map(async (hw) => {
            const submissions = await GsHomeworkSubmission.find({ homeworkId: hw._id });
            const totalStudents = await Student.countDocuments({ grade: hw.targetGrade || 'first' });
            let avgScore = '0';
            if (submissions.length > 0) {
                const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
                avgScore = (totalScore / submissions.length).toFixed(1);
            }
            return {
                _id: hw._id, id: hw._id, title: hw.title, chapterId: hw.chapterId,
                chapterName: hw.chapterName, questionCount: hw.questionCount, categoryFilter: hw.categoryFilter,
                deadline: hw.deadline, targetGrade: hw.targetGrade, createdBy: hw.createdBy,
                isActive: hw.isActive, questions: hw.questions || [], totalStudents, submittedCount: submissions.length,
                avgScore, createdAt: hw.createdAt, updatedAt: hw.updatedAt
            };
        }));
        res.status(200).json(homeworkWithStats);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات: ' }); }
});

app.get('/api/homework-gs/pending', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const today = new Date().toISOString().split('T')[0];
        const homeworks = await GsHomework.find({ targetGrade: student.grade, isActive: true, deadline: { $gte: today } }).sort({ deadline: 1 });
        const pendingHomeworks = await Promise.all(homeworks.map(async (hw) => {
            const submission = await GsHomeworkSubmission.findOne({ homeworkId: hw._id, studentId: req.user.username });
            return { ...hw._doc, id: hw._id, isSubmitted: !!submission, hasSubmission: !!submission, myScore: submission ? submission.score : null };
        }));
        res.status(200).json(pendingHomeworks);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' }); }
});

app.get('/api/homework-gs/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homework = await GsHomework.findById(req.params.id);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        if (student.grade !== homework.targetGrade) return res.status(403).json({ error: 'هذا الواجب ليس لصفك' });
        const existingSubmission = await GsHomeworkSubmission.findOne({ homeworkId: homework._id, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        const questionsWithoutAnswers = (homework.questions || []).map(q => ({ ...q, correct: undefined, correctAnswer: undefined, completion: undefined, answer: undefined }));
        res.status(200).json({ ...homework._doc, id: homework._id, questions: questionsWithoutAnswers });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجب: ' }); }
});

app.post('/api/homework-gs/:id/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworkId = req.params.id;
        const { answers, timeTaken, tabSwitches } = req.body;
        const homework = await GsHomework.findById(homeworkId);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existingSubmission = await GsHomeworkSubmission.findOne({ homeworkId, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });

        let correctCount = 0;
        const detailedAnswers = [];
        const questions = homework.questions || [];
        for (const answer of answers || []) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            let isCorrect = false;
            const userAnswer = (answer.answer || '').toString().trim();
            if (question.cat === 'mcq') {
                isCorrect = userAnswer === (question.correct || '').toString().trim();
            } else if (question.cat === 'truefalse') {
                isCorrect = String(question.correct).toLowerCase().trim() === userAnswer.toLowerCase().trim();
            } else {
                const correctStr = (question.completion || question.answer || '').toLowerCase().trim();
                isCorrect = userAnswer.length > 3 && correctStr.length > 0 &&
                    (userAnswer.toLowerCase().includes(correctStr) || correctStr.includes(userAnswer.toLowerCase()));
            }
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: userAnswer, isCorrect });
        }
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const submission = new GsHomeworkSubmission({
            homeworkId: homework._id, studentId: req.user.username, studentName: student.fullName || 'طالب',
            studentCode: student.studentCode || '---', answers: detailedAnswers, score, totalQuestions,
            timeTaken: timeTaken || 0, tabSwitches: tabSwitches || 0
        });
        await submission.save();
        res.json({ success: true, message: 'تم تسليم الواجب بنجاح', score });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسليم الواجب: ' }); }
});

app.get('/api/homework-gs/:id/submissions', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'admin') {
            const submissions = await GsHomeworkSubmission.find({ homeworkId: req.params.id }).sort({ submittedAt: -1 });
            const detailedSubmissions = await Promise.all(submissions.map(async (sub) => {
                const student = await Student.findOne({ username: sub.studentId }).select('fullName studentCode');
                return { ...sub._doc, id: sub._id, studentName: student ? student.fullName : sub.studentName, studentCode: student ? student.studentCode : sub.studentCode };
            }));
            return res.json(detailedSubmissions);
        }
        const submission = await GsHomeworkSubmission.findOne({ homeworkId: req.params.id, studentId: req.user.username });
        if (!submission) return res.status(404).json({ error: 'لم تجد تسليم لهذا الواجب' });
        res.json([submission]);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التسليمات: ' }); }
});

app.delete('/api/homework-gs/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await GsHomework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await GsHomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الواجب: ' }); }
});

// ====================== البطولات (Tournaments) — موديل GsTournament منفصل ======================

async function generateUniqueGsCode() {
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) { code = generateTournamentCode(); exists = await GsTournament.findOne({ code }); attempts++; }
    if (exists) throw new Error('فشل توليد كود فريد بعد عدة محاولات');
    return code;
}

app.post('/api/tournaments-gs', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, timeLimitMinutes, startDate, endDate, questions } = req.body;
        if (!title || !chapterId || !startDate || !endDate) return res.status(400).json({ success: false, error: 'جميع الحقول المطلوبة يجب ملؤها' });
        if (!questions || !Array.isArray(questions) || questions.length === 0) return res.status(400).json({ success: false, error: 'يجب إضافة سؤال واحد على الأقل للبطولة' });
        if (startDate > endDate) return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
        const uniqueCode = await generateUniqueGsCode();
        const newTournament = new GsTournament({
            title: title.trim(), code: uniqueCode, chapterId, chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length, categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: Math.min(Math.max(timeLimitMinutes || 10, 5), 120), startDate, endDate,
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newTournament.save();
        res.status(201).json({ success: true, message: 'تم إنشاء البطولة بنجاح', tournament: newTournament });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' }); }
});

app.get('/api/tournaments-gs/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        const tournaments = await GsTournament.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } })
            .select('title code chapterName questionCount timeLimitMinutes startDate endDate participants').sort({ createdAt: -1 }).lean();
        const result = tournaments.map(t => {
            const participants = t.participants || [];
            const userParticipant = participants.find(p => p.studentId === req.user.username);
            return {
                _id: t._id, title: t.title, code: t.code, chapterName: t.chapterName, questionCount: t.questionCount,
                timeLimitMinutes: t.timeLimitMinutes, startDate: t.startDate, endDate: t.endDate,
                participantsCount: participants.length, hasParticipated: !!userParticipant,
                myScore: userParticipant ? userParticipant.score : null
            };
        });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' }); }
});

app.post('/api/tournaments-gs/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال كود البطولة' });
        const cleanCode = code.toUpperCase().trim();
        const tournament = await GsTournament.findOne({ code: cleanCode, isActive: true });
        if (!tournament) return res.status(404).json({ success: false, error: 'كود البطولة غير صحيح أو البطولة غير متاحة' });
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) return res.status(400).json({ success: false, error: `البطولة لم تبدأ بعد. ستبدأ في ${tournament.startDate}` });
        if (tournament.endDate < today) return res.status(400).json({ success: false, error: 'انتهت مدة البطولة' });
        const alreadyJoined = tournament.participants.find(p => p.studentId === req.user.username);
        if (alreadyJoined) return res.status(400).json({ success: false, error: 'لقد شاركت في هذه البطولة مسبقاً', alreadyParticipated: true, score: alreadyJoined.score });
        const questionsWithoutAnswers = tournament.questions.map(q => ({ text: q.text || '', translation: q.translation || '', cat: q.cat || 'mcq', options: q.options || [] }));
        res.json({ success: true, tournamentId: tournament._id, title: tournament.title, chapterName: tournament.chapterName, timeLimitMinutes: tournament.timeLimitMinutes || 10, endDate: tournament.endDate, questions: questionsWithoutAnswers, message: 'تم التحقق بنجاح. ابدأ الحل الآن!' });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' }); }
});

app.post('/api/tournaments-gs/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        const tournament = await GsTournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة مغلقة وغير متاحة للمشاركة' });
        const existingParticipant = tournament.participants.find(p => p.studentId === req.user.username);
        if (existingParticipant) return res.status(400).json({ success: false, error: 'لقد شاركت بالفعل في هذه البطولة' });

        let correctCount = 0;
        const detailedAnswers = [];
        for (const answer of answers || []) {
            const question = tournament.questions[answer.questionIndex];
            if (!question) { detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect: false }); continue; }
            const isCorrect = correctAnswer(question, answer.answer || '');
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect });
        }
        const totalQuestions = tournament.questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const wrongCount = totalQuestions - correctCount;
        let studentName = req.user.username;
        const student = await Student.findOne({ username: req.user.username });
        if (student) studentName = student.fullName || student.username;

        tournament.participants.push({ studentId: req.user.username, studentName, score, correctCount, wrongCount, timeTaken: timeTaken || 0, answers: detailedAnswers, submittedAt: new Date() });
        tournament.participants.sort((a, b) => b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken);
        await tournament.save();

        const userRank = tournament.participants.findIndex(p => p.studentId === req.user.username) + 1;
        const xpRewards = { 1: 50, 2: 30, 3: 20 };
        const xpReward = xpRewards[userRank] || 10;
        await Progress.findOneAndUpdate({ userId: (req.user.username) + '_gs' }, { $inc: { xp: xpReward } }, { upsert: true, new: true });

        res.json({ success: true, score, rank: userRank, correctCount, wrongCount, totalQuestions, xpEarned: xpReward, message: `أحسنت! حصلت على ${score}%` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' }); }
});

app.get('/api/tournaments-gs/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await GsTournament.findById(req.params.id).select('title chapterName participants winner1 winner2 winner3').lean();
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(p => p.studentId === req.user.username);
            if (!isParticipant) return res.status(403).json({ success: false, error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' });
        }
        const participants = (tournament.participants || []).map((p, index) => ({ rank: index + 1, studentName: p.studentName, score: p.score, correctCount: p.correctCount || 0, wrongCount: p.wrongCount || 0, timeTaken: p.timeTaken, submittedAt: p.submittedAt }));
        res.json({ success: true, title: tournament.title, chapterName: tournament.chapterName, participants, top3: participants.slice(0, 3), totalParticipants: participants.length });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' }); }
});

app.post('/api/tournaments-gs/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await GsTournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة منتهية بالفعل' });
        tournament.isActive = false;
        const participants = tournament.participants || [];
        if (participants[0]) tournament.winner1 = participants[0].studentId;
        if (participants[1]) tournament.winner2 = participants[1].studentId;
        if (participants[2]) tournament.winner3 = participants[2].studentId;
        const winnerRewards = [{ id: tournament.winner1, xp: 100 }, { id: tournament.winner2, xp: 60 }, { id: tournament.winner3, xp: 30 }];
        for (const reward of winnerRewards) {
            if (reward.id) await Progress.findOneAndUpdate({ userId: reward.id + '_gs' }, { $inc: { xp: reward.xp } }, { upsert: true });
        }
        await tournament.save();
        res.json({ success: true, message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح', winners: { first: participants[0]?.studentName || 'لا يوجد', second: participants[1]?.studentName || 'لا يوجد', third: participants[2]?.studentName || 'لا يوجد' } });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' }); }
});

// ====================== المراجعة الذكية (Smart Review) — خاصة بالجراحة العامة ======================

app.post('/api/smart-review-gs', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_gs';
        const { questions: allQuestions, chapterId } = req.body;
        if (!allQuestions || allQuestions.length === 0) return res.status(400).json({ success: false, error: 'لا توجد أسئلة مرسلة من الواجهة' });

        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress._id) await progress.save();

        const wrongQuestions = progress.wrongQuestions || [];
        const difficulties = progress.difficulties || {};
        const hardQuestionIds = Object.entries(difficulties).filter(([k, v]) => v === 'hard').map(([k]) => k);
        const quizHistory = progress.quizHistory || [];
        const now = new Date();
        const oneWeekAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentlySolved = new Set(quizHistory.filter(h => h.date && h.date > oneWeekAgoStr && h.questionId).map(h => h.questionId));
        const solvedQuestions = new Set(quizHistory.filter(h => h.questionId).map(h => h.questionId));

        const reviewQuestions = [];
        for (const q of allQuestions) {
            if (wrongQuestions.some(w => w.questionId === q.questionId)) { reviewQuestions.push({ ...q, reason: '❌ أجبت عليها خطأ' }); continue; }
            if (hardQuestionIds.includes(q.questionId)) { reviewQuestions.push({ ...q, reason: '🔴 صنفتها صعبة' }); continue; }
            if (!recentlySolved.has(q.questionId) && solvedQuestions.has(q.questionId)) { reviewQuestions.push({ ...q, reason: '⏰ مر أكثر من أسبوع' }); continue; }
            if (!solvedQuestions.has(q.questionId) && reviewQuestions.length < 30) reviewQuestions.push({ ...q, reason: '🆕 لم تحل من قبل' });
        }

        const shuffled = reviewQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, Math.max(10, shuffled.length)));
        const reasons = selected.map(q => q.reason);
        const questionsWithoutAnswers = selected.map(q => { const n = { ...q }; delete n.correct; delete n.correctAnswer; delete n.completion; delete n.answer; delete n.reason; return n; });

        let chapterName = 'جميع الفصول';
        if (chapterId && chapterId !== 'all') { const firstQ = allQuestions.find(q => q.chapterId === chapterId); if (firstQ) chapterName = firstQ.chapterName || chapterId; }

        res.json({ success: true, questions: questionsWithoutAnswers, total: selected.length, reasons, chapterName, message: `تم اختيار ${selected.length} سؤال للمراجعة الذكية من ${chapterName}` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' }); }
});

app.post('/api/smart-review-gs/save-progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_gs';
        const { questionId, isCorrect, chapterId } = req.body;
        if (!questionId) return res.status(400).json({ error: 'معرف السؤال مطلوب' });
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), questionId, correct: isCorrect, type: 'smart_review', chapterId: chapterId || 'all' });
        if (!isCorrect) {
            if (!progress.wrongQuestions.some(w => w.questionId === questionId)) progress.wrongQuestions.push({ questionId, date: new Date().toISOString(), source: 'smart_review' });
        } else {
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ التقدم: ' }); }
});

// ==========================================================================
// ملاحظات:
// - verifyToken و isAdmin و connectToDatabase و hashPassword و Progress و Student
//   و Admin و generateTournamentCode و correctAnswer كلها معرّفة بالفعل فوق في
//   ملفك، وهنا بس بنعيد استخدامها — من غير ما نلمسها أو نكررها.
// - الموديلات الجديدة (GsHomework, GsHomeworkSubmission, GsTournament) منفصلة
//   100% عن موديلات باقي البنوك (Homework, Tournament) — صفر تعارض بيانات.
// - تسجيل الدخول (/api/login, /api/verify-session, /api/logout) فضل مشترك
//   عمدًا، لأن الطالب/الأدمن نفسه بيدخل بنفس الحساب على كل البنوك.
// ==========================================================================





// إضافات السيرفر الخاصة ببنك "التشريح - الصف الأول الثانوي" (Anatomy 1st Secondary)
// انسخ الكتلة دي كاملة والصقها في server.js بعد تعريف الموديلات الحالية
// (بعد سطر: const ExamResult = mongoose.models.ExamResult || ...)
// كل حاجة هنا مستقلة تمامًا (موديلات جديدة) فمش هتلمس بيانات أي بنك تاني
// ==========================================================================

// ====================== موديلات خاصة ببنك التشريح (الصف الأول الثانوي) ======================

const an1HomeworkSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, required: true },
    categoryFilter: { type: String, default: 'all' },
    deadline: { type: String, required: true },
    targetGrade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] }
}, { timestamps: true });

const An1Homework = mongoose.models.An1Homework || mongoose.model('An1Homework', an1HomeworkSchema);

const an1HomeworkSubmissionSchema = new mongoose.Schema({
    homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'An1Homework', required: true },
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    studentCode: { type: String, required: true },
    answers: { type: Array, default: [] },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 },
    tabSwitches: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

const An1HomeworkSubmission = mongoose.models.An1HomeworkSubmission ||
    mongoose.model('An1HomeworkSubmission', an1HomeworkSubmissionSchema);

const an1TournamentSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'عنوان البطولة مطلوب'], trim: true, maxlength: 100 },
    code: { type: String, unique: true, required: true, uppercase: true, match: /^[A-Z0-9]{6}$/ },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true, trim: true },
    questionCount: { type: Number, default: 20, min: 5, max: 100 },
    categoryFilter: { type: String, default: 'all', enum: ['all', 'mcq', 'truefalse', 'complete', 'explain', 'list', 'situations', 'definitions'] },
    timeLimitMinutes: { type: Number, default: 10, min: 5, max: 120 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: {
        type: [{
            text: { type: String, required: true },
            translation: { type: String, default: '' },
            cat: { type: String, required: true },
            options: { type: [String], default: [] },
            correct: { type: mongoose.Schema.Types.Mixed },
            completion: { type: String, default: '' }
        }],
        validate: { validator: arr => arr && arr.length > 0, message: 'يجب إضافة سؤال واحد على الأقل' }
    },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true, trim: true },
        score: { type: Number, default: 0, min: 0, max: 100 },
        correctCount: { type: Number, default: 0 },
        wrongCount: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: [{ questionIndex: Number, answer: String, isCorrect: Boolean }],
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });

an1TournamentSchema.index({ code: 1 });
an1TournamentSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const An1Tournament = mongoose.models.An1Tournament || mongoose.model('An1Tournament', an1TournamentSchema);

// ====================== Progress: نفس نمط progress-internal بالظبط ======================

app.get('/api/progress-an1', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId });
        if (!progress) { progress = new Progress({ userId }); await progress.save(); }
        res.json(progress);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
});

app.post('/api/progress-an1/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        res.json({ success: true, xp: progress.xp });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث XP' }); }
});

app.post('/api/progress-an1/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.bookmarks.includes(questionId)) progress.bookmarks.push(questionId); }
        else { progress.bookmarks = progress.bookmarks.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
});

app.post('/api/progress-an1/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (action === 'add') { if (!progress.hardQuestions.includes(questionId)) progress.hardQuestions.push(questionId); }
        else { progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId); }
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
});

app.post('/api/progress-an1/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.notes.set(questionId, note);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
});

app.post('/api/progress-an1/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), total: total || 0, correct: correct || 0, score: score || 0, chapter: chapter || 'all' });
        if (req.body.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.concat(req.body.wrongQuestions);
            if (progress.wrongQuestions.length > 200) progress.wrongQuestions = progress.wrongQuestions.slice(-200);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
});

app.post('/api/progress-an1/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress.achievements.includes(achievementId)) progress.achievements.push(achievementId);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
});

app.post('/api/progress-an1/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = (req.user.id || req.user.username) + '_an1';
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
});

// ====================== الواجبات (Homework) — موديل An1Homework منفصل ======================

app.post('/api/homework-an1', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, deadline, targetGrade, questions } = req.body;
        if (!title || !chapterId || !questionCount || !deadline || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة، ويجب اختيار الأسئلة' });
        }
        const newHomework = new An1Homework({
            title, chapterId, chapterName: chapterName || 'فصل غير معروف', questionCount,
            categoryFilter: categoryFilter || 'all', deadline, targetGrade: targetGrade || 'first',
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newHomework.save();
        res.json({ success: true, message: 'تم إنشاء الواجب بنجاح', homework: newHomework });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' }); }
});

app.get('/api/homework-an1/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworks = await An1Homework.find().sort({ createdAt: -1 });
        if (!homeworks || homeworks.length === 0) return res.status(200).json([]);
        const homeworkWithStats = await Promise.all(homeworks.map(async (hw) => {
            const submissions = await An1HomeworkSubmission.find({ homeworkId: hw._id });
            const totalStudents = await Student.countDocuments({ grade: hw.targetGrade || 'first' });
            let avgScore = '0';
            if (submissions.length > 0) {
                const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
                avgScore = (totalScore / submissions.length).toFixed(1);
            }
            return {
                _id: hw._id, id: hw._id, title: hw.title, chapterId: hw.chapterId,
                chapterName: hw.chapterName, questionCount: hw.questionCount, categoryFilter: hw.categoryFilter,
                deadline: hw.deadline, targetGrade: hw.targetGrade, createdBy: hw.createdBy,
                isActive: hw.isActive, questions: hw.questions || [], totalStudents, submittedCount: submissions.length,
                avgScore, createdAt: hw.createdAt, updatedAt: hw.updatedAt
            };
        }));
        res.status(200).json(homeworkWithStats);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات: ' }); }
});

app.get('/api/homework-an1/pending', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const today = new Date().toISOString().split('T')[0];
        const homeworks = await An1Homework.find({ targetGrade: student.grade, isActive: true, deadline: { $gte: today } }).sort({ deadline: 1 });
        const pendingHomeworks = await Promise.all(homeworks.map(async (hw) => {
            const submission = await An1HomeworkSubmission.findOne({ homeworkId: hw._id, studentId: req.user.username });
            return { ...hw._doc, id: hw._id, isSubmitted: !!submission, hasSubmission: !!submission, myScore: submission ? submission.score : null };
        }));
        res.status(200).json(pendingHomeworks);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' }); }
});

app.get('/api/homework-an1/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homework = await An1Homework.findById(req.params.id);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        if (student.grade !== homework.targetGrade) return res.status(403).json({ error: 'هذا الواجب ليس لصفك' });
        const existingSubmission = await An1HomeworkSubmission.findOne({ homeworkId: homework._id, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        const questionsWithoutAnswers = (homework.questions || []).map(q => ({ ...q, correct: undefined, correctAnswer: undefined, completion: undefined, answer: undefined }));
        res.status(200).json({ ...homework._doc, id: homework._id, questions: questionsWithoutAnswers });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الواجب: ' }); }
});

app.post('/api/homework-an1/:id/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworkId = req.params.id;
        const { answers, timeTaken, tabSwitches } = req.body;
        const homework = await An1Homework.findById(homeworkId);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existingSubmission = await An1HomeworkSubmission.findOne({ homeworkId, studentId: req.user.username });
        if (existingSubmission) return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });

        let correctCount = 0;
        const detailedAnswers = [];
        const questions = homework.questions || [];
        for (const answer of answers || []) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            let isCorrect = false;
            const userAnswer = (answer.answer || '').toString().trim();
            if (question.cat === 'mcq') {
                isCorrect = userAnswer === (question.correct || '').toString().trim();
            } else if (question.cat === 'truefalse') {
                isCorrect = String(question.correct).toLowerCase().trim() === userAnswer.toLowerCase().trim();
            } else {
                const correctStr = (question.completion || question.answer || '').toLowerCase().trim();
                isCorrect = userAnswer.length > 3 && correctStr.length > 0 &&
                    (userAnswer.toLowerCase().includes(correctStr) || correctStr.includes(userAnswer.toLowerCase()));
            }
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: userAnswer, isCorrect });
        }
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const submission = new An1HomeworkSubmission({
            homeworkId: homework._id, studentId: req.user.username, studentName: student.fullName || 'طالب',
            studentCode: student.studentCode || '---', answers: detailedAnswers, score, totalQuestions,
            timeTaken: timeTaken || 0, tabSwitches: tabSwitches || 0
        });
        await submission.save();
        res.json({ success: true, message: 'تم تسليم الواجب بنجاح', score });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسليم الواجب: ' }); }
});

app.get('/api/homework-an1/:id/submissions', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'admin') {
            const submissions = await An1HomeworkSubmission.find({ homeworkId: req.params.id }).sort({ submittedAt: -1 });
            const detailedSubmissions = await Promise.all(submissions.map(async (sub) => {
                const student = await Student.findOne({ username: sub.studentId }).select('fullName studentCode');
                return { ...sub._doc, id: sub._id, studentName: student ? student.fullName : sub.studentName, studentCode: student ? student.studentCode : sub.studentCode };
            }));
            return res.json(detailedSubmissions);
        }
        const submission = await An1HomeworkSubmission.findOne({ homeworkId: req.params.id, studentId: req.user.username });
        if (!submission) return res.status(404).json({ error: 'لم تجد تسليم لهذا الواجب' });
        res.json([submission]);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب التسليمات: ' }); }
});

app.delete('/api/homework-an1/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await An1Homework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await An1HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الواجب: ' }); }
});

// ====================== البطولات (Tournaments) — موديل An1Tournament منفصل ======================

async function generateUniqueAn1Code() {
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) { code = generateTournamentCode(); exists = await An1Tournament.findOne({ code }); attempts++; }
    if (exists) throw new Error('فشل توليد كود فريد بعد عدة محاولات');
    return code;
}

app.post('/api/tournaments-an1', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, timeLimitMinutes, startDate, endDate, questions } = req.body;
        if (!title || !chapterId || !startDate || !endDate) return res.status(400).json({ success: false, error: 'جميع الحقول المطلوبة يجب ملؤها' });
        if (!questions || !Array.isArray(questions) || questions.length === 0) return res.status(400).json({ success: false, error: 'يجب إضافة سؤال واحد على الأقل للبطولة' });
        if (startDate > endDate) return res.status(400).json({ success: false, error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' });
        const uniqueCode = await generateUniqueAn1Code();
        const newTournament = new An1Tournament({
            title: title.trim(), code: uniqueCode, chapterId, chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length, categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: Math.min(Math.max(timeLimitMinutes || 10, 5), 120), startDate, endDate,
            createdBy: req.user.username || 'admin', questions, isActive: true
        });
        await newTournament.save();
        res.status(201).json({ success: true, message: 'تم إنشاء البطولة بنجاح', tournament: newTournament });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' }); }
});

app.get('/api/tournaments-an1/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        const tournaments = await An1Tournament.find({ isActive: true, startDate: { $lte: today }, endDate: { $gte: today } })
            .select('title code chapterName questionCount timeLimitMinutes startDate endDate participants').sort({ createdAt: -1 }).lean();
        const result = tournaments.map(t => {
            const participants = t.participants || [];
            const userParticipant = participants.find(p => p.studentId === req.user.username);
            return {
                _id: t._id, title: t.title, code: t.code, chapterName: t.chapterName, questionCount: t.questionCount,
                timeLimitMinutes: t.timeLimitMinutes, startDate: t.startDate, endDate: t.endDate,
                participantsCount: participants.length, hasParticipated: !!userParticipant,
                myScore: userParticipant ? userParticipant.score : null
            };
        });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' }); }
});

app.post('/api/tournaments-an1/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'يرجى إدخال كود البطولة' });
        const cleanCode = code.toUpperCase().trim();
        const tournament = await An1Tournament.findOne({ code: cleanCode, isActive: true });
        if (!tournament) return res.status(404).json({ success: false, error: 'كود البطولة غير صحيح أو البطولة غير متاحة' });
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) return res.status(400).json({ success: false, error: `البطولة لم تبدأ بعد. ستبدأ في ${tournament.startDate}` });
        if (tournament.endDate < today) return res.status(400).json({ success: false, error: 'انتهت مدة البطولة' });
        const alreadyJoined = tournament.participants.find(p => p.studentId === req.user.username);
        if (alreadyJoined) return res.status(400).json({ success: false, error: 'لقد شاركت في هذه البطولة مسبقاً', alreadyParticipated: true, score: alreadyJoined.score });
        const questionsWithoutAnswers = tournament.questions.map(q => ({ text: q.text || '', translation: q.translation || '', cat: q.cat || 'mcq', options: q.options || [] }));
        res.json({ success: true, tournamentId: tournament._id, title: tournament.title, chapterName: tournament.chapterName, timeLimitMinutes: tournament.timeLimitMinutes || 10, endDate: tournament.endDate, questions: questionsWithoutAnswers, message: 'تم التحقق بنجاح. ابدأ الحل الآن!' });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' }); }
});

app.post('/api/tournaments-an1/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        const tournament = await An1Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة مغلقة وغير متاحة للمشاركة' });
        const existingParticipant = tournament.participants.find(p => p.studentId === req.user.username);
        if (existingParticipant) return res.status(400).json({ success: false, error: 'لقد شاركت بالفعل في هذه البطولة' });

        let correctCount = 0;
        const detailedAnswers = [];
        for (const answer of answers || []) {
            const question = tournament.questions[answer.questionIndex];
            if (!question) { detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect: false }); continue; }
            const isCorrect = correctAnswer(question, answer.answer || '');
            if (isCorrect) correctCount++;
            detailedAnswers.push({ questionIndex: answer.questionIndex, answer: answer.answer || '', isCorrect });
        }
        const totalQuestions = tournament.questions.length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const wrongCount = totalQuestions - correctCount;
        let studentName = req.user.username;
        const student = await Student.findOne({ username: req.user.username });
        if (student) studentName = student.fullName || student.username;

        tournament.participants.push({ studentId: req.user.username, studentName, score, correctCount, wrongCount, timeTaken: timeTaken || 0, answers: detailedAnswers, submittedAt: new Date() });
        tournament.participants.sort((a, b) => b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken);
        await tournament.save();

        const userRank = tournament.participants.findIndex(p => p.studentId === req.user.username) + 1;
        const xpRewards = { 1: 50, 2: 30, 3: 20 };
        const xpReward = xpRewards[userRank] || 10;
        await Progress.findOneAndUpdate({ userId: (req.user.username) + '_an1' }, { $inc: { xp: xpReward } }, { upsert: true, new: true });

        res.json({ success: true, score, rank: userRank, correctCount, wrongCount, totalQuestions, xpEarned: xpReward, message: `أحسنت! حصلت على ${score}%` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' }); }
});

app.get('/api/tournaments-an1/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await An1Tournament.findById(req.params.id).select('title chapterName participants winner1 winner2 winner3').lean();
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(p => p.studentId === req.user.username);
            if (!isParticipant) return res.status(403).json({ success: false, error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' });
        }
        const participants = (tournament.participants || []).map((p, index) => ({ rank: index + 1, studentName: p.studentName, score: p.score, correctCount: p.correctCount || 0, wrongCount: p.wrongCount || 0, timeTaken: p.timeTaken, submittedAt: p.submittedAt }));
        res.json({ success: true, title: tournament.title, chapterName: tournament.chapterName, participants, top3: participants.slice(0, 3), totalParticipants: participants.length });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' }); }
});

app.post('/api/tournaments-an1/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await An1Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ success: false, error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ success: false, error: 'البطولة منتهية بالفعل' });
        tournament.isActive = false;
        const participants = tournament.participants || [];
        if (participants[0]) tournament.winner1 = participants[0].studentId;
        if (participants[1]) tournament.winner2 = participants[1].studentId;
        if (participants[2]) tournament.winner3 = participants[2].studentId;
        const winnerRewards = [{ id: tournament.winner1, xp: 100 }, { id: tournament.winner2, xp: 60 }, { id: tournament.winner3, xp: 30 }];
        for (const reward of winnerRewards) {
            if (reward.id) await Progress.findOneAndUpdate({ userId: reward.id + '_an1' }, { $inc: { xp: reward.xp } }, { upsert: true });
        }
        await tournament.save();
        res.json({ success: true, message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح', winners: { first: participants[0]?.studentName || 'لا يوجد', second: participants[1]?.studentName || 'لا يوجد', third: participants[2]?.studentName || 'لا يوجد' } });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' }); }
});

// ====================== المراجعة الذكية (Smart Review) — خاصة بالتشريح (الصف الأول الثانوي) ======================

app.post('/api/smart-review-an1', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_an1';
        const { questions: allQuestions, chapterId } = req.body;
        if (!allQuestions || allQuestions.length === 0) return res.status(400).json({ success: false, error: 'لا توجد أسئلة مرسلة من الواجهة' });

        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        if (!progress._id) await progress.save();

        const wrongQuestions = progress.wrongQuestions || [];
        const difficulties = progress.difficulties || {};
        const hardQuestionIds = Object.entries(difficulties).filter(([k, v]) => v === 'hard').map(([k]) => k);
        const quizHistory = progress.quizHistory || [];
        const now = new Date();
        const oneWeekAgoStr = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recentlySolved = new Set(quizHistory.filter(h => h.date && h.date > oneWeekAgoStr && h.questionId).map(h => h.questionId));
        const solvedQuestions = new Set(quizHistory.filter(h => h.questionId).map(h => h.questionId));

        const reviewQuestions = [];
        for (const q of allQuestions) {
            if (wrongQuestions.some(w => w.questionId === q.questionId)) { reviewQuestions.push({ ...q, reason: '❌ أجبت عليها خطأ' }); continue; }
            if (hardQuestionIds.includes(q.questionId)) { reviewQuestions.push({ ...q, reason: '🔴 صنفتها صعبة' }); continue; }
            if (!recentlySolved.has(q.questionId) && solvedQuestions.has(q.questionId)) { reviewQuestions.push({ ...q, reason: '⏰ مر أكثر من أسبوع' }); continue; }
            if (!solvedQuestions.has(q.questionId) && reviewQuestions.length < 30) reviewQuestions.push({ ...q, reason: '🆕 لم تحل من قبل' });
        }

        const shuffled = reviewQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, Math.max(10, shuffled.length)));
        const reasons = selected.map(q => q.reason);
        const questionsWithoutAnswers = selected.map(q => { const n = { ...q }; delete n.correct; delete n.correctAnswer; delete n.completion; delete n.answer; delete n.reason; return n; });

        let chapterName = 'جميع الفصول';
        if (chapterId && chapterId !== 'all') { const firstQ = allQuestions.find(q => q.chapterId === chapterId); if (firstQ) chapterName = firstQ.chapterName || chapterId; }

        res.json({ success: true, questions: questionsWithoutAnswers, total: selected.length, reasons, chapterName, message: `تم اختيار ${selected.length} سؤال للمراجعة الذكية من ${chapterName}` });
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' }); }
});

app.post('/api/smart-review-an1/save-progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = (req.user.username || req.user.id) + '_an1';
        const { questionId, isCorrect, chapterId } = req.body;
        if (!questionId) return res.status(400).json({ error: 'معرف السؤال مطلوب' });
        let progress = await Progress.findOne({ userId }) || new Progress({ userId });
        progress.quizHistory.push({ date: new Date().toISOString(), questionId, correct: isCorrect, type: 'smart_review', chapterId: chapterId || 'all' });
        if (!isCorrect) {
            if (!progress.wrongQuestions.some(w => w.questionId === questionId)) progress.wrongQuestions.push({ questionId, date: new Date().toISOString(), source: 'smart_review' });
        } else {
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        }
        await progress.save();
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ التقدم: ' }); }
});

// ==========================================================================
// ملاحظات:
// - verifyToken و isAdmin و connectToDatabase و hashPassword و Progress و Student
//   و Admin و generateTournamentCode و correctAnswer كلها معرّفة بالفعل فوق في
//   ملفك، وهنا بس بنعيد استخدامها — من غير ما نلمسها أو نكررها.
// - الموديلات الجديدة (An1Homework, An1HomeworkSubmission, An1Tournament) منفصلة
//   100% عن موديلات باقي البنوك (Homework, Tournament) — صفر تعارض بيانات.
// - تسجيل الدخول (/api/login, /api/verify-session, /api/logout) فضل مشترك
//   عمدًا، لأن الطالب/الأدمن نفسه بيدخل بنفس الحساب على كل البنوك.
// ==========================================================================


// ====================== نموذج الواجبات (Homework Schema) ======================
const homeworkSchema = new mongoose.Schema({
    title: { type: String, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, required: true },
    categoryFilter: { type: String, default: 'all' },
    deadline: { type: String, required: true }, // صيغة YYYY-MM-DD
    targetGrade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] } // تخزين الأسئلة المختارة للواجب
}, { timestamps: true });

const Homework = mongoose.models.Homework || mongoose.model('Homework', homeworkSchema);

// ====================== نموذج تسليم الواجب (Homework Submission) ======================
const homeworkSubmissionSchema = new mongoose.Schema({
    homeworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Homework', required: true },
    studentId: { type: String, required: true }, // username
    studentName: { type: String, required: true },
    studentCode: { type: String, required: true },
    answers: { type: Array, default: [] }, // [{questionIndex: 0, answer: '...', isCorrect: true/false}]
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timeTaken: { type: Number, default: 0 }, // بالثواني
    tabSwitches: { type: Number, default: 0 }, // عدد مرات تبديل التبويب
    submittedAt: { type: Date, default: Date.now }
});

const HomeworkSubmission = mongoose.models.HomeworkSubmission || mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);


// ====================== Schema البطولات ======================
const tournamentSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, 'عنوان البطولة مطلوب'],
        trim: true,
        maxlength: [100, 'العنوان يجب أن لا يتجاوز 100 حرف']
    },
    code: { 
        type: String, 
        unique: true, 
        required: true,
        uppercase: true,
        match: [/^[A-Z0-9]{6}$/, 'الكود يجب أن يتكون من 6 أحرف وأرقام إنجليزية']
    },
    chapterId: { 
        type: String, 
        required: [true, 'معرف الفصل مطلوب'] 
    },
    chapterName: { 
        type: String, 
        required: [true, 'اسم الفصل مطلوب'],
        trim: true
    },
    questionCount: { 
        type: Number, 
        default: 20,
        min: [5, 'الحد الأدنى 5 أسئلة'],
        max: [100, 'الحد الأقصى 100 سؤال']
    },
    categoryFilter: { 
        type: String, 
        default: 'all',
        enum: ['all', 'mcq', 'truefalse', 'complete', 'explain', 'list', 'situations']
    },
    timeLimitMinutes: { 
        type: Number, 
        default: 10,
        min: [5, 'الحد الأدنى للوقت 5 دقائق'],
        max: [120, 'الحد الأقصى للوقت 120 دقيقة']
    },
    startDate: { 
        type: String, 
        required: [true, 'تاريخ البداية مطلوب'],
        validate: {
            validator: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
            message: 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)'
        }
    },
    endDate: { 
        type: String, 
        required: [true, 'تاريخ النهاية مطلوب'],
        validate: {
            validator: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
            message: 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)'
        }
    },
    createdBy: { 
        type: String, 
        default: 'admin',
        trim: true
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    questions: {
        type: [{
            text: { type: String, required: true },
            translation: { type: String, default: '' },
            cat: { 
                type: String, 
                required: true,
                enum: ['mcq', 'truefalse', 'complete', 'explain', 'list', 'situations']
            },
            options: { type: [String], default: [] },
            correct: { type: mongoose.Schema.Types.Mixed },
            completion: { type: String, default: '' }
        }],
        validate: {
            validator: arr => arr && arr.length > 0,
            message: 'يجب إضافة سؤال واحد على الأقل'
        }
    },
    participants: [{
        studentId: { 
            type: String, 
            required: true 
        },
        studentName: { 
            type: String, 
            required: true,
            trim: true
        },
        score: { 
            type: Number, 
            default: 0,
            min: 0,
            max: 100
        },
        correctCount: {
            type: Number,
            default: 0,
            min: 0
        },
        wrongCount: {
            type: Number,
            default: 0,
            min: 0
        },
        timeTaken: { 
            type: Number, 
            default: 0,
            min: 0
        },
        answers: [{
            questionIndex: { type: Number, required: true },
            answer: { type: String, default: '' },
            isCorrect: { type: Boolean, default: false }
        }],
        submittedAt: { 
            type: Date, 
            default: Date.now 
        }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// مؤشرات للبحث السريع
tournamentSchema.index({ code: 1 });
tournamentSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
tournamentSchema.index({ 'participants.studentId': 1 });

// دوال افتراضية
tournamentSchema.virtual('totalParticipants').get(function() {
    return (this.participants || []).length;
});

tournamentSchema.virtual('isExpired').get(function() {
    const today = new Date().toISOString().split('T')[0];
    return this.endDate < today;
});

tournamentSchema.virtual('isStarted').get(function() {
    const today = new Date().toISOString().split('T')[0];
    return this.startDate <= today;
});

const Tournament = mongoose.models.Tournament || 
    mongoose.model('Tournament', tournamentSchema);



// ====================== تحديث نموذج الفعاليات (Events Schema) ======================
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['news', 'video', 'image', 'article', 'audio', 'post'], default: 'post' },
    content: { type: String, required: true },
    mediaUrl: { type: String, default: '' },
    author: { type: String, default: 'admin' },
    date: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    
    // ✅ مميزات جديدة
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: String }], // قائمة usernames الذين أعجبوا
    isPinned: { type: Boolean, default: false }, // ✅ تثبيت الفعالية
    tags: [{ type: String }], // ✅ التصنيفات
    shareUrl: { type: String, default: '' }
}, { timestamps: true });

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

// ====================== APIs الفعاليات المحسّنة ======================

// جلب جميع الفعاليات (مع دعم البحث والفلترة)
app.get('/api/events', async (req, res) => {
    try {
        await connectToDatabase();
        const { search, tag, type, pinned } = req.query;
        
        let filter = { isActive: true };
        
        // البحث في العنوان والمحتوى
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { title: searchRegex },
                { content: searchRegex },
                { tags: searchRegex }
            ];
        }
        
        // فلترة حسب التصنيف
        if (tag && tag !== 'all') {
            filter.tags = tag;
        }
        
        // فلترة حسب النوع
        if (type && type !== 'all') {
            filter.type = type;
        }
        
        // فلترة الفعاليات المثبتة فقط
        if (pinned === 'true') {
            filter.isPinned = true;
        }
        
        const events = await Event.find(filter).sort({ 
            isPinned: -1, // المثبتة أولاً
            date: -1 
        });
        
        res.json(events);
    } catch (error) {
        console.error('❌ خطأ في جلب الفعاليات:', error);
        res.status(500).json({ error: 'خطأ في جلب الفعاليات' });
    }
});

// جلب الفعاليات المثبتة فقط (للعرض المميز)
app.get('/api/events/pinned', async (req, res) => {
    try {
        await connectToDatabase();
        const events = await Event.find({ 
            isActive: true, 
            isPinned: true 
        }).sort({ date: -1 }).limit(5);
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الفعاليات المثبتة' });
    }
});

// جلب جميع التصنيفات المستخدمة
app.get('/api/events/tags', async (req, res) => {
    try {
        await connectToDatabase();
        const tags = await Event.distinct('tags', { isActive: true });
        res.json(tags);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب التصنيفات' });
    }
});

// إضافة فعالية (للأدمن)
app.post('/api/events', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, type, content, mediaUrl, tags, isPinned } = req.body;
        if (!title || !content) return res.status(400).json({ error: 'العنوان والمحتوى مطلوبان' });
        
        // معالجة التصنيفات
        let processedTags = [];
        if (tags) {
            if (typeof tags === 'string') {
                processedTags = tags.split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(tags)) {
                processedTags = tags;
            }
        }
        
        const newEvent = new Event({
            title,
            type: type || 'post',
            content,
            mediaUrl: mediaUrl || '',
            author: req.user?.username || 'admin',
            date: new Date(),
            tags: processedTags,
            isPinned: isPinned || false,
            views: 0,
            likes: 0,
            likedBy: []
        });
        await newEvent.save();
        res.json({ success: true, message: 'تم إضافة الفعالية بنجاح', event: newEvent });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الفعالية: ' });
    }
});

// تحديث فعالية (للأدمن)
app.put('/api/events/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, type, content, mediaUrl, tags, isPinned } = req.body;
        
        let processedTags = [];
        if (tags) {
            if (typeof tags === 'string') {
                processedTags = tags.split(',').map(t => t.trim()).filter(t => t);
            } else if (Array.isArray(tags)) {
                processedTags = tags;
            }
        }
        
        const updated = await Event.findByIdAndUpdate(
            req.params.id,
            { 
                title, 
                type, 
                content, 
                mediaUrl, 
                tags: processedTags,
                isPinned: isPinned || false
            },
            { new: true }
        );
        
        if (!updated) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        res.json({ success: true, message: 'تم تحديث الفعالية', event: updated });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث الفعالية' });
    }
});

// تثبيت/إلغاء تثبيت فعالية
app.put('/api/events/:id/pin', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        event.isPinned = !event.isPinned;
        await event.save();
        
        res.json({ 
            success: true, 
            message: event.isPinned ? '✅ تم تثبيت الفعالية' : '📌 تم إلغاء التثبيت',
            isPinned: event.isPinned
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تثبيت الفعالية' });
    }
});

// حذف فعالية
app.delete('/api/events/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Event.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        res.json({ success: true, message: 'تم حذف الفعالية بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الفعالية' });
    }
});

// ✅ زيادة عداد المشاهدات
app.post('/api/events/:id/view', async (req, res) => {
    try {
        await connectToDatabase();
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        event.views = (event.views || 0) + 1;
        await event.save();
        
        res.json({ success: true, views: event.views });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث المشاهدات' });
    }
});

// ✅ الإعجاب بفعالية
app.post('/api/events/:id/like', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user?.username || req.user?.id || req.ip;
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        // التحقق من عدم الإعجاب مسبقاً
        if (event.likedBy.includes(userId)) {
            return res.json({ 
                success: true, 
                message: 'لقد أعجبت بهذه الفعالية مسبقاً',
                likes: event.likes,
                liked: true
            });
        }
        
        event.likes = (event.likes || 0) + 1;
        event.likedBy.push(userId);
        await event.save();
        
        res.json({ 
            success: true, 
            message: '❤️ تم الإعجاب',
            likes: event.likes,
            liked: true
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الإعجاب' });
    }
});

// ✅ إلغاء الإعجاب
app.post('/api/events/:id/unlike', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user?.username || req.user?.id || req.ip;
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        if (!event.likedBy.includes(userId)) {
            return res.json({ 
                success: true, 
                message: 'لم تعجب بهذه الفعالية',
                likes: event.likes,
                liked: false
            });
        }
        
        event.likes = Math.max(0, (event.likes || 0) - 1);
        event.likedBy = event.likedBy.filter(id => id !== userId);
        await event.save();
        
        res.json({ 
            success: true, 
            message: 'تم إلغاء الإعجاب',
            likes: event.likes,
            liked: false
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إلغاء الإعجاب' });
    }
});

// ✅ التحقق من حالة الإعجاب
app.get('/api/events/:id/liked', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user?.username || req.user?.id;
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        const liked = event.likedBy.includes(userId);
        res.json({ liked, likes: event.likes });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في التحقق' });
    }
});

// ✅ إحصائيات الفعاليات (للأدمن)
app.get('/api/events/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const totalEvents = await Event.countDocuments({ isActive: true });
        const totalViews = await Event.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: '$views' } } }
        ]);
        const totalLikes = await Event.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: '$likes' } } }
        ]);
        const pinnedCount = await Event.countDocuments({ isActive: true, isPinned: true });
        
        // أكثر الفعاليات مشاهدة
        const topViewed = await Event.find({ isActive: true })
            .sort({ views: -1 })
            .limit(5)
            .select('title views');
        
        // أكثر الفعاليات إعجاباً
        const topLiked = await Event.find({ isActive: true })
            .sort({ likes: -1 })
            .limit(5)
            .select('title likes');
        
        res.json({
            totalEvents,
            totalViews: totalViews[0]?.total || 0,
            totalLikes: totalLikes[0]?.total || 0,
            pinnedCount,
            topViewed,
            topLiked
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});




// ====================== نموذج الملفات (File Schema) ======================
const fileSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    size: { type: Number },
    type: { type: String },
    grade: { type: String, enum: ['first', 'second', 'third'], required: true },
    subject: { type: String, required: true },
    downloads: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploadedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const File = mongoose.models.File || mongoose.model('File', fileSchema);


// ====================== نموذج تقدم الطالب ======================
const progressSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: String, default: 'beginner' },
    bookmarks: { type: [String], default: [] },
    hardQuestions: { type: [String], default: [] },
    notes: { type: Map, of: String, default: {} },
    difficulties: { type: Map, of: String, default: {} },
    achievements: { type: [String], default: [] },
    quizHistory: { type: Array, default: [] },
    wrongQuestions: { type: Array, default: [] }
}, { timestamps: true });

const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);

const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const Violation = mongoose.models.Violation || mongoose.model('Violation', violationSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const PushToken = mongoose.models.PushToken || mongoose.model('PushToken', pushTokenSchema);const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
const AttendanceAlert = mongoose.models.AttendanceAlert || mongoose.model('AttendanceAlert', attendanceAlertSchema);
const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
const ExamResult = mongoose.models.ExamResult || mongoose.model('ExamResult', examResultSchema);
const ArchivedResult = mongoose.models.ArchivedResult || mongoose.model('ArchivedResult', archivedResultSchema);

// ====================== رسايل الطلاب للأدمن (من Chat X) ======================
// senderId/senderName بيفضلوا null دايمًا لو anonymous = true — لأن السيرفر
// أصلاً معرفش هوية المرسل وقت الإرسال (مفيش Authorization header اتبعت مع
// الطلب لو الطالب اختار "من غير اسمي")، مش لأننا بس بنخفيهم في العرض.
const adminMessageSchema = new mongoose.Schema({
    text: { type: String, required: true, maxlength: 2000 },
    anonymous: { type: Boolean, default: false },
    senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: null },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const AdminMessage = mongoose.models.AdminMessage || mongoose.model('AdminMessage', adminMessageSchema);

// ====================== تقييم ردود الذكاء الاصطناعي 👍/👎 (من Chat X) ======================
// أي طالب (عادي أو Premium) يقدر يقيّم أي رد بوت في محادثته. الهدف إن الأدمن يعرف
// فعليًا أي موديل بيدي إجابات ضعيفة، بدل ما يعتمد بس على شكاوى بتوصله بالصدفة.
// studentCode بييجي من التوكن نفسه (مش من جسم الطلب) عشان محدش يقدر ينتحل شخصية
// طالب تاني وهو بيبعت تقييم. clientMessageId مُعرِّف الرسالة من الفرونت إند (ثابت لكل
// رسالة في نفس المحادثة عند نفس الطالب) — بنستخدمه مع studentCode كمفتاح فريد
// (upsert) عشان دوسة تانية على نفس الزرار تحدّث نفس السجل بدل ما تضيف تكرار.
const messageRatingSchema = new mongoose.Schema({
    studentCode: { type: String, required: true, index: true },
    clientMessageId: { type: String, required: true },
    model: { type: String, required: true, index: true }, // 'cerebras' / 'claude-opus' / 'groq' / ... (قيمة msg.source من الفرونت إند)
    rating: { type: String, enum: ['up', 'down'], required: true },
    excerpt: { type: String, default: '' } // أول ~200 حرف من رد البوت — للسياق بس وقت مراجعة الأدمن
}, { timestamps: true });
messageRatingSchema.index({ studentCode: 1, clientMessageId: 1 }, { unique: true });
const MessageRating = mongoose.models.MessageRating || mongoose.model('MessageRating', messageRatingSchema);

// ====================== دوال مساعدة ======================
// مدة صلاحية الجلسة — كانت 24 ساعة بس (تخلي الطالب يضطر يعمل تسجيل دخول/ربط من
// جديد كل يوم)، رفعناها لـ 30 يوم عشان يفضل مسجّل دخول تلقائيًا. الأمان اللي كان
// بيعتمد على قصر المدة دلوقتي بيعتمد بدل منه على قفل "جلسة واحدة بس في نفس الوقت"
// (شوف activeSessionId تحت) بدل ما يعتمد على انتهاء صلاحية سريع.
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوم
const SESSION_JWT_EXPIRY = '30d';
// أد إيه من الوقت من غير أي heartbeat قبل ما نعتبر إن الجلسة "ماتت" (الجهاز قفل
// التطبيق من غير تسجيل خروج صريح) ونسمح لجهاز تاني يسجل دخول بنفس الحساب.
const SESSION_ALIVE_WINDOW_MS = 5 * 60 * 1000; // 5 دقايق

function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_MS,
        path: '/'
    });
}

function verifyToken(req, res, next) {
    let token = req.cookies?.authToken;
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader?.split(' ')[1];
    }
    if (!token) return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
}

function isAdmin(req, res, next) {
    if (!req.user || req.user.type !== 'admin') return res.status(403).json({ error: 'غير مصرح. هذه الصفحة للأدمن فقط' });
    next();
}

// ميدلوير عام لأي فيتشر Premium — الأدمن عنده كل حاجة تلقائي (زي باقي الموقع)،
// والطالب لازم يكون مفعّل عنده المفتاح ده بالظبط في premiumFeatures. لازم يجي
// بعد verifyToken في السلسلة عشان يعتمد على req.user. مختلف عن باقي الفحوصات
// في الموقع (اللي كلها client-side بس) لأن الفيتشرز دي بتستهلك API خارجي
// بتكلفة حقيقية (Gemini)، فمستاهلة حماية على السيرفر مش بس في الفرونت إند.
function requirePremium(featureKey) {
    return async (req, res, next) => {
        try {
            if (req.user?.type === 'admin') return next();
            if (req.user?.type !== 'student') return res.status(403).json({ error: 'غير مصرح' });
            await connectToDatabase();
            const student = await Student.findOne({ username: req.user.username }).select('premiumFeatures');
            if (!student || !(student.premiumFeatures || []).includes(featureKey)) {
                return res.status(403).json({ error: 'الميزة دي محتاجة تفعيل Premium من الأدمن' });
            }
            next();
        } catch (error) {
            res.status(500).json({ error: 'خطأ في التحقق من الاشتراك' });
        }
    };
}

// مدير المعهد فقط: أي أدمن قديم بدون role (أو role = 'admin') يُعامل كمدير معهد للتوافق مع الحسابات الحالية
function isManager(req, res, next) {
    if (!req.user || req.user.type !== 'admin') return res.status(403).json({ error: 'غير مصرح. هذه الصفحة للأدمن فقط' });
    if (req.user.role === 'teacher') return res.status(403).json({ error: 'هذا الإجراء متاح لمدير المعهد فقط' });
    next();
}

// ====================== كشف مشاركة الحسابات ======================
// بيجمّع أحداث الجلسات (SessionEvent) لكل طالب على مدار فترة معينة، ويحسب "درجة
// شك" (riskScore) مبنية على 3 إشارات مختلفة مجتمعة (مش إشارة واحدة بس عشان الدقة):
//   • blockedAttempts: عدد المرات اللي جهاز تاني حاول يدخل والحساب شغال بالفعل
//     (الوزن الأعلى نسبيًا x3 — ده أقوى دليل مباشر على محاولة استخدام من غير إذن)
//   • sessionMismatches: عدد المرات اللي نفس التوكن (نفس الجلسة المسجّلة) اتكشف
//     شغال من بصمة جهاز مختلفة عن اللي سجّل دخول بيها (الوزن الأعلى x4 — ده معناه
//     التوكن نفسه اتشارك، مش مجرد اسم مستخدم وباسورد)
//   • distinctFingerprints: عدد الأجهزة المختلفة اللي دخلت بيها الحساب في الفترة
//     (وزن أقل x2 لكل جهاز زيادة عن الأول — طالب عادي ممكن يستخدم موبايل ولابتوب
//     بشكل شرعي، فمجرد وجود جهازين مش دليل قاطع لوحده)
// النتيجة: قايمة مرتبة بالأعلى شكًا الأول، مع تفاصيل الأجهزة الفعلية (نوع/نظام/
// متصفح) عشان الأدمن يقدر يحكم بعينه مش يعتمد على الرقم بس.
app.get('/api/admin/account-sharing', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const days = Math.min(60, Math.max(1, parseInt(req.query.days) || 14));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const events = await SessionEvent.find({ at: { $gte: since }, userType: 'student' }).sort({ at: 1 }).lean();

        const byUser = {};
        for (const e of events) {
            if (!byUser[e.username]) {
                byUser[e.username] = {
                    username: e.username, fingerprints: new Set(), devices: new Set(),
                    blockedAttempts: 0, sessionMismatches: 0, firstSeen: e.at, lastSeen: e.at, timeline: []
                };
            }
            const u = byUser[e.username];
            if (e.fingerprint) u.fingerprints.add(e.fingerprint);
            const deviceLabel = `${e.deviceType || '?'} · ${e.os || '?'} · ${e.browser || '?'}`;
            u.devices.add(deviceLabel);
            if (e.event === 'blocked') u.blockedAttempts++;
            if (e.event === 'heartbeat_mismatch') u.sessionMismatches++;
            if (e.at > u.lastSeen) u.lastSeen = e.at;
            if (e.at < u.firstSeen) u.firstSeen = e.at;
            // آخر 10 أحداث بس لكل طالب (تفاصيل خام للمراجعة اليدوية لو الأدمن حاب يتعمّق)
            u.timeline.push({ event: e.event, device: deviceLabel, ip: e.ip, at: e.at });
            if (u.timeline.length > 10) u.timeline.shift();
        }

        const list = Object.values(byUser).map(u => ({
            username: u.username,
            distinctDevices: u.devices.size,
            deviceList: Array.from(u.devices),
            distinctFingerprints: u.fingerprints.size,
            blockedAttempts: u.blockedAttempts,
            sessionMismatches: u.sessionMismatches,
            firstSeen: u.firstSeen,
            lastSeen: u.lastSeen,
            timeline: u.timeline,
            riskScore: u.blockedAttempts * 3 + u.sessionMismatches * 4 + Math.max(0, u.fingerprints.size - 1) * 2
        }))
        .filter(u => u.riskScore > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 100);

        res.json({ success: true, days, count: list.length, students: list });
    } catch (error) {
        console.error('❌ خطأ في تحليل مشاركة الحسابات:', error.message);
        res.status(500).json({ error: 'خطأ في تحليل مشاركة الحسابات' });
    }
});

// ====================== German Pro (تعلّم الألمانية الاحترافي - تمريض) ======================
// راوت مستقل في ملف german-pro-routes.js (لازم يكون جنب الملف ده في نفس الفولدر).
require('./german-pro-routes')(app, { verifyToken, isAdmin, connectToDatabase, Student });

// ====================== English Pro (تعلّم الإنجليزية الاحترافي - تمريض) ======================
// راوت مستقل في ملف english-pro-routes.js (لازم يكون جنب الملف ده في نفس الفولدر).
require('./english-pro-routes')(app, { verifyToken, isAdmin, connectToDatabase, Student });

// ====================== TEST ENDPOINT ======================
app.get('/api/test', async (req, res) => {
    let dbStatus = 'disconnected';
    try {
        await connectToDatabase();
        dbStatus = 'connected';
    } catch(e) {}
    res.json({ 
        status: 'ok', 
        mongodb_status: dbStatus,
        message: 'API is working on Vercel!'
    });
});

// ====================== التحقق من اسم المستخدم ======================
app.get('/api/check-username', async (req, res) => {
    try {
        await connectToDatabase();
        const { username } = req.query;
        if (!username || username.length < 3) return res.json({ available: false });
        const existingAdmin = await Admin.findOne({ username: username.toLowerCase() });
        const existingStudent = await Student.findOne({ username: username.toLowerCase() });
        res.json({ available: !existingAdmin && !existingStudent });
    } catch (error) {
        res.json({ available: true });
    }
});

// ====================== تسجيل طالب جديد ======================
app.post('/api/students/register', async (req, res) => {
    try {
        await connectToDatabase();
        const { fullName, username, password, grade, studentCode, phone, parentName, parentId, parentPhone } = req.body;
        if (!fullName || !username || !password || !grade || !studentCode) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

        // ✅ تحقق صارم من شكل البيانات قبل التخزين — دفاع في العمق: حتى لو حصل
        // خطأ إفلات (escaping) في أي صفحة فرونت إند بتعرض بيانات الطلاب (زي
        // لوحة الأدمن)، البيانات المخزّنة نفسها بقت متحكم في شكلها من الأساس
        // فمينفعش تحمل علامات اقتباس/HTML tags تكسر أي سياق بتتعرض فيه.
        if (!/^\d{7}$/.test(String(studentCode))) {
            return res.status(400).json({ error: 'آخر 7 أرقام من البطاقة لازم تكون أرقام بس (7 أرقام)' });
        }
        if (!/^[a-zA-Z0-9_.]{3,32}$/.test(String(username))) {
            return res.status(400).json({ error: 'اسم المستخدم لازم يكون حروف إنجليزي/أرقام/underscore بس (3-32 حرف)' });
        }
        if (String(fullName).length > 100 || /[<>`]/.test(String(fullName))) {
            return res.status(400).json({ error: 'الاسم الكامل غير صالح' });
        }
        if (phone !== undefined && phone !== '' && !/^[\d+\-\s]{6,20}$/.test(String(phone))) {
            return res.status(400).json({ error: 'رقم الهاتف غير صالح' });
        }
        if (parentPhone !== undefined && parentPhone !== '' && !/^[\d+\-\s]{6,20}$/.test(String(parentPhone))) {
            return res.status(400).json({ error: 'رقم واتساب ولي الأمر غير صالح' });
        }
        if (parentName !== undefined && (String(parentName).length > 100 || /[<>`]/.test(String(parentName)))) {
            return res.status(400).json({ error: 'اسم ولي الأمر غير صالح' });
        }

        const existingUser = await Student.findOne({ username: username.toLowerCase() });
        if (existingUser) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        const existingCode = await Student.findOne({ studentCode });
      if (existingCode) return res.status(400).json({ error: 'آخر 7 أرقام من البطاقة مستخدمين من قبل' });
        const hashedPassword = await hashPassword(password);
        const student = new Student({
            fullName,
            username: username.toLowerCase(),
            password: hashedPassword,
            grade,
            studentCode,
            role: 'student',
            profile: { phone: phone || '', parentName: parentName || '', parentId: parentId || '', parentPhone: parentPhone || '' }
        });
        await student.save();
        res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنشاء الحساب: ' });
    }
});

// ====================== تسجيل الدخول ======================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        await connectToDatabase();
        const { username, password, deviceFingerprint } = req.body;
        const clientIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!username || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        let user = await Admin.findOne({ username: username.toLowerCase() });
        let userType = 'admin';
        if (!user) {
            user = await Student.findOne({ username: username.toLowerCase() });
            userType = 'student';
        }
        if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((user.lockedUntil - new Date()) / 60000);
            return res.status(401).json({ error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${remainingMinutes} دقيقة` });
        }
        if (userType === 'student' && user.suspendedUntil && user.suspendedUntil > new Date()) {
            const remainingHours = Math.ceil((user.suspendedUntil - new Date()) / 3600000);
            const reasonPart = user.suspendedReason ? ` — السبب: ${user.suspendedReason}` : '';
            return res.status(403).json({ error: `الحساب موقوف مؤقتًا من الأدمن، هيرجع تلقائيًا بعد حوالي ${remainingHours} ساعة${reasonPart}` });
        }
        const isMatch = await verifyPassword(password, user.password);
        if (!isMatch) {
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            if (user.failedAttempts >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            await user.save();
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        // ====== منع تسجيل الدخول من جهاز تاني طول ما فيه جلسة شغالة بالفعل ======
        // "شغالة" هنا معناها: فيه جلسة متسجّلة، ووصلها آخر heartbeat خلال آخر 5
        // دقايق (شوف SESSION_ALIVE_WINDOW_MS فوق). لو الجهاز الأول قفل التطبيق من
        // غير تسجيل خروج صريح، الجلسة بتتعتبر "ماتت" تلقائيًا بعد المدة دي وأي
        // جهاز تاني يقدر يدخل عادي — مفيش قفل دائم لو حد نسي يعمل logout.
        const now = new Date();
        const hasLiveSession = user.activeSessionId && user.sessionLastSeenAt &&
            (now - new Date(user.sessionLastSeenAt)) < SESSION_ALIVE_WINDOW_MS;
        if (hasLiveSession) {
            // الحساب مستخدم بالفعل — نسجّل محاولة الدخول المرفوضة دي ببصمة الجهاز
            // بتاعها. لو ده بيتكرر من نفس البصمة "الغريبة" مرات كتير، ده أقوى
            // دليل على مشاركة حساب فعلية (مش مجرد نسيان تسجيل خروج مرة واحدة).
            logSessionEvent({ username: user.username, userType, event: 'blocked', fingerprint: deviceFingerprint, req });
            return res.status(409).json({
                error: 'الحساب ده مسجّل دخول بالفعل على جهاز تاني دلوقتي. سجّل خروج من هناك الأول، أو استنى كام دقيقة لو الجهاز مقفول من غير خروج.',
                code: 'ACCOUNT_IN_USE'
            });
        }

        const sessionId = crypto.randomBytes(16).toString('hex');
        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.lastLogin = now;
        user.lastIP = clientIP;
        user.activeSessionId = sessionId;
        user.sessionLastSeenAt = now;
        user.activeSessionFingerprint = deviceFingerprint || null;
        await user.save();
        logSessionEvent({ username: user.username, userType, event: 'login', fingerprint: deviceFingerprint, req });
        const token = jwt.sign(
            { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode, role: userType === 'admin' ? (user.role || 'manager') : undefined, sid: sessionId },
            JWT_SECRET,
            { expiresIn: SESSION_JWT_EXPIRY }
        );
        setAuthCookie(res, token);
        // بيترجع الـ token في الـ body كمان (مش بس كوكي) عشان أي مشروع تاني
        // على دومين مختلف (زي chatx) يقدر يخزنه ويبعته كـ Authorization: Bearer
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName, type: userType, id: user.studentCode || user._id, role: userType === 'admin' ? (user.role || 'manager') : undefined } });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر: ' });
    }
});

// ====================== نبضة حياة الجلسة (heartbeat) ======================
// بينادى عليها دوريًا (كل دقيقتين مثلاً) من أي جهاز لسه فاتح التطبيق، عشان تحديث
// آخر وقت "شوهدت فيه" الجلسة — ده اللي بيخلي /api/login يعرف يفرّق بين جلسة شغالة
// فعلاً وجلسة اتسابت (تاب اتقفل من غير logout) وممكن تتحل محلها جلسة جديدة.
app.post('/api/heartbeat', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { deviceFingerprint } = req.body || {};
        const Model = req.user.type === 'admin' ? Admin : Student;
        const userDoc = await Model.findOne({ _id: req.user.id, activeSessionId: req.user.sid }).select('activeSessionFingerprint username');
        if (userDoc) {
            // نفس الـ sid (التوكن) بس بصمة الجهاز اختلفت — ده مش سيناريو "جهاز تاني
            // حاول يدخل" (ده اتمنع أصلاً من /api/login)، ده سيناريو أخطر: نفس
            // التوكن بالظبط بيتستخدم من جهاز مختلف — يعني التوكن نفسه (مش مجرد
            // اسم مستخدم وباسورد) اتشارك أو اتنسخ حرفيًا بين جهازين.
            if (deviceFingerprint && userDoc.activeSessionFingerprint && deviceFingerprint !== userDoc.activeSessionFingerprint) {
                logSessionEvent({ username: userDoc.username, userType: req.user.type, event: 'heartbeat_mismatch', fingerprint: deviceFingerprint, req });
            }
        }
        await Model.updateOne(
            { _id: req.user.id, activeSessionId: req.user.sid },
            { sessionLastSeenAt: new Date() }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث الجلسة' });
    }
});

// ====================== تسجيل خروج صريح ======================
// بيمسح الجلسة الشغالة من الداتابيز فورًا، عشان جهاز تاني يقدر يدخل بنفس الحساب
// على طول من غير ما يستنى انتهاء نافذة الـ heartbeat (5 دقايق).
app.post('/api/logout', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const Model = req.user.type === 'admin' ? Admin : Student;
        await Model.updateOne(
            { _id: req.user.id, activeSessionId: req.user.sid },
            { activeSessionId: null, sessionLastSeenAt: null, activeSessionFingerprint: null }
        );
        res.clearCookie('authToken', { path: '/' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تسجيل الخروج' });
    }
});

// ====================== تجديد التوكن ======================
app.post('/api/refresh-token', async (req, res) => {
    let token = req.cookies?.authToken;
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader?.split(' ')[1];
    }
    if (!token) return res.status(401).json({ error: 'لا توجد جلسة' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        const newToken = jwt.sign(
            { id: decoded.id, username: decoded.username, type: decoded.type, fullName: decoded.fullName, studentCode: decoded.studentCode, role: decoded.role, sid: decoded.sid },
            JWT_SECRET,
            { expiresIn: SESSION_JWT_EXPIRY }
        );
        setAuthCookie(res, newToken);
        // بيترجع التوكن الجديد في الـ body كمان (مش بس كوكي) — عشان مشاريع
        // الدومين التاني (زي chatx) اللي بتخزنه في localStorage تقدر تحدّثه.
        res.json({ success: true, token: newToken });
    } catch (error) {
        res.status(401).json({ error: 'جلسة منتهية' });
    }
});

// ====================== التحقق من الجلسة ======================
app.get('/api/verify-session', verifyToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ====================== فحص Premium خفيف (للـ AI edge functions زي chatx) ======================
// endpoint مخصص عشان أي edge function (زي /api/cerebras أو /api/claude-opus في
// مشروع chatx) تتأكد فعليًا (من السيرفر، مش بس من الفرونت إند) إن صاحب الطلب
// عنده اشتراك Premium قبل ما تنادي على موديل مكلّف. متعمد إنه خفيف جدًا (query
// واحدة على حقلين بس) عشان مايبطأش كل رسالة شات — عكس /api/me اللي بيجيب بيانات
// الطالب كاملة وده تقيل زيادة عن اللزوم هنا.
app.get('/api/premium-status', verifyToken, async (req, res) => {
    try {
        if (req.user.type === 'admin') {
            return res.json({ type: 'admin', premiumFeatures: [] });
        }
        await connectToDatabase();
        const student = await Student.findById(req.user.id).select('premiumFeatures');
        if (!student) return res.status(404).json({ error: 'المستخدم غير موجود' });
        res.json({ type: 'student', premiumFeatures: student.premiumFeatures || [] });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر: ' });
    }
});

// ====================== معلومات المستخدم الكاملة (لأي مشروع خارجي زي chatx) ======================
app.get('/api/me', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'admin') {
            const admin = await Admin.findById(req.user.id).select('-password -refreshToken');
            if (!admin) return res.status(404).json({ error: 'المستخدم غير موجود' });
            return res.json({ type: 'admin', profile: admin });
        }
        const student = await Student.findById(req.user.id).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const today = new Date().toISOString().split('T')[0];
        const [violations, attendance, examResults, homeworks, submittedHw, tournaments] = await Promise.all([
            Violation.find({ studentId: student.studentCode }).sort({ createdAt: -1 }).limit(20),
            Attendance.find({ studentCode: student.studentCode }).sort({ date: -1 }).limit(30),
            ExamResult.find({ studentId: student.studentCode }).sort({ completionTime: -1 }).limit(20),
            Homework.find({ targetGrade: student.grade, isActive: true, deadline: { $gte: today } })
                .select('title chapterName deadline questionCount').lean(),
            HomeworkSubmission.find({ studentId: student.username }).select('homeworkId').lean(),
            Tournament.find({ isActive: true, endDate: { $gte: today } })
                .select('title code chapterName startDate endDate timeLimitMinutes participants').lean()
        ]);
        const submittedIds = new Set(submittedHw.map(s => String(s.homeworkId)));
        const pendingHomework = homeworks.filter(h => !submittedIds.has(String(h._id)));
        const activeTournaments = tournaments.map(t => ({
            title: t.title, code: t.code, chapterName: t.chapterName,
            startDate: t.startDate, endDate: t.endDate, timeLimitMinutes: t.timeLimitMinutes,
            alreadyJoined: (t.participants || []).some(p => p.studentId === student.studentCode)
        }));
        // بنضيف اسم الاختبار وعدد أسئلته لكل نتيجة (عشان أي مشروع خارجي زي chatx يقدر
        // يعرف الاختبار ده كان في أي مادة، ويحلل تقدم الطالب بمرور الوقت في كل مادة)
        const examCodes = [...new Set(examResults.map(r => r.examCode))];
        const examsInfo = examCodes.length
            ? await Exam.find({ code: { $in: examCodes } }).select('code name stage questions').lean()
            : [];
        const examInfoMap = Object.fromEntries(examsInfo.map(e => [e.code, e]));
        const enrichedExamResults = examResults.map(r => {
            const info = examInfoMap[r.examCode];
            return {
                examCode: r.examCode,
                score: r.score,
                completionTime: r.completionTime,
                examName: info ? info.name : null,
                stage: info ? info.stage : null,
                totalQuestions: info && info.questions ? info.questions.length : null
            };
        });
        res.json({ type: 'student', profile: student, violations, attendance, examResults: enrichedExamResults, pendingHomework, activeTournaments });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب البيانات: ' });
    }
});

// ====================== البوش نوتيفيكيشن (Firebase Cloud Messaging) ======================
// الفرونت إند بيبعت توكن FCM الجهاز هنا بعد ما الطالب يوافق على إذن الإشعارات.
app.post('/api/push/subscribe', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ error: 'fcmToken مطلوب' });
        // upsert: لو نفس التوكن اتسجل قبل كده لحساب تاني (جهاز مشترك)، ننقله
        // للمستخدم الحالي بدل ما نرفض — عشان مايفضلش يوصل إشعارات لحساب غلط.
        await PushToken.findOneAndUpdate(
            { fcmToken },
            { fcmToken, username: req.user.username },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ توكن الإشعارات: ' });
    }
});

// بيتنادى وقت تسجيل الخروج أو لو الطالب قفل الإشعارات من الإعدادات
app.delete('/api/push/subscribe', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { fcmToken } = req.body;
        if (fcmToken) await PushToken.deleteOne({ fcmToken, username: req.user.username });
        else await PushToken.deleteMany({ username: req.user.username }); // مفيش توكن معين؟ امسح كل توكنات المستخدم
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إلغاء الإشعارات: ' });
    }
});

// ====================== تقييم ردود الذكاء الاصطناعي 👍/👎 (Chat X) ======================
// حفظ/تحديث تقييم رسالة — upsert على (studentCode, clientMessageId) عشان دوسة تانية
// على نفس الزرار تحدّث نفس السجل بدل ما تضيف تكرار.
app.post('/api/message-ratings', verifyToken, async (req, res) => {
    try {
        if (req.user.type !== 'student') return res.status(403).json({ error: 'غير مصرح' });
        await connectToDatabase();
        const { clientMessageId, model, rating, excerpt } = req.body;
        if (!clientMessageId || !model || !['up', 'down'].includes(rating)) {
            return res.status(400).json({ error: 'بيانات التقييم غير صالحة' });
        }
        const student = await Student.findById(req.user.id).select('studentCode');
        if (!student) return res.status(404).json({ error: 'المستخدم غير موجود' });

        await MessageRating.findOneAndUpdate(
            { studentCode: student.studentCode, clientMessageId: String(clientMessageId).slice(0, 100) },
            {
                studentCode: student.studentCode,
                clientMessageId: String(clientMessageId).slice(0, 100),
                model: String(model).slice(0, 50),
                rating,
                excerpt: String(excerpt || '').slice(0, 200)
            },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ التقييم: ' });
    }
});

// إلغاء تقييم سابق (الطالب دوس على نفس الزرار تاني عشان يشيل تقييمه)
app.delete('/api/message-ratings/:clientMessageId', verifyToken, async (req, res) => {
    try {
        if (req.user.type !== 'student') return res.status(403).json({ error: 'غير مصرح' });
        await connectToDatabase();
        const student = await Student.findById(req.user.id).select('studentCode');
        if (!student) return res.status(404).json({ error: 'المستخدم غير موجود' });
        await MessageRating.deleteOne({ studentCode: student.studentCode, clientMessageId: req.params.clientMessageId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف التقييم: ' });
    }
});

// صفحة الأدمن المصغّرة: ملخص تقييمات كل موديل (👍/👎/الإجمالي/نسبة الرضا)، بالإضافة
// لآخر 15 تقييم سلبي كأمثلة حقيقية سريعة — بدل ما الأدمن يفتح كل رسالة لوحدها.
app.get('/api/message-ratings/summary', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const summary = await MessageRating.aggregate([
            { $group: {
                _id: '$model',
                up: { $sum: { $cond: [{ $eq: ['$rating', 'up'] }, 1, 0] } },
                down: { $sum: { $cond: [{ $eq: ['$rating', 'down'] }, 1, 0] } },
                total: { $sum: 1 }
            }},
            { $sort: { total: -1 } }
        ]);
        const recentNegative = await MessageRating.find({ rating: 'down' })
            .sort({ createdAt: -1 }).limit(15)
            .select('model excerpt studentCode createdAt').lean();
        res.json({
            summary: summary.map(s => ({
                model: s._id,
                up: s.up,
                down: s.down,
                total: s.total,
                approvalRate: s.total > 0 ? Math.round((s.up / s.total) * 100) : null
            })),
            recentNegative
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب ملخص التقييمات: ' });
    }
});

// ====================== APIs الطلاب ======================
app.get('/api/student/by-code/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
});

app.get('/api/student/by-username/:username', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.params.username }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
});

// ====================== APIs الاختبارات ======================
app.post('/api/exams', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { name, stage, code, duration, questions } = req.body;
        if (!name || !code || !duration || !questions || questions.length === 0) return res.status(400).json({ error: 'جميع الحقول مطلوبة وسؤال واحد على الأقل' });
        const existingExam = await Exam.findOne({ code });
        if (existingExam) return res.status(400).json({ error: 'كود الاختبار موجود مسبقاً' });
        const newExam = new Exam({ name, stage, code, duration, questions });
        await newExam.save();
        res.json({ success: true, message: 'تم إنشاء الاختبار بنجاح', exam: newExam });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إنشاء الاختبار: ' }); }
});

app.get('/api/exams', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const exams = await Exam.find().sort({ createdAt: -1 }).select('-questions');
        res.json(exams);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الاختبارات' }); }
});

app.get('/api/exams/:code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const exam = await Exam.findOne({ code: req.params.code });
        if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });
        res.json(exam);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الاختبار' }); }
});

app.delete('/api/exams/:code', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Exam.findOneAndDelete({ code: req.params.code });
        if (!deleted) return res.status(404).json({ error: 'الاختبار غير موجود' });
        await ExamResult.deleteMany({ examCode: req.params.code });
        res.json({ success: true, message: 'تم حذف الاختبار بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الاختبار' }); }
});

app.post('/api/exams/:code/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.params;
        const { studentId, answers } = req.body;
        const exam = await Exam.findOne({ code });
        if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });
        let correctCount = 0;
        exam.questions.forEach((question, index) => {
            const userAnswer = answers[index];
            if (question.type === 'multiple' || question.type === 'truefalse') {
                if (userAnswer === question.correctAnswer) correctCount++;
            } else if (question.type === 'essay') {
                if (userAnswer && userAnswer.length > 20) correctCount += 0.7;
                else if (userAnswer && userAnswer.length > 0) correctCount += 0.3;
            }
        });
        const percentage = (correctCount / exam.questions.length) * 100;
        const examResult = new ExamResult({ examCode: code, studentId: studentId || req.user.username, score: percentage });
        await examResult.save();
        res.json({ success: true, message: 'تم حفظ النتيجة', score: percentage });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حفظ النتيجة' }); }
});

app.get('/api/exams/:code/results', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const results = await ExamResult.find({ examCode: req.params.code }).sort({ completionTime: -1 });
        res.json(results);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب النتائج' }); }
});

// ====================== الإشعارات ======================
app.get('/api/notifications', async (req, res) => {
    try {
        await connectToDatabase();
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); }
});

app.post('/api/notifications', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { text, date } = req.body;
        if (!text || text.trim() === '') return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        const newNotification = new Notification({ text: text.trim(), date: date || new Date().toLocaleString('ar-EG') });
        await newNotification.save();
        // بوش نوتيفيكيشن فوري لكل الطلاب اللي فعّلوا الإشعارات — "fire and forget"،
        // مش بنستنى نتيجة الإرسال قبل ما نرد على الأدمن (لو فشل جزئيًا مش مشكلة
        // في تجربة الأدمن، الإشعار نفسه اتحفظ في الداتابيز بنجاح أصلاً).
        sendPushBroadcast({
            title: '📢 إعلان جديد من School X',
            body: text.trim().slice(0, 120),
            data: { type: 'announcement', notificationId: String(newNotification._id) }
        }).catch(() => {});
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة الإشعار' }); }
});

app.delete('/api/notifications/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Notification.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'الإشعار غير موجود' });
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الإشعار' }); }
});

// ====================== بنك الأسئلة الشائعة (مجهول تمامًا) ======================
// بيتطبّع النص عشان "ايه أعراض النزيف؟" و"ايه هي اعراض النزيف" يتحسبوا نفس
// السؤال ويتجمعوا مع بعض، مش يتسجلوا كسؤالين منفصلين.
function normalizeQuestionText(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[إأآا]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[\u064B-\u0652]/g, '') // إزالة التشكيل
        .replace(/[^\u0600-\u06FFa-z0-9\s]/g, '') // إزالة علامات الترقيم
        .replace(/\s+/g, ' ')
        .trim();
}

// بيتسجّل من غير أي verifyToken أو username عمدًا — مفيش أي بيانات هوية بتتبعت
// أصلاً، فمفيش حاجة تقنية تربط السؤال بصاحبه حتى لو حبينا (مش بس "إخفاء" في العرض).
app.post('/api/shared-questions/submit', async (req, res) => {
    try {
        await connectToDatabase();
        const { question, answer } = req.body || {};
        const text = String(question || '').trim();
        if (!text || text.length < 8 || text.length > 300) return res.status(400).json({ success: false });
        const normalized = normalizeQuestionText(text);
        if (!normalized || normalized.length < 6) return res.status(400).json({ success: false });

        const existing = await SharedQuestion.findOne({ normalizedText: normalized });
        if (existing) {
            existing.askCount += 1;
            existing.lastAskedAt = new Date();
            if (answer && !existing.answerText) existing.answerText = String(answer).slice(0, 2000);
            await existing.save();
        } else {
            await SharedQuestion.create({
                normalizedText: normalized,
                displayText: text.slice(0, 300),
                answerText: answer ? String(answer).slice(0, 2000) : '',
                askCount: 1
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في تسجيل سؤال مشترك:', error.message);
        res.status(500).json({ success: false });
    }
});

// بيرجّع بس الأسئلة اللي askCount >= 2 — يعني أكتر من طالب سألها فعلاً، مش أي
// سؤال فردي حصل مرة واحدة. ده بيحمي الخصوصية طبيعيًا (سؤال شخصي جدًا ما حدش
// غيرك سأله مش هيظهر للكل خالص) وفي نفس الوقت يضمن إن اللي بيظهر فعلاً "شائع".
app.get('/api/shared-questions/top', async (req, res) => {
    try {
        await connectToDatabase();
        const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 3));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const list = await SharedQuestion.find({ lastAskedAt: { $gte: since }, askCount: { $gte: 2 } })
            .sort({ askCount: -1, lastAskedAt: -1 })
            .limit(20)
            .select('displayText answerText askCount lastAskedAt');
        res.json({ success: true, questions: list });
    } catch (error) {
        console.error('❌ خطأ في جلب الأسئلة الشائعة:', error.message);
        res.status(500).json({ success: false, questions: [] });
    }
});

// ====================== رسايل الطلاب للأدمن (Chat X) ======================
// optionalAuthLoose بيختلف عن verifyToken العادي في حاجة واحدة أساسية: لو مفيش توكن
// خالص، مش بيرفض الطلب (401) — بيكمّل الطلب عادي وبيسيب req.user = null. ده ضروري
// عشان الرسايل المجهولة (اللي الفرونت إند بيبعتها من غير Authorization header) تعدي
// من غير ما تتحجب، وفي نفس الوقت السيرفر يقدر يتعرف على الطالب لو التوكن كان موجود.
function optionalAuthLoose(req, res, next) {
    let token = req.cookies?.authToken;
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader?.split(' ')[1];
    }
    if (!token) { req.user = null; return next(); }
    try {
        req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        req.user = null;
    }
    next();
}

app.post('/api/admin-messages', optionalAuthLoose, async (req, res) => {
    try {
        await connectToDatabase();
        const { text, anonymous } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فاضية' });
        if (text.length > 2000) return res.status(400).json({ error: 'الرسالة طويلة جدًا' });

        // مجهولة لو الطالب اختارها بنفسه، أو لو أصلاً مفيش توكن اتبعت (احتياطًا)
        const isAnonymous = anonymous === true || !req.user;
        const doc = await AdminMessage.create({
            text: text.trim(),
            anonymous: isAnonymous,
            senderId: isAnonymous ? null : req.user.id,
            senderName: isAnonymous ? null : (req.user.fullName || req.user.username)
        });
        res.json({ success: true, id: doc._id });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إرسال الرسالة' }); }
});

app.get('/api/admin-messages', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const messages = await AdminMessage.find().sort({ createdAt: -1 }).limit(500);
        res.json({ messages });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الرسايل' }); }
});

app.patch('/api/admin-messages/:id/read', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const updated = await AdminMessage.findByIdAndUpdate(req.params.id, { read: true });
        if (!updated) return res.status(404).json({ error: 'الرسالة غير موجودة' });
        res.json({ success: true });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تحديث الرسالة' }); }
});

// ====================== المخالفات ======================
app.get('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب المخالفات' }); }
});

app.post('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentId, type, reason, penalty, parentSummons, date } = req.body;
        if (!studentId || !reason || !penalty) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const student = await Student.findOne({ studentCode: studentId });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const newViolation = new Violation({ studentId, type, reason, penalty, parentSummons: parentSummons || false, date: date || new Date().toLocaleString('ar-EG') });
        await newViolation.save();
        res.json({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: newViolation });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة المخالفة' }); }
});

app.delete('/api/violations/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Violation.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'المخالفة غير موجودة' });
        res.json({ success: true, message: 'تم حذف المخالفة بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف المخالفة' }); }
});

// ====================== APIs الحضور (Attendance) كاملة ======================
app.post('/api/attendance', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode, studentName, date, status, note } = req.body;
        if (!studentCode || !studentName || !date || !status) {
            return res.status(400).json({ error: 'كود الطالب، الاسم، التاريخ، والحالة مطلوبة' });
        }
        if (!['present', 'absent', 'late'].includes(status)) {
            return res.status(400).json({ error: 'الحالة غير صحيحة' });
        }
        const student = await Student.findOne({ studentCode });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existing = await Attendance.findOne({ studentCode, date });
        if (existing) {
            return res.status(400).json({ error: 'هذا الطالب مسجل حضوره في هذا التاريخ بالفعل. يمكنك تعديل السجل بدلاً من ذلك.' });
        }
        const newAttendance = new Attendance({
            studentCode,
            studentName,
            date,
            status,
            note: note || '',
            recordedBy: req.user?.username || 'admin'
        });
        await newAttendance.save();
        res.json({ success: true, message: 'تم تسجيل الحضور بنجاح', attendance: newAttendance });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تسجيل الحضور: ' });
    }
});

app.get('/api/attendance', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode, fromDate, toDate, status } = req.query;
        let filter = {};
        if (studentCode) filter.studentCode = studentCode;
        if (status) filter.status = status;
        if (fromDate || toDate) {
            filter.date = {};
            if (fromDate) filter.date.$gte = fromDate;
            if (toDate) filter.date.$lte = toDate;
        }
        const records = await Attendance.find(filter).sort({ date: -1, createdAt: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب سجل الحضور' });
    }
});

app.get('/api/attendance/student/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        if (req.user.type === 'parent' && req.user.studentCode !== studentCode) {
            return res.status(403).json({ error: 'غير مصرح بجلب بيانات طالب آخر' });
        }
        const records = await Attendance.find({ studentCode }).sort({ date: -1 });
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;
        const total = records.length;
        const percentage = total > 0 ? (present / total) * 100 : 0;
        res.json({ records, present, absent, late, total, percentage: percentage.toFixed(1) });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب حضور الطالب' });
    }
});

app.put('/api/attendance/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        const { studentCode, studentName, date, status, note } = req.body;
        if (status && !['present', 'absent', 'late'].includes(status)) {
            return res.status(400).json({ error: 'الحالة غير صحيحة' });
        }
        const updateData = {};
        if (studentCode !== undefined) updateData.studentCode = studentCode;
        if (studentName !== undefined) updateData.studentName = studentName;
        if (date !== undefined) updateData.date = date;
        if (status !== undefined) updateData.status = status;
        if (note !== undefined) updateData.note = note;
        const updated = await Attendance.findByIdAndUpdate(id, updateData, { new: true });
        if (!updated) return res.status(404).json({ error: 'سجل الحضور غير موجود' });
        res.json({ success: true, message: 'تم تحديث السجل', attendance: updated });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث سجل الحضور' });
    }
});

app.delete('/api/attendance/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { id } = req.params;
        const deleted = await Attendance.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'سجل الحضور غير موجود' });
        res.json({ success: true, message: 'تم حذف السجل بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف سجل الحضور' });
    }
});

app.get('/api/attendance/date/:date', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { date } = req.params;
        const records = await Attendance.find({ date }).sort({ studentName: 1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الحضور حسب التاريخ' });
    }
});

// ====================== حفظ الحضور الجماعي (Bulk) ======================
app.post('/api/attendance/bulk', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { date, students, recordedBy } = req.body;
        
        if (!date) {
            return res.status(400).json({ error: 'التاريخ مطلوب' });
        }
        
        if (!students || students.length === 0) {
            return res.status(400).json({ error: 'يجب إرسال بيانات الطلاب' });
        }

        const operations = students.map(s => ({
            updateOne: {
                filter: { 
                    studentCode: s.code, 
                    date: date 
                },
                update: { 
                    $set: { 
                        studentName: s.name, 
                        status: s.status, 
                        note: s.note || '',
                        recordedBy: recordedBy || req.user?.username || 'admin'
                    } 
                },
                upsert: true
            }
        }));
        
        const result = await Attendance.bulkWrite(operations);
        
        res.json({ 
            success: true, 
            message: `تم حفظ ${students.length} طالب بنجاح`,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount
        });
    } catch (error) {
        console.error('❌ Bulk attendance error:', error);
        res.status(500).json({ error: 'خطأ في حفظ الحضور الجماعي: ' });
    }
});

// ====================== تنبيهات الغياب التلقائية ======================
// بيحسب لكل طالب: عدد أيام الغياب المتتالية (من آخر سجل للخلف) ونسبة الغياب
// الكلية، ويرجع بس الطلاب اللي عدّوا الحدود المطلوبة (افتراضيًا 3 أيام متتالية
// أو 25% غياب)، مع حالة كل تنبيه (لسه معلّق / اتبعت / اتجاهله) عشان الواجهة
// متعيدش تزعج الأدمن بنفس التنبيه لو خلاص اتصرف فيه.
function computeAttendanceFlags(records, { minConsecutive, minPercentage, minRecords }) {
    if (!records.length) return null;
    const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1)); // الأحدث أولاً
    let consecutiveAbsent = 0;
    for (const r of sorted) { if (r.status === 'absent') consecutiveAbsent++; else break; }
    const total = records.length;
    const absentCount = records.filter(r => r.status === 'absent').length;
    const percentage = total > 0 ? (absentCount / total) * 100 : 0;
    const flags = [];
    if (consecutiveAbsent >= minConsecutive) {
        flags.push({ type: 'consecutive', detail: `غاب ${consecutiveAbsent} أيام متتالية`, signature: `consecutive:${consecutiveAbsent}` });
    }
    if (total >= minRecords && percentage >= minPercentage) {
        flags.push({ type: 'percentage', detail: `نسبة غياب ${percentage.toFixed(1)}% من ${total} يوم`, signature: `percentage:${Math.round(percentage)}` });
    }
    if (!flags.length) return null;
    return { total, absentCount, percentage: Number(percentage.toFixed(1)), consecutiveAbsent, flags };
}

app.get('/api/admin/attendance/alerts', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const minConsecutive = Math.max(1, parseInt(req.query.minConsecutive) || 3);
        const minPercentage = Math.max(1, parseFloat(req.query.minPercentage) || 25);
        const minRecords = Math.max(1, parseInt(req.query.minRecords) || 5);
        const gradeFilter = req.query.grade && req.query.grade !== 'all' ? { grade: req.query.grade } : {};

        const students = await Student.find(gradeFilter).select('fullName studentCode grade profile');
        if (!students.length) return res.json([]);
        const studentCodes = students.map(s => s.studentCode);
        const allRecords = await Attendance.find({ studentCode: { $in: studentCodes } }).select('studentCode date status').lean();
        const recordsByStudent = new Map();
        allRecords.forEach(r => { if (!recordsByStudent.has(r.studentCode)) recordsByStudent.set(r.studentCode, []); recordsByStudent.get(r.studentCode).push(r); });

        const results = [];
        for (const st of students) {
            const records = recordsByStudent.get(st.studentCode) || [];
            const computed = computeAttendanceFlags(records, { minConsecutive, minPercentage, minRecords });
            if (!computed) continue;
            const signatures = computed.flags.map(f => f.signature);
            const alertDocs = await AttendanceAlert.find({ studentCode: st.studentCode, signature: { $in: signatures } }).lean();
            const flagsWithStatus = computed.flags.map(f => {
                const existing = alertDocs.find(a => a.signature === f.signature);
                return { ...f, actionStatus: existing ? existing.status : 'pending' };
            });
            // لو كل التنبيهات الحالية اتصرف فيها (مفيش ولا واحد pending)، نتجاهلها إلا لو الواجهة طلبت الكل
            const hasPending = flagsWithStatus.some(f => f.actionStatus === 'pending');
            if (!hasPending && req.query.includeActioned !== 'true') continue;
            results.push({
                studentCode: st.studentCode,
                fullName: st.fullName,
                grade: st.grade,
                parentPhone: st.profile?.parentPhone || '',
                total: computed.total,
                absentCount: computed.absentCount,
                percentage: computed.percentage,
                consecutiveAbsent: computed.consecutiveAbsent,
                flags: flagsWithStatus
            });
        }
        // الأكثر إلحاحًا (غياب متتالي أكبر) في الأول
        results.sort((a, b) => b.consecutiveAbsent - a.consecutiveAbsent);
        res.json(results);
    } catch (error) {
        console.error('❌ Attendance alerts error:', error);
        res.status(500).json({ error: 'خطأ في حساب تنبيهات الغياب' });
    }
});

app.post('/api/admin/attendance/alerts/action', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode, signature, status } = req.body;
        if (!studentCode || !signature || !['sent', 'dismissed'].includes(status)) {
            return res.status(400).json({ error: 'بيانات غير صحيحة' });
        }
        await AttendanceAlert.findOneAndUpdate(
            { studentCode, signature },
            { $set: { status, actedBy: req.user?.username || 'admin', actedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث حالة التنبيه' });
    }
});

// ✅ تحديث رقم واتساب ولي الأمر بسرعة من نفس شاشة تنبيهات الغياب (من غير الحاجة
// للدخول على شاشة تعديل الطالب الكاملة)
app.put('/api/admin/students/:studentCode/parent-phone', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { parentPhone } = req.body;
        if (parentPhone !== undefined && parentPhone !== '' && !/^[\d+\-\s]{6,20}$/.test(String(parentPhone))) {
            return res.status(400).json({ error: 'رقم واتساب غير صالح' });
        }
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('profile');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const existingProfile = student.profile ? student.profile.toObject() : {};
        await Student.updateOne({ studentCode: req.params.studentCode }, { $set: { profile: { ...existingProfile, parentPhone: parentPhone || '' } } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث رقم ولي الأمر' });
    }
});

// ====================== تقرير حضور شهري قابل للطباعة ======================
app.get('/api/admin/attendance/monthly-report', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { grade, month } = req.query; // month = 'YYYY-MM'
        if (!grade || !/^\d{4}-\d{2}$/.test(String(month || ''))) {
            return res.status(400).json({ error: 'الصف والشهر (YYYY-MM) مطلوبين' });
        }
        const [year, mm] = month.split('-').map(Number);
        const daysInMonth = new Date(year, mm, 0).getDate();
        const monthPrefix = month; // 'YYYY-MM'

        const students = await Student.find({ grade }).select('fullName studentCode').sort({ fullName: 1 });
        const studentCodes = students.map(s => s.studentCode);
        const records = await Attendance.find({
            studentCode: { $in: studentCodes },
            date: { $gte: `${monthPrefix}-01`, $lte: `${monthPrefix}-31` }
        }).select('studentCode date status').lean();

        const byStudent = new Map();
        records.forEach(r => { if (!byStudent.has(r.studentCode)) byStudent.set(r.studentCode, {}); byStudent.get(r.studentCode)[r.date] = r.status; });

        const gradeLabel = { first: 'الأولى ثانوي', second: 'الثانية ثانوي', third: 'الثالثة ثانوي' };
        const rows = students.map(st => {
            const marks = byStudent.get(st.studentCode) || {};
            let present = 0, absent = 0, late = 0;
            const days = {};
            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${monthPrefix}-${String(d).padStart(2, '0')}`;
                const status = marks[dateKey] || null;
                days[d] = status;
                if (status === 'present') present++; else if (status === 'absent') absent++; else if (status === 'late') late++;
            }
            const totalRecorded = present + absent + late;
            const percentage = totalRecorded > 0 ? ((present / totalRecorded) * 100).toFixed(1) : '0.0';
            return { fullName: st.fullName, studentCode: st.studentCode, days, present, absent, late, percentage };
        });

        res.json({ grade, gradeLabel: gradeLabel[grade] || grade, month, daysInMonth, rows });
    } catch (error) {
        console.error('❌ Monthly report error:', error);
        res.status(500).json({ error: 'خطأ في إنشاء التقرير الشهري' });
    }
});

// ====================== جلب الطلاب (للأدمن) ======================
app.get('/api/admin/students', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const students = await Student.find().select('-password -refreshToken');
        res.json(students);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الطلاب' }); }
});

app.get('/api/admins', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const admins = await Admin.find().select('-password -refreshToken');
        res.json(admins);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الأدمنز' }); }
});

app.post('/api/admins', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { fullName, username, password, role } = req.body;
        if (!fullName || !username || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const finalRole = role === 'manager' ? 'manager' : 'teacher'; // افتراضيًا مدرس ما لم يُحدد مدير المعهد
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        const hashedPassword = await hashPassword(password);
        const admin = new Admin({ fullName, username, password: hashedPassword, role: finalRole });
        await admin.save();
        res.json({ message: 'تم إضافة الأدمن بنجاح', admin: { fullName, username, role: finalRole } });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة الأدمن' }); }
});

app.delete('/api/admins/:username', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { username } = req.params;
        if (username === 'admin') return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي' });
        const adminCount = await Admin.countDocuments();
        if (adminCount <= 1) return res.status(400).json({ error: 'لا يمكن حذف آخر أدمن في النظام' });
        const deleted = await Admin.findOneAndDelete({ username });
        if (!deleted) return res.status(404).json({ error: 'الأدمن غير موجود' });
        res.json({ message: 'تم حذف الأدمن بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الأدمن' }); }
});

// ====================== إضافة طالب جديد بدرجاته (من نموذج لوحة التحكم) ======================
app.post('/api/students', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { fullName, id: studentCode, subjects, term, grade } = req.body;
        if (!fullName || !studentCode) return res.status(400).json({ error: 'اسم الطالب ورقم الجلوس مطلوبان' });
        const existing = await Student.findOne({ studentCode });
        if (existing) return res.status(400).json({ error: 'رقم الجلوس مستخدم بالفعل' });
        const targetField = term === 'second' ? 'subjectsSecond' : 'subjectsFirst';
        const doc = { fullName, studentCode, grade: grade || 'first', role: 'student', [targetField]: subjects || [] };
        try {
            await Student.create({ ...doc, username: studentCode, password: await hashPassword('123456') });
        } catch (err) {
            // لو تعارض على username (نادر)، نضيف من غير username
            if (err.code === 11000) await Student.create(doc);
            else throw err;
        }
        res.json({ success: true, message: 'تم إضافة الطالب بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة الطالب: ' }); }
});

// ====================== تحديث بيانات الطالب (نسخة محسنة) ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        const { fullName, username, password, studentCode: newStudentCode, grade, semester, subjects, term, profile, premiumFeatures, gender } = req.body;
        
        console.log('📝 تحديث الطالب:', studentCode, req.body);
        
        const updateData = {};

        // ✅ نفس التحقق من الشكل المستخدم في التسجيل — حتى في مسار الأدمن، عشان
        // منمنعش أي بيانات تتخزن بشكل ممكن يكسر أي صفحة عرض تانية بعدين.
        if (fullName !== undefined && (String(fullName).length > 100 || /[<>`]/.test(String(fullName)))) {
            return res.status(400).json({ error: 'الاسم الكامل غير صالح' });
        }
        if (username !== undefined && !/^[a-zA-Z0-9_.]{3,32}$/.test(String(username))) {
            return res.status(400).json({ error: 'اسم المستخدم غير صالح' });
        }
        if (newStudentCode !== undefined && newStudentCode !== studentCode && !/^\d{7}$/.test(String(newStudentCode))) {
            return res.status(400).json({ error: 'رقم الجلوس لازم يكون 7 أرقام' });
        }
        // ✅ النوع: لازم يكون male أو female بس، أو فاضي/null يعني "غير محدد"
        if (gender !== undefined && gender !== null && gender !== '' && !['male', 'female'].includes(gender)) {
            return res.status(400).json({ error: 'قيمة النوع غير صالحة' });
        }

        // تحديث كل الحقول لو موجودة
        if (fullName !== undefined) updateData.fullName = fullName;
        if (username !== undefined) updateData.username = username;
        if (grade !== undefined) updateData.grade = grade;
        if (semester !== undefined) updateData.semester = semester;
        if (gender !== undefined) updateData.gender = (gender === '' ? null : gender);
        // ✅ نظامين للدرجات: الترم الأول (subjectsFirst) و نهاية العام/الترم الثاني (subjectsSecond)
        // يُحدَّث حقل واحد فقط بحسب "term" المُرسَل، مع الحفاظ على درجات الترم الآخر كما هي
        if (subjects !== undefined) {
            if (term === 'second') updateData.subjectsSecond = subjects;
            else updateData.subjectsFirst = subjects;
        }
        // مميزات Premium: لازم تكون array من نصوص، أي حاجة تانية بنتجاهلها بدل ما نحفظ قيمة فاسدة
        if (premiumFeatures !== undefined && Array.isArray(premiumFeatures)) {
            updateData.premiumFeatures = premiumFeatures.filter(f => typeof f === 'string').slice(0, 20);
        }
        
        // تحديث رقم الجلوس
        if (newStudentCode !== undefined && newStudentCode !== studentCode) {
            // التحقق من عدم وجود طالب بنفس رقم الجلوس الجديد
            const existingCode = await Student.findOne({ studentCode: newStudentCode });
            if (existingCode) {
                return res.status(400).json({ error: 'رقم الجلوس مستخدم من قبل' });
            }
            updateData.studentCode = newStudentCode;
        }
        
        // تحديث البروفايل
        // ✅ تم إصلاح دمج البروفايل: كان بيحاول يقرأ .profile من الـ Query نفسه قبل تنفيذه (await
        // بعد ?. مش قبله)، فكان دايمًا بيرجع undefined وبيمسح أي حقل قديم في البروفايل مش
        // موجود في الطلب الحالي (زي لو حد بعت parentPhone بس، كانت بتتمسح parentId/parentName).
        if (profile !== undefined) {
            const existingStudent = await Student.findOne({ studentCode }).select('profile');
            const existingProfile = (existingStudent && existingStudent.profile) ? existingStudent.profile.toObject() : {};
            updateData.profile = { ...existingProfile, ...profile };
        }
        
        // تحديث كلمة المرور لو تم إرسالها
        if (password !== undefined && password !== '') {
            updateData.password = await hashPassword(password);
        }
        
        console.log('📝 بيانات التحديث:', Object.keys(updateData));
        
        const updated = await Student.findOneAndUpdate(
            { studentCode: studentCode },
            { $set: updateData },
            { new: true }
        ).select('-password -refreshToken');
        
        if (!updated) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        console.log('✅ تم تحديث الطالب:', updated.studentCode);
        res.json({ success: true, message: 'تم تحديث البيانات بنجاح', student: updated });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث البيانات:', error);
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' });
    }
});



// ====================== تفعيل/تعديل مميزات Premium لطالب معين (أدمن فقط) ======================
// endpoint مخصص وبسيط بديل عن الـ PUT الشامل فوق — بس عشان لوحة تحكم الأدمن تقدر
// تبعت مصفوفة المفاتيح المفعّلة من غير ما تحتاج تبعت باقي بيانات الطالب معاها.
// المفاتيح المتاحة حاليًا: premium_ai, premium_mock_exams, premium_prompts, premium_theme, premium_drug_library,
// premium_clinical_sim, premium_lecture_audio, premium_video_sim
app.patch('/api/admin/students/:studentCode/premium', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { premiumFeatures } = req.body;
        if (!Array.isArray(premiumFeatures)) {
            return res.status(400).json({ error: 'premiumFeatures لازم تكون مصفوفة' });
        }
        const cleaned = [...new Set(premiumFeatures.filter(f => typeof f === 'string'))].slice(0, 20);
        const updated = await Student.findOneAndUpdate(
            { studentCode: req.params.studentCode },
            { $set: { premiumFeatures: cleaned } },
            { new: true }
        ).select('username fullName studentCode premiumFeatures');
        if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json({ success: true, student: updated });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث مميزات Premium: ' });
    }
});

// ====================== تحديث النوع (gender) لعدة طلاب دفعة واحدة (أدمن فقط) ======================
// بيستخدمها زر "تحديد الكل" في صفحة الطلاب عشان الأدمن يحدد نوع كذا طالب في الصف مرة واحدة
// بدل ما يفتح تعديل كل طالب لوحده. lastMultipleGuard: gender لازم تكون male أو female بس (مفيش فاضي هنا).
app.patch('/api/admin/students/bulk-gender', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCodes, gender } = req.body;
        if (!Array.isArray(studentCodes) || studentCodes.length === 0) {
            return res.status(400).json({ error: 'يجب تحديد طالب واحد على الأقل' });
        }
        if (!['male', 'female'].includes(gender)) {
            return res.status(400).json({ error: 'قيمة النوع غير صالحة' });
        }
        const codes = studentCodes.filter(c => typeof c === 'string').slice(0, 500);
        const result = await Student.updateMany(
            { studentCode: { $in: codes } },
            { $set: { gender } }
        );
        res.json({
            success: true,
            message: `تم تحديث النوع لـ ${result.modifiedCount} طالب`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ خطأ في تحديث النوع الجماعي:', error);
        res.status(500).json({ error: 'خطأ في تحديث النوع الجماعي' });
    }
});

// ====================== ✅ بحث الطلاب (للطلاب العاديين) ======================
app.get('/api/students/search', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { name, studentCode } = req.query;
        
        console.log(`🔍 بحث طالب: name="${name}", code="${studentCode}"`);
        
        let query = {};
        
        // البحث برقم الجلوس
        if (studentCode) {
            query.studentCode = studentCode;
        }
        
        // البحث بالاسم (بحث تقريبي)
        if (name) {
            // استخدام regex للبحث الجزئي
            const nameRegex = new RegExp(name.replace(/\s+/g, '.*'), 'i');
            query.fullName = { $regex: nameRegex };
        }
        
        if (Object.keys(query).length === 0) {
            return res.status(400).json({ error: 'يرجى إدخال الاسم أو رقم الجلوس' });
        }
        
        const students = await Student.find(query)
            .select('-password -refreshToken')
            .limit(20);
        
        console.log(`✅ وجد ${students.length} طالب`);
        res.json(students);
        
    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        res.status(500).json({ error: 'خطأ في البحث عن الطلاب' });
    }
});

// ====================== ✅ جلب جميع الطلاب (متاح للجميع) ======================
app.get('/api/students/all', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const students = await Student.find()
            .select('-password -refreshToken')
            .sort({ fullName: 1 });
        console.log(`📚 تم جلب ${students.length} طالب`);
        res.json(students);
    } catch (error) {
        console.error('❌ خطأ في جلب الطلاب:', error);
        res.status(500).json({ error: 'خطأ في جلب الطلاب' });
    }
});

// ====================== ✅ جلب نتيجة طالب (للطالب نفسه) ======================
app.get('/api/students/result/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        
        // الطالب يقدر يشوف نتيجته هو بس (أو الأدمن)
        if (req.user.type === 'student' && req.user.studentCode !== studentCode) {
            return res.status(403).json({ error: 'لا يمكنك عرض نتيجة طالب آخر' });
        }
        
        const student = await Student.findOne({ studentCode })
            .select('-password -refreshToken');
        
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب نتيجة الطالب' });
    }
});

// ====================== أرشيف النتائج ======================

// أرشفة نتائج السنة الحالية (مدير المعهد فقط - إجراء جماعي لا يمكن التراجع عنه بسهولة)
// بينقل درجات كل طالب عنده نتيجة (subjects غير فاضية) لسجل أرشيف، وبعدين يصفّر
// subjects في مستند الطالب عشان تبدأ السنة الجديدة فاضية.
app.post('/api/admin/archive-results', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { academicYear, grade } = req.body;
        if (!academicYear || !academicYear.trim()) return res.status(400).json({ error: 'يرجى تحديد اسم السنة الدراسية (مثال: 2025-2026)' });

        // ✅ يشمل أي طالب عنده درجات في الترم الأول أو نهاية العام (النظام الجديد)، أو حتى في الحقل القديم subjects (بيانات قبل التحديث)
        const query = { $or: [
            { subjectsFirst: { $exists: true, $not: { $size: 0 } } },
            { subjectsSecond: { $exists: true, $not: { $size: 0 } } },
            { subjects: { $exists: true, $not: { $size: 0 } } }
        ] };
        if (grade && ['first', 'second', 'third'].includes(grade)) query.grade = grade;

        const students = await Student.find(query);
        if (!students.length) return res.status(400).json({ error: 'لا توجد نتائج حالية لأرشفتها' });

        const archiveDocs = students.map(st => ({
            studentCode: st.studentCode,
            fullName: st.fullName,
            username: st.username,
            grade: st.grade,
            academicYear: academicYear.trim(),
            // ✅ لو subjectsFirst فاضي وفيه بيانات قديمة في subjects، نأرشفها كترم أول
            subjectsFirst: (st.subjectsFirst && st.subjectsFirst.length) ? st.subjectsFirst : (st.subjects || []),
            subjectsSecond: st.subjectsSecond || [],
            profile: st.profile,
            archivedBy: req.user.username || 'admin'
        }));

        await ArchivedResult.insertMany(archiveDocs);
        await Student.updateMany(
            { _id: { $in: students.map(s => s._id) } },
            { $set: { subjectsFirst: [], subjectsSecond: [], subjects: [] } }
        );

        res.json({ success: true, message: `تم أرشفة ${archiveDocs.length} نتيجة بنجاح تحت سنة "${academicYear.trim()}"`, count: archiveDocs.length });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في أرشفة النتائج: ' });
    }
});

// قائمة السنوات الدراسية المؤرشفة (متاح للمدير والمدرس - عرض فقط)
app.get('/api/admin/archive/years', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const years = await ArchivedResult.aggregate([
            { $group: { _id: '$academicYear', count: { $sum: 1 }, archivedAt: { $max: '$archivedAt' } } },
            { $sort: { _id: -1 } }
        ]);
        res.json(years.map(y => ({ academicYear: y._id, count: y.count, archivedAt: y.archivedAt })));
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب سنوات الأرشيف' }); }
});

// تصفح/البحث داخل أرشيف النتائج (متاح للمدير والمدرس - عرض فقط)
app.get('/api/admin/archive', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { academicYear, grade, studentCode, name } = req.query;
        const query = {};
        if (academicYear) query.academicYear = academicYear;
        if (grade && ['first', 'second', 'third'].includes(grade)) query.grade = grade;
        if (studentCode) query.studentCode = studentCode;
        if (name) query.fullName = { $regex: new RegExp(name.replace(/\s+/g, '.*'), 'i') };
        const results = await ArchivedResult.find(query).sort({ fullName: 1 }).limit(500);
        res.json(results);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الأرشيف' }); }
});

// حذف سجل مؤرشف واحد (مدير المعهد فقط)
app.delete('/api/admin/archive/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await ArchivedResult.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'السجل غير موجود' });
        res.json({ success: true, message: 'تم حذف السجل من الأرشيف' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف السجل' }); }
});

// حذف سنة كاملة من الأرشيف (مدير المعهد فقط)
app.delete('/api/admin/archive/year/:academicYear', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const result = await ArchivedResult.deleteMany({ academicYear: req.params.academicYear });
        res.json({ success: true, message: `تم حذف أرشيف سنة ${req.params.academicYear} بالكامل (${result.deletedCount} سجل)` });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف سنة الأرشيف' }); }
});





// ====================== تحديث بروفايل الطالب (للطالب نفسه) ======================
app.put('/api/student/profile', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        // التأكد أن المستخدم طالب
        if (req.user.type !== 'student') {
            return res.status(403).json({ error: 'هذا المسار مخصص للطلاب فقط' });
        }
        
        const { phone } = req.body.profile || {};
        const studentCode = req.user.studentCode;
        
        if (!studentCode) {
            return res.status(400).json({ error: 'رقم الطالب غير موجود' });
        }
        
        // التحقق من صحة رقم الهاتف (اختياري)
        if (phone && phone.trim() !== '') {
            // يمكن إضافة validation هنا
        }
        
        // تحديث رقم الهاتف فقط
        const updated = await Student.findOneAndUpdate(
            { studentCode: studentCode },
            { $set: { 'profile.phone': phone || '' } },
            { new: true }
        ).select('-password -refreshToken');
        
        if (!updated) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        res.json({ 
            success: true, 
            message: 'تم تحديث رقم الهاتف بنجاح',
            student: updated 
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث بروفايل الطالب:', error);
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' });
    }
});

// ====================== تحديث بروفايل الأدمن ======================
app.put('/api/admin/profile', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        // التأكد أن المستخدم أدمن
        if (req.user.type !== 'admin') {
            return res.status(403).json({ error: 'هذا المسار مخصص للأدمن فقط' });
        }
        
        const { phone } = req.body.profile || {};
        const username = req.user.username;
        
        if (!username) {
            return res.status(400).json({ error: 'اسم المستخدم غير موجود' });
        }
        
        const updated = await Admin.findOneAndUpdate(
            { username: username },
            { $set: { 'profile.phone': phone || '' } },
            { new: true }
        ).select('-password -refreshToken');
        
        if (!updated) {
            return res.status(404).json({ error: 'الأدمن غير موجود' });
        }
        
        res.json({ 
            success: true, 
            message: 'تم تحديث رقم الهاتف بنجاح',
            admin: updated 
        });
        
    } catch (error) {
        console.error('❌ خطأ في تحديث بروفايل الأدمن:', error);
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' });
    }
});



app.delete('/api/students/:studentCode', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        const student = await Student.findOneAndDelete({ studentCode });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        await Violation.deleteMany({ studentId: studentCode });
        res.json({ message: 'تم حذف الطالب بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في حذف الطالب' }); }
});

// ====================== جلب الطلاب حسب الصف ======================
app.get('/api/students/by-grade/:grade', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        let gradeValue = req.params.grade;
        if (!['first', 'second', 'third'].includes(gradeValue)) return res.status(400).json({ error: 'صف غير صحيح' });
        const students = await Student.find({ grade: gradeValue }).select('-password -refreshToken');
        res.json(students);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الطلاب' }); }
});

// ====================== كشف الحسابات المكررة/المتشابهة (أدمن فقط) ======================
// الهدف: يلاقي لو الطالب نفسه عامل أكتر من حساب — حتى لو مرة سجل اسمه بالعربي ومرة
// بالإنجليزي (زي "احمد محمد" و"Ahmed Mohamed")، عن طريق تحويل أي اسم لمفتاح صوتي موحّد
// بالحروف اللاتينية ومقارنته. وكمان بيقارن باقي البيانات مع بعضها (اسم ولي الأمر، رقم
// الهاتف، رقم بطاقة ولي الأمر، آخر IP دخول) عشان يطلع نتيجة أدق مش بس معتمد على الاسم.
// النتيجة عبارة عن مجموعات (groups)، كل مجموعة فيها الحسابات اللي شكلها نفس الطالب،
// مع سبب/أسباب التشابه ونسبة الثقة، عشان الأدمن يراجعها ويقرر بنفسه.

// خريطة تقريبية لتحويل الحروف العربية لمكافئها الصوتي بالإنجليزي
const ARABIC_TRANSLIT_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ء': 'a', 'ئ': 'y', 'ؤ': 'w', 'ى': 'a',
    'ب': 'b', 'ت': 't', 'ث': 's', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'ة': 'h', 'و': 'w', 'ي': 'y'
};

function isArabicText(text) {
    return /[\u0600-\u06FF]/.test(text);
}

function transliterateArabicWord(word) {
    return word.split('').map(ch => {
        if (ARABIC_TRANSLIT_MAP[ch] !== undefined) return ARABIC_TRANSLIT_MAP[ch];
        return /[\u0600-\u06FF\u064B-\u065F]/.test(ch) ? '' : ch; // شيل التشكيل/أي حرف عربي مش متعرَّف
    }).join('');
}

// مفتاح صوتي "خشن" لكلمة واحدة — بيوحّد عربي/إنجليزي في نفس الشكل، عشان
// "Ahmed"/"Ahmad"/"احمد" كلهم يطلعوا بمفتاح متطابق أو قريب جدًا من بعض
function phoneticKey(rawWord) {
    if (!rawWord) return '';
    let w = isArabicText(rawWord) ? transliterateArabicWord(rawWord) : String(rawWord).toLowerCase();
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return '';
    w = w.replace(/kh/g, 'h').replace(/gh/g, 'g').replace(/sh/g, 's').replace(/th/g, 's');
    w = w.replace(/(.)\1+/g, '$1'); // شيل تكرار نفس الحرف (mohammed -> mohamed)
    if (w.length > 1) w = w[0] + w.slice(1).replace(/[aeiouy]/g, ''); // شيل حروف العلة عدا أول حرف
    return w;
}

function nameToTokens(fullName) {
    return String(fullName || '').trim().split(/\s+/).map(phoneticKey).filter(Boolean);
}

function levenshteinDistance(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return dp[m][n];
}

function phoneticKeysClose(k1, k2) {
    if (!k1 || !k2) return false;
    if (k1 === k2) return true;
    const maxLen = Math.max(k1.length, k2.length);
    const dist = levenshteinDistance(k1, k2);
    return dist <= 1 || (dist / maxLen) <= 0.25;
}

// نسبة تشابه بين مجموعتين من التوكنز الصوتية (كل توكن من الأقصر بيدور على أقرب توكن في التاني)
function tokensSimilarity(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;
    const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
    const longer = tokensA.length <= tokensB.length ? tokensB : tokensA;
    let matched = 0;
    const usedIdx = new Set();
    for (const tok of shorter) {
        for (let i = 0; i < longer.length; i++) {
            if (usedIdx.has(i)) continue;
            if (phoneticKeysClose(tok, longer[i])) { matched++; usedIdx.add(i); break; }
        }
    }
    return matched / shorter.length;
}

function normalizePhoneForMatch(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 8 ? digits.slice(-10) : '';
}

function normalizeIdForMatch(id) {
    const digits = String(id || '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : '';
}

// مقارنة شاملة بين طالبين على كل المعلومات المتاحة (مش بس الاسم)، وإرجاع نسبة تشابه + أسباب
function compareStudentsForDuplicates(a, b) {
    const nameSim = tokensSimilarity(a.nameTokens, b.nameTokens);
    const parentNameSim = tokensSimilarity(a.parentTokens, b.parentTokens);
    const phoneMatch = !!(a.phoneKey && a.phoneKey === b.phoneKey);
    const parentIdMatch = !!(a.parentIdKey && a.parentIdKey === b.parentIdKey);
    const ipMatch = !!(a.lastIP && b.lastIP && a.lastIP === b.lastIP);

    let score = nameSim * 0.40 + parentNameSim * 0.15 + (phoneMatch ? 0.20 : 0) + (parentIdMatch ? 0.15 : 0) + (ipMatch ? 0.10 : 0);
    score = Math.min(1, score);

    const reasons = [];
    if (nameSim >= 0.9) reasons.push('اسم الطالب متطابق تقريبًا (عربي/إنجليزي)');
    else if (nameSim >= 0.6) reasons.push('اسم الطالب متشابه جدًا (عربي/إنجليزي)');
    if (parentNameSim >= 0.6) reasons.push('اسم ولي الأمر متشابه');
    if (phoneMatch) reasons.push('نفس رقم الهاتف بالظبط');
    if (parentIdMatch) reasons.push('نفس رقم بطاقة ولي الأمر بالظبط');
    if (ipMatch) reasons.push('اتسجلوا من نفس الجهاز/الشبكة (آخر IP)');

    // اعتبرهم "مكررين محتملين" لو النقطة الإجمالية عالية، أو لو فيه تطابق حاسم لوحده (هاتف/بطاقة)
    const isDuplicate = score >= 0.45 || phoneMatch || parentIdMatch;
    return { score, reasons, isDuplicate };
}

app.get('/api/admin/students/duplicate-accounts', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const students = await Student.find().select('fullName studentCode username grade semester gender profile lastIP createdAt');

        const items = students.map(s => ({
            studentCode: s.studentCode,
            fullName: s.fullName,
            username: s.username,
            grade: s.grade,
            semester: s.semester,
            gender: s.gender,
            phone: (s.profile && s.profile.phone) || '',
            parentName: (s.profile && s.profile.parentName) || '',
            parentId: (s.profile && s.profile.parentId) || '',
            lastIP: s.lastIP || '',
            createdAt: s.createdAt,
            nameTokens: nameToTokens(s.fullName),
            parentTokens: nameToTokens(s.profile && s.profile.parentName),
            phoneKey: normalizePhoneForMatch(s.profile && s.profile.phone),
            parentIdKey: normalizeIdForMatch(s.profile && s.profile.parentId)
        })).filter(it => it.nameTokens.length > 0);

        // تجميع بالجراف (connected components): لو أ شابه ب، وب شابه ج، الثلاثة بيظهروا
        // في نفس المجموعة حتى لو أ وج مش متشابهين مباشرة على كل المحاور
        const n = items.length;
        const adjacency = Array.from({ length: n }, () => []);
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const result = compareStudentsForDuplicates(items[i], items[j]);
                if (result.isDuplicate) {
                    adjacency[i].push({ to: j, score: result.score, reasons: result.reasons });
                    adjacency[j].push({ to: i, score: result.score, reasons: result.reasons });
                }
            }
        }

        const visited = new Array(n).fill(false);
        const groups = [];
        for (let i = 0; i < n; i++) {
            if (visited[i] || adjacency[i].length === 0) continue;
            const stack = [i];
            const memberIdx = new Set();
            const allReasons = new Set();
            let maxScore = 0;
            while (stack.length) {
                const cur = stack.pop();
                if (visited[cur]) continue;
                visited[cur] = true;
                memberIdx.add(cur);
                for (const edge of adjacency[cur]) {
                    maxScore = Math.max(maxScore, edge.score);
                    edge.reasons.forEach(r => allReasons.add(r));
                    if (!visited[edge.to]) stack.push(edge.to);
                }
            }
            if (memberIdx.size > 1) {
                const members = Array.from(memberIdx).map(idx => {
                    const { nameTokens, parentTokens, phoneKey, parentIdKey, ...rest } = items[idx];
                    return rest;
                });
                groups.push({
                    accountsCount: members.length,
                    confidence: Math.round(maxScore * 100),
                    reasons: Array.from(allReasons),
                    members
                });
            }
        }

        groups.sort((a, b) => b.confidence - a.confidence || b.accountsCount - a.accountsCount);

        res.json({ success: true, totalGroups: groups.length, groups });
    } catch (error) {
        console.error('❌ خطأ في اكتشاف الحسابات المكررة:', error);
        res.status(500).json({ error: 'خطأ في اكتشاف الحسابات المكررة' });
    }
});


// ====================== إنشاء مدير أول ======================
app.post('/api/create-initial-admin', async (req, res) => {
    try {
        await connectToDatabase();
        const adminCount = await Admin.countDocuments();
        if (adminCount > 0) return res.json({ message: 'يوجد أدمن بالفعل في النظام', adminExists: true });
        const { fullName, username, password } = req.body;
        if (!fullName || !username || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const hashedPassword = await hashPassword(password);
        const admin = new Admin({ fullName, username, password: hashedPassword, role: 'manager' });
        await admin.save();
        res.json({ success: true, message: 'تم إنشاء المدير الأول بنجاح' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

// ====================== APIs ولي الأمر ======================
app.post('/api/parent/login', async (req, res) => {
    try {
        await connectToDatabase();
        const { parentId, password } = req.body;
        if (!parentId || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        // ✅ التطابق بيتم على آخر 7 أرقام من رقم بطاقة ولي الأمر فقط (سواء الطالب وقت
        // التسجيل كتب الرقم القومي كامل أو آخر 7 أرقام بس) — بنطبع المدخل لأرقام فقط
        // ونقارن بآخر 7 أرقام من القيمة المخزنة عشان يبقى دخول ولي الأمر بسيط وموحّد.
        const normalizedInput = String(parentId).replace(/\D/g, '').slice(-7);
        if (normalizedInput.length !== 7) return res.status(400).json({ error: 'آخر 7 أرقام من بطاقة ولي الأمر لازم تكون 7 أرقام' });
        const student = await Student.findOne({ 'profile.parentId': { $regex: normalizedInput + '$' } });
        if (!student) return res.status(401).json({ error: 'رقم بطاقة ولي الأمر غير صحيح' });
        const expectedPassword = student.studentCode.slice(-7);
        if (password !== expectedPassword) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        const token = jwt.sign({ id: student._id, type: 'parent', studentCode: student.studentCode, fullName: student.fullName }, JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);
        res.json({ success: true, studentId: student._id, studentName: student.fullName, studentCode: student.studentCode, parentName: student.profile?.parentName || 'ولي الأمر' });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

app.get('/api/parent/student/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
});

app.get('/api/parent/student/:studentCode/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('subjectsFirst subjectsSecond subjects fullName studentCode');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const subjectsFirst = (student.subjectsFirst && student.subjectsFirst.length) ? student.subjectsFirst : (student.subjects || []);
        res.json({ fullName: student.fullName, studentCode: student.studentCode, subjectsFirst, subjectsSecond: student.subjectsSecond || [] });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب النتائج' }); }
});

app.get('/api/parent/student/:studentCode/attendance', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const attendance = await Attendance.find({ studentCode: req.params.studentCode }).sort({ date: -1 });
        const present = attendance.filter(a => a.status === 'present').length;
        const absent = attendance.filter(a => a.status === 'absent').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const total = attendance.length;
        const percentage = total > 0 ? (present / total) * 100 : 0;
        res.json({ present, absent, late, total, percentage: percentage.toFixed(1), records: attendance });
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الحضور' }); }
});

app.get('/api/parent/student/:studentCode/violations', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const violations = await Violation.find({ studentId: req.params.studentCode }).sort({ date: -1 });
        res.json(violations);
    } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب المخالفات' }); }
});

// ====================== DeepSeek AI (كامل) ======================
let conversationHistory = new Map();
let userPreferences = new Map();
let userProgress = new Map();
let importantFacts = new Map();

function saveConversationContext(userId, userMessage, botResponse) {
    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);
    history.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });
    history.push({ role: 'assistant', content: botResponse, timestamp: new Date().toISOString() });
    if (history.length > 20) conversationHistory.set(userId, history.slice(-20));
}

function getConversationContext(userId) {
    const history = conversationHistory.get(userId) || [];
    const facts = importantFacts.get(userId) || [];
    const preferences = userPreferences.get(userId) || {};
    let context = '';
    if (history.length > 0) {
        context += '\n【آخر المحادثات】\n';
        history.slice(-6).forEach(msg => {
            context += `${msg.role === 'user' ? '👤 الطالب' : '🤖 المساعد'}: ${msg.content.substring(0, 100)}\n`;
        });
    }
    if (facts.length > 0) {
        context += '\n【معلومات مهمة】\n';
        facts.slice(-2).forEach(fact => context += `📌 ${fact.fact.substring(0, 80)}\n`);
    }
    if (preferences.level) context += `\n🎓 مستوى الطالب: ${preferences.level}\n`;
    return context;
}

function getFallbackResponse(prompt) {
    const p = prompt.toLowerCase();
    if (p.includes('مرحب') || p.includes('السلام') || p.includes('هلا')) return `👋 **وعليكم السلام ورحمة الله!**\n\nأنا 🤖 **مساعدك الذكي في معهد رعاية الضبعية**\n\n📚 **أقدر أساعدك في:**\n• شرح الرعاية التلطيفية (Palliative Care)\n• شرح الموت الدماغي (Brain Death)\n• معلومات عن التمريض\n• الاستعلام عن النتائج والدرجات\n\n🎯 **إيه اللي محتاج مساعدة فيه النهاردة؟**`;
    if (p.includes('palliative') || p.includes('رعاية تلطيفية')) return `🏥 **الرعاية التلطيفية (Palliative Care)**\n\n📌 **تعريفها:** نهج طبي متخصص لتحسين جودة حياة مرضى الأمراض الخطيرة.\n\n📌 **المبادئ الأساسية:**\n• تخفيف الألم والأعراض\n• الدعم النفسي والاجتماعي للمريض والأسرة\n• تحسين التواصل مع الفريق الطبي\n\nهل تريد تفاصيل أكثر عن أي نقطة؟`;
    if (p.includes('brain death') || p.includes('موت دماغي')) return `🧠 **الموت الدماغي (Brain Death)**\n\n📌 **التعريف:** التوقف الكامل والنهائي لوظائف الدماغ بأكمله، بما في ذلك جذع الدماغ.\n\n📌 **المعايير التشخيصية:**\n• غيبوبة عميقة بدون استجابة\n• انعدام التنفس التلقائي تماماً\n• اختفاء ردود أفعال جذع الدماغ\n• ثبوت النتائج بعد 6-24 ساعة\n\nهل تريد شرح أكثر تفصيلاً؟`;
    if (p.includes('تمريض') || p.includes('nursing')) return `🩺 **التمريض - مهنة إنسانية نبيلة**\n\n📌 **المهام الأساسية للممرض:**\n• تقديم الرعاية المباشرة للمرضى\n• مراقبة العلامات الحيوية\n• إعطاء الأدوية حسب الوصفات الطبية\n• التثقيف الصحي للمرضى وأسرهم\n• التعاون مع الفريق الطبي\n\nهل تريد معلومات عن مجال معين؟`;
    if (p.includes('نتيجة') || p.includes('درجة') || p.includes('امتحان')) return `📊 **النتائج والدرجات**\n\nللاستعلام عن نتيجتك:\n\n1️⃣ **اذهب إلى صفحة "النتائج"** من القائمة السفلية\n2️⃣ **أدخل كود الطالب الخاص بك** (رقم الجلوس)\n3️⃣ **ستظهر جميع درجاتك**\n\nإذا نسيت الكود، تواصل مع إدارة المعهد.`;
    if (p.includes('شكر')) return `🙏 **العفو! أنا سعيد بخدمتك**\n\nاتمنى لك التوفيق في دراستك 🌟\n\nفي خدمتك دايماً 🤗`;
    return `📚 **أنا هنا لمساعدتك!**\n\n🎯 **يمكنك سؤالي عن:**\n• الرعاية التلطيفية (Palliative Care)\n• الموت الدماغي (Brain Death)\n• التمريض الجراحي والباطني\n• النتائج والدرجات\n\nكيف أقدر أساعدك أكثر اليوم؟`;
}

// ====================== أدوات مساعدة: خدمة بايثون + DeepSeek (JSON) ======================
// بتنادي خدمة بايثون المنفصلة (python-service/) عشان تستخرج نص خام من ملف
// (PDF/DOCX/TXT) عن طريق رابطه العام على R2. لو الخدمة مش متاحة أو الملف نوعه
// مش مدعوم، بترجع خطأ واضح بدل ما تعلّق الطلب أو تفشل بصمت.
async function extractTextViaPython(url) {
    if (!PY_SERVICE_URL) {
        const err = new Error('خدمة استخراج النصوص مش متاحة حاليًا (PY_SERVICE_URL مش مضبوط)');
        err.code = 'service_unavailable';
        throw err;
    }
    let response;
    try {
        response = await fetch(`${PY_SERVICE_URL}/extract-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
    } catch (e) {
        const err = new Error('تعذر الوصول لخدمة استخراج النصوص');
        err.code = 'service_unreachable';
        throw err;
    }
    if (!response.ok) {
        let detail = 'تعذر استخراج نص الملف';
        try { const data = await response.json(); if (data?.detail) detail = data.detail; } catch (_) {}
        const err = new Error(detail);
        err.code = 'extract_failed';
        throw err;
    }
    const data = await response.json();
    return data.text;
}

// بتنادي Gemini (لو فيه مفتاح) وإلا DeepSeek (لو فيه مفتاح) عشان تولّد رد JSON.
// بتفضّل Gemini أولًا — استخدمنا alias اسمه "gemini-flash-latest" (بيديره
// Google نفسها) بدل ما نثبّت اسم نسخة معينة زي "gemini-2.5-flash"، عشان
// النسخة القديمة بتتقاعد بمرور الوقت والـ alias ده بيتحدّث تلقائي لأحدث
// نسخة فلاش من غير ما نحتاج نعدّل الكود تاني.
async function callGeminiJSON(systemPrompt, userPrompt, maxTokens = 1500) {
    const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
            method: 'POST',
            headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, temperature: 0.4 }
            })
        }
    );
    if (!response.ok) {
        const err = new Error('فشل استدعاء Gemini');
        err.code = 'ai_call_failed';
        throw err;
    }
    const data = await response.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    try {
        return JSON.parse(raw);
    } catch (e) {
        const err = new Error('رد Gemini مكانش JSON صالح');
        err.code = 'ai_bad_json';
        throw err;
    }
}

// بتنادي DeepSeek وبتحاول تضمن إن الرد JSON صالح — بتشيل أي ```json fences لو
// الموديل حطها رغم التعليمات، وبترمي خطأ واضح لو فشل الـ parsing.
async function callDeepSeekJSON(systemPrompt, userPrompt, maxTokens = 1500) {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.4,
            max_tokens: maxTokens
        })
    });
    if (!response.ok) {
        const err = new Error('فشل استدعاء نموذج الذكاء الاصطناعي');
        err.code = 'ai_call_failed';
        throw err;
    }
    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        const err = new Error('رد الذكاء الاصطناعي مكانش JSON صالح');
        err.code = 'ai_bad_json';
        throw err;
    }
}

// نقطة الدخول الموحّدة اللي بتستخدمها فيتشرز الأسئلة/التلخيص — بتفضّل Gemini،
// ولو مش متاح بتستخدم DeepSeek، ولو ولا واحد فيهم متاح بترجع خطأ واضح.
// كده لو ضفت أي مفتاح تاني (أو الاتنين مع بعض) الموقع يشتغل من غير أي تعديل تاني.
async function callAIJSON(systemPrompt, userPrompt, maxTokens = 1500) {
    if (GEMINI_API_KEY) return callGeminiJSON(systemPrompt, userPrompt, maxTokens);
    if (DEEPSEEK_API_KEY) return callDeepSeekJSON(systemPrompt, userPrompt, maxTokens);
    const err = new Error('خدمة الذكاء الاصطناعي مش مفعّلة حاليًا (GEMINI_API_KEY أو DEEPSEEK_API_KEY مش مضبوطين)');
    err.code = 'ai_unavailable';
    throw err;
}

// زي callAIJSON بالظبط، بس بـ failover حقيقي: لو Gemini اتنادى عليه وفشل فعليًا
// (مش بس مش مضبوط)، بتلف تلقائيًا على DeepSeek قبل ما ترمي خطأ نهائي. مفيدة
// للفيتشرز اللي محتاجة أعلى نسبة نجاح ممكنة (زي تحسين وصف الصورة) بدل ما تقف
// عند أول مزوّد يفشل.
// نداء عام لأي مزوّد متوافق مع OpenAI Chat Completions API (Groq وMistral
// وSambaNova وQwen (النصي) وOpenRouter كلهم بنفس الشكل بالظبط) — بيرجّع رد
// JSON بعد تنضيف أي ```json fences لو الموديل حطها رغم التعليمات.
async function callOpenAICompatJSON(url, apiKey, model, systemPrompt, userPrompt, maxTokens, extraHeaders = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.4,
            max_tokens: maxTokens,
            stream: false
        })
    });
    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const err = new Error(`فشل استدعاء الموديل (status ${response.status})`);
        err.code = 'ai_call_failed';
        err.detail = errBody.slice(0, 300);
        throw err;
    }
    const data = await response.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        const err = new Error('رد الموديل مكانش JSON صالح');
        err.code = 'ai_bad_json';
        throw err;
    }
}

// سلسلة الـ failover الكاملة على كل الموديلات "العادية" (المجانية/الأساسية)
// المتاحة — Gemini وDeepSeek الأول (الأعلى جودة عادةً)، وبعدين كل الموديلات
// المجانية المستخدمة في شات chatx بنفس الترتيب. Cerebras وclaude-opus/OneHop
// (النسخة القديمة) مستبعدين عمدًا لأنهم موديلات premium_ai. أي مفتاح مش مضبوط
// بيتخطّى تلقائيًا (enabled: false) من غير ما يوقف السلسلة.
const TEXT_AI_FAILOVER_CHAIN = [
    { key: 'gemini', label: 'Gemini', enabled: () => !!GEMINI_API_KEY, run: (sys, user, max) => callGeminiJSON(sys, user, max) },
    { key: 'deepseek', label: 'DeepSeek', enabled: () => !!DEEPSEEK_API_KEY, run: (sys, user, max) => callDeepSeekJSON(sys, user, max) },
    { key: 'groq', label: 'Groq', enabled: () => !!GROQ_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://api.groq.com/openai/v1/chat/completions', GROQ_API_KEY, 'openai/gpt-oss-20b', sys, user, max) },
    { key: 'mistral', label: 'Mistral', enabled: () => !!MISTRAL_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://api.mistral.ai/v1/chat/completions', MISTRAL_API_KEY, 'mistral-small-latest', sys, user, max) },
    { key: 'sambanova', label: 'SambaNova', enabled: () => !!SAMBANOVA_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://api.sambanova.ai/v1/chat/completions', SAMBANOVA_API_KEY, 'Meta-Llama-3.3-70B-Instruct', sys, user, max) },
    { key: 'qwen-chat', label: 'Qwen', enabled: () => !!QWEN_CHAT_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', QWEN_CHAT_API_KEY, 'qwen-plus', sys, user, max) },
    { key: 'openrouter', label: 'OpenRouter', enabled: () => !!OPENROUTER_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://openrouter.ai/api/v1/chat/completions', OPENROUTER_API_KEY, 'openrouter/free', sys, user, max, { 'HTTP-Referer': 'https://school-x.vercel.app', 'X-Title': 'School X' }) },
    { key: 'onehop', label: 'OneHop', enabled: () => !!ONEHOP_API_KEY, run: (sys, user, max) => callOpenAICompatJSON('https://openrouter.ai/api/v1/chat/completions', ONEHOP_API_KEY, 'dots-studio/dots-3-note-preview:free', sys, user, max) }
];

// بتلف على TEXT_AI_FAILOVER_CHAIN بالترتيب وترجع أول رد ناجح — مستخدمة
// للفيتشرز اللي محتاجة أعلى نسبة نجاح ممكنة (زي تحسين وصف الصورة) بدل ما تقف
// عند أول موديل يفشل أو ميكونش مضبوط.
async function callAIJSONWithFailover(systemPrompt, userPrompt, maxTokens = 1500) {
    const errors = [];
    for (const provider of TEXT_AI_FAILOVER_CHAIN) {
        if (!provider.enabled()) continue;
        try {
            const result = await provider.run(systemPrompt, userPrompt, maxTokens);
            return { result, usedModel: provider.key };
        } catch (error) {
            console.error(`⚠️ ${provider.label} فشل${error.detail ? ' — ' + error.detail : ''}:`, error.message);
            errors.push({ model: provider.key, detail: error.message });
        }
    }
    const err = new Error(errors.length ? 'كل موديلات الذكاء الاصطناعي المتاحة فشلت' : 'مفيش أي موديل ذكاء اصطناعي مضبوط حاليًا');
    err.code = errors.length ? 'ai_all_failed' : 'ai_unavailable';
    err.attempts = errors;
    throw err;
}

// 🔍 تشخيصي — بيتأكد إن الـ Environment Variables فعلاً وصلت لنفس الـ instance
// اللي بيرد على الطلبات دلوقتي (مش بس محفوظة في Vercel Dashboard). بيرجع
// true/false بس (مش قيمة المفتاح نفسه) عشان الأمان. لو true وبرضو الفيتشرز
// بترجع "مش مفعّلة"، يبقى المشكلة مكان تاني (مش المفاتيح) — كلّمني وقولي
// النتيجة. شيل الـ endpoint ده بعد ما تتأكد.
app.get('/api/admin/env-check', verifyToken, isAdmin, (req, res) => {
    res.json({
        GEMINI_API_KEY: Boolean(GEMINI_API_KEY),
        DEEPSEEK_API_KEY: Boolean(DEEPSEEK_API_KEY),
        PY_SERVICE_URL: Boolean(PY_SERVICE_URL),
        // ملحوظة: مفاتيح Qwen وGrok بقت تتدار من /api/admin/api-keys (محفوظة في
        // الداتابيز) مش من هنا — القيم دي (DASHSCOPE_API_KEY وCOMETAPI_KEY) بقت
        // بس fallback احتياطي لو محدش ضاف مفتاح من لوحة الأدمن.
        DASHSCOPE_API_KEY_env_fallback: Boolean(DASHSCOPE_API_KEY),
        COMETAPI_KEY_env_fallback: Boolean(process.env.COMETAPI_KEY),
        vercelEnv: process.env.VERCEL_ENV || null,       // production / preview / development
        deploymentUrl: process.env.VERCEL_URL || null    // الدومين الفعلي بتاع الـ deployment ده
    });
});

// ====================== إدارة مفاتيح API من لوحة الأدمن ======================
// بيسمح للأدمن يضيف/يمسح/يشوف مفتاح (أو أكتر) لأي مزوّد (Qwen، Grok، Flux، أو
// أي مزوّد تاني يتضاف بالكود لاحقًا) من الواجهة مباشرة، من غير ما يحتاج يدخل
// Vercel Environment Variables ويعمل Redeploy في كل مرة.
// كل مزوّد ممكن يكون ليه أكتر من مفتاح (مثلًا أكتر من حساب/اشتراك) — لو مفتاح
// فشل (رصيد خلص أو خطأ) بنتحول تلقائيًا للمفتاح اللي بعده لنفس المزوّد على
// طول (شوف withKeyRotation تحت)، من غير ما الطالب يحس بأي حاجة.
function maskApiKey(key) {
    if (!key || key.length < 8) return '••••••••';
    return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

app.get('/api/admin/api-keys', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const docs = await ApiKeySetting.find().sort({ provider: 1 });
        res.json(docs.map(d => {
            // توافق مع الشكل القديم (مفتاح واحد بس محفوظ في apiKey) — لو موجود
            // ولسه معملوش تعديل، بنعرضه كأول مفتاح في القايمة.
            const keys = [...(d.keys || [])];
            if (d.apiKey && !keys.some(k => k.key === d.apiKey)) {
                keys.unshift({ _id: 'legacy', key: d.apiKey, label: 'قديم', failCount: 0, disabled: false });
            }
            return {
                provider: d.provider,
                updatedBy: d.updatedBy,
                updatedAt: d.updatedAt,
                keys: keys.map(k => ({
                    id: k._id ? String(k._id) : 'legacy',
                    maskedKey: maskApiKey(k.key),
                    label: k.label || '',
                    failCount: k.failCount || 0,
                    disabled: !!k.disabled,
                    lastError: k.lastError || null,
                    lastUsedAt: k.lastUsedAt || null
                }))
            };
        }));
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المفاتيح' });
    }
});

// إظهار المفتاح كامل (من غير إخفاء) — للأدمن بس، ولازم يحدد مفتاح بعينه بالـ id.
app.get('/api/admin/api-keys/:provider/:keyId/reveal', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const cleanProvider = String(req.params.provider || '').trim().toLowerCase();
        const doc = await ApiKeySetting.findOne({ provider: cleanProvider });
        if (!doc) return res.status(404).json({ error: 'المزوّد غير موجود' });
        if (req.params.keyId === 'legacy') {
            if (!doc.apiKey) return res.status(404).json({ error: 'المفتاح غير موجود' });
            return res.json({ apiKey: doc.apiKey });
        }
        const keyDoc = (doc.keys || []).find(k => String(k._id) === req.params.keyId);
        if (!keyDoc) return res.status(404).json({ error: 'المفتاح غير موجود' });
        res.json({ apiKey: keyDoc.key });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إظهار المفتاح' });
    }
});

// إضافة مفتاح جديد لمزوّد (من غير ما يمسح المفاتيح الموجودة قبل كده — بيتضاف
// جنبهم في القايمة عشان يشتغل نظام التبديل التلقائي بينهم).
app.post('/api/admin/api-keys', verifyToken, isAdmin, async (req, res) => {
    try {
        const { provider, apiKey, label } = req.body || {};
        const cleanProvider = String(provider || '').trim().toLowerCase();
        const cleanKey = String(apiKey || '').trim();
        const cleanLabel = String(label || '').trim().slice(0, 60);
        if (!cleanProvider) return res.status(400).json({ error: 'اسم المزوّد مطلوب' });
        if (!cleanKey) return res.status(400).json({ error: 'المفتاح مطلوب' });
        await connectToDatabase();
        const doc = await ApiKeySetting.findOneAndUpdate(
            { provider: cleanProvider },
            {
                $setOnInsert: { provider: cleanProvider },
                $set: { updatedBy: req.user.username },
                $push: { keys: { key: cleanKey, label: cleanLabel, failCount: 0, disabled: false } }
            },
            { upsert: true, new: true }
        );
        const added = doc.keys[doc.keys.length - 1];
        res.json({ success: true, provider: doc.provider, key: { id: String(added._id), maskedKey: maskApiKey(added.key), label: added.label } });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ المفتاح' });
    }
});

// حذف مفتاح واحد بعينه من مزوّد (من غير ما يمسح باقي مفاتيحه).
app.delete('/api/admin/api-keys/:provider/:keyId', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const cleanProvider = String(req.params.provider || '').trim().toLowerCase();
        if (req.params.keyId === 'legacy') {
            await ApiKeySetting.updateOne({ provider: cleanProvider }, { $unset: { apiKey: '' } });
        } else {
            await ApiKeySetting.updateOne({ provider: cleanProvider }, { $pull: { keys: { _id: req.params.keyId } } });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المفتاح' });
    }
});

// حذف كل مفاتيح المزوّد مرة واحدة (زرار "امسح الكل").
app.delete('/api/admin/api-keys/:provider', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        await ApiKeySetting.deleteOne({ provider: String(req.params.provider).toLowerCase() });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المفتاح' });
    }
});

// ====================== استوديو الصور الذكي (Premium) ======================
// Gemini أحيانًا بيرجّع خطأ 503 "high demand" وقت الضغط — ده مؤقت غالبًا وبينحل
// لوحده خلال ثواني. بدل ما نرجّع الخطأ للطالب على طول، بنحاول تاني مرة واحدة
// بعد تأخير بسيط قبل ما نستسلم فعلًا.
async function fetchGeminiWithRetry(url, options, retries = 1, delayMs = 1500) {
    for (let attempt = 0; ; attempt++) {
        const response = await fetch(url, options);
        if (response.ok || attempt >= retries || response.status !== 503) return response;
        await new Promise(r => setTimeout(r, delayMs));
    }
}

// ====================== تحليل الصور برؤية AI حقيقية (Vision) — بـ failover ======================
// مش OCR نصي بس زي الـ Tesseract في الشات العادي — بتبعت بايتس الصورة فعليًا
// لموديل عنده رؤية حقيقية (multimodal)، فبيقدر يوصف رسومات ومخططات وصور مش
// نصية خالص (زي صورة جهاز أو رسم تشريحي). زي نظام تحسين الوصف بالظبط: بتلف
// على كل الموديلات المتاحة اللي بتدعم رؤية بالترتيب (Gemini، بعدين DeepSeek
// عن طريق موديل deepseek-v4-flash-vision-exp التجريبي، بعدين Qwen عن طريق
// qwen3-vl-plus) — أول واحد يرد بنجاح بناخد رده، ولو فشل بنعدّي للي بعده.

async function analyzeImageWithGemini(systemPrompt, userText, imageBase64, mimeType) {
    const response = await fetchGeminiWithRetry(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
            method: 'POST',
            headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{
                    role: 'user',
                    parts: [
                        { text: userText },
                        { inline_data: { mime_type: mimeType, data: imageBase64 } }
                    ]
                }],
                generationConfig: { maxOutputTokens: 1500, temperature: 0.2 } // temperature منخفضة عمدًا هنا — دقة أهم من إبداع في تحليل صورة
            })
        }
    );
    if (!response.ok) {
        let detail = 'فشل استدعاء Gemini';
        try { const d = await response.json(); if (d?.error?.message) detail = d.error.message; } catch (_) {}
        const err = new Error(detail);
        err.code = 'ai_call_failed';
        throw err;
    }
    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysis) { const err = new Error('رد Gemini مكانش فيه نص تحليل'); err.code = 'ai_bad_response'; throw err; }
    return analysis;
}

// deepseek-v4-flash-vision-exp — موديل DeepSeek التجريبي للرؤية، بنفس صيغة
// OpenAI Chat Completions (image_url بـ data URL base64).
async function analyzeImageWithDeepSeek(systemPrompt, userText, imageBase64, mimeType) {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-v4-flash-vision-exp',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: [
                    { type: 'text', text: userText },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
                ] }
            ],
            temperature: 0.2,
            max_tokens: 1500
        })
    });
    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const err = new Error(`فشل استدعاء DeepSeek Vision (status ${response.status})`);
        err.code = 'ai_call_failed';
        err.detail = errBody.slice(0, 300);
        throw err;
    }
    const data = await response.json();
    const analysis = (data.choices?.[0]?.message?.content || '').trim();
    if (!analysis) { const err = new Error('رد DeepSeek مكانش فيه نص تحليل'); err.code = 'ai_bad_response'; throw err; }
    return analysis;
}

// qwen3-vl-plus عن طريق DashScope compatible-mode — نفس مفتاح الشات النصي
// (QWEN_CHAT_API_KEY)، بنفس صيغة OpenAI Chat Completions.
async function analyzeImageWithQwen(systemPrompt, userText, imageBase64, mimeType) {
    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${QWEN_CHAT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'qwen3-vl-plus',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: [
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                    { type: 'text', text: userText }
                ] }
            ],
            temperature: 0.2,
            max_tokens: 1500
        })
    });
    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const err = new Error(`فشل استدعاء Qwen Vision (status ${response.status})`);
        err.code = 'ai_call_failed';
        err.detail = errBody.slice(0, 300);
        throw err;
    }
    const data = await response.json();
    const analysis = (data.choices?.[0]?.message?.content || '').trim();
    if (!analysis) { const err = new Error('رد Qwen مكانش فيه نص تحليل'); err.code = 'ai_bad_response'; throw err; }
    return analysis;
}

const VISION_AI_FAILOVER_CHAIN = [
    { key: 'gemini', label: 'Gemini', enabled: () => !!GEMINI_API_KEY, run: analyzeImageWithGemini },
    { key: 'deepseek', label: 'DeepSeek', enabled: () => !!DEEPSEEK_API_KEY, run: analyzeImageWithDeepSeek },
    { key: 'qwen', label: 'Qwen', enabled: () => !!QWEN_CHAT_API_KEY, run: analyzeImageWithQwen }
];

// بتلف على VISION_AI_FAILOVER_CHAIN بالترتيب وترجع أول تحليل ناجح — بالظبط زي
// callAIJSONWithFailover بتاعة تحسين الوصف، بس هنا للتحليل النصي الحر (مش JSON).
async function analyzeImageWithFailover(systemPrompt, userText, imageBase64, mimeType) {
    const errors = [];
    for (const provider of VISION_AI_FAILOVER_CHAIN) {
        if (!provider.enabled()) continue;
        try {
            const analysis = await provider.run(systemPrompt, userText, imageBase64, mimeType);
            return { analysis, usedModel: provider.key };
        } catch (error) {
            console.error(`⚠️ ${provider.label} فشل في تحليل الصورة${error.detail ? ' — ' + error.detail : ''}:`, error.message);
            errors.push({ model: provider.key, detail: error.message });
        }
    }
    const err = new Error(errors.length ? 'كل موديلات تحليل الصور فشلت' : 'خدمة تحليل الصور مش مفعّلة حاليًا');
    err.code = errors.length ? 'ai_all_failed' : 'ai_unavailable';
    err.attempts = errors;
    throw err;
}

app.post('/api/premium/vision-analyze', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        const { image, question } = req.body || {};
        if (!image || !image.base64 || !image.mimeType) return res.status(400).json({ error: 'الصورة مطلوبة' });
        if (image.base64.length > 8_000_000) return res.status(413).json({ error: 'الصورة كبيرة قوي' });

        const trimmedQuestion = String(question || '').trim().slice(0, 500);
        const systemPrompt = `أنت مساعد تعليمي متخصص في التمريض بتحلل صور بدقة عالية للطلاب.
- افحص الصورة بعناية شديدة قبل ما ترد.
- لو فيها نص، اقرأه بالكامل بدقة.
- لو فيها رسم تشريحي/تخطيط/جهاز طبي، اشرح كل جزء فيه ووظيفته.
- لو الطالب سأل سؤال محدد عن الصورة، ركّز إجابتك عليه أولًا.
- رد بالعربي، بشكل منظم وواضح، من غير مبالغة أو تخمين لحاجة مش واضحة في الصورة — لو حاجة مش واضحة قول كده صراحة بدل ما تخمّن.`;
        const userText = trimmedQuestion || 'حلّل الصورة دي بالتفصيل واشرح كل حاجة مهمة فيها.';

        const { analysis, usedModel } = await analyzeImageWithFailover(systemPrompt, userText, image.base64, image.mimeType);
        res.json({ analysis, usedModel });
    } catch (error) {
        console.error('❌ خطأ في تحليل الصورة:', error.message);
        const msg = error.code === 'ai_unavailable' ? 'خدمة تحليل الصور مش مفعّلة حاليًا'
            : error.code === 'ai_all_failed' ? 'تعذر تحليل الصورة حاليًا (كل الموديلات المتاحة فشلت)، حاول تاني بعد شوية'
            : 'خطأ في تحليل الصورة';
        res.status(502).json({
            error: msg,
            ...(req.user?.type === 'admin' && error.attempts ? { debugAttempts: error.attempts } : {})
        });
    }
});

// ====================== مزوّدين توليد الصور — دالة واحدة لكل مزوّد ======================
// كل دالة بترجع نفس الشكل دايمًا: { ok: true, imageUrl? , imageBase64?, mimeType? }
// أو { ok: false, reason?, status?, detail? } — كده الكود اللي بينادي عليهم (سواء
// تلقائي أو اختيار يدوي من الطالب) موحّد ومفيش تكرار منطق.
// كل دالة بتجيب مفتاحها عن طريق getProviderApiKey (الداتابيز الأول، الـ env
// كـ fallback) — يعني الأدمن يقدر يغيّر أي مفتاح من لوحة التحكم من غير Redeploy.

async function genImage_qwen(trimmed) {
    return withKeyRotation('qwen', DASHSCOPE_API_KEY, async (apiKey) => {
        try {
            const response = await fetch(
                'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'qwen-image-2.0',
                        input: { messages: [{ role: 'user', content: [{ text: trimmed }] }] },
                        parameters: {
                            prompt_extend: true,
                            result_format: 'message',
                            n: 1,
                            watermark: true,
                            negative_prompt: ''
                        }
                    })
                }
            );
            if (response.ok) {
                const data = await response.json();
                // ملحوظة: بيرجّع رابط صورة مؤقت (مستضاف على Alibaba OSS، بينتهي بعد
                // فترة) مش base64 — عشان كده بنرجعه كـ imageUrl.
                const imageUrl = data.output?.choices?.[0]?.message?.content?.find(c => c.image)?.image;
                if (imageUrl) return { ok: true, imageUrl };
                console.error('⚠️ Qwen: رد 200 لكن من غير صورة:', JSON.stringify(data).slice(0, 800));
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            const errBody = await response.text().catch(() => '');
            console.error(`❌ Qwen فشل — status ${response.status}:`, errBody.slice(0, 800));
            return { ok: false, status: response.status, detail: errBody.slice(0, 300) };
        } catch (error) {
            console.error('❌ Qwen exception:', error.message);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    });
}

// Grok وFlux (الاتنين عن طريق CometAPI) — بيرجّعوا صورة من وصف نصي، وبيدعموا
// كمان تعديل صورة موجودة بوصف نصي. مش متاحة لـ Qwen لأنه مش بيدعم تعديل صور.
const COMETAPI_BASE_URL = 'https://api.cometapi.com';
const GROK_IMAGE_MODEL = 'grok-imagine-image-2.0';

function extractCometImage(data) {
    // التوثيق ما وضّحش اسم الحقل بدقة، فبنجرب كذا شكل محتمل زي باقي المزوّدين.
    return data?.data?.[0]?.url
        || data?.data?.[0]?.b64_json
        || data?.images?.[0]?.url
        || (typeof data?.images?.[0] === 'string' ? data.images[0] : null)
        || null;
}

async function genImage_grok(trimmed) {
    return withKeyRotation('grok', process.env.COMETAPI_KEY || '', async (apiKey) => {
        try {
            const response = await fetch(`${COMETAPI_BASE_URL}/v1/images/generations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: GROK_IMAGE_MODEL, prompt: trimmed })
            });
            if (response.ok) {
                const data = await response.json();
                const img = extractCometImage(data);
                if (img) {
                    // لو الحقل شكله data URI أو base64 خام نرجعه كـ imageBase64، وإلا نعتبره رابط.
                    if (typeof img === 'string' && /^https?:\/\//.test(img)) return { ok: true, imageUrl: img };
                    return { ok: true, imageBase64: img.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' };
                }
                console.error('⚠️ Grok (CometAPI): رد 200 لكن مقدرناش نستخرج صورة منه:', JSON.stringify(data).slice(0, 1000));
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            const errBody = await response.text().catch(() => '');
            console.error(`❌ Grok (CometAPI) فشل — status ${response.status}:`, errBody.slice(0, 800));
            return { ok: false, status: response.status, detail: errBody.slice(0, 300) };
        } catch (error) {
            console.error('❌ Grok (CometAPI) exception:', error.message);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    });
}

// تعديل صورة موجودة بوصف نصي — Grok. imageUrl لازم يكون رابط عام يقدر
// CometAPI يوصله (مش data: URI محلي).
async function genEdit_grok(imageUrl, editPrompt) {
    return withKeyRotation('grok', process.env.COMETAPI_KEY || '', async (apiKey) => {
        try {
            const response = await fetch(`${COMETAPI_BASE_URL}/v1/images/edits`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: GROK_IMAGE_MODEL,
                    prompt: editPrompt,
                    image: { type: 'image_url', url: imageUrl }
                })
            });
            if (response.ok) {
                const data = await response.json();
                const img = extractCometImage(data);
                if (img) {
                    if (typeof img === 'string' && /^https?:\/\//.test(img)) return { ok: true, imageUrl: img };
                    return { ok: true, imageBase64: img.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' };
                }
                console.error('⚠️ Grok edit: رد 200 لكن مقدرناش نستخرج صورة منه:', JSON.stringify(data).slice(0, 1000));
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            const errBody = await response.text().catch(() => '');
            console.error(`❌ Grok edit فشل — status ${response.status}:`, errBody.slice(0, 800));
            return { ok: false, status: response.status, detail: errBody.slice(0, 300) };
        } catch (error) {
            console.error('❌ Grok edit exception:', error.message);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    });
}

// Flux 2 Max (عن طريق CometAPI /flux/v1/flux-2-max) — نفس فكرة Grok، بس الـ
// endpoint ده غير متزامن (async): أول طلب POST بيرجّع id (وأحيانًا polling_url
// جاهز)، وبعدين لازم نستعلم على /flux/v1/get_result لحد ما تجهز الصورة أو
// تفشل. بيدعم كمان تحديد أبعاد الصورة بدقة (width/height). ⚠️ لاحظنا إن
// CometAPI بترفض القيمة النصية "custom" لحقل aspect_ratio (بترجع خطأ
// "aspect_ratio must be between 21:9 and 9:21")، فبنحسب نسبة حقيقية من
// width/height فعليًا (computeFluxAspectRatio) ونبعتها مع نفس width/height.
const FLUX_GENERATE_URL = `${COMETAPI_BASE_URL}/flux/v1/flux-2-max`;
const FLUX_RESULT_URL = `${COMETAPI_BASE_URL}/flux/v1/get_result`;
const FLUX_DEFAULT_WIDTH = 1024;
const FLUX_DEFAULT_HEIGHT = 1024;

// الأبعاد لازم تكون من مضاعفات 16 (متطلب الموديل)، وبنحصرها في مدى معقول
// (256 - 1440) عشان منبعتش قيمة يرفضها السيرفر لو الفرونت إند بعت رقم غريب.
function clampFluxDimension(value, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    const clamped = Math.min(1440, Math.max(256, n));
    return Math.round(clamped / 16) * 16;
}

// بترجع نسبة الأبعاد كنص مبسّط (زي "16:9") من width/height فعليين — CometAPI
// بقى بيرفض القيمة النصية "custom" لحقل aspect_ratio (بيحاول يفسّرها كنسبة
// فعلية ويطلع بخطأ "aspect_ratio must be between 21:9 and 9:21")، فلازم نبعت
// نسبة رقمية حقيقية دايمًا حتى لو الطالب مستخدم أبعاد مخصّصة. القيمة محصورة
// أوتوماتيك بين 1:3 و3:1 عشان تفضل جوه المدى المسموح (21:9 ≈ 2.33، 9:21 ≈ 0.43).
function computeFluxAspectRatio(width, height) {
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    let w = width, h = height;
    const ratio = w / h;
    const MIN_RATIO = 9 / 21, MAX_RATIO = 21 / 9;
    if (ratio < MIN_RATIO) { h = Math.round(w / MIN_RATIO); }
    else if (ratio > MAX_RATIO) { h = Math.round(w / MAX_RATIO); }
    const d = gcd(w, h) || 1;
    return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

// شكل رد /flux/v1/get_result (ولو حصل ونفس الرد الأول رجّع الصورة على طول)
// مش موثّق بالكامل، فبنجرب كذا حقل محتمل زي باقي المزوّدين.
function extractFluxImage(data) {
    return data?.result?.sample
        || data?.sample
        || data?.result?.url
        || data?.output_url
        || extractCometImage(data)
        || null;
}

// بتستعلم على نتيجة مهمة Flux لحد ما تخلص (Ready) أو تفشل أو تخلص المهلة.
// المهلة الإجمالية دلوقتي حوالي 170 ثانية (~2.8 دقيقة) — Flux أحيانًا بياخد
// وقت أطول من المتوقع وقت الضغط، فبنستنى فترة أطول قبل ما نعتبرها فشلت.
// ⚠️ مهم: لازم maxDuration بتاع الفانكشن ده في vercel.json (أو إعدادات
// Function Duration في Vercel Dashboard) يكون ≥ 180 ثانية (محتاج Pro plan على
// الأقل)، وإلا Vercel نفسه هيقفل الفانكشن قبل ما المهلة دي تخلص بغض النظر عن
// الكود هنا. أول 10 محاولات كل 2 ثانية (تغطي الحالة الشائعة اللي بتخلص بسرعة)،
// وبعد كده كل 4 ثواني عشان نقلل عدد الطلبات من غير ما نضيّع وقت.
async function pollFluxResult(apiKey, taskId, pollingUrl) {
    const target = pollingUrl || `${FLUX_RESULT_URL}?id=${encodeURIComponent(taskId)}`;
    const FAST_ATTEMPTS = 10, FAST_INTERVAL_MS = 2000;
    const SLOW_ATTEMPTS = 38, SLOW_INTERVAL_MS = 4000;
    const totalAttempts = FAST_ATTEMPTS + SLOW_ATTEMPTS;
    for (let attempt = 0; attempt < totalAttempts; attempt++) {
        const intervalMs = attempt < FAST_ATTEMPTS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
        await new Promise(r => setTimeout(r, intervalMs));
        try {
            const response = await fetch(target, {
                method: 'GET',
                headers: { 'Authorization': apiKey, 'Accept': '*/*' }
            });
            if (!response.ok) continue;
            const data = await response.json();
            const status = String(data?.status || '').toLowerCase();
            if (['ready', 'succeeded', 'completed', 'success'].includes(status)) {
                const img = extractFluxImage(data);
                if (img) return { ok: true, img };
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            if (['error', 'failed', 'content_moderated', 'request_moderated'].includes(status)) {
                return { ok: false, reason: 'generation_failed', detail: JSON.stringify(data).slice(0, 300) };
            }
            // لسه Pending/Processing/Task not found (أول لحظة) — نكمل الاستعلام
        } catch (error) {
            // خطأ مؤقت في الاستعلام — نكمل نحاول لحد ما تخلص المحاولات
        }
    }
    return { ok: false, reason: 'timeout', detail: 'انتهت مهلة انتظار توليد الصورة' };
}

function fluxImageResult(img) {
    if (/^https?:\/\//.test(String(img))) return { ok: true, imageUrl: img };
    return { ok: true, imageBase64: String(img).replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/jpeg' };
}

// إنشاء صورة من وصف نصي — Flux 2 Max. opts.width/opts.height (اختياريين)
// بيسمحوا للطالب يحدد أبعاد الصورة؛ لو مش موجودين بنستخدم مربع 1024×1024.
async function genImage_flux(trimmed, opts = {}) {
    return withKeyRotation('flux', process.env.COMETAPI_KEY || '', async (apiKey) => {
        try {
            const width = clampFluxDimension(opts.width, FLUX_DEFAULT_WIDTH);
            const height = clampFluxDimension(opts.height, FLUX_DEFAULT_HEIGHT);
            const response = await fetch(FLUX_GENERATE_URL, {
                method: 'POST',
                headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': '*/*' },
                body: JSON.stringify({
                    prompt: trimmed,
                    image_prompt: '',
                    aspect_ratio: computeFluxAspectRatio(width, height),
                    width, height,
                    seed: Math.floor(Math.random() * 1000000),
                    safety_tolerance: 2,
                    output_format: 'jpeg',
                    webhook_url: '',
                    webhook_secret: ''
                })
            });
            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                console.error(`❌ Flux (CometAPI) فشل — status ${response.status}:`, errBody.slice(0, 800));
                return { ok: false, status: response.status, detail: errBody.slice(0, 300) };
            }
            const data = await response.json();
            const immediateImg = extractFluxImage(data);
            if (immediateImg) return fluxImageResult(immediateImg);

            const taskId = data?.id || data?.task_id || data?.request_id;
            const pollingUrl = data?.polling_url;
            if (!taskId && !pollingUrl) {
                console.error('⚠️ Flux (CometAPI): رد بدون صورة ولا id للاستعلام:', JSON.stringify(data).slice(0, 1000));
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            const polled = await pollFluxResult(apiKey, taskId, pollingUrl);
            if (!polled.ok) return polled;
            return fluxImageResult(polled.img);
        } catch (error) {
            console.error('❌ Flux (CometAPI) exception:', error.message);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    });
}

// تعديل صورة موجودة بوصف نصي — Flux، عن طريق تمرير رابط الصورة الأصلية في
// image_prompt مع وصف التعديل في prompt. imageUrl لازم يكون رابط عام يقدر
// CometAPI يوصله (مش data: URI محلي).
async function genEdit_flux(imageUrl, editPrompt, opts = {}) {
    return withKeyRotation('flux', process.env.COMETAPI_KEY || '', async (apiKey) => {
        try {
            const width = clampFluxDimension(opts.width, FLUX_DEFAULT_WIDTH);
            const height = clampFluxDimension(opts.height, FLUX_DEFAULT_HEIGHT);
            const response = await fetch(FLUX_GENERATE_URL, {
                method: 'POST',
                headers: { 'Authorization': apiKey, 'Content-Type': 'application/json', 'Accept': '*/*' },
                body: JSON.stringify({
                    prompt: editPrompt,
                    image_prompt: imageUrl,
                    aspect_ratio: computeFluxAspectRatio(width, height),
                    width, height,
                    seed: Math.floor(Math.random() * 1000000),
                    safety_tolerance: 2,
                    output_format: 'jpeg',
                    webhook_url: '',
                    webhook_secret: ''
                })
            });
            if (!response.ok) {
                const errBody = await response.text().catch(() => '');
                console.error(`❌ Flux edit فشل — status ${response.status}:`, errBody.slice(0, 800));
                return { ok: false, status: response.status, detail: errBody.slice(0, 300) };
            }
            const data = await response.json();
            const immediateImg = extractFluxImage(data);
            if (immediateImg) return fluxImageResult(immediateImg);

            const taskId = data?.id || data?.task_id || data?.request_id;
            const pollingUrl = data?.polling_url;
            if (!taskId && !pollingUrl) {
                console.error('⚠️ Flux edit: رد بدون صورة ولا id للاستعلام:', JSON.stringify(data).slice(0, 1000));
                return { ok: false, reason: 'no_image_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            const polled = await pollFluxResult(apiKey, taskId, pollingUrl);
            if (!polled.ok) return polled;
            return fluxImageResult(polled.img);
        } catch (error) {
            console.error('❌ Flux edit exception:', error.message);
            return { ok: false, reason: 'exception', detail: error.message };
        }
    });
}

// ====================== Grok Imagine Video (عن طريق CometAPI /grok/v1) ======================
// موديل فيديو من نص أو من صورة (image-to-video)، بصوت مدمج. بيتفعّل عن طريق
// نفس نظام تدوير مفاتيح CometAPI (withKeyRotation) بس بمفتاح مزوّد منفصل
// ('grok-video') عشان الأدمن يقدر يضيف مفاتيح مخصصة للفيديو لو حابب يفصل
// الميزانية عن باقي مزوّدين الصور.
//
// 💰 توفير الكريدت (الفيديو مكلّف جدًا مقارنة بالصور — تسعير بالثانية):
// - المدة ثابتة على 10 ثواني بس (مش قابلة للتغيير) — أرخص مدة معقولة للاستخدام
//   التعليمي بدل ما تسيب الطالب يختار مدة أطول وأغلى.
// - الدقة ثابتة على 480p (مش قابلة للتغيير) — تقريبًا نص سعر 720p للثانية.
// - حد يومي صارم منفصل عن حد الصور (DAILY_VIDEO_LIMIT) لأن كل فيديو بيكلّف
//   أضعاف الصورة الواحدة.
const GROK_VIDEO_BASE_URL = `${COMETAPI_BASE_URL}/grok/v1`;
const VIDEO_DURATION_SECONDS = 10;
const VIDEO_RESOLUTION = '480p';

async function createGrokVideoTask(apiKey, prompt, imageUrl, aspectRatio) {
    const payload = {
        model: 'grok-imagine-video',
        prompt,
        duration: VIDEO_DURATION_SECONDS,
        aspect_ratio: aspectRatio || '16:9',
        resolution: VIDEO_RESOLUTION
    };
    if (imageUrl) payload.image_url = imageUrl; // لو موجودة → صورة لفيديو (image-to-video)، لو مش موجودة → نص لفيديو
    const response = await fetch(`${GROK_VIDEO_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const err = new Error(`فشل إنشاء مهمة الفيديو — status ${response.status}`);
        err.status = response.status;
        err.detail = errBody.slice(0, 300);
        throw err;
    }
    const data = await response.json();
    const taskId = data?.request_id || data?.id;
    if (!taskId) {
        const err = new Error('رد إنشاء مهمة الفيديو من غير task ID');
        err.detail = JSON.stringify(data).slice(0, 300);
        throw err;
    }
    return taskId;
}

// بتستعلم على حالة مهمة الفيديو لحد ما تخلص (SUCCESS) أو تفشل (FAILURE) أو
// تخلص المهلة. الفيديو بياخد وقت أطول من الصور بكتير (دقيقة لحد كذا دقيقة مش
// حاجة غريبة)، فبنستعلم كل 10 ثواني (نفس الفترة الموصى بيها في مثال CometAPI
// الرسمي) لمدة أقصاها ~28 محاولة (حوالي 280 ثانية / 4.7 دقيقة).
// ⚠️ مهم جدًا (زي Flux بالظبط، بس أهم هنا لطول المدة): maxDuration بتاع
// الفانكشن ده في vercel.json (أو إعدادات Function Duration في Vercel
// Dashboard) لازم يكون ≥290 ثانية، وده محتاج أعلى خطة متاحة عندك على Vercel
// (Pro على الأقل، وممكن تحتاج Fluid Compute لو الخطة العادية بتوقف عند 60
// ثانية) — وإلا Vercel هيقفل الفانكشن قبل ما الفيديو يخلص بغض النظر عن الكود.
async function pollGrokVideoTask(apiKey, taskId) {
    const ATTEMPTS = 28, INTERVAL_MS = 10000;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        try {
            const response = await fetch(`${GROK_VIDEO_BASE_URL}/videos/${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!response.ok) continue; // خطأ مؤقت في الاستعلام — نكمل نحاول
            const queryResult = await response.json();
            const data = queryResult?.data || {};
            const status = String(data?.status || '').toUpperCase();
            if (status === 'SUCCESS' || status === 'DONE') {
                const videoUrl = data?.data?.video?.url || data?.video?.url;
                if (videoUrl) return { ok: true, videoUrl };
                return { ok: false, reason: 'no_video_in_response', detail: JSON.stringify(data).slice(0, 300) };
            }
            if (status === 'FAILURE' || status === 'FAILED') {
                return { ok: false, reason: 'generation_failed', detail: data?.fail_reason || 'فشل توليد الفيديو' };
            }
            // لسه PENDING/RUNNING — نكمل الاستعلام
        } catch (error) {
            // خطأ مؤقت في الاستعلام — نكمل نحاول لحد ما تخلص المحاولات
        }
    }
    return { ok: false, reason: 'timeout', detail: 'انتهت مهلة انتظار توليد الفيديو' };
}

// إنشاء فيديو (من نص، أو من صورة لو imageUrl موجودة) — Grok Imagine Video.
async function generateGrokVideo(prompt, imageUrl, aspectRatio) {
    return withKeyRotation('grok-video', process.env.COMETAPI_KEY || '', async (apiKey) => {
        try {
            const taskId = await createGrokVideoTask(apiKey, prompt, imageUrl, aspectRatio);
            const polled = await pollGrokVideoTask(apiKey, taskId);
            if (!polled.ok) return polled;
            return { ok: true, videoUrl: polled.videoUrl };
        } catch (error) {
            console.error('❌ Grok Video (CometAPI) exception:', error.message);
            return { ok: false, status: error.status, reason: error.status ? undefined : 'exception', detail: error.detail || error.message };
        }
    });
}

// خريطة موحّدة: المفتاح ده هو نفسه اللي الفرونت إند بيبعته لو الطالب اختار مزوّد
// معيّن بدل "تلقائي". بيسهّل الإضافة لاحقًا (مزوّد جديد = سطر واحد هنا).
const IMAGE_PROVIDERS = {
    qwen: { fn: genImage_qwen, label: 'Qwen' },
    grok: { fn: genImage_grok, label: 'Grok' },
    flux: { fn: genImage_flux, label: 'Flux' }
};
// مزوّدين بيدعموا تعديل صورة موجودة بوصف نصي (مش كل المزوّدين بيدعموا ده — Qwen مثلًا لأ).
const EDIT_PROVIDERS = {
    grok: { fn: genEdit_grok, label: 'Grok' },
    flux: { fn: genEdit_flux, label: 'Flux' }
};
// الترتيب التلقائي — Qwen (الرسمي) الأول، ولو فشل أو خلص رصيده نروح على Grok،
// ولو ده كمان فشل نروح على Flux، تلقائيًا عشان العملية تفضل مستمرة من غير ما
// الطالب يحس بأي انقطاع.
const AUTO_ORDER = ['qwen', 'grok', 'flux'];

// إنشاء صورة — إما "تلقائي" (بيجرب المزوّدين بالترتيب لحد ما واحد ينجح)، أو
// مزوّد محدد يختاره الطالب بنفسه من قائمة استوديو الصور (وقتها منجربش غيره
// خالص حتى لو فشل — الشفافية أهم من إنه "يظبط الموضوع لوحده" لما الطالب
// بيحدد بالاسم إيه اللي عايزه).
app.post('/api/premium/generate-image', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        const { prompt, provider, width, height } = req.body || {};
        // الحد رُفع لـ 1000 حرف عشان يستوعب بادئة الأسلوب (Style preset)
        // اللي بتتحط في أول الوصف من الفرونت إند من غير ما تتقطع تفاصيل موضوع
        // الطالب أو الأسلوب نفسه.
        const trimmed = String(prompt || '').trim().slice(0, 1000);
        if (!trimmed) return res.status(400).json({ error: 'وصف الصورة مطلوب' });
        // أبعاد الصورة (اختياري) — بيستخدمها Flux فعليًا حاليًا، وأي مزوّد
        // تاني بيدعم تحديد الأبعاد ممكن ياخدها من نفس الـ opts لاحقًا.
        const sizeOpts = { width, height };

        // الحد اليومي — الأدمن مستثنى تمامًا (زي باقي فحوصات الـ Premium).
        const isAdminReq = req.user?.type === 'admin';
        let quota = { used: 0, remaining: DAILY_IMAGE_LIMIT, limit: DAILY_IMAGE_LIMIT };
        if (!isAdminReq) {
            quota = await reserveImageQuota(req.user.username);
            if (!quota.allowed) {
                return res.status(429).json({
                    error: `وصلت للحد الأقصى من إنشاء الصور اليوم (${DAILY_IMAGE_LIMIT} صور) — هيتجدد بكرة`,
                    quotaRemaining: 0, quotaLimit: DAILY_IMAGE_LIMIT
                });
            }
        }
        const releaseQuotaIfNeeded = () => { if (!isAdminReq) return releaseImageQuota(req.user.username); };

        // ==== وضع: مزوّد محدد بالاسم ====
        if (provider && provider !== 'auto') {
            const entry = IMAGE_PROVIDERS[provider];
            if (!entry) { await releaseQuotaIfNeeded(); return res.status(400).json({ error: 'مزوّد غير معروف' }); }
            const result = await entry.fn(trimmed, sizeOpts);
            if (result.ok) {
                const saved = await saveGeneratedImageToLibrary({
                    username: req.user?.username, prompt: trimmed, provider, source: 'generate',
                    imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType
                });
                return res.json({
                    imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType, usedProvider: provider,
                    savedToLibrary: !!saved, quotaRemaining: quota.remaining, quotaLimit: quota.limit
                });
            }
            // فشل المزوّد المحدد — نرجع الخطأ صراحة (من غير أي fallback تلقائي
            // لمزوّد تاني)، عشان الطالب يعرف بالظبط اللي حصل مع اختياره.
            await releaseQuotaIfNeeded();
            const reasonText = result.reason === 'no_api_key' ? 'المفتاح غير مضبوط لهذا المزوّد'
                : result.reason === 'not_configured' ? 'المزوّد غير مفعّل حاليًا'
                : result.status === 429 || result.status === 403 ? 'انتهى الرصيد المجاني لهذا المزوّد'
                : 'تعذر إنشاء الصورة عن طريق هذا المزوّد';
            return res.status(502).json({
                error: reasonText,
                ...(req.user?.type === 'admin' ? { debugAttempts: [{ provider, ...result }] } : {})
            });
        }

        // ==== وضع: تلقائي (الوضع الافتراضي) ====
        const attempts = [];
        for (const key of AUTO_ORDER) {
            const result = await IMAGE_PROVIDERS[key].fn(trimmed, sizeOpts);
            if (result.ok) {
                const saved = await saveGeneratedImageToLibrary({
                    username: req.user?.username, prompt: trimmed, provider: key, source: 'generate',
                    imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType
                });
                return res.json({
                    imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType,
                    usedProvider: key, savedToLibrary: !!saved, quotaRemaining: quota.remaining, quotaLimit: quota.limit,
                    ...(key !== AUTO_ORDER[0] ? { fallback: true, fallbackProvider: key } : {})
                });
            }
            attempts.push({ provider: key, ...result });
        }
        // كل المزوّدين فشلوا — بنرجّع خطأ صريح بدل ما نتظاهر بالنجاح، ونرجّع
        // الطلقة المحجوزة من الحد اليومي لأن الطالب فعليًا مستفادش حاجة.
        await releaseQuotaIfNeeded();
        console.error('⚠️ كل مزوّدي إنشاء الصور فشلوا:', JSON.stringify(attempts));
        res.status(502).json({
            error: 'تعذر إنشاء الصورة من أي مزوّد متاح حاليًا',
            ...(req.user?.type === 'admin' ? { debugAttempts: attempts } : {})
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء الصورة:', error.message);
        res.status(500).json({ error: 'خطأ في إنشاء الصورة' });
    }
});

// ====================== تعديل صورة موجودة (Grok أو Flux) ======================
// بتاخد صورة موجودة (لازم تكون رابط عام، مش base64 محلي) ووصف تعديل نصي، وترجع
// نسخة معدّلة. متاحة بس للمزوّدين الموجودين في EDIT_PROVIDERS (Qwen مش بيدعم
// تعديل صور، فمش موجود هنا). لازم تحدد نفس المزوّد اللي أنشأ الصورة الأصلية.
app.post('/api/premium/edit-image', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        const { imageUrl, prompt, provider, width, height } = req.body || {};
        const trimmedPrompt = String(prompt || '').trim().slice(0, 1000);
        const cleanProvider = String(provider || 'grok').trim().toLowerCase();
        if (!imageUrl) return res.status(400).json({ error: 'رابط الصورة مطلوب' });
        if (!trimmedPrompt) return res.status(400).json({ error: 'وصف التعديل مطلوب' });
        if (!/^https?:\/\//.test(imageUrl)) {
            return res.status(400).json({ error: 'تعديل الصور متاح بس على الصور اللي اتولّدت برابط عام (مش صور مرفوعة محليًا)' });
        }
        const entry = EDIT_PROVIDERS[cleanProvider];
        if (!entry) return res.status(400).json({ error: 'تعديل الصور مش متاح للمزوّد ده' });

        // التعديل بيستهلك رصيد المزوّد زي الإنشاء بالظبط، فبيخصم من نفس الحد
        // اليومي. الأدمن مستثنى تمامًا.
        const isAdminReq = req.user?.type === 'admin';
        let quota = { used: 0, remaining: DAILY_IMAGE_LIMIT, limit: DAILY_IMAGE_LIMIT };
        if (!isAdminReq) {
            quota = await reserveImageQuota(req.user.username);
            if (!quota.allowed) {
                return res.status(429).json({
                    error: `وصلت للحد الأقصى من إنشاء/تعديل الصور اليوم (${DAILY_IMAGE_LIMIT} صور) — هيتجدد بكرة`,
                    quotaRemaining: 0, quotaLimit: DAILY_IMAGE_LIMIT
                });
            }
        }

        const result = await entry.fn(imageUrl, trimmedPrompt, { width, height });
        if (result.ok) {
            const saved = await saveGeneratedImageToLibrary({
                username: req.user?.username, prompt: trimmedPrompt, provider: cleanProvider, source: 'edit',
                imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType
            });
            return res.json({
                imageUrl: result.imageUrl, imageBase64: result.imageBase64, mimeType: result.mimeType,
                savedToLibrary: !!saved, quotaRemaining: quota.remaining, quotaLimit: quota.limit
            });
        }

        if (!isAdminReq) await releaseImageQuota(req.user.username);
        const reasonText = result.reason === 'no_api_key' ? `مفتاح ${entry.label} غير مضبوط`
            : result.status === 429 || result.status === 403 ? `انتهى الرصيد المتاح لـ ${entry.label}`
            : 'تعذر تعديل الصورة';
        res.status(502).json({
            error: reasonText,
            ...(req.user?.type === 'admin' ? { debugAttempts: [{ provider: `${cleanProvider}_edit`, ...result }] } : {})
        });
    } catch (error) {
        console.error('❌ خطأ في تعديل الصورة:', error.message);
        res.status(500).json({ error: 'خطأ في تعديل الصورة' });
    }
});

// ====================== مكتبة صور استوديو الصور (Premium) ======================
// بترجع كل الصور اللي الطالب (أو الأدمن) حفظها من استوديو الصور، الأحدث الأول.
// كل طالب بيشوف صوره هو بس (فلترة بـ username من التوكن، مش بارامتر من الطلب).
app.get('/api/premium/image-library', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        await connectToDatabase();
        const images = await GeneratedImage.find({ username: req.user.username })
            .sort({ createdAt: -1 })
            .limit(120)
            .select('prompt provider source imageUrl mimeType createdAt');
        res.json({ images });
    } catch (error) {
        console.error('❌ خطأ في جلب مكتبة الصور:', error.message);
        res.status(500).json({ error: 'خطأ في جلب مكتبة الصور' });
    }
});

// حذف صورة من مكتبة الطالب — صاحب الصورة بس (أو الأدمن) يقدر يمسحها. بيمسح
// النسخة من R2 كمان مش بس سطر الداتابيز، عشان منسيبش ملفات يتيمة في التخزين.
app.delete('/api/premium/image-library/:id', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await GeneratedImage.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الصورة مش موجودة' });
        if (doc.username !== req.user.username && req.user.type !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح لك بحذف الصورة دي' });
        }
        await deleteFromSupabase(doc.storageKey).catch(() => {});
        await doc.deleteOne();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حذف صورة من المكتبة:', error.message);
        res.status(500).json({ error: 'خطأ في حذف الصورة' });
    }
});

// بترجع حالة الحد اليومي (مستخدَم/متبقّي) من غير ما تستهلك حاجة — بينادى
// عليها الفرونت إند وقت فتح تبويب "أنشئ صورة" عشان يعرض "متبقي كام" فورًا.
app.get('/api/premium/image-quota', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        if (req.user?.type === 'admin') {
            return res.json({ used: 0, remaining: DAILY_IMAGE_LIMIT, limit: DAILY_IMAGE_LIMIT, unlimited: true });
        }
        const quota = await getImageQuotaStatus(req.user.username);
        res.json(quota);
    } catch (error) {
        console.error('❌ خطأ في جلب حد الصور اليومي:', error.message);
        res.status(500).json({ error: 'خطأ في جلب حد الصور اليومي' });
    }
});

// بتاخد وصف صورة (ممكن يكون مختصر أو غامض) وترجّعه أوضح وأغنى بالتفاصيل
// البصرية عن طريق موديل نصي (Gemini أو DeepSeek — نفس اللي بيشغّل باقي فيتشرز
// الذكاء الاصطناعي في الموقع). عملية نصية رخيصة، فمش بتستهلك من الحد اليومي
// بتاع الصور.
app.post('/api/premium/improve-image-prompt', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        const trimmed = String(req.body?.prompt || '').trim().slice(0, 1000);
        if (!trimmed) return res.status(400).json({ error: 'اكتب وصف الصورة الأول' });
        const systemPrompt = 'انت مساعد متخصص في تحسين أوصاف الصور (prompts) لموديلات توليد صور بالذكاء الاصطناعي. '
            + 'هتاخد وصف مختصر أو غامض من طالب، وترجّعه أوضح وأدق وغني بتفاصيل بصرية مفيدة (الألوان، التكوين، '
            + 'الإضاءة، مستوى التفاصيل) من غير ما تغيّر الفكرة الأساسية للطلب، وبنفس لغة الوصف الأصلي. '
            + 'رجّع رد JSON بس بالشكل: {"improved": "الوصف المحسّن هنا"} — من غير أي شرح أو نص زيادة.';
        const { result, usedModel } = await callAIJSONWithFailover(systemPrompt, trimmed, 600);
        const improved = String(result?.improved || '').trim().slice(0, 1000);
        if (!improved) return res.status(502).json({ error: 'تعذر تحسين الوصف، حاول تاني' });
        res.json({ improved, usedModel });
    } catch (error) {
        console.error('❌ خطأ في تحسين وصف الصورة:', error.message);
        const msg = error.code === 'ai_unavailable' ? 'ميزة تحسين الوصف مش مفعّلة حاليًا'
            : error.code === 'ai_all_failed' ? 'تعذر تحسين الوصف حاليًا (كل الموديلات المتاحة فشلت)، حاول تاني بعد شوية'
            : 'تعذر تحسين الوصف، حاول تاني';
        res.status(502).json({
            error: msg,
            ...(req.user?.type === 'admin' && error.attempts ? { debugAttempts: error.attempts } : {})
        });
    }
});

// ====================== إنشاء فيديو (من نص أو من صورة) — Grok Imagine Video ======================
// نفس منطق endpoint إنشاء الصورة تقريبًا (حد يومي منفصل + حفظ تلقائي في
// المكتبة)، لكن كل عملية هنا بتاخد وقت أطول بكتير (دقايق مش ثواني) وبتكلّف
// أضعاف الصورة، فالحد اليومي (DAILY_VIDEO_LIMIT) أقل بكتير من حد الصور.
app.post('/api/premium/generate-video', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        const { prompt, imageUrl, aspectRatio } = req.body || {};
        const trimmed = String(prompt || '').trim().slice(0, 1000);
        if (!trimmed) return res.status(400).json({ error: 'وصف الفيديو مطلوب' });
        // لو فيه رابط صورة، لازم يكون رابط عام (مش data: URI محلي) عشان
        // CometAPI يقدر يوصله.
        if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
            return res.status(400).json({ error: 'رابط الصورة لازم يكون رابط عام (جرّب ترفع الصورة أو تولّدها من الاستوديو الأول)' });
        }
        const cleanAspectRatio = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(aspectRatio) ? aspectRatio : '16:9';

        // الحد اليومي — الأدمن مستثنى تمامًا (زي باقي فحوصات الـ Premium).
        const isAdminReq = req.user?.type === 'admin';
        let quota = { used: 0, remaining: DAILY_VIDEO_LIMIT, limit: DAILY_VIDEO_LIMIT };
        if (!isAdminReq) {
            quota = await reserveVideoQuota(req.user.username);
            if (!quota.allowed) {
                return res.status(429).json({
                    error: `وصلت للحد الأقصى من إنشاء الفيديو اليوم (${DAILY_VIDEO_LIMIT} فيديوهات) — هيتجدد بكرة`,
                    quotaRemaining: 0, quotaLimit: DAILY_VIDEO_LIMIT
                });
            }
        }

        const result = await generateGrokVideo(trimmed, imageUrl || null, cleanAspectRatio);
        if (!result.ok) {
            if (!isAdminReq) await releaseVideoQuota(req.user.username);
            const reasonText = result.reason === 'timeout' ? 'استغرق توليد الفيديو وقتًا أطول من المتوقع، حاول تاني'
                : result.reason === 'generation_failed' ? (result.detail || 'فشل توليد الفيديو')
                : result.status === 429 || result.status === 403 ? 'انتهى الرصيد المتاح لتوليد الفيديو حاليًا'
                : 'تعذر إنشاء الفيديو، حاول تاني';
            return res.status(502).json({
                error: reasonText,
                ...(req.user?.type === 'admin' ? { debugAttempts: [result] } : {})
            });
        }

        const saved = await saveGeneratedVideoToLibrary({
            username: req.user?.username, prompt: trimmed, source: imageUrl ? 'image' : 'text',
            aspectRatio: cleanAspectRatio, videoUrl: result.videoUrl
        });
        // لو الحفظ في R2 نجح، نرجّع رابطنا الدائم (بدل رابط المزوّد المؤقت)
        // عشان زرار التحميل يفضل شغال حتى بعد ما رابط المزوّد يموت.
        res.json({
            videoUrl: saved?.videoUrl || result.videoUrl,
            savedToLibrary: !!saved,
            quotaRemaining: quota.remaining, quotaLimit: quota.limit
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء الفيديو:', error.message);
        res.status(500).json({ error: 'خطأ في إنشاء الفيديو' });
    }
});

app.get('/api/premium/video-quota', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        if (req.user?.type === 'admin') {
            return res.json({ used: 0, remaining: DAILY_VIDEO_LIMIT, limit: DAILY_VIDEO_LIMIT, unlimited: true });
        }
        const quota = await getVideoQuotaStatus(req.user.username);
        res.json(quota);
    } catch (error) {
        console.error('❌ خطأ في جلب حد الفيديو اليومي:', error.message);
        res.status(500).json({ error: 'خطأ في جلب حد الفيديو اليومي' });
    }
});

app.get('/api/premium/video-library', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        await connectToDatabase();
        const videos = await GeneratedVideo.find({ username: req.user.username })
            .sort({ createdAt: -1 })
            .limit(60)
            .select('prompt source aspectRatio videoUrl mimeType createdAt');
        res.json({ videos });
    } catch (error) {
        console.error('❌ خطأ في جلب مكتبة الفيديو:', error.message);
        res.status(500).json({ error: 'خطأ في جلب مكتبة الفيديو' });
    }
});

app.delete('/api/premium/video-library/:id', verifyToken, requirePremium('premium_image_studio'), async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await GeneratedVideo.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الفيديو مش موجود' });
        if (doc.username !== req.user.username && req.user.type !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح لك بحذف الفيديو ده' });
        }
        await deleteFromSupabase(doc.storageKey).catch(() => {});
        await doc.deleteOne();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حذف فيديو من المكتبة:', error.message);
        res.status(500).json({ error: 'خطأ في حذف الفيديو' });
    }
});

app.post('/api/gemini', async (req, res) => {
    try {
        const { prompt, userId = req.user?.id || req.ip || 'anonymous' } = req.body;
        if (!prompt || prompt.trim() === '') return res.status(400).json({ error: 'الرسالة مطلوبة' });
        const conversationContext = getConversationContext(userId);
        const systemPrompt = `أنت مساعد تعليمي ذكي لمعهد رعاية الضبعية للتمريض.\n\n📌 تعليمات مهمة:\n- رد باللغة العربية (مصري أو فصحى)\n- تخصصك: التمريض، الرعاية التلطيفية، Palliative care, Brain death, Hospice care\n- كن ودوداً ومفيداً ومحترفاً\n- قدم إجابات دقيقة ومبسطة مع أمثلة عملية\n- إذا سأل عن النتيجة: "روح على صفحة النتائج وادخل الكود بتاعك"\n- استخدم السياق المقدم من المحادثات السابقة\n\n${conversationContext ? `\n📚 **سياق المحادثة السابقة مع هذا الطالب:**\n${conversationContext}\n` : ''}\n\n💬 **سؤال الطالب الحالي:** ${prompt}\n\nقدم رداً مفيداً وطبيعياً وودوداً باللغة العربية:`;
        let reply = null;

        // نفس أولوية باقي الخدمة: Gemini الأول (لو فيه مفتاح)، بعدين DeepSeek
        // كـ fallback (مفيش أي وظيفة اتشالت — بس ضفنا Gemini قبلها).
        if (GEMINI_API_KEY) {
            try {
                const response = await fetch(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
                    {
                        method: 'POST',
                        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemPrompt }] },
                            contents: [{ role: 'user', parts: [{ text: prompt }] }],
                            generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
                        })
                    }
                );
                if (response.ok) {
                    const data = await response.json();
                    reply = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
                }
            } catch (error) { console.log('⚠️ Gemini API error:', error.message); }
        }
        if (!reply && DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== '') {
            try {
                const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1000 })
                });
                if (response.ok) { const data = await response.json(); reply = data.choices?.[0]?.message?.content; }
            } catch (error) { console.log('⚠️ DeepSeek API error:', error.message); }
        }
        if (!reply) reply = getFallbackResponse(prompt);
        saveConversationContext(userId, prompt, reply);
        res.json({ reply: reply });
    } catch (error) { res.json({ reply: getFallbackResponse(req.body.prompt) }); }
});

app.post('/api/gemini/clear-memory', verifyToken, (req, res) => {
    const userId = req.user?.id || req.ip;
    conversationHistory.delete(userId);
    importantFacts.delete(userId);
    res.json({ success: true, message: '✅ تم مسح ذاكرة المحادثة بنجاح' });
});

app.get('/api/gemini/stats', verifyToken, (req, res) => {
    const userId = req.user?.id || req.ip;
    res.json({ conversationLength: (conversationHistory.get(userId) || []).length / 2, factsShared: (importantFacts.get(userId) || []).length, preferences: userPreferences.get(userId) || {}, progress: userProgress.get(userId) || {} });
});

app.get('/api/gemini/tips', verifyToken, (req, res) => {
    const userId = req.user?.id || req.ip;
    const progress = userProgress.get(userId) || {};
    let tip = '';
    if (progress.understandingLevel === 'مبتدئ') tip = '📚 **نصيحة مخصصة لك:**\n\nأنصحك بمراجعة الأساسيات أولاً، ثم الانتقال تدريجياً للموضوعات الأعمق. خصص 30 دقيقة يومياً للمراجعة.\n\n💪 أنت قادر على التقدم بسرعة!';
    else if (progress.understandingLevel === 'متوسط') tip = '🎯 **نصيحة مخصصة لك:**\n\nأنت في الطريق الصحيح! ركز على حل التمارين والتطبيقات العملية لتعزيز فهمك.\n\n🌟 استمر بهذا المستوى الرائع!';
    else tip = '⭐ **نصيحة مخصصة لك:**\n\nمستواك ممتاز! أنصحك الآن بتدريس ما تعلمته لزملائك - هذا سيعزز فهمك أكثر.\n\n🏆 أنت قدوة لزملائك!';
    res.json({ tip });
});

app.post('/api/gemini/vision', async (req, res) => {
    res.json({ reply: '🖼️ **خدمة تحليل الصور**\n\nهذه الخدمة قيد التطوير. قريباً سأتمكن من تحليل صورك وشرح محتواها!\n\n📌 في الوقت الحالي، يمكنك وصف الصورة وسأحاول مساعدتك.' });
});

// ملحوظة: /api/gemini/file و /api/gemini/questions اتنقلوا لتحت (بعد تعريف
// SharedSummary) واتفعّلوا فعليًا — بيولّدوا ملخص/أسئلة حقيقية من ملفات
// المكتبة المشتركة (مش ردود placeholder زي قبل كده). دوّر عليهم بالاسم لو
// عايز تعدّل فيهم.




// ====================== مسارات تقدم الطالب ======================

// جلب تقدم الطالب
app.get('/api/progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user.id || req.user.username;
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
            await progress.save();
        }
        res.json(progress);
    } catch (error) {
        console.error('❌ خطأ في جلب التقدم:', error);
        res.status(500).json({ error: 'خطأ في جلب التقدم' });
    }
});

// تحديث نقاط XP
app.post('/api/progress/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        
        res.json({ success: true, xp: progress.xp });
    } catch (error) {
        console.error('❌ خطأ في تحديث XP:', error);
        res.status(500).json({ error: 'خطأ في تحديث XP' });
    }
});

// تحديث المفضلة
app.post('/api/progress/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body; // action: 'add' or 'remove'
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        if (action === 'add') {
            if (!progress.bookmarks.includes(questionId)) {
                progress.bookmarks.push(questionId);
            }
        } else {
            progress.bookmarks = progress.bookmarks.filter(id => id !== questionId);
        }
        
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) {
        console.error('❌ خطأ في تحديث المفضلة:', error);
        res.status(500).json({ error: 'خطأ في تحديث المفضلة' });
    }
});

// تحديث الأسئلة الصعبة
app.post('/api/progress/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        if (action === 'add') {
            if (!progress.hardQuestions.includes(questionId)) {
                progress.hardQuestions.push(questionId);
            }
        } else {
            progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId);
        }
        
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) {
        console.error('❌ خطأ في تحديث الأسئلة الصعبة:', error);
        res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' });
    }
});

// حفظ الملاحظات
app.post('/api/progress/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        progress.notes.set(questionId, note);
        await progress.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ الملاحظة:', error);
        res.status(500).json({ error: 'خطأ في حفظ الملاحظة' });
    }
});

// حفظ سجل الاختبارات
app.post('/api/progress/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        progress.quizHistory.push({
            date: new Date().toISOString(),
            total,
            correct,
            score,
            chapter: chapter || 'all'
        });
        
        // حفظ الأسئلة الخاطئة
        if (req.body.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.concat(req.body.wrongQuestions);
            if (progress.wrongQuestions.length > 200) {
                progress.wrongQuestions = progress.wrongQuestions.slice(-200);
            }
        }
        
        await progress.save();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ سجل الاختبار:', error);
        res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' });
    }
});

// حفظ الإنجازات
app.post('/api/progress/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        if (!progress.achievements.includes(achievementId)) {
            progress.achievements.push(achievementId);
        }
        
        await progress.save();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ الإنجاز:', error);
        res.status(500).json({ error: 'خطأ في حفظ الإنجاز' });
    }
});

// تحديث صعوبة السؤال
app.post('/api/progress/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في تحديث الصعوبة:', error);
        res.status(500).json({ error: 'خطأ في تحديث الصعوبة' });
    }
});

// ====================== مسارات Internal Medicine (طب باطنة) ======================

// جلب تقدم الطالب في Internal Medicine
app.get('/api/progress-internal', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user.id || req.user.username;
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ 
                userId: userId + '_internal',
                xp: 0,
                bookmarks: [],
                hardQuestions: [],
                notes: {},
                difficulties: {},
                achievements: [],
                quizHistory: [],
                wrongQuestions: []
            });
            await progress.save();
        }
        res.json(progress);
    } catch (error) {
        console.error('❌ خطأ في جلب تقدم Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في جلب التقدم' });
    }
});

// تحديث نقاط XP في Internal Medicine
app.post('/api/progress-internal/xp', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { amount } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        progress.xp = (progress.xp || 0) + amount;
        await progress.save();
        
        res.json({ success: true, xp: progress.xp });
    } catch (error) {
        console.error('❌ خطأ في تحديث XP Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في تحديث XP' });
    }
});

// تحديث المفضلة في Internal Medicine
app.post('/api/progress-internal/bookmarks', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        if (action === 'add') {
            if (!progress.bookmarks.includes(questionId)) {
                progress.bookmarks.push(questionId);
            }
        } else {
            progress.bookmarks = progress.bookmarks.filter(id => id !== questionId);
        }
        
        await progress.save();
        res.json({ success: true, bookmarks: progress.bookmarks });
    } catch (error) {
        console.error('❌ خطأ في تحديث المفضلة Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في تحديث المفضلة' });
    }
});

// تحديث الأسئلة الصعبة في Internal Medicine
app.post('/api/progress-internal/hard', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, action } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        if (action === 'add') {
            if (!progress.hardQuestions.includes(questionId)) {
                progress.hardQuestions.push(questionId);
            }
        } else {
            progress.hardQuestions = progress.hardQuestions.filter(id => id !== questionId);
        }
        
        await progress.save();
        res.json({ success: true, hardQuestions: progress.hardQuestions });
    } catch (error) {
        console.error('❌ خطأ في تحديث الأسئلة الصعبة Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' });
    }
});

// حفظ الملاحظات في Internal Medicine
app.post('/api/progress-internal/notes', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, note } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        progress.notes.set(questionId, note);
        await progress.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ الملاحظة Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في حفظ الملاحظة' });
    }
});

// حفظ سجل الاختبارات في Internal Medicine
app.post('/api/progress-internal/quiz', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { total, correct, score, chapter } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        progress.quizHistory.push({
            date: new Date().toISOString(),
            total: total || 0,
            correct: correct || 0,
            score: score || 0,
            chapter: chapter || 'all'
        });
        
        if (req.body.wrongQuestions) {
            progress.wrongQuestions = progress.wrongQuestions.concat(req.body.wrongQuestions);
            if (progress.wrongQuestions.length > 200) {
                progress.wrongQuestions = progress.wrongQuestions.slice(-200);
            }
        }
        
        await progress.save();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ سجل الاختبار Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' });
    }
});

// حفظ الإنجازات في Internal Medicine
app.post('/api/progress-internal/achievements', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { achievementId } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        if (!progress.achievements.includes(achievementId)) {
            progress.achievements.push(achievementId);
        }
        
        await progress.save();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في حفظ الإنجاز Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في حفظ الإنجاز' });
    }
});

// تحديث صعوبة السؤال في Internal Medicine
app.post('/api/progress-internal/difficulty', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { questionId, difficulty } = req.body;
        const userId = req.user.id || req.user.username;
        
        let progress = await Progress.findOne({ userId: userId + '_internal' });
        if (!progress) {
            progress = new Progress({ userId: userId + '_internal' });
        }
        
        progress.difficulties.set(questionId, difficulty);
        await progress.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في تحديث الصعوبة Internal Medicine:', error);
        res.status(500).json({ error: 'خطأ في تحديث الصعوبة' });
    }
});



// ====================== الكابتشا ======================
const captchaStore = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of captchaStore.entries()) {
        if (now - value.timestamp > 5 * 60 * 1000) captchaStore.delete(key);
    }
}, 60 * 60 * 1000);

function generateCaptcha(sessionId) {
    const operations = [{ symbol: '+', func: (a, b) => a + b }, { symbol: '-', func: (a, b) => a - b }, { symbol: '×', func: (a, b) => a * b }];
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operation = operations[Math.floor(Math.random() * operations.length)];
    let result = operation.func(num1, num2);
    if (result < 0) result = Math.abs(result);
    const captchaText = `${num1} ${operation.symbol} ${num2} = ?`;
    captchaStore.set(sessionId, { answer: result.toString(), timestamp: Date.now(), attempts: 0 });
    return { text: captchaText, sessionId };
}

function verifyCaptcha(sessionId, userAnswer) {
    const captchaData = captchaStore.get(sessionId);
    if (!captchaData) return { valid: false, error: 'انتهت صلاحية الكابتشا، يرجى تحديث الصفحة' };
    if (captchaData.attempts >= 3) { captchaStore.delete(sessionId); return { valid: false, error: '太多 المحاولات الخاطئة، يرجى تحديث الكابتشا' }; }
    const isValid = captchaData.answer.toString() === userAnswer.toString().trim();
    if (!isValid) { captchaData.attempts++; captchaStore.set(sessionId, captchaData); return { valid: false, error: 'رمز التحقق غير صحيح' }; }
    captchaStore.delete(sessionId);
    return { valid: true, error: null };
}

app.get('/api/captcha', (req, res) => {
    let sessionId = req.cookies?.captchaSession || crypto.randomBytes(32).toString('hex');
    const captcha = generateCaptcha(sessionId);
    res.cookie('captchaSession', sessionId, { httpOnly: true, maxAge: 5 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, captchaText: captcha.text, sessionId: captcha.sessionId });
});

app.post('/api/captcha/verify', (req, res) => {
    const { sessionId, answer } = req.body;
    const result = verifyCaptcha(sessionId, answer);
    res.json(result);
});

// ====================== مسارات الملفات ======================
// ⬇⬇⬇⬇⬇ يجب أن تكون قبل app.get('*') ⬇⬇⬇⬇⬇

// إنشاء رابط رفع موقّع (Signed URL) - الفرونت إند بيرفع بيه مباشرة على R2
// عشان نتخطى حد الـ4.5MB بتاع Vercel Functions. الرابط بيتولد بس لأدمن مسجل دخول،
// وبيبقى صالح لملف واحد بس لمدة قصيرة.
app.post('/api/files/upload-url', verifyToken, isAdmin, async (req, res) => {
    try {
        const { fileName, grade, subject } = req.body;

        if (!fileName || !grade || !subject) {
            return res.status(400).json({ error: 'اسم الملف والصف والمادة مطلوبين' });
        }

        const safeFolder = `school/${grade}/${subject}`.split('/').map(sanitizeForStorage).join('/');
        const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;
        const path = `${safeFolder}/${safeName}`;

        // ملحوظة مهمة: من غير ما نحدد ContentType هنا عمدًا. لو حطيناه، PutObjectCommand
        // هيوقّعه كـ header مطلوب، والفرونت إند لازم يبعت نفس الـ Content-Type
        // بالظبط في الـ PUT وإلا هيرجع SignatureDoesNotMatch. الأبسط والأضمن إننا
        // نسيب الـ upload يبقى بدون Content-Type موقّع، ونخلي المتصفح يبعت أي نوع.
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: path
        });

        // رابط رفع موقّع صالح لمدة 10 دقائق - الفرونت إند بيرفع بيه مباشرة
        // على R2 بـ PUT عادي، عشان نتخطى حد الـ4.5MB بتاع Vercel Functions
        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 600 });

        res.json({
            success: true,
            path,
            uploadUrl: signedUrl,
            publicUrl: `${R2_PUBLIC_URL}/${path}`
        });
    } catch (error) {
        console.error('❌ Upload URL error:', error);
        res.status(500).json({ error: 'خطأ في إنشاء رابط الرفع: ' });
    }
});

// رفع ملفات متعددة (عن طريق السيرفر - احتياطي لملفات أصغر من 4.5MB فقط، حد Vercel الصارم)
app.post('/api/files/upload-multiple', verifyToken, isAdmin, upload.array('files', 20), async (req, res) => {
    try {
        await connectToDatabase();
        const { grade } = req.body;
        let { subject } = req.body;

        if (!grade) {
            return res.status(400).json({ error: 'الصف مطلوب' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'يرجى اختيار ملفات للرفع' });
        }

        const uploadedFiles = [];

        for (const file of req.files) {
            // ✅ تصحيح ترميز اسم الملف (multer بيقرأ أسماء الملفات العربية بترميز غلط أحيانًا)
            const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            // لو مفيش subject متبعت، استخرجه تلقائيًا من اسم كل ملف على حدة
            const fileSubject = (subject && subject.trim()) ? subject : extractSubjectFromFileName(originalName);
            const folder = `school/${grade}/${fileSubject}`;
            const result = await uploadToCloudinary(file.buffer, folder, originalName);

            const fileData = new File({
                name: originalName,
                url: result.secure_url,
                publicId: result.public_id,
                size: file.size,
                type: file.mimetype || file.originalname.split('.').pop().toLowerCase(),
                grade: grade,
                subject: fileSubject,
                uploadedBy: req.user?.username || 'admin'
            });

            await fileData.save();
            uploadedFiles.push(fileData);
        }

        res.json({
            success: true,
            message: `تم رفع ${uploadedFiles.length} ملف(ات) بنجاح`,
            files: uploadedFiles
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: 'خطأ في رفع الملفات: ' });
    }
});

// ====================== جلب جميع الملفات ======================
app.get('/api/files', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const files = await File.find().sort({ createdAt: -1 });
        console.log('📁 عدد الملفات في DB:', files.length);
        res.json(files);
    } catch (error) {
        console.error('❌ خطأ في جلب الملفات:', error);
        res.status(500).json({ error: 'خطأ في جلب الملفات: ' });
    }
});

// ====================== تحميل ملف (إعادة توجيه إلى Cloudflare R2) ======================
app.get('/api/files/download/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }

        file.downloads = (file.downloads || 0) + 1;
        await file.save();

        // اجلب الملف من R2 وابثه للمستخدم مباشرة مع الاسم الأصلي
        const getCommand = new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: file.publicId
        });
        const r2Object = await r2.send(getCommand);

        const originalName = file.name || 'file';
        const encodedName = encodeURIComponent(originalName);

        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
        if (r2Object.ContentType) res.setHeader('Content-Type', r2Object.ContentType);
        if (r2Object.ContentLength) res.setHeader('Content-Length', r2Object.ContentLength);

        r2Object.Body.pipe(res);
    } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        res.status(500).json({ error: 'خطأ في تحميل الملف' });
    }
});

// ====================== حذف ملف ======================
app.delete('/api/files/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }

        // حذف من Cloudflare R2
        try {
            await deleteFromSupabase(file.publicId);
            console.log('✅ تم حذف الملف من R2:', file.publicId);
        } catch (e) {
            console.log('⚠️ R2 delete error:', e.message);
        }

        await File.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم حذف الملف بنجاح' });
    } catch (error) {
        console.error('❌ خطأ في حذف الملف:', error);
        res.status(500).json({ error: 'خطأ في حذف الملف' });
    }
});

// ====================== إحصائيات الملفات ======================
app.get('/api/files/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const totalFiles = await File.countDocuments();
        const totalDownloads = await File.aggregate([
            { $group: { _id: null, total: { $sum: '$downloads' } } }
        ]);
        const subjects = await File.distinct('subject');
        const grades = await File.aggregate([
            { $group: { _id: '$grade', count: { $sum: 1 } } }
        ]);

        res.json({
            totalFiles,
            totalDownloads: totalDownloads[0]?.total || 0,
            subjects: subjects.length,
            grades: grades
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الإحصائيات:', error);
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ====================== حفظ معلومات الملف (احتياطي للرفع المباشر من الفرونت إند لو استخدمته) ======================
// دالة استخراج اسم المادة من اسم الملف: بتاخد الجزء اللي قبل أول فاصل شائع
// (- أو – أو _ أو |) وتشيل الامتداد. لو مفيش فاصل، بترجع اسم الملف كامل
// (من غير الامتداد) كمادة.
function extractSubjectFromFileName(fileName) {
    if (!fileName) return 'عام';
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    const separatorMatch = nameWithoutExt.match(/^(.+?)\s*[-–_|]\s*.+$/);
    const subject = separatorMatch ? separatorMatch[1] : nameWithoutExt;
    return subject.trim() || 'عام';
}

app.post('/api/files/save', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { name, url, publicId, size, type, grade } = req.body;
        let { subject } = req.body;

        // لو الفرونت إند ما بعتش subject (أو بعت فاضي)، استخرجه من اسم الملف
        if (!subject || !subject.trim()) {
            subject = extractSubjectFromFileName(name);
        }

        console.log('📥 استلام معلومات ملف:', { name, grade, subject });

        if (!name || !url || !grade || !subject) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        const fileData = new File({
            name: name,
            url: url,
            publicId: publicId,
            size: size || 0,
            type: type || name.split('.').pop().toLowerCase(),
            grade: grade,
            subject: subject,
            uploadedBy: req.user?.username || 'admin'
        });

        await fileData.save();
        console.log('✅ تم حفظ الملف في DB:', fileData.name);
        res.json({ success: true, file: fileData });
    } catch (error) {
        console.error('❌ Save file error:', error);
        res.status(500).json({ error: 'خطأ في حفظ معلومات الملف: ' });
    }
});

// ====================== تحديث عدد المشاهدات ======================
app.post('/api/files/view/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }
        file.views = (file.views || 0) + 1;
        await file.save();
        res.json({ success: true });
    } catch (error) {
        console.error('❌ خطأ في تحديث المشاهدات:', error);
        res.status(500).json({ error: 'خطأ في تحديث المشاهدات' });
    }
});

// ملحوظة: تم حذف مسار /api/upload/signature (كان خاص بتوقيع Cloudinary
// وغير مستخدم فعليًا في الفرونت إند). الرفع دلوقتي بيتم عن طريق
// /api/files/upload-multiple اللي بيرفع مباشرة على Cloudflare R2.

// ====================== المكتبة المشتركة (ملخصات الطلاب) ======================
// الفكرة: أي طالب يقدر يرفع ملخص (موضوع + مادة + صف)، لكن الملف مايظهرش في
// المكتبة للباقي غير بعد ما الأدمن يوافق عليه. status: pending -> approved/rejected.
const sharedSummarySchema = new mongoose.Schema({
    name: { type: String, required: true },        // اسم الملف الأصلي
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    size: { type: Number },
    type: { type: String },
    topic: { type: String, required: true },        // موضوع الملف
    subject: { type: String, required: true },      // اسم المادة
    grade: { type: String, enum: ['first', 'second', 'third'], required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String, default: '' },
    uploadedBy: { type: String, required: true },       // username بتاع الطالب اللي رفع
    uploadedByName: { type: String, default: '' },      // اسمه وقت الرفع (نسخة للعرض)
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date },
    downloads: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    // ملخص مُولّد بالذكاء الاصطناعي — بيتخزن هنا كـ cache عشان منولّدش نفس
    // الملخص تاني في كل مرة (تكلفة AI + وقت انتظار). بيتحدّث بس لو الطالب/الأدمن
    // طلب "تحديث" صراحة.
    aiSummary: {
        bulletPoints: { type: [String], default: undefined },
        keyTerms: { type: [String], default: undefined },
        generatedAt: { type: Date }
    }
}, { timestamps: true });
const SharedSummary = mongoose.models.SharedSummary || mongoose.model('SharedSummary', sharedSummarySchema);

// أسئلة اختيار من متعدد اتولّدت تلقائيًا من محتوى ملف في المكتبة المشتركة —
// بيتخزنوا مرة واحدة لكل ملف (cache) عشان الطلاب اللي بعد كده يفتحوا نفس
// الملخص ياخدوا نفس الأسئلة على طول من غير استدعاء AI جديد كل مرة.
const generatedQuizSchema = new mongoose.Schema({
    summaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SharedSummary', required: true, unique: true, index: true },
    questions: [{
        q: { type: String, required: true },
        options: { type: [String], required: true }, // 4 اختيارات دايمًا
        correctIndex: { type: Number, required: true, min: 0, max: 3 },
        explanation: { type: String, default: '' }
    }]
}, { timestamps: true });
const GeneratedQuiz = mongoose.models.GeneratedQuiz || mongoose.model('GeneratedQuiz', generatedQuizSchema);

// مفاتيح API لمزوّدين إنشاء الصور (وأي فيتشر AI تاني مستقبلًا) — بيتضافوا من
// لوحة الأدمن مباشرة (شوف /api/admin/api-keys) بدل ما يبقوا محتاجين ضبط
// Environment Variable وRedeploy كل مرة. لو مفتاح مش موجود هنا، الكود بيرجع
// للـ env var المقابلة كـ fallback (شوف getProviderApiKey تحت).
// كل مفتاح فرعي (keys[]) بيتسجّل بعدد مرات فشله وآخر خطأ حصل — عشان لو مفتاح
// فضل يفشل كذا مرة نقدر نوريه للأدمن في اللوحة (failCount) من غير ما نعطّله
// تلقائيًا (يفضل الأدمن هو اللي يقرر يمسحه أو لأ).
const apiKeySubSchema = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, default: '' },
    failCount: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
    lastError: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null }
}, { timestamps: true });

const apiKeySchema = new mongoose.Schema({
    provider: { type: String, required: true, unique: true, index: true }, // 'qwen' / 'grok' / 'flux' / ...
    apiKey: { type: String }, // الشكل القديم (مفتاح واحد بس) — لسه موجود للتوافق مع بيانات قديمة
    keys: { type: [apiKeySubSchema], default: [] }, // الشكل الجديد — أكتر من مفتاح لكل مزوّد
    updatedBy: { type: String, default: '' }
}, { timestamps: true });
const ApiKeySetting = mongoose.models.ApiKeySetting || mongoose.model('ApiKeySetting', apiKeySchema);

// ====================== مكتبة صور استوديو الصور (Premium) ======================
// كل صورة بيتولّدها/يعدّلها الطالب في استوديو الصور بتتخزن نسخة دائمة منها في
// R2 (مش هنعتمد على الرابط اللي بيرجّعه المزوّد نفسه — روابط زي Flux بتنتهي
// صلاحيتها بعد دقايق قليلة) + سطر في الكولكشن دي عشان تفضل موجودة في "مكتبتي"
// حتى بعد ما رابط المزوّد الأصلي يموت.
const generatedImageSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    prompt: { type: String, default: '' },
    provider: { type: String, default: '' }, // 'qwen' / 'grok' / 'flux'
    source: { type: String, enum: ['generate', 'edit'], default: 'generate' },
    imageUrl: { type: String, required: true }, // الرابط الدائم على R2
    storageKey: { type: String, required: true }, // مفتاح R2 (لازم للحذف)
    mimeType: { type: String, default: 'image/jpeg' }
}, { timestamps: true });
const GeneratedImage = mongoose.models.GeneratedImage || mongoose.model('GeneratedImage', generatedImageSchema);

// بتاخد نتيجة إنشاء/تعديل صورة ناجحة (imageUrl مؤقت من المزوّد أو imageBase64)
// وبتخزّن نسخة دائمة منها في R2 + سطر في GeneratedImage. عملية "best effort" —
// لو فشلت (المزوّد رجّع رابط مات بسرعة، مشكلة شبكة، إلخ) منرجعش خطأ للطالب
// أصلًا، الصورة نفسها لسه ظاهرة قدامه، بس مش هتتحفظ في المكتبة وقتها.
async function saveGeneratedImageToLibrary({ username, prompt, provider, source, imageUrl, imageBase64, mimeType }) {
    if (!username) return null;
    try {
        let buffer;
        if (imageBase64) {
            buffer = Buffer.from(imageBase64, 'base64');
        } else if (imageUrl) {
            const resp = await fetch(imageUrl);
            if (!resp.ok) throw new Error(`تعذر تحميل الصورة من رابط المزوّد — status ${resp.status}`);
            buffer = Buffer.from(await resp.arrayBuffer());
        } else {
            return null;
        }
        const ext = String(mimeType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
        const uploaded = await uploadToCloudinary(buffer, `image-library/${username}`, `image.${ext}`);
        await connectToDatabase();
        return await new GeneratedImage({
            username,
            prompt: String(prompt || '').slice(0, 1000),
            provider: provider || '',
            source: source || 'generate',
            imageUrl: uploaded.secure_url,
            storageKey: uploaded.public_id,
            mimeType: mimeType || 'image/jpeg'
        }).save();
    } catch (error) {
        console.error('⚠️ فشل حفظ الصورة في مكتبة الطالب:', error.message);
        return null;
    }
}

// ====================== حد أقصى يومي لإنشاء/تعديل الصور (Premium) ======================
// عشان منستهلكش رصيد المزوّدين (Qwen/Grok/Flux) بسرعة، كل طالب ليه حد أقصى
// معيّن من الصور (إنشاء + تعديل مع بعض) في اليوم — بيتصفّر تلقائيًا كل يوم
// (getTodayKey بيرجع تاريخ اليوم كنص، فأي يوم جديد = مفتاح جديد = عداد صفر).
// الأدمن مستثنى تمامًا (زي باقي فحوصات الـ Premium في الموقع).
const DAILY_IMAGE_LIMIT = 8;
const imageStudioUsageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    dayKey: { type: String, required: true }, // من getTodayKey()
    count: { type: Number, default: 0 }
}, { timestamps: true });
imageStudioUsageSchema.index({ username: 1, dayKey: 1 }, { unique: true });
const ImageStudioUsage = mongoose.models.ImageStudioUsage || mongoose.model('ImageStudioUsage', imageStudioUsageSchema);

// بترجع حالة الحد اليومي من غير ما تزوّد العداد — مستخدمة لعرض "متبقّي كام"
// في الواجهة (زي وقت فتح الاستوديو) قبل ما الطالب يحاول يولّد أصلًا.
async function getImageQuotaStatus(username) {
    await connectToDatabase();
    const doc = await ImageStudioUsage.findOne({ username, dayKey: getTodayKey() }).select('count');
    const used = doc?.count || 0;
    return { used, remaining: Math.max(0, DAILY_IMAGE_LIMIT - used), limit: DAILY_IMAGE_LIMIT };
}

// بتحاول تحجز "طلقة" واحدة من الحد اليومي فورًا (زيادة العداد أتومي عن طريق
// $inc عشان لو طلبين جم في نفس اللحظة العداد يفضل صح). لو الطالب وصل للحد،
// بترجّع الزيادة اللي عملناها بالغلط وترفض الطلب من غير ما تستهلك حاجة فعليًا.
async function reserveImageQuota(username) {
    await connectToDatabase();
    const dayKey = getTodayKey();
    const updated = await ImageStudioUsage.findOneAndUpdate(
        { username, dayKey },
        { $inc: { count: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (updated.count > DAILY_IMAGE_LIMIT) {
        await ImageStudioUsage.updateOne({ _id: updated._id }, { $inc: { count: -1 } });
        return { allowed: false, used: DAILY_IMAGE_LIMIT, remaining: 0, limit: DAILY_IMAGE_LIMIT };
    }
    return { allowed: true, used: updated.count, remaining: Math.max(0, DAILY_IMAGE_LIMIT - updated.count), limit: DAILY_IMAGE_LIMIT };
}

// لو حجزنا طلقة وبعدين فشلت عملية الإنشاء/التعديل فعليًا (كل المزوّدين فشلوا
// مثلًا)، الطالب مستفادش حاجة فعلًا — نرجّع العداد تاني عشان مايتحاسبش على
// محاولة فشلت مش غلطته.
async function releaseImageQuota(username) {
    try {
        await connectToDatabase();
        await ImageStudioUsage.updateOne(
            { username, dayKey: getTodayKey(), count: { $gt: 0 } },
            { $inc: { count: -1 } }
        );
    } catch (error) {
        console.error('⚠️ فشل استرجاع حد الصور اليومي:', error.message);
    }
}

// ====================== مكتبة فيديوهات استوديو الصور (Premium) ======================
// نفس فكرة GeneratedImage بالظبط — بنخزّن نسخة دائمة من الفيديو على R2 (روابط
// المزوّد الأصلية مؤقتة زي روابط الصور) + سطر في الكولكشن دي عشان يفضل موجود
// في "مكتبتي" حتى بعد ما رابط المزوّد يموت.
const generatedVideoSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    prompt: { type: String, default: '' },
    source: { type: String, enum: ['text', 'image'], default: 'text' }, // نص لفيديو، ولا صورة لفيديو
    aspectRatio: { type: String, default: '16:9' },
    duration: { type: Number, default: 10 },
    resolution: { type: String, default: '480p' },
    videoUrl: { type: String, required: true }, // الرابط الدائم على R2
    storageKey: { type: String, required: true },
    mimeType: { type: String, default: 'video/mp4' }
}, { timestamps: true });
const GeneratedVideo = mongoose.models.GeneratedVideo || mongoose.model('GeneratedVideo', generatedVideoSchema);

// بتاخد رابط فيديو مؤقت من المزوّد وتخزّن نسخة دائمة منه في R2 + سطر في
// GeneratedVideo. عملية "best effort" — لو فشلت، الفيديو نفسه لسه ظاهر
// للطالب في الرد المباشر، بس مش هيتحفظ في المكتبة وقتها.
async function saveGeneratedVideoToLibrary({ username, prompt, source, aspectRatio, videoUrl }) {
    if (!username || !videoUrl) return null;
    try {
        const resp = await fetch(videoUrl);
        if (!resp.ok) throw new Error(`تعذر تحميل الفيديو من رابط المزوّد — status ${resp.status}`);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const uploaded = await uploadToCloudinary(buffer, `video-library/${username}`, 'video.mp4', 'video/mp4');
        await connectToDatabase();
        return await new GeneratedVideo({
            username,
            prompt: String(prompt || '').slice(0, 1000),
            source: source || 'text',
            aspectRatio: aspectRatio || '16:9',
            videoUrl: uploaded.secure_url,
            storageKey: uploaded.public_id
        }).save();
    } catch (error) {
        console.error('⚠️ فشل حفظ الفيديو في مكتبة الطالب:', error.message);
        return null;
    }
}

// ====================== حد أقصى يومي لإنشاء الفيديو (Premium) ======================
// منفصل تمامًا عن حد الصور (DAILY_IMAGE_LIMIT) — الفيديو أغلى بكتير (تسعير
// بالثانية)، فحده اليومي لازم يكون أقل بكتير. القيمة دي قابلة للتعديل بسهولة.
const DAILY_VIDEO_LIMIT = 2;
const videoStudioUsageSchema = new mongoose.Schema({
    username: { type: String, required: true },
    dayKey: { type: String, required: true }, // من getTodayKey()
    count: { type: Number, default: 0 }
}, { timestamps: true });
videoStudioUsageSchema.index({ username: 1, dayKey: 1 }, { unique: true });
const VideoStudioUsage = mongoose.models.VideoStudioUsage || mongoose.model('VideoStudioUsage', videoStudioUsageSchema);

async function getVideoQuotaStatus(username) {
    await connectToDatabase();
    const doc = await VideoStudioUsage.findOne({ username, dayKey: getTodayKey() }).select('count');
    const used = doc?.count || 0;
    return { used, remaining: Math.max(0, DAILY_VIDEO_LIMIT - used), limit: DAILY_VIDEO_LIMIT };
}

async function reserveVideoQuota(username) {
    await connectToDatabase();
    const dayKey = getTodayKey();
    const updated = await VideoStudioUsage.findOneAndUpdate(
        { username, dayKey },
        { $inc: { count: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (updated.count > DAILY_VIDEO_LIMIT) {
        await VideoStudioUsage.updateOne({ _id: updated._id }, { $inc: { count: -1 } });
        return { allowed: false, used: DAILY_VIDEO_LIMIT, remaining: 0, limit: DAILY_VIDEO_LIMIT };
    }
    return { allowed: true, used: updated.count, remaining: Math.max(0, DAILY_VIDEO_LIMIT - updated.count), limit: DAILY_VIDEO_LIMIT };
}

async function releaseVideoQuota(username) {
    try {
        await connectToDatabase();
        await VideoStudioUsage.updateOne(
            { username, dayKey: getTodayKey(), count: { $gt: 0 } },
            { $inc: { count: -1 } }
        );
    } catch (error) {
        console.error('⚠️ فشل استرجاع حد الفيديو اليومي:', error.message);
    }
}

// بترجع كل المفاتيح الشغالة (غير المعطّلة) المحفوظة في الداتابيز لمزوّد معيّن،
// بالإضافة للمفتاح القديم (apiKey) لو لسه موجود، ولو مفيش ولا مفتاح خالص بترجع
// القيمة الاحتياطية (من Environment Variables). كده أي مزوّد بيشتغل فورًا لو
// الأدمن ضاف مفتاحه من الواجهة، من غير أي Redeploy.
async function getProviderApiKeys(provider, envFallback) {
    try {
        await connectToDatabase();
        const doc = await ApiKeySetting.findOne({ provider });
        const list = [];
        if (doc) {
            for (const k of (doc.keys || [])) {
                if (k.key && !k.disabled) list.push({ id: String(k._id), key: k.key, label: k.label || '' });
            }
            if (doc.apiKey && !list.some(k => k.key === doc.apiKey)) {
                list.push({ id: 'legacy', key: doc.apiKey, label: 'قديم' });
            }
        }
        if (!list.length && envFallback) list.push({ id: null, key: envFallback, label: 'env' });
        return list;
    } catch (error) {
        console.error(`⚠️ تعذر جلب مفاتيح ${provider} من الداتابيز، هنستخدم الـ env فقط:`, error.message);
        return envFallback ? [{ id: null, key: envFallback, label: 'env' }] : [];
    }
}

// نسخة قديمة (مفتاح واحد بس) لسه مستخدمة في أماكن تانية بره نظام الصور —
// بترجع أول مفتاح شغال بس، أبسط من getProviderApiKeys.
async function getProviderApiKey(provider, envFallback) {
    const list = await getProviderApiKeys(provider, envFallback);
    return list[0]?.key || '';
}

// بتسجّل نجاح/فشل استخدام مفتاح معيّن (للمفاتيح الجديدة اللي ليها id بس — مفيش
// تسجيل لمفاتيح الـ env أو المفتاح القديم legacy).
async function markKeyResult(provider, keyId, ok, errorDetail) {
    if (!keyId || keyId === 'legacy') return;
    try {
        await connectToDatabase();
        if (ok) {
            await ApiKeySetting.updateOne(
                { provider, 'keys._id': keyId },
                { $set: { 'keys.$.lastUsedAt': new Date(), 'keys.$.lastError': '' } }
            );
        } else {
            await ApiKeySetting.updateOne(
                { provider, 'keys._id': keyId },
                { $inc: { 'keys.$.failCount': 1 }, $set: { 'keys.$.lastError': String(errorDetail || '').slice(0, 300) } }
            );
        }
    } catch (error) {
        console.error(`⚠️ تعذر تسجيل نتيجة استخدام مفتاح ${provider}:`, error.message);
    }
}

// بتجرب مفاتيح مزوّد معيّن واحد ورا التاني — أول ما مفتاح ينجح بترجع نتيجته
// على طول، ولو فشل بتسجّل الفشل وتتحول للمفتاح اللي بعده أوتوماتيك (من غير ما
// الطالب يحس بأي حاجة). requestFn(apiKey) لازم ترجّع نفس شكل النتيجة المعتاد
// { ok: true, ... } أو { ok: false, ... }.
async function withKeyRotation(provider, envFallback, requestFn) {
    const keys = await getProviderApiKeys(provider, envFallback);
    if (!keys.length) return { ok: false, reason: 'no_api_key' };
    const attempts = [];
    for (const entry of keys) {
        const result = await requestFn(entry.key);
        if (result.ok) {
            markKeyResult(provider, entry.id, true).catch(() => {});
            return result;
        }
        markKeyResult(provider, entry.id, false, result.detail || result.reason).catch(() => {});
        attempts.push({ keyLabel: entry.label || maskApiKey(entry.key), ...result });
    }
    // كل مفاتيح المزوّد ده فشلت
    return { ok: false, reason: 'all_keys_failed', status: attempts[attempts.length - 1]?.status, keyAttempts: attempts };
}

// رابط رفع موقّع للطالب (نفس فكرة /api/files/upload-url بتاعة الأدمن، بس متاحة
// لأي طالب مسجل دخول بدل ما تكون مقصورة على الأدمن)
app.post('/api/shared-summaries/upload-url', verifyToken, async (req, res) => {
    try {
        if (req.user?.type !== 'student') {
            return res.status(403).json({ error: 'رفع الملخصات متاح للطلاب فقط' });
        }
        const { fileName, grade, subject } = req.body;
        if (!fileName || !grade || !subject) {
            return res.status(400).json({ error: 'اسم الملف والصف والمادة مطلوبين' });
        }
        if (!['first', 'second', 'third'].includes(grade)) {
            return res.status(400).json({ error: 'الصف غير صالح' });
        }

        const safeFolder = `shared/${grade}/${subject}`.split('/').map(sanitizeForStorage).join('/');
        const safeName = `${Date.now()}-${sanitizeFileName(fileName)}`;
        const path = `${safeFolder}/${safeName}`;

        // من غير ContentType هنا عمدًا (زي مسار الأدمن بالظبط) — عشان نتفادى
        // SignatureDoesNotMatch لو الفرونت إند بعت Content-Type مختلف وقت الـ PUT.
        const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: path });
        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 600 });

        res.json({ success: true, path, uploadUrl: signedUrl, publicUrl: `${R2_PUBLIC_URL}/${path}` });
    } catch (error) {
        console.error('❌ Shared summary upload-url error:', error);
        res.status(500).json({ error: 'خطأ في إنشاء رابط الرفع: ' });
    }
});

// حفظ معلومات الملف بعد الرفع المباشر على R2 — بيتسجل status: pending
// لحد ما الأدمن يراجعه ويوافق عليه أو يرفضه.
app.post('/api/shared-summaries/save', verifyToken, async (req, res) => {
    try {
        if (req.user?.type !== 'student') {
            return res.status(403).json({ error: 'المشاركة في المكتبة متاحة للطلاب فقط' });
        }
        await connectToDatabase();
        const { name, url, publicId, size, type, topic, subject, grade } = req.body;

        if (!name || !url || !publicId || !topic || !subject || !grade) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة (اسم الملف، الموضوع، المادة، الصف)' });
        }
        if (!['first', 'second', 'third'].includes(grade)) {
            return res.status(400).json({ error: 'الصف غير صالح' });
        }

        const doc = new SharedSummary({
            name,
            url,
            publicId,
            size: size || 0,
            type: type || name.split('.').pop().toLowerCase(),
            topic: String(topic).trim().slice(0, 200),
            subject: String(subject).trim().slice(0, 100),
            grade,
            status: 'pending',
            uploadedBy: req.user.username,
            uploadedByName: req.user.fullName || req.user.username
        });
        await doc.save();

        // إشعار كل الأدمنز إن في ملف جديد محتاج مراجعة (مش بيوقف الرد لو فشل)
        connectToDatabase()
            .then(() => Admin.find().select('username'))
            .then(admins => Promise.all(admins.map(a => sendPushToUser(a.username, {
                title: 'ملخص جديد محتاج مراجعة',
                body: `${doc.uploadedByName} رفع "${doc.topic}" (${doc.subject})`,
                data: { type: 'shared_summary_pending', summaryId: String(doc._id) }
            }))))
            .catch(() => {});

        res.json({ success: true, summary: doc, message: 'تم رفع الملف بنجاح، هيتم مراجعة محتواه ليظهر على الصفحة من قبل الأدمن' });
    } catch (error) {
        console.error('❌ Shared summary save error:', error);
        res.status(500).json({ error: 'خطأ في حفظ الملف: ' });
    }
});

// المكتبة المشتركة — الملفات الموافَق عليها بس (تصفية اختيارية بالصف/المادة)
app.get('/api/shared-summaries', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const query = { status: 'approved' };
        if (req.query.grade) query.grade = req.query.grade;
        if (req.query.subject) query.subject = req.query.subject;
        const summaries = await SharedSummary.find(query).sort({ createdAt: -1 }).limit(200);
        res.json(summaries);
    } catch (error) {
        console.error('❌ خطأ في جلب المكتبة المشتركة:', error);
        res.status(500).json({ error: 'خطأ في جلب المكتبة المشتركة' });
    }
});

// ملفات الطالب اللي رفعها هو بنفسه (بكل حالاتها) عشان يتابع حالة المراجعة
app.get('/api/shared-summaries/mine', verifyToken, async (req, res) => {
    try {
        if (req.user?.type !== 'student') return res.status(403).json({ error: 'غير مصرح' });
        await connectToDatabase();
        const summaries = await SharedSummary.find({ uploadedBy: req.user.username }).sort({ createdAt: -1 });
        res.json(summaries);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب ملفاتك' });
    }
});

// طابور المراجعة للأدمن
app.get('/api/shared-summaries/pending', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const summaries = await SharedSummary.find({ status: 'pending' }).sort({ createdAt: 1 });
        res.json(summaries);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الملفات المعلّقة' });
    }
});

// موافقة الأدمن على الملف — يظهر في المكتبة المشتركة بعدها
app.post('/api/shared-summaries/:id/approve', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });
        doc.status = 'approved';
        doc.reviewedBy = req.user.username || 'admin';
        doc.reviewedAt = new Date();
        doc.rejectionReason = '';
        await doc.save();

        sendPushToUser(doc.uploadedBy, {
            title: 'تمت الموافقة على ملخصك ✅',
            body: `"${doc.topic}" بقى ظاهر دلوقتي في المكتبة المشتركة`,
            data: { type: 'shared_summary_approved', summaryId: String(doc._id) }
        }).catch(() => {});

        res.json({ success: true, summary: doc });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الموافقة على الملف' });
    }
});

// رفض الأدمن للملف — مع سبب اختياري بيتبعت للطالب
app.post('/api/shared-summaries/:id/reject', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { reason } = req.body;
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });
        doc.status = 'rejected';
        doc.reviewedBy = req.user.username || 'admin';
        doc.reviewedAt = new Date();
        doc.rejectionReason = (reason || '').toString().trim().slice(0, 300);
        await doc.save();

        sendPushToUser(doc.uploadedBy, {
            title: 'تم رفض ملخصك',
            body: doc.rejectionReason ? `"${doc.topic}": ${doc.rejectionReason}` : `"${doc.topic}" محتاج تعديل قبل النشر`,
            data: { type: 'shared_summary_rejected', summaryId: String(doc._id) }
        }).catch(() => {});

        res.json({ success: true, summary: doc });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في رفض الملف' });
    }
});

// ====================== فحص التشابه (فيتشر 6) — للأدمن وقت المراجعة ======================
// بيقارن الملف اللي بيراجعه الأدمن بباقي ملفات نفس الصف والمادة (سواء معتمدة
// أو لسه تحت المراجعة) عشان يكتشف نسخ/تكرار قبل ما يوافق عليه.
app.post('/api/shared-summaries/:id/check-similarity', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const target = await SharedSummary.findById(req.params.id);
        if (!target) return res.status(404).json({ error: 'الملف غير موجود' });

        const candidates = await SharedSummary.find({
            _id: { $ne: target._id },
            grade: target.grade,
            subject: target.subject,
            status: { $in: ['pending', 'approved'] }
        }).select('_id url topic uploadedByName status').limit(30);

        if (!candidates.length) return res.json({ matches: [], skipped: [], note: 'مفيش ملفات تانية في نفس الصف والمادة عشان نقارن بيها' });

        let pyResult;
        try {
            const response = await fetch(`${PY_SERVICE_URL}/check-similarity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: { id: String(target._id), url: target.url, label: target.topic },
                    candidates: candidates.map(c => ({ id: String(c._id), url: c.url, label: c.topic }))
                })
            });
            if (!response.ok) {
                let detail = 'تعذر فحص التشابه';
                try { const d = await response.json(); if (d?.detail) detail = d.detail; } catch (_) {}
                return res.status(502).json({ error: detail });
            }
            pyResult = await response.json();
        } catch (e) {
            return res.status(503).json({ error: 'خدمة فحص التشابه مش متاحة حاليًا — تأكد إن PY_SERVICE_URL مضبوط' });
        }

        // نربط كل نتيجة بمعلومات الملف الكاملة (الأدمن يحتاج يشوف اسم الطالب وحالة الملف مش بس الـ id)
        const byId = new Map(candidates.map(c => [String(c._id), c]));
        const matches = (pyResult.matches || []).map(m => {
            const c = byId.get(m.id);
            return {
                id: m.id,
                score: m.score,
                topic: c?.topic || m.label || '',
                uploadedByName: c?.uploadedByName || '',
                status: c?.status || ''
            };
        });

        res.json({ matches, skipped: pyResult.skipped || [] });
    } catch (error) {
        console.error('❌ خطأ في فحص التشابه:', error.message);
        res.status(500).json({ error: 'خطأ في فحص التشابه' });
    }
});

// بيتأكد إن المستخدم مسموحله يشوف محتوى الملف ده (لتوليد أسئلة/تلخيص):
// إما الملف معتمد (متاح للكل)، أو هو صاحب الملف، أو هو أدمن.
function canAccessSummaryContent(doc, user) {
    if (doc.status === 'approved') return true;
    if (user?.type === 'admin') return true;
    if (doc.uploadedBy === user?.username) return true;
    return false;
}

// ====================== توليد أسئلة تلقائي من ملف (فيتشر 1) ======================
app.post('/api/gemini/questions', verifyToken, async (req, res) => {
    try {
        const { summaryId, count } = req.body || {};
        if (!summaryId) return res.status(400).json({ error: 'summaryId مطلوب' });
        const requestedCount = Math.min(10, Math.max(3, parseInt(count) || 5));

        await connectToDatabase();
        const doc = await SharedSummary.findById(summaryId);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });
        if (!canAccessSummaryContent(doc, req.user)) return res.status(403).json({ error: 'غير مصرح لك بالوصول لمحتوى الملف ده' });

        // لو عندنا cache كفاية أسئلة، منولّدش تاني — نوفر وقت وتكلفة AI
        let cache = await GeneratedQuiz.findOne({ summaryId: doc._id });
        if (cache && cache.questions.length >= requestedCount) {
            return res.json({ questions: cache.questions.slice(0, requestedCount), cached: true });
        }

        let text;
        try {
            text = await extractTextViaPython(doc.url);
        } catch (e) {
            return res.status(e.code === 'service_unavailable' || e.code === 'service_unreachable' ? 503 : 422).json({ error: e.message });
        }

        const genCount = Math.max(requestedCount, 8); // نولّد شوية زيادة عشان الـ cache يفيد طلبات تانية بعدد أكبر
        const systemPrompt = `أنت مدرّس متخصص في التمريض بتحوّل ملخصات دراسية لأسئلة اختيار من متعدد.
رد بـ JSON فقط، من غير أي نص زيادة أو علامات markdown، بالشكل ده بالظبط:
{"questions":[{"q":"نص السؤال","options":["اختيار 1","اختيار 2","اختيار 3","اختيار 4"],"correctIndex":0,"explanation":"شرح مختصر للإجابة الصح"}]}
- الأسئلة لازم تكون من محتوى النص المُعطى بس، مش من معلومات عامة برة النص.
- كل سؤال له 4 اختيارات بالظبط، واختيار واحد صح.
- correctIndex هو انديكس الاختيار الصح (0 لحد 3).
- الأسئلة والاختيارات بالعربي.`;
        const userPrompt = `النص:\n"""\n${text}\n"""\n\nولّد ${genCount} سؤال اختيار من متعدد من النص ده.`;

        let parsed;
        try {
            parsed = await callAIJSON(systemPrompt, userPrompt, 2200);
        } catch (e) {
            return res.status(e.code === 'ai_unavailable' ? 503 : 502).json({ error: e.message });
        }

        const questions = (parsed.questions || [])
            .filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3)
            .map(q => ({ q: String(q.q).slice(0, 500), options: q.options.map(o => String(o).slice(0, 200)), correctIndex: q.correctIndex, explanation: String(q.explanation || '').slice(0, 500) }));

        if (!questions.length) return res.status(502).json({ error: 'تعذر توليد أسئلة صالحة من محتوى الملف ده' });

        cache = await GeneratedQuiz.findOneAndUpdate(
            { summaryId: doc._id },
            { summaryId: doc._id, questions },
            { upsert: true, new: true }
        );

        res.json({ questions: cache.questions.slice(0, requestedCount), cached: false });
    } catch (error) {
        console.error('❌ خطأ في توليد الأسئلة:', error.message);
        res.status(500).json({ error: 'خطأ في توليد الأسئلة' });
    }
});

// ====================== تلخيص ملف تلقائيًا (فيتشر 5) ======================
app.post('/api/gemini/file', verifyToken, async (req, res) => {
    try {
        const { summaryId, refresh } = req.body || {};
        if (!summaryId) return res.status(400).json({ error: 'summaryId مطلوب' });

        await connectToDatabase();
        const doc = await SharedSummary.findById(summaryId);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });
        if (!canAccessSummaryContent(doc, req.user)) return res.status(403).json({ error: 'غير مصرح لك بالوصول لمحتوى الملف ده' });

        if (doc.aiSummary?.generatedAt && !refresh) {
            return res.json({ bulletPoints: doc.aiSummary.bulletPoints, keyTerms: doc.aiSummary.keyTerms, cached: true });
        }

        let text;
        try {
            text = await extractTextViaPython(doc.url);
        } catch (e) {
            return res.status(e.code === 'service_unavailable' || e.code === 'service_unreachable' ? 503 : 422).json({ error: e.message });
        }

        const systemPrompt = `أنت مساعد بيلخّص ملخصات دراسية لطلاب تمريض. رد بـ JSON فقط بالشكل ده بالظبط:
{"bulletPoints":["نقطة 1","نقطة 2","..."],"keyTerms":["مصطلح 1","مصطلح 2","..."]}
- bulletPoints: 5 لـ 10 نقط تلخّص أهم أفكار النص، كل نقطة جملة واحدة واضحة.
- keyTerms: 4 لـ 8 مصطلحات طبية/فنية مهمة ذُكرت في النص.
- العربي بس، من غير أي نص خارج الـ JSON.`;
        const userPrompt = `النص:\n"""\n${text}\n"""`;

        let parsed;
        try {
            parsed = await callAIJSON(systemPrompt, userPrompt, 900);
        } catch (e) {
            return res.status(e.code === 'ai_unavailable' ? 503 : 502).json({ error: e.message });
        }

        const bulletPoints = Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints.map(s => String(s).slice(0, 300)).slice(0, 10) : [];
        const keyTerms = Array.isArray(parsed.keyTerms) ? parsed.keyTerms.map(s => String(s).slice(0, 100)).slice(0, 8) : [];
        if (!bulletPoints.length) return res.status(502).json({ error: 'تعذر تلخيص محتوى الملف ده' });

        doc.aiSummary = { bulletPoints, keyTerms, generatedAt: new Date() };
        await doc.save();

        res.json({ bulletPoints, keyTerms, cached: false });
    } catch (error) {
        console.error('❌ خطأ في تلخيص الملف:', error.message);
        res.status(500).json({ error: 'خطأ في تلخيص الملف' });
    }
});

// تحميل ملف من المكتبة المشتركة — لازم يكون موافَق عليه، أو تكون أنت صاحبه، أو تكون أدمن
// بروكسي معاينة (مش تحميل) — بيجيب بايتس الملف من R2 على السيرفر (server-to-server،
// مفيش CORS خالص هنا لأن المتصفح مش بيكلم R2 مباشرة) ويرجّعهم للمتصفح من نفس
// دومين الـ API بتاعنا. ده اللي بيخلي معاينة PDF جوه التطبيق تشتغل مهما كانت
// إعدادات CORS على باكت R2 نفسه — لأننا أصلاً مش محتاجين المتصفح يوصل لـ R2
// مباشرة تاني. مفيش زيادة في عداد التحميلات هنا (ده مش تحميل فعلي).
app.get('/api/shared-summaries/preview/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });

        const isOwner = req.user?.type === 'student' && req.user?.username === doc.uploadedBy;
        if (doc.status !== 'approved' && req.user?.type !== 'admin' && !isOwner) {
            return res.status(403).json({ error: 'الملف ده لسه تحت المراجعة' });
        }

        const getCommand = new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.publicId });
        const r2Object = await r2.send(getCommand);

        res.setHeader('Content-Type', r2Object.ContentType || 'application/octet-stream');
        if (r2Object.ContentLength) res.setHeader('Content-Length', r2Object.ContentLength);
        // Content-Disposition: inline (مش attachment) — الغرض عرض جوه التطبيق مش تنزيل.
        res.setHeader('Content-Disposition', 'inline');

        r2Object.Body.on('error', (streamErr) => {
            console.error('❌ خطأ في تدفق الملف من R2 (معاينة):', streamErr);
            if (!res.headersSent) res.status(500).json({ error: 'خطأ أثناء تحميل الملف للمعاينة' });
            else res.destroy();
        });

        r2Object.Body.pipe(res);
    } catch (error) {
        console.error('❌ خطأ في بروكسي معاينة الملف:', error);
        res.status(500).json({ error: 'تعذرت معاينة الملف' });
    }
});

app.get('/api/shared-summaries/download/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });

        const isOwner = req.user?.type === 'student' && req.user?.username === doc.uploadedBy;
        if (doc.status !== 'approved' && req.user?.type !== 'admin' && !isOwner) {
            return res.status(403).json({ error: 'الملف ده لسه تحت المراجعة' });
        }

        doc.downloads = (doc.downloads || 0) + 1;
        await doc.save();

        const getCommand = new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.publicId });
        const r2Object = await r2.send(getCommand);

        const originalName = doc.name || 'file';
        const encodedName = encodeURIComponent(originalName);

        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
        res.setHeader('Content-Type', r2Object.ContentType || 'application/octet-stream');
        if (r2Object.ContentLength) res.setHeader('Content-Length', r2Object.ContentLength);

        // ⚠️ من غير هاندلر هنا، أي خطأ يحصل في نص نقل الملف من R2 (انقطاع شبكة،
        // مشكلة مؤقتة في R2، إلخ) كان بيسيب الطلب معلّق للأبد من غير أي رد للمتصفح —
        // وده بالظبط اللي بيظهر للمستخدم كأن "الملف مش بينزل" من غير أي رسالة خطأ.
        r2Object.Body.on('error', (streamErr) => {
            console.error('❌ خطأ في تدفق الملف من R2:', streamErr);
            if (!res.headersSent) res.status(500).json({ error: 'خطأ أثناء نقل الملف' });
            else res.destroy();
        });

        r2Object.Body.pipe(res);
    } catch (error) {
        console.error('❌ خطأ في تحميل الملف المشترك:', error);
        res.status(500).json({ error: 'خطأ في تحميل الملف' });
    }
});

// تحديث عدد المشاهدات لملف من المكتبة المشتركة
app.post('/api/shared-summaries/view/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });
        doc.views = (doc.views || 0) + 1;
        await doc.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث المشاهدات' });
    }
});

// حذف: الطالب صاحب الملف (بس لو لسه pending) أو مدير المعهد في أي وقت
app.delete('/api/shared-summaries/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const doc = await SharedSummary.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'الملف غير موجود' });

        const isAdminUser = req.user?.type === 'admin';
        const isOwner = req.user?.type === 'student' && req.user?.username === doc.uploadedBy;
        if (!isAdminUser && !(isOwner && doc.status === 'pending')) {
            return res.status(403).json({ error: 'مش مصرح لك تمسح الملف ده' });
        }

        try {
            await deleteFromSupabase(doc.publicId);
        } catch (e) {
            console.log('⚠️ R2 delete error:', e.message);
        }
        await SharedSummary.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الملف' });
    }
});


// 1. إنشاء واجب جديد (للأدمن)
app.post('/api/homework', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, deadline, targetGrade, questions } = req.body;
        
        console.log('📝 إنشاء واجب جديد:', { title, chapterId, questionCount });
        
        if (!title || !chapterId || !questionCount || !deadline || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة، ويجب اختيار الأسئلة' });
        }

        const newHomework = new Homework({
            title,
            chapterId,
            chapterName: chapterName || 'فصل غير معروف',
            questionCount,
            categoryFilter: categoryFilter || 'all',
            deadline,
            targetGrade: targetGrade || 'first',
            createdBy: req.user.username || 'admin',
            questions: questions,
            isActive: true
        });

        await newHomework.save();
        console.log('✅ تم إنشاء الواجب:', newHomework._id);
        res.json({ success: true, message: 'تم إنشاء الواجب بنجاح', homework: newHomework });
    } catch (error) {
        console.error('❌ خطأ في إنشاء الواجب:', error);
        res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' });
    }
});

// 2. جلب كل الواجبات (للأدمن)
app.get('/api/homework/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        console.log('📋 جلب كل الواجبات...');
        
        const homeworks = await Homework.find().sort({ createdAt: -1 });
        console.log(`✅ تم جلب ${homeworks.length} واجب من قاعدة البيانات`);
        
        if (!homeworks || homeworks.length === 0) {
            console.log('⚠️ لا توجد واجبات في قاعدة البيانات');
            return res.status(200).json([]);
        }
        
        const homeworkWithStats = await Promise.all(homeworks.map(async (hw) => {
            try {
                const submissions = await HomeworkSubmission.find({ homeworkId: hw._id });
                const totalStudents = await Student.countDocuments({ grade: hw.targetGrade || 'first' });
                
                let avgScore = '0';
                if (submissions.length > 0) {
                    const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
                    avgScore = (totalScore / submissions.length).toFixed(1);
                }
                
                console.log(`📊 واجب "${hw.title}": ${submissions.length} تسليم من ${totalStudents} طالب`);
                
                return {
                    _id: hw._id,
                    id: hw._id,
                    title: hw.title || 'بدون عنوان',
                    chapterId: hw.chapterId || '',
                    chapterName: hw.chapterName || 'فصل غير معروف',
                    questionCount: hw.questionCount || 0,
                    categoryFilter: hw.categoryFilter || 'all',
                    deadline: hw.deadline || new Date().toISOString().split('T')[0],
                    targetGrade: hw.targetGrade || 'first',
                    createdBy: hw.createdBy || 'admin',
                    isActive: hw.isActive !== undefined ? hw.isActive : true,
                    questions: hw.questions || [],
                    totalStudents: totalStudents || 0,
                    submittedCount: submissions.length || 0,
                    avgScore: avgScore,
                    createdAt: hw.createdAt || new Date(),
                    updatedAt: hw.updatedAt || new Date()
                };
            } catch (err) {
                console.error(`❌ خطأ في معالجة واجب ${hw._id}:`, err);
                return {
                    _id: hw._id,
                    id: hw._id,
                    title: hw.title || 'واجب (خطأ في المعالجة)',
                    chapterName: hw.chapterName || 'فصل غير معروف',
                    questionCount: hw.questionCount || 0,
                    deadline: hw.deadline || new Date().toISOString().split('T')[0],
                    targetGrade: hw.targetGrade || 'first',
                    isActive: true,
                    totalStudents: 0,
                    submittedCount: 0,
                    avgScore: '0',
                    questions: []
                };
            }
        }));

        console.log(`✅ تم تجهيز ${homeworkWithStats.length} واجب للإرسال`);
        return res.status(200).json(homeworkWithStats);
        
    } catch (error) {
        console.error('❌ خطأ في جلب الواجبات:', error);
        return res.status(500).json({ 
            error: 'خطأ في جلب الواجبات: ',
            details: error.stack
        });
    }
});

// 3. جلب الواجبات المعلقة للطالب
app.get('/api/homework/pending', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        console.log('📚 جلب الواجبات المعلقة للطالب:', req.user.username);
        
        const student = await Student.findOne({ username: req.user.username });
        if (!student) {
            console.log('❌ الطالب غير موجود');
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }

        const today = new Date().toISOString().split('T')[0];
        console.log(`🎯 الصف: ${student.grade}, التاريخ: ${today}`);

        const homeworks = await Homework.find({
            targetGrade: student.grade,
            isActive: true,
            deadline: { $gte: today }
        }).sort({ deadline: 1 });

        console.log(`✅ تم جلب ${homeworks.length} واجب معلق`);

        const pendingHomeworks = await Promise.all(homeworks.map(async (hw) => {
            const submission = await HomeworkSubmission.findOne({ 
                homeworkId: hw._id, 
                studentId: req.user.username 
            });
            return {
                ...hw._doc,
                id: hw._id,
                isSubmitted: !!submission,
                hasSubmission: !!submission,
                myScore: submission ? submission.score : null
            };
        }));

        return res.status(200).json(pendingHomeworks);
    } catch (error) {
        console.error('❌ خطأ في جلب الواجبات المعلقة:', error);
        res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' });
    }
});

// 4. جلب واجب معين لحله (للطالب)
app.get('/api/homework/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        console.log('📥 جلب واجب:', req.params.id);
        
        const homework = await Homework.findById(req.params.id);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });

        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        
        if (student.grade !== homework.targetGrade) {
            return res.status(403).json({ error: 'هذا الواجب ليس لصفك' });
        }

        const existingSubmission = await HomeworkSubmission.findOne({ 
            homeworkId: homework._id, 
            studentId: req.user.username 
        });
        if (existingSubmission) {
            return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        }

        // إرجاع الأسئلة بدون الإجابات الصحيحة
        const questionsWithoutAnswers = (homework.questions || []).map(q => ({
            ...q,
            correct: undefined,
            correctAnswer: undefined,
            completion: undefined,
            answer: undefined
        }));

        return res.status(200).json({
            ...homework._doc,
            id: homework._id,
            questions: questionsWithoutAnswers
        });
    } catch (error) {
        console.error('❌ خطأ في جلب الواجب:', error);
        res.status(500).json({ error: 'خطأ في جلب الواجب: ' });
    }
});

// 5. تسليم الواجب (للطالب)
app.post('/api/homework/:id/submit', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const homeworkId = req.params.id;
        const { answers, timeTaken, tabSwitches } = req.body;
        
        console.log('📤 تسليم واجب:', homeworkId);
        console.log('📝 الإجابات المستلمة:', JSON.stringify(answers, null, 2));
        
        const homework = await Homework.findById(homeworkId);
        if (!homework) return res.status(404).json({ error: 'الواجب غير موجود' });

        const student = await Student.findOne({ username: req.user.username });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });

        const existingSubmission = await HomeworkSubmission.findOne({ 
            homeworkId, 
            studentId: req.user.username 
        });
        if (existingSubmission) {
            return res.status(400).json({ error: 'لقد قمت بتسليم هذا الواجب بالفعل' });
        }

        // حساب الدرجة
        let correctCount = 0;
        const detailedAnswers = [];
        const questions = homework.questions || [];
        
        console.log(`📚 عدد الأسئلة في الواجب: ${questions.length}`);
        
        for (const answer of answers || []) {
            const question = questions[answer.questionIndex];
            if (!question) {
                console.log(`⚠️ سؤال غير موجود في الفهرس ${answer.questionIndex}`);
                continue;
            }
            
            let isCorrect = false;
            const userAnswer = (answer.answer || '').toString().trim();
            let correctAnswer = '';
            
            if (question.cat === 'mcq') {
                correctAnswer = (question.correct || '').toString().trim();
                isCorrect = userAnswer === correctAnswer;
                console.log(`📊 MCQ - السؤال ${answer.questionIndex + 1}: "${userAnswer}" === "${correctAnswer}" => ${isCorrect}`);
            } else if (question.cat === 'truefalse') {
                const correctStr = String(question.correct).toLowerCase().trim();
                const answerStr = userAnswer.toLowerCase().trim();
                isCorrect = correctStr === answerStr;
                console.log(`📊 True/False - السؤال ${answer.questionIndex + 1}: "${answerStr}" === "${correctStr}" => ${isCorrect}`);
            } else {
                // مقارنة تقريبية للإجابات المقالية
                const correctStr = (question.completion || question.answer || '').toLowerCase().trim();
                isCorrect = userAnswer.length > 3 && correctStr.length > 0 && 
                           userAnswer.toLowerCase().includes(correctStr) || 
                           correctStr.includes(userAnswer.toLowerCase());
                console.log(`📊 Essay - السؤال ${answer.questionIndex + 1}: "${userAnswer}" ~ "${correctStr}" => ${isCorrect}`);
            }
            
            if (isCorrect) correctCount++;
            detailedAnswers.push({
                questionIndex: answer.questionIndex,
                answer: userAnswer,
                isCorrect: isCorrect
            });
        }

        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        
        console.log(`✅ النتيجة: ${correctCount}/${totalQuestions} = ${score}%`);

        const submission = new HomeworkSubmission({
            homeworkId: homework._id,
            studentId: req.user.username,
            studentName: student.fullName || 'طالب',
            studentCode: student.studentCode || '---',
            answers: detailedAnswers,
            score: score,
            totalQuestions: totalQuestions,
            timeTaken: timeTaken || 0,
            tabSwitches: tabSwitches || 0
        });

        await submission.save();
        console.log(`✅ تم تسليم الواجب ${homeworkId} من الطالب ${req.user.username} بنتيجة ${score}%`);
        
        res.json({ 
            success: true, 
            message: 'تم تسليم الواجب بنجاح', 
            score: score 
        });
    } catch (error) {
        console.error('❌ خطأ في تسليم الواجب:', error);
        res.status(500).json({ error: 'خطأ في تسليم الواجب: ' });
    }
});

// 6. جلب تفاصيل تسليم واجب معين (للأدمن أو للطالب نفسه)
app.get('/api/homework/:id/submissions', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        console.log('📊 جلب تسليمات الواجب:', req.params.id);
        
        // إذا كان المستخدم أدمن، يجيب كل التسليمات
        if (req.user.type === 'admin') {
            const submissions = await HomeworkSubmission.find({ homeworkId: req.params.id })
                .sort({ submittedAt: -1 });
            
            console.log(`✅ تم جلب ${submissions.length} تسليم للأدمن`);
            
            const detailedSubmissions = await Promise.all(submissions.map(async (sub) => {
                const student = await Student.findOne({ username: sub.studentId }).select('fullName studentCode');
                return {
                    ...sub._doc,
                    id: sub._id,
                    studentName: student ? student.fullName : sub.studentName || 'غير معروف',
                    studentCode: student ? student.studentCode : sub.studentCode || '---'
                };
            }));
            
            return res.json(detailedSubmissions);
        }
        
        // إذا كان المستخدم طالب، يجيب تسليمه هو فقط
        const submission = await HomeworkSubmission.findOne({ 
            homeworkId: req.params.id, 
            studentId: req.user.username 
        });
        
        if (!submission) {
            return res.status(404).json({ error: 'لم تجد تسليم لهذا الواجب' });
        }
        
        console.log(`✅ تم جلب تسليم الطالب ${req.user.username}`);
        return res.json([submission]); // إرجاع كمصفوفة للتوافق مع الواجهة
        
    } catch (error) {
        console.error('❌ خطأ في جلب التسليمات:', error);
        res.status(500).json({ error: 'خطأ في جلب التسليمات: ' });
    }
});

// 7. حذف/إلغاء واجب (للأدمن)
app.delete('/api/homework/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        console.log('🗑️ حذف واجب:', req.params.id);
        
        const deletedHomework = await Homework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) {
            return res.status(404).json({ error: 'الواجب غير موجود' });
        }
        
        const deletedSubmissions = await HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        console.log(`✅ تم حذف الواجب و ${deletedSubmissions.deletedCount} تسليم`);
        
        res.json({ 
            success: true, 
            message: 'تم حذف الواجب وجميع التسليمات المرتبطة به',
            deletedSubmissions: deletedSubmissions.deletedCount
        });
    } catch (error) {
        console.error('❌ خطأ في حذف الواجب:', error);
        res.status(500).json({ error: 'خطأ في حذف الواجب: ' });
    }
});


// ====================== دالة توليد كود فريد ======================
function generateTournamentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // تجنب الأحرف المتشابهة (0,O,1,I)
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function generateUniqueCode() {
    let code;
    let exists = true;
    let attempts = 0;
    
    while (exists && attempts < 20) {
        code = generateTournamentCode();
        exists = await Tournament.findOne({ code });
        attempts++;
    }
    
    if (exists) {
        throw new Error('فشل توليد كود فريد بعد عدة محاولات');
    }
    
    return code;
}

// ====================== دوال تصحيح الإجابات ======================
function correctAnswer(question, userAnswer) {
    if (!userAnswer) return false;
    
    const qType = question.cat || 'mcq';
    const userAnsLower = userAnswer.trim().toLowerCase();
    
    switch (qType) {
        case 'mcq':
            return correctMCQ(question, userAnswer, userAnsLower);
        
        case 'truefalse':
            return correctTrueFalse(question, userAnsLower);
        
        case 'complete':
            return correctComplete(question, userAnsLower);
        
        case 'list':
            return correctList(userAnsLower);
        
        case 'explain':
        case 'situations':
            return correctOpenEnded(userAnsLower);
        
        default:
            return false;
    }
}

function correctMCQ(question, userAnswer, userAnsLower) {
    const correctAns = String(question.correct || '').trim().toLowerCase();
    
    // مقارنة مباشرة
    if (userAnswer.trim().toLowerCase() === correctAns) return true;
    
    // مقارنة مع الخيارات
    if (question.options) {
        return question.options.some(opt => {
            const optLower = String(opt).trim().toLowerCase();
            return optLower === userAnsLower && optLower === correctAns;
        });
    }
    
    return false;
}

function correctTrueFalse(question, userAnsLower) {
    const correctIsTrue = (
        question.correct === true || 
        String(question.correct).toLowerCase() === 'true'
    );
    
    const trueAnswers = ['صواب', 'true', 'صح', 'نعم', 'yes'];
    const falseAnswers = ['خطأ', 'false', 'غلط', 'لا', 'no'];
    
    const userIsTrue = trueAnswers.includes(userAnsLower);
    const userIsFalse = falseAnswers.includes(userAnsLower);
    
    if (correctIsTrue) return userIsTrue;
    return userIsFalse;
}

function correctComplete(question, userAnsLower) {
    const completion = String(question.completion || '').trim().toLowerCase();
    if (!completion || userAnsLower.length < 2) return false;
    
    // تطابق تام
    if (userAnsLower === completion) return true;
    
    // تطابق جزئي
    if (userAnsLower.includes(completion) || completion.includes(userAnsLower)) return true;
    
    // تحليل الكلمات المفتاحية (للكلمات الطويلة فقط)
    const keywords = completion.split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return false;
    
    const matched = keywords.filter(kw => userAnsLower.includes(kw));
    return (matched.length / keywords.length) >= 0.6;
}

function correctList(userAnsLower) {
    // التحقق من وجود 3 نقاط على الأقل مفصولة بأسطر أو فواصل
    const lines = userAnsLower.split(/[\n,،]/).filter(l => l.trim().length > 3);
    return lines.length >= 3;
}

function correctOpenEnded(userAnsLower) {
    // إجابة طويلة بما فيه الكفاية
    return userAnsLower.length > 15;
}

// ====================== 1. إنشاء بطولة (للأدمن) ======================
app.post('/api/tournaments', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        
        const { 
            title, chapterId, chapterName, questionCount, 
            categoryFilter, timeLimitMinutes, startDate, endDate, questions 
        } = req.body;
        
        // التحقق من البيانات
        if (!title || !chapterId || !startDate || !endDate) {
            return res.status(400).json({ 
                success: false,
                error: 'جميع الحقول المطلوبة يجب ملؤها' 
            });
        }
        
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'يجب إضافة سؤال واحد على الأقل للبطولة' 
            });
        }
        
        if (startDate > endDate) {
            return res.status(400).json({ 
                success: false,
                error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية' 
            });
        }
        
        // التحقق من صحة الأسئلة
        const invalidQuestions = questions.filter(q => !q.text || !q.cat);
        if (invalidQuestions.length > 0) {
            return res.status(400).json({
                success: false,
                error: `يوجد ${invalidQuestions.length} سؤال غير صالح`
            });
        }
        
        // توليد كود فريد
        const uniqueCode = await generateUniqueCode();
        
        // إنشاء البطولة
        const newTournament = new Tournament({
            title: title.trim(),
            code: uniqueCode,
            chapterId,
            chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length,
            categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: Math.min(Math.max(timeLimitMinutes || 10, 5), 120),
            startDate,
            endDate,
            createdBy: req.user.username || 'admin',
            questions,
            isActive: true
        });
        
        await newTournament.save();
        
        console.log(`✅ بطولة جديدة: ${uniqueCode} | ${questions.length} سؤال | ${newTournament.title}`);
        
        res.status(201).json({ 
            success: true, 
            message: 'تم إنشاء البطولة بنجاح',
            tournament: {
                _id: newTournament._id,
                title: newTournament.title,
                code: newTournament.code,
                chapterName: newTournament.chapterName,
                questionCount: newTournament.questionCount,
                timeLimitMinutes: newTournament.timeLimitMinutes,
                startDate: newTournament.startDate,
                endDate: newTournament.endDate
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء البطولة:', error);
        
        // خطأ تكرار الكود
        if (error.code === 11000) {
            return res.status(500).json({ 
                success: false,
                error: 'حدث خطأ في توليد كود البطولة، يرجى المحاولة مرة أخرى' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'خطأ في إنشاء البطولة: ' 
        });
    }
});

// ====================== 2. جلب البطولات النشطة ======================
app.get('/api/tournaments/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        const today = new Date().toISOString().split('T')[0];
        
        const tournaments = await Tournament.find({
            isActive: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        })
        .select('title code chapterName questionCount timeLimitMinutes startDate endDate participants')
        .sort({ createdAt: -1 })
        .lean();
        
        const result = tournaments.map(t => {
            try {
                const participants = t.participants || [];
                const userParticipant = participants.find(
                    p => p.studentId === req.user.username
                );
                
                return {
                    _id: t._id,
                    title: t.title,
                    code: t.code,
                    chapterName: t.chapterName || '',
                    questionCount: t.questionCount || 0,
                    timeLimitMinutes: t.timeLimitMinutes || 10,
                    startDate: t.startDate,
                    endDate: t.endDate,
                    participantsCount: participants.length,
                    hasParticipated: !!userParticipant,
                    myScore: userParticipant ? userParticipant.score : null,
                    myTime: userParticipant ? userParticipant.timeTaken : null,
                    myCorrectCount: userParticipant ? userParticipant.correctCount : null
                };
            } catch (err) {
                console.error('خطأ في معالجة بطولة:', t._id, err.message);
                return null;
            }
        }).filter(t => t !== null);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ خطأ في جلب البطولات:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في جلب البطولات النشطة: ' 
        });
    }
});

// ====================== 3. الانضمام بكود البطولة ======================
app.post('/api/tournaments/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        const { code } = req.body;
        
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                success: false,
                error: 'يرجى إدخال كود البطولة' 
            });
        }
        
        const cleanCode = code.toUpperCase().trim();
        
        if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
            return res.status(400).json({ 
                success: false,
                error: 'صيغة الكود غير صحيحة' 
            });
        }
        
        const tournament = await Tournament.findOne({ 
            code: cleanCode,
            isActive: true 
        });
        
        if (!tournament) {
            return res.status(404).json({ 
                success: false,
                error: 'كود البطولة غير صحيح أو البطولة غير متاحة' 
            });
        }
        
        // التحقق من التواريخ
        const today = new Date().toISOString().split('T')[0];
        
        if (tournament.startDate > today) {
            return res.status(400).json({ 
                success: false,
                error: `البطولة لم تبدأ بعد. ستبدأ في ${tournament.startDate}` 
            });
        }
        
        if (tournament.endDate < today) {
            return res.status(400).json({ 
                success: false,
                error: 'انتهت مدة البطولة' 
            });
        }
        
        // التحقق من المشاركة السابقة
        const alreadyJoined = tournament.participants.find(
            p => p.studentId === req.user.username
        );
        
        if (alreadyJoined) {
            return res.status(400).json({ 
                success: false,
                error: 'لقد شاركت في هذه البطولة مسبقاً',
                alreadyParticipated: true,
                score: alreadyJoined.score
            });
        }
        
        // تجهيز الأسئلة بدون الإجابات الصحيحة
        const questionsWithoutAnswers = tournament.questions.map(q => ({
            text: q.text || '',
            translation: q.translation || '',
            cat: q.cat || 'mcq',
            options: q.options || []
        }));
        
        console.log(`🔑 انضمام للبطولة: ${req.user.username} | ${cleanCode}`);
        
        res.json({ 
            success: true,
            tournamentId: tournament._id,
            title: tournament.title,
            chapterName: tournament.chapterName,
            timeLimitMinutes: tournament.timeLimitMinutes || 10,
            endDate: tournament.endDate,
            questions: questionsWithoutAnswers,
            totalQuestions: questionsWithoutAnswers.length,
            message: 'تم التحقق بنجاح. ابدأ الحل الآن!'
        });
        
    } catch (error) {
        console.error('❌ خطأ في الانضمام:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في الانضمام للبطولة: ' 
        });
    }
});

// ====================== 4. المشاركة وإرسال الإجابات ======================
app.post('/api/tournaments/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        const { answers, timeTaken } = req.body;
        const tournamentId = req.params.id;
        
        // التحقق من صحة المعرف
        if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ 
                success: false,
                error: 'معرف البطولة غير صحيح' 
            });
        }
        
        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ 
                success: false,
                error: 'بيانات الإجابات غير صحيحة' 
            });
        }
        
        const tournament = await Tournament.findById(tournamentId);
        
        if (!tournament) {
            return res.status(404).json({ 
                success: false,
                error: 'البطولة غير موجودة' 
            });
        }
        
        // التحقق من حالة البطولة
        if (!tournament.isActive) {
            return res.status(400).json({ 
                success: false,
                error: 'البطولة مغلقة وغير متاحة للمشاركة' 
            });
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        if (tournament.startDate > today) {
            return res.status(400).json({ 
                success: false,
                error: 'البطولة لم تبدأ بعد' 
            });
        }
        
        if (tournament.endDate < today) {
            return res.status(400).json({ 
                success: false,
                error: 'انتهت مدة البطولة' 
            });
        }
        
        // التحقق من عدم المشاركة المسبقة
        const existingParticipant = tournament.participants.find(
            p => p.studentId === req.user.username
        );
        
        if (existingParticipant) {
            return res.status(400).json({ 
                success: false,
                error: 'لقد شاركت بالفعل في هذه البطولة' 
            });
        }
        
        // التحقق من وقت الحل (منع الغش)
        const totalQuestions = tournament.questions.length;
        const minExpectedTime = Math.max(30, totalQuestions * 3); // 3 ثواني لكل سؤال كحد أدنى
        
        if (timeTaken < minExpectedTime) {
            console.warn(`⚠️ وقت مشبوه: ${req.user.username} | ${timeTaken}ثانية | الحد الأدنى: ${minExpectedTime}ثانية`);
            return res.status(400).json({ 
                success: false,
                error: 'وقت الحل غير منطقي. يرجى إعادة المحاولة بتركيز.' 
            });
        }
        
        // التحقق من عدد الإجابات
        if (answers.length > totalQuestions) {
            return res.status(400).json({ 
                success: false,
                error: 'عدد الإجابات أكثر من عدد الأسئلة' 
            });
        }
        
        // تصحيح الإجابات
        let correctCount = 0;
        const detailedAnswers = [];
        
        for (const answer of answers) {
            const question = tournament.questions[answer.questionIndex];
            
            if (!question) {
                detailedAnswers.push({
                    questionIndex: answer.questionIndex,
                    answer: answer.answer || '',
                    isCorrect: false
                });
                continue;
            }
            
            const isCorrect = correctAnswer(question, answer.answer || '');
            if (isCorrect) correctCount++;
            
            detailedAnswers.push({
                questionIndex: answer.questionIndex,
                answer: answer.answer || '',
                isCorrect
            });
        }
        
        const score = Math.round((correctCount / totalQuestions) * 100);
        const wrongCount = totalQuestions - correctCount;
        
        // جلب معلومات الطالب
        let studentName = req.user.username;
        try {
            const student = await Student.findOne({ username: req.user.username });
            if (student) {
                studentName = student.fullName || student.username;
            }
        } catch (err) {
            console.warn('تعذر جلب اسم الطالب:', err.message);
        }
        
        // إضافة المشارك
        tournament.participants.push({
            studentId: req.user.username,
            studentName,
            score,
            correctCount,
            wrongCount,
            timeTaken: timeTaken || 0,
            answers: detailedAnswers,
            submittedAt: new Date()
        });
        
        // ترتيب المشاركين (الأعلى درجة ثم الأسرع)
        tournament.participants.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.timeTaken - b.timeTaken;
        });
        
        await tournament.save();
        
        // حساب ترتيب المستخدم
        const userRank = tournament.participants.findIndex(
            p => p.studentId === req.user.username
        ) + 1;
        
        // مكافأة XP
        const xpRewards = {
            1: 50,
            2: 30,
            3: 20
        };
        const xpReward = xpRewards[userRank] || 10;
        
        // تحديث XP
        try {
            await Progress.findOneAndUpdate(
                { userId: req.user.username },
                { $inc: { xp: xpReward } },
                { upsert: true, new: true }
            );
        } catch (xpErr) {
            console.error('خطأ في تحديث XP:', xpErr.message);
        }
        
        console.log(`✅ مشاركة: ${req.user.username} | ${score}% | ترتيب: ${userRank} | XP: +${xpReward}`);
        
        res.json({
            success: true,
            score,
            rank: userRank,
            correctCount,
            wrongCount,
            totalQuestions,
            xpEarned: xpReward,
            message: `أحسنت! حصلت على ${score}%`
        });
        
    } catch (error) {
        console.error('❌ خطأ في المشاركة:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في معالجة المشاركة: ' 
        });
    }
});

// ====================== 5. جلب نتائج البطولة ======================
app.get('/api/tournaments/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        
        const tournamentId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ 
                success: false,
                error: 'معرف البطولة غير صحيح' 
            });
        }
        
        const tournament = await Tournament.findById(tournamentId)
            .select('title chapterName participants winner1 winner2 winner3')
            .lean();
        
        if (!tournament) {
            return res.status(404).json({ 
                success: false,
                error: 'البطولة غير موجودة' 
            });
        }
        
        // التحقق من صلاحية العرض
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(
                p => p.studentId === req.user.username
            );
            if (!isParticipant) {
                return res.status(403).json({ 
                    success: false,
                    error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' 
                });
            }
        }
        
        const participants = (tournament.participants || []).map((p, index) => ({
            rank: index + 1,
            studentName: p.studentName,
            score: p.score,
            correctCount: p.correctCount || 0,
            wrongCount: p.wrongCount || 0,
            timeTaken: p.timeTaken,
            submittedAt: p.submittedAt
        }));
        
        const top3 = participants.slice(0, 3);
        
        // إخفاء أسماء الفائزين إذا لم ينتهِ الوقت
        const isFinished = !tournament.isActive;
        
        res.json({
            success: true,
            title: tournament.title,
            chapterName: tournament.chapterName,
            participants,
            top3,
            totalParticipants: participants.length,
            winners: isFinished ? {
                first: tournament.winner1 || '',
                second: tournament.winner2 || '',
                third: tournament.winner3 || ''
            } : null
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب النتائج:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في جلب نتائج البطولة: ' 
        });
    }
});

// ====================== 6. إنهاء البطولة (للأدمن) ======================
app.post('/api/tournaments/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        
        const tournamentId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
            return res.status(400).json({ 
                success: false,
                error: 'معرف البطولة غير صحيح' 
            });
        }
        
        const tournament = await Tournament.findById(tournamentId);
        
        if (!tournament) {
            return res.status(404).json({ 
                success: false,
                error: 'البطولة غير موجودة' 
            });
        }
        
        if (!tournament.isActive) {
            return res.status(400).json({ 
                success: false,
                error: 'البطولة منتهية بالفعل' 
            });
        }
        
        // إنهاء البطولة
        tournament.isActive = false;
        
        const participants = tournament.participants || [];
        
        // تحديد الفائزين
        if (participants.length >= 1) {
            tournament.winner1 = participants[0].studentId;
        }
        if (participants.length >= 2) {
            tournament.winner2 = participants[1].studentId;
        }
        if (participants.length >= 3) {
            tournament.winner3 = participants[2].studentId;
        }
        
        // توزيع مكافآت XP إضافية للفائزين
        const winnerRewards = [
            { id: tournament.winner1, xp: 100, rank: 1 },
            { id: tournament.winner2, xp: 60, rank: 2 },
            { id: tournament.winner3, xp: 30, rank: 3 }
        ];
        
        for (const reward of winnerRewards) {
            if (reward.id) {
                try {
                    await Progress.findOneAndUpdate(
                        { userId: reward.id },
                        { $inc: { xp: reward.xp } },
                        { upsert: true }
                    );
                    console.log(`🏆 مكافأة المركز ${reward.rank}: ${reward.id} +${reward.xp}XP`);
                } catch (err) {
                    console.error(`خطأ في مكافأة ${reward.id}:`, err.message);
                }
            }
        }
        
        await tournament.save();
        
        console.log(`✅ تم إنهاء البطولة: ${tournament.title} | الفائز: ${participants[0]?.studentName || 'لا يوجد'}`);
        
        res.json({
            success: true,
            message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح',
            winners: {
                first: participants[0]?.studentName || 'لا يوجد',
                second: participants[1]?.studentName || 'لا يوجد',
                third: participants[2]?.studentName || 'لا يوجد'
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنهاء البطولة:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في إنهاء البطولة: ' 
        });
    }
});

// ====================== 7. جلب جميع البطولات (للأدمن) ======================
app.get('/api/tournaments/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const [tournaments, total] = await Promise.all([
            Tournament.find()
                .select('title code chapterName questionCount startDate endDate isActive participants createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Tournament.countDocuments()
        ]);
        
        const result = tournaments.map(t => ({
            _id: t._id,
            title: t.title,
            code: t.code,
            chapterName: t.chapterName,
            questionCount: t.questionCount,
            startDate: t.startDate,
            endDate: t.endDate,
            isActive: t.isActive,
            participantsCount: (t.participants || []).length,
            createdAt: t.createdAt
        }));
        
        res.json({
            success: true,
            tournaments: result,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في جلب جميع البطولات:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في جلب البطولات: ' 
        });
    }
});



// ====================== 🔐 نظام تسجيل الدخول بالبصمة (WebAuthn) ======================
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');

// اسم/معرف الموقع لازم يكون ثابت (نفس الدومين اللي المستخدم بيسجل دخول منه)
const RP_NAME = 'معهد رعاية الضبعية';
function getRpID(req) {
    return (req.headers.host || 'localhost').split(':')[0];
}
function getOrigin(req) {
    return `${req.protocol}://${req.headers.host}`;
}

// نموذج لتخزين بيانات البصمة (مفتاح عام حقيقي + عداد لمنع إعادة التشغيل)
const biometricSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    credentialId: { type: String, required: true, unique: true }, // base64url
    publicKey: { type: String, required: true }, // base64 من credentialPublicKey الحقيقي
    counter: { type: Number, default: 0 },
    deviceType: { type: String, default: 'singleDevice' },
    backedUp: { type: Boolean, default: false },
    transports: { type: [String], default: [] },
    registeredAt: { type: Date, default: Date.now },
    lastUsed: { type: Date, default: Date.now }
}, { timestamps: true });

const Biometric = mongoose.models.Biometric || mongoose.model('Biometric', biometricSchema);

// تخزين التحدي (challenge) في قاعدة البيانات بدل الجلسة
// (السيرفر Serverless - مفيش ذاكرة ثابتة بين الطلبات، فمينفعش نعتمد على req.session)
const challengeSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    challenge: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 } // تنتهي صلاحيتها بعد 5 دقايق
});
const WebAuthnChallenge = mongoose.models.WebAuthnChallenge || mongoose.model('WebAuthnChallenge', challengeSchema);

// 1. بدء تسجيل البصمة (Enrollment)
app.post('/api/biometric/register-start', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const username = req.user.username;

        const existing = await Biometric.findOne({ username });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'لقد قمت بتسجيل البصمة مسبقاً. يمكنك تسجيل الدخول مباشرة'
            });
        }

        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: getRpID(req),
            userID: crypto.createHash('sha256').update(username).digest(),
            userName: username,
            userDisplayName: req.user.fullName || username,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                residentKey: 'preferred',
                userVerification: 'preferred'
            }
        });

        await WebAuthnChallenge.findOneAndUpdate(
            { username },
            { challenge: options.challenge, createdAt: new Date() },
            { upsert: true }
        );

        res.json({ success: true, options });
    } catch (error) {
        console.error('❌ Biometric register start error:', error);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// 2. إكمال تسجيل البصمة (بالتحقق الفعلي من التوقيع)
app.post('/api/biometric/register-finish', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { credential } = req.body;
        const username = req.user.username;

        if (!credential) {
            return res.status(400).json({ success: false, error: 'بيانات البصمة غير صحيحة' });
        }

        const existing = await Biometric.findOne({ username });
        if (existing) {
            return res.status(400).json({ success: false, error: 'البصمة مسجلة مسبقاً' });
        }

        const pending = await WebAuthnChallenge.findOne({ username });
        if (!pending) {
            return res.status(400).json({ success: false, error: 'انتهت صلاحية طلب التسجيل، حاول تاني' });
        }

        const verification = await verifyRegistrationResponse({
            response: credential,
            expectedChallenge: pending.challenge,
            expectedOrigin: getOrigin(req),
            expectedRPID: getRpID(req)
        });

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ success: false, error: 'فشل التحقق من البصمة' });
        }

        const { credential: regCred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        await new Biometric({
            username,
            credentialId: regCred.id,
            publicKey: Buffer.from(regCred.publicKey).toString('base64'),
            counter: regCred.counter,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            transports: credential.response?.transports || []
        }).save();

        await WebAuthnChallenge.deleteOne({ username });

        console.log(`✅ تم تسجيل البصمة للمستخدم: ${username}`);
        res.json({ success: true, message: '✅ تم تسجيل البصمة بنجاح! يمكنك الآن تسجيل الدخول بالبصمة' });
    } catch (error) {
        console.error('❌ Biometric register finish error:', error);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// 3. بدء تسجيل الدخول بالبصمة
app.post('/api/biometric/login-start', async (req, res) => {
    try {
        await connectToDatabase();
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
        }

        const biometric = await Biometric.findOne({ username: username.toLowerCase() });
        if (!biometric) {
            return res.status(404).json({ success: false, error: 'لم يتم العثور على بصمة مسجلة لهذا المستخدم' });
        }

        const options = await generateAuthenticationOptions({
            rpID: getRpID(req),
            allowCredentials: [{
                id: biometric.credentialId,
                transports: biometric.transports || []
            }],
            userVerification: 'preferred'
        });

        await WebAuthnChallenge.findOneAndUpdate(
            { username: username.toLowerCase() },
            { challenge: options.challenge, createdAt: new Date() },
            { upsert: true }
        );

        res.json({ success: true, options });
    } catch (error) {
        console.error('❌ Biometric login start error:', error);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// 4. إكمال تسجيل الدخول بالبصمة (بالتحقق الفعلي من التوقيع والعداد)
app.post('/api/biometric/login-finish', async (req, res) => {
    try {
        await connectToDatabase();
        const { credential, deviceFingerprint } = req.body;

        if (!credential || !credential.id) {
            return res.status(400).json({ success: false, error: 'بيانات البصمة غير صحيحة' });
        }

        const biometric = await Biometric.findOne({ credentialId: credential.id });
        if (!biometric) {
            return res.status(401).json({ success: false, error: 'بصمة غير معروفة' });
        }

        const pending = await WebAuthnChallenge.findOne({ username: biometric.username });
        if (!pending) {
            return res.status(400).json({ success: false, error: 'انتهت صلاحية الطلب، حاول تاني' });
        }

        const verification = await verifyAuthenticationResponse({
            response: credential,
            expectedChallenge: pending.challenge,
            expectedOrigin: getOrigin(req),
            expectedRPID: getRpID(req),
            credential: {
                id: biometric.credentialId,
                publicKey: Buffer.from(biometric.publicKey, 'base64'),
                counter: biometric.counter,
                transports: biometric.transports || []
            }
        });

        if (!verification.verified) {
            return res.status(401).json({ success: false, error: 'فشل التحقق من البصمة' });
        }

        // تحديث العداد (يمنع إعادة استخدام نفس التوقيع - replay attack)
        biometric.counter = verification.authenticationInfo.newCounter;
        biometric.lastUsed = new Date();
        await biometric.save();
        await WebAuthnChallenge.deleteOne({ username: biometric.username });

        let user = await Admin.findOne({ username: biometric.username });
        let userType = 'admin';
        if (!user) {
            user = await Student.findOne({ username: biometric.username });
            userType = 'student';
        }
        if (!user) {
            return res.status(401).json({ success: false, error: 'المستخدم غير موجود' });
        }

        // نفس قفل "جلسة واحدة بس في نفس الوقت" المطبّق في /api/login العادي —
        // شوف الشرح الكامل هناك.
        const nowBio = new Date();
        const hasLiveSessionBio = user.activeSessionId && user.sessionLastSeenAt &&
            (nowBio - new Date(user.sessionLastSeenAt)) < SESSION_ALIVE_WINDOW_MS;
        if (hasLiveSessionBio) {
            logSessionEvent({ username: user.username, userType, event: 'blocked', fingerprint: deviceFingerprint, req });
            return res.status(409).json({
                success: false,
                error: 'الحساب ده مسجّل دخول بالفعل على جهاز تاني دلوقتي. سجّل خروج من هناك الأول، أو استنى كام دقيقة لو الجهاز مقفول من غير خروج.',
                code: 'ACCOUNT_IN_USE'
            });
        }
        const bioSessionId = crypto.randomBytes(16).toString('hex');
        user.activeSessionId = bioSessionId;
        user.sessionLastSeenAt = nowBio;
        user.activeSessionFingerprint = deviceFingerprint || null;
        await user.save();
        logSessionEvent({ username: user.username, userType, event: 'login', fingerprint: deviceFingerprint, req });

        const token = jwt.sign(
            {
                id: user._id,
                username: user.username,
                type: userType,
                fullName: user.fullName,
                studentCode: user.studentCode,
                role: userType === 'admin' ? (user.role || 'manager') : undefined,
                sid: bioSessionId
            },
            JWT_SECRET,
            { expiresIn: SESSION_JWT_EXPIRY }
        );

        setAuthCookie(res, token);

        console.log(`✅ تسجيل دخول بالبصمة: ${biometric.username}`);
        res.json({
            success: true,
            user: {
                username: user.username,
                fullName: user.fullName,
                type: userType,
                id: user.studentCode || user._id,
                role: userType === 'admin' ? (user.role || 'manager') : undefined
            },
            message: '🎉 تم تسجيل الدخول بالبصمة بنجاح!'
        });
    } catch (error) {
        console.error('❌ Biometric login finish error:', error);
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});

// 5. التحقق من وجود بصمة مسجلة
app.get('/api/biometric/check/:username', async (req, res) => {
    try {
        await connectToDatabase();
        const { username } = req.params;
        
        const biometric = await Biometric.findOne({ username: username.toLowerCase() });
        
        res.json({
            success: true,
            hasBiometric: !!biometric,
            lastUsed: biometric?.lastUsed || null
        });
    } catch (error) {
        res.json({ success: false, hasBiometric: false });
    }
});

// 6. حذف البصمة المسجلة
app.delete('/api/biometric', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const username = req.user.username;
        
        const deleted = await Biometric.findOneAndDelete({ username });
        
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'لا توجد بصمة مسجلة' });
        }
        
        res.json({
            success: true,
            message: '✅ تم حذف البصمة بنجاح'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'خطأ في السيرفر' });
    }
});



// ====================== المراجعة الذكية (Smart Review) ======================
app.post('/api/smart-review', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user.username || req.user.id;
        const { questions: allQuestions, chapterId } = req.body;
        
        console.log('🧠 جلب أسئلة المراجعة الذكية للمستخدم:', userId);
        console.log(`📚 عدد الأسئلة المستلمة: ${allQuestions?.length || 0}`);
        console.log(`📖 الفصل المختار: ${chapterId || 'جميع الفصول'}`);
        
        if (!allQuestions || allQuestions.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'لا توجد أسئلة مرسلة من الواجهة' 
            });
        }
        
        // جلب تقدم الطالب
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
            await progress.save();
            console.log('✅ تم إنشاء تقدم جديد للمستخدم');
        }
        
        // جلب الأسئلة الخاطئة
        const wrongQuestions = progress.wrongQuestions || [];
        console.log(`📝 عدد الأسئلة الخاطئة: ${wrongQuestions.length}`);
        
        // جلب الأسئلة الصعبة
        const difficulties = progress.difficulties || {};
        const hardQuestionIds = [];
        for (const [key, value] of Object.entries(difficulties)) {
            if (value === 'hard') hardQuestionIds.push(key);
        }
        console.log(`🔴 عدد الأسئلة الصعبة: ${hardQuestionIds.length}`);
        
        // جلب سجل الاختبارات
        const quizHistory = progress.quizHistory || [];
        console.log(`📊 عدد الاختبارات السابقة: ${quizHistory.length}`);
        
        // تصفية الأسئلة للمراجعة
        const reviewQuestions = [];
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneWeekAgoStr = oneWeekAgo.toISOString();
        
        // قائمة الأسئلة التي تم حلها مؤخراً
        const recentlySolved = new Set();
        for (const history of quizHistory) {
            if (history.date && history.date > oneWeekAgoStr) {
                if (history.questionId) {
                    recentlySolved.add(history.questionId);
                }
            }
        }
        
        // قائمة الأسئلة التي تم حلها بشكل عام
        const solvedQuestions = new Set();
        for (const history of quizHistory) {
            if (history.questionId) {
                solvedQuestions.add(history.questionId);
            }
        }
        
        for (const q of allQuestions) {
            // 1. أسئلة خاطئة - أولوية عالية جداً
            if (wrongQuestions.some(w => w.questionId === q.questionId)) {
                reviewQuestions.push({ ...q, reason: '❌ أجبت عليها خطأ' });
                continue;
            }
            
            // 2. أسئلة صعبة - أولوية عالية
            if (hardQuestionIds.includes(q.questionId)) {
                reviewQuestions.push({ ...q, reason: '🔴 صنفتها صعبة' });
                continue;
            }
            
            // 3. أسئلة لم تراجع منذ أسبوع
            if (!recentlySolved.has(q.questionId) && solvedQuestions.has(q.questionId)) {
                reviewQuestions.push({ ...q, reason: '⏰ مر أكثر من أسبوع' });
                continue;
            }
            
            // 4. أسئلة لم تحل من قبل (للطلاب الجدد)
            if (!solvedQuestions.has(q.questionId) && reviewQuestions.length < 30) {
                reviewQuestions.push({ ...q, reason: '🆕 لم تحل من قبل' });
            }
        }
        
        console.log(`📋 عدد أسئلة المراجعة: ${reviewQuestions.length}`);
        
        // اختيار 10-20 سؤال عشوائي
        const shuffled = reviewQuestions.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(20, Math.max(10, shuffled.length)));
        const reasons = selected.map(q => q.reason);
        
        // إزالة الإجابات
        const questionsWithoutAnswers = selected.map(q => {
            const newQ = { ...q };
            delete newQ.correct;
            delete newQ.correctAnswer;
            delete newQ.completion;
            delete newQ.answer;
            delete newQ.reason;
            return newQ;
        });
        
        // الحصول على اسم الفصل
        let chapterName = 'جميع الفصول';
        if (chapterId && chapterId !== 'all' && allQuestions.length > 0) {
            const firstQ = allQuestions.find(q => q.chapterId === chapterId);
            if (firstQ) chapterName = firstQ.chapterName || chapterId;
        }
        
        console.log(`✅ تم اختيار ${questionsWithoutAnswers.length} سؤال للمراجعة من ${chapterName}`);
        console.log(`📊 أسباب الاختيار: ${reasons.join(', ')}`);
        
        res.json({
            success: true,
            questions: questionsWithoutAnswers,
            total: selected.length,
            reasons: reasons,
            chapterName: chapterName,
            message: `تم اختيار ${selected.length} سؤال للمراجعة الذكية من ${chapterName}`
        });
        
    } catch (error) {
        console.error('❌ خطأ في المراجعة الذكية:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطأ في جلب أسئلة المراجعة: '
        });
    }
});

// حفظ تقدم المراجعة الذكية
app.post('/api/smart-review/save-progress', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const userId = req.user.username || req.user.id;
        const { questionId, isCorrect, chapterId } = req.body;
        
        if (!questionId) {
            return res.status(400).json({ error: 'معرف السؤال مطلوب' });
        }
        
        let progress = await Progress.findOne({ userId });
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        // تحديث سجل الاختبارات
        progress.quizHistory.push({
            date: new Date().toISOString(),
            questionId: questionId,
            correct: isCorrect,
            type: 'smart_review',
            chapterId: chapterId || 'all'
        });
        
        // إذا كانت الإجابة خاطئة، أضفها إلى الأسئلة الخاطئة
        if (!isCorrect) {
            const exists = progress.wrongQuestions.some(w => w.questionId === questionId);
            if (!exists) {
                progress.wrongQuestions.push({
                    questionId: questionId,
                    date: new Date().toISOString(),
                    source: 'smart_review'
                });
            }
        } else {
            // إذا كانت صحيحة، أزل من الأسئلة الخاطئة
            progress.wrongQuestions = progress.wrongQuestions.filter(w => w.questionId !== questionId);
        }
        
        await progress.save();
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ خطأ في حفظ تقدم المراجعة:', error);
        res.status(500).json({ error: 'خطأ في حفظ التقدم: ' });
    }
});




// ====================== ✅ رفع الدرجات من Excel (مع معالجة duplicate username) ======================
app.post('/api/upload-grades', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { students } = req.body;
        
        if (!students || !Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ error: 'لا توجد بيانات صالحة للرفع' });
        }
        
        console.log(`📥 استلام ${students.length} طالب للرفع`);
        
        let updatedCount = 0;
        let addedCount = 0;
        const errors = [];
        
        for (const studentData of students) {
            try {
                const { studentCode, fullName, subjects, grade, semester, term } = studentData;
                
                if (!studentCode || !fullName) {
                    errors.push(`تخطي صف: بيانات غير مكتملة`);
                    continue;
                }
                
                // ✅ نظامين للدرجات: term='second' يعني نهاية العام (مجموع 510)، غير كده الترم الأول
                const targetField = term === 'second' ? 'subjectsSecond' : 'subjectsFirst';
                
                let student = await Student.findOne({ studentCode });
                
                if (student) {
                    // تحديث الطالب الموجود - بيحدّث درجات الترم المُختار فقط، من غير ما يمس الترم التاني
                    await Student.updateOne(
                        { studentCode },
                        { 
                            $set: { 
                                fullName, 
                                [targetField]: subjects || [], 
                                grade: grade || student.grade || 'first',
                                semester: semester || student.semester || 'first'
                            } 
                        }
                    );
                    updatedCount++;
                } else {
                    // ✅ إضافة طالب جديد مع username = studentCode
                    // ✅ لو username موجود (يعني طالب تاني بنفس الاسم)، نضيف رقم عشوائي
                    let username = studentCode;
                    let existingUser = await Student.findOne({ username });
                    
                    if (existingUser) {
                        // اسم المستخدم موجود، نضيف رقم عشوائي
                        username = studentCode + '_' + Math.floor(Math.random() * 1000);
                    }
                    
                    await Student.create({
                        fullName,
                        studentCode,
                        username: username,
                        password: await hashPassword('123456'),
                        grade: grade || 'first',
                        semester: semester || 'first',
                        [targetField]: subjects || [],
                        role: 'student'
                    });
                    addedCount++;
                }
            } catch (err) {
                // ✅ لو حصل duplicate، نجرب من غير username
                if (err.code === 11000) {
                    try {
                        const targetField = studentData.term === 'second' ? 'subjectsSecond' : 'subjectsFirst';
                        await Student.create({
                            fullName: studentData.fullName,
                            studentCode: studentData.studentCode,
                            grade: studentData.grade || 'first',
                            semester: studentData.semester || 'first',
                            [targetField]: studentData.subjects || [],
                            role: 'student'
                            // بدون username
                        });
                        addedCount++;
                    } catch (err2) {
                        errors.push(`خطأ في الطالب ${studentData.studentCode}: ${err2.message}`);
                    }
                } else {
                    errors.push(`خطأ في الطالب ${studentData.studentCode}: ${err.message}`);
                }
            }
        }
        
        const message = `✅ تم تحديث ${updatedCount} طالب وإضافة ${addedCount} طالب جديد`;
        console.log(message);
        
        res.json({ 
            success: true, 
            message: message,
            updated: updatedCount,
            added: addedCount,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined // أول 5 أخطاء فقط
        });
        
    } catch (error) {
        console.error('❌ Upload grades error:', error);
        res.status(500).json({ error: 'خطأ في رفع الدرجات: ' });
    }
});

// ====================== ✅ جلب مخالفات طالب محدد ======================
app.get('/api/violations/student/:studentId', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentId } = req.params;
        
        // الطالب يشوف مخالفاته هو بس
        if (req.user.type === 'student' && req.user.studentCode !== studentId) {
            return res.status(403).json({ error: 'لا يمكنك عرض مخالفات طالب آخر' });
        }
        
        const violations = await Violation.find({ studentId }).sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) {
        console.error('❌ خطأ في جلب مخالفات الطالب:', error);
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});


 // ====================== ✅ التحقق من حالة تسجيل الدخول (للصفحات العامة) ======================
app.get('/api/check-auth-status', async (req, res) => {
    try {
        // نحاول نتحقق من التوكن
        let token = req.cookies?.authToken;
        if (!token) {
            const authHeader = req.headers['authorization'];
            token = authHeader?.split(' ')[1];
        }
        
        if (!token) {
            // مفيش توكن خالص
            return res.json({ isLoggedIn: false });
        }
        
        try {
            const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
            // التوكن سليم - المستخدم مسجل دخول
            return res.json({ 
                isLoggedIn: true, 
                userType: decoded.type,
                username: decoded.username 
            });
        } catch (error) {
            // التوكن موجود لكن منتهي الصلاحية
            return res.json({ isLoggedIn: false, expired: true });
        }
        
    } catch (error) {
        // لو حصل أي خطأ، نعتبره مش مسجل
        res.json({ isLoggedIn: false });
    }
});
// ====================== ✅ عداد المشاركات ======================
app.post('/api/events/:id/share', async (req, res) => {
    try {
        await connectToDatabase();
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'الفعالية غير موجودة' });
        
        event.shareCount = (event.shareCount || 0) + 1;
        await event.save();
        
        res.json({ success: true, shareCount: event.shareCount });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث عداد المشاركات' });
    }
});

// ====================== ✅ نظام التبليغ ======================
app.post('/api/events/:id/report', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { reason, details } = req.body;
        
        const report = {
            eventId: req.params.id,
            userId: req.user.id || req.user.username,
            reason,
            details,
            date: new Date()
        };
        
        // حفظ البلاغ في قاعدة البيانات
        const Report = mongoose.models.Report || mongoose.model('Report', new mongoose.Schema({
            eventId: String,
            userId: String,
            reason: String,
            details: String,
            date: Date
        }));
        
        await new Report(report).save();
        
        res.json({ success: true, message: 'تم إرسال البلاغ بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إرسال البلاغ' });
    }
});


// ====================== Error Handling ======================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'حدث خطأ داخلي في السيرفر' });
});

// ====================== نقطة نهاية لإرجاع CSRF Token ======================
app.get('/api/csrf-token', (req, res) => {
    // إنشاء توكن عشوائي وتخزينه في الجلسة (أو cookie)
    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', csrfToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ csrfToken });
});


// ==========================================================================
// إضافات Chat X: الحضور الفوري + لوحة الصدارة الحية + إصلاح بحث الأصدقاء
// ⬅️ الصق الكتلة دي قبل: app.get('*', (req, res) => { ... })
// ==========================================================================

// ---------- نماذج جديدة ----------
const presenceSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  fullName: { type: String, default: '' },
  userType: { type: String, default: 'student' },
  lastSeen: { type: Date, default: Date.now },
  dayKey: { type: String, default: '' },
  questionsToday: { type: Number, default: 0 },
  messagesToday: { type: Number, default: 0 },
  timeTodaySeconds: { type: Number, default: 0 },
  // عدّاد إجمالي — من غير تصفير يومي، لعرضه في لوحة الأدمن ("عدد الأسئلة اللي سألها" إجمالًا)
  totalQuestions: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 }
}, { timestamps: true });
presenceSchema.index({ lastSeen: 1 });
const Presence = mongoose.models.Presence || mongoose.model('Presence', presenceSchema);

const weeklyStatsSchema = new mongoose.Schema({
  username: { type: String, required: true },
  fullName: { type: String, default: '' },
  weekStart: { type: String, required: true },   // أول يوم في الأسبوع (السبت) YYYY-MM-DD
  messagesCount: { type: Number, default: 0 },
  questionsCount: { type: Number, default: 0 },
  timeSpentSeconds: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now }
});
weeklyStatsSchema.index({ username: 1, weekStart: 1 }, { unique: true });
weeklyStatsSchema.index({ weekStart: 1, timeSpentSeconds: -1 });
const WeeklyStats = mongoose.models.WeeklyStats || mongoose.model('WeeklyStats', weeklyStatsSchema);

// ====================== تتبّع استخدام الميزات (لوحة المتابعة الشاملة) ======================
// هدف الـ schema ده: نعرف لكل طالب، لكل ميزة لوحدها (الشات الرئيسي، مكتبة الأدوية،
// امتحانات المحاكاة... إلخ) — استخدمها كام مرة، آخر مرة استخدمها إمتى، ولو الميزة
// فيها أكتر من موديل (زي الشات الرئيسي) — استخدم كل موديل كام مرة بالظبط.
// بيتغذى من /api/usage/track اللي العميل (index.html) بينده عليه فور ما الطالب
// يستخدم الميزة فعليًا (مش مجرد فتح الصفحة) — زي pingActivity بالظبط: fire & forget.
const featureUsageSchema = new mongoose.Schema({
  studentCode: { type: String, required: true, index: true },
  username: { type: String, default: '' },
  fullName: { type: String, default: '' },
  feature: { type: String, required: true }, // main_chat / premium_mock_exams / ...
  totalCount: { type: Number, default: 0 },
  models: { type: Map, of: Number, default: {} }, // بس مهم فعليًا لـ main_chat (فيه أكتر من موديل)
  lastUsedAt: { type: Date, default: Date.now }
}, { timestamps: true });
featureUsageSchema.index({ studentCode: 1, feature: 1 }, { unique: true });
const FeatureUsage = mongoose.models.FeatureUsage || mongoose.model('FeatureUsage', featureUsageSchema);

// بيتنادى من العميل كل ما طالب يستخدم ميزة فعليًا (رسالة شات، فتح مكتبة أدوية،
// استخدام برومبت جاهز، تشغيل صوت...إلخ). Upsert بسيط + عدّاد لكل موديل لو اتبعت.
app.post('/api/usage/track', verifyToken, async (req, res) => {
  try {
    if (req.user.type !== 'student') return res.json({ success: true, skipped: true });
    await connectToDatabase();
    const feature = String(req.body?.feature || '').trim().slice(0, 60);
    const model = req.body?.model ? String(req.body.model).trim().replace(/[.$]/g, '_').slice(0, 40) : null;
    if (!feature) return res.status(400).json({ error: 'feature مطلوب' });

    const studentCode = req.user.studentCode || req.user.id;
    const update = {
      $set: { username: req.user.username || '', fullName: req.user.fullName || '', lastUsedAt: new Date() },
      $inc: { totalCount: 1 }
    };
    if (model) update.$inc[`models.${model}`] = 1;

    await FeatureUsage.findOneAndUpdate(
      { studentCode, feature },
      update,
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ usage/track error:', error.message);
    res.status(500).json({ error: 'خطأ في تسجيل الاستخدام' });
  }
});

// ====================== لوحة المتابعة الشاملة (كل الطلاب دفعة واحدة) ======================
// إندبوينت واحد بيرجّع صف جاهز لكل طالب — بدل ما الأدمن يفتح كل حساب لوحده.
// بيجمع من: Student (الاشتراكات) + Presence (رسايل/أسئلة/آخر ظهور) + FeatureUsage
// (تفصيل كل ميزة/موديل) + EnglishProState/GermanProState (المستوى وعدد الكلمات).
// كل الاستعلامات بالجملة (find واحد لكل كوليكشن) مش لكل طالب لوحده — عشان الأداء
// يفضل كويس حتى مع عدد كبير من الطلاب.
app.get('/api/admin/dashboard/overview', verifyToken, isAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const EnglishProState = mongoose.models.EnglishProState || null;
    const GermanProState = mongoose.models.GermanProState || null;

    const [students, presenceDocs, usageDocs, englishDocs, germanDocs] = await Promise.all([
      Student.find({}).select('fullName studentCode username premiumFeatures createdAt lastLogin').lean(),
      Presence.find({}).lean(),
      FeatureUsage.find({}).lean(),
      EnglishProState
        ? EnglishProState.aggregate([{ $project: { studentCode: 1, level: 1, totalMessages: 1, updatedAt: 1, wordCount: { $size: { $ifNull: ['$vocabulary', []] } } } }])
        : [],
      GermanProState
        ? GermanProState.aggregate([{ $project: { studentCode: 1, level: 1, totalMessages: 1, updatedAt: 1, wordCount: { $size: { $ifNull: ['$vocabulary', []] } } } }])
        : []
    ]);

    const presenceByUsername = new Map(presenceDocs.map(p => [p.username, p]));
    const usageByStudent = new Map(); // studentCode -> { feature: doc }
    usageDocs.forEach(u => {
      if (!usageByStudent.has(u.studentCode)) usageByStudent.set(u.studentCode, {});
      usageByStudent.get(u.studentCode)[u.feature] = u;
    });
    const englishByCode = new Map(englishDocs.map(e => [e.studentCode, e]));
    const germanByCode = new Map(germanDocs.map(g => [g.studentCode, g]));

    const toPlainModels = (m) => {
      if (!m) return {};
      if (m instanceof Map) return Object.fromEntries(m);
      return m; // .lean()/aggregate بيرجعوا Map كـ plain object غالبًا أصلًا
    };

    const rows = students.map(s => {
      const presence = presenceByUsername.get(s.username) || null;
      const usage = usageByStudent.get(s.studentCode) || {};
      const eng = englishByCode.get(s.studentCode) || null;
      const ger = germanByCode.get(s.studentCode) || null;
      const mainChat = usage['main_chat'] || null;

      const featuresDetail = {};
      (s.premiumFeatures || []).forEach(key => {
        const u = usage[key];
        featuresDetail[key] = {
          usedCount: u ? u.totalCount : 0,
          lastUsedAt: u ? u.lastUsedAt : null
        };
      });

      return {
        studentCode: s.studentCode,
        username: s.username,
        fullName: s.fullName,
        lastLogin: s.lastLogin || null,
        premiumFeatures: s.premiumFeatures || [],
        featuresDetail,
        mainChat: {
          totalMessages: presence ? (presence.totalMessages || 0) : 0,
          totalQuestions: presence ? (presence.totalQuestions || 0) : 0,
          lastSeen: presence ? presence.lastSeen : null,
          models: mainChat ? toPlainModels(mainChat.models) : {}
        },
        englishPro: eng ? { level: eng.level, wordCount: eng.wordCount || 0, totalMessages: eng.totalMessages || 0, lastActivity: eng.updatedAt } : null,
        germanPro: ger ? { level: ger.level, wordCount: ger.wordCount || 0, totalMessages: ger.totalMessages || 0, lastActivity: ger.updatedAt } : null
      };
    });

    res.json({ success: true, count: rows.length, students: rows });
  } catch (error) {
    console.error('❌ dashboard/overview error:', error.message);
    res.status(500).json({ error: 'خطأ في تحميل لوحة المتابعة' });
  }
});

// ====================== مراقبة استهلاك/تكلفة الـ AI APIs (تقريبية شهريًا) ======================
// الهدف: الأدمن يعرف عدد الاستدعاءات الفعلية لكل مزود AI شهريًا + تقدير تقريبي
// للتكلفة بالدولار، عشان ميتفاجئش بفاتورة آخر الشهر (خصوصًا Gemini اللي بيتنادى
// من أكتر من مكان: الشات الرئيسي + English Pro + German Pro).
//
// بيتغذى من مصدرين:
// 1) api/_usageTrack.js في مشروع chatx (Vercel منفصل) — بينادي عبر HTTP على
//    /api/usage/api-cost/track بعد كل استدعاء فعلي لموديل (gemini, groq,
//    cerebras, claude-opus, mistral, sambanova, qwen, onehop, openrouter, zimage).
// 2) english-pro-routes.js و german-pro-routes.js — بيكتبوا على نفس الموديل
//    مباشرة (in-process، مفيش HTTP) لأنهم شغالين جوه نفس عملية Node دي.
//
// أرقام مهمة: بنسجّل عدد الاستدعاءات (دقيق 100%) + حجم الطلبات بالبايت (تقريب
// لعدد التوكنات: ~4 حروف للتوكن الواحد — تقريب معروف ومستخدم بكثرة، مش دقيق
// 100% لكنه كافي كإنذار مبكر). التكلفة النهائية بتتحسب وقت العرض في لوحة الأدمن
// من جدول أسعار API_PRICING تحت — مش وقت الكتابة، عشان لو الأسعار اتغيّرت تتحدّث
// كل الشهور القديمة تلقائيًا من غير أي migration.
const apiUsageSchema = new mongoose.Schema({
  provider: { type: String, required: true, index: true }, // gemini / cerebras / claude-opus / ...
  monthKey: { type: String, required: true, index: true }, // 'YYYY-MM'
  callCount: { type: Number, default: 0 },
  totalRequestBytes: { type: Number, default: 0 }
}, { timestamps: true });
apiUsageSchema.index({ provider: 1, monthKey: 1 }, { unique: true });
const ApiUsage = mongoose.models.ApiUsage || mongoose.model('ApiUsage', apiUsageSchema);

// ⚠️ جدول أسعار تقريبي — بالدولار لكل مليون توكن (input/output منفصلين، زي ما
// بينشرها كل مزود). الأسعار دي اتراجعت وقت كتابة الكود ده (أغسطس 2026) للمزودين
// اللي أسعارهم واضحة ومؤكدة بس. للمزودين اللي price: null — السعر مش مؤكد 100%
// (إما موديل مجاني فعليًا زي onehop/openrouter، أو محتاج مراجعة من موقع المزود
// الرسمي لأن التسعير بيتغيّر بسرعة) — اللوحة بتعرض "—" بدل ما تختلق رقم غلط.
// avgOutputTokens تقدير تقريبي جدًا لمتوسط طول الرد (بما إننا مش بنعدّ التوكنات
// الفعلية من الـ stream) — عدّله لو حسّيت إنه بعيد عن الواقع عندك.
const API_PRICING = {
  'gemini':              { label: 'Gemini 3.1 Flash-Lite (الشات الرئيسي)', inputPerM: 0.25, outputPerM: 1.50, avgOutputTokens: 500 },
  'gemini-pro-teacher':  { label: 'Gemini 3.6 Flash (English/German Pro)', inputPerM: 1.50, outputPerM: 7.50, avgOutputTokens: 700 },
  'cerebras':            { label: 'GPT-OSS-120B عبر Cerebras (premium_ai)', inputPerM: 0.35, outputPerM: 0.75, avgOutputTokens: 500 },
  'claude-opus':         { label: 'gpt-5.6-sol عبر OneHop (premium_ai)', inputPerM: null, outputPerM: null, avgOutputTokens: 500 },
  'groq':                { label: 'gpt-oss-20b عبر Groq', inputPerM: null, outputPerM: null, avgOutputTokens: 500 },
  'mistral':             { label: 'mistral-small-latest', inputPerM: null, outputPerM: null, avgOutputTokens: 500 },
  'sambanova':           { label: 'Llama-3.3-70B عبر SambaNova', inputPerM: null, outputPerM: null, avgOutputTokens: 500 },
  'qwen':                { label: 'qwen-plus', inputPerM: null, outputPerM: null, avgOutputTokens: 500 },
  'onehop':              { label: 'موديل مجاني عبر OneHop (:free)', inputPerM: 0, outputPerM: 0, avgOutputTokens: 500 },
  'openrouter':          { label: 'موديلات OpenRouter المجانية', inputPerM: 0, outputPerM: 0, avgOutputTokens: 500 },
  'zimage':              { label: 'تحليل صور (Qwen-VL تقريبًا)', inputPerM: null, outputPerM: null, avgOutputTokens: 300 }
};

// حماية بسيطة: مفتاح داخلي مشترك بين مشروع chatx (Vercel) وSchool X — مش توكن
// طالب/أدمن (أغلب ملفات api/*.js مفيش عندها توكن أصلاً)، بس بيمنع أي حد عشوائي
// من ضخ بيانات وهمية في الإحصائيات. لو الأدمن ماضبطهوش في Environment Variables،
// الـ endpoint بيقبل من غيره (أسهل للتجربة الأولى، أقل أمانًا — يُفضّل ضبطه).
const INTERNAL_METRICS_KEY = process.env.INTERNAL_METRICS_KEY || '';

app.post('/api/usage/api-cost/track', async (req, res) => {
  try {
    if (INTERNAL_METRICS_KEY && req.headers['x-internal-key'] !== INTERNAL_METRICS_KEY) {
      return res.status(403).json({ error: 'forbidden' });
    }
    await connectToDatabase();
    const provider = String(req.body?.provider || '').trim().slice(0, 40);
    if (!provider) return res.status(400).json({ error: 'provider مطلوب' });
    // سقف دفاعي (2 ميجا حرف) يمنع أي جسم طلب غير طبيعي من تضخيم رقم البايتات فجأة.
    const bytes = Math.max(0, Math.min(Number(req.body?.requestBytes) || 0, 2_000_000));
    const monthKey = new Date().toISOString().slice(0, 7);

    await ApiUsage.findOneAndUpdate(
      { provider, monthKey },
      { $inc: { callCount: 1, totalRequestBytes: bytes } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ usage/api-cost/track error:', error.message);
    res.status(500).json({ error: 'خطأ في تسجيل الاستهلاك' });
  }
});

// لوحة تكلفة الـ API — بترجع كل شهر مطلوب (افتراضيًا الشهر الحالي) مع تفصيل
// كل مزود على حدة + الإجمالي التقريبي (بس للمزودين اللي سعرهم مؤكد).
app.get('/api/admin/dashboard/api-costs', verifyToken, isAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const monthKey = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const docs = await ApiUsage.find({ monthKey }).lean();
    const docsByProvider = new Map(docs.map(d => [d.provider, d]));

    // بنعرض كل المزودين المعروفين حتى لو صفر نداءات الشهر ده — عشان الأدمن يشوف
    // الصورة كاملة مش بس اللي اتستخدم بالفعل.
    const rows = Object.keys(API_PRICING).map(provider => {
      const d = docsByProvider.get(provider);
      const pricing = API_PRICING[provider];
      const callCount = d ? d.callCount : 0;
      const estInputTokens = Math.round((d ? d.totalRequestBytes : 0) / 4); // ~4 حروف/توكن
      let estCostUsd = null;
      if (pricing.inputPerM != null && pricing.outputPerM != null) {
        const inputCost = (estInputTokens / 1_000_000) * pricing.inputPerM;
        const outputCost = ((callCount * pricing.avgOutputTokens) / 1_000_000) * pricing.outputPerM;
        estCostUsd = Number((inputCost + outputCost).toFixed(3));
      }
      return { provider, label: pricing.label, callCount, estInputTokens, estCostUsd, priceKnown: pricing.inputPerM != null };
    }).sort((a, b) => b.callCount - a.callCount);

    const totalCalls = rows.reduce((s, r) => s + r.callCount, 0);
    const totalKnownCostUsd = Number(rows.reduce((s, r) => s + (r.estCostUsd || 0), 0).toFixed(2));
    const hasUnknownPricing = rows.some(r => r.callCount > 0 && !r.priceKnown);

    res.json({ success: true, monthKey, rows, totalCalls, totalKnownCostUsd, hasUnknownPricing });
  } catch (error) {
    console.error('❌ dashboard/api-costs error:', error.message);
    res.status(500).json({ error: 'خطأ في تحميل بيانات التكلفة' });
  }
});

const ONLINE_WINDOW_MS = 90 * 1000; // "متصل" = بعت نبضة خلال آخر 90 ثانية

// الأسبوع يبدأ السبت
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}
function getPrevWeekStart() { const d = new Date(); d.setDate(d.getDate() - 7); return getWeekStart(d); }
function getTodayKey() { return new Date().toISOString().split('T')[0]; }

// Regex مرن: أ/إ/آ = ا ، ة = ه ، ي = ى + تجاهل حالة الأحرف
function buildArabicFlexRegex(query) {
  const cleaned = String(query)
    .replace(/[\u064B-\u0652\u0640]/g, '') // تشكيل + تطويل
    .replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withVariants = escaped
    .replace(/[أإآا]/g, '[أإآا]')
    .replace(/[ةه]/g, '[ةه]')
    .replace(/[يى]/g, '[يى]');
  return new RegExp(withVariants.split(' ').filter(Boolean).join('[\\s\\-_.,]+'), 'i');
}

// ====================== لوحة "الحسابات المرتبطة" — صفحة أدمن منفصلة ======================
// بترجع كل الطلاب اللي عندهم حساب، مدموجين ببيانات الحضور بتاعتهم (آخر ظهور، متصل
// دلوقتي ولا لأ، عدد الأسئلة الإجمالي)، وحالة الإيقاف المؤقت لو موجودة. endpoint منفصل
// عن /api/admin/students القديم (اللي لسه شغال زي ما هو لصفحة admin-premium.html)
// عشان محدش من الاتنين يتأثر بالتاني.
app.get('/api/admin/students-overview', verifyToken, isAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const [students, presences] = await Promise.all([
      Student.find().select('-password -refreshToken').lean(),
      Presence.find({ userType: 'student' })
        .select('username lastSeen totalQuestions totalMessages questionsToday messagesToday')
        .lean()
    ]);
    const presenceMap = new Map(presences.map(p => [p.username, p]));
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
    const now = new Date();

    const result = students.map(s => {
      const p = presenceMap.get(s.username) || null;
      const lastSeen = p?.lastSeen || null;
      const suspended = !!(s.suspendedUntil && new Date(s.suspendedUntil) > now);
      return {
        studentCode: s.studentCode,
        username: s.username,
        fullName: s.fullName,
        grade: s.grade,
        premiumFeatures: s.premiumFeatures || [],
        suspended,
        suspendedUntil: s.suspendedUntil || null,
        suspendedReason: s.suspendedReason || '',
        lastSeen,
        online: !!(lastSeen && lastSeen >= onlineSince),
        totalQuestions: p?.totalQuestions || 0,
        totalMessages: p?.totalMessages || 0
      };
    });

    res.json({ success: true, students: result });
  } catch (error) {
    console.error('❌ students-overview error:', error.message);
    res.status(500).json({ error: 'خطأ في جلب بيانات الحسابات: ' });
  }
});

// ====================== إيقاف / إرجاع حساب طالب ======================
// body: { suspendedUntil: <ISO date string> } لإيقافه لحد التاريخ ده، أو
// body: { suspendedUntil: null } لإرجاعه فورًا (إلغاء الإيقاف قبل معاده).
app.patch('/api/admin/students/:studentCode/suspend', verifyToken, isAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const { suspendedUntil, suspendedReason } = req.body;
    let until = null;
    if (suspendedUntil) {
      until = new Date(suspendedUntil);
      if (isNaN(until.getTime())) return res.status(400).json({ error: 'تاريخ غير صالح' });
    }
    const updateData = { suspendedUntil: until };
    if (suspendedReason !== undefined) updateData.suspendedReason = String(suspendedReason || '').slice(0, 200);
    if (!until) updateData.suspendedReason = ''; // إرجاع الحساب بيمسح السبب القديم كمان
    const updated = await Student.findOneAndUpdate(
      { studentCode: req.params.studentCode },
      { $set: updateData },
      { new: true }
    ).select('username fullName studentCode suspendedUntil suspendedReason');
    if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
    res.json({ success: true, student: updated });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في تحديث حالة الإيقاف: ' });
  }
});

// ---------- 1) نبضة الحضور: المتصفح بيبعتها كل 30 ثانية ----------
app.post('/api/presence/heartbeat', verifyToken, async (req, res) => {
  try {
    await connectToDatabase();
    const username = req.user.username;
    const fullName = req.body.fullName || req.user.fullName || username;
    const incMessages  = Math.min(Math.max(Number(req.body.messages)  || 0, 0), 50);
    const incQuestions = Math.min(Math.max(Number(req.body.questions) || 0, 0), 50);
    const incSeconds   = Math.min(Math.max(Number(req.body.seconds)   || 30, 0), 120);
    const today = getTodayKey();

    let p = await Presence.findOne({ username });
    if (!p) p = new Presence({ username, fullName });
    if (p.dayKey !== today) { // تصفير عدادات اليوم
      p.dayKey = today;
      p.questionsToday = 0; p.messagesToday = 0; p.timeTodaySeconds = 0;
    }
    p.fullName = fullName;
    p.userType = req.user.type || 'student';
    p.lastSeen = new Date();
    p.questionsToday += incQuestions;
    p.messagesToday += incMessages;
    p.timeTodaySeconds += incSeconds;
    p.totalQuestions = (p.totalQuestions || 0) + incQuestions;
    p.totalMessages = (p.totalMessages || 0) + incMessages;
    await p.save();

    // إحصائيات الأسبوع (دي اللي بتبني لوحة الصدارة)
    await WeeklyStats.findOneAndUpdate(
      { username, weekStart: getWeekStart() },
      {
        $inc: { messagesCount: incMessages, questionsCount: incQuestions, timeSpentSeconds: incSeconds },
        $set: { fullName, lastActive: new Date() }
      },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(e => { if (e.code !== 11000) throw e; });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ heartbeat error:', error.message);
    res.status(500).json({ error: 'خطأ في تسجيل الحضور' });
  }
});

// ---------- 2) لوحة الصدارة الحية ----------
app.get('/api/leaderboard/live', verifyToken, async (req, res) => {
  try {
    await connectToDatabase();
    const weekStart = getWeekStart();
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

    const [online, weeklyTop, myWeek] = await Promise.all([
      Presence.find({ lastSeen: { $gte: onlineSince } })
        .select('username fullName lastSeen questionsToday messagesToday timeTodaySeconds')
        .sort({ lastSeen: -1 }).limit(50).lean(),
      WeeklyStats.find({ weekStart })
        .sort({ timeSpentSeconds: -1, questionsCount: -1, messagesCount: -1 })
        .limit(10).lean(),
      WeeklyStats.findOne({ username: req.user.username, weekStart }).lean()
    ]);

    let myRank = 0;
    if (myWeek) {
      myRank = 1 + await WeeklyStats.countDocuments({
        weekStart,
        $or: [
          { timeSpentSeconds: { $gt: myWeek.timeSpentSeconds || 0 } },
          { timeSpentSeconds: myWeek.timeSpentSeconds || 0, questionsCount: { $gt: myWeek.questionsCount || 0 } },
          { timeSpentSeconds: myWeek.timeSpentSeconds || 0, questionsCount: myWeek.questionsCount || 0, messagesCount: { $gt: myWeek.messagesCount || 0 } }
        ]
      });
    }

    res.json({ success: true, weekStart, online, weeklyTop, me: { username: req.user.username, rank: myRank, stats: myWeek } });
  } catch (error) {
    console.error('❌ leaderboard error:', error.message);
    res.status(500).json({ error: 'خطأ في جلب لوحة الصدارة' });
  }
});

// ---------- 3) مزايا بطل الأسبوع ----------
const CHAMPION_REWARDS = [
  { id: 'double_xp',      icon: '💎', name: 'مضاعفة XP ×2',                  desc: 'كل نقاط XP اللي بتكسبها بتتضاعف لمدة أسبوع' },
  { id: 'all_ai_models',  icon: '🧠', name: 'فتح كل نماذج الذكاء الاصطناعي', desc: 'النماذج الإضافية/المدفوعة في الشات بقت مفتوحة ليك' },
  { id: 'unlimited_quiz', icon: '📝', name: 'اختبارات بلا حدود',              desc: 'عدد أسئلة غير محدود في اختبارات بنك الأسئلة' },
  { id: 'champion_badge', icon: '👑', name: 'شارة بطل الأسبوع',               desc: 'تاج ذهبي جنب اسمك في الشات وغرف المذاكرة' },
  { id: 'priority_rooms', icon: '⚡', name: 'أولوية غرف المذاكرة',            desc: 'بتدخل أي غرفة مذاكرة فوراً حتى لو مليانة' },
  { id: 'custom_theme',   icon: '🎨', name: 'ثيم البطل الحصري',               desc: 'مظهر ذهبي خاص بالشات بتاعك' },
  { id: 'pdf_pro',        icon: '📄', name: 'تحليل ملفات Pro',                desc: 'رفع ملفات أكبر وتحليل أدق للملازم' },
  { id: 'smart_summary',  icon: '✨', name: 'تلخيص ذكي محسّن',                desc: 'تلخيصات أطول وأشمل للمحاضرات' }
];

app.get('/api/leaderboard/rewards', verifyToken, async (req, res) => {
  try {
    await connectToDatabase();
    const username = req.user.username;
    const sort = { timeSpentSeconds: -1, questionsCount: -1, messagesCount: -1 };
    const [prevChamp, curTop] = await Promise.all([
      WeeklyStats.findOne({ weekStart: getPrevWeekStart() }).sort(sort).lean(),
      WeeklyStats.findOne({ weekStart: getWeekStart() }).sort(sort).lean()
    ]);
    const hasActivity = s => s && ((s.timeSpentSeconds || 0) > 0 || (s.messagesCount || 0) > 0);
    const isPrevChampion = hasActivity(prevChamp) && prevChamp.username === username; // مزاياه سارية الأسبوع ده كله
    const isLiveLeader   = hasActivity(curTop) && curTop.username === username;       // متصدر لحظي

    res.json({
      success: true,
      isChampion: isPrevChampion || isLiveLeader,
      isPrevChampion, isLiveLeader,
      rewards: CHAMPION_REWARDS,
      message: isPrevChampion ? '👑 أنت بطل الأسبوع الماضي — كل المزايا مفتوحة ليك الأسبوع ده كله!'
             : isLiveLeader   ? '🔥 أنت المتصدر دلوقتي — ثبّت مركزك لحد نهاية الأسبوع والمزايا هتفضل مفتوحة'
             : '🏁 اتصدر الترتيب لنهاية الأسبوع عشان تفتح كل المزايا دي'
    });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب المزايا' });
  }
});

// ---------- 4) البحث عن الأصدقاء (إصلاح بحث المذاكرة الجماعية) ----------
app.get('/api/rooms/search-friends', verifyToken, async (req, res) => {
  try {
    await connectToDatabase();
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, results: [] });

    const flexRegex = buildArabicFlexRegex(q);
    if (!flexRegex) return res.json({ success: true, results: [] });

    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
    const studentFilter = /^\d+$/.test(q)
      ? { $or: [{ fullName: flexRegex }, { username: flexRegex }, { studentCode: q }] }
      : { $or: [{ fullName: flexRegex }, { username: flexRegex }] };

    const [presenceMatches, studentMatches, onlineUsers] = await Promise.all([
      // userType: 'student' مضافة عشان الأدمن ميظهرش في نتايج بحث زملاء المذاكرة —
      // كان بيظهر (لأن الأدمن كمان بيبعت heartbeat وبيتسجل في Presence)، وبعدين
      // إنشاء المحادثة كان بيفشل لأن /api/group-chats بيدور بس في Student collection.
      Presence.find({ userType: 'student', $or: [{ fullName: flexRegex }, { username: flexRegex }] })
        .select('username fullName lastSeen').limit(30).lean(),
      Student.find(studentFilter).select('username fullName').limit(30).lean().catch(() => []),
      Presence.find({ lastSeen: { $gte: onlineSince } }).select('username').lean()
    ]);

    const onlineSet = new Set(onlineUsers.map(u => u.username));
    const merged = new Map();
    [...presenceMatches, ...studentMatches].forEach(u => {
      if (!u.username || u.username === req.user.username || merged.has(u.username)) return;
      merged.set(u.username, {
        username: u.username,
        fullName: u.fullName || u.username,
        online: onlineSet.has(u.username)
      });
    });

    // المتصلين يظهروا الأول
    const results = [...merged.values()].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)).slice(0, 20);
    res.json({ success: true, results, onlineCount: onlineSet.size });
  } catch (error) {
    console.error('❌ search friends error:', error.message);
    res.status(500).json({ success: false, error: 'خطأ في البحث' });
  }
});

// ==========================================================================
// غرف المذاكرة الجماعية — ناقصة من نظام الحضور/الصدارة اللي فوق (ده بيدور
// على الأصدقاء بس، مش بيفتح غرفة شات فعلية بينهم). لازم تفضل الكتلة دي
// بعد كتلة "إضافات Chat X" وقبل app.get('*', ...) تحت.
// ==========================================================================
const groupChatSchema = new mongoose.Schema({
    memberUsernames: { type: [String], required: true, index: true },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    // آخر وقت كل عضو فتح فيه الغرفة وقرا الرسائل — ده أساس الـ read receipts:
    // رسالة "مني" بتتحسب "اتقرت" لو تاريخها قبل lastReadBy بتاع الطرف التاني.
    lastReadBy: { type: Map, of: Date, default: {} },
    // آخر وقت كل عضو "بيكتب" فيه — بنعتبره لسه بيكتب لحد 5 ثواني من آخر إشارة
    // وصلت، وبعدين المؤشر بيختفي لوحده حتى لو قفل التاب فجأة من غير ما يبعت شيء.
    typingUntil: { type: Map, of: Date, default: {} },
    // نظام "طلب المحادثة": أول ما حد يبدأ يكلم زميل جديد لأول مرة، الغرفة بتتعمل
    // بحالة 'pending' ولازم الطرف التاني (المُستقبِل، مش اللي بدأ الطلب) يوافق
    // عليها قبل ما يقدر يبعت أي رسالة. الديفولت هنا 'accepted' مقصود عشان الغرف
    // القديمة (اللي كانت موجودة قبل الميزة دي) تفضل شغالة زي ما هي من غير ما
    // تتقفل فجأة — حالة 'pending' بتتحدد صراحةً بس وقت إنشاء غرفة جديدة فعلاً.
    status: { type: String, enum: ['pending', 'accepted'], default: 'accepted' },
    requestedBy: { type: String, default: '' }
}, { timestamps: true });
const GroupChat = mongoose.models.GroupChat || mongoose.model('GroupChat', groupChatSchema);

// سيناريوهات "الفيديو المتفرّع" اللي الطلاب/الأدمن بيضيفوها بنفسهم أو بيولّدها الذكاء
// الاصطناعي — بتتخزن هنا عشان تفضل موجودة لكل الطلاب، مش بس على جهاز اللي عملها.
// "nodes" شكلها حر (Mixed) لأنها شجرة قرارات متغيّرة الشكل حسب كل حالة.
const customScenarioSchema = new mongoose.Schema({
    scenarioId: { type: String, required: true, unique: true },
    icon: { type: String, default: '🩺' },
    title: { type: String, required: true, maxlength: 120 },
    specialty: { type: String, default: 'عام', maxlength: 60 },
    difficulty: { type: String, default: 'متوسط', maxlength: 30 },
    startNode: { type: String, required: true },
    nodes: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: true },
    source: { type: String, enum: ['custom', 'ai_random', 'question_bank'], default: 'custom' }
}, { timestamps: true });
const CustomScenario = mongoose.models.CustomScenario || mongoose.model('CustomScenario', customScenarioSchema);

app.get('/api/scenarios', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const scenarios = await CustomScenario.find().sort({ createdAt: -1 }).limit(200).lean();
        res.json({
            scenarios: scenarios.map(s => ({
                id: s.scenarioId, icon: s.icon, title: s.title, specialty: s.specialty,
                difficulty: s.difficulty, startNode: s.startNode, nodes: s.nodes,
                createdBy: s.createdBy, custom: true
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحميل الحالات' });
    }
});

app.post('/api/scenarios', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { id, icon, title, specialty, difficulty, startNode, nodes, source } = req.body;
        if (!title || !startNode || !nodes || typeof nodes !== 'object' || !nodes[startNode]) {
            return res.status(400).json({ error: 'شكل الحالة ناقص أجزاء أساسية' });
        }
        const me = req.user.username;
        if (!me) return res.status(403).json({ error: 'غير مصرح' });

        const scenarioId = (id && String(id).slice(0, 60)) || `custom_${Date.now()}`;
        const doc = await CustomScenario.findOneAndUpdate(
            { scenarioId },
            {
                scenarioId, icon: icon || '🩺', title: String(title).slice(0, 120),
                specialty: specialty || 'عام', difficulty: difficulty || 'متوسط',
                startNode, nodes, createdBy: me, source: source || 'custom'
            },
            { upsert: true, new: true }
        );
        res.json({ success: true, scenarioId: doc.scenarioId });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ الحالة' });
    }
});

const groupChatMessageSchema = new mongoose.Schema({
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupChat', required: true, index: true },
    senderUsername: { type: String, required: true },
    // مش required دلوقتي — الرسالة ممكن تكون صورة أو تسجيل صوتي بس من غير نص خالص
    // (زي ما بيحصل في واتساب بالظبط)، الفاليديشن الحقيقية (لازم حاجة واحدة على الأقل)
    // بتحصل في الـ endpoint مش هنا.
    text: { type: String, default: '', maxlength: 2000 },
    // حد أقصى ~8 مليون حرف base64 (تقريبًا 6 ميجا صورة فعلية بعد فك التشفير) — كافي
    // جدًا لصورة مضغوطة (compressImageFile بتضغط لأقل من ميجا غالبًا) وحماية من إساءة الاستخدام.
    image: {
        base64: { type: String, maxlength: 8_000_000 },
        mimeType: { type: String, maxlength: 60 },
        name: { type: String, maxlength: 200 }
    },
    // برضه سقف ~8 مليون حرف — كافي لتسجيل صوتي webm/opus لحد 3 دقايق (الحد الأقصى
    // اللي بنفرضه من الفرونت إند) بهامش أمان كبير.
    audio: {
        base64: { type: String, maxlength: 8_000_000 },
        mimeType: { type: String, maxlength: 60 },
        durationSeconds: { type: Number, min: 0, max: 600 }
    },
    // ردود الإيموجي على الرسالة — Map من اليوزرنيم لاسم الإيموجي، عشان كل عضو
    // يقدر يحط رد واحد بس على كل رسالة (لو حط تاني بيستبدل الأول تلقائي).
    reactions: { type: Map, of: String, default: {} },
    // حذف رسالة مفردة (مختلف عن مسح كل الشات اللي تحت) — بنعلّم الرسالة كمحذوفة
    // بدل ما نشيلها فعلاً من غير أثر، عشان الطرف التاني يشوف "تم حذف الرسالة
    // بواسطة فلان" بدل ما تختفي بشكل غامض، بالظبط زي واتساب. اسم اللي حذفها
    // بنخزّنه وقت الحذف نفسه عشان يفضل ثابت حتى لو غيّر اسمه بعدين.
    deleted: { type: Boolean, default: false },
    deletedByName: { type: String, default: '' }
}, { timestamps: true });
const GroupChatMessage = mongoose.models.GroupChatMessage || mongoose.model('GroupChatMessage', groupChatMessageSchema);

app.post('/api/group-chats', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { memberUsername } = req.body;
        if (!memberUsername) return res.status(400).json({ error: 'اسم الزميل مطلوب' });
        const me = await Student.findById(req.user.id).select('username');
        if (!me) return res.status(404).json({ error: 'المستخدم غير موجود' });
        if (memberUsername === me.username) return res.status(400).json({ error: 'مينفعش تبدأ مذاكرة مع نفسك' });
        const other = await Student.findOne({ username: memberUsername }).select('username');
        if (!other) return res.status(404).json({ error: 'الزميل ده مش موجود' });
        const pair = [me.username, other.username].sort();
        let chat = await GroupChat.findOne({ memberUsernames: { $all: pair, $size: 2 } });
        if (!chat) {
            // أول مرة الاتنين دول بيتكلموا سوا — بننشئ "طلب محادثة" لازم الطرف
            // التاني (المُستقبِل) يوافق عليه قبل ما يقدر يرد. اللي بدأ الطلب
            // (requestedBy) يقدر يبعت رسايل عادي وهو مستني الموافقة.
            chat = await new GroupChat({ memberUsernames: pair, status: 'pending', requestedBy: me.username }).save();
        } else if (chat.status === 'pending' && chat.requestedBy && chat.requestedBy !== me.username) {
            // أنا مش اللي بدأ الطلب، وبعتّ نفس النداء عشان أفتح المحادثة دي —
            // يبقى ده معناه إني موافق على الكلام مع الطرف ده، فنقبل الطلب تلقائيًا.
            chat.status = 'accepted';
            await chat.save();
        }
        res.json({ chatId: chat._id, memberUsernames: chat.memberUsernames, status: chat.status || 'accepted', requestedBy: chat.requestedBy || null });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنشاء غرفة المذاكرة' });
    }
});

// قبول طلب محادثة — بس الطرف اللي *مستقبِل* الطلب (مش اللي بدأه) هو اللي
// يقدر يقبل. بعد القبول، الاتنين يقدروا يبعتوا رسايل عادي زي أي غرفة تانية.
app.post('/api/group-chats/:id/accept', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        if ((chat.status || 'accepted') !== 'pending') {
            return res.json({ success: true, status: chat.status || 'accepted' });
        }
        if (chat.requestedBy === me.username) {
            return res.status(400).json({ error: 'انت اللي بدأت الطلب، لازم تستنى الطرف التاني يقبله' });
        }
        chat.status = 'accepted';
        await chat.save();
        res.json({ success: true, status: 'accepted' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في قبول طلب المحادثة' });
    }
});

// رفض طلب محادثة — بيمسح الغرفة والرسايل خالص، عشان اللي رفض متضلش شايف
// محادثة مع حد رفض يتكلم معاه. لو حابب يبعتله تاني، يقدر يبدأ طلب جديد من الأول.
app.post('/api/group-chats/:id/decline', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        if ((chat.status || 'accepted') !== 'pending') {
            return res.status(400).json({ error: 'الطلب ده مقبول أصلاً' });
        }
        if (chat.requestedBy === me.username) {
            return res.status(400).json({ error: 'انت اللي بدأت الطلب، لازم تستنى الطرف التاني يرد' });
        }
        await GroupChatMessage.deleteMany({ chatId: chat._id });
        await GroupChat.deleteOne({ _id: chat._id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في رفض طلب المحادثة' });
    }
});

app.get('/api/group-chats', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        if (!me) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const chats = await GroupChat.find({ memberUsernames: me.username })
            .sort({ lastMessageAt: -1 }).limit(50).lean();
        res.json({ chats: chats.map(c => ({ id: c._id, memberUsernames: c.memberUsernames, lastMessage: c.lastMessage, status: c.status || 'accepted', requestedBy: c.requestedBy || null })) });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب غرف المذاكرة' });
    }
});

app.get('/api/group-chats/:id/messages', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        const since = Number(req.query.since || 0);
        const query = { chatId: chat._id };
        if (since) query.createdAt = { $gt: new Date(since) };
        const messages = await GroupChatMessage.find(query).sort({ createdAt: 1 }).limit(200).lean();
        // نسجّل إن أنا فتحت الغرفة دلوقتي — ده اللي بيخلي الطرف التاني يشوف علامة "اتقرت"
        // على رسائله اللي بعتها قبل الوقت ده.
        chat.lastReadBy.set(me.username, new Date());
        await chat.save();
        // حالة "متصل الآن" لباقي أعضاء الغرفة — بنفس معيار onlineSince المستخدم في باقي الأماكن
        // (بعت نبضة heartbeat خلال آخر 90 ثانية).
        const otherMembers = chat.memberUsernames.filter(u => u !== me.username);
        const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
        const onlinePresences = await Presence.find({ username: { $in: otherMembers }, lastSeen: { $gte: onlineSince } }).select('username').lean();
        const onlineUsernames = onlinePresences.map(p => p.username);
        res.json({
            messages: messages.map(m => {
                // رسالة محذوفة — منرجّعش أي محتوى فعلي، بس علامة الحذف واسم اللي حذفها
                // عشان الفرونت إند يعرض "تم حذف الرسالة بواسطة فلان" مكان الفقاعة.
                if (m.deleted) {
                    return {
                        id: String(m._id),
                        senderUsername: m.senderUsername,
                        deleted: true,
                        deletedByName: m.deletedByName || m.senderUsername,
                        createdAt: new Date(m.createdAt).getTime()
                    };
                }
                return {
                    id: String(m._id),
                    senderUsername: m.senderUsername,
                    text: m.text,
                    image: m.image && m.image.base64 ? { base64: m.image.base64, mimeType: m.image.mimeType, name: m.image.name } : null,
                    audio: m.audio && m.audio.base64 ? { base64: m.audio.base64, mimeType: m.audio.mimeType, durationSeconds: m.audio.durationSeconds } : null,
                    createdAt: new Date(m.createdAt).getTime(),
                    reactions: m.reactions ? Object.fromEntries(m.reactions instanceof Map ? m.reactions : Object.entries(m.reactions)) : {}
                };
            }),
            lastReadBy: Object.fromEntries(
                [...chat.lastReadBy.entries()].map(([u, d]) => [u, new Date(d).getTime()])
            ),
            // بنرجّع بس أسماء اللي "بيكتبوا دلوقتي" (يعني typingUntil بتاعهم لسه في المستقبل)،
            // وبنستبعد نفسي عشان الفرونت إند ميحسبنيش إني بيكتب لنفسي.
            typingUsernames: [...chat.typingUntil.entries()]
                .filter(([u, until]) => u !== me.username && new Date(until).getTime() > Date.now())
                .map(([u]) => u),
            onlineUsernames,
            // حالة طلب المحادثة — الفرونت إند بيستخدمها عشان يعرض بانر "قبول/رفض"
            // للمُستقبِل ويمنعه من الكتابة لحد ما يقبل.
            chatStatus: chat.status || 'accepted',
            requestedBy: chat.requestedBy || null
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الرسائل' });
    }
});

app.post('/api/group-chats/:id/typing', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        // تحديث مباشر في قاعدة البيانات (findByIdAndUpdate) بدل تحميل المستند كامل وحفظه —
        // ده endpoint بيتنادى كتير أثناء الكتابة، فبنخليه أخف وأسرع ما يمكن.
        const chat = await GroupChat.findById(req.params.id).select('memberUsernames');
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        await GroupChat.updateOne(
            { _id: chat._id },
            { $set: { [`typingUntil.${me.username}`]: new Date(Date.now() + 5000) } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث حالة الكتابة' });
    }
});

app.post('/api/group-chats/:id/messages', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { text, image, audio } = req.body;
        const trimmed = (text || '').trim().slice(0, 2000);

        // فاليديشن الصورة/الصوت: لازم base64 فعلي موجود (مش بس المفتاح موجود بقيمة فاضية)،
        // وسقف دفاعي يمنع أي جسم طلب ضخم بشكل غير طبيعي (حتى لو الفرونت إند بيضغط الصورة
        // ويحدد مدة التسجيل، السيرفر لازم يتحقق بنفسه مش يثق في الفرونت إند بس).
        const hasImage = image && typeof image.base64 === 'string' && image.base64.length > 0;
        const hasAudio = audio && typeof audio.base64 === 'string' && audio.base64.length > 0;
        // 🔍 لوج تشخيصي مؤقت — بيوضح هل الميديا وصلت للسيرفر كاملة قبل أي حفظ.
        // شيله بعد ما تتأكد من السبب وتحل المشكلة.
        console.log('📩 group-chat media check:', {
            hasImage, hasAudio,
            imgLen: image?.base64?.length || 0,
            audioLen: audio?.base64?.length || 0,
            contentLengthHeader: req.headers['content-length']
        });
        if (hasImage && image.base64.length > 8_000_000) return res.status(413).json({ error: 'الصورة كبيرة جدًا' });
        if (hasAudio && audio.base64.length > 8_000_000) return res.status(413).json({ error: 'التسجيل الصوتي كبير جدًا' });

        if (!trimmed && !hasImage && !hasAudio) return res.status(400).json({ error: 'الرسالة فاضية' });

        const me = await Student.findById(req.user.id).select('username fullName');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        // لازم المُستقبِل يقبل طلب المحادثة الأول قبل ما يقدر يبعت أي رسالة —
        // اللي بدأ الطلب (requestedBy) نفسه مسموح له يبعت وهو مستني الموافقة.
        if ((chat.status || 'accepted') === 'pending' && chat.requestedBy && chat.requestedBy !== me.username) {
            return res.status(403).json({ error: 'لازم تقبل طلب المحادثة الأول قبل ما تقدر تبعت رسايل', needsAccept: true });
        }

        const msgDoc = { chatId: chat._id, senderUsername: me.username, text: trimmed };
        if (hasImage) msgDoc.image = { base64: image.base64, mimeType: String(image.mimeType || 'image/jpeg').slice(0, 60), name: String(image.name || '').slice(0, 200) };
        if (hasAudio) msgDoc.audio = { base64: audio.base64, mimeType: String(audio.mimeType || 'audio/webm').slice(0, 60), durationSeconds: Math.min(600, Math.max(0, Number(audio.durationSeconds) || 0)) };
        const msg = await new GroupChatMessage(msgDoc).save();
        // 🔍 تأكيد إن اللي اتحفظ فعلاً فيه الميديا (مش بس اللي وصل في req.body)
        console.log('✅ saved message:', { id: String(msg._id), savedImgLen: msg.image?.base64?.length || 0, savedAudioLen: msg.audio?.base64?.length || 0 });

        // نص المعاينة في قايمة الغرف + الإشعار — لو مفيش نص فعلي بنستخدم وصف مناسب
        // للنوع (صورة/رسالة صوتية) بدل ما نسيبه فاضي.
        const previewText = trimmed || (hasImage ? '📷 صورة' : hasAudio ? '🎤 رسالة صوتية' : '');
        chat.lastMessage = previewText;
        chat.lastMessageAt = new Date();
        await chat.save();
        // نبعت push notification لباقي أعضاء الغرفة (مش للمرسل نفسه)، من غير ما نستنى
        // النتيجة عشان الرد على المرسل ميتأخرش لو الإرسال بطيء أو فشل لأي سبب.
        const senderDisplayName = me.fullName || me.username;
        const otherMembers = chat.memberUsernames.filter(u => u !== me.username);
        Promise.all(otherMembers.map(u => sendPushToUser(u, {
            title: `رسالة جديدة من ${senderDisplayName}`,
            body: previewText.length > 80 ? previewText.slice(0, 80) + '…' : previewText,
            data: { type: 'message', chatId: String(chat._id), senderUsername: me.username, senderName: senderDisplayName }
        }))).catch(() => {});
        res.json({ success: true, messageId: msg._id, createdAt: new Date(msg.createdAt).getTime() });
    } catch (error) {
        console.error('❌ فشل إرسال رسالة الغرفة:', error.message, error.stack);
        res.status(500).json({ error: 'خطأ في إرسال الرسالة' });
    }
});

// إضافة/تبديل/إزالة رد إيموجي على رسالة — كل عضو ليه رد واحد بس على كل رسالة.
// نفس الإيموجي مرتين = إزالته (toggle)، إيموجي مختلف = استبدال ردّه القديم.
app.post('/api/group-chats/:id/messages/:messageId/react', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { emoji } = req.body;
        if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
            return res.status(400).json({ error: 'إيموجي غير صالح' });
        }
        const me = await Student.findById(req.user.id).select('username fullName');
        const chat = await GroupChat.findById(req.params.id).select('memberUsernames');
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        const msg = await GroupChatMessage.findOne({ _id: req.params.messageId, chatId: chat._id });
        if (!msg) return res.status(404).json({ error: 'الرسالة مش موجودة' });

        const current = msg.reactions.get(me.username);
        const isRemoval = current === emoji;
        if (isRemoval) {
            msg.reactions.delete(me.username); // نفس الإيموجي تاني = إزالة
        } else {
            msg.reactions.set(me.username, emoji);
        }
        await msg.save();

        // إشعار زي واتساب: نبعت لصاحب الرسالة الأصلية بس (مش لأي حد تاني في الغرفة)، وبس
        // لما يكون حد تاني هو اللي عمل الريأكشن (مش هو نفسه)، وبس لما يكون إضافة/تغيير —
        // إزالة الريأكشن مبتستاهلش إشعار، زي واتساب بالظبط.
        if (!isRemoval && msg.senderUsername !== me.username) {
            const reactorName = me.fullName || me.username;
            sendPushToUser(msg.senderUsername, {
                title: `${reactorName} عمل ريأكشن ${emoji} على رسالتك`,
                body: msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text,
                data: { type: 'reaction', chatId: String(chat._id), senderUsername: me.username, senderName: reactorName, emoji }
            }).catch(() => {});
        }

        res.json({ success: true, reactions: Object.fromEntries(msg.reactions) });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الرد' });
    }
});

// حذف رسالة واحدة بس (مش كل الشات) — العضو يقدر يحذف رسايله هو بس اللي بعتها،
// مش رسايل الطرف التاني خالص. الرسالة مش بتختفي بشكل غامض — بنعلّمها كمحذوفة
// وبنمسح محتواها الفعلي من قاعدة البيانات (مش بس بنخفيه في العرض)، عشان الطرف
// التاني يشوف "تم حذف الرسالة بواسطة فلان" مكانها، بالظبط زي واتساب.
app.delete('/api/group-chats/:id/messages/:messageId', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username fullName');
        const chat = await GroupChat.findById(req.params.id).select('memberUsernames');
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        const msg = await GroupChatMessage.findOne({ _id: req.params.messageId, chatId: chat._id });
        if (!msg) return res.status(404).json({ error: 'الرسالة مش موجودة' });
        if (msg.senderUsername !== me.username) {
            return res.status(403).json({ error: 'تقدر تحذف رسايلك انت بس' });
        }
        msg.deleted = true;
        msg.deletedByName = me.fullName || me.username;
        msg.text = '';
        msg.image = undefined;
        msg.audio = undefined;
        await msg.save();
        res.json({ success: true, messageId: String(msg._id), deletedByName: msg.deletedByName });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الرسالة' });
    }
});

// مسح كل رسايل الغرفة (مش الغرفة نفسها) — أي عضو من الاتنين يقدر يعمل كده،
// بيأثر على الطرفين لأنها محادثة واحدة مشتركة، مش نسخة شخصية لكل طرف.
app.delete('/api/group-chats/:id/messages', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        await GroupChatMessage.deleteMany({ chatId: chat._id });
        chat.lastMessage = '';
        chat.typingUntil = new Map();
        await chat.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في مسح الشات' });
    }
});

// ====================== مسار افتراضي ======================
app.get('*', (req, res) => {
    res.json({ 
        message: 'معهد رعاية الضبعية - API', 
        status: 'running', 
        version: '3.0.0', 
        endpoints: ['/api/test', '/api/login', '/api/attendance', '/api/exams', '/api/notifications', '/api/violations', '/api/gemini', '/api/captcha', '/api/files'] 
    });
});


// ====================== تصدير لـ Vercel ======================
module.exports = app;
