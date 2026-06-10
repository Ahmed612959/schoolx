require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const app = express();

// ====================== Supabase Client (معدل لـ Node.js 24) ======================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// تعطيل Realtime عشان يتوافق مع Node.js 24
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    realtime: { enabled: false },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

console.log('✅ Supabase client initialized');
console.log('SUPABASE_URL:', supabaseUrl ? '✅ Found' : '❌ Not found');
console.log('SUPABASE_KEY:', supabaseServiceKey ? '✅ Found' : '❌ Not found');

// ====================== إعدادات trust proxy ======================
app.set('trust proxy', 1);

// ====================== MIDDLEWARE ======================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ====================== CORS شامل ======================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// ====================== Helmet ======================
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
    skip: (req) => req.method === 'OPTIONS'
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

// ====================== دوال التشفير ======================
const SALT_ROUNDS = 10;
const hashPassword = async (password) => {
    if (!password) throw new Error('كلمة المرور مطلوبة');
    return await bcrypt.hash(password, SALT_ROUNDS);
};
const verifyPassword = async (password, hash) => {
    if (!password || !hash) return false;
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        console.error('خطأ في التحقق من كلمة المرور:', error);
        return false;
    }
};

// ====================== Session Setup ======================
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
    name: 'institute.sid'
}));

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
        database: 'Supabase PostgreSQL',
        message: 'API is working with Supabase on Node.js 24!',
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
        
        const { data, error } = await supabase
            .from('students')
            .select('username')
            .eq('username', username.toLowerCase())
            .maybeSingle();
        
        if (error) {
            console.error('Error checking username:', error);
            return res.json({ available: true });
        }
        
        res.json({ available: !data });
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
        
        // التحقق من وجود اسم المستخدم
        const { data: existingUser } = await supabase
            .from('students')
            .select('username')
            .eq('username', username.toLowerCase())
            .maybeSingle();
        
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        // التحقق من وجود رقم الجلوس
        const { data: existingCode } = await supabase
            .from('students')
            .select('student_code')
            .eq('student_code', studentCode)
            .maybeSingle();
        
        if (existingCode) {
            return res.status(400).json({ error: 'رقم الجلوس موجود مسبقاً' });
        }
        
        const hashedPassword = await hashPassword(password);
        
        const { data, error } = await supabase
            .from('students')
            .insert([{
                full_name: fullName,
                username: username.toLowerCase(),
                password: hashedPassword,
                grade: grade,
                student_code: studentCode,
                profile: {
                    phone: phone || '',
                    parentName: parentName || '',
                    parentId: parentId || ''
                }
            }])
            .select();
        
        if (error) throw error;
        
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
        
        console.log(`🔍 محاولة تسجيل دخول: ${username}`);
        
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
        
        // البحث في جدول الأدمن (Supabase)
        const { data: admin, error: adminError } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username.toLowerCase())
            .maybeSingle();
        
        console.log('📦 البحث في جدول الأدمن:', admin ? '✅ موجود' : '❌ غير موجود');
        
        if (admin) {
            console.log('🔐 كلمة المرور المدخلة:', password);
            console.log('🔐 كلمة المرور المخزنة:', admin.password);
            
            const isMatch = await verifyPassword(password, admin.password);
            console.log('✅ تطابق كلمة المرور للأدمن:', isMatch ? 'نعم' : 'لا');
            
            if (isMatch) {
                const token = jwt.sign(
                    { id: admin.id, username: admin.username, type: 'admin', fullName: admin.full_name },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                setAuthCookie(res, token);
                return res.json({
                    success: true,
                    user: {
                        username: admin.username,
                        fullName: admin.full_name,
                        type: 'admin',
                        id: admin.id
                    }
                });
            }
        }
        
        // البحث في جدول الطلاب (Supabase)
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('*')
            .eq('username', username.toLowerCase())
            .maybeSingle();
        
        console.log('📦 البحث في جدول الطلاب:', student ? '✅ موجود' : '❌ غير موجود');
        
        if (student) {
            console.log('🔐 كلمة المرور المدخلة:', password);
            console.log('🔐 كلمة المرور المخزنة:', student.password);
            
            const isMatch = await verifyPassword(password, student.password);
            console.log('✅ تطابق كلمة المرور للطالب:', isMatch ? 'نعم' : 'لا');
            
            if (isMatch) {
                const token = jwt.sign(
                    { id: student.id, username: student.username, type: 'student', fullName: student.full_name, studentCode: student.student_code },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                setAuthCookie(res, token);
                return res.json({
                    success: true,
                    user: {
                        username: student.username,
                        fullName: student.full_name,
                        type: 'student',
                        id: student.student_code
                    }
                });
            }
        }
        
        console.log('❌ فشل تسجيل الدخول: بيانات غير صحيحة');
        return res.status(401).json({ error: 'بيانات غير صحيحة (admin/admin123 أو student/student123)' });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
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
        const { data: students, error } = await supabase
            .from('students')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // إخفاء كلمة المرور
        const safeStudents = students?.map(s => {
            delete s.password;
            return s;
        }) || [];
        
        res.json(safeStudents);
    } catch (error) {
        console.error('خطأ في جلب الطلاب:', error);
        res.json([
            { fullName: 'أحمد محمد (تجريبي)', username: 'ahmed', studentCode: '2024001', grade: 'first', profile: { phone: '01012345678', parentName: 'محمد أحمد', parentId: '12345678901234' } },
            { fullName: 'سارة علي (تجريبي)', username: 'sara', studentCode: '2024002', grade: 'second', profile: { phone: '01087654321', parentName: 'علي محمد', parentId: '12345678905678' } }
        ]);
    }
});

