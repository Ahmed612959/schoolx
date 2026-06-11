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



// ====================== البوت المساعد الذكي ======================
class SmartBot {
    constructor() {
        this.botAvatar = document.getElementById('botAvatar');
        this.botBubble = document.getElementById('botBubble');
        this.botPanel = document.getElementById('botPanel');
        this.botMessages = document.getElementById('botMessages');
        this.botInput = document.getElementById('botInput');
        this.sendBtn = document.getElementById('sendBotMessage');
        this.closeBtn = document.getElementById('closeBotPanel');
        
        this.userName = this.getUserName();
        this.isTyping = false;
        this.moveInterval = null;
        
        this.init();
    }
    
    getUserName() {
        const user = getLoggedInUser();
        return user?.fullName || user?.username || 'صديقي';
    }
    
    init() {
        this.attachEvents();
        this.startMoving();
        this.showWelcomeMessage();
        
        // إظهار فقاعة ترحيب بعد 2 ثانية
        setTimeout(() => {
            this.showBubble(`مرحباً ${this.userName}! 👋 أنا هنا لمساعدتك في أي وقت`);
        }, 3000);
        
        // إخفاء الفقاعة بعد 5 ثواني
        setTimeout(() => {
            this.hideBubble();
        }, 8000);
        
        console.log('🤖 Smart Bot initialized');
    }
    
