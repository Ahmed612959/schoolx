require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');

const app = express();

// ====================== MIDDLEWARE ======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ====================== CORS متقدم لـ Vercel ======================
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://school-system-fiv.vercel.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        return callback(new Error('CORS policy violation'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// ====================== Helmet Security (مخفف لـ Vercel) ======================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// ====================== Rate Limiting ======================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'لقد تجاوزت الحد المسموح من الطلبات' },
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
});

// ====================== متغيرات البيئة ======================
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI;

console.log('MONGODB_URI:', MONGODB_URI ? '✅ Found' : '❌ Not found');

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

// ====================== Session Setup (نسخة مبسطة لـ Vercel) ======================
const MemoryStore = require('express-session').MemoryStore;

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore(),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    name: 'institute_session'
}));

// معالج للتأكد من وجود session
app.use((req, res, next) => {
    if (!req.session) {
        req.session = {};
        req.session.id = crypto.randomBytes(16).toString('hex');
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    next();
});

// ====================== الاتصال بقاعدة البيانات ======================
let dbConnected = false;

if (MONGODB_URI && MONGODB_URI !== '') {
    console.log('📡 Connecting to MongoDB...');
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    })
    .then(() => {
        console.log('✅ MongoDB connected successfully');
        dbConnected = true;
    })
    .catch(err => console.error('❌ MongoDB connection error:', err.message));
} else {
    console.log('⚠️ No MONGODB_URI provided, running without database (demo mode)');
}

// ====================== النماذج (Schemas) ======================
let Admin, Student, Violation, Notification, Attendance, Exam, ExamResult, File;

if (MONGODB_URI && MONGODB_URI !== '') {
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

    const fileSchema = new mongoose.Schema({
        name: { type: String, required: true },
        description: String,
        url: { type: String, required: true },
        type: { type: String, required: true },
        size: Number,
        grade: { type: String, enum: ['first', 'second', 'third'], required: true },
        subject: { type: String, required: true },
        downloads: { type: Number, default: 0 },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        createdAt: { type: Date, default: Date.now }
    });

    Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
    Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
    Violation = mongoose.models.Violation || mongoose.model('Violation', violationSchema);
    Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
    Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
    Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
    ExamResult = mongoose.models.ExamResult || mongoose.model('ExamResult', examResultSchema);
    File = mongoose.models.File || mongoose.model('File', fileSchema);
}

// ====================== دوال مساعدة ======================
function requireDb(req, res, next) {
    if (!dbConnected || mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً' });
    }
    next();
}

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
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
}

function isAdmin(req, res, next) {
    if (!req.user || req.user.type !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح. هذه الصفحة للأدمن فقط' });
    }
    next();
}

function verifyCsrfToken(req, res, next) {
    const csrfToken = req.headers['x-csrf-token'];
    const sessionCsrf = req.session?.csrfToken;
    
    if (!csrfToken || !sessionCsrf || csrfToken !== sessionCsrf) {
        return res.status(403).json({ error: 'طلب غير مصرح به' });
    }
    next();
}

// ====================== Test endpoint ======================
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        mongodb_status: dbConnected ? 'connected' : 'disconnected',
        message: 'API is working on Vercel!',
        timestamp: new Date().toISOString()
    });
});

// ====================== التحقق من توفر اسم المستخدم ======================
app.get('/api/check-username', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username || username.length < 3) {
            return res.json({ available: false });
        }
        
        if (!dbConnected) {
            return res.json({ available: true });
        }
        
        const existingAdmin = await Admin.findOne({ username: username.toLowerCase() });
        const existingStudent = await Student.findOne({ username: username.toLowerCase() });
        
        const available = !existingAdmin && !existingStudent;
        res.json({ available });
    } catch (error) {
        console.error('Error checking username:', error);
        res.json({ available: true });
    }
});

// ====================== تسجيل طالب جديد ======================
app.post('/api/students/register', async (req, res) => {
    try {
        const { fullName, username, password, grade, studentCode, phone, parentName, parentId } = req.body;
        
        if (!fullName || !username || !password || !grade || !studentCode) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        if (!dbConnected) {
            return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً' });
        }
        
        const existingUser = await Student.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        const existingCode = await Student.findOne({ studentCode });
        if (existingCode) {
            return res.status(400).json({ error: 'رقم الجلوس موجود مسبقاً' });
        }
        
        const hashedPassword = await hashPassword(password);
        
        const student = new Student({
            fullName,
            username: username.toLowerCase(),
            password: hashedPassword,
            grade,
            studentCode,
            role: 'student',
            profile: {
                phone: phone || '',
                parentName: parentName || '',
                parentId: parentId || ''
            }
        });
        
        await student.save();
        
        console.log(`✅ تم إنشاء حساب جديد للطالب: ${fullName} (${username})`);
        res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الطالب:', error);
        res.status(500).json({ error: 'خطأ في إنشاء الحساب: ' + error.message });
    }
});

