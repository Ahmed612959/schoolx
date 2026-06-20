// Home.js - نسخة محسنة مع بحث دقيق بالأسماء والهمزات واكتشاف الترم تلقائياً

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
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('انتهت الجلسة');
    }
    return response;
}

// ====================== ✅ دالة توحيد النص العربي للمقارنة ======================
function normalizeArabicText(text) {
    if (!text) return '';
    return text
        .trim()
        // إزالة المسافات الزائدة
        .replace(/\s+/g, ' ')
        // توحيد الألفات
        .replace(/[أإآ]/g, 'ا')
        // توحيد الألف المقصورة والياء
        .replace(/[ى]/g, 'ي')
        // توحيد التاء المربوطة والهاء
        .replace(/ة/g, 'ه')
        // توحيد الهمزات على الواو والياء
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        // إزالة التشكيل
        .replace(/[\u064B-\u065F\u0670]/g, '')
        // إزالة الكشيدة
        .replace(/\u0640/g, '')
        .toLowerCase();
}

// ✅ دالة حساب درجة التشابه بين نصين
function calculateSimilarity(str1, str2) {
    const norm1 = normalizeArabicText(str1);
    const norm2 = normalizeArabicText(str2);
    
    if (norm1 === norm2) return 100;
    
    // تقسيم النصوص لكلمات
    const words1 = norm1.split(' ').filter(w => w.length > 0);
    const words2 = norm2.split(' ').filter(w => w.length > 0);
    
    // حساب عدد الكلمات المتطابقة
    let matchCount = 0;
    const checkedWords2 = new Set();
    
    for (const word1 of words1) {
        for (const word2 of words2) {
            if (!checkedWords2.has(word2) && (word1 === word2 || word1.includes(word2) || word2.includes(word1))) {
                matchCount++;
                checkedWords2.add(word2);
                break;
            }
        }
    }
    
    const totalWords = Math.max(words1.length, words2.length);
    return totalWords > 0 ? (matchCount / totalWords) * 100 : 0;
}

// ====================== تعريف المواد للترمين ======================
const SUBJECTS_CONFIG_FIRST = {
    "اللغة العربية": { max: 20 },
    "اللغة الإنجليزية": { max: 20 },
    "علوم تطبيقية": { max: 40 },
    "طب باطنة": { max: 20 },
    "تمريض باطني جراحي": { max: 24 },
    "حاسب آلي": { max: 20 },
    "الدين": { max: 32, isExtra: true }
};

const SUBJECTS_CONFIG_SECOND = {
    "اللغة العربية": { max: 20 },
    "اللغة الإنجليزية": { max: 20 },
    "تمريض باطني جراحي": { max: 24 },
    "صحة مجتمع": { max: 20 },
    "جراحة عامة": { max: 20 },
    "حاسب آلي": { max: 20 },
    "الإحصاء": { max: 20 }
};

const TOTAL_POSSIBLE_FIRST = 144;
const TOTAL_POSSIBLE_SECOND = 144;

const ORDERED_SUBJECTS_FIRST = [
    "اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية",
    "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"
];

const ORDERED_SUBJECTS_SECOND = [
    "اللغة العربية", "اللغة الإنجليزية", "تمريض باطني جراحي",
    "صحة مجتمع", "جراحة عامة", "حاسب آلي", "الإحصاء"
];

// المواد المميزة للترم الأول (غير موجودة في الترم الثاني)
const FIRST_SEMESTER_UNIQUE_SUBJECTS = ["علوم تطبيقية", "طب باطنة", "الدين"];
// المواد المميزة للترم الثاني (غير موجودة في الترم الأول)
const SECOND_SEMESTER_UNIQUE_SUBJECTS = ["صحة مجتمع", "جراحة عامة", "الإحصاء"];

