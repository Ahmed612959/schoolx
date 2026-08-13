// Home.js - النسخة الكاملة النهائية (نظام حضور + بحث متعدد المستويات + دعم الطلاب + إخفاء النتائج الفارغة)

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
    try { return JSON.parse(userStr); } catch { return null; }
}

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: message, duration: 4000, gravity: "top", position: "right",
            backgroundColor: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
            style: { fontFamily: '"Cairo", sans-serif', fontSize: '18px', direction: 'rtl', borderRadius: '12px', padding: '16px 24px' }
        }).showToast();
    } else { alert(message); }
}

async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
        if (response.status === 401) { window.location.href = '/login.html'; throw new Error('انتهت الجلسة'); }
        return response;
    } catch (error) { console.error(`❌ فشل في ${endpoint}:`, error.message); throw error; }
}

// ====================== توحيد النص العربي ======================
function normalizeArabicText(text) {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/[ى]/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[\u064B-\u065F\u0670]/g, '').replace(/\u0640/g, '').toLowerCase();
}

function calculateSimilarity(str1, str2) {
    const norm1 = normalizeArabicText(str1), norm2 = normalizeArabicText(str2);
    if (norm1 === norm2) return 100;
    const words1 = norm1.split(' ').filter(w => w.length > 0), words2 = norm2.split(' ').filter(w => w.length > 0);
    let matchCount = 0; const checkedWords2 = new Set();
    for (const word1 of words1) { for (const word2 of words2) { if (!checkedWords2.has(word2) && (word1 === word2 || word1.includes(word2) || word2.includes(word1))) { matchCount++; checkedWords2.add(word2); break; } } }
    const totalWords = Math.max(words1.length, words2.length);
    return totalWords > 0 ? (matchCount / totalWords) * 100 : 0;
}

// ====================== تعريف المواد - نظامين (الترم الأول / نهاية العام) ======================
// نظام 1: الشكل الحالي - درجات الترم الأول
const SUBJECTS_CONFIG_FIRST = { "اللغة العربية": { max: 20 }, "اللغة الإنجليزية": { max: 20 }, "علوم تطبيقية": { max: 40 }, "طب باطنة": { max: 20 }, "تمريض باطني جراحي": { max: 24 }, "حاسب آلي": { max: 20 }, "الدين": { max: 32, isExtra: true } };
const TOTAL_POSSIBLE_FIRST = 144;
const ORDERED_SUBJECTS_FIRST = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"];

// نظام 2: درجات نهاية العام (الترم الثاني) - مجموع 510
const SUBJECTS_CONFIG_SECOND = {
    "اللغة العربية": { max: 50 }, "اللغة الإنجليزية": { max: 50 }, "علوم تطبيقية": { max: 50 },
    "إحصاء": { max: 40 }, "طب الباطني": { max: 50 }, "طب الجراحة": { max: 50 },
    "تمريض باطني جراحي": { max: 120 }, "حاسب آلي": { max: 50 }, "صحة مجتمع": { max: 50 },
    "الدين": { max: 40, isExtra: true }
};
const TOTAL_POSSIBLE_SECOND = 510;
const ORDERED_SUBJECTS_SECOND = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "إحصاء", "طب الباطني", "طب الجراحة", "تمريض باطني جراحي", "حاسب آلي", "صحة مجتمع", "الدين"];

function normalizeSubjectName(name) {
    if (!name) return '';
    const mapping = {
        'التربية الدينية': 'الدين', 'تربية دينية': 'الدين', 'دين': 'الدين',
        'الكمبيوتر': 'حاسب آلي', 'كمبيوتر': 'حاسب آلي', 'الحاسب الآلي': 'حاسب آلي', 'الحاسب': 'حاسب آلي', 'حاسب': 'حاسب آلي',
        'التمريض الباطني الجراحي': 'تمريض باطني جراحي', 'تمريض باطنى جراحي': 'تمريض باطني جراحي', 'التمريض': 'تمريض باطني جراحي',
        'الطب الباطنة': 'طب باطنة',
        'العلوم التطبيقية': 'علوم تطبيقية',
        'طب الباطني': 'طب الباطني', 'الطب الباطني': 'طب الباطني', 'باطني': 'طب الباطني', 'باطنى': 'طب الباطني',
        'طب الجراحة': 'طب الجراحة', 'الجراحة': 'طب الجراحة', 'جراحة': 'طب الجراحة', 'جراحه': 'طب الجراحة',
        'الصحة المجتمع': 'صحة مجتمع', 'الصحة المجتمعية': 'صحة مجتمع', 'صحة المجتمع': 'صحة مجتمع',
        'الاحصاء': 'إحصاء', 'احصاء': 'إحصاء', 'الإحصاء': 'إحصاء'
    };
    return mapping[name.trim()] || name.trim();
}

function getSubjectConfig(term) { return term === 'second' ? SUBJECTS_CONFIG_SECOND : SUBJECTS_CONFIG_FIRST; }
function getOrderedSubjects(term) { return term === 'second' ? ORDERED_SUBJECTS_SECOND : ORDERED_SUBJECTS_FIRST; }
function getTotalPossible(term) { return term === 'second' ? TOTAL_POSSIBLE_SECOND : TOTAL_POSSIBLE_FIRST; }
function getSemesterName(term) { return term === 'second' ? 'نهاية العام (الترم الثاني)' : 'الترم الأول'; }
function getSubjectsField(term) { return term === 'second' ? 'subjectsSecond' : 'subjectsFirst'; }

// ✅ يرجع مواد الطالب الخاصة بترم معين، ولو الترم "الأول" فاضي بيرجع الحقل القديم (subjects)
// كـ fallback لأي طالب كانت درجاته متسجلة قبل إضافة نظام الترمين
function getTermSubjects(student, term = 'first') {
    const subs = student[getSubjectsField(term)];
    if (subs && subs.length) return subs;
    if (term === 'first' && student.subjects && student.subjects.length) return student.subjects;
    return [];
}

// ✅ دالة للتحقق مما إذا كان الطالب لديه أي درجات حقيقية (غير صفرية) في الترم المُختار
function hasAnyGrade(student, term = 'first') {
    const subjects = getTermSubjects(student, term);
    if (!subjects || subjects.length === 0) return false;
    return subjects.some(s => (s.grade || 0) > 0);
}

function calculateStudentTotal(student, term = 'first') {
    const subjects = getTermSubjects(student, term);
    if (!subjects) return 0;
    const config = getSubjectConfig(term); let t = 0;
    subjects.forEach(s => { const n = normalizeSubjectName(s.name); const c = config[n]; if (c && !c.isExtra) t += Math.round(Number(s.grade) || 0); });
    return Math.round(t);
}

function calculateStudentPercentage(student, term = 'first') {
    const total = calculateStudentTotal(student, term);
    const possible = getTotalPossible(term);
    return possible > 0 ? (total / possible) * 100 : 0;
}

