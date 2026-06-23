// ====================== إعدادات السيرفر ======================
const BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    return '';
})();

console.log('🔌 BASE_URL:', BASE_URL || 'نفس السيرفر');

let usernameTimeout = null;

// ====================== دوال مساعدة ======================
function showToast(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
        error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
        info: 'linear-gradient(135deg, #d97706, #b45309)'
    };
    
    Toastify({
        text: message,
        duration: 3500,
        gravity: 'top',
        position: 'center',
        style: {
            background: colors[type] || colors.success,
            fontFamily: 'Tajawal, sans-serif',
            borderRadius: '50px',
            padding: '14px 28px',
            direction: 'rtl',
            fontWeight: '600',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        },
        stopOnFocus: true
    }).showToast();
}

// ====================== الروبوت الذكي المتحرك ======================
class LiveRobotAssistant {
    constructor() {
        this.robot = document.querySelector('.robot-character');
        this.speechBubble = document.getElementById('speechBubble');
        this.bubbleMsg = document.getElementById('bubbleMsg');
        this.screenMsg = document.getElementById('robotScreenMsg');
        this.leftArm = document.querySelector('.left-arm');
        this.rightArm = document.querySelector('.right-arm');
        this.eyes = document.querySelectorAll('.robot-eye');
        this.mouth = document.querySelector('.mouth-line');
        
        this.currentEmotion = 'happy';
        this.currentField = null;
        this.completedFields = [];
        
        this.fieldsOrder = [
            { id: 'fullName', name: 'الاسم الكامل', placeholder: 'مثال: أحمد محمد علي السيد' },
            { id: 'username', name: 'اسم المستخدم', placeholder: '3-20 حرف (حروف وأرقام)' },
            { id: 'password', name: 'كلمة المرور', placeholder: '6 أحرف على الأقل' },
            { id: 'grade', name: 'الصف الدراسي', placeholder: 'اختر من القائمة' },
            { id: 'studentCode', name: ' آخر 7 أرقام', placeholder: 'آخر 7 أرقام من البطاقة' },
            { id: 'phone', name: 'رقم الهاتف', placeholder: 'مثال: 01012345678' },
            { id: 'parentName', name: 'ولي الأمر', placeholder: 'اسم الأب أو الأم رباعياً' },
            { id: 'parentId', name: 'رقم بطاقة ولي الأمر', placeholder: '14 رقم' }
        ];
        
        this.init();
    }
    
    init() {
        this.startWalking();
        this.attachFieldEvents();
        this.startGuidance();
        this.startAutoTips();
        
        setTimeout(() => {
            this.speak('👋 مرحباً! أنا مساعدك الذكي، سأساعدك في إنشاء حسابك خطوة بخطوة! ✨');
            this.wave();
        }, 1000);
        
        console.log('🤖 Live Robot Assistant initialized');
    }
    
    startWalking() {
        // حركة المشي المستمرة
        setInterval(() => {
            if (this.currentEmotion !== 'angry') {
                const legs = document.querySelectorAll('.robot-leg');
                legs.forEach((leg, i) => {
                    leg.style.animation = 'none';
                    setTimeout(() => {
                        leg.style.animation = `legWalk 0.5s ${i === 1 ? '0.25s' : '0s'} infinite`;
                    }, 10);
                });
            }
        }, 100);
    }
    
