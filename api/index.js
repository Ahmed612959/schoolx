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
    // دومينات إضافية (زي مشروع chatx) بتتحط كـ Environment Variable
    // EXTRA_ALLOWED_ORIGINS = "https://chatx-xxxx.vercel.app,https://another.com"
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
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

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
    }
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

// دالة رفع ملف إلى R2 من Buffer (نفس الاسم والشكل القديم عشان باقي الكود
// اللي بينادي عليها متتغيرش)
const uploadToCloudinary = async (buffer, folder, fileName) => {
    const safeFolder = folder ? folder.split('/').map(sanitizeForStorage).join('/') : '';
    const safeName = `${Date.now()}-${sanitizeForStorage(fileName)}`;
    const path = safeFolder ? `${safeFolder}/${safeName}` : safeName;

    await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: path,
        Body: buffer
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
        throw new Error('خطأ في حفظ معلومات الملف: ' + error.message);
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
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
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
    refreshToken: String
}, { timestamps: true });

const studentSchema = new mongoose.Schema({
    fullName: String,
    studentCode: { type: String, required: true, unique: true },
    username: { type: String, unique: true },
    password: String,
    grade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    semester: String,
    subjects: Array, // legacy field - لم يعد يُستخدم، تم استبداله بـ subjectsFirst/subjectsSecond
    subjectsFirst: { type: Array, default: [] },  // درجات الترم الأول (النظام الحالي)
    subjectsSecond: { type: Array, default: [] }, // درجات نهاية العام / الترم الثاني (النظام الجديد - مجموع 510)
    role: { type: String, default: 'student' },
    lastLogin: Date,
    lastIP: String,
    profile: {
        phone: String,
        parentName: String,
        parentId: String
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
    refreshToken: String
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

const attendanceSchema = new mongoose.Schema({
    studentCode: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
    note: { type: String, default: '' },
    recordedBy: { type: String, default: '' }
}, { timestamps: true });

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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث XP' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تسليم الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التسليمات: ' + error.message }); }
});

app.delete('/api/homework-comm1/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await Comm1Homework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await Comm1HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ التقدم: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث XP' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الأسئلة الخاطئة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تسليم الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التسليمات: ' + error.message }); }
});

app.delete('/api/homework-fon/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await FonHomework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await FonHomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ التقدم: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث XP' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تسليم الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التسليمات: ' + error.message }); }
});

app.delete('/api/homework-gs/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await GsHomework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await GsHomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ التقدم: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التقدم' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث XP' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث المفضلة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الأسئلة الصعبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الملاحظة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ سجل الاختبار' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ الإنجاز' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الصعوبة' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في تسليم الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب التسليمات: ' + error.message }); }
});

app.delete('/api/homework-an1/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deletedHomework = await An1Homework.findByIdAndDelete(req.params.id);
        if (!deletedHomework) return res.status(404).json({ error: 'الواجب غير موجود' });
        const deletedSubmissions = await An1HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
        res.json({ success: true, message: 'تم حذف الواجب وجميع التسليمات المرتبطة به', deletedSubmissions: deletedSubmissions.deletedCount });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الواجب: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنشاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب البطولات النشطة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في الانضمام للبطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في معالجة المشاركة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب نتائج البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في إنهاء البطولة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ success: false, error: 'خطأ في جلب أسئلة المراجعة: ' + error.message }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ التقدم: ' + error.message }); }
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
        res.status(500).json({ error: 'خطأ في إضافة الفعالية: ' + error.message });
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
const PushToken = mongoose.models.PushToken || mongoose.model('PushToken', pushTokenSchema);
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
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

// ====================== دوال مساعدة ======================
function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
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
        const decoded = jwt.verify(token, JWT_SECRET);
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

// مدير المعهد فقط: أي أدمن قديم بدون role (أو role = 'admin') يُعامل كمدير معهد للتوافق مع الحسابات الحالية
function isManager(req, res, next) {
    if (!req.user || req.user.type !== 'admin') return res.status(403).json({ error: 'غير مصرح. هذه الصفحة للأدمن فقط' });
    if (req.user.role === 'teacher') return res.status(403).json({ error: 'هذا الإجراء متاح لمدير المعهد فقط' });
    next();
}

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
        const { fullName, username, password, grade, studentCode, phone, parentName, parentId } = req.body;
        if (!fullName || !username || !password || !grade || !studentCode) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
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
            profile: { phone: phone || '', parentName: parentName || '', parentId: parentId || '' }
        });
        await student.save();
        res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنشاء الحساب: ' + error.message });
    }
});

