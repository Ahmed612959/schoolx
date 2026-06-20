// Home.js - النسخة الكاملة النهائية

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
            style: { fontFamily: '"Tajawal", sans-serif', fontSize: '18px', direction: 'rtl', borderRadius: '12px', padding: '16px 24px' }
        }).showToast();
    } else { alert(message); }
}

async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (response.status === 401) { window.location.href = '/login.html'; throw new Error('انتهت الجلسة'); }
    return response;
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

// ====================== تعريف المواد للترمين ======================
const SUBJECTS_CONFIG_FIRST = { "اللغة العربية": { max: 20 }, "اللغة الإنجليزية": { max: 20 }, "علوم تطبيقية": { max: 40 }, "طب باطنة": { max: 20 }, "تمريض باطني جراحي": { max: 24 }, "حاسب آلي": { max: 20 }, "الدين": { max: 32, isExtra: true } };
const SUBJECTS_CONFIG_SECOND = { "اللغة العربية": { max: 20 }, "اللغة الإنجليزية": { max: 20 }, "تمريض باطني جراحي": { max: 24 }, "صحة مجتمع": { max: 20 }, "جراحة عامة": { max: 20 }, "حاسب آلي": { max: 20 }, "الإحصاء": { max: 20 } };
const TOTAL_POSSIBLE_FIRST = 144, TOTAL_POSSIBLE_SECOND = 144;
const ORDERED_SUBJECTS_FIRST = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"];
const ORDERED_SUBJECTS_SECOND = ["اللغة العربية", "اللغة الإنجليزية", "تمريض باطني جراحي", "صحة مجتمع", "جراحة عامة", "حاسب آلي", "الإحصاء"];
const FIRST_SEMESTER_UNIQUE_SUBJECTS = ["علوم تطبيقية", "طب باطنة", "الدين"];
const SECOND_SEMESTER_UNIQUE_SUBJECTS = ["صحة مجتمع", "جراحة عامة", "الإحصاء"];

function normalizeSubjectName(name) {
    if (!name) return '';
    const m = { 'التربية الدينية': 'الدين', 'دين': 'الدين', 'الكمبيوتر': 'حاسب آلي', 'كمبيوتر': 'حاسب آلي', 'التمريض الباطني الجراحي': 'تمريض باطني جراحي', 'الطب الباطنة': 'طب باطنة', 'العلوم التطبيقية': 'علوم تطبيقية', 'الصحة المجتمع': 'صحة مجتمع', 'الجراحة العامة': 'جراحة عامة', 'الاحصاء': 'الإحصاء' };
    return m[name.trim()] || name.trim();
}
function detectSemester(subjects) {
    if (!subjects || !subjects.length) return null;
    const names = subjects.map(s => normalizeSubjectName(s.name));
    if (FIRST_SEMESTER_UNIQUE_SUBJECTS.some(s => names.includes(s)) && !SECOND_SEMESTER_UNIQUE_SUBJECTS.some(s => names.includes(s))) return 'first';
    if (SECOND_SEMESTER_UNIQUE_SUBJECTS.some(s => names.includes(s)) && !FIRST_SEMESTER_UNIQUE_SUBJECTS.some(s => names.includes(s))) return 'second';
    let fc = 0, sc = 0; names.forEach(n => { if (FIRST_SEMESTER_UNIQUE_SUBJECTS.includes(n)) fc++; if (SECOND_SEMESTER_UNIQUE_SUBJECTS.includes(n)) sc++; });
    return fc > sc ? 'first' : 'second';
}
function getSubjectConfig(s) { return s === 'first' ? SUBJECTS_CONFIG_FIRST : SUBJECTS_CONFIG_SECOND; }
function getOrderedSubjects(s) { return s === 'first' ? ORDERED_SUBJECTS_FIRST : ORDERED_SUBJECTS_SECOND; }
function getTotalPossible(s) { return s === 'first' ? TOTAL_POSSIBLE_FIRST : TOTAL_POSSIBLE_SECOND; }
function getSemesterName(s) { return s === 'first' ? 'الترم الأول' : 'الترم الثاني'; }
function calculateStudentTotal(student) {
    if (!student.subjects) return 0;
    const sem = student.semester || detectSemester(student.subjects) || 'first', cfg = getSubjectConfig(sem);
    let t = 0; student.subjects.forEach(s => { const n = normalizeSubjectName(s.name); if (cfg[n] && !cfg[n].isExtra) t += s.grade || 0; });
    return t;
}
function calculateStudentPercentage(student) {
    const t = calculateStudentTotal(student), sem = student.semester || detectSemester(student.subjects) || 'first', p = getTotalPossible(sem);
    return p > 0 ? (t / p) * 100 : 0;
}

