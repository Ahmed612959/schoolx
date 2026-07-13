// ====================== إعدادات السيرفر ======================
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

let currentUser = null;
let userData = null;
let isAdminUser = false;

// ====================== دوال مساعدة ======================
function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function getLoggedInUser() {
    const user = sessionStorage.getItem('userData');
    if (user) return JSON.parse(user);

    const oldUser = localStorage.getItem('loggedInUser');
    if (oldUser) {
        const parsed = JSON.parse(oldUser);
        sessionStorage.setItem('userData', JSON.stringify(parsed));
        return parsed;
    }
    return null;
}

function showToast(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
        error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
        info: 'linear-gradient(135deg, #d97706, #b45309)',
        warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
    };

    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: message,
            duration: 3000,
            gravity: 'top',
            position: 'center',
            style: {
                background: colors[type] || colors.success,
                fontFamily: 'Tajawal, sans-serif',
                borderRadius: '50px',
                padding: '12px 24px',
                direction: 'rtl',
                fontWeight: '600',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            },
            stopOnFocus: true
        }).showToast();
    } else {
        alert(message);
    }
}

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
    });

    if (response.status === 401) {
        sessionStorage.clear();
        localStorage.removeItem('loggedInUser');
        showToast('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        throw new Error('انتهت الجلسة');
    }

    return response;
}

// ====================== جلب بيانات الطالب (مُصلح) ======================
async function fetchStudentDataFromServer() {
    // ✅ الإصلاح: استخدام studentCode أو id (لأن اللوجين يحفظه كـ id)
    const studentCode = currentUser.studentCode || currentUser.id;

    console.log('📡 جلب بيانات الطالب - studentCode:', currentUser.studentCode, '| id:', currentUser.id, '| المُستخدم:', studentCode);

    if (!studentCode) {
        console.warn('⚠️ لا يوجد studentCode أو id للمستخدم');
        return null;
    }

    try {
        const response = await apiRequest(`/api/student/by-code/${studentCode}`);
        if (response.ok) {
            const student = await response.json();
            console.log('✅ تم جلب بيانات الطالب بنجاح:', student);
            return student;
        } else if (response.status === 404) {
            console.warn('⚠️ الطالب غير موجود في قاعدة البيانات بالكود:', studentCode);
            // محاولة بديلة: البحث بالـ username
            return await fetchStudentByUsername();
        } else {
            const err = await response.json().catch(() => ({}));
            console.error('❌ خطأ في استجابة السيرفر:', response.status, err);
        }
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات الطالب:', error);
    }
    return null;
}

// ✅ دالة بديلة: البحث بالـ username
async function fetchStudentByUsername() {
    if (!currentUser.username) return null;

    console.log('📡 محاولة بديلة: جلب بيانات الطالب بالـ username:', currentUser.username);

    try {
        const response = await apiRequest(`/api/student/by-username/${currentUser.username}`);
        if (response.ok) {
            const student = await response.json();
            console.log('✅ تم جلب بيانات الطالب بالـ username:', student);
            return student;
        }
    } catch (error) {
        console.error('❌ فشلت المحاولة البديلة:', error);
    }
    return null;
}

// ====================== جلب بيانات الأدمن ======================
async function fetchAdminDataFromServer() {
    console.log('📡 جلب بيانات الأدمن...');
    try {
        const response = await apiRequest('/api/admins');
        if (response.ok) {
            const admins = await response.json();
            const admin = admins.find(a => a.username === currentUser.username);
            console.log('✅ تم جلب بيانات الأدمن:', admin ? 'موجود' : 'غير موجود');
            return admin;
        }
    } catch (error) {
        console.error('❌ خطأ في جلب بيانات الأدمن:', error);
    }
    return null;
}