function normalizeSubjectName(name) {
    if (!name) return '';
    const mapping = {
        'التربية الدينية': 'الدين',
        'تربية دينية': 'الدين',
        'دين': 'الدين',
        'الكمبيوتر': 'حاسب آلي',
        'كمبيوتر': 'حاسب آلي',
        'الحاسب الآلي': 'حاسب آلي',
        'التمريض الباطني الجراحي': 'تمريض باطني جراحي',
        'تمريض باطنى جراحي': 'تمريض باطني جراحي',
        'الطب الباطنة': 'طب باطنة',
        'العلوم التطبيقية': 'علوم تطبيقية',
        'الصحة المجتمع': 'صحة مجتمع',
        'الجراحة العامة': 'جراحة عامة',
        'الفيزياء': 'فيزياء',
        'الكيمياء': 'كيمياء',
        'الاحصاء': 'الإحصاء',
        'احصاء': 'الإحصاء'
    };
    return mapping[name.trim()] || name.trim();
}

// ✅ دالة اكتشاف الترم من المواد المسجلة
function detectSemester(subjects) {
    if (!subjects || subjects.length === 0) return null;
    
    const subjectNames = subjects.map(s => normalizeSubjectName(s.name));
    
    // التحقق من المواد المميزة للترم الأول
    const hasFirstUnique = FIRST_SEMESTER_UNIQUE_SUBJECTS.some(subj => 
        subjectNames.includes(subj)
    );
    
    // التحقق من المواد المميزة للترم الثاني
    const hasSecondUnique = SECOND_SEMESTER_UNIQUE_SUBJECTS.some(subj => 
        subjectNames.includes(subj)
    );
    
    if (hasFirstUnique && !hasSecondUnique) return 'first';
    if (hasSecondUnique && !hasFirstUnique) return 'second';
    
    // لو الاتنين موجودين (حالة نادرة) - نحسب عدد المواد من كل ترم
    let firstCount = 0, secondCount = 0;
    subjectNames.forEach(name => {
        if (FIRST_SEMESTER_UNIQUE_SUBJECTS.includes(name)) firstCount++;
        if (SECOND_SEMESTER_UNIQUE_SUBJECTS.includes(name)) secondCount++;
    });
    
    if (firstCount > secondCount) return 'first';
    if (secondCount > firstCount) return 'second';
    
    return 'first'; // افتراضي
}

function getSubjectConfig(semester) {
    return semester === 'first' ? SUBJECTS_CONFIG_FIRST : SUBJECTS_CONFIG_SECOND;
}

function getOrderedSubjects(semester) {
    return semester === 'first' ? ORDERED_SUBJECTS_FIRST : ORDERED_SUBJECTS_SECOND;
}

function getTotalPossible(semester) {
    return semester === 'first' ? TOTAL_POSSIBLE_FIRST : TOTAL_POSSIBLE_SECOND;
}

function calculateStudentTotal(student) {
    if (!student.subjects) return 0;
    const semester = student.semester || detectSemester(student.subjects) || 'first';
    const config = getSubjectConfig(semester);
    let t = 0;
    student.subjects.forEach(s => {
        const normalizedName = normalizeSubjectName(s.name);
        const c = config[normalizedName];
        if (c && !c.isExtra) t += s.grade || 0;
    });
    return t;
}

function calculateStudentPercentage(student) {
    const total = calculateStudentTotal(student);
    const semester = student.semester || detectSemester(student.subjects) || 'first';
    const possible = getTotalPossible(semester);
    return possible > 0 ? (total / possible) * 100 : 0;
}

// ✅ دالة الحصول على اسم الترم بالعربي
function getSemesterName(semester) {
    return semester === 'first' ? 'الترم الأول' : 'الترم الثاني';
}