// ====================== جلب البيانات ======================
async function fetchAllStudents() {
    try {
        const r = await apiRequest('/api/students/all');
        if (r.ok) return await r.json();
        const ar = await apiRequest('/api/admin/students');
        if (ar.ok) return await ar.json();
        return [];
    } catch { return []; }
}
async function fetchStudentByCode(code) {
    try { const all = await fetchAllStudents(); return all.find(s => s.studentCode === code) || null; } catch { return null; }
}
async function fetchViolationsForStudent(id) {
    try { const r = await apiRequest(`/api/violations/student/${encodeURIComponent(id)}`); if (r.ok) return await r.json(); return []; } catch { return []; }
}
async function loadNotifications() {
    try {
        const r = await fetch(`${BASE_URL}/api/notifications`);
        if (r.ok) {
            const ns = await r.json(), tb = document.getElementById('notifications-table-body');
            if (tb) { tb.innerHTML = ns.length ? ns.map(n => `<tr><td>${n.text||''}</td><td>${n.date||''}</td></tr>`).join('') : '<tr><td colspan="2">لا توجد إشعارات</td></tr>'; }
        }
    } catch {}
}
async function searchByCodeOnly(code) { const all = await fetchAllStudents(); return all.filter(s => s.studentCode === code || s.studentCode.includes(code)); }
async function searchByNameOnly(name) {
    const all = await fetchAllStudents(); if (!all.length) return [];
    const sn = normalizeArabicText(name), sp = sn.split(' ').filter(p => p.length > 0);
    let r = all.filter(s => { const sn2 = normalizeArabicText(s.fullName||''); return sp.every(p => sn2.includes(p)) || calculateSimilarity(name, s.fullName||'') >= 60; });
    r.sort((a,b) => calculateSimilarity(name,b.fullName||'') - calculateSimilarity(name,a.fullName||''));
    return r.slice(0,10);
}