// ====================== تحديث بيانات الطالب ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentCode } = req.params;
        const { profile, subjects, fullName, semester, studentCode: newStudentCode, password } = req.body;
        
        const updateData = {};
        if (fullName !== undefined) updateData.full_name = fullName;
        if (profile !== undefined) updateData.profile = profile;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (semester !== undefined) updateData.semester = semester;
        if (newStudentCode !== undefined) updateData.student_code = newStudentCode;
        if (password !== undefined && password !== '') {
            updateData.password = await hashPassword(password);
        }
        
        const { data, error } = await supabase
            .from('students')
            .update(updateData)
            .eq('student_code', studentCode)
            .select();
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        delete data[0].password;
        res.json(data[0]);
    } catch (error) {
        console.error('خطأ في تحديث الطالب:', error);
        res.status(500).json({ error: 'خطأ في تحديث البيانات' });
    }
});

// ====================== حذف الطالب ======================
app.delete('/api/students/:studentCode', verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentCode } = req.params;
        
        const { error: studentError } = await supabase
            .from('students')
            .delete()
            .eq('student_code', studentCode);
        
        if (studentError) throw studentError;
        
        // حذف المخالفات المرتبطة
        await supabase
            .from('violations')
            .delete()
            .eq('student_id', studentCode);
        
        res.json({ message: 'تم حذف الطالب بنجاح' });
    } catch (error) {
        console.error('خطأ في حذف الطالب:', error);
        res.status(500).json({ error: 'خطأ في حذف الطالب' });
    }
});

// ====================== الإشعارات ======================
app.get('/api/notifications', async (req, res) => { 
    try {
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error || !notifications || notifications.length === 0) {
            return res.json([
                { id: '1', text: '📢 اختبارات الفصل الدراسي الأول تبدأ الأسبوع القادم', date: '2024-01-15' },
                { id: '2', text: '🎓 موعد تسليم مشاريع التخرج 30 يناير', date: '2024-01-14' }
            ]);
        }
        res.json(notifications); 
    } catch (error) { 
        res.json([
            { id: '1', text: '📢 اختبارات الفصل الدراسي الأول تبدأ الأسبوع القادم', date: '2024-01-15' }
        ]);
    } 
});

