// ╔══════════════════════════════════════════════════════════════════╗
// ║  ⚔️  نظام المعارك التفاعلية - Battle Engine v3.0           ║
// ║  معارك حية - هجمات - دفاع - قدرات خاصة - زعماء             ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== نظام المعركة ====================
    class BattleEngine {
        constructor() {
            this.active = false;
            this.player = null;
            this.monster = null;
            this.questions = [];
            this.currentQuestion = 0;
            this.playerHP = 100;
            this.monsterHP = 100;
            this.playerMaxHP = 100;
            this.monsterMaxHP = 100;
            this.score = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.totalQuestions = 0;
            this.correctAnswers = 0;
            this.battleLog = [];
            this.specialMoves = [];
            this.statusEffects = { player: [], monster: [] };
            this.battleContainer = null;
            this.timerInterval = null;
            this.questionTimer = 15;
            this.timeLeft = 15;
            this.bonusMultiplier = 1;
            this.criticalChance = 0.1;
            this.onBattleEnd = null;
        }

        // ==================== بدء المعركة ====================
        startBattle(config) {
            this.reset();
            
            this.monster = config.monster || this.getRandomMonster();
            this.questions = config.questions || [];
            this.totalQuestions = this.questions.length;
            this.playerHP = config.playerHP || 100;
            this.playerMaxHP = this.playerHP;
            this.monsterHP = config.monsterHP || this.monster.hp;
            this.monsterMaxHP = this.monsterHP;
            this.onBattleEnd = config.onEnd || null;
            this.questionTimer = config.timer || 15;
            
            if (this.questions.length === 0) {
                console.error('❌ لا توجد أسئلة للمعركة');
                return false;
            }
            
            this.active = true;
            this.renderBattle();
            this.addBattleLog(`⚔️ بدأت المعركة ضد ${this.monster.emoji} ${this.monster.name}!`);
            
            if (window.AncientMap && window.AncientMap.Audio) {
                window.AncientMap.Audio.playSFX('battle');
                window.AncientMap.Audio.playMusic('battle');
            }
            
            return true;
        }

        reset() {
            this.active = false;
            this.playerHP = 100;
            this.monsterHP = 100;
            this.playerMaxHP = 100;
            this.monsterMaxHP = 100;
            this.score = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.currentQuestion = 0;
            this.correctAnswers = 0;
            this.battleLog = [];
            this.statusEffects = { player: [], monster: [] };
            this.bonusMultiplier = 1;
            if (this.timerInterval) clearInterval(this.timerInterval);
        }

        // ==================== عرض المعركة ====================
        renderBattle() {
            const html = `
                <div id="battleArena" style="
                    background: linear-gradient(180deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%);
                    border-radius: 20px;
                    padding: 20px;
                    position: relative;
                    overflow: hidden;
                    min-height: 500px;
                ">
                    <!-- خلفية المعركة -->
                    <div id="battleBackground" style="
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        pointer-events: none;
                        z-index: 0;
                    "></div>
                    
                    <!-- منطقة الوحش -->
                    <div style="text-align: center; position: relative; z-index: 2;">
                        <div id="monsterSprite" style="
                            font-size: 6rem;
                            animation: monsterIdle 2s infinite;
                            display: inline-block;
                            transition: all 0.3s;
                        ">${this.monster.emoji}</div>
                        
                        <!-- شريط HP الوحش -->
                        <div style="margin: 10px auto; max-width: 300px;">
                            <div style="display: flex; justify-content: space-between; color: #ef4444; font-weight: 700;">
                                <span>${this.monster.emoji} ${this.monster.name}</span>
                                <span id="monsterHPText">${this.monsterHP}/${this.monsterMaxHP}</span>
                            </div>
                            <div style="background: #334155; height: 20px; border-radius: 10px; overflow: hidden; border: 2px solid #ef4444;">
                                <div id="monsterHPBar" style="
                                    background: linear-gradient(90deg, #dc2626, #ef4444);
                                    height: 100%;
                                    width: 100%;
                                    transition: width 0.5s ease;
                                "></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- VS -->
                    <div style="text-align: center; font-size: 2rem; color: #fbbf24; margin: 10px 0; z-index: 2; position: relative;">
                        ⚡ VS ⚡
                    </div>
                    
                    <!-- منطقة اللاعب -->
                    <div style="text-align: center; position: relative; z-index: 2;">
                        <div id="playerSprite" style="
                            font-size: 5rem;
                            animation: playerReady 1.5s infinite;
                            display: inline-block;
                            transition: all 0.3s;
                        ">🧑‍⚕️</div>
                        
                        <!-- شريط HP اللاعب -->
                        <div style="margin: 10px auto; max-width: 300px;">
                            <div style="display: flex; justify-content: space-between; color: #10b981; font-weight: 700;">
                                <span>🧑‍⚕️ أنت</span>
                                <span id="playerHPText">${this.playerHP}/${this.playerMaxHP}</span>
                            </div>
                            <div style="background: #334155; height: 20px; border-radius: 10px; overflow: hidden; border: 2px solid #10b981;">
                                <div id="playerHPBar" style="
                                    background: linear-gradient(90deg, #059669, #10b981);
                                    height: 100%;
                                    width: 100%;
                                    transition: width 0.5s ease;
                                "></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- منطقة السؤال -->
                    <div id="questionArea" style="
                        background: rgba(30, 41, 59, 0.9);
                        border-radius: 15px;
                        padding: 15px;
                        margin-top: 15px;
                        position: relative;
                        z-index: 2;
                        border: 2px solid #fbbf24;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #fbbf24; font-weight: 700;">
                                📝 سؤال ${this.currentQuestion + 1}/${this.totalQuestions}
                            </span>
                            <span style="color: #ef4444; font-weight: 700;">
                                ⏱️ <span id="questionTimer">${this.questionTimer}</span>s
                            </span>
                            <span style="color: #fbbf24;">
                                🔥 كومبو: <span id="comboCounter">x${this.combo}</span>
                            </span>
                        </div>
                        <div id="questionText" style="color: white; font-size: 1.1rem; margin: 10px 0; font-weight: 600;">
                            ${this.questions[0]?.text || '...'}
                        </div>
                        <div id="optionsContainer" style="display: grid; gap: 8px;">
                            <!-- الخيارات تتضاف هنا -->
                        </div>
                    </div>
                    
                    <!-- سجل المعركة -->
                    <div id="battleLog" style="
                        max-height: 100px;
                        overflow-y: auto;
                        margin-top: 10px;
                        color: #94a3b8;
                        font-size: 0.8rem;
                        position: relative;
                        z-index: 2;
                    "></div>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('battleModal', html);
            }
            
            // إضافة الخيارات بعد فتح المودال
            setTimeout(() => {
                this.renderOptions();
                this.startTimer();
                this.renderBattleLog();
                this.animateBattleStart();
            }, 200);
        }

        // ==================== عرض الخيارات ====================
        renderOptions() {
            const container = document.getElementById('optionsContainer');
            if (!container) return;
            
            const question = this.questions[this.currentQuestion];
            if (!question) return;
            
            container.innerHTML = '';
            
            if (question.cat === 'mcq' && question.options) {
                question.options.forEach((opt, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'battle-option';
                    btn.innerHTML = `${String.fromCharCode(65 + idx)}) ${opt}`;
                    btn.style.cssText = `
                        width: 100%;
                        padding: 12px;
                        border: 2px solid #475569;
                        border-radius: 10px;
                        background: rgba(30, 41, 59, 0.8);
                        color: white;
                        cursor: pointer;
                        font-size: 0.95rem;
                        transition: all 0.3s;
                        text-align: right;
                        font-family: 'Tajawal', sans-serif;
                    `;
                    btn.onmouseenter = () => {
                        btn.style.borderColor = '#fbbf24';
                        btn.style.background = 'rgba(251, 191, 36, 0.1)';
                    };
                    btn.onmouseleave = () => {
                        btn.style.borderColor = '#475569';
                        btn.style.background = 'rgba(30, 41, 59, 0.8)';
                    };
                    btn.onclick = () => this.submitAnswer(opt, question.correct, btn);
                    container.appendChild(btn);
                });
            } else if (question.cat === 'truefalse') {
                ['صواب ✅', 'خطأ ❌'].forEach((opt, idx) => {
                    const btn = document.createElement('button');
                    btn.className = 'battle-option';
                    btn.innerHTML = opt;
                    btn.style.cssText = `
                        width: 100%;
                        padding: 12px;
                        border: 2px solid #475569;
                        border-radius: 10px;
                        background: ${idx === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
                        color: white;
                        cursor: pointer;
                        font-size: 0.95rem;
                        transition: all 0.3s;
                        text-align: center;
                        font-family: 'Tajawal', sans-serif;
                    `;
                    btn.onclick = () => this.submitAnswer(
                        idx === 0 ? 'true' : 'false',
                        question.correct,
                        btn
                    );
                    container.appendChild(btn);
                });
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = '✍️ اكتب إجابتك هنا...';
                input.style.cssText = `
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #475569;
                    border-radius: 10px;
                    background: rgba(30, 41, 59, 0.8);
                    color: white;
                    font-size: 0.95rem;
                    font-family: 'Tajawal', sans-serif;
                `;
                
                const submitBtn = document.createElement('button');
                submitBtn.innerHTML = '⚔️ هجوم!';
                submitBtn.style.cssText = `
                    width: 100%;
                    padding: 12px;
                    margin-top: 8px;
                    border: none;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                    cursor: pointer;
                    font-size: 1rem;
                    font-weight: 700;
                    font-family: 'Tajawal', sans-serif;
                `;
                submitBtn.onclick = () => this.submitAnswer(
                    input.value,
                    question.completion || question.answer,
                    null
                );
                
                container.appendChild(input);
                container.appendChild(submitBtn);
            }
        }

        // ==================== تقديم الإجابة ====================
        submitAnswer(chosen, correct, btn) {
            if (!this.active) return;
            
            clearInterval(this.timerInterval);
            
            // تعطيل كل الأزرار
            const allBtns = document.querySelectorAll('#optionsContainer button, #optionsContainer input');
            allBtns.forEach(b => b.disabled = true);
            
            const isCorrect = this.checkAnswer(chosen, correct);
            const question = this.questions[this.currentQuestion];
            
            if (isCorrect) {
                this.correctAnswer(btn, question);
            } else {
                this.wrongAnswer(btn, correct, question);
            }
            
            // الانتظار ثم السؤال التالي
            setTimeout(() => {
                this.nextQuestion();
            }, 1500);
        }

        checkAnswer(chosen, correct) {
            if (!chosen || !correct) return false;
            
            const c = String(chosen).trim().toLowerCase();
            const a = String(correct).trim().toLowerCase();
            
            if (c === a) return true;
            if (c.startsWith(a + ')') || c.startsWith(a + ' ')) return true;
            if (a.startsWith(c + ')') || a.startsWith(c + ' ')) return true;
            
            // تحقق مرن للتعريفات
            const cWords = c.split(/\s+/).filter(w => w.length > 2);
            const aWords = a.split(/\s+/).filter(w => w.length > 2);
            if (cWords.length > 0 && aWords.length > 0) {
                const matches = cWords.filter(w => aWords.includes(w)).length;
                return (matches / aWords.length) >= 0.6;
            }
            
            return false;
        }

        correctAnswer(btn, question) {
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.correctAnswers++;
            
            // حساب الضرر
            let damage = 10 + (this.combo * 2);
            
            // ضرر حرج
            if (Math.random() < this.criticalChance) {
                damage *= 2;
                this.addBattleLog('💥 ضربة حرجة!');
                this.animateCritical();
            }
            
            // مضاعف
            damage = Math.floor(damage * this.bonusMultiplier);
            
            this.monsterHP = Math.max(0, this.monsterHP - damage);
            this.score += damage * 10;
            
            // تأثير بصري
            if (btn) {
                btn.style.borderColor = '#10b981';
                btn.style.background = 'rgba(16, 185, 129, 0.3)';
                btn.innerHTML = '✅ ' + btn.innerHTML;
            }
            
            this.addBattleLog(`⚔️ إصابة! -${damage} HP | كومبو x${this.combo}`);
            this.animateMonsterHit();
            
            if (window.AncientMap && window.AncientMap.Audio) {
                window.AncientMap.Audio.playSFX('success');
            }
            
            this.updateHPBars();
            
            // إضافة XP
            if (window.AncientMap) {
                window.AncientMap.addXP(5 + this.combo);
            }
        }

        wrongAnswer(btn, correct, question) {
            this.combo = 0;
            
            // ضرر على اللاعب
            const damage = this.monster.damage || 10;
            this.playerHP = Math.max(0, this.playerHP - damage);
            
            // تأثير بصري
            if (btn) {
                btn.style.borderColor = '#ef4444';
                btn.style.background = 'rgba(239, 68, 68, 0.3)';
                btn.innerHTML = '❌ ' + btn.innerHTML;
            }
            
            // إظهار الإجابة الصحيحة
            const correctDisplay = document.createElement('div');
            correctDisplay.style.cssText = `
                color: #10b981;
                margin-top: 8px;
                padding: 8px;
                background: rgba(16, 185, 129, 0.1);
                border-radius: 8px;
            `;
            correctDisplay.innerHTML = `✅ الإجابة الصحيحة: <strong>${correct}</strong>`;
            document.getElementById('optionsContainer')?.appendChild(correctDisplay);
            
            this.addBattleLog(`💔 تلقيت ${damage} ضرر! الإجابة: ${correct}`);
            this.animatePlayerHit();
            
            if (window.AncientMap && window.AncientMap.Audio) {
                window.AncientMap.Audio.playSFX('fail');
            }
            
            this.updateHPBars();
            
            // إضافة للسجلات الخاطئة
            if (typeof addWrongQuestion === 'function' && question) {
                addWrongQuestion(question);
            }
        }

        // ==================== السؤال التالي ====================
        nextQuestion() {
            this.currentQuestion++;
            
            // التحقق من نهاية المعركة
            if (this.playerHP <= 0) {
                this.endBattle(false, 'لقد هُزمت! 💀');
                return;
            }
            
            if (this.monsterHP <= 0) {
                this.endBattle(true, 'لقد انتصرت! 🎉');
                return;
            }
            
            if (this.currentQuestion >= this.totalQuestions) {
                const won = this.correctAnswers >= this.totalQuestions * 0.6;
                this.endBattle(won, won ? 'نجوت من المعركة!' : 'انتهت الأسئلة!');
                return;
            }
            
            // تحديث السؤال
            const question = this.questions[this.currentQuestion];
            document.getElementById('questionText').innerHTML = question.text;
            document.getElementById('questionTimer').textContent = this.questionTimer;
            document.getElementById('comboCounter').textContent = `x${this.combo}`;
            
            this.renderOptions();
            this.startTimer();
        }

        // ==================== المؤقت ====================
        startTimer() {
            clearInterval(this.timerInterval);
            this.timeLeft = this.questionTimer;
            
            this.timerInterval = setInterval(() => {
                this.timeLeft--;
                const timerEl = document.getElementById('questionTimer');
                if (timerEl) {
                    timerEl.textContent = this.timeLeft;
                    timerEl.style.color = this.timeLeft <= 5 ? '#ef4444' : '#fbbf24';
                }
                
                if (this.timeLeft <= 0) {
                    clearInterval(this.timerInterval);
                    this.timeUp();
                }
            }, 1000);
        }

        timeUp() {
            this.combo = 0;
            this.playerHP = Math.max(0, this.playerHP - 5);
            this.addBattleLog('⏰ انتهى الوقت! -5 HP');
            this.updateHPBars();
            
            if (this.playerHP <= 0) {
                this.endBattle(false, 'انتهى الوقت وهُزمت! ⏰');
            } else {
                setTimeout(() => this.nextQuestion(), 1000);
            }
        }

        // ==================== نهاية المعركة ====================
        endBattle(won, message) {
            this.active = false;
            clearInterval(this.timerInterval);
            
            if (window.AncientMap && window.AncientMap.Audio) {
                window.AncientMap.Audio.stopMusic();
                window.AncientMap.Audio.playSFX(won ? 'treasure' : 'fail');
            }
            
            const accuracy = Math.round((this.correctAnswers / this.totalQuestions) * 100);
            const bonus = won ? Math.floor(this.score * 0.5) : 0;
            const totalScore = this.score + bonus;
            
            const resultHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: ${won ? '5rem' : '4rem'}; animation: ${won ? 'bounce' : 'shake'} 0.5s;">
                        ${won ? '🏆' : '💀'}
                    </div>
                    <h2 style="color: ${won ? '#fbbf24' : '#ef4444'}; margin: 10px 0;">
                        ${message}
                    </h2>
                    
                    <div style="background: rgba(30, 41, 59, 0.9); border-radius: 15px; padding: 15px; margin: 15px 0;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <div style="color: #94a3b8; font-size: 0.8rem;">✅ إجابات صحيحة</div>
                                <div style="color: #10b981; font-size: 1.5rem; font-weight: 700;">${this.correctAnswers}/${this.totalQuestions}</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8; font-size: 0.8rem;">🎯 الدقة</div>
                                <div style="color: #fbbf24; font-size: 1.5rem; font-weight: 700;">${accuracy}%</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8; font-size: 0.8rem;">🔥 أعلى كومبو</div>
                                <div style="color: #ef4444; font-size: 1.5rem; font-weight: 700;">x${this.maxCombo}</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8; font-size: 0.8rem;">⭐ النتيجة</div>
                                <div style="color: #fbbf24; font-size: 1.5rem; font-weight: 700;">${totalScore}</div>
                            </div>
                        </div>
                    </div>
                    
                    ${won ? `
                        <div style="color: #fbbf24; margin: 10px 0;">
                            🪙 +${bonus} ذهب إضافي | ⭐ +${totalScore} XP
                        </div>
                    ` : ''}
                    
                    <div id="battleLog" style="
                        max-height: 150px;
                        overflow-y: auto;
                        text-align: right;
                        color: #94a3b8;
                        font-size: 0.8rem;
                        margin: 10px 0;
                        padding: 10px;
                        background: rgba(0,0,0,0.3);
                        border-radius: 10px;
                    ">${this.battleLog.join('<br>')}</div>
                    
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                        ${!won ? '<button class="modal-btn btn-danger" onclick="AncientBattle.retry()">🔄 إعادة المحاولة</button>' : ''}
                        <button class="modal-btn btn-primary" onclick="AncientBattle.claimRewards()">🎁 المكافآت</button>
                        <button class="modal-btn btn-close" onclick="closeModal(\'battleModal\')">إغلاق</button>
                    </div>
                </div>
            `;
            
            document.querySelector('#battleModal .modal-content').innerHTML = resultHTML;
            
            // مؤثرات بصرية
            if (won && typeof spawnConfetti === 'function') {
                spawnConfetti();
            }
            
            // إضافة XP وذهب
            if (window.AncientMap) {
                window.AncientMap.addXP(totalScore);
                window.AncientMap.addGold(bonus);
            }
            
            // حفظ النتيجة
            if (typeof saveQuizHistory === 'function') {
                saveQuizHistory(this.totalQuestions, this.correctAnswers, accuracy);
            }
            
            // استدعاء callback
            if (this.onBattleEnd) {
                this.onBattleEnd({
                    won,
                    score: totalScore,
                    accuracy,
                    correct: this.correctAnswers,
                    total: this.totalQuestions,
                    combo: this.maxCombo
                });
            }
        }

        retry() {
            this.reset();
            this.startBattle({
                monster: this.monster,
                questions: this.questions,
                timer: this.questionTimer
            });
        }

        claimRewards() {
            if (window.AncientMap) {
                window.AncientMap.openMap();
            }
            closeModal('battleModal');
        }

        // ==================== تحديث شريط HP ====================
        updateHPBars() {
            const monsterBar = document.getElementById('monsterHPBar');
            const monsterText = document.getElementById('monsterHPText');
            const playerBar = document.getElementById('playerHPBar');
            const playerText = document.getElementById('playerHPText');
            
            if (monsterBar) {
                const monsterPercent = Math.max(0, (this.monsterHP / this.monsterMaxHP) * 100);
                monsterBar.style.width = monsterPercent + '%';
                monsterBar.style.background = monsterPercent < 30 ? 
                    'linear-gradient(90deg, #991b1b, #dc2626)' : 
                    'linear-gradient(90deg, #dc2626, #ef4444)';
            }
            if (monsterText) monsterText.textContent = `${Math.max(0, this.monsterHP)}/${this.monsterMaxHP}`;
            
            if (playerBar) {
                const playerPercent = Math.max(0, (this.playerHP / this.playerMaxHP) * 100);
                playerBar.style.width = playerPercent + '%';
                playerBar.style.background = playerPercent < 30 ? 
                    'linear-gradient(90deg, #064e3b, #059669)' : 
                    'linear-gradient(90deg, #059669, #10b981)';
            }
            if (playerText) playerText.textContent = `${Math.max(0, this.playerHP)}/${this.playerMaxHP}`;
        }

        // ==================== سجل المعركة ====================
        addBattleLog(message) {
            this.battleLog.unshift(message);
            if (this.battleLog.length > 50) this.battleLog.pop();
            this.renderBattleLog();
        }

        renderBattleLog() {
            const logEl = document.getElementById('battleLog');
            if (logEl) {
                logEl.innerHTML = this.battleLog.slice(0, 5).map(msg => 
                    `<div style="padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${msg}</div>`
                ).join('');
            }
        }

        // ==================== حركات المعركة ====================
        animateBattleStart() {
            const monster = document.getElementById('monsterSprite');
            const player = document.getElementById('playerSprite');
            
            if (monster) {
                monster.style.animation = 'none';
                monster.offsetHeight;
                monster.style.animation = 'monsterRoar 0.5s ease';
            }
            if (player) {
                player.style.animation = 'none';
                player.offsetHeight;
                player.style.animation = 'playerReady 1.5s infinite';
            }
        }

        animateMonsterHit() {
            const monster = document.getElementById('monsterSprite');
            if (monster) {
                monster.style.animation = 'none';
                monster.offsetHeight;
                monster.style.animation = 'monsterHit 0.3s ease';
                setTimeout(() => {
                    monster.style.animation = 'monsterIdle 2s infinite';
                }, 300);
            }
        }

        animatePlayerHit() {
            const player = document.getElementById('playerSprite');
            const battleArena = document.getElementById('battleArena');
            
            if (player) {
                player.style.animation = 'none';
                player.offsetHeight;
                player.style.animation = 'playerHit 0.4s ease';
                setTimeout(() => {
                    player.style.animation = 'playerReady 1.5s infinite';
                }, 400);
            }
            
            // شاشة حمراء
            if (battleArena) {
                const flash = document.createElement('div');
                flash.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(239, 68, 68, 0.2);
                    pointer-events: none;
                    z-index: 5;
                    animation: damageFlash 0.4s ease-out forwards;
                `;
                battleArena.appendChild(flash);
                setTimeout(() => flash.remove(), 400);
            }
        }

        animateCritical() {
            const battleArena = document.getElementById('battleArena');
            if (battleArena) {
                const flash = document.createElement('div');
                flash.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(251, 191, 36, 0.3);
                    pointer-events: none;
                    z-index: 5;
                    animation: criticalFlash 0.5s ease-out forwards;
                `;
                battleArena.appendChild(flash);
                setTimeout(() => flash.remove(), 500);
            }
        }

        // ==================== وحوش عشوائية ====================
        getRandomMonster() {
            const monsters = [
                { name: 'شبح الرحمة', emoji: '👻', hp: 80, damage: 8 },
                { name: 'وحش التعقيم', emoji: '🧟', hp: 90, damage: 10 },
                { name: 'تنين الأزيز', emoji: '🐉', hp: 120, damage: 15 },
                { name: 'غول الضغط', emoji: '👹', hp: 100, damage: 12 },
                { name: 'أفعى الزائدة', emoji: '🐍', hp: 85, damage: 9 },
                { name: 'ملك السكتة', emoji: '🧟‍♂️', hp: 150, damage: 18 },
                { name: 'شيطان السكر', emoji: '🍬', hp: 95, damage: 11 },
                { name: 'تنين اللهب', emoji: '🔥', hp: 130, damage: 16 }
            ];
            return monsters[Math.floor(Math.random() * monsters.length)];
        }
    }

    // ==================== التصدير ====================
    window.AncientBattle = new BattleEngine();

    // ==================== أنماط CSS للمعركة ====================
    function addBattleStyles() {
        if (document.getElementById('battleStylesV3')) return;
        
        const style = document.createElement('style');
        style.id = 'battleStylesV3';
        style.textContent = `
            @keyframes monsterIdle {
                0%, 100% { transform: translateY(0) scale(1); }
                50% { transform: translateY(-10px) scale(1.05); }
            }
            @keyframes monsterRoar {
                0% { transform: scale(1); }
                50% { transform: scale(1.3); }
                100% { transform: scale(1); }
            }
            @keyframes monsterHit {
                0% { transform: translateX(0); }
                25% { transform: translateX(-20px); }
                50% { transform: translateX(20px); }
                100% { transform: translateX(0); }
            }
            @keyframes playerReady {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes playerHit {
                0% { transform: translateX(0); }
                25% { transform: translateX(15px); }
                50% { transform: translateX(-15px); }
                100% { transform: translateX(0); }
            }
            @keyframes damageFlash {
                0% { opacity: 1; }
                100% { opacity: 0; }
            }
            @keyframes criticalFlash {
                0% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.05); }
                100% { opacity: 0; transform: scale(1); }
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-30px); }
            }
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-10px); }
                75% { transform: translateX(10px); }
            }
            
            .battle-option:hover {
                transform: translateX(-5px);
            }
            .battle-option:active {
                transform: scale(0.98);
            }
            .battle-option:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none !important;
            }
        `;
        
        document.head.appendChild(style);
    }

    // ==================== دوال عامة ====================
    window.startBattle = function(config) {
        return window.AncientBattle.startBattle(config);
    };

    window.checkBattleAnswer = function(btn, chosen, correct, i, total) {
        window.AncientBattle.submitAnswer(chosen, correct, btn);
    };

    // ==================== التهيئة ====================
    function init() {
        addBattleStyles();
        console.log('⚔️ نظام المعارك جاهز!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
