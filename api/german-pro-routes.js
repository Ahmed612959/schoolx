// ====================================================================
// German Pro — مدرّس ألماني احترافي متخصص في التمريض (Premium فقط)
// ====================================================================
// ملف مستقل عمداً (مش داخل server-index.js) عشان ميعرّضش السيرفر الأساسي
// لأي خطر أثناء التركيب. اربطه بسطرين بس في server-index.js (شوف التعليمات
// تحت آخر الملف).
//
// Env vars المطلوبة:
//   GERMAN_API_KEY   -> مفتاح Gemini API اللي جبته (مطلوب)
//   GEMINI_MODEL     -> اسم الموديل (اختياري، افتراضيًا 'gemini-3.6-flash')
//                       لو المفتاح بتاعك بيدعم موديل أحدث، حطه في المتغير ده
//                       من غير ما تلمس الكود.
// ====================================================================

const mongoose = require('mongoose');

const PREMIUM_KEY = 'premium_german_pro';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_HISTORY_TURNS = 16; // آخر كام رسالة (طالب+بوت) تتبعت كسياق خام
const META_START = '<<META>>';
const META_END = '<<END_META>>';

// -------------------- Schema --------------------
const germanProStateSchema = new mongoose.Schema({
    studentCode: { type: String, required: true, unique: true, index: true },
    fullName: String,

    level: { type: String, default: 'A0' }, // A0 قبل التقييم -> A1..C1
    placementDone: { type: Boolean, default: false },

    // الخطة الكاملة اللي الموديل بنفسه بيقترحها بعد التقييم المبدئي
    plan: [{
        id: String,
        track: { type: String, enum: ['general', 'nursing'], default: 'general' },
        title: String,
        level: String,
        objectives: [String],
        status: { type: String, enum: ['locked', 'active', 'done'], default: 'locked' }
    }],
    currentUnitId: { type: String, default: null },

    // ذاكرة الوحدات المخلّصة (ملخص قصير + مفردات أساسية) عشان الموديل "ميفتكرش"
    // بدل ما يبعت له كل الشات القديم كامل كل مرة (تكلفة وسياق أكبر من اللازم)
    completedUnits: [{
        unitId: String,
        title: String,
        summary: String,
        keyVocab: [String],
        completedAt: { type: Date, default: Date.now }
    }],

    // آخر رسايل خام (سياق قريب) — بيتقص لآخر MAX_HISTORY_TURNS
    history: [{
        role: { type: String, enum: ['user', 'model'] },
        content: String,
        ts: { type: Date, default: Date.now }
    }],

    totalMessages: { type: Number, default: 0 },
}, { timestamps: true });

const GermanProState = mongoose.models.GermanProState ||
    mongoose.model('GermanProState', germanProStateSchema);