// ====================== الحضور - مع تحديث فوري ======================
let attendanceStats = null, lastAttendanceFetch = 0, ATTENDANCE_FETCH_INTERVAL = 5000;
async function fetchAttendanceStats(studentCode, force = false) {
    const now = Date.now();
    if (!force && (now - lastAttendanceFetch) < ATTENDANCE_FETCH_INTERVAL) return attendanceStats;
    try {
        const response = await apiRequest(`/api/attendance/student/${studentCode}?t=${now}`);
        if (response.ok) {
            const data = await response.json(); lastAttendanceFetch = now;
            let attendanceRecords = [];
            if (Array.isArray(data)) attendanceRecords = data;
            else if (data && typeof data === 'object') {
                if (Array.isArray(data.records)) attendanceRecords = data.records;
                else if (Array.isArray(data.results)) attendanceRecords = data.results;
                else if (Array.isArray(data.data)) attendanceRecords = data.data;
                else { const keys = Object.keys(data); if (keys.length && !isNaN(keys[0])) attendanceRecords = Object.values(data); else attendanceRecords = []; }
            }
            if (!Array.isArray(attendanceRecords)) attendanceRecords = [];
            const present = attendanceRecords.filter(a => a.status === 'present').length;
            const absent = attendanceRecords.filter(a => a.status === 'absent').length;
            const late = attendanceRecords.filter(a => a.status === 'late').length;
            const total = attendanceRecords.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            const presentRecords = attendanceRecords.filter(a => a.status === 'present').sort((a, b) => new Date(b.date) - new Date(a.date));
            const absentRecords = attendanceRecords.filter(a => a.status === 'absent').sort((a, b) => new Date(b.date) - new Date(a.date));
            const newStats = { present, absent, late, total, percentage: percentage.toFixed(1), lastPresentDate: presentRecords.length ? formatDate(presentRecords[0].date) : null, lastAbsentDate: absentRecords.length ? formatDate(absentRecords[0].date) : null, records: attendanceRecords, hasRecords: total > 0 };
            const hasChanged = !attendanceStats || attendanceStats.present !== newStats.present || attendanceStats.absent !== newStats.absent || attendanceStats.late !== newStats.late || attendanceStats.hasRecords !== newStats.hasRecords;
            attendanceStats = newStats; renderAttendanceStats();
            if (hasChanged && attendanceStats.total > 0 && lastAttendanceFetch > 1000) showToast(`📊 تم تحديث الحضور: ${attendanceStats.present} حاضر، ${attendanceStats.absent} غائب، ${attendanceStats.late} متأخر`, 'info');
            return attendanceStats;
        }
        return attendanceStats;
    } catch (error) { return attendanceStats || { present:0, absent:0, late:0, total:0, percentage:0, lastPresentDate:null, lastAbsentDate:null, records:[], hasRecords:false }; }
}
function formatDate(d) { if (!d) return null; try { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; } catch { return d; } }
function renderAttendanceStats() {
    const sec = document.getElementById('attendanceStatsSection'); if (!sec) return;
    const user = getLoggedInUser(); if (!user || user.type !== 'student') { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    const noMsg = document.getElementById('noAttendanceMessage'), grid = document.querySelector('.attendance-stats-grid'), dates = document.querySelector('.attendance-dates');
    const has = attendanceStats && attendanceStats.total > 0 && attendanceStats.records && attendanceStats.records.length > 0;
    if (!has) {
        if (noMsg) { noMsg.style.display = 'block'; noMsg.innerHTML = '📌 لم يتم تسجيل أي حضور أو غياب لك حتى الآن.'; }
        if (grid) grid.style.display = 'none'; if (dates) dates.style.display = 'none';
        document.getElementById('presentCount').textContent = '0'; document.getElementById('absentCount').textContent = '0';
        document.getElementById('lateCount').textContent = '0'; document.getElementById('attendancePercentage').textContent = '0%';
        return;
    }
    if (noMsg) { noMsg.style.display = 'none'; noMsg.innerHTML = ''; }
    if (grid) grid.style.display = 'grid'; if (dates) dates.style.display = 'flex';
    document.getElementById('presentCount').textContent = attendanceStats.present;
    document.getElementById('absentCount').textContent = attendanceStats.absent;
    document.getElementById('lateCount').textContent = attendanceStats.late;
    document.getElementById('attendancePercentage').textContent = attendanceStats.percentage + '%';
    document.getElementById('lastPresentDate').textContent = attendanceStats.lastPresentDate || 'لم يتم تسجيل بعد';
    document.getElementById('lastAbsentDate').textContent = attendanceStats.lastAbsentDate || 'لم يتم تسجيل بعد';
}
let attendancePollingInterval = null;
function startAttendancePolling(code) { if (attendancePollingInterval) clearInterval(attendancePollingInterval); fetchAttendanceStats(code, true); attendancePollingInterval = setInterval(() => fetchAttendanceStats(code, true), ATTENDANCE_FETCH_INTERVAL); }
function stopAttendancePolling() { if (attendancePollingInterval) { clearInterval(attendancePollingInterval); attendancePollingInterval = null; } }

// ====================== لوحة التحكم ======================
let currentStudentCode = null;
async function renderDashboard() {
    const user = getLoggedInUser(), db = document.getElementById('dashboard');
    if (!db || !user || user.type !== 'student') { if (db) db.style.display = 'none'; document.getElementById('attendanceStatsSection').style.display = 'none'; return; }
    const student = await fetchStudentByCode(user.id); if (!student) { db.style.display = 'none'; return; }
    db.style.display = 'block'; currentStudentCode = student.studentCode;
    if (student.subjects && student.subjects.length) {
        const pct = calculateStudentPercentage(student), total = calculateStudentTotal(student);
        const sem = student.semester || detectSemester(student.subjects) || 'first', tp = getTotalPossible(sem), sn = getSemesterName(sem);
        document.getElementById('student-percentage').innerHTML = `📊 نسبة نجاحك: <strong>${pct.toFixed(1)}%</strong><br><small>(المجموع: ${total} / ${tp}) - ${sn}</small>`;
        document.getElementById('class-average').innerHTML = '📈 --';
        const cfg = getSubjectConfig(sem); let rg = 0; const es = Object.entries(cfg).find(([_,v])=>v.isExtra);
        if (es) { const sub = student.subjects?.find(s => normalizeSubjectName(s.name) === es[0]); rg = sub?.grade || 0; }
        let rd = document.getElementById('religionDisplay'); if (!rd) { rd = document.createElement('div'); rd.id = 'religionDisplay'; rd.style.cssText = 'margin-top:10px;padding:8px;background:#f0f0f0;border-radius:8px;text-align:center;'; document.querySelector('.stats')?.appendChild(rd); }
        if (rg > 0 || es) rd.innerHTML = es ? `📖 ${es[0]}: <strong>${rg} / ${es[1].max}</strong> (خارج المجموع)` : '';
        const os = getOrderedSubjects(sem), sg = os.filter(n => !cfg[n]?.isExtra).map(n => { const s = student.subjects?.find(x => normalizeSubjectName(x.name) === n); return { name: n, grade: s ? (s.grade||0) : 0, max: cfg[n]?.max||100 }; });
        const ctx = document.getElementById('gradesChart')?.getContext('2d');
        if (ctx && typeof Chart !== 'undefined') { if (window.gradesChart) window.gradesChart.destroy(); window.gradesChart = new Chart(ctx, { type: 'bar', data: { labels: sg.map(s => s.name), datasets: [{ label: 'درجاتك', data: sg.map(s => s.grade), backgroundColor: 'rgba(212,175,55,0.8)', borderColor: '#d4af37', borderWidth: 2 }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: Math.max(...sg.map(s => s.max)) + 5 } }, plugins: { legend: { display: false } } } }); }
    } else { document.getElementById('student-percentage').innerHTML = '📊 لا توجد درجات مسجلة حتى الآن'; document.getElementById('class-average').innerHTML = '📈 --'; }
    if (student.studentCode) { await fetchAttendanceStats(student.studentCode, true); renderAttendanceStats(); startAttendancePolling(student.studentCode); }
}