// ====================== جلب البيانات ======================
async function fetchAllStudents() {
    try {
        const response = await apiRequest(`/api/students/all`);
        if (response.ok) return await response.json();
        const adminResponse = await apiRequest(`/api/admin/students`);
        if (adminResponse.ok) return await adminResponse.json();
        return [];
    } catch (error) { console.error('❌ خطأ في جلب الطلاب:', error); return []; }
}

async function fetchStudentByCode(studentCode) {
    try { const all = await fetchAllStudents(); return all.find(s => s.studentCode === studentCode) || null; }
    catch (error) { console.error('❌ خطأ في جلب الطالب:', error); return null; }
}

async function searchStudentsByNameAndCode(name, studentCode) {
    try {
        const allStudents = await fetchAllStudents();
        if (!allStudents.length) return [];
        let results = allStudents;
        if (studentCode) results = results.filter(s => s.studentCode === studentCode || s.studentCode.includes(studentCode));
        if (name) {
            const searchName = normalizeArabicText(name), searchParts = searchName.split(' ').filter(p => p.length > 0);
            results = results.filter(s => { const studentName = normalizeArabicText(s.fullName || ''); const allPartsFound = searchParts.every(part => studentName.includes(part)); const similarity = calculateSimilarity(name, s.fullName || ''); return allPartsFound || similarity >= 70; });
            results.sort((a, b) => { const simA = calculateSimilarity(name, a.fullName || ''); const simB = calculateSimilarity(name, b.fullName || ''); return simB - simA; });
        }
        return results;
    } catch (error) { console.error('❌ خطأ في البحث:', error); return []; }
}

async function searchByCodeOnly(studentCode) {
    const all = await fetchAllStudents();
    return all.filter(s => s.studentCode === studentCode || s.studentCode.includes(studentCode));
}

async function searchByNameOnly(name) {
    const all = await fetchAllStudents(); if (!all.length) return [];
    const searchName = normalizeArabicText(name), searchParts = searchName.split(' ').filter(p => p.length > 0);
    let results = all.filter(s => { const studentName = normalizeArabicText(s.fullName || ''); const allPartsFound = searchParts.every(part => studentName.includes(part)); const similarity = calculateSimilarity(name, s.fullName || ''); return allPartsFound || similarity >= 60; });
    results.sort((a, b) => { const simA = calculateSimilarity(name, a.fullName || ''); const simB = calculateSimilarity(name, b.fullName || ''); return simB - simA; });
    return results.slice(0, 10);
}

async function fetchViolationsForStudent(studentId) {
    try { const response = await apiRequest(`/api/violations/student/${encodeURIComponent(studentId)}`); if (response.ok) return await response.json(); return []; }
    catch (error) { console.error('❌ خطأ في جلب المخالفات:', error); return []; }
}

async function loadNotifications() {
    try {
        const response = await fetch(`${BASE_URL}/api/notifications`);
        if (response.ok) {
            const notifications = await response.json();
            const tableBody = document.getElementById('notifications-table-body');
            if (tableBody) { tableBody.innerHTML = ''; if (!notifications.length) { tableBody.innerHTML = '<tr><td colspan="2">لا توجد إشعارات حاليًا</td></tr>'; return; } notifications.forEach(n => { const row = document.createElement('tr'); row.innerHTML = `<td>${n.text || 'إشعار بدون نص'}</td><td>${n.date || 'غير محدد'}</td>`; tableBody.appendChild(row); }); }
        }
    } catch (error) { console.error('❌ خطأ في تحميل الإشعارات:', error); }
}

// ====================== الحضور - مع تحديث فوري ======================
let attendanceStats = null;
let lastAttendanceFetch = 0;
const ATTENDANCE_FETCH_INTERVAL = 5000;

async function fetchAttendanceStats(studentCode, force = false) {
    const now = Date.now();
    if (!force && (now - lastAttendanceFetch) < ATTENDANCE_FETCH_INTERVAL) return attendanceStats;
    try {
        const response = await apiRequest(`/api/attendance/student/${studentCode}?t=${now}`);
        if (response.ok) {
            const data = await response.json(); lastAttendanceFetch = now;
            let attendanceRecords = [];
            if (Array.isArray(data)) attendanceRecords = data;
            else if (data && typeof data === 'object') { if (Array.isArray(data.records)) attendanceRecords = data.records; else if (Array.isArray(data.results)) attendanceRecords = data.results; else if (Array.isArray(data.data)) attendanceRecords = data.data; else { const keys = Object.keys(data); if (keys.length > 0 && !isNaN(keys[0])) attendanceRecords = Object.values(data); else attendanceRecords = []; } }
            if (!Array.isArray(attendanceRecords)) { console.warn('⚠️ attendanceRecords ليس مصفوفة'); attendanceRecords = []; }
            const present = attendanceRecords.filter(a => a.status === 'present').length;
            const absent = attendanceRecords.filter(a => a.status === 'absent').length;
            const late = attendanceRecords.filter(a => a.status === 'late').length;
            const total = attendanceRecords.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            const presentRecords = attendanceRecords.filter(a => a.status === 'present').sort((a, b) => new Date(b.date) - new Date(a.date));
            const absentRecords = attendanceRecords.filter(a => a.status === 'absent').sort((a, b) => new Date(b.date) - new Date(a.date));
            const newStats = { present, absent, late, total, percentage: percentage.toFixed(1), lastPresentDate: presentRecords.length > 0 ? formatDate(presentRecords[0].date) : null, lastAbsentDate: absentRecords.length > 0 ? formatDate(absentRecords[0].date) : null, records: attendanceRecords, hasRecords: total > 0 };
            const hasChanged = !attendanceStats || attendanceStats.present !== newStats.present || attendanceStats.absent !== newStats.absent || attendanceStats.late !== newStats.late || attendanceStats.hasRecords !== newStats.hasRecords;
            attendanceStats = newStats; renderAttendanceStats();
            if (hasChanged && attendanceStats.total > 0 && lastAttendanceFetch > 1000) showToast(`📊 تم تحديث الحضور: ${attendanceStats.present} حاضر، ${attendanceStats.absent} غائب، ${attendanceStats.late} متأخر`, 'info');
            return attendanceStats;
        }
        return attendanceStats;
    } catch (error) { console.error('❌ خطأ في جلب إحصائيات الحضور:', error.message); return attendanceStats || { present: 0, absent: 0, late: 0, total: 0, percentage: 0, lastPresentDate: null, lastAbsentDate: null, records: [], hasRecords: false }; }
}

function formatDate(dateStr) { if (!dateStr) return null; try { const parts = dateStr.split('-'); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr; } catch { return dateStr; } }

