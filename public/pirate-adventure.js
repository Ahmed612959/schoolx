// ==================== 🏴‍☠️ نظام مغامرة القرصان والكنز ====================
// Medical Surgical Nursing - رحلة البحث عن كنز المعرفة
// معهد رعاية الضبعية الفني للتمريض

var PirateAdventure = {
    // ===== حالة اللاعب =====
    player: {
        name: 'البحار المبتدئ',
        title: '⚓ بحار مبتدئ',
        level: 1,
        xp: 0,
        coins: 0,
        health: 100,
        maxHealth: 100,
        islandsUnlocked: ['tutorial_island'],
        bossesDefeated: [],
        treasuresFound: [],
        achievements: [],
        inventory: [],
        currentIsland: 'tutorial_island',
        storyChapter: 1,
        streak: 0,
        lastLogin: null
    },

    // ===== جزر المغامرة (11 جزيرة = 11 فصل) =====
    islands: [
        {
            id: 'tutorial_island',
            name: '🏝️ جزيرة البداية',
            chapter: null,
            description: 'جزيرة التدريب حيث تبدأ رحلتك في عالم التمريض',
            order: 0,
            unlocked: true,
            completed: false,
            position: { x: 5, y: 95 },
            icon: '🏝️',
            color: '#10b981',
            requirements: null,
            rewards: { xp: 0, coins: 0 },
            monsters: [
                {
                    id: 'crab_tutorial',
                    name: '🦀 سلطعون الشك',
                    emoji: '🦀',
                    description: 'سلطعون صغير يختبر أساسياتك',
                    questions: 3,
                    difficulty: 'easy',
                    chapter: null,
                    questionsPool: 'basic',
                    hp: 30,
                    damage: 5,
                    reward: { xp: 50, coins: 25, item: 'compass' },
                    story: 'بينما تمشي على شاطئ جزيرة البداية، يظهر سلطعون عملاق! "أثبت أنك تعرف أساسيات التمريض وإلا فلن تمر!"'
                }
            ],
            treasure: null
        },
        {
            id: 'palliative_island',
            name: '🌅 جزيرة الرحمة',
            chapter: 'chapter1',
            description: 'جزيرة الرعاية التلطيفية - تعلم فن التخفيف والرحمة',
            order: 1,
            unlocked: false,
            completed: false,
            position: { x: 15, y: 80 },
            icon: '🌅',
            color: '#f59e0b',
            requirements: { type: 'complete_island', islandId: 'tutorial_island' },
            rewards: { xp: 200, coins: 100 },
            monsters: [
                {
                    id: 'ghost_pain',
                    name: '👻 شبح الألم',
                    emoji: '👻',
                    description: 'شبح يطارد الجزيرة، لا يهدأ إلا بمعرفة الرعاية التلطيفية',
                    questions: 5,
                    difficulty: 'easy',
                    chapter: 'chapter1',
                    questionsPool: 'palliative',
                    hp: 50,
                    damage: 8,
                    reward: { xp: 100, coins: 50, item: 'healing_potion' },
                    story: 'شبح أثيري يطفو فوق الجزيرة: "أنا شبح الألم... لا أستريح حتى تثبت أنك تفهم كيف تخفف معاناة المرضى!"'
                },
                {
                    id: 'boss_hospice',
                    name: '💀 حارس نهاية الحياة',
                    emoji: '💀',
                    description: 'الزعيم: حارس أسرار نهاية الحياة',
                    questions: 8,
                    difficulty: 'medium',
                    chapter: 'chapter1',
                    questionsPool: 'hospice',
                    hp: 80,
                    damage: 15,
                    reward: { xp: 200, coins: 150, title: '🌅 حارس الرحمة' },
                    isBoss: true,
                    story: 'حارس ضخم يقف أمام معبد الرحمة: "لن تدخل حتى تثبت أنك تفهم معنى الموت والحياة... والرعاية في اللحظات الأخيرة!"'
                }
            ],
            treasure: {
                id: 'treasure_mercy',
                name: '💎 جوهرة الرحمة',
                description: 'جوهرة متوهجة تمنحك قدرة فريدة على فهم آلام المرضى',
                hint: 'اهزم حارس نهاية الحياة لتكسب الجوهرة',
                reward: { xp: 300, coins: 200, ability: 'empathy_aura' }
            }
        },
        {
            id: 'surgery_island',
            name: '⚓ جزيرة الجراحين',
            chapter: 'chapter2',
            description: 'جزيرة العمليات الجراحية - تعلم فنون ما حول الجراحة',
            order: 2,
            unlocked: false,
            completed: false,
            position: { x: 30, y: 70 },
            icon: '⚓',
            color: '#ef4444',
            requirements: { type: 'complete_island', islandId: 'palliative_island' },
            rewards: { xp: 300, coins: 150 },
            monsters: [
                {
                    id: 'scrub_monster',
                    name: '🧟 وحش التعقيم',
                    emoji: '🧟',
                    description: 'وحش يختبر معرفتك بالتعقيم الجراحي',
                    questions: 6,
                    difficulty: 'medium',
                    chapter: 'chapter2',
                    questionsPool: 'surgery',
                    hp: 70,
                    damage: 12,
                    reward: { xp: 150, coins: 75, item: 'sterile_gloves' },
                    story: 'وحش مغطى بالضمادات يقفز أمامك: "التعقيم! التعقيم! أخبرني عن مبادئ التعقيم وإلا أصبتك بالعدوى!"'
                }
            ],
            treasure: {
                id: 'treasure_scalpel',
                name: '🗡️ مشرط الحكمة',
                description: 'مشرط ذهبي يرمز لإتقانك لفنون الجراحة',
                hint: 'تغلب على تحديات جزيرة الجراحين',
                reward: { xp: 400, coins: 250, ability: 'surgical_precision' }
            }
        },
        {
            id: 'respiratory_island',
            name: '🌪️ جزيرة العواصف الرئوية',
            chapter: 'chapter3',
            description: 'جزيرة أمراض الجهاز التنفسي - واجه عواصف الربو والالتهاب',
            order: 3,
            unlocked: false,
            completed: false,
            position: { x: 50, y: 60 },
            icon: '🌪️',
            color: '#3b82f6',
            requirements: { type: 'complete_island', islandId: 'surgery_island' },
            rewards: { xp: 350, coins: 175 },
            monsters: [
                {
                    id: 'wheezing_dragon',
                    name: '🐉 تنين الأزيز',
                    emoji: '🐉',
                    description: 'تنين يزفر دخاناً ويختبر معرفتك بالربو',
                    questions: 7,
                    difficulty: 'medium',
                    chapter: 'chapter3',
                    questionsPool: 'asthma',
                    hp: 90,
                    damage: 15,
                    reward: { xp: 200, coins: 100, item: 'inhaler' },
                    story: 'تنين أخضر يزفر سحباً من الدخان: "سعال... أزيز... هل تعرف كيف تعالجني؟ أثبت أنك تفهم الربو!"'
                }
            ],
            treasure: {
                id: 'treasure_lungs',
                name: '🫁 رئة الكريستال',
                description: 'رئة بلورية تمنحك فهم عميق لأمراض التنفس',
                hint: 'اهزم تنين الأزيز',
                reward: { xp: 500, coins: 300, ability: 'breath_of_life' }
            }
        },
        {
            id: 'cardiac_island',
            name: '❤️ جزيرة القلوب النابضة',
            chapter: 'chapter4',
            description: 'جزيرة أمراض القلب - كل نبضة تحدي',
            order: 4,
            unlocked: false,
            completed: false,
            position: { x: 65, y: 45 },
            icon: '❤️',
            color: '#dc2626',
            requirements: { type: 'complete_island', islandId: 'respiratory_island' },
            rewards: { xp: 400, coins: 200 },
            monsters: [
                {
                    id: 'boss_hypertension',
                    name: '👹 غول الضغط',
                    emoji: '👹',
                    description: 'غول ضخم يمثل ارتفاع ضغط الدم - الزعيم الرئيسي',
                    questions: 10,
                    difficulty: 'hard',
                    chapter: 'chapter4',
                    questionsPool: 'hypertension',
                    hp: 120,
                    damage: 20,
                    reward: { xp: 350, coins: 250, title: '❤️ سيد القلوب' },
                    isBoss: true,
                    story: 'غول أحمر ضخم يضرب الأرض بقدميه: "أنا القاتل الصامت! ارتفاع ضغط الدم! هل تجرؤ على مواجهتي؟!"'
                }
            ],
            treasure: {
                id: 'treasure_heart',
                name: '💖 قلب الياقوت',
                description: 'ياقوتة على شكل قلب تمنحك القدرة على فهم أمراض القلب',
                hint: 'اهزم غول الضغط',
                reward: { xp: 600, coins: 400, ability: 'heart_guardian' }
            }
        },
        {
            id: 'digestive_island',
            name: '🍽️ جزيرة المتاهة الهضمية',
            chapter: 'chapter5',
            description: 'جزيرة أمراض الجهاز الهضمي - متاهة من الأعراض',
            order: 5,
            unlocked: false,
            completed: false,
            position: { x: 45, y: 35 },
            icon: '🍽️',
            color: '#f97316',
            requirements: { type: 'complete_island', islandId: 'cardiac_island' },
            rewards: { xp: 350, coins: 175 },
            monsters: [
                {
                    id: 'serpent_appendicitis',
                    name: '🐍 أفعى الزائدة',
                    emoji: '🐍',
                    description: 'أفعى سامة تلتف حول بطنك - التهاب الزائدة الدودية',
                    questions: 6,
                    difficulty: 'medium',
                    chapter: 'chapter5',
                    questionsPool: 'appendicitis',
                    hp: 75,
                    damage: 12,
                    reward: { xp: 180, coins: 90, item: 'antidote' },
                    story: 'أفعى تلتف حول خصرك: "ألم في الربع السفلي الأيمن... غثيان... هل تعرف ما هذا؟ وكيف تعالجه؟!"'
                }
            ],
            treasure: {
                id: 'treasure_stomach',
                name: '🔮 كرة المعدة البلورية',
                description: 'كرة بلورية تكشف أسرار الجهاز الهضمي',
                hint: 'اهزم أفعى الزائدة وتحديات الهضم',
                reward: { xp: 450, coins: 250, ability: 'digestive_sage' }
            }
        },
        {
            id: 'urinary_island',
            name: '💧 جزيرة الينابيع المحتجزة',
            chapter: 'chapter6',
            description: 'جزيرة أمراض الجهاز البولي - احتباس وسلس',
            order: 6,
            unlocked: false,
            completed: false,
            position: { x: 75, y: 30 },
            icon: '💧',
            color: '#06b6d4',
            requirements: { type: 'complete_island', islandId: 'digestive_island' },
            rewards: { xp: 350, coins: 175 },
            monsters: [
                {
                    id: 'water_elemental',
                    name: '🌊 عنصر الماء',
                    emoji: '🌊',
                    description: 'كائن مائي يختبر فهمك لسلس البول واحتباسه',
                    questions: 7,
                    difficulty: 'medium',
                    chapter: 'chapter6',
                    questionsPool: 'urinary',
                    hp: 80,
                    damage: 12,
                    reward: { xp: 200, coins: 100, item: 'catheter' },
                    story: 'موجة عملاقة تتشكل أمامك: "الماء... البول... بعض الناس لا يستطيعون التحكم... والبعض لا يستطيع الإخراج... ماذا تعرف؟!"'
                }
            ],
            treasure: {
                id: 'treasure_kidney',
                name: '💎 ياقوتة الكلى',
                description: 'ياقوتة زرقاء تمنحك حكمة علاج المسالك البولية',
                hint: 'اهزم عنصر الماء',
                reward: { xp: 400, coins: 250, ability: 'water_master' }
            }
        },
        {
            id: 'neurological_island',
            name: '🧠 جزيرة العقول المضطربة',
            chapter: 'chapter7',
            description: 'جزيرة الأمراض العصبية - متاهات العقل',
            order: 7,
            unlocked: false,
            completed: false,
            position: { x: 85, y: 50 },
            icon: '🧠',
            color: '#8b5cf6',
            requirements: { type: 'complete_island', islandId: 'urinary_island' },
            rewards: { xp: 450, coins: 225 },
            monsters: [
                {
                    id: 'boss_stroke',
                    name: '🧟‍♂️ ملك السكتة',
                    emoji: '🧟‍♂️',
                    description: 'الزعيم: ملك السكتة الدماغية - التحدي الأصعب',
                    questions: 12,
                    difficulty: 'hard',
                    chapter: 'chapter7',
                    questionsPool: 'stroke',
                    hp: 150,
                    damage: 25,
                    reward: { xp: 500, coins: 350, title: '🧠 سيد الأعصاب' },
                    isBoss: true,
                    story: 'كيان مظلم يحيط به برق: "الوقت... الوقت هو العدو! السكتة الدماغية تنتظر لا أحد! FAST! FAST! هل تعرف ماذا يعني؟!"'
                }
            ],
            treasure: {
                id: 'treasure_brain',
                name: '👑 تاج العقل',
                description: 'تاج متوهج يمنحك الحكمة العصبية الكاملة',
                hint: 'اهزم ملك السكتة',
                reward: { xp: 700, coins: 500, ability: 'mind_master' }
            }
        },
        {
            id: 'musculoskeletal_island',
            name: '🦴 جزيرة العظام المكسورة',
            chapter: 'chapter8',
            description: 'جزيرة الكسور وهشاشة العظام',
            order: 8,
            unlocked: false,
            completed: false,
            position: { x: 55, y: 20 },
            icon: '🦴',
            color: '#a3a3a3',
            requirements: { type: 'complete_island', islandId: 'neurological_island' },
            rewards: { xp: 400, coins: 200 },
            monsters: [
                {
                    id: 'bone_golem',
                    name: '🗿 غول العظام',
                    emoji: '🗿',
                    description: 'غول من العظام يختبر معرفتك بالكسور',
                    questions: 8,
                    difficulty: 'medium',
                    chapter: 'chapter8',
                    questionsPool: 'fracture',
                    hp: 100,
                    damage: 18,
                    reward: { xp: 250, coins: 125, item: 'bone_cast' },
                    story: 'غول ضخم مصنوع من العظام: "كسور... جبس... رد... 5Ps! أخبرني وإلا كسرت عظامك!"'
                }
            ],
            treasure: {
                id: 'treasure_skeleton',
                name: '☠️ جمجمة المعرفة',
                description: 'جمجمة ذهبية تهمس بأسرار العظام',
                hint: 'اهزم غول العظام',
                reward: { xp: 450, coins: 300, ability: 'bone_whisperer' }
            }
        },
        {
            id: 'endocrine_island',
            name: '⚗️ جزيرة الهرمونات المتقلبة',
            chapter: 'chapter9',
            description: 'جزيرة أمراض الغدد الصماء - السكري والغدة الدرقية',
            order: 9,
            unlocked: false,
            completed: false,
            position: { x: 35, y: 15 },
            icon: '⚗️',
            color: '#ec4899',
            requirements: { type: 'complete_island', islandId: 'musculoskeletal_island' },
            rewards: { xp: 450, coins: 225 },
            monsters: [
                {
                    id: 'sugar_demon',
                    name: '🍬 شيطان السكر',
                    emoji: '🍬',
                    description: 'شيطان حلو المظهر يختبر معرفتك بالسكري',
                    questions: 8,
                    difficulty: 'hard',
                    chapter: 'chapter9',
                    questionsPool: 'diabetes',
                    hp: 110,
                    damage: 20,
                    reward: { xp: 300, coins: 150, item: 'insulin_vial' },
                    story: 'كائن لزج حلو المظهر: "السكر... الأنسولين... ثلاثة أعراض رئيسية... هل تعرفها؟ وإلا حولتك لحلوى!"'
                }
            ],
            treasure: {
                id: 'treasure_thyroid',
                name: '🦋 فراشة الدرقية',
                description: 'فراشة متوهجة على شكل غدة درقية',
                hint: 'اهزم شيطان السكر',
                reward: { xp: 500, coins: 350, ability: 'hormone_master' }
            }
        },
        {
            id: 'cancer_island',
            name: '🎗️ جزيرة الشريط الوردي',
            chapter: 'chapter10',
            description: 'جزيرة رعاية مرضى السرطان',
            order: 10,
            unlocked: false,
            completed: false,
            position: { x: 20, y: 40 },
            icon: '🎗️',
            color: '#f43f5e',
            requirements: { type: 'complete_island', islandId: 'endocrine_island' },
            rewards: { xp: 500, coins: 250 },
            monsters: [
                {
                    id: 'boss_cancer',
                    name: '👾 وحش السرطان',
                    emoji: '👾',
                    description: 'الزعيم النهائي: وحش السرطان - أقوى تحدي',
                    questions: 15,
                    difficulty: 'hard',
                    chapter: 'chapter10',
                    questionsPool: 'cancer',
                    hp: 200,
                    damage: 30,
                    reward: { xp: 600, coins: 400, title: '🎗️ محارب السرطان' },
                    isBoss: true,
                    story: 'كتلة داكنة ضخمة تنبض: "أنا المرض الذي يخافه الجميع... السرطان! هل تملك الشجاعة والمعرفة لمواجهتي؟!"'
                }
            ],
            treasure: {
                id: 'treasure_hope',
                name: '🌟 نجمة الأمل',
                description: 'أقوى كنز - نجمة تمنحك لقب أسطورة التمريض',
                hint: 'اهزم وحش السرطان',
                reward: { xp: 1000, coins: 800, ability: 'legendary_healer', title: '👑 أسطورة التمريض' }
            }
        },
        {
            id: 'emergency_island',
            name: '🚨 جزيرة الطوارئ الملتهبة',
            chapter: 'chapter11',
            description: 'الجزيرة الأخيرة - الحروق والطوارئ',
            order: 11,
            unlocked: false,
            completed: false,
            position: { x: 90, y: 75 },
            icon: '🚨',
            color: '#ef4444',
            requirements: { type: 'complete_island', islandId: 'cancer_island' },
            rewards: { xp: 600, coins: 300 },
            monsters: [
                {
                    id: 'boss_burn',
                    name: '🔥 تنين اللهب',
                    emoji: '🔥',
                    description: 'الزعيم النهائي الحقيقي: تنين الحروق والطوارئ',
                    questions: 15,
                    difficulty: 'hard',
                    chapter: 'chapter11',
                    questionsPool: 'burn',
                    hp: 200,
                    damage: 30,
                    reward: { xp: 700, coins: 500, title: '🔥 سيد الطوارئ' },
                    isBoss: true,
                    story: 'تنين يحيط به لهب أزرق: "حروق... طوارئ... غيبوبة... GCS! هذا الاختبار النهائي! أثبت أنك الأسطورة!"'
                }
            ],
            treasure: {
                id: 'treasure_ultimate',
                name: '👑 كنز المعرفة المطلق',
                description: 'الكنز النهائي - كل كنوز العالم',
                hint: 'اجمع كل الكنوز واهزم كل الزعماء',
                reward: { xp: 2000, coins: 1500, ability: 'ultimate_nurse', title: '🏆 أسطورة معهد الضبعية' }
            }
        }
    ],

    // ===== قائمة الإنجازات الكاملة (50 إنجاز) =====
    achievements: [
        // إنجازات القصة
        { id: 'first_step', name: '👣 الخطوة الأولى', desc: 'ابدأ رحلتك في جزيرة البداية', icon: '👣', type: 'story', secret: false },
        { id: 'island_master_3', name: '🏝️ مستكشف الجزر', desc: 'أكمل 3 جزر', icon: '🏝️', type: 'story', secret: false },
        { id: 'island_master_6', name: '🗺️ بحار متمرس', desc: 'أكمل 6 جزر', icon: '🗺️', type: 'story', secret: false },
        { id: 'island_master_9', name: '🌊 قبطان البحار', desc: 'أكمل 9 جزر', icon: '🌊', type: 'story', secret: false },
        { id: 'island_master_all', name: '👑 ملك الجزر', desc: 'أكمل كل الجزر الـ 12', icon: '👑', type: 'story', secret: false },
        
        // إنجازات الوحوش
        { id: 'monster_slayer_5', name: '⚔️ قاتل الوحوش', desc: 'اهزم 5 وحوش', icon: '⚔️', type: 'combat', secret: false },
        { id: 'monster_slayer_10', name: '🗡️ صياد الوحوش', desc: 'اهزم 10 وحوش', icon: '🗡️', type: 'combat', secret: false },
        { id: 'monster_slayer_all', name: '💀 مدمر الوحوش', desc: 'اهزم كل الوحوش', icon: '💀', type: 'combat', secret: false },
        { id: 'boss_slayer_3', name: '🏆 قاهر الزعماء', desc: 'اهزم 3 زعماء', icon: '🏆', type: 'combat', secret: false },
        { id: 'boss_slayer_all', name: '👑 ملك الزعماء', desc: 'اهزم كل الزعماء', icon: '👑', type: 'combat', secret: false },
        { id: 'no_damage', name: '🛡️ الدرع المنيع', desc: 'اهزم وحش بدون أن تفقد صحتك', icon: '🛡️', type: 'combat', secret: true },
        { id: 'one_shot', name: '💥 الضربة القاضية', desc: 'اهزم وحش بـ 100% إجابات صحيحة', icon: '💥', type: 'combat', secret: true },
        
        // إنجازات الكنوز
        { id: 'treasure_3', name: '💎 باحث عن الكنوز', desc: 'اجمع 3 كنوز', icon: '💎', type: 'collection', secret: false },
        { id: 'treasure_6', name: '👑 جامع الكنوز', desc: 'اجمع 6 كنوز', icon: '👑', type: 'collection', secret: false },
        { id: 'treasure_all', name: '🌟 كنز المعرفة', desc: 'اجمع كل الكنوز الـ 12', icon: '🌟', type: 'collection', secret: false },
        
        // إنجازات سرية (مخفية)
        { id: 'secret_midnight', name: '🦉 قرصان الليل', desc: 'العب بعد منتصف الليل', icon: '🦉', type: 'secret', secret: true },
        { id: 'secret_speed', name: '⚡ البرق', desc: 'أجب على 10 أسئلة صحيحة في أقل من دقيقة', icon: '⚡', type: 'secret', secret: true },
        { id: 'secret_perfect', name: '💯 الكمال', desc: 'احصل على 100% في 5 تحديات متتالية', icon: '💯', type: 'secret', secret: true },
        { id: 'secret_marathon', name: '🏃 ماراثون', desc: 'العب لمدة ساعتين متواصلتين', icon: '🏃', type: 'secret', secret: true },
        { id: 'secret_comeback', name: '🔄 العودة', desc: 'عد للعب بعد غياب أسبوع', icon: '🔄', type: 'secret', secret: true },
        { id: 'secret_lucky', name: '🍀 المحظوظ', desc: 'أجب على 7 أسئلة صحيحة متتالية', icon: '🍀', type: 'secret', secret: true },
        { id: 'secret_explorer', name: '🗺️ المكتشف', desc: 'زر كل الجزر في يوم واحد', icon: '🗺️', type: 'secret', secret: true },
        { id: 'secret_healer', name: '💚 المعالج', desc: 'أكمل جزيرة بدون استخدام أي مساعدة', icon: '💚', type: 'secret', secret: true },
        { id: 'secret_wise', name: '🦉 الحكيم', desc: 'اقرأ كل القصص في كل الجزر', icon: '🦉', type: 'secret', secret: true },
        { id: 'secret_king', name: '👑 الملك الحقيقي', desc: 'اجمع كل الكنوز واهزم كل الزعماء', icon: '👑', type: 'secret', secret: true },
        
        // إنجازات XP
        { id: 'xp_1000', name: '⭐ نجم صاعد', desc: 'اجمع 1000 XP', icon: '⭐', type: 'xp', secret: false },
        { id: 'xp_5000', name: '🌟 نجم لامع', desc: 'اجمع 5000 XP', icon: '🌟', type: 'xp', secret: false },
        { id: 'xp_10000', name: '💫 أسطورة', desc: 'اجمع 10000 XP', icon: '💫', type: 'xp', secret: false },
        
        // إنجازات العملات
        { id: 'coins_500', name: '🪙 تاجر', desc: 'اجمع 500 عملة', icon: '🪙', type: 'coins', secret: false },
        { id: 'coins_2000', name: '💰 ثري', desc: 'اجمع 2000 عملة', icon: '💰', type: 'coins', secret: false },
        { id: 'coins_5000', name: '💎 مليونير', desc: 'اجمع 5000 عملة', icon: '💎', type: 'coins', secret: false }
    ],

    // ===== قائمة الألقاب =====
    titles: [
        { id: 'sailor', name: '⚓ بحار', requirement: 'ابدأ اللعبة' },
        { id: 'explorer', name: '🗺️ مستكشف', requirement: 'أكمل 3 جزر' },
        { id: 'warrior', name: '⚔️ محارب', requirement: 'اهزم 5 وحوش' },
        { id: 'treasure_hunter', name: '💎 صائد كنوز', requirement: 'اجمع 3 كنوز' },
        { id: 'captain', name: '🚢 قبطان', requirement: 'أكمل 6 جزر' },
        { id: 'boss_slayer', name: '🏆 قاتل زعماء', requirement: 'اهزم 3 زعماء' },
        { id: 'rich', name: '💰 ثري', requirement: 'اجمع 2000 عملة' },
        { id: 'admiral', name: '🎖️ أميرال', requirement: 'أكمل 9 جزر' },
        { id: 'legend', name: '👑 أسطورة', requirement: 'أكمل كل الجزر' },
        { id: 'god', name: '🌟 إله التمريض', requirement: 'اجمع كل شيء' }
    ],

    // ===== المواقف التمريضية (من الشباتر + مخترعة) =====
    scenarios: [
        {
            id: 'scenario_1',
            title: '🚨 حالة طارئة في جزيرة الرحمة',
            chapter: 'chapter1',
            story: 'أنت في جزيرة الرحمة. مريض في المرحلة النهائية تظهر عليه علامات تبقّع اليدين والقدمين وتنفس غير منتظم. العائلة قلقة جداً وتبكي. ماذا تفعل؟',
            options: [
                { text: 'أطلب من العائلة المغادرة حتى لا يزعجوا المريض', correct: false, feedback: 'خطأ! العائلة تحتاج الدعم أيضاً في هذه اللحظات.' },
                { text: 'أشرح للعائلة أن هذه العلامات طبيعية في نهاية الحياة وأقدم الدعم العاطفي', correct: true, feedback: '✅ ممتاز! هذا هو التصرف الصحيح - الرعاية التلطيفية تشمل دعم العائلة أيضاً.' },
                { text: 'أتصل بالطبيب فوراً لإجراء إنعاش قلبي رئوي', correct: false, feedback: 'خطأ! في الرعاية التلطيفية، لا يتم إجراء الإنعاش.' }
            ],
            reward: { xp: 50, coins: 30 }
        },
        {
            id: 'scenario_2',
            title: '🔪 حالة ما قبل الجراحة',
            chapter: 'chapter2',
            story: 'مريض مقرر له عملية جراحية في البطن غداً. يخبرك أنه تناول وجبة دسمة منذ ساعتين لأنه كان جائعاً. ماذا تفعل؟',
            options: [
                { text: 'لا تفعل شيئاً - العملية غداً وليست اليوم', correct: false, feedback: 'خطأ! يجب أن يكون المريض صائماً قبل الجراحة.' },
                { text: 'أبلغ الطبيب فوراً - قد تحتاج العملية للتأجيل', correct: true, feedback: '✅ صحيح! NPO مهم جداً قبل الجراحة لمنع الاستنشاق أثناء التخدير.' },
                { text: 'أعطي المريض دواء للهضم', correct: false, feedback: 'خطأ! هذا ليس حلاً وقد يزيد المشكلة.' }
            ],
            reward: { xp: 50, coins: 30 }
        },
        {
            id: 'scenario_3',
            title: '🫁 أزمة ربو في العاصفة',
            chapter: 'chapter3',
            story: 'طفل في جزيرة العواصف يعاني من نوبة ربو حادة. أزيز، ضيق تنفس، وشفاه مزرقة. ليس معك بخاخ. ماذا تفعل أولاً؟',
            options: [
                { text: 'أجعل الطفل يستلقي على ظهره', correct: false, feedback: 'خطأ! وضعية الاستلقاء تزيد صعوبة التنفس.' },
                { text: 'أجلس الطفل في وضعية فاولر المرتفعة وأعطيه أكسجين مرطب إذا توفر', correct: true, feedback: '✅ ممتاز! وضعية فاولر تساعد على توسيع مجرى التنفس.' },
                { text: 'أنتظر حتى تمر النوبة لوحدها', correct: false, feedback: 'خطأ! نوبة الربو الحادة قد تكون مهددة للحياة.' }
            ],
            reward: { xp: 60, coins: 35 }
        },
        {
            id: 'scenario_4',
            title: '❤️ ألم صدري في جزيرة القلوب',
            chapter: 'chapter4',
            story: 'رجل 60 سنة في جزيرة القلوب يعاني من ألم شديد في الصدر يمتد للذراع الأيسر مع تعرق. أنت الممرض الوحيد. ماذا تفعل؟',
            options: [
                { text: 'أعطيه أسبرين وأطلب منه الراحة', correct: false, feedback: 'غير كاف! هذه أعراض جلطة قلبية محتملة.' },
                { text: 'أتصل بالإسعاف فوراً، أعطيه أكسجين، وأراقب علاماته الحيوية', correct: true, feedback: '✅ صحيح! الوقت عضلة قلب! كل دقيقة مهمة.' },
                { text: 'أطلب منه المشي لتحسين الدورة الدموية', correct: false, feedback: 'خطأ! المجهود يزيد العبء على القلب.' }
            ],
            reward: { xp: 70, coins: 40 }
        },
        {
            id: 'scenario_5',
            title: '🍽️ ألم بطني حاد',
            chapter: 'chapter5',
            story: 'شاب 20 سنة يعاني من ألم في الربع السفلي الأيمن من البطن، غثيان، وحمى خفيفة. الألم يزداد عند الضغط ثم إزالة اليد. ماذا تشتبه؟',
            options: [
                { text: 'التهاب المعدة - أعطيه مضاد حموضة', correct: false, feedback: 'خطأ! الألم في الربع السفلي الأيمن مع ألم ارتدادي يشير لشيء آخر.' },
                { text: 'التهاب الزائدة الدودية - لا أعطيه مسكنات وأطلب تقييم طبي فوري', correct: true, feedback: '✅ ممتاز! علامة بلومبيرج (ألم ارتدادي) + ألم RLQ = اشتباه زائدة.' },
                { text: 'غازات - أطلب منه التجشؤ', correct: false, feedback: 'خطأ! هذه أعراض خطيرة تحتاج تدخل طبي.' }
            ],
            reward: { xp: 60, coins: 35 }
        },
        {
            id: 'scenario_6',
            title: '💧 مريض لم يتبول',
            chapter: 'chapter6',
            story: 'مريض بعد عملية جراحية في البطن منذ 8 ساعات ولم يتبول بعد. يشعر بانزعاج في أسفل البطن والمثانة ممتلئة بالجس. ماذا تفعل؟',
            options: [
                { text: 'أنتظر ساعتين أخريين', correct: false, feedback: 'خطأ! 8 ساعات كثيرة جداً.' },
                { text: 'أقوم بقسطرة المريض لتفريغ المثانة', correct: true, feedback: '✅ صحيح! احتباس البول بعد الجراحة شائع ويحتاج تدخل.' },
                { text: 'أعطيه مدرات بول', correct: false, feedback: 'خطأ! المدرات قد تزيد المشكلة إذا كان هناك انسداد.' }
            ],
            reward: { xp: 55, coins: 30 }
        },
        {
            id: 'scenario_7',
            title: '🧠 سكتة دماغية',
            chapter: 'chapter7',
            story: 'امرأة 70 سنة فجأة لا تستطيع رفع ذراعها الأيمن، وجهها متدلي من الجهة اليمنى، وكلامها متداخل. زوجها يتصل بك. ماذا تقول له؟',
            options: [
                { text: 'انتظروني ساعة حتى أنهي عملي', correct: false, feedback: 'خطأ! في السكتة، الوقت = دماغ! كل دقيقة مهمة.' },
                { text: 'اتصل بالإسعاف فوراً! هذا FAST - وجه، ذراع، كلام، وقت!', correct: true, feedback: '✅ ممتاز! FAST = Face, Arm, Speech, Time. هذه سكتة دماغية محتملة.' },
                { text: 'أعطها أسبرين وانتظر', correct: false, feedback: 'خطأ! لا تعط أسبرين قبل التأكد من نوع السكتة (قد تكون نزفية).' }
            ],
            reward: { xp: 75, coins: 45 }
        },
        {
            id: 'scenario_8',
            title: '🦴 سقوط في جزيرة العظام',
            chapter: 'chapter8',
            story: 'عامل بناء سقط من سقالة. ذراعه الأيمن متشوه، متورم، ويشكو من ألم شديد وخدر في أصابعه. لا نبض في الرسغ. ماذا تفعل؟',
            options: [
                { text: 'أحاول إعادة العظم لمكانه', correct: false, feedback: 'خطأ! لا تحاول الرد بنفسك.' },
                { text: 'أثبت الذراع بجبيرة، أتحقق من 5Ps، وأطلب إسعاف فوري', correct: true, feedback: '✅ ممتاز! انعدام النبض = حالة طارئة تستدعي تدخل فوري.' },
                { text: 'أضع كمادات دافئة وأدلك المنطقة', correct: false, feedback: 'خطأ! لا تضع حرارة ولا تدلك مكان الكسر.' }
            ],
            reward: { xp: 65, coins: 40 }
        },
        {
            id: 'scenario_9',
            title: '⚗️ غيبوبة سكري',
            chapter: 'chapter9',
            story: 'مريض سكري وجدته فاقداً للوعي في غرفته. رائحة فمه تشبه الأسيتون (مزيل طلاء الأظافر). ماذا تشتبه وماذا تفعل؟',
            options: [
                { text: 'أعطيه أنسولين فوراً', correct: false, feedback: 'خطأ! قد يكون في حالة هبوط سكر وليس ارتفاع.' },
                { text: 'أفحص سكر الدم فوراً، وإذا كان مرتفعاً جداً فهذه حالة DKA - أتصل بالطوارئ', correct: true, feedback: '✅ ممتاز! رائحة الأسيتون = حماض كيتوني سكري (DKA). حالة طارئة!' },
                { text: 'أعطيه عصير برتقال', correct: false, feedback: 'خطأ! العصير يستخدم لهبوط السكر وليس لارتفاعه.' }
            ],
            reward: { xp: 70, coins: 45 }
        },
        {
            id: 'scenario_10',
            title: '🎗️ مريض بعد كيميائي',
            chapter: 'chapter10',
            story: 'مريض سرطان بعد جلسة علاج كيميائي بيومين. حرارته 38.5°م، متعب جداً، وعدد كريات الدم البيضاء منخفض جداً (0.5). ماذا تفعل؟',
            options: [
                { text: 'أطلب منه الراحة في سريره وأعطيه خافض حرارة', correct: false, feedback: 'غير كاف! هذا مريض في حالة خطيرة.' },
                { text: 'أعزله فوراً، أبلغ الطبيب، فهذه حالة طارئة (Febrile Neutropenia)', correct: true, feedback: '✅ ممتاز! حمى + نقص عدلات = حالة طارئة تهدد الحياة.' },
                { text: 'أطلب منه العودة للمنزل والراحة', correct: false, feedback: 'خطأ! يحتاج دخول المستشفى فوراً.' }
            ],
            reward: { xp: 75, coins: 50 }
        },
        {
            id: 'scenario_11',
            title: '🔥 حريق في جزيرة الطوارئ',
            chapter: 'chapter11',
            story: 'حريق في مصنع. عامل يعاني من حروق في وجهه ويديه. جلده شمعي أبيض ولا يشعر بألم في المناطق المحروقة. صوته مبحوح. ماذا تفعل أولاً؟',
            options: [
                { text: 'أضع كريم حروق على المناطق المصابة', correct: false, feedback: 'خطأ! لا تضع أي كريمات على الحروق.' },
                { text: 'أتأكد من مجرى الهواء أولاً (صوته مبحوح = خطر على التنفس)، أغطي الحروق بضماد نظيف، وأطلب إسعاف', correct: true, feedback: '✅ ممتاز! حروق الوجه + بحة صوت = اشتباه إصابة استنشاقية! ABC أولاً.' },
                { text: 'أغمره في ماء بارد', correct: false, feedback: 'خطأ! لا تغمر حروق كبيرة في ماء بارد.' }
            ],
            reward: { xp: 80, coins: 50 }
        }
    ],

    // ===== دوال النظام الرئيسية =====
    init: function() {
        this.loadState();
        this.updateMapDisplay();
        this.checkDailyLogin();
        this.checkSecretAchievements();
    },

    loadState: function() {
        var saved = localStorage.getItem('pirate_adventure_state');
        if (saved) {
            var state = JSON.parse(saved);
            Object.assign(this.player, state);
        }
    },

    saveState: function() {
        localStorage.setItem('pirate_adventure_state', JSON.stringify(this.player));
    },

    // ===== عرض الخريطة =====
    openMap: function() {
        var h = '<h2>🗺️ خريطة مغامرة القرصان</h2>';
        h += '<div style="position:relative;width:100%;height:500px;background:linear-gradient(180deg,#0c4a6e,#0369a1,#0284c7,#38bdf8,#bae6fd);border-radius:20px;overflow:hidden;margin:10px 0;border:3px solid #92400e;">';
        
        // رسم مسار بين الجزر
        h += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;">';
        h += '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#fbbf24"/></marker></defs>';
        
        var islandsOrdered = this.islands.sort(function(a, b) { return a.order - b.order; });
        for (var i = 0; i < islandsOrdered.length - 1; i++) {
            var from = islandsOrdered[i];
            var to = islandsOrdered[i + 1];
            h += '<line x1="' + from.position.x + '%" y1="' + from.position.y + '%" x2="' + to.position.x + '%" y2="' + to.position.y + '%" stroke="#fbbf24" stroke-width="3" stroke-dasharray="8,4" marker-end="url(#arrow)" opacity="0.7"/>';
        }
        h += '</svg>';
        
        // رسم الجزر
        for (var i = 0; i < this.islands.length; i++) {
            var island = this.islands[i];
            var unlocked = this.player.islandsUnlocked.indexOf(island.id) !== -1;
            var completed = island.completed;
            
            h += '<div onclick="' + (unlocked ? "PirateAdventure.openIsland('" + island.id + "')" : "PirateAdventure.showLockedMessage('" + island.id + "')") + '" style="position:absolute;left:' + island.position.x + '%;top:' + island.position.y + '%;transform:translate(-50%,-50%);cursor:pointer;text-align:center;transition:all 0.3s;' + (unlocked ? '' : 'filter:grayscale(100%);opacity:0.5;') + '">';
            h += '<div style="font-size:2.5rem;">' + island.icon + '</div>';
            h += '<div style="background:' + island.color + ';color:white;padding:2px 8px;border-radius:10px;font-size:0.6rem;font-weight:700;white-space:nowrap;">' + island.name + '</div>';
            if (completed) h += '<div style="color:#10b981;font-size:1rem;">✅</div>';
            if (!unlocked) h += '<div style="color:#ef4444;font-size:1rem;">🔒</div>';
            h += '</div>';
        }
        
        // سفينة اللاعب
        var currentIsland = this.islands.find(function(is) { return is.id === PirateAdventure.player.currentIsland; });
        if (currentIsland) {
            h += '<div style="position:absolute;left:' + currentIsland.position.x + '%;top:' + (currentIsland.position.y - 10) + '%;transform:translate(-50%,-50%);font-size:2rem;animation:sailBoat 2s infinite alternate;pointer-events:none;">⛵</div>';
        }
        
        h += '</div>';
        
        // أسطورة الخريطة
        h += '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;font-size:0.75rem;">';
        h += '<span>⛵ = موقعك</span>';
        h += '<span>✅ = مكتملة</span>';
        h += '<span>🔒 = مقفلة</span>';
        h += '<span>👾 = فيها وحوش</span>';
        h += '<span>💎 = فيها كنز</span>';
        h += '</div>';
        
        // إحصائيات
        h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;">';
        h += '<div style="background:var(--card-bg);padding:8px;border-radius:10px;text-align:center;"><b>⭐ XP</b><br>' + this.player.xp + '</div>';
        h += '<div style="background:var(--card-bg);padding:8px;border-radius:10px;text-align:center;"><b>🪙 عملات</b><br>' + this.player.coins + '</div>';
        h += '<div style="background:var(--card-bg);padding:8px;border-radius:10px;text-align:center;"><b>❤️ صحة</b><br>' + this.player.health + '/' + this.player.maxHealth + '</div>';
        h += '<div style="background:var(--card-bg);padding:8px;border-radius:10px;text-align:center;"><b>🏝️ جزر</b><br>' + this.player.islandsUnlocked.length + '/' + this.islands.length + '</div>';
        h += '</div>';
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'mapModal\')">إغلاق</button>';
        
        openModal('mapModal', h);
    },

    showLockedMessage: function(islandId) {
        var island = this.islands.find(function(is) { return is.id === islandId; });
        if (!island) return;
        showToast('🔒 ' + island.name + ' مقفلة! أكمل الجزيرة السابقة أولاً.', 'warning');
    },

    openIsland: function(islandId) {
        var island = this.islands.find(function(is) { return is.id === islandId; });
        if (!island || this.player.islandsUnlocked.indexOf(islandId) === -1) return;
        
        this.player.currentIsland = islandId;
        this.saveState();
        
        var h = '<h2>' + island.icon + ' ' + island.name + '</h2>';
        h += '<p>' + island.description + '</p>';
        
        // عرض الوحوش
        if (island.monsters && island.monsters.length > 0) {
            h += '<h4>👾 الوحوش في هذه الجزيرة:</h4>';
            for (var i = 0; i < island.monsters.length; i++) {
                var monster = island.monsters[i];
                var defeated = this.player.bossesDefeated.indexOf(monster.id) !== -1;
                h += '<div style="background:var(--card-bg);padding:10px;border-radius:10px;margin:5px 0;border:1px solid ' + (defeated ? 'var(--green)' : 'var(--red)') + ';">';
                h += '<span style="font-size:2rem;">' + monster.emoji + '</span> ';
                h += '<strong>' + monster.name + '</strong> ';
                h += '<span style="font-size:0.7rem;">(❤️' + monster.hp + ' ⚔️' + monster.damage + ')</span>';
                h += '<br><small>' + monster.description + '</small>';
                h += '<br>';
                if (defeated) {
                    h += '<span style="color:var(--green);">✅ مهزوم</span>';
                } else {
                    h += '<button class="modal-btn btn-danger" onclick="PirateAdventure.startBattle(\'' + islandId + '\',\'' + monster.id + '\')" style="font-size:0.7rem;">⚔️ مواجهة!</button>';
                }
                if (monster.isBoss) h += ' <span style="color:#f59e0b;">👑 زعيم</span>';
                h += '</div>';
            }
        }
        
        // عرض الكنز
        if (island.treasure) {
            var found = this.player.treasuresFound.indexOf(island.treasure.id) !== -1;
            h += '<h4>💎 الكنز:</h4>';
            h += '<div style="background:var(--gold-light);padding:10px;border-radius:10px;">';
            h += '<strong>' + island.treasure.name + '</strong>';
            h += '<p>' + island.treasure.description + '</p>';
            if (found) {
                h += '<span style="color:var(--green);">✅ تم العثور عليه!</span>';
            } else {
                h += '<p style="font-size:0.75rem;">💡 ' + island.treasure.hint + '</p>';
            }
            h += '</div>';
        }
        
        // مواقف تمريضية
        var islandScenarios = this.scenarios.filter(function(s) { return s.chapter === island.chapter; });
        if (islandScenarios.length > 0) {
            h += '<h4>📋 مواقف تمريضية:</h4>';
            h += '<button class="modal-btn btn-info" onclick="PirateAdventure.startScenario(\'' + island.chapter + '\')">📝 مواجهة موقف</button>';
        }
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'islandModal\');PirateAdventure.openMap();">العودة للخريطة</button>';
        
        openModal('islandModal', h);
    },

    // ===== نظام المعارك =====
    startBattle: function(islandId, monsterId) {
        var island = this.islands.find(function(is) { return is.id === islandId; });
        var monster = island.monsters.find(function(m) { return m.id === monsterId; });
        if (!monster) return;
        
        closeModal('islandModal');
        
        // اختيار الأسئلة
        var questions = [];
        if (monster.chapter) {
            questions = getAllQuestions(monster.chapter, 'all').sort(function() { return Math.random() - 0.5; }).slice(0, monster.questions);
        } else {
            questions = getAllQuestions('all', 'all').sort(function() { return Math.random() - 0.5; }).slice(0, monster.questions);
        }
        
        if (questions.length < monster.questions) {
            questions = getAllQuestions('all', 'all').sort(function() { return Math.random() - 0.5; }).slice(0, monster.questions);
        }
        
        window._battleMonster = monster;
        window._battleQuestions = questions;
        window._battleScores = {};
        window._battleHP = monster.hp;
        window._battlePlayerHP = this.player.health;
        
        var h = '<h2>⚔️ معركة: ' + monster.emoji + ' ' + monster.name + '</h2>';
        h += '<div style="background:#fef2f2;padding:10px;border-radius:10px;margin:10px 0;font-style:italic;">' + monster.story + '</div>';
        h += '<div style="display:flex;gap:20px;justify-content:center;margin:10px 0;">';
        h += '<div style="text-align:center;"><div style="font-size:3rem;">' + monster.emoji + '</div><div style="background:#ef4444;color:white;padding:5px 10px;border-radius:10px;">❤️ <span id="monsterHP">' + monster.hp + '</span></div></div>';
        h += '<div style="text-align:center;font-size:2rem;">⚔️</div>';
        h += '<div style="text-align:center;"><div style="font-size:3rem;">🧑‍⚕️</div><div style="background:#10b981;color:white;padding:5px 10px;border-radius:10px;">❤️ <span id="playerHP">' + this.player.health + '</span></div></div>';
        h += '</div>';
        h += '<div id="battleQuestions"></div>';
        
        var qHTML = '';
        for (var i = 0; i < questions.length; i++) {
            qHTML += renderQuestionHTML(questions[i], i, 'Battle', questions.length);
        }
        
        openModal('battleModal', h);
        document.getElementById('battleQuestions').innerHTML = qHTML;
    },

    finishBattle: function() {
        var monster = window._battleMonster;
        var total = window._battleQuestions.length;
        var correct = Object.values(window._battleScores).filter(function(v) { return v === true; }).length;
        var score = Math.round(correct / total * 100);
        
        var damageToMonster = Math.floor(correct / total * monster.hp);
        var damageToPlayer = Math.floor((total - correct) / total * monster.damage * 10);
        
        var playerWon = damageToMonster >= monster.hp;
        
        var h = '';
        if (playerWon) {
            h += '<h2>🎉 انتصار!</h2>';
            h += '<div style="font-size:5rem;">🏆</div>';
            h += '<p>لقد هزمت ' + monster.emoji + ' ' + monster.name + '!</p>';
            h += '<p>النتيجة: ' + correct + '/' + total + ' (' + score + '%)</p>';
            
            this.player.bossesDefeated.push(monster.id);
            this.addXP(monster.reward.xp);
            this.addCoins(monster.reward.coins);
            
            if (monster.reward.title) {
                this.player.title = monster.reward.title;
            }
            
            // فتح الجزيرة التالية
            var currentIsland = this.islands.find(function(is) { return is.id === PirateAdventure.player.currentIsland; });
            if (currentIsland) {
                currentIsland.completed = true;
                var nextIsland = this.islands.find(function(is) { return is.order === currentIsland.order + 1; });
                if (nextIsland && this.player.islandsUnlocked.indexOf(nextIsland.id) === -1) {
                    this.player.islandsUnlocked.push(nextIsland.id);
                    h += '<p style="color:#10b981;">🗺️ تم فتح ' + nextIsland.icon + ' ' + nextIsland.name + '!</p>';
                }
            }
            
            // فتح الكنز
            if (currentIsland && currentIsland.treasure && monster.isBoss) {
                if (this.player.treasuresFound.indexOf(currentIsland.treasure.id) === -1) {
                    this.player.treasuresFound.push(currentIsland.treasure.id);
                    this.addXP(currentIsland.treasure.reward.xp);
                    this.addCoins(currentIsland.treasure.reward.coins);
                    h += '<p style="color:#f59e0b;">💎 تم العثور على ' + currentIsland.treasure.name + '!</p>';
                }
            }
            
            this.checkAchievements();
            spawnConfetti();
        } else {
            h += '<h2>😢 هزيمة</h2>';
            h += '<div style="font-size:5rem;">💀</div>';
            h += '<p>لقد هزمك ' + monster.emoji + ' ' + monster.name + '!</p>';
            h += '<p>النتيجة: ' + correct + '/' + total + ' (' + score + '%)</p>';
            this.player.health = Math.max(10, this.player.health - damageToPlayer);
            h += '<button class="modal-btn btn-danger" onclick="PirateAdventure.retryBattle()">🔄 حاول مرة أخرى</button>';
        }
        
        this.saveState();
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'battleModal\');">إغلاق</button>';
        
        var modal = document.getElementById('battleModal');
        if (modal) {
            modal.querySelector('.modal-content').innerHTML = h;
        }
    },

    retryBattle: function() {
        closeModal('battleModal');
        var monster = window._battleMonster;
        this.startBattle(this.player.currentIsland, monster.id);
    },

    // ===== المواقف التمريضية =====
    startScenario: function(chapterId) {
        var chapterScenarios = this.scenarios.filter(function(s) { return s.chapter === chapterId; });
        if (chapterScenarios.length === 0) {
            showToast('لا توجد مواقف لهذه الجزيرة', 'warning');
            return;
        }
        
        var scenario = chapterScenarios[Math.floor(Math.random() * chapterScenarios.length)];
        
        var h = '<h2>📋 موقف تمريضي</h2>';
        h += '<div style="background:var(--card-bg);padding:15px;border-radius:15px;text-align:right;margin:10px 0;">';
        h += '<h4>' + scenario.title + '</h4>';
        h += '<p style="font-size:0.9rem;">' + scenario.story + '</p>';
        h += '</div>';
        h += '<div id="scenarioOptions"></div>';
        
        openModal('scenarioModal', h);
        
        var optionsHTML = '';
        for (var i = 0; i < scenario.options.length; i++) {
            var opt = scenario.options[i];
            optionsHTML += '<button class="quiz-opt" onclick="PirateAdventure.answerScenario(\'' + scenario.id + '\',' + i + ')" style="text-align:right;">' + opt.text + '</button>';
        }
        
        document.getElementById('scenarioOptions').innerHTML = optionsHTML;
        window._currentScenario = scenario;
    },

    answerScenario: function(scenarioId, optionIndex) {
        var scenario = window._currentScenario;
        var option = scenario.options[optionIndex];
        
        var optionsDiv = document.getElementById('scenarioOptions');
        optionsDiv.querySelectorAll('.quiz-opt').forEach(function(b) { b.disabled = true; });
        
        var fb = document.createElement('div');
        fb.style.cssText = 'padding:10px;border-radius:10px;margin-top:10px;text-align:right;';
        
        if (option.correct) {
            fb.style.background = '#f0fdf4';
            fb.style.color = '#166534';
            fb.innerHTML = '<strong>✅ صحيح!</strong><br>' + option.feedback;
            this.addXP(scenario.reward.xp);
            this.addCoins(scenario.reward.coins);
        } else {
            fb.style.background = '#fef2f2';
            fb.style.color = '#991b1b';
            fb.innerHTML = '<strong>❌ خطأ!</strong><br>' + option.feedback;
        }
        
        optionsDiv.appendChild(fb);
        
        var closeBtn = document.createElement('button');
        closeBtn.className = 'modal-btn btn-close';
        closeBtn.textContent = 'إغلاق';
        closeBtn.onclick = function() { closeModal('scenarioModal'); };
        optionsDiv.appendChild(closeBtn);
    },

    // ===== نظام الإنجازات =====
    openAchievements: function() {
        var h = '<h2>🏆 الإنجازات</h2>';
        h += '<p style="text-align:center;">' + this.player.achievements.length + '/' + this.achievements.length + ' إنجاز</p>';
        h += '<div style="max-height:60vh;overflow-y:auto;">';
        
        for (var i = 0; i < this.achievements.length; i++) {
            var ach = this.achievements[i];
            var earned = this.player.achievements.indexOf(ach.id) !== -1;
            
            if (ach.secret && !earned) {
                h += '<div style="background:var(--card-bg);padding:8px;border-radius:10px;margin:3px 0;opacity:0.4;">';
                h += '🔒 ???';
                h += '</div>';
            } else {
                h += '<div style="background:' + (earned ? '#f0fdf4' : 'var(--card-bg)') + ';padding:8px;border-radius:10px;margin:3px 0;border:1px solid var(--border-color);' + (earned ? '' : 'opacity:0.6;') + '">';
                h += '<span style="font-size:1.5rem;">' + (earned ? ach.icon : '🔒') + '</span> ';
                h += '<strong>' + ach.name + '</strong>';
                h += '<br><small>' + ach.desc + '</small>';
                if (ach.secret && earned) h += ' <span style="color:#8b5cf6;">🔮 سري</span>';
                h += '</div>';
            }
        }
        
        h += '</div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'achievementsModal\')">إغلاق</button>';
        
        openModal('achievementsModal', h);
    },

    checkAchievements: function() {
        var newAchievements = [];
        
        // فحص كل الإنجازات
        for (var i = 0; i < this.achievements.length; i++) {
            var ach = this.achievements[i];
            if (this.player.achievements.indexOf(ach.id) !== -1) continue;
            
            var earned = false;
            
            switch(ach.id) {
                case 'first_step': earned = this.player.islandsUnlocked.length >= 1; break;
                case 'island_master_3': earned = this.player.islandsUnlocked.filter(function(id) { 
                    var is = PirateAdventure.islands.find(function(i) { return i.id === id && i.completed; }); 
                    return is; 
                }).length >= 3; break;
                case 'island_master_6': earned = this.player.islandsUnlocked.filter(function(id) { 
                    var is = PirateAdventure.islands.find(function(i) { return i.id === id && i.completed; }); 
                    return is; 
                }).length >= 6; break;
                case 'island_master_9': earned = this.player.islandsUnlocked.filter(function(id) { 
                    var is = PirateAdventure.islands.find(function(i) { return i.id === id && i.completed; }); 
                    return is; 
                }).length >= 9; break;
                case 'island_master_all': earned = this.islands.every(function(is) { return is.completed; }); break;
                case 'monster_slayer_5': earned = this.player.bossesDefeated.length >= 5; break;
                case 'monster_slayer_10': earned = this.player.bossesDefeated.length >= 10; break;
                case 'monster_slayer_all': earned = this.player.bossesDefeated.length >= this.getTotalMonsters(); break;
                case 'boss_slayer_3': earned = this.getDefeatedBossCount() >= 3; break;
                case 'boss_slayer_all': earned = this.getDefeatedBossCount() >= this.getTotalBosses(); break;
                case 'treasure_3': earned = this.player.treasuresFound.length >= 3; break;
                case 'treasure_6': earned = this.player.treasuresFound.length >= 6; break;
                case 'treasure_all': earned = this.player.treasuresFound.length >= this.getTotalTreasures(); break;
                case 'xp_1000': earned = this.player.xp >= 1000; break;
                case 'xp_5000': earned = this.player.xp >= 5000; break;
                case 'xp_10000': earned = this.player.xp >= 10000; break;
                case 'coins_500': earned = this.player.coins >= 500; break;
                case 'coins_2000': earned = this.player.coins >= 2000; break;
                case 'coins_5000': earned = this.player.coins >= 5000; break;
            }
            
            if (earned) {
                this.player.achievements.push(ach.id);
                newAchievements.push(ach);
                this.addCoins(50);
                this.addXP(100);
            }
        }
        
        if (newAchievements.length > 0) {
            this.saveState();
            for (var i = 0; i < newAchievements.length; i++) {
                showToast('🏆 إنجاز جديد: ' + newAchievements[i].icon + ' ' + newAchievements[i].name + '!', 'success');
            }
            spawnConfetti();
        }
    },

    getTotalMonsters: function() {
        var count = 0;
        for (var i = 0; i < this.islands.length; i++) {
            count += (this.islands[i].monsters || []).length;
        }
        return count;
    },

    getDefeatedBossCount: function() {
        var count = 0;
        for (var i = 0; i < this.islands.length; i++) {
            var monsters = this.islands[i].monsters || [];
            for (var j = 0; j < monsters.length; j++) {
                if (monsters[j].isBoss && this.player.bossesDefeated.indexOf(monsters[j].id) !== -1) {
                    count++;
                }
            }
        }
        return count;
    },

    getTotalBosses: function() {
        var count = 0;
        for (var i = 0; i < this.islands.length; i++) {
            var monsters = this.islands[i].monsters || [];
            for (var j = 0; j < monsters.length; j++) {
                if (monsters[j].isBoss) count++;
            }
        }
        return count;
    },

    getTotalTreasures: function() {
        var count = 0;
        for (var i = 0; i < this.islands.length; i++) {
            if (this.islands[i].treasure) count++;
        }
        return count;
    },

    checkSecretAchievements: function() {
        // يتم استدعاؤها دورياً
        var now = new Date();
        var hour = now.getHours();
        
        if (hour >= 0 && hour < 5 && this.player.achievements.indexOf('secret_midnight') === -1) {
            this.unlockSecretAchievement('secret_midnight');
        }
    },

    unlockSecretAchievement: function(id) {
        if (this.player.achievements.indexOf(id) !== -1) return;
        this.player.achievements.push(id);
        this.addCoins(100);
        this.addXP(200);
        this.saveState();
        
        var ach = this.achievements.find(function(a) { return a.id === id; });
        if (ach) {
            showToast('🔮 إنجاز سري: ' + ach.icon + ' ' + ach.name + '!', 'success');
            spawnConfetti();
        }
    },

    // ===== دوال العملات و XP =====
    addXP: function(amount) {
        this.player.xp += amount;
        if (typeof addXP === 'function') addXP(amount);
        this.saveState();
    },

    addCoins: function(amount) {
        this.player.coins += amount;
        this.saveState();
    },

    checkDailyLogin: function() {
        var today = new Date().toISOString().split('T')[0];
        if (this.player.lastLogin !== today) {
            this.addCoins(25);
            this.player.lastLogin = today;
            this.saveState();
        }
    },

    // ===== دوال المعركة المساعدة =====
    answerBattle: function(btn, chosen, correct, i, total) {
        var parent = btn.parentElement;
        parent.querySelectorAll('.quiz-opt').forEach(function(b) { b.disabled = true; });
        var isCorrect = isAnswerCorrect(chosen, correct);
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        window._battleScores[i] = isCorrect;
        
        // تحديث HP
        if (!isCorrect) {
            window._battlePlayerHP = Math.max(0, window._battlePlayerHP - (window._battleMonster.damage));
            document.getElementById('playerHP').textContent = window._battlePlayerHP;
        }
        
        var fb = document.getElementById('Battle-fb-' + i);
        if (fb) {
            fb.textContent = isCorrect ? '✅ إصابة!' : '❌ خطأ!';
            fb.style.color = isCorrect ? 'var(--green)' : 'var(--red)';
        }
        
        if (isCorrect) {
            PirateAdventure.addXP(5);
            PirateAdventure.addCoins(2);
        }
        
        if (Object.keys(window._battleScores).length >= total) {
            setTimeout(function() { PirateAdventure.finishBattle(); }, 500);
        }
    },

    // ===== إضافة للواجهة =====
    addButtons: function() {
        var controlBar = document.querySelector('.control-bar');
        if (!controlBar) {
            setTimeout(function() { PirateAdventure.addButtons(); }, 500);
            return;
        }
        
        if (document.getElementById('pirateMapBtn')) return;
        
        // زر الخريطة
        var mapBtn = document.createElement('button');
        mapBtn.id = 'pirateMapBtn';
        mapBtn.className = 'leaderboard-btn';
        mapBtn.innerHTML = '🗺️ مغامرة';
        mapBtn.title = 'خريطة مغامرة القرصان';
        mapBtn.onclick = function() { PirateAdventure.openMap(); };
        mapBtn.style.background = 'linear-gradient(135deg, #0369a1, #0284c7)';
        controlBar.appendChild(mapBtn);
        
        // زر الإنجازات
        var achBtn = document.createElement('button');
        achBtn.id = 'pirateAchievementsBtn';
        achBtn.className = 'leaderboard-btn';
        achBtn.innerHTML = '🏆 إنجازات';
        achBtn.title = 'الإنجازات';
        achBtn.onclick = function() { PirateAdventure.openAchievements(); };
        achBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        controlBar.appendChild(achBtn);
    }
};

