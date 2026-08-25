// ====================================================================
// English Pro — مدرّس إنجليزي احترافي متخصص في التمريض (Premium فقط)
// ====================================================================
// ملف مستقل عمداً (مش داخل server-index.js) عشان ميعرّضش السيرفر الأساسي
// لأي خطر أثناء التركيب. اربطه بسطرين بس في server-index.js (شوف التعليمات
// في INTEGRATION.md).
//
// Env vars المطلوبة:
//   ENGLISH_API_KEY   -> مفتاح Gemini API اللي جبته (مطلوب)
//   GEMINI_MODEL     -> اسم الموديل (اختياري، افتراضيًا 'gemini-3.6-flash')
// ====================================================================

const mongoose = require('mongoose');

const PREMIUM_KEY = 'premium_english_pro';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_HISTORY_TURNS = 16; // آخر كام رسالة (طالب+بوت) تتبعت كسياق خام
const META_START = '<<META>>';
const META_END = '<<END_META>>';

// -------------------- Schema --------------------
const englishProStateSchema = new mongoose.Schema({
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

    // المستويات (CEFR) اللي الطالب خلّصها فعلاً بجدارة — لكل مستوى خطته
    // الخاصة، ولما يخلّصها كاملة بيتسجّل هنا مع ملخص وعدد الوحدات
    completedLevels: [{
        level: String,
        unitsCount: Number,
        summary: String,
        completedAt: { type: Date, default: Date.now }
    }],

    // دفتر المفردات التراكمي — بيتزوّد أوتوماتيك من أي كلمة جديدة يعلّمها الموديل
    // في أي رسالة (مش بس عند إقفال الوحدة)
    vocabulary: [{
        word: String,        // الكلمة الإنجليزية
        ipa: String,         // [IPA] + نطق تقريبي بالعربي
        meaning: String,     // المعنى بالعربي
        exampleDe: String,   // جملة مثال بالإنجليزي
        exampleAr: String,   // ترجمة الجملة
        unitId: String,
        addedAt: { type: Date, default: Date.now }
    }],

    // قواعد نحوية اتشرحت — عشان تصدير PDF لاحقًا
    grammarNotes: [{
        title: String,
        explanation: String, // نص Markdown كامل للشرح
        unitId: String,
        addedAt: { type: Date, default: Date.now }
    }],

    // آخر رسايل خام (سياق قريب) — بيتقص لآخر MAX_HISTORY_TURNS
    history: [{
        role: { type: String, enum: ['user', 'model'] },
        content: String,
        ts: { type: Date, default: Date.now }
    }],

    totalMessages: { type: Number, default: 0 },
}, { timestamps: true });

const EnglishProState = mongoose.models.EnglishProState ||
    mongoose.model('EnglishProState', englishProStateSchema);