// ====================== تسجيل الدخول ======================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        await connectToDatabase();
        const { username, password } = req.body;
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
        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.lastLogin = new Date();
        user.lastIP = clientIP;
        await user.save();
        const token = jwt.sign(
            { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode, role: userType === 'admin' ? (user.role || 'manager') : undefined },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        setAuthCookie(res, token);
        // بيترجع الـ token في الـ body كمان (مش بس كوكي) عشان أي مشروع تاني
        // على دومين مختلف (زي chatx) يقدر يخزنه ويبعته كـ Authorization: Bearer
        res.json({ success: true, token, user: { username: user.username, fullName: user.fullName, type: userType, id: user.studentCode || user._id, role: userType === 'admin' ? (user.role || 'manager') : undefined } });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
    }
});

// ====================== تجديد التوكن ======================
app.post('/api/refresh-token', async (req, res) => {
    const token = req.cookies?.authToken;
    if (!token) return res.status(401).json({ error: 'لا توجد جلسة' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const newToken = jwt.sign(
            { id: decoded.id, username: decoded.username, type: decoded.type, fullName: decoded.fullName, studentCode: decoded.studentCode, role: decoded.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        setAuthCookie(res, newToken);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ error: 'جلسة منتهية' });
    }
});

// ====================== التحقق من الجلسة ======================
app.get('/api/verify-session', verifyToken, (req, res) => {
    res.json({ valid: true, user: req.user });
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
        res.status(500).json({ error: 'خطأ في جلب البيانات: ' + error.message });
    }
});

// ====================== تسجيل الخروج ======================
app.post('/api/logout', verifyToken, (req, res) => {
    res.clearCookie('authToken', { path: '/' });
    res.json({ success: true });
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
        res.status(500).json({ error: 'خطأ في حفظ توكن الإشعارات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في إلغاء الإشعارات: ' + error.message });
    }
});

// ====================== APIs الطلاب ======================
app.get('/api/student/by-code/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
});

app.get('/api/student/by-username/:username', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const student = await Student.findOne({ username: req.params.username }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إنشاء الاختبار: ' + error.message }); }
});

app.get('/api/exams', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const exams = await Exam.find().sort({ createdAt: -1 }).select('-questions');
        res.json(exams);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الاختبارات' }); }
});

app.get('/api/exams/:code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const exam = await Exam.findOne({ code: req.params.code });
        if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });
        res.json(exam);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الاختبار' }); }
});

app.delete('/api/exams/:code', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Exam.findOneAndDelete({ code: req.params.code });
        if (!deleted) return res.status(404).json({ error: 'الاختبار غير موجود' });
        await ExamResult.deleteMany({ examCode: req.params.code });
        res.json({ success: true, message: 'تم حذف الاختبار بنجاح' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الاختبار' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حفظ النتيجة' }); }
});

app.get('/api/exams/:code/results', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const results = await ExamResult.find({ examCode: req.params.code }).sort({ completionTime: -1 });
        res.json(results);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب النتائج' }); }
});

// ====================== الإشعارات ======================
app.get('/api/notifications', async (req, res) => {
    try {
        await connectToDatabase();
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); }
});

app.post('/api/notifications', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const { text, date } = req.body;
        if (!text || text.trim() === '') return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        const newNotification = new Notification({ text: text.trim(), date: date || new Date().toLocaleString('ar-EG') });
        await newNotification.save();
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification });
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الإشعار' }); }
});

app.delete('/api/notifications/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Notification.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'الإشعار غير موجود' });
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الإشعار' }); }
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
        req.user = jwt.verify(token, JWT_SECRET);
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إرسال الرسالة' }); }
});

app.get('/api/admin-messages', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const messages = await AdminMessage.find().sort({ createdAt: -1 }).limit(500);
        res.json({ messages });
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الرسايل' }); }
});

app.patch('/api/admin-messages/:id/read', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const updated = await AdminMessage.findByIdAndUpdate(req.params.id, { read: true });
        if (!updated) return res.status(404).json({ error: 'الرسالة غير موجودة' });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث الرسالة' }); }
});

