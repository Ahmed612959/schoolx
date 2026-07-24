// ====================== 🔐 biometric.js ======================
// منطق "رسالة تفعيل الدخول بالبصمة" - ملف مستقل يتحمّل في login.html و Home.html و admin.html
// (بعد webauthn-lib.js). لازم يتحمل بعد أي صفحة تعرّف فيها الدوال دي بالفعل (auth.js في حالة
// login.html/admin.html) عشان الـ fallback مايكتبش فوق نسخة الصفحة.

// دوال احتياطية (fallback) لو الصفحة مفيهاش نسخة منها أصلاً (مثل Home.html)
if (typeof window.getLoggedInUser !== 'function') {
    window.getLoggedInUser = function () {
        const userStr = sessionStorage.getItem('userData');
        if (!userStr) return null;
        try { return JSON.parse(userStr); } catch { return null; }
    };
}

if (typeof window.showToastMessage !== 'function') {
    window.showToastMessage = function (message, type = 'success') {
        if (typeof Toastify !== 'undefined') {
            const colors = {
                success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
                error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
                info: 'linear-gradient(135deg, #d97706, #b45309)'
            };
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
                    fontWeight: '600'
                }
            }).showToast();
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type === 'error' ? 'error' : 'success');
        } else {
            console.log(message);
        }
    };
}