    attachEvents() {
        this.botAvatar.addEventListener('click', () => this.togglePanel());
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.closeBtn.addEventListener('click', () => this.closePanel());
        this.botInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // إغلاق اللوحة عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (this.botPanel.classList.contains('open')) {
                if (!this.botPanel.contains(e.target) && !this.botAvatar.contains(e.target)) {
                    this.closePanel();
                }
            }
        });
    }
    
    startMoving() {
        // حركة البوت في الصفحة
        let direction = 1;
        let position = 0;
        const maxMove = 30;
        
        this.moveInterval = setInterval(() => {
            if (!this.botPanel.classList.contains('open')) {
                position += direction * 2;
                if (Math.abs(position) > maxMove) {
                    direction *= -1;
                }
                this.botAvatar.style.transform = `translateY(${position * 0.5}px) rotate(${position * 0.5}deg)`;
                this.botAvatar.classList.add('bot-moving');
            }
        }, 100);
    }
    
    showBubble(message, duration = 4000) {
        const bubbleText = document.getElementById('bubbleText');
        if (bubbleText) {
            bubbleText.innerHTML = message;
        }
        this.botBubble.classList.add('show');
        
        setTimeout(() => {
            this.hideBubble();
        }, duration);
    }
    
    hideBubble() {
        this.botBubble.classList.remove('show');
    }
    
    togglePanel() {
        if (this.botPanel.classList.contains('open')) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }
    
    openPanel() {
        this.botPanel.classList.add('open');
        this.botInput.focus();
        this.hideBubble();
    }
    
    closePanel() {
        this.botPanel.classList.remove('open');
    }
    
    addMessage(sender, message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `bot-message ${sender}`;
        
        const avatar = sender === 'bot' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
        const avatarBg = sender === 'bot' ? 'background: linear-gradient(135deg, #1a4f6e, #0d3b54)' : 'background: #c4a35a';
        
        messageDiv.innerHTML = `
            <div class="avatar" style="${avatarBg}">${avatar}</div>
            <div class="content">${message}</div>
        `;
        
        this.botMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    async sendMessage() {
        const message = this.botInput.value.trim();
        if (!message) return;
        
        this.addMessage('user', message);
        this.botInput.value = '';
        
        this.showTyping();
        
        setTimeout(() => {
            this.hideTyping();
            const response = this.getBotResponse(message);
            this.addMessage('bot', response);
            this.showBubble(response, 5000);
        }, 1000);
    }
    
    showTyping() {
        this.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'bot-message bot';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <div class="avatar" style="background: linear-gradient(135deg, #1a4f6e, #0d3b54)"><i class="fas fa-robot"></i></div>
            <div class="content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
        `;
        this.botMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    hideTyping() {
        const typing = document.getElementById('typingIndicator');
        if (typing) typing.remove();
        this.isTyping = false;
    }
    
    scrollToBottom() {
        this.botMessages.scrollTop = this.botMessages.scrollHeight;
    }
    
    getBotResponse(message) {
        const msg = message.toLowerCase();
        const userName = this.userName;
        
        // تعريف معرفة البوت بالصفحة
        const pageInfo = this.getPageInfo();
        
        // ردود البوت الذكية
        const responses = {
            // الترحيب
            'السلام عليكم': `وعليكم السلام ورحمة الله ${userName} 🤗`,
            'مرحب': `مرحباً بك ${userName}! كيف أساعدك اليوم؟ 😊`,
            'شكر': `العفو ${userName}! أنا في خدمتك دائماً 🤍`,
            
            // المساعدة العامة
            'مساعدة': `أنا مساعدك الذكي ${userName}! 🤖\n\nأستطيع مساعدتك في:\n🔍 البحث عن النتيجة\n📊 عرض المواد والدرجات\n⚠️ عرض المخالفات\n📢 عرض الإشعارات\n📈 إحصائيات الحضور\n💡 نصائح دراسية\n\nفقط أخبرني ماذا تريد!`,
            'تقدر تعمل ايه': this.getBotResponse('مساعدة'),
            
            // النتيجة
            'النتيجة': `للبحث عن نتيجتك ${userName}:\n1️⃣ أدخل اسمك ورقم الجلوس في الحقول أعلاه\n2️⃣ اضغط على "عرض النتيجة"\n3️⃣ ستظهر جميع درجاتك مع المجموع والنسبة`,
            'كيف اشوف نتيجتي': this.getBotResponse('النتيجة'),
            'بحث': this.getBotResponse('النتيجة'),
            
            // المواد
            'المواد': `المواد الدراسية الحالية 📚:\n📖 مبادئ وأسس تمريض\n📖 اللغة العربية\n📖 اللغة الإنجليزية\n📖 علوم تطبيقية\n📖 طب باطنة\n📖 تمريض باطني جراحي\n📖 حاسب آلي\n🕌 الدين (خارج المجموع)`,
            'كم مادة': this.getBotResponse('المواد'),
            
            // المجموع
            'المجموع': `المجموع الكلي للدرجات هو ${TOTAL_POSSIBLE} درجة.\nموزعة على 6 مواد أساسية ومواد إضافية.\nكل مادة لها درجة قصوى معينة حسب أهميتها.`,
            'مجموع الدرجات': this.getBotResponse('المجموع'),
            
            // النسبة
            'النسبة': `نسبة النجاح تحسب كالتالي:\n🏆 ممتاز: 85% فأكثر\n✅ ناجح: 60% - 84%\n❌ راسب: أقل من 60%\n\nنصيحة: ركز على المواد التي درجتها منخفضة!`,
            
            // المخالفات
            'مخالفات': `عند البحث عن طالب، ستعرض لك المخالفات المسجلة (إن وجدت) في جدول منفصل.\nتتضمن المخالفة: النوع، السبب، العقوبة، وتاريخ الإضافة.`,
            'إنذارات': this.getBotResponse('مخالفات'),
            
            // الإشعارات
            'إشعارات': `الإشعارات تظهر في الجدول الموجود أسفل الصفحة. جميع الإشعارات العامة يراها كل الطلاب.\nيمكنك رؤية آخر الإشعارات والإعلانات المهمة هناك.`,
            
            // الحضور
            'حضور': `إذا كنت طالباً مسجلاً، ستظهر لك إحصائيات الحضور والغياب في لوحة التحكم الخاصة بك.\nتتضمن: عدد أيام الحضور، الغياب، التأخير، ونسبة الحضور.`,
            'غياب': this.getBotResponse('حضور'),
            'الحضور والغياب': this.getBotResponse('حضور'),
            
            // نصائح
            'نصيحة': `💡 نصيحة دراسية ${userName}:\n• راجع المواد التي درجتك فيها منخفضة\n• خصص وقت يومي للمراجعة\n• حل أسئلة السنوات السابقة\n• تواصل مع المعلمين عند الصعوبة\n• لا تتردد في سؤالي عن أي شيء!`,
            'نصائح': this.getBotResponse('نصيحة'),
            
            // ماذا يوجد في الصفحة
            'الصفحة': `هذه الصفحة تحتوي على:\n📝 نموذج بحث لإدخال الاسم ورقم الجلوس\n📊 جدول يعرض النتيجة الكاملة (المواد والدرجات والمجموع والنسبة)\n⚠️ جدول المخالفات (إن وجدت)\n📢 جدول الإشعارات العامة\n📈 لوحة تحكم خاصة للطلاب (نسبة نجاحك ورسوم بيانية)\n📋 إحصائيات الحضور للطلاب\n\nوأنا هنا لمساعدتك!`,
            
            // سؤال عشوائي
            'كيف حالك': `أنا بحالة جيدة ${userName}! شكراً لسؤالك 😊. كيف يمكنني مساعدتك اليوم؟`,
            'ايه اخبارك': this.getBotResponse('كيف حالك'),
            'بتحب ايه': `أحب مساعدة الطلاب ${userName}! 🤖\nأحب أن أرى النجاح والتفوق في أعينكم.`,
            
            // وداع
            'مع السلامة': `مع السلامة ${userName} 👋\nأتمنى لك يوماً موفقاً! عد في أي وقت تحتاج مساعدة`,
            'باي': this.getBotResponse('مع السلامة'),
            'سلام': this.getBotResponse('مع السلامة')
        };
        
        // البحث عن رد مناسب
        for (const [key, value] of Object.entries(responses)) {
            if (msg.includes(key)) {
                return value;
            }
        }
        
        // رد افتراضي ذكي
        return `شكراً لسؤالك ${userName} 😊\n\nأنا مساعدك الذكي، أستطيع مساعدتك في:\n• البحث عن النتيجة 🔍\n• شرح المواد 📚\n• حساب النسبة 📊\n• عرض المخالفات ⚠️\n• الإشعارات 📢\n• نصائح دراسية 💡\n\nاكتب "مساعدة" لمعرفة كل ما أستطيع فعله!`;
    }
    
    getPageInfo() {
        // معلومات عن الصفحة يمكن للبوت استخدامها
        const hasResults = document.getElementById('result-table-body')?.innerHTML?.includes('بحث');
        const hasViolations = document.getElementById('violations-table-body')?.innerHTML?.length > 0;
        const hasNotifications = document.getElementById('notifications-table-body')?.innerHTML?.length > 0;
        
        return {
            hasResults: !hasResults,
            hasViolations,
            hasNotifications,
            totalSubjects: orderedSubjects.length,
            totalMaxGrade: TOTAL_POSSIBLE
        };
    }
    
    showWelcomeMessage() {
        setTimeout(() => {
            this.addMessage('bot', `مرحباً ${this.userName}! 👋\nأنا مساعدك الذكي. أنا أعرف كل شيء عن هذه الصفحة، وأستطيع مساعدتك في البحث عن النتائج، إظهار المخالفات، الإشعارات، وأي شيء تحتاجه. فقط اسألني!`);
        }, 1000);
    }
}

// تشغيل البوت بعد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.smartBot = new SmartBot();
    }, 500);
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
