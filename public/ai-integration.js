// ==================== AI Integration - التكامل المتطور ====================
var AIIntegration = {
    initialized: false,
    
    init: function() {
        if (this.initialized) return;
        this.initialized = true;
        
        debugLog('🤖 جاري تهيئة نظام الذكاء الاصطناعي المتطور...');
        this.addAIButtons();
        this.addKeyboardShortcuts();
        debugLog('✅ تم تهيئة نظام AI المتطور بنجاح');
        debugLog('📚 ' + MedicalKnowledgeBase.totalChapters + ' فصلاً في قاعدة المعرفة');
    },
    
    addAIButtons: function() {
        var self = this;
        var attempts = 0;
        
        function tryAddButtons() {
            var controlBar = document.querySelector('.control-bar');
            if (!controlBar) {
                attempts++;
                if (attempts < 20) setTimeout(tryAddButtons, 300);
                return;
            }
            
            if (document.getElementById('aiChatbotBtn')) return;
            
            // فاصل
            var separator = document.createElement('span');
            separator.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.3);margin:0 3px;';
            controlBar.appendChild(separator);
            
            // المساعد الذكي
            var chatbotBtn = document.createElement('button');
            chatbotBtn.id = 'aiChatbotBtn';
            chatbotBtn.className = 'flashcard-btn';
            chatbotBtn.innerHTML = '<i class="fas fa-robot"></i> مساعد';
            chatbotBtn.title = 'المساعد الدراسي الذكي - اسأل عن أي موضوع';
            chatbotBtn.onclick = function() { self.openChatbot(); };
            chatbotBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
            controlBar.appendChild(chatbotBtn);
            
            // البحث السريع
            var searchBtn = document.createElement('button');
            searchBtn.id = 'aiSearchBtn';
            searchBtn.className = 'exam-btn';
            searchBtn.innerHTML = '<i class="fas fa-search"></i> بحث';
            searchBtn.title = 'البحث في جميع الفصول';
            searchBtn.onclick = function() { self.openSearch(); };
            controlBar.appendChild(searchBtn);
            
            // تلخيص
            var summaryBtn = document.createElement('button');
            summaryBtn.id = 'aiSummaryBtn';
            summaryBtn.className = 'dashboard-btn';
            summaryBtn.innerHTML = '<i class="fas fa-file-alt"></i> تلخيص';
            summaryBtn.title = 'تلخيص أي موضوع في المنهج';
            summaryBtn.onclick = function() { self.openSummarizer(); };
            controlBar.appendChild(summaryBtn);
            
            // اختبار
            var quizBtn = document.createElement('button');
            quizBtn.id = 'aiQuizBtn';
            quizBtn.className = 'quiz-btn';
            quizBtn.innerHTML = '<i class="fas fa-question-circle"></i> اختبار';
            quizBtn.title = 'اختبار سريع في أي موضوع';
            quizBtn.onclick = function() { self.openQuizGenerator(); };
            controlBar.appendChild(quizBtn);
            
            // بطاقات
            var flashcardBtn = document.createElement('button');
            flashcardBtn.id = 'aiFlashcardBtn';
            flashcardBtn.className = 'flashcard-btn';
            flashcardBtn.innerHTML = '<i class="fas fa-clone"></i> بطاقة';
            flashcardBtn.title = 'بطاقة تعليمية لأي موضوع';
            flashcardBtn.onclick = function() { self.openFlashcardGenerator(); };
            controlBar.appendChild(flashcardBtn);
        }
        
        tryAddButtons();
    },
    
    addKeyboardShortcuts: function() {
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                AIIntegration.openSearch();
            }
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                AIIntegration.openChatbot();
            }
        });
    },
    
    // ===== المساعد الذكي =====
    openChatbot: function() {
        var h = '<h2>🤖 المساعد الدراسي الذكي</h2>';
        h += '<p style="font-size:0.8rem;color:var(--text-secondary);">اسأل عن أي مرض أو موضوع في المنهج - 11 فصلاً كاملاً</p>';
        
        h += '<div id="chatMessages" style="max-height:45vh;overflow-y:auto;text-align:right;padding:10px;background:var(--light-bg);border-radius:15px;margin-bottom:10px;min-height:250px;">';
        h += '<div style="background:var(--card-bg);padding:12px;border-radius:12px;margin:5px 0;border-right:3px solid var(--purple);">';
        h += '<strong>🤖 المساعد:</strong> مرحباً! 🌟\n\n';
        h += 'أنا مساعدك الذكي لمنهج <b>Medical Surgical Nursing</b>.\n\n';
        h += '📚 <b>11 فصلاً كاملاً</b> في قاعدة معرفتي.\n\n';
        h += '🎯 <b>جرب:</b>\n';
        h += '• اكتب اسم المرض: "السكري"\n';
        h += '• اسأل عن الأعراض: "أعراض الالتهاب الرئوي"\n';
        h += '• اطلب علاج: "علاج ارتفاع الضغط"\n';
        h += '• تمريض: "الرعاية التمريضية للكسور"\n';
        h += '• اختبر نفسك: "اختبرني في السكري"\n';
        h += '• لخص: "لخص الذبحة الصدرية"\n';
        h += '• قارن: "الفرق بين الكسر المفتوح والمغلق"\n\n';
        h += '💡 اكتب <b>"مساعدة"</b> للقائمة الكاملة.';
        h += '</div>';
        h += '</div>';
        
        h += '<div style="display:flex;gap:5px;">';
        h += '<input type="text" id="chatInput" placeholder="اكتب سؤالك أو اسم الموضوع..." style="flex:1;padding:12px;border-radius:25px;border:2px solid var(--border-color);font-family:Tajawal;font-size:0.9rem;">';
        h += '<button class="modal-btn btn-primary" onclick="AIIntegration.sendMessage()" style="padding:12px 20px;border-radius:25px;"><i class="fas fa-paper-plane"></i></button>';
        h += '</div>';
        
        h += '<div style="margin-top:10px;display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'السكري\')" style="font-size:0.7rem;">السكري</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'الالتهاب الرئوي\')" style="font-size:0.7rem;">الالتهاب الرئوي</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'ارتفاع ضغط الدم\')" style="font-size:0.7rem;">الضغط</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'الكسور\')" style="font-size:0.7rem;">الكسور</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'السكتة الدماغية\')" style="font-size:0.7rem;">السكتة</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'سلس البول\')" style="font-size:0.7rem;">سلس البول</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickMessage(\'مساعدة\')" style="font-size:0.7rem;">مساعدة</button>';
        h += '</div>';
        
        h += '<div style="display:flex;gap:5px;justify-content:center;margin-top:5px;">';
        h += '<button class="modal-btn" onclick="AIIntegration.clearChat()" style="font-size:0.65rem;background:#ef4444;color:white;">🗑️ مسح المحادثة</button>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'chatbotModal\')">إغلاق</button>';
        h += '</div>';
        
        openModal('chatbotModal', h);
        
        setTimeout(function() {
            var input = document.getElementById('chatInput');
            if (input) {
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') AIIntegration.sendMessage();
                });
                input.focus();
            }
        }, 300);
    },
    
    sendMessage: function() {
        var input = document.getElementById('chatInput');
        if (!input || !input.value.trim()) return;
        
        var userMessage = input.value.trim();
        input.value = '';
        
        var messagesDiv = document.getElementById('chatMessages');
        
        // رسالة المستخدم
        messagesDiv.innerHTML += '<div style="background:var(--card-bg);padding:10px;border-radius:12px;margin:5px 0;text-align:left;margin-right:30px;"><strong>👤 أنت:</strong> ' + userMessage + '</div>';
        
        // رد المساعد
        var response = AIChatbot.respond(userMessage);
        
        setTimeout(function() {
            messagesDiv.innerHTML += '<div style="background:var(--card-bg);padding:12px;border-radius:12px;margin:5px 0;border-right:3px solid var(--purple);margin-left:30px;"><strong>🤖 المساعد:</strong><br>' + response.replace(/\n/g, '<br>') + '</div>';
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 400);
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        input.focus();
    },
    
    quickMessage: function(message) {
        var input = document.getElementById('chatInput');
        if (input) {
            input.value = message;
            this.sendMessage();
        }
    },
    
    clearChat: function() {
        var messagesDiv = document.getElementById('chatMessages');
        if (messagesDiv) {
            messagesDiv.innerHTML = '<div style="background:var(--card-bg);padding:12px;border-radius:12px;margin:5px 0;border-right:3px solid var(--purple);"><strong>🤖 المساعد:</strong> ✅ تم مسح المحادثة. ابدأ من جديد!</div>';
        }
        AIChatbot.clearHistory();
    },
    
    // ===== البحث السريع =====
    openSearch: function() {
        var h = '<h2>🔍 البحث في المنهج</h2>';
        h += '<p style="font-size:0.8rem;color:var(--text-secondary);">ابحث في جميع الفصول الـ 11 - اكتب كلمة أو مصطلح طبي</p>';
        
        h += '<div style="display:flex;gap:5px;margin-bottom:10px;">';
        h += '<input type="text" id="searchInput" placeholder="مثلاً: السكري، كسر، التهاب، ضغط..." style="flex:1;padding:12px;border-radius:25px;border:2px solid var(--border-color);font-family:Tajawal;font-size:0.9rem;">';
        h += '<button class="modal-btn btn-primary" onclick="AIIntegration.doSearch()" style="padding:12px 20px;border-radius:25px;"><i class="fas fa-search"></i></button>';
        h += '</div>';
        
        h += '<div id="searchResults" style="text-align:right;max-height:50vh;overflow-y:auto;"></div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'searchModal\')">إغلاق</button>';
        
        openModal('searchModal', h);
        
        setTimeout(function() {
            var input = document.getElementById('searchInput');
            if (input) {
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') AIIntegration.doSearch();
                });
                input.focus();
            }
        }, 300);
    },
    
    doSearch: function() {
        var input = document.getElementById('searchInput');
        var resultsDiv = document.getElementById('searchResults');
        
        if (!input || !input.value.trim()) {
            resultsDiv.innerHTML = '<p style="color:var(--red);text-align:center;">❌ اكتب كلمة للبحث</p>';
            return;
        }
        
        var query = input.value.trim();
        var results = MedicalKnowledgeBase.search(query);
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="color:var(--orange);text-align:center;">⚠️ لم أجد نتائج لـ "' + query + '"</p>';
            return;
        }
        
        var html = '<h4 style="text-align:center;">📊 ' + results.length + ' نتيجة</h4>';
        
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            html += '<div style="background:var(--card-bg);padding:12px;border-radius:12px;margin:8px 0;border:1px solid var(--border-color);cursor:pointer;" onclick="AIIntegration.showTopicInChat(\'' + r.chapterNum + '\',\'' + r.topicKey + '\')">';
            html += '<strong>' + (i+1) + '. ' + r.name + '</strong> ';
            html += '<span style="font-size:0.75rem;color:var(--text-secondary);">(' + r.englishName + ')</span>';
            html += '<br><span style="font-size:0.75rem;">📂 ' + r.chapter + '</span>';
            if (r.data.definition) {
                html += '<br><span style="font-size:0.8rem;color:var(--text-secondary);">📝 ' + r.data.definition.substring(0, 120) + '...</span>';
            }
            html += '</div>';
        }
        
        resultsDiv.innerHTML = html;
    },
    
    showTopicInChat: function(chapterNum, topicKey) {
        closeModal('searchModal');
        this.openChatbot();
        setTimeout(function() {
            var chapter = MedicalKnowledgeBase.getChapter(chapterNum);
            var topic = chapter ? chapter.topics[topicKey] : null;
            if (topic) {
                var input = document.getElementById('chatInput');
                if (input) {
                    input.value = topic.arabicName;
                    AIIntegration.sendMessage();
                }
            }
        }, 500);
    },
    
    // ===== تلخيص =====
    openSummarizer: function() {
        var h = '<h2>📄 تلخيص ذكي</h2>';
        h += '<p style="font-size:0.8rem;color:var(--text-secondary);">اكتب اسم الموضوع لعمل ملخص سريع</p>';
        
        h += '<div style="display:flex;gap:5px;margin-bottom:10px;">';
        h += '<input type="text" id="summaryInput" placeholder="اكتب اسم الموضوع للتلخيص..." style="flex:1;padding:12px;border-radius:25px;border:2px solid var(--border-color);font-family:Tajawal;">';
        h += '<button class="modal-btn btn-primary" onclick="AIIntegration.doSummary()" style="padding:12px 20px;border-radius:25px;">📄 تلخيص</button>';
        h += '</div>';
        
        h += '<div id="summaryResult" style="text-align:right;max-height:50vh;overflow-y:auto;"></div>';
        
        h += '<div style="margin-top:10px;display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">';
        h += '<button class="modal-btn" onclick="AIIntegration.quickSummary(\'السكري\')" style="font-size:0.7rem;">السكري</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickSummary(\'ارتفاع ضغط الدم\')" style="font-size:0.7rem;">الضغط</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickSummary(\'الالتهاب الرئوي\')" style="font-size:0.7rem;">الالتهاب الرئوي</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickSummary(\'هشاشة العظام\')" style="font-size:0.7rem;">هشاشة العظام</button>';
        h += '</div>';
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'summaryModal\')">إغلاق</button>';
        
        openModal('summaryModal', h);
        
        setTimeout(function() {
            var input = document.getElementById('summaryInput');
            if (input) {
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') AIIntegration.doSummary();
                });
                input.focus();
            }
        }, 300);
    },
    
    doSummary: function() {
        var input = document.getElementById('summaryInput');
        var resultDiv = document.getElementById('summaryResult');
        
        if (!input || !input.value.trim()) {
            resultDiv.innerHTML = '<p style="color:var(--red);">❌ اكتب اسم الموضوع</p>';
            return;
        }
        
        var response = AIChatbot.generateSummary(input.value.trim());
        resultDiv.innerHTML = '<div style="background:var(--card-bg);padding:15px;border-radius:15px;border:1px solid var(--border-color);white-space:pre-wrap;">' + response.replace(/\n/g, '<br>') + '</div>';
    },
    
    quickSummary: function(topic) {
        var input = document.getElementById('summaryInput');
        if (input) {
            input.value = topic;
            this.doSummary();
        }
    },
    
    // ===== اختبار =====
    openQuizGenerator: function() {
        var h = '<h2>🎯 اختبار سريع</h2>';
        h += '<p style="font-size:0.8rem;color:var(--text-secondary);">اختبر معرفتك في أي موضوع</p>';
        
        h += '<div style="display:flex;gap:5px;margin-bottom:10px;">';
        h += '<input type="text" id="quizInput" placeholder="اختبرني في..." style="flex:1;padding:12px;border-radius:25px;border:2px solid var(--border-color);font-family:Tajawal;">';
        h += '<button class="modal-btn btn-primary" onclick="AIIntegration.doQuiz()" style="padding:12px 20px;border-radius:25px;">🎯 اختبار</button>';
        h += '</div>';
        
        h += '<div id="quizResult" style="text-align:right;max-height:50vh;overflow-y:auto;"></div>';
        
        h += '<div style="margin-top:10px;display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">';
        h += '<button class="modal-btn" onclick="AIIntegration.quickQuiz(\'السكري\')" style="font-size:0.7rem;">السكري</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickQuiz(\'الكسور\')" style="font-size:0.7rem;">الكسور</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickQuiz(\'السكتة الدماغية\')" style="font-size:0.7rem;">السكتة</button>';
        h += '<button class="modal-btn" onclick="AIIntegration.quickQuiz(\'قصور الدرقية\')" style="font-size:0.7rem;">الدرقية</button>';
        h += '</div>';
        
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'quizModal\')">إغلاق</button>';
        
        openModal('quizModal', h);
        
        setTimeout(function() {
            var input = document.getElementById('quizInput');
            if (input) {
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') AIIntegration.doQuiz();
                });
                input.focus();
            }
        }, 300);
    },
    
    doQuiz: function() {
        var input = document.getElementById('quizInput');
        var resultDiv = document.getElementById('quizResult');
        
        if (!input || !input.value.trim()) {
            resultDiv.innerHTML = '<p style="color:var(--red);">❌ اكتب الموضوع</p>';
            return;
        }
        
        var response = AIChatbot.generateQuiz(input.value.trim());
        resultDiv.innerHTML = '<div style="background:var(--card-bg);padding:15px;border-radius:15px;border:1px solid var(--border-color);white-space:pre-wrap;">' + response.replace(/\n/g, '<br>') + '</div>';
    },
    
    quickQuiz: function(topic) {
        var input = document.getElementById('quizInput');
        if (input) {
            input.value = topic;
            this.doQuiz();
        }
    },
    
    // ===== بطاقات تعليمية =====
    openFlashcardGenerator: function() {
        var allTopics = MedicalKnowledgeBase.getAllTopicNames();
        
        var h = '<h2>🃏 بطاقة تعليمية</h2>';
        h += '<p style="font-size:0.8rem;color:var(--text-secondary);">اختر موضوعاً لعرض بطاقة تعليمية</p>';
        
        h += '<div style="max-height:40vh;overflow-y:auto;text-align:right;">';
        var currentChapter = '';
        for (var i = 0; i < allTopics.length; i++) {
            var t = allTopics[i];
            if (t.chapter !== currentChapter) {
                if (currentChapter !== '') h += '</div>';
                currentChapter = t.chapter;
                h += '<h4 style="color:var(--gold-dark);margin-top:10px;">📂 ' + t.chapter + '</h4>';
                h += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
            }
            h += '<button class="modal-btn" onclick="AIIntegration.showFlashcard(' + t.chapterNum + ',\'' + t.topicKey + '\')" style="font-size:0.7rem;">' + t.arabicName + '</button>';
        }
        h += '</div></div>';
        
        h += '<div id="flashcardDisplay" style="margin-top:15px;"></div>';
        h += '<button class="modal-btn btn-close" onclick="closeModal(\'flashcardModal\')">إغلاق</button>';
        
        openModal('flashcardModal', h);
    },
    
    showFlashcard: function(chapterNum, topicKey) {
        var topic = MedicalKnowledgeBase.getTopic(chapterNum, topicKey);
        if (!topic) return;
        
        var fc = AIEngine.generateFlashcardContent({
            arabicName: topic.arabicName,
            topicKey: topicKey,
            data: topic
        });
        
        var html = '<div class="flashcard" onclick="this.classList.toggle(\'flipped\')" style="cursor:pointer;">';
        html += '<div class="flashcard-inner">';
        html += '<div class="flashcard-front">' + fc.front.replace(/\n/g, '<br>') + '</div>';
        html += '<div class="flashcard-back">' + fc.back.replace(/\n/g, '<br>') + '</div>';
        html += '</div></div>';
        html += '<p style="text-align:center;font-size:0.75rem;color:var(--text-secondary);margin-top:10px;">👆 اضغط على البطاقة لقلبها</p>';
        
        document.getElementById('flashcardDisplay').innerHTML = html;
    }
};

// ===== تهيئة النظام =====
function initAISystem() {
    AIIntegration.init();
}

// بدء التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initAISystem, 1500);
});