// ====================== عرض النتيجة ======================
function renderStudentResult(student, violations, rb, vb, searchName = '', searchMethod = '') {
    if (!student.subjects || !student.subjects.length) { rb.innerHTML = '<tr><td colspan="4">📭 لا توجد درجات</td></tr>'; if (vb) vb.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات</td></tr>'; return; }
    const sem = student.semester || detectSemester(student.subjects) || 'first', sn = getSemesterName(sem), cfg = getSubjectConfig(sem), os = getOrderedSubjects(sem), tp = getTotalPossible(sem);
    let smm = ''; if (searchMethod === 'code_only') smm = `<div style="background:#e3f2fd;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم العثور على الطالب برقم الجلوس فقط. الاسم المسجل: <strong>${escapeHtml(student.fullName)}</strong></div>`;
    else if (searchMethod === 'name_only') smm = `<div style="background:#fff3e0;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;font-size:0.85em;">💡 تم العثور على الطالب بالاسم فقط (رقم الجلوس غير مطابق). رقم الجلوس المسجل: <strong>${student.studentCode}</strong></div>`;
    let nmm = ''; if (searchName) { const sim = calculateSimilarity(searchName, student.fullName||''); if (sim < 80 && sim >= 50) nmm = '<div style="background:#fff3cd;padding:8px;border-radius:8px;margin-bottom:10px;text-align:center;">⚠️ الاسم المدخل قريب من الاسم المسجل.</div>'; }
    let total = 0; const sg = [];
    os.forEach(n => { const sc = cfg[n], s = student.subjects?.find(x => normalizeSubjectName(x.name) === n); const g = s ? (s.grade||0) : 0; if (sc?.isExtra) sg.push({ name: `${n} (خارج المجموع)`, grade: g, max: sc.max, isExtra: true }); else { sg.push({ name: n, grade: g, max: sc?.max||100, isExtra: false }); total += g; } });
    const pct = (total / tp) * 100, pc = pct >= 85 ? 'high-percentage' : (pct >= 60 ? 'medium-percentage' : 'low-percentage');
    const labels = ['📋 الاسم', '🔢 رقم الجلوس', '📅 الترم', ...sg.map(s => s.name)];
    const values = [`<strong>${escapeHtml(student.fullName)}</strong>`, student.studentCode, `<strong style="color:#d4af37;">${sn}</strong>`, ...sg.map(s => `${s.grade} / ${s.max}`)];
    const adm = !student.semester ? `<div style="background:#e8f5e9;padding:8px;border-radius:8px;margin-top:10px;text-align:center;font-size:0.9em;">💡 تم اكتشاف الترم تلقائياً من المواد: <strong>${sn}</strong></div>` : '';
    rb.innerHTML = `${smm}${nmm}<tr><td>${labels.join('<hr class="table-separator">')}</td><td>${values.join('<hr class="table-separator">')}</td><td><strong>${total} / ${tp}</strong></td><td class="${pc}"><strong>${pct.toFixed(1)}%</strong><br><small>${pct>=60?'✅ ناجح':'❌ راسب'}</small></td></tr>${adm?`<tr><td colspan="4">${adm}</td></tr>`:''}`;
    if (vb) vb.innerHTML = violations && violations.length ? violations.map(v => `<tr><td>${v.type==='warning'?'⚠️ إنذار':'🚫 مخالفة'}</td><td>${v.reason||'-'}</td><td>${v.penalty||'-'}</td><td>${v.parentSummons?'✅ نعم':'❌ لا'}</td><td>${v.date||'-'}</td></tr>`).join('') : '<tr><td colspan="5" style="color:#28a745;">✅ لا توجد مخالفات</td></tr>';
}
function renderMultipleResults(results, rb, vb, sm = '') {
    if (!results || !results.length) { rb.innerHTML = '<tr><td colspan="4">❌ لا توجد نتائج</td></tr>'; return; }
    if (results.length === 1) { fetchViolationsForStudent(results[0].studentCode).then(v => renderStudentResult(results[0], v, rb, vb, '', sm)); return; }
    let h = `<tr><td colspan="4" style="background:#e3f2fd;padding:10px;text-align:center;">🔍 تم العثور على <strong>${results.length}</strong> نتائج. اضغط على أي صف للتفاصيل.</td></tr>`;
    results.forEach(s => { const pct = calculateStudentPercentage(s), sem = s.semester || detectSemester(s.subjects) || 'first', sn = getSemesterName(sem), pc = pct >= 85 ? 'high-percentage' : (pct >= 60 ? 'medium-percentage' : 'low-percentage'); h += `<tr style="cursor:pointer" onclick="viewStudentDetail('${s.studentCode}')"><td><strong>${escapeHtml(s.fullName)}</strong></td><td>${s.studentCode}<br><small style="color:#d4af37;">${sn}</small></td><td>${calculateStudentTotal(s)} / ${getTotalPossible(sem)}</td><td class="${pc}">${pct.toFixed(1)}%</td></tr>`; });
    rb.innerHTML = h; if (vb) vb.innerHTML = '<tr><td colspan="5" style="color:#d4af37;">🔍 تم العثور على عدة نتائج. اضغط على أي صف للتفاصيل.</td></tr>';
    window._searchResults = results;
}
window.viewStudentDetail = async function(code) { const s = window._searchResults?.find(x => x.studentCode === code); if (s) { const v = await fetchViolationsForStudent(code); renderStudentResult(s, v, document.getElementById('result-table-body'), document.getElementById('violations-table-body')); window.scrollTo({ top: document.querySelector('.result-table')?.offsetTop || 0, behavior: 'smooth' }); } };

// ====================== البحث متعدد المستويات ======================
function setupSearchForm() {
    const form = document.getElementById('search-form'); if (!form) return;
    form.querySelectorAll('input').forEach(i => i.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); form.dispatchEvent(new Event('submit')); } }));
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('search-name')?.value.trim(), code = document.getElementById('search-id')?.value.trim();
        const rb = document.getElementById('result-table-body'), vb = document.getElementById('violations-table-body');
        if (!name) { showToast('⚠️ يرجى إدخال اسم الطالب!', 'error'); document.getElementById('search-name')?.focus(); return; }
        if (!code) { showToast('⚠️ يرجى إدخال رقم الجلوس!', 'error'); document.getElementById('search-id')?.focus(); return; }
        showToast('🔍 جاري البحث...', 'info');
        try {
            // مستوى 1
            const all = await fetchAllStudents();
            let results = all.filter(s => s.studentCode === code);
            if (name) { const sn = normalizeArabicText(name), sp = sn.split(' ').filter(p => p.length > 0); results = results.filter(s => { const sn2 = normalizeArabicText(s.fullName||''); return sp.every(p => sn2.includes(p)) || calculateSimilarity(name, s.fullName||'') >= 70; }); results.sort((a,b) => calculateSimilarity(name,b.fullName||'') - calculateSimilarity(name,a.fullName||'')); }
            if (results.length) { const v = await fetchViolationsForStudent(results[0].studentCode); renderStudentResult(results[0], v, rb, vb, name, results.length === 1 && calculateSimilarity(name, results[0].fullName||'') < 80 ? 'code_only' : ''); const sem = results[0].semester || detectSemester(results[0].subjects) || 'first'; showToast(`✅ تم العثور: ${results[0].fullName} - ${getSemesterName(sem)}`, calculateSimilarity(name, results[0].fullName||'') >= 90 ? 'success' : 'warning'); return; }
            // مستوى 2
            const cr = await searchByCodeOnly(code);
            if (cr.length === 1) { const v = await fetchViolationsForStudent(cr[0].studentCode); renderStudentResult(cr[0], v, rb, vb, name, 'code_only'); showToast(`✅ تم العثور برقم الجلوس: ${cr[0].fullName}`, 'warning'); return; }
            else if (cr.length > 1) { renderMultipleResults(cr, rb, vb, 'code_only'); showToast(`✅ تم العثور على ${cr.length} طلاب`, 'info'); return; }
            // مستوى 3
            const nr = await searchByNameOnly(name);
            if (nr.length === 1) { const v = await fetchViolationsForStudent(nr[0].studentCode); renderStudentResult(nr[0], v, rb, vb, name, 'name_only'); showToast(`✅ تم العثور بالاسم: ${nr[0].fullName}`, 'warning'); return; }
            else if (nr.length > 1) { renderMultipleResults(nr, rb, vb, 'name_only'); showToast(`✅ تم العثور على ${nr.length} طلاب`, 'info'); return; }
            rb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;"><div style="color:#dc3545;font-size:1.1em;">❌ لم يتم العثور على أي طالب</div><div style="color:#666;font-size:0.85em;">تأكد من صحة الاسم ورقم الجلوس</div></td></tr>';
            if (vb) vb.innerHTML = '<tr><td colspan="5">❌ لا توجد نتيجة!</td></tr>';
            showToast('❌ لم يتم العثور على الطالب', 'error');
        } catch (err) { rb.innerHTML = '<tr><td colspan="4">❌ حدث خطأ!</td></tr>'; showToast('❌ خطأ في الاتصال', 'error'); }
    });
}