    attachFieldEvents() {
        this.fieldsOrder.forEach((field, index) => {
            const element = document.getElementById(field.id);
            if (!element) return;
            
            element.addEventListener('focus', () => this.onFieldFocus(field, index));
            element.addEventListener('blur', () => this.onFieldBlur(field));
            element.addEventListener('input', (e) => this.onFieldInput(field, e.target.value));
        });
        
        // إضافة حدث لحقل الصف
        const gradeField = document.getElementById('grade');
        if (gradeField) {
            gradeField.addEventListener('change', (e) => {
                const gradeNames = { first: 'الأول الثانوي', second: 'الثاني الثانوي', third: 'الثالث الثانوي' };
                this.speak(`📚 تم اختيار الصف ${gradeNames[e.target.value]}`);
                this.celebrate();
            });
        }
        
        // زر الإرسال
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('mouseenter', () => this.pointTo(submitBtn, 'اضغط هنا لإنشاء الحساب بعد إكمال البيانات ✅'));
        }
    }
    
    onFieldFocus(field, index) {
        this.currentField = field.id;
        this.highlightField(field.id);
        this.pointToField(field.id);
        
        // رسائل إرشادية حسب الحقل
        const messages = {
            fullName: '✏️ أدخل اسمك الكامل رباعياً (الاسم الأول - الأب - الجد - العائلة)',
            username: '🔤 اختر اسم مستخدم فريد وسهل التذكر (حروف إنجليزية وأرقام فقط)',
            password: '🔒 كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل، استخدم مزيجاً من الحروف والأرقام',
            grade: '🎓 اختر صفك الدراسي من القائمة المنسدلة',
            studentCode: '🆔 أدخل آخر 7 أرقام من بطاقتك الشخصية أو شهادة الميلاد',
            phone: '📱 أدخل رقم هاتفك المحمول (واتساب) للتواصل',
            parentName: '👨‍👩‍👧 أدخل اسم ولي الأمر رباعياً (الأب أو الأم)',
            parentId: '💳 أدخل رقم بطاقة ولي الأمر (14 رقم)'
        };
        
        if (messages[field.id]) {
            this.speak(messages[field.id]);
            this.wave();
        }
        
        // تغيير تعبير الروبوت
        this.setEmotion('helpful');
        
        // تمرير الصفحة للحقل
        const element = document.getElementById(field.id);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    onFieldBlur(field) {
        const element = document.getElementById(field.id);
        const value = element?.value?.trim();
        
        if (value && this.validateField(field.id, value)) {
            if (!this.completedFields.includes(field.id)) {
                this.completedFields.push(field.id);
                this.speak(`✓ ممتاز! تم إدخال ${field.name} بنجاح 🎯`);
                this.celebrate();
                this.updateProgress();
            }
            this.removeHighlight(field.id);
            this.setEmotion('happy');
        } else if (value && !this.validateField(field.id, value)) {
            this.getAngry(field);
        }
    }
    
    onFieldInput(field, value) {
        if (!value) return;
        
        // نصائح فورية أثناء الكتابة
        if (field.id === 'password' && value.length > 0) {
            if (value.length < 4) {
                this.speak('⚠️ كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل', 2000);
                this.setEmotion('worried');
            } else if (value.length >= 6) {
                this.speak('✓ كلمة مرور جيدة! ✅', 1500);
                this.setEmotion('happy');
            }
        }
        
        if (field.id === 'studentCode' && value.length === 7) {
            this.speak('✓ تم إدخال اخر7 ارقام من البطاقة بالكامل! 🎉');
            this.celebrate();
        }
        
        if (field.id === 'parentId' && value.length === 14) {
            this.speak('✓ رقم بطاقة ولي الأمر صحيح! 📇');
            this.celebrate();
        }
        
        if (field.id === 'username' && value.length >= 3) {
            this.checkUsernameAsync(value);
        }
    }
    
    validateField(fieldId, value) {
        const validations = {
            fullName: () => value.length >= 10 && value.split(' ').length >= 3,
            username: () => value.length >= 3 && /^[a-zA-Z0-9_]+$/.test(value),
            password: () => value.length >= 6,
            studentCode: () => value.length >= 5 && value.length <= 7 && /^\d+$/.test(value),
            phone: () => value.length >= 10 && value.length <= 15 && /^\d+$/.test(value),
            parentName: () => value.length >= 10 && value.split(' ').length >= 3,
            parentId: () => value.length >= 10 && value.length <= 14 && /^\d+$/.test(value),
            grade: () => true
        };
        
        const validator = validations[fieldId];
        return validator ? validator() : true;
    }
    
    async checkUsernameAsync(username) {
        try {
            const url = `${BASE_URL}/api/check-username?username=${encodeURIComponent(username)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            const statusDiv = document.getElementById('usernameStatus');
            if (!result.available) {
                statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> غير متاح';
                statusDiv.className = 'username-status unavailable';
                this.speak('❌ اسم المستخدم غير متاح، اختر اسماً آخر', 3000);
                this.getAngry({ id: 'username' });
            } else {
                statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> متاح';
                statusDiv.className = 'username-status available';
            }
        } catch (error) {
            console.error('Username check error:', error);
        }
    }
    
    updateProgress() {
        const total = this.fieldsOrder.length;
        const completed = this.completedFields.length;
        const percentage = Math.round((completed / total) * 100);
        
        if (percentage === 100) {
            this.speak('🎉 رائع! أكملت جميع الحقول! اضغط على زر "إنشاء الحساب" الآن');
            this.dance();
        } else if (percentage > 50) {
            this.speak(`📊 تقدمك: ${percentage}%، تبقى ${total - completed} حقول، أنت قريب جداً! 💪`);
        }
    }
    
    highlightField(fieldId) {
        const element = document.getElementById(fieldId);
        if (element) {
            element.style.transition = 'all 0.3s';
            element.style.borderColor = '#667eea';
            element.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
        }
    }
    
    removeHighlight(fieldId) {
        const element = document.getElementById(fieldId);
        if (element) {
            element.style.borderColor = '';
            element.style.boxShadow = '';
        }
    }
    
    pointToField(fieldId) {
        const element = document.getElementById(fieldId);
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const robotRect = this.robot?.getBoundingClientRect();
        
        if (robotRect) {
            // تحريك الذراع للإشارة
            if (this.rightArm) {
                this.rightArm.style.transform = 'rotate(-45deg) scale(1.2)';
                setTimeout(() => {
                    this.rightArm.style.transform = '';
                }, 1000);
            }
        }
    }
    
    pointTo(element, message) {
        this.speak(message);
        if (this.rightArm) {
            this.rightArm.style.transform = 'rotate(-45deg) scale(1.2)';
            setTimeout(() => {
                this.rightArm.style.transform = '';
            }, 1000);
        }
    }
    
    getAngry(field) {
        this.setEmotion('angry');
        
        // هز الحقل
        const element = document.getElementById(field.id);
        if (element) {
            element.classList.add('field-error');
            setTimeout(() => element.classList.remove('field-error'), 500);
        }
        
        // رسائل الغضب حسب الحقل
        const angryMessages = {
            fullName: '😠 الاسم الكامل يجب أن يكون 4 كلمات على الأقل!',
            username: '😠 اسم المستخدم يجب أن يكون 3-20 حرف (حروف وأرقام فقط)!',
            password: '😠 كلمة المرور قصيرة جداً! استخدم 6 أحرف على الأقل!',
            studentCode: '😠 آخر 7 أرقام من البطاقة يجب ان يكون 7 أرقام!',
            phone: '😠 رقم الهاتف غير صحيح! أدخل 10-15 رقم!',
            parentName: '😠 اسم ولي الأمر يجب أن يكون 4 كلمات على الأقل!',
            parentId: '😠 رقم بطاقة ولي الأمر يجب أن يكون 10-14 رقم!'
        };
        
        if (angryMessages[field.id]) {
            this.speak(angryMessages[field.id]);
        }
        
        setTimeout(() => this.setEmotion('normal'), 2000);
    }
    
    setEmotion(emotion) {
        this.currentEmotion = emotion;
        
        switch(emotion) {
            case 'happy':
                if (this.mouth) this.mouth.style.width = '30px';
                if (this.mouth) this.mouth.style.height = '4px';
                this.wave();
                break;
            case 'angry':
                if (this.mouth) this.mouth.style.width = '20px';
                if (this.mouth) this.mouth.style.height = '6px';
                if (this.mouth) this.mouth.style.background = '#ff4757';
                this.shake();
                break;
            case 'worried':
                if (this.mouth) this.mouth.style.width = '15px';
                break;
            case 'helpful':
                if (this.mouth) this.mouth.style.width = '25px';
                this.pointRandom();
                break;
            default:
                if (this.mouth) this.mouth.style.width = '25px';
                if (this.mouth) this.mouth.style.height = '3px';
                if (this.mouth) this.mouth.style.background = 'white';
        }
    }
    
    speak(message, duration = 4000) {
        this.bubbleMsg.textContent = message;
        this.screenMsg.textContent = message.substring(0, 15) + (message.length > 15 ? '..' : '');
        
        this.speechBubble.classList.remove('show');
        setTimeout(() => {
            this.speechBubble.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            this.speechBubble.classList.remove('show');
        }, duration);
    }
    
    wave() {
        if (this.leftArm) {
            this.leftArm.style.transform = 'rotate(-30deg)';
            setTimeout(() => {
                this.leftArm.style.transform = '';
            }, 500);
        }
        if (this.rightArm) {
            this.rightArm.style.transform = 'rotate(30deg)';
            setTimeout(() => {
                this.rightArm.style.transform = '';
            }, 500);
        }
    }
    
    shake() {
        const robot = this.robot;
        if (robot) {
            robot.style.animation = 'none';
            setTimeout(() => {
                robot.style.animation = 'robotFloat 0.1s infinite';
            }, 10);
            setTimeout(() => {
                robot.style.animation = 'robotFloat 3s ease-in-out infinite';
            }, 500);
        }
    }
    
    celebrate() {
        this.setEmotion('happy');
        this.wave();
        // إنشاء جسيمات احتفالية
        this.createParticles();
    }
    
    dance() {
        const robot = this.robot;
        if (robot) {
            robot.style.animation = 'none';
            setTimeout(() => {
                robot.style.animation = 'robotFloat 0.15s infinite';
            }, 10);
            setTimeout(() => {
                robot.style.animation = 'robotFloat 3s ease-in-out infinite';
            }, 1500);
        }
        this.wave();
    }
    
    pointRandom() {
        if (this.rightArm) {
            this.rightArm.style.transform = 'rotate(-40deg)';
            setTimeout(() => {
                this.rightArm.style.transform = '';
            }, 800);
        }
    }
    
    createParticles() {
        const particleContainer = document.createElement('div');
        particleContainer.style.position = 'fixed';
        particleContainer.style.bottom = '100px';
        particleContainer.style.right = '100px';
        particleContainer.style.pointerEvents = 'none';
        particleContainer.style.zIndex = '10002';
        
        for (let i = 0; i < 5; i++) {
            const particle = document.createElement('div');
            particle.innerHTML = ['✨', '⭐', '💫', '🌟', '🎉'][Math.floor(Math.random() * 5)];
            particle.style.position = 'absolute';
            particle.style.fontSize = '20px';
            particle.style.animation = `particleFloat${i} 1s ease-out forwards`;
            particle.style.left = Math.random() * 100 + 'px';
            particle.style.top = Math.random() * 50 + 'px';
            particleContainer.appendChild(particle);
            
            const keyframes = `
                @keyframes particleFloat${i} {
                    0% { transform: translateY(0) scale(1); opacity: 1; }
                    100% { transform: translateY(-80px) scale(0); opacity: 0; }
                }
            `;
            const style = document.createElement('style');
            style.textContent = keyframes;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(particleContainer);
        setTimeout(() => particleContainer.remove(), 1000);
    }
    
    startGuidance() {
        let stepIndex = 0;
        
        const guideInterval = setInterval(() => {
            if (stepIndex >= this.fieldsOrder.length) {
                clearInterval(guideInterval);
                return;
            }
            
            const field = this.fieldsOrder[stepIndex];
            const element = document.getElementById(field.id);
            
            if (element && !this.completedFields.includes(field.id) && !element.value) {
                this.speak(`📌 الحقل التالي: ${field.name}\n${field.placeholder}`, 4500);
                this.highlightField(field.id);
                this.pointToField(field.id);
                stepIndex++;
            } else if (this.completedFields.includes(field.id)) {
                stepIndex++;
            }
        }, 10000);
    }
    
    startAutoTips() {
        const tips = [
            '💡 تذكر: اسم المستخدم وكلمة المرور هما مفتاح دخولك للنظام',
            '📚 يمكنك تغيير كلمة المرور لاحقاً من صفحة الملف الشخصي',
            '👨‍👩‍👧 ولي الأمر يمكنه متابعة درجاتك وحضورك',
            '🎓 اختيار الصف الدراسي يحدد المواد المتاحة لك'
        ];
        
        let tipIndex = 0;
        setInterval(() => {
            if (document.visibilityState === 'visible' && !this.speechBubble.classList.contains('show')) {
                this.speak(tips[tipIndex % tips.length], 4000);
                tipIndex++;
            }
        }, 30000);
    }
}

// ====================== التحقق من توفر اسم المستخدم ======================
async function checkUsernameAvailability(username) {
    if (!username || username.length < 3) {
        const statusDiv = document.getElementById('usernameStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '';
            statusDiv.className = 'username-status';
        }
        return false;
    }
    
    try {
        const url = `${BASE_URL}/api/check-username?username=${encodeURIComponent(username)}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        const statusDiv = document.getElementById('usernameStatus');
        
        if (result.available) {
            statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> اسم المستخدم متاح';
            statusDiv.className = 'username-status available';
            return true;
        } else {
            statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> اسم المستخدم مستخدم بالفعل';
            statusDiv.className = 'username-status unavailable';
            return false;
        }
    } catch (error) {
        console.error('خطأ في التحقق:', error);
        return true;
    }
}

// ====================== التحقق من صحة البيانات ======================
function validateForm(fullName, username, password, studentCode, phone, parentName, parentId) {
    if (!fullName || fullName.trim().length < 10) {
        showToast('⚠️ الاسم الكامل يجب أن يكون 4 كلمات على الأقل', 'error');
        return false;
    }
    if (!username || username.length < 3 || username.length > 20) {
        showToast('⚠️ اسم المستخدم يجب أن يكون بين 3 و 20 حرفاً', 'error');
        return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('⚠️ اسم المستخدم يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام و _', 'error');
        return false;
    }
    if (!password || password.length < 6) {
        showToast('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return false;
    }
    if (!studentCode || studentCode.length < 5 || studentCode.length > 7) {
        showToast('⚠️ اخر 7 ارقام من البطاقة يجب أن يكون 7 أرقام', 'error');
        return false;
    }
    if (!phone || phone.length < 10 || phone.length > 15) {
        showToast('⚠️ رقم الهاتف غير صحيح (10-15 رقم)', 'error');
        return false;
    }
    if (!parentName || parentName.trim().length < 10) {
        showToast('⚠️ اسم ولي الأمر يجب أن يكون 4 كلمات على الأقل', 'error');
        return false;
    }
    if (!parentId || parentId.length < 10 || parentId.length > 14) {
        showToast('⚠️ رقم بطاقة ولي الأمر غير صحيح (10-14 رقم)', 'error');
        return false;
    }
    return true;
}

// ====================== إنشاء الحساب ======================
async function createAccount(event) {
    event.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const grade = document.getElementById('grade').value;
    const studentCode = document.getElementById('studentCode').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const parentName = document.getElementById('parentName').value.trim();
    const parentId = document.getElementById('parentId').value.trim();
    
    if (!validateForm(fullName, username, password, studentCode, phone, parentName, parentId)) {
        if (window.liveRobot) window.liveRobot.getAngry({ id: 'fullName' });
        return;
    }
    
    const isAvailable = await checkUsernameAvailability(username);
    if (!isAvailable) {
        showToast('❌ اسم المستخدم غير متاح', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';
    
    try {
        const url = `${BASE_URL}/api/students/register`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, username, password, grade, studentCode, phone, parentName, parentId })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            if (window.liveRobot) window.liveRobot.celebrate();
         showToast('🎉 تم إنشاء الحساب بنجاح! جاري تحويلك...', 'success');
// ✅ تخزين علامة في sessionStorage عشان login.html يعرف إن المستخدم جاي من التسجيل
sessionStorage.setItem('fromSignup', 'true');
setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            showToast(result.error || '❌ فشل إنشاء الحساب', 'error');
        }
    } catch (error) {
        showToast(`❌ خطأ في الاتصال: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// ====================== إعداد المستمعين ======================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 صفحة إنشاء الحساب');
    
    const usernameInput = document.getElementById('username');
    const signupForm = document.getElementById('signupForm');
    
    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            if (usernameTimeout) clearTimeout(usernameTimeout);
            const username = e.target.value.trim().toLowerCase();
            if (username.length >= 3) {
                usernameTimeout = setTimeout(() => checkUsernameAvailability(username), 500);
            }
        });
    }
    
    // منع الأرقام في حقول الأسماء
    ['fullName', 'parentName'].forEach(field => {
        const input = document.getElementById(field);
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[0-9]/g, '');
            });
        }
    });
    
    // منع الحروف في الأرقام
    const studentCodeInput = document.getElementById('studentCode');
    if (studentCodeInput) {
        studentCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 7);
        });
    }
    
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 15);
        });
    }
    
    const parentIdInput = document.getElementById('parentId');
    if (parentIdInput) {
        parentIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 14);
        });
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', createAccount);
    }
    
    // تشغيل الروبوت
    setTimeout(() => {
        window.liveRobot = new LiveRobotAssistant();
    }, 500);
});