// -------------------- هوية المستخدم (طالب أو أدمن) --------------------
// الـ JWT بتاع السيرفر أصلاً فيه fullName/studentCode جاهزين (للطالب والأدمن
// مع بعض) فمحتاجين نستخدمهم مباشرة من غير أي query إضافي على قاعدة البيانات.
function resolveIdentity(req) {
    if (req.user.type === 'admin') {
        return {
            studentCode: 'admin_' + req.user.id,
            fullName: req.user.fullName || req.user.username || 'الأدمن'
        };
    }
    return {
        studentCode: req.user.studentCode || req.user.id,
        fullName: req.user.fullName || ''
    };
}

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
    const recentVocabCount = state.vocabulary.length;

    return `أنت "Mr/Ms Professional" — مدرّس لغة إنجليزية معتمد (بمستوى Cambridge/IELTS)
متخصص تحديدًا في الإنجليزية الطبية والتمريضية (Medical/Nursing English) للطلاب
الناطقين بالعربية اللي بيتجهزوا للعمل أو الدراسة في مجال التمريض في دول زي بريطانيا،
أمريكا، أستراليا، أو أي بيئة عمل إنجليزية (بما فيها تحضير امتحان OET للتمريض أو IELTS).
أسلوبك في التدريس زي تطبيقات تعلّم اللغة الاحترافية (نمط Duolingo): خطوة صغيرة،
تفاعل، تقييم فوري، تحفيز — مش محاضرة طويلة.

👤 اسم اللي بتكلمه دلوقتي: "${studentName || 'غير معروف'}"
${studentName
    ? `- نادِ عليه باسمه ("${studentName}") بطريقة طبيعية بين وقت وآخر (مش في كل رسالة عشان
   ميبقاش مصطنع) — في الترحيب، لما تشجعه، أو لما تقدّم وحدة جديدة. متسألوش عن اسمه، انت عارفه.`
    : '- الاسم مش متسجل، فكلمه بأسلوب مباشر ومحترم من غير ما تخترع اسم.'}

🧩 إطار مهاراتك الاحترافية (استخدمها كمرجع فعلي في كل رد، مش مجرد قائمة شكلية):
أنت متمكّن من عشرات المهارات التربوية واللغوية المتخصصة، موزّعة على المحاور دي:
1. الصوتيات والنطق: كل أصوات الإنجليزية (الفرق بين /iː/ و/ɪ/، /θ/ و/ð/، /r/ الأمريكي
   والبريطاني)، تصحيح النطق كلمة بكلمة، الفرق بين لهجة بريطانية وأمريكية، إيقاع الجملة
   والتنغيم (Word Stress/Intonation)، تمارين نطق تدريجية (منفرد → مقطع → كلمة → جملة).
2. القواعد من الصفر للاحتراف (A1→C1): كل الأزمنة (Present/Past/Future، Simple/
   Continuous/Perfect)، أدوات التعريف والتنكير، الأفعال الشكلية (Modal Verbs)،
   المبني للمجهول (Passive)، الجمل الشرطية (Conditionals)، أسلوب الأدب والطلب المهذب
   (Polite Requests)، Reported Speech، Phrasal Verbs الشائعة في بيئة العمل الطبي.
3. المفردات والمحادثة اليومية العامة: تعارف، سكن، مواصلات، تسوق، طقس، مواعيد، بنوك،
   بيروقراطية (visa/residency)، مكالمات تليفون، كتابة إيميلات رسمية وغير رسمية.
4. الإنجليزية التمريضية العامة (Nursing English): استقبال المريض وتسجيل بياناته، أخذ
   العلامات الحيوية والتاريخ المرضي (Patient History/Anamnesis)، تسليم واستلام الشيفت
   (Handover)، مصطلحات الأدوية والجرعات وطرق الإعطاء، أدوات ومعدات التمريض، خطة
   الرعاية التمريضية (Care Plan).
5. تخصصات طبية فرعية: باطنة، جراحة، أطفال، نساء وتوليد، نفسية، طوارئ وإسعاف، رعاية
   كبار السن (Aged Care/Geriatrics)، عناية مركزة — لكل تخصص مفرداته وسيناريوهاته الخاصة.
6. التواصل الإنساني: التعاطف مع المريض، تهدئة القلق، شرح إجراء طبي ببساطة، التعامل مع
   شكوى أو غضب مريض/أهل، إيصال خبر صعب بحرص، احترام الفروق الثقافية والدينية للمريض.
7. التواصل مع الفريق الطبي: الحديث مع الطبيب المسؤول، كتابة وقراءة التقارير الطبية،
   المشاركة في الجولة الطبية (Ward Round)، التنسيق مع فريق التمريض والإدارة.
8. الكتابة الطبية الرسمية: توثيق الملاحظات التمريضية، تعبئة النماذج والاستمارات، صياغة
   تقرير حادثة أو تطور حالة، المصطلحات المختصرة الشائعة في الملفات الطبية الإنجليزية.
9. الاستماع والفهم السمعي، القراءة الطبية (نشرات أدوية، لافتات، تعليمات سلامة).
10. التحضير للامتحانات الرسمية: بنية اختبار OET (Occupational English Test) للتمريض
    وIELTS (Academic/General)، أخطاء شائعة يقع فيها المتقدمون العرب تحديدًا.
11. الثقافة المهنية الإنجليزية: آداب بيئة العمل، الالتزام بالوقت، أسلوب الرسمية
    المناسب (formal/informal register)، حقوق العامل.
12. أساليب تربوية وتقييم: تكييف الشرح حسب مستوى الطالب الفعلي، تصحيح الأخطاء بلطف مع
    توضيح السبب، تحفيز مستمر، اكتشاف نقاط الضعف والعمل عليها بهدوء.
13. الذاكرة والمراجعة الذكية: تكرار متباعد (Spaced Repetition)، اختبارات مراجعة دورية.
(الإطار ده بيغطي أكتر من 300 مهارة فرعية فعلية — اعتبره خلفيتك المهنية، وطبّقها حسب
اللي محتاجه الطالب في كل لحظة من غير ما تسردها له كقائمة.)

🐢 قاعدة إلزامية جدًا — التدرّج والتقسيم (زي Duolingo بالظبط):
- **ممنوع نهائيًا** إنك تكبّس معلومات كتير في رسالة واحدة. كل رسالة منك تقدّم **حاجة
  واحدة صغيرة بس**: 3 إلى 6 كلمات/تعبيرات جديدة، أو قاعدة نحوية واحدة بس، مش أكتر.
- بعد ما تقدّم الحاجة الصغيرة دي، سيب الطالب يتفاعل ويجرّب (سؤال أو تمرين قصير)
  قبل ما تكمّل لحاجة جديدة. ميبقاش عندك "شرح طويل من غير توقف".
- لما تحس إن جزء منطقي اتغطى كويس، اعمل **اختبار قصير** (2-4 أسئلة) على **الجزء ده
  تحديدًا** — قيّم إجابات الطالب فور ما يردّ، وضّح الصح والغلط بلطف مع السبب.
- **كل رد منك تقريبًا لازم يحتوي على جملة تحفيزية حقيقية ومحدّدة** — مش بس "ممتاز!"،
  لازم توضّح *ليه* اللي بيعمله صح ومفيد له، مثلاً: "الطريقة اللي بتتعلم بيها دي بالظبط
  اللي هتخليك تتكلم بثقة مع مريض حقيقي" أو "الكلمة دي هتيجيلك أكيد في امتحان OET".
  الهدف إنه يحس إن مجهوده مش هدر ووقته بيتصرف صح — مش مجاملة فاضية.

📏 قاعدة العمق الحقيقي للوحدة الواحدة (مهم جدًا — منع "خلاص خلصنا" السريع):
- كل وحدة (unit) لازم تتغطى على **عدة رسايل متتالية حقيقية**، مش رسالة أو اتنين وخلاص.
  الوحدة الواحدة المفروض تحتوي، على مدار الحوار: على الأقل 15-25 كلمة/تعبير جديد،
  2-3 قواعد نحوية أو أنماط لغوية مرتبطة بموضوع الوحدة، وسيناريو محادثة تطبيقي واحد
  على الأقل (حوار كامل يمثّل موقف حقيقي في المستشفى أو الحياة اليومية).
- الوحدة متتقفلش (status: done) إلا بعد ما الطالب يعدّي **3 اختبارات مصغّرة على الأقل**
  خلال الوحدة (مش اختبار واحد في الآخر)، وبنسبة نجاح معقولة في أغلبها. لو أداءه ضعيف
  في اختبار، راجع الجزء ده بطريقة مختلفة قبل ما تكمّل — ميتحطش "done" أبدًا من غير
  ما يستاهلها فعلاً.
- ممنوع تخلّص وحدة بمجرد "كام كلمة وجملتين وخلاص" — لو حسّيت إنك هتقفلها بسرعة كده،
  ده معناه إنها لسه ناقصة محتوى وقواعد وتمارين، كمّل فيها قبل ما تعتبرها خلصت.

🗂️ قاعدة بناء الخطة — مستوى واحد في كل مرة (مش الرحلة كلها دفعة واحدة):
- بعد التقييم المبدئي، ابنِ خطة **للمستوى الحالي بس** (مثلاً A1)، مكوّنة من 8 إلى 14
  وحدة متسلسلة وعميقة (حسب القاعدة فوق)، بتمزج: أساسيات اللغة، محادثات يومية عامة،
  وإنجليزية التمريض/المستشفى. اعرض خطة المستوى ده كاملة للطالب قبل ما تبدأ.
- **ممنوع** تبني خطة لمستويات مستقبلية (A2, B1...) من الأول — دي بتتبني لما الطالب
  يخلّص المستوى الحالي فعلاً بكل وحداته.
- لما **كل** وحدات المستوى الحالي تتقفل (status: done)، ده إنجاز حقيقي — احتفل بيه
  بوضوح ("🎉 خلّصت مستوى A1 بجدارة!")، اعمل ملخص شامل لأهم حاجة اتعلمها في المستوى
  ده كله، واربط ده بفايدة ملموسة له (مثلاً: "دلوقتي تقدر تتواصل في مواقف يومية
  ومواقف تمريضية أساسية من غير ما تتلخبط"). بعد كده مباشرة، ابنِ خطة المستوى اللي
  بعده (مثلاً A2) بنفس الطريقة — 8-14 وحدة جديدة، مبنية فوق اللي اتعلمه في المستوى
  اللي قبله (استخدم "ذاكرة الوحدات المخلّصة" عشان تربط وميتكررش).

📖 تنسيق الكتابة (مهم جدًا عشان العرض يبقى نضيف في الشات):
- استخدم Markdown بسيط ومرتب: عناوين قصيرة بـ **bold**، قوائم نقطية، وجداول Markdown
  (| عمود | عمود |) للأزمنة والقواعد (مثلاً تصريف فعل عبر الأزمنة المختلفة) — الجداول
  بتتعرض بشكل منظم في الواجهة فاستخدمها بدل ما تكتب كل حاجة في سطر واحد طويل.
- خلي كل رسالة قصيرة ومركزة (فقرة أو اتنين + جدول أو قائمة صغيرة عند الحاجة) —
  مش صفحة كاملة دفعة واحدة.
- لكل كلمة إنجليزية جديدة اكتب النطق بصيغتين: [IPA] + نطق تقريبي بالعربي بين قوسين،
  مثال: nurse [nɜːrs] (نـِرس).

🎯 مهمتك (بالترتيب):
1) لو الطالب جديد (level=A0 و placementDone=false): اعمل تقييم مبدئي سريع وودود
   (كام سؤال بسيط: هل درس إنجليزي قبل كده؟ لغاية أي مستوى؟ جرّب يترجم/ينطق جملة بسيطة؟)
   عشان تحدد نقطة البداية الصح (ممكن يكون فعلاً من الصفر).
2) بعد التقييم مباشرة، ابنِ خطة **المستوى الحالي بس** (8-14 وحدة عميقة) زي القاعدة فوق،
   واعرضها كاملة نصيًا ومرتبة قبل ما تبدأ.
3) بعد كده امشِ وحدة وحدة، وجوه كل وحدة امشِ **جزء صغير صغير** على مدار عدة رسايل —
   بدّل بين تعليم مفردات، شرح قاعدة، تمرين، اختبار مصغّر، مراجعة سريعة لحاجة قديمة —
   لحد ما الوحدة تستوفي شرط العمق فوق فعلاً قبل ما تتقفل.
4) قبل ما تبدأ أي وحدة جديدة، اربطها بسرعة بحاجة اتعلمها قبل كده (Spaced Repetition)
   عشان المعلومات القديمة متتنساش — استخدم "ذاكرة الوحدات المخلّصة" تحت.
5) لما كل وحدات المستوى تخلص، احتفل بإنجاز المستوى كامل، وابدأ ابني خطة المستوى الجاي.
6) صحّح الأخطاء بلطف ووضّح ليه غلط، واستخدم العربية للشرح مع دمج الإنجليزي كمحتوى.

⚠️ قاعدة تقنية إلزامية جدًا وحساسة: في **آخر** كل رد منك، وبعد كل اللي هيشوفه الطالب،
لازم تضيف بلوك ميتاداتا مخفي (الطالب مش هيشوفه، هيتشال قبل ما يوصله) بالشكل ده **بالظبط**:

${META_START}
{"level":"A1","placementDone":true,"plan":[{"id":"u1","track":"general","title":"...","level":"A1","status":"active"}],"currentUnitId":"u1","unitJustCompleted":null,"unitSummary":null,"keyVocab":[],"newVocab":[{"word":"nurse","ipa":"[nɜːrs] (نـِرس)","meaning":"ممرض/ممرضة","exampleDe":"The nurse checks the patient's blood pressure.","exampleAr":"الممرض/ة بيفحص ضغط دم المريض."}],"grammarNote":null,"levelJustCompleted":null,"levelSummary":null}
${META_END}

قواعد صارمة لازم تتبعها بالحرف عشان الميتاداتا متتقرأش غلط:
- اكتب الـ JSON في **سطر واحد** (compact، من غير newlines جواه)، وابعته **مرة واحدة بس**
  في آخر الرد، ومن غير code fence (متكتبش \`\`\`json حواليه)، ومن غير أي escaping زيادة
  عن اللي الـ JSON نفسه محتاجه — يعني ابعته كـ JSON خام صحيح 100% يقدر أي JSON.parse
  عادي يقرأه من أول مرة.
- ممنوع تكرار بلوك الميتاداتا مرتين في نفس الرد، وممنوع تسيب أي نص بعد ${META_END}.
- "track" لازم يكون **بالظبط** واحدة من كلمتين بس: "general" أو "nursing" (كلمة واحدة
  من غير دمج، ممنوع "generalnursing" أو أي قيمة تانية).
- "status" لازم يكون **بالظبط** واحدة من: "locked" أو "active" أو "done" (ممنوع
  "pending" أو أي قيمة تانية غير التلاتة دول).
- "newVocab": ابعت فيها **كل كلمة/تعبير إنجليزي جديد علّمته في الرد ده تحديدًا** (حتى
  لو الوحدة لسه مخلصتش) بالشكل: word / ipa / meaning / exampleDe / exampleAr (الحقول
  دي بتتحفظ بنفس الاسم القديم داخليًا، exampleDe هنا معناها "مثال باللغة المستهدفة"
  يعني الجملة الإنجليزية، وexampleAr هي ترجمتها). لو الرد ده كان مراجعة/اختبار من غير
  كلمات جديدة، ابعت newVocab: [].
- "grammarNote": لو شرحت قاعدة نحوية جديدة في الرد ده، ابعت {"title":"اسم القاعدة",
  "explanation":"ملخص الشرح بصيغة Markdown مختصرة"}. غير كده ابعت null.
- لو الخطة اتحطت قبل كده (شايفها تحت في "الخطة الحالية")، ابعتها تاني كاملة زي ما هي
  (غيّر بس status لو اتغيّر)، متبعتش خطة فاضية أو تنسى وحدات — إلا لو المستوى خلص
  فعلاً وبنيت خطة مستوى جديد (في الحالة دي ابعت الخطة الجديدة كاملة).
- لو وحدة خلصت فعلاً دلوقتي (بعد ما استوفت شرط العمق: 15-25 كلمة و2-3 قواعد و3
  اختبارات مصغّرة على الأقل): حط unitJustCompleted = id بتاعها، unitSummary ملخص
  سطرين، keyVocab لأهم 5-10 كلمات، status بتاعها "done"، status اللي بعدها "active"،
  currentUnitId = الوحدة الجديدة.
- لو لسه مفيش خطة (أول تقييم لسه شغال): ابعت plan: [] و placementDone: false.
- "levelJustCompleted": لو **كل** وحدات المستوى الحالي خلصت فعلاً دلوقتي (كلهم status
  "done")، حط قيمة المستوى (مثلاً "A1")، وابعت "levelSummary" بملخص شامل لأهم حاجة
  اتعلمها في المستوى ده كله (3-5 أسطر). غير كده ابعت null لكل الاتنين. لما مستوى
  يخلص، ابدأ فورًا خطة المستوى الجاي في نفس الرد أو اللي بعده (plan array جديدة).

📋 الخطة الحالية:
${planText}

📚 الوحدة النشطة دلوقتي: ${currentUnit ? `${currentUnit.title} (${currentUnit.track}, ${currentUnit.level})` : 'لسه مفيش'}

🧠 ذاكرة الوحدات اللي خلصت (استخدمها للربط والمراجعة، ما تكررش شرحها من الصفر):
${memoryText}

📗 عدد الكلمات المحفوظة في دفتر مفردات الطالب لحد دلوقتي: ${recentVocabCount}

مستوى الطالب الحالي: ${state.level}`;
}

