// Home.js - نسخة معدلة (إزالة آخر الملفات، المرشد يظهر للجميع)

const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// ====================== دوال مساعدة ======================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function getLoggedInUser() {
    const userStr = sessionStorage.getItem('userData');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: message,
            duration: 4000,
            gravity: "top",
            position: "right",
            backgroundColor: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
            style: { fontFamily: '"Tajawal", sans-serif', fontSize: '18px', direction: 'rtl', borderRadius: '12px', padding: '16px 24px' }
        }).showToast();
    } else {
        alert(message);
    }
}

async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
    });
    
    if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('انتهت الجلسة');
    }
    
    return response;
}

// ====================== المواد والدرجات ======================
const subjectMaxGrades = {
    "اللغة العربية": 20,
    "اللغة الإنجليزية": 20,
    "علوم تطبيقية": 40,
    "طب باطنة": 20,
    "تمريض باطني جراحي": 24,
    "حاسب آلي": 20
};

const TOTAL_POSSIBLE = 144;
const orderedSubjects = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي"];
const extraSubjectsList = ["الدين"];

function calculateStudentPercentage(student) {
    if (!student.subjects || student.subjects.length === 0) return 0;
    let totalEarned = 0;
    student.subjects.forEach(subject => {
        if (subjectMaxGrades[subject.name]) {
            totalEarned += subject.grade || 0;
        }
    });
    return (totalEarned / TOTAL_POSSIBLE) * 100;
}

function calculateStudentTotal(student) {
    if (!student.subjects) return 0;
    let total = 0;
    student.subjects.forEach(subject => {
        if (subjectMaxGrades[subject.name]) {
            total += subject.grade || 0;
        }
    });
    return total;
}

// ====================== جلب البيانات ======================
async function fetchStudentByCode(studentCode) {
    try {
        const response = await apiRequest(`/api/student/by-code/${encodeURIComponent(studentCode)}`);
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('خطأ في جلب الطالب:', error);
        return null;
    }
}

