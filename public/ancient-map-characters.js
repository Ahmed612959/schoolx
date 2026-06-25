// ╔══════════════════════════════════════════════════════════════════╗
// ║  🎭  نظام الشخصيات والمشاهد المتحركة                        ║
// ║  Characters & Animations Engine v2.0                        ║
// ║  شخصيات CSS متحركة - خلفيات - مؤثرات بصرية                 ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== مصنع الشخصيات ====================
    class Character {
        constructor(config) {
            this.id = config.id;
            this.name = config.name;
            this.emoji = config.emoji;
            this.role = config.role;
            this.personality = config.personality || [];
            this.speech = config.speech || [];
            this.position = config.position || { x: 50, y: 50 };
            this.animations = config.animations || [];
            this.currentAnimation = null;
            this.element = null;
            this.container = null;
        }

        create(container) {
            this.container = container;
            this.element = document.createElement('div');
            this.element.className = `character character-${this.id}`;
            this.element.style.cssText = `
                position: absolute;
                left: ${this.position.x}%;
                top: ${this.position.y}%;
                transform: translate(-50%, -50%);
                font-size: 4rem;
                cursor: pointer;
                z-index: 10;
                transition: all 0.3s ease;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
            `;
            this.element.innerHTML = this.emoji;
            this.element.title = this.name;
            
            // أحداث التفاعل
            this.element.addEventListener('click', () => this.onClick());
            this.element.addEventListener('mouseenter', () => this.onHover());
            this.element.addEventListener('mouseleave', () => this.onLeave());
            
            container.appendChild(this.element);
            this.startIdleAnimation();
        }

        startIdleAnimation() {
            const anim = this.animations.find(a => a.name === 'idle');
            if (anim) {
                this.element.style.animation = `${anim.cssName} ${anim.duration || 2}s infinite`;
                this.currentAnimation = 'idle';
            }
        }

        onClick() {
            if (window.AncientMap && window.AncientMap.Audio) {
                window.AncientMap.Audio.playSFX('click');
            }
            this.speak();
            this.playAnimation('interact');
        }

        onHover() {
            this.element.style.transform = 'translate(-50%, -50%) scale(1.2)';
            this.element.style.filter = 'drop-shadow(0 0 15px rgba(251,191,36,0.6))';
        }

        onLeave() {
            this.element.style.transform = 'translate(-50%, -50%) scale(1)';
            this.element.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))';
        }

        speak(text) {
            const msg = text || this.speech[Math.floor(Math.random() * this.speech.length)];
            if (!msg) return;
            
            // إنشاء فقاعة كلام
            const bubble = document.createElement('div');
            bubble.className = 'speech-bubble';
            bubble.innerHTML = msg;
            bubble.style.cssText = `
                position: absolute;
                top: -60px;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                color: #1a3a4a;
                padding: 8px 15px;
                border-radius: 20px;
                font-size: 0.85rem;
                font-weight: 600;
                white-space: nowrap;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                animation: speechBubble 0.3s ease, speechBubbleOut 0.3s ease 2.7s forwards;
                z-index: 20;
                font-family: 'Tajawal', sans-serif;
            `;
            
            // ذيل الفقاعة
            const tail = document.createElement('div');
            tail.style.cssText = `
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 8px solid transparent;
                border-right: 8px solid transparent;
                border-top: 8px solid white;
            `;
            bubble.appendChild(tail);
            
            this.element.appendChild(bubble);
            
            // إزالة الفقاعة بعد 3 ثواني
            setTimeout(() => {
                if (bubble.parentElement) {
                    bubble.remove();
                }
            }, 3000);
        }

        playAnimation(name) {
            const anim = this.animations.find(a => a.name === name);
            if (anim) {
                this.element.style.animation = `${anim.cssName} ${anim.duration || 1}s ease`;
                setTimeout(() => {
                    this.startIdleAnimation();
                }, (anim.duration || 1) * 1000);
            }
        }

        walk(x, y, duration = 2000) {
            this.element.style.transition = `left ${duration}ms ease, top ${duration}ms ease`;
            this.element.style.left = `${x}%`;
            this.element.style.top = `${y}%`;
            this.position = { x, y };
            this.playAnimation('walk');
        }

        remove() {
            if (this.element && this.element.parentElement) {
                this.element.remove();
            }
        }
    }

    // ==================== مصنع المشاهد ====================
    class Scene {
        constructor(config) {
            this.id = config.id;
            this.name = config.name;
            this.type = config.type;
            this.effects = config.effects || [];
            this.container = null;
            this.elements = [];
        }

        create(container) {
            this.container = container;
            
            switch(this.type) {
                case 'ocean':
                    this.createOceanScene();
                    break;
                case 'forest':
                    this.createForestScene();
                    break;
                case 'volcano':
                    this.createVolcanoScene();
                    break;
                case 'storm':
                    this.createStormScene();
                    break;
                case 'night':
                    this.createNightScene();
                    break;
                case 'treasure_cave':
                    this.createTreasureCaveScene();
                    break;
            }
        }

        createOceanScene() {
            // أمواج
            for (let i = 0; i < 5; i++) {
                const wave = document.createElement('div');
                wave.className = 'scene-wave';
                wave.style.cssText = `
                    position: absolute;
                    bottom: ${i * 15}%;
                    left: 0;
                    width: 200%;
                    height: 20px;
                    background: linear-gradient(90deg, 
                        transparent 0%, 
                        rgba(100, 180, 255, 0.3) 20%,
                        rgba(255, 255, 255, 0.5) 50%,
                        rgba(100, 180, 255, 0.3) 80%,
                        transparent 100%
                    );
                    animation: waveMove ${3 + i * 0.5}s linear infinite;
                    animation-delay: ${i * 0.3}s;
                    pointer-events: none;
                    z-index: 1;
                `;
                this.container.appendChild(wave);
                this.elements.push(wave);
            }
            
            // نوارس
            for (let i = 0; i < 3; i++) {
                const seagull = document.createElement('div');
                seagull.style.cssText = `
                    position: absolute;
                    top: ${10 + i * 15}%;
                    left: ${Math.random() * 80}%;
                    font-size: 1.5rem;
                    animation: seagullFly ${3 + i * 2}s ease-in-out infinite;
                    animation-delay: ${i * 0.5}s;
                    pointer-events: none;
                    z-index: 2;
                `;
                seagull.innerHTML = '🐦';
                this.container.appendChild(seagull);
                this.elements.push(seagull);
            }
            
            // فقاعات
            if (window.AncientMap && window.AncientMap.Particles) {
                window.AncientMap.Particles.bubbles(this.container, 20);
            }
        }

        createForestScene() {
            // أشجار
            const trees = ['🌳', '🌲', '🌴', '🪴'];
            for (let i = 0; i < 8; i++) {
                const tree = document.createElement('div');
                tree.style.cssText = `
                    position: absolute;
                    bottom: 5%;
                    left: ${5 + i * 12}%;
                    font-size: ${2 + Math.random() * 3}rem;
                    animation: treeSway ${3 + Math.random() * 2}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 2}s;
                    pointer-events: none;
                    z-index: 1;
                `;
                tree.innerHTML = trees[Math.floor(Math.random() * trees.length)];
                this.container.appendChild(tree);
                this.elements.push(tree);
            }
            
            // يراعات
            for (let i = 0; i < 15; i++) {
                const firefly = document.createElement('div');
                firefly.style.cssText = `
                    position: absolute;
                    top: ${Math.random() * 80}%;
                    left: ${Math.random() * 90}%;
                    width: 4px;
                    height: 4px;
                    background: #fbbf24;
                    border-radius: 50%;
                    box-shadow: 0 0 10px #fbbf24;
                    animation: fireflyFloat ${2 + Math.random() * 3}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 3}s;
                    pointer-events: none;
                    z-index: 3;
                `;
                this.container.appendChild(firefly);
                this.elements.push(firefly);
            }
        }

        createVolcanoScene() {
            // حمم
            for (let i = 0; i < 4; i++) {
                const lava = document.createElement('div');
                lava.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: ${20 + i * 15}%;
                    width: 10px;
                    height: ${30 + Math.random() * 40}px;
                    background: linear-gradient(to top, #ef4444, #f59e0b, transparent);
                    border-radius: 5px 5px 0 0;
                    animation: lavaRise ${1 + Math.random() * 2}s ease-out infinite;
                    animation-delay: ${i * 0.4}s;
                    pointer-events: none;
                    z-index: 1;
                `;
                this.container.appendChild(lava);
                this.elements.push(lava);
            }
            
            // دخان
            for (let i = 0; i < 6; i++) {
                const smoke = document.createElement('div');
                smoke.style.cssText = `
                    position: absolute;
                    top: ${10 + i * 5}%;
                    left: ${40 + Math.random() * 20}%;
                    width: ${20 + Math.random() * 30}px;
                    height: ${20 + Math.random() * 30}px;
                    background: radial-gradient(circle, rgba(100,100,100,0.4), transparent);
                    border-radius: 50%;
                    animation: smokeRise ${3 + Math.random() * 3}s ease-out infinite;
                    animation-delay: ${i * 0.5}s;
                    pointer-events: none;
                    z-index: 2;
                `;
                this.container.appendChild(smoke);
                this.elements.push(smoke);
            }
        }

        createStormScene() {
            // غيوم
            for (let i = 0; i < 5; i++) {
                const cloud = document.createElement('div');
                cloud.style.cssText = `
                    position: absolute;
                    top: ${5 + i * 10}%;
                    left: ${Math.random() * 100}%;
                    font-size: ${2 + Math.random() * 2}rem;
                    animation: cloudMove ${5 + i * 2}s linear infinite;
                    animation-delay: ${i * 0.5}s;
                    pointer-events: none;
                    z-index: 2;
                    opacity: 0.7;
                `;
                cloud.innerHTML = ['☁️', '🌧️', '⛈️', '🌩️'][Math.floor(Math.random() * 4)];
                this.container.appendChild(cloud);
                this.elements.push(cloud);
            }
            
            // مطر
            if (window.AncientMap && window.AncientMap.Particles) {
                window.AncientMap.Particles.rain(this.container, 80);
            }
            
            // برق
            const lightning = document.createElement('div');
            lightning.style.cssText = `
                position: absolute;
                top: 0;
                left: 30%;
                width: 3px;
                height: 60%;
                background: #fbbf24;
                box-shadow: 0 0 20px #fbbf24, 0 0 40px #f59e0b;
                animation: lightningFlash 4s ease-in-out infinite;
                pointer-events: none;
                z-index: 3;
                opacity: 0;
            `;
            this.container.appendChild(lightning);
            this.elements.push(lightning);
        }

        createNightScene() {
            // نجوم
            for (let i = 0; i < 30; i++) {
                const star = document.createElement('div');
                const size = 1 + Math.random() * 3;
                star.style.cssText = `
                    position: absolute;
                    top: ${Math.random() * 50}%;
                    left: ${Math.random() * 100}%;
                    width: ${size}px;
                    height: ${size}px;
                    background: white;
                    border-radius: 50%;
                    animation: starTwinkle ${1 + Math.random() * 3}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 2}s;
                    pointer-events: none;
                    z-index: 1;
                `;
                this.container.appendChild(star);
                this.elements.push(star);
            }
            
            // قمر
            const moon = document.createElement('div');
            moon.style.cssText = `
                position: absolute;
                top: 10%;
                right: 15%;
                width: 60px;
                height: 60px;
                background: radial-gradient(circle, #fef3c7, #fbbf24);
                border-radius: 50%;
                box-shadow: 0 0 40px rgba(251,191,36,0.4), 0 0 80px rgba(251,191,36,0.2);
                pointer-events: none;
                z-index: 1;
            `;
            this.container.appendChild(moon);
            this.elements.push(moon);
            
            // ضباب
            if (window.AncientMap && window.AncientMap.Particles) {
                window.AncientMap.Particles.fog(this.container, 8);
            }
        }

        createTreasureCaveScene() {
            // بريق
            for (let i = 0; i < 20; i++) {
                const sparkle = document.createElement('div');
                sparkle.style.cssText = `
                    position: absolute;
                    top: ${Math.random() * 100}%;
                    left: ${Math.random() * 100}%;
                    font-size: ${0.8 + Math.random() * 1.5}rem;
                    animation: sparkle ${1 + Math.random() * 2}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 2}s;
                    pointer-events: none;
                    z-index: 2;
                `;
                sparkle.innerHTML = ['✨', '💫', '⭐', '💎'][Math.floor(Math.random() * 4)];
                this.container.appendChild(sparkle);
                this.elements.push(sparkle);
            }
            
            // كنوز
            const treasures = ['🪙', '💎', '👑', '🏆', '🔮', '💍'];
            for (let i = 0; i < 8; i++) {
                const treasure = document.createElement('div');
                treasure.style.cssText = `
                    position: absolute;
                    bottom: ${5 + Math.random() * 20}%;
                    left: ${10 + i * 10}%;
                    font-size: ${1.5 + Math.random() * 2}rem;
                    animation: treasureBounce ${1 + Math.random() * 2}s ease-in-out infinite;
                    animation-delay: ${i * 0.2}s;
                    pointer-events: none;
                    z-index: 1;
                `;
                treasure.innerHTML = treasures[Math.floor(Math.random() * treasures.length)];
                this.container.appendChild(treasure);
                this.elements.push(treasure);
            }
        }

        remove() {
            this.elements.forEach(el => el.remove());
            this.elements = [];
        }
    }

    // ==================== مدير الشخصيات والمشاهد ====================
    class WorldManager {
        constructor() {
            this.characters = new Map();
            this.scenes = new Map();
            this.activeScene = null;
            this.worldContainer = null;
        }

        createWorld(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            this.worldContainer = container;
            this.worldContainer.style.position = 'relative';
            this.worldContainer.style.overflow = 'hidden';
        }

        addCharacter(config) {
            const character = new Character(config);
            this.characters.set(config.id, character);
            if (this.worldContainer) {
                character.create(this.worldContainer);
            }
            return character;
        }

        getCharacter(id) {
            return this.characters.get(id);
        }

        setScene(sceneType) {
            // إزالة المشهد الحالي
            if (this.activeScene) {
                this.activeScene.remove();
            }
            
            // إنشاء مشهد جديد
            const scene = new Scene({ id: sceneType, name: sceneType, type: sceneType });
            if (this.worldContainer) {
                scene.create(this.worldContainer);
            }
            
            this.activeScene = scene;
            return scene;
        }

        clearAll() {
            this.characters.forEach(char => char.remove());
            this.characters.clear();
            if (this.activeScene) {
                this.activeScene.remove();
                this.activeScene = null;
            }
        }
    }

    // ==================== شخصيات جاهزة ====================
    const CharacterPresets = {
        oldWiseMan: {
            id: 'old_wise_man',
            name: 'العجوز الحكيم',
            emoji: '🧙‍♂️',
            role: 'مرشد',
            personality: ['حكيم', 'غامض', 'لطيف'],
            position: { x: 40, y: 60 },
            speech: [
                'أهلاً بك أيها المغامر الشاب! 🗺️',
                'المعرفة كنز لا يفنى... 📚',
                'كل جزيرة تخفي سراً... 🔍',
                'الأسئلة هي مفاتيح الكنوز! 🗝️',
                'كن شجاعاً... المغامرة تنتظرك! ⚓'
            ],
            animations: [
                { name: 'idle', cssName: 'wiseFloat', duration: 3 },
                { name: 'interact', cssName: 'wiseBow', duration: 0.5 },
                { name: 'walk', cssName: 'wiseWalk', duration: 1 }
            ]
        },
        
        nurseGhost: {
            id: 'nurse_ghost',
            name: 'شبح الممرضة',
            emoji: '👻',
            role: 'حارس',
            personality: ['حنون', 'حزين', 'مساعد'],
            position: { x: 60, y: 50 },
            speech: [
                'الرحمة نور في الظلام... 💙',
                'ليس كل من يرحل يموت... بعضهم يبقى في الذاكرة... 🌸',
                'الرعاية التلطيفية فن التخفيف... 🕊️',
                'ألم المريض يحتاج قلباً يفهم... 💝'
            ],
            animations: [
                { name: 'idle', cssName: 'ghostFloat', duration: 4 },
                { name: 'interact', cssName: 'ghostFade', duration: 0.8 }
            ]
        },
        
        surgeonSpirit: {
            id: 'surgeon_spirit',
            name: 'روح الجراح',
            emoji: '💀',
            role: 'معلم',
            personality: ['صارم', 'دقيق', 'محترف'],
            position: { x: 45, y: 45 },
            speech: [
                'التعقيم قبل كل شيء! 🧼',
                'المشرط في يد الجاهل سلاح خطير... ⚔️',
                'الدقة... الدقة... ثم الدقة! 🎯',
                'كل عملية قصة... وكل مريض بطل! 🏥'
            ],
            animations: [
                { name: 'idle', cssName: 'spiritPulse', duration: 2 },
                { name: 'interact', cssName: 'spiritSlash', duration: 0.4 }
            ]
        },
        
        stormWitch: {
            id: 'storm_witch',
            name: 'ساحرة العواصف',
            emoji: '🧙‍♀️',
            role: 'حارسة',
            personality: ['غامضة', 'قوية', 'عاصفة'],
            position: { x: 55, y: 40 },
            speech: [
                'الرياح تحمل أسرار التنفس... 🌪️',
                'الربو عاصفة في صدر المريض... 💨',
                'استمع إلى صوت الرئتين... يحكيان قصة! 🫁',
                'الأكسجين هدية الحياة... لا تنسَ! 🎁'
            ],
            animations: [
                { name: 'idle', cssName: 'witchFloat', duration: 3 },
                { name: 'interact', cssName: 'witchSpell', duration: 0.6 }
            ]
        },
        
        treasureGolem: {
            id: 'treasure_golem',
            name: 'غول الكنوز',
            emoji: '🗿',
            role: 'حارس',
            personality: ['صلب', 'وفي', 'قديم'],
            position: { x: 70, y: 55 },
            speech: [
                'الكنوز لمن يستحقها فقط... 💎',
                'أجب بشكل صحيح... أو ارحل! ⚡',
                'المعرفة ثمينة أكثر من الذهب... 🪙',
                'أنا هنا منذ ألف عام... أنتظر المستحق! 🏛️'
            ],
            animations: [
                { name: 'idle', cssName: 'golemIdle', duration: 5 },
                { name: 'interact', cssName: 'golemStomp', duration: 0.8 }
            ]
        }
    };

    // ==================== التصدير ====================
    window.AncientCharacters = {
        Character,
        Scene,
        WorldManager,
        CharacterPresets,
        world: new WorldManager()
    };

    // ==================== أنماط CSS للشخصيات والمشاهد ====================
    function addCharacterStyles() {
        if (document.getElementById('characterStylesV2')) return;
        
        const style = document.createElement('style');
        style.id = 'characterStylesV2';
        style.textContent = `
            /* ========== حركات الشخصيات ========== */
            @keyframes wiseFloat {
                0%, 100% { transform: translate(-50%, -50%) translateY(0); }
                50% { transform: translate(-50%, -50%) translateY(-10px); }
            }
            @keyframes wiseBow {
                0% { transform: translate(-50%, -50%) rotate(0); }
                30% { transform: translate(-50%, -50%) rotate(-15deg); }
                60% { transform: translate(-50%, -50%) rotate(5deg); }
                100% { transform: translate(-50%, -50%) rotate(0); }
            }
            @keyframes wiseWalk {
                0% { transform: translate(-50%, -50%) rotate(-5deg); }
                50% { transform: translate(-50%, -50%) rotate(5deg); }
                100% { transform: translate(-50%, -50%) rotate(-5deg); }
            }
            
            @keyframes ghostFloat {
                0%, 100% { transform: translate(-50%, -50%) translateY(0); opacity: 0.7; }
                50% { transform: translate(-50%, -50%) translateY(-15px); opacity: 1; }
            }
            @keyframes ghostFade {
                0% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
                50% { opacity: 0.2; transform: translate(-50%, -50%) scale(1.3); }
                100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
            }
            
            @keyframes spiritPulse {
                0%, 100% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.1); }
            }
            @keyframes spiritSlash {
                0% { transform: translate(-50%, -50%) rotate(0); }
                50% { transform: translate(-50%, -50%) rotate(30deg); }
                100% { transform: translate(-50%, -50%) rotate(0); }
            }
            
            @keyframes witchFloat {
                0%, 100% { transform: translate(-50%, -50%) translateY(0) rotate(0); }
                25% { transform: translate(-50%, -50%) translateY(-8px) rotate(-3deg); }
                75% { transform: translate(-50%, -50%) translateY(8px) rotate(3deg); }
            }
            @keyframes witchSpell {
                0% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.3); filter: drop-shadow(0 0 20px #8b5cf6); }
                100% { transform: translate(-50%, -50%) scale(1); }
            }
            
            @keyframes golemIdle {
                0%, 100% { transform: translate(-50%, -50%) translateY(0); }
                30% { transform: translate(-50%, -50%) translateY(-3px); }
                60% { transform: translate(-50%, -50%) translateY(-1px); }
            }
            @keyframes golemStomp {
                0% { transform: translate(-50%, -50%) translateY(0); }
                50% { transform: translate(-50%, -50%) translateY(-20px); }
                70% { transform: translate(-50%, -50%) translateY(5px); }
                100% { transform: translate(-50%, -50%) translateY(0); }
            }
            
            /* ========== حركات المشاهد ========== */
            @keyframes waveMove {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
            }
            @keyframes seagullFly {
                0%, 100% { transform: translate(0, 0) rotate(0); }
                25% { transform: translate(30px, -20px) rotate(-5deg); }
                75% { transform: translate(-30px, -10px) rotate(5deg); }
            }
            @keyframes bubbleRise {
                0% { transform: translateY(0) scale(1); opacity: 0.6; }
                100% { transform: translateY(-400px) scale(0.3); opacity: 0; }
            }
            @keyframes treeSway {
                0%, 100% { transform: rotate(-3deg); }
                50% { transform: rotate(3deg); }
            }
            @keyframes fireflyFloat {
                0%, 100% { transform: translate(0, 0); opacity: 0.3; }
                50% { transform: translate(10px, -20px); opacity: 1; }
            }
            @keyframes lavaRise {
                0% { transform: scaleY(0); opacity: 0.8; }
                50% { transform: scaleY(1.2); opacity: 1; }
                100% { transform: scaleY(0.8); opacity: 0.5; }
            }
            @keyframes smokeRise {
                0% { transform: translateY(0) scale(1); opacity: 0.6; }
                100% { transform: translateY(-100px) scale(2); opacity: 0; }
            }
            @keyframes cloudMove {
                0% { transform: translateX(0); }
                100% { transform: translateX(-120vw); }
            }
            @keyframes lightningFlash {
                0%, 90%, 100% { opacity: 0; }
                92% { opacity: 1; }
                94% { opacity: 0.5; }
                96% { opacity: 1; }
            }
            @keyframes starTwinkle {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.5); }
            }
            @keyframes sparkle {
                0%, 100% { opacity: 0; transform: scale(0) rotate(0); }
                50% { opacity: 1; transform: scale(1) rotate(180deg); }
            }
            @keyframes treasureBounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }
            
            /* ========== فقاعات الكلام ========== */
            @keyframes speechBubble {
                0% { transform: translateX(-50%) scale(0); opacity: 0; }
                100% { transform: translateX(-50%) scale(1); opacity: 1; }
            }
            @keyframes speechBubbleOut {
                0% { transform: translateX(-50%) scale(1); opacity: 1; }
                100% { transform: translateX(-50%) scale(0); opacity: 0; }
            }
            
            /* ========== تحسينات بصرية ========== */
            .character {
                transition: all 0.3s ease;
                user-select: none;
            }
            .character:hover {
                filter: drop-shadow(0 0 15px rgba(251,191,36,0.6)) !important;
                cursor: pointer;
            }
            .speech-bubble {
                pointer-events: none;
                direction: rtl;
            }
        `;
        
        document.head.appendChild(style);
    }

    // ==================== التهيئة ====================
    function init() {
        addCharacterStyles();
        console.log('🎭 نظام الشخصيات والمشاهد جاهز!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
