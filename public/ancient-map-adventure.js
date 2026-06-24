// ╔══════════════════════════════════════════════════════════════════╗
// ║  🏴‍☠️  النسخة الأسطورية - خريطة القرصان القديمة              ║
// ║  Ancient Pirate Map - Legendary Edition                     ║
// ║  جميع الحقوق محفوظة © 2025                                ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== الأصوات والمؤثرات ====================
    var SoundFX = {
        enabled: true,
        context: null,
        
        init: function() {
            try {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) {
                this.enabled = false;
            }
        },
        
        play: function(type) {
            if (!this.enabled || !this.context) return;
            
            var osc = this.context.createOscillator();
            var gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.context.destination);
            
            switch(type) {
                case 'click':
                    osc.frequency.value = 800;
                    gain.gain.value = 0.1;
                    osc.start();
                    osc.stop(this.context.currentTime + 0.05);
                    break;
                case 'success':
                    osc.frequency.value = 523;
                    gain.gain.value = 0.15;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(784, this.context.currentTime + 0.2);
                    osc.stop(this.context.currentTime + 0.3);
                    break;
                case 'fail':
                    osc.frequency.value = 300;
                    gain.gain.value = 0.15;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(150, this.context.currentTime + 0.3);
                    osc.stop(this.context.currentTime + 0.4);
                    break;
                case 'treasure':
                    osc.type = 'triangle';
                    osc.frequency.value = 600;
                    gain.gain.value = 0.12;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(1200, this.context.currentTime + 0.15);
                    osc.frequency.linearRampToValueAtTime(800, this.context.currentTime + 0.3);
                    osc.stop(this.context.currentTime + 0.4);
                    break;
                case 'battle':
                    osc.type = 'sawtooth';
                    osc.frequency.value = 200;
                    gain.gain.value = 0.08;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(400, this.context.currentTime + 0.1);
                    osc.frequency.linearRampToValueAtTime(200, this.context.currentTime + 0.2);
                    osc.stop(this.context.currentTime + 0.3);
                    break;
                case 'sail':
                    osc.type = 'sine';
                    osc.frequency.value = 440;
                    gain.gain.value = 0.06;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(550, this.context.currentTime + 0.5);
                    osc.stop(this.context.currentTime + 0.8);
                    break;
            }
        }
    };

    // ==================== نظام الجسيمات ====================
    var ParticleSystem = {
        createExplosion: function(x, y, color, count) {
            count = count || 30;
            color = color || '#fbbf24';
            
            for (var i = 0; i < count; i++) {
                var particle = document.createElement('div');
                var angle = (Math.PI * 2 * i) / count;
                var velocity = 2 + Math.random() * 5;
                var size = 3 + Math.random() * 8;
                
                particle.style.cssText = [
                    'position:fixed',
                    'left:' + x + 'px',
                    'top:' + y + 'px',
                    'width:' + size + 'px',
                    'height:' + size + 'px',
                    'background:' + color,
                    'border-radius:50%',
                    'pointer-events:none',
                    'z-index:99999',
                    'animation:particleFly ' + (0.5 + Math.random() * 1.5) + 's ease-out forwards',
                    'box-shadow:0 0 ' + (size * 2) + 'px ' + color
                ].join(';');
                
                particle.style.setProperty('--angle', angle + 'rad');
                particle.style.setProperty('--velocity', velocity * 50 + 'px');
                
                document.body.appendChild(particle);
                setTimeout(function() { particle.remove(); }, 2000);
            }
        },
        
        createRain: function(container) {
            for (var i = 0; i < 20; i++) {
                var drop = document.createElement('div');
                drop.style.cssText = [
                    'position:absolute',
                    'left:' + Math.random() * 100 + '%',
                    'top:-20px',
                    'width:2px',
                    'height:' + (10 + Math.random() * 20) + 'px',
                    'background:rgba(255,255,255,0.6)',
                    'pointer-events:none',
                    'animation:rainDrop ' + (0.5 + Math.random() * 1) + 's linear infinite',
                    'animation-delay:' + Math.random() * 2 + 's'
                ].join(';');
                container.appendChild(drop);
            }
        },
        
        createFog: function(container) {
            for (var i = 0; i < 5; i++) {
                var fog = document.createElement('div');
                fog.style.cssText = [
                    'position:absolute',
                    'left:' + Math.random() * 80 + '%',
                    'top:' + Math.random() * 80 + '%',
                    'width:' + (50 + Math.random() * 100) + 'px',
                    'height:' + (30 + Math.random() * 50) + 'px',
                    'background:radial-gradient(ellipse,rgba(255,255,255,0.3),transparent)',
                    'pointer-events:none',
                    'animation:fogFloat ' + (3 + Math.random() * 5) + 's ease-in-out infinite alternate',
                    'animation-delay:' + Math.random() * 3 + 's'
                ].join(';');
                container.appendChild(fog);
            }
        }
    };

    // ==================== النظام الأساسي ====================
    window.AncientMap = {
        version: '3.0.0',
        
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
            crew: ['ببغاء حكيم 🦜'],
            abilities: [],
            totalAdventures: 0,
            lastLogin: null,
            streak: 0
        },

        // ==================== الجزر (12 جزيرة رئيسية) ====================
        islands: [
            {
                id: 'port_royal', name: 'ميناء البداية', subtitle: 'حيث تبدأ كل المغامرات',
                position: { x: 8, y: 85 }, icon: '⚓', type: 'port', chapter: null,
                unlocked: true, completed: false, weather: 'مشمس', timeOfDay: 'نهار',
                story: `ترسو سفينتك "السنونو" في ميناء البداية... الميناء القديم تفوح منه رائحة الملح والتوابل، والنوارس تحلق فوق الصواري الخشبية المتآكلة. البحارة يتبادلون قصص الكنوز المفقودة والمغامرات الغامضة.

عجوز حكيم يجلس على رصيف الميناء المتهالك، لحيته البيضاء تتدلى على صدره، وعيناه تلمعان ببريق المعرفة. يرفع رأسه ببطء حين يراك مقبلاً، ويبتسم ابتسامة عريضة تكشف عن أسنان ذهبية.

"أهلاً بك أيها المغامر الشاب... لقد كنتُ أنتظرك. خمسون عاماً مرت منذ أن رأيتُ شخصاً يستحق هذه الخريطة."

يمد يده المرتعشة ويسحب خريطة قديمة ملفوفة من تحت عباءته. الورق مصفرّ ومهترئ عند الحواف، وعليه بقع من الشاي والقهوة ورذاذ البحر.

"هذه الخريطة... خريطة بحر المعرفة. كل جزيرة عليها تخفي سراً، وكل سر يحتاج إلى مفتاح من نوع خاص: المعرفة! الأسئلة هي مفاتيحك، والإجابات الصحيحة هي بوابتك للكنوز."

"لكن احذر! الجزر لا تبوح بأسرارها إلا لمن يستحق. وحوش الجهل تحرس كل جزيرة، ولن تسمح لك بالمرور قبل أن تثبت جدارتك."

يقف العجوز بصعوبة ويتكئ على عصاه: "المغامرة لا تنتهي... فكلما أبحرت أكثر، كلما ظهرت جزر جديدة في الأفق. بحر المعرفة لا ساحل له!"

ينظر إليك بعينين متقدتين: "هل أنت مستعد لرفع الشراع؟"`,
                creatures: [],
                treasure: null,
                requirements: null,
                rewards: { xp: 50, gold: 25, title: '⚓ بحار مبتدئ' },
                achievements: ['first_step', 'port_explorer'],
                specialEvent: 'لقاء العجوز الحكيم',
                soundscape: 'seagulls_waves'
            },
            {
                id: 'mercy_reef', name: 'شعاب الرحمة', subtitle: 'جزيرة الرعاية التلطيفية',
                position: { x: 22, y: 78 }, icon: '🏝️', type: 'story', chapter: 'chapter1',
                unlocked: false, completed: false, weather: 'غائم جزئياً', timeOfDay: 'غسق',
                story: `تقترب سفينتك من شعاب الرحمة... المياه هنا هادئة بشكل غريب، كأن البحر نفسه يحترم قدسية هذا المكان. لا توجد أمواج، فقط تموجات لطيفة تحمل بتلات أزهار بيضاء على سطح الماء.

ترسو على الشاطئ الرملي الناعم. في المسافة، ترى كوخاً خشبياً صغيراً محاطاً بحديقة من الأزهار البرية. ممرضة عجوز تجلس على كرسي هزاز تحت شجرة نخيل عتيقة، ترتدي زياً أبيض ناصعاً.

تبتسم لك بحنان: "أهلاً بك في جزيرتي المتواضعة. هذه ليست جزيرة للبحث عن الكنوز العادية... هنا نتعلم كيف نخفف آلام من يرحلون عن عالمنا. الرعاية التلطيفية... فنّ التخفيف لا العلاج."

تنظر إلى الأفق البعيد: "بعض المرضى لا يمكن شفاؤهم... لكن يمكننا دائماً أن نريحهم، أن نمسك بأيديهم، أن نهمس لهم أنهم ليسوا وحدهم. الموت ليس فشلاً... إنه جزء من رحلة الحياة."

فجأة، يتغير لون الماء أمام الكوخ. ضباب أثيري يتصاعد، ويتشكل منه شبح شفاف، عيناه تتوهجان بنور أزرق: "أنا حارس هذه الشعاب! لا أحد يمر قبل أن يثبت أنه يفهم معنى الرحمة!"

الممرضة العجوز تضع يدها على كتفك: "لا تخف... أجب بصدق، فالرحمة تنبع من القلب."`,
                creatures: [{
                    id: 'ghost_mercy', name: 'شبح الرحمة', emoji: '👻', isBoss: false,
                    story: 'شبح أثيري يطفو فوق الماء: "أجب على أسئلتي عن الرعاية التلطيفية... أو ابقَ هنا للأبد ترعى أشباح المرضى!"',
                    chapter: 'chapter1', questions: 5, difficulty: 'easy', hp: 40, damage: 5,
                    reward: { xp: 80, gold: 40, item: 'زهرة الرحمة' },
                    taunts: ['هل تعرف حقاً ما معنى التخفيف؟', 'الموت ليس عدواً... الجهل هو العدو!', 'أثبت أنك تستحق عبور هذه الشعاب!'],
                    defeatMessage: 'الشبح يتلاشى بابتسامة: "لقد فهمت... الرحمة في قلبك. يمكنك العبور."'
                }],
                treasure: {
                    id: 'gem_mercy', name: 'جوهرة الرحمة الزرقاء', emoji: '💎',
                    story: 'جوهرة تتوهج بنور أزرق دافئ كحضن أم... تمنح حاملها القدرة على الشعور بآلام الآخرين وتخفيفها.',
                    ability: 'empathy_aura', abilityDesc: 'تستطيع الآن الشعور بألم المريض قبل أن يتكلم'
                },
                requirements: { type: 'complete', island: 'port_royal' },
                rewards: { xp: 200, gold: 100, title: '🌅 حامل الرحمة' },
                achievements: ['mercy_master', 'ghost_slayer'],
                specialEvent: 'ظهور الشبح عند الغسق',
                soundscape: 'gentle_waves'
            },
            {
                id: 'surgeons_cove', name: 'خليج الجراحين', subtitle: 'مملكة المشارط والتعقيم',
                position: { x: 38, y: 72 }, icon: '🏥', type: 'story', chapter: 'chapter2',
                unlocked: false, completed: false, weather: 'ضباب خفيف', timeOfDay: 'فجر',
                story: `خليج الجراحين... مكان غريب حقاً! الصخور هنا منحوتة بشكل طبيعي على هيئة أدوات جراحية: مشارط، ملاقط، ومقصات. المياه معقمة بشكل طبيعي بفعل ينابيع كبريتية تحت الماء.

ترسو سفينتك على رصيف حجري نظيف. جراح عجوز يرتدي قناعاً جراحياً وقبعة زرقاء يستقبلك عند مدخل كهف مضاء بالمشاعل.

"أهلاً بك في مملكتي! هنا لا مكان للجراثيم أو التلوث. كل شيء يجب أن يكون معقماً ومعقماً ومعقماً!" يضحك ضحكة مكتومة خلف قناعه.

يقودك عبر ممرات الكهف المضاءة. على الجدران، ترى نقوشاً قديمة تصور عمليات جراحية من عصور مختلفة: من الجراحة البدائية إلى الروبوتات الجراحية الحديثة.

"المريض الذي يدخل هذه المملكة يجب أن يكون صائماً... مستعداً... وموافقاً على كل شيء. هل تعرف مراحل الجراحة؟ قبل وأثناء وبعد؟ هل تستطيع التمييز بين الجراحة العلاجية والتلطيفية والتجميلية؟"

فجأة، يظهر وحش ضخم مغطى بالضمادات والشاش من خلف كومة من الصناديق الطبية. عيونه تلمع من بين اللفائف: "التعقيم! التعقيم! أخبرني عن مبادئ التعقيم التسعة وإلا أصبتك بعدوى لا تشفى!"`,
                creatures: [{
                    id: 'scrub_beast', name: 'وحش التعقيم', emoji: '🧟', isBoss: false,
                    story: 'مخلوق مغطى بالشاش والضمادات المتسخة: "قل لي! ما هي مبادئ التعقيم الجراحي؟!"',
                    chapter: 'chapter2', questions: 6, difficulty: 'medium', hp: 55, damage: 8,
                    reward: { xp: 120, gold: 60, item: 'قفازات معقمة' },
                    taunts: ['التعقيم! التعقيم! بدونه نموت جميعاً!', 'الرطوبة تسبب التلوث... هل تعلم ذلك؟', 'المعقم يلمس المعقم فقط!'],
                    defeatMessage: 'الوحش ينهار ويتحول إلى كومة من الضمادات النظيفة: "لقد تعلمت... التعقيم في دمك الآن."'
                }],
                treasure: {
                    id: 'scalpel_wisdom', name: 'مشرط الحكمة الذهبي', emoji: '🗡️',
                    story: 'مشرط ذهبي لامع نقش على مقبضه: "المعرفة قبل المشرط". يقال أنه كان ملكاً لأعظم جراح في التاريخ.',
                    ability: 'surgical_precision', abilityDesc: 'يداك تصبحان أكثر ثباتاً ودقة في أي إجراء'
                },
                requirements: { type: 'complete', island: 'mercy_reef' },
                rewards: { xp: 250, gold: 125, title: '⚓ جراح ماهر' },
                achievements: ['surgeon_master', 'sterile_champion'],
                specialEvent: 'عملية جراحية طارئة عند الفجر',
                soundscape: 'heart_monitor'
            },
            {
                id: 'storm_lungs', name: 'جزر الرئة العاصفة', subtitle: 'حيث تتعلم التنفس وسط العواصف',
                position: { x: 55, y: 65 }, icon: '🌪️', type: 'story', chapter: 'chapter3',
                unlocked: false, completed: false, weather: 'عاصف', timeOfDay: 'نهار عاصف',
                story: `الرياح هنا لا تتوقف أبداً... جزر الرئة العاصفة مكان خطير ومثير! الأشجار تنحني بشكل دائم مع الريح، والهواء مليء بالغبار وحبوب اللقاح والأوراق المتطايرة.

تقترب سفينتك بصعوبة، والأمواج تتلاطم من كل جانب. على الشاطئ، ترى كوخاً حجرياً صغيراً مبنياً على تلة، نوافذه مغلقة بإحكام ضد العاصفة.

ساحرة عجوز تفتح الباب وتلوح لك: "ادخل بسرعة قبل أن تطير!" داخل الكوخ، الجو دافئ ورائحة الأعشاب تملأ المكان. زجاجات ملونة تصطف على الرفوف، كل منها يحوي علاجاً مختلفاً.

"هنا مملكتي... مملكة التنفس! انظر حولك... بعض الناس لا يستطيعون التنفس بسهولة. الربو يخنقهم كحبل حول العنق، الالتهاب الرئوي يغرق رئاتهم بالماء، والفيروسات تغزو أجسادهم كجيش لا يرحم."

تفتح نافذة صغيرة وتشير إلى الخارج: "تعلم كيف تساعدهم... كيف تضع المريض في وضعية فاولر... كيف تعطيه الأكسجين المرطب... كيف تفرق بين أزيز الربو وخراخر الالتهاب الرئوي!"

فجأة، يزأر تنين ضخم أخضر اللون من خلف التلال. الدخان يتصاعد من فمه وأنفه: "من يجرؤ على دخول مملكة التنفس دون إذني؟!"`,
                creatures: [{
                    id: 'wheeze_dragon', name: 'تنين الأزيز الأخضر', emoji: '🐉', isBoss: true,
                    story: 'تنين ضخم يزفر سحباً من الدخان: "سعال! أزيز! ضيق تنفس! كيف تعالجني أيها الممرض الصغير؟"',
                    chapter: 'chapter3', questions: 7, difficulty: 'medium', hp: 65, damage: 12,
                    reward: { xp: 150, gold: 75, item: 'بخاخ التنين' },
                    taunts: ['أزيزي يخيف even الأقوياء!', 'الربو ليس مزحة... إنه معركة!', 'هل تعرف الفرق بين الأزيز والخراخر؟'],
                    defeatMessage: 'التنين يسقط على ركبتيه: "لقد روضت العاصفة... أنت تستحق الاحترام."'
                }],
                treasure: {
                    id: 'crystal_lung', name: 'رئة الكريستال', emoji: '🫁',
                    story: 'رئة بلورية نقية تشع بنور أزرق... عندما تمسكها، تشعر بأنفاسك تصبح أعمق وأصفى من أي وقت مضى.',
                    ability: 'breath_of_life', abilityDesc: 'تستطيع سماع أدق التغيرات في أصوات التنفس'
                },
                requirements: { type: 'complete', island: 'surgeons_cove' },
                rewards: { xp: 300, gold: 150, title: '🌪️ سيد العواصف' },
                achievements: ['storm_master', 'dragon_slayer'],
                specialEvent: 'عاصفة رملية كل 3 أيام',
                soundscape: 'howling_wind'
            },
            {
                id: 'heart_volcano', name: 'بركان القلوب', subtitle: 'حيث تنبض القلوب بالحمم',
                position: { x: 72, y: 55 }, icon: '🌋', type: 'story', chapter: 'chapter4',
                unlocked: false, completed: false, weather: 'حار جداً', timeOfDay: 'ظهر',
                story: `بركان القلوب... أرض البركان النابض! الحمم هنا حمراء قانية كالدم البشري، والأرض تدق تحت قدميك بإيقاع منتظم مثل نبضات قلب عملاق يختبئ تحت القشرة الأرضية.

الهواء حار لدرجة أنك تشعر به يلسع رئتيك. على منحدر البركان، ترى كوخاً مبنياً من الحجر البركاني الأسود. حكيم عجوز يجلس على حافة فوهة البركان، ساقاه متدليتان فوق الحمم المتوهجة وكأنه لا يشعر بالحرارة!

"اقترب يا بني... لا تخف. هذا البركان يمثل كل القلوب التي تعاني في العالم. عندما يرتفع ضغط الدم... الحمم تثور! وعندما تضيق الشرايين... الأرض ترتجف!"

يشير إلى تدفق حمم قريب: "انظر... هذه حمم ارتفاع الضغط. وهذا الدخان هناك... هذا دخان الذبحة الصدرية. وهذا الشق في الأرض... هذه جلطة قلبية!"

"تعلم كيف تقيس الضغط... كيف تميز بين الذبحة المستقرة وغير المستقرة... وما الفرق بين STEMI و NSTEMI! الوقت عضلة قلب... تذكر دائماً!"

فجأة، يهتز البركان بعنف. غول ضخم أحمر اللون يخرج من فوهة البركان، الحمم تتساقط من جسده: "أنا القاتل الصامت! ارتفاع ضغط الدم! لا أحد يشعر بي حتى فوات الأوان! هل تجرؤ على مواجهتي؟!"`,
                creatures: [{
                    id: 'pressure_ogre', name: 'غول الضغط الأحمر', emoji: '👹', isBoss: true,
                    story: 'غول ضخم يضرب الأرض بقدميه: "180/100! ماذا ستفعل أيها الممرض الصغير؟!"',
                    chapter: 'chapter4', questions: 8, difficulty: 'hard', hp: 80, damage: 18,
                    reward: { xp: 200, gold: 100, item: 'سوار ضغط الدم' },
                    taunts: ['هل تعرف ما هو القاتل الصامت؟ إنه أنا!', 'ارتفاع الضغط لا يؤلم... لكنه يقتل!', '180/100... هذه أزمة! ماذا ستفعل؟'],
                    defeatMessage: 'الغول يترنح ويسقط: "لقد هزمت القاتل الصامت... أنت طبيب قلوب حقيقي."'
                }],
                treasure: {
                    id: 'ruby_heart', name: 'قلب الياقوت النابض', emoji: '💖',
                    story: 'ياقوتة حمراء على شكل قلب بشري... عندما تمسكها، تشعر بنبضاتها تتزامن مع نبضات قلبك.',
                    ability: 'heart_whisperer', abilityDesc: 'تستطيع سماع همسات القلوب المريضة وتشخيص أمراضها'
                },
                requirements: { type: 'complete', island: 'storm_lungs' },
                rewards: { xp: 400, gold: 200, title: '❤️ حارس القلوب' },
                achievements: ['heart_guardian', 'ogre_slayer'],
                specialEvent: 'ثوران البركان كل أسبوع',
                soundscape: 'heartbeat_lava'
            },
            {
                id: 'digestive_labyrinth', name: 'متاهة البطن', subtitle: 'دهاليز الجهاز الهضمي',
                position: { x: 60, y: 38 }, icon: '🌀', type: 'story', chapter: 'chapter5',
                unlocked: false, completed: false, weather: 'رطب', timeOfDay: 'بعد الظهر',
                story: `متاهة البطن... مكان غريب حقاً! الممرات هنا تلتف وتنعطف مثل الأمعاء الدقيقة، والجدران اللينة تنقبض وتنبسط بحركة تمعجية مستمرة تنقل كل ما يدخلها إلى وجهته النهائية.

عند المدخل، ترى مطعماً صغيراً يديره طاهٍ عجوز يرتدي قبعة طهاة طويلة. يحرك قدراً كبيراً تفوح منه روائح شهية.

"أهلاً بك في مملكة الهضم! هذه المتاهة تمثل رحلة الطعام في جسدك... من الفم إلى... النهاية! بعض الناس يعانون في هذه الرحلة... التهاب المعدة يحرق بطونهم كالنار، والزائدة الدودية تمزق أحشاءهم، والمرارة تحتجز الحصوات كالسجون!"

يقدم لك طبقاً من الحساء: "تعلم كيف تفرق بين علامة روفسينج وبلومبيرج ودانفي... كيف تعالج التهاب المعدة الحاد والمزمن... ومتى تكون الجراحة ضرورية لاستئصال الزائدة!"

فجأة، يهتز المكان. ثعبان ضخم أخضر اللون يلتف حول أحد الأعمدة، عيناه تلمعان: "أنا حارس هذه المتاهة... أسئلتي سامة! أجب عليها أو ابتلعك إلى الأبد في دهاليز الهضم!"`,
                creatures: [{
                    id: 'appendix_serpent', name: 'أفعى الزائدة السامة', emoji: '🐍', isBoss: false,
                    story: 'أفعى تلتف حول بطنك: "ألم في RLQ! غثيان! حمى! ما التشخيص وماذا ستفعل؟!"',
                    chapter: 'chapter5', questions: 6, difficulty: 'medium', hp: 60, damage: 10,
                    reward: { xp: 140, gold: 70, item: 'ترياق الثعبان' },
                    taunts: ['ألم في الربع السفلي الأيمن... هل تعرفه؟', 'علامة بلومبيرج! ماذا تعني؟', 'الزائدة يمكن أن تنفجر في أي لحظة!'],
                    defeatMessage: 'الأفعى تتراجع وتختفي في جحر: "سمك لم يؤثر فيّ... أنت معالج ماهر."'
                }],
                treasure: {
                    id: 'crystal_stomach', name: 'كرة المعدة البلورية', emoji: '🔮',
                    story: 'كرة بلورية شفافة ترى من خلالها رحلة الطعام في الجسد كأنك تشاهد فيلماً.',
                    ability: 'digestive_sight', abilityDesc: 'تستطيع رؤية ما يحدث داخل بطن المريض بعينيك'
                },
                requirements: { type: 'complete', island: 'heart_volcano' },
                rewards: { xp: 300, gold: 150, title: '🌀 سيد المتاهة' },
                achievements: ['labyrinth_master', 'serpent_charmer'],
                specialEvent: 'انقباضات المتاهة كل 6 ساعات',
                soundscape: 'stomach_growls'
            },
            {
                id: 'waterfall_retention', name: 'شلالات الاحتباس', subtitle: 'حيث المياه لا تجري كما ينبغي',
                position: { x: 82, y: 42 }, icon: '💧', type: 'story', chapter: 'chapter6',
                unlocked: false, completed: false, weather: 'ممطر', timeOfDay: 'صباح ممطر',
                story: `شلالات الاحتباس... مكان متناقض ومحير! بعض الشلالات تفيض بماء غزير لا يتوقف أبداً، محدثة هديراً يصم الآذان. وبعضها الآخر جاف تماماً، لا يخرج منه قطرة واحدة رغم الأمطار الغزيرة.

حورية ماء جميلة تظهر من خلف أحد الشلالات المتدفقة، شعرها الأزرق ينساب كالماء: "هذه الشلالات تمثل الجهاز البولي في جسد الإنسان... بعض الناس لا يستطيعون التبول (احتباس البول)، والبعض الآخر لا يستطيعون منع التبول (سلس البول)."

تمسك بيدك وتقودك عبر جسر حجري رطب: "انظر إلى هذا الشلال الجاف... هذا رجل عجوز يعاني من تضخم البروستاتا. وهذا الشلال المندفع بلا تحكم... هذه امرأة بعد خمس ولادات تعاني من سلس الإجهاد."

"تعلم الفرق بين سلس الإجهاد والإلحاح والفيض والوظيفي... تعلم كيف تساعد مريض الاحتباس... وما هي تمارين كيجل لتقوية قاع الحوض!"

فجأة، ترتفع موجة عملاقة من النهر وتتشكل في هيئة وجه غاضب: "أنا عنصر الماء الهائج! أسئلتي تغرق من لا يعرف! أجب أو ابتلعك النهر!"`,
                creatures: [{
                    id: 'water_elemental', name: 'عنصر الماء الهائج', emoji: '🌊', isBoss: false,
                    story: 'موجة عملاقة تتشكل في هيئة وجه: "احتباس! سلس! قسطرة! أجب أو اغرق!"',
                    chapter: 'chapter6', questions: 6, difficulty: 'medium', hp: 55, damage: 10,
                    reward: { xp: 130, gold: 65, item: 'لؤلؤة المثانة' },
                    taunts: ['احتباس البول حالة طارئة! هل تعرف ماذا تفعل؟', 'سلس الإجهاد... ما سببه؟', 'تمارين كيجل... كيف تُعلّمها للمريض؟'],
                    defeatMessage: 'الموجة تنحسر وتهدأ: "الماء يطيعك الآن... أنت سيد السوائل."'
                }],
                treasure: {
                    id: 'sapphire_kidney', name: 'ياقوتة الكلى الزرقاء', emoji: '💎',
                    story: 'حجر كريم أزرق كسماء صافية... يمنحك القدرة على فهم أسرار الجهاز البولي.',
                    ability: 'water_mastery', abilityDesc: 'تستطيع تقييم توازن السوائل في جسم المريض بنظرة واحدة'
                },
                requirements: { type: 'complete', island: 'digestive_labyrinth' },
                rewards: { xp: 300, gold: 150, title: '💧 سيد المياه' },
                achievements: ['waterfall_master', 'elemental_defeater'],
                specialEvent: 'فيضان الشلالات كل 4 أيام',
                soundscape: 'waterfall_roar'
            },
            {
                id: 'mind_abyss', name: 'هاوية العقول', subtitle: 'أعمق أسرار الدماغ والأعصاب',
                position: { x: 88, y: 60 }, icon: '🧠', type: 'story', chapter: 'chapter7',
                unlocked: false, completed: false, weather: 'غائم', timeOfDay: 'ليل',
                story: `هاوية العقول... أعمق نقطة في الخريطة بأكملها! هنا الدماغ البشري يحكم كل شيء من الأعماق... لكنه أيضاً هشّ للغاية، كزهرة تتفتح في الظلام.

تنزل سلالم حلزونية طويلة إلى مختبر تحت الأرض. عالم أعصاب عجوز يجلس محاطاً بنماذج ثلاثية الأبعاد للأدمغة: "الجهاز العصبي... سيد الجسد وقائده! هنا نتعلم عن الصداع بأنواعه... التوتر، النصفي، العنقودي. وعن السكتة الدماغية... الإقفارية والنزفية."

يشير إلى ساعة رملية ضخمة: "في السكتة الدماغية، كل دقيقة تمر تحرم المريض من فرصة الشفاء. 1.9 مليون خلية عصبية تموت كل دقيقة! FAST! تذكر: Face, Arm, Speech, Time!"

فجأة، يحيط بالغرفة برق أزرق. كيان مظلم يتشكل من الظلال، عيناه تتوهجان: "أنا ملك السكتة! الوقت عدوي وعدوك! هل تعرف ماذا تفعل في أول 5 دقائق من السكتة الدماغية؟!"`,
                creatures: [{
                    id: 'stroke_king', name: 'ملك السكتة المظلم', emoji: '🧟‍♂️', isBoss: true,
                    story: 'كيان مظلم يحيط به برق: "FAST! FAST! الوقت يمر! كل حرف في FAST ينقذ حياة!"',
                    chapter: 'chapter7', questions: 10, difficulty: 'hard', hp: 100, damage: 20,
                    reward: { xp: 250, gold: 150, item: 'ساعة الأعصاب' },
                    taunts: ['الوقت = دماغ! هل تفهم هذا؟', 'FAST... اشرح لي كل حرف!', 'السكتة الإقفارية والنزفية... ما الفرق؟'],
                    defeatMessage: 'الظلام يتبدد: "لقد فهمت... السرعة هي السلاح. أنت حارس للعقول."'
                }],
                treasure: {
                    id: 'crown_mind', name: 'تاج العقل المتوهج', emoji: '👑',
                    story: 'تاج ذهبي يضيء عندما تمرر يدك فوقه... يهمس بأسرار الدماغ البشري.',
                    ability: 'mind_reader', abilityDesc: 'تستطيع إجراء تقييم عصبي كامل في دقائق'
                },
                requirements: { type: 'complete', island: 'waterfall_retention' },
                rewards: { xp: 500, gold: 250, title: '🧠 سيد العقول' },
                achievements: ['mind_master', 'stroke_defeater'],
                specialEvent: 'عاصفة كهربائية في الهاوية',
                soundscape: 'brain_waves'
            },
            {
                id: 'bone_mountain', name: 'جبل العظام', subtitle: 'حيث الهياكل تحكي قصصها',
                position: { x: 45, y: 25 }, icon: '🦴', type: 'story', chapter: 'chapter8',
                unlocked: false, completed: false, weather: 'جاف', timeOfDay: 'عصر',
                story: `جبل العظام... مكان يعلو فيه صوت الطقطقة! الهياكل العظمية هنا ليست مخيفة، بل مرتبة كأنها متحف طبيعي يعرض روائع الهندسة الإلهية للجسد البشري.

حارس عجوز عند سفح الجبل، يجلس على كرسي مصنوع من عظام متشابكة: "هذا الجبل يعلمنا عن الكسور... المغلقة والمفتوحة والمفتتة والغصن الأخضر. وعن هشاشة العظام... المرض الصامت الذي ينهش العظام من الداخل."

يشير إلى هيكل عظمي ليد بشرية: "انظر إلى التعقيد! 27 عظمة في اليد وحدها! وعندما تنكسر... يجب أن نعرف كيف نردها ونجبرها ونثبتها."

"5Ps للتقييم العصبي الوعائي: Pain, Pallor, Pulselessness, Paresthesia, Paralysis!"

فجأة، ينهض غول ضخم مصنوع بالكامل من العظام: "كسور! جبس! رد! أخبرني عن أنواع الكسور وإلا كسرت عظامك واحدة واحدة!"`,
                creatures: [{
                    id: 'bone_golem', name: 'غول العظام العملاق', emoji: '🗿', isBoss: false,
                    story: 'غول مصنوع من العظام: "ما هي أنواع الكسور؟ وكيف تتعامل مع كل نوع؟!"',
                    chapter: 'chapter8', questions: 7, difficulty: 'medium', hp: 70, damage: 12,
                    reward: { xp: 160, gold: 80, item: 'جبيرة ذهبية' },
                    taunts: ['كسر الغصن الأخضر... ما هو؟', '5Ps! اذكرهم كلهم!', 'هشاشة العظام... كيف تعالجها؟'],
                    defeatMessage: 'الغول يتفتت إلى عظام متناثرة: "عظامي تنحني لعلمك... أنت حارس العظام."'
                }],
                treasure: {
                    id: 'golden_skeleton_key', name: 'مفتاح الهيكل الذهبي', emoji: '🗝️',
                    story: 'مفتاح ذهبي صغير... يقال أنه يفتح أسرار العظام القوية والصحة الأبدية.',
                    ability: 'bone_strength', abilityDesc: 'تستطيع تقييم صحة العظام بنظرة واحدة'
                },
                requirements: { type: 'complete', island: 'mind_abyss' },
                rewards: { xp: 350, gold: 175, title: '🦴 حارس العظام' },
                achievements: ['bone_master', 'golem_crusher'],
                specialEvent: 'انهيار أرضي كل 5 أيام',
                soundscape: 'bone_cracking'
            },
            {
                id: 'hormone_swamp', name: 'مستنقع الهرمونات', subtitle: 'حيث الغدد تتحكم في مصيرك',
                position: { x: 28, y: 18 }, icon: '⚗️', type: 'story', chapter: 'chapter9',
                unlocked: false, completed: false, weather: 'ضبابي', timeOfDay: 'غروب',
                story: `مستنقع الهرمونات... رائحة غريبة في الهواء! هنا الغدد الصماء تفرز رسائلها الكيميائية في كل اتجاه، مختلطة بضباب المستنقع الكثيف. ألوان غريبة تتراقص على سطح الماء: أزرق للأنسولين، أخضر لهرمونات الدرقية، وأحمر للأدرينالين.

ساحر الغدد يجلس في كوخه المعلق فوق المستنقع: "الهرمونات... رسل الجسد الصامتون! السكري... مرض العصر الحديث! Type 1 و Type 2 و Gestational... هل تعرف الفرق بينهم؟"

يفتح كتاباً ضخماً: "الغدة الدرقية... فراشة صغيرة في رقبتك تتحكم في كل شيء! قصور وفرط... هاشيموتو وغريفز... T3 و T4 و TSH!"

"ثلاثة أعراض رئيسية للسكري: عطاش، بوال، نهام! وفحص HbA1c يكشف متوسط السكر في 3 أشهر كاملة!"

فجأة، يظهر كائن لزج حلو المظهر من المستنقع: "حلو أنا... لكني قاتل! السكري يقتل بصمت! أجب عن أسئلتي أو حولتك لحلوى سكرية!"`,
                creatures: [{
                    id: 'sugar_demon', name: 'شيطان السكر اللزج', emoji: '🍬', isBoss: false,
                    story: 'كائن لزج حلو المظهر: "الأنسولين! الجلوكاجون! ما الفرق؟ وكيف يعملان؟!"',
                    chapter: 'chapter9', questions: 8, difficulty: 'hard', hp: 75, damage: 15,
                    reward: { xp: 180, gold: 90, item: 'قارورة أنسولين سحرية' },
                    taunts: ['HbA1c... ماذا يقيس؟', 'DKA... ما هو وكيف تعالجه؟', 'القدم السكري... كيف تمنعه؟'],
                    defeatMessage: 'الشيطان يذوب: "لقد هزمت السكر... أنت سيد الهرمونات."'
                }],
                treasure: {
                    id: 'butterfly_thyroid', name: 'فراشة الدرقية المتوهجة', emoji: '🦋',
                    story: 'فراشة جميلة على شكل غدة درقية... أجنحتها ترفرف عندما تكون الهرمونات متزنة.',
                    ability: 'hormone_balance', abilityDesc: 'تستطيع تقييم توازن الهرمونات بمجرد النظر للمريض'
                },
                requirements: { type: 'complete', island: 'bone_mountain' },
                rewards: { xp: 400, gold: 200, title: '⚗️ سيد الهرمونات' },
                achievements: ['hormone_master', 'sugar_defeater'],
                specialEvent: 'تقلبات هرمونية كل يومين',
                soundscape: 'bubbling_swamp'
            },
            {
                id: 'cancer_reef', name: 'شعاب السرطان', subtitle: 'أخطر جزيرة في المحيط',
                position: { x: 15, y: 42 }, icon: '🎗️', type: 'story', chapter: 'chapter10',
                unlocked: false, completed: false, weather: 'عاصف ومظلم', timeOfDay: 'ليل دامس',
                story: `شعاب السرطان... أخطر مكان في المحيط بأسره! المياه هنا داكنة كالحبر، والصخور حادة كالمشارط الجراحية. لا طيور ولا أسماك... فقط صمت رهيب يخيم على المكان.

محاربة سرطان سابقة تستقبلك على الشاطئ، وشاح وردي يلف رأسها: "هذه الشعاب تمثل معركة الجسد ضد السرطان... خلايا تنمو بلا توقف، تغزو وتدمر وتمتد كالأخطبوط."

تجلس على صخرة: "العلاج الكيميائي... الإشعاعي... الجراحي... كلها أسلحة في هذه المعركة. لكن احذر! العلاج نفسه قد يكون مؤلماً: تثبيط نخاع العظم، غثيان، تساقط شعر... والمريض يحتاجك أكثر من أي وقت مضى!"

"تعلم علامات التحذير من السرطان... التغير في عادات الأمعاء، القرحة التي لا تلتئم، النزيف غير العادي، الكتلة أو التثخن، عسر الهضم، السعال المستمر!"

فجأة، ترتفع كتلة داكنة ضخمة من الأعماق: "أنا المرض الذي يخافه الجميع! السرطان! هل تملك الشجاعة والمعرفة لمواجهتي؟!"`,
                creatures: [{
                    id: 'cancer_beast', name: 'وحش السرطان الأسود', emoji: '👾', isBoss: true,
                    story: 'كتلة داكنة تنبض: "ما هي علامات التحذير السبعة من السرطان؟ اذكرها كلها!"',
                    chapter: 'chapter10', questions: 10, difficulty: 'hard', hp: 100, damage: 25,
                    reward: { xp: 300, gold: 200, item: 'وشاح الأمل الوردي' },
                    taunts: ['السرطان لا يرحم... هل أنت مستعد؟', 'العلاج الكيميائي... ما آثاره الجانبية؟', 'المرحلة الرابعة... ماذا تعني؟'],
                    defeatMessage: 'الكتلة تتقلص وتختفي: "الأمل أقوى من المرض... أنت محارب حقيقي."'
                }],
                treasure: {
                    id: 'hope_star', name: 'نجمة الأمل', emoji: '🌟',
                    story: 'نجمة تتوهج في الظلام الدامس... تذكرك أن هناك دائماً أملاً حتى في أحلك اللحظات.',
                    ability: 'hope_bringer', abilityDesc: 'مرضاك يشعرون بالأمل والطمأنينة بمجرد وجودك'
                },
                requirements: { type: 'complete', island: 'hormone_swamp' },
                rewards: { xp: 600, gold: 300, title: '🎗️ محارب السرطان' },
                achievements: ['cancer_warrior', 'hope_bearer'],
                specialEvent: 'المعركة الكبرى كل أسبوع',
                soundscape: 'dark_waves'
            },
            {
                id: 'emergency_isle', name: 'جزيرة الطوارئ', subtitle: 'حيث كل ثانية تساوي حياة',
                position: { x: 92, y: 18 }, icon: '🚨', type: 'story', chapter: 'chapter11',
                unlocked: false, completed: false, weather: 'ناري', timeOfDay: 'فجر أحمر',
                story: `جزيرة الطوارئ... الجحيم على الأرض! براكين تثور، حرائق تشتعل، وصفارات الإنذار تدوي في كل مكان. هنا يتدرب الأبطال الحقيقيون على إنقاذ الأرواح.

قائد فرقة الطوارئ، رجل ضخم يرتدي سترة حمراء: "هنا نتعلم كيف نتعامل مع الحروق... حروق الدرجة الأولى والثانية والثالثة! وقاعدة التسعات لحساب مساحة الحرق!"

يشير إلى محاكاة لحادث سيارة: "الكسور، الجروح، الرضوض... ABC! مجرى الهواء أولاً، ثم التنفس، ثم الدورة الدموية! لا تنسَ الترتيب أبداً!"

"GCS! مقياس غلاسكو للغيبوبة... E4 V5 M6 = 15... طبيعي! E1 V1 M1 = 3... غيبوبة عميقة!"

فجأة، يظهر تنين يحيط به لهب أزرق: "حروق! غيبوبة! GCS! هذا الاختبار النهائي! أثبت أنك تستحق لقب الأسطورة!"`,
                creatures: [{
                    id: 'fire_dragon', name: 'تنين اللهب الأزرق', emoji: '🔥', isBoss: true,
                    story: 'تنين يحيط به لهب: "GCS! اشرح لي مكونات مقياس غلاسكو للغيبوبة!"',
                    chapter: 'chapter11', questions: 10, difficulty: 'hard', hp: 100, damage: 25,
                    reward: { xp: 350, gold: 250, item: 'درع الطوارئ' },
                    taunts: ['GCS... E, V, M... ماذا تعني؟', 'قاعدة التسعات للحروق... اشرحها!', 'ABC في الطوارئ... ما الترتيب الصحيح؟'],
                    defeatMessage: 'التنين ينحني: "لقد أثبت جدارتك... أنت أسطورة الطوارئ."'
                }],
                treasure: {
                    id: 'ultimate_crown', name: 'التاج النهائي', emoji: '👑',
                    story: 'التاج الذي يثبت أنك أصبحت أسطورة التمريض... لم يمتلكه أحد من قبل!',
                    ability: 'ultimate_healer', abilityDesc: 'كل قدراتك تتضاعف... أنت الآن المعالج الأسطوري'
                },
                requirements: { type: 'complete', island: 'cancer_reef' },
                rewards: { xp: 800, gold: 500, title: '👑 أسطورة التمريض' },
                achievements: ['emergency_master', 'dragon_tamer'],
                specialEvent: 'كارثة كبرى كل 10 أيام',
                soundscape: 'emergency_sirens'
            }
        ],

        // ==================== قائمة الإنجازات الكاملة ====================
        achievementList: [
            { id: 'first_step', name: 'الخطوة الأولى', desc: 'ابدأ مغامرتك في ميناء البداية', icon: '👣', secret: false, xp: 50 },
            { id: 'port_explorer', name: 'مستكشف الميناء', desc: 'اقرأ قصة ميناء البداية كاملة', icon: '🔍', secret: false, xp: 25 },
            { id: 'mercy_master', name: 'سيد الرحمة', desc: 'أكمل شعاب الرحمة', icon: '🌅', secret: false, xp: 100 },
            { id: 'ghost_slayer', name: 'صائد الأشباح', desc: 'اهزم شبح الرحمة', icon: '👻', secret: false, xp: 75 },
            { id: 'surgeon_master', name: 'الجراح الماهر', desc: 'أكمل خليج الجراحين', icon: '🏥', secret: false, xp: 100 },
            { id: 'sterile_champion', name: 'بطل التعقيم', desc: 'أجب على كل أسئلة التعقيم صحيحة', icon: '🧼', secret: false, xp: 150 },
            { id: 'storm_master', name: 'سيد العواصف', desc: 'أكمل جزر الرئة العاصفة', icon: '🌪️', secret: false, xp: 100 },
            { id: 'dragon_slayer', name: 'قاتل التنين', desc: 'اهزم تنين الأزيز', icon: '🐉', secret: false, xp: 125 },
            { id: 'heart_guardian', name: 'حارس القلوب', desc: 'أكمل بركان القلوب', icon: '❤️', secret: false, xp: 100 },
            { id: 'ogre_slayer', name: 'قاهر الغول', desc: 'اهزم غول الضغط', icon: '👹', secret: false, xp: 150 },
            { id: 'labyrinth_master', name: 'سيد المتاهة', desc: 'أكمل متاهة البطن', icon: '🌀', secret: false, xp: 100 },
            { id: 'serpent_charmer', name: 'مروض الأفاعي', desc: 'اهزم أفعى الزائدة', icon: '🐍', secret: false, xp: 100 },
            { id: 'waterfall_master', name: 'سيد المياه', desc: 'أكمل شلالات الاحتباس', icon: '💧', secret: false, xp: 100 },
            { id: 'elemental_defeater', name: 'قاهر العناصر', desc: 'اهزم عنصر الماء', icon: '🌊', secret: false, xp: 100 },
            { id: 'mind_master', name: 'سيد العقول', desc: 'أكمل هاوية العقول', icon: '🧠', secret: false, xp: 100 },
            { id: 'stroke_defeater', name: 'قاهر السكتة', desc: 'اهزم ملك السكتة', icon: '🧟‍♂️', secret: false, xp: 200 },
            { id: 'bone_master', name: 'سيد العظام', desc: 'أكمل جبل العظام', icon: '🦴', secret: false, xp: 100 },
            { id: 'golem_crusher', name: 'محطم الغول', desc: 'اهزم غول العظام', icon: '🗿', secret: false, xp: 100 },
            { id: 'hormone_master', name: 'سيد الهرمونات', desc: 'أكمل مستنقع الهرمونات', icon: '⚗️', secret: false, xp: 100 },
            { id: 'sugar_defeater', name: 'قاهر السكر', desc: 'اهزم شيطان السكر', icon: '🍬', secret: false, xp: 100 },
            { id: 'cancer_warrior', name: 'محارب السرطان', desc: 'أكمل شعاب السرطان', icon: '🎗️', secret: false, xp: 100 },
            { id: 'hope_bearer', name: 'حامل الأمل', desc: 'اهزم وحش السرطان', icon: '🌟', secret: false, xp: 200 },
            { id: 'emergency_master', name: 'سيد الطوارئ', desc: 'أكمل جزيرة الطوارئ', icon: '🚨', secret: false, xp: 100 },
            { id: 'dragon_tamer', name: 'مروض التنين', desc: 'اهزم تنين اللهب', icon: '🔥', secret: false, xp: 200 },
            { id: 'collector_5', name: 'جامع الكنوز', desc: 'اجمع 5 كنوز', icon: '💎', secret: false, xp: 250 },
            { id: 'collector_all', name: 'صائد الكنوز الأعظم', desc: 'اجمع كل الكنوز الـ 12', icon: '👑', secret: false, xp: 500 },
            { id: 'gold_1000', name: 'التاجر الغني', desc: 'اجمع 1000 قطعة ذهبية', icon: '💰', secret: false, xp: 200 },
            { id: 'xp_5000', name: 'المغامر الأسطوري', desc: 'اجمع 5000 XP', icon: '⭐', secret: false, xp: 300 },
            { id: 'all_islands', name: 'ملك الجزر', desc: 'أكمل كل الجزر الأساسية', icon: '🗺️', secret: false, xp: 1000 },
            { id: 'secret_midnight', name: 'قرصان الليل', desc: 'العب بعد منتصف الليل', icon: '🦉', secret: true, xp: 150 },
            { id: 'secret_perfect', name: 'الكمال المطلق', desc: 'اهزم وحش بـ 100%', icon: '💯', secret: true, xp: 300 },
            { id: 'secret_speed', name: 'البرق', desc: 'أجب 10 أسئلة في دقيقة', icon: '⚡', secret: true, xp: 200 },
            { id: 'secret_lucky', name: 'المحظوظ', desc: '7 إجابات صحيحة متتالية', icon: '🍀', secret: true, xp: 100 }
        ],

        // ==================== دوال النظام الأساسية ====================
        init: function() {
            SoundFX.init();
            this.loadState();
            if (this.adventurer.discoveredIslands.length === 0) {
                this.adventurer.discoveredIslands = ['port_royal'];
                this.islands[0].unlocked = true;
            }
            for (var i = 0; i < this.islands.length; i++) {
                if (this.adventurer.discoveredIslands.indexOf(this.islands[i].id) !== -1) {
                    this.islands[i].unlocked = true;
                }
                if (this.adventurer.completedIslands.indexOf(this.islands[i].id) !== -1) {
                    this.islands[i].completed = true;
                }
            }
            this.checkDailyLogin();
            this.saveState();
        },

        loadState: function() {
            try {
                var saved = localStorage.getItem('ancient_map_v3');
                if (saved) {
                    var state = JSON.parse(saved);
                    for (var key in state) {
                        if (this.adventurer.hasOwnProperty(key)) {
                            this.adventurer[key] = state[key];
                        }
                    }
                }
            } catch(e) {}
        },

        saveState: function() {
            try {
                localStorage.setItem('ancient_map_v3', JSON.stringify(this.adventurer));
            } catch(e) {}
        },

        addXP: function(amount) {
            this.adventurer.xp += amount;
            if (typeof addXP === 'function') try { addXP(amount); } catch(e) {}
            if (typeof xp !== 'undefined') xp = (xp || 0) + amount;
            this.saveState();
        },

        addGold: function(amount) {
            this.adventurer.gold += amount;
            this.saveState();
        },

        checkDailyLogin: function() {
            var today = new Date().toISOString().split('T')[0];
            if (this.adventurer.lastLogin !== today) {
                var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                if (this.adventurer.lastLogin === yesterday) {
                    this.adventurer.streak++;
                    this.addGold(10 * this.adventurer.streak);
                    if (typeof showToast === 'function') {
                        showToast('🔥 تتابع ×' + this.adventurer.streak + '! +' + (10 * this.adventurer.streak) + ' ذهب', 'success');
                    }
                } else {
                    this.adventurer.streak = 1;
                }
                this.addGold(30);
                this.adventurer.lastLogin = today;
                this.saveState();
            }
        },

        unlockAchievement: function(id) {
            if (this.adventurer.achievements.indexOf(id) !== -1) return;
            var ach = this.achievementList.find(function(a) { return a.id === id; });
            if (!ach) return;
            this.adventurer.achievements.push(id);
            this.addGold(50);
            this.addXP(ach.xp || 100);
            this.saveState();
            if (typeof showToast === 'function') {
                showToast('🏆 ' + ach.icon + ' ' + ach.name + '!', 'success');
            }
            if (typeof spawnConfetti === 'function') spawnConfetti();
            SoundFX.play('treasure');
        },

        // ==================== عرض الخريطة الأسطورية ====================
        openMap: function() {
            SoundFX.play('click');
            var self = this;
            
            var h = '<div style="text-align:center;margin-bottom:8px;">';
            h += '<h2 style="color:#3A1F04;font-family:serif;font-size:1.5rem;text-shadow:2px 2px 2px rgba(0,0,0,0.2);">🗺️ خريطة القرصان القديمة</h2>';
            h += '<p style="color:#5C3A0A;font-family:serif;font-style:italic;">Mare Medicinae ~ بحر المعرفة ~ ' + self.adventurer.title + '</p>';
            h += '</div>';
            
            h += '<div style="position:relative;width:100%;height:500px;background:linear-gradient(180deg,#8B7355 0%,#A0855B 10%,#C4A35A 30%,#DEB887 50%,#D4AF5A 70%,#C4A35A 90%,#A0855B 100%);border-radius:20px;overflow:hidden;border:8px solid #5C3A0A;box-shadow:0 0 60px rgba(0,0,0,0.5),inset 0 0 80px rgba(0,0,0,0.3),0 0 0 4px #3A1F04,0 0 0 12px #8B6914;" id="mapContainer">';
            
            // تأثير الورق القديم
            h += '<div style="position:absolute;top:0;left:0;width:100%;height:100%;background:radial-gradient(ellipse at 30% 20%,transparent 40%,rgba(139,105,20,0.5) 100%),radial-gradient(ellipse at 70% 80%,transparent 30%,rgba(101,67,33,0.6) 100%),repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(139,105,20,0.08) 4px,rgba(139,105,20,0.08) 5px),repeating-linear-gradient(90deg,transparent,transparent 6px,rgba(139,105,20,0.05) 6px,rgba(139,105,20,0.05) 7px);pointer-events:none;z-index:1;"></div>';
            
            // بقع الشاي والقهوة
            var stains = [
                { x: 15, y: 20, size: 60 }, { x: 75, y: 60, size: 45 },
                { x: 40, y: 80, size: 35 }, { x: 85, y: 25, size: 50 },
                { x: 55, y: 45, size: 40 }
            ];
            for (var s = 0; s < stains.length; s++) {
                var stain = stains[s];
                h += '<div style="position:absolute;left:' + stain.x + '%;top:' + stain.y + '%;width:' + stain.size + 'px;height:' + stain.size + 'px;background:radial-gradient(ellipse,rgba(101,67,33,0.2),transparent);border-radius:50%;pointer-events:none;z-index:1;"></div>';
            }
            
            // حواف محروقة
            h += '<div style="position:absolute;top:0;left:0;width:100%;height:100%;box-shadow:inset 0 0 80px rgba(0,0,0,0.4),inset 0 0 30px rgba(0,0,0,0.6);pointer-events:none;z-index:1;border-radius:15px;"></div>';
            
            // البوصلة
            h += '<div style="position:absolute;top:12px;right:12px;z-index:5;font-size:3rem;opacity:0.8;filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3));">🧭</div>';
            h += '<div style="position:absolute;top:18px;right:58px;z-index:5;color:#3A1F04;font-weight:900;font-size:0.8rem;text-shadow:1px 1px 1px rgba(255,255,255,0.3);">N</div>';
            
            // عنوان الخريطة
            h += '<div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:5;background:rgba(92,58,10,0.85);padding:8px 25px;border-radius:5px;border:2px solid #3A1F04;font-family:serif;font-size:1.1rem;font-weight:900;color:#F5E6CC;letter-spacing:2px;text-shadow:2px 2px 2px rgba(0,0,0,0.5);box-shadow:0 4px 15px rgba(0,0,0,0.3);">MARE MEDICINAE</div>';
            
            // خطوط الطول والعرض
            for (var i = 8; i < 100; i += 12) {
                h += '<div style="position:absolute;top:0;left:' + i + '%;width:1px;height:100%;background:rgba(139,105,20,0.12);z-index:0;"></div>';
                h += '<div style="position:absolute;top:' + i + '%;left:0;height:1px;width:100%;background:rgba(139,105,20,0.12);z-index:0;"></div>';
            }
            
            // مخلوقات بحرية مرسومة على الخريطة
            var seaCreatures = [
                { x: 12, y: 60, icon: '🐋', size: 2.5 }, { x: 70, y: 80, icon: '🦑', size: 2 },
                { x: 50, y: 15, icon: '🐙', size: 2 }, { x: 90, y: 50, icon: '🦈', size: 2.2 },
                { x: 30, y: 55, icon: '🐠', size: 1.5 }
            ];
            for (var sc = 0; sc < seaCreatures.length; sc++) {
                var creature = seaCreatures[sc];
                h += '<div style="position:absolute;left:' + creature.x + '%;top:' + creature.y + '%;font-size:' + creature.size + 'rem;opacity:0.4;pointer-events:none;z-index:0;">' + creature.icon + '</div>';
            }
            
            // سفن شراعية صغيرة مرسومة
            h += '<div style="position:absolute;left:35%;top:55%;font-size:1.5rem;opacity:0.5;pointer-events:none;z-index:0;">⛵</div>';
            h += '<div style="position:absolute;left:65%;top:30%;font-size:1.2rem;opacity:0.4;pointer-events:none;z-index:0;">⛵</div>';
            
            // مسارات متقطعة
            h += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;">';
            h += '<defs><marker id="arrowGold2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#5C3A0A"/></marker></defs>';
            for (var i = 0; i < this.islands.length - 1; i++) {
                var from = this.islands[i];
                var to = this.islands[i + 1];
                var unlocked = this.adventurer.discoveredIslands.indexOf(to.id) !== -1;
                h += '<line x1="' + from.position.x + '%" y1="' + from.position.y + '%" x2="' + to.position.x + '%" y2="' + to.position.y + '%" stroke="' + (unlocked ? '#3A1F04' : '#8B7355') + '" stroke-width="' + (unlocked ? '2.5' : '1.5') + '" stroke-dasharray="' + (unlocked ? '10,5' : '15,8') + '" marker-end="url(#arrowGold2)" opacity="' + (unlocked ? '0.7' : '0.3') + '"/>';
            }
            h += '</svg>';
            
            // رسم الجزر
            for (var i = 0; i < this.islands.length; i++) {
                var island = this.islands[i];
                var unlocked = this.adventurer.discoveredIslands.indexOf(island.id) !== -1;
                var completed = island.completed;
                var isCurrent = this.adventurer.currentPosition.island === island.id;
                var hasBoss = island.creatures && island.creatures.some(function(c) { return c.isBoss; });
                
                h += '<div onclick="AncientMap.clickIsland(\'' + island.id + '\')" style="position:absolute;left:' + island.position.x + '%;top:' + island.position.y + '%;transform:translate(-50%,-50%);cursor:' + (unlocked ? 'pointer' : 'default') + ';z-index:3;text-align:center;transition:all 0.5s cubic-bezier(0.68,-0.55,0.27,1.55);' + (unlocked ? '' : 'filter:grayscale(90%);opacity:0.4;') + (isCurrent ? 'animation:islandGlow 2s infinite;' : '') + (unlocked && !completed ? 'animation:hoverBounce 3s infinite;' : '') + '">';
                
                // تأثير التوهج للجزر المكتملة
                if (completed) {
                    h += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:50px;height:50px;background:radial-gradient(circle,rgba(16,185,129,0.3),transparent);border-radius:50%;animation:islandGlow 3s infinite;"></div>';
                }
                
                // تأثير الخطر للجزر التي فيها زعماء
                if (hasBoss && unlocked && !completed) {
                    h += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;background:radial-gradient(circle,rgba(239,68,68,0.4),transparent);border-radius:50%;animation:islandGlow 1.5s infinite;"></div>';
                }
                
                h += '<div style="font-size:' + (island.type === 'port' ? '3rem' : '2.3rem') + ';filter:drop-shadow(3px 3px 3px rgba(0,0,0,0.4));' + (completed ? 'filter:brightness(1.4) drop-shadow(0 0 8px rgba(16,185,129,0.6));' : '') + '">' + island.icon + '</div>';
                h += '<div style="background:' + (completed ? '#10b981' : (unlocked ? '#3A1F04' : '#555')) + ';color:#F5E6CC;padding:2px 8px;border-radius:8px;font-size:0.55rem;font-weight:700;white-space:nowrap;border:1px solid #1A0F02;box-shadow:0 2px 5px rgba(0,0,0,0.3);">' + island.name + '</div>';
                
                if (completed) h += '<div style="font-size:0.9rem;text-shadow:0 0 5px rgba(16,185,129,0.5);">✅</div>';
                if (!unlocked) h += '<div style="font-size:0.9rem;">🔒</div>';
                if (isCurrent && !completed) h += '<div style="font-size:1.5rem;animation:sailBoat 1.5s infinite alternate;filter:drop-shadow(0 0 5px rgba(245,158,11,0.5));">⛵</div>';
                
                h += '</div>';
            }
            
            h += '</div>';
            
            // أسطورة
            h += '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;font-size:0.65rem;margin-top:8px;padding:6px;background:rgba(139,105,20,0.2);border-radius:10px;border:1px solid rgba(139,105,20,0.3);">';
            h += '<span>⛵ = موقعك</span> | <span>✅ = مكتملة</span> | <span>🔒 = مقفلة</span> | <span>👾 = وحش</span> | <span>💎 = كنز</span> | <span>👑 = زعيم</span>';
            h += '</div>';
            
            // إحصائيات المغامر
            h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:6px;">';
            h += '<div style="background:linear-gradient(135deg,#3A1F04,#5C3A0A);color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #8B6914;font-size:0.7rem;"><b>⭐ XP</b><br>' + self.adventurer.xp + '</div>';
            h += '<div style="background:linear-gradient(135deg,#3A1F04,#5C3A0A);color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #8B6914;font-size:0.7rem;"><b>🪙 ذهب</b><br>' + self.adventurer.gold + '</div>';
            h += '<div style="background:linear-gradient(135deg,#3A1F04,#5C3A0A);color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #8B6914;font-size:0.7rem;"><b>🏝️ جزر</b><br>' + self.adventurer.completedIslands.length + '/' + self.islands.length + '</div>';
            h += '<div style="background:linear-gradient(135deg,#3A1F04,#5C3A0A);color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #8B6914;font-size:0.7rem;"><b>🏆 إنجازات</b><br>' + self.adventurer.achievements.length + '</div>';
            h += '<div style="background:linear-gradient(135deg,#3A1F04,#5C3A0A);color:#F5E6CC;padding:8px;border-radius:8px;text-align:center;border:1px solid #8B6914;font-size:0.7rem;"><b>🔥 تتابع</b><br>' + self.adventurer.streak + ' يوم</div>';
            h += '</div>';
            
            // أزرار
            h += '<div style="display:flex;gap:6px;justify-content:center;margin-top:8px;flex-wrap:wrap;">';
            h += '<button class="modal-btn btn-info" onclick="AncientMap.openAchievements()" style="font-size:0.7rem;">🏆 إنجازات</button>';
            h += '<button class="modal-btn btn-close" onclick="closeModal(\'mapModal\')">إغلاق</button>';
            h += '</div>';
            
            if (typeof openModal === 'function') {
                openModal('mapModal', h);
            }
        },

        clickIsland: function(islandId) {
            SoundFX.play('sail');
            
            // تأثير جسيمات عند النقر
            var island = this.islands.find(function(is) { return is.id === islandId; });
            if (island && this.adventurer.discoveredIslands.indexOf(islandId) !== -1) {
                var mapEl = document.getElementById('mapContainer');
                if (mapEl) {
                    var rect = mapEl.getBoundingClientRect();
                    var x = rect.left + (island.position.x / 100) * rect.width;
                    var y = rect.top + (island.position.y / 100) * rect.height;
                    ParticleSystem.createExplosion(x, y, '#fbbf24', 20);
                }
            }
            
            setTimeout(function() {
                AncientMap.openIsland(islandId);
            }, 200);
        },

        // ==================== فتح جزيرة ====================
        openIsland: function(islandId) {
            var island = this.islands.find(function(is) { return is.id === islandId; });
            if (!island) return;
            
            if (this.adventurer.discoveredIslands.indexOf(islandId) === -1) {
                if (typeof showToast === 'function') {
                    showToast('🔒 هذه الجزيرة لم تكتشف بعد! أكمل الجزر السابقة أولاً.', 'warning');
                }
                return;
            }
            
            this.adventurer.currentPosition.island = islandId;
            this.adventurer.totalAdventures++;
            this.saveState();
            
            var h = '<div style="text-align:right;max-height:60vh;overflow-y:auto;padding:10px;">';
            
            // رأس الجزيرة
            h += '<div style="text-align:center;margin-bottom:10px;position:relative;">';
            h += '<div style="position:absolute;top:0;left:0;right:0;height:60px;background:linear-gradient(180deg,' + (island.completed ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)') + ',transparent);border-radius:10px 10px 0 0;"></div>';
            h += '<span style="font-size:4rem;position:relative;z-index:1;">' + island.icon + '</span>';
            h += '<h3 style="color:#3A1F04;font-family:serif;font-size:1.3rem;">' + island.name + '</h3>';
            h += '<p style="color:#8B6914;font-style:italic;">' + island.subtitle + '</p>';
            h += '<p style="font-size:0.7rem;">🌤️ ' + island.weather + ' | 🕐 ' + island.timeOfDay + ' | ' + (island.completed ? '✅ مكتملة' : '⏳ قيد الاستكشاف') + '</p>';
            h += '</div>';
            
            // القصة
            h += '<div style="background:linear-gradient(135deg,#F5E6CC,#DEB887,#D2B48C);padding:15px;border-radius:10px;border:2px solid #8B6914;margin:8px 0;font-style:italic;line-height:2;white-space:pre-line;font-size:0.85rem;box-shadow:inset 0 0 20px rgba(139,105,20,0.2);">';
            h += island.story;
            h += '</div>';
            
            // الوحوش
            if (island.creatures && island.creatures.length > 0) {
                h += '<h4 style="color:#8B0000;">👾 حراس الجزيرة:</h4>';
                for (var i = 0; i < island.creatures.length; i++) {
                    var creature = island.creatures[i];
                    var defeated = this.adventurer.defeatedCreatures.indexOf(creature.id) !== -1;
                    h += '<div style="background:' + (defeated ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fef2f2,#fee2e2)') + ';padding:10px;border-radius:8px;margin:5px 0;border:2px solid ' + (defeated ? '#10b981' : '#ef4444') + ';transition:all 0.3s;">';
                    h += '<span style="font-size:2rem;">' + creature.emoji + '</span> ';
                    h += '<strong>' + creature.name + '</strong>';
                    if (creature.isBoss) h += ' <span style="color:#f59e0b;font-weight:900;">👑 زعيم</span>';
                    h += ' <span style="font-size:0.7rem;">❤️' + creature.hp + ' ⚔️' + creature.damage + '</span>';
                    h += '<br><small style="color:#666;">' + creature.story + '</small><br>';
                    if (defeated) {
                        h += '<span style="color:#10b981;font-weight:700;">✅ مهزوم - ' + (creature.defeatMessage || '') + '</span>';
                    } else {
                        h += '<button class="modal-btn btn-danger" onclick="AncientMap.startBattle(\'' + island.id + '\',\'' + creature.id + '\')" style="font-size:0.7rem;animation:pulse 1.5s infinite;">⚔️ مواجهة!</button>';
                    }
                    h += '</div>';
                }
            }
            
            // الكنز
            if (island.treasure) {
                var found = this.adventurer.collectedArtifacts.indexOf(island.treasure.id) !== -1;
                h += '<h4 style="color:#f59e0b;">💎 الكنز المخفي:</h4>';
                h += '<div style="background:' + (found ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : 'linear-gradient(135deg,#f5f5f5,#e5e5e5)') + ';padding:10px;border-radius:8px;border:2px solid ' + (found ? '#f59e0b' : '#ddd') + ';' + (found ? 'box-shadow:0 0 15px rgba(245,158,11,0.3);' : '') + '">';
                h += '<span style="font-size:2rem;">' + island.treasure.emoji + '</span> ';
                h += '<strong>' + island.treasure.name + '</strong>';
                h += '<br><small>' + island.treasure.story + '</small>';
                if (found) {
                    h += '<br><span style="color:#10b981;">✅ تم جمعه! القدرة: ' + island.treasure.abilityDesc + '</span>';
                } else {
                    h += '<br><span style="color:#f59e0b;font-size:0.7rem;">🏆 اهزم الزعيم لكسب هذا الكنز</span>';
                }
                h += '</div>';
            }
            
            h += '</div>';
            
            h += '<button class="modal-btn btn-close" onclick="closeModal(\'islandModal\');AncientMap.openMap();">العودة للخريطة</button>';
            
            if (typeof openModal === 'function') {
                openModal('islandModal', h);
            }
        },

        // ==================== نظام المعارك ====================
        startBattle: function(islandId, creatureId) {
            SoundFX.play('battle');
            var island = this.islands.find(function(is) { return is.id === islandId; });
            if (!island) return;
            var creature = island.creatures.find(function(c) { return c.id === creatureId; });
            if (!creature) return;
            
            if (typeof closeModal === 'function') closeModal('islandModal');
            
            var questions = [];
            if (creature.chapter && typeof getAllQuestions === 'function') {
                questions = getAllQuestions(creature.chapter, 'all');
            }
            if ((!questions || questions.length === 0) && typeof getAllQuestions === 'function') {
                questions = getAllQuestions('all', 'all');
            }
            if (questions && questions.length > 0) {
                questions = questions.sort(function() { return Math.random() - 0.5; }).slice(0, creature.questions);
            }
            
            if (!questions || questions.length === 0) {
                if (typeof showToast === 'function') {
                    showToast('❌ لا توجد أسئلة متاحة!', 'error');
                }
                return;
            }
            
            window._battleCreature = creature;
            window._battleIsland = island;
            window._battleQuestions = questions;
            window._battleScores = {};
            window._battleCorrectStreak = 0;
            window._battleStartTime = Date.now();
            window._battleMonsterHP = creature.hp;
            window._battlePlayerHP = 100;
            
            var h = '<div style="text-align:center;">';
            h += '<h2 style="color:#8B0000;">⚔️ معركة: ' + creature.emoji + ' ' + creature.name + '</h2>';
            h += '<div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);padding:12px;border-radius:10px;margin:8px 0;font-style:italic;border:2px solid #ef4444;">' + creature.story + '</div>';
            
            // شريط HP
            h += '<div style="display:flex;gap:15px;justify-content:center;align-items:center;margin:10px 0;">';
            h += '<div style="text-align:center;flex:1;">';
            h += '<span style="font-size:3rem;">' + creature.emoji + '</span><br>';
            h += '<div style="background:#fee2e2;height:12px;border-radius:6px;overflow:hidden;border:1px solid #ef4444;">';
            h += '<div id="monsterHPBar" style="background:linear-gradient(90deg,#ef4444,#dc2626);height:100%;width:100%;transition:width 0.5s;"></div></div>';
            h += '<span style="font-size:0.7rem;color:#ef4444;">❤️ <span id="monsterHPText">' + creature.hp + '</span>/' + creature.hp + '</span>';
            h += '</div>';
            h += '<div style="font-size:2rem;">⚔️</div>';
            h += '<div style="text-align:center;flex:1;">';
            h += '<span style="font-size:3rem;">🧑‍⚕️</span><br>';
            h += '<div style="background:#dcfce7;height:12px;border-radius:6px;overflow:hidden;border:1px solid #10b981;">';
            h += '<div id="playerHPBar" style="background:linear-gradient(90deg,#10b981,#059669);height:100%;width:100%;transition:width 0.5s;"></div></div>';
            h += '<span style="font-size:0.7rem;color:#10b981;">❤️ <span id="playerHPText">100</span>/100</span>';
            h += '</div>';
            h += '</div>';
            
            h += '<p style="font-size:0.8rem;">📝 أجب على ' + questions.length + ' أسئلة (تحتاج 60%+ للفوز)</p>';
            h += '</div>';
            h += '<div id="battleQuestions"></div>';
            
            if (typeof openModal === 'function') {
                openModal('battleModal', h);
            }
            
            var self = this;
            setTimeout(function() {
                var qHTML = '';
                for (var i = 0; i < questions.length; i++) {
                    if (typeof renderQuestionHTML === 'function') {
                        qHTML += renderQuestionHTML(questions[i], i, 'Battle', questions.length);
                    }
                }
                var battleDiv = document.getElementById('battleQuestions');
                if (battleDiv) battleDiv.innerHTML = qHTML;
            }, 300);
        },

        updateBattleHP: function() {
            var monsterHP = window._battleMonsterHP;
            var playerHP = window._battlePlayerHP;
            var creature = window._battleCreature;
            
            var monsterBar = document.getElementById('monsterHPBar');
            var monsterText = document.getElementById('monsterHPText');
            var playerBar = document.getElementById('playerHPBar');
            var playerText = document.getElementById('playerHPText');
            
            if (monsterBar) monsterBar.style.width = Math.max(0, (monsterHP / creature.hp) * 100) + '%';
            if (monsterText) monsterText.textContent = Math.max(0, monsterHP);
            if (playerBar) playerBar.style.width = Math.max(0, playerHP) + '%';
            if (playerText) playerText.textContent = Math.max(0, playerHP);
        },

        answerBattle: function(btn, chosen, correct, i, total) {
            var creature = window._battleCreature;
            var parent = btn.parentElement;
            var buttons = parent.querySelectorAll('.quiz-opt');
            for (var b = 0; b < buttons.length; b++) buttons[b].disabled = true;
            
            var isCorrect = false;
            if (typeof isAnswerCorrect === 'function') {
                isCorrect = isAnswerCorrect(chosen, correct);
            } else {
                isCorrect = (String(chosen).trim() === String(correct).trim());
            }
            
            btn.classList.add(isCorrect ? 'correct' : 'wrong');
            window._battleScores[i] = isCorrect;
            
            if (isCorrect) {
                SoundFX.play('success');
                window._battleCorrectStreak = (window._battleCorrectStreak || 0) + 1;
                window._battleMonsterHP = Math.max(0, window._battleMonsterHP - Math.floor(creature.hp / total));
                this.addXP(5);
                this.addGold(2);
            } else {
                SoundFX.play('fail');
                window._battleCorrectStreak = 0;
                window._battlePlayerHP = Math.max(0, window._battlePlayerHP - Math.floor(100 / total));
            }
            
            this.updateBattleHP();
            
            var fb = document.getElementById('Battle-fb-' + i);
            if (fb) {
                fb.textContent = isCorrect ? '✅ إصابة! أحسنت!' : '❌ خطأ! الصحيح: ' + correct;
                fb.style.color = isCorrect ? '#10b981' : '#ef4444';
                fb.style.padding = '8px';
                fb.style.borderRadius = '8px';
                fb.style.marginTop = '5px';
                fb.style.background = isCorrect ? '#f0fdf4' : '#fef2f2';
            }
            
            if (Object.keys(window._battleScores).length >= total) {
                var self = this;
                setTimeout(function() { self.finishBattle(); }, 800);
            }
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
                SoundFX.play('treasure');
                h += '<h2 style="color:#10b981;">🎉 انتصار!</h2>';
                h += '<div style="font-size:5rem;animation:bounce 0.5s;">🏆</div>';
                h += '<p style="font-size:1.2rem;">لقد هزمت ' + creature.emoji + ' <b>' + creature.name + '</b>!</p>';
                h += '<p>📊 النتيجة: <b>' + correct + '/' + total + '</b> (<b>' + score + '%</b>)</p>';
                h += '<p>⏱️ الوقت: ' + formatTime(timeTaken) + '</p>';
                h += '<p style="color:#f59e0b;">🏅 +' + creature.reward.xp + ' XP | 🪙 +' + creature.reward.gold + ' ذهب</p>';
                
                this.adventurer.defeatedCreatures.push(creature.id);
                this.addXP(creature.reward.xp);
                this.addGold(creature.reward.gold);
                
                if (creature.isBoss && island.treasure) {
                    if (this.adventurer.collectedArtifacts.indexOf(island.treasure.id) === -1) {
                        this.adventurer.collectedArtifacts.push(island.treasure.id);
                        if (island.treasure.ability) this.adventurer.abilities.push(island.treasure.ability);
                        h += '<p style="color:#f59e0b;font-size:1.2rem;">💎 <b>' + island.treasure.emoji + ' ' + island.treasure.name + '!</b></p>';
                        h += '<p style="color:#8b5cf6;">🔮 قدرة جديدة: <b>' + island.treasure.abilityDesc + '</b></p>';
                    }
                }
                
                if (!island.completed) {
                    island.completed = true;
                    this.adventurer.completedIslands.push(island.id);
                    this.addXP(island.rewards.xp);
                    this.addGold(island.rewards.gold);
                    if (island.rewards.title) this.adventurer.title = island.rewards.title;
                    
                    var currentIndex = -1;
                    for (var i = 0; i < this.islands.length; i++) {
                        if (this.islands[i].id === island.id) { currentIndex = i; break; }
                    }
                    if (currentIndex >= 0 && currentIndex < this.islands.length - 1) {
                        var next = this.islands[currentIndex + 1];
                        if (this.adventurer.discoveredIslands.indexOf(next.id) === -1) {
                            this.adventurer.discoveredIslands.push(next.id);
                            next.unlocked = true;
                            h += '<p style="color:#10b981;font-size:1.1rem;">🗺️ <b>تم اكتشاف ' + next.icon + ' ' + next.name + '!</b></p>';
                        }
                    }
                }
                
                if (island.achievements) {
                    for (var a = 0; a < island.achievements.length; a++) {
                        this.unlockAchievement(island.achievements[a]);
                    }
                }
                
                if (score === 100) this.unlockAchievement('secret_perfect');
                if (correct >= 10 && timeTaken <= 60) this.unlockAchievement('secret_speed');
                if (window._battleCorrectStreak >= 7) this.unlockAchievement('secret_lucky');
                
                if (typeof spawnConfetti === 'function') spawnConfetti();
                
                // تأثير الجسيمات
                setTimeout(function() {
                    var modal = document.querySelector('.modal-content');
                    if (modal) {
                        var rect = modal.getBoundingClientRect();
                        ParticleSystem.createExplosion(rect.left + rect.width/2, rect.top + rect.height/2, '#fbbf24', 50);
                    }
                }, 300);
            } else {
                SoundFX.play('fail');
                h += '<h2 style="color:#ef4444;">😢 هزيمة</h2>';
                h += '<div style="font-size:5rem;">💀</div>';
                h += '<p>لقد هزمك ' + creature.emoji + ' <b>' + creature.name + '</b>!</p>';
                h += '<p>📊 النتيجة: <b>' + correct + '/' + total + '</b> (<b>' + score + '%</b>)</p>';
                h += '<p style="color:#ef4444;">تحتاج 60% على الأقل للفوز</p>';
                this.adventurer.health = Math.max(10, this.adventurer.health - creature.damage);
                h += '<button class="modal-btn btn-danger" onclick="AncientMap.retryBattle()" style="animation:pulse 1s infinite;">🔄 حاول مرة أخرى!</button>';
            }
            
            this.saveState();
            h += '</div>';
            h += '<button class="modal-btn btn-close" onclick="closeModal(\'battleModal\');">إغلاق</button>';
            
            var modal = document.getElementById('battleModal');
            if (modal) modal.querySelector('.modal-content').innerHTML = h;
        },

        retryBattle: function() {
            SoundFX.play('click');
            if (typeof closeModal === 'function') closeModal('battleModal');
            var creature = window._battleCreature;
            var island = window._battleIsland;
            if (creature && island) this.startBattle(island.id, creature.id);
        },

        // ==================== الإنجازات ====================
        openAchievements: function() {
            SoundFX.play('click');
            var h = '<h2>🏆 الإنجازات (' + this.adventurer.achievements.length + '/' + this.achievementList.length + ')</h2>';
            h += '<div style="max-height:55vh;overflow-y:auto;">';
            for (var i = 0; i < this.achievementList.length; i++) {
                var ach = this.achievementList[i];
                var earned = this.adventurer.achievements.indexOf(ach.id) !== -1;
                if (ach.secret && !earned) {
                    h += '<div style="background:var(--card-bg);padding:6px;border-radius:8px;margin:3px 0;opacity:0.3;text-align:center;">🔒 ???</div>';
                } else {
                    h += '<div style="background:' + (earned ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'var(--card-bg)') + ';padding:8px;border-radius:8px;margin:3px 0;border:1px solid var(--border-color);' + (earned ? 'border-color:#10b981;' : 'opacity:0.5;') + '">';
                    h += '<span style="font-size:1.2rem;">' + (earned ? ach.icon : '🔒') + '</span> ';
                    h += '<strong>' + ach.name + '</strong>';
                    h += ' <small style="color:var(--text-secondary);">' + ach.desc + '</small>';
                    if (ach.secret && earned) h += ' <span style="color:#8b5cf6;">🔮 سري</span>';
                    if (earned) h += ' <span style="color:#f59e0b;"> +' + ach.xp + ' XP</span>';
                    h += '</div>';
                }
            }
            h += '</div>';
            h += '<button class="modal-btn btn-close" onclick="closeModal(\'achievementsModal\')">إغلاق</button>';
            if (typeof openModal === 'function') openModal('achievementsModal', h);
        },

        // ==================== إضافة الزر ====================
        addButton: function() {
            var self = this;
            var attempts = 0;
            function tryAdd() {
                var controlBar = document.querySelector('.control-bar');
                if (!controlBar) { attempts++; if (attempts < 40) setTimeout(tryAdd, 500); return; }
                if (document.getElementById('ancientMapBtn')) return;
                var btn = document.createElement('button');
                btn.id = 'ancientMapBtn';
                btn.className = 'leaderboard-btn';
                btn.innerHTML = '🗺️ خريطة';
                btn.title = '🏴‍☠️ خريطة القرصان القديمة - مغامرة المعرفة';
                btn.onclick = function() { self.openMap(); };
                btn.style.background = 'linear-gradient(135deg, #3A1F04, #5C3A0A, #8B6914)';
                btn.style.border = '2px solid #D4AF37';
                btn.style.color = '#F5E6CC';
                btn.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
                btn.style.boxShadow = '0 0 15px rgba(212,175,55,0.3)';
                controlBar.appendChild(btn);
            }
            tryAdd();
        }
    };

    // ===== دوال عامة =====
    window.checkBattleAnswer = function(btn, chosen, correct, i, total) {
        AncientMap.answerBattle(btn, chosen, correct, i, total);
    };
    window.checkBattleOther = function(i, correctText, total) {
        var input = document.getElementById('Battle-other-' + i);
        if (!input || input.disabled) return;
        var isCorrect = false;
        if (typeof checkDefinitionAnswer === 'function') isCorrect = checkDefinitionAnswer(input.value, correctText);
        input.classList.add(isCorrect ? 'correct-input' : 'wrong-input');
        input.disabled = true;
        window._battleScores[i] = isCorrect;
        if (isCorrect) { window._battleCorrectStreak = (window._battleCorrectStreak || 0) + 1; AncientMap.addXP(8); AncientMap.addGold(3); }
        else { window._battleCorrectStreak = 0; }
        if (Object.keys(window._battleScores).length >= total) setTimeout(function() { AncientMap.finishBattle(); }, 500);
    };

    // ===== تهيئة =====
    function initSystem() {
        AncientMap.init();
        AncientMap.addButton();
        if (!document.getElementById('ancientMapStyles')) {
            var style = document.createElement('style');
            style.id = 'ancientMapStyles';
            style.textContent = `
                @keyframes sailBoat{0%{transform:translate(-50%,-50%) rotate(-6deg) translateX(-4px)}50%{transform:translate(-50%,-50%) rotate(3deg) translateX(2px)}100%{transform:translate(-50%,-50%) rotate(6deg) translateX(4px)}}
                @keyframes islandGlow{0%,100%{filter:drop-shadow(0 0 5px #fbbf24)}50%{filter:drop-shadow(0 0 20px #f59e0b)}}
                @keyframes hoverBounce{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(-50%,-55%)}}
                @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
                @keyframes particleFly{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(calc(cos(var(--angle))*var(--velocity)),calc(sin(var(--angle))*var(--velocity))) scale(0)}}
                @keyframes rainDrop{0%{transform:translateY(0);opacity:1}100%{transform:translateY(500px);opacity:0}}
                @keyframes fogFloat{0%{transform:translateX(0)}100%{transform:translateX(50px)}}
                @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
            `;
            document.head.appendChild(style);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(initSystem, 2500); });
    } else {
        setTimeout(initSystem, 2500);
    }
})();
