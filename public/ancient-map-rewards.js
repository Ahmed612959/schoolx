// ╔══════════════════════════════════════════════════════════════════╗
// ║  🎁  نظام المكافآت والإنجازات - Rewards & Achievements     ║
// ║  إنجازات - مكافآت - ألقاب - أسرار - طور الليل            ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== نظام الإنجازات ====================
    class AchievementSystem {
        constructor() {
            this.achievements = this.getAchievementList();
            this.unlocked = new Set();
            this.secretFound = new Set();
        }

        getAchievementList() {
            return [
                // ===== إنجازات عادية =====
                {
                    id: 'first_step',
                    name: 'الخطوة الأولى',
                    icon: '👣',
                    description: 'ابدأ مغامرتك في ميناء البداية',
                    xpReward: 50,
                    secret: false,
                    category: 'exploration'
                },
                {
                    id: 'first_battle',
                    name: 'أول معركة',
                    icon: '⚔️',
                    description: 'اربح أول معركة لك',
                    xpReward: 75,
                    secret: false,
                    category: 'combat'
                },
                {
                    id: 'first_quest',
                    name: 'مغامر مبتدئ',
                    icon: '📋',
                    description: 'أكمل أول مهمة لك',
                    xpReward: 60,
                    secret: false,
                    category: 'quests'
                },
                {
                    id: 'collector_3',
                    name: 'جامع الكنوز',
                    icon: '💎',
                    description: 'اجمع 3 كنوز مختلفة',
                    xpReward: 100,
                    secret: false,
                    category: 'collection'
                },
                {
                    id: 'island_3',
                    name: 'مستكشف الجزر',
                    icon: '🏝️',
                    description: 'اكتشف 3 جزر',
                    xpReward: 150,
                    secret: false,
                    category: 'exploration'
                },
                {
                    id: 'combo_5',
                    name: 'سيد الكومبو',
                    icon: '🔥',
                    description: 'حقق كومبو ×5 في معركة',
                    xpReward: 100,
                    secret: false,
                    category: 'combat'
                },
                {
                    id: 'perfect_score',
                    name: 'الكمال',
                    icon: '💯',
                    description: 'أجب على جميع الأسئلة صحيحة في مهمة',
                    xpReward: 200,
                    secret: false,
                    category: 'quests'
                },
                {
                    id: 'gold_500',
                    name: 'التاجر الثري',
                    icon: '💰',
                    description: 'اجمع 500 قطعة ذهبية',
                    xpReward: 150,
                    secret: false,
                    category: 'collection'
                },
                {
                    id: 'streak_7',
                    name: 'المخلص',
                    icon: '🔥',
                    description: 'حافظ على تتابع 7 أيام',
                    xpReward: 200,
                    secret: false,
                    category: 'dedication'
                },
                {
                    id: 'xp_1000',
                    name: 'أسطورة المعرفة',
                    icon: '⭐',
                    description: 'اجمع 1000 نقطة خبرة',
                    xpReward: 300,
                    secret: false,
                    category: 'progress'
                },
                
                // ===== إنجازات سرية =====
                {
                    id: 'secret_night',
                    name: 'قرصان الليل',
                    icon: '🦉',
                    description: 'العب بعد منتصف الليل',
                    xpReward: 150,
                    secret: true,
                    category: 'secret'
                },
                {
                    id: 'secret_click_100',
                    name: 'المستكشف الفضولي',
                    icon: '👆',
                    description: 'انقر 100 مرة على الجزر',
                    xpReward: 100,
                    secret: true,
                    category: 'secret'
                },
                {
                    id: 'secret_lose_battle',
                    name: 'تعلم من الهزيمة',
                    icon: '💪',
                    description: 'اخسر معركة ثم اربح التالية',
                    xpReward: 80,
                    secret: true,
                    category: 'secret'
                },
                {
                    id: 'secret_all_quests',
                    name: 'بطل المهام',
                    icon: '🏆',
                    description: 'أكمل جميع المهام المتاحة',
                    xpReward: 500,
                    secret: true,
                    category: 'secret'
                },
                {
                    id: 'secret_speed_demon',
                    name: 'شيطان السرعة',
                    icon: '⚡',
                    description: 'أجب على 5 أسئلة في أقل من 30 ثانية',
                    xpReward: 200,
                    secret: true,
                    category: 'secret'
                }
            ];
        }

        unlock(id) {
            if (this.unlocked.has(id)) return false;
            
            const achievement = this.achievements.find(a => a.id === id);
            if (!achievement) return false;
            
            this.unlocked.add(id);
            
            // مكافآت
            if (window.AncientMap) {
                window.AncientMap.addXP(achievement.xpReward);
                window.AncientMap.addGold(Math.floor(achievement.xpReward / 2));
                
                if (window.AncientMap.Audio) {
                    window.AncientMap.Audio.playSFX('levelup');
                }
            }
            
            // عرض الإنجاز
            this.showAchievementPopup(achievement);
            
            // حفظ
            this.save();
            
            return true;
        }

        showAchievementPopup(achievement) {
            const popup = document.createElement('div');
            popup.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                background: linear-gradient(135deg, #1a1a3e, #0f0f1a);
                border: 2px solid #fbbf24;
                border-radius: 20px;
                padding: 15px 25px;
                display: flex;
                align-items: center;
                gap: 15px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(251,191,36,0.3);
                animation: slideDown 0.5s ease, slideUp 0.5s ease 3s forwards;
                min-width: 300px;
            `;
            
            popup.innerHTML = `
                <div style="font-size: 3rem; animation: bounce 0.5s;">${achievement.icon}</div>
                <div>
                    <div style="color: #fbbf24; font-weight: 700; font-size: 1.1rem;">
                        ${achievement.secret ? '🔮 ' : ''}${achievement.name}
                    </div>
                    <div style="color: #94a3b8; font-size: 0.85rem;">${achievement.description}</div>
                    <div style="color: #fbbf24; font-size: 0.8rem; margin-top: 5px;">
                        ⭐ +${achievement.xpReward} XP | 🪙 +${Math.floor(achievement.xpReward / 2)} ذهب
                    </div>
                </div>
            `;
            
            document.body.appendChild(popup);
            
            // مؤثرات
            if (window.AncientMap && window.AncientMap.Particles) {
                const rect = popup.getBoundingClientRect();
                window.AncientMap.Particles.emit(
                    rect.left + rect.width / 2,
                    rect.top + rect.height / 2,
                    { count: 30, color: '#fbbf24' }
                );
            }
            
            setTimeout(() => popup.remove(), 3500);
        }

        checkSecretAchievements() {
            // قرصان الليل
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 5) {
                this.unlock('secret_night');
            }
        }

        save() {
            try {
                localStorage.setItem('ancient_achievements', JSON.stringify([...this.unlocked]));
                localStorage.setItem('ancient_secrets', JSON.stringify([...this.secretFound]));
            } catch(e) {}
        }

        load() {
            try {
                const saved = JSON.parse(localStorage.getItem('ancient_achievements') || '[]');
                saved.forEach(id => this.unlocked.add(id));
                
                const secrets = JSON.parse(localStorage.getItem('ancient_secrets') || '[]');
                secrets.forEach(id => this.secretFound.add(id));
            } catch(e) {}
        }

        getProgress() {
            const total = this.achievements.length;
            const unlocked = this.unlocked.size;
            const normalTotal = this.achievements.filter(a => !a.secret).length;
            const normalUnlocked = [...this.unlocked].filter(id => {
                const a = this.achievements.find(ach => ach.id === id);
                return a && !a.secret;
            }).length;
            
            return {
                total,
                unlocked,
                normalTotal,
                normalUnlocked,
                percent: Math.round((unlocked / total) * 100),
                normalPercent: Math.round((normalUnlocked / normalTotal) * 100)
            };
        }
    }

    // ==================== نظام المكافآت اليومية ====================
    class DailyRewardSystem {
        constructor() {
            this.rewards = this.generateRewards();
            this.lastClaim = null;
        }

        generateRewards() {
            return [
                // اليوم 1-7
                [
                    { type: 'gold', amount: 20, icon: '🪙', message: '20 قطعة ذهبية' },
                    { type: 'xp', amount: 30, icon: '⭐', message: '30 نقطة خبرة' },
                    { type: 'gold', amount: 35, icon: '💰', message: '35 قطعة ذهبية' },
                    { type: 'item', item: 'خريطة كنز صغيرة', icon: '🗺️', message: 'خريطة كنز صغيرة' },
                    { type: 'xp', amount: 50, icon: '🌟', message: '50 نقطة خبرة' },
                    { type: 'gold', amount: 50, icon: '💎', message: '50 قطعة ذهبية' },
                    { type: 'special', item: 'تاج المعرفة', icon: '👑', message: 'تاج المعرفة 🎉' }
                ],
                // اليوم 8-14
                [
                    { type: 'gold', amount: 25, icon: '🪙', message: '25 قطعة ذهبية' },
                    { type: 'xp', amount: 40, icon: '⭐', message: '40 نقطة خبرة' },
                    { type: 'gold', amount: 45, icon: '💰', message: '45 قطعة ذهبية' },
                    { type: 'item', item: 'جرعة خبرة', icon: '🧪', message: 'جرعة خبرة' },
                    { type: 'xp', amount: 60, icon: '🌟', message: '60 نقطة خبرة' },
                    { type: 'gold', amount: 65, icon: '💎', message: '65 قطعة ذهبية' },
                    { type: 'special', item: 'درع المعرفة', icon: '🛡️', message: 'درع المعرفة 🎉' }
                ],
                // اليوم 15-21
                [
                    { type: 'gold', amount: 30, icon: '🪙', message: '30 قطعة ذهبية' },
                    { type: 'xp', amount: 50, icon: '⭐', message: '50 نقطة خبرة' },
                    { type: 'gold', amount: 55, icon: '💰', message: '55 قطعة ذهبية' },
                    { type: 'item', item: 'مشرط الحكمة', icon: '🗡️', message: 'مشرط الحكمة' },
                    { type: 'xp', amount: 75, icon: '🌟', message: '75 نقطة خبرة' },
                    { type: 'gold', amount: 80, icon: '💎', message: '80 قطعة ذهبية' },
                    { type: 'special', item: 'جوهرة الأسطورة', icon: '💠', message: 'جوهرة الأسطورة 🎉' }
                ],
                // اليوم 22-28
                [
                    { type: 'gold', amount: 40, icon: '🪙', message: '40 قطعة ذهبية' },
                    { type: 'xp', amount: 60, icon: '⭐', message: '60 نقطة خبرة' },
                    { type: 'gold', amount: 70, icon: '💰', message: '70 قطعة ذهبية' },
                    { type: 'item', item: 'بوصلة ذهبية', icon: '🧭', message: 'بوصلة ذهبية' },
                    { type: 'xp', amount: 90, icon: '🌟', message: '90 نقطة خبرة' },
                    { type: 'gold', amount: 100, icon: '💎', message: '100 قطعة ذهبية' },
                    { type: 'legendary', item: 'تاج القرصان الأسطوري', icon: '👑', message: 'تاج القرصان الأسطوري! 🏆' }
                ]
            ];
        }

        claimReward(dayIndex) {
            const weekIndex = Math.floor(dayIndex / 7);
            const dayInWeek = dayIndex % 7;
            
            if (weekIndex >= this.rewards.length) {
                // دورة جديدة
                const cycle = weekIndex % this.rewards.length;
                const reward = this.rewards[cycle][dayInWeek];
                return this.giveReward(reward);
            }
            
            const reward = this.rewards[weekIndex][dayInWeek];
            return this.giveReward(reward);
        }

        giveReward(reward) {
            if (window.AncientMap) {
                switch(reward.type) {
                    case 'gold':
                        window.AncientMap.addGold(reward.amount);
                        break;
                    case 'xp':
                        window.AncientMap.addXP(reward.amount);
                        break;
                    case 'item':
                    case 'special':
                    case 'legendary':
                        if (window.AncientMap.adventurer) {
                            if (!window.AncientMap.adventurer.collectedArtifacts) {
                                window.AncientMap.adventurer.collectedArtifacts = [];
                            }
                            window.AncientMap.adventurer.collectedArtifacts.push(reward.item);
                        }
                        window.AncientMap.addXP(reward.amount || 100);
                        window.AncientMap.addGold(reward.amount || 50);
                        break;
                }
            }
            return reward;
        }

        showDailyReward() {
            const today = new Date().toISOString().split('T')[0];
            const lastClaim = localStorage.getItem('ancient_last_reward');
            
            if (lastClaim === today) {
                if (typeof showToast === 'function') {
                    showToast('🎁 لقد حصلت على مكافأتك اليومية! عد غداً.', 'info');
                }
                return;
            }
            
            const streak = parseInt(localStorage.getItem('ancient_reward_streak') || '0');
            const dayIndex = streak % 28; // 4 أسابيع دورة كاملة
            const reward = this.claimReward(dayIndex);
            
            // حفظ
            localStorage.setItem('ancient_last_reward', today);
            localStorage.setItem('ancient_reward_streak', streak + 1);
            
            // عرض
            const weekIndex = Math.floor(dayIndex / 7);
            const isSpecial = reward.type === 'special' || reward.type === 'legendary';
            
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <h2 style="color: #fbbf24;">🎁 المكافأة اليومية</h2>
                    <p style="color: #94a3b8;">اليوم ${dayIndex + 1} | 🔥 تتابع: ${streak + 1}</p>
                    
                    <div style="font-size: ${isSpecial ? '6rem' : '5rem'}; animation: bounce 0.5s; margin: 20px 0;">
                        ${reward.icon}
                    </div>
                    
                    <div style="
                        background: ${isSpecial ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'rgba(30, 41, 59, 0.9)'};
                        border-radius: 20px;
                        padding: 25px;
                        margin: 15px 0;
                        ${isSpecial ? 'color: #0f0f1a;' : 'color: white;'}
                        font-size: 1.3rem;
                        font-weight: 700;
                    ">
                        ${reward.message}
                    </div>
                    
                    <!-- عرض الأيام القادمة -->
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-top: 20px;">
                        ${this.rewards[weekIndex].map((r, i) => `
                            <div style="
                                background: ${i === dayIndex % 7 ? 'rgba(251, 191, 36, 0.3)' : 'rgba(30, 41, 59, 0.5)'};
                                border: 2px solid ${i === dayIndex % 7 ? '#fbbf24' : '#475569'};
                                border-radius: 10px;
                                padding: 8px;
                                text-align: center;
                                ${i < dayIndex % 7 ? 'opacity: 0.5;' : ''}
                            ">
                                <div style="font-size: 1.5rem;">${i < dayIndex % 7 ? '✅' : r.icon}</div>
                                <div style="font-size: 0.6rem; color: #94a3b8;">يوم ${weekIndex * 7 + i + 1}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <button class="modal-btn btn-primary" onclick="closeModal('dailyRewardModal')" style="margin-top: 15px;">
                        🎉 استلم المكافأة
                    </button>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('dailyRewardModal', html);
            }
            
            if (typeof spawnConfetti === 'function') {
                spawnConfetti();
            }
        }
    }

    // ==================== نظام طور الليل ====================
    class NightModeSystem {
        constructor() {
            this.active = false;
            this.autoMode = false;
            this.effects = [];
        }

        toggle() {
            this.active = !this.active;
            this.applyNightMode();
            return this.active;
        }

        applyNightMode() {
            const overlay = document.getElementById('nightModeOverlay');
            
            if (this.active) {
                if (!overlay) {
                    const div = document.createElement('div');
                    div.id = 'nightModeOverlay';
                    div.style.cssText = `
                        position: fixed;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        pointer-events: none;
                        z-index: 9998;
                        background: radial-gradient(ellipse at center, rgba(10, 10, 40, 0.3) 0%, rgba(5, 5, 20, 0.6) 100%);
                    `;
                    document.body.appendChild(div);
                }
                
                // إضافة نجوم
                this.addStars();
                
                // تأثيرات إضافية
                document.body.style.filter = 'brightness(0.9) saturate(0.8)';
                
            } else {
                if (overlay) overlay.remove();
                this.removeStars();
                document.body.style.filter = '';
            }
        }

        addStars() {
            for (let i = 0; i < 50; i++) {
                const star = document.createElement('div');
                star.className = 'night-star';
                star.style.cssText = `
                    position: fixed;
                    top: ${Math.random() * 100}%;
                    left: ${Math.random() * 100}%;
                    width: ${1 + Math.random() * 3}px;
                    height: ${1 + Math.random() * 3}px;
                    background: white;
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 9999;
                    animation: starTwinkle ${1 + Math.random() * 3}s ease-in-out infinite;
                    animation-delay: ${Math.random() * 2}s;
                `;
                document.body.appendChild(star);
                this.effects.push(star);
            }
        }

        removeStars() {
            this.effects.forEach(el => el.remove());
            this.effects = [];
        }

        checkAutoMode() {
            const hour = new Date().getHours();
            if ((hour >= 19 || hour < 6) && !this.active) {
                this.active = true;
                this.applyNightMode();
            } else if (hour >= 6 && hour < 19 && this.active) {
                this.active = false;
                this.applyNightMode();
            }
        }
    }

    // ==================== نظام الأسرار المخفية ====================
    class SecretSystem {
        constructor() {
            this.secrets = this.getSecretList();
            this.found = new Set();
            this.clickCount = 0;
        }

        getSecretList() {
            return [
                {
                    id: 'secret_island_click',
                    name: 'الجزيرة المخفية',
                    icon: '🏝️',
                    hint: 'انقر 50 مرة على أي جزيرة...',
                    trigger: () => this.clickCount >= 50,
                    reward: { xp: 200, gold: 100, item: 'خريطة الجزيرة المخفية' }
                },
                {
                    id: 'secret_perfect_week',
                    name: 'الأسبوع المثالي',
                    icon: '📅',
                    hint: 'أكمل جميع التحديات اليومية لمدة 7 أيام متتالية...',
                    trigger: () => {
                        const streak = parseInt(localStorage.getItem('ancient_reward_streak') || '0');
                        return streak >= 7;
                    },
                    reward: { xp: 500, gold: 250, item: 'تاج الأسبوع المثالي' }
                },
                {
                    id: 'secret_triple_combo',
                    name: 'الكومبو الثلاثي',
                    icon: '🔥',
                    hint: 'حقق كومبو ×10 في معركة...',
                    trigger: () => false, // يتم التحقق من نظام المعركة
                    reward: { xp: 300, gold: 150, title: '🔥 سيد الكومبو' }
                }
            ];
        }

        trackClick() {
            this.clickCount++;
            this.checkSecrets();
        }

        checkSecrets() {
            this.secrets.forEach(secret => {
                if (!this.found.has(secret.id) && secret.trigger()) {
                    this.discoverSecret(secret);
                }
            });
        }

        discoverSecret(secret) {
            this.found.add(secret.id);
            
            // مكافآت
            if (window.AncientMap) {
                window.AncientMap.addXP(secret.reward.xp);
                window.AncientMap.addGold(secret.reward.gold);
                
                if (secret.reward.title) {
                    window.AncientMap.adventurer.title = secret.reward.title;
                }
            }
            
            // عرض السر
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <h2 style="color: #8b5cf6;">🔮 تم اكتشاف سر!</h2>
                    <div style="font-size: 5rem; animation: bounce 0.5s;">${secret.icon}</div>
                    <h3 style="color: #fbbf24;">${secret.name}</h3>
                    <p style="color: #94a3b8;">${secret.hint}</p>
                    <div style="color: #fbbf24; margin: 10px 0;">
                        ⭐ +${secret.reward.xp} XP | 🪙 +${secret.reward.gold} ذهب
                    </div>
                    <button class="modal-btn btn-primary" onclick="closeModal('secretModal')">🎉 رائع!</button>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('secretModal', html);
            }
            
            if (typeof spawnConfetti === 'function') {
                spawnConfetti();
            }
        }
    }

    // ==================== التهيئة والتصدير ====================
    window.AncientAchievements = new AchievementSystem();
    window.AncientDaily = new DailyRewardSystem();
    window.AncientNight = new NightModeSystem();
    window.AncientSecrets = new SecretSystem();

    // ==================== أنماط CSS ====================
    function addRewardStyles() {
        if (document.getElementById('rewardStylesV3')) return;
        
        const style = document.createElement('style');
        style.id = 'rewardStylesV3';
        style.textContent = `
            @keyframes slideDown {
                0% { transform: translateX(-50%) translateY(-100px); opacity: 0; }
                100% { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            @keyframes slideUp {
                0% { transform: translateX(-50%) translateY(0); opacity: 1; }
                100% { transform: translateX(-50%) translateY(-100px); opacity: 0; }
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-20px); }
            }
            @keyframes starTwinkle {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.5); }
            }
            @keyframes confettiFall {
                0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
        `;
        
        document.head.appendChild(style);
    }

    // ==================== التهيئة ====================
    function init() {
        addRewardStyles();
        AncientAchievements.load();
        AncientAchievements.checkSecretAchievements();
        AncientNight.checkAutoMode();
        
        // مؤقت للتحقق من طور الليل كل دقيقة
        setInterval(() => AncientNight.checkAutoMode(), 60000);
        
        console.log('🎁 نظام المكافآت والإنجازات جاهز!');
        console.log('🔮 أسرار مخفية:', AncientSecrets.secrets.length);
        console.log('🌙 طور الليل:', AncientNight.active ? 'نشط' : 'غير نشط');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
