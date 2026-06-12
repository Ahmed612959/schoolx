const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : '';

// ====================== دوال الأمان الأساسية ======================
function getCsrfToken() { return sessionStorage.getItem('csrfToken'); }
function getLoggedInUser() { const u = sessionStorage.getItem('userData'); return u ? JSON.parse(u) : null; }

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        const bg = { success: 'linear-gradient(135deg,#27AE60,#1E8449)', error: 'linear-gradient(135deg,#E74C3C,#C0392B)', info: 'linear-gradient(135deg,#3498DB,#2C81BA)', warning: 'linear-gradient(135deg,#F39C12,#D68910)' }[type] || '#333';
        Toastify({ text: message, duration: 3500, gravity: 'top', position: 'center', style: { background: bg, fontSize: '15px', fontFamily: '"Tajawal", sans-serif', padding: '12px 20px', borderRadius: '12px', direction: 'rtl', color: '#fff' } }).showToast();
    } else { alert(message); }
}

function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (response.status === 401) { sessionStorage.clear(); window.location.href = '/login.html'; throw new Error('انتهت الجلسة'); }
    if (response.status === 403) { showToast('طلب غير مصرح به، يرجى تحديث الصفحة', 'error'); throw new Error('CSRF token mismatch'); }
    return response;
}

async function getFromServer(endpoint) { try { const r = await apiRequest(endpoint); return r.ok ? await r.json() : []; } catch (e) { console.error(e); return []; } }
async function saveToServer(endpoint, data, method = 'POST') { const r = await apiRequest(endpoint, { method, body: JSON.stringify(data) }); if (!r.ok) throw new Error((await r.json()).error || 'فشل الحفظ'); return r.json(); }

// ====================== التحقق من صلاحية الأدمن ======================
async function verifyAdminAccess() {
    const user = getLoggedInUser();
    if (!user || user.type !== 'admin') { showToast('غير مصرح لك بالدخول!', 'error'); setTimeout(() => window.location.href = 'Home.html', 1500); return false; }
    try { await apiRequest('/api/verify-session'); return true; } catch (e) { showToast('انتهت الجلسة', 'error'); sessionStorage.clear(); setTimeout(() => window.location.href = 'login.html', 1500); return false; }
}

window.logout = async () => { if (confirm('تسجيل الخروج؟')) { try { await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }); } catch (e) {} sessionStorage.clear(); window.location.href = 'login.html'; } };
(function preventBack() { window.history.pushState(null, '', window.location.href); window.onpopstate = () => window.history.pushState(null, '', window.location.href); })();

// ====================== تعريف الدرجات ======================
const SUBJECTS_CONFIG = { "اللغة العربية": { max: 20 }, "اللغة الإنجليزية": { max: 20 }, "علوم تطبيقية": { max: 40 }, "طب باطنة": { max: 20 }, "تمريض باطني جراحي": { max: 24 }, "حاسب آلي": { max: 20 }, "الدين": { max: 32, isExtra: true } };
const TOTAL_POSSIBLE = 144;
const ORDERED_SUBJECTS = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"];

function calculateStudentTotal(student) { if (!student.subjects) return 0; let t = 0; student.subjects.forEach(s => { const c = SUBJECTS_CONFIG[s.name]; if (c && !c.isExtra) t += s.grade || 0; }); return t; }
function calculateStudentPercentage(student) { return (calculateStudentTotal(student) / TOTAL_POSSIBLE) * 100; }
function getStudentFormattedGrades(student) { let g = {}; ORDERED_SUBJECTS.forEach(n => { const c = SUBJECTS_CONFIG[n]; const sub = student.subjects?.find(s => s.name === n); g[n] = { grade: sub?.grade || 0, max: c.max, isExtra: c.isExtra || false }; }); return g; }
function getStudentsWithGrades(list) { return list.filter(s => s.subjects && s.subjects.length > 0); }

// ====================== متغيرات عامة ======================
let allStudents = [], studentsWithGrades = [], admins = [], violations = [], notifications = [];

