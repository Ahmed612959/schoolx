// ╔══════════════════════════════════════════════════════════════════╗
// ║  🎯  نظام المهام والمغامرات - Quest Engine v3.0            ║
// ║  مهام تفاعلية - ألغاز - جمع - إنقاذ - استكشاف            ║
// ╚══════════════════════════════════════════════════════════════════╝

(function() {
    'use strict';

    // ==================== نظام المهام ====================
    class QuestEngine {
        constructor() {
            this.activeQuests = new Map();
            this.completedQuests = new Set();
            this.questProgress = {};
            this.listeners = new Map();
        }

        // ==================== أنواع المهام ====================
        getQuestTypes() {
            return {
                dialogue: {
                    name: 'حوار',
                    icon: '💬',
                    color: '#3b82f6',
                    description: 'تحدث مع الشخصيات واكتشف القصة'
                },
                explore: {
                    name: 'استكشاف',
                    icon: '🔍',
                    color: '#10b981',
                    description: 'اكتشف أماكن جديدة في الجزيرة'
                },
                collect: {
                    name: 'جمع',
                    icon: '🎒',
                    color: '#f59e0b',
                    description: 'اجمع العناصر المطلوبة'
                },
                medical: {
                    name: 'طبي',
                    icon: '🏥',
                    color: '#ef4444',
                    description: 'قدم الرعاية الطبية للمرضى'
                },
                puzzle: {
                    name: 'لغز',
                    icon: '🧩',
                    color: '#8b5cf6',
                    description: 'حل الألغاز والأحاجي'
                },
                rescue: {
                    name: 'إنقاذ',
                    icon: '🆘',
                    color: '#ec4899',
                    description: 'أنقذ الشخصيات في خطر'
                },
                race: {
                    name: 'سباق',
                    icon: '🏃',
                    color: '#06b6d4',
                    description: 'تنافس مع الزمن لإكمال المهمة'
                },
                crafting: {
                    name: 'صناعة',
                    icon: '🔨',
                    color: '#84cc16',
                    description: 'اصنع أدوات وعلاجات'
                }
            };
        }

        // ==================== قائمة المهام الكاملة ====================
        getQuestLibrary() {
            return {
                // ===== ميناء البداية =====
                'meet_wise_man': {
                    id: 'meet_wise_man',
                    name: 'لقاء العجوز الحكيم',
                    icon: '🧙‍♂️',
                    type: 'dialogue',
                    islandId: 'port_royal',
                    difficulty: 'easy',
                    description: 'تحدث مع العجوز الحكيم عند الرصيف واستمع إلى قصته عن بحر المعرفة',
                    xpReward: 50,
                    goldReward: 25,
                    itemReward: 'خريطة قديمة',
                    steps: [
                        {
                            text: 'اذهب إلى الرصيف الشرقي',
                            character: 'old_wise_man',
                            dialogue: 'أهلاً بك أيها الشاب... لقد كنت أنتظرك. اقترب لأريك شيئاً مهماً.',
                            action: 'move_to',
                            target: 'east_dock'
                        },
                        {
                            text: 'تحدث مع العجوز الحكيم',
                            character: 'old_wise_man',
                            dialogue: 'هذه الخريطة... خريطة بحر المعرفة. كل جزيرة تخفي سراً، وكل سر يحتاج إلى مفتاح: المعرفة!',
                            action: 'dialogue',
                            requiredAnswers: 0
                        },
                        {
                            text: 'اقبل الخريطة القديمة',
                            character: 'old_wise_man',
                            dialogue: 'خذها... أنت تستحقها أكثر مني. لكن احذر! الجزر لا تبوح بأسرارها إلا لمن يثبت جدارته.',
                            action: 'receive_item',
                            item: 'ancient_map'
                        }
                    ],
                    unlockCondition: null
                },

                'explore_port': {
                    id: 'explore_port',
                    name: 'استكشاف الميناء',
                    icon: '🔍',
                    type: 'explore',
                    islandId: 'port_royal',
                    difficulty: 'easy',
                    description: 'اكتشف 4 أماكن مهمة في ميناء البداية',
                    xpReward: 60,
                    goldReward: 30,
                    locations: [
                        { id: 'lighthouse', name: 'المنارة', icon: '🏮', hint: 'أعلى نقطة في الميناء...', found: false },
                        { id: 'fish_market', name: 'سوق السمك', icon: '🐟', hint: 'رائحة البحر قوية هنا...', found: false },
                        { id: 'tavern', name: 'حانة البحارة', icon: '🍺', hint: 'تسمع ضحكات وأغاني...', found: false },
                        { id: 'shipyard', name: 'ورشة السفن', icon: '🔧', hint: 'صوت طرق المعادن...', found: false }
                    ],
                    unlockCondition: 'meet_wise_man'
                },

                'first_aid_sailor': {
                    id: 'first_aid_sailor',
                    name: 'إسعاف بحار مصاب',
                    icon: '🏥',
                    type: 'medical',
                    islandId: 'port_royal',
                    difficulty: 'medium',
                    description: 'قدم الإسعافات الأولية لبحار أصيب في ذراعه أثناء العمل',
                    xpReward: 80,
                    goldReward: 40,
                    patient: {
                        name: 'سالم البحار',
                        emoji: '👨‍✈️',
                        condition: 'جرح عميق في الساعد الأيمن',
                        symptoms: ['نزيف معتدل', 'ألم حاد', 'تورم']
                    },
                    steps: [
                        {
                            text: 'نظف الجرح بمحلول ملحي',
                            icon: '💧',
                            tool: 'محلول ملحي',
                            correctAction: 'clean_wound'
                        },
                        {
                            text: 'طهر الجرح بمطهر',
                            icon: '🧴',
                            tool: 'مطهر يود',
                            correctAction: 'disinfect'
                        },
                        {
                            text: 'ضع ضمادة معقمة',
                            icon: '🩹',
                            tool: 'ضمادة معقمة',
                            correctAction: 'bandage'
                        },
                        {
                            text: 'ثبت الذراع برباط مثلث',
                            icon: '📐',
                            tool: 'رباط مثلث',
                            correctAction: 'sling'
                        }
                    ],
                    tools: ['محلول ملحي', 'مطهر يود', 'ضمادة معقمة', 'رباط مثلث', 'مقص', 'قفازات'],
                    unlockCondition: null
                },

                // ===== شعاب الرحمة =====
                'herb_collection': {
                    id: 'herb_collection',
                    name: 'جمع الأعشاب الطبية',
                    icon: '🌿',
                    type: 'collect',
                    islandId: 'mercy_reef',
                    difficulty: 'medium',
                    description: 'اجمع 5 أعشاب طبية نادرة من أنحاء شعاب الرحمة',
                    xpReward: 100,
                    goldReward: 50,
                    items: [
                        { id: 'mercy_flower', name: 'زهرة الرحمة', icon: '🌸', location: 'الشاطئ الشمالي', hint: 'تنمو فقط عند الغسق...' },
                        { id: 'aloe_leaf', name: 'ورق الصبار', icon: '🌵', location: 'التلال الصخرية', hint: 'نبات صحراوي قرب الصخور...' },
                        { id: 'mint_herb', name: 'عشبة النعناع', icon: '🌱', location: 'الوادي الأخضر', hint: 'رائحتها قوية ومنعشة...' },
                        { id: 'lavender', name: 'زيت اللافندر', icon: '💜', location: 'الحديقة السرية', hint: 'أزهار بنفسجية جميلة...' },
                        { id: 'ginger_root', name: 'جذر الزنجبيل', icon: '🫚', location: 'الكهف المظلم', hint: 'في أعماق الكهف الرطب...' }
                    ],
                    unlockCondition: 'explore_port'
                },

                // ===== خليج الجراحين =====
                'sterilization_challenge': {
                    id: 'sterilization_challenge',
                    name: 'تحدي التعقيم',
                    icon: '🧼',
                    type: 'puzzle',
                    islandId: 'surgeons_cove',
                    difficulty: 'hard',
                    description: 'رتب خطوات التعقيم الجراحي بالترتيب الصحيح',
                    xpReward: 120,
                    goldReward: 60,
                    steps: [
                        'غسل اليدين بالماء والصابون',
                        'فرك اليدين بالكحول',
                        'ارتداء القفازات المعقمة',
                        'ارتداء الرداء الجراحي',
                        'ارتداء الكمامة',
                        'تعقيم المجال الجراحي'
                    ],
                    unlockCondition: 'herb_collection'
                },

                // ===== جزر الرئة =====
                'rescue_drowning': {
                    id: 'rescue_drowning',
                    name: 'إنقاذ غريق',
                    icon: '🆘',
                    type: 'rescue',
                    islandId: 'storm_lungs',
                    difficulty: 'hard',
                    description: 'أنقذ بحاراً كاد يغرق ويحتاج إلى إنعاش رئوي',
                    xpReward: 150,
                    goldReward: 75,
                    timeLimit: 180,
                    steps: [
                        {
                            text: 'تأكد من سلامة المكان',
                            icon: '🔍',
                            action: 'check_safety',
                            timeBonus: 10
                        },
                        {
                            text: 'تأكد من وعي المصاب',
                            icon: '📢',
                            action: 'check_consciousness',
                            timeBonus: 10
                        },
                        {
                            text: 'اطلب المساعدة',
                            icon: '📞',
                            action: 'call_help',
                            timeBonus: 5
                        },
                        {
                            text: 'افتح مجرى الهواء',
                            icon: '👄',
                            action: 'open_airway',
                            timeBonus: 15
                        },
                        {
                            text: 'ابدأ الضغطات الصدرية (30 ضغطة)',
                            icon: '💪',
                            action: 'chest_compressions',
                            timeBonus: 20
                        },
                        {
                            text: 'أعطِ نفسين إنقاذيين',
                            icon: '🌬️',
                            action: 'rescue_breaths',
                            timeBonus: 20
                        }
                    ],
                    unlockCondition: null
                },

                // ===== بركان القلوب =====
                'heart_rhythm_puzzle': {
                    id: 'heart_rhythm_puzzle',
                    name: 'لغز نبضات القلب',
                    icon: '💓',
                    type: 'puzzle',
                    islandId: 'heart_volcano',
                    difficulty: 'hard',
                    description: 'طابق كل حالة قلبية مع وصفها الصحيح',
                    xpReward: 130,
                    goldReward: 65,
                    pairs: [
                        { term: 'تسرع القلب', definition: 'معدل نبض > 100/دقيقة' },
                        { term: 'بطء القلب', definition: 'معدل نبض < 60/دقيقة' },
                        { term: 'الرجفان الأذيني', definition: 'اضطراب نظمي مع غياب الموجة P' },
                        { term: 'توقف القلب', definition: 'غياب النبض والتنفس' },
                        { term: 'الذبحة الصدرية', definition: 'ألم صدري بسبب نقص تروية القلب' }
                    ],
                    unlockCondition: null
                },

                // ===== تحدي السرعة =====
                'speed_quiz': {
                    id: 'speed_quiz',
                    name: 'سباق المعرفة',
                    icon: '⚡',
                    type: 'race',
                    islandId: 'any',
                    difficulty: 'hard',
                    description: 'أجب على 10 أسئلة في أقل من دقيقتين',
                    xpReward: 200,
                    goldReward: 100,
                    questionCount: 10,
                    timeLimit: 120,
                    bonusPerSecond: 5,
                    unlockCondition: null
                },

                // ===== مهمة الكنز =====
                'treasure_hunt': {
                    id: 'treasure_hunt',
                    name: 'صيد الكنز الأسطوري',
                    icon: '💎',
                    type: 'puzzle',
                    islandId: 'any',
                    difficulty: 'legendary',
                    description: 'اتبع الخريطة لحل 5 ألغاز متتالية للوصول إلى الكنز الأسطوري',
                    xpReward: 500,
                    goldReward: 250,
                    itemReward: 'تاج المعرفة',
                    riddles: [
                        {
                            question: 'أنا شيء يتسع لمئات الكتب لكني لست مكتبة... أدخل المعرفة للعقول... ما أنا؟',
                            answer: 'المعلم',
                            hint: 'يقف أمام الفصل كل يوم...'
                        },
                        {
                            question: 'أحمل ألم المرضى وأخفف معاناتهم... أعمل ليلاً ونهاراً... من أنا؟',
                            answer: 'الممرض',
                            hint: 'يرتدي الزي الأبيض...'
                        },
                        {
                            question: 'أداة صغيرة تنقذ حياة... أستمع إلى أسرار الجسد... ما أنا؟',
                            answer: 'السماعة',
                            hint: 'توضع على الصدر...'
                        },
                        {
                            question: 'سائل الحياة الذي يجري في العروق... أحمر اللون... ما أنا؟',
                            answer: 'الدم',
                            hint: 'ينقله القلب...'
                        },
                        {
                            question: 'أول ما يتعلمه الممرض... أساس الرعاية... ما هو؟',
                            answer: 'الرحمة',
                            hint: 'تبدأ بحرف الراء...'
                        }
                    ],
                    unlockCondition: 'speed_quiz'
                }
            };
        }

        // ==================== بدء مهمة ====================
        startQuest(questId) {
            const library = this.getQuestLibrary();
            const quest = library[questId];
            
            if (!quest) {
                console.error('❌ المهمة غير موجودة:', questId);
                return;
            }
            
            // التحقق من شرط الفتح
            if (quest.unlockCondition) {
                const prerequisite = this.completedQuests.has(quest.unlockCondition);
                if (!prerequisite) {
                    if (typeof showToast === 'function') {
                        showToast('🔒 يجب إكمال المهمة السابقة أولاً!', 'warning');
                    }
                    return;
                }
            }
            
            this.activeQuests.set(questId, {
                quest,
                startedAt: Date.now(),
                progress: 0,
                steps: quest.steps ? [...quest.steps] : [],
                collected: [],
                answers: [],
                score: 0
            });
            
            // تشغيل المهمة حسب نوعها
            switch(quest.type) {
                case 'dialogue':
                    this.runDialogueQuest(questId);
                    break;
                case 'explore':
                    this.runExploreQuest(questId);
                    break;
                case 'medical':
                    this.runMedicalQuest(questId);
                    break;
                case 'collect':
                    this.runCollectQuest(questId);
                    break;
                case 'puzzle':
                    this.runPuzzleQuest(questId);
                    break;
                case 'rescue':
                    this.runRescueQuest(questId);
                    break;
                case 'race':
                    this.runRaceQuest(questId);
                    break;
            }
        }

        // ==================== مهمة حوار ====================
        runDialogueQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            let currentStep = 0;
            
            const renderStep = () => {
                if (currentStep >= quest.steps.length) {
                    this.completeQuest(questId);
                    return;
                }
                
                const step = quest.steps[currentStep];
                const progress = Math.round((currentStep / quest.steps.length) * 100);
                
                const html = `
                    <div style="text-align: center; padding: 20px;">
                        <div style="font-size: 4rem; margin-bottom: 10px;">${quest.icon}</div>
                        <h3 style="color: #fbbf24;">${quest.name}</h3>
                        
                        <!-- شريط التقدم -->
                        <div style="margin: 15px 0;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8;">
                                <span>التقدم</span>
                                <span>${progress}%</span>
                            </div>
                            <div style="background: #334155; height: 8px; border-radius: 4px; overflow: hidden;">
                                <div style="background: linear-gradient(90deg, #fbbf24, #f59e0b); height: 100%; width: ${progress}%; transition: width 0.5s;"></div>
                            </div>
                        </div>
                        
                        <!-- شخصية -->
                        <div style="font-size: 5rem; animation: characterFloat 3s infinite; margin: 15px 0;">
                            ${this.getCharacterEmoji(step.character)}
                        </div>
                        
                        <!-- فقاعة حوار -->
                        <div style="background: rgba(30, 41, 59, 0.9); border-radius: 20px; padding: 20px; margin: 15px 0; position: relative; border: 2px solid #fbbf24;">
                            <div style="color: white; font-size: 1.1rem; line-height: 1.8;">
                                "${step.dialogue}"
                            </div>
                            <div style="position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 10px solid #fbbf24;"></div>
                        </div>
                        
                        <!-- نص الخطوة -->
                        <p style="color: #94a3b8; margin: 10px 0;">📋 ${step.text}</p>
                        
                        <button class="modal-btn btn-primary" onclick="AncientQuests.advanceDialogue('${questId}', ${currentStep})" style="font-size: 1rem; padding: 12px 30px;">
                            ⏭️ ${currentStep < quest.steps.length - 1 ? 'التالي' : 'إنهاء المهمة'}
                        </button>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
            };
            
            window.AncientQuests = this;
            this.advanceDialogue = function(qId, step) {
                if (qId === questId && step === currentStep) {
                    currentStep++;
                    renderStep();
                }
            };
            
            renderStep();
        }

        // ==================== مهمة استكشاف ====================
        runExploreQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const locations = quest.locations || [];
            const found = new Set();
            
            const mapHTML = locations.map((loc, idx) => `
                <div onclick="AncientQuests.exploreLocation('${questId}', '${loc.id}')" 
                    id="location-${loc.id}"
                    style="
                        background: rgba(30, 41, 59, 0.8);
                        border: 2px solid #475569;
                        border-radius: 15px;
                        padding: 20px;
                        cursor: pointer;
                        transition: all 0.3s;
                        text-align: center;
                    "
                    onmouseenter="this.style.borderColor='#fbbf24'; this.style.transform='scale(1.05)';"
                    onmouseleave="this.style.borderColor='#475569'; this.style.transform='scale(1)';"
                >
                    <div style="font-size: 3rem;">🔍</div>
                    <div style="color: #fbbf24; font-weight: 700; margin: 5px 0;">؟؟؟</div>
                    <div style="color: #94a3b8; font-size: 0.85rem;">${loc.hint}</div>
                </div>
            `).join('');
            
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <h3 style="color: #fbbf24;">🔍 ${quest.name}</h3>
                    <p style="color: #94a3b8;">اكتشف ${locations.length} أماكن في الجزيرة</p>
                    <p style="color: #fbbf24;">تم العثور: <span id="foundCount">0</span>/${locations.length}</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                        ${mapHTML}
                    </div>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('questModal', html);
            }
            
            this.exploreLocation = function(qId, locId) {
                if (qId !== questId) return;
                if (found.has(locId)) return;
                
                found.add(locId);
                const loc = locations.find(l => l.id === locId);
                const locEl = document.getElementById(`location-${locId}`);
                
                if (locEl) {
                    locEl.innerHTML = `
                        <div style="font-size: 3rem;">${loc.icon}</div>
                        <div style="color: #10b981; font-weight: 700;">${loc.name}</div>
                        <div style="color: #10b981; font-size: 0.8rem;">✅ تم الاكتشاف!</div>
                    `;
                    locEl.style.borderColor = '#10b981';
                    locEl.style.background = 'rgba(16, 185, 129, 0.1)';
                    locEl.onclick = null;
                }
                
                document.getElementById('foundCount').textContent = found.size;
                
                if (found.size >= locations.length) {
                    setTimeout(() => this.completeQuest(questId), 1000);
                }
            };
        }

        // ==================== مهمة طبية ====================
        runMedicalQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const patient = quest.patient;
            const steps = quest.steps;
            let currentStep = 0;
            const tools = quest.tools || [];
            
            const renderMedicalStep = () => {
                if (currentStep >= steps.length) {
                    this.completeQuest(questId);
                    return;
                }
                
                const step = steps[currentStep];
                
                const html = `
                    <div style="text-align: center; padding: 20px;">
                        <h3 style="color: #ef4444;">🏥 ${quest.name}</h3>
                        
                        <!-- المريض -->
                        <div style="background: rgba(30, 41, 59, 0.9); border-radius: 15px; padding: 15px; margin: 15px 0;">
                            <div style="font-size: 4rem;">${patient.emoji}</div>
                            <div style="color: white; font-weight: 700;">${patient.name}</div>
                            <div style="color: #ef4444; font-size: 0.9rem;">${patient.condition}</div>
                            <div style="display: flex; gap: 5px; justify-content: center; margin-top: 5px;">
                                ${patient.symptoms.map(s => `<span style="background: rgba(239,68,68,0.2); color: #ef4444; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem;">${s}</span>`).join('')}
                            </div>
                        </div>
                        
                        <!-- الخطوة الحالية -->
                        <div style="background: rgba(30, 41, 59, 0.9); border-radius: 15px; padding: 15px; margin: 15px 0; border: 2px solid #fbbf24;">
                            <div style="font-size: 2rem;">${step.icon}</div>
                            <div style="color: white; font-weight: 700; margin: 5px 0;">${step.text}</div>
                            <p style="color: #94a3b8; font-size: 0.8rem;">اختر الأداة الصحيحة:</p>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                                ${tools.map(tool => `
                                    <button onclick="AncientQuests.useTool('${questId}', '${tool}', '${step.correctAction}')" 
                                        style="
                                            padding: 10px;
                                            border: 2px solid #475569;
                                            border-radius: 10px;
                                            background: rgba(30, 41, 59, 0.8);
                                            color: white;
                                            cursor: pointer;
                                            transition: all 0.3s;
                                            font-family: 'Tajawal', sans-serif;
                                        "
                                        onmouseenter="this.style.borderColor='#fbbf24';"
                                        onmouseleave="this.style.borderColor='#475569';"
                                    >${tool}</button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <p style="color: #94a3b8;">الخطوة ${currentStep + 1}/${steps.length}</p>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
            };
            
            this.useTool = function(qId, tool, correctAction) {
                if (qId !== questId) return;
                
                const step = steps[currentStep];
                const isCorrect = step.correctAction === correctAction;
                
                if (isCorrect) {
                    if (typeof showToast === 'function') {
                        showToast('✅ صحيح! أحسنت!', 'success');
                    }
                    currentStep++;
                    setTimeout(() => renderMedicalStep(), 500);
                } else {
                    if (typeof showToast === 'function') {
                        showToast('❌ الأداة غير صحيحة! حاول مرة أخرى.', 'error');
                    }
                }
            };
            
            renderMedicalStep();
        }

        // ==================== مهمة جمع ====================
        runCollectQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const items = quest.items || [];
            const collected = new Set();
            
            const mapHTML = `
                <div style="position: relative; width: 100%; height: 400px; background: linear-gradient(180deg, #1a3a4a, #0d2a35); border-radius: 20px; overflow: hidden; margin: 15px 0;">
                    ${items.map((item, idx) => {
                        const x = 15 + (idx * 20) + Math.random() * 10;
                        const y = 20 + Math.random() * 60;
                        return `
                            <div onclick="AncientQuests.collectItem('${questId}', '${item.id}')"
                                id="item-${item.id}"
                                style="
                                    position: absolute;
                                    left: ${x}%;
                                    top: ${y}%;
                                    font-size: 2rem;
                                    cursor: pointer;
                                    animation: itemFloat ${2 + Math.random() * 2}s infinite;
                                    transition: all 0.3s;
                                "
                            >🌿</div>
                        `;
                    }).join('')}
                </div>
            `;
            
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <h3 style="color: #f59e0b;">🎒 ${quest.name}</h3>
                    <p style="color: #94a3b8;">اجمع ${items.length} أعشاب طبية</p>
                    
                    ${mapHTML}
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 15px;">
                        ${items.map(item => `
                            <div id="inventory-${item.id}" style="
                                background: rgba(30, 41, 59, 0.8);
                                border: 2px solid #475569;
                                border-radius: 10px;
                                padding: 10px;
                                text-align: center;
                                opacity: 0.5;
                            ">
                                <div>❓</div>
                                <div style="color: #94a3b8; font-size: 0.8rem;">${item.hint}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('questModal', html);
            }
            
            this.collectItem = function(qId, itemId) {
                if (qId !== questId) return;
                if (collected.has(itemId)) return;
                
                collected.add(itemId);
                const item = items.find(i => i.id === itemId);
                
                // إخفاء العنصر من الخريطة
                const mapItem = document.getElementById(`item-${itemId}`);
                if (mapItem) mapItem.style.opacity = '0';
                
                // تحديث المخزون
                const invItem = document.getElementById(`inventory-${itemId}`);
                if (invItem) {
                    invItem.innerHTML = `
                        <div style="font-size: 1.5rem;">${item.icon}</div>
                        <div style="color: #10b981; font-weight: 700;">${item.name}</div>
                    `;
                    invItem.style.opacity = '1';
                    invItem.style.borderColor = '#10b981';
                }
                
                if (collected.size >= items.length) {
                    setTimeout(() => this.completeQuest(questId), 1000);
                }
            };
        }

        // ==================== مهمة لغز ====================
        runPuzzleQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            
            if (quest.riddles) {
                this.runRiddlePuzzle(questId, quest.riddles);
            } else if (quest.pairs) {
                this.runMatchingPuzzle(questId, quest.pairs);
            } else if (quest.steps) {
                this.runSortingPuzzle(questId, quest.steps);
            }
        }

        runRiddlePuzzle(questId, riddles) {
            let currentRiddle = 0;
            let score = 0;
            
            const renderRiddle = () => {
                if (currentRiddle >= riddles.length) {
                    this.completeQuest(questId);
                    return;
                }
                
                const riddle = riddles[currentRiddle];
                
                const html = `
                    <div style="text-align: center; padding: 20px;">
                        <h3 style="color: #8b5cf6;">🧩 ${this.getQuestLibrary()[questId]?.name || 'لغز'}</h3>
                        
                        <div style="font-size: 2rem; margin: 10px 0;">🤔</div>
                        
                        <div style="background: rgba(30, 41, 59, 0.9); border-radius: 20px; padding: 25px; margin: 15px 0; border: 2px solid #8b5cf6;">
                            <p style="color: white; font-size: 1.2rem; line-height: 2;">"${riddle.question}"</p>
                            <p style="color: #8b5cf6; font-size: 0.85rem; margin-top: 10px;">💡 تلميح: ${riddle.hint}</p>
                        </div>
                        
                        <input type="text" id="riddleAnswer" placeholder="✍️ اكتب إجابتك..." style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #8b5cf6;
                            border-radius: 10px;
                            background: rgba(30, 41, 59, 0.8);
                            color: white;
                            font-size: 1rem;
                            text-align: center;
                            font-family: 'Tajawal', sans-serif;
                        ">
                        
                        <button class="modal-btn btn-primary" onclick="AncientQuests.checkRiddle('${questId}', ${currentRiddle})" style="margin-top: 10px; width: 100%;">
                            ✅ تحقق
                        </button>
                        
                        <p style="color: #94a3b8; margin-top: 10px;">اللغز ${currentRiddle + 1}/${riddles.length}</p>
                        <p style="color: #fbbf24;">النتيجة: ${score}/${riddles.length}</p>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
            };
            
            this.checkRiddle = function(qId, riddleIdx) {
                if (qId !== questId || riddleIdx !== currentRiddle) return;
                
                const answer = document.getElementById('riddleAnswer')?.value.trim();
                const correct = riddles[riddleIdx].answer;
                
                if (answer.toLowerCase() === correct.toLowerCase()) {
                    score++;
                    if (typeof showToast === 'function') {
                        showToast('✅ إجابة صحيحة!', 'success');
                    }
                } else {
                    if (typeof showToast === 'function') {
                        showToast(`❌ خطأ! الإجابة: ${correct}`, 'error');
                    }
                }
                
                currentRiddle++;
                setTimeout(() => renderRiddle(), 500);
            };
            
            renderRiddle();
        }

        runMatchingPuzzle(questId, pairs) {
            // خلط الأزواج
            const shuffledTerms = [...pairs].sort(() => Math.random() - 0.5);
            const shuffledDefs = [...pairs].sort(() => Math.random() - 0.5);
            let selectedTerm = null;
            const matched = new Set();
            
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <h3 style="color: #8b5cf6;">🧩 لغز المطابقة</h3>
                    <p style="color: #94a3b8;">اختر مصطلح ثم طابقه مع تعريفه</p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                        <div>
                            <h4 style="color: #fbbf24;">المصطلحات</h4>
                            ${shuffledTerms.map(t => `
                                <div onclick="AncientQuests.selectTerm('${questId}', '${t.term}')" 
                                    id="term-${t.term}"
                                    style="
                                        background: rgba(30, 41, 59, 0.8);
                                        border: 2px solid #475569;
                                        border-radius: 10px;
                                        padding: 12px;
                                        margin: 5px 0;
                                        cursor: pointer;
                                        color: white;
                                        transition: all 0.3s;
                                    "
                                    onmouseenter="this.style.borderColor='#fbbf24';"
                                    onmouseleave="this.style.borderColor='#475569';"
                                >${t.term}</div>
                            `).join('')}
                        </div>
                        <div>
                            <h4 style="color: #fbbf24;">التعريفات</h4>
                            ${shuffledDefs.map(d => `
                                <div onclick="AncientQuests.matchTerm('${questId}', '${d.term}', '${d.definition.replace(/'/g, "\\'")}')" 
                                    id="def-${d.term}"
                                    style="
                                        background: rgba(30, 41, 59, 0.8);
                                        border: 2px solid #475569;
                                        border-radius: 10px;
                                        padding: 12px;
                                        margin: 5px 0;
                                        cursor: pointer;
                                        color: #94a3b8;
                                        font-size: 0.85rem;
                                        transition: all 0.3s;
                                    "
                                    onmouseenter="this.style.borderColor='#8b5cf6';"
                                    onmouseleave="this.style.borderColor='#475569';"
                                >${d.definition}</div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <p style="color: #10b981; margin-top: 10px;">متطابق: <span id="matchCount">0</span>/${pairs.length}</p>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('questModal', html);
            }
            
            this.selectTerm = function(qId, term) {
                if (qId !== questId) return;
                if (matched.has(term)) return;
                
                // إلغاء تحديد السابق
                document.querySelectorAll('[id^="term-"]').forEach(el => {
                    el.style.borderColor = '#475569';
                    el.style.background = 'rgba(30, 41, 59, 0.8)';
                });
                
                selectedTerm = term;
                document.getElementById(`term-${term}`).style.borderColor = '#fbbf24';
                document.getElementById(`term-${term}`).style.background = 'rgba(251, 191, 36, 0.2)';
            };
            
            this.matchTerm = function(qId, term, definition) {
                if (qId !== questId) return;
                if (matched.has(term)) return;
                if (!selectedTerm) return;
                
                if (selectedTerm === term) {
                    matched.add(term);
                    document.getElementById(`term-${term}`).style.borderColor = '#10b981';
                    document.getElementById(`term-${term}`).style.background = 'rgba(16, 185, 129, 0.2)';
                    document.getElementById(`def-${term}`).style.borderColor = '#10b981';
                    document.getElementById(`def-${term}`).style.background = 'rgba(16, 185, 129, 0.2)';
                    document.getElementById(`def-${term}`).style.color = '#10b981';
                    selectedTerm = null;
                    
                    document.getElementById('matchCount').textContent = matched.size;
                    
                    if (matched.size >= pairs.length) {
                        setTimeout(() => this.completeQuest(questId), 1000);
                    }
                } else {
                    if (typeof showToast === 'function') {
                        showToast('❌ غير متطابق! حاول مرة أخرى.', 'error');
                    }
                    selectedTerm = null;
                    document.querySelectorAll('[id^="term-"]').forEach(el => {
                        el.style.borderColor = '#475569';
                        el.style.background = 'rgba(30, 41, 59, 0.8)';
                    });
                }
            };
        }

        runSortingPuzzle(questId, steps) {
            const shuffled = [...steps].sort(() => Math.random() - 0.5);
            let userOrder = [];
            
            const renderSorting = () => {
                const remaining = shuffled.filter(s => !userOrder.includes(s));
                
                const html = `
                    <div style="text-align: center; padding: 20px;">
                        <h3 style="color: #8b5cf6;">🧩 رتب الخطوات</h3>
                        
                        <div style="margin: 15px 0;">
                            <h4 style="color: #10b981;">✅ تم الترتيب:</h4>
                            ${userOrder.map((s, i) => `
                                <div style="
                                    background: rgba(16, 185, 129, 0.2);
                                    border: 2px solid #10b981;
                                    border-radius: 10px;
                                    padding: 10px;
                                    margin: 5px 0;
                                    color: white;
                                ">${i + 1}. ${s}</div>
                            `).join('')}
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <h4 style="color: #fbbf24;">📋 اختر التالي:</h4>
                            ${remaining.map(s => `
                                <div onclick="AncientQuests.addStep('${questId}', '${s.replace(/'/g, "\\'")}')" style="
                                    background: rgba(30, 41, 59, 0.8);
                                    border: 2px solid #475569;
                                    border-radius: 10px;
                                    padding: 12px;
                                    margin: 5px 0;
                                    cursor: pointer;
                                    color: white;
                                    transition: all 0.3s;
                                "
                                    onmouseenter="this.style.borderColor='#fbbf24';"
                                    onmouseleave="this.style.borderColor='#475569';"
                                >${s}</div>
                            `).join('')}
                        </div>
                        
                        <button class="modal-btn btn-primary" onclick="AncientQuests.checkOrder('${questId}')" style="width: 100%;">
                            ✅ تأكيد الترتيب
                        </button>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
            };
            
            this.addStep = function(qId, step) {
                if (qId !== questId) return;
                if (userOrder.includes(step)) return;
                userOrder.push(step);
                renderSorting();
            };
            
            this.checkOrder = function(qId) {
                if (qId !== questId) return;
                
                const isCorrect = JSON.stringify(userOrder) === JSON.stringify(steps);
                if (isCorrect) {
                    this.completeQuest(questId);
                } else {
                    if (typeof showToast === 'function') {
                        showToast('❌ الترتيب غير صحيح! حاول مرة أخرى.', 'error');
                    }
                    userOrder = [];
                    renderSorting();
                }
            };
            
            renderSorting();
        }

        // ==================== مهمة إنقاذ ====================
        runRescueQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const timeLimit = quest.timeLimit || 180;
            let timeLeft = timeLimit;
            let stepIndex = 0;
            
            const timerInterval = setInterval(() => {
                timeLeft--;
                const timerEl = document.getElementById('rescueTimer');
                if (timerEl) {
                    timerEl.textContent = this.formatTime(timeLeft);
                    timerEl.style.color = timeLeft <= 30 ? '#ef4444' : '#fbbf24';
                }
                
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    if (typeof showToast === 'function') {
                        showToast('⏰ انتهى الوقت!', 'error');
                    }
                    closeModal('questModal');
                }
            }, 1000);
            
            // تخزين المؤقت للإلغاء لاحقاً
            active.timerInterval = timerInterval;
            
            const renderRescue = () => {
                const step = quest.steps[stepIndex];
                const progress = Math.round((stepIndex / quest.steps.length) * 100);
                
                const html = `
                    <div style="text-align: center; padding: 20px;">
                        <div style="font-size: 5rem;">🆘</div>
                        <h3 style="color: #ec4899;">${quest.name}</h3>
                        
                        <div style="font-size: 2rem; color: #fbbf24; margin: 10px 0;">
                            ⏱️ <span id="rescueTimer">${this.formatTime(timeLeft)}</span>
                        </div>
                        
                        <div style="background: #334155; height: 8px; border-radius: 4px; overflow: hidden; margin: 10px 0;">
                            <div style="background: #ec4899; height: 100%; width: ${progress}%;"></div>
                        </div>
                        
                        <div style="background: rgba(30, 41, 59, 0.9); border-radius: 15px; padding: 20px; margin: 15px 0; border: 2px solid #ec4899;">
                            <div style="font-size: 3rem;">${step.icon}</div>
                            <div style="color: white; font-size: 1.1rem; margin: 10px 0;">${step.text}</div>
                        </div>
                        
                        <button class="modal-btn btn-danger" onclick="AncientQuests.performRescue('${questId}', ${stepIndex})" style="width: 100%; padding: 15px; font-size: 1.1rem;">
                            ✅ ${step.text}
                        </button>
                    </div>
                `;
                
                if (typeof openModal === 'function') {
                    openModal('questModal', html);
                }
            };
            
            this.performRescue = function(qId, step) {
                if (qId !== questId || step !== stepIndex) return;
                
                stepIndex++;
                
                if (stepIndex >= quest.steps.length) {
                    clearInterval(timerInterval);
                    const bonus = timeLeft * 2;
                    active.score += bonus;
                    this.completeQuest(questId);
                } else {
                    renderRescue();
                }
            };
            
            renderRescue();
        }

        // ==================== مهمة سباق ====================
        runRaceQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const questionCount = quest.questionCount || 10;
            const timeLimit = quest.timeLimit || 120;
            
            // جلب أسئلة عشوائية
            let questions = [];
            if (typeof getAllQuestions === 'function') {
                questions = getAllQuestions('all', 'all')
                    .sort(() => Math.random() - 0.5)
                    .slice(0, questionCount);
            }
            
            if (questions.length === 0) {
                if (typeof showToast === 'function') {
                    showToast('❌ لا توجد أسئلة متاحة!', 'error');
                }
                return;
            }
            
            // بدء المعركة مع مؤقت
            if (window.AncientBattle) {
                window.AncientBattle.startBattle({
                    monster: {
                        name: 'ساعة الزمن',
                        emoji: '⏰',
                        hp: questionCount * 10,
                        damage: 0
                    },
                    questions: questions,
                    timer: Math.floor(timeLimit / questionCount),
                    onEnd: (result) => {
                        if (result.won) {
                            active.score = result.score + (timeLimit * quest.bonusPerSecond || 0);
                            this.completeQuest(questId);
                        }
                    }
                });
            }
        }

        // ==================== إكمال المهمة ====================
        completeQuest(questId) {
            const active = this.activeQuests.get(questId);
            if (!active) return;
            
            const quest = active.quest;
            const timeTaken = Math.floor((Date.now() - active.startedAt) / 1000);
            
            // إلغاء أي مؤقتات
            if (active.timerInterval) clearInterval(active.timerInterval);
            
            // تسجيل الإكمال
            this.completedQuests.add(questId);
            this.activeQuests.delete(questId);
            
            // حساب المكافآت
            let xpBonus = 0;
            let goldBonus = 0;
            
            if (quest.type === 'race') {
                xpBonus = active.score || 0;
                goldBonus = Math.floor((active.score || 0) / 2);
            }
            
            const totalXP = quest.xpReward + xpBonus;
            const totalGold = quest.goldReward + goldBonus;
            
            // إضافة المكافآت
            if (window.AncientMap) {
                window.AncientMap.addXP(totalXP);
                window.AncientMap.addGold(totalGold);
                
                if (window.AncientMap.Audio) {
                    window.AncientMap.Audio.playSFX('treasure');
                }
            }
            
            // عرض شاشة الإكمال
            const html = `
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 6rem; animation: bounce 0.5s;">🎉</div>
                    <h2 style="color: #fbbf24;">تم إكمال المهمة!</h2>
                    
                    <div style="background: rgba(30, 41, 59, 0.9); border-radius: 20px; padding: 20px; margin: 15px 0;">
                        <div style="font-size: 3rem;">${quest.icon}</div>
                        <h3 style="color: #fbbf24;">${quest.name}</h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                            <div>
                                <div style="color: #94a3b8;">⭐ XP</div>
                                <div style="color: #fbbf24; font-size: 1.5rem;">+${totalXP}</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8;">🪙 ذهب</div>
                                <div style="color: #f59e0b; font-size: 1.5rem;">+${totalGold}</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8;">⏱️ الوقت</div>
                                <div style="color: white; font-size: 1.2rem;">${this.formatTime(timeTaken)}</div>
                            </div>
                            <div>
                                <div style="color: #94a3b8;">🎁 مكافأة</div>
                                <div style="color: #10b981; font-size: 1rem;">${quest.itemReward || 'لا يوجد'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <button class="modal-btn btn-primary" onclick="closeModal('questModal'); AncientMap.openMap();">
                        🗺️ العودة للخريطة
                    </button>
                </div>
            `;
            
            if (typeof openModal === 'function') {
                openModal('questModal', html);
            }
            
            // مؤثرات
            if (typeof spawnConfetti === 'function') {
                spawnConfetti();
            }
            
            // حفظ التقدم
            if (window.AncientMap) {
                window.AncientMap.saveState();
            }
            
            console.log(`✅ تم إكمال مهمة: ${quest.name} | +${totalXP} XP | +${totalGold} ذهب`);
        }

        // ==================== دوال مساعدة ====================
        getCharacterEmoji(id) {
            const map = {
                'old_wise_man': '🧙‍♂️',
                'nurse_ghost': '👻',
                'surgeon_spirit': '💀',
                'storm_witch': '🧙‍♀️',
                'treasure_golem': '🗿',
                'injured_sailor': '👨‍✈️',
                'port_merchant': '🧔',
                'herb_collector': '👩‍🌾'
            };
            return map[id] || '👤';
        }

        formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }

        // ==================== عرض قائمة المهام ====================
        openQuestLog() {
            const library = this.getQuestLibrary();
            const quests = Object.values(library);
            
            const html = `
                <h2>📋 سجل المهام</h2>
                <div style="max-height: 60vh; overflow-y: auto;">
                    ${quests.map(quest => {
                        const completed = this.completedQuests.has(quest.id);
                        const active = this.activeQuests.has(quest.id);
                        const locked = quest.unlockCondition && !this.completedQuests.has(quest.unlockCondition);
                        
                        return `
                            <div style="
                                background: ${completed ? 'rgba(16, 185, 129, 0.1)' : active ? 'rgba(251, 191, 36, 0.1)' : 'rgba(30, 41, 59, 0.5)'};
                                border: 2px solid ${completed ? '#10b981' : active ? '#fbbf24' : '#475569'};
                                border-radius: 15px;
                                padding: 15px;
                                margin: 8px 0;
                                ${locked ? 'opacity: 0.5;' : ''}
                                ${!locked && !completed ? 'cursor: pointer;' : ''}
                            " ${!locked && !completed ? `onclick="AncientQuests.startQuest('${quest.id}')"` : ''}>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 2rem;">${quest.icon}</span>
                                    <div style="flex: 1; text-align: right;">
                                        <div style="font-weight: 700; color: ${completed ? '#10b981' : 'white'};">
                                            ${completed ? '✅ ' : locked ? '🔒 ' : active ? '⏳ ' : ''}${quest.name}
                                        </div>
                                        <div style="font-size: 0.8rem; color: #94a3b8;">${quest.description}</div>
                                        <div style="font-size: 0.75rem; color: #fbbf24;">
                                            ⭐ +${quest.xpReward} XP | 🪙 +${quest.goldReward} ذهب
                                            | 🏷️ ${this.getQuestTypes()[quest.type]?.name || quest.type}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <button class="modal-btn btn-close" onclick="closeModal('questLogModal')">إغلاق</button>
            `;
            
            if (typeof openModal === 'function') {
                openModal('questLogModal', html);
            }
        }
    }

    // ==================== التصدير ====================
    window.AncientQuests = new QuestEngine();

    // ==================== أنماط CSS ====================
    function addQuestStyles() {
        if (document.getElementById('questStylesV3')) return;
        
        const style = document.createElement('style');
        style.id = 'questStylesV3';
        style.textContent = `
            @keyframes characterFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-15px); }
            }
            @keyframes itemFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-30px); }
            }
        `;
        
        document.head.appendChild(style);
    }

    // ==================== التهيئة ====================
    function init() {
        addQuestStyles();
        console.log('🎯 نظام المهام جاهز! | ' + Object.keys(AncientQuests.getQuestLibrary()).length + ' مهمة متاحة');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