// -------------------- System Prompt --------------------
function buildSystemPrompt(state) {
    const planText = state.plan.length
        ? state.plan.map((u, i) =>
            `${i + 1}. [${u.status === 'done' ? '✅' : u.status === 'active' ? '▶️' : '🔒'}] (${u.track === 'nursing' ? 'تمريض' : 'عام'}/${u.level}) ${u.title} — id:${u.id}`
          ).join('\n')
        : '(لسه معملتش خطة — لو التقييم المبدئي خلص، اقترح خطة دلوقتي)';

    const memoryText = state.completedUnits.length
        ? state.completedUnits.map(u =>
            `- ${u.title}: ${u.summary} | أهم مفردات: ${(u.keyVocab || []).join('، ')}`
          ).join('\n')
        : '(لسه مفيش وحدات متخلّصة)';

    const currentUnit = state.plan.find(u => u.id === state.currentUnitId);
    const studentName = (state.fullName || '').trim();

    return `أنت "Herr/Frau Professional" — مدرّس لغة ألمانية معتمد (بمستوى Goethe-Institut/telc)
متخصص تحديدًا في الألمانية الطبية والتمريضية (Fachsprache Pflege/Medizin) للطلاب
الناطقين بالعربية اللي بيتجهزوا للعمل أو الدراسة في مجال التمريض بألمانيا/النمسا/سويسرا.
أنت أفضل وأدق بكتير من أي شات بوت عادي — دقيق، منظم، صبور، ومحترف زي مدرّس حقيقي في معهد.

👤 اسم الطالب اللي بتكلمه دلوقتي: "${studentName || 'غير معروف'}"
${studentName
    ? `- نادِ عليه باسمه ("${studentName}") بطريقة طبيعية بين وقت وآخر (مش في كل رسالة عشان
   ميبقاش مصطنع) — في الترحيب، لما تشجعه، أو لما تقدّم وحدة جديدة. متسألوش عن اسمه، انت عارفه.`
    : '- الاسم مش متسجل، فكلمه بأسلوب مباشر ومحترم من غير ما تخترع اسم.'}

🧩 إطار مهاراتك الاحترافية (استخدمها كمرجع فعلي في كل رد، مش مجرد قائمة شكلية):
أنت متمكّن من عشرات المهارات التربوية واللغوية المتخصصة، موزّعة على المحاور دي:
1. الصوتيات والنطق: كل حروف وأصوات الألمانية (Umlaute ä/ö/ü، ß، ch/sch/pf/ei/eu/ie)،
   تصحيح النطق كلمة بكلمة، الفرق بين النطق الرسمي ولهجات الحديث اليومي، إيقاع الجملة
   والتنغيم (Satzmelodie)، تمارين نطق تدريجية (منفرد → مقطع → كلمة → جملة).
2. القواعد من الصفر للاحتراف (A1→C1): الأزمنة كلها، حالات الإعراب الأربعة (Nominativ/
   Akkusativ/Dativ/Genitiv)، أدوات التعريف والتنكير، الأفعال المنفصلة وغير المنفصلة،
   ترتيب الجملة الألماني (Verb-Zweit)، الجمل الشرطية والمركبة، الصفات وتصريفها، الأفعال
   الشكلية (Modalverben)، المبني للمجهول (Passiv)، Konjunktiv II للتهذيب والافتراض.
3. المفردات والمحادثة اليومية العامة: تعارف، سكن، مواصلات، تسوق، طقس، مواعيد، بنوك،
   بيروقراطية ألمانية (Anmeldung، Behörden)، مكالمات تليفون، كتابة إيميلات رسمية وغير رسمية.
4. الألمانية التمريضية العامة (Fachsprache Pflege): استقبال المريض وتسجيل بياناته، أخذ
   العلامات الحيوية والتاريخ المرضي (Anamnese)، تسليم واستلام الشيفت (Übergabe)، مصطلحات
   الأدوية والجرعات وطرق الإعطاء، أدوات ومعدات التمريض، خطة الرعاية التمريضية (Pflegeplan).
5. تخصصات طبية فرعية: باطنة، جراحة، أطفال، نساء وتوليد، نفسية، طوارئ وإسعاف، رعاية
   كبار السن (Altenpflege)، عناية مركزة — لكل تخصص مفرداته وسيناريوهاته الخاصة.
6. التواصل الإنساني: التعاطف مع المريض، تهدئة القلق، شرح إجراء طبي ببساطة، التعامل مع
   شكوى أو غضب مريض/أهل، إيصال خبر صعب بحرص، احترام الفروق الثقافية والدينية للمريض.
7. التواصل مع الفريق الطبي: الحديث مع الطبيب المسؤول، كتابة وقراءة التقارير الطبية،
   المشاركة في الجولة الطبية (Visite)، التنسيق مع فريق التمريض والإدارة.
8. الكتابة الطبية الرسمية: توثيق الملاحظات التمريضية، تعبئة النماذج والاستمارات، صياغة
   تقرير حادثة أو تطور حالة، المصطلحات المختصرة الشائعة في الملفات الطبية الألمانية.
9. الاستماع والفهم السمعي: فهم تعليمات شفهية سريعة، فهم لهجات ألمانية مختلفة (نمساوية/
   سويسرية/شمال-جنوب ألمانيا)، فهم الإعلانات في المستشفى ونداءات الطوارئ.
10. القراءة الطبية: قراءة نشرات الأدوية، لافتات المستشفى، تعليمات السلامة، تقارير مختصرة.
11. التحضير للامتحانات الرسمية: بنية اختبار telc Pflege B1/B2 وGoethe-Zertifikat، أسئلة
    نموذجية، إدارة وقت الامتحان، أخطاء شائعة يقع فيها المتقدمون العرب تحديدًا.
12. الثقافة المهنية الألمانية: آداب بيئة العمل، التسلسل الإداري، المواعيد والالتزام
    بالوقت، طريقة التعامل الرسمية مقابل غير الرسمية (Sie/du)، إجازات وحقوق العامل.
13. أساليب تربوية وتقييم: تكييف الشرح حسب مستوى الطالب الفعلي (مش المفترض)، تصحيح
    الأخطاء بلطف مع توضيح السبب النحوي، التحفيز الإيجابي المستمر، أسئلة تقييم متدرجة
    الصعوبة، اكتشاف نقاط الضعف الخفية والعمل عليها بهدوء من غير ما "يفضحها" للطالب.
14. الذاكرة والمراجعة الذكية: تكرار متباعد (Spaced Repetition) للمفردات القديمة، ربط
    الوحدة الجديدة بالسابقة، اختبارات مراجعة دورية قصيرة، تلخيص الجلسة في النهاية.
(الإطار ده بيغطي أكتر من 300 مهارة فرعية فعلية موزّعة على المحاور التلاتاشر دول —
اعتبره خلفيتك المهنية الكاملة وطبّقها حسب اللي محتاجه الطالب في كل لحظة، من غير
ما تسردها له كقائمة — هو محتاج يحسّ إنك بتستخدمها مش إنك بتقرأها.)

🎯 مهمتك (بالترتيب):
1) لو الطالب جديد (level=A0 و placementDone=false): اعمل تقييم مبدئي سريع وودود
   (كام سؤال بسيط: هل درس ألماني قبل كده؟ يعرف يقرأ الحروف؟ جرّب يترجم/ينطق جملة بسيطة؟)
   عشان تحدد نقطة البداية الصح (ممكن يكون فعلاً من الصفر).
2) بعد التقييم مباشرة، اقترح خطة تعلّم كاملة مقسّمة لوحدات (units) متسلسلة ومترابطة،
   بتمزج 3 مسارات مع بعض بشكل متوازن:
   - أساسيات اللغة (حروف، نطق، قواعد، جمل يومية عامة)
   - محادثات يومية عامة (تعارف، سفر، سوق، مواصلات...)
   - ألمانية التمريض/المستشفى (Fachsprache Pflege): استقبال مريض، قياس العلامات
     الحيوية، تسليم الشيفت (Übergabe), أدوية وجرعات, تواصل مع الطبيب/المريض/الأهل,
     مصطلحات تشريح وأعضاء, حالات طوارئ, أوراق ونماذج طبية، تعبيرات التعاطف والدعم النفسي للمريض.
   اعرض الخطة كاملة للطالب في رسالتك بشكل مرتب وواضح (نص عادي، مش JSON) قبل ما تبدأ.
3) بعد كده امشِ وحدة وحدة بالترتيب. في كل وحدة:
   - علّم المفردات والجمل الجديدة، وديمًا اكتب النطق الصحيح لكل كلمة/جملة ألمانية
     بصيغتين: [IPA] + نطق تقريبي بالعربي بين قوسين، مثال: Krankenschwester [kʁaŋkn̩ˌʃvɛstɐ] (كرانكن-شفيستَر).
   - اشرح القاعدة النحوية المرتبطة ببساطة مع أمثلة من نفس سياق التمريض قدر الإمكان.
   - اعمل تمارين وأسئلة تفاعلية قصيرة أثناء الشرح مش بس في الآخر.
   - في نهاية الوحدة اعمل اختبار فهم قصير (5-8 أسئلة/مواقف)، وقيّم إجابات الطالب بصراحة.
   - لو الطالب مستوعب (أغلب الإجابات صح): اعتبر الوحدة خلصت، لخّص أهم حاجة اتعلمها في
     سطرين، وابدأ الوحدة اللي بعدها في نفس الرد أو اللي بعده.
   - لو مش مستوعب: راجع بطريقة مختلفة (أمثلة أكتر/أبسط) قبل ما تكمل، وما تديش انطباع إنه فشل.
4) قبل ما تبدأ أي وحدة جديدة، اربطها بسرعة بحاجة اتعلمها قبل كده (تكرار متباعد Spaced
   Repetition) عشان المعلومات القديمة متتنساش — استخدم "ذاكرة الوحدات المخلّصة" تحت.
5) خليك دايمًا مشجّع ومحترف، صحّح الأخطاء بلطف ووضّح ليه غلط، واستخدم اللغة العربية
   للشرح مع دمج الألماني كمحتوى تعليمي (مش العكس).

⚠️ قاعدة تقنية إلزامية جدًا: في **آخر** كل رد منك، وبعد كل اللي هيشوفه الطالب، لازم
تضيف بلوك ميتاداتا مخفي (الطالب مش هيشوفه، هيتشال قبل ما يوصله) بالشكل ده بالظبط:

${META_START}
{
  "level": "A1",
  "placementDone": true,
  "plan": [ {"id":"u1","track":"general","title":"...","level":"A1","status":"active"}, ... ],
  "currentUnitId": "u1",
  "unitJustCompleted": null,
  "unitSummary": null,
  "keyVocab": []
}
${META_END}

- لو الخطة اتحطت قبل كده (شايفها تحت في "الخطة الحالية")، ابعتها تاني كاملة زي ما هي
  (غيّر بس status لو اتغيّر)، متبعتش خطة فاضية أو تنسى وحدات.
- لو وحدة خلصت دلوقتي في الرد ده: حط unitJustCompleted = id بتاعها، و unitSummary
  ملخص سطرين، و keyVocab لستة أهم 5-10 كلمات اتعلمت فيها، وخلي status بتاعها "done"
  و status بتاع اللي بعدها "active" و currentUnitId = الوحدة الجديدة.
- لو لسه مفيش خطة (أول تقييم لسه شغال): ابعت plan: [] و placementDone: false.
- ابعت الـ JSON صحيح 100% (مفيش تعليقات جوه الـ JSON)، وميتكتبش أي حاجة بعد ${META_END}.

📋 الخطة الحالية:
${planText}

📚 الوحدة النشطة دلوقتي: ${currentUnit ? `${currentUnit.title} (${currentUnit.track}, ${currentUnit.level})` : 'لسه مفيش'}

🧠 ذاكرة الوحدات اللي خلصت (استخدمها للربط والمراجعة، ما تكررش شرحها من الصفر):
${memoryText}

مستوى الطالب الحالي: ${state.level}`;
}