// ====================== الإشعارات ======================
async function loadNotifications() {
    try { const response = await fetch(`${BASE_URL}/api/notifications`, { credentials: 'include' }); notifications = response.ok ? await response.json() : []; renderNotifications(); } catch (error) { notifications = []; renderNotifications(); }
}
function renderNotifications() {
    const tb = document.getElementById('notifications-table-body'); if (!tb) return;
    if (!notifications?.length) { tb.innerHTML = '<tr><td colspan="3" style="text-align:center;">📭 لا توجد إشعارات</td></tr>'; return; }
    tb.innerHTML = notifications.map(n => `<tr><td>${escapeHtml(n.text)}</td><td style="text-align:center;">${n.date || '-'}</td><td style="text-align:center;"><button class="delete-btn" onclick="deleteNotification('${n._id}')"><i class="fas fa-trash"></i> حذف</button></td></tr>`).join('');
}
window.addNotification = async function() {
    const text = document.getElementById('notification-text')?.value.trim(); if (!text) return showToast('يرجى إدخال نص الإشعار!', 'error');
    const date = new Date().toLocaleString('ar-EG');
    try { const response = await fetch(`${BASE_URL}/api/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() }, credentials: 'include', body: JSON.stringify({ text, date }) }); if (response.ok) { await loadNotifications(); document.getElementById('notification-text').value = ''; showToast('✅ تم إضافة الإشعار', 'success'); } else showToast('فشل الإضافة', 'error'); } catch (error) { showToast('حدث خطأ', 'error'); }
};
window.deleteNotification = async function(id) {
    const { isConfirmed } = await Swal.fire({ title: '⚠️ تأكيد الحذف', text: 'هل أنت متأكد؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم', cancelButtonText: 'إلغاء', confirmButtonColor: '#E74C3C' });
    if (isConfirmed) { try { const res = await fetch(`${BASE_URL}/api/notifications/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'include' }); if (res.ok) { await loadNotifications(); showToast('🗑️ تم الحذف', 'success'); } else showToast('فشل الحذف', 'error'); } catch (e) { showToast('خطأ', 'error'); } }
};

// ====================== تحميل البيانات الأساسية ======================
async function loadInitialData() {
    showToast('جاري تحميل البيانات...', 'info');
    allStudents = await getFromServer('/api/admin/students');
    admins = await getFromServer('/api/admins');
    violations = await getFromServer('/api/admin/violations');
    await loadNotifications();
    studentsWithGrades = getStudentsWithGrades(allStudents);
    renderAdmins();
    renderResults();
    renderStats();
    renderTopStudents();
    renderViolations();
    showToast(`✅ تم التحميل: ${allStudents.length} طالب`, 'success');
}

// ====================== عرض الإحصائيات ======================
function renderStats() {
    const sec = document.getElementById('stats-section'); if (!sec) return;
    const total = studentsWithGrades.length;
    if (total === 0) { sec.innerHTML = `<div class="stats-grid"><div class="stat-item"><i class="fas fa-info-circle"></i> لا توجد درجات مسجلة</div></div>`; return; }
    let sumPct = 0, topStd = null, topPct = 0;
    studentsWithGrades.forEach(s => { let p = calculateStudentPercentage(s); sumPct += p; if (p > topPct) { topPct = p; topStd = s; } });
    const avg = (sumPct / total).toFixed(1);
    const passed = studentsWithGrades.filter(s => calculateStudentPercentage(s) >= 60).length;
    sec.innerHTML = `<div class="stats-grid"><div class="stat-item"><i class="fas fa-users"></i> عدد الطلاب: ${total}</div><div class="stat-item"><i class="fas fa-chart-line"></i> المتوسط: ${avg}%</div><div class="stat-item"><i class="fas fa-check-circle"></i> الناجحين: ${passed}</div><div class="stat-item"><i class="fas fa-times-circle"></i> الراسبين: ${total - passed}</div></div>${topStd ? `<div class="stats-grid" style="margin-top:15px; background:linear-gradient(135deg,#C7A252,#A07D3A); border-radius:15px; padding:15px;"><div class="stat-item" style="text-align:center; background:none;"><i class="fas fa-trophy" style="font-size:2rem; color:#fff;"></i><p style="font-weight:bold;">🏆 أعلى طالب</p><p style="font-size:1.2rem; font-weight:bold;">${escapeHtml(topStd.fullName)}</p><p>رقم الجلوس: ${topStd.studentCode}</p><p>المجموع: ${calculateStudentTotal(topStd)} / ${TOTAL_POSSIBLE}</p><p>النسبة: ${topPct.toFixed(1)}%</p></div></div>` : ''}`;
}