// ====================== تسجيل الدخول ======================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection?.remoteAddress;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        if (!dbConnected) {
            if (username === 'demo' && password === 'demo123') {
                const token = jwt.sign(
                    { id: 'demo', username: 'demo', type: 'student', fullName: 'طالب تجريبي', studentCode: '12345' },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                setAuthCookie(res, token);
                const csrfToken = crypto.randomBytes(32).toString('hex');
                req.session.csrfToken = csrfToken;
                return res.json({
                    success: true,
                    csrfToken: csrfToken,
                    user: { username: 'demo', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
                });
            }
            return res.status(401).json({ error: 'بيانات غير صحيحة (وضع تجريبي: استخدم demo/demo123)' });
        }

        let user = await Admin.findOne({ username: username.toLowerCase() });
        let userType = 'admin';

        if (!user) {
            user = await Student.findOne({ username: username.toLowerCase() });
            userType = 'student';
        }

        if (!user) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((user.lockedUntil - new Date()) / 60000);
            return res.status(401).json({ error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${remainingMinutes} دقيقة` });
        }

        const isMatch = await verifyPassword(password, user.password);
        
        if (!isMatch) {
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            if (user.failedAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
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

        const refreshToken = jwt.sign(
            { id: user._id, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        user.refreshToken = refreshToken;
        await user.save();

        setAuthCookie(res, token);
        
        const csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.csrfToken = csrfToken;

        res.json({
            success: true,
            csrfToken: csrfToken,
            user: {
                username: user.username,
                fullName: user.fullName,
                type: userType,
                id: user.studentCode || user._id
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
    }
});

// ====================== تجديد التوكن ======================
app.post('/api/refresh-token', async (req, res) => {
    const token = req.cookies?.authToken;
    if (!token) {
        return res.status(401).json({ error: 'لا توجد جلسة' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (dbConnected) {
            let user = await Admin.findById(decoded.id);
            if (!user) user = await Student.findById(decoded.id);
            
            if (!user || !user.refreshToken) {
                return res.status(401).json({ error: 'جلسة غير صالحة' });
            }
        }
        
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
app.get('/api/verify-session', verifyToken, async (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ====================== تسجيل الخروج ======================
app.post('/api/logout', verifyToken, async (req, res) => {
    if (dbConnected) {
        let user = await Admin.findById(req.user.id);
        if (!user) user = await Student.findById(req.user.id);
        if (user) user.refreshToken = null;
        await user?.save();
    }
    
    req.session.destroy();
    res.clearCookie('authToken', { path: '/' });
    res.json({ success: true });
});

// ====================== APIs الخاصة بالطلاب ======================
app.get('/api/admin/students', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const students = await Student.find().select('-password -refreshToken');
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الطلاب' });
    }
});

app.get('/api/students/by-grade/:grade', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const { grade } = req.params;
        const students = await Student.find({ grade }).select('-password -refreshToken');
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الطلاب' });
    }
});

// ====================== تحديث بيانات الطالب ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentCode } = req.params;
        const { profile, subjects, fullName, semester, studentCode: newStudentCode, password } = req.body;
        
        const updateData = {};
        if (profile !== undefined) updateData.profile = profile;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (semester !== undefined) updateData.semester = semester;
        if (newStudentCode !== undefined) updateData.studentCode = newStudentCode;
        if (password !== undefined && password !== '') {
            updateData.password = await hashPassword(password);
        }
        
        const updated = await Student.findOneAndUpdate(
            { studentCode: studentCode },
            { $set: updateData },
            { new: true }
        ).select('-password -refreshToken');
        
        if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث البيانات' });
    }
});

// ====================== حذف الطالب ======================
app.delete('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentCode } = req.params;
        const student = await Student.findOneAndDelete({ studentCode });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        await Violation.deleteMany({ studentId: studentCode });
        res.json({ message: 'تم حذف الطالب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الطالب' });
    }
});

// ====================== الإشعارات ======================
app.get('/api/notifications', requireDb, async (req, res) => { 
    try { 
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications); 
    } catch (error) { 
        res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); 
    } 
});

app.post('/api/notifications', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { text, date } = req.body;
        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        }
        const newNotification = new Notification({ text: text.trim(), date: date || new Date().toLocaleString('ar-EG') });
        await newNotification.save();
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الإشعار' });
    }
});

app.delete('/api/notifications/:id', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Notification.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'الإشعار غير موجود' });
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الإشعار' });
    }
});

// ====================== المخالفات ======================
app.get('/api/violations', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});

app.post('/api/violations', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { studentId, type, reason, penalty, parentSummons, date } = req.body;
        if (!studentId || !reason || !penalty) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        const student = await Student.findOne({ studentCode: studentId });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        
        const newViolation = new Violation({
            studentId, type, reason, penalty,
            parentSummons: parentSummons || false,
            date: date || new Date().toLocaleString('ar-EG')
        });
        await newViolation.save();
        res.json({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: newViolation });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة المخالفة' });
    }
});

app.delete('/api/violations/:id', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Violation.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'المخالفة غير موجودة' });
        res.json({ success: true, message: 'تم حذف المخالفة بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المخالفة' });
    }
});

// ====================== إنشاء مدير تجريبي ======================
app.post('/api/create-test-admin', requireDb, async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin) return res.json({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' });
        const hashedPassword = await hashPassword('admin123');
        const admin = new Admin({ fullName: 'مدير النظام', username: 'admin', password: hashedPassword });
        await admin.save();
        res.json({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// ====================== مسار إفتراضي ======================
app.get('*', (req, res) => {
    res.json({
        message: 'API is running on Vercel',
        endpoints: [
            '/api/test',
            '/api/login',
            '/api/admin/students',
            '/api/students/register',
            '/api/check-username',
            '/api/notifications',
            '/api/violations'
        ]
    });
});

// ====================== Error Handling ======================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: 'حدث خطأ داخلي في السيرفر' });
});

// ====================== التصدير لـ Vercel ======================
module.exports = app;
