// auth.js - النسخة الآمنة مع حماية قصوى

function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function saveCsrfToken(token) {
    sessionStorage.setItem('csrfToken', token);
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

function saveUserData(user) {
    sessionStorage.setItem('userData', JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem('csrfToken');
    sessionStorage.removeItem('userData');
}

// ====================== الحماية القصوى ======================

// 1. منع فتح أدوات المطور بجميع الطرق
(function ultimateProtection() {
    // منع F12 وكل اختصارات المطور
    document.addEventListener('keydown', function(e) {
        // قائمة جميع الاختصارات الممنوعة
        const forbiddenKeys = ['F12', 'F11', 'F10', 'F9', 'F8', 'F7', 'F6', 'F5'];
        const forbiddenCombos = [
            { ctrl: true, shift: true, key: 'I' },
            { ctrl: true, shift: true, key: 'J' },
            { ctrl: true, shift: true, key: 'C' },
            { ctrl: true, key: 'U' },
            { ctrl: true, key: 'S' },
            { ctrl: true, key: 'P' },
            { ctrl: true, shift: true, key: 'R' },
            { ctrl: true, shift: true, key: 'E' },
            { ctrl: true, key: 'O' },
            { ctrl: true, shift: true, key: 'K' },
            { metaKey: true, altKey: true, key: 'I' },
            { metaKey: true, altKey: true, key: 'C' },
            { ctrlKey: true, shiftKey: true, keyCode: 73 },
            { ctrlKey: true, shiftKey: true, keyCode: 74 },
            { ctrlKey: true, shiftKey: true, keyCode: 67 },
            { ctrlKey: true, keyCode: 85 }
        ];
        
        // منع المفاتيح المفردة
        if (forbiddenKeys.includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        
        // منع المجموعات
        for (let combo of forbiddenCombos) {
            if ((!combo.ctrl || e.ctrlKey) &&
                (!combo.shift || e.shiftKey) &&
                (!combo.alt || e.altKey) &&
                (!combo.metaKey || e.metaKey) &&
                (e.key === combo.key || e.keyCode === combo.keyCode)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }
    });
    
    // منع النقر بزر الماوس الأيمن
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    });
    
    // منع تحديد النص ونسخه
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('copy', function(e) {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('cut', function(e) {
        e.preventDefault();
        return false;
    });
    
    // منع السحب
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    // منع حفظ الصفحة
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            return false;
        }
    });
    

    
    // كشف فتح أدوات المطور
    let devToolsOpenCount = 0;
    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function() {
            devToolsOpenCount++;
            if (devToolsOpenCount > 3) {
                document.body.innerHTML = `
                    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Tajawal,monospace;">
                        <i class="fas fa-shield-alt" style="font-size:80px;color:#d4af37;margin-bottom:20px;"></i>
                        <h2 style="color:#1a4f6e;">🔒 تم تعطيل أدوات المطور</h2>
                        <p style="color:#64748b;margin-top:10px;">الرجاء إغلاق أدوات المطور للمتابعة</p>
                        <button onclick="location.reload()" style="margin-top:20px;padding:10px 30px;background:#d4af37;border:none;border-radius:25px;cursor:pointer;">إعادة تحميل الصفحة</button>
                    </div>
                `;
                document.body.style.overflow = 'hidden';
            }
        }
    });
    
    // كشف متقدم لفتح DevTools
    setInterval(function() {
        const start = performance.now();
        debugger;
        const end = performance.now();
        if (end - start > 100) {
            devToolsOpenCount++;
            if (devToolsOpenCount > 3) {
                document.body.innerHTML = `
                    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Tajawal,monospace;">
                        <i class="fas fa-shield-alt" style="font-size:80px;color:#d4af37;margin-bottom:20px;"></i>
                        <h2 style="color:#1a4f6e;">🚫 تم اكتشاف أدوات المطور</h2>
                        <p style="color:#64748b;margin-top:10px;">تم تعطيل الصفحة للحماية</p>
                        <button onclick="location.reload()" style="margin-top:20px;padding:10px 30px;background:#d4af37;border:none;border-radius:25px;cursor:pointer;">إعادة تحميل الصفحة</button>
                    </div>
                `;
                document.body.style.overflow = 'hidden';
            }
        }
    }, 500);
    
    // منع محاولات فتح View Source
    const preventViewSource = function(e) {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.key === 'u') || 
            (e.ctrlKey && e.key === 'U') ||
            (e.ctrlKey && e.shiftKey && e.key === 'I')) {
            e.preventDefault();
            return false;
        }
    };
    document.addEventListener('keydown', preventViewSource);
    
    // منع فتح الـ Console من خلال قائمة المطور
    window.addEventListener('load', function() {
        // إخفاء أي محاولة لفتح الـ Console
        setInterval(function() {
            if (window.devtools && window.devtools.open) {
                document.body.innerHTML = `
                    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Tajawal,monospace;">
                        <i class="fas fa-shield-alt" style="font-size:80px;color:#d4af37;margin-bottom:20px;"></i>
                        <h2 style="color:#1a4f6e;">🔒 تم تعطيل أدوات المطور</h2>
                        <p style="color:#64748b;">الرجاء إغلاق أدوات المطور للمتابعة</p>
                    </div>
                `;
            }
        }, 1000);
    });
    
    // منع dragging الصور
    document.querySelectorAll('img').forEach(img => {
        img.setAttribute('draggable', 'false');
        img.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
    });
    
    // منع حفظ الصفحة كصورة
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
            e.preventDefault();
            return false;
        }
    });
    
    console.log('🛡️ الحماية القصوى مفعلة');
})();

// ====================== تسجيل الدخول ======================
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn?.innerHTML || 'تسجيل الدخول';

        if (!username || !password) {
            showToastMessage('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور!', 'error');
            return;
        }

        if (submitBtn) {
            submitBtn.innerHTML = '⏳ جاري...';
            submitBtn.disabled = true;
        }

        try {
            const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.csrfToken) saveCsrfToken(data.csrfToken);
                if (data.user) saveUserData(data.user);
                
                showToastMessage(`🎉 مرحباً ${data.user?.fullName || username}!`, 'success');
                
                setTimeout(() => {
                    if (data.user?.type === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'Home.html';
                    }
                }, 1000);
            } else {
                showToastMessage(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة!', 'error');
            }
        } catch (err) {
            console.error('Login Error:', err);
            showToastMessage('❌ فشل الاتصال بالخادم! تأكد من تشغيل السيرفر', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    });
});

// دالة عرض الإشعارات المتوافقة مع الحماية
function showToastMessage(message, type = 'success') {
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
    } else {
        alert(message);
    }
}

// تجديد الجلسة
async function refreshSession() {
    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        const response = await fetch(`${BASE_URL}/api/refresh-token`, {
            method: 'POST',
            credentials: 'include'
        });
        return response.ok;
    } catch {
        return false;
    }
}

