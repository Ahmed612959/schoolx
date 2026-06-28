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

// ====================== Cloudinary و Multer ======================
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

// تكوين Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'di47of300',
    api_key: process.env.CLOUDINARY_API_KEY || '344972868721826',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'HkoDVSfeDHmRQJjd4Q_B1uEQlpA'
});

// ====================== إعداد Multer ======================
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 4 * 1024 * 1024, // 4MB (حد Vercel)
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

// دالة رفع ملف إلى Cloudinary من Buffer
const uploadToCloudinary = (buffer, folder, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder || 'school-files',
                resource_type: 'auto',
                public_id: fileName ? `${Date.now()}-${fileName.split('.')[0].replace(/\s+/g, '_')}` : undefined,
                unique_filename: true,
                overwrite: false
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        
        const readableStream = new Readable();
        readableStream.push(buffer);
        readableStream.push(null);
        readableStream.pipe(uploadStream);
    });
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
    cloudinary,
    uploadToCloudinary,
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


const tournamentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, default: 20 },
    categoryFilter: { type: String, default: 'all' },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    timeLimitMinutes: { type: Number, default: 10 }, // وقت الاختبار بالدقائق
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        score: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: { type: Array, default: [] },
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });
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

// رفع ملفات متعددة (عن طريق السيرفر - للاستخدام الاحتياطي)
app.post('/api/files/upload-multiple', verifyToken, isAdmin, upload.array('files', 20), async (req, res) => {
    try {
        await connectToDatabase();
        const { grade, subject } = req.body;
        
        if (!grade || !subject) {
            return res.status(400).json({ error: 'الصف والمادة مطلوبان' });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'يرجى اختيار ملفات للرفع' });
        }

        const uploadedFiles = [];

        for (const file of req.files) {
            const folder = `school/${grade}/${subject}`;
            const result = await uploadToCloudinary(file.buffer, folder, file.originalname);

            const fileData = new File({
                name: file.originalname,
                url: result.secure_url,
                publicId: result.public_id,
                size: file.size,
                type: file.mimetype || file.originalname.split('.').pop().toLowerCase(),
                grade: grade,
                subject: subject,
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

// ====================== تحميل ملف (إعادة توجيه إلى Cloudinary) ======================
app.get('/api/files/download/:id', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }

        file.downloads = (file.downloads || 0) + 1;
        await file.save();

        return res.redirect(file.url);
    } catch (error) {
        console.error('❌ خطأ في تحميل الملف:', error);
        res.status(500).json({ error: 'خطأ في تحميل الملف' });
    }
});

// ====================== حذف ملف ======================
app.delete('/api/files/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }

        // حذف من Cloudinary
        try {
            await cloudinary.uploader.destroy(file.publicId, {
                resource_type: 'auto'
            });
            console.log('✅ تم حذف الملف من Cloudinary:', file.publicId);
        } catch (e) {
            console.log('⚠️ Cloudinary delete error:', e.message);
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

// ====================== حفظ معلومات الملف من Cloudinary (للرفع المباشر) ======================
app.post('/api/files/save', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { name, url, publicId, size, type, grade, subject } = req.body;
        
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

// ====================== إنشاء توقيع للرفع (Signature) ======================
app.get('/api/upload/signature', verifyToken, (req, res) => {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = req.query.folder || 'school';
        
        // إنشاء التوقيع
        const signature = cloudinary.utils.api_sign_request(
            {
                timestamp: timestamp,
                folder: folder,
                upload_preset: 'school_preset'
            },
            process.env.CLOUDINARY_API_SECRET || 'HkoDVSfeDHmRQJjd4Q_B1uEQlpA'
        );
        
        res.json({
            signature: signature,
            timestamp: timestamp,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'di47of300',
            apiKey: process.env.CLOUDINARY_API_KEY || '344972868721826',
            uploadPreset: 'school_preset'
        });
    } catch (error) {
        console.error('❌ Signature error:', error);
        res.status(500).json({ error: 'خطأ في إنشاء التوقيع' });
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
app.delete('/api/homework/:id', verifyToken, isAdmin, async (req, res) => {
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


// دالة لتوليد كود عشوائي مكون من 6 أحرف
function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// 1. إنشاء بطولة جديدة (للأدمن)
app.post('/api/tournaments', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { title, chapterId, chapterName, questionCount, categoryFilter, startDate, endDate, questions } = req.body;
        
        if (!title || !chapterId || !startDate || !endDate || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        let uniqueCode = generateTournamentCode();
        let codeExists = await Tournament.findOne({ code: uniqueCode });
        while (codeExists) {
            uniqueCode = generateTournamentCode();
            codeExists = await Tournament.findOne({ code: uniqueCode });
        }

        const newTournament = new Tournament({
            title,
            code: uniqueCode,
            chapterId,
            chapterName: chapterName || 'فصل غير معروف',
            questionCount: questionCount || 20,
            categoryFilter: categoryFilter || 'all',
            startDate,
            endDate,
            createdBy: req.user.username,
            questions: questions,
            isActive: true
        });
        
        await newTournament.save();
        res.json({ success: true, message: 'تم إنشاء البطولة بنجاح', tournament: newTournament });
    } catch (error) {
        console.error('❌ خطأ في إنشاء البطولة:', error);
        res.status(500).json({ error: 'خطأ في إنشاء البطولة: ' + error.message });
    }
});

// 2. جلب البطولات النشطة (تم التعديل: إخفاء تفاصيل المشاركين لتخفيف الحمل وحماية البيانات)
app.get('/api/tournaments/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        
        const tournaments = await Tournament.find({
            isActive: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        }).sort({ createdAt: -1 });
        
        const tournamentsWithParticipation = tournaments.map(t => {
            const userParticipant = t.participants.find(p => p.studentId === req.user.username);
            const tournamentData = t.toObject(); 
            delete tournamentData.participants; // إزالة المصفوفة الثقيلة
            
            return {
                ...tournamentData,
                participantsCount: t.participants.length, // إرسال العدد فقط
                hasParticipated: !!userParticipant,
                myScore: userParticipant ? userParticipant.score : null,
                myTime: userParticipant ? userParticipant.timeTaken : null
            };
        });
        
        res.json(tournamentsWithParticipation);
    } catch (error) {
        console.error('❌ خطأ في جلب البطولات:', error);
        res.status(500).json({ error: 'خطأ في جلب البطولات' });
    }
});

// 3. الانضمام عن طريق كود البطولة
app.post('/api/tournaments/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'يرجى إدخال كود البطولة' });

        const tournament = await Tournament.findOne({ 
            code: code.toUpperCase().trim(), 
            isActive: true 
        });
        if (!tournament) return res.status(404).json({ error: 'كود البطولة غير صحيح أو البطولة منتهية' });

        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) {
            return res.status(400).json({ error: `البطولة ستبدأ في ${tournament.startDate}` });
        }
        if (tournament.endDate < today) {
            return res.status(400).json({ error: 'انتهت مدة البطولة' });
        }

        const alreadyJoined = tournament.participants.find(
            p => p.studentId === req.user.username
        );
        if (alreadyJoined) {
            return res.status(400).json({ 
                error: 'لقد شاركت في هذه البطولة بالفعل',
                score: alreadyJoined.score,
                alreadyParticipated: true
            });
        }

        // إرجاع الأسئلة بدون الإجابات الصحيحة
        const questionsWithoutAnswers = (tournament.questions || []).map(q => ({
            text: q.text,
            translation: q.translation,
            cat: q.cat,
            options: q.options,
            // لا نرجع correct أو completion أو answer
        }));

        res.json({ 
            success: true, 
            tournamentId: tournament._id,
            title: tournament.title,
            chapterName: tournament.chapterName,
            endDate: tournament.endDate,
            questions: questionsWithoutAnswers,
            totalQuestions: questionsWithoutAnswers.length,
            message: 'تم التحقق بنجاح، ابدأ الحل الآن!'
        });
        
    } catch (error) {
        console.error('❌ خطأ في الانضمام:', error);
        res.status(500).json({ error: 'خطأ في الانضمام: ' + error.message });
    }
});

// مسار جلب أسئلة البطولة للطالب للبدء في الحل
app.get('/api/tournaments/:id/start', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ error: 'البطولة غير نشطة' });
        
        const alreadyJoined = tournament.participants.find(p => p.studentId === req.user.username);
        if (alreadyJoined) return res.status(400).json({ error: 'لقد شاركت بالفعل' });

        res.json({ success: true, questions: tournament.questions });
    } catch (error) {
        res.status(500).json({ error: 'خطأ' });
    }
});