// ====================== عرض النتائج ======================
function renderResults(filter = '') {
    const tbody = document.getElementById('results-table-body'); if (!tbody) return;
    tbody.innerHTML = '';
    let filtered = [...studentsWithGrades];
    if (filter) filtered = filtered.filter(s => s.fullName?.toLowerCase().includes(filter.toLowerCase()) || s.studentCode?.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">📭 لا توجد نتائج مسجلة</td></tr>'; return; }
    filtered.forEach(student => {
        const total = calculateStudentTotal(student), percentage = calculateStudentPercentage(student), grades = getStudentFormattedGrades(student);
        let subjectsHtml = '<div class="subjects-container">';
        for (let n of ORDERED_SUBJECTS) {
            const gi = grades[n];
            if (gi.isExtra) subjectsHtml += `<div class="extra-subject">📖 ${n}: <strong>${gi.grade}</strong> / ${gi.max} <small>(خارج المجموع)</small></div>`;
            else subjectsHtml += `<div class="subject-row"><span class="subject-name"><i class="fas fa-book"></i> ${n}</span><span class="subject-grade">${gi.grade} / ${gi.max}</span></div>`;
        }
        subjectsHtml += '</div>';
        const pClass = percentage >= 85 ? 'excellent' : (percentage >= 75 ? 'very-good' : (percentage >= 65 ? 'good' : (percentage >= 60 ? 'pass' : 'fail')));
        const pText = { excellent: 'ممتاز', 'very-good': 'جيد جداً', good: 'جيد', pass: 'ناجح', fail: 'راسب' }[pClass];
        tbody.innerHTML += `<tr><td style="text-align:right;"><strong>${escapeHtml(student.fullName)}</strong><br><small>رقم الجلوس: ${student.studentCode}</small></td><td style="text-align:right;">${subjectsHtml}</td><td style="text-align:center;"><span class="total-cell">${total} / ${TOTAL_POSSIBLE}</span></td><td style="text-align:center;"><span class="percentage-cell ${pClass}">${percentage.toFixed(1)}% (${pText})</span></td><td style="text-align:center;"><button class="table-action-btn edit-action" onclick="editStudent('${student.studentCode}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="table-action-btn delete-action" onclick="deleteStudent('${student.studentCode}')" title="حذف"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    updateTopStudentsAfterDataChange();
}

// ====================== إدارة الأدمنز ======================
function renderAdmins() { const t = document.getElementById('users-table-body'); if (t) t.innerHTML = admins.map(a => `<tr><td>${escapeHtml(a.fullName)}</td><td>${a.username}</td><td>${a.username !== 'admin' ? `<button class="delete-btn" onclick="deleteAdmin('${a.username}')"><i class="fas fa-trash"></i> حذف</button>` : 'رئيسي'}</td></tr>`).join(''); }
window.deleteAdmin = async (u) => { if (u === 'admin') return showToast('لا يمكن حذف المدير الرئيسي', 'error'); if (confirm('تأكيد الحذف؟')) { await saveToServer(`/api/admins/${u}`, {}, 'DELETE'); admins = await getFromServer('/api/admins'); renderAdmins(); showToast('تم الحذف', 'success'); } };
document.getElementById('add-user-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const fn = document.getElementById('admin-name').value.trim(), un = document.getElementById('admin-username').value.trim(), pw = document.getElementById('admin-password').value.trim(); if (!fn || !un || !pw) return showToast('املأ جميع الحقول', 'error'); await saveToServer('/api/admins', { fullName: fn, username: un, password: pw }); admins = await getFromServer('/api/admins'); renderAdmins(); e.target.reset(); showToast('تم إضافة الأدمن', 'success'); });

// ====================== حذف وتعديل الطالب ======================
window.deleteStudent = async (code) => { if (confirm('⚠️ حذف الطالب نهائياً؟')) { await saveToServer(`/api/students/${code}`, {}, 'DELETE'); allStudents = await getFromServer('/api/admin/students'); studentsWithGrades = getStudentsWithGrades(allStudents); renderResults(); renderStats(); showToast('✅ تم حذف الطالب', 'success'); } };
window.editStudent = (code) => { const s = allStudents.find(st => st.studentCode === code); if (s) { document.getElementById('student-name').value = s.fullName; document.getElementById('student-id').value = s.studentCode; for (let i = 1; i <= 8; i++) document.getElementById(`subject${i}`).value = 0; document.getElementById('subject9').value = 0; document.getElementById('subject10').value = 0; s.subjects?.forEach(sub => { if (sub.name === 'مبادئ وأسس تمريض') document.getElementById('subject1').value = sub.grade; else if (sub.name === 'اللغة العربية') document.getElementById('subject2').value = sub.grade; else if (sub.name === 'اللغة الإنجليزية') document.getElementById('subject3').value = sub.grade; else if (sub.name === 'الفيزياء') document.getElementById('subject4').value = sub.grade; else if (sub.name === 'الكيمياء') document.getElementById('subject5').value = sub.grade; else if (sub.name === 'التشريح / علم وظائف الأعضاء') document.getElementById('subject6').value = sub.grade; else if (sub.name === 'التربية الدينية') document.getElementById('subject7').value = sub.grade; else if (sub.name === 'الكمبيوتر') document.getElementById('subject8').value = sub.grade; else if (sub.name === 'التاريخ') document.getElementById('subject9').value = sub.grade; else if (sub.name === 'الجغرافيا') document.getElementById('subject10').value = sub.grade; }); showToast('✏️ قم بتعديل البيانات ثم اضغط حفظ', 'info'); window.scrollTo(0, 0); } };
document.getElementById('add-result-form')?.addEventListener('submit', async (e) => { e.preventDefault(); let fn = document.getElementById('student-name').value.trim(), code = document.getElementById('student-id').value.trim(), sem = document.getElementById('semester').value; let subjects = [ { name: "مبادئ وأسس تمريض", grade: parseInt(document.getElementById('subject1').value) || 0 }, { name: "اللغة العربية", grade: parseInt(document.getElementById('subject2').value) || 0 }, { name: "اللغة الإنجليزية", grade: parseInt(document.getElementById('subject3').value) || 0 }, { name: "الفيزياء", grade: parseInt(document.getElementById('subject4').value) || 0 }, { name: "الكيمياء", grade: parseInt(document.getElementById('subject5').value) || 0 }, { name: "التشريح / علم وظائف الأعضاء", grade: parseInt(document.getElementById('subject6').value) || 0 }, { name: "التربية الدينية", grade: parseInt(document.getElementById('subject7').value) || 0 }, { name: "الكمبيوتر", grade: parseInt(document.getElementById('subject8').value) || 0 } ]; if (sem === 'first') { let hg = parseInt(document.getElementById('subject9').value) || 0; if (hg > 0) subjects.push({ name: "التاريخ", grade: hg }); } else { let gg = parseInt(document.getElementById('subject10').value) || 0; if (gg > 0) subjects.push({ name: "الجغرافيا", grade: gg }); } if (!fn || !code) return showToast('اسم الطالب ورقم الجلوس مطلوبان', 'error'); let existing = allStudents.find(s => s.studentCode === code); if (existing) await saveToServer(`/api/students/${code}`, { subjects, semester: sem }, 'PUT'); else await saveToServer('/api/students', { fullName: fn, id: code, subjects, semester: sem }); allStudents = await getFromServer('/api/admin/students'); studentsWithGrades = getStudentsWithGrades(allStudents); renderResults(); renderStats(); e.target.reset(); showToast(`✅ ${existing ? 'تم تحديث' : 'تم إضافة'} ${fn}`, 'success'); });

// ====================== المخالفات ======================
async function renderViolations() { const tbody = document.getElementById('violations-table-body'); if (!tbody) return; if (violations.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">📭 لا توجد إنذارات أو مخالفات مسجلة</td></tr>'; return; } tbody.innerHTML = violations.map(v => { const s = allStudents.find(st => st.studentCode === v.studentId); return `<tr><td>${v.studentId || '-'}</td><td>${s?.fullName || 'غير موجود'}</td><td>${v.type === 'warning' ? '<span style="color:#F39C12;">⚠️ إنذار</span>' : '<span style="color:#E74C3C;">🚫 مخالفة</span>'}</td><td style="max-width:200px; word-break:break-word;">${escapeHtml(v.reason)}</td><td>${escapeHtml(v.penalty)}</td><td>${v.parentSummons ? '✅ نعم' : '❌ لا'}</td><td><button class="edit-btn" onclick="editViolation('${v._id}')"><i class="fas fa-edit"></i> تعديل</button> <button class="delete-btn" onclick="deleteViolation('${v._id}')"><i class="fas fa-trash"></i> حذف</button></td></tr>`; }).join(''); }
let editingViolationId = null;
window.editViolation = function(id) { const v = violations.find(vv => vv._id === id); if (v) { editingViolationId = id; document.getElementById('violation-student-id').value = v.studentId; document.getElementById('violation-type').value = v.type; document.getElementById('violation-reason').value = v.reason; document.getElementById('violation-penalty').value = v.penalty; document.getElementById('parent-summons').checked = v.parentSummons; document.querySelector('#add-violation-form button[type="submit"]').textContent = '✏️ تحديث المخالفة'; document.getElementById('cancelEditViolationBtn').style.display = 'inline-block'; showToast('✏️ قم بتعديل البيانات ثم اضغط تحديث', 'info'); } };
window.cancelEditViolation = function() { editingViolationId = null; document.getElementById('add-violation-form').reset(); document.querySelector('#add-violation-form button[type="submit"]').textContent = '➕ إضافة إنذار/مخالفة'; document.getElementById('cancelEditViolationBtn').style.display = 'none'; showToast('✅ تم إلغاء التعديل', 'info'); };
async function sendWhatsApp(phone, studentName, type, reason, penalty) { let ph = phone.replace(/[^0-9]/g, ''); if (ph.startsWith('0')) ph = '20' + ph.substring(1); if (!ph.startsWith('20')) ph = '20' + ph; const msg = `📢 *تنبيه من معهد رعاية الضبعية*\n\n👨‍🎓 الطالب: ${studentName}\n⚠️ النوع: ${type === 'warning' ? 'إنذار' : 'مخالفة'}\n📝 السبب: ${reason}\n⚖️ العقوبة: ${penalty}\n📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`; window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank'); }
document.getElementById('add-violation-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const sid = document.getElementById('violation-student-id').value.trim(), typ = document.getElementById('violation-type').value, rsn = document.getElementById('violation-reason').value.trim(), pnl = document.getElementById('violation-penalty').value.trim(), ps = document.getElementById('parent-summons').checked, pPhone = document.getElementById('parent-phone')?.value.trim(); if (!sid || !rsn || !pnl) return showToast('املأ الحقول المطلوبة', 'error'); const student = allStudents.find(s => s.studentCode === sid); if (!student) return showToast('رقم الجلوس غير موجود', 'error'); const data = { studentId: sid, type: typ, reason: rsn, penalty: pnl, parentSummons: ps, date: new Date().toLocaleString('ar-EG') }; if (editingViolationId) { await saveToServer(`/api/violations/${editingViolationId}`, {}, 'DELETE'); await saveToServer('/api/violations', data); editingViolationId = null; cancelEditViolation(); } else { await saveToServer('/api/violations', data); } violations = await getFromServer('/api/admin/violations'); renderViolations(); e.target.reset(); showToast('✅ تمت العملية', 'success'); if (pPhone && pPhone.length >= 10) { await sendWhatsApp(pPhone, student.fullName, typ, rsn, pnl); showToast('📱 تم فتح واتساب', 'info'); } });
window.deleteViolation = async (id) => { if (confirm('⚠️ حذف المخالفة؟')) { await saveToServer(`/api/violations/${id}`, {}, 'DELETE'); violations = await getFromServer('/api/admin/violations'); renderViolations(); showToast('🗑️ تم الحذف', 'success'); if (editingViolationId === id) cancelEditViolation(); } };

// ====================== الاختبارات (مختصرة للحفاظ على الطول) ======================
let questionsList = [];
function renderQuestionInputs() { const type = document.getElementById('question-type')?.value, cont = document.getElementById('question-inputs'); if (!cont) return; /* نفس الكود الأصلي */ }
window.addQuestion = function() { /* نفس الكود الأصلي */ };
window.removeQuestion = function(idx) { questionsList.splice(idx,1); const qc = document.getElementById('questions-list'); if(qc) qc.innerHTML = questionsList.map((qq,i)=>`<div>سؤال ${i+1}: ${escapeHtml(qq.text)}<button onclick="removeQuestion(${i})">حذف</button></div>`).join(''); showToast('✅ تم حذف السؤال','success'); };
window.saveExam = async function() { /* نفس الكود الأصلي */ };
async function loadExamsList() { /* نفس الكود الأصلي */ }
window.viewExam = async function(code) { /* نفس الكود الأصلي */ };
window.deleteExam = async function(code) { /* نفس الكود الأصلي */ };
document.getElementById('fetch-results')?.addEventListener('click', async () => { /* نفس الكود الأصلي */ });
document.getElementById('question-type')?.addEventListener('change', renderQuestionInputs);
document.getElementById('add-question')?.addEventListener('click', addQuestion);
document.getElementById('save-exam')?.addEventListener('click', saveExam);

// ====================== تحليل Excel (الإصلاح الأساسي) ======================
window.analyzeExcel = async () => {
    const fileInput = document.getElementById('excel-upload');
    const file = fileInput.files[0];
    if (!file) return showToast('اختر ملف Excel أولاً', 'error');
    
    const progressDiv = document.getElementById('upload-progress');
    progressDiv.innerHTML = '⏳ جاري قراءة الملف...';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
            if (!rows || rows.length < 2) throw new Error('الملف فارغ أو لا يحتوي على بيانات');
            
            const headerRow = rows[0];
            // نتوقع الأعمدة: 0: رقم الجلوس, 1: الاسم, 2: عربي, 3: إنجليزي, 4: علوم, 5: طب باطنة, 6: تمريض, 7: حاسب
            let successCount = 0, errorCount = 0;
            progressDiv.innerHTML = `📊 جاري معالجة ${rows.length-1} طالب...`;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0] || !row[1]) continue; // تخطي الصفوف الفارغة
                
                const studentCode = String(row[0]).trim();
                const fullName = String(row[1]).trim();
                const subjects = [];
                if (row[2] && !isNaN(parseFloat(row[2]))) subjects.push({ name: "اللغة العربية", grade: parseFloat(row[2]) });
                if (row[3] && !isNaN(parseFloat(row[3]))) subjects.push({ name: "اللغة الإنجليزية", grade: parseFloat(row[3]) });
                if (row[4] && !isNaN(parseFloat(row[4]))) subjects.push({ name: "علوم تطبيقية", grade: parseFloat(row[4]) });
                if (row[5] && !isNaN(parseFloat(row[5]))) subjects.push({ name: "طب باطنة", grade: parseFloat(row[5]) });
                if (row[6] && !isNaN(parseFloat(row[6]))) subjects.push({ name: "تمريض باطني جراحي", grade: parseFloat(row[6]) });
                if (row[7] && !isNaN(parseFloat(row[7]))) subjects.push({ name: "حاسب آلي", grade: parseFloat(row[7]) });
                
                const existingStudent = allStudents.find(s => s.studentCode === studentCode);
                const payload = { fullName, subjects, semester: 'first' }; // يمكنك تعديل الترم حسب الحاجة
                
                try {
                    if (existingStudent) {
                        await apiRequest(`/api/students/${encodeURIComponent(studentCode)}`, { method: 'PUT', body: JSON.stringify(payload) });
                    } else {
                        payload.id = studentCode;
                        await apiRequest('/api/students', { method: 'POST', body: JSON.stringify(payload) });
                    }
                    successCount++;
                    progressDiv.innerHTML = `✅ تمت معالجة ${successCount} طالب...`;
                } catch (err) {
                    errorCount++;
                    console.error(`فشل معالجة الطالب ${studentCode}:`, err);
                }
            }
            
            // إعادة تحميل البيانات بعد الانتهاء
            allStudents = await getFromServer('/api/admin/students');
            studentsWithGrades = getStudentsWithGrades(allStudents);
            renderResults();
            renderStats();
            renderTopStudents();
            showToast(`✅ تم رفع ${successCount} طالب بنجاح، ${errorCount} فشل`, successCount > 0 ? 'success' : 'error');
            progressDiv.innerHTML = `✨ انتهى الرفع: ${successCount} ناجح، ${errorCount} فشل`;
            fileInput.value = ''; // مسح اختيار الملف
        } catch (err) {
            console.error(err);
            showToast('خطأ في قراءة الملف: ' + err.message, 'error');
            progressDiv.innerHTML = '❌ فشل تحليل الملف';
        }
    };
    reader.onerror = () => { showToast('خطأ في قراءة الملف', 'error'); progressDiv.innerHTML = '❌ خطأ في القراءة'; };
    reader.readAsArrayBuffer(file);
};

document.getElementById('analyze-excel')?.addEventListener('click', window.analyzeExcel);
document.getElementById('export-excel')?.addEventListener('click', () => { 
    const wsData = [["اسم الطالب", "رقم الجلوس", "المواد والدرجات", "المجموع", "النسبة"]]; 
    studentsWithGrades.forEach(s => { 
        const total = calculateStudentTotal(s), pct = calculateStudentPercentage(s); 
        const grades = getStudentFormattedGrades(s); 
        let gtxt = ''; 
        for (let [n, info] of Object.entries(grades)) gtxt += `${n}: ${info.grade}/${info.max} | `; 
        wsData.push([s.fullName, s.studentCode, gtxt, `${total}/${TOTAL_POSSIBLE}`, `${pct.toFixed(1)}%`]); 
    }); 
    const ws = XLSX.utils.aoa_to_sheet(wsData), wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, 'النتائج'); 
    XLSX.writeFile(wb, `نتائج_الطلاب_${new Date().toLocaleDateString()}.xlsx`); 
    showToast('تم التصدير', 'success'); 
});

// ====================== بحث وتصفية ======================
document.getElementById('search-input')?.addEventListener('input', e => renderResults(e.target.value));
document.getElementById('filter-select')?.addEventListener('change', e => { 
    const rows = document.querySelectorAll('#results-table-body tr'); 
    rows.forEach(row => { 
        const pctCell = row.cells[3]?.querySelector('.percentage-cell'); 
        if (pctCell) { 
            const pct = parseFloat(pctCell.innerText); 
            if (e.target.value === 'passed') row.style.display = pct >= 60 ? '' : 'none'; 
            else if (e.target.value === 'failed') row.style.display = pct < 60 ? '' : 'none'; 
            else row.style.display = ''; 
        } 
    }); 
});

// ====================== دوال مساعدة ======================
function renderAdminWelcomeMessage() { const u = getLoggedInUser(), d = document.querySelector('.admin-welcome-message'); if (d && u) d.textContent = `أهلًا بك يا ${u.fullName || u.username} في لوحة التحكم`; }
function renderNavbar() { const n = document.getElementById('nav-bar'); if (n) n.innerHTML = `<a href="Home.html"><i class="fas fa-home"></i> الرئيسية</a><a href="admin.html"><i class="fas fa-cogs"></i> لوحة التحكم</a><a href="#" onclick="logout()"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</a>`; }
window.toggleSubjects = function() { const sem = document.getElementById('semester')?.value; const hg = document.getElementById('history-group'), gg = document.getElementById('geography-group'); if (hg && gg) { hg.style.display = sem === 'first' ? 'block' : 'none'; gg.style.display = sem === 'first' ? 'none' : 'block'; } };

// ====================== نظام العشرة الأوائل ======================
let topStudentsList = [], currentCertificateStudent = null;
function calculateTopStudents() { return studentsWithGrades.map(s => ({ ...s, total: calculateStudentTotal(s), percentage: calculateStudentPercentage(s) })).sort((a,b)=>b.percentage - a.percentage).slice(0,10); }
function renderTopStudents() { const container = document.getElementById('top-students-grid'); if (!container) return; topStudentsList = calculateTopStudents(); if (topStudentsList.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px;">📭 لا توجد بيانات كافية</div>'; return; } const medals = ['🥇','🥈','🥉','📖','📚','🏅','⭐','🌟','✨','🎯']; container.innerHTML = topStudentsList.map((s,i)=>{ const rank=i+1, rankClass=rank===1?'rank-1':(rank===2?'rank-2':(rank===3?'rank-3':'')); let pClass=''; if(s.percentage>=95) pClass='excellent'; else if(s.percentage>=85) pClass='very-good'; else if(s.percentage>=75) pClass='good'; return `<div class="top-student-card ${rankClass}"><div class="top-student-rank">${medals[i]} ${rank}</div><div class="top-student-avatar"><i class="fas fa-user-graduate"></i></div><div class="top-student-name">${escapeHtml(s.fullName)}</div><div class="top-student-code">📋 رقم الجلوس: ${s.studentCode}</div><div class="top-student-percentage"><span class="percentage-cell ${pClass}">${s.percentage.toFixed(1)}%</span></div><div class="top-student-total">📊 المجموع: ${s.total} / ${TOTAL_POSSIBLE}</div><button class="certificate-btn" onclick='showCertificate(${JSON.stringify(s).replace(/'/g, "&#39;")})'><i class="fas fa-award"></i> شهادة تقدير</button></div>`; }).join(''); }
window.refreshTopStudents = function() { showToast('جاري تحديث...', 'info'); renderTopStudents(); showToast('✅ تم التحديث', 'success'); };
window.showCertificate = function(student) { currentCertificateStudent = student; const container = document.getElementById('certificate-container'), modal = document.getElementById('certificate-modal'); if (!container || !modal) return; const date = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }); const rank = topStudentsList.findIndex(s=>s.studentCode===student.studentCode)+1; const rankText = rank===1?'الأول 🥇':(rank===2?'الثاني 🥈':(rank===3?'الثالث 🥉':`المركز ${rank} 🎖️`)); container.innerHTML = `<div class="certificate" id="certificate-to-print"><div class="certificate-logo"><img src="logo.png" onerror="this.style.display='none'"></div><div class="certificate-title">شهادة تقدير</div><div class="certificate-subtitle">معهد رعاية الضبعية الفني للتمريض</div><div class="certificate-body"><p>تُمنح هذه الشهادة للطالب/ة</p><div class="certificate-student-name">${escapeHtml(student.fullName)}</div><p>رقم الجلوس: <strong>${student.studentCode}</strong></p><div class="certificate-rank">🏆 <span>${rankText}</span> 🏆</div><div class="certificate-percentage">⭐ بنسبة نجاح ${student.percentage.toFixed(1)}% ⭐</div><p>📊 المجموع الكلي: ${student.total} / ${TOTAL_POSSIBLE}</p><p style="margin-top:15px;">وذلك تقديراً لتفوقه وجهده المتميز خلال الفصل الدراسي،<br>ونتمنى له دوام النجاح والتفوق.</p></div><div class="certificate-date"><i class="far fa-calendar-alt"></i> التاريخ: ${date}</div><div class="certificate-signature"><div><hr><p>مدير المعهد</p></div><div><hr><p>وكيل المعهد</p></div></div></div>`; modal.classList.add('show'); };
window.closeCertificateModal = function() { document.getElementById('certificate-modal')?.classList.remove('show'); };
window.printCurrentCertificate = function() { const content = document.getElementById('certificate-to-print'); if(!content) return; const win = window.open('','_blank'); win.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>شهادة تقدير</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>body{font-family:'Tajawal';text-align:center;padding:20px;}.certificate{background:linear-gradient(135deg,#fff,#fdf8ed);padding:40px;border:20px double #c4a35a;border-radius:28px;max-width:800px;margin:auto;}</style></head><body>${content.outerHTML}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`); win.document.close(); };
window.downloadCurrentCertificate = async function() { if(!currentCertificateStudent) return; showToast('جاري إنشاء PDF...','info'); const element = document.getElementById('certificate-to-print'); if(typeof html2pdf !== 'undefined'){ html2pdf().set({ margin:[0.5,0.5,0.5,0.5], filename:`شهادة_تقدير_${currentCertificateStudent.fullName}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} }).from(element).save(); showToast('✅ تم حفظ الشهادة','success'); } else { showToast('⚠️ يرجى استخدام طباعة ثم حفظ كـ PDF','warning'); window.printCurrentCertificate(); } };
window.printAllCertificates = function() { if(topStudentsList.length===0) return showToast('لا توجد بيانات','error'); const win = window.open('','_blank'); const date = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'}); let html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>شهادات الأوائل</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>body{font-family:'Tajawal';}.certificate-page{page-break-after:always;display:flex;justify-content:center;align-items:center;min-height:100vh;}.certificate{background:linear-gradient(135deg,#fff,#fdf8ed);padding:40px;margin:20px;border:20px double #c4a35a;border-radius:28px;text-align:center;max-width:800px;width:100%;}</style></head><body>`; topStudentsList.forEach((s,i)=>{ const rank=i+1, rankText=rank===1?'الأول 🥇':(rank===2?'الثاني 🥈':(rank===3?'الثالث 🥉':`المركز ${rank} 🎖️`)); html+=`<div class="certificate-page"><div class="certificate"><div class="certificate-title">شهادة تقدير</div><div class="certificate-subtitle">معهد رعاية الضبعية الفني للتمريض</div><div class="certificate-body"><p>تُمنح هذه الشهادة للطالب/ة</p><div class="certificate-student-name">${escapeHtml(s.fullName)}</div><p>رقم الجلوس: <strong>${s.studentCode}</strong></p><div class="certificate-rank">🏆 <span>${rankText}</span> 🏆</div><div class="certificate-percentage">⭐ بنسبة نجاح ${s.percentage.toFixed(1)}% ⭐</div><p>📊 المجموع الكلي: ${s.total} / ${TOTAL_POSSIBLE}</p></div><div class="certificate-date"><i class="far fa-calendar-alt"></i> التاريخ: ${date}</div><div class="certificate-signature"><div><hr><p>مدير المعهد</p></div><div><hr><p>وكيل المعهد</p></div></div></div></div>`; }); html+=`<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`; win.document.write(html); win.document.close(); };
function updateTopStudentsAfterDataChange() { renderTopStudents(); }

// ====================== بدء التشغيل ======================
(async function init() { 
    if (await verifyAdminAccess()) { 
        renderNavbar(); 
        renderAdminWelcomeMessage(); 
        await loadInitialData(); 
        await loadExamsList(); 
        renderQuestionInputs(); 
        window.toggleSubjects(); 
    } 
})();