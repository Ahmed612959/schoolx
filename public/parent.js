// parent.js — بوابة أولياء الأمور - معهد رعاية الضبعية الفني للتمريض

const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : '';

// ====================== إعدادات المواد (نفس منظومة لوحة الأدمن) ======================
const SUBJECTS_CONFIG_FIRST = {
    "اللغة العربية": { max: 20 },
    "اللغة الإنجليزية": { max: 20 },
    "علوم تطبيقية": { max: 40 },
    "طب باطنة": { max: 20 },
    "تمريض باطني جراحي": { max: 24 },
    "حاسب آلي": { max: 20 },
    "الدين": { max: 32, isExtra: true }
};
const TOTAL_POSSIBLE_FIRST = 144;
const ORDERED_SUBJECTS_FIRST = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"];

const SUBJECTS_CONFIG_SECOND = {
    "اللغة العربية": { max: 50 },
    "اللغة الإنجليزية": { max: 50 },
    "علوم تطبيقية": { max: 50 },
    "إحصاء": { max: 40 },
    "طب الباطني": { max: 50 },
    "طب الجراحة": { max: 50 },
    "تمريض باطني جراحي": { max: 120 },
    "حاسب آلي": { max: 50 },
    "صحة مجتمع": { max: 50 },
    "الدين": { max: 40, isExtra: true }
};
const TOTAL_POSSIBLE_SECOND = 510;
const ORDERED_SUBJECTS_SECOND = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "إحصاء", "طب الباطني", "طب الجراحة", "تمريض باطني جراحي", "حاسب آلي", "صحة مجتمع", "الدين"];

const TERMS = {
    first: { key: 'first', field: 'subjectsFirst', total: TOTAL_POSSIBLE_FIRST, config: SUBJECTS_CONFIG_FIRST, ordered: ORDERED_SUBJECTS_FIRST },
    second: { key: 'second', field: 'subjectsSecond', total: TOTAL_POSSIBLE_SECOND, config: SUBJECTS_CONFIG_SECOND, ordered: ORDERED_SUBJECTS_SECOND }
};

function normalizeSubjectName(name) {
    if (!name) return '';
    const m = {
        'التربية الدينية': 'الدين', 'تربية دينية': 'الدين', 'دين': 'الدين',
        'الكمبيوتر': 'حاسب آلي', 'كمبيوتر': 'حاسب آلي', 'الحاسب الآلي': 'حاسب آلي', 'الحاسب': 'حاسب آلي', 'حاسب': 'حاسب آلي', 'حاسب الي': 'حاسب آلي', 'حاسب الى': 'حاسب آلي',
        'التمريض الباطني الجراحي': 'تمريض باطني جراحي', 'تمريض باطنى جراحي': 'تمريض باطني جراحي', 'التمريض': 'تمريض باطني جراحي', 'تمريض': 'تمريض باطني جراحي',
        'الطب الباطنة': 'طب باطنة', 'الباطنة': 'طب باطنة',
        'العلوم التطبيقية': 'علوم تطبيقية', 'العلوم': 'علوم تطبيقية', 'علوم تطبيقيه': 'علوم تطبيقية',
        'العربي': 'اللغة العربية', 'العربية': 'اللغة العربية', 'اللغه العربيه': 'اللغة العربية', 'اللغة العربيه': 'اللغة العربية',
        'الانجليزي': 'اللغة الإنجليزية', 'english': 'اللغة الإنجليزية', 'انجليزي': 'اللغة الإنجليزية', 'اللغه الانجليزيه': 'اللغة الإنجليزية', 'اللغة الانجليزيه': 'اللغة الإنجليزية',
        'طب الباطني': 'طب الباطني', 'الطب الباطني': 'طب الباطني', 'باطني': 'طب الباطني', 'باطنى': 'طب الباطني',
        'طب الجراحة': 'طب الجراحة', 'الجراحة': 'طب الجراحة', 'جراحة': 'طب الجراحة', 'جراحه': 'طب الجراحة', 'طب جراحة': 'طب الجراحة',
        'الإحصاء': 'إحصاء', 'الاحصاء': 'إحصاء', 'احصاء': 'إحصاء',
        'الصحة المجتمعية': 'صحة مجتمع', 'صحة المجتمع': 'صحة مجتمع', 'الصحة المجتمع': 'صحة مجتمع'
    };
    return m[name.trim()] || name.trim();
}

