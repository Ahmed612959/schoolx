// admin.js - النسخة الكاملة النهائية بالترتيب الصحيح للأعمدة

const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

// ====================== دوال الأمان الأساسية ======================
async function getCsrfToken() {
    let token = sessionStorage.getItem('csrfToken');
    if (!token) {
        try {
            const res = await fetch(`${BASE_URL}/api/csrf-token`, { credentials: 'include' });
            if (res.ok) { const data = await res.json(); token = data.csrfToken; sessionStorage.setItem('csrfToken', token); }
        } catch (e) {}
    }
    return token;
}

function getLoggedInUser() { const u = sessionStorage.getItem('userData'); return u ? JSON.parse(u) : null; }

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        let bg = { success: 'linear-gradient(135deg,#27AE60,#1E8449)', error: 'linear-gradient(135deg,#E74C3C,#C0392B)', info: 'linear-gradient(135deg,#3498DB,#2C81BA)', warning: 'linear-gradient(135deg,#F39C12,#D68910)' }[type] || '#333';
        Toastify({ text: message, duration: 3500, gravity: 'top', position: 'center', style: { background: bg, fontSize: '15px', fontFamily: '"Tajawal", sans-serif', padding: '12px 20px', borderRadius: '12px', direction: 'rtl', color: '#fff' } }).showToast();
    } else { alert(message); }
}

function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    let csrfToken = await getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) headers['X-CSRF-Token'] = csrfToken;
    let response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (response.status === 403) {
        try {
            const tokenRes = await fetch(`${BASE_URL}/api/csrf-token`, { credentials: 'include' });
            if (tokenRes.ok) { const tokenData = await tokenRes.json(); csrfToken = tokenData.csrfToken; sessionStorage.setItem('csrfToken', csrfToken); headers['X-CSRF-Token'] = csrfToken; response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' }); }
        } catch (e) {}
    }
    if (response.status === 401) { sessionStorage.clear(); window.location.href = '/login.html'; throw new Error('انتهت الجلسة'); }
    if (response.status === 403) { showToast('طلب غير مصرح به، يرجى تحديث الصفحة', 'error'); throw new Error('CSRF token mismatch'); }
    return response;
}
async function getFromServer(endpoint) { try { const r = await apiRequest(endpoint); return r.ok ? await r.json() : []; } catch (e) { console.error('Error:', e); return []; } }
async function saveToServer(endpoint, data, method = 'POST') { const r = await apiRequest(endpoint, { method, body: JSON.stringify(data) }); if (!r.ok) throw new Error((await r.json()).error || 'فشل الحفظ'); return r.json(); }

// ====================== التحقق من صلاحية الأدمن ======================
async function verifyAdminAccess() {
    const user = getLoggedInUser(); if (!user || user.type !== 'admin') { showToast('غير مصرح لك بالدخول!', 'error'); setTimeout(() => window.location.href = 'Home.html', 1500); return false; }
    try { await apiRequest('/api/verify-session'); return true; } catch (e) { showToast('انتهت الجلسة', 'error'); sessionStorage.clear(); setTimeout(() => window.location.href = 'login.html', 1500); return false; }
}
window.logout = async () => { if (confirm('تسجيل الخروج؟')) { try { await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }); } catch (e) {} sessionStorage.clear(); window.location.href = 'login.html'; } };
(function preventBack() { window.history.pushState(null, '', window.location.href); window.onpopstate = () => window.history.pushState(null, '', window.location.href); })();

// ====================== تعريف الدرجات - الترم الأول ======================
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

function normalizeSubjectName(name) {
    if (!name) return '';
    const m = { 
        'التربية الدينية': 'الدين', 'تربية دينية': 'الدين', 'دين': 'الدين',
        'الكمبيوتر': 'حاسب آلي', 'كمبيوتر': 'حاسب آلي', 'الحاسب الآلي': 'حاسب آلي', 'الحاسب': 'حاسب آلي', 'حاسب': 'حاسب آلي', 'حاسب الي': 'حاسب آلي', 'حاسب الى': 'حاسب آلي',
        'التمريض الباطني الجراحي': 'تمريض باطني جراحي', 'تمريض باطنى جراحي': 'تمريض باطني جراحي', 'التمريض': 'تمريض باطني جراحي', 'تمريض': 'تمريض باطني جراحي',
        'الطب الباطنة': 'طب باطنة', 'الباطنة': 'طب باطنة',
        'العلوم التطبيقية': 'علوم تطبيقية', 'العلوم': 'علوم تطبيقية', 'علوم تطبيقيه': 'علوم تطبيقية',
        'العربي': 'اللغة العربية', 'العربية': 'اللغة العربية', 'اللغه العربيه': 'اللغة العربية', 'اللغة العربيه': 'اللغة العربية',
        'الانجليزي': 'اللغة الإنجليزية', 'english': 'اللغة الإنجليزية', 'انجليزي': 'اللغة الإنجليزية', 'اللغه الانجليزيه': 'اللغة الإنجليزية', 'اللغة الانجليزيه': 'اللغة الإنجليزية'
    };
    return m[name.trim()] || name.trim();
}

function calculateStudentTotal(st) { if (!st.subjects) return 0; let t = 0; st.subjects.forEach(s => { const n = normalizeSubjectName(s.name); const c = SUBJECTS_CONFIG_FIRST[n]; if (c && !c.isExtra) t += s.grade || 0; }); return t; }
function calculateStudentPercentage(st) { const t = calculateStudentTotal(st); return (t / TOTAL_POSSIBLE_FIRST) * 100; }
function getStudentFormattedGrades(st) { let g = {}; ORDERED_SUBJECTS_FIRST.forEach(n => { const c = SUBJECTS_CONFIG_FIRST[n]; const sub = st.subjects?.find(s => normalizeSubjectName(s.name) === n); g[n] = { grade: sub?.grade || 0, max: c.max, isExtra: c.isExtra || false }; }); return g; }
function getStudentsWithGrades(l) { return l.filter(s => s.subjects && s.subjects.length > 0); }

// ====================== متغيرات عامة ======================
let allStudents = [], studentsWithGrades = [], admins = [], violations = [], notifications = [];