// ====================== المخالفات ======================
app.get('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب المخالفات' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة المخالفة' }); }
});

app.delete('/api/violations/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Violation.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'المخالفة غير موجودة' });
        res.json({ success: true, message: 'تم حذف المخالفة بنجاح' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف المخالفة' }); }
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
        res.status(500).json({ error: 'خطأ في تسجيل الحضور: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في حفظ الحضور الجماعي: ' + error.message });
    }
});

// ====================== جلب الطلاب (للأدمن) ======================
app.get('/api/admin/students', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const students = await Student.find().select('-password -refreshToken');
        res.json(students);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الطلاب' }); }
});

app.get('/api/admins', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const admins = await Admin.find().select('-password -refreshToken');
        res.json(admins);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الأدمنز' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الأدمن' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الأدمن' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الطالب: ' + error.message }); }
});

// ====================== تحديث بيانات الطالب (نسخة محسنة) ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        const { fullName, username, password, studentCode: newStudentCode, grade, semester, subjects, term, profile, premiumFeatures } = req.body;
        
        console.log('📝 تحديث الطالب:', studentCode, req.body);
        
        const updateData = {};
        
        // تحديث كل الحقول لو موجودة
        if (fullName !== undefined) updateData.fullName = fullName;
        if (username !== undefined) updateData.username = username;
        if (grade !== undefined) updateData.grade = grade;
        if (semester !== undefined) updateData.semester = semester;
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
        if (profile !== undefined) {
            updateData.profile = {
                ...(await Student.findOne({ studentCode })?.profile || {}),
                ...profile
            };
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
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في تحديث مميزات Premium: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في أرشفة النتائج: ' + error.message });
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب سنوات الأرشيف' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الأرشيف' }); }
});

// حذف سجل مؤرشف واحد (مدير المعهد فقط)
app.delete('/api/admin/archive/:id', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await ArchivedResult.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'السجل غير موجود' });
        res.json({ success: true, message: 'تم حذف السجل من الأرشيف' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف السجل' }); }
});

// حذف سنة كاملة من الأرشيف (مدير المعهد فقط)
app.delete('/api/admin/archive/year/:academicYear', verifyToken, isManager, async (req, res) => {
    try {
        await connectToDatabase();
        const result = await ArchivedResult.deleteMany({ academicYear: req.params.academicYear });
        res.json({ success: true, message: `تم حذف أرشيف سنة ${req.params.academicYear} بالكامل (${result.deletedCount} سجل)` });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف سنة الأرشيف' }); }
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
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في تحديث البيانات: ' + error.message });
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
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الطالب' }); }
});

// ====================== جلب الطلاب حسب الصف ======================
app.get('/api/students/by-grade/:grade', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        let gradeValue = req.params.grade;
        if (!['first', 'second', 'third'].includes(gradeValue)) return res.status(400).json({ error: 'صف غير صحيح' });
        const students = await Student.find({ grade: gradeValue }).select('-password -refreshToken');
        res.json(students);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الطلاب' }); }
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
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ====================== APIs ولي الأمر ======================
app.post('/api/parent/login', async (req, res) => {
    try {
        await connectToDatabase();
        const { parentId, password } = req.body;
        if (!parentId || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const student = await Student.findOne({ 'profile.parentId': parentId });
        if (!student) return res.status(401).json({ error: 'رقم بطاقة ولي الأمر غير صحيح' });
        const expectedPassword = student.studentCode.slice(-7);
        if (password !== expectedPassword) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        const token = jwt.sign({ id: student._id, type: 'parent', studentCode: student.studentCode, fullName: student.fullName }, JWT_SECRET, { expiresIn: '24h' });
        setAuthCookie(res, token);
        res.json({ success: true, studentId: student._id, studentName: student.fullName, studentCode: student.studentCode, parentName: student.profile?.parentName || 'ولي الأمر' });
    } catch (error) { res.status(500).json({ error: 'خطأ في السيرفر' }); }
});

app.get('/api/parent/student/:studentCode', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); }
});