// 4. جلب جميع البطولات (للأدمن)
app.get('/api/tournaments/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournaments = await Tournament.find().sort({ createdAt: -1 });
        res.json(tournaments);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب البطولات' });
    }
});

// 5. المشاركة في البطولة وإرسال الإجابات (تم إصلاح كارثة التصحيح)
app.post('/api/tournaments/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        
        // التحقق من صحة البيانات
        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'بيانات الإجابات غير صحيحة' });
        }
        
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
        
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) return res.status(400).json({ error: 'البطولة لم تبدأ بعد' });
        if (tournament.endDate < today) return res.status(400).json({ error: 'البطولة انتهت' });
        if (!tournament.isActive) return res.status(400).json({ error: 'البطولة مغلقة' });
        
        const existingParticipant = tournament.participants.find(p => p.studentId === req.user.username);
        if (existingParticipant) return res.status(400).json({ error: 'لقد شاركت بالفعل في هذه البطولة' });
        
        // التحقق من الوقت (منع الغش - لازم يكون على الأقل 30 ثانية)
        const minTime = Math.min(30, tournament.questions.length * 3);
        if (timeTaken < minTime) {
            return res.status(400).json({ error: 'وقت الحل غير منطقي، يبدو أن هناك محاولة غش' });
        }
        
        let correctCount = 0;
        const detailedAnswers = [];
        const questions = tournament.questions || [];
        
        for (const answer of answers) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            
            let isCorrect = false;
            const qType = question.cat || 'mcq';
            const userAns = String(answer.answer || '').trim().toLowerCase();
            
            if (qType === 'mcq') {
                // مقارنة نصية مع تجاهل المسافات
                const correctAns = String(question.correct || '').trim().toLowerCase();
                isCorrect = userAns === correctAns;
                
                // لو الإجابة تبدأ بحرف الاختيار (أ، ب، ج أو a, b, c)
                if (!isCorrect && question.options) {
                    const selectedOpt = question.options.find(opt => 
                        String(opt).trim().toLowerCase() === userAns
                    );
                    if (selectedOpt) {
                        isCorrect = String(selectedOpt).trim().toLowerCase() === correctAns;
                    }
                }
            }
            else if (qType === 'truefalse') {
                // دعم كل أشكال صح/خطأ
                const correctIsTrue = (
                    question.correct === true || 
                    String(question.correct).toLowerCase() === 'true'
                );
                const userIsTrue = (
                    userAns === 'true' || 
                    userAns === 'صواب' || 
                    userAns === 'صح' ||
                    userAns === '1'
                );
                const userIsFalse = (
                    userAns === 'false' || 
                    userAns === 'خطأ' || 
                    userAns === 'غلط' ||
                    userAns === '0'
                );
                
                if (correctIsTrue) isCorrect = userIsTrue;
                else isCorrect = userIsFalse;
            }
            else if (qType === 'complete') {
                const completion = String(question.completion || '').trim().toLowerCase();
                if (completion && userAns.length > 1) {
                    // مقارنة بالكلمات المفتاحية
                    const keywords = completion.split(/\s+/).filter(w => w.length > 3);
                    if (keywords.length === 0) {
                        isCorrect = userAns === completion;
                    } else {
                        const matchedKeywords = keywords.filter(kw => userAns.includes(kw));
                        isCorrect = matchedKeywords.length / keywords.length >= 0.6;
                    }
                }
            }
            else if (qType === 'list' || qType === 'explain' || qType === 'situations') {
                // الأسئلة المقالية - درجة إذا كتب أكثر من 10 حروف
                isCorrect = userAns.length > 10;
            }
            
            if (isCorrect) correctCount++;
            detailedAnswers.push({ 
                questionIndex: answer.questionIndex, 
                answer: answer.answer || '', 
                isCorrect 
            });
        }
        
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        
        const student = await Student.findOne({ username: req.user.username });
        
        tournament.participants.push({
            studentId: req.user.username,
            studentName: student ? student.fullName : req.user.username,
            score,
            timeTaken: timeTaken || 0,
            answers: detailedAnswers,
            submittedAt: new Date()
        });
        
        // ترتيب: الأعلى درجة أولاً، ثم الأسرع وقتاً
        tournament.participants.sort((a, b) => 
            b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken
        );
        
        await tournament.save();
        
        const userRank = tournament.participants.findIndex(
            p => p.studentId === req.user.username
        ) + 1;
        
        // إضافة XP بناءً على الترتيب
        const xpReward = userRank === 1 ? 50 : userRank === 2 ? 30 : userRank === 3 ? 20 : 10;
        await Progress.findOneAndUpdate(
            { userId: req.user.username },
            { $inc: { xp: xpReward } },
            { upsert: true }
        );
        
        res.json({ 
            success: true,
            score,
            rank: userRank,
            correctCount,
            totalQuestions,
            xpEarned: xpReward,
            message: `أحسنت! حصلت على ${score}% وترتيبك ${userRank}`
        });
        
    } catch (error) {
        console.error('❌ خطأ في المشاركة:', error);
        res.status(500).json({ error: 'خطأ في المشاركة: ' + error.message });
    }
});