// ====================== جلب البيانات ======================
async function fetchAllStudents() {
    try {
        const response = await apiRequest(`/api/admin/students`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('خطأ في جلب الطلاب:', error);
        return [];
    }
}

async function fetchStudentByCode(studentCode) {
    try {
        const response = await apiRequest(`/api/admin/students`);
        if (response.ok) {
            const allStudents = await response.json();
            return allStudents.find(s => s.studentCode === studentCode) || null;
        }
        return null;
    } catch (error) {
        console.error('خطأ في جلب الطالب:', error);
        return null;
    }
}

async function searchStudentsByNameAndCode(name, studentCode) {
    try {
        const allStudents = await fetchAllStudents();
        if (!allStudents.length) return [];
        
        let results = allStudents;
        
        // ✅ البحث برقم الجلوس (تطابق تام أو جزئي)
        if (studentCode) {
            results = results.filter(s => 
                s.studentCode === studentCode || 
                s.studentCode.includes(studentCode)
            );
        }
        
        // ✅ البحث بالاسم مع دعم الهمزات والمسافات
        if (name) {
            const searchName = normalizeArabicText(name);
            const searchParts = searchName.split(' ').filter(p => p.length > 0);
            
            results = results.filter(s => {
                const studentName = normalizeArabicText(s.fullName || '');
                
                // محاولة تطابق كل أجزاء الاسم المدخل
                const allPartsFound = searchParts.every(part => studentName.includes(part));
                
                // حساب درجة التشابه
                const similarity = calculateSimilarity(name, s.fullName || '');
                
                return allPartsFound || similarity >= 70;
            });
            
            // ترتيب النتائج حسب درجة التشابه
            results.sort((a, b) => {
                const simA = calculateSimilarity(name, a.fullName || '');
                const simB = calculateSimilarity(name, b.fullName || '');
                return simB - simA;
            });
        }
        
        return results;
    } catch (error) {
        console.error('خطأ في البحث:', error);
        return [];
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
                    tableBody.innerHTML = '<tr><td colspan="2">لا توجد إشعارات حاليًا</td></tr>';
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
let lastAttendanceFetch = 0;
const ATTENDANCE_FETCH_INTERVAL = 5000;

async function fetchAttendanceStats(studentCode, force = false) {
    const now = Date.now();
    if (!force && (now - lastAttendanceFetch) < ATTENDANCE_FETCH_INTERVAL) {
        return attendanceStats;
    }
    
    try {
        const response = await apiRequest(`/api/attendance/student/${studentCode}?t=${now}`);
        if (response.ok) {
            const data = await response.json();
            lastAttendanceFetch = now;
            
            let attendanceRecords = [];
            if (Array.isArray(data)) {
                attendanceRecords = data;
            } else if (data && typeof data === 'object') {
                if (Array.isArray(data.records)) attendanceRecords = data.records;
                else if (Array.isArray(data.results)) attendanceRecords = data.results;
                else if (Array.isArray(data.data)) attendanceRecords = data.data;
            }
            
            const present = attendanceRecords.filter(a => a.status === 'present').length;
            const absent = attendanceRecords.filter(a => a.status === 'absent').length;
            const late = attendanceRecords.filter(a => a.status === 'late').length;
            const total = attendanceRecords.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            
            const presentRecords = attendanceRecords.filter(a => a.status === 'present').sort((a, b) => new Date(b.date) - new Date(a.date));
            const absentRecords = attendanceRecords.filter(a => a.status === 'absent').sort((a, b) => new Date(b.date) - new Date(a.date));
            
            attendanceStats = {
                present, absent, late, total,
                percentage: percentage.toFixed(1),
                lastPresentDate: presentRecords.length > 0 ? formatDate(presentRecords[0].date) : null,
                lastAbsentDate: absentRecords.length > 0 ? formatDate(absentRecords[0].date) : null,
                records: attendanceRecords,
                hasRecords: total > 0
            };
            
            renderAttendanceStats();
            return attendanceStats;
        }
        return attendanceStats;
    } catch (error) {
        console.error('❌ خطأ في جلب إحصائيات الحضور:', error.message);
        return attendanceStats || { present: 0, absent: 0, late: 0, total: 0, percentage: 0, records: [], hasRecords: false };
    }
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    } catch {
        return dateStr;
    }
}

function renderAttendanceStats() {
    const section = document.getElementById('attendanceStatsSection');
    if (!section) return;
    
    const user = getLoggedInUser();
    if (!user || user.type !== 'student') {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    const noMsgDiv = document.getElementById('noAttendanceMessage');
    const grid = document.querySelector('.attendance-stats-grid');
    const datesDiv = document.querySelector('.attendance-dates');
    
    const hasRecords = attendanceStats && attendanceStats.total > 0;
    
    if (!hasRecords) {
        if (noMsgDiv) {
            noMsgDiv.style.display = 'block';
            noMsgDiv.innerHTML = '📌 لم يتم تسجيل أي حضور أو غياب لك حتى الآن.';
        }
        if (grid) grid.style.display = 'none';
        if (datesDiv) datesDiv.style.display = 'none';
        document.getElementById('presentCount').textContent = '0';
        document.getElementById('absentCount').textContent = '0';
        document.getElementById('lateCount').textContent = '0';
        document.getElementById('attendancePercentage').textContent = '0%';
        return;
    }
    
    if (noMsgDiv) {
        noMsgDiv.style.display = 'none';
        noMsgDiv.innerHTML = '';
    }
    if (grid) grid.style.display = 'grid';
    if (datesDiv) datesDiv.style.display = 'flex';
    
    document.getElementById('presentCount').textContent = attendanceStats.present;
    document.getElementById('absentCount').textContent = attendanceStats.absent;
    document.getElementById('lateCount').textContent = attendanceStats.late;
    document.getElementById('attendancePercentage').textContent = attendanceStats.percentage + '%';
    
    const lastPresentSpan = document.getElementById('lastPresentDate');
    const lastAbsentSpan = document.getElementById('lastAbsentDate');
    if (lastPresentSpan) lastPresentSpan.textContent = attendanceStats.lastPresentDate || 'لم يتم تسجيل بعد';
    if (lastAbsentSpan) lastAbsentSpan.textContent = attendanceStats.lastAbsentDate || 'لم يتم تسجيل بعد';
}

let attendancePollingInterval = null;

function startAttendancePolling(studentCode) {
    if (attendancePollingInterval) clearInterval(attendancePollingInterval);
    fetchAttendanceStats(studentCode, true);
    attendancePollingInterval = setInterval(() => fetchAttendanceStats(studentCode, true), ATTENDANCE_FETCH_INTERVAL);
}

function stopAttendancePolling() {
    if (attendancePollingInterval) {
        clearInterval(attendancePollingInterval);
        attendancePollingInterval = null;
    }
}

// ====================== لوحة التحكم ======================
let currentStudentCode = null;

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
    currentStudentCode = student.studentCode;
    
    if (student.subjects && student.subjects.length > 0) {
        const percentage = calculateStudentPercentage(student);
        const total = calculateStudentTotal(student);
        const detectedSemester = student.semester || detectSemester(student.subjects) || 'first';
        const totalPossible = getTotalPossible(detectedSemester);
        const semesterName = getSemesterName(detectedSemester);
        
        document.getElementById('student-percentage').innerHTML = `📊 نسبة نجاحك: <strong>${percentage.toFixed(1)}%</strong><br>
        <small>(المجموع: ${total} / ${totalPossible}) - ${semesterName}</small>`;
        document.getElementById('class-average').innerHTML = `📈 --`;
        
        const config = getSubjectConfig(detectedSemester);
        let religionGrade = 0;
        const extraSubject = Object.entries(config).find(([_, v]) => v.isExtra);
        if (extraSubject) {
            const sub = student.subjects?.find(s => normalizeSubjectName(s.name) === extraSubject[0]);
            religionGrade = sub?.grade || 0;
        }
        
        let religionDiv = document.getElementById('religionDisplay');
        if (!religionDiv) {
            religionDiv = document.createElement('div');
            religionDiv.id = 'religionDisplay';
            religionDiv.style.cssText = 'margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 8px; text-align: center;';
            const statsDiv = document.querySelector('.stats');
            if (statsDiv) statsDiv.appendChild(religionDiv);
        }
        if (religionGrade > 0 || extraSubject) {
            religionDiv.innerHTML = extraSubject ? 
                `📖 ${extraSubject[0]}: <strong>${religionGrade} / ${extraSubject[1].max}</strong> (خارج المجموع)` :
                '';
        }
        
        const orderedSubjects = getOrderedSubjects(detectedSemester);
        const subjectsWithGrades = orderedSubjects
            .filter(n => !config[n]?.isExtra)
            .map(subjName => {
                const subject = student.subjects?.find(s => normalizeSubjectName(s.name) === subjName);
                return { name: subjName, grade: subject ? (subject.grade || 0) : 0, max: config[subjName]?.max || 100 };
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
                    scales: { y: { beginAtZero: true, max: Math.max(...subjectsWithGrades.map(s => s.max)) + 5 } },
                    plugins: { legend: { display: false } }
                }
            });
        }
    } else {
        document.getElementById('student-percentage').innerHTML = `📊 لا توجد درجات مسجلة حتى الآن`;
        document.getElementById('class-average').innerHTML = `📈 --`;
    }
    
    if (student.studentCode) {
        await fetchAttendanceStats(student.studentCode, true);
        renderAttendanceStats();
        startAttendancePolling(student.studentCode);
    }
}