function renderAttendanceStats() {
    const section = document.getElementById('attendanceStatsSection'); if (!section) return;
    const user = getLoggedInUser(); if (!user || user.type !== 'student') { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const noMsgDiv = document.getElementById('noAttendanceMessage');
    const grid = document.querySelector('.attendance-stats-grid');
    const datesDiv = document.querySelector('.attendance-dates');
    const hasRecords = attendanceStats && attendanceStats.total > 0 && attendanceStats.records && attendanceStats.records.length > 0;
    if (!hasRecords) { if (noMsgDiv) { noMsgDiv.style.display = 'block'; noMsgDiv.innerHTML = '📌 لم يتم تسجيل أي حضور أو غياب لك حتى الآن.'; } if (grid) grid.style.display = 'none'; if (datesDiv) datesDiv.style.display = 'none'; document.getElementById('presentCount').textContent = '0'; document.getElementById('absentCount').textContent = '0'; document.getElementById('lateCount').textContent = '0'; document.getElementById('attendancePercentage').textContent = '0%'; return; }
    if (noMsgDiv) { noMsgDiv.style.display = 'none'; noMsgDiv.innerHTML = ''; } if (grid) grid.style.display = 'grid'; if (datesDiv) datesDiv.style.display = 'flex';
    document.getElementById('presentCount').textContent = attendanceStats.present;
    document.getElementById('absentCount').textContent = attendanceStats.absent;
    document.getElementById('lateCount').textContent = attendanceStats.late;
    document.getElementById('attendancePercentage').textContent = attendanceStats.percentage + '%';
    const lastPresentSpan = document.getElementById('lastPresentDate'), lastAbsentSpan = document.getElementById('lastAbsentDate');
    if (lastPresentSpan) lastPresentSpan.textContent = attendanceStats.lastPresentDate || 'لم يتم تسجيل بعد';
    if (lastAbsentSpan) lastAbsentSpan.textContent = attendanceStats.lastAbsentDate || 'لم يتم تسجيل بعد';
}

let attendancePollingInterval = null;
function startAttendancePolling(studentCode) { if (attendancePollingInterval) clearInterval(attendancePollingInterval); fetchAttendanceStats(studentCode, true); attendancePollingInterval = setInterval(() => fetchAttendanceStats(studentCode, true), ATTENDANCE_FETCH_INTERVAL); }
function stopAttendancePolling() { if (attendancePollingInterval) { clearInterval(attendancePollingInterval); attendancePollingInterval = null; } }

// ====================== لوحة التحكم (الترمين تلقائيًا من غير اختيار) ======================
let currentStudentCode = null;
let currentDashboardStudent = null;

async function renderDashboard() {
    const user = getLoggedInUser(); const dashboard = document.getElementById('dashboard');
    if (!dashboard || !user || user.type !== 'student') { if (dashboard) dashboard.style.display = 'none'; const as = document.getElementById('attendanceStatsSection'); if (as) as.style.display = 'none'; return; }
    const student = await fetchStudentByCode(user.id); if (!student) { dashboard.style.display = 'none'; return; }
    dashboard.style.display = 'block'; currentStudentCode = student.studentCode; currentDashboardStudent = student;
    renderDashboardBoth(student);
    if (student.studentCode) { await fetchAttendanceStats(student.studentCode, true); renderAttendanceStats(); startAttendancePolling(student.studentCode); }
}

function renderDashboardBoth(student) {
    if (!student) return;
    const container = document.getElementById('dashboard-content');
    if (!container) return;
    const terms = ['first', 'second'].filter(term => hasAnyGrade(student, term));
    if (!terms.length) { container.innerHTML = `<div class="stats"><p>📊 لا توجد درجات مسجلة حتى الآن</p></div>`; return; }

    let html = '';
    if (terms.length === 2) {
        html += `<div class="dashboard-term-block" style="margin-bottom:20px;width:100%;">
            <div class="stats" style="text-align:center;"><p>📈 مقارنة الترمين</p></div>
            <div class="chart-container" style="max-width:700px;"><canvas id="gradesChart-compare"></canvas></div>
        </div>`;
    }
    terms.forEach(term => {
        const percentage = calculateStudentPercentage(student, term), total = calculateStudentTotal(student, term);
        const totalPossible = getTotalPossible(term), semesterName = getSemesterName(term);
        const config = getSubjectConfig(term); let religionGrade = 0;
        const subjects = getTermSubjects(student, term);
        const extraSubject = Object.entries(config).find(([_, v]) => v.isExtra);
        if (extraSubject) { const sub = subjects.find(s => normalizeSubjectName(s.name) === extraSubject[0]); religionGrade = sub ? Math.round(Number(sub.grade) || 0) : 0; }
        const religionHtml = extraSubject ? `<div style="margin-top:10px;padding:8px;background:#f0f0f0;border-radius:8px;text-align:center;">📖 ${extraSubject[0]}: <strong>${religionGrade} / ${extraSubject[1].max}</strong> (خارج المجموع)</div>` : '';
        html += `<div class="dashboard-term-block" style="margin-bottom:20px;">
            <div class="stats">
                <p>📊 ${semesterName} — نسبة نجاحك: <strong>${percentage.toFixed(1)}%</strong><br><small>(المجموع: ${total} / ${totalPossible})</small></p>
                ${religionHtml}
            </div>
            <div class="chart-container"><canvas id="gradesChart-${term}"></canvas></div>
        </div>`;
    });
    container.innerHTML = html;

    terms.forEach(term => {
        const config = getSubjectConfig(term);
        const subjects = getTermSubjects(student, term);
        const orderedSubjects = getOrderedSubjects(term);
        const subjectsWithGrades = orderedSubjects.filter(n => !config[n]?.isExtra).map(subjName => { const subject = subjects.find(s => normalizeSubjectName(s.name) === subjName); return { name: subjName, grade: subject ? Math.round(Number(subject.grade) || 0) : 0, max: config[subjName]?.max || 100 }; });
        const ctx = document.getElementById(`gradesChart-${term}`)?.getContext('2d');
        if (ctx && typeof Chart !== 'undefined') {
            const key = `gradesChart_${term}`;
            if (window[key]) window[key].destroy();
            window[key] = new Chart(ctx, { type: 'bar', data: { labels: subjectsWithGrades.map(s => s.name), datasets: [{ label: 'درجاتك', data: subjectsWithGrades.map(s => s.grade), backgroundColor: 'rgba(212, 175, 55, 0.8)', borderColor: '#d4af37', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, max: Math.max(...subjectsWithGrades.map(s => s.max)) + 5 } }, plugins: { legend: { display: false } } } });
        }
    });

    if (terms.length === 2) {
        const percentageFirst = calculateStudentPercentage(student, 'first'), percentageSecond = calculateStudentPercentage(student, 'second');
        const compareCtx = document.getElementById('gradesChart-compare')?.getContext('2d');
        if (compareCtx && typeof Chart !== 'undefined') {
            if (window.gradesChart_compare) window.gradesChart_compare.destroy();
            window.gradesChart_compare = new Chart(compareCtx, { type: 'bar', data: { labels: [getSemesterName('first'), getSemesterName('second')], datasets: [{ label: 'نسبة النجاح %', data: [percentageFirst, percentageSecond], backgroundColor: ['rgba(15, 36, 50, 0.85)', 'rgba(212, 175, 55, 0.85)'], borderColor: ['#0F2432', '#d4af37'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } } });
        }
    }
}

// ✅ هل الطالب عنده أي درجة (في أي ترم من الترمين)؟
function hasAnyGradeAnyTerm(student) { return hasAnyGrade(student, 'first') || hasAnyGrade(student, 'second'); }

// ====================== عرض النتيجة (الترمين تلقائيًا من غير اختيار) ======================
function buildTermResultBlock(student, term) {
    const semesterName = getSemesterName(term), config = getSubjectConfig(term);
    const orderedSubjects = getOrderedSubjects(term), totalPossible = getTotalPossible(term);
    const subjects = getTermSubjects(student, term);
    let total = 0; const subjectGrades = [];
    orderedSubjects.forEach(subjName => { const sc = config[subjName]; const subject = subjects.find(s => normalizeSubjectName(s.name) === subjName); const grade = subject ? Math.round(Number(subject.grade) || 0) : 0; if (sc?.isExtra) subjectGrades.push({ name: `${subjName} (خارج المجموع)`, grade, max: sc.max, isExtra: true }); else { subjectGrades.push({ name: subjName, grade, max: sc?.max || 100, isExtra: false }); total += grade; } });
    total = Math.round(total);
    const percentage = totalPossible > 0 ? (total / totalPossible) * 100 : 0;
    const percentageClass = percentage >= 85 ? 'high-percentage' : (percentage >= 60 ? 'medium-percentage' : 'low-percentage');
    const labels = [...subjectGrades.map(s => s.name)];
    const values = [...subjectGrades.map(s => `${s.grade} / ${s.max}`)];
    return `<tr><td colspan="4" style="background:#1a4f6e;color:#fff;padding:10px;text-align:center;font-weight:bold;">📅 ${semesterName}</td></tr><tr><td>${labels.join('<hr class="table-separator">')}</td><td>${values.join('<hr class="table-separator">')}</td><td><strong>${total} / ${totalPossible}</strong></td><td class="${percentageClass}"><strong>${percentage.toFixed(1)}%</strong><br><small>${percentage >= 60 ? '✅ ناجح' : '❌ راسب'}</small></td></tr>`;
}

// ====================== عرض النتيجة ======================
function togglePrintButton(show) {
    const btn = document.getElementById('printResultBtn');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
}

function renderStudentResult(student, studentViolations, resultBody, violationsBody, searchName = '', searchMethod = '') {
    // ✅ إذا لم توجد درجات حقيقية بأي ترم (كلها صفر - مثل النتائج المؤرشفة) – لا نعرض نتيجة إطلاقًا
    if (!hasAnyGradeAnyTerm(student)) {
        renderNoResultForStudent(resultBody, violationsBody);
        return;
    }

    let searchMethodMessage = '';
    if (searchMethod === 'code_only') searchMethodMessage = `<div style="background:#e3f2fd;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم العثور على الطالب برقم الجلوس فقط. الاسم المسجل: <strong>${escapeHtml(student.fullName)}</strong></div>`;
    else if (searchMethod === 'name_only') searchMethodMessage = `<div style="background:#fff3e0;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم العثور على الطالب بالاسم فقط. رقم الجلوس المسجل: <strong>${student.studentCode}</strong></div>`;
    let similarity = 0, nameMatchMessage = '';
    if (searchName) { similarity = calculateSimilarity(searchName, student.fullName || ''); if (similarity < 80 && similarity >= 50) nameMatchMessage = `<div style="background:#fff3cd;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;">⚠️ الاسم المدخل قريب من الاسم المسجل. تأكد من صحة البيانات.</div>`; }

    const nameHeader = `<tr><td colspan="4" style="text-align:center;padding:10px;background:#fdf8ed;"><strong>📋 ${escapeHtml(student.fullName)}</strong> &nbsp;|&nbsp; 🔢 رقم الجلوس: ${student.studentCode}</td></tr>`;
    let blocksHtml = '';
    if (hasAnyGrade(student, 'first')) blocksHtml += buildTermResultBlock(student, 'first');
    if (hasAnyGrade(student, 'second')) blocksHtml += buildTermResultBlock(student, 'second');

    resultBody.innerHTML = `${searchMethodMessage}${nameMatchMessage}${nameHeader}${blocksHtml}`;
    if (violationsBody) { if (studentViolations && studentViolations.length) violationsBody.innerHTML = studentViolations.map(v => `<tr><td data-label="النوع">${v.type==='warning'?'⚠️ إنذار':'🚫 مخالفة'}</td><td data-label="السبب">${v.reason||'-'}</td><td data-label="العقوبة">${v.penalty||'-'}</td><td data-label="استدعاء ولي الأمر">${v.parentSummons?'✅ نعم':'❌ لا'}</td><td data-label="تاريخ الإضافة">${v.date||'-'}</td></tr>`).join(''); else violationsBody.innerHTML = '<tr><td colspan="5" style="color:#28a745;">✅ لا توجد مخالفات مسجلة</td></tr>'; }
    togglePrintButton(true);
}

function renderMultipleResults(results, resultBody, violationsBody, searchMethod = '') {
    // ✅ استبعاد أي طالب نتيجته متصفرة تمامًا في الترمين (مؤرشفة) من قائمة النتائج المتعددة
    results = (results || []).filter(hasAnyGradeAnyTerm);
    if (!results || results.length === 0) { renderNoResultForStudent(resultBody, violationsBody); return; }
    if (results.length === 1) { fetchViolationsForStudent(results[0].studentCode).then(v => renderStudentResult(results[0], v, resultBody, violationsBody, '', searchMethod)); return; }
    togglePrintButton(false);
    let html = `<tr><td colspan="4" style="background:#e3f2fd;padding:10px;text-align:center;color:#1a2526;">🔍 تم العثور على <strong>${results.length}</strong> نتائج. اضغط على أي صف للتفاصيل.</td></tr>`;
    results.forEach(student => {
        const parts = [];
        if (hasAnyGrade(student, 'first')) parts.push(`الترم الأول: ${calculateStudentPercentage(student, 'first').toFixed(1)}%`);
        if (hasAnyGrade(student, 'second')) parts.push(`نهاية العام: ${calculateStudentPercentage(student, 'second').toFixed(1)}%`);
        html += `<tr style="cursor:pointer;" onclick="viewStudentDetail('${student.studentCode}')"><td><strong>${escapeHtml(student.fullName)}</strong></td><td>${student.studentCode}</td><td colspan="2"><small style="color:#d4af37;">${parts.join(' &nbsp;|&nbsp; ')}</small></td></tr>`;
    });
    resultBody.innerHTML = html; if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5" style="color:#d4af37;">🔍 تم العثور على عدة نتائج. اضغط على أي صف للتفاصيل.</td></tr>';
    window._searchResults = results;
}

window.viewStudentDetail = async function(studentCode) { const student = window._searchResults?.find(s => s.studentCode === studentCode); if (student) { const violations = await fetchViolationsForStudent(studentCode); renderStudentResult(student, violations, document.getElementById('result-table-body'), document.getElementById('violations-table-body')); window.scrollTo({ top: document.querySelector('.result-table')?.offsetTop || 0, behavior: 'smooth' }); } };

// ====================== البحث متعدد المستويات ======================
function setupSearchForm() {
    const form = document.getElementById('search-form'); if (!form) return;
    const submitBtn = form.querySelector('.submit-btn');
    const submitBtnDefaultHtml = submitBtn ? submitBtn.innerHTML : '';

    // ✅ استرجاع آخر بحث محفوظ محليًا وتعبئته تلقائيًا
    try {
        const lastSearch = JSON.parse(localStorage.getItem('lastStudentSearch') || 'null');
        if (lastSearch) {
            const nameInput = document.getElementById('search-name'), idInput = document.getElementById('search-id');
            if (nameInput && lastSearch.name) nameInput.value = lastSearch.name;
            if (idInput && lastSearch.studentCode) idInput.value = lastSearch.studentCode;
        }
    } catch { /* تجاهل أي خطأ في القراءة من التخزين المحلي */ }

    form.querySelectorAll('input').forEach(input => { input.addEventListener('keypress', function(e) { if (e.key === 'Enter') { e.preventDefault(); form.dispatchEvent(new Event('submit')); } }); });
    form.addEventListener('submit', async function(e) {
        e.preventDefault(); const name = document.getElementById('search-name')?.value.trim(); const studentCode = document.getElementById('search-id')?.value.trim(); const resultBody = document.getElementById('result-table-body'); const violationsBody = document.getElementById('violations-table-body');
        if (!name) { showToast('⚠️ يرجى إدخال اسم الطالب!', 'error'); document.getElementById('search-name')?.focus(); return; }
        if (!studentCode) { showToast('⚠️ يرجى إدخال رقم الجلوس!', 'error'); document.getElementById('search-id')?.focus(); return; }
        try { localStorage.setItem('lastStudentSearch', JSON.stringify({ name, studentCode })); } catch { /* تجاهل أي خطأ في الحفظ */ }
        showToast('🔍 جاري البحث...', 'info');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري البحث...'; }
        try {
            // ✅ في كل مرحلة: نستبعد أي طالب نتيجته متصفرة تمامًا في الترمين (مؤرشفة/غير منشورة) قبل العرض،
            // مع الاحتفاظ بالنتائج الخام لمعرفة هل الطالب مسجل أصلاً أم لا (لعرض الرسالة الصحيحة)
            // ✅ النتيجة بتتعرض تلقائيًا بالترمين (الأول ونهاية العام) من غير ما يختار المستخدم أي ترم
            const rawBoth = await searchStudentsByNameAndCode(name, studentCode);
            let results = rawBoth.filter(hasAnyGradeAnyTerm);
            if (results.length > 0) { const violations = await fetchViolationsForStudent(results[0].studentCode); renderStudentResult(results[0], violations, resultBody, violationsBody, name, results.length === 1 && calculateSimilarity(name, results[0].fullName || '') < 80 ? 'code_only' : ''); const similarity = calculateSimilarity(name, results[0].fullName || ''); showToast(similarity >= 90 ? `✅ تم العثور: ${results[0].fullName}` : `✅ تم العثور برقم الجلوس: ${results[0].fullName}`, similarity >= 90 ? 'success' : 'warning'); return; }

            const rawCode = await searchByCodeOnly(studentCode);
            const codeResults = rawCode.filter(hasAnyGradeAnyTerm);
            if (codeResults.length === 1) { const violations = await fetchViolationsForStudent(codeResults[0].studentCode); renderStudentResult(codeResults[0], violations, resultBody, violationsBody, name, 'code_only'); showToast(`✅ تم العثور برقم الجلوس: ${codeResults[0].fullName} (الاسم مختلف)`, 'warning'); return; }
            else if (codeResults.length > 1) { renderMultipleResults(codeResults, resultBody, violationsBody, 'code_only'); showToast(`✅ تم العثور على ${codeResults.length} طلاب بنفس رقم الجلوس`, 'info'); return; }

            const rawName = await searchByNameOnly(name);
            const nameResults = rawName.filter(hasAnyGradeAnyTerm);
            if (nameResults.length === 1) { const violations = await fetchViolationsForStudent(nameResults[0].studentCode); renderStudentResult(nameResults[0], violations, resultBody, violationsBody, name, 'name_only'); showToast(`✅ تم العثور بالاسم: ${nameResults[0].fullName}`, 'warning'); return; }
            else if (nameResults.length > 1) { renderMultipleResults(nameResults, resultBody, violationsBody, 'name_only'); showToast(`✅ تم العثور على ${nameResults.length} طلاب بالاسم. اختر الصحيح`, 'info'); return; }

            // ✅ لو فيه سجل طالب مطابق فعليًا (بالاسم أو الكود) لكن نتيجته متصفرة/مؤرشفة، نوضح الرسالة الصحيحة
            if (rawBoth.length > 0 || rawCode.length > 0 || rawName.length > 0) {
                renderNoResultForStudent(resultBody, violationsBody);
                showToast('📭 لا توجد نتائج لهذا الطالب حاليًا.', 'error');
                return;
            }

            resultBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;"><div style="color:#dc3545;font-size:1.1em;margin-bottom:10px;">❌ لم يتم العثور على أي طالب</div><div style="color:#666;font-size:0.85em;">تأكد من:<br>• صحة كتابة الاسم ورقم الجلوس<br>• عدم وجود مسافات زائدة<br>• أن الطالب مسجل في النظام</div></td></tr>`;
            if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">❌ لا توجد نتيجة!</td></tr>';
            togglePrintButton(false);
            showToast('❌ لم يتم العثور على الطالب. تأكد من البيانات أو تواصل مع الإدارة.', 'error');
        } catch (error) { console.error('❌ خطأ في البحث:', error); resultBody.innerHTML = '<tr><td colspan="4">❌ حدث خطأ في البحث!</td></tr>'; if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">❌ حدث خطأ!</td></tr>'; togglePrintButton(false); showToast('❌ حدث خطأ في الاتصال بالسيرفر', 'error'); }
        finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = submitBtnDefaultHtml; } }
    });
}

// ====================== باقي الدوال ======================
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
        // ✅ رابط صفحة الفعاليات الجديد
        { href: 'events.html', icon: 'fa-solid fa-calendar', title: 'الفعاليات' },
        { href: 'file-library.html', icon: 'fas fa-folder-open', title: 'المكتبة' },
        { href: 'developer.html', icon: 'fa-solid fa-microchip', title: 'عن المطور' }
    ];

    // إضافة رابط لوحة التحكم للأدمن فقط
    if (user?.type === 'admin') {
        links.push({ href: 'admin.html', icon: 'fas fa-cogs', title: 'لوحة التحكم' });
    }

    // توليد روابط شريط التنقل
    navBar.innerHTML = links.map(l => 
        `<a href="${l.href}" title="${l.title}">
            <i class="${l.icon}"></i>
            <span>${l.title}</span>
        </a>`
    ).join('');

    // ✅ تمييز الرابط النشط (Active Link)
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = navBar.querySelectorAll('a');
    navLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}