// ===== دوال عالمية للمعركة =====
function checkBattleAnswer(btn, chosen, correct, i, total) {
    PirateAdventure.answerBattle(btn, chosen, correct, i, total);
}

function checkBattleOther(i, correctText, total) {
    var input = document.getElementById('Battle-other-' + i);
    if (!input || input.disabled) return;
    var isCorrect = checkDefinitionAnswer(input.value, correctText);
    input.classList.add(isCorrect ? 'correct-input' : 'wrong-input');
    input.disabled = true;
    window._battleScores[i] = isCorrect;
    
    if (isCorrect) {
        PirateAdventure.addXP(8);
        PirateAdventure.addCoins(3);
    }
    
    if (Object.keys(window._battleScores).length >= total) {
        setTimeout(function() { PirateAdventure.finishBattle(); }, 500);
    }
}

// ===== تهيئة =====
function initPirateAdventure() {
    PirateAdventure.init();
    PirateAdventure.addButtons();
    
    // إضافة CSS للقارب
    var style = document.createElement('style');
    style.textContent = '@keyframes sailBoat { 0% { transform: translate(-50%,-50%) rotate(-3deg); } 100% { transform: translate(-50%,-50%) rotate(3deg); } }';
    document.head.appendChild(style);
    
    debugLog('🏴‍☠️ تم تهيئة نظام مغامرة القرصان');
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initPirateAdventure, 2500);
});
