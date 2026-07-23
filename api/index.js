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
    'https://school-system-fiv.vercel.app'
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

// ====================== Supabase Storage و Multer ======================
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws'); // مطلوب لأن Node.js 20 (Vercel) مفيهوش WebSocket built-in

// تكوين Supabase (SUPABASE_SERVICE_ROLE_KEY = مفتاح sb_secret_... من الداشبورد)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        realtime: { transport: ws } // بنستخدمش Realtime أصلاً، لكن لازم نديها transport عشان متكرشش وقت الإنشاء
    }
);
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'files';

// ====================== إعداد Multer ======================
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB (حد الخطة المجانية في Supabase)
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

// تنضيف أي جزء من المسار (اسم ملف أو فولدر) عشان يبقى متوافق مع Supabase Storage
// (بيرفض أي حروف عربية أو رموز غريبة في الـ key)
function sanitizeForStorage(str) {
    const safe = String(str)
        .replace(/[^\x00-\x7F]/g, '')   // شيل أي حروف عربية/غير ASCII
        .replace(/\s+/g, '_')            // مسافات -> underscore
        .replace(/[^\w\-.]/g, '_')       // أي رمز غريب -> underscore
        .replace(/_+/g, '_')
        .replace(/^[_.]+|[_.]+$/g, '');
    return safe || 'file';
}

// دالة رفع ملف إلى Supabase Storage من Buffer
const uploadToCloudinary = async (buffer, folder, fileName) => {
    const safeFolder = folder ? folder.split('/').map(sanitizeForStorage).join('/') : '';
    const safeName = `${Date.now()}-${sanitizeForStorage(fileName)}`;
    const path = safeFolder ? `${safeFolder}/${safeName}` : safeName;

    const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(path, buffer, { upsert: false });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(path);

    return {
        secure_url: publicUrlData.publicUrl, // نفس اسم الحقل القديم عشان الكود اللي بيستخدمها متتغيرش
        public_id: path
    };
};

// دالة حذف ملف من Supabase Storage
const deleteFromSupabase = async (path) => {
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([path]);
    if (error) throw error;
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
    supabase,
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
    subjects: Array,
    role: { type: String, default: 'student' },
    lastLogin: Date,
    lastIP: String,
    profile: {
        phone: String,
        parentName: String,
        parentId: String
    },
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

app.delete('/api/homework-gs/:id', verifyToken, isAdmin, async (req, res) => {
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
app.post('/api/events', verifyToken, isAdmin, async (req, res) => {
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
app.put('/api/events/:id', verifyToken, isAdmin, async (req, res) => {
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
app.put('/api/events/:id/pin', verifyToken, isAdmin, async (req, res) => {
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
app.delete('/api/events/:id', verifyToken, isAdmin, async (req, res) => {
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
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
const ExamResult = mongoose.models.ExamResult || mongoose.model('ExamResult', examResultSchema);

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
            { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        setAuthCookie(res, token);
        res.json({ success: true, user: { username: user.username, fullName: user.fullName, type: userType, id: user.studentCode || user._id } });
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
            { id: decoded.id, username: decoded.username, type: decoded.type, fullName: decoded.fullName, studentCode: decoded.studentCode },
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

// ====================== تسجيل الخروج ======================
app.post('/api/logout', verifyToken, (req, res) => {
    res.clearCookie('authToken', { path: '/' });
    res.json({ success: true });
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

app.delete('/api/exams/:code', verifyToken, isAdmin, async (req, res) => {
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

app.post('/api/notifications', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { text, date } = req.body;
        if (!text || text.trim() === '') return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        const newNotification = new Notification({ text: text.trim(), date: date || new Date().toLocaleString('ar-EG') });
        await newNotification.save();
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification });
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الإشعار' }); }
});

app.delete('/api/notifications/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const deleted = await Notification.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'الإشعار غير موجود' });
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الإشعار' }); }
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

app.delete('/api/violations/:id', verifyToken, isAdmin, async (req, res) => {
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

app.delete('/api/attendance/:id', verifyToken, isAdmin, async (req, res) => {
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

app.get('/api/admins', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const admins = await Admin.find().select('-password -refreshToken');
        res.json(admins);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الأدمنز' }); }
});

app.post('/api/admins', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { fullName, username, password } = req.body;
        if (!fullName || !username || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        const hashedPassword = await hashPassword(password);
        const admin = new Admin({ fullName, username, password: hashedPassword });
        await admin.save();
        res.json({ message: 'تم إضافة الأدمن بنجاح', admin: { fullName, username } });
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الأدمن' }); }
});

app.delete('/api/admins/:username', verifyToken, isAdmin, async (req, res) => {
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

// ====================== تحديث بيانات الطالب (نسخة محسنة) ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        const { fullName, username, password, studentCode: newStudentCode, grade, semester, subjects, profile } = req.body;
        
        console.log('📝 تحديث الطالب:', studentCode, req.body);
        
        const updateData = {};
        
        // تحديث كل الحقول لو موجودة
        if (fullName !== undefined) updateData.fullName = fullName;
        if (username !== undefined) updateData.username = username;
        if (grade !== undefined) updateData.grade = grade;
        if (semester !== undefined) updateData.semester = semester;
        if (subjects !== undefined) updateData.subjects = subjects;
        
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



app.delete('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
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
        const admin = new Admin({ fullName, username, password: hashedPassword });
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
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('subjects fullName studentCode');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json({ fullName: student.fullName, studentCode: student.studentCode, subjects: student.subjects || [] });
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
    const history = conversationHistory.get(userId) || [