function renderWelcomeMessage() { const welcomeDiv = document.querySelector('.welcome-message'); const user = getLoggedInUser(); if (!welcomeDiv) return; if (user) { const name = user.fullName || user.username; welcomeDiv.textContent = user.type === 'admin' ? `👋 أهلًا يا قائد العمليات، ${name}! 🛠️` : `🎉 مرحبًا يا نجم، ${name}! نتايجك في انتظارك! 📚`; } else { welcomeDiv.textContent = '👋 مرحبًا بك! سجل الدخول لرؤية نتائجك'; } }
async function verifySession() { try { const response = await fetch(`${BASE_URL}/api/verify-session`, { credentials: 'include' }); if (response.ok) return true; } catch (error) { console.error('❌ خطأ في التحقق من الجلسة:', error); if (window.location.hostname === 'localhost') return true; } window.location.href = 'login.html'; return false; }
async function logout() { try { await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }); } catch (err) {} finally { sessionStorage.clear(); window.location.href = 'login.html'; } }
function setupLogoutButton() { const logoutBtn = document.querySelector('.logout-btn'); if (logoutBtn) logoutBtn.addEventListener('click', logout); }
function initLibraryTour() { const hasSeenTour = localStorage.getItem('hasSeenLibraryTour'); if (hasSeenTour === 'true') { const tour = document.getElementById('guidedTour'); if (tour) tour.style.display = 'none'; return; } setTimeout(() => { const tour = document.getElementById('guidedTour'); if (tour) tour.style.display = 'flex'; }, 2000); document.getElementById('closeTourBtn')?.addEventListener('click', function() { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); }); document.getElementById('gotoLibraryBtn')?.addEventListener('click', function() { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); window.location.href = 'file-library.html'; }); document.getElementById('dontShowAgain')?.addEventListener('click', function() { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); }); }
window.refreshAttendance = function(studentCode) { if (studentCode) { fetchAttendanceStats(studentCode, true); } else { const user = getLoggedInUser(); if (user && user.type === 'student' && user.id) { fetchAttendanceStats(user.id, true); } } };
let attendanceChannel = null;
function setupAttendanceChannel() { try { attendanceChannel = new BroadcastChannel('attendance-updates'); attendanceChannel.onmessage = function(event) { if (event.data && event.data.type === 'attendance-updated') { const user = getLoggedInUser(); if (user && user.type === 'student' && user.id) { fetchAttendanceStats(user.id, true).then(() => { renderAttendanceStats(); }); } } }; } catch (e) { console.log('⚠️ BroadcastChannel غير مدعوم'); } }

