here// ============================================
// إعدادات الـ API
// ============================================
const API_KEY = 'sk-ws-H.EMMRHHI.HJbB.MEQCIHBBVjVPqKbNZBgjl5uadt3sFpqii2FfTIks1CzdA_mvAiAbTVzNdh6lm2Z9pjTajTeIS2l03IN-v6U8p_HYb1jxFg';
const API_URL = 'https://ws-r69cgehm23x9k0v2.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

// قائمة النماذج اللي هنجربها بالترتيب
const MODELS_TO_TRY = [
    'qwen-turbo',
    'qwen-plus',
    'qwen-max',
    'qwen-long',
    'qwen2.5-72b-instruct',
    'qwen2.5-32b-instruct',
    'qwen2.5-14b-instruct',
    'qwen2.5-7b-instruct'
];

// ============================================
// المتغيرات العامة
// ============================================
let conversationHistory = [];
let activeModel = null;
let isInitialized = false;

// ============================================
// عناصر الصفحة
// ============================================
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const activeModelDisplay = document.getElementById('active-model');

// ============================================
// System Prompt - متخصص في التمريض
// ============================================
const SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في مجال التمريض والرعاية الصحية. 
مهمتك:
- الإجابة على الأسئلة الطبية والتمريضية بدقة واحترافية
- تقديم معلومات عن الإجراءات التمريضية والأدوية والأمراض
- شرح المفاهيم الطبية بطريقة واضحة
- دائماً تنبّه المستخدم بضرورة استشارة الطبيب المختص للحالات الحرجة
- تتحدث باللغة العربية بشكل واضح ومنظم
- تستخدم المصطلحات الطبية الصحيحة مع شرحها`;

// ============================================
// التهيئة عند فتح الصفحة
// ============================================
window.onload = async () => {
    // تحميل المحادثة المحفوظة
    loadConversation();
    
    // محاولة تحديد النموذج المناسب
    await detectWorkingModel();
    
    // لو مفيش محادثة محفوظة، نضيف رسالة ترحيب
    if (conversationHistory.length === 0) {
        addMessage('مرحباً! أنا مساعدك الذكي للتمريض 🩺\n\nكيف يمكنني مساعدتك اليوم؟\n\n💡 يمكنك سؤالي عن:\n• الإجراءات التمريضية\n• الأدوية وجرعاتها\n• الأمراض وأعراضها\n• الرعاية الصحية العامة', 'ai');
    }
};

// ============================================
// تحديد النموذج الشغّال تلقائياً
// ============================================
async function detectWorkingModel() {
    updateModelStatus('جاري تحديد النموذج المناسب...');
    
    for (const model of MODELS_TO_TRY) {
        console.log(`🔄 تجربة النموذج: ${model}`);
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'مرحبا' }],
                    max_tokens: 5
                })
            });
            
            if (response.ok) {
                activeModel = model;
                updateModelStatus(`✅ ${model}`);
                console.log(`✅ النموذج الشغّال: ${model}`);
                return;
            } else {
                const error = await response.json().catch(() => ({}));
                console.warn(`⚠️ ${model} فشل:`, error.error?.message || response.status);
            }
        } catch (error) {
            console.warn(`⚠️ ${model} خطأ:`, error.message);
        }
    }
    
    // لو مفيش نموذج اشتغل
    updateModelStatus('❌ لم يتم العثور على نموذج متاح');
    addMessage('⚠️ تحذير: لم يتم العثور على نموذج متاح. تأكد من:\n1. صحة الـ API Key\n2. تفعيل النماذج في لوحة التحكم\n3. وجود رصيد كافٍ', 'error');
}

// ============================================
// إرسال الرسالة
// ============================================
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    
    // لو مفيش نموذج شغّال، نحاول نحدد واحد
    if (!activeModel) {
        await detectWorkingModel();
        if (!activeModel) {
            addMessage('⚠️ لا يمكن إرسال الرسالة - لا يوجد نموذج متاح', 'error');
            return;
        }
    }
    
    // إضافة رسالة المستخدم
    addMessage(message, 'user');
    userInput.value = '';
    sendBtn.disabled = true;
    showLoading();
    
    // بناء قائمة الرسائل مع System Prompt
    const messagesToSend = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: message }
    ];
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: activeModel,
                messages: messagesToSend,
                temperature: 0.7,
                max_tokens: 2000
            })
        });
        
        // لو النموذج الحالي فشل، نجرب الباقين
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('خطأ من الـ API:', errorData);
            
            if (response.status === 403 || response.status === 401) {
                addMessage(`⚠️ النموذج ${activeModel} توقف عن العمل. جاري البحث عن بديل...`, 'error');
                activeModel = null;
                await detectWorkingModel();
                hideLoading();
                sendBtn.disabled = false;
                
                if (activeModel) {
                    // إعادة المحاولة تلقائياً
                    setTimeout(sendMessage, 500);
                }
                return;
            }
            
            throw new Error(errorData.error?.message || `خطأ HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        // إضافة رد الـ AI
        addMessage(aiResponse, 'ai');
        
        // حفظ في التاريخ
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiResponse }
        );
        
        // حفظ في localStorage
        saveConversation();
        
    } catch (error) {
        console.error('Error:', error);
        
        let errorMsg = '⚠️ عذراً، حدث خطأ';
        
        if (error.message.includes('Failed to fetch')) {
            errorMsg += ': تعذر الاتصال بالخادم. تأكد من:\n• اتصالك بالإنترنت\n• تشغيل الصفحة من server محلي (مش كملف HTML)';
        } else if (error.message.includes('CORS')) {
            errorMsg += ': مشكلة CORS. شغّل الصفحة من server محلي باستخدام:\npython server.py';
        } else {
            errorMsg += `: ${error.message}`;
        }
        
        addMessage(errorMsg, 'error');
    } finally {
        hideLoading();
        sendBtn.disabled = false;
        userInput.focus();
    }
}

