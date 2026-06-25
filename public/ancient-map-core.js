// ╔══════════════════════════════════════════════════════════════════╗
// ║  🏴‍☠️  نظام المغامرة الأسطوري - الملف الأساسي              ║
// ║  Ancient Map Adventure - Core Engine                        ║
// ║  الإصدار 4.0 - مع شخصيات ومهام تفاعلية                     ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== ذاكرة التخزين المؤقت ====================
    const CACHE = new Map();
    const CACHE_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة

    function getCache(key) {
        const entry = CACHE.get(key);
        if (!entry) return null;
        if (Date.now() - entry.time > CACHE_TIMEOUT) {
            CACHE.delete(key);
            return null;
        }
        return entry.data;
    }

    function setCache(key, data) {
        CACHE.set(key, { data, time: Date.now() });
    }

    // ==================== تحسين الأداء ====================
    const batch = (fn, delay = 16) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    };

    const throttle = (fn, limit = 100) => {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    // ==================== نظام الصوت المتقدم ====================
    class AudioEngine {
        constructor() {
            this.context = null;
            this.sounds = new Map();
            this.musicPlaying = false;
            this.musicVolume = 0.3;
            this.sfxVolume = 0.5;
            this.currentTrack = null;
            this.initialized = false;
        }

        init() {
            if (this.initialized) return;
            try {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
                this.initialized = true;
                console.log('🔊 نظام الصوت جاهز');
            } catch(e) {
                console.warn('⚠️ المتصفح لا يدعم Web Audio API');
            }
        }

        // مؤثرات صوتية
        playSFX(type) {
            if (!this.context || !this.initialized) return;
            
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.context.destination);
            gain.gain.value = this.sfxVolume;

            switch(type) {
                case 'click':
                    osc.frequency.value = 800;
                    osc.start();
                    osc.stop(this.context.currentTime + 0.05);
                    break;
                    
                case 'success':
                    osc.frequency.value = 523;
                    gain.gain.value = 0.3;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(784, this.context.currentTime + 0.2);
                    osc.stop(this.context.currentTime + 0.3);
                    break;
                    
                case 'fail':
                    osc.frequency.value = 300;
                    gain.gain.value = 0.3;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(150, this.context.currentTime + 0.3);
                    osc.stop(this.context.currentTime + 0.4);
                    break;
                    
                case 'treasure':
                    osc.type = 'triangle';
                    osc.frequency.value = 600;
                    gain.gain.value = 0.25;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(1200, this.context.currentTime + 0.15);
                    osc.frequency.linearRampToValueAtTime(800, this.context.currentTime + 0.3);
                    osc.stop(this.context.currentTime + 0.5);
                    break;
                    
                case 'battle':
                    osc.type = 'sawtooth';
                    osc.frequency.value = 200;
                    gain.gain.value = 0.15;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(400, this.context.currentTime + 0.1);
                    osc.frequency.linearRampToValueAtTime(200, this.context.currentTime + 0.2);
                    osc.stop(this.context.currentTime + 0.3);
                    break;
                    
                case 'waves':
                    osc.type = 'sine';
                    osc.frequency.value = 0.5;
                    gain.gain.value = 0.1;
                    osc.start();
                    osc.stop(this.context.currentTime + 2);
                    break;
                    
                case 'seagulls':
                    osc.type = 'sine';
                    osc.frequency.value = 1200;
                    gain.gain.value = 0.08;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(800, this.context.currentTime + 0.3);
                    osc.stop(this.context.currentTime + 0.5);
                    break;
                    
                case 'sparkle':
                    osc.type = 'sine';
                    osc.frequency.value = 2000;
                    gain.gain.value = 0.05;
                    osc.start();
                    osc.frequency.linearRampToValueAtTime(3000, this.context.currentTime + 0.1);
                    osc.stop(this.context.currentTime + 0.15);
                    break;
                    
                case 'levelup':
                    const notes = [523, 659, 784, 1047];
                    notes.forEach((freq, i) => {
                        const o = this.context.createOscillator();
                        const g = this.context.createGain();
                        o.connect(g);
                        g.connect(this.context.destination);
                        o.frequency.value = freq;
                        g.gain.value = 0.2;
                        o.start(this.context.currentTime + i * 0.15);
                        o.stop(this.context.currentTime + i * 0.15 + 0.2);
                    });
                    break;
            }
        }

        // موسيقى خلفية
        playMusic(type) {
            if (!this.context || !this.initialized) return;
            this.stopMusic();
            
            let freq = 220;
            let duration = 4;
            
            switch(type) {
                case 'port': freq = 261; break;  // دو
                case 'battle': freq = 196; break; // صول
                case 'treasure': freq = 329; break; // مي
                case 'storm': freq = 146; break; // ري
            }
            
            this.currentTrack = { type, freq, startTime: this.context.currentTime };
            this.musicPlaying = true;
            
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.context.destination);
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.value = this.musicVolume * 0.5;
            osc.start();
            
            this.currentTrack.oscillator = osc;
            this.currentTrack.gain = gain;
        }

        stopMusic() {
            if (this.currentTrack && this.currentTrack.oscillator) {
                try {
                    this.currentTrack.oscillator.stop();
                } catch(e) {}
            }
            this.musicPlaying = false;
            this.currentTrack = null;
        }

        setVolume(type, value) {
            if (type === 'music') this.musicVolume = value;
            if (type === 'sfx') this.sfxVolume = value;
        }
    }

    // ==================== نظام الجسيمات المتقدم ====================
    class ParticleEngine {
        constructor() {
            this.particles = [];
            this.maxParticles = 100;
        }

        emit(x, y, config = {}) {
            const count = config.count || 20;
            const color = config.color || '#fbbf24';
            const size = config.size || [3, 8];
            const velocity = config.velocity || [2, 5];
            const lifetime = config.lifetime || [500, 1500];
            
            for (let i = 0; i < count; i++) {
                if (this.particles.length >= this.maxParticles) {
                    this.particles.shift().remove();
                }
                
                const particle = document.createElement('div');
                const angle = (Math.PI * 2 * i) / count;
                const speed = velocity[0] + Math.random() * (velocity[1] - velocity[0]);
                const particleSize = size[0] + Math.random() * (size[1] - size[0]);
                const life = lifetime[0] + Math.random() * (lifetime[1] - lifetime[0]);
                
                particle.style.cssText = `
                    position: fixed;
                    left: ${x}px;
                    top: ${y}px;
                    width: ${particleSize}px;
                    height: ${particleSize}px;
                    background: ${color};
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 99999;
                    box-shadow: 0 0 ${particleSize * 2}px ${color};
                    transition: all ${life}ms ease-out;
                    opacity: 1;
                `;
                
                document.body.appendChild(particle);
                this.particles.push(particle);
                
                // تحريك الجسيم
                requestAnimationFrame(() => {
                    const dx = Math.cos(angle) * speed * 30;
                    const dy = Math.sin(angle) * speed * 30;
                    particle.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
                    particle.style.opacity = '0';
                });
                
                // إزالة الجسيم
                setTimeout(() => {
                    particle.remove();
                    const idx = this.particles.indexOf(particle);
                    if (idx > -1) this.particles.splice(idx, 1);
                }, life);
            }
        }

        rain(container, count = 50) {
            for (let i = 0; i < count; i++) {
                const drop = document.createElement('div');
                drop.className = 'ancient-rain-drop';
                drop.style.cssText = `
                    position: absolute;
                    left: ${Math.random() * 100}%;
                    top: -20px;
                    width: 2px;
                    height: ${10 + Math.random() * 20}px;
                    background: rgba(100, 180, 255, 0.6);
                    pointer-events: none;
                    animation: rainDrop ${0.3 + Math.random() * 0.7}s linear infinite;
                    animation-delay: ${Math.random() * 2}s;
                `;
                container.appendChild(drop);
            }
        }

        fog(container, count = 5) {
            for (let i = 0; i < count; i++) {
                const fog = document.createElement('div');
                fog.style.cssText = `
                    position: absolute;
                    left: ${Math.random() * 80}%;
                    top: ${Math.random() * 80}%;
                    width: ${50 + Math.random() * 100}px;
                    height: ${30 + Math.random() * 50}px;
                    background: radial-gradient(ellipse, rgba(255,255,255,0.3), transparent);
                    pointer-events: none;
                    animation: fogFloat ${3 + Math.random() * 5}s ease-in-out infinite alternate;
                    animation-delay: ${Math.random() * 3}s;
                `;
                container.appendChild(fog);
            }
        }

        bubbles(container, count = 15) {
            for (let i = 0; i < count; i++) {
                const bubble = document.createElement('div');
                const size = 5 + Math.random() * 20;
                bubble.style.cssText = `
                    position: absolute;
                    left: ${Math.random() * 90}%;
                    bottom: -30px;
                    width: ${size}px;
                    height: ${size}px;
                    background: radial-gradient(circle, rgba(255,255,255,0.4), rgba(100,200,255,0.1));
                    border-radius: 50%;
                    pointer-events: none;
                    animation: bubbleRise ${2 + Math.random() * 3}s linear infinite;
                    animation-delay: ${Math.random() * 2}s;
                `;
                container.appendChild(bubble);
            }
        }
    }

    // ==================== تهيئة المحركات ====================
    const Audio = new AudioEngine();
    const Particles = new ParticleEngine();

    // ==================== النظام الأساسي ====================
    window.AncientMap = {
        version: '4.0.0',
        Audio: Audio,
        Particles: Particles,
        
        // بيانات المغامر
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
            streak: 0,
            dailyBonus: null,
            weeklyChallenge: null,
            avatar: '🧑‍⚕️',
            experience: 0
        },

        // الجزر مع المهام
        islands: [
            {
                id: 'port_royal',
                name: 'ميناء البداية',
                subtitle: 'حيث تبدأ كل المغامرات',
                position: { x: 8, y: 85 },
                icon: '⚓',
                type: 'port',
                unlocked: true,
                completed: false,
                weather: 'مشمس',
                timeOfDay: 'نهار',
                quests: [
                    {
                        id: 'quest_meet_wise',
                        name: 'لقاء العجوز الحكيم',
                        icon: '🧙‍♂️',
                        type: 'dialogue',
                        description: 'تحدث مع العجوز الحكيم عند الرصيف',
                        xpReward: 30,
                        goldReward: 15,
                        steps: ['اذهب إلى الرصيف', 'تحدث مع العجوز', 'استمع إلى قصته']
                    },
                    {
                        id: 'quest_explore_port',
                        name: 'استكشاف الميناء',
                        icon: '🔍',
                        type: 'explore',
                        description: 'اكتشف 3 أماكن مهمة في الميناء',
                        xpReward: 40,
                        goldReward: 20,
                        targets: ['المنارة', 'سوق السمك', 'حانة البحارة']
                    },
                    {
                        id: 'quest_first_aid',
                        name: 'مساعدة بحار مصاب',
                        icon: '🏥',
                        type: 'medical',
                        description: 'قدم الإسعافات الأولية لبحار جريح',
                        xpReward: 50,
                        goldReward: 25,
                        medicalCase: {
                            condition: 'جرح في الذراع',
                            requiredActions: ['تنظيف الجرح', 'تضميد', 'إعطاء مسكن']
                        }
                    }
                ],
                characters: ['old_wise_man', 'injured_sailor', 'port_merchant'],
                treasures: [],
                requirements: null
            },
            {
                id: 'mercy_reef',
                name: 'شعاب الرحمة',
                subtitle: 'جزيرة الرعاية التلطيفية',
                position: { x: 22, y: 78 },
                icon: '🏝️',
                type: 'story',
                unlocked: false,
                completed: false,
                weather: 'غائم جزئياً',
                timeOfDay: 'غسق',
                quests: [
                    {
                        id: 'quest_herb_collection',
                        name: 'جمع الأعشاب الطبية',
                        icon: '🌿',
                        type: 'collect',
                        description: 'اجمع 5 أعشاب طبية من الشعاب',
                        xpReward: 60,
                        goldReward: 30,
                        requiredItems: [
                            { name: 'زهرة الرحمة', icon: '🌸', location: 'الشاطئ الشمالي' },
                            { name: 'ورق الصبار', icon: '🌵', location: 'التلال' },
                            { name: 'عشبة النعناع', icon: '🌱', location: 'الوادي' },
                            { name: 'زيت اللافندر', icon: '💜', location: 'الحديقة' },
                            { name: 'جذر الزنجبيل', icon: '🫚', location: 'الكهف' }
                        ]
                    },
                    {
                        id: 'quest_ghost_mercy',
                        name: 'مواجهة شبح الرحمة',
                        icon: '👻',
                        type: 'battle',
                        description: 'اهزم شبح الرحمة في معركة المعرفة',
                        xpReward: 100,
                        goldReward: 50,
                        monster: 'ghost_mercy'
                    }
                ],
                characters: ['nurse_ghost', 'herb_collector'],
                treasures: [
                    {
                        id: 'gem_mercy',
                        name: 'جوهرة الرحمة الزرقاء',
                        icon: '💎',
                        description: 'تمنحك القدرة على الشعور بآلام الآخرين'
                    }
                ],
                requirements: { type: 'complete', island: 'port_royal' }
            }
        ],

        // ==================== دوال أساسية ====================
        init: function() {
            Audio.init();
            this.loadState();
            
            // تهيئة الجزر
            if (this.adventurer.discoveredIslands.length === 0) {
                this.adventurer.discoveredIslands = ['port_royal'];
                this.islands[0].unlocked = true;
            }
            
            // تحديث حالة الجزر من البيانات المحفوظة
            this.islands.forEach(island => {
                if (this.adventurer.discoveredIslands.includes(island.id)) {
                    island.unlocked = true;
                }
                if (this.adventurer.completedIslands.includes(island.id)) {
                    island.completed = true;
                }
            });
            
            this.checkDailyBonus();
            this.checkWeeklyChallenge();
            this.saveState();
            
            console.log('🏴‍☠️ Ancient Map v4.0 - جاهز للإبحار!');
        },

        loadState: function() {
            try {
                const saved = localStorage.getItem('ancient_map_v4');
                if (saved) {
                    const state = JSON.parse(saved);
                    Object.assign(this.adventurer, state);
                }
            } catch(e) {
                console.warn('⚠️ فشل تحميل الحالة المحفوظة');
            }
        },

        saveState: function() {
            try {
                localStorage.setItem('ancient_map_v4', JSON.stringify(this.adventurer));
                setCache('adventurer', { ...this.adventurer });
            } catch(e) {
                console.warn('⚠️ فشل حفظ الحالة');
            }
        },

        addXP: function(amount) {
            this.adventurer.xp += amount;
            if (typeof addXP === 'function') {
                addXP(amount);
            }
            this.checkLevelUp();
            this.saveState();
        },

        addGold: function(amount) {
            this.adventurer.gold += amount;
            this.saveState();
        },

        checkLevelUp: function() {
            const oldLevel = this.adventurer.level;
            this.adventurer.level = Math.floor(this.adventurer.xp / 500) + 1;
            
            if (this.adventurer.level > oldLevel) {
                Audio.playSFX('levelup');
                Particles.emit(window.innerWidth / 2, window.innerHeight / 2, {
                    count: 50,
                    color: '#fbbf24',
                    size: [5, 15]
                });
                
                if (typeof showToast === 'function') {
                    showToast(`🎉 مستوى ${this.adventurer.level}!`, 'success');
                }
            }
        },

        // ==================== نظام المكافآت اليومية ====================
        checkDailyBonus: function() {
            const today = new Date().toISOString().split('T')[0];
            
            if (this.adventurer.lastLogin !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                
                if (this.adventurer.lastLogin === yesterday) {
                    this.adventurer.streak++;
                } else {
                    this.adventurer.streak = 1;
                }
                
                this.adventurer.lastLogin = today;
                
                // مكافأة يومية عشوائية
                const bonuses = [
                    { type: 'gold', amount: 30 + Math.floor(Math.random() * 50), icon: '🪙' },
                    { type: 'xp', amount: 50 + Math.floor(Math.random() * 100), icon: '⭐' },
                    { type: 'item', item: 'خريطة كنز', icon: '🗺️' },
                    { type: 'gold', amount: 50 + (this.adventurer.streak * 10), icon: '💰' }
                ];
                
                const bonus = bonuses[Math.floor(Math.random() * bonuses.length)];
                this.adventurer.dailyBonus = bonus;
                
                if (bonus.type === 'gold') this.addGold(bonus.amount);
                if (bonus.type === 'xp') this.addXP(bonus.amount);
                
                if (typeof showToast === 'function') {
                    showToast(`${bonus.icon} مكافأة يوم ${this.adventurer.streak}: ${bonus.type === 'gold' ? '+' + bonus.amount + ' ذهب' : bonus.type === 'xp' ? '+' + bonus.amount + ' XP' : bonus.item}`, 'success');
                }
            }
        },

        // ==================== التحديات الأسبوعية ====================
        checkWeeklyChallenge: function() {
            const weekStart = this.getWeekStart();
            
            if (!this.adventurer.weeklyChallenge || this.adventurer.weeklyChallenge.week !== weekStart) {
                const challenges = [
                    {
                        id: 'answer_50',
                        name: 'باحث المعرفة',
                        description: 'أجب على 50 سؤالاً هذا الأسبوع',
                        target: 50,
                        progress: 0,
                        reward: { xp: 200, gold: 100, title: '📚 باحث الأسبوع' }
                    },
                    {
                        id: 'perfect_score',
                        name: 'الكمال',
                        description: 'احصل على 100% في 3 اختبارات',
                        target: 3,
                        progress: 0,
                        reward: { xp: 300, gold: 150, title: '💯 المثالي' }
                    },
                    {
                        id: 'island_explorer',
                        name: 'مستكشف الجزر',
                        description: 'أكمل 3 جزر جديدة',
                        target: 3,
                        progress: 0,
                        reward: { xp: 250, gold: 125, title: '🗺️ المستكشف' }
                    },
                    {
                        id: 'streak_master',
                        name: 'سيد التتابع',
                        description: 'حافظ على تتابع 7 أيام',
                        target: 7,
                        progress: this.adventurer.streak,
                        reward: { xp: 400, gold: 200, title: '🔥 سيد التتابع' }
                    }
                ];
                
                this.adventurer.weeklyChallenge = {
                    week: weekStart,
                    challenge: challenges[Math.floor(Math.random() * challenges.length)],
                    completed: false
                };
                
                this.saveState();
            }
        },

        getWeekStart: function() {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(now.setDate(diff)).toISOString().split('T')[0];
        },

        // ==================== دوال التنقل ====================
        openMap: function() {
            Audio.playSFX('click');
            
            // استخدام الكاش إذا وجد
            const cached = getCache('map_html');
            if (cached) {
                if (typeof openModal === 'function') {
                    openModal('mapModal', cached);
                }
                return;
            }
            
            const html = this.buildMapHTML();
            setCache('map_html', html);
            
            if (typeof openModal === 'function') {
                openModal('mapModal', html);
            }
        },

        buildMapHTML: function() {
            let html = '<div id="mapContainer" style="position:relative;width:100%;height:500px;background:linear-gradient(180deg,#1a3a4a,#0d2a35,#1a3a4a);border-radius:20px;overflow:hidden;border:8px solid #5C3A0A;">';
            
            // خلفية متحركة
            html += '<div id="mapBackground" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;"></div>';
            
            // جزر
            this.islands.forEach(island => {
                const unlocked = island.unlocked;
                const completed = island.completed;
                const isCurrent = this.adventurer.currentPosition.island === island.id;
                
                html += `<div onclick="AncientMap.openIsland('${island.id}')" 
                    style="position:absolute;left:${island.position.x}%;top:${island.position.y}%;
                    transform:translate(-50%,-50%);cursor:${unlocked ? 'pointer' : 'default'};
                    z-index:3;text-align:center;${!unlocked ? 'filter:grayscale(90%);opacity:0.4;' : ''}
                    ${isCurrent ? 'animation:islandGlow 2s infinite;' : ''}
                    ${unlocked && !completed ? 'animation:hoverBounce 3s infinite;' : ''}">
                    <div style="font-size:3rem;">${island.icon}</div>
                    <div style="background:${completed ? '#10b981' : (unlocked ? '#3A1F04' : '#555')};
                        color:white;padding:2px 8px;border-radius:8px;font-size:0.65rem;font-weight:700;">
                        ${island.name}
                    </div>
                    ${completed ? '<div>✅</div>' : ''}
                    ${!unlocked ? '<div>🔒</div>' : ''}
                    ${isCurrent ? '<div style="font-size:1.5rem;">⛵</div>' : ''}
                </div>`;
            });
            
            html += '</div>';
            
            // إحصائيات
            html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;">
                <div style="background:#1a3a4a;color:white;padding:8px;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;">⭐ XP</div>
                    <div style="font-weight:700;">${this.adventurer.xp}</div>
                </div>
                <div style="background:#1a3a4a;color:white;padding:8px;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;">🪙 ذهب</div>
                    <div style="font-weight:700;">${this.adventurer.gold}</div>
                </div>
                <div style="background:#1a3a4a;color:white;padding:8px;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;">🏝️ جزر</div>
                    <div style="font-weight:700;">${this.adventurer.completedIslands.length}/${this.islands.length}</div>
                </div>
                <div style="background:#1a3a4a;color:white;padding:8px;border-radius:8px;text-align:center;">
                    <div style="font-size:0.7rem;">🔥 تتابع</div>
                    <div style="font-weight:700;">${this.adventurer.streak} يوم</div>
                </div>
            </div>`;
            
            // أزرار
            html += `<div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap;">
                <button class="modal-btn btn-info" onclick="AncientMap.openAchievements()">🏆 إنجازات</button>
                <button class="modal-btn btn-info" onclick="AncientMap.openWeeklyChallenge()">🎯 تحدي الأسبوع</button>
                <button class="modal-btn btn-info" onclick="AncientMap.openDailyBonus()">🎁 مكافأة اليوم</button>
                <button class="modal-btn btn-close" onclick="closeModal('mapModal')">إغلاق</button>
            </div>`;
            
            return html;
        },

        openIsland: function(islandId) {
            const island = this.islands.find(is => is.id === islandId);
            if (!island || !island.unlocked) return;
            
            Audio.playSFX('click');
            Audio.playMusic(island.type === 'port' ? 'port' : 'treasure');
            
            this.adventurer.currentPosition.island = islandId;
            this.saveState();
            
            let html = `<div style="text-align:center;">
                <div style="font-size:5rem;">${island.icon}</div>
                <h2 style="color:#fbbf24;">${island.name}</h2>
                <p>${island.subtitle}</p>
                <p>🌤️ ${island.weather} | 🕐 ${island.timeOfDay}</p>
            </div>`;
            
            // المهام
            if (island.quests && island.quests.length > 0) {
                html += '<h3 style="color:#fbbf24;">📋 المهام:</h3>';
                island.quests.forEach(quest => {
                    html += `<div style="background:#1a3a4a;padding:10px;border-radius:8px;margin:5px 0;cursor:pointer;" 
                        onclick="AncientMap.startQuest('${islandId}', '${quest.id}')">
                        <span style="font-size:1.5rem;">${quest.icon}</span>
                        <strong>${quest.name}</strong>
                        <br><small>${quest.description}</small>
                        <br><small style="color:#fbbf24;">⭐ +${quest.xpReward} XP | 🪙 +${quest.goldReward} ذهب</small>
                    </div>`;
                });
            }
            
            html += `<button class="modal-btn btn-close" onclick="closeModal('islandModal');AncientMap.openMap();">العودة للخريطة</button>`;
            
            if (typeof openModal === 'function') {
                openModal('islandModal', html);
            }
        },

        // ==================== نظام المهام ====================
        startQuest: function(islandId, questId) {
            const island = this.islands.find(is => is.id === islandId);
            const quest = island?.quests?.find(q => q.id === questId);
            if (!quest) return;
            
            Audio.playSFX('click');
            
            switch(quest.type) {
                case 'dialogue':
                    this.startDialogueQuest(quest);
                    break;
                case 'explore':
                    this.startExploreQuest(quest);
                    break;
                case 'medical':
                    this.startMedicalQuest(quest);
                    break;
                case 'collect':
                    this.startCollectQuest(quest);
                    break;
                case 'battle':
                    this.startBattleQuest(quest);
                    break;
            }
        },

        startDialogueQuest: function(quest) {
            const steps = quest.steps || [];
            let currentStep = 0;
            
            function showStep() {
                if (currentStep >= steps.length) {
                    completeQuest(quest);
                    return;
                }
                
                const html = `
                    <div style="text-align:center;">
                        <h3>${quest.icon} ${quest.name}</h3>
                        <p style="font-size:1.2rem;">${steps[currentStep]}</p>
                        <div style="margin-top:15px;">
                            <button class="modal-btn btn-primary" onclick="event.target.closest('.modal-content').querySelector('.quest-step').click()">
                                ✅ تم - التالي
                            </button>
                        </div>
                        <div style="margin-top:10px;color:#94a3b8;">
                            الخطوة ${currentStep + 1} من ${steps.length}
                        </div>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
                
                // إضافة معالج للزر
                setTimeout(() => {
                    const btn = document.querySelector('#questModal .quest-step');
                    if (btn) {
                        btn.onclick = () => {
                            currentStep++;
                            showStep();
                        };
                    }
                }, 100);
            }
            
            function completeQuest(q) {
                AncientMap.addXP(q.xpReward);
                AncientMap.addGold(q.goldReward);
                Audio.playSFX('success');
                
                if (typeof spawnConfetti === 'function') spawnConfetti();
                if (typeof showToast === 'function') {
                    showToast(`✅ اكتملت المهمة! +${q.xpReward} XP`, 'success');
                }
                closeModal('questModal');
            }
            
            showStep();
        },

        // ==================== الإنجازات ====================
        openAchievements: function() {
            const html = '<h2>🏆 الإنجازات</h2><p>قريباً...</p>';
            if (typeof openModal === 'function') {
                openModal('achievementsModal', html);
            }
        },

        openWeeklyChallenge: function() {
            const challenge = this.adventurer.weeklyChallenge;
            if (!challenge) return;
            
            const html = `
                <h2>🎯 تحدي الأسبوع</h2>
                <div style="background:#1a3a4a;padding:20px;border-radius:15px;text-align:center;">
                    <h3>${challenge.challenge.name}</h3>
                    <p>${challenge.challenge.description}</p>
                    <div style="font-size:2rem;margin:10px 0;">
                        ${challenge.challenge.progress} / ${challenge.challenge.target}
                    </div>
                    <div style="background:#334155;height:10px;border-radius:5px;overflow:hidden;">
                        <div style="background:#fbbf24;height:100%;width:${Math.min(100, (challenge.challenge.progress / challenge.challenge.target) * 100)}%;"></div>
                    </div>
                    <p style="margin-top:10px;">🏆 ${challenge.challenge.reward.title}</p>
                </div>
                <button class="modal-btn btn-close" onclick="closeModal('weeklyModal')">إغلاق</button>
            `;
            
            if (typeof openModal === 'function') {
                openModal('weeklyModal', html);
            }
        },

        openDailyBonus: function() {
            const bonus = this.adventurer.dailyBonus;
            if (!bonus) {
                if (typeof showToast === 'function') {
                    showToast('🎁 لقد حصلت على مكافأتك اليومية بالفعل!', 'info');
                }
                return;
            }
            
            let bonusText = '';
            if (bonus.type === 'gold') bonusText = `🪙 +${bonus.amount} قطعة ذهبية`;
            else if (bonus.type === 'xp') bonusText = `⭐ +${bonus.amount} XP`;
            else bonusText = `🎁 ${bonus.item}`;
            
            const html = `
                <h2>🎁 مكافأة اليوم ${this.adventurer.streak}</h2>
                <div style="text-align:center;padding:20px;">
                    <div style="font-size:5rem;">${bonus.icon}</div>
                    <div style="font-size:1.5rem;margin:15px 0;">${bonusText}</div>
                    <p>تتابع: ${this.adventurer.streak} يوم</p>
                    <p style="font-size:0.8rem;color:#94a3b8;">عد غداً لمكافأة جديدة!</p>
                </div>
                <button class="modal-btn btn-close" onclick="closeModal('bonusModal')">حسناً</button>
            `;
            
            if (typeof openModal === 'function') {
                openModal('bonusModal', html);
            }
        },

        // ==================== إضافة الأزرار ====================
        addButton: function() {
            const self = this;
            let attempts = 0;
            
            function tryAdd() {
                const controlBar = document.querySelector('.control-bar');
                if (!controlBar) {
                    attempts++;
                    if (attempts < 40) setTimeout(tryAdd, 500);
                    return;
                }
                
                if (document.getElementById('ancientMapBtn')) return;
                
                const btn = document.createElement('button');
                btn.id = 'ancientMapBtn';
                btn.className = 'leaderboard-btn';
                btn.innerHTML = '🗺️ مغامرة';
                btn.title = '🏴‍☠️ خريطة القرصان - ابدأ مغامرتك!';
                btn.onclick = () => self.openMap();
                btn.style.cssText = `
                    background: linear-gradient(135deg, #1a3a4a, #0d2a35, #fbbf24);
                    border: 2px solid #fbbf24;
                    color: #fbbf24;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                    box-shadow: 0 0 15px rgba(251,191,36,0.3);
                    animation: pulse 2s infinite;
                `;
                
                controlBar.appendChild(btn);
                console.log('🗺️ زر المغامرة تمت إضافته');
            }
            
            tryAdd();
        }
    };

    // ==================== أنماط CSS ====================
    function addStyles() {
        if (document.getElementById('ancientMapStylesV4')) return;
        
        const style = document.createElement('style');
        style.id = 'ancientMapStylesV4';
        style.textContent = `
            @keyframes islandGlow {
                0%, 100% { filter: drop-shadow(0 0 5px #fbbf24); }
                50% { filter: drop-shadow(0 0 20px #f59e0b); }
            }
            @keyframes hoverBounce {
                0%, 100% { transform: translate(-50%, -50%); }
                50% { transform: translate(-50%, -55%); }
            }
            @keyframes rainDrop {
                0% { transform: translateY(0); opacity: 1; }
                100% { transform: translateY(500px); opacity: 0; }
            }
            @keyframes fogFloat {
                0% { transform: translateX(0); }
                100% { transform: translateX(50px); }
            }
            @keyframes bubbleRise {
                0% { transform: translateY(0) scale(1); opacity: 0.6; }
                100% { transform: translateY(-400px) scale(0.5); opacity: 0; }
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            @keyframes sparkle {
                0%, 100% { opacity: 0; transform: scale(0); }
                50% { opacity: 1; transform: scale(1); }
            }
        `;
        
        document.head.appendChild(style);
    }

    // ==================== التهيئة النهائية ====================
    function init() {
        addStyles();
        AncientMap.init();
        
        // إضافة الزر بعد التأكد من تحميل الصفحة
        setTimeout(() => {
            AncientMap.addButton();
        }, 2000);
        
        console.log(`
        ╔══════════════════════════════════════╗
        ║  🏴‍☠️  Ancient Map v4.0 جاهز!     ║
        ║  🔊 صوت: ${Audio.initialized ? '✅' : '❌'}                       ║
        ║  💾 كاش: ✅                        ║
        ║  🎮 جزر: ${AncientMap.islands.length}                        ║
        ╚══════════════════════════════════════╝
        `);
    }

    // تشغيل النظام
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