// ====================== البوت المساعد الذكي ======================
class SmartAssistantBot {
    constructor() { this.bot = document.getElementById('liveBot'); this.bubble = document.getElementById('botSpeechBubble'); this.bubbleText = document.getElementById('botSpeechText'); this.screenMsg = document.getElementById('botScreenMsg'); this.isSpeaking = false; this.originalPosition = { right: 20, bottom: 20 }; this.userName = this.getUserName(); this.fields = { name: document.getElementById('search-name'), code: document.getElementById('search-id'), submit: document.querySelector('.submit-btn') }; this.init(); }
    getUserName() { const user = getLoggedInUser(); return user?.fullName || user?.username || 'صديقي'; }
    init() { this.resetPosition(); this.attachFieldListeners(); this.welcomeUser(); this.observeSearchErrors(); }
    resetPosition() { if (!this.bot) return; this.bot.style.bottom = this.originalPosition.bottom + 'px'; this.bot.style.right = this.originalPosition.right + 'px'; this.bot.style.left = 'auto'; this.bot.style.top = 'auto'; }
    moveToField(fieldElement) { if (!fieldElement || !this.bot) return; const fieldRect = fieldElement.getBoundingClientRect(); let targetRight = window.innerWidth - fieldRect.right + 10; let targetBottom = window.innerHeight - fieldRect.top + 10; targetRight = Math.max(10, Math.min(window.innerWidth - 100, targetRight)); targetBottom = Math.max(10, Math.min(window.innerHeight - 150, targetBottom)); this.bot.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)'; this.bot.style.right = targetRight + 'px'; this.bot.style.bottom = targetBottom + 'px'; this.bot.style.left = 'auto'; this.bot.style.top = 'auto'; setTimeout(() => { this.resetPosition(); }, 4000); }
    pointTo(element) { if (!element) return; const rightArm = document.querySelector('.bot-arm-right'); if (rightArm) { rightArm.classList.add('pointing'); setTimeout(() => { rightArm.classList.remove('pointing'); }, 800); } element.classList.add('field-error'); element.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { element.classList.remove('field-error'); }, 2000); }
    attachFieldListeners() { if (this.fields.name) { this.fields.name.addEventListener('blur', () => { if (!this.fields.name.value.trim()) { this.moveToField(this.fields.name); this.pointTo(this.fields.name); this.speak('📝 من فضلك اكتب اسم الطالب في هذا الحقل', 3500); this.setEmotion('angry'); } else { this.setEmotion('happy'); } }); } if (this.fields.code) { this.fields.code.addEventListener('blur', () => { if (!this.fields.code.value.trim()) { this.moveToField(this.fields.code); this.pointTo(this.fields.code); this.speak('🔢 من فضلك أدخل رقم الجلوس هنا', 3500); this.setEmotion('angry'); } else if (this.fields.code.value.length < 5 || this.fields.code.value.length > 7) { this.moveToField(this.fields.code); this.pointTo(this.fields.code); this.speak('⚠️ رقم الجلوس غير صحيح! يجب أن يكون 5-7 أرقام', 4000); this.setEmotion('angry'); } else { this.setEmotion('happy'); } }); } if (this.fields.submit) { this.fields.submit.addEventListener('click', (e) => { if (!this.fields.name.value.trim() || !this.fields.code.value.trim()) { e.preventDefault(); if (!this.fields.name.value.trim()) { this.moveToField(this.fields.name); this.pointTo(this.fields.name); this.speak(`✏️ يا ${this.userName}، اكتب اسم الطالب أولاً`, 3500); } else if (!this.fields.code.value.trim()) { this.moveToField(this.fields.code); this.pointTo(this.fields.code); this.speak(`🔢 يا ${this.userName}، أدخل رقم الجلوس`, 3500); } this.setEmotion('angry'); } else { this.speak('🔍 جاري البحث... انتظر قليلاً', 2000); this.setEmotion('excited'); } }); } }
    observeSearchErrors() { const observer = new MutationObserver((mutations) => { const resultBody = document.getElementById('result-table-body'); if (resultBody && (resultBody.innerHTML.includes('لا توجد نتيجة') || resultBody.innerHTML.includes('لم يتم العثور'))) { if (!this.fields.name.value.trim()) { this.moveToField(this.fields.name); this.pointTo(this.fields.name); this.speak('⚠️ لم يتم العثور على الطالب! تأكد من كتابة الاسم بشكل صحيح', 4500); } else if (!this.fields.code.value.trim()) { this.moveToField(this.fields.code); this.pointTo(this.fields.code); this.speak('⚠️ لم يتم العثور على الطالب! رقم الجلوس غير صحيح', 4500); } else { this.speak('😕 لم يتم العثور على طالب بهذا الاسم ورقم الجلوس', 5000); } this.setEmotion('sad'); } else if (resultBody && !resultBody.innerHTML.includes('قم بالبحث') && !resultBody.innerHTML.includes('لا توجد')) { this.speak('🎉 تهانينا! تم العثور على النتيجة بنجاح', 3500); this.dance(); this.setEmotion('happy'); } }); const target = document.getElementById('result-table-body'); if (target) observer.observe(target, { childList: true, subtree: true }); }
    speak(message, duration = 3500) { if (this.isSpeaking || !this.bubble || !this.bubbleText || !this.screenMsg) return; this.isSpeaking = true; this.bubbleText.textContent = message; this.screenMsg.textContent = message.substring(0, 15) + (message.length > 15 ? '..' : ''); this.setEmotion('speaking'); this.bubble.classList.remove('show'); setTimeout(() => { if (this.bubble) this.bubble.classList.add('show'); }, 100); setTimeout(() => { if (this.bubble) this.bubble.classList.remove('show'); this.isSpeaking = false; this.setEmotion('happy'); }, duration); }
    setEmotion(emotion) { const bot = document.querySelector('.live-bot'); if (!bot) return; bot.classList.remove('angry', 'happy', 'sad', 'speaking'); switch(emotion) { case 'happy': bot.classList.add('happy'); break; case 'sad': bot.classList.add('sad'); break; case 'angry': bot.classList.add('angry'); break; case 'speaking': bot.classList.add('speaking'); break; default: bot.classList.add('happy'); } }
    dance() { const bot = this.bot; if (!bot) return; bot.style.animation = 'none'; setTimeout(() => { bot.style.animation = 'headBob 0.1s infinite'; }, 10); const rightArm = document.querySelector('.bot-arm-right'); if (rightArm) { rightArm.style.animation = 'point 0.3s 3'; } setTimeout(() => { bot.style.animation = 'headBob 2s ease-in-out infinite'; if (rightArm) rightArm.style.animation = ''; }, 1500); }
    welcomeUser() { setTimeout(() => { const hour = new Date().getHours(); let greeting = ''; if (hour < 12) greeting = 'صباح الخير'; else if (hour < 16) greeting = 'أهلاً بك'; else greeting = 'مساء الخير'; this.speak(`${greeting} يا ${this.userName}! 👋 أنا مساعدك. اكتب اسم الطالب ورقم الجلوس واضغط عرض النتيجة`, 5000); this.pointTo(this.fields.name); }, 1500); }
}