// ============================================
// دوال عرض الرسائل
// ============================================
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.id = 'loading';
    loadingDiv.textContent = '🤔 المساعد يفكر';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.remove();
}

function updateModelStatus(text) {
    activeModelDisplay.textContent = text;
}

// ============================================
// حفظ وتحميل المحادثة
// ============================================
function saveConversation() {
    try {
        localStorage.setItem('nursing_chat_history', JSON.stringify(conversationHistory));
        if (activeModel) {
            localStorage.setItem('nursing_active_model', activeModel);
        }
    } catch (e) {
        console.warn('فشل حفظ المحادثة:', e);
    }
}

function loadConversation() {
    try {
        const saved = localStorage.getItem('nursing_chat_history');
        if (saved) {
            conversationHistory = JSON.parse(saved);
            // إعادة عرض المحادثة
            conversationHistory.forEach(msg => {
                if (msg.role === 'user') {
                    addMessage(msg.content, 'user');
                } else if (msg.role === 'assistant') {
                    addMessage(msg.content, 'ai');
                }
            });
        }
        
        const savedModel = localStorage.getItem('nursing_active_model');
        if (savedModel) {
            activeModel = savedModel;
            updateModelStatus(`✅ ${savedModel} (محفوظ)`);
        }
    } catch (e) {
        console.warn('فشل تحميل المحادثة:', e);
    }
}

// ============================================
// مسح المحادثة
// ============================================
function clearConversation() {
    if (confirm('هل أنت متأكد من مسح المحادثة؟')) {
        conversationHistory = [];
        chatMessages.innerHTML = '';
        localStorage.removeItem('nursing_chat_history');
        addMessage('تم مسح المحادثة ✅\n\nكيف يمكنني مساعدتك؟', 'ai');
    }
}

// ============================================
// الأحداث
// ============================================
sendBtn.addEventListener('click', sendMessage);

clearBtn.addEventListener('click', clearConversation);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ============================================
// كود تشخيصي - للتطوير فقط
// ============================================
// لو عايز تشخص النماذج المتاحة، افتح Console (F12) واكتب:
// diagnoseModels();
window.diagnoseModels = async () => {
    console.log('🔍 جاري فحص النماذج المتاحة...\n');
    
    for (const model of MODELS_TO_TRY) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1
                })
            });
            
            const status = response.ok ? '✅ متاح' : `❌ ${response.status}`;
            console.log(`${model}: ${status}`);
        } catch (error) {
            console.log(`${model}: ❌ خطأ - ${error.message}`);
        }
    }
};
