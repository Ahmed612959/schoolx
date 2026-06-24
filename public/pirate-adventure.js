// ==================== 🏴‍☠️ عالم القرصان اللامتناهي ====================
var PirateAdventure = {
    player: {
        xp: 0, coins: 0, health: 100, maxHealth: 100,
        islandsUnlocked: ['port_royal'], islandsCompleted: [],
        bossesDefeated: [], treasuresFound: [], achievements: [],
        currentIsland: 'port_royal', storyChapter: 1,
        inventory: [], title: '⚓ بحار مبتدئ'
    },

    // ===== الخريطة القديمة =====
    islands: [
        {
            id: 'port_royal', name: '⚓ ميناء البداية', icon: '⚓',
            chapter: null, order: 0,
            position: { x: 10, y: 80 },
            color: '#8B5A2B',
            description: 'ميناء صغير حيث تبدأ رحلتك. الهواء مليء برائحة البحر والتوابل.',
            story: 'تبدأ قصتك هنا، في حانة "المرساة الذهبية". قبطان عجوز يعطيك خريطة بالية: "العالم مليء بالجزر الملعونة، كل جزيرة تحمل مرضا غامضا. أنت ممرض، وعليك أن تشفي هذه الجزر لترفع اللعنة وتصبح أسطورة البحار."',
            monsters: [
                { id: 'rat_swarm', name: '🐀 جرذان الحانة', emoji: '🐀', questions: 3, difficulty: 'easy', chapter: null, hp: 20, damage: 3,
                  reward: { xp: 30, coins: 15, item: 'خريطة صغيرة' },
                  story: 'جرذان ضخمة تهاجمك في الحانة! أجب على أسئلة أساسية في التمريض لتطردها.' }
            ],
            treasure: null,
            achievements: ['first_step', 'rat_slayer'],
            required: null
        },
        {
            id: 'palliative_isle', name: '🌅 جزيرة الغروب الأبدي', icon: '🌅',
            chapter: 'chapter1', order: 1,
            position: { x: 25, y: 65 },
            color: '#D2691E',
            description: 'جزيرة حيث الشمس لا تغيب، لكن سكانها يعانون من آلام لا تنتهي.',
            story: 'تصل إلى جزيرة يلفها ضوء برتقالي دافئ. كبير القرويين يستقبلك: "أرواحنا معذبة! نحتاج إلى الرعاية التلطيفية لتخفيف آلامنا قبل الرحيل."',
            monsters: [
                { id: 'ghost_pain', name: '👻 شبح الألم', emoji: '👻', questions: 5, difficulty: 'easy', chapter: 'chapter1', hp: 50, damage: 8,
                  reward: { xp: 80, coins: 40, item: 'تميمة الرحمة' },
                  story: 'شبح يتلوى: "أنا ألم الموتى... هل تعرف كيف تخفف معاناة المحتضرين؟"' }
            ],
            treasure: { id: 'treasure_mercy', name: '💎 جوهرة الرحمة', desc: 'تمنحك القدرة على تهدئة الآلام', reward: { xp: 150, coins: 80, ability: 'empathy' } },
            achievements: ['ghost_defeated', 'mercy_master'],
            required: 'port_royal'
        },
        {
            id: 'surgery_isle', name: '🔪 جزيرة الجراحين', icon: '🔪',
            chapter: 'chapter2', order: 2,
            position: { x: 45, y: 55 },
            color: '#A0522D',
            description: 'جزيرة على شكل مشرط، كل شيء فيها حاد ومعقم.',
            story: 'الجزيرة مليئة بالتماثيل الجراحية. جراح غامض يتحداك: "التعقيم هو سر الحياة! أظهر لي معرفتك في التحضير للعمليات."',
            monsters: [
                { id: 'scrub_beast', name: '🧟 وحش العدوى', emoji: '🧟', questions: 6, difficulty: 'medium', chapter: 'chapter2', hp: 70, damage: 12,
                  reward: { xp: 120, coins: 60, item: 'قفازات معقمة' },
                  story: 'وحش مغطى بالضمادات المتسخة: "التعقيم! التعقيم! وإلا ستصاب بالعدوى!"' }
            ],
            treasure: null,
            achievements: ['scrub_defeated', 'sterile_master'],
            required: 'palliative_isle'
        },
        {
            id: 'respiratory_isle', name: '🌪️ جزيرة العواصف', icon: '🌪️',
            chapter: 'chapter3', order: 3,
            position: { x: 65, y: 45 },
            color: '#6B8E23',
            description: 'رياح عاتية وأعاصير، الهواء مليء بالغبار وحبوب اللقاح.',
            story: 'الرياح تعوي، والسكان يلهثون. زعيم القبيلة: "أرواح الهواء غاضبة! الكثيرون يعانون من ضيق التنفس. ساعدنا!"',
            monsters: [
                { id: 'wheezing_drake', name: '🐉 تنين الأزيز', emoji: '🐉', questions: 7, difficulty: 'medium', chapter: 'chapter3', hp: 90, damage: 15,
                  reward: { xp: 180, coins: 90, item: 'بخاخ عاصف' },
                  story: 'تنين يزفر دخاناً أصفر: "الربو! الالتهاب الرئوي! ما علاجهم؟"' }
            ],
            treasure: { id: 'treasure_lungs', name: '🫁 رئة العاصفة', desc: 'تمنحك قدرة التنفس تحت الماء', reward: { xp: 250, coins: 130, ability: 'breath' } },
            achievements: ['drake_defeated', 'respiratory_sage'],
            required: 'surgery_isle'
        },
        {
            id: 'cardiac_isle', name: '❤️ جزيرة القلوب', icon: '❤️',
            chapter: 'chapter4', order: 4,
            position: { x: 80, y: 30 },
            color: '#B22222',
            description: 'الجزيرة تنبض كالقلب. الأنهار حمراء، والصخور على شكل شرايين.',
            story: 'تدخل أرضاً تخفق تحت قدميك. ملكة الجزيرة: "قلب مملكتنا مريض! الضغط مرتفع، والنبض غير منتظم. أنقذنا!"',
            monsters: [
                { id: 'boss_hypertension', name: '👹 غول الضغط', emoji: '👹', questions: 10, difficulty: 'hard', chapter: 'chapter4', hp: 120, damage: 20,
                  reward: { xp: 300, coins: 180, title: '❤️ سيد القلوب' },
                  story: 'غول أحمر ضخم: "أنا القاتل الصامت! ارتفاع ضغط الدم! هل تجرؤ على مواجهتي؟"' }
            ],
            treasure: { id: 'treasure_heart', name: '💖 قلب الياقوت', desc: 'يمنحك القدرة على سماع دقات القلوب', reward: { xp: 400, coins: 250, ability: 'heart_healer' } },
            achievements: ['hypertension_defeated', 'cardiac_champion'],
            required: 'respiratory_isle'
        },
        {
            id: 'digestive_isle', name: '🍽️ جزيرة المتاهة الهضمية', icon: '🍽️',
            chapter: 'chapter5', order: 5,
            position: { x: 60, y: 15 },
            color: '#CD853F',
            description: 'متاهة من الأمعاء العملاقة، ورائحة الطعام تملأ الجو.',
            story: 'تائه في متاهة! دليل غريب: "هذه أمعاء عملاقة. كل زاوية تمثل مرضاً: التهاب المعدة، الزائدة، المرارة. أجب بشكل صحيح لتخرج."',
            monsters: [
                { id: 'serpent_appendicitis', name: '🐍 أفعى الزائدة', emoji: '🐍', questions: 6, difficulty: 'medium', chapter: 'chapter5', hp: 75, damage: 12,
                  reward: { xp: 150, coins: 75, item: 'ترياق' },
                  story: 'أفعى تلتف حول خصرك: "ألم في الربع السفلي الأيمن... ما هذا؟"' }
            ],
            treasure: null,
            achievements: ['serpent_defeated', 'digestive_navigator'],
            required: 'cardiac_isle'
        },
        {
            id: 'urinary_isle', name: '💧 جزيرة الينابيع المحتجزة', icon: '💧',
            chapter: 'chapter6', order: 6,
            position: { x: 35, y: 25 },
            color: '#4682B4',
            description: 'ينابيع متجمدة وبحيرات راكدة. السكان يعانون من احتباس الماء.',
            story: 'الماء في كل مكان لكنه لا يتدفق. حكيم القرية: "البول محتجز، والبعض لا يستطيع التحكم. ساعدنا في فهم هذه الأمراض."',
            monsters: [
                { id: 'water_elemental', name: '🌊 عنصر الماء', emoji: '🌊', questions: 7, difficulty: 'medium', chapter: 'chapter6', hp: 80, damage: 12,
                  reward: { xp: 180, coins: 90, item: 'قسطرة سحرية' },
                  story: 'موجة تتشكل: "سلس البول... احتباس البول... ما هي أنواعه وعلاجه؟"' }
            ],
            treasure: { id: 'treasure_kidney', name: '💎 ياقوتة الكلى', desc: 'تصفي المياه وتمنحك صفاء الذهن', reward: { xp: 300, coins: 180, ability: 'purify' } },
            achievements: ['elemental_defeated', 'urinary_sage'],
            required: 'digestive_isle'
        },
        {
            id: 'neurological_isle', name: '🧠 جزيرة العقول المضطربة', icon: '🧠',
            chapter: 'chapter7', order: 7,
            position: { x: 15, y: 35 },
            color: '#800080',
            description: 'أشجار على شكل أعصاب، والهواء مليء بالشرر الكهربائي.',
            story: 'تسمع همسات وأفكاراً متطايرة. حارس الجزيرة: "العقول هنا مريضة: صداع، سكتات دماغية. يجب أن تستعيد التوازن!"',
            monsters: [
                { id: 'boss_stroke', name: '🧟‍♂️ ملك السكتة', emoji: '🧟‍♂️', questions: 12, difficulty: 'hard', chapter: 'chapter7', hp: 150, damage: 25,
                  reward: { xp: 400, coins: 250, title: '🧠 سيد الأعصاب' },
                  story: 'كيان مظلم: "الوقت هو الدماغ! FAST! هل تعرف ماذا تعني؟"' }
            ],
            treasure: { id: 'treasure_brain', name: '👑 تاج العقل', desc: 'يمنحك حكمة لا نهائية', reward: { xp: 500, coins: 350, ability: 'mind_read' } },
            achievements: ['stroke_defeated', 'neuro_master'],
            required: 'urinary_isle'
        },
        {
            id: 'musculoskeletal_isle', name: '🦴 جزيرة العظام المكسورة', icon: '🦴',
            chapter: 'chapter8', order: 8,
            position: { x: 75, y: 75 },
            color: '#A9A9A9',
            description: 'تضاريس وعرة، صخور على شكل عظام مكسورة.',
            story: 'عمالقة من العظام يجوبون الجزيرة. أحدهم يسقط وتنكسر ساقه. "الكسور! الجبائر! 5Ps! ساعدني وإلا سأتحطم!"',
            monsters: [
                { id: 'bone_golem', name: '🗿 غول العظام', emoji: '🗿', questions: 8, difficulty: 'medium', chapter: 'chapter8', hp: 100, damage: 18,
                  reward: { xp: 220, coins: 120, item: 'جبيرة ذهبية' },
                  story: 'غول عظمي يزأر: "هشاشة العظام... الكسور... أنواعها... أجب!"' }
            ],
            treasure: null,
            achievements: ['golem_defeated', 'bone_collector'],
            required: 'neurological_isle'
        },
        {
            id: 'endocrine_isle', name: '⚗️ جزيرة الهرمونات', icon: '⚗️',
            chapter: 'chapter9', order: 9,
            position: { x: 50, y: 85 },
            color: '#C71585',
            description: 'مختبرات كيميائية طبيعية، والجو مليء بالروائح الحلوة.',
            story: 'عالم مجنون يستقبلك: "السكري! الغدة الدرقية! الهرمونات هي مفتاح التوازن. أجب على أسئلتي لتحرر الجزيرة."',
            monsters: [
                { id: 'sugar_demon', name: '🍬 شيطان السكر', emoji: '🍬', questions: 8, difficulty: 'hard', chapter: 'chapter9', hp: 110, damage: 20,
                  reward: { xp: 280, coins: 150, item: 'قارورة أنسولين' },
                  story: 'شيطان لزج: "ثلاثة أعراض رئيسية للسكري... ما هي؟"' }
            ],
            treasure: { id: 'treasure_thyroid', name: '🦋 فراشة الدرقية', desc: 'تضبط هرموناتك وتمنحك نشاطاً', reward: { xp: 350, coins: 200, ability: 'metabolism' } },
            achievements: ['sugar_defeated', 'hormone_balancer'],
            required: 'musculoskeletal_isle'
        },
        {
            id: 'cancer_isle', name: '🎗️ جزيرة الشريط الوردي', icon: '🎗️',
            chapter: 'chapter10', order: 10,
            position: { x: 90, y: 60 },
            color: '#FF69B4',
            description: 'حدائق وردية ولكن يسودها الحزن. سكانها يحاربون مرضاً خبيثاً.',
            story: 'أميرة الجزيرة: "السرطان يهدد مملكتنا. العلاج الكيميائي والإشعاعي أملنا الوحيد. ساعدنا في فهمهم!"',
            monsters: [
                { id: 'boss_cancer', name: '👾 وحش السرطان', emoji: '👾', questions: 15, difficulty: 'hard', chapter: 'chapter10', hp: 200, damage: 30,
                  reward: { xp: 500, coins: 350, title: '🎗️ محارب السرطان' },
                  story: 'كتلة داكنة: "السرطان! علاماته التحذيرية... مراحله... علاجه... أثبت معرفتك!"' }
            ],
            treasure: null,
            achievements: ['cancer_defeated', 'hope_bringer'],
            required: 'endocrine_isle'
        },
        {
            id: 'emergency_isle', name: '🚨 جزيرة الطوارئ', icon: '🚨',
            chapter: 'chapter11', order: 11,
            position: { x: 40, y: 55 },
            color: '#FF4500',
            description: 'براكين وزلازل، إصابات في كل مكان. الفوضى تسود.',
            story: 'رئيس الإطفاء: "حروق، رضوح، غيبوبة! كل ثانية مهمة. أظهر لنا مهاراتك في الطوارئ!"',
            monsters: [
                { id: 'boss_burn', name: '🔥 تنين اللهب', emoji: '🔥', questions: 15, difficulty: 'hard', chapter: 'chapter11', hp: 200, damage: 30,
                  reward: { xp: 600, coins: 400, title: '🔥 سيد الطوارئ' },
                  story: 'تنين يحيط به لهب: "GCS! درجات الحروق! ABC! الإجابة الصحيحة تنقذ الأرواح!"' }
            ],
            treasure: { id: 'treasure_ultimate', name: '👑 كنز المعرفة', desc: 'أعظم كنز، يمنحك لقب أسطورة', reward: { xp: 1000, coins: 700, title: '👑 أسطورة التمريض' } },
            achievements: ['burn_defeated', 'ultimate_hero'],
            required: 'cancer_isle'
        }
    ],

    // ===== إنجازات كل موقع =====
    islandAchievements: {
        'port_royal': [
            { id: 'first_step', name: '👣 أول خطوة', desc: 'أكمل تدريب الميناء', icon: '👣', earned: false },
            { id: 'rat_slayer', name: '🐀 قاتل الجرذان', desc: 'اهزم جرذان الحانة', icon: '🐀', earned: false }
        ],
        'palliative_isle': [
            { id: 'ghost_defeated', name: '👻 صائد الأشباح', desc: 'اهزم شبح الألم', icon: '👻', earned: false },
            { id: 'mercy_master', name: '🌅 معلم الرحمة', desc: 'أكمل جميع تحديات الجزيرة', icon: '🌅', earned: false }
        ],
        'surgery_isle': [
            { id: 'scrub_defeated', name: '🧟 معقم', desc: 'اهزم وحش العدوى', icon: '🧟', earned: false },
            { id: 'sterile_master', name: '🔪 سيد التعقيم', desc: 'أجب على جميع أسئلة الجراحة', icon: '🔪', earned: false }
        ],
        'respiratory_isle': [
            { id: 'drake_defeated', name: '🐉 قاتل التنين', desc: 'اهزم تنين الأزيز', icon: '🐉', earned: false },
            { id: 'respiratory_sage', name: '🌪️ حكيم التنفس', desc: 'أكمل الجزيرة', icon: '🌪️', earned: false }
        ],
        'cardiac_isle': [
            { id: 'hypertension_defeated', name: '👹 هازم الغول', desc: 'اهزم غول الضغط', icon: '👹', earned: false },
            { id: 'cardiac_champion', name: '❤️ بطل القلوب', desc: 'أنقذ جزيرة القلوب', icon: '❤️', earned: false }
        ],
        'digestive_isle': [
            { id: 'serpent_defeated', name: '🐍 ساحر الأفاعي', desc: 'اهزم أفعى الزائدة', icon: '🐍', earned: false },
            { id: 'digestive_navigator', name: '🍽️ ملاح المتاهة', desc: 'اخرج من المتاهة', icon: '🍽️', earned: false }
        ],
        'urinary_isle': [
            { id: 'elemental_defeated', name: '🌊 مروض الماء', desc: 'اهزم عنصر الماء', icon: '🌊', earned: false },
            { id: 'urinary_sage', name: '💧 حكيم البول', desc: 'أكمل الجزيرة', icon: '💧', earned: false }
        ],
        'neurological_isle': [
            { id: 'stroke_defeated', name: '🧟‍♂️ محرر العقول', desc: 'اهزم ملك السكتة', icon: '🧟‍♂️', earned: false },
            { id: 'neuro_master', name: '🧠 سيد الأعصاب', desc: 'أكمل الجزيرة', icon: '🧠', earned: false }
        ],
        'musculoskeletal_isle': [
            { id: 'golem_defeated', name: '🗿 هازم الغول', desc: 'اهزم غول العظام', icon: '🗿', earned: false },
            { id: 'bone_collector', name: '🦴 جامع العظام', desc: 'أكمل الجزيرة', icon: '🦴', earned: false }
        ],
        'endocrine_isle': [
            { id: 'sugar_defeated', name: '🍬 محطم السكر', desc: 'اهزم شيطان السكر', icon: '🍬', earned: false },
            { id: 'hormone_balancer', name: '⚗️ موازن الهرمونات', desc: 'أكمل الجزيرة', icon: '⚗️', earned: false }
        ],
        'cancer_isle': [
            { id: 'cancer_defeated', name: '👾 مدمر السرطان', desc: 'اهزم وحش السرطان', icon: '👾', earned: false },
            { id: 'hope_bringer', name: '🎗️ رسول الأمل', desc: 'أكمل الجزيرة', icon: '🎗️', earned: false }
        ],
        'emergency_isle': [
            { id: 'burn_defeated', name: '🔥 مطفئ اللهب', desc: 'اهزم تنين اللهب', icon: '🔥', earned: false },
            { id: 'ultimate_hero', name: '👑 البطل المطلق', desc: 'أكمل جميع الجزر', icon: '👑', earned: false }
        ]
    },

    // ===== قصة لا نهائية =====
    generateEndlessStory: function() {
        // بعد إكمال كل الجزر، نفتح "بحاراً جديدة" بقصة متجددة
        var newIsland = {
            id: 'endless_' + Date.now(),
            name: '🌀 جزيرة ' + this.randomName(),
            icon: '🌀',
            chapter: 'chapter' + (Math.floor(Math.random() * 11) + 1),
            order: 999,
            position: { x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 },
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            description: 'جزيرة غامضة ظهرت من العدم.',
            story: 'عاصفة سحرية تكشف عن جزيرة جديدة! سكانها يعانون من ' + this.randomDisease() + '. هل تستطيع مساعدتهم؟',
            monsters: [this.generateMonster()],
            treasure: this.generateTreasure(),
            achievements: [],
            required: null // يمكن الوصول إليها بعد إكمال الكل
        };
        this.islands.push(newIsland);
        this.player.islandsUnlocked.push(newIsland.id);
        showToast('🌀 جزيرة جديدة ظهرت في الأفق! ' + newIsland.name, 'info');
        this.saveState();
    },

    randomName: function() {
        var prefixes = ['الضباب', 'الأشباح', 'العواصف', 'السراب', 'الأعماق', 'الظلال'];
        var suffixes = ['الملعونة', 'المفقودة', 'الغارقة', 'الملتهبة', 'المظلمة', 'الساحرة'];
        return prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + suffixes[Math.floor(Math.random() * suffixes.length)];
    },

    randomDisease: function() {
        var diseases = ['ارتفاع ضغط الدم', 'الالتهاب الرئوي', 'السكري', 'الكسور', 'السكتة الدماغية', 'السرطان', 'الحروق'];
        return diseases[Math.floor(Math.random() * diseases.length)];
    },

    generateMonster: function() {
        return {
            id: 'monster_' + Date.now(),
            name: '👾 وحش ' + this.randomName(),
            emoji: '👾',
            questions: 5 + Math.floor(Math.random() * 10),
            difficulty: Math.random() > 0.5 ? 'hard' : 'medium',
            chapter: this.islands[this.islands.length-1].chapter,
            hp: 50 + Math.floor(Math.random() * 150),
            damage: 5 + Math.floor(Math.random() * 25),
            reward: { xp: 200 + Math.floor(Math.random() * 500), coins: 100 + Math.floor(Math.random() * 400) },
            story: 'مخلوق غامض يتحداك!'
        };
    },

    generateTreasure: function() {
        if (Math.random() > 0.5) {
            return {
                id: 'treasure_' + Date.now(),
                name: '💎 كنز ' + this.randomName(),
                desc: 'كنز ثمين من بحار لا نهاية لها',
                reward: { xp: 500, coins: 300, ability: 'random_skill' }
            };
        }
        return null;
    },

    // ===== حالة اللاعب =====
    loadState: function() {
        var saved = localStorage.getItem('pirate_adventure_state');
        if (saved) {
            try { Object.assign(this.player, JSON.parse(saved)); } catch(e) {}
        }
    },

    saveState: function() {
        localStorage.setItem('pirate_adventure_state', JSON.stringify(this.player));
    },

    // ===== الخريطة القديمة =====
    openMap: function() {
        var h = '<div style="position:relative;width:100%;height:0;padding-bottom:90%;background: #f4e4c1; border: 8px solid #5c3a21; border-radius: 30px; box-shadow: inset 0 0 50px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.7); overflow:hidden; font-family: serif;">';
        
        // خلفية parchment بنمط قديم
        h += '<div style="position:absolute;top:0;left:0;width:100%;height:100%;background: radial-gradient(circle at 20% 30%, #f9e4b7 0%, #e7c27d 40%, #c4956a 100%); opacity:0.8;"></div>';
        
        // خطوط الطول والعرض
        h += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(139,90,43,0.3)" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/></svg>';
        
        // مسار الإبحار (متقطع)
        var ordered = this.islands.filter(i => i.order < 999).sort((a,b) => a.order - b.order);
        h += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;">';
        h += '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#8B0000"/></marker></defs>';
        for (var i = 0; i < ordered.length - 1; i++) {
            var from = ordered[i].position;
            var to = ordered[i+1].position;
            h += '<path d="M' + from.x + '% ' + from.y + '% Q' + ((from.x+to.x)/2) + '% ' + (Math.min(from.y,to.y)-15) + '% ' + to.x + '% ' + to.y + '%" fill="none" stroke="#8B0000" stroke-width="2" stroke-dasharray="6,4" marker-end="url(#arrow)" opacity="0.6"/>';
        }
        h += '</svg>';
        
        // الجزر
        for (var i = 0; i < this.islands.length; i++) {
            var is = this.islands[i];
            var unlocked = this.player.islandsUnlocked.includes(is.id);
            var completed = this.player.islandsCompleted.includes(is.id);
            h += '<div onclick="' + (unlocked ? "PirateAdventure.travelTo('" + is.id + "')" : "PirateAdventure.showLocked('" + is.id + "')") + '" style="position:absolute;left:' + is.position.x + '%;top:' + is.position.y + '%;transform:translate(-50%,-50%);cursor:' + (unlocked ? 'pointer' : 'not-allowed') + ';text-align:center;filter:' + (unlocked ? 'none' : 'grayscale(100%) brightness(0.6)') + ';transition:0.3s;">';
            h += '<div style="font-size:2.2rem;filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.5));">' + is.icon + '</div>';
            h += '<div style="background:#3e2723;color:#f4e4c1;padding:2px 6px;border-radius:6px;font-size:0.6rem;font-weight:bold;white-space:nowrap;border:1px solid #8B5A2B;">' + is.name + '</div>';
            if (completed) h += '<div style="color:#2e7d32;font-size:1rem;text-shadow:0 0 5px gold;">✔</div>';
            if (!unlocked) h += '<div style="color:#b71c1c;font-size:1rem;">🔒</div>';
            h += '</div>';
        }
        
        // سفينة اللاعب
        var curIsland = this.islands.find(i => i.id === this.player.currentIsland);
        if (curIsland) {
            h += '<div id="playerShip" style="position:absolute;left:' + curIsland.position.x + '%;top:' + curIsland.position.y + '%;transform:translate(-50%,-50%);font-size:2.5rem;pointer-events:none;z-index:10;filter:drop-shadow(3px 3px 3px black);transition:left 1.5s ease-in-out, top 1.5s ease-in-out;">⛵</div>';
        }
        
        h += '</div>';
        h += '<div style="text-align:center;margin-top:8px;color:#5c3a21;">⛵ رحلتك: ' + this.player.title + ' | 🪙 ' + this.player.coins + ' | ⭐ ' + this.player.xp + ' XP | 🏆 ' + this.player.achievements.length + ' إنجاز</div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'mapModal\')">إغلاق</button>';
        openModal('mapModal', h);
    },

    showLocked: function(id) {
        var is = this.islands.find(i => i.id === id);
        showToast('🔒 ' + (is ? is.name : '') + ' ما زالت مقفلة. أكمل المهام السابقة!', 'warning');
    },

    // ===== الإبحار إلى جزيرة =====
    travelTo: function(islandId) {
        var island = this.islands.find(i => i.id === islandId);
        if (!island || !this.player.islandsUnlocked.includes(islandId)) return;
        
        // تأثير الإبحار
        var ship = document.getElementById('playerShip');
        if (ship) {
            ship.style.left = island.position.x + '%';
            ship.style.top = island.position.y + '%';
        }
        this.player.currentIsland = islandId;
        this.saveState();
        
        setTimeout(() => {
            closeModal('mapModal');
            this.openIsland(islandId);
        }, 800);
    },

    // ===== فتح جزيرة =====
    openIsland: function(islandId) {
        var is = this.islands.find(i => i.id === islandId);
        if (!is) return;
        var completed = this.player.islandsCompleted.includes(islandId);
        
        var h = '<div style="background:#f4e4c1;border:4px solid #5c3a21;border-radius:20px;padding:15px;color:#3e2723;font-family:serif;">';
        h += '<h2 style="text-align:center;">' + is.icon + ' ' + is.name + '</h2>';
        h += '<p style="font-style:italic;">' + is.description + '</p>';
        h += '<div style="border-left:4px solid #8B0000;padding:10px;margin:10px 0;background:rgba(139,0,0,0.1);">' + is.story + '</div>';
        
        // وحوش
        if (is.monsters && is.monsters.length > 0) {
            h += '<h4>👾 الوحوش</h4>';
            for (var m of is.monsters) {
                var defeated = this.player.bossesDefeated.includes(m.id);
                h += '<div style="background:rgba(0,0,0,0.1);padding:8px;margin:4px 0;border-radius:8px;">';
                h += m.emoji + ' <strong>' + m.name + '</strong> (❤️' + m.hp + ') ';
                h += defeated ? '<span style="color:green;">✅ مهزوم</span>' : '<button class="modal-btn btn-danger" onclick="PirateAdventure.startBattle(\'' + islandId + '\',\'' + m.id + '\')" style="font-size:0.7rem;">⚔️ مواجهة</button>';
                h += '</div>';
            }
        }
        
        // كنز
        if (is.treasure) {
            var found = this.player.treasuresFound.includes(is.treasure.id);
            h += '<h4>💎 الكنز</h4>';
            h += '<div style="background:#ffd54f;padding:8px;border-radius:8px;">';
            h += '<strong>' + is.treasure.name + '</strong> - ' + is.treasure.desc;
            h += found ? ' <span style="color:green;">(تم العثور عليه)</span>' : ' <span style="color:red;">(لم يعثر عليه بعد)</span>';
            h += '</div>';
        }
        
        // إنجازات الموقع
        var achList = this.islandAchievements[islandId] || [];
        if (achList.length > 0) {
            h += '<h4>🏆 إنجازات الجزيرة</h4>';
            for (var a of achList) {
                var earned = this.player.achievements.includes(a.id);
                h += '<div style="font-size:0.8rem;">' + (earned ? a.icon : '🔒') + ' ' + a.name + ' - ' + a.desc + (earned ? ' ✅' : '') + '</div>';
            }
        }
        
        h += '<button class="modal-btn btn-primary" onclick="PirateAdventure.completeIsland(\'' + islandId + '\')" ' + (completed ? 'disabled' : '') + '>✅ إنهاء الجزيرة</button>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'islandModal\');PirateAdventure.openMap();">العودة للخريطة</button>';
        h += '</div>';
        openModal('islandModal', h);
    },

    completeIsland: function(islandId) {
        if (!this.player.islandsCompleted.includes(islandId)) {
            this.player.islandsCompleted.push(islandId);
            // فتح الجزيرة التالية
            var is = this.islands.find(i => i.id === islandId);
            if (is) {
                var next = this.islands.find(i => i.required === islandId);
                if (next && !this.player.islandsUnlocked.includes(next.id)) {
                    this.player.islandsUnlocked.push(next.id);
                    showToast('🗺️ تم فتح ' + next.name + '!', 'success');
                }
                // منح XP وعملات
                this.addXP(100);
                this.addCoins(50);
                // تحقق من الإنجازات
                var achList = this.islandAchievements[islandId] || [];
                for (var a of achList) {
                    if (!this.player.achievements.includes(a.id)) {
                        this.player.achievements.push(a.id);
                        showToast('🏆 إنجاز: ' + a.name, 'success');
                    }
                }
                // إذا كانت آخر جزيرة أصلية، نولد محتوى لا نهائي
                var originalCount = this.islands.filter(i => i.order < 999).length;
                if (this.player.islandsCompleted.length >= originalCount) {
                    this.generateEndlessStory();
                }
            }
            this.saveState();
            closeModal('islandModal');
            this.openMap();
        }
    },

    // ===== المعركة =====
    startBattle: function(islandId, monsterId) {
        var is = this.islands.find(i => i.id === islandId);
        var monster = is.monsters.find(m => m.id === monsterId);
        if (!monster) return;
        closeModal('islandModal');
        
        // اختيار الأسئلة
        var questions = [];
        if (monster.chapter) {
            questions = getAllQuestions(monster.chapter, 'all');
        } else {
            questions = getAllQuestions('all', 'all');
        }
        questions = questions.sort(() => Math.random() - 0.5).slice(0, monster.questions);
        if (questions.length < monster.questions) {
            questions = getAllQuestions('all', 'all').sort(() => Math.random() - 0.5).slice(0, monster.questions);
        }
        
        window._battle = { monster, questions, scores: {}, playerHP: this.player.health };
        
        var h = '<h2>⚔️ ' + monster.emoji + ' ' + monster.name + '</h2>';
        h += '<div style="background:#f4e4c1;padding:10px;border-left:4px solid #8B0000;margin:10px 0;">' + monster.story + '</div>';
        h += '<div style="display:flex;justify-content:center;gap:30px;margin:10px 0;">';
        h += '<div style="text-align:center;"><span style="font-size:3rem;">' + monster.emoji + '</span><br><span style="background:red;color:white;padding:3px 8px;border-radius:10px;">❤️ ' + monster.hp + '</span></div>';
        h += '<div style="font-size:2rem;">⚔️</div>';
        h += '<div style="text-align:center;"><span style="font-size:3rem;">🧑‍⚕️</span><br><span style="background:green;color:white;padding:3px 8px;border-radius:10px;" id="battlePlayerHP">❤️ ' + window._battle.playerHP + '</span></div>';
        h += '</div>';
        h += '<div id="battleQuestions"></div>';
        openModal('battleModal', h);
        
        var qHTML = '';
        for (var i = 0; i < questions.length; i++) {
            qHTML += renderQuestionHTML(questions[i], i, 'Battle', questions.length);
        }
        document.getElementById('battleQuestions').innerHTML = qHTML;
    },

    answerBattle: function(btn, chosen, correct, i, total) {
        var parent = btn.parentElement;
        parent.querySelectorAll('.quiz-opt').forEach(b => b.disabled = true);
        var isCorrect = isAnswerCorrect(chosen, correct);
        btn.classList.add(isCorrect ? 'correct' : 'wrong');
        window._battle.scores[i] = isCorrect;
        if (!isCorrect) {
            window._battle.playerHP -= window._battle.monster.damage;
            document.getElementById('battlePlayerHP').textContent = Math.max(0, window._battle.playerHP);
        }
        var fb = document.getElementById('Battle-fb-' + i);
        if (fb) {
            fb.textContent = isCorrect ? '✅ إصابة!' : '❌ خطأ!';
            fb.style.color = isCorrect ? 'green' : 'red';
        }
        if (Object.keys(window._battle.scores).length >= total) {
            setTimeout(() => this.finishBattle(), 500);
        }
    },

    finishBattle: function() {
        var m = window._battle.monster;
        var total = window._battle.questions.length;
        var correct = Object.values(window._battle.scores).filter(v => v).length;
        var won = correct / total >= 0.5; // يحتاج 50% على الأقل للفوز
        
        var h = '';
        if (won) {
            h += '<h2>🎉 انتصار!</h2>';
            this.player.bossesDefeated.push(m.id);
            this.addXP(m.reward.xp);
            this.addCoins(m.reward.coins);
            if (m.reward.title) this.player.title = m.reward.title;
            // إذا كان زعيم وله كنز مرتبط
            var is = this.islands.find(i => i.id === this.player.currentIsland);
            if (is && is.treasure && m.isBoss) {
                if (!this.player.treasuresFound.includes(is.treasure.id)) {
                    this.player.treasuresFound.push(is.treasure.id);
                    this.addXP(is.treasure.reward.xp);
                    this.addCoins(is.treasure.reward.coins);
                    h += '<p style="color:gold;">💎 وجدت ' + is.treasure.name + '!</p>';
                }
            }
            this.saveState();
            spawnConfetti();
        } else {
            h += '<h2>😢 هزيمة</h2>';
            this.player.health = Math.max(10, this.player.health - m.damage * 2);
        }
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'battleModal\')">إغلاق</button>';
        var modal = document.getElementById('battleModal');
        if (modal) modal.querySelector('.modal-content').innerHTML = h;
    },

    addXP: function(amount) { this.player.xp += amount; if (typeof addXP === 'function') addXP(amount); },
    addCoins: function(amount) { this.player.coins += amount; },

    // ===== أزرار الواجهة =====
    init: function() {
        this.loadState();
        this.injectStyles();
        this.addButtons();
    },

    injectStyles: function() {
        var style = document.createElement('style');
        style.textContent = `
            @keyframes sail { 0%{transform:translate(-50%,-50%) rotate(-2deg);} 100%{transform:translate(-50%,-50%) rotate(2deg);} }
            #playerShip { animation: sail 2s infinite alternate; }
        `;
        document.head.appendChild(style);
    },

    addButtons: function() {
        var self = this;
        function tryAdd() {
            var bar = document.querySelector('.control-bar');
            if (!bar) { setTimeout(tryAdd, 500); return; }
            if (document.getElementById('pirateMapBtn')) return;
            
            var btn = document.createElement('button');
            btn.id = 'pirateMapBtn';
            btn.className = 'leaderboard-btn';
            btn.innerHTML = '🗺️ مغامرة';
            btn.title = 'خريطة القرصان';
            btn.onclick = function() { self.openMap(); };
            btn.style.background = 'linear-gradient(135deg, #5c3a21, #8B5A2B)';
            bar.appendChild(btn);
        }
        tryAdd();
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
    window._battle.scores[i] = isCorrect;
    if (Object.keys(window._battle.scores).length >= total) {
        setTimeout(() => PirateAdventure.finishBattle(), 500);
    }
}

// التهيئة
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { PirateAdventure.init(); }, 2000);
});