async function fetchViolationsForStudent(studentId) {
    try {
        const response = await apiRequest(`/api/violations/student/${encodeURIComponent(studentId)}`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('خطأ في جلب المخالفات:', error);
        return [];
    }
}

async function loadNotifications() {
    try {
        const response = await fetch(`${BASE_URL}/api/notifications`);
        if (response.ok) {
            const notifications = await response.json();
            const tableBody = document.getElementById('notifications-table-body');
            if (tableBody) {
                tableBody.innerHTML = '';
                if (!notifications.length) {
                    tableBody.innerHTML = '<tr><td colspan="2">لا توجد إشعارات حاليًا</td><tr>';
                    return;
                }
                notifications.forEach(n => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${n.text || 'إشعار بدون نص'}</td><td>${n.date || 'غير محدد'}</td>`;
                    tableBody.appendChild(row);
                });
            }
        }
    } catch (error) {
        console.error('خطأ في تحميل الإشعارات:', error);
    }
}

// ====================== الحضور ======================
let attendanceStats = null;

async function fetchAttendanceStats(studentCode) {
    try {
        const response = await apiRequest(`/api/attendance/student/${studentCode}?t=${Date.now()}`);
        if (response.ok) {
            const attendanceRecords = await response.json();
            if (!attendanceRecords.length) {
                attendanceStats = null;
                return null;
            }
            const present = attendanceRecords.filter(a => a.status === 'present').length;
            const absent = attendanceRecords.filter(a => a.status === 'absent').length;
            const late = attendanceRecords.filter(a => a.status === 'late').length;
            const total = attendanceRecords.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            const lastPresent = attendanceRecords.filter(a => a.status === 'present').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const lastAbsent = attendanceRecords.filter(a => a.status === 'absent').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            
            attendanceStats = {
                present, absent, late, total, percentage: percentage.toFixed(1),
                lastPresentDate: lastPresent ? formatDate(lastPresent.date) : null,
                lastAbsentDate: lastAbsent ? formatDate(lastAbsent.date) : null
            };
            return attendanceStats;
        }
        return null;
    } catch (error) {
        console.error('خطأ في جلب إحصائيات الحضور:', error);
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function renderAttendanceStats() {
    const section = document.getElementById('attendanceStatsSection');
    if (!section) return;
    const user = getLoggedInUser();
    if (!user || user.type !== 'student') {
        section.style.display = 'none';
        return;
    }
    
    if (!attendanceStats) {
        section.style.display = 'block';
        const noMsgDiv = document.getElementById('noAttendanceMessage');
        if (noMsgDiv) noMsgDiv.style.display = 'block';
        const grid = document.querySelector('.attendance-stats-grid');
        const datesDiv = document.querySelector('.attendance-dates');
        if (grid) grid.style.display = 'none';
        if (datesDiv) datesDiv.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    const noMsgDiv = document.getElementById('noAttendanceMessage');
    if (noMsgDiv) noMsgDiv.style.display = 'none';
    const grid = document.querySelector('.attendance-stats-grid');
    const datesDiv = document.querySelector('.attendance-dates');
    if (grid) grid.style.display = 'grid';
    if (datesDiv) datesDiv.style.display = 'flex';
    
    document.getElementById('presentCount').textContent = attendanceStats.present;
    document.getElementById('absentCount').textContent = attendanceStats.absent;
    document.getElementById('lateCount').textContent = attendanceStats.late;
    document.getElementById('attendancePercentage').textContent = attendanceStats.percentage + '%';
    const lastPresentSpan = document.getElementById('lastPresentDate');
    const lastAbsentSpan = document.getElementById('lastAbsentDate');
    if (lastPresentSpan) lastPresentSpan.innerHTML = attendanceStats.lastPresentDate || 'لم يتم تسجيل بعد';
    if (lastAbsentSpan) lastAbsentSpan.innerHTML = attendanceStats.lastAbsentDate || 'لم يتم تسجيل بعد';
}

// ====================== لوحة التحكم ======================
async function renderDashboard() {
    const user = getLoggedInUser();
    const dashboard = document.getElementById('dashboard');
    
    if (!dashboard || !user || user.type !== 'student') {
        if (dashboard) dashboard.style.display = 'none';
        const attendanceSection = document.getElementById('attendanceStatsSection');
        if (attendanceSection) attendanceSection.style.display = 'none';
        return;
    }
    
    const student = await fetchStudentByCode(user.id);
    if (!student) {
        dashboard.style.display = 'none';
        return;
    }
    
    dashboard.style.display = 'block';
    
    if (student.subjects && student.subjects.length > 0) {
        const percentage = calculateStudentPercentage(student);
        const total = calculateStudentTotal(student);
        const religionGrade = student.subjects?.find(s => s.name === 'الدين')?.grade || 0;
        
        document.getElementById('student-percentage').innerHTML = `📊 نسبة نجاحك: <strong>${percentage.toFixed(1)}%</strong><br>
        <small>(المجموع: ${total} / ${TOTAL_POSSIBLE})</small>`;
        document.getElementById('class-average').innerHTML = `📈 --`;
        
        let religionDiv = document.getElementById('religionDisplay');
        if (!religionDiv) {
            religionDiv = document.createElement('div');
            religionDiv.id = 'religionDisplay';
            religionDiv.style.cssText = 'margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 8px; text-align: center;';
            const statsDiv = document.querySelector('.stats');
            if (statsDiv) statsDiv.appendChild(religionDiv);
        }
        religionDiv.innerHTML = `📖 مادة الدين: <strong>${religionGrade} / 32</strong> (خارج المجموع)`;
        
        const subjectsWithGrades = orderedSubjects.map(subjName => {
            const subject = student.subjects?.find(s => s.name === subjName);
            return { name: subjName, grade: subject ? (subject.grade || 0) : 0 };
        });
        
        const ctx = document.getElementById('gradesChart')?.getContext('2d');
        if (ctx && typeof Chart !== 'undefined') {
            if (window.gradesChart) window.gradesChart.destroy();
            window.gradesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: subjectsWithGrades.map(s => s.name),
                    datasets: [{
                        label: 'درجاتك',
                        data: subjectsWithGrades.map(s => s.grade),
                        backgroundColor: 'rgba(212, 175, 55, 0.8)',
                        borderColor: '#d4af37',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: { y: { beginAtZero: true, max: 100 } },
                    plugins: { legend: { display: false } }
                }
            });
        }
    } else {
        document.getElementById('student-percentage').innerHTML = `📊 لا توجد درجات مسجلة حتى الآن`;
        document.getElementById('class-average').innerHTML = `📈 --`;
    }
    
    if (student.studentCode) {
        await fetchAttendanceStats(student.studentCode);
        renderAttendanceStats();
    }
}

// ====================== عرض النتيجة ======================
function renderStudentResult(student, studentViolations, resultBody, violationsBody) {
    if (!student.subjects || student.subjects.length === 0) {
        resultBody.innerHTML = '<tr><td colspan="4">📭 لا توجد درجات مسجلة لهذا الطالب</td></tr>';
        if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات</td></tr>';
        return;
    }
    
    let total = 0;
    const subjectGrades = [];
    
    orderedSubjects.forEach(subjName => {
        const subject = student.subjects.find(s => s.name === subjName);
        const grade = subject ? (subject.grade || 0) : 0;
        subjectGrades.push({ name: subjName, grade: grade, max: subjectMaxGrades[subjName] });
        total += grade;
    });
    
    extraSubjectsList.forEach(subjName => {
        const subject = student.subjects.find(s => s.name === subjName);
        const grade = subject ? (subject.grade || 0) : 0;
        subjectGrades.push({ name: `${subjName} (خارج المجموع)`, grade: grade, max: 32, isExtra: true });
    });
    
    const percentage = (total / TOTAL_POSSIBLE) * 100;
    let percentageClass = percentage >= 85 ? 'high-percentage' : (percentage >= 60 ? 'medium-percentage' : 'low-percentage');
    
    const labels = ['الاسم', 'رقم الجلوس', ...subjectGrades.map(s => s.name)];
    const values = [student.fullName, student.studentCode, ...subjectGrades.map(s => `${s.grade} / ${s.max}`)];
    
    resultBody.innerHTML = `<tr>
        <td>${labels.map((l, i) => i < labels.length - 1 ? l + '<hr>' : l).join('')}</td>
        <td>${values.map((v, i) => i < values.length - 1 ? v + '<hr>' : v).join('')}</td>
        <td>${total} / ${TOTAL_POSSIBLE}</td>
        <td class="${percentageClass}">${percentage.toFixed(1)}%</td>
    </tr>`;
    
    if (violationsBody) {
        if (studentViolations && studentViolations.length) {
            violationsBody.innerHTML = studentViolations.map(v => `<tr>
                <td>${v.type === 'warning' ? '⚠️ إنذار' : '🚫 مخالفة'}</td>
                <td>${v.reason}</td>
                <td>${v.penalty}</td>
                <td>${v.parentSummons ? '✅ نعم' : '❌ لا'}</td>
                <td>${v.date}</td>
            </tr>`).join('');
        } else {
            violationsBody.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات مسجلة</td></tr>';
        }
    }
}

// ====================== البحث ======================
function setupSearchForm() {
    const form = document.getElementById('search-form');
    if (!form) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('search-name')?.value.trim();
        const studentCode = document.getElementById('search-id')?.value.trim();
        const resultBody = document.getElementById('result-table-body');
        const violationsBody = document.getElementById('violations-table-body');
        
        if (!name || !studentCode) {
            showToast('⚠️ يرجى إدخال الاسم ورقم الجلوس معًا!', 'error');
            return;
        }
        
        showToast('🔍 جاري البحث...', 'info');
        
        try {
            const student = await fetchStudentByCode(studentCode);
            
            if (student && student.fullName.includes(name)) {
                const studentViolations = await fetchViolationsForStudent(student.studentCode);
                renderStudentResult(student, studentViolations, resultBody, violationsBody);
                showToast('✅ تم العثور على الطالب بنجاح!', 'success');
            } else {
                resultBody.innerHTML = '<tr><td colspan="4">❌ لا توجد نتيجة بهذا الاسم ورقم الجلوس!</td></tr>';
                violationsBody.innerHTML = '<tr><td colspan="5">❌ لا توجد نتيجة!</td></tr>';
                showToast('❌ الطالب غير موجود! تأكد من رقم الجلوس', 'error');
            }
        } catch (error) {
            console.error('خطأ في البحث:', error);
            resultBody.innerHTML = '<tr><td colspan="4">❌ حدث خطأ في البحث!</td></tr>';
            violationsBody.innerHTML = '<tr><td colspan="5">❌ حدث خطأ!</td></tr>';
            showToast('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        }
    });
}

// ====================== شريط التنقل ======================
function renderNavbar() {
    const user = getLoggedInUser();
    const navBar = document.getElementById('nav-bar');
    if (!navBar) return;
    
    const links = [
        { href: 'index.html', icon: 'fa-solid fa-house', title: 'الرئيسية' },
        { href: 'Home.html', icon: 'fa-solid fa-chart-simple', title: 'النتائج' },
        { href: 'profile.html', icon: 'fa-solid fa-user', title: 'الملف الشخصي' },
        { href: 'search-monthly.html', icon: 'fa-solid fa-magnifying-glass', title: 'نتيجة الشهري' },
        { href: 'First-Gards.html', icon: 'fa-solid fa-graduation-cap', title: 'نتيجة الصف الاول' },
        { href: 'exams.html', icon: 'fa-solid fa-book-open', title: 'الاختبارات' },
        { href: 'file-library.html', icon: 'fas fa-folder-open', title: 'المكتبة' },
        { href: 'developer.html', icon: 'fa-solid fa-microchip', title: 'عن المطور' }
    ];
    
    if (user?.type === 'admin') {
        links.push({ href: 'admin.html', icon: 'fas fa-cogs', title: 'لوحة التحكم' });
    }
    
    navBar.innerHTML = links.map(l => `<a href="${l.href}" title="${l.title}"><i class="${l.icon}"></i></a>`).join('');
}

// ====================== رسالة الترحيب ======================
function renderWelcomeMessage() {
    const welcomeDiv = document.querySelector('.welcome-message');
    const user = getLoggedInUser();
    if (!welcomeDiv) return;
    
    if (user) {
        const name = user.fullName || user.username;
        welcomeDiv.textContent = user.type === 'admin' ? `👋 أهلًا يا قائد العمليات، ${name}! 🛠️` : `🎉 مرحبًا يا نجم، ${name}! نتايجك في انتظارك! 📚`;
    } else {
        welcomeDiv.textContent = '👋 مرحبًا بك! سجل الدخول لرؤية نتائجك';
    }
}

// ====================== الجلسة والخروج ======================
async function verifySession() {
    try {
        const response = await fetch(`${BASE_URL}/api/verify-session`, {
            credentials: 'include'
        });
        if (response.ok) {
            return true;
        }
    } catch (error) {
        console.error('خطأ في التحقق من الجلسة:', error);
        if (window.location.hostname === 'localhost') {
            return true;
        }
    }
    
    window.location.href = 'login.html';
    return false;
}

async function logout() {
    try {
        await fetch(`${BASE_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) {}
    finally {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

function setupLogoutButton() {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

// ====================== مرشد المكتبة (تم نقله إلى HTML) ======================
// تم نقل منطق المرشد إلى HTML لضمان عمله بشكل صحيح
function initLibraryTour() {
    // الوظيفة فارغة - المرشد يعمل من HTML الآن
    console.log('Tour handled by HTML script');
}



// ====================== البوت المساعد الذكي (نسخة ثابتة) ======================
class SmartAssistantBot {
    constructor() {
        this.bot = document.getElementById('liveBot');
        this.bubble = document.getElementById('botSpeechBubble');
        this.bubbleText = document.getElementById('botSpeechText');
        this.screenMsg = document.getElementById('botScreenMsg');
        
        this.isSpeaking = false;
        this.originalPosition = { right: 20, bottom: 20 };
        this.userName = this.getUserName();
        
        // حقول الصفحة
        this.fields = {
            name: document.getElementById('search-name'),
            code: document.getElementById('search-id'),
            submit: document.querySelector('.submit-btn')
        };
        
        this.init();
    }
    
    getUserName() {
        const user = getLoggedInUser();
        return user?.fullName || user?.username || 'صديقي';
    }
    
    init() {
        this.resetPosition();
        this.attachFieldListeners();
        this.welcomeUser();
        
        // مراقبة أخطاء البحث
        this.observeSearchErrors();
        
        console.log('🤖 Smart Assistant Bot initialized');
    }
    
    resetPosition() {
        this.bot.style.bottom = this.originalPosition.bottom + 'px';
        this.bot.style.right = this.originalPosition.right + 'px';
        this.bot.style.left = 'auto';
        this.bot.style.top = 'auto';
    }
    
    // الانتقال إلى حقل معين
    moveToField(fieldElement) {
        if (!fieldElement) return;
        
        const fieldRect = fieldElement.getBoundingClientRect();
        const botRect = this.bot.getBoundingClientRect();
        
        // حساب الموقع الجديد للبوت بجانب الحقل
        let targetRight = window.innerWidth - fieldRect.right + 10;
        let targetBottom = window.innerHeight - fieldRect.top + 10;
        
        // التأكد من عدم خروج البوت عن الشاشة
        targetRight = Math.max(10, Math.min(window.innerWidth - 100, targetRight));
        targetBottom = Math.max(10, Math.min(window.innerHeight - 150, targetBottom));
        
        this.bot.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        this.bot.style.right = targetRight + 'px';
        this.bot.style.bottom = targetBottom + 'px';
        this.bot.style.left = 'auto';
        this.bot.style.top = 'auto';
        
        // العودة إلى المكان الأصلي بعد 3 ثواني
        setTimeout(() => {
            this.resetPosition();
        }, 4000);
    }
    
    pointTo(element) {
        if (!element) return;
        
        // تحريك الذراع للإشارة
        const rightArm = document.querySelector('.bot-arm-right');
        if (rightArm) {
            rightArm.classList.add('pointing');
            setTimeout(() => {
                rightArm.classList.remove('pointing');
            }, 800);
        }
        
        // إضاءة الحقل
        element.classList.add('field-error');
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        setTimeout(() => {
            element.classList.remove('field-error');
        }, 2000);
    }
    
    attachFieldListeners() {
        // عند ترك حقل الاسم بدون كتابة
        if (this.fields.name) {
            this.fields.name.addEventListener('blur', () => {
                if (!this.fields.name.value.trim()) {
                    this.moveToField(this.fields.name);
                    this.pointTo(this.fields.name);
                    this.speak('📝 من فضلك اكتب اسم الطالب في هذا الحقل', 3500);
                    this.setEmotion('angry');
                } else {
                    this.setEmotion('happy');
                }
            });
        }
        
        // عند ترك حقل رقم الجلوس بدون كتابة
        if (this.fields.code) {
            this.fields.code.addEventListener('blur', () => {
                if (!this.fields.code.value.trim()) {
                    this.moveToField(this.fields.code);
                    this.pointTo(this.fields.code);
                    this.speak('🔢 من فضلك أدخل رقم الجلوس هنا', 3500);
                    this.setEmotion('angry');
                } else if (this.fields.code.value.length < 5 || this.fields.code.value.length > 7) {
                    this.moveToField(this.fields.code);
                    this.pointTo(this.fields.code);
                    this.speak('⚠️ رقم الجلوس غير صحيح! يجب أن يكون 5-7 أرقام', 4000);
                    this.setEmotion('angry');
                } else {
                    this.setEmotion('happy');
                }
            });
        }
        
        // عند الضغط على زر البحث بدون بيانات
        if (this.fields.submit) {
            this.fields.submit.addEventListener('click', (e) => {
                if (!this.fields.name.value.trim() || !this.fields.code.value.trim()) {
                    e.preventDefault();
                    if (!this.fields.name.value.trim()) {
                        this.moveToField(this.fields.name);
                        this.pointTo(this.fields.name);
                        this.speak(`✏️ يا ${this.userName}، اكتب اسم الطالب أولاً`, 3500);
                    } else if (!this.fields.code.value.trim()) {
                        this.moveToField(this.fields.code);
                        this.pointTo(this.fields.code);
                        this.speak(`🔢 يا ${this.userName}، أدخل رقم الجلوس`, 3500);
                    }
                    this.setEmotion('angry');
                } else {
                    this.speak('🔍 جاري البحث... انتظر قليلاً', 2000);
                    this.setEmotion('excited');
                }
            });
        }
    }
    
    observeSearchErrors() {
        // مراقبة ظهور رسالة خطأ بعد البحث
        const observer = new MutationObserver((mutations) => {
            const resultBody = document.getElementById('result-table-body');
            if (resultBody && resultBody.innerHTML.includes('لا توجد نتيجة')) {
                // تحديد الحقل الذي به مشكلة
                if (!this.fields.name.value.trim()) {
                    this.moveToField(this.fields.name);
                    this.pointTo(this.fields.name);
                    this.speak('⚠️ لم يتم العثور على الطالب! تأكد من كتابة الاسم بشكل صحيح', 4500);
                } else if (!this.fields.code.value.trim()) {
                    this.moveToField(this.fields.code);
                    this.pointTo(this.fields.code);
                    this.speak('⚠️ لم يتم العثور على الطالب! رقم الجلوس غير صحيح', 4500);
                } else {
                    this.moveToField(this.fields.code);
                    this.pointTo(this.fields.code);
                    this.speak('😕 لم يتم العثور على طالب بهذا الاسم ورقم الجلوس. تأكد من البيانات', 5000);
                }
                this.setEmotion('sad');
            } else if (resultBody && !resultBody.innerHTML.includes('قم بالبحث') && !resultBody.innerHTML.includes('لا توجد')) {
                this.speak('🎉 تهانينا! تم العثور على النتيجة بنجاح', 3500);
                this.dance();
                this.setEmotion('happy');
            }
        });
        
        const target = document.getElementById('result-table-body');
        if (target) {
            observer.observe(target, { childList: true, subtree: true });
        }
    }
    
    speak(message, duration = 3500) {
        if (this.isSpeaking) return;
        
        this.isSpeaking = true;
        this.bubbleText.textContent = message;
        this.screenMsg.textContent = message.substring(0, 15) + (message.length > 15 ? '..' : '');
        
        // تحريك الشفاه أثناء الكلام
        this.setEmotion('speaking');
        
        this.bubble.classList.remove('show');
        setTimeout(() => {
            this.bubble.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            this.bubble.classList.remove('show');
            this.isSpeaking = false;
            this.setEmotion('happy');
        }, duration);
    }
    
    setEmotion(emotion) {
        const bot = document.querySelector('.live-bot');
        const mouth = document.querySelector('.bot-mouth-line');
        const eyebrows = document.querySelectorAll('.bot-eyebrow');
        
        bot.classList.remove('angry', 'happy', 'sad', 'speaking');
        
        switch(emotion) {
            case 'happy':
                bot.classList.add('happy');
                if (mouth) mouth.style.animation = '';
                break;
            case 'sad':
                bot.classList.add('sad');
                if (mouth) mouth.style.animation = '';
                break;
            case 'angry':
                bot.classList.add('angry');
                if (mouth) mouth.style.animation = '';
                break;
            case 'speaking':
                bot.classList.add('speaking');
                break;
            default:
                bot.classList.add('happy');
        }
    }
    
    dance() {
        const bot = this.bot;
        bot.style.animation = 'none';
        setTimeout(() => {
            bot.style.animation = 'headBob 0.1s infinite';
        }, 10);
        
        const rightArm = document.querySelector('.bot-arm-right');
        if (rightArm) {
            rightArm.style.animation = 'point 0.3s 3';
        }
        
        setTimeout(() => {
            bot.style.animation = 'headBob 2s ease-in-out infinite';
            if (rightArm) rightArm.style.animation = '';
        }, 1500);
    }
    
    welcomeUser() {
        setTimeout(() => {
            const hour = new Date().getHours();
            let greeting = '';
            if (hour < 12) greeting = 'صباح الخير';
            else if (hour < 16) greeting = 'أهلاً بك';
            else greeting = 'مساء الخير';
            
            this.speak(`${greeting} يا ${this.userName}! 👋 أنا مساعدك. اكتب اسم الطالب ورقم الجلوس واضغط عرض النتيجة`, 5000);
            this.pointTo(this.fields.name);
        }, 1500);
    }
}

// تشغيل البوت بعد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.smartBot = new SmartAssistantBot();
    }, 800);
});



// ====================== التشغيل ======================
async function init() {
    const isValid = await verifySession();
    if (!isValid) return;
    
    await loadNotifications();
    
    renderNavbar();
    renderWelcomeMessage();
    await renderDashboard();
    setupSearchForm();
    setupLogoutButton();
    
    // تشغيل مرشد المكتبة للمستخدمين الجدد فقط
    initLibraryTour();
    
    setInterval(async () => {
        await fetch(`${BASE_URL}/api/refresh-token`, { method: 'POST', credentials: 'include' });
    }, 55 * 60 * 1000);
}

init();