// 6. جلب نتائج البطولة
app.get('/api/tournaments/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
        
        if (req.user.type !== 'admin') {
            const isParticipant = tournament.participants.some(p => p.studentId === req.user.username);
            if (!isParticipant) return res.status(403).json({ error: 'غير مصرح بعرض نتائج هذه البطولة' });
        }
        
        res.json({ 
            title: tournament.title, 
            participants: tournament.participants, 
            top3: tournament.participants.slice(0, 3), 
            totalParticipants: tournament.participants.length 
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب النتائج' });
    }
});

// 7. إنهاء البطولة وإعلان الفائزين (للأدمن)
app.post('/api/tournaments/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ error: 'البطولة غير موجودة' });
        if (!tournament.isActive) return res.status(400).json({ error: 'البطولة منتهية بالفعل' });
        
        tournament.isActive = false;
        if (tournament.participants.length >= 1) {
            tournament.winner1 = tournament.participants[0]?.studentId || '';
            tournament.winner2 = tournament.participants[1]?.studentId || '';
            tournament.winner3 = tournament.participants[2]?.studentId || '';
            
            if (tournament.winner1) await Progress.findOneAndUpdate({ userId: tournament.winner1 }, { $inc: { xp: 50 } });
            if (tournament.winner2) await Progress.findOneAndUpdate({ userId: tournament.winner2 }, { $inc: { xp: 30 } });
            if (tournament.winner3) await Progress.findOneAndUpdate({ userId: tournament.winner3 }, { $inc: { xp: 20 } });
        }
        
        await tournament.save();
        res.json({ success: true, message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إنهاء البطولة: ' + error.message });
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


// ====================== مسار افتراضي ======================
app.get('*', (req, res) => {
    res.json({ 
        message: 'معهد رعاية الضبعية - API', 
        status: 'running', 
        version: '3.0.0', 
        endpoints: ['/api/test', '/api/login', '/api/attendance', '/api/exams', '/api/notifications', '/api/violations', '/api/gemini', '/api/captcha', '/api/files'] 
    });
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
                const { studentCode, fullName, subjects, grade, semester } = studentData;
                
                if (!studentCode || !fullName) {
                    errors.push(`تخطي صف: بيانات غير مكتملة`);
                    continue;
                }
                
                let student = await Student.findOne({ studentCode });
                
                if (student) {
                    // تحديث الطالب الموجود
                    await Student.updateOne(
                        { studentCode },
                        { 
                            $set: { 
                                fullName, 
                                subjects: subjects || [], 
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
                        subjects: subjects || [],
                        role: 'student'
                    });
                    addedCount++;
                }
            } catch (err) {
                // ✅ لو حصل duplicate، نجرب من غير username
                if (err.code === 11000) {
                    try {
                        await Student.create({
                            fullName: studentData.fullName,
                            studentCode: studentData.studentCode,
                            grade: studentData.grade || 'first',
                            semester: studentData.semester || 'first',
                            subjects: studentData.subjects || [],
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

// ====================== تصدير لـ Vercel ======================
module.exports = app;