// ====================== الإشعارات ======================
async function loadNotifications() { try { const r = await fetch(`${BASE_URL}/api/notifications`, { credentials: 'include' }); if (r.ok) { notifications = await r.json(); renderNotifications(); } else { notifications = []; renderNotifications(); } } catch (e) { notifications = []; renderNotifications(); } }
function renderNotifications() { const tb = document.getElementById('notifications-table-body'); if (!tb) return; if (!notifications || !notifications.length) { tb.innerHTML = '<tr><td colspan="3">📭 لا توجد إشعارات</td></tr>'; return; } tb.innerHTML = notifications.map(n => `<tr><td style="text-align:right;">${escapeHtml(n.text)}</td><td style="text-align:center;">${n.date||'-'}</td><td style="text-align:center;"><button class="delete-btn" onclick="deleteNotification('${n._id}')"><i class="fas fa-trash"></i> حذف</button></td></tr>`).join(''); }
window.addNotification = async function() { const text = document.getElementById('notification-text')?.value.trim(); if (!text) { showToast('يرجى إدخال نص الإشعار!', 'error'); return; } const date = new Date().toLocaleString('ar-EG'); try { const csrfToken = await getCsrfToken(); const r = await fetch(`${BASE_URL}/api/notifications`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, credentials: 'include', body: JSON.stringify({ text, date }) }); const d = await r.json(); if (r.ok && d.success) { await loadNotifications(); document.getElementById('notification-text').value = ''; showToast('✅ تم إضافة الإشعار بنجاح!', 'success'); } else { showToast(d.error || 'فشل إضافة الإشعار', 'error'); } } catch (er) { showToast('حدث خطأ', 'error'); } };
window.deleteNotification = async function(id) { const res = await Swal.fire({ title: '⚠️ تأكيد الحذف', text: 'هل أنت متأكد من حذف هذا الإشعار؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء', confirmButtonColor: '#E74C3C' }); if (res.isConfirmed) { try { const csrfToken = await getCsrfToken(); const r = await fetch(`${BASE_URL}/api/notifications/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' }, credentials: 'include' }); const d = await r.json(); if (r.ok && d.success) { await loadNotifications(); showToast('🗑️ تم حذف الإشعار بنجاح.', 'success'); } else { showToast(d.error || '❌ فشل حذف الإشعار', 'error'); } } catch (er) { showToast('حدث خطأ', 'error'); } } };

// ====================== تحميل البيانات الأساسية ======================
async function loadInitialData() {
    showToast('جاري تحميل البيانات...', 'info'); allStudents = await getFromServer('/api/admin/students'); admins = await getFromServer('/api/admins'); violations = await getFromServer('/api/violations');
    await loadNotifications(); studentsWithGrades = getStudentsWithGrades(allStudents);
    renderAdmins(); renderResults(); renderStats(); renderTopStudents(); renderViolations();
    showToast(`✅ تم التحميل: ${allStudents.length} طالب`, 'success');
}

// ====================== عرض الإحصائيات ======================
function renderStats() {
    const sec = document.getElementById('stats-section'); if (!sec) return; let total = studentsWithGrades.length;
    if (total === 0) { sec.innerHTML = '<div class="stats-grid"><div class="stat-item"><i class="fas fa-info-circle"></i> لا توجد درجات مسجلة</div></div>'; return; }
    let sumPct = 0, topStd = null, topPct = 0; studentsWithGrades.forEach(s => { let p = calculateStudentPercentage(s); sumPct += p; if (p > topPct) { topPct = p; topStd = s; } });
    let avg = (sumPct / total).toFixed(1), passed = studentsWithGrades.filter(s => calculateStudentPercentage(s) >= 60).length;
    sec.innerHTML = `<div class="stats-grid"><div class="stat-item"><i class="fas fa-users"></i> عدد الطلاب: ${total}</div><div class="stat-item"><i class="fas fa-chart-line"></i> المتوسط: ${avg}%</div><div class="stat-item"><i class="fas fa-check-circle"></i> الناجحين: ${passed}</div><div class="stat-item"><i class="fas fa-times-circle"></i> الراسبين: ${total - passed}</div></div>${topStd?`<div class="stats-grid" style="margin-top:15px;background:linear-gradient(135deg,#C7A252,#A07D3A);border-radius:15px;padding:15px;"><div class="stat-item" style="text-align:center;background:none;"><i class="fas fa-trophy" style="font-size:2rem;color:#fff;"></i><p style="font-weight:bold;">🏆 أعلى طالب</p><p>${escapeHtml(topStd.fullName)}</p><p>رقم الجلوس: ${topStd.studentCode}</p><p>المجموع: ${calculateStudentTotal(topStd)} / ${TOTAL_POSSIBLE_FIRST}</p><p>النسبة: ${topPct.toFixed(1)}%</p></div></div>`:''}`;
}

// ====================== عرض النتائج ======================
function renderResults(filter = '') {
    const tbody = document.getElementById('results-table-body'); if (!tbody) return; tbody.innerHTML = '';
    let filtered = [...studentsWithGrades]; if (filter) filtered = filtered.filter(s => (s.fullName||'').toLowerCase().includes(filter.toLowerCase()) || (s.studentCode||'').toLowerCase().includes(filter.toLowerCase()));
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="5">📭 لا توجد نتائج مسجلة</td></tr>'; return; }
    filtered.forEach(st => {
        const total = calculateStudentTotal(st), pct = calculateStudentPercentage(st), grades = getStudentFormattedGrades(st);
        let html = '<div class="subjects-container">';
        for (let n of ORDERED_SUBJECTS_FIRST) { let gi = grades[n]; if (gi) { if (gi.isExtra) html += `<div class="extra-subject">📖 ${n}: <strong>${gi.grade}</strong> / ${gi.max} <small>(خارج المجموع)</small></div>`; else html += `<div class="subject-row"><span class="subject-name"><i class="fas fa-book"></i> ${n}</span><span class="subject-grade">${gi.grade} / ${gi.max}</span></div>`; } }
        html += '</div>'; let pClass = pct >= 85 ? 'excellent' : (pct >= 75 ? 'very-good' : (pct >= 65 ? 'good' : (pct >= 60 ? 'pass' : 'fail'))); let pText = { excellent: 'ممتاز', 'very-good': 'جيد جداً', good: 'جيد', pass: 'ناجح', fail: 'راسب' }[pClass];
        let row = tbody.insertRow(); row.innerHTML = `<td><strong>${escapeHtml(st.fullName)}</strong><br><small>رقم الجلوس: ${st.studentCode}</small></td><td>${html}</td><td><span class="total-cell">${total} / ${TOTAL_POSSIBLE_FIRST}</span></td><td><span class="percentage-cell ${pClass}">${pct.toFixed(1)}% (${pText})</span></td><td><button class="table-action-btn edit-action" onclick="editStudent('${st.studentCode}')"><i class="fas fa-edit"></i></button> <button class="table-action-btn delete-action" onclick="deleteStudent('${st.studentCode}')"><i class="fas fa-trash"></i></button></td>`;
        updateTopStudentsAfterDataChange();
    });
}

// ====================== إدارة الأدمنز ======================
function renderAdmins() { const t = document.getElementById('users-table-body'); if (t) t.innerHTML = admins.map(a => `<tr><td>${escapeHtml(a.fullName)}</td><td>${a.username}</td><td>${a.username!=='admin'?`<button class="delete-btn" onclick="deleteAdmin('${a.username}')"><i class="fas fa-trash"></i> حذف</button>`:'رئيسي'}</td></tr>`).join(''); }
window.deleteAdmin = async (u) => { if (u==='admin') return showToast('لا يمكن حذف المدير الرئيسي','error'); if (confirm('تأكيد الحذف؟')) { await saveToServer(`/api/admins/${u}`,{},'DELETE'); admins=await getFromServer('/api/admins'); renderAdmins(); showToast('تم الحذف','success'); } };
document.getElementById('add-user-form')?.addEventListener('submit', async (e) => { e.preventDefault(); let fn=document.getElementById('admin-name').value.trim(), un=document.getElementById('admin-username').value.trim(), pw=document.getElementById('admin-password').value.trim(); if(!fn||!un||!pw) return showToast('املأ جميع الحقول','error'); await saveToServer('/api/admins',{fullName:fn,username:un,password:pw}); admins=await getFromServer('/api/admins'); renderAdmins(); e.target.reset(); showToast('تم إضافة الأدمن','success'); });

// ====================== حذف وتعديل الطالب ======================
window.deleteStudent = async (code) => { if (confirm('⚠️ حذف الطالب نهائياً؟')) { await saveToServer(`/api/students/${code}`,{},'DELETE'); allStudents=await getFromServer('/api/admin/students'); studentsWithGrades=getStudentsWithGrades(allStudents); renderResults(); renderStats(); showToast('✅ تم حذف الطالب','success'); } };
window.editStudent = (code) => { let s=allStudents.find(st=>st.studentCode===code); if(s){ document.getElementById('student-name').value=s.fullName; document.getElementById('student-id').value=s.studentCode; document.getElementById('semester').value=s.semester||'first'; const allInputs=document.querySelectorAll('#add-result-form input[type="number"]'); allInputs.forEach(inp=>inp.value=0); window.toggleSubjects(); s.subjects?.forEach(sub=>{ const nn=normalizeSubjectName(sub.name); switch(nn){ case'اللغة العربية':document.getElementById('subject2').value=sub.grade;break; case'اللغة الإنجليزية':document.getElementById('subject3').value=sub.grade;break; case'علوم تطبيقية':document.getElementById('subject4').value=sub.grade;break; case'طب باطنة':document.getElementById('subject5').value=sub.grade;break; case'تمريض باطني جراحي':document.getElementById('subject6').value=sub.grade;break; case'حاسب آلي':document.getElementById('subject8').value=sub.grade;break; case'الدين':document.getElementById('subject7').value=sub.grade;break; } }); showToast('✏️ قم بتعديل البيانات ثم اضغط حفظ','info'); window.scrollTo(0,0); } };

// ====================== إضافة / تعديل نتيجة طالب ======================
document.getElementById('add-result-form')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); let fn=document.getElementById('student-name').value.trim(), code=document.getElementById('student-id').value.trim(), sem=document.getElementById('semester').value; 
    let subjects=[{name:"اللغة العربية",grade:parseInt(document.getElementById('subject2').value)||0},{name:"اللغة الإنجليزية",grade:parseInt(document.getElementById('subject3').value)||0},{name:"علوم تطبيقية",grade:parseInt(document.getElementById('subject4').value)||0},{name:"طب باطنة",grade:parseInt(document.getElementById('subject5').value)||0},{name:"تمريض باطني جراحي",grade:parseInt(document.getElementById('subject6').value)||0},{name:"حاسب آلي",grade:parseInt(document.getElementById('subject8').value)||0},{name:"الدين",grade:parseInt(document.getElementById('subject7').value)||0}]; 
    if(!fn||!code) return showToast('اسم الطالب ورقم الجلوس مطلوبان','error'); 
    let existing=allStudents.find(s=>s.studentCode===code); if(existing) await saveToServer(`/api/students/${code}`,{subjects,semester:sem},'PUT'); else await saveToServer('/api/students',{fullName:fn,id:code,subjects,semester:sem}); 
    allStudents=await getFromServer('/api/admin/students'); studentsWithGrades=getStudentsWithGrades(allStudents); renderResults(); renderStats(); e.target.reset(); document.getElementById('semester').value='first'; window.toggleSubjects(); showToast(`✅ ${existing?'تم تحديث':'تم إضافة'} ${fn}`,'success'); 
});

// ====================== المخالفات ======================
async function renderViolations() { const tb=document.getElementById('violations-table-body'); if(!tb) return; if(!violations||!violations.length){ tb.innerHTML='<tr><td colspan="7">📭 لا توجد إنذارات أو مخالفات مسجلة</td></tr>'; return; } tb.innerHTML=violations.map(v=>{ let s=allStudents.find(st=>st.studentCode===v.studentId); return `<tr><td>${v.studentId||'-'}</td><td>${s?.fullName||'غير موجود'}</td><td>${v.type==='warning'?'<span style="color:#F39C12;">⚠️ إنذار</span>':'<span style="color:#E74C3C;">🚫 مخالفة</span>'}</td><td style="max-width:200px;word-break:break-word;">${escapeHtml(v.reason)}</td><td>${escapeHtml(v.penalty)}</td><td>${v.parentSummons?'✅ نعم':'❌ لا'}</td><td><button class="edit-btn" onclick="editViolation('${v._id}')"><i class="fas fa-edit"></i> تعديل</button> <button class="delete-btn" onclick="deleteViolation('${v._id}')"><i class="fas fa-trash"></i> حذف</button></td></tr>`; }).join(''); }
let editingViolationId = null;
window.editViolation = function(id) { let v=violations.find(vv=>vv._id===id); if(v){ editingViolationId=id; document.getElementById('violation-student-id').value=v.studentId; document.getElementById('violation-type').value=v.type; document.getElementById('violation-reason').value=v.reason; document.getElementById('violation-penalty').value=v.penalty; document.getElementById('parent-summons').checked=v.parentSummons; document.querySelector('#add-violation-form button[type="submit"]').textContent='✏️ تحديث المخالفة'; document.getElementById('cancelEditViolationBtn').style.display='inline-block'; showToast('✏️ قم بتعديل البيانات ثم اضغط تحديث','info'); } };
window.cancelEditViolation = function() { editingViolationId=null; document.getElementById('add-violation-form').reset(); document.querySelector('#add-violation-form button[type="submit"]').textContent='➕ إضافة إنذار/مخالفة'; document.getElementById('cancelEditViolationBtn').style.display='none'; showToast('✅ تم إلغاء التعديل','info'); };
async function sendWhatsApp(phone,sn,type,reason,penalty) { let ph=phone.replace(/[^0-9]/g,''); if(ph.startsWith('0')) ph='20'+ph.substring(1); if(!ph.startsWith('20')) ph='20'+ph; let msg=`📢 *تنبيه من معهد رعاية الضبعية*\n\n👨‍🎓 الطالب: ${sn}\n⚠️ النوع: ${type==='warning'?'إنذار':'مخالفة'}\n📝 السبب: ${reason}\n⚖️ العقوبة: ${penalty}\n📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`; window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`,'_blank'); }
document.getElementById('add-violation-form')?.addEventListener('submit', async (e) => { e.preventDefault(); let sid=document.getElementById('violation-student-id').value.trim(), typ=document.getElementById('violation-type').value, rsn=document.getElementById('violation-reason').value.trim(), pnl=document.getElementById('violation-penalty').value.trim(), ps=document.getElementById('parent-summons').checked, pPhone=document.getElementById('parent-phone')?.value.trim(); if(!sid||!rsn||!pnl) return showToast('املأ الحقول المطلوبة','error'); let st=allStudents.find(s=>s.studentCode===sid); if(!st) return showToast('رقم الجلوس غير موجود','error'); let data={studentId:sid,type:typ,reason:rsn,penalty:pnl,parentSummons:ps,date:new Date().toLocaleString('ar-EG')}; if(editingViolationId){ await saveToServer(`/api/violations/${editingViolationId}`,{},'DELETE'); await saveToServer('/api/violations',data); editingViolationId=null; cancelEditViolation(); } else { await saveToServer('/api/violations',data); } violations=await getFromServer('/api/violations'); renderViolations(); e.target.reset(); showToast('✅ تمت العملية','success'); if(pPhone&&pPhone.length>=10){ await sendWhatsApp(pPhone,st.fullName,typ,rsn,pnl); showToast('📱 تم فتح واتساب','info'); } });
window.deleteViolation = async (id) => { if(confirm('⚠️ حذف المخالفة؟')){ await saveToServer(`/api/violations/${id}`,{},'DELETE'); violations=await getFromServer('/api/violations'); renderViolations(); showToast('🗑️ تم الحذف','success'); if(editingViolationId===id) cancelEditViolation(); } };

// ====================== الاختبارات ======================
let questionsList = [];
function renderQuestionInputs() { let type=document.getElementById('question-type')?.value, cont=document.getElementById('question-inputs'); if(!cont) return; if(type==='multiple'){ cont.innerHTML=`<div class="form-group"><label>📝 نص السؤال</label><input type="text" id="qText" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"></div><div class="form-group"><label>🔘 الخيارات</label><div id="optionsArea"><input type="text" class="opt" placeholder="خيار 1" style="width:48%;margin:5px;padding:8px;border-radius:8px;border:1px solid #ddd;"><input type="text" class="opt" placeholder="خيار 2" style="width:48%;margin:5px;padding:8px;border-radius:8px;border:1px solid #ddd;"><br><input type="text" class="opt" placeholder="خيار 3" style="width:48%;margin:5px;padding:8px;border-radius:8px;border:1px solid #ddd;"><input type="text" class="opt" placeholder="خيار 4" style="width:48%;margin:5px;padding:8px;border-radius:8px;border:1px solid #ddd;"></div></div><div class="form-group"><label>✅ الإجابة الصحيحة</label><select id="correctOpt" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"></select></div>`; let update=()=>{ let opts=[...document.querySelectorAll('.opt')].map(i=>i.value.trim()).filter(v=>v); let sel=document.getElementById('correctOpt'); sel.innerHTML='<option value="">اختر الإجابة</option>'+opts.map(o=>`<option value="${o}">${o}</option>`).join(''); }; document.querySelectorAll('.opt').forEach(i=>i.addEventListener('input',update)); setTimeout(update,100); } else if(type==='essay'){ cont.innerHTML=`<div class="form-group"><label>📝 نص السؤال</label><input type="text" id="qText" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"></div><div class="form-group"><label>📄 الإجابة النموذجية</label><textarea id="essayAnswer" rows="3" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"></textarea></div>`; } else if(type==='truefalse'){ cont.innerHTML=`<div class="form-group"><label>📝 نص السؤال</label><input type="text" id="qText" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"></div><div class="form-group"><label>✅ الإجابة الصحيحة</label><select id="tfAnswer" class="form-control" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;"><option value="true">✔️ صح</option><option value="false">❌ خطأ</option></select></div>`; } }
window.addQuestion = function() { let type=document.getElementById('question-type').value, text=document.getElementById('qText')?.value.trim(); if(!text){ showToast('أدخل نص السؤال أولاً!','error'); return; } let q={type,text}; if(type==='multiple'){ let opts=[...document.querySelectorAll('.opt')].map(i=>i.value.trim()).filter(v=>v), cor=document.getElementById('correctOpt').value; if(opts.length<2){ showToast('أضف خيارين على الأقل!','error'); return; } if(!cor){ showToast('اختر الإجابة الصحيحة!','error'); return; } q.options=opts; q.correctAnswer=cor; } else if(type==='essay'){ let ans=document.getElementById('essayAnswer')?.value.trim(); if(!ans){ showToast('أدخل الإجابة النموذجية!','error'); return; } q.correctAnswer=ans; } else if(type==='truefalse'){ q.correctAnswer=document.getElementById('tfAnswer').value; } questionsList.push(q); const qc=document.getElementById('questions-list'); if(qc) qc.innerHTML=questionsList.map((qq,idx)=>`<div style="background:#f8f9fa;border-radius:12px;padding:15px;margin-bottom:12px;border-right:3px solid #C7A252;"><strong>سؤال ${idx+1}:</strong> ${escapeHtml(qq.text)}<br>${qq.options?`<span style="color:#2D9C7C;">📌 الخيارات: ${qq.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الصحيح: ${qq.correctAnswer}</span>`:''}${qq.correctAnswer&&!qq.options?`<span style="color:#C7A252;">✅ الإجابة: ${qq.correctAnswer}</span>`:''}<button onclick="removeQuestion(${idx})" style="background:#E74C3C;color:white;border:none;padding:5px 12px;border-radius:20px;margin-top:10px;cursor:pointer;"><i class="fas fa-trash"></i> حذف</button></div>`).join(''); document.getElementById('question-inputs').innerHTML=''; document.getElementById('qText').value=''; showToast('✅ تم إضافة السؤال بنجاح','success'); };
window.removeQuestion = function(idx) { questionsList.splice(idx,1); const qc=document.getElementById('questions-list'); if(qc) qc.innerHTML=questionsList.map((qq,i)=>`<div style="background:#f8f9fa;border-radius:12px;padding:15px;margin-bottom:12px;border-right:3px solid #C7A252;"><strong>سؤال ${i+1}:</strong> ${escapeHtml(qq.text)}<br>${qq.options?`<span style="color:#2D9C7C;">📌 الخيارات: ${qq.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الصحيح: ${qq.correctAnswer}</span>`:''}${qq.correctAnswer&&!qq.options?`<span style="color:#C7A252;">✅ الإجابة: ${qq.correctAnswer}</span>`:''}<button onclick="removeQuestion(${i})" style="background:#E74C3C;color:white;border:none;padding:5px 12px;border-radius:20px;margin-top:10px;cursor:pointer;"><i class="fas fa-trash"></i> حذف</button></div>`).join(''); showToast('✅ تم حذف السؤال','success'); };
window.saveExam = async function() { const name=document.getElementById('exam-name')?.value.trim(), code=document.getElementById('exam-code')?.value.trim(), stage=document.getElementById('exam-stage')?.value, duration=parseInt(document.getElementById('exam-duration')?.value); if(!name){ showToast('يرجى إدخال اسم الاختبار!','error'); return; } if(!code){ showToast('يرجى إدخال كود الاختبار!','error'); return; } if(!duration||duration<1){ showToast('يرجى إدخال مدة الاختبار بالدقائق!','error'); return; } if(questionsList.length===0){ showToast('يرجى إضافة سؤال واحد على الأقل!','error'); return; } try { await saveToServer('/api/exams',{name,code,stage,duration,questions:questionsList}); showToast('✅ تم حفظ الاختبار بنجاح!','success'); questionsList=[]; document.getElementById('questions-list').innerHTML=''; document.getElementById('exam-name').value=''; document.getElementById('exam-code').value=''; document.getElementById('exam-duration').value=''; document.getElementById('exam-stage').value='first'; document.getElementById('question-inputs').innerHTML=''; await loadExamsList(); } catch(er){ showToast('❌ فشل حفظ الاختبار','error'); } };
async function loadExamsList() { try { const exams=await getFromServer('/api/exams'); const tbody=document.getElementById('exams-list-body'); if(!tbody) return; if(!exams||exams.length===0){ tbody.innerHTML='<tr><td colspan="7">📭 لا توجد اختبارات مسجلة</td></tr>'; return; } tbody.innerHTML=exams.map(ex=>`<tr><td>${escapeHtml(ex.name)}</td><td><strong style="color:#0F2B3D;">${escapeHtml(ex.code)}</strong></td><td>${ex.stage==='first'?'الأولى ثانوي':'الثانية ثانوي'}</td><td>${ex.duration} دقيقة</td><td>${ex.questions?.length||0}</td><td>${new Date(ex.createdAt).toLocaleDateString('ar-EG')}</td><td><button class="edit-btn" onclick="viewExam('${ex.code}')" style="background:#3498DB;color:white;border:none;padding:6px 12px;border-radius:20px;margin:2px;cursor:pointer;"><i class="fas fa-eye"></i> عرض</button> <button class="delete-btn" onclick="deleteExam('${ex.code}')" style="background:#E74C3C;color:white;border:none;padding:6px 12px;border-radius:20px;margin:2px;cursor:pointer;"><i class="fas fa-trash"></i> حذف</button></td></tr>`).join(''); } catch(er){ const tbody=document.getElementById('exams-list-body'); if(tbody) tbody.innerHTML='<tr><td colspan="7">❌ فشل تحميل الاختبارات</td></tr>'; } }
window.viewExam = async function(code) { try { const exam=await getFromServer(`/api/exams/${encodeURIComponent(code)}`); if(!exam) throw new Error('فشل'); let qh='<div style="max-height:400px;overflow-y:auto;text-align:right;">'; exam.questions.forEach((q,i)=>{ qh+=`<div style="background:#f8f9fa;border-radius:12px;padding:15px;margin-bottom:15px;"><strong>سؤال ${i+1}:</strong> ${escapeHtml(q.text)}<br>${q.options?`<span style="color:#2D9C7C;">📌 الخيارات: ${q.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الصحيح: ${q.correctAnswer==='true'?'صح':(q.correctAnswer==='false'?'خطأ':q.correctAnswer)}</span>`:''}${q.correctAnswer&&!q.options?`<span style="color:#C7A252;">✅ الإجابة: ${escapeHtml(q.correctAnswer)}</span>`:''}</div>`; }); qh+='</div>'; Swal.fire({title:exam.name,html:`<div><p><strong>🔑 كود:</strong> ${exam.code}</p><p><strong>📚 المرحلة:</strong> ${exam.stage==='first'?'الأولى':'الثانية'}</p><p><strong>⏱️ المدة:</strong> ${exam.duration} دقيقة</p><hr><h4>📝 الأسئلة:</h4>${qh}</div>`,icon:'info',confirmButtonText:'إغلاق',confirmButtonColor:'#C7A252',width:'700px'}); } catch(er){ showToast('خطأ في عرض بيانات الاختبار','error'); } };
window.deleteExam = async function(code) { const res=await Swal.fire({title:'⚠️ تأكيد الحذف',text:`هل أنت متأكد من حذف الاختبار "${code}"؟`,icon:'warning',showCancelButton:true,confirmButtonText:'نعم',cancelButtonText:'إلغاء',confirmButtonColor:'#E74C3C'}); if(res.isConfirmed){ try { await saveToServer(`/api/exams/${encodeURIComponent(code)}`,{},'DELETE'); showToast('✅ تم حذف الاختبار','success'); await loadExamsList(); } catch(er){ showToast('❌ فشل','error'); } } };
document.getElementById('fetch-results')?.addEventListener('click', async () => { const code=document.getElementById('results-exam-code')?.value.trim(); if(!code){ showToast('أدخل كود الاختبار أولاً!','error'); return; } try { const results=await getFromServer(`/api/exams/${encodeURIComponent(code)}/results`); const c=document.getElementById('exam-results-list'); if(!results||results.length===0){ c.innerHTML='<p>📭 لا توجد نتائج</p>'; return; } c.innerHTML=`<div class="table-wrapper"><table><thead><tr style="background:#1e3c4a;color:#d4af5a;"><th>👨‍🎓 الطالب</th><th>📊 النتيجة</th><th>📅 التاريخ</th></tr></thead><tbody>${results.map(r=>`<tr><td>${escapeHtml(r.studentId)}</td><td><strong style="color:#27AE60;">${r.score.toFixed(1)}%</strong></td><td>${new Date(r.completionTime).toLocaleString('ar-EG')}</td></tr>`).join('')}</tbody></table></div>`; } catch(er){ showToast('❌ خطأ','error'); } });
document.getElementById('question-type')?.addEventListener('change', renderQuestionInputs);
document.getElementById('add-question')?.addEventListener('click', addQuestion);
document.getElementById('save-exam')?.addEventListener('click', saveExam);

// ====================== ✅ تحليل Excel (بالترتيب الصحيح: A=رقم, B=اسم, C=عربي, D=إنجليزي, E=علوم, F=طب, G=تمريض, H=حاسب, I=دين, J=مجموع) ======================
window.analyzeExcel = async () => { 
    let file = document.getElementById('excel-upload').files[0]; 
    if (!file) return showToast('اختر ملف Excel', 'error'); 
    
    let progressContainer = document.getElementById('upload-progress');
    if (!progressContainer) { const div=document.createElement('div'); div.id='upload-progress'; div.style.cssText='margin-top:15px;padding:15px;background:#f8f9fa;border-radius:12px;max-height:350px;overflow-y:auto;font-size:0.85rem;border:2px solid #c4a35a;'; document.querySelector('.excel-upload-section')?.appendChild(div); progressContainer=div; }
    progressContainer.innerHTML='<div style="text-align:center;color:#1a4f6e;"><i class="fas fa-spinner fa-pulse"></i> ⏳ جاري قراءة الملف...</div>'; progressContainer.style.display='block';
    
    let reader = new FileReader(); 
    reader.onload = async (e) => { 
        try {
            let data = new Uint8Array(e.target.result), wb = XLSX.read(data, { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }); 
            const totalRows = rows.length - 1;
            console.log(`📊 تم قراءة ${totalRows} صف من Excel`);
            
            let studentsData = [];
            let skippedCount = 0;
            
            for (let i = 1; i < rows.length; i++) { 
                let row = rows[i]; 
                
                // تخطي الصفوف الفارغة
                if (!row[0] || !row[1]) { skippedCount++; continue; }
                
                // ✅ قراءة رقم الجلوس (العمود A)
                let studentCode = String(row[0]).trim();
                if (studentCode.includes('.')) studentCode = studentCode.split('.')[0];
                if (!studentCode || studentCode === '0' || studentCode === 'NaN') { skippedCount++; continue; }
                
                // ✅ قراءة الاسم (العمود B)
                let studentName = String(row[1]).trim();
                
                // تخطي صفوف العناوين والمجموع
                if (studentName.includes('المجموع') || studentName.includes('الاسم') || studentName === 'اسم' || 
                    studentName.includes('الكود') || studentName.includes('رقم الجلوس') || studentName.includes('بيان')) { 
                    skippedCount++; continue; 
                }
                
                // ✅ طباعة البيانات للتأكيد
                console.log(`📝 صف ${i}: كود=${studentCode}, اسم=${studentName}`);
                console.log(`   row[2]=${row[2]}, row[3]=${row[3]}, row[4]=${row[4]}, row[5]=${row[5]}, row[6]=${row[6]}, row[7]=${row[7]}, row[8]=${row[8]}`);
                
                // ✅ قراءة المواد بالترتيب الصحيح
                // A=رقم الجلوس, B=الاسم, C=عربي, D=إنجليزي, E=علوم تطبيقية, F=طب باطنة, G=تمريض باطني جراحي, H=حاسب آلي, I=تربية دينية, J=المجموع
                let subjects = [];
                if (row[2] !== undefined && row[2] !== '' && row[2] !== null) subjects.push({ name: "اللغة العربية", grade: Number(row[2]) || 0 });
                if (row[3] !== undefined && row[3] !== '' && row[3] !== null) subjects.push({ name: "اللغة الإنجليزية", grade: Number(row[3]) || 0 });
                if (row[4] !== undefined && row[4] !== '' && row[4] !== null) subjects.push({ name: "علوم تطبيقية", grade: Number(row[4]) || 0 });
                if (row[5] !== undefined && row[5] !== '' && row[5] !== null) subjects.push({ name: "طب باطنة", grade: Number(row[5]) || 0 });
                if (row[6] !== undefined && row[6] !== '' && row[6] !== null) subjects.push({ name: "تمريض باطني جراحي", grade: Number(row[6]) || 0 });
                if (row[7] !== undefined && row[7] !== '' && row[7] !== null) subjects.push({ name: "حاسب آلي", grade: Number(row[7]) || 0 });
                if (row[8] !== undefined && row[8] !== '' && row[8] !== null) subjects.push({ name: "الدين", grade: Number(row[8]) || 0 });
                // row[9] = المجموع (نتجاهله)
                
                console.log(`   ✅ تم قراءة ${subjects.length} مواد: ${subjects.map(s=>`${s.name}=${s.grade}`).join(', ')}`);
                
                studentsData.push({ studentCode, fullName: studentName, subjects, grade: 'first', semester: 'first' });
            }
            
            console.log(`📦 تم تجميع ${studentsData.length} طالب للإرسال`);
            
            if (studentsData.length === 0) {
                progressContainer.innerHTML = '<div style="text-align:center;color:#f39c12;padding:20px;">⚠️ لا توجد بيانات صالحة للرفع</div>';
                showToast('⚠️ لا توجد بيانات صالحة', 'warning');
                return;
            }
            
            // ✅ عرض أول طالب كمثال للتأكيد
            const firstStudent = studentsData[0];
            console.log('📋 مثال أول طالب:', JSON.stringify(firstStudent, null, 2));
            
            progressContainer.innerHTML = `<div style="text-align:center;color:#1a4f6e;padding:20px;"><i class="fas fa-paper-plane" style="font-size:2rem;"></i><br>⏳ جاري إرسال ${studentsData.length} طالب إلى السيرفر...</div>`;
            
            try {
                const response = await fetch(`${BASE_URL}/api/upload-grades`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({ students: studentsData })
                });
                const result = await response.json();
                console.log('📨 رد السيرفر:', result);
                
                if (response.ok) {
                    let msg = `✅ ${result.message || 'تم الرفع بنجاح'}`;
                    if (skippedCount > 0) msg += ` | ⏭️ تخطي ${skippedCount} صف`;
                    progressContainer.innerHTML = `<div style="text-align:center;color:#27ae60;padding:20px;"><i class="fas fa-check-circle" style="font-size:3rem;"></i><br><strong>${msg}</strong></div>`;
                    showToast(msg, 'success');
                    
                    try {
                        const res = await fetch(`${BASE_URL}/api/admin/students`, { credentials: 'include' });
                        if (res.ok) { allStudents = await res.json(); studentsWithGrades = getStudentsWithGrades(allStudents); renderResults(); renderStats(); renderTopStudents(); }
                    } catch (e) { console.error('❌ فشل إعادة التحميل:', e); }
                } else {
                    throw new Error(result.error || 'فشل الرفع');
                }
            } catch (err) {
                console.error('❌ فشل الإرسال:', err);
                progressContainer.innerHTML = `<div style="text-align:center;color:#e74c3c;padding:20px;">❌ خطأ: ${err.message}</div>`;
                showToast('❌ فشل: ' + err.message, 'error');
            }
        } catch (err) {
            console.error('❌ خطأ:', err);
            progressContainer.innerHTML = `<div style="text-align:center;color:#e74c3c;padding:20px;">❌ خطأ: ${err.message}</div>`;
            showToast('❌ خطأ: ' + err.message, 'error');
        }
    };
    reader.onerror = () => { progressContainer.innerHTML = '<div style="text-align:center;color:#e74c3c;">❌ خطأ في قراءة الملف</div>'; showToast('❌ خطأ في قراءة الملف', 'error'); };
    reader.readAsArrayBuffer(file); 
};

// ====================== تصدير Excel ======================
function exportToExcel() { if(!studentsWithGrades.length){ showToast('لا توجد بيانات','error'); return; } const data=studentsWithGrades.map(st=>{ const grades=getStudentFormattedGrades(st); const row={'رقم الجلوس':st.studentCode,'اسم الطالب':st.fullName}; ORDERED_SUBJECTS_FIRST.forEach(s=>{ const gi=grades[s]; if(gi) row[s]=gi.grade; }); row['المجموع']=calculateStudentTotal(st); row['النسبة']=calculateStudentPercentage(st).toFixed(1)+'%'; return row; }); const ws=XLSX.utils.json_to_sheet(data), wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'النتائج'); XLSX.writeFile(wb,'نتائج_الطلاب.xlsx'); showToast('✅ تم التصدير','success'); }

// ====================== بحث وتصفية ======================
document.getElementById('search-input')?.addEventListener('input', e => renderResults(e.target.value));
document.getElementById('filter-select')?.addEventListener('change', e => { document.querySelectorAll('#results-table-body tr').forEach(row => { let pctCell=row.cells[3]?.querySelector('.percentage-cell'); if(pctCell){ let pct=parseFloat(pctCell.innerText); if(e.target.value==='passed') row.style.display=pct>=60?'':'none'; else if(e.target.value==='failed') row.style.display=pct<60?'':'none'; else row.style.display=''; } }); });

// ====================== دوال مساعدة ======================
function renderAdminWelcomeMessage() { let u=getLoggedInUser(), d=document.querySelector('.admin-welcome-message'); if(d&&u) d.textContent=`أهلًا بك يا ${u.fullName||u.username} في لوحة التحكم`; }
function renderNavbar() { let n=document.getElementById('nav-bar'); if(n) n.innerHTML=`<a href="Home.html"><i class="fas fa-home"></i> الرئيسية</a><a href="admin.html"><i class="fas fa-cogs"></i> لوحة التحكم</a><a href="#" onclick="logout()"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</a>`; }
window.toggleSubjects = function() { const sem=document.getElementById('semester')?.value; const f=document.querySelector('.semester-first-fields'), s=document.querySelector('.semester-second-fields'); if(f&&s){ if(sem==='first'){ f.style.display='block'; s.style.display='none'; } else { f.style.display='none'; s.style.display='block'; } } };

// ====================== العشرة الأوائل وشهادات التقدير ======================
let topStudentsList = [], currentCertificateStudent = null;
function calculateTopStudents() { const l=studentsWithGrades.map(s=>({...s,total:calculateStudentTotal(s),percentage:calculateStudentPercentage(s)})); l.sort((a,b)=>b.percentage-a.percentage); return l.slice(0,10); }
function renderTopStudents() { const c=document.getElementById('top-students-grid'); if(!c) return; topStudentsList=calculateTopStudents(); if(!topStudentsList.length){ c.innerHTML='<div style="text-align:center;padding:40px;">📭 لا توجد بيانات</div>'; return; } const medals=['🥇','🥈','🥉','📖','📚','🏅','⭐','🌟','✨','🎯']; c.innerHTML=topStudentsList.map((s,i)=>{ const rank=i+1, rc=rank===1?'rank-1':(rank===2?'rank-2':(rank===3?'rank-3':'')), medal=medals[i]||'📜'; let pc=s.percentage>=95?'excellent':(s.percentage>=85?'very-good':(s.percentage>=75?'good':'')); return `<div class="top-student-card ${rc}"><div class="top-student-rank">${medal} ${rank}</div><div class="top-student-avatar"><i class="fas fa-user-graduate"></i></div><div class="top-student-name">${escapeHtml(s.fullName)}</div><div class="top-student-code">📋 ${s.studentCode}</div><div class="top-student-percentage"><span class="percentage-cell ${pc}">${s.percentage.toFixed(1)}%</span></div><div class="top-student-total">📊 ${s.total} / ${TOTAL_POSSIBLE_FIRST}</div><button class="certificate-btn" style="margin-top:15px;padding:8px 20px;font-size:0.8rem;" onclick='showCertificate(${JSON.stringify(s).replace(/'/g,"&#39;")})'><i class="fas fa-award"></i> شهادة</button></div>`; }).join(''); }
window.refreshTopStudents = function() { renderTopStudents(); };
window.showCertificate = function(student) { currentCertificateStudent=student; const container=document.getElementById('certificate-container'), modal=document.getElementById('certificate-modal'); if(!container||!modal) return; const cd=new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'}); const rank=topStudentsList.findIndex(s=>s.studentCode===student.studentCode)+1; const rt=getRankText(rank); container.innerHTML=`<div class="certificate" id="certificate-to-print"><div class="certificate-logo"><img src="logo.png" alt="شعار" onerror="this.style.display='none'"></div><div class="certificate-title"><i class="fas fa-award"></i> شهادة تقدير</div><div class="certificate-subtitle">معهد رعاية الضبعية الفني للتمريض</div><div class="certificate-body"><p>تُمنح هذه الشهادة للطالب/ة</p><div class="certificate-student-name">${escapeHtml(student.fullName)}</div><p>رقم الجلوس: <strong>${student.studentCode}</strong></p><div class="certificate-rank">🏆 <span>${rt}</span> 🏆</div><div class="certificate-percentage">⭐ بنسبة نجاح ${student.percentage.toFixed(1)}% ⭐</div><p>📊 المجموع الكلي: ${student.total} / ${TOTAL_POSSIBLE_FIRST}</p><p style="margin-top:15px;color:#666;">وذلك تقديراً لتفوقه وجهده المتميز</p></div><div class="certificate-date"><i class="far fa-calendar-alt"></i> التاريخ: ${cd}</div><div class="certificate-signature"><div><hr><p>مدير المعهد</p></div><div><hr><p>وكيل المعهد</p></div></div></div>`; modal.classList.add('show'); };
function getRankText(rank) { switch(rank){ case 1: return 'المركز الأول 🥇'; case 2: return 'المركز الثاني 🥈'; case 3: return 'المركز الثالث 🥉'; default: return `المركز ${rank} 🎖️`; } }
window.closeCertificateModal = function() { document.getElementById('certificate-modal')?.classList.remove('show'); currentCertificateStudent=null; };
window.printCurrentCertificate = function() { const cc=document.getElementById('certificate-to-print'); if(!cc) return; const pw=window.open('','_blank'); pw.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>شهادة</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Tajawal',sans-serif;background:white;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.certificate{background:linear-gradient(135deg,#fff 0%,#fdf8ed 100%);padding:40px;margin:20px;border:20px double #c4a35a;border-radius:28px;text-align:center;max-width:800px;width:100%}.certificate-logo img{width:80px;height:80px;border-radius:50%;border:3px solid #c4a35a}.certificate-title{font-size:2rem;font-weight:800;color:#1a4f6e;margin:20px 0}.certificate-subtitle{font-size:1rem;color:#64748b;margin-bottom:30px;border-bottom:2px solid #c4a35a;display:inline-block;padding-bottom:5px}.certificate-student-name{font-size:1.8rem;font-weight:800;background:linear-gradient(135deg,#c4a35a,#a07d3a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:20px 0}.certificate-rank span{font-size:1.5rem;font-weight:800;color:gold}.certificate-percentage{font-size:1.4rem;font-weight:800;color:#1a4f6e;margin:15px 0}.certificate-date{margin-top:30px;padding-top:20px;border-top:1px dashed #cbd5e1}.certificate-signature{margin-top:30px;display:flex;justify-content:space-between;align-items:center;padding:0 20px}.certificate-signature hr{width:150px;margin:5px 0;border:1px solid #cbd5e1}@media print{body{padding:0;margin:0}.certificate{margin:0}}</style></head><body>${cc.outerHTML}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()};<\/script></body></html>`); pw.document.close(); };
window.downloadCurrentCertificate = async function() { if(!currentCertificateStudent) return; if(typeof html2pdf!=='undefined'){ const e=document.getElementById('certificate-to-print'); html2pdf().set({margin:[0.5,0.5,0.5,0.5],filename:`شهادة_${currentCertificateStudent.fullName}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2},jsPDF:{unit:'in',format:'a4',orientation:'portrait'}}).from(e).save(); showToast('✅ تم الحفظ','success'); } else { printCurrentCertificate(); } };
window.printAllCertificates = function() { if(!topStudentsList.length) return; const pw=window.open('','_blank'); const cd=new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'}); let html=`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>شهادات</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet"><style>*{margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:#fff;padding:20px}.certificate-page{page-break-after:always;display:flex;justify-content:center;align-items:center;min-height:100vh}.certificate{background:linear-gradient(135deg,#fff 0%,#fdf8ed 100%);padding:40px;margin:20px;border:20px double #c4a35a;border-radius:28px;text-align:center;max-width:800px;width:100%}.certificate-logo img{width:80px;height:80px;border-radius:50%;border:3px solid #c4a35a}.certificate-title{font-size:2rem;font-weight:800;color:#1a4f6e;margin:20px 0}.certificate-subtitle{font-size:1rem;color:#64748b;margin-bottom:30px;border-bottom:2px solid #c4a35a;display:inline-block;padding-bottom:5px}.certificate-student-name{font-size:1.8rem;font-weight:800;background:linear-gradient(135deg,#c4a35a,#a07d3a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:20px 0}.certificate-rank span{font-size:1.5rem;font-weight:800;color:gold}.certificate-percentage{font-size:1.4rem;font-weight:800;color:#1a4f6e;margin:15px 0}.certificate-date{margin-top:30px;padding-top:20px;border-top:1px dashed #cbd5e1}.certificate-signature{margin-top:30px;display:flex;justify-content:space-between;align-items:center;padding:0 20px}.certificate-signature hr{width:150px;margin:5px 0;border:1px solid #cbd5e1}@media print{.certificate-page{page-break-after:always}}</style></head><body>`; topStudentsList.forEach((s,i)=>{ const rt=getRankText(i+1); html+=`<div class="certificate-page"><div class="certificate"><div class="certificate-logo"><img src="logo.png" onerror="this.style.display='none'"></div><div class="certificate-title"><i class="fas fa-award"></i> شهادة تقدير</div><div class="certificate-subtitle">معهد رعاية الضبعية الفني للتمريض</div><div class="certificate-body"><p>تُمنح هذه الشهادة للطالب/ة</p><div class="certificate-student-name">${escapeHtml(s.fullName)}</div><p>رقم الجلوس: <strong>${s.studentCode}</strong></p><div class="certificate-rank">🏆 <span>${rt}</span> 🏆</div><div class="certificate-percentage">⭐ بنسبة نجاح ${s.percentage.toFixed(1)}% ⭐</div><p>📊 المجموع: ${s.total} / ${TOTAL_POSSIBLE_FIRST}</p></div><div class="certificate-date"><i class="far fa-calendar-alt"></i> التاريخ: ${cd}</div><div class="certificate-signature"><div><hr><p>مدير المعهد</p></div><div><hr><p>وكيل المعهد</p></div></div></div></div>`; }); html+=`<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()};<\/script></body></html>`; pw.document.write(html); pw.document.close(); };
function updateTopStudentsAfterDataChange() { renderTopStudents(); }



// ====================== إدارة الفعاليات (نسخة محسّنة) ======================
let events = [];
let editingEventId = null;

async function loadEvents() {
    try {
        const r = await fetch(`${BASE_URL}/api/events`, { credentials: 'include' });
        if (r.ok) {
            events = await r.json();
            renderEvents();
            loadEventsStats();
        }
    } catch (e) {
        console.error('Error loading events:', e);
    }
}

// ✅ تحميل الإحصائيات
async function loadEventsStats() {
    try {
        const r = await fetch(`${BASE_URL}/api/events/stats`, { credentials: 'include' });
        if (r.ok) {
            const stats = await r.json();
            document.getElementById('stat-total-events').textContent = stats.totalEvents || 0;
            document.getElementById('stat-total-views').textContent = formatNumber(stats.totalViews || 0);
            document.getElementById('stat-total-likes').textContent = formatNumber(stats.totalLikes || 0);
            document.getElementById('stat-pinned').textContent = stats.pinnedCount || 0;
        }
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

// ✅ تنسيق الأرقام الكبيرة
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function renderEvents() {
    const tb = document.getElementById('events-table-body');
    if (!tb) return;
    
    // تطبيق الفلاتر
    let filteredEvents = [...events];
    
    const searchQuery = document.getElementById('admin-event-search')?.value.trim().toLowerCase();
    const typeFilter = document.getElementById('admin-event-filter-type')?.value;
    const pinnedFilter = document.getElementById('admin-event-filter-pinned')?.value;
    
    if (searchQuery) {
        filteredEvents = filteredEvents.filter(ev => 
            ev.title.toLowerCase().includes(searchQuery) ||
            ev.content.toLowerCase().includes(searchQuery) ||
            (ev.tags && ev.tags.some(t => t.toLowerCase().includes(searchQuery)))
        );
    }
    
    if (typeFilter && typeFilter !== 'all') {
        filteredEvents = filteredEvents.filter(ev => ev.type === typeFilter);
    }
    
    if (pinnedFilter === 'pinned') {
        filteredEvents = filteredEvents.filter(ev => ev.isPinned);
    }
    
    if (!filteredEvents || !filteredEvents.length) {
        tb.innerHTML = '<tr><td colspan="8">📭 لا توجد فعاليات منشورة</td></tr>';
        return;
    }
    
    const typeIcons = { 'post': '📌', 'news': '📰', 'article': '📝', 'image': '🖼️', 'video': '🎥', 'audio': '🎙️' };
    const typeNames = { 'post': 'منشور', 'news': 'خبر', 'article': 'مقال', 'image': 'صورة', 'video': 'فيديو', 'audio': 'صوت' };
    
    tb.innerHTML = filteredEvents.map(ev => {
        const shortContent = ev.content.length > 40 ? ev.content.substring(0, 40) + '...' : ev.content;
        const tagsHtml = (ev.tags && ev.tags.length > 0) 
            ? ev.tags.map(t => `<span style="background:#e8f4f8; color:#1a4f6e; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; margin: 2px; display: inline-block;">${escapeHtml(t)}</span>`).join('')
            : '<span style="color:#999;">-</span>';
        
        return `
            <tr>
                <td style="text-align: center;">
                    ${ev.isPinned ? '<i class="fas fa-thumbtack" style="color: #c4a35a; font-size: 1.2rem;" title="مثبتة"></i>' : ''}
                </td>
                <td>
                    <strong>${escapeHtml(ev.title)}</strong>
                    <br><small style="color: #666;">${escapeHtml(shortContent)}</small>
                </td>
                <td>${typeIcons[ev.type] || '📌'} ${typeNames[ev.type] || 'منشور'}</td>
                <td>${tagsHtml}</td>
                <td style="text-align: center;">
                    <i class="fas fa-eye" style="color: #3498db;"></i> ${formatNumber(ev.views || 0)}
                </td>
                <td style="text-align: center;">
                    <i class="fas fa-heart" style="color: #e74c3c;"></i> ${formatNumber(ev.likes || 0)}
                </td>
                <td>${new Date(ev.date).toLocaleDateString('ar-EG')}</td>
                <td style="white-space: nowrap;">
                    <button class="edit-btn" onclick="togglePinEvent('${ev._id}')" 
                            style="background: ${ev.isPinned ? '#f39c12' : '#c4a35a'}; color: white; border: none; padding: 5px 10px; border-radius: 15px; margin: 2px; cursor: pointer;"
                            title="${ev.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                    <button class="edit-btn" onclick="editEvent('${ev._id}')" 
                            style="background: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 15px; margin: 2px; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" onclick="deleteEvent('${ev._id}')"
                            style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 15px; margin: 2px; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ✅ تثبيت/إلغاء تثبيت
window.togglePinEvent = async function(id) {
    try {
        const csrfToken = await getCsrfToken();
        const r = await fetch(`${BASE_URL}/api/events/${id}/pin`, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        const d = await r.json();
        if (r.ok && d.success) {
            showToast(d.message, 'success');
            await loadEvents();
        } else {
            showToast(d.error || 'فشل العملية', 'error');
        }
    } catch (er) {
        showToast('حدث خطأ', 'error');
    }
};

// ✅ تعديل فعالية
window.editEvent = function(id) {
    const ev = events.find(e => e._id === id);
    if (!ev) return;
    
    editingEventId = id;
    document.getElementById('event-title').value = ev.title;
    document.getElementById('event-type').value = ev.type;
    document.getElementById('event-content').value = ev.content;
    document.getElementById('event-media').value = ev.mediaUrl || '';
    document.getElementById('event-tags').value = (ev.tags || []).join(', ');
    document.getElementById('event-pinned').checked = ev.isPinned || false;
    
    document.querySelector('#add-event-form button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> تحديث الفعالية';
    document.getElementById('cancelEditEventBtn').style.display = 'inline-block';
    
    showToast('✏️ قم بتعديل البيانات ثم اضغط تحديث', 'info');
    window.scrollTo(0, document.getElementById('add-event-form').offsetTop - 100);
};

// ✅ إلغاء التعديل
window.cancelEditEvent = function() {
    editingEventId = null;
    document.getElementById('add-event-form').reset();
    document.querySelector('#add-event-form button[type="submit"]').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة الفعالية';
    document.getElementById('cancelEditEventBtn').style.display = 'none';
    showToast('✅ تم إلغاء التعديل', 'info');
};

// ✅ إضافة/تحديث فعالية
document.getElementById('add-event-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('event-title').value.trim();
    const type = document.getElementById('event-type').value;
    const content = document.getElementById('event-content').value.trim();
    const mediaUrl = document.getElementById('event-media').value.trim();
    const tags = document.getElementById('event-tags').value.trim();
    const isPinned = document.getElementById('event-pinned').checked;

    if (!title || !content) return showToast('العنوان والمحتوى مطلوبان!', 'error');

    try {
        const csrfToken = await getCsrfToken();
        let url = `${BASE_URL}/api/events`;
        let method = 'POST';
        
        if (editingEventId) {
            url = `${BASE_URL}/api/events/${editingEventId}`;
            method = 'PUT';
        }
        
        const r = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            credentials: 'include',
            body: JSON.stringify({ title, type, content, mediaUrl, tags, isPinned })
        });
        const d = await r.json();
        if (r.ok && d.success) {
            showToast(editingEventId ? '✅ تم التحديث بنجاح!' : '✅ تم الإضافة بنجاح!', 'success');
            document.getElementById('add-event-form').reset();
            editingEventId = null;
            document.querySelector('#add-event-form button[type="submit"]').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة الفعالية';
            document.getElementById('cancelEditEventBtn').style.display = 'none';
            await loadEvents();
        } else {
            showToast(d.error || 'فشلت العملية', 'error');
        }
    } catch (er) {
        showToast('حدث خطأ أثناء الإرسال', 'error');
    }
});

// ✅ حذف فعالية
window.deleteEvent = async function(id) {
    const res = await Swal.fire({
        title: '⚠️ تأكيد الحذف', text: 'هل أنت متأكد من حذف هذه الفعالية؟',
        icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء', confirmButtonColor: '#E74C3C'
    });
    if (res.isConfirmed) {
        try {
            const csrfToken = await getCsrfToken();
            const r = await fetch(`${BASE_URL}/api/events/${id}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            const d = await r.json();
            if (r.ok && d.success) {
                showToast('🗑️ تم حذف الفعالية بنجاح.', 'success');
                await loadEvents();
            } else {
                showToast(d.error || '❌ فشل حذف الفعالية', 'error');
            }
        } catch (er) {
            showToast('حدث خطأ', 'error');
        }
    }
};

// ✅ ربط الفلاتر
document.getElementById('admin-event-search')?.addEventListener('input', renderEvents);
document.getElementById('admin-event-filter-type')?.addEventListener('change', renderEvents);
document.getElementById('admin-event-filter-pinned')?.addEventListener('change', renderEvents);
document.getElementById('cancelEditEventBtn')?.addEventListener('click', cancelEditEvent);

// ====================== بدء التشغيل ======================
(async function init() { 
    if (await verifyAdminAccess()) { 
        window.initBiometricPrompt?.();
        renderNavbar(); 
        renderAdminWelcomeMessage(); 
        await loadInitialData(); 
        await loadExamsList(); 
        await loadEvents(); // ✅ تحميل الفعاليات
        renderQuestionInputs(); 
        window.toggleSubjects();
        
        const analyzeBtn = document.getElementById('analyze-excel'); 
        if (analyzeBtn) { 
            analyzeBtn.addEventListener('click', window.analyzeExcel); 
            console.log('✅ زر تحليل Excel مربوط'); 
        }
        
        const exportBtn = document.getElementById('export-excel'); 
        if (exportBtn) exportBtn.addEventListener('click', exportToExcel);
    } 
})();