app.post('/api/notifications', verifyToken, isAdmin, async (req, res) => {
    try {
        const { text, date } = req.body;
        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        }
        
        const { data, error } = await supabase
            .from('notifications')
            .insert([{ 
                text: text.trim(), 
                date: date || new Date().toLocaleString('ar-EG') 
            }])
            .select();
        
        if (error) throw error;
        
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: data[0] });
    } catch (error) {
        console.error('خطأ في إضافة الإشعار:', error);
        res.status(500).json({ error: 'خطأ في إضافة الإشعار' });
    }
});

app.delete('/api/notifications/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await supabase
            .from('notifications')
            .delete()
            .eq('id', id);
        
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) {
        console.error('خطأ في حذف الإشعار:', error);
        res.status(500).json({ error: 'خطأ في حذف الإشعار' });
    }
});

// ====================== المخالفات ======================
app.get('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        const { data: violations, error } = await supabase
            .from('violations')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error || !violations || violations.length === 0) {
            return res.json([
                { id: '1', studentId: '2024001', reason: 'تأخر متكرر', penalty: 'إنذار', date: '2024-01-10' }
            ]);
        }
        res.json(violations);
    } catch (error) {
        res.json([
            { id: '1', studentId: '2024001', reason: 'تأخر متكرر', penalty: 'إنذار', date: '2024-01-10' }
        ]);
    }
});

app.post('/api/violations', verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentId, type, reason, penalty, parentSummons, date } = req.body;
        if (!studentId || !reason || !penalty) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من وجود الطالب
        const { data: student } = await supabase
            .from('students')
            .select('student_code')
            .eq('student_code', studentId)
            .maybeSingle();
        
        if (!student) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        const { data, error } = await supabase
            .from('violations')
            .insert([{
                student_id: studentId,
                type: type || 'behavior',
                reason: reason,
                penalty: penalty,
                parent_summons: parentSummons || false,
                date: date || new Date().toLocaleString('ar-EG')
            }])
            .select();
        
        if (error) throw error;
        
        res.json({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: data[0] });
    } catch (error) {
        console.error('خطأ في إضافة المخالفة:', error);
        res.status(500).json({ error: 'خطأ في إضافة المخالفة' });
    }
});

app.delete('/api/violations/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await supabase
            .from('violations')
            .delete()
            .eq('id', id);
        
        res.json({ success: true, message: 'تم حذف المخالفة بنجاح' });
    } catch (error) {
        console.error('خطأ في حذف المخالفة:', error);
        res.status(500).json({ error: 'خطأ في حذف المخالفة' });
    }
});

// ====================== إنشاء مدير تجريبي ======================
app.post('/api/create-test-admin', async (req, res) => {
    try {
        const hashedPassword = await hashPassword('admin123');
        
        const { data: existingAdmin } = await supabase
            .from('admins')
            .select('username')
            .eq('username', 'admin')
            .maybeSingle();
        
        if (existingAdmin) {
            return res.json({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' });
        }
        
        await supabase
            .from('admins')
            .insert([{
                full_name: 'مدير النظام',
                username: 'admin',
                password: hashedPassword,
                role: 'admin'
            }]);
        
        res.json({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' });
    } catch (error) { 
        console.error('خطأ في إنشاء المدير:', error);
        res.json({ message: 'وضع تجريبي - admin/admin123', username: 'admin', password: 'admin123' });
    }
});

// ====================== مسار افتراضي ======================
app.get('*', (req, res) => {
    res.json({
        message: 'معهد رعاية الضبعية - API with Supabase',
        status: 'running',
        version: '2.0.0',
        node_version: '24.x',
        database: 'Supabase PostgreSQL'
    });
});

// ====================== تصدير لـ Vercel ======================
module.exports = app;