// ====================== 🏆 العشرة الأوائل (بيانات مدمجة من صفحة الشهادات) ======================

let topStudentsData = { first: [], second: [] };
let currentTopGradeTab = 'first';

// ✅ بيانات الطلاب المتفوقين (مطابقة لصفحة الشهادات)
const TOP_STUDENTS_FIRST = [
    { rank: 1, code: '542', name: 'منه أحمد عبد الفتاح أحمد' },
    { rank: 2, code: '531', name: 'محمد أحمد محمد أحمد' },
    { rank: 3, code: '539', name: 'فاطمه خيرى عبدالله حسن' },
    { rank: 4, code: '541', name: 'ملك محمد أحمد محمد' },
    { rank: 5, code: '533', name: 'داليا عبد السلام بدرى محمد' },
    { rank: 6, code: '535', name: 'زمزم مصطفى فؤاد محمود' },
    { rank: 7, code: '536', name: 'زينب محمد عبد الدليم محمد' },
    { rank: 8, code: '532', name: 'ايه سعد الله عبد الله على' },
    { rank: 9, code: '538', name: 'شاهندا صابر سيد سعدى أحمد' },
    { rank: 10, code: '540', name: 'ملك تيسير محمد الزاهر' }
];

const TOP_STUDENTS_SECOND = [
    { rank: 1, code: '1096', name: 'مرفت مصطفى على يوسف' },
    { rank: 2, code: '1081', name: 'ريتاج محمد الطاهر مشهد عبد المجيد' },
    { rank: 3, code: '1095', name: 'لمياء احمد محمد عبد الراضي' },
    { rank: 4, code: '1013', name: 'عبد الرحمن اشرف سيد احمد' },
    { rank: 5, code: '1098', name: 'مروة حسن احمد فرشوطي' },
    { rank: 6, code: '1109', name: 'هاجر قرني خيري عرفات' },
    { rank: 7, code: '1094', name: 'فرحة سالم ابراهيم سالم' },
    { rank: 8, code: '1014', name: 'عبد الرحمن جابر عبد القادر احمد' },
    { rank: 9, code: '1097', name: 'مروة احمد حامد قناوي' },
    { rank: 10, code: '1074', name: 'جهاد هاني عبد الجواد مصطفى' }
];