// تسجيل الخروج
window.logout = async function() {
    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        await fetch(`${BASE_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch(e) {}
    
    clearSession();
    window.location.href = 'login.html';
};

// ====================== الروبوت الذكي المتطور ======================

class AdvancedRobot {
    constructor() {
        // حالة الروبوت
        this.state = {
            isActive: true,
            currentMood: 'happy',
            interactionCount: 0,
            userBehavior: {
                firstVisit: !localStorage.getItem('robot_visited'),
                visitCount: parseInt(localStorage.getItem('robot_visits')) || 0,
                lastInteraction: localStorage.getItem('robot_last_interaction') || null,
                completedSteps: JSON.parse(localStorage.getItem('robot_completed_steps') || '[]'),
                mistakesCount: 0,
                averageResponseTime: 0
            }
        };
        
        // DOM elements
        this.robot = document.querySelector('.robot');
        this.speechBubble = document.querySelector('.speech-bubble');
        this.bubbleText = document.getElementById('bubbleText');
        this.screenText = document.getElementById('robotSpeech');
        this.robotContainer = document.querySelector('.robot-container');
        
        // قاعدة المعرفة والرسائل الذكية
        this.knowledgeBase = {
            greetings: ['مرحباً', 'أهلاً بك', 'سلام عليكم', 'يا هلا'],
            encouragements: ['ممتاز!', 'رائع!', 'أحسنت!', 'مذهل!', 'استمر!'],
            tips: {
                username: [
                    '📝 اسم المستخدم يجب أن يكون فريداً',
                    '💡 استخدم اسم سهل التذكر',
                    '🔐 احتفظ باسم المستخدم في مكان آمن'
                ],
                password: [
                    '🔒 استخدم كلمة مرور قوية تحتوي على أرقام وحروف',
                    '⚠️ لا تشارك كلمة المرور مع أي شخص',
                    '🔄 غير كلمة المرور كل 3 أشهر للأمان'
                ],
                general: [
                    '🎯 يمكنك الوصول للنتائج من القائمة الرئيسية',
                    '📚 استخدم مكتبة الملفات للوصول للمحاضرات',
                    '💬 اسأل المساعد الذكي عن أي شيء',
                    '⭐ قيم التطبيق لمساعدتنا على التحسين'
                ]
            }
        };
        
        // الذاكرة المؤقتة
        this.memory = {
            lastField: null,
            fieldFocusTime: {},
            userTypingSpeed: 0,
            commonMistakes: [],
            preferredHelpType: 'visual'
        };
        
        // إحصائيات متقدمة
        this.stats = {
            totalGuides: 0,
            successfulGuides: 0,
            userSatisfaction: 0,
            activeTime: 0,
            startTime: Date.now()
        };
        
        this.init();
    }
    
    async init() {
        this.updateVisitStats();
        this.showWelcomeMessage();
        this.attachEventListeners();
        this.startBehaviorTracking();
        this.startAdvancedGuidance();
        this.startPerformanceMonitoring();
        this.addMicroInteractions();
        this.enableVoiceCommands();
        this.startAutoSaving();
        
        // تحميل التفضيلات المحفوظة
        this.loadUserPreferences();
        
        console.log('🤖 Robot initialized with advanced features');
    }
    
    updateVisitStats() {
        // تحديث إحصائيات الزيارات
        this.state.userBehavior.visitCount++;
        localStorage.setItem('robot_visits', this.state.userBehavior.visitCount);
        localStorage.setItem('robot_last_interaction', new Date().toISOString());
        
        if (this.state.userBehavior.firstVisit) {
            localStorage.setItem('robot_visited', 'true');
            this.state.userBehavior.firstVisit = false;
        }
    }
    
    showWelcomeMessage() {
        if (this.state.userBehavior.visitCount === 1) {
            this.smartMessage('🎉 أهلاً بك في معهد رعاية الضبعية! أنا مساعدك الذكي 🤖', 'celebrate', 5000);
        } else if (this.state.userBehavior.visitCount > 1) {
            this.smartMessage(`مرحباً بعودتك! 🎯 هذه زيارتك رقم ${this.state.userBehavior.visitCount}`, 'wave', 4000);
        }
    }
    
    smartMessage(text, emotion = 'neutral', duration = 4000) {
        // تحديث الفقاعة
        this.bubbleText.textContent = text;
        this.screenText.textContent = text.substring(0, 20) + (text.length > 20 ? '...' : '');
        
        // تأثيرات حسب المشاعر
        this.setEmotion(emotion);
        
        // إظهار الفقاعة
        this.speechBubble.classList.remove('show');
        setTimeout(() => {
            this.speechBubble.classList.add('show');
            this.addRippleEffect();
        }, 100);
        
        // تسجيل التفاعل
        this.logInteraction(text, emotion);
        
        // إخفاء بعد المدة
        setTimeout(() => {
            this.speechBubble.classList.remove('show');
        }, duration);
    }
    
    setEmotion(emotion) {
        const robotFace = document.querySelector('.robot-face');
        const eyes = document.querySelectorAll('.robot-eye');
        const mouth = document.querySelector('.mouth-line');
        
        switch(emotion) {
            case 'happy':
                robotFace?.classList.add('happy-face');
                mouth?.style.setProperty('width', '30px');
                this.state.currentMood = 'happy';
                break;
            case 'excited':
                eyes.forEach(eye => {
                    eye.style.animation = 'eyeBlink 0.5s infinite';
                });
                this.state.currentMood = 'excited';
                break;
            case 'celebrate':
                this.dance();
                this.state.currentMood = 'celebrate';
                break;
            case 'helpful':
                this.pointWithDirection();
                this.state.currentMood = 'helpful';
                break;
            default:
                mouth?.style.setProperty('width', '25px');
                this.state.currentMood = 'neutral';
        }
    }
    
    attachEventListeners() {
        // مراقبة جميع الحقول
        const fields = ['#username', '#password', '.submit-btn', '.signup-link a'];
        
        fields.forEach(fieldSelector => {
            const element = document.querySelector(fieldSelector);
            if (element) {
                element.addEventListener('focus', () => this.handleFieldFocus(fieldSelector));
                element.addEventListener('blur', () => this.handleFieldBlur(fieldSelector));
                
                if (fieldSelector === '#username' || fieldSelector === '#password') {
                    element.addEventListener('input', (e) => this.handleTyping(fieldSelector, e.target.value));
                }
            }
        });
        
        // تفاعلات الروبوت
        this.robotContainer?.addEventListener('click', () => this.handleRobotClick());
        this.robotContainer?.addEventListener('mouseenter', () => this.handleRobotHover());
        
        // كشف الأخطاء الشائعة
        this.detectCommonMistakes();
        
        // مراقبة نجاح تسجيل الدخول
        this.monitorLoginSuccess();
    }
    
    async handleFieldFocus(fieldId) {
        this.memory.lastField = fieldId;
        this.memory.fieldFocusTime[fieldId] = Date.now();
        
        // رسائل ذكية حسب الحقل
        const messages = {
            '#username': [
                '✍️ أدخل اسم المستخدم الخاص بك',
                '💡 تذكر: اسم المستخدم فريد لكل مستخدم',
                '📝 يمكن استخدام الحروف والأرقام فقط'
            ],
            '#password': [
                '🔐 أدخل كلمة المرور (آخر 7 أرقام من رقم الجلوس للطلاب)',
                '⚠️ كلمة المرور حساسة لحالة الأحرف',
                '🛡️ تأكد من عدم وجود مسافات'
            ],
            '.submit-btn': [
                '✅ اضغط هنا لتسجيل الدخول',
                '🚀 جاهز للدخول إلى لوحة التحكم؟',
                '⚡ تأكد من صحة البيانات قبل الضغط'
            ],
            '.signup-link a': [
                '🆕 ليس لديك حساب؟ اضغط هنا للتسجيل',
                '📝 أنشئ حساباً جديداً خلال دقيقة واحدة',
                '🎓 التسجيل متاح للطلاب وأولياء الأمور'
            ]
        };
        
        const fieldMessages = messages[fieldId] || ['👋 كيف يمكنني مساعدتك؟'];
        const randomMessage = fieldMessages[Math.floor(Math.random() * fieldMessages.length)];
        
        this.smartMessage(randomMessage, 'helpful', 3000);
        this.highlightField(fieldId);
        this.updateProgress(fieldId);
    }
    
    handleFieldBlur(fieldId) {
        const focusDuration = Date.now() - (this.memory.fieldFocusTime[fieldId] || Date.now());
        
        // تحليل سلوك المستخدم
        if (focusDuration < 1000) {
            this.smartMessage('💡 هل تحتاج مساعدة في هذا الحقل؟', 'helpful', 2500);
            this.state.userBehavior.mistakesCount++;
        }
        
        // تقديم نصائح حسب الوقت المستغرق
        if (focusDuration > 10000 && fieldId === '#username') {
            this.smartMessage('🔍 تذكر: يمكنك استخدام اسم المستخدم أو رقم الجلوس', 'helpful', 3000);
        }
        
        if (focusDuration > 10000 && fieldId === '#password') {
            this.smartMessage('🆘 إذا نسيت كلمة المرور، تواصل مع الإدارة', 'helpful', 3000);
        }
    }
    
    handleTyping(fieldId, value) {
        // حساب سرعة الكتابة
        if (this.memory.lastTypingStart) {
            const timeDiff = Date.now() - this.memory.lastTypingStart;
            this.memory.userTypingSpeed = value.length / (timeDiff / 1000);
        }
        this.memory.lastTypingStart = Date.now();
        
        // تقديم مساعدة ذكية أثناء الكتابة
        if (fieldId === '#username' && value.length > 0) {
            if (value.length < 4 && value.length > 0) {
                this.smartMessage('👤 اسم المستخدم يجب أن يكون 3 أحرف على الأقل', 'helpful', 2000);
            } else if (value.length >= 4) {
                this.smartMessage('✓ اسم مستخدم جيد! الآن انتقل إلى كلمة المرور', 'happy', 2000);
                this.incrementProgress();
            }
        }
        
        if (fieldId === '#password' && value.length > 0) {
            if (value.length < 6) {
                this.smartMessage('🔒 كلمة المرور قصيرة جداً! استخدم 6 محارف على الأقل', 'helpful', 2000);
            } else if (value.length >= 8) {
                this.smartMessage('🛡️ ممتاز! كلمة مرور قوية ✓', 'celebrate', 2000);
                this.incrementProgress();
            }
        }
    }
    
    detectCommonMistakes() {
        // مراقبة الأخطاء الشائعة
        const usernameField = document.getElementById('username');
        const passwordField = document.getElementById('password');
        
        usernameField?.addEventListener('change', (e) => {
            if (e.target.value.includes(' ')) {
                this.smartMessage('⚠️ اسم المستخدم لا يجب أن يحتوي على مسافات!', 'helpful', 3000);
                this.memory.commonMistakes.push('spaces_in_username');
            }
        });
        
        passwordField?.addEventListener('change', (e) => {
            if (e.target.value.length < 6) {
                this.smartMessage('⚠️ كلمة المرور ضعيفة جداً! استخدم كلمة أطول', 'helpful', 3000);
                this.memory.commonMistakes.push('weak_password');
            }
        });
    }
    
    monitorLoginSuccess() {
        // مراقبة نجاح تسجيل الدخول من خلال مراقبة التوجيه
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            
            if (args[0]?.includes('/api/login')) {
                const data = await response.clone().json();
                if (data.success) {
                    this.smartMessage('🎉 تهانينا! تم تسجيل الدخول بنجاح', 'celebrate', 3000);
                    this.stats.successfulGuides++;
                    this.saveAchievement('login_success');
                    
                    // تحديث الإحصائيات
                    this.updateAnalytics();
                }
            }
            
            return response;
        };
    }
    
    highlightField(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.classList.add('input-highlight');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            setTimeout(() => {
                element.classList.remove('input-highlight');
            }, 2000);
        }
    }
    
    pointWithDirection() {
        const rightArm = document.querySelector('.right-arm');
        if (rightArm) {
            rightArm.style.transform = 'rotate(-45deg) scale(1.2)';
            setTimeout(() => {
                rightArm.style.transform = '';
            }, 1000);
        }
    }
    
    dance() {
        const robot = this.robot;
        robot.style.animation = 'none';
        setTimeout(() => {
            robot.style.animation = 'robotFloat 0.2s infinite';
        }, 10);
        
        // إضافة تأثيرات ضوئية
        const antenna = document.querySelector('.antenna-ball');
        if (antenna) {
            antenna.style.animation = 'antennaGlow 0.2s infinite';
        }
        
        setTimeout(() => {
            robot.style.animation = 'robotFloat 3s ease-in-out infinite';
            if (antenna) {
                antenna.style.animation = 'antennaGlow 1.5s infinite';
            }
        }, 2000);
    }
    
    addRippleEffect() {
        const bubble = this.speechBubble;
        bubble.style.transform = 'scale(1.05)';
        setTimeout(() => {
            bubble.style.transform = 'scale(1)';
        }, 200);
    }
    
    handleRobotClick() {
        this.stats.interactionCount++;
        this.state.interactionCount++;
        
        const responses = [
            '😊 كيف يمكنني مساعدتك اليوم؟',
            '🎯 أنا هنا للإجابة على استفساراتك',
            '💬 هل تحتاج إلى شرح أي شيء؟',
            '📚 يمكنني مساعدتك في الوصول إلى معلوماتك'
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.smartMessage(randomResponse, 'happy', 3000);
        this.dance();
    }
    
    handleRobotHover() {
        this.wave();
        if (Math.random() > 0.7) {
            this.smartMessage('👋 هل تريد مساعدة سريعة؟ اضغط عليّ', 'excited', 2000);
        }
    }
    
    wave() {
        const arms = document.querySelectorAll('.robot-arm');
        arms.forEach(arm => {
            arm.style.animation = 'none';
            setTimeout(() => {
                arm.style.animation = 'armWaveLeft 0.5s 3';
            }, 10);
        });
    }
    
    startBehaviorTracking() {
        // تتبع سلوك المستخدم
        let inactivityTimer;
        
        document.addEventListener('mousemove', () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                if (!document.activeElement || document.activeElement === document.body) {
                    this.smartMessage('👀 هل ما زلت هنا؟ أحتاج مساعدتك؟', 'helpful', 3000);
                }
            }, 30000);
        });
        
        // تحليل وقت النشاط
        setInterval(() => {
            this.stats.activeTime++;
            if (this.stats.activeTime % 60 === 0) {
                this.smartTip();
            }
        }, 1000);
    }
    
    smartTip() {
        const tips = [...this.knowledgeBase.tips.general];
        
        // نصائح مخصصة حسب سلوك المستخدم
        if (this.state.userBehavior.mistakesCount > 3) {
            tips.push('💡 يمكنك طلب المساعدة في أي وقت بالنقر عليّ');
        }
        
        if (this.state.userBehavior.completedSteps.length < 3) {
            tips.push('📝 تأكد من إدخال جميع البيانات المطلوبة');
        }
        
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        this.smartMessage(randomTip, 'helpful', 4000);
    }
    
    updateProgress(fieldId) {
        const step = fieldId.replace('#', '').replace('.', '');
        if (!this.state.userBehavior.completedSteps.includes(step)) {
            this.state.userBehavior.completedSteps.push(step);
            localStorage.setItem('robot_completed_steps', JSON.stringify(this.state.userBehavior.completedSteps));
            
            const progress = (this.state.userBehavior.completedSteps.length / 4) * 100;
            this.showProgressBar(progress);
        }
    }
    
    incrementProgress() {
        const currentProgress = parseInt(localStorage.getItem('login_progress') || '0');
        const newProgress = Math.min(currentProgress + 25, 100);
        localStorage.setItem('login_progress', newProgress);
        this.showProgressBar(newProgress);
    }
    
    showProgressBar(percentage) {
        let progressBar = document.querySelector('.robot-progress');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.className = 'robot-progress';
            progressBar.innerHTML = `
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    <span class="progress-text">${Math.round(percentage)}%</span>
                </div>
            `;
            this.robotContainer?.appendChild(progressBar);
        } else {
            const fill = progressBar.querySelector('.progress-bar-fill');
            const text = progressBar.querySelector('.progress-text');
            if (fill) fill.style.width = `${percentage}%`;
            if (text) text.textContent = `${Math.round(percentage)}%`;
        }
        
        if (percentage === 100) {
            setTimeout(() => {
                this.smartMessage('🎉 ممتاز! أنت جاهز لتسجيل الدخول', 'celebrate', 3000);
                setTimeout(() => progressBar.remove(), 5000);
            }, 500);
        }
    }
    
    startAdvancedGuidance() {
        const guidanceSteps = [
            { condition: () => !document.getElementById('username')?.value, message: 'ابدأ بإدخال اسم المستخدم في الحقل العلوي ✏️', target: '#username' },
            { condition: () => !document.getElementById('password')?.value, message: 'الآن أدخل كلمة المرور الخاصة بك 🔐', target: '#password' },
            { condition: () => true, message: 'اضغط على زر تسجيل الدخول لإكمال العملية ✅', target: '.submit-btn' }
        ];
        
        let stepIndex = 0;
        
        const guideInterval = setInterval(() => {
            if (stepIndex >= guidanceSteps.length) {
                clearInterval(guideInterval);
                return;
            }
            
            const step = guidanceSteps[stepIndex];
            if (step.condition()) {
                this.smartMessage(step.message, 'helpful', 4000);
                this.highlightField(step.target);
                stepIndex++;
            }
        }, 8000);
    }
    
    startPerformanceMonitoring() {
        // مراقبة أداء الصفحة
        if (window.performance) {
            const perfData = performance.timing;
            const loadTime = perfData.loadEventEnd - perfData.navigationStart;
            
            if (loadTime > 3000) {
                this.smartMessage('⏱️ الصفحة بطيئة قليلاً، قد تحتاج لتحديث المتصفح', 'helpful', 3000);
            }
        }
    }
    
    addMicroInteractions() {
        // إضافة تأثيرات صوتية (اختياري)
        this.addSoundEffects();
        
        // إضافة تأثيرات بصرية دقيقة
        this.addParticleEffects();
    }
    
    addSoundEffects() {
        // تأثيرات صوتية بسيطة (اختيارية - تتطلب تفاعل المستخدم)
        const createSound = (frequency, duration) => {
            if (typeof AudioContext !== 'undefined') {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                
                oscillator.frequency.value = frequency;
                gainNode.gain.value = 0.1;
                
                oscillator.start();
                setTimeout(() => {
                    oscillator.stop();
                    audioCtx.close();
                }, duration);
            }
        };
        
        // تفعيل الصوت عند التفاعل مع الروبوت (يتطلب تفاعل مستخدم أول)
        this.robotContainer?.addEventListener('click', () => {
            if (this.state.soundEnabled) {
                createSound(880, 100);
            }
        }, { once: true });
    }
    
    addParticleEffects() {
        // إضافة تأثير جسيمات حول الروبوت
        const particleContainer = document.createElement('div');
        particleContainer.className = 'robot-particles';
        this.robotContainer?.appendChild(particleContainer);
        
        setInterval(() => {
            if (this.state.currentMood === 'celebrate') {
                this.createParticle();
            }
        }, 500);
    }
    
    createParticle() {
        const particle = document.createElement('div');
        particle.className = 'robot-particle';
        particle.innerHTML = ['✨', '⭐', '💫', '🌟'][Math.floor(Math.random() * 4)];
        particle.style.position = 'absolute';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animation = 'particleFloat 1s ease-out forwards';
        
        document.querySelector('.robot-particles')?.appendChild(particle);
        
        setTimeout(() => particle.remove(), 1000);
    }
    
    enableVoiceCommands() {
        // دعم الأوامر الصوتية (يتطلب دعم المتصفح)
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.lang = 'ar-EG';
            recognition.continuous = false;
            
            let voiceButton = document.querySelector('.robot-voice-btn');
            if (!voiceButton) {
                voiceButton = document.createElement('button');
                voiceButton.className = 'robot-voice-btn';
                voiceButton.innerHTML = '🎤';
                voiceButton.title = 'أمر صوتي';
                this.robotContainer?.appendChild(voiceButton);
                
                voiceButton.addEventListener('click', () => {
                    recognition.start();
                    this.smartMessage('🎤 استمع... تحدث الآن', 'excited', 2000);
                });
            }
            
            recognition.onresult = (event) => {
                const command = event.results[0][0].transcript;
                this.smartMessage(`🎤 قلت: "${command}"`, 'happy', 3000);
                this.processVoiceCommand(command);
            };
        }
    }
    
    processVoiceCommand(command) {
        const lowerCommand = command.toLowerCase();
        
        if (lowerCommand.includes('مساعدة') || lowerCommand.includes('help')) {
            this.smartMessage('💬 يمكنني مساعدتك في: تسجيل الدخول، إنشاء حساب، النتائج، الاستفسارات', 'helpful', 4000);
        } else if (lowerCommand.includes('اسم المستخدم')) {
            this.highlightField('#username');
            this.smartMessage('✏️ حقل اسم المستخدم هنا', 'helpful', 3000);
        } else if (lowerCommand.includes('كلمة المرور')) {
            this.highlightField('#password');
            this.smartMessage('🔐 حقل كلمة المرور هنا', 'helpful', 3000);
        } else if (lowerCommand.includes('تسجيل الدخول')) {
            this.highlightField('.submit-btn');
            this.smartMessage('✅ اضغط هنا لتسجيل الدخول', 'celebrate', 3000);
        } else {
            this.smartMessage('🤔 لم أفهم الأمر، حاول مرة أخرى أو اكتب سؤالك', 'neutral', 3000);
        }
    }
    
    startAutoSaving() {
        // حفظ التقدم كل 30 ثانية
        setInterval(() => {
            this.saveUserPreferences();
            this.updateAnalytics();
        }, 30000);
    }
    
    saveUserPreferences() {
        const preferences = {
            soundEnabled: this.state.soundEnabled || false,
            preferredHelpType: this.memory.preferredHelpType,
            lastVisit: new Date().toISOString(),
            interactionCount: this.state.interactionCount
        };
        
        localStorage.setItem('robot_preferences', JSON.stringify(preferences));
    }
    
    loadUserPreferences() {
        const saved = localStorage.getItem('robot_preferences');
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                this.state.soundEnabled = prefs.soundEnabled;
                this.memory.preferredHelpType = prefs.preferredHelpType;
            } catch(e) {}
        }
    }
    
    updateAnalytics() {
        // تحديث إحصائيات المستخدم
        const analytics = {
            totalTimeOnPage: Math.floor((Date.now() - this.stats.startTime) / 1000),
            interactions: this.stats.interactionCount,
            successfulGuides: this.stats.successfulGuides,
            completedSteps: this.state.userBehavior.completedSteps,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('robot_analytics', JSON.stringify(analytics));
        
        // إرسال التحليلات للخادم (اختياري)
        // this.sendAnalytics(analytics);
    }
    
    saveAchievement(achievementId) {
        let achievements = JSON.parse(localStorage.getItem('robot_achievements') || '[]');
        if (!achievements.includes(achievementId)) {
            achievements.push(achievementId);
            localStorage.setItem('robot_achievements', JSON.stringify(achievements));
            
            // عرض الإنجاز
            this.showAchievementNotification(achievementId);
        }
    }
    
    showAchievementNotification(achievementId) {
        const achievements = {
            login_success: { name: '🎯 أول تسجيل دخول', desc: 'قمت بتسجيل الدخول بنجاح!' },
            quick_learner: { name: '⚡ متعلم سريع', desc: 'أكملت جميع الخطوات بسرعة!' },
            help_seeker: { name: '💡 باحث عن المعرفة', desc: 'طلبت المساعدة بنجاح' }
        };
        
        const achievement = achievements[achievementId];
        if (achievement) {
            const notification = document.createElement('div');
            notification.className = 'achievement-notification';
            notification.innerHTML = `
                <div class="achievement-icon">🏆</div>
                <div class="achievement-content">
                    <div class="achievement-title">${achievement.name}</div>
                    <div class="achievement-desc">${achievement.desc}</div>
                </div>
            `;
            document.body.appendChild(notification);
            
            setTimeout(() => notification.classList.add('show'), 100);
            setTimeout(() => notification.remove(), 5000);
        }
    }
    
    logInteraction(message, emotion) {
        // تسجيل التفاعل للتحليلات
        const log = {
            timestamp: new Date().toISOString(),
            message: message,
            emotion: emotion,
            mood: this.state.currentMood
        };
        
        let logs = JSON.parse(localStorage.getItem('robot_interaction_logs') || '[]');
        logs.push(log);
        if (logs.length > 100) logs = logs.slice(-100);
        localStorage.setItem('robot_interaction_logs', JSON.stringify(logs));
    }
}

// تشغيل الروبوت المتطور
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.robot = new AdvancedRobot();
    }, 500);
});
// ====================== تحسينات إضافية للروبوت ======================

// إضافة تأثير الكتابة للروبوت
function showTypingIndicator() {
    const bubbleText = document.getElementById('bubbleText');
    if (bubbleText && !bubbleText.querySelector('.typing-indicator')) {
        const originalText = bubbleText.textContent;
        bubbleText.innerHTML = `<span class="typing-indicator"><span>.</span><span>.</span><span>.</span></span>`;
        
        setTimeout(() => {
            bubbleText.innerHTML = originalText;
        }, 1500);
    }
}

// تحسين تجربة المستخدم على الموبايل
function optimizeForMobile() {
    if ('ontouchstart' in window) {
        // إضافة دعم اللمس
        const robotContainer = document.querySelector('.robot-container');
        if (robotContainer) {
            robotContainer.style.cursor = 'pointer';
            
            let touchTimer;
            robotContainer.addEventListener('touchstart', () => {
                touchTimer = setTimeout(() => {
                    if (window.robot) {
                        window.robot.handleRobotClick();
                    }
                }, 300);
            });
            
            robotContainer.addEventListener('touchend', () => {
                clearTimeout(touchTimer);
            });
        }
    }
}

// حفظ تفضيلات المستخدم للروبوت
function saveRobotPreferences(prefs) {
    localStorage.setItem('robot_user_preferences', JSON.stringify(prefs));
}

function loadRobotPreferences() {
    const prefs = localStorage.getItem('robot_user_preferences');
    if (prefs) {
        try {
            return JSON.parse(prefs);
        } catch(e) {
            return {};
        }
    }
    return {};
}

// تشغيل التحسينات الإضافية
document.addEventListener('DOMContentLoaded', () => {
    optimizeForMobile();
});

// ====================== 1. نظام الطقس والمزاج ======================

class WeatherMoodSystem {
    constructor(robot) {
        this.robot = robot;
        this.currentWeather = null;
        this.currentMood = null;
        this.init();
    }
    
    async init() {
        await this.getWeatherData();
        this.startWeatherUpdates();
        this.updateRobotMoodByWeather();
    }
    
    async getWeatherData() {
        // محاكاة بيانات الطقس (يمكن ربطها بـ API حقيقي)
        const hour = new Date().getHours();
        const weatherOptions = {
            morning: { weather: '☀️ مشمس', temp: '24°', mood: 'energetic', color: '#ffd700' },
            afternoon: { weather: '🌤️ غائم جزئياً', temp: '28°', mood: 'calm', color: '#87ceeb' },
            evening: { weather: '🌙 بارد', temp: '18°', mood: 'relaxed', color: '#4a90e2' },
            night: { weather: '⭐ ليلة هادئة', temp: '15°', mood: 'sleepy', color: '#2c5f8a' }
        };
        
        if (hour < 12) this.currentWeather = weatherOptions.morning;
        else if (hour < 16) this.currentWeather = weatherOptions.afternoon;
        else if (hour < 20) this.currentWeather = weatherOptions.evening;
        else this.currentWeather = weatherOptions.night;
        
        return this.currentWeather;
    }
    
    updateRobotMoodByWeather() {
        if (!this.robot) return;
        
        const weather = this.currentWeather;
        let message = '';
        
        switch(weather.mood) {
            case 'energetic':
                message = `🌅 صباح الخير! الطقس ${weather.weather} - وقت النشاط والحماس! ⚡`;
                this.robot.setEmotion('excited');
                break;
            case 'calm':
                message = `🌤️ طقس معتدل - يوم دراسي هادئ ومثالي للمذاكرة 📚`;
                this.robot.setEmotion('happy');
                break;
            case 'relaxed':
                message = `🌙 مساء دافئ - وقت رائع للمراجعة الهادئة ✨`;
                this.robot.setEmotion('calm');
                break;
            case 'sleepy':
                message = `⭐ ليلة هادئة - أنصحك بالنوم باكراً لتصبح نشيطاً غداً 🌙`;
                this.robot.setEmotion('sleepy');
                break;
        }
        
        if (message && this.robot) {
            setTimeout(() => {
                this.robot.smartMessage(message, 'helpful', 5000);
            }, 1000);
        }
        
        // تغيير ألوان الروبوت حسب الطقس
        this.applyWeatherTheme(weather.color);
    }
    
    applyWeatherTheme(color) {
        const robot = document.querySelector('.robot');
        if (robot) {
            robot.style.setProperty('--weather-color', color);
            robot.style.filter = `drop-shadow(0 0 10px ${color})`;
            setTimeout(() => {
                robot.style.filter = '';
            }, 3000);
        }
    }
    
    startWeatherUpdates() {
        // تحديث الطقس كل ساعة
        setInterval(() => {
            this.getWeatherData();
            this.updateRobotMoodByWeather();
        }, 3600000);
    }
    
    getWeatherWidget() {
        return `
            <div class="weather-widget">
                <div class="weather-icon">${this.currentWeather?.weather.split(' ')[0] || '🌤️'}</div>
                <div class="weather-info">
                    <span>${this.currentWeather?.weather || 'معتدل'}</span>
                    <span>${this.currentWeather?.temp || '22°'}</span>
                </div>
            </div>
        `;
    }
}

// ====================== 2. المؤثرات الصوتية الاحترافية ======================

class RobotSoundEffects {
    constructor() {
        this.soundsEnabled = localStorage.getItem('robot_sounds') !== 'false';
        this.audioContext = null;
        this.initAudio();
    }
    
    async initAudio() {
        // تهيئة الصوت عند أول تفاعل للمستخدم
        document.body.addEventListener('click', () => {
            if (!this.audioContext && this.soundsEnabled) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
    }
    
    playSound(soundType) {
        if (!this.soundsEnabled || !this.audioContext) return;
        
        // إنشاء صوت باستخدام Web Audio API
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        const sounds = {
            click: { frequency: 880, duration: 0.1, gain: 0.2 },
            success: { frequency: 1318.52, duration: 0.3, gain: 0.3, type: 'sine' },
            error: { frequency: 440, duration: 0.2, gain: 0.25, type: 'sawtooth' },
            notification: { frequency: 1046.5, duration: 0.15, gain: 0.2 },
            typing: { frequency: 659.25, duration: 0.05, gain: 0.1 },
            welcome: { frequency: 987.77, duration: 0.4, gain: 0.25 },
            robotMove: { frequency: 523.25, duration: 0.08, gain: 0.15 },
            achievement: { frequency: 1567.98, duration: 0.5, gain: 0.3 }
        };
        
        const sound = sounds[soundType] || sounds.click;
        
        oscillator.type = sound.type || 'sine';
        oscillator.frequency.value = sound.frequency;
        gainNode.gain.value = sound.gain;
        
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, this.audioContext.currentTime + sound.duration);
        oscillator.stop(this.audioContext.currentTime + sound.duration);
    }
    
    toggleSounds() {
        this.soundsEnabled = !this.soundsEnabled;
        localStorage.setItem('robot_sounds', this.soundsEnabled);
        
        if (this.soundsEnabled && this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        return this.soundsEnabled;
    }
}

// ====================== 3. تخصيص مظهر الروبوت ======================

class RobotCustomizer {
    constructor(robot) {
        this.robot = robot;
        this.currentTheme = localStorage.getItem('robot_theme') || 'default';
        this.themes = {
            default: {
                name: '🤖 افتراضي',
                primary: '#4a90e2',
                secondary: '#2c5f8a',
                accent: '#d4af37',
                gradient: 'linear-gradient(145deg, #4a90e2, #2c5f8a)'
            },
            dark: {
                name: '🌙 داكن',
                primary: '#2c3e50',
                secondary: '#1a252f',
                accent: '#f39c12',
                gradient: 'linear-gradient(145deg, #2c3e50, #1a252f)'
            },
            neon: {
                name: '💚 نيون',
                primary: '#00ff88',
                secondary: '#00cc66',
                accent: '#ff00ff',
                gradient: 'linear-gradient(145deg, #00ff88, #00cc66)'
            },
            gold: {
                name: '⭐ ذهبي',
                primary: '#d4af37',
                secondary: '#b8942e',
                accent: '#ffd700',
                gradient: 'linear-gradient(145deg, #d4af37, #b8942e)'
            },
            ocean: {
                name: '🌊 محيط',
                primary: '#1a8fe0',
                secondary: '#0d6efd',
                accent: '#00b4d8',
                gradient: 'linear-gradient(145deg, #1a8fe0, #0d6efd)'
            },
            sunset: {
                name: '🌅 غروب',
                primary: '#ff6b6b',
                secondary: '#cc4444',
                accent: '#ffd93d',
                gradient: 'linear-gradient(145deg, #ff6b6b, #cc4444)'
            },
            forest: {
                name: '🌲 غابة',
                primary: '#2d6a4f',
                secondary: '#1b4d3b',
                accent: '#74c69d',
                gradient: 'linear-gradient(145deg, #2d6a4f, #1b4d3b)'
            },
            purple: {
                name: '🟣 بنفسجي',
                primary: '#9b59b6',
                secondary: '#7d3c98',
                accent: '#e8daef',
                gradient: 'linear-gradient(145deg, #9b59b6, #7d3c98)'
            }
        };
        
        this.init();
    }
    
    init() {
        this.applyTheme(this.currentTheme);
        this.addThemeSelector();
        this.addCustomizationPanel();
    }
    
    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;
        
        this.currentTheme = themeName;
        localStorage.setItem('robot_theme', themeName);
        
        // تطبيق الألوان على الروبوت
        const robotHead = document.querySelector('.robot-head');
        const robotBody = document.querySelector('.robot-body');
        const robotArms = document.querySelectorAll('.robot-arm');
        const robotLegs = document.querySelectorAll('.robot-leg');
        
        if (robotHead) robotHead.style.background = theme.gradient;
        if (robotBody) robotBody.style.background = theme.gradient;
        
        robotArms.forEach(arm => {
            arm.style.background = theme.gradient;
        });
        
        robotLegs.forEach(leg => {
            leg.style.background = theme.gradient;
        });
        
        // تغيير لون الهوائي
        const antennaBall = document.querySelector('.antenna-ball');
        if (antennaBall) antennaBall.style.background = `radial-gradient(circle at 30% 30%, ${theme.accent}, ${theme.secondary})`;
        
        // تحديث واجهة الثيم
        this.updateThemeUI(themeName);
        
        // إظهار رسالة التأكيد
        if (window.robot) {
            window.robot.smartMessage(`🎨 تم تغيير المظهر إلى ${theme.name}`, 'happy', 2000);
        }
    }
    
    addThemeSelector() {
        // إضافة قائمة اختيار الثيمات
        const selector = document.createElement('div');
        selector.className = 'theme-selector';
        selector.innerHTML = `
            <div class="theme-toggle" id="themeToggle">
                <i class="fas fa-palette"></i>
            </div>
            <div class="theme-menu" id="themeMenu" style="display: none;">
                <h4>🎨 اختر المظهر</h4>
                ${Object.entries(this.themes).map(([key, theme]) => `
                    <div class="theme-option ${this.currentTheme === key ? 'active' : ''}" data-theme="${key}">
                        <div class="theme-color" style="background: ${theme.primary}"></div>
                        <span>${theme.name}</span>
                        ${this.currentTheme === key ? '<i class="fas fa-check"></i>' : ''}
                    </div>
                `).join('')}
                <div class="sound-toggle">
                    <i class="fas fa-volume-up"></i>
                    <span>المؤثرات الصوتية</span>
                    <label class="switch">
                        <input type="checkbox" id="soundToggle" ${localStorage.getItem('robot_sounds') !== 'false' ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        document.body.appendChild(selector);
        
        // إضافة الأحداث
        const toggle = selector.querySelector('#themeToggle');
        const menu = selector.querySelector('#themeMenu');
        const soundToggle = selector.querySelector('#soundToggle');
        
        toggle?.addEventListener('click', () => {
            const isVisible = menu.style.display === 'flex';
            menu.style.display = isVisible ? 'none' : 'flex';
        });
        
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                this.applyTheme(theme);
                menu.style.display = 'none';
                
                // تشغيل صوت
                if (window.soundEffects) {
                    window.soundEffects.playSound('click');
                }
            });
        });
        
        soundToggle?.addEventListener('change', (e) => {
            if (window.soundEffects) {
                const enabled = window.soundEffects.toggleSounds();
                if (enabled) {
                    window.soundEffects.playSound('notification');
                }
            }
        });
        
        // إغلاق القائمة عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
    }
    
    addCustomizationPanel() {
        // إضافة لوحة تخصيص متقدمة
        const panel = document.createElement('div');
        panel.className = 'robot-customization-panel';
        panel.innerHTML = `
            <div class="customization-header">
                <span>⚙️ تخصيص الروبوت</span>
                <button id="closeCustomPanel"><i class="fas fa-times"></i></button>
            </div>
            <div class="customization-content">
                <div class="custom-group">
                    <label>🎨 السطوع</label>
                    <input type="range" id="brightnessSlider" min="0.5" max="1.5" step="0.01" value="1">
                </div>
                <div class="custom-group">
                    <label>📏 الحجم</label>
                    <input type="range" id="sizeSlider" min="0.7" max="1.3" step="0.01" value="1">
                </div>
                <div class="custom-group">
                    <label>💨 سرعة الحركة</label>
                    <input type="range" id="speedSlider" min="0.5" max="2" step="0.1" value="1">
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // إضافة زر التخصيص في قائمة الثيمات
        const themeMenu = document.querySelector('.theme-menu');
        if (themeMenu) {
            const customBtn = document.createElement('div');
            customBtn.className = 'customize-btn';
            customBtn.innerHTML = '<i class="fas fa-sliders-h"></i> تخصيص متقدم';
            customBtn.addEventListener('click', () => {
                panel.classList.toggle('show');
                document.querySelector('#themeMenu').style.display = 'none';
            });
            themeMenu.appendChild(customBtn);
        }
        
        // تطبيق التخصيصات
        const brightnessSlider = panel.querySelector('#brightnessSlider');
        const sizeSlider = panel.querySelector('#sizeSlider');
        const speedSlider = panel.querySelector('#speedSlider');
        const closeBtn = panel.querySelector('#closeCustomPanel');
        
        brightnessSlider?.addEventListener('input', (e) => {
            const robot = document.querySelector('.robot');
            if (robot) robot.style.filter = `brightness(${e.target.value})`;
            localStorage.setItem('robot_brightness', e.target.value);
        });
        
        sizeSlider?.addEventListener('input', (e) => {
            const container = document.querySelector('.robot-container');
            if (container) container.style.transform = `scale(${e.target.value})`;
            localStorage.setItem('robot_size', e.target.value);
        });
        
        speedSlider?.addEventListener('input', (e) => {
            const robot = document.querySelector('.robot');
            if (robot) {
                const duration = 3 / e.target.value;
                robot.style.animation = `robotFloat ${duration}s ease-in-out infinite`;
            }
            localStorage.setItem('robot_speed', e.target.value);
        });
        
        closeBtn?.addEventListener('click', () => {
            panel.classList.remove('show');
        });
        
        // تحميل الإعدادات المحفوظة
        const savedBrightness = localStorage.getItem('robot_brightness');
        const savedSize = localStorage.getItem('robot_size');
        const savedSpeed = localStorage.getItem('robot_speed');
        
        if (savedBrightness) brightnessSlider.value = savedBrightness;
        if (savedSize) sizeSlider.value = savedSize;
        if (savedSpeed) speedSlider.value = savedSpeed;
    }
    
    updateThemeUI(themeName) {
        // تحديث واجهة اختيار الثيم
        document.querySelectorAll('.theme-option').forEach(option => {
            const theme = option.dataset.theme;
            if (theme === themeName) {
                option.classList.add('active');
                const checkIcon = option.querySelector('i.fa-check');
                if (!checkIcon) {
                    option.innerHTML += '<i class="fas fa-check"></i>';
                }
            } else {
                option.classList.remove('active');
                const checkIcon = option.querySelector('i.fa-check');
                if (checkIcon) checkIcon.remove();
            }
        });
    }
}

// ====================== دمج جميع الميزات في الروبوت الرئيسي ======================

// إضافة الميزات الجديدة للروبوت
const originalAdvancedRobotInit = AdvancedRobot.prototype.init;

AdvancedRobot.prototype.init = async function() {
    // تشغيل التهيئة الأصلية
    if (originalAdvancedRobotInit) {
        await originalAdvancedRobotInit.call(this);
    }
    
    // إضافة نظام الطقس
    this.weatherSystem = new WeatherMoodSystem(this);
    
    // إضافة المؤثرات الصوتية
    window.soundEffects = new RobotSoundEffects();
    
    // إضافة تخصيص المظهر
    this.customizer = new RobotCustomizer(this);
    
    // إضافة تأثيرات صوتية للأحداث
    this.addSoundTriggers();
    
    // إضافة تحسينات إضافية للتوافق مع جميع الأجهزة
    this.addResponsiveOptimizations();
    
    console.log('🎉 All robot features initialized: Weather, Sounds, Customizer');
};

// إضافة مشغلات الصوت
AdvancedRobot.prototype.addSoundTriggers = function() {
    // صوت عند التركيز على حقل
    const originalHandleFieldFocus = this.handleFieldFocus;
    this.handleFieldFocus = async function(fieldId) {
        if (window.soundEffects) {
            window.soundEffects.playSound('click');
        }
        return originalHandleFieldFocus.call(this, fieldId);
    };
    
    // صوت عند نجاح تسجيل الدخول
    const originalMonitorLoginSuccess = this.monitorLoginSuccess;
    this.monitorLoginSuccess = function() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            if (args[0]?.includes('/api/login')) {
                const data = await response.clone().json();
                if (data.success && window.soundEffects) {
                    window.soundEffects.playSound('success');
                }
            }
            return response;
        };
        if (originalMonitorLoginSuccess) originalMonitorLoginSuccess.call(this);
    };
    
    // صوت عند الكتابة
    const originalHandleTyping = this.handleTyping;
    this.handleTyping = function(fieldId, value) {
        if (window.soundEffects && value.length % 5 === 0 && value.length > 0) {
            window.soundEffects.playSound('typing');
        }
        return originalHandleTyping.call(this, fieldId, value);
    };
};

// تحسينات التوافق مع جميع الأجهزة
AdvancedRobot.prototype.addResponsiveOptimizations = function() {
    // كشف نوع الجهاز
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
    
    if (isMobile) {
        // تحسينات للموبايل
        document.documentElement.style.setProperty('--robot-scale', '0.7');
        this.smartMessage('📱 نسخة الموبايل - اضغط عليّ للمساعدة', 'happy', 3000);
    } else if (isTablet) {
        document.documentElement.style.setProperty('--robot-scale', '0.85');
    }
    
    // إضافة دعم اللمس للهواتف
    if ('ontouchstart' in window) {
        const robotContainer = document.querySelector('.robot-container');
        if (robotContainer) {
            robotContainer.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleRobotClick();
            });
        }
    }
    
    // تحسين الأداء للأجهزة الضعيفة
    if (window.navigator.hardwareConcurrency <= 2) {
        // تقليل جودة الحركات
        document.querySelectorAll('.robot-arm, .robot-leg').forEach(el => {
            el.style.animationDuration = '6s';
        });
    }
};

// تحديث دالة smartMessage لإضافة الصوت
const originalSmartMessage = AdvancedRobot.prototype.smartMessage;
AdvancedRobot.prototype.smartMessage = function(text, emotion, duration) {
    if (window.soundEffects && emotion === 'celebrate') {
        window.soundEffects.playSound('notification');
    }
    if (window.soundEffects && emotion === 'excited') {
        window.soundEffects.playSound('robotMove');
    }
    return originalSmartMessage.call(this, text, emotion, duration);
};

console.log('✅ All robot enhancements loaded successfully!');


// ====================== إظهار/إخفاء كلمة المرور ======================
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.classList.remove('fa-eye');
        toggleBtn.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleBtn.classList.remove('fa-eye-slash');
        toggleBtn.classList.add('fa-eye');
    }
}

// ====================== كابتشا ذكية متقدمة ======================
let currentCaptcha = null;

// إنشاء كابتشا مع عمليات حسابية
function generateSmartCaptcha() {
    const operations = [
        { symbol: '+', func: (a, b) => a + b },
        { symbol: '-', func: (a, b) => a - b },
        { symbol: '×', func: (a, b) => a * b }
    ];
    
    // أرقام عشوائية (تختلف حسب صعوبة الكابتشا)
    const isHard = document.getElementById('username')?.value?.length > 5;
    
    let num1, num2, operation;
    
    if (isHard) {
        // كابتشا صعبة
        num1 = Math.floor(Math.random() * 50) + 10;
        num2 = Math.floor(Math.random() * 30) + 5;
        operation = operations[Math.floor(Math.random() * operations.length)];
    } else {
        // كابتشا سهلة
        num1 = Math.floor(Math.random() * 10) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operation = operations[Math.floor(Math.random() * 2)]; // + و - فقط
    }
    
    let result = operation.func(num1, num2);
    
    // التأكد من أن الناتج عدد صحيح موجب
    if (result < 0) {
        result = Math.abs(result);
        operation = operations[0]; // تصحيح إلى جمع
    }
    
    const captchaText = `${num1} ${operation.symbol} ${num2} = ?`;
    
    return {
        text: captchaText,
        answer: result.toString(),
        displayText: captchaText
    };
}

// تحديث الكابتشا
function refreshCaptcha() {
    const captchaData = generateSmartCaptcha();
    currentCaptcha = captchaData;
    
    const captchaCodeDiv = document.getElementById('captchaCode');
    if (captchaCodeDiv) {
        captchaCodeDiv.innerHTML = captchaData.text;
    }
    
    // تنظيف حقل الإدخال السابق
    const captchaInput = document.getElementById('captchaInput');
    if (captchaInput) {
        captchaInput.value = '';
        captchaInput.classList.remove('captcha-error');
    }
    
    console.log('🔄 Captcha refreshed');
}

// التحقق من الكابتشا
function verifyCaptcha() {
    const userInput = document.getElementById('captchaInput')?.value.trim();
    const captchaInput = document.getElementById('captchaInput');
    
    if (!userInput) {
        if (captchaInput) captchaInput.classList.add('captcha-error');
        showToastMessage('🔐 الرجاء إدخال رمز التحقق', 'error');
        return false;
    }
    
    if (userInput === currentCaptcha?.answer) {
        if (captchaInput) captchaInput.classList.remove('captcha-error');
        return true;
    } else {
        if (captchaInput) captchaInput.classList.add('captcha-error');
        showToastMessage('❌ رمز التحقق غير صحيح! حاول مرة أخرى', 'error');
        
        // تحديث الكابتشا تلقائياً بعد خطأ
        setTimeout(() => refreshCaptcha(), 500);
        return false;
    }
}

// ====================== إشعار الترحيب حسب الوقت ======================

// الحصول على رسالة ترحيب حسب الوقت
function getTimeBasedWelcome() {
    const hour = new Date().getHours();
    const userName = getLoggedInUser()?.fullName || '';
    
    let greeting, icon, message, subMessage;
    
    if (hour >= 5 && hour < 12) {
        greeting = 'صباح الخير';
        icon = '🌅';
        message = 'صباح النور والتفاؤل';
        subMessage = 'يوم دراسي جديد مليء بالإنجازات';
    } else if (hour >= 12 && hour < 16) {
        greeting = 'أهلاً بك';
        icon = '☀️';
        message = 'مساء الخير! وقت الظهيرة';
        subMessage = 'استمر في التفوق والتميز';
    } else if (hour >= 16 && hour < 20) {
        greeting = 'مساء الخير';
        icon = '🌤️';
        message = 'أتمنى لك مساءً هادئاً';
        subMessage = 'وقت ممتع للمراجعة والمذاكرة';
    } else if (hour >= 20 && hour < 24) {
        greeting = 'مساء النور';
        icon = '🌙';
        message = 'ليلة سعيدة ومباركة';
        subMessage = 'لا تنسَ أخذ قسط كافٍ من الراحة';
    } else {
        greeting = 'مرحباً';
        icon = '⭐';
        message = 'وقت متأخر من الليل';
        subMessage = 'أنصحك بالنوم باكراً لتصبح نشيطاً غداً';
    }
    
    // نصائح إضافية حسب الوقت
    let extraTip = '';
    if (hour >= 5 && hour < 8) {
        extraTip = '☕ وقت ممتاز لبدء يومك بفنجان قهوة';
    } else if (hour >= 12 && hour < 14) {
        extraTip = '🍽️ حان وقت الغداء، تناول وجبة صحية';
    } else if (hour >= 20 && hour < 22) {
        extraTip = '📚 وقت مثالي للمراجعة الهادئة';
    }
    
    return {
        greeting,
        icon,
        message,
        subMessage: extraTip || subMessage,
        fullMessage: `${icon} ${greeting}${userName ? ' ' + userName : ''}! ${message}`
    };
}

// عرض إشعار الترحيب
function showWelcomeNotification() {
    const welcome = getTimeBasedWelcome();
    const container = document.getElementById('welcomeNotificationContainer');
    
    if (!container) {
        // إنشاء العنصر إذا لم يكن موجوداً
        const notification = document.createElement('div');
        notification.id = 'welcomeNotificationContainer';
        notification.className = 'welcome-notification';
        notification.innerHTML = `
            <i class="fas ${getIconByTime()}"></i>
            <div>
                <div class="welcome-text"></div>
                <div class="welcome-sub"></div>
            </div>
        `;
        document.body.appendChild(notification);
    }
    
    const notification = document.getElementById('welcomeNotificationContainer');
    const welcomeText = notification?.querySelector('.welcome-text');
    const welcomeSub = notification?.querySelector('.welcome-sub');
    const welcomeIcon = notification?.querySelector('i');
    
    if (welcomeText) welcomeText.innerHTML = welcome.fullMessage;
    if (welcomeSub) welcomeSub.innerHTML = welcome.subMessage;
    if (welcomeIcon) {
        // تغيير الأيقونة حسب الوقت
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) welcomeIcon.className = 'fas fa-sun';
        else if (hour >= 12 && hour < 16) welcomeIcon.className = 'fas fa-cloud-sun';
        else if (hour >= 16 && hour < 20) welcomeIcon.className = 'fas fa-moon';
        else welcomeIcon.className = 'fas fa-star';
    }
    
    // إظهار الإشعار
    setTimeout(() => {
        notification?.classList.add('show');
    }, 500);
    
    // إخفاء الإشعار بعد 5 ثواني
    setTimeout(() => {
        notification?.classList.remove('show');
    }, 5000);
}

// الحصول على أيقونة حسب الوقت
function getIconByTime() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'fa-sun';
    if (hour >= 12 && hour < 16) return 'fa-cloud-sun';
    if (hour >= 16 && hour < 20) return 'fa-moon';
    return 'fa-star';
}

// ====================== تحديث دالة تسجيل الدخول لإضافة الكابتشا ======================

// حفظ الدالة الأصلية
const originalLoginHandler = document.getElementById('login-form')?.submit;

// تحديث مستمع حدث تسجيل الدخول
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;
    
    // إزالة المستمع القديم وإضافة مستمع جديد مع الكابتشا
    const oldSubmit = loginForm.onsubmit;
    loginForm.onsubmit = null;
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // التحقق من الكابتشا أولاً
        if (!verifyCaptcha()) {
            return;
        }
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn?.innerHTML || 'تسجيل الدخول';
        
        if (!username || !password) {
            showToastMessage('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور!', 'error');
            refreshCaptcha(); // تحديث الكابتشا عند الخطأ
            return;
        }
        
        if (submitBtn) {
            submitBtn.innerHTML = '⏳ جاري...';
            submitBtn.disabled = true;
        }
        
        try {
            const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                if (data.csrfToken) saveCsrfToken(data.csrfToken);
                if (data.user) saveUserData(data.user);
                
                // حفظ وقت آخر تسجيل دخول
                localStorage.setItem('last_login', new Date().toISOString());
                
                showToastMessage(`🎉 مرحباً ${data.user?.fullName || username}!`, 'success');
                
                // عرض إشعار الترحيب
                setTimeout(() => {
                    showWelcomeNotification();
                }, 500);
                
                setTimeout(() => {
                    if (data.user?.type === 'admin') {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'Home.html';
                    }
                }, 1500);
            } else {
                showToastMessage(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة!', 'error');
                refreshCaptcha(); // تحديث الكابتشا عند الخطأ
            }
        } catch (err) {
            console.error('Login Error:', err);
            showToastMessage('❌ فشل الاتصال بالخادم! تأكد من تشغيل السيرفر', 'error');
            refreshCaptcha();
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    });


    // ====================== إخفاء لينك إنشاء الحساب ======================
setTimeout(function() {
    if (sessionStorage.getItem('fromSignup') === 'true') {
        const signupLink = document.querySelector('.signup-link');
        if (signupLink) signupLink.style.display = 'none';
        sessionStorage.removeItem('fromSignup');
    }
}, 500);


    
    // تهيئة الكابتشا عند تحميل الصفحة
    refreshCaptcha();
    
    // عرض إشعار ترحيب عند تحميل الصفحة (للمستخدمين الزائرين)
    if (!getLoggedInUser()) {
        setTimeout(() => {
            const welcome = getTimeBasedWelcome();
            if (welcome.greeting) {
                showToastMessage(`${welcome.icon} ${welcome.greeting}! 👋`, 'info');
            }
        }, 1000);
    }
});

// حماية الصفحات
const currentPage = window.location.pathname.split('/').pop().toLowerCase();
const protectedPages = ['home.html', 'admin.html', 'profile.html', 'search-monthly.html', 'first-gards.html', 'exams.html', 'file-library.html', 'parent-dashboard.html'];

if (protectedPages.includes(currentPage)) {
    (async function checkAuth() {
        try {
            const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const response = await fetch(`${BASE_URL}/api/verify-session`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('غير مصرح');
            }
            
            const user = getLoggedInUser();
            
            if (user?.type === 'student' && currentPage === 'admin.html') {
                showToastMessage('⛔ غير مصرح لك بالدخول إلى لوحة الإدارة!', 'error');
                setTimeout(() => {
                    window.location.href = 'Home.html';
                }, 1500);
            }
        } catch (err) {
            showToastMessage('يرجى تسجيل الدخول أولاً!', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        }
    })();
}

setInterval(refreshSession, 55 * 60 * 1000);