// ====================== ✅ عرض النتيجة مع اكتشاف الترم تلقائياً ======================
function renderStudentResult(student, studentViolations, resultBody, violationsBody, searchName = '') {
    if (!student.subjects || student.subjects.length === 0) {
        resultBody.innerHTML = '<tr><td colspan="4">📭 لا توجد درجات مسجلة لهذا الطالب</td></tr>';
        if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات</td></tr>';
        return;
    }
    
    // ✅ اكتشاف الترم تلقائياً من المواد
    const detectedSemester = student.semester || detectSemester(student.subjects) || 'first';
    const semesterName = getSemesterName(detectedSemester);
    const config = getSubjectConfig(detectedSemester);
    const orderedSubjects = getOrderedSubjects(detectedSemester);
    const totalPossible = getTotalPossible(detectedSemester);
    
    // ✅ التحقق من تطابق الاسم
    let similarity = 0;
    let nameMatchMessage = '';
    if (searchName) {
        similarity = calculateSimilarity(searchName, student.fullName || '');
        if (similarity < 50) {
            nameMatchMessage = `<div style="background: #fff3cd; padding: 8px; border-radius: 8px; margin-bottom: 10px; text-align: center;">
                ⚠️ الاسم المدخل (${escapeHtml(searchName)}) مختلف عن الاسم المسجل (${escapeHtml(student.fullName)}).
                تأكد من صحة البيانات.
            </div>`;
        }
    }
    
    let total = 0;
    const subjectGrades = [];
    
    orderedSubjects.forEach(subjName => {
        const subjectConfig = config[subjName];
        const subject = student.subjects?.find(s => normalizeSubjectName(s.name) === subjName);
        const grade = subject ? (subject.grade || 0) : 0;
        
        if (subjectConfig?.isExtra) {
            subjectGrades.push({ 
                name: `${subjName} (خارج المجموع)`, 
                grade: grade, 
                max: subjectConfig.max, 
                isExtra: true 
            });
        } else {
            subjectGrades.push({ 
                name: subjName, 
                grade: grade, 
                max: subjectConfig?.max || 100, 
                isExtra: false 
            });
            total += grade;
        }
    });
    
    const percentage = (total / totalPossible) * 100;
    let percentageClass = percentage >= 85 ? 'high-percentage' : (percentage >= 60 ? 'medium-percentage' : 'low-percentage');
    
    const labels = ['📋 الاسم', '🔢 رقم الجلوس', '📅 الترم', ...subjectGrades.map(s => s.name)];
    const values = [
        `<strong>${escapeHtml(student.fullName)}</strong>`,
        student.studentCode,
        `<strong style="color: #d4af37;">${semesterName}</strong>`,
        ...subjectGrades.map(s => `${s.grade} / ${s.max}`)
    ];
    
    // ✅ إظهار رسالة توضح أن الترم تم اكتشافه تلقائياً
    const autoDetectMessage = !student.semester ? 
        `<div style="background: #e8f5e9; padding: 8px; border-radius: 8px; margin-top: 10px; text-align: center; font-size: 0.9em;">
            💡 تم اكتشاف الترم تلقائياً من المواد: <strong>${semesterName}</strong>
        </div>` : '';
    
    resultBody.innerHTML = `
        ${nameMatchMessage}
        <tr>
            <td>${labels.join('<hr class="table-separator">')}</td>
            <td>${values.join('<hr class="table-separator">')}</td>
            <td><strong>${total} / ${totalPossible}</strong></td>
            <td class="${percentageClass}"><strong>${percentage.toFixed(1)}%</strong><br><small>${percentage >= 60 ? '✅ ناجح' : '❌ راسب'}</small></td>
        </tr>
        ${autoDetectMessage ? `<tr><td colspan="4">${autoDetectMessage}</td></tr>` : ''}
    `;
    
    if (violationsBody) {
        if (studentViolations && studentViolations.length) {
            violationsBody.innerHTML = studentViolations.map(v => `<tr>
                <td>${v.type === 'warning' ? '⚠️ إنذار' : '🚫 مخالفة'}</td>
                <td>${v.reason || '-'}</td>
                <td>${v.penalty || '-'}</td>
                <td>${v.parentSummons ? '✅ نعم' : '❌ لا'}</td>
                <td>${v.date || '-'}</td>
            </tr>`).join('');
        } else {
            violationsBody.innerHTML = '<tr><td colspan="5" style="color: #28a745;">✅ لا توجد مخالفات مسجلة</td></tr>';
        }
    }
}