// ====================== باقي الدوال ======================
function renderNavbar() { const u = getLoggedInUser(), n = document.getElementById('nav-bar'); if (!n) return; const l = [{ h: 'index.html', i: 'fa-solid fa-house', t: 'الرئيسية' },{ h: 'Home.html', i: 'fa-solid fa-chart-simple', t: 'النتائج' },{ h: 'profile.html', i: 'fa-solid fa-user', t: 'الملف الشخصي' },{ h: 'search-monthly.html', i: 'fa-solid fa-magnifying-glass', t: 'نتيجة الشهري' },{ h: 'First-Gards.html', i: 'fa-solid fa-graduation-cap', t: 'نتيجة الصف الاول' },{ h: 'exams.html', i: 'fa-solid fa-book-open', t: 'الاختبارات' },{ h: 'file-library.html', i: 'fas fa-folder-open', t: 'المكتبة' },{ h: 'developer.html', i: 'fa-solid fa-microchip', t: 'عن المطور' }]; if (u?.type === 'admin') l.push({ h: 'admin.html', i: 'fas fa-cogs', t: 'لوحة التحكم' }); n.innerHTML = l.map(x => `<a href="${x.h}" title="${x.t}"><i class="${x.i}"></i><span>${x.t}</span></a>`).join(''); }
function renderWelcomeMessage() { const d = document.querySelector('.welcome-message'), u = getLoggedInUser(); if (d) d.textContent = u ? (u.type === 'admin' ? `👋 أهلًا يا قائد، ${u.fullName||u.username}!` : `🎉 مرحبًا يا ${u.fullName||u.username}!`) : '👋 مرحبًا بك!'; }
async function verifySession() { try { const r = await fetch(`${BASE_URL}/api/verify-session`, { credentials: 'include' }); if (r.ok) return true; } catch {} window.location.href = 'login.html'; return false; }
async function logout() { try { await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }); } catch {} sessionStorage.clear(); window.location.href = 'login.html'; }
function setupLogoutButton() { document.querySelector('.logout-btn')?.addEventListener('click', logout); }
function initLibraryTour() { if (localStorage.getItem('hasSeenLibraryTour') === 'true') { document.getElementById('guidedTour').style.display = 'none'; return; } setTimeout(() => { document.getElementById('guidedTour').style.display = 'flex'; }, 2000); document.getElementById('closeTourBtn')?.addEventListener('click', () => { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); }); document.getElementById('gotoLibraryBtn')?.addEventListener('click', () => { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); window.location.href = 'file-library.html'; }); document.getElementById('dontShowAgain')?.addEventListener('click', () => { document.getElementById('guidedTour').style.display = 'none'; localStorage.setItem('hasSeenLibraryTour', 'true'); }); }
window.refreshAttendance = function(code) { if (code) fetchAttendanceStats(code, true); else { const u = getLoggedInUser(); if (u?.type === 'student' && u.id) fetchAttendanceStats(u.id, true); } };

async function init() {
    if (!await verifySession()) return;
    await loadNotifications(); renderNavbar(); renderWelcomeMessage(); await renderDashboard();
    setupSearchForm(); setupLogoutButton(); initLibraryTour();
    setInterval(async () => { try { await fetch(`${BASE_URL}/api/refresh-token`, { method: 'POST', credentials: 'include' }); } catch {} }, 55 * 60 * 1000);
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
}