// ====================== ✅ Popup لتفعيل البصمة بعد تسجيل الدخول ======================
function showBiometricEnrollmentPopup(userData) {
    // إزالة أي popup سابق
    const existingPopup = document.getElementById('biometricEnrollmentPopup');
    if (existingPopup) existingPopup.remove();
    
    const popup = document.createElement('div');
    popup.id = 'biometricEnrollmentPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);animation:fadeIn 0.3s ease;';
    
    popup.innerHTML = `
        <div style="background:white;border-radius:24px;padding:30px;max-width:440px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:popupSlide 0.4s ease;">
            <div style="font-size:60px;margin-bottom:15px;">🔐</div>
            <h3 style="color:#1a4f6e;margin-bottom:10px;font-size:1.3rem;font-family:'Tajawal',sans-serif;">تفعيل الدخول بالبصمة؟</h3>
            <p style="color:#64748b;font-size:0.95rem;margin-bottom:25px;line-height:1.6;font-family:'Tajawal',sans-serif;">
                مرحباً <strong>${userData.fullName || userData.username}</strong>! 👋<br>
                يمكنك تسجيل بصمتك لتسجيل الدخول بسرعة في المرات القادمة
            </p>
            <div style="background:#f0f9ff;border-radius:12px;padding:15px;margin-bottom:20px;border:1px solid #bae6fd;">
                <p style="color:#0369a1;font-size:0.85rem;margin:0;font-family:'Tajawal',sans-serif;">
                    💡 <strong>ميزة:</strong> الدخول ببصمة الإصبع أو Face ID في ثانيتين فقط!
                </p>
            </div>
            <div style="display:flex;gap:10px;flex-direction:column;">
                <button id="enrollBiometricBtn" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;padding:14px 24px;border-radius:50px;font-weight:700;cursor:pointer;font-family:'Tajawal',sans-serif;font-size:1rem;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.3s;">
                    <i class="fas fa-fingerprint"></i> نعم، فعّل البصمة
                </button>
                <button id="skipBiometricBtn" style="background:#f0f0f0;color:#666;border:none;padding:12px 24px;border-radius:50px;font-weight:600;cursor:pointer;font-family:'Tajawal',sans-serif;font-size:0.9rem;transition:all 0.3s;">
                    لاحقاً
                </button>
                <button id="neverShowBiometricBtn" style="background:transparent;color:#999;border:none;padding:8px;cursor:pointer;font-family:'Tajawal',sans-serif;font-size:0.8rem;">
                    لا تظهر لي مرة أخرى
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // حفظ بيانات المستخدم للاستخدام لاحقاً
    window.pendingUserData = userData;
    
    // إضافة الأحداث
    document.getElementById('enrollBiometricBtn').addEventListener('click', enrollBiometricFromPopup);
    document.getElementById('skipBiometricBtn').addEventListener('click', () => {
        markBiometricPrompted(userData.username);
        closeBiometricPopup();
    });
    document.getElementById('neverShowBiometricBtn').addEventListener('click', () => {
        markBiometricPrompted(userData.username);
        closeBiometricPopup();
    });
    
    // إغلاق عند النقر خارج الـ popup
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            markBiometricPrompted(userData.username);
            closeBiometricPopup();
        }
    });
}

// ====================== ✅ تفعيل البصمة من الـ Popup ======================
async function enrollBiometricFromPopup() {
    const userData = window.pendingUserData;
    if (!userData) return;
    
    const popup = document.getElementById('biometricEnrollmentPopup');
    const button = document.getElementById('enrollBiometricBtn');
    
    if (!button) return;
    
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ضع إصبعك على المستشعر...';
    button.disabled = true;
    button.style.opacity = '0.7';
    
    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        
        // 1. بدء تسجيل البصمة
        const startRes = await fetch(`${BASE_URL}/api/biometric/register-start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        const startData = await startRes.json();
        
        if (!startData.success) {
            throw new Error(startData.error || 'فشل بدء التسجيل');
        }
        
        // 2. التأكد إن الجهاز فعلاً بيدعم مصادقة بيومترية (بصمة/Face ID)
        if (!window.SimpleWebAuthnBrowser || !SimpleWebAuthnBrowser.browserSupportsWebAuthn()) {
            throw new Error('الجهاز أو المتصفح ده مش بيدعم البصمة');
        }
        const platformAvailable = await SimpleWebAuthnBrowser.platformAuthenticatorIsAvailable();
        if (!platformAvailable) {
            throw new Error('مفيش بصمة أو Face ID متاح على الجهاز ده');
        }
        
        // 3. طلب البصمة من المستخدم (المكتبة بتتولى كل تحويلات base64url تلقائيًا)
        let attResp;
        try {
            attResp = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: startData.options });
        } catch (err) {
            if (err.name === 'NotAllowedError') throw new Error('تم إلغاء العملية');
            if (err.name === 'InvalidStateError') throw new Error('البصمة مسجلة مسبقاً على هذا الجهاز');
            throw err;
        }
        
        // 4. إرسال البصمة للسيرفر
        const finishRes = await fetch(`${BASE_URL}/api/biometric/register-finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential: attResp })
        });
        
        const finishData = await finishRes.json();
        
        if (finishData.success) {
            button.innerHTML = '<i class="fas fa-check-circle"></i> تم التفعيل بنجاح!';
            button.style.background = 'linear-gradient(135deg, #2d6a4f, #1b4d3b)';
            button.style.opacity = '1';
            
            showToastMessage('🎉 تم تفعيل البصمة بنجاح!', 'success');
            markBiometricPrompted(userData.username);
            
            // إغلاق الـ popup بعد ثانية ونصف - من غير أي تنقل، إحنا أصلاً في الصفحة الصح
            setTimeout(() => {
                popup.remove();
            }, 1500);
        } else {
            throw new Error(finishData.error || 'فشل تسجيل البصمة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل البصمة:', error);
        
        // عرض رسالة الخطأ
        button.innerHTML = '<i class="fas fa-times"></i> فشل - حاول مرة أخرى';
        button.style.background = '#dc3545';
        button.style.opacity = '1';
        
        showToastMessage('❌ ' + (error.message || 'فشل تسجيل البصمة'), 'error');
        
        // إعادة الزر لحالته الأصلية بعد 2 ثانية
        setTimeout(() => {
            button.innerHTML = '<i class="fas fa-fingerprint"></i> نعم، فعّل البصمة';
            button.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
            button.disabled = false;
        }, 2000);
    }
}

// ====================== ✅ إغلاق الـ Popup ======================
function closeBiometricPopup() {
    const popup = document.getElementById('biometricEnrollmentPopup');
    if (popup) {
        popup.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => popup.remove(), 300);
    }
}

// ====================== ✅ تسجيل إن الرسالة اتعرضت لهذا المستخدم - عشان متتكررش على أي صفحة ======================
function markBiometricPrompted(username) {
    if (username) localStorage.setItem('biometricPrompted_' + username, 'true');
}

// ====================== ✅ نقطة الدخول: تُستدعى من Home.js و admin.js بعد التأكد من الجلسة ======================
async function initBiometricPrompt() {
    const userData = getLoggedInUser();
    if (!userData || !userData.username) return;

    // ✅ لو الرسالة ظهرت قبل كده لنفس المستخدم (في أي صفحة: admin أو Home) - متتكررش
    if (localStorage.getItem('biometricPrompted_' + userData.username)) return;

    // ✅ لازم الجهاز يدعم بصمة/Face ID فعليًا (مش مجرد دعم WebAuthn العام)
    if (!window.SimpleWebAuthnBrowser || !SimpleWebAuthnBrowser.browserSupportsWebAuthn()) return;
    const platformAvailable = await SimpleWebAuthnBrowser.platformAuthenticatorIsAvailable().catch(() => false);
    if (!platformAvailable) return;

    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        const res = await fetch(`${BASE_URL}/api/biometric/check/${encodeURIComponent(userData.username)}`);
        const data = await res.json();

        if (data.hasBiometric) {
            // مسجل بصمة بالفعل من قبل - منعرضش تاني أبدًا
            markBiometricPrompted(userData.username);
            return;
        }
    } catch (e) {
        return; // الفحص فشل - منضايقش المستخدم، هنحاول تاني المرة الجاية
    }

    showBiometricEnrollmentPopup(userData);
}
window.initBiometricPrompt = initBiometricPrompt;

// ====================== ✅ CSS للـ Popup ======================
(function addBiometricPopupStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        @keyframes popupSlide {
            from { 
                opacity: 0; 
                transform: translateY(-30px) scale(0.9); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
            }
        }
        
        #biometricEnrollmentPopup button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        #biometricEnrollmentPopup button:disabled {
            cursor: not-allowed;
        }
        
        #neverShowBiometricBtn:hover {
            color: #666;
            text-decoration: underline;
        }
        
        @media (max-width: 480px) {
            #biometricEnrollmentPopup > div {
                padding: 20px !important;
                max-width: 95% !important;
            }
            
            #biometricEnrollmentPopup h3 {
                font-size: 1.1rem !important;
            }
            
            #biometricEnrollmentPopup p {
                font-size: 0.85rem !important;
            }
        }
    `;
    document.head.appendChild(style);
})();