// ====================== ✅ عرض نتائج متعددة مع توضيح الترم ======================
function renderMultipleResults(results, resultBody, violationsBody) {
    if (!results || results.length === 0) {
        resultBody.innerHTML = '<tr><td colspan="4">❌ لا توجد نتائج</td></tr>';
        return;
    }
    
    if (results.length === 1) {
        fetchViolationsForStudent(results[0].studentCode).then(violations => {
            renderStudentResult(results[0], violations, resultBody, violationsBody);
        });
        return;
    }
    
    let html = '';
    results.forEach(student => {
        const percentage = calculateStudentPercentage(student);
        const detectedSemester = student.semester || detectSemester(student.subjects) || 'first';
        const semesterName = getSemesterName(detectedSemester);
        const pClass = percentage >= 85 ? 'high-percentage' : (percentage >= 60 ? 'medium-percentage' : 'low-percentage');
        
        html += `<tr style="cursor: pointer;" onclick="viewStudentDetail('${student.studentCode}')">
            <td><strong>${escapeHtml(student.fullName)}</strong></td>
            <td>${student.studentCode}<br><small style="color: #d4af37;">${semesterName}</small></td>
            <td>${calculateStudentTotal(student)} / ${getTotalPossible(detectedSemester)}</td>
            <td class="${pClass}">${percentage.toFixed(1)}%</td>
        </tr>`;
    });
    
    resultBody.innerHTML = html;
    
    if (violationsBody) {
        violationsBody.innerHTML = '<tr><td colspan="5" style="color: #d4af37;">🔍 تم العثور على عدة نتائج. اضغط على أي صف للتفاصيل.</td></tr>';
    }
    
    window._searchResults = results;
}