function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ====================== طلبات السيرفر ======================
async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    return response;
}

let currentStudentCode = null;
let currentResultsData = null;
let currentTerm = 'first';

// ====================== تسجيل الدخول ======================
document.getElementById('parent-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const parentId = document.getElementById('parent-id-input').value.trim();
    const password = document.getElementById('parent-password-input').value.trim();
    const errorBox = document.getElementById('login-error');
    const btn = document.getElementById('login-submit-btn');
    errorBox.classList.remove('show');
    if (!/^\d{7}$/.test(parentId) || !/^\d{7}$/.test(password)) {
        errorBox.textContent = 'من فضلك أدخل 7 أرقام صحيحة في الحقلين';
        errorBox.classList.add('show');
        return;
    }
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الدخول...';
    try {
        const res = await apiRequest('/api/parent/login', { method: 'POST', body: JSON.stringify({ parentId, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');
        sessionStorage.setItem('parentStudentCode', data.studentCode);
        sessionStorage.setItem('parentStudentName', data.studentName);
        showDashboard(data.studentCode, data.studentName);
    } catch (err) {
        errorBox.textContent = err.message || 'حدث خطأ، حاول مرة أخرى';
        errorBox.classList.add('show');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> دخول';
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('parentStudentCode');
    sessionStorage.removeItem('parentStudentName');
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('parent-login-form').reset();
});

// ====================== عرض اللوحة ======================
function showDashboard(studentCode, studentName) {
    currentStudentCode = studentCode;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    document.getElementById('header-student-name').textContent = studentName;
    document.getElementById('header-student-code').textContent = `رقم الجلوس: ${studentCode}`;
    loadResults();
    loadAttendance();
    loadViolations();
}

// ====================== النتيجة ======================
async function loadResults() {
    try {
        const res = await apiRequest(`/api/parent/student/${encodeURIComponent(currentStudentCode)}/results`);
        if (!res.ok) throw new Error();
        currentResultsData = await res.json();
        renderResults();
    } catch (e) {
        document.getElementById('results-container').innerHTML = '<div class="empty-note">تعذر تحميل النتيجة حاليًا</div>';
    }
}

function renderResults() {
    const container = document.getElementById('results-container');
    if (!currentResultsData) { container.innerHTML = '<div class="empty-note">لا توجد بيانات</div>'; return; }
    const t = TERMS[currentTerm];
    const field = currentTerm === 'second' ? 'subjectsSecond' : 'subjectsFirst';
    let subs = currentResultsData[field] || [];
    if (!subs.length && currentTerm === 'first' && currentResultsData.subjects?.length) subs = currentResultsData.subjects;
    if (!subs.length) { container.innerHTML = '<div class="empty-note">لم يتم رصد درجات هذا الترم بعد</div>'; return; }

    let total = 0;
    let rowsHtml = '';
    t.ordered.forEach(name => {
        const cfg = t.config[name];
        const sub = subs.find(s => normalizeSubjectName(s.name) === name);
        const grade = sub ? Number(sub.grade) || 0 : 0;
        if (!cfg.isExtra) total += grade;
        rowsHtml += `<div class="subject-row ${cfg.isExtra ? 'is-extra' : ''}"><span class="subject-name"><i class="fas fa-book"></i> ${name}${cfg.isExtra ? ' (خارج المجموع)' : ''}</span><span class="subject-grade">${grade} / ${cfg.max}</span></div>`;
    });
    const percentage = (total / t.total) * 100;
    const passed = percentage >= 60;
    let gradeText = percentage >= 85 ? 'ممتاز' : percentage >= 75 ? 'جيد جداً' : percentage >= 65 ? 'جيد' : percentage >= 60 ? 'ناجح' : 'راسب';

    container.innerHTML = `
        ${rowsHtml}
        <div class="result-summary">
            <div class="summary-box"><div class="value">${total} / ${t.total}</div><div class="label">المجموع</div></div>
            <div class="summary-box ${passed ? 'pass' : 'fail'}"><div class="value">${percentage.toFixed(1)}%</div><div class="label">${gradeText}</div></div>
        </div>`;
}

document.querySelectorAll('.term-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.term-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTerm = btn.dataset.term;
        renderResults();
    });
});

// ====================== الحضور ======================
async function loadAttendance() {
    try {
        const res = await apiRequest(`/api/parent/student/${encodeURIComponent(currentStudentCode)}/attendance`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        renderAttendance(data);
    } catch (e) {
        document.getElementById('attendance-container').innerHTML = '<div class="empty-note">تعذر تحميل بيانات الحضور حاليًا</div>';
    }
}

function renderAttendance(data) {
    const container = document.getElementById('attendance-container');
    if (!data.total) { container.innerHTML = '<div class="empty-note">لا يوجد سجل حضور مسجل بعد</div>'; return; }
    const statusLabel = { present: 'حاضر', absent: 'غائب', late: 'متأخر' };
    const recent = (data.records || []).slice(0, 30);
    const rowsHtml = recent.map(r => `<div class="attendance-row"><span>${escapeHtml(r.date)}</span><span class="status-pill ${r.status}">${statusLabel[r.status] || r.status}</span></div>`).join('');
    const moreNote = data.records.length > 30 ? `<div class="empty-note">و ${data.records.length - 30} سجل أقدم</div>` : '';
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-box present"><div class="num">${data.present}</div><div class="lbl">حضور</div></div>
            <div class="stat-box absent"><div class="num">${data.absent}</div><div class="lbl">غياب</div></div>
            <div class="stat-box late"><div class="num">${data.late}</div><div class="lbl">تأخير</div></div>
            <div class="stat-box total"><div class="num">${data.percentage}%</div><div class="lbl">نسبة الحضور</div></div>
        </div>
        <div class="attendance-list">${rowsHtml}</div>
        ${moreNote}`;
}

// ====================== المخالفات ======================
async function loadViolations() {
    try {
        const res = await apiRequest(`/api/parent/student/${encodeURIComponent(currentStudentCode)}/violations`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        renderViolations(data);
    } catch (e) {
        document.getElementById('violations-container').innerHTML = '<div class="empty-note">تعذر تحميل البيانات حاليًا</div>';
    }
}

function renderViolations(list) {
    const container = document.getElementById('violations-container');
    if (!list || !list.length) { container.innerHTML = '<div class="empty-note">✅ لا توجد أي إنذارات أو مخالفات مسجلة</div>'; return; }
    container.innerHTML = `<div class="violations-list">${list.map(v => `
        <div class="violation-card type-${v.type}">
            <div class="v-top"><span class="v-type">${v.type === 'warning' ? '⚠️ إنذار' : '🚫 مخالفة'}</span><span class="v-date">${escapeHtml(v.date)}</span></div>
            <div class="v-reason">${escapeHtml(v.reason)}</div>
            <div class="v-penalty">العقوبة: ${escapeHtml(v.penalty)}</div>
        </div>`).join('')}</div>`;
}

// ====================== استكمال الجلسة تلقائيًا لو ولي الأمر داخل بالفعل ======================
(function initSession() {
    const savedCode = sessionStorage.getItem('parentStudentCode');
    const savedName = sessionStorage.getItem('parentStudentName');
    if (savedCode && savedName) {
        showDashboard(savedCode, savedName);
    }
})();