// -------------------- Gemini call --------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -------------------- تتبّع تكلفة الاستدعاء لـ Gemini (لوحة الأدمن) --------------------
// المسار ده شغال جوه نفس عملية Node اللي فيها server.js (متطلَّب مباشرة، مش
// deployment منفصل) — فبدل نداء HTTP زي ملفات api/*.js المنفصلة، بنكتب
// مباشرة على نفس موديل ApiUsage المُعرّف في server.js عن طريق سجل mongoose.models
// المشترك بين كل الملفات في نفس العملية. لو الموديل لسه مسجّلش (حالة نادرة
// جدًا، السيرفر لسه مبدأش يخدم طلبات)، بنتجاهل بهدوء عشان الدرس ميتأثرش.
async function reportGeminiUsage(requestBytes) {
    try {
        const ApiUsage = mongoose.models.ApiUsage;
        if (!ApiUsage) return;
        const monthKey = new Date().toISOString().slice(0, 7);
        await ApiUsage.findOneAndUpdate(
            { provider: 'gemini-pro-teacher', monthKey },
            { $inc: { callCount: 1, totalRequestBytes: requestBytes || 0 } },
            { upsert: true, setDefaultsOnInsert: true }
        );
    } catch (e) { /* تتبّع الإحصائيات مايأثرش أبدًا على رد الدرس نفسه */ }
}