window.viewStudentDetail = async function(studentCode) {
    const student = window._searchResults?.find(s => s.studentCode === studentCode);
    if (student) {
        const violations = await fetchViolationsForStudent(studentCode);
        renderStudentResult(
            student, 
            violations, 
            document.getElementById('result-table-body'),
            document.getElementById('violations-table-body')
        );
        window.scrollTo({ top: document.querySelector('.result-table')?.offsetTop || 0, behavior: 'smooth' });
    }
};

// ====================== ✅ البحث المحسن (الحقلين مطلوبين) ======================
function setupSearchForm() {
    const form = document.getElementById('search-form');
    if (!form) return;
    
    // دعم زر Enter
    const searchInputs = form.querySelectorAll('input');
    searchInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    });
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('search-name')?.value.trim();
        const studentCode = document.getElementById('search-id')?.value.trim();
        const resultBody = document.getElementById('result-table-body');
        const violationsBody = document.getElementById('violations-table-body');
        
        // ✅ الحقلين مطلوبين
        if (!name) {
            showToast('⚠️ يرجى إدخال اسم الطالب!', 'error');
            document.getElementById('search-name')?.focus();
            return;
        }
        if (!studentCode) {
            showToast('⚠️ يرجى إدخال رقم الجلوس!', 'error');
            document.getElementById('search-id')?.focus();
            return;
        }
        
        showToast('🔍 جاري البحث...', 'info');
        
        try {
            const results = await searchStudentsByNameAndCode(name, studentCode);
            
            if (results.length === 0) {
                resultBody.innerHTML = '<tr><td colspan="4">❌ لا توجد نتيجة! تأكد من الاسم ورقم الجلوس</td></tr>';
                if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">❌ لا توجد نتيجة!</td></tr>';
                
                // ✅ اقتراحات للمستخدم
                showToast('💡 تأكد من صحة الاسم ورقم الجلوس. جرب كتابة الاسم كاملاً أو جزء منه.', 'info');
            } else if (results.length === 1) {
                const violations = await fetchViolationsForStudent(results[0].studentCode);
                renderStudentResult(results[0], violations, resultBody, violationsBody, name);
                
                // ✅ رسالة نجاح مع توضيح الترم
                const detectedSemester = results[0].semester || detectSemester(results[0].subjects) || 'first';
                const semesterName = getSemesterName(detectedSemester);
                
                // التحقق من تطابق الاسم
                const similarity = calculateSimilarity(name, results[0].fullName || '');
                if (similarity >= 90) {
                    showToast(`✅ تم العثور على الطالب: ${results[0].fullName} - ${semesterName}`, 'success');
                } else {
                    showToast(`✅ تم العثور على الطالب برقم الجلوس. الاسم المسجل: ${results[0].fullName} - ${semesterName}`, 'warning');
                }
            } else {
                renderMultipleResults(results, resultBody, violationsBody);
                showToast(`✅ تم العثور على ${results.length} نتائج. اضغط على أي صف للتفاصيل`, 'info');
            }
        } catch (error) {
            console.error('خطأ في البحث:', error);
            resultBody.innerHTML = '<tr><td colspan="4">❌ حدث خطأ في البحث!</td></tr>';
            if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">❌ حدث خطأ!</td></tr>';
            showToast('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        }
    });
}

