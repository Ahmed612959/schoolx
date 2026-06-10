require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// ====================== إعدادات trust proxy (مهم لـ Vercel) ======================
app.set('trust proxy', 1);

// ====================== MIDDLEWARE ======================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ====================== CORS شامل لجميع الطلبات ======================
// السماح لجميع الأصول (الحل الأبسط لـ Vercel)
app.use((req, res, next) => {
    // السماح لأي Origin
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
    
    // معالجة طلبات OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// CORS باستخدام المكتبة كطبقة إضافية
app.use(cors({
    origin: function(origin, callback) {
        // السماح لجميع الأصول في بيئة Vercel
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With', 'Accept']
}));

// ====================== Helmet (مخفف) ======================
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
}));

// ====================== Rate Limiting ======================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'لقد تجاوزت الحد المسموح من الطلبات' },
    trustProxy: true,
    skip: (req) => req.method === 'OPTIONS' // تخطي OPTIONS requests
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
    trustProxy: true,
    skip: (req) => req.method === 'OPTIONS'
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
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}

async function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
}

// ====================== Session Setup ======================
const MemoryStore = require('express-session').MemoryStore;

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore(),
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'none'
    },
    name: 'school_session'
}));

// ====================== الاتصال بقاعدة البيانات ======================
let dbConnected = false;
let Admin, Student, Violation, Notification, Attendance, Exam, ExamResult, File;

if (MONGODB_URI && MONGODB_URI !== '') {
    console.log('📡 Connecting to MongoDB...');
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    })
    .then(() => {
        console.log('✅ MongoDB connected successfully');
        dbConnected = true;
        
        // تعريف النماذج
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
            filename: { type: String, required: true },
            originalName: { type: String, required: true },
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
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));
}

// ====================== دوال مساعدة ======================
function requireDb(req, res, next) {
    if (!dbConnected) {
        return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً' });
    }
    next();
}

function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
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

// ====================== Test endpoint ======================
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        mongodb_status: dbConnected ? 'connected' : 'disconnected',
        message: 'API is working on Vercel!',
        cors_headers: 'enabled'
    });
});

// ====================== التحقق من توفر اسم المستخدم ======================
app.get('/api/check-username', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username || username.length < 3) {
            return res.json({ available: false });
        }
        
        if (!dbConnected || !Student) {
            return res.json({ available: true });
        }
        
        const existingStudent = await Student.findOne({ username: username.toLowerCase() });
        
        const available = !existingStudent;
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
        
        if (!dbConnected || !Student) {
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
        
        console.log(`✅ تم إنشاء حساب جديد للطالب: ${fullName}`);
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
        
        if (!username || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        // وضع تجريبي - admin
        if (username === 'admin' && password === 'admin123') {
            const token = jwt.sign(
                { id: 'admin1', username: 'admin', type: 'admin', fullName: 'مدير النظام' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            setAuthCookie(res, token);
            return res.json({
                success: true,
                user: { username: 'admin', fullName: 'مدير النظام', type: 'admin', id: 'admin1' }
            });
        }
        
        // وضع تجريبي - student
        if (username === 'student' && password === 'student123') {
            const token = jwt.sign(
                { id: 'student1', username: 'student', type: 'student', fullName: 'طالب تجريبي', studentCode: '12345' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            setAuthCookie(res, token);
            return res.json({
                success: true,
                user: { username: 'student', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
            });
        }
        
        // وضع مع قاعدة البيانات
        if (dbConnected && Student) {
            let user = await Admin?.findOne({ username: username.toLowerCase() });
            let userType = 'admin';

            if (!user) {
                user = await Student.findOne({ username: username.toLowerCase() });
                userType = 'student';
            }

            if (user) {
                const isMatch = await verifyPassword(password, user.password);
                
                if (isMatch) {
                    const token = jwt.sign(
                        { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );
                    setAuthCookie(res, token);
                    return res.json({
                        success: true,
                        user: {
                            username: user.username,
                            fullName: user.fullName,
                            type: userType,
                            id: user.studentCode || user._id
                        }
                    });
                }
            }
        }
        
        return res.status(401).json({ error: 'بيانات غير صحيحة (admin/admin123 أو student/student123)' });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

// ====================== التحقق من الجلسة ======================
app.get('/api/verify-session', verifyToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ====================== تسجيل الخروج ======================
app.post('/api/logout', (req, res) => {
    res.clearCookie('authToken', { path: '/' });
    res.json({ success: true });
});

// ====================== جلب الطلاب (للأدمن) ======================
app.get('/api/admin/students', verifyToken, isAdmin, async (req, res) => {
    try {
        if (!dbConnected || !Student) {
            return res.json([
                { fullName: 'أحمد محمد (تجريبي)', username: 'ahmed', studentCode: '2024001', grade: 'first', profile: { phone: '01012345678', parentName: 'محمد أحمد', parentId: '12345678901234' } },
                { fullName: 'سارة علي (تجريبي)', username: 'sara', studentCode: '2024002', grade: 'second', profile: { phone: '01087654321', parentName: 'علي محمد', parentId: '12345678905678' } }
            ]);
        }
        const students = await Student.find().select('-password -refreshToken');
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
app.get('/api/notifications', async (req, res) => { 
    try {
        if (!dbConnected || !Notification) {
            return res.json([
                { id: '1', text: '📢 اختبارات الفصل الدراسي الأول تبدأ الأسبوع القادم', date: '2024-01-15' },
                { id: '2', text: '🎓 موعد تسليم مشاريع التخرج 30 يناير', date: '2024-01-14' }
            ]);
        }
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications); 
    } catch (error) { 
        res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); 
    } 
});

app.post('/api/notifications', verifyToken, isAdmin, async (req, res) => {
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

app.delete('/api/notifications/:id', verifyToken, isAdmin, async (req, res) => {
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
app.get('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        if (!dbConnected || !Violation) {
            return res.json([
                { id: '1', studentId: '2024001', reason: 'تأخر متكرر', penalty: 'إنذار', date: '2024-01-10' }
            ]);
        }
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});

app.post('/api/violations', verifyToken, isAdmin, async (req, res) => {
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

app.delete('/api/violations/:id', verifyToken, isAdmin, async (req, res) => {
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
app.post('/api/create-test-admin', async (req, res) => {
    try {
        if (!dbConnected || !Admin) {
            return res.json({ message: 'وضع تجريبي - admin/admin123', username: 'admin', password: 'admin123' });
        }
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

// ====================== مسار افتراضي ======================
app.get('*', (req, res) => {
    res.json({
        message: 'معهد رعاية الضبعية - API',
        status: 'running',
        version: '1.0.0',
        endpoints: ['/api/test', '/api/login', '/api/admin/students', '/api/notifications', '/api/violations']
    });
});

// ====================== تصدير لـ Vercel ======================
module.exports = app;