// -------------------- Gemini call --------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGemini(systemPrompt, historyMsgs, userMessage) {
    const apiKey = process.env.GERMAN_API_KEY;
    if (!apiKey) throw new Error('GERMAN_API_KEY مش متظبط في environment variables');

    const contents = [
        ...historyMsgs.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: userMessage }] }
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 }
        // ملحوظة: متشلش temperature/top_p/top_k هنا — جوجل بتتجاهلهم مع
        // موديلات Gemini 3.x دلوقتي، وبتقول إن الإصدارات الجاية ممكن ترفضهم
        // بخطأ 400 لو اتبعتوا، فالأسلم إننا نسيبهم من غير ما نحطهم أصلًا.
    });

    // Gemini بيرجع 503/429 بشكل مؤقت وقت الضغط العالي — نعيد المحاولة 3 مرات
    // بفاصل متزايد (1s, 2.5s, 5s) قبل ما نستسلم فعلاً.
    const RETRYABLE = [429, 500, 503];
    const MAX_ATTEMPTS = 3;
    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });

        if (resp.ok) {
            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
            if (!text) throw new Error('رد فاضي من Gemini — راجع الـ API key أو اسم الموديل');
            return text;
        }

        const errText = await resp.text().catch(() => '');
        lastErr = new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 300)}`);

        if (RETRYABLE.includes(resp.status) && attempt < MAX_ATTEMPTS) {
            await sleep(attempt * 1500 - 500); // 1s, 2.5s
            continue;
        }
        break;
    }

    if (lastErr && lastErr.message.includes('503')) {
        throw new Error('السيرفر بتاع Gemini مزحوم دلوقتي (ضغط عالي مؤقت من جوجل نفسها). جرّب تبعت رسالتك تاني بعد شوية.');
    }
    throw lastErr;
}

// -------------------- Parse + strip metadata --------------------
function extractMeta(rawText) {
    const start = rawText.indexOf(META_START);
    const end = rawText.indexOf(META_END);
    if (start === -1 || end === -1 || end < start) {
        return { visibleText: rawText.trim(), meta: null };
    }
    const visibleText = (rawText.slice(0, start) + rawText.slice(end + META_END.length)).trim();
    const jsonRaw = rawText.slice(start + META_START.length, end).trim();
    let meta = null;
    try { meta = JSON.parse(jsonRaw); } catch (e) { meta = null; }
    return { visibleText, meta };
}

// -------------------- Route registration --------------------
module.exports = function registerGermanProRoutes(app, deps) {
    const { verifyToken, isAdmin, connectToDatabase, Student } = deps;
    if (!verifyToken || !connectToDatabase || !Student) {
        throw new Error('german-pro-routes: deps ناقصة (verifyToken/connectToDatabase/Student)');
    }

    // طالب Premium بالميزة دي، أو أدمن
    async function requireGermanPremium(req, res, next) {
        try {
            if (req.user?.type === 'admin') return next();
            await connectToDatabase();
            const student = await Student.findById(req.user.id).select('premiumFeatures fullName studentCode');
            if (!student || !student.premiumFeatures?.includes(PREMIUM_KEY)) {
                return res.status(403).json({ error: 'الميزة دي متاحة لطلاب Premium فقط (German Pro)' });
            }
            req.germanStudent = student;
            next();
        } catch (e) {
            res.status(500).json({ error: 'خطأ في التحقق من الاشتراك: ' + e.message });
        }
    }

    async function loadOrCreateState(studentCode, fullName) {
        let state = await GermanProState.findOne({ studentCode });
        if (!state) {
            state = await GermanProState.create({ studentCode, fullName });
        } else if (fullName && state.fullName !== fullName) {
            // مزامنة الاسم لو اتغيّر أو كان فاضي وقت إنشاء الحالة لأول مرة
            state.fullName = fullName;
            await state.save();
        }
        return state;
    }

    // حالة الطالب الحالية (بيستخدمها الفرونت إند لعرض الخطة والتقدم)
    app.get('/api/german-pro/state', verifyToken, requireGermanPremium, async (req, res) => {
        try {
            await connectToDatabase();
            const s = req.germanStudent || await Student.findById(req.user.id).select('fullName studentCode');
            const state = await loadOrCreateState(s.studentCode, s.fullName);
            res.json({
                success: true,
                level: state.level,
                placementDone: state.placementDone,
                plan: state.plan,
                currentUnitId: state.currentUnitId,
                completedUnits: state.completedUnits,
                history: state.history.slice(-MAX_HISTORY_TURNS)
            });
        } catch (e) {
            res.status(500).json({ error: 'خطأ في تحميل الحالة: ' + e.message });
        }
    });

    // إرسال رسالة للمدرّس
    app.post('/api/german-pro/message', verifyToken, requireGermanPremium, async (req, res) => {
        try {
            const { message } = req.body;
            if (!message || typeof message !== 'string' || !message.trim()) {
                return res.status(400).json({ error: 'اكتب رسالة الأول' });
            }
            await connectToDatabase();
            const s = req.germanStudent || await Student.findById(req.user.id).select('fullName studentCode');
            const state = await loadOrCreateState(s.studentCode, s.fullName);

            const systemPrompt = buildSystemPrompt(state);
            const recentHistory = state.history.slice(-MAX_HISTORY_TURNS);

            const rawReply = await callGemini(systemPrompt, recentHistory, message.trim());
            const { visibleText, meta } = extractMeta(rawReply);

            // حدّث الحالة بناءً على الميتاداتا (لو اتبعتت وصحيحة)
            if (meta) {
                if (typeof meta.level === 'string') state.level = meta.level;
                if (typeof meta.placementDone === 'boolean') state.placementDone = meta.placementDone;
                if (Array.isArray(meta.plan) && meta.plan.length) {
                    state.plan = meta.plan.map(u => ({
                        id: String(u.id || '').slice(0, 40),
                        track: u.track === 'nursing' ? 'nursing' : 'general',
                        title: String(u.title || '').slice(0, 200),
                        level: String(u.level || state.level).slice(0, 10),
                        objectives: Array.isArray(u.objectives) ? u.objectives.slice(0, 10).map(String) : [],
                        status: ['locked', 'active', 'done'].includes(u.status) ? u.status : 'locked'
                    }));
                }
                if (meta.currentUnitId) state.currentUnitId = String(meta.currentUnitId).slice(0, 40);
                if (meta.unitJustCompleted) {
                    state.completedUnits.push({
                        unitId: String(meta.unitJustCompleted).slice(0, 40),
                        title: state.plan.find(u => u.id === meta.unitJustCompleted)?.title || '',
                        summary: String(meta.unitSummary || '').slice(0, 500),
                        keyVocab: Array.isArray(meta.keyVocab) ? meta.keyVocab.slice(0, 15).map(String) : []
                    });
                }
            }

            state.history.push({ role: 'user', content: message.trim() });
            state.history.push({ role: 'model', content: visibleText });
            if (state.history.length > MAX_HISTORY_TURNS * 3) {
                state.history = state.history.slice(-MAX_HISTORY_TURNS * 2);
            }
            state.totalMessages += 1;
            await state.save();

            res.json({
                success: true,
                reply: visibleText,
                level: state.level,
                plan: state.plan,
                currentUnitId: state.currentUnitId,
                completedUnits: state.completedUnits
            });
        } catch (e) {
            console.error('❌ german-pro/message error:', e.message);
            res.status(500).json({ error: 'خطأ في الرد: ' + e.message });
        }
    });

    // تصفير كامل (الطالب يعيد التقييم من الصفر)
    app.post('/api/german-pro/reset', verifyToken, requireGermanPremium, async (req, res) => {
        try {
            await connectToDatabase();
            const s = req.germanStudent || await Student.findById(req.user.id).select('fullName studentCode');
            await GermanProState.findOneAndUpdate(
                { studentCode: s.studentCode },
                { $set: { level: 'A0', placementDone: false, plan: [], currentUnitId: null, completedUnits: [], history: [], totalMessages: 0 } },
                { upsert: true }
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'خطأ في التصفير: ' + e.message });
        }
    });

    // (اختياري) الأدمن يقدر يشوف حالة أي طالب بالكود بتاعه
    app.get('/api/admin/german-pro/:studentCode', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase();
            const state = await GermanProState.findOne({ studentCode: req.params.studentCode });
            if (!state) return res.status(404).json({ error: 'الطالب لسه مبدأش German Pro' });
            res.json({ success: true, state });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    console.log('✅ German Pro routes registered (/api/german-pro/*)');
};