async function callGemini(systemPrompt, historyMsgs, userMessage) {
    const apiKey = process.env.ENGLISH_API_KEY;
    if (!apiKey) throw new Error('ENGLISH_API_KEY مش متظبط في environment variables');

    const contents = [
        ...historyMsgs.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text: userMessage }] }
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 8192 }
        // رفعناها من 2048 لـ 8192 لأن الرد بيحتوي شرح + جدول + خطة 7 وحدات كـ JSON
        // في آخره — الحد القديم كان بيقطع الرد قبل ما يكمّل الميتاداتا فتظهر ناقصة.
    });

    // Gemini بيرجع 503/429 بشكل مؤقت وقت الضغط العالي — نعيد المحاولة 3 مرات
    // بفاصل متزايد (1s, 2.5s) قبل ما نستسلم فعلاً.
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
            await reportGeminiUsage(body.length);
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

// -------------------- Parse + strip metadata (مقوّاة ضد أخطاء تنسيق الموديل) --------------------
function tryParseJson(raw) {
    if (!raw) return null;
    // محاولة 1: مباشرة
    try { return JSON.parse(raw); } catch (e) { /* كمّل */ }
    // محاولة 2: شيل code fences لو موجودة
    let cleaned = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    try { return JSON.parse(cleaned); } catch (e) { /* كمّل */ }
    // محاولة 3: الموديل ممكن يبعت الجملة كـ string متعمل لها escape زيادة (\" بدل ")
    // — شيل الـ backslash escaping الزيادة وجرّب تاني
    try {
        const unescaped = cleaned.replace(/\\"/g, '"').replace(/\\n/g, ' ');
        return JSON.parse(unescaped);
    } catch (e) { /* استسلم */ }
    return null;
}

function extractMeta(rawText) {
    // نلاقي أول ظهور للماركر — أي حاجة بعده (شكلها اتكتب صح أو اتقطعت في النص)
    // بتتشال فورًا من اللي هيشوفه الطالب، حتى لو الـ JSON نفسه اتقطع ومكملش لآخره.
    // ده أهم فرق عن النسخة القديمة اللي كانت بتستنى تلاقي علامة النهاية الأول،
    // فلو الرد اتقطع (خلص الـ tokens) قبل علامة النهاية، كانت بتسيب الـ JSON
    // كامل ظاهر للطالب كنص خام.
    const start = rawText.indexOf(META_START);

    let visibleText, meta = null;
    if (start !== -1) {
        visibleText = rawText.slice(0, start);
        const end = rawText.indexOf(META_END, start);
        if (end !== -1) {
            const jsonRaw = rawText.slice(start + META_START.length, end).trim();
            meta = tryParseJson(jsonRaw);
        }
        // لو end === -1 (الرد اتقطع قبل ما يكمّل الميتاداتا): meta بتفضل null،
        // وده مقبول — هنبعت رسالة عادية من غير تحديث خطة في الرد ده، بدل ما نعرض
        // كود خام للطالب. الرسالة الجاية غالبًا هتظبط لوحدها.
    } else {
        // شبكة أمان: الموديل ممكن (نادرًا) ينسى الماركر ويبعت الـ JSON مباشرة.
        // بندوّر على بداية أي بلوك شكله زي الميتاداتا ونقطع من هناك.
        const idx = rawText.search(/\{\s*"level"\s*:\s*"/);
        if (idx !== -1) {
            visibleText = rawText.slice(0, idx);
            meta = tryParseJson(rawText.slice(idx));
        } else {
            visibleText = rawText;
        }
    }

    visibleText = visibleText.replace(/<<\/?(META|END_META)>>/g, '').trim();
    return { visibleText: visibleText || '(الرد وصل فاضي — جرّب تاني)', meta };
}

// -------------------- Route registration --------------------
module.exports = function registerEnglishProRoutes(app, deps) {
    const { verifyToken, isAdmin, connectToDatabase, Student } = deps;
    if (!verifyToken || !connectToDatabase || !Student) {
        throw new Error('english-pro-routes: deps ناقصة (verifyToken/connectToDatabase/Student)');
    }

    // طالب Premium بالميزة دي، أو أي أدمن (الأدمن مسموح له يستخدم الميزة برضو)
    async function requireEnglishPremium(req, res, next) {
        try {
            if (req.user?.type === 'admin') return next();
            await connectToDatabase();
            const student = await Student.findById(req.user.id).select('premiumFeatures');
            if (!student || !student.premiumFeatures?.includes(PREMIUM_KEY)) {
                return res.status(403).json({ error: 'الميزة دي متاحة لطلاب Premium فقط (English Pro)' });
            }
            next();
        } catch (e) {
            res.status(500).json({ error: 'خطأ في التحقق من الاشتراك: ' + e.message });
        }
    }

    async function loadOrCreateState(studentCode, fullName) {
        let state = await EnglishProState.findOne({ studentCode });
        if (!state) {
            state = await EnglishProState.create({ studentCode, fullName });
        } else if (fullName && state.fullName !== fullName) {
            state.fullName = fullName;
            await state.save();
        }
        return state;
    }

    function addVocab(state, newVocab, unitId) {
        if (!Array.isArray(newVocab) || !newVocab.length) return;
        const existing = new Set(state.vocabulary.map(v => (v.word || '').trim().toLowerCase()));
        for (const v of newVocab) {
            const word = String(v?.word || '').trim();
            if (!word || existing.has(word.toLowerCase())) continue;
            state.vocabulary.push({
                word: word.slice(0, 100),
                ipa: String(v.ipa || '').slice(0, 150),
                meaning: String(v.meaning || '').slice(0, 200),
                exampleDe: String(v.exampleDe || '').slice(0, 300),
                exampleAr: String(v.exampleAr || '').slice(0, 300),
                unitId: unitId || null
            });
            existing.add(word.toLowerCase());
        }
        // سقف أمان: منمنعش الطالب لكن منسيبش المصفوفة تكبر من غير حد منطقي
        if (state.vocabulary.length > 1500) state.vocabulary = state.vocabulary.slice(-1500);
    }

    function addGrammarNote(state, note, unitId) {
        if (!note || !note.title) return;
        const title = String(note.title).trim();
        if (!title) return;
        const already = state.grammarNotes.find(g => g.title === title);
        if (already) return;
        state.grammarNotes.push({
            title: title.slice(0, 150),
            explanation: String(note.explanation || '').slice(0, 3000),
            unitId: unitId || null
        });
        if (state.grammarNotes.length > 300) state.grammarNotes = state.grammarNotes.slice(-300);
    }

    function stateResponse(state) {
        return {
            success: true,
            level: state.level,
            placementDone: state.placementDone,
            plan: state.plan,
            currentUnitId: state.currentUnitId,
            completedUnits: state.completedUnits,
            completedLevels: state.completedLevels,
            vocabulary: state.vocabulary,
            grammarNotes: state.grammarNotes,
            history: state.history.slice(-MAX_HISTORY_TURNS)
        };
    }

    // حالة الطالب/الأدمن الحالية (بيستخدمها الفرونت إند لعرض الخطة والتقدم)
    app.get('/api/english-pro/state', verifyToken, requireEnglishPremium, async (req, res) => {
        try {
            await connectToDatabase();
            const { studentCode, fullName } = resolveIdentity(req);
            const state = await loadOrCreateState(studentCode, fullName);
            res.json(stateResponse(state));
        } catch (e) {
            res.status(500).json({ error: 'خطأ في تحميل الحالة: ' + e.message });
        }
    });

    // إرسال رسالة للمدرّس
    app.post('/api/english-pro/message', verifyToken, requireEnglishPremium, async (req, res) => {
        try {
            const { message } = req.body;
            if (!message || typeof message !== 'string' || !message.trim()) {
                return res.status(400).json({ error: 'اكتب رسالة الأول' });
            }
            await connectToDatabase();
            const { studentCode, fullName } = resolveIdentity(req);
            const state = await loadOrCreateState(studentCode, fullName);

            const systemPrompt = buildSystemPrompt(state);
            const recentHistory = state.history.slice(-MAX_HISTORY_TURNS);

            const rawReply = await callGemini(systemPrompt, recentHistory, message.trim());
            const { visibleText, meta } = extractMeta(rawReply);

            // حدّث الحالة بناءً على الميتاداتا (لو اتبعتت وصحيحة)
            if (meta) {
                const prevLevel = state.level;
                const prevPlanUnitsCount = state.plan.length;
                if (typeof meta.level === 'string') state.level = meta.level;
                if (typeof meta.placementDone === 'boolean') state.placementDone = meta.placementDone;
                if (Array.isArray(meta.plan) && meta.plan.length) {
                    state.plan = meta.plan.map(u => {
                        const rawTrack = String(u.track || '').toLowerCase();
                        const rawStatus = String(u.status || '').toLowerCase();
                        return {
                            id: String(u.id || '').slice(0, 40),
                            // لو الموديل بعت قيمة مش مضبوطة (زي "generalnursing")، بنحسمها
                            // بناءً على وجود كلمة "nursing" فيها بدل ما نرفضها بالكامل
                            track: rawTrack.includes('nursing') ? 'nursing' : 'general',
                            title: String(u.title || '').slice(0, 200),
                            level: String(u.level || state.level).slice(0, 10),
                            objectives: Array.isArray(u.objectives) ? u.objectives.slice(0, 10).map(String) : [],
                            status: ['locked', 'active', 'done'].includes(rawStatus) ? rawStatus : 'locked'
                        };
                    });
                }
                if (meta.currentUnitId) state.currentUnitId = String(meta.currentUnitId).slice(0, 40);

                addVocab(state, meta.newVocab, state.currentUnitId);
                addGrammarNote(state, meta.grammarNote, state.currentUnitId);

                if (meta.unitJustCompleted) {
                    state.completedUnits.push({
                        unitId: String(meta.unitJustCompleted).slice(0, 40),
                        title: state.plan.find(u => u.id === meta.unitJustCompleted)?.title || '',
                        summary: String(meta.unitSummary || '').slice(0, 500),
                        keyVocab: Array.isArray(meta.keyVocab) ? meta.keyVocab.slice(0, 15).map(String) : []
                    });
                }

                if (meta.levelJustCompleted) {
                    state.completedLevels.push({
                        level: String(meta.levelJustCompleted).slice(0, 10) || prevLevel,
                        unitsCount: prevPlanUnitsCount,
                        summary: String(meta.levelSummary || '').slice(0, 800)
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
                completedUnits: state.completedUnits,
                completedLevels: state.completedLevels,
                vocabulary: state.vocabulary,
                grammarNotes: state.grammarNotes,
                metaParsed: !!meta // مفيد للفرونت إند لو حاب يعرض تحذير صامت وقت مشاكل تزامن
            });
        } catch (e) {
            console.error('❌ english-pro/message error:', e.message);
            res.status(500).json({ error: 'خطأ في الرد: ' + e.message });
        }
    });

    // تصفير كامل (إعادة التقييم من الصفر)
    // -------- نطق صوتي من السيرفر (بيشتغل مع أي طالب على أي جهاز، مش معتمد
    // على وجود صوت ألماني مثبّت على هاتفه) --------
    // بنستخدم خدمة Google Translate الصوتية (مجانية، من غير أي مفتاح إضافي)
    // كل طلب محدود بـ ~200 حرف، فبنقسّم النص الطويل لأجزاء ونلزقهم مع بعض.
    async function fetchTtsChunk(text) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob&ttsspeed=0.24`;
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://translate.google.com/'
            }
        });
        if (!resp.ok) throw new Error('tts provider status ' + resp.status);
        return Buffer.from(await resp.arrayBuffer());
    }

    function splitForTts(text, maxLen = 180) {
        const sentences = text.split(/(?<=[.!?،,])\s+/);
        const chunks = [];
        let current = '';
        for (const s of sentences) {
            if ((current + ' ' + s).trim().length > maxLen) {
                if (current.trim()) chunks.push(current.trim());
                current = s.length > maxLen ? s.slice(0, maxLen) : s;
            } else {
                current = (current + ' ' + s).trim();
            }
        }
        if (current.trim()) chunks.push(current.trim());
        return chunks.slice(0, 6); // سقف أمان: 6 أجزاء بالكتير (~1000 حرف)
    }

    app.post('/api/english-pro/tts', verifyToken, requireEnglishPremium, async (req, res) => {
        try {
            const text = String(req.body?.text || '').trim();
            if (!text) return res.status(400).json({ error: 'مفيش نص للنطق' });

            const chunks = splitForTts(text);
            if (!chunks.length) return res.status(400).json({ error: 'النص فاضي بعد التنظيف' });

            const buffers = await Promise.all(chunks.map(c => fetchTtsChunk(c)));
            const finalBuffer = Buffer.concat(buffers);

            res.set('Content-Type', 'audio/mpeg');
            res.set('Cache-Control', 'no-store');
            res.send(finalBuffer);
        } catch (e) {
            console.error('❌ english-pro/tts error:', e.message);
            res.status(502).json({ error: 'تعذر توليد الصوت من السيرفر دلوقتي: ' + e.message });
        }
    });

    // إضافة كلمة من القاموس الطبي الثابت لدفتر مفردات الطالب الشخصي (يدويًا،
    // مش من درس) — القاموس نفسه بيانات ثابتة في الفرونت إند، والسيرفر هنا بس
    // بيحفظ اختيار الطالب في دفتره الشخصي.
    app.post('/api/english-pro/vocabulary/add', verifyToken, requireEnglishPremium, async (req, res) => {
        try {
            const { word, ipa, meaning, exampleDe, exampleAr } = req.body || {};
            if (!word || typeof word !== 'string' || !word.trim()) {
                return res.status(400).json({ error: 'مفيش كلمة اتبعتت' });
            }
            await connectToDatabase();
            const { studentCode, fullName } = resolveIdentity(req);
            const state = await loadOrCreateState(studentCode, fullName);
            addVocab(state, [{ word, ipa, meaning, exampleDe, exampleAr }], 'dictionary');
            await state.save();
            res.json({ success: true, vocabulary: state.vocabulary });
        } catch (e) {
            res.status(500).json({ error: 'تعذر الإضافة: ' + e.message });
        }
    });

    app.post('/api/english-pro/reset', verifyToken, requireEnglishPremium, async (req, res) => {
        try {
            await connectToDatabase();
            const { studentCode, fullName } = resolveIdentity(req);
            await EnglishProState.findOneAndUpdate(
                { studentCode },
                { $set: { fullName, level: 'A0', placementDone: false, plan: [], currentUnitId: null, completedUnits: [], completedLevels: [], vocabulary: [], grammarNotes: [], history: [], totalMessages: 0 } },
                { upsert: true }
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'خطأ في التصفير: ' + e.message });
        }
    });

    // (اختياري) الأدمن يقدر يشوف حالة أي طالب بالكود بتاعه
    app.get('/api/admin/english-pro/:studentCode', verifyToken, isAdmin, async (req, res) => {
        try {
            await connectToDatabase();
            const state = await EnglishProState.findOne({ studentCode: req.params.studentCode });
            if (!state) return res.status(404).json({ error: 'الطالب لسه مبدأش English Pro' });
            res.json({ success: true, state });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    console.log('✅ English Pro routes registered (/api/english-pro/*)');
};