// تحميل الطلاب المتفوقين
async function loadTopStudents() {
    const section = document.getElementById('topStudentsSection');
    if (!section) return;
    
    try {
        // ✅ استخدام البيانات المدمجة مباشرة
        topStudentsData.first = TOP_STUDENTS_FIRST;
        topStudentsData.second = TOP_STUDENTS_SECOND;
        
        // عرض الطلاب
        renderTopStudentsList('first');
        renderTopStudentsList('second');
        
        console.log('✅ تم تحميل العشرة الأوائل من البيانات المدمجة');
    } catch (error) {
        console.error('❌ خطأ في تحميل الطلاب المتفوقين:', error);
        renderNoTopStudents('first');
        renderNoTopStudents('second');
    }
}

// تبديل التبويبات
window.switchTopGradeTab = function(grade) {
    currentTopGradeTab = grade;
    
    document.querySelectorAll('.top-grade-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.grade === grade);
    });
    
    document.querySelectorAll('.top-grade-list').forEach(list => {
        list.style.display = 'none';
    });
    
    const targetList = document.getElementById(`${grade}GradeTopList`);
    if (targetList) targetList.style.display = 'block';
};

// عرض قائمة الطلاب
function renderTopStudentsList(grade) {
    const container = document.getElementById(`${grade}GradeTopList`);
    if (!container) return;
    
    const students = topStudentsData[grade];
    
    if (!students || students.length === 0) {
        renderNoTopStudents(grade);
        return;
    }
    
    let html = `<div class="top-students-grid">`;
    
    students.forEach((student) => {
        const rank = student.rank;
        let medalClass = 'normal';
        let cardClass = 'rank-other';
        let medalIcon = rank;
        
        if (rank === 1) { medalClass = 'gold'; cardClass = 'rank-1'; medalIcon = '🥇'; }
        else if (rank === 2) { medalClass = 'silver'; cardClass = 'rank-2'; medalIcon = '🥈'; }
        else if (rank === 3) { medalClass = 'bronze'; cardClass = 'rank-3'; medalIcon = '🥉'; }
        
        html += `
            <div class="top-student-card ${cardClass}" onclick="viewTopStudentDetails('${student.code}')">
                <div class="top-medal ${medalClass}">${medalIcon}</div>
                <div class="top-student-info">
                    <div class="top-student-name" title="${escapeHtml(student.name)}">${escapeHtml(student.name)}</div>
                    <div class="top-student-code"><i class="fas fa-id-card"></i> <span>${student.code}</span></div>
                </div>
                <div class="top-student-percentage">
                    <div class="top-percentage-value">#${rank}</div>
                    <div class="top-percentage-label">المركز</div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// عرض رسالة عدم وجود طلاب
function renderNoTopStudents(grade) {
    const container = document.getElementById(`${grade}GradeTopList`);
    if (!container) return;
    const gradeName = grade === 'first' ? 'الصف الأول' : 'الصف الثاني';
    container.innerHTML = `
        <div class="no-top-students">
            <i class="fas fa-user-graduate"></i>
            <h3>لا يوجد طلاب متفوقون في ${gradeName}</h3>
            <p>لم يتم تسجيل أي بيانات للطلاب في هذا الصف بعد</p>
        </div>
    `;
}

// عرض تفاصيل الطالب المتفوق
window.viewTopStudentDetails = async function(studentCode) {
    try {
        const allTopStudents = [...TOP_STUDENTS_FIRST, ...TOP_STUDENTS_SECOND];
        const student = allTopStudents.find(s => s.code === studentCode);
        
        if (student) {
            const nameInput = document.getElementById('search-name');
            const codeInput = document.getElementById('search-id');
            
            if (nameInput && codeInput) {
                nameInput.value = student.name;
                codeInput.value = student.code;
                
                const form = document.getElementById('search-form');
                if (form) form.dispatchEvent(new Event('submit'));
                
                setTimeout(() => {
                    const resultSection = document.querySelector('.result-table');
                    if (resultSection) resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 500);
                
                showToast(`📊 عرض نتيجة: ${student.name}`, 'info');
            }
        } else {
            showToast('❌ لم يتم العثور على الطالب', 'error');
        }
    } catch (error) {
        console.error('خطأ في عرض تفاصيل الطالب:', error);
        showToast('❌ حدث خطأ', 'error');
    }
};

// ====================== التشغيل ======================
// ====================== بحث ذكي مستقل عن المخالفات والإنذارات ======================
function setupViolationSearchForm() {
    const form = document.getElementById('violation-search-form'); if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('violation-search-name')?.value.trim();
        const code = document.getElementById('violation-search-code')?.value.trim();
        const resultBody = document.getElementById('violation-search-result-body');
        const matchMsg = document.getElementById('violation-search-match-msg');
        if (!name) { showToast('⚠️ يرجى إدخال اسم الطالب!', 'error'); document.getElementById('violation-search-name')?.focus(); return; }
        if (!code) { showToast('⚠️ يرجى إدخال آخر 7 أرقام من البطاقة!', 'error'); document.getElementById('violation-search-code')?.focus(); return; }
        if (matchMsg) matchMsg.innerHTML = '';
        showToast('🔍 جاري البحث عن المخالفات...', 'info');
        try {
            // ✅ نفس منطق التعرف الذكي المستخدم في بحث النتيجة: بالاسم+الكود، ثم الكود بس، ثم الاسم بس
            let student = null, matchType = '';
            const rawBoth = await searchStudentsByNameAndCode(name, code);
            if (rawBoth.length > 0) { student = rawBoth[0]; matchType = calculateSimilarity(name, student.fullName || '') >= 90 ? 'both' : 'code_only'; }
            else {
                const codeResults = await searchByCodeOnly(code);
                if (codeResults.length >= 1) { student = codeResults[0]; matchType = 'code_only'; }
                else { const nameResults = await searchByNameOnly(name); if (nameResults.length >= 1) { student = nameResults[0]; matchType = 'name_only'; } }
            }
            if (!student) {
                resultBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">❌ لم يتم العثور على أي طالب بهذا الاسم أو رقم البطاقة</td></tr>';
                showToast('❌ لم يتم العثور على طالب بهذه البيانات', 'error');
                return;
            }
            if (matchType === 'code_only') matchMsg.innerHTML = `<div style="background:#e3f2fd;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم التعرف على الطالب برقم البطاقة. الاسم المسجل: <strong>${escapeHtml(student.fullName)}</strong></div>`;
            else if (matchType === 'name_only') matchMsg.innerHTML = `<div style="background:#fff3e0;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم التعرف على الطالب بالاسم فقط (رقم البطاقة غير مطابق تمامًا). رقم الجلوس المسجل: <strong>${student.studentCode}</strong></div>`;
            else matchMsg.innerHTML = `<div style="background:#e8f5e9;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">✅ تم التعرف على الطالب: <strong>${escapeHtml(student.fullName)}</strong></div>`;

            const violations = await fetchViolationsForStudent(student.studentCode);
            if (!violations || !violations.length) { resultBody.innerHTML = '<tr><td colspan="5" style="color:#28a745;text-align:center;padding:16px;">✅ لا توجد مخالفات أو إنذارات مسجلة لهذا الطالب</td></tr>'; showToast(`✅ ${student.fullName} - لا توجد مخالفات مسجلة`, 'success'); return; }
            resultBody.innerHTML = violations.map(v => `<tr><td data-label="النوع">${v.type === 'warning' ? '⚠️ إنذار' : '🚫 مخالفة'}</td><td data-label="السبب">${escapeHtml(v.reason || '-')}</td><td data-label="العقوبة">${escapeHtml(v.penalty || '-')}</td><td data-label="استدعاء ولي الأمر">${v.parentSummons ? '✅ نعم' : '❌ لا'}</td><td data-label="تاريخ الإضافة">${v.date || '-'}</td></tr>`).join('');
            showToast(`⚠️ ${student.fullName} - تم العثور على ${violations.length} مخالفة/إنذار`, 'warning');
        } catch (error) {
            console.error('❌ خطأ في بحث المخالفات:', error);
            resultBody.innerHTML = '<tr><td colspan="5">❌ حدث خطأ في البحث!</td></tr>';
            showToast('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        }
    });
}

async function init() { if (!(await verifySession())) return; window.initBiometricPrompt?.(); await loadNotifications(); renderNavbar(); renderWelcomeMessage(); await renderDashboard(); setupSearchForm(); setupViolationSearchForm(); setupLogoutButton(); initLibraryTour(); setupAttendanceChannel();
    document.getElementById('printResultBtn')?.addEventListener('click', function() { window.print(); });
await loadTopStudents(); setInterval(async () => { try { await fetch(`${BASE_URL}/api/refresh-token`, { method: 'POST', credentials: 'include' }); } catch (e) {} }, 55 * 60 * 1000); setTimeout(() => { if (document.getElementById('liveBot')) window.smartBot = new SmartAssistantBot(); }, 800); }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
