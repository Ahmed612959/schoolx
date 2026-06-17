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

// دالة رفع ملف إلى Cloudinary من Buffer
const uploadToCloudinary = (buffer, folder, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder || 'school-files',
                resource_type: 'auto',
                public_id: fileName ? `${Date.now()}-${fileName.split('.')[0]}` : undefined
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

// ====================== إعداد Multer ======================
// أضف هذا قبل تعريف upload
const storage = multer.memoryStorage(); // ✅ للتخزين في الذاكرة (مناسب لـ Vercel)

const upload = multer({
    storage: storage,  // ✅ الآن storage معرف
    limits: { 
        fileSize: 4 * 1024 * 1024, // 4MB (حد Vercel الأقصى للـ Serverless)
        files: 10 // الحد الأقصى لعدد الملفات
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
        if (existingCode) return res.status(400).json({ error: 'رقم الجلوس موجود مسبقاً' });
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

// ====================== تحديث بيانات الطالب ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { studentCode } = req.params;
        const { profile, subjects, fullName, semester, password } = req.body;
        const updateData = {};
        if (profile !== undefined) updateData.profile = profile;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (semester !== undefined) updateData.semester = semester;
        if (password !== undefined && password !== '') updateData.password = await hashPassword(password);
        const updated = await Student.findOneAndUpdate({ studentCode }, { $set: updateData }, { new: true }).select('-password -refreshToken');
        if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(updated);
    } catch (error) { res.status(500).json({ error: 'خطأ في تحديث البيانات' }); }
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

// رفع ملفات متعددة
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
        console.error('Upload error:', error);
        res.status(500).json({ error: 'خطأ في رفع الملفات: ' + error.message });
    }
});

// جلب جميع الملفات
app.get('/api/files', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const files = await File.find().sort({ createdAt: -1 });
        console.log('📁 عدد الملفات في DB:', files.length);
        res.json(files);
    } catch (error) {
        console.error('❌ خطأ في جلب الملفات:', error);
        res.status(500).json({ error: 'خطأ في جلب الملفات' });
    }
});

// تحميل ملف
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
        res.status(500).json({ error: 'خطأ في تحميل الملف' });
    }
});

// حذف ملف
app.delete('/api/files/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'الملف غير موجود' });
        }

        try {
            await cloudinary.uploader.destroy(file.publicId, {
                resource_type: 'auto'
            });
        } catch (e) {
            console.log('⚠️ Cloudinary delete error:', e.message);
        }

        await File.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم حذف الملف بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الملف' });
    }
});

// إحصائيات الملفات
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
        res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
});

// ====================== تحديث عدد المشاهدات ======================
// ⬇⬇⬇⬇⬇ ضع هذا قبل app.get('*') ⬇⬇⬇⬇⬇
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

// ====================== حفظ معلومات الملف من Cloudinary ======================
app.post('/api/files/save', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { name, url, publicId, size, type, grade, subject } = req.body;
        
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
        res.json({ success: true, file: fileData });
    } catch (error) {
        console.error('Save file error:', error);
        res.status(500).json({ error: 'خطأ في حفظ معلومات الملف' });
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