app.get('/api/parent/student/:studentCode/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('subjectsFirst subjectsSecond subjects fullName studentCode');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        const subjectsFirst = (student.subjectsFirst && student.subjectsFirst.length) ? student.subjectsFirst : (student.subjects || []);
        res.json({ fullName: student.fullName, studentCode: student.studentCode, subjectsFirst, subjectsSecond: student.subjectsSecond || [] });
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب النتائج' }); }
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
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الحضور' }); }
});

app.get('/api/parent/student/:studentCode/violations', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        if (req.user.type === 'parent' && req.user.studentCode !== req.params.studentCode) return res.status(403).json({ error: 'غير مصرح' });
        const violations = await Violation.find({ studentId: req.params.studentCode }).sort({ date: -1 });
        res.json(violations);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب المخالفات' }); }
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

app.post('/api/gemini', async (req, res) => {
    try {
        const { prompt, userId = req.user?.id || req.ip || 'anonymous' } = req.body;
        if (!prompt || prompt.trim() === '') return res.status(400).json({ error: 'الرسالة مطلوبة' });
        const conversationContext = getConversationContext(userId);
        const systemPrompt = `أنت مساعد تعليمي ذكي لمعهد رعاية الضبعية للتمريض.\n\n📌 تعليمات مهمة:\n- رد باللغة العربية (مصري أو فصحى)\n- تخصصك: التمريض، الرعاية التلطيفية، Palliative care, Brain death, Hospice care\n- كن ودوداً ومفيداً ومحترفاً\n- قدم إجابات دقيقة ومبسطة مع أمثلة عملية\n- إذا سأل عن النتيجة: "روح على صفحة النتائج وادخل الكود بتاعك"\n- استخدم السياق المقدم من المحادثات السابقة\n\n${conversationContext ? `\n📚 **سياق المحادثة السابقة مع هذا الطالب:**\n${conversationContext}\n` : ''}\n\n💬 **سؤال الطالب الحالي:** ${prompt}\n\nقدم رداً مفيداً وطبيعياً وودوداً باللغة العربية:`;
        let reply = null;
        if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== '') {
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

app.post('/api/gemini/file', async (req, res) => {
    const { filename } = req.body;
    res.json({ reply: `📄 **تم استلام ملف: ${filename || 'الملف'}**\n\nخدمة تحليل الملفات قيد التطوير.\n\n📌 قريباً سأتمكن من:\n• قراءة ملفات PDF\n• تلخيص المستندات\n• استخراج المعلومات المهمة\n• إنشاء أسئلة من المحتوى` });
});

app.post('/api/gemini/questions', async (req, res) => {
    const { questionCount = 5, filename } = req.body;
    res.json({ reply: `📝 **طلب إنشاء ${questionCount} سؤال**\n\nمن ملف: ${filename || 'الملف'}\n\nهذه الخدمة قيد التطوير.\n\n📌 قريباً سأتمكن من إنشاء:\n• أسئلة اختيار من متعدد\n• أسئلة صح/خطأ\n• أسئلة مقالية\n\nعلى حسب المحتوى الذي ترفعه!` });
});




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
        const safeName = `${Date.now()}-${sanitizeForStorage(fileName)}`;
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
        res.status(500).json({ error: 'خطأ في إنشاء رابط الرفع: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في رفع الملفات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في جلب الملفات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في حفظ معلومات الملف: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في إنشاء الواجب: ' + error.message });
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
            error: 'خطأ في جلب الواجبات: ' + error.message,
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
        res.status(500).json({ error: 'خطأ في جلب الواجبات المعلقة: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في جلب الواجب: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في تسليم الواجب: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في جلب التسليمات: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في حذف الواجب: ' + error.message });
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
            error: 'خطأ في إنشاء البطولة: ' + error.message 
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
            error: 'خطأ في جلب البطولات النشطة: ' + error.message 
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
            error: 'خطأ في الانضمام للبطولة: ' + error.message 
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
            error: 'خطأ في معالجة المشاركة: ' + error.message 
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
            error: 'خطأ في جلب نتائج البطولة: ' + error.message 
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
            error: 'خطأ في إنهاء البطولة: ' + error.message 
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
            error: 'خطأ في جلب البطولات: ' + error.message 
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. إكمال تسجيل الدخول بالبصمة (بالتحقق الفعلي من التوقيع والعداد)
app.post('/api/biometric/login-finish', async (req, res) => {
    try {
        await connectToDatabase();
        const { credential } = req.body;

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

        const token = jwt.sign(
            {
                id: user._id,
                username: user.username,
                type: userType,
                fullName: user.fullName,
                studentCode: user.studentCode,
                role: userType === 'admin' ? (user.role || 'manager') : undefined
            },
            JWT_SECRET,
            { expiresIn: '24h' }
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
            error: 'خطأ في جلب أسئلة المراجعة: ' + error.message
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
        res.status(500).json({ error: 'خطأ في حفظ التقدم: ' + error.message });
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
        res.status(500).json({ error: 'خطأ في رفع الدرجات: ' + error.message });
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
            const decoded = jwt.verify(token, JWT_SECRET);
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
    res.status(500).json({ error: 'خطأ في جلب بيانات الحسابات: ' + error.message });
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
    res.status(500).json({ error: 'خطأ في تحديث حالة الإيقاف: ' + error.message });
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
    typingUntil: { type: Map, of: Date, default: {} }
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
    text: { type: String, required: true, maxlength: 2000 },
    // ردود الإيموجي على الرسالة — Map من اليوزرنيم لاسم الإيموجي، عشان كل عضو
    // يقدر يحط رد واحد بس على كل رسالة (لو حط تاني بيستبدل الأول تلقائي).
    reactions: { type: Map, of: String, default: {} }
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
        if (!chat) chat = await new GroupChat({ memberUsernames: pair }).save();
        res.json({ chatId: chat._id, memberUsernames: chat.memberUsernames });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنشاء غرفة المذاكرة' });
    }
});

app.get('/api/group-chats', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const me = await Student.findById(req.user.id).select('username');
        if (!me) return res.status(404).json({ error: 'المستخدم غير موجود' });
        const chats = await GroupChat.find({ memberUsernames: me.username })
            .sort({ lastMessageAt: -1 }).limit(50).lean();
        res.json({ chats: chats.map(c => ({ id: c._id, memberUsernames: c.memberUsernames, lastMessage: c.lastMessage })) });
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
            messages: messages.map(m => ({
                id: String(m._id),
                senderUsername: m.senderUsername,
                text: m.text,
                createdAt: new Date(m.createdAt).getTime(),
                reactions: m.reactions ? Object.fromEntries(m.reactions instanceof Map ? m.reactions : Object.entries(m.reactions)) : {}
            })),
            lastReadBy: Object.fromEntries(
                [...chat.lastReadBy.entries()].map(([u, d]) => [u, new Date(d).getTime()])
            ),
            // بنرجّع بس أسماء اللي "بيكتبوا دلوقتي" (يعني typingUntil بتاعهم لسه في المستقبل)،
            // وبنستبعد نفسي عشان الفرونت إند ميحسبنيش إني بيكتب لنفسي.
            typingUsernames: [...chat.typingUntil.entries()]
                .filter(([u, until]) => u !== me.username && new Date(until).getTime() > Date.now())
                .map(([u]) => u),
            onlineUsernames
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
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فاضية' });
        const me = await Student.findById(req.user.id).select('username fullName');
        const chat = await GroupChat.findById(req.params.id);
        if (!chat || !me || !chat.memberUsernames.includes(me.username)) {
            return res.status(403).json({ error: 'غير مصرح لك بالدخول للغرفة دي' });
        }
        const trimmed = text.trim().slice(0, 2000);
        const msg = await new GroupChatMessage({ chatId: chat._id, senderUsername: me.username, text: trimmed }).save();
        chat.lastMessage = trimmed;
        chat.lastMessageAt = new Date();
        await chat.save();
        // نبعت push notification لباقي أعضاء الغرفة (مش للمرسل نفسه)، من غير ما نستنى
        // النتيجة عشان الرد على المرسل ميتأخرش لو الإرسال بطيء أو فشل لأي سبب.
        const senderDisplayName = me.fullName || me.username;
        const otherMembers = chat.memberUsernames.filter(u => u !== me.username);
        Promise.all(otherMembers.map(u => sendPushToUser(u, {
            title: `رسالة جديدة من ${senderDisplayName}`,
            body: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
            data: { type: 'message', chatId: String(chat._id), senderUsername: me.username, senderName: senderDisplayName }
        }))).catch(() => {});
        res.json({ success: true, messageId: msg._id, createdAt: new Date(msg.createdAt).getTime() });
    } catch (error) {
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