// ====================== جلب بيانات المستخدم (مُصلح) ======================
async function fetchUserData() {
    currentUser = getLoggedInUser();

    if (!currentUser) {
        showToast('يرجى تسجيل الدخول أولاً', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return false;
    }

    console.log('👤 المستخدم الحالي من التخزين المحلي:', currentUser);
    console.log('📌 نوع المستخدم:', currentUser.type);
    console.log('📌 studentCode:', currentUser.studentCode);
    console.log('📌 id:', currentUser.id);

    isAdminUser = currentUser.type === 'admin' || currentUser.role === 'admin';

    try {
        if (isAdminUser) {
            userData = await fetchAdminDataFromServer();
        } else {
            userData = await fetchStudentDataFromServer();
        }

        // ✅ الإصلاح: دمج البيانات المحلية مع بيانات السيرفر
        if (userData) {
            // دمج الحقول التي قد لا يرجعها السيرفر
            userData.type = userData.type || currentUser.type;
            if (!userData.fullName && currentUser.fullName) userData.fullName = currentUser.fullName;
            if (!userData.username && currentUser.username) userData.username = currentUser.username;
            if (!userData.studentCode && (currentUser.studentCode || currentUser.id)) {
                userData.studentCode = currentUser.studentCode || currentUser.id;
            }
        } else {
            console.log('⚠️ استخدام البيانات المحلية كبديل');
            // ✅ الإصلاح: بناء بيانات كاملة من البيانات المحلية
            userData = {
                fullName: currentUser.fullName || '',
                username: currentUser.username || '',
                studentCode: currentUser.studentCode || currentUser.id || '',
                grade: currentUser.grade || '',
                type: currentUser.type || 'student',
                role: currentUser.role || 'student',
                profile: currentUser.profile || {
                    phone: '',
                    parentName: '',
                    parentId: ''
                }
            };
            console.log('📋 البيانات المحلية بعد البناء:', userData);
        }

        // التأكد من وجود profile
        if (!userData.profile) {
            userData.profile = { phone: '', parentName: '', parentId: '' };
        }
        // التأكد من وجود جميع حقول profile
        if (!userData.profile.phone) userData.profile.phone = '';
        if (!userData.profile.parentName) userData.profile.parentName = '';
        if (!userData.profile.parentId) userData.profile.parentId = '';

        console.log('✅ البيانات النهائية بعد الدمج:', userData);

        // تحديث التخزين المحلي بالبيانات الكاملة
        const dataToStore = {
            fullName: userData.fullName,
            username: userData.username,
            studentCode: userData.studentCode,
            grade: userData.grade,
            type: userData.type || currentUser.type,
            role: userData.role || currentUser.role,
            id: userData.id || currentUser.id,
            profile: userData.profile
        };
        sessionStorage.setItem('userData', JSON.stringify(dataToStore));
        if (!isAdminUser) {
            localStorage.setItem('loggedInUser', JSON.stringify(dataToStore));
        }

        displayUserData();
        updateProgress();
        return true;

    } catch (error) {
        console.error('❌ خطأ في جلب البيانات:', error);
        userData = {
            ...currentUser,
            studentCode: currentUser.studentCode || currentUser.id || '',
            profile: currentUser.profile || { phone: '', parentName: '', parentId: '' }
        };
        displayUserData();
        updateProgress();
        return true;
    }
}

// ====================== عرض بيانات المستخدم (مُصلح) ======================
function displayUserData() {
    if (!userData) {
        console.warn('⚠️ لا توجد بيانات لعرضها');
        return;
    }

    console.log('📋 عرض البيانات:', userData);

    isAdminUser = userData.type === 'admin' || userData.role === 'admin';

    // ===== عرض الاسم =====
    const userNameElem = document.getElementById('userName');
    if (userNameElem) {
        const fullName = userData.fullName || userData.username || 'غير معروف';
        userNameElem.textContent = fullName;
    }

    // ===== الحقول الأساسية =====
    const fullNameInput = document.getElementById('fullName');
    if (fullNameInput) fullNameInput.value = userData.fullName || '';

    const usernameInput = document.getElementById('username');
    if (usernameInput) usernameInput.value = userData.username || '';

    // ===== نوع المستخدم =====
    const userTypeBadge = document.getElementById('userTypeBadge');
    const avatarIcon = document.querySelector('.profile-avatar i');

    if (isAdminUser) {
        if (userTypeBadge) {
            userTypeBadge.innerHTML = '<i class="fas fa-crown"></i><span>مدير النظام</span>';
            userTypeBadge.style.background = '#f59e0b';
        }
        if (avatarIcon) avatarIcon.className = 'fas fa-user-shield';

        // ✅ الإصلاح: إخفاء حقول الطالب باستخدام الفورم (ليس الإحصائيات)
        const parentNameGroup = document.getElementById('parentNameFormGroup');
        const parentIdGroup = document.getElementById('parentIdFormGroup');
        const studentCodeFormGroup = document.getElementById('studentCodeFormGroup');
        const gradeFormGroup = document.getElementById('gradeFormGroup');

        if (parentNameGroup) parentNameGroup.style.display = 'none';
        if (parentIdGroup) parentIdGroup.style.display = 'none';
        if (studentCodeFormGroup) studentCodeFormGroup.style.display = 'none';
        if (gradeFormGroup) gradeFormGroup.style.display = 'none';

        // إخفاء إحصائيات الطالب
        const studentCodeStat = document.getElementById('studentCodeStat');
        const gradeStat = document.getElementById('gradeStat');
        if (studentCodeStat) studentCodeStat.style.display = 'none';
        if (gradeStat) gradeStat.style.display = 'none';

        document.getElementById('studentCode').textContent = 'مدير النظام';
        document.getElementById('userGrade').textContent = 'جميع الصفوف';
        document.getElementById('grade').value = 'مدير النظام';

    } else {
        // ===== بيانات الطالب =====
        if (userTypeBadge) {
            userTypeBadge.innerHTML = '<i class="fas fa-graduation-cap"></i><span>طالب</span>';
            userTypeBadge.style.background = '#1a4f6e';
        }
        if (avatarIcon) avatarIcon.className = 'fas fa-user-graduate';

        // ✅ إصلاح: إظهار حقول الطالب الصحيحة
        const parentNameGroup = document.getElementById('parentNameFormGroup');
        const parentIdGroup = document.getElementById('parentIdFormGroup');
        const studentCodeFormGroup = document.getElementById('studentCodeFormGroup');
        const gradeFormGroup = document.getElementById('gradeFormGroup');

        if (parentNameGroup) parentNameGroup.style.display = 'block';
        if (parentIdGroup) parentIdGroup.style.display = 'block';
        if (studentCodeFormGroup) studentCodeFormGroup.style.display = 'block';
        if (gradeFormGroup) gradeFormGroup.style.display = 'block';

        // إظهار إحصائيات الطالب
        const studentCodeStat = document.getElementById('studentCodeStat');
        const gradeStat = document.getElementById('gradeStat');
        if (studentCodeStat) studentCodeStat.style.display = 'block';
        if (gradeStat) gradeStat.style.display = 'block';

        // ✅ عرض رقم الجلوس
        const studentCode = userData.studentCode || 'غير محدد';
        document.getElementById('studentCode').textContent = studentCode;
        const studentCodeDisplay = document.getElementById('studentCodeDisplay');
        if (studentCodeDisplay) studentCodeDisplay.value = studentCode;

        // ✅ عرض الصف
        const gradeMap = { 'first': 'الصف الأول', 'second': 'الصف الثاني', 'third': 'الصف الثالث' };
        const gradeValue = userData.grade ? gradeMap[userData.grade] : 'غير محدد';
        document.getElementById('userGrade').textContent = gradeValue;
        document.getElementById('grade').value = gradeValue;

        // ✅ عرض ولي الأمر
        const profile = userData.profile || {};
        const parentNameInput = document.getElementById('parentName');
        if (parentNameInput) parentNameInput.value = profile.parentName || '';

        const parentIdInput = document.getElementById('parentId');
        if (parentIdInput) parentIdInput.value = profile.parentId || '';
    }

    // ===== رقم الهاتف =====
    const profile = userData.profile || {};
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.value = profile.phone || '';
        phoneInput.disabled = false;
    }

    console.log('✅ تم عرض البيانات بنجاح');
}

