// ╔══════════════════════════════════════════════════════════════╗
// ║  🏴‍☠️  خريطة القرصان القديمة - مغامرة المعرفة اللانهائية  ║
// ║  Ancient Pirate Map - Endless Knowledge Adventure      ║
// ╚══════════════════════════════════════════════════════════════╝

var AncientMap = {
    // ==================== حالة المغامر ====================
    adventurer: {
        name: '',
        title: 'صبي المقصورة',
        level: 1,
        xp: 0,
        gold: 0,
        health: 100,
        maxHealth: 100,
        shipLevel: 1,
        shipName: 'السنونو',
        discoveredIslands: [],
        completedIslands: [],
        defeatedCreatures: [],
        collectedArtifacts: [],
        achievements: [],
        currentPosition: { island: 'port_royal', x: 8, y: 85 },
        journal: [],
        crew: ['ببغاء حكيم 🦜'],
        abilities: [],
        storyFlags: {},
        totalAdventures: 0,
        lastIsland: null
    },

    // ==================== جزر الخريطة (16 جزيرة أساسية) ====================
    islands: [
        {
            id: 'port_royal',
            name: 'ميناء البداية',
            subtitle: 'حيث تبدأ كل المغامرات',
            position: { x: 8, y: 85 },
            icon: '⚓',
            type: 'port',
            chapter: null,
            unlocked: true,
            completed: false,
            story: `ترسو سفينتك "السنونو" في ميناء البداية... 
            
الميناء القديم تفوح منه رائحة الملح والتوابل. النوارس تحلق فوق الصواري، والبحارة يتبادلون قصص الكنوز المفقودة.

عجوز حكيم يجلس على رصيف الميناء، ينظر إليك بعينين تلمعان بالمعرفة: "أهلاً بك أيها المغامر الشاب... لقد كنتُ أنتظرك. البحر كبير، والمعرفة كنز لا يفنى. كل جزيرة تخفي سراً، وكل سر يحتاج إلى مفتاح."

"خذ هذه الخريطة... لكن احذر! الجزر لا تبوح بأسرارها إلا لمن يستحق. أجب على أسئلة المعرفة، واهزم وحوش الجهل، واجمع كنوز الحكمة."

"المغامرة لا تنتهي... فكلما أبحرت أكثر، ظهرت جزر جديدة في الأفق. هل أنت مستعد؟"`,
            creatures: [],
            treasure: null,
            requirements: null,
            rewards: { xp: 50, gold: 25, title: '⚓ بحار مبتدئ' },
            achievements: ['first_step', 'port_explorer'],
            weather: 'مشمس',
            specialEvent: null
        },
        {
            id: 'mercy_reef',
            name: 'شعاب الرحمة',
            subtitle: 'جزيرة الرعاية التلطيفية',
            position: { x: 22, y: 78 },
            icon: '🏝️',
            type: 'story',
            chapter: 'chapter1',
            unlocked: false,
            completed: false,
            story: `تقترب من شعاب الرحمة... المياه هنا هادئة بشكل غريب، كأن البحر نفسه يحترم قدسية هذا المكان.

على الشاطئ، تجد ممرضة عجوزاً تجلس تحت شجرة نخيل. تبتسم لك وتقول: "هذه الجزيرة ليست للبحث عن الكنوز العادية... هنا نتعلم كيف نخفف آلام من يرحلون."

"الرعاية التلطيفية... فنّ التخفيف لا العلاج. بعض المرضى لا يمكن شفاؤهم، لكن يمكننا دائماً أن نريحهم. تعالَ... اختبر معرفتك، وسأمنحك جوهرة الرحمة."

فجأة، يظهر شبح شفاف فوق الماء: "أنا حارس هذه الشعاب! لا أحد يمر قبل أن يثبت أنه يفهم معنى الرحمة!"`,
            creatures: [
                {
                    id: 'ghost_mercy',
                    name: 'شبح الرحمة',
                    emoji: '👻',
                    story: 'شبح أثيري يطفو: "أجب على أسئلتي عن الرعاية التلطيفية... أو ابقَ هنا للأبد!"',
                    chapter: 'chapter1',
                    questions: 5,
                    difficulty: 'easy',
                    hp: 40,
                    reward: { xp: 80, gold: 40 }
                }
            ],
            treasure: {
                id: 'gem_mercy',
                name: 'جوهرة الرحمة الزرقاء',
                emoji: '💎',
                story: 'جوهرة تتوهج بنور أزرق دافئ... تمنح حاملها القدرة على الشعور بآلام الآخرين',
                ability: 'empathy_aura'
            },
            requirements: { type: 'complete', island: 'port_royal' },
            rewards: { xp: 200, gold: 100, title: '🌅 حامل الرحمة' },
            achievements: ['mercy_master', 'ghost_slayer'],
            weather: 'غائم جزئياً',
            specialEvent: 'ظهور الشبح عند الغسق'
        },
        {
            id: 'surgeons_cove',
            name: 'خليج الجراحين',
            subtitle: 'مملكة المشارط والتعقيم',
            position: { x: 38, y: 72 },
            icon: '🏥',
            type: 'story',
            chapter: 'chapter2',
            unlocked: false,
            completed: false,
            story: `خليج الجراحين... مكان غريب! الصخور هنا على شكل أدوات جراحية، والمياه معقمة بشكل طبيعي!

جراح عجوز يرتدي قناعاً يستقبلك: "أهلاً بك في مملكتي! هنا لا مكان للجراثيم... كل شيء يجب أن يكون معقماً. المريض الذي يدخل هنا يجب أن يكون صائماً، مستعداً، وموافقاً على كل شيء."

"هل تعرف مراحل الجراحة؟ قبل وأثناء وبعد؟ هل تستطيع التمييز بين الجراحة العلاجية والتلطيفية والتجميلية؟"

فجأة، يظهر وحش مغطى بالضمادات: "التعقيم! التعقيم! أخبرني عن مبادئ التعقيم وإلا أصبتك بالعدوى!"`,
            creatures: [
                {
                    id: 'scrub_beast',
                    name: 'وحش التعقيم',
                    emoji: '🧟',
                    story: 'مخلوق مغطى بالشاش والضمادات: "قل لي! ما هي مبادئ التعقيم التسعة؟!"',
                    chapter: 'chapter2',
                    questions: 6,
                    difficulty: 'medium',
                    hp: 55,
                    reward: { xp: 120, gold: 60 }
                }
            ],
            treasure: {
                id: 'scalpel_wisdom',
                name: 'مشرط الحكمة الذهبي',
                emoji: '🗡️',
                story: 'مشرط ذهبي نقش عليه: "المعرفة قبل المشرط"',
                ability: 'surgical_precision'
            },
            requirements: { type: 'complete', island: 'mercy_reef' },
            rewards: { xp: 250, gold: 125, title: '⚓ جراح ماهر' },
            achievements: ['surgeon_master', 'sterile_champion'],
            weather: 'ضباب خفيف',
            specialEvent: 'عملية جراحية طارئة عند الفجر'
        },
        {
            id: 'storm_lungs',
            name: 'جزر الرئة العاصفة',
            subtitle: 'حيث تتعلم التنفس وسط العواصف',
            position: { x: 55, y: 65 },
            icon: '🌪️',
            type: 'story',
            chapter: 'chapter3',
            unlocked: false,
            completed: false,
            story: `الرياح هنا لا تتوقف أبداً... جزر الرئة العاصفة مكان خطير! الأشجار تنحني مع الريح، والهواء مليء بالغبار وحبوب اللقاح.

ساحرة عجوز تجلس في كوخ على التلة: "هنا مملكتي... مملكة التنفس! بعض الناس لا يستطيعون التنفس بسهولة... الربو يخنقهم، الالتهاب الرئوي يغرق رئاتهم، والفيروسات تغزوهم."

"تعلم كيف تساعدهم... كيف تضع المريض في وضعية فاولر... كيف تعطيه الأكسجين المرطب... وكيف تفرق بين أزيز الربو وخراخر الالتهاب الرئوي!"

فجأة، يزأر تنين ضخم من خلف التلال: "من يجرؤ على دخول مملكة التنفس؟!"`,
            creatures: [
                {
                    id: 'wheeze_dragon',
                    name: 'تنين الأزيز الأخضر',
                    emoji: '🐉',
                    story: 'تنين يزفر دخاناً: "سعال! أزيز! ضيق تنفس! كيف تعالجني أيها الممرض الصغير؟"',
                    chapter: 'chapter3',
                    questions: 7,
                    difficulty: 'medium',
                    hp: 65,
                    reward: { xp: 150, gold: 75 }
                }
            ],
            treasure: {
                id: 'crystal_lung',
                name: 'رئة الكريستال',
                emoji: '🫁',
                story: 'رئة بلورية نقية... عندما تمسكها، تشعر بأنفاسك تصبح أعمق وأصفى',
                ability: 'breath_of_life'
            },
            requirements: { type: 'complete', island: 'surgeons_cove' },
            rewards: { xp: 300, gold: 150, title: '🌪️ سيد العواصف' },
            achievements: ['storm_master', 'dragon_slayer'],
            weather: 'عاصف',
            specialEvent: 'عاصفة رملية كل 3 أيام'
        },
        {
            id: 'heart_volcano',
            name: 'بركان القلوب',
            subtitle: 'حيث تنبض القلوب بالحمم',
            position: { x: 72, y: 55 },
            icon: '🌋',
            type: 'story',
            chapter: 'chapter4',
            unlocked: false,
            completed: false,
            story: `بركان القلوب... أرض البركان النابض! الحمم هنا حمراء كالدم، والأرض تدق تحت قدميك مثل نبضات قلب عملاق.

حكيم يجلس على حافة البركان: "هذا البركان يمثل كل القلوب التي تعاني... ارتفاع الضغط يجعل الحمم تثور، والذبحة الصدرية تضغط على جدران الشرايين كالصخور."

"تعلم كيف تقيس الضغط... كيف تميز بين الذبحة المستقرة وغير المستقرة... وما الفرق بين STEMI و NSTEMI!"

"احذر! غول الضغط يحرس هذا البركان... إنه القاتل الصامت!"`,
            creatures: [
                {
                    id: 'pressure_ogre',
                    name: 'غول الضغط الأحمر',
                    emoji: '👹',
                    story: 'غول ضخم يضرب الأرض: "أنا القاتل الصامت! 180/100! ماذا ستفعل؟!"',
                    chapter: 'chapter4',
                    questions: 8,
                    difficulty: 'hard',
                    hp: 80,
                    reward: { xp: 200, gold: 100 },
                    isBoss: true
                }
            ],
            treasure: {
                id: 'ruby_heart',
                name: 'قلب الياقوت النابض',
                emoji: '💖',
                story: 'ياقوتة على شكل قلب تنبض بين يديك... تمنحك القدرة على سماع همسات القلوب المريضة',
                ability: 'heart_whisperer'
            },
            requirements: { type: 'complete', island: 'storm_lungs' },
            rewards: { xp: 400, gold: 200, title: '❤️ حارس القلوب' },
            achievements: ['heart_guardian', 'ogre_slayer'],
            weather: 'حار جداً',
            specialEvent: 'ثوران البركان كل أسبوع'
        },
        {
            id: 'digestive_labyrinth',
            name: 'متاهة البطن',
            subtitle: 'حيث يضيع الطعام في دهاليز الجسد',
            position: { x: 60, y: 38 },
            icon: '🌀',
            type: 'story',
            chapter: 'chapter5',
            unlocked: false,
            completed: false,
            story: `متاهة البطن... مكان غريب حقاً! الممرات هنا تلتف مثل الأمعاء، والجدران تنقبض وتنبسط كالتمعج!

طاهٍ عجوز عند المدخل: "هذه المتاهة تمثل رحلة الطعام في جسدك... من الفم إلى... النهاية! بعض الناس يعانون في هذه الرحلة... التهاب المعدة يحرقهم، والزائدة الدودية تمزق بطونهم، والمرارة تحتبس فيها الحصوات."

"تعلم كيف تفرق بين علامة روفسينج وبلومبيرج... وكيف تعالج التهاب المعدة... ومتى تكون الجراحة ضرورية!"

ثعبان ضخم يلتف حول أحد الأعمدة: "أنا حارس هذه المتاهة... أسئلتي سامة! أجب أو ابتلعك!"`,
            creatures: [
                {
                    id: 'appendix_serpent',
                    name: 'أفعى الزائدة السامة',
                    emoji: '🐍',
                    story: 'أفعى تلتف حول بطنك: "ألم في RLQ! غثيان! حمى! ما التشخيص؟!"',
                    chapter: 'chapter5',
                    questions: 6,
                    difficulty: 'medium',
                    hp: 60,
                    reward: { xp: 140, gold: 70 }
                }
            ],
            treasure: {
                id: 'crystal_stomach',
                name: 'كرة المعدة البلورية',
                emoji: '🔮',
                story: 'كرة بلورية ترى من خلالها رحلة الطعام في الجسد',
                ability: 'digestive_sight'
            },
            requirements: { type: 'complete', island: 'heart_volcano' },
            rewards: { xp: 300, gold: 150, title: '🌀 سيد المتاهة' },
            achievements: ['labyrinth_master', 'serpent_charmer'],
            weather: 'رطب',
            specialEvent: 'انقباضات المتاهة كل 6 ساعات'
        },
        {
            id: 'waterfall_retention',
            name: 'شلالات الاحتباس',
            subtitle: 'حيث المياه لا تجري كما ينبغي',
            position: { x: 82, y: 42 },
            icon: '💧',
            type: 'story',
            chapter: 'chapter6',
            unlocked: false,
            completed: false,
            story: `شلالات الاحتباس... مكان متناقض! بعض الشلالات تفيض بلا توقف، وبعضها جاف تماماً لا يخرج منه قطرة.

حورية ماء تظهر من خلف الشلال: "هذه الشلالات تمثل الجهاز البولي... بعض الناس لا يستطيعون التبول (احتباس)، والبعض لا يستطيعون منع التبول (سلس)."

"تعلم الفرق بين سلس الإجهاد والإلحاح والفيض... وكيف تساعد مريض الاحتباس... وما هي تمارين كيجل!"

موجة عملاقة تتشكل: "أنا عنصر الماء! أسئلتي تغرق من لا يعرف!"`,
            creatures: [
                {
                    id: 'water_elemental',
                    name: 'عنصر الماء الهائج',
                    emoji: '🌊',
                    story: 'موجة تتشكل في هيئة وجه: "احتباس! سلس! قسطرة! أجب أو اغرق!"',
                    chapter: 'chapter6',
                    questions: 6,
                    difficulty: 'medium',
                    hp: 55,
                    reward: { xp: 130, gold: 65 }
                }
            ],
            treasure: {
                id: 'sapphire_kidney',
                name: 'ياقوتة الكلى الزرقاء',
                emoji: '💎',
                story: 'حجر كريم أزرق... يمنحك القدرة على فهم أسرار الجهاز البولي',
                ability: 'water_mastery'
            },
            requirements: { type: 'complete', island: 'digestive_labyrinth' },
            rewards: { xp: 300, gold: 150, title: '💧 سيد المياه' },
            achievements: ['waterfall_master', 'elemental_defeater'],
            weather: 'ممطر',
            specialEvent: 'فيضان الشلالات كل 4 أيام'
        },
        {
            id: 'mind_abyss',
            name: 'هاوية العقول',
            subtitle: 'أعمق أسرار الدماغ والأعصاب',
            position: { x: 88, y: 60 },
            icon: '🧠',
            type: 'story',
            chapter: 'chapter7',
            unlocked: false,
            completed: false,
            story: `هاوية العقول... أعمق نقطة في الخريطة! هنا الدماغ يحكم كل شيء... لكنه أيضاً هشّ للغاية.

عالم أعصاب عجوز في مختبره: "الجهاز العصبي... سيد الجسد! هنا نتعلم عن الصداع بأنواعه... التوتر، النصفي، العنقودي. وعن السكتة الدماغية... الإقفارية والنزفية."

"FAST! تذكر دائماً: Face, Arm, Speech, Time! كل دقيقة تمر تحرم المريض من فرصة الشفاء."

كيان مظلم يحيط به برق: "أنا ملك السكتة! الوقت عدوي وعدوك! هل تعرف ماذا تفعل في أول 5 دقائق؟!"`,
            creatures: [
                {
                    id: 'stroke_king',
                    name: 'ملك السكتة المظلم',
                    emoji: '🧟‍♂️',
                    story: 'كيان مظلم: "FAST! FAST! الوقت يمر! ماذا تعني هذه الحروف؟!"',
                    chapter: 'chapter7',
                    questions: 10,
                    difficulty: 'hard',
                    hp: 100,
                    reward: { xp: 250, gold: 150 },
                    isBoss: true
                }
            ],
            treasure: {
                id: 'crown_mind',
                name: 'تاج العقل المتوهج',
                emoji: '👑',
                story: 'تاج يضيء عندما تقترب من الحقيقة... يهمس بأسرار الدماغ',
                ability: 'mind_reader'
            },
            requirements: { type: 'complete', island: 'waterfall_retention' },
            rewards: { xp: 500, gold: 250, title: '🧠 سيد العقول' },
            achievements: ['mind_master', 'stroke_defeater'],
            weather: 'غائم',
            specialEvent: 'عاصفة كهربائية في الهاوية'
        },
        {
            id: 'bone_mountain',
            name: 'جبل العظام',
            subtitle: 'حيث الهياكل تحكي قصصها',
            position: { x: 45, y: 25 },
            icon: '🦴',
            type: 'story',
            chapter: 'chapter8',
            unlocked: false,
            completed: false,
            story: `جبل العظام... مكان يعلو فيه صوت الطقطقة! الهياكل العظمية هنا مرتبة كأنها متحف طبيعي.

حارس عجوز عند سفح الجبل: "هذا الجبل يعلمنا عن الكسور... المغلقة والمفتوحة والمفتتة والغصن الأخضر. وعن هشاشة العظام... المرض الذي ينهش العظام بصمت."

"5Ps! تذكر: Pain, Pallor, Pulselessness, Paresthesia, Paralysis!"

غول من العظام ينهض: "كسور! جبس! رد! أخبرني وإلا كسرت عظامك!"`,
            creatures: [
                {
                    id: 'bone_golem',
                    name: 'غول العظام العملاق',
                    emoji: '🗿',
                    story: 'غول مصنوع من العظام: "ما هي أنواع الكسور؟ وكيف تتعامل مع كل نوع؟!"',
                    chapter: 'chapter8',
                    questions: 7,
                    difficulty: 'medium',
                    hp: 70,
                    reward: { xp: 160, gold: 80 }
                }
            ],
            treasure: {
                id: 'golden_skeleton_key',
                name: 'مفتاح الهيكل الذهبي',
                emoji: '🗝️',
                story: 'مفتاح ذهبي... يفتح أسرار العظام القوية',
                ability: 'bone_strength'
            },
            requirements: { type: 'complete', island: 'mind_abyss' },
            rewards: { xp: 350, gold: 175, title: '🦴 حارس العظام' },
            achievements: ['bone_master', 'golem_crusher'],
            weather: 'جاف',
            specialEvent: 'انهيار أرضي كل 5 أيام'
        },
        {
            id: 'hormone_swamp',
            name: 'مستنقع الهرمونات',
            subtitle: 'حيث الغدد تتحكم في مصيرك',
            position: { x: 28, y: 18 },
            icon: '⚗️',
            type: 'story',
            chapter: 'chapter9',
            unlocked: false,
            completed: false,
            story: `مستنقع الهرمونات... رائحة غريبة في الهواء! هنا الغدد تفرز رسائلها الكيميائية في كل اتجاه.

ساحر الغدد في كوخه: "الهرمونات... رسل الجسد! السكري... مرض العصر! Type 1 و Type 2 و Gestational... هل تعرف الفرق؟ والغدة الدرقية... قصور وفرط... هاشيموتو وغريفز!"

"ثلاثة أعراض رئيسية للسكري: عطاش، بوال، نهام! وفحص HbA1c يكشف متوسط السكر في 3 أشهر!"

شيطان السكر يظهر: "حلو أنا... لكني قاتل! أجب عن أسئلتي أو حولتك لحلوى!"`,
            creatures: [
                {
                    id: 'sugar_demon',
                    name: 'شيطان السكر اللزج',
                    emoji: '🍬',
                    story: 'كائن لزج حلو المظهر: "الأنسولين! الجلوكاجون! ما الفرق بينهما؟!"',
                    chapter: 'chapter9',
                    questions: 8,
                    difficulty: 'hard',
                    hp: 75,
                    reward: { xp: 180, gold: 90 }
                }
            ],
            treasure: {
                id: 'butterfly_thyroid',
                name: 'فراشة الدرقية المتوهجة',
                emoji: '🦋',
                story: 'فراشة على شكل غدة درقية... ترفرف عندما يكون الهرمون متزناً',
                ability: 'hormone_balance'
            },
            requirements: { type: 'complete', island: 'bone_mountain' },
            rewards: { xp: 400, gold: 200, title: '⚗️ سيد الهرمونات' },
            achievements: ['hormone_master', 'sugar_defeater'],
            weather: 'ضبابي',
            specialEvent: 'تقلبات هرمونية كل يومين'
        },
        {
            id: 'cancer_reef',
            name: 'شعاب السرطان',
            subtitle: 'أخطر جزيرة في المحيط',
            position: { x: 15, y: 42 },
            icon: '🎗️',
            type: 'story',
            chapter: 'chapter10',
            unlocked: false,
            completed: false,
            story: `شعاب السرطان... أخطر مكان في المحيط! المياه هنا داكنة، والصخور حادة كالمشارط.

محاربة سرطان سابقة: "هذه الشعاب تمثل معركة الجسد ضد السرطان... خلايا تنمو بلا توقف، تغزو وتدمر. العلاج الكيميائي والإشعاعي والجراحي... كلها أسلحة في هذه المعركة."

"احذر من آثار العلاج الكيميائي: تثبيط نخاع العظم، غثيان، تساقط شعر... والمريض يحتاجك أكثر من أي وقت مضى!"

وحش السرطان يظهر من الأعماق: "أنا المرض الذي يخافه الجميع! أثبت أنك تعرف كيف تحاربني!"`,
            creatures: [
                {
                    id: 'cancer_beast',
                    name: 'وحش السرطان الأسود',
                    emoji: '👾',
                    story: 'كتلة داكنة تنبض: "ما هي علامات التحذير من السرطان؟ اذكرها كلها!"',
                    chapter: 'chapter10',
                    questions: 10,
                    difficulty: 'hard',
                    hp: 100,
                    reward: { xp: 300, gold: 200 },
                    isBoss: true
                }
            ],
            treasure: {
                id: 'hope_star',
                name: 'نجمة الأمل',
                emoji: '🌟',
                story: 'نجمة تتوهج في الظلام... تذكرك أن هناك دائماً أملاً',
                ability: 'hope_bringer'
            },
            requirements: { type: 'complete', island: 'hormone_swamp' },
            rewards: { xp: 600, gold: 300, title: '🎗️ محارب السرطان' },
            achievements: ['cancer_warrior', 'hope_bearer'],
            weather: 'عاصف ومظلم',
            specialEvent: 'المعركة الكبرى كل أسبوع'
        },
        {
            id: 'emergency_isle',
            name: 'جزيرة الطوارئ',
            subtitle: 'حيث كل ثانية تساوي حياة',
            position: { x: 92, y: 18 },
            icon: '🚨',
            type: 'story',
            chapter: 'chapter11',
            unlocked: false,
            completed: false,
            story: `جزيرة الطوارئ... براكين وحروق وكوارث! هنا يتدرب الأبطال الحقيقيون.

قائد فرقة الطوارئ: "هنا نتعلم كيف نتعامل مع الحروق... حروق الدرجة الأولى والثانية والثالثة! وقاعدة التسعات! والكسور والجروح!"

"ABC! مجرى الهواء أولاً، ثم التنفس، ثم الدورة الدموية! GCS! مقياس غلاسكو للغيبوبة!"

تنين اللهب يظهر: "حروق! غيبوبة! GCS! هذا الاختبار النهائي!"`,
            creatures: [
                {
                    id: 'fire_dragon',
                    name: 'تنين اللهب الأزرق',
                    emoji: '🔥',
                    story: 'تنين يحيط به لهب: "GCS! اشرح لي مكونات مقياس غلاسكو!"',
                    chapter: 'chapter11',
                    questions: 10,
                    difficulty: 'hard',
                    hp: 100,
                    reward: { xp: 350, gold: 250 },
                    isBoss: true
                }
            ],
            treasure: {
                id: 'ultimate_crown',
                name: 'التاج النهائي',
                emoji: '👑',
                story: 'التاج الذي يثبت أنك أصبحت أسطورة التمريض',
                ability: 'ultimate_healer'
            },
            requirements: { type: 'complete', island: 'cancer_reef' },
            rewards: { xp: 800, gold: 500, title: '👑 أسطورة التمريض' },
            achievements: ['emergency_master', 'dragon_tamer'],
            weather: 'ناري',
            specialEvent: 'كارثة كبرى كل 10 أيام'
        }
    ],

    // ==================== نظام توليد جزر لا نهائية ====================
    generatedIslands: [],
    generatedCount: 0,
    islandNamePool: [
        { prefix: 'خليج', suffix: 'المفقود', icon: '🏝️' },
        { prefix: 'جزيرة', suffix: 'الغامضة', icon: '🗿' },
        { prefix: 'شعاب', suffix: 'المنسية', icon: '🪸' },
        { prefix: 'مضيق', suffix: 'المجهول', icon: '🌊' },
        { prefix: 'بركان', suffix: 'الحكمة', icon: '🌋' },
        { prefix: 'غابة', suffix: 'الأسرار', icon: '🌴' },
        { prefix: 'كهف', suffix: 'المعرفة', icon: '🕳️' },
        { prefix: 'جبل', suffix: 'التحدي', icon: '⛰️' },
        { prefix: 'وادي', suffix: 'الأحلام', icon: '🏞️' },
        { prefix: 'شلال', suffix: 'الشفاء', icon: '💧' }
    ],

    generateNewIsland: function() {
        this.generatedCount++;
        var pool = this.islandNamePool[this.generatedCount % this.islandNamePool.length];
        var name = pool.prefix + ' ' + pool.suffix + ' ' + this.generatedCount;
        
        // اختيار فصل عشوائي
        var chapters = ['chapter1','chapter2','chapter3','chapter4','chapter5','chapter6','chapter7','chapter8','chapter9','chapter10','chapter11'];
        var randomChapter = chapters[Math.floor(Math.random() * chapters.length)];
        
        var newIsland = {
            id: 'generated_' + this.generatedCount,
            name: name,
            subtitle: 'جزيرة مكتشفة حديثاً',
            position: {
                x: Math.floor(Math.random() * 80) + 10,
                y: Math.floor(Math.random() * 70) + 10
            },
            icon: pool.icon,
            type: 'generated',
            chapter: randomChapter,
            unlocked: true,
            completed: false,
            generated: true,
            number: this.generatedCount,
            story: `تبحر في مياه مجهولة... وفجأة تظهر ${name} في الأفق!

لم تكن هذه الجزيرة على أي خريطة! إنها جزيرة جديدة تماماً، تكونت بفعل البراكين تحت الماء.

"كلما تعلمت أكثر، كلما ظهرت جزر جديدة في عالمك..." هكذا همس الببغاء الحكيم.

هذه الجزيرة تخفي أسئلة من ${this.getChapterName(randomChapter)}. اختبر معرفتك، واجمع الكنز!`,
            creatures: [
                {
                    id: 'gen_creature_' + this.generatedCount,
                    name: 'حارس ' + name,
                    emoji: ['🦑','🦀','🐙','🦈','🐋','🐊','🦖','🐉'][Math.floor(Math.random() * 8)],
                    story: 'كائن بحري غامض: "لن تمر قبل أن تجيب على أسئلتي!"',
                    chapter: randomChapter,
                    questions: 5 + Math.floor(Math.random() * 5),
                    difficulty: 'medium',
                    hp: 50 + Math.floor(Math.random() * 60),
                    reward: { xp: 100 + Math.floor(Math.random() * 200), gold: 50 + Math.floor(Math.random() * 100) }
                }
            ],
            treasure: {
                id: 'gen_treasure_' + this.generatedCount,
                name: 'كنز ' + name,
                emoji: ['💎','👑','🏆','🌟','💍','🪙','🔮','⚜️'][Math.floor(Math.random() * 8)],
                story: 'كنز ثمين من ' + name,
                ability: null
            },
            requirements: null,
            rewards: { xp: 200 + Math.floor(Math.random() * 300), gold: 100 + Math.floor(Math.random() * 200) },
            achievements: [],
            weather: ['مشمس','غائم','ممطر','عاصف','ضبابي'][Math.floor(Math.random() * 5)],
            specialEvent: null
        };
        
        this.generatedIslands.push(newIsland);
        this.adventurer.discoveredIslands.push(newIsland.id);
        this.saveState();
        
        return newIsland;
    },

    getChapterName: function(chapterId) {
        var names = {
            'chapter1': 'الرعاية التلطيفية',
            'chapter2': 'الرعاية ما حول الجراحة',
            'chapter3': 'أمراض الجهاز التنفسي',
            'chapter4': 'أمراض القلب',
            'chapter5': 'أمراض الجهاز الهضمي',
            'chapter6': 'أمراض الجهاز البولي',
            'chapter7': 'الأمراض العصبية',
            'chapter8': 'أمراض العظام',
            'chapter9': 'أمراض الغدد الصماء',
            'chapter10': 'رعاية السرطان',
            'chapter11': 'الطوارئ'
        };
        return names[chapterId] || 'المعرفة';
    },

    getAllIslands: function() {
        return this.islands.concat(this.generatedIslands);
    },

    // ==================== الإنجازات (40 إنجاز) ====================
    achievementList: [
        { id: 'first_step', name: 'الخطوة الأولى', desc: 'ابدأ مغامرتك في ميناء البداية', icon: '👣', secret: false },
        { id: 'port_explorer', name: 'مستكشف الميناء', desc: 'اقرأ قصة ميناء البداية كاملة', icon: '🔍', secret: false },
        { id: 'mercy_master', name: 'سيد الرحمة', desc: 'أكمل شعاب الرحمة', icon: '🌅', secret: false },
        { id: 'ghost_slayer', name: 'صائد الأشباح', desc: 'اهزم شبح الرحمة', icon: '👻', secret: false },
        { id: 'surgeon_master', name: 'الجراح الماهر', desc: 'أكمل خليج الجراحين', icon: '🏥', secret: false },
        { id: 'sterile_champion', name: 'بطل التعقيم', desc: 'أجب على كل أسئلة التعقيم صحيحة', icon: '🧼', secret: false },
        { id: 'storm_master', name: 'سيد العواصف', desc: 'أكمل جزر الرئة العاصفة', icon: '🌪️', secret: false },
        { id: 'dragon_slayer', name: 'قاتل التنين', desc: 'اهزم تنين الأزيز', icon: '🐉', secret: false },
        { id: 'heart_guardian', name: 'حارس القلوب', desc: 'أكمل بركان القلوب', icon: '❤️', secret: false },
        { id: 'ogre_slayer', name: 'قاهر الغول', desc: 'اهزم غول الضغط', icon: '👹', secret: false },
        { id: 'labyrinth_master', name: 'سيد المتاهة', desc: 'أكمل متاهة البطن', icon: '🌀', secret: false },
        { id: 'serpent_charmer', name: 'مروض الأفاعي', desc: 'اهزم أفعى الزائدة', icon: '🐍', secret: false },
        { id: 'waterfall_master', name: 'سيد المياه', desc: 'أكمل شلالات الاحتباس', icon: '💧', secret: false },
        { id: 'elemental_defeater', name: 'قاهر العناصر', desc: 'اهزم عنصر الماء', icon: '🌊', secret: false },
        { id: 'mind_master', name: 'سيد العقول', desc: 'أكمل هاوية العقول', icon: '🧠', secret: false },
        { id: 'stroke_defeater', name: 'قاهر السكتة', desc: 'اهزم ملك السكتة', icon: '🧟‍♂️', secret: false },
        { id: 'bone_master', name: 'سيد العظام', desc: 'أكمل جبل العظام', icon: '🦴', secret: false },
        { id: 'golem_crusher', name: 'محطم الغول', desc: 'اهزم غول العظام', icon: '🗿', secret: false },
        { id: 'hormone_master', name: 'سيد الهرمونات', desc: 'أكمل مستنقع الهرمونات', icon: '⚗️', secret: false },
        { id: 'sugar_defeater', name: 'قاهر السكر', desc: 'اهزم شيطان السكر', icon: '🍬', secret: false },
        { id: 'cancer_warrior', name: 'محارب السرطان', desc: 'أكمل شعاب السرطان', icon: '🎗️', secret: false },
        { id: 'hope_bearer', name: 'حامل الأمل', desc: 'اهزم وحش السرطان', icon: '🌟', secret: false },
        { id: 'emergency_master', name: 'سيد الطوارئ', desc: 'أكمل جزيرة الطوارئ', icon: '🚨', secret: false },
        { id: 'dragon_tamer', name: 'مروض التنين', desc: 'اهزم تنين اللهب', icon: '🔥', secret: false },
        { id: 'collector_5', name: 'جامع الكنوز', desc: 'اجمع 5 كنوز', icon: '💎', secret: false },
        { id: 'collector_10', name: 'صائد الكنوز', desc: 'اجمع 10 كنوز', icon: '👑', secret: false },
        { id: 'gold_1000', name: 'التاجر الغني', desc: 'اجمع 1000 قطعة ذهبية', icon: '💰', secret: false },
        { id: 'xp_5000', name: 'المغامر الأسطوري', desc: 'اجمع 5000 XP', icon: '⭐', secret: false },
        { id: 'all_islands', name: 'ملك الجزر', desc: 'اكتشف كل الجزر الأساسية', icon: '🗺️', secret: false },
        { id: 'secret_midnight', name: 'قرصان الليل', desc: 'العب بعد منتصف الليل', icon: '🦉', secret: true },
        { id: 'secret_perfect', name: 'الكمال', desc: 'اهزم وحش بـ 100%', icon: '💯', secret: true },
        { id: 'secret_speed', name: 'البرق', desc: 'أجب 10 أسئلة صحيحة في دقيقة', icon: '⚡', secret: true },
        { id: 'secret_marathon', name: 'الماراثون', desc: 'العب ساعتين متواصلتين', icon: '🏃', secret: true },
        { id: 'secret_comeback', name: 'العودة', desc: 'عد بعد غياب أسبوع', icon: '🔄', secret: true },
        { id: 'secret_explorer', name: 'المكتشف', desc: 'زر 5 جزر في يوم واحد', icon: '🗺️', secret: true },
        { id: 'secret_lucky', name: 'المحظوظ', desc: '7 إجابات صحيحة متتالية', icon: '🍀', secret: true },
        { id: 'secret_healer', name: 'المعالج العظيم', desc: 'اجمع 3 قدرات خاصة', icon: '💚', secret: true },
        { id: 'secret_wise', name: 'الحكيم', desc: 'اقرأ كل القصص', icon: '🦉', secret: true },
        { id: 'secret_ultimate', name: 'الأسطورة', desc: 'أكمل 12 جزيرة أساسية', icon: '👑', secret: true },
        { id: 'endless_5', name: 'المغامر', desc: 'اكتشف 5 جزر مولدة', icon: '🗺️', secret: false }
    ],

    // ==================== دوال النظام ====================
    init: function() {
        this.loadState();
        this.checkDailyLogin();
        this.checkSecretAchievements();
    },

    loadState: function() {
        var saved = localStorage.getItem('ancient_map_state');
        if (saved) {
            var state = JSON.parse(saved);
            for (var key in state) {
                if (this.adventurer.hasOwnProperty(key)) {
                    this.adventurer[key] = state[key];
                }
            }
        }
        if (this.adventurer.discoveredIslands.length === 0) {
            this.adventurer.discoveredIslands = ['port_royal'];
        }
    },

    saveState: function() {
        localStorage.setItem('ancient_map_state', JSON.stringify(this.adventurer));
    },

    addXP: function(amount) {
        this.adventurer.xp += amount;
        if (typeof addXP === 'function') addXP(amount);
        this.saveState();
    },

    addGold: function(amount) {
        this.adventurer.gold += amount;
        this.saveState();
    },

    checkDailyLogin: function() {
        var today = new Date().toISOString().split('T')[0];
        var last = localStorage.getItem('ancient_map_last_login');
        if (last !== today) {
            this.addGold(30);
            localStorage.setItem('ancient_map_last_login', today);
        }
    },

    checkSecretAchievements: function() {
        var hour = new Date().getHours();
        if (hour >= 0 && hour < 5) {
            this.unlockAchievement('secret_midnight');
        }
    },

    unlockAchievement: function(id) {
        if (this.adventurer.achievements.indexOf(id) !== -1) return;
        var ach = this.achievementList.find(function(a) { return a.id === id; });
        if (!ach) return;
        
        this.adventurer.achievements.push(id);
        this.addGold(50);
        this.addXP(100);
        this.saveState();
        
        showToast('🏆 ' + ach.icon + ' ' + ach.name + '!', 'success');
        spawnConfetti();
    },

    // ==================== عرض الخريطة ====================
    openMap: function() {
        var self = this;
        var allIslands = this.getAllIslands();
        
        var h = '<div style="position:relative;width:100%;min-height:600px;background:linear-gradient(180deg,#8B6914,#A0782C,#C4A35A,#D4AF5A,#DEB887,#C4A35A);border-radius:15px;overflow:hidden;border:8px solid #5C3A0A;box-shadow:0 0 50px rgba(0,0,0,0.5),inset 0 0 100px rgba(0,0,0,0.3);" id="mapContainer">';
        
        // تأثير الورق القديم
        h += '<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at center,transparent 40%,rgba(139,105,20,0.6) 100%),repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(139,105,20,0.1) 3px,rgba(139,105,20,0.1) 4px);pointer-events:none;z-index:1;"></div>';
        
        // البوصلة
        h += '<div style="position:absolute;top:15px;right:15px;z-index:5;font-size:3rem;opacity:0.7;">🧭</div>';
        h += '<div style="position:absolute;top:20px;right:60px;z-index:5;color:#3A1F04;font-weight:900;font-size:0.8rem;text-shadow:1px 1px 1px rgba(0,0,0,0.3);">N</div>';
        
        // عنوان الخريطة
        h += '<div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:5;background:rgba(139,105,20,0.8);padding:8px 20px;border-radius:5px;border:2px solid #5C3A0A;font-family:serif;font-size:1.2rem;font-weight:900;color:#F5E6CC;letter-spacing:2px;text-shadow:2px 2px 2px rgba(0,0,0,0.5);">MARE MEDICINAE</div>';
        
        // خطوط الطول والعرض
        for (var i = 10; i < 100; i += 15) {
            h += '<div style="position:absolute;top:0;left:' + i + '%;width:1px;height:100%;background:rgba(139,105,20,0.15);z-index:0;"></div>';
            h += '<div style="position:absolute;top:' + i + '%;left:0;height:1px;width:100%;background:rgba(139,105,20,0.15);z-index:0;"></div>';
        }
        
        // رسم مسارات بين الجزر الأساسية
        var basicIslands = this.islands;
        h += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;">';
        h += '<defs><marker id="arrowGold" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#5C3A0A"/></marker></defs>';
        for (var i = 0; i < basicIslands.length - 1; i++) {
            var from = basicIslands[i];
            var to = basicIslands[i + 1];
            var unlocked = this.adventurer.discoveredIslands.indexOf(to.id) !== -1;
            h += '<line x1="' + from.position.x + '%" y1="' + from.position.y + '%" x2="' + to.position.x + '%" y2="' + to.position.y + '%" stroke="' + (unlocked ? '#5C3A0A' : '#8B7355') + '" stroke-width="' + (unlocked ? '2' : '1') + '" stroke-dasharray="' + (unlocked ? '8,4' : '12,8') + '" marker-end="url(#arrowGold)" opacity="' + (unlocked ? '0.6' : '0.2') + '"/>';
        }
        h += '</svg>';
        
        // رسم الجزر
        for (var i = 0; i < allIslands.length; i++) {
            var island = allIslands[i];
            var unlocked = this.adventurer.discoveredIslands.indexOf(island.id) !== -1;
            var completed = island.completed;
            var isCurrent = this.adventurer.currentPosition.island === island.id;
            
            h += '<div onclick="AncientMap.openIsland(\'' + island.id + '\')" style="position:absolute;left:' + island.position.x + '%;top:' + island.position.y + '%;transform:translate(-50%,-50%);cursor:' + (unlocked ? 'pointer' : 'default') + ';z-index:3;text-align:center;transition:all 0.5s ease;' + (unlocked ? '' : 'filter:grayscale(80%);opacity:0.5;') + (isCurrent ? 'animation:islandGlow 2s infinite;' : '') + '">';
            h += '<div style="font-size:' + (island.type === 'port' ? '3rem' : '2.2rem') + ';' + (completed ? 'filter:brightness(1.3);' : '') + '">' + island.icon + '</div>';
            h += '<div style="background:' + (completed ? '#10b981' : (unlocked ? '#5C3A0A' : '#666')) + ';color:#F5E6CC;padding:2px 6px;border-radius:8px;font-size:0.55rem;font-weight:700;white-space:nowrap;border:1px solid #3A1F04;">' + island.name + '</div>';
            if (completed) h += '<div style="font-size:0.8rem;">✅</div>';
            if (!unlocked) h += '<div style="font-size:0.8rem;">🔒</div>';
            if (isCurrent) h += '<div style="font-size:1.2rem;animation:sailBoat 1.5s infinite alternate;">⛵</div>';
            h += '</div>';
        }
        
        // سفينة اللاعب المتحركة
        var currentIsland = allIslands.find(function(is) { return is.id === self.adventurer.currentPosition.island; });
        if (currentIsland) {
            h += '<div id="playerShip" style="position:absolute;left:' + currentIsland.position.x + '%;top:' + (currentIsland.position.y - 8) + '%;transform:translate(-50%,-50%);font-size:2.5rem;z-index:4;pointer-events:none;transition:all 2s ease-in-out;animation:sailBoat 2s infinite alternate;">⛵</div>';
        }
        
        h += '</div>';
        
        // أسطورة الخريطة
        h += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:0.7rem;margin-top:8px;padding:5px;background:rgba(139,105,20,0.2);border-radius:10px;">';
        h += '<span>⛵ موقعك</span> | ';
        h += '<span>✅ مكتملة</span> | ';
        h += '<span>🔒 مقفلة</span> | ';
        h += '<span>👾 وحش</span> | ';
        h += '<span>💎 كنز</span> | ';
        h += '<span>🌀 جزر لانهائية</span>';
        h += '</div>';
        
        // إحصائيات المغامر
        h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">';
        h += '<div style="background:#3A1F04;color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #5C3A0A;"><b>⭐ XP</b><br>' + this.adventurer.xp + '</div>';
        h += '<div style="background:#3A1F04;color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #5C3A0A;"><b>🪙 ذهب</b><br>' + this.adventurer.gold + '</div>';
        h += '<div style="background:#3A1F04;color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #5C3A0A;"><b>🏝️ جزر</b><br>' + this.adventurer.discoveredIslands.length + '</div>';
        h += '<div style="background:#3A1F04;color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #5C3A0A;"><b>🏆 إنجازات</b><br>' + this.adventurer.achievements.length + '</div>';
        h += '</div>';
        
        // أزرار
        h += '<div style="display:flex;gap:5px;justify-content:center;margin-top:8px;flex-wrap:wrap;">';
        h += '<button class="modal-btn btn-primary" onclick="AncientMap.showJournal()" style="font-size:0.7rem;">📖 سجل الرحلة</button>';
        h += '<button class="modal-btn btn-success" onclick="AncientMap.openAchievements()" style="font-size:0.7rem;">🏆 الإنجازات</button>';
        h += '<button class="modal-btn btn-info" onclick="AncientMap.generateNewIsland();AncientMap.openMap();" style="font-size:0.7rem;">🌀 اكتشف جزيرة جديدة</button>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'mapModal\')">إغلاق</button>';
        h += '</div>';
        
        openModal('mapModal', h);
    },

    // ==================== فتح جزيرة ====================
    openIsland: function(islandId) {
        var allIslands = this.getAllIslands();
        var island = allIslands.find(function(is) { return is.id === islandId; });
        if (!island) return;
        
        if (this.adventurer.discoveredIslands.indexOf(islandId) === -1) {
            showToast('🔒 هذه الجزيرة لم تكتشف بعد!', 'warning');
            return;
        }
        
        // تحريك السفينة
        this.adventurer.currentPosition.island = islandId;
        this.adventurer.currentPosition.x = island.position.x;
        this.adventurer.currentPosition.y = island.position.y;
        this.adventurer.totalAdventures++;
        this.saveState();
        
        var h = '<div style="text-align:right;max-height:65vh;overflow-y:auto;padding:10px;">';
        
        // عنوان الجزيرة
        h += '<div style="text-align:center;margin-bottom:10px;">';
        h += '<span style="font-size:3rem;">' + island.icon + '</span>';
        h += '<h3 style="color:#5C3A0A;">' + island.name + '</h3>';
        h += '<p style="color:#8B6914;font-style:italic;">' + island.subtitle + '</p>';
        h += '<p style="font-size:0.75rem;">🌤️ ' + island.weather + '</p>';
        h += '</div>';
        
        // القصة
        h += '<div style="background:linear-gradient(135deg,#F5E6CC,#DEB887);padding:15px;border-radius:10px;border:2px solid #8B6914;margin:10px 0;font-style:italic;line-height:2;white-space:pre-line;">';
        h += island.story;
        h += '</div>';
        
        // الوحوش
        if (island.creatures && island.creatures.length > 0) {
            h += '<h4 style="color:#8B0000;">👾 الوحوش:</h4>';
            for (var i = 0; i < island.creatures.length; i++) {
                var creature = island.creatures[i];
                var defeated = this.adventurer.defeatedCreatures.indexOf(creature.id) !== -1;
                h += '<div style="background:' + (defeated ? '#f0fdf4' : '#fef2f2') + ';padding:10px;border-radius:8px;margin:5px 0;border:1px solid ' + (defeated ? '#10b981' : '#ef4444') + ';">';
                h += '<span style="font-size:1.5rem;">' + creature.emoji + '</span> ';
                h += '<strong>' + creature.name + '</strong>';
                if (creature.isBoss) h += ' <span style="color:#f59e0b;">👑 زعيم</span>';
                h += '<br><small>' + creature.story + '</small><br>';
                if (defeated) {
                    h += '<span style="color:#10b981;">✅ مهزوم</span>';
                } else {
                    h += '<button class="modal-btn btn-danger" onclick="AncientMap.startBattle(\'' + island.id + '\',\'' + creature.id + '\')" style="font-size:0.7rem;">⚔️ مواجهة!</button>';
                }
                h += '</div>';
            }
        }
        
        // الكنز
        if (island.treasure) {
            var found = this.adventurer.collectedArtifacts.indexOf(island.treasure.id) !== -1;
            h += '<h4 style="color:#f59e0b;">💎 الكنز:</h4>';
            h += '<div style="background:' + (found ? '#fef3c7' : '#f5f5f5') + ';padding:10px;border-radius:8px;border:2px solid ' + (found ? '#f59e0b' : '#ddd') + ';">';
            h += '<span style="font-size:2rem;">' + island.treasure.emoji + '</span> ';
            h += '<strong>' + island.treasure.name + '</strong>';
            h += '<br><small>' + island.treasure.story + '</small>';
            if (found) {
                h += '<br><span style="color:#10b981;">✅ تم جمعه!</span>';
            }
            h += '</div>';
        }
        
        // حدث خاص
        if (island.specialEvent) {
            h += '<div style="background:#fef3c7;padding:8px;border-radius:8px;margin:8px 0;text-align:center;">';
            h += '⚡ حدث خاص: ' + island.specialEvent;
            h += '</div>';
        }
        
        h += '</div>';
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'islandModal\');AncientMap.openMap();">العودة للخريطة</button>';
        
        openModal('islandModal', h);
    },

    // ==================== نظام المعارك ====================
    startBattle: function(islandId, creatureId) {
        var allIslands = this.getAllIslands();
        var island = allIslands.find(function(is) { return is.id === islandId; });
        if (!island) return;
        
        var creature = island.creatures.find(function(c) { return c.id === creatureId; });
        if (!creature) return;
        
        closeModal('islandModal');
        
        // اختيار الأسئلة
        var questions = [];
        if (creature.chapter && typeof getAllQuestions === 'function') {
            questions = getAllQuestions(creature.chapter, 'all');
        }
        if (!questions || questions.length === 0) {
            questions = getAllQuestions('all', 'all');
        }
        questions = questions.sort(function() { return Math.random() - 0.5; }).slice(0, creature.questions);
        
        if (questions.length < creature.questions && typeof getAllQuestions === 'function') {
            questions = getAllQuestions('all', 'all').sort(function() { return Math.random() - 0.5; }).slice(0, creature.questions);
        }
        
        window._battleCreature = creature;
        window._battleIsland = island;
        window._battleQuestions = questions;
        window._battleScores = {};
        window._battleStartTime = Date.now();
        window._battleCorrectStreak = 0;
        
        var h = '<div style="text-align:center;">';
        h += '<h2>⚔️ ' + creature.emoji + ' ' + creature.name + '</h2>';
        h += '<div style="background:#fef2f2;padding:10px;border-radius:10px;margin:10px 0;font-style:italic;">' + creature.story + '</div>';
        h += '<div style="display:flex;gap:20px;justify-content:center;align-items:center;">';
        h += '<div><span style="font-size:3rem;">' + creature.emoji + '</span><br><span style="color:#ef4444;">❤️ ' + creature.hp + '</span></div>';
        h += '<div style="font-size:2rem;">⚔️</div>';
        h += '<div><span style="font-size:3rem;">🧑‍⚕️</span><br><span style="color:#10b981;">❤️ ' + this.adventurer.health + '</span></div>';
        h += '</div>';
        h += '<p>📝 أجب على ' + creature.questions + ' أسئلة</p>';
        h += '</div>';
        h += '<div id="battleQuestions"></div>';
        
        openModal('battleModal', h);
        
        var qHTML = '';
        for (var i = 0; i < questions.length; i++) {
            if (typeof renderQuestionHTML === 'function') {
                qHTML += renderQuestionHTML(questions[i], i, 'Battle', questions.length);
            }
        }
        document.getElementById('battleQuestions').innerHTML = qHTML;
    },

    finishBattle: function() {
        var creature = window._battleCreature;
        var island = window._battleIsland;
        var total = window._battleQuestions.length;
        var correct = Object.values(window._battleScores).filter(function(v) { return v === true; }).length;
        var score = Math.round(correct / total * 100);
        var timeTaken = Math.floor((Date.now() - window._battleStartTime) / 1000);
        
        var won = score >= 60;
        
        var h = '<div style="text-align:center;">';
        if (won) {
            h += '<h2>🎉 انتصار!</h2>';
            h += '<div style="font-size:5rem;">🏆</div>';
            h += '<p>لقد هزمت ' + creature.emoji + ' ' + creature.name + '!</p>';
            h += '<p>النتيجة: ' + correct + '/' + total + ' (' + score + '%)</p>';
            h += '<p>⏱️ الوقت: ' + formatTime(timeTaken) + '</p>';
            
            this.adventurer.defeatedCreatures.push(creature.id);
            this.addXP(creature.reward.xp);
            this.addGold(creature.reward.gold);
            
            // فتح الكنز إذا كان زعيماً
            if (creature.isBoss && island.treasure) {
                if (this.adventurer.collectedArtifacts.indexOf(island.treasure.id) === -1) {
                    this.adventurer.collectedArtifacts.push(island.treasure.id);
                    if (island.treasure.ability) {
                        this.adventurer.abilities.push(island.treasure.ability);
                    }
                    h += '<p style="color:#f59e0b;">💎 تم العثور على ' + island.treasure.emoji + ' ' + island.treasure.name + '!</p>';
                }
            }
            
            // إكمال الجزيرة
            if (island.completed === false) {
                island.completed = true;
                this.adventurer.completedIslands.push(island.id);
                this.addXP(island.rewards.xp);
                this.addGold(island.rewards.gold);
                if (island.rewards.title) {
                    this.adventurer.title = island.rewards.title;
                }
                
                // فتح الجزيرة التالية
                var allIslands = this.getAllIslands();
                var currentIndex = -1;
                for (var i = 0; i < this.islands.length; i++) {
                    if (this.islands[i].id === island.id) { currentIndex = i; break; }
                }
                if (currentIndex >= 0 && currentIndex < this.islands.length - 1) {
                    var nextIsland = this.islands[currentIndex + 1];
                    if (this.adventurer.discoveredIslands.indexOf(nextIsland.id) === -1) {
                        this.adventurer.discoveredIslands.push(nextIsland.id);
                        h += '<p style="color:#10b981;">🗺️ تم اكتشاف ' + nextIsland.icon + ' ' + nextIsland.name + '!</p>';
                    }
                }
                
                // بعد آخر جزيرة، توليد جزر لا نهائية
                if (currentIndex >= this.islands.length - 1) {
                    var newIsland = this.generateNewIsland();
                    h += '<p style="color:#8b5cf6;">🌀 ظهرت جزيرة جديدة: ' + newIsland.name + '!</p>';
                }
                
                // إنجازات
                if (island.achievements) {
                    for (var a = 0; a < island.achievements.length; a++) {
                        this.unlockAchievement(island.achievements[a]);
                    }
                }
            }
            
            // إنجاز 100%
            if (score === 100) {
                this.unlockAchievement('secret_perfect');
            }
            
            spawnConfetti();
        } else {
            h += '<h2>😢 هزيمة</h2>';
            h += '<div style="font-size:5rem;">💀</div>';
            h += '<p>لقد هزمك ' + creature.emoji + ' ' + creature.name + '!</p>';
            h += '<p>النتيجة: ' + correct + '/' + total + ' (' + score + '%)</p>';
            h += '<p>تحتاج 60% على الأقل للفوز</p>';
            this.adventurer.health = Math.max(10, this.adventurer.health - 20);
            h += '<button class="modal-btn btn-danger" onclick="AncientMap.retryBattle()">🔄 حاول مرة أخرى</button>';
        }
        
        // إنجاز السرعة
        if (won && correct >= 10 && timeTaken <= 60) {
            this.unlockAchievement('secret_speed');
        }
        
        // إنجاز الحظ
        if (window._battleCorrectStreak >= 7) {
            this.unlockAchievement('secret_lucky');
        }
        
        this.saveState();
        h += '</div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'battleModal\');">إغلاق</button>';
        
        var modal = document.getElementById('battleModal');
        if (modal) {
            modal.querySelector('.modal-content').innerHTML = h;
        }
    },

    retryBattle: function() {
        closeModal('battleModal');
        var creature = window._battleCreature;
        var island = window._battleIsland;
        this.startBattle(island.id, creature.id);
    },

    // ==================== سجل الرحلة ====================
    showJournal: function() {
        var h = '<h2>📖 سجل رحلاتك</h2>';
        h += '<div style="max-height:50vh;overflow-y:auto;text-align:right;">';
        h += '<p><b>👤 المغامر:</b> ' + this.adventurer.name + '</p>';
        h += '<p><b>🎖️ اللقب:</b> ' + this.adventurer.title + '</p>';
        h += '<p><b>⛵ السفينة:</b> ' + this.adventurer.shipName + ' (مستوى ' + this.adventurer.shipLevel + ')</p>';
        h += '<p><b>🗺️ جزر مكتشفة:</b> ' + this.adventurer.discoveredIslands.length + '</p>';
        h += '<p><b>✅ جزر مكتملة:</b> ' + this.adventurer.completedIslands.length + '</p>';
        h += '<p><b>👾 وحوش مهزومة:</b> ' + this.adventurer.defeatedCreatures.length + '</p>';
        h += '<p><b>💎 كنوز مجمعة:</b> ' + this.adventurer.collectedArtifacts.length + '</p>';
        h += '<p><b>🏆 إنجازات:</b> ' + this.adventurer.achievements.length + '</p>';
        h += '<p><b>🦜 الطاقم:</b> ' + this.adventurer.crew.join(', ') + '</p>';
        h += '<p><b>🔮 قدرات:</b> ' + (this.adventurer.abilities.length > 0 ? this.adventurer.abilities.join(', ') : 'لا يوجد') + '</p>';
        h += '</div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'journalModal\')">إغلاق</button>';
        openModal('journalModal', h);
    },

    // ==================== الإنجازات ====================
    openAchievements: function() {
        var h = '<h2>🏆 الإنجازات (' + this.adventurer.achievements.length + '/' + this.achievementList.length + ')</h2>';
        h += '<div style="max-height:55vh;overflow-y:auto;">';
        
        for (var i = 0; i < this.achievementList.length; i++) {
            var ach = this.achievementList[i];
            var earned = this.adventurer.achievements.indexOf(ach.id) !== -1;
            
            if (ach.secret && !earned) {
                h += '<div style="background:var(--card-bg);padding:6px;border-radius:8px;margin:3px 0;opacity:0.3;">🔒 ???</div>';
            } else {
                h += '<div style="background:' + (earned ? '#f0fdf4' : 'var(--card-bg)') + ';padding:6px;border-radius:8px;margin:3px 0;border:1px solid var(--border-color);' + (earned ? '' : 'opacity:0.5;') + '">';
                h += '<span>' + (earned ? ach.icon : '🔒') + '</span> ';
                h += '<strong>' + ach.name + '</strong>';
                h += ' <small>' + ach.desc + '</small>';
                if (ach.secret && earned) h += ' <span style="color:#8b5cf6;">🔮</span>';
                h += '</div>';
            }
        }
        
        h += '</div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'achievementsModal\')">إغلاق</button>';
        openModal('achievementsModal', h);
    },

    // ==================== دوال المعركة العامة ====================
    answerBattle: function(btn, chosen, correct, i, total) {
        var parent = btn.parentElement;
        parent.querySelectorAll('.quiz-opt').forEach(function(b) { b.disabled = true; });
        var isCorrect = isAnswerCorrect(chosen, correct);
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        window._battleScores[i] = isCorrect;
        
        if (isCorrect) {
            window._battleCorrectStreak = (window._battleCorrectStreak || 0) + 1;
            AncientMap.addXP(5);
            AncientMap.addGold(2);
        } else {
            window._battleCorrectStreak = 0;
        }
        
        var fb = document.getElementById('Battle-fb-' + i);
        if (fb) {
            fb.textContent = isCorrect ? '✅ صحيح!' : '❌ خطأ - الصحيح: ' + correct;
            fb.style.color = isCorrect ? '#10b981' : '#ef4444';
        }
        
        if (Object.keys(window._battleScores).length >= total) {
            setTimeout(function() { AncientMap.finishBattle(); }, 500);
        }
    },

    // ==================== إضافة للواجهة ====================
    addButtons: function() {
        var self = this;
        var attempts = 0;
        
        function tryAdd() {
            var controlBar = document.querySelector('.control-bar');
            if (!controlBar) {
                attempts++;
                if (attempts < 20) setTimeout(tryAdd, 400);
                return;
            }
            
            if (document.getElementById('ancientMapBtn')) return;
            
            var btn = document.createElement('button');
            btn.id = 'ancientMapBtn';
            btn.className = 'leaderboard-btn';
            btn.innerHTML = '🗺️ خريطة';
            btn.title = 'خريطة القرصان القديمة';
            btn.onclick = function() { self.openMap(); };
            btn.style.background = 'linear-gradient(135deg, #5C3A0A, #8B6914)';
            btn.style.border = '2px solid #3A1F04';
            controlBar.appendChild(btn);
            
            debugLog('🗺️ تمت إضافة زر الخريطة القديمة');
        }
        
        tryAdd();
    }
};