// ====================== دوال الواجهة ======================
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
    
    navBar.innerHTML = links.map(l => `<a href="${l.href}" title="${l.title}"><i class="${l.icon}"></i><span>${l.title}</span></a>`).join('');
}

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

async function verifySession() {
    try {
        const response = await fetch(`${BASE_URL}/api/verify-session`, { credentials: 'include' });
        if (response.ok) return true;
    } catch (error) {
        console.error('خطأ في التحقق من الجلسة:', error);
        if (window.location.hostname === 'localhost') return true;
    }
    window.location.href = 'login.html';
    return false;
}

async function logout() {
    try {
        await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {}
    finally {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

function setupLogoutButton() {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function initLibraryTour() {
    const hasSeenTour = localStorage.getItem('hasSeenLibraryTour');
    if (hasSeenTour === 'true') {
        const tour = document.getElementById('guidedTour');
        if (tour) tour.style.display = 'none';
        return;
    }
    
    setTimeout(() => {
        const tour = document.getElementById('guidedTour');
        if (tour) tour.style.display = 'flex';
    }, 2000);
    
    document.getElementById('closeTourBtn')?.addEventListener('click', function() {
        document.getElementById('guidedTour').style.display = 'none';
        localStorage.setItem('hasSeenLibraryTour', 'true');
    });
    
    document.getElementById('gotoLibraryBtn')?.addEventListener('click', function() {
        document.getElementById('guidedTour').style.display = 'none';
        localStorage.setItem('hasSeenLibraryTour', 'true');
        window.location.href = 'file-library.html';
    });
    
    document.getElementById('dontShowAgain')?.addEventListener('click', function() {
        document.getElementById('guidedTour').style.display = 'none';
        localStorage.setItem('hasSeenLibraryTour', 'true');
    });
}

async function init() {
    const isValid = await verifySession();
    if (!isValid) return;
    
    await loadNotifications();
    renderNavbar();
    renderWelcomeMessage();
    await renderDashboard();
    setupSearchForm();
    setupLogoutButton();
    initLibraryTour();
    
    setInterval(async () => {
        try {
            await fetch(`${BASE_URL}/api/refresh-token`, { method: 'POST', credentials: 'include' });
        } catch (e) {}
    }, 55 * 60 * 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