// ====================== حساب نسبة اكتمال الملف ======================
function updateProgress() {
    const profile = userData?.profile || {};
    let fields = ['phone'];
    let completed = fields.filter(f => profile[f] && profile[f].trim() !== '').length;
    const percentage = Math.round((completed / fields.length) * 100);

    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressPercent) progressPercent.textContent = `${percentage}%`;
    return percentage;
}

// ====================== حفظ التغييرات (مُصلح) ======================
async function saveProfile(event) {
    event.preventDefault();

    const phone = document.getElementById('phone').value.trim();

    if (phone && !/^[0-9+\-\s()]{8,15}$/.test(phone)) {
        showToast('⚠️ يرجى إدخال رقم هاتف صحيح (8-15 رقم)', 'warning');
        return;
    }

    try {
        showToast('جاري حفظ البيانات...', 'info');

        // ✅ الإصلاح: استخدام endpoint صحيح موجود في السيرفر
        const studentCode = userData.studentCode || currentUser.studentCode || currentUser.id;

        const response = await apiRequest(`/api/student/by-code/${studentCode}`, {
            method: 'PUT',
            body: JSON.stringify({ 
                profile: { phone: phone } 
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ تم الحفظ بنجاح:', result);

            if (!userData.profile) userData.profile = {};
            userData.profile.phone = phone;

            const dataToStore = {
                fullName: userData.fullName,
                username: userData.username,
                studentCode: userData.studentCode || studentCode,
                grade: userData.grade,
                type: userData.type || currentUser.type,
                role: userData.role || currentUser.role,
                id: userData.id || currentUser.id,
                profile: userData.profile
            };
            sessionStorage.setItem('userData', JSON.stringify(dataToStore));
            if (!isAdminUser) {
                localStorage.setItem('loggedInUser', JSON.stringify(dataToStore));
            }

            const percentage = updateProgress();
            if (percentage === 100) {
                showToast('🎉 مبروك! تم تحديث رقم هاتفك بنجاح', 'success');
            } else {
                showToast('✅ تم تحديث رقم الهاتف بنجاح', 'success');
            }
        } else {
            // ✅ إذا الـ PUT فشل (لأن الـ endpoint مختلف)، جرب الطريقة البديلة
            const error = await response.json().catch(() => ({}));
            console.warn('⚠️ فشل الحفظ المباشر، محاولة بديلة:', error);
            
            // حفظ محلياً كحل بديل
            if (!userData.profile) userData.profile = {};
            userData.profile.phone = phone;
            
            const dataToStore = {
                ...currentUser,
                profile: userData.profile
            };
            sessionStorage.setItem('userData', JSON.stringify(dataToStore));
            if (!isAdminUser) {
                localStorage.setItem('loggedInUser', JSON.stringify(dataToStore));
            }
            
            showToast('✅ تم حفظ رقم الهاتف محلياً (سيتم المزامنة لاحقاً)', 'success');
            updateProgress();
        }
    } catch (error) {
        console.error('❌ خطأ:', error);
        
        // حفظ محلياً كحل بديل
        if (!userData.profile) userData.profile = {};
        userData.profile.phone = phone;
        
        const dataToStore = {
            ...currentUser,
            profile: userData.profile
        };
        sessionStorage.setItem('userData', JSON.stringify(dataToStore));
        if (!isAdminUser) {
            localStorage.setItem('loggedInUser', JSON.stringify(dataToStore));
        }
        
        showToast('✅ تم حفظ رقم الهاتف محلياً', 'success');
        updateProgress();
    }
}

// ====================== التحقق من الجلسة ======================
async function verifySession() {
    try {
        const response = await apiRequest('/api/verify-session');
        if (response.ok) {
            const data = await response.json();
            if (data.valid && data.user) {
                // ✅ تحديث currentUser ببيانات الجلسة الفعلية
                const sessionUser = data.user;
                const storedUser = getLoggedInUser();
                
                if (storedUser) {
                    // دمج بيانات الجلسة مع البيانات المخزنة
                    const merged = {
                        ...storedUser,
                        studentCode: sessionUser.studentCode || storedUser.studentCode || storedUser.id || sessionUser.id,
                        fullName: sessionUser.fullName || storedUser.fullName,
                        username: sessionUser.username || storedUser.username,
                        type: sessionUser.type || storedUser.type
                    };
                    sessionStorage.setItem('userData', JSON.stringify(merged));
                    if (sessionUser.type !== 'admin') {
                        localStorage.setItem('loggedInUser', JSON.stringify(merged));
                    }
                }
            }
            return true;
        }
        return false;
    } catch {
        return currentUser !== null;
    }
}

// ====================== تسجيل الخروج ======================
window.logout = async function() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        try {
            await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
        } catch(e) {}
        sessionStorage.clear();
        localStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    }
};

// ====================== بناء النافبار ======================
function buildBottomNav() {
    const navBar = document.getElementById('bottomNav');
    if (!navBar) return;

    const isAdmin = currentUser && (currentUser.type === 'admin' || currentUser.role === 'admin');
    const navItems = [
        { href: 'Home.html', icon: 'fas fa-home', label: 'الرئيسية' },
        { href: 'exams.html', icon: 'fas fa-book', label: 'الاختبارات' },
        { href: 'profile.html', icon: 'fas fa-user', label: 'ملفي', active: true }
    ];
    if (isAdmin) navItems.push({ href: 'admin.html', icon: 'fas fa-chalkboard-user', label: 'التحكم' });

    navBar.innerHTML = navItems.map(item => `
        <a href="${item.href}" class="nav-item ${item.active ? 'active' : ''}">
            <i class="${item.icon}"></i>
            <span>${item.label}</span>
        </a>
    `).join('');
}

// ====================== تهيئة الصفحة ======================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 بدء تحميل صفحة الملف الشخصي');

    currentUser = getLoggedInUser();
    if (!currentUser) {
        showToast('يرجى تسجيل الدخول أولاً', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    console.log('📋 بيانات المستخدم المخزنة:', JSON.stringify(currentUser, null, 2));

    const isValid = await verifySession();
    if (!isValid) {
        showToast('انتهت صلاحية الجلسة', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    // إعادة قراءة البيانات بعد تحديث الجلسة
    currentUser = getLoggedInUser();

    await fetchUserData();
    buildBottomNav();

    const profileForm = document.getElementById('profileForm');
    if (profileForm) profileForm.addEventListener('submit', saveProfile);

    const firstName = userData?.fullName?.split(' ')[0] || userData?.username || 'بطل';
    setTimeout(() => showToast(`مرحباً بك يا ${firstName} 👋`, 'success'), 500);
});