// ===== دوال عالمية للمعركة =====
function checkBattleAnswer(btn, chosen, correct, i, total) {
    AncientMap.answerBattle(btn, chosen, correct, i, total);
}

function checkBattleOther(i, correctText, total) {
    var input = document.getElementById('Battle-other-' + i);
    if (!input || input.disabled) return;
    var isCorrect = false;
    if (typeof checkDefinitionAnswer === 'function') {
        isCorrect = checkDefinitionAnswer(input.value, correctText);
    }
    input.classList.add(isCorrect ? 'correct-input' : 'wrong-input');
    input.disabled = true;
    window._battleScores[i] = isCorrect;
    
    if (isCorrect) {
        window._battleCorrectStreak = (window._battleCorrectStreak || 0) + 1;
        AncientMap.addXP(8);
        AncientMap.addGold(3);
    } else {
        window._battleCorrectStreak = 0;
    }
    
    if (Object.keys(window._battleScores).length >= total) {
        setTimeout(function() { AncientMap.finishBattle(); }, 500);
    }
}

// ===== تهيئة =====
function initAncientMap() {
    AncientMap.init();
    AncientMap.addButtons();
    
    // إضافة CSS
    var style = document.createElement('style');
    style.textContent = `
        @keyframes sailBoat {
            0% { transform: translate(-50%,-50%) rotate(-5deg) translateX(-3px); }
            50% { transform: translate(-50%,-50%) rotate(0deg) translateX(0); }
            100% { transform: translate(-50%,-50%) rotate(5deg) translateX(3px); }
        }
        @keyframes islandGlow {
            0%, 100% { filter: drop-shadow(0 0 5px #fbbf24); }
            50% { filter: drop-shadow(0 0 15px #f59e0b); }
        }
    `;
    document.head.appendChild(style);
    
    debugLog('🏴‍☠️ تم تهيئة خريطة القرصان القديمة');
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initAncientMap, 3000);
});
