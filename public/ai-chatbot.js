// ==================== AI Chatbot - المساعد الدراسي الذكي المتطور ====================
var AIChatbot = {
    conversationHistory: [],
    maxHistory: 50,
    userLevel: 'beginner', // beginner, intermediate, advanced
    studyMode: 'normal', // normal, exam, quick_review

    // ===== الرد الرئيسي =====
    respond: function(userMessage) {
        userMessage = userMessage.trim();
        this.addToHistory('user', userMessage);
        
        var msgLower = userMessage.toLowerCase();
        
        // تحية
        if (this.isGreeting(msgLower)) {
            var response = this.getGreetingResponse();
            this.addToHistory('bot', response);
            return response;
        }
        
        // أمر مسح التاريخ
        if (msgLower === 'مسح' || msgLower === 'clear' || msgLower === 'جديد') {
            this.clearHistory();
            var response = '✅ تم مسح سجل المحادثة. ابدأ من جديد!';
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب اختبار
        if (msgLower.indexOf('اختبرني') !== -1 || msgLower.indexOf('امتحان') !== -1 || msgLower.indexOf('quiz') !== -1) {
            var response = this.generateQuiz(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب تلخيص
        if (msgLower.indexOf('لخص') !== -1 || msgLower.indexOf('ملخص') !== -1 || msgLower.indexOf('summary') !== -1) {
            var response = this.generateSummary(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب مقارنة
        if (msgLower.indexOf('قارن') !== -1 || msgLower.indexOf('الفرق') !== -1 || msgLower.indexOf('compare') !== -1) {
            var response = this.generateComparison(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب أعراض
        if (msgLower.indexOf('أعراض') !== -1 || msgLower.indexOf('علامات') !== -1 || msgLower.indexOf('symptoms') !== -1) {
            var response = this.getSymptomsInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب علاج
        if (msgLower.indexOf('علاج') !== -1 || msgLower.indexOf('treatment') !== -1 || msgLower.indexOf('أدوية') !== -1) {
            var response = this.getTreatmentInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب تمريض
        if (msgLower.indexOf('تمريض') !== -1 || msgLower.indexOf('رعاية') !== -1 || msgLower.indexOf('nursing') !== -1) {
            var response = this.getNursingInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب أسباب
        if (msgLower.indexOf('أسباب') !== -1 || msgLower.indexOf('causes') !== -1 || msgLower.indexOf('عوامل') !== -1) {
            var response = this.getCausesInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب مضاعفات
        if (msgLower.indexOf('مضاعفات') !== -1 || msgLower.indexOf('complications') !== -1) {
            var response = this.getComplicationsInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب تشخيص
        if (msgLower.indexOf('تشخيص') !== -1 || msgLower.indexOf('diagnosis') !== -1 || msgLower.indexOf('فحص') !== -1) {
            var response = this.getDiagnosisInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب تعريف
        if (msgLower.indexOf('ما هو') !== -1 || msgLower.indexOf('عرف') !== -1 || msgLower.indexOf('تعريف') !== -1 || msgLower.indexOf('what is') !== -1) {
            var response = this.getDefinitionInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // طلب قائمة
        if (msgLower.indexOf('اذكر') !== -1 || msgLower.indexOf('عدد') !== -1 || msgLower.indexOf('list') !== -1 || msgLower.indexOf('أنواع') !== -1) {
            var response = this.getListInfo(msgLower);
            this.addToHistory('bot', response);
            return response;
        }
        
        // بحث عام في قاعدة المعرفة
        var searchResults = MedicalKnowledgeBase.search(userMessage);
        if (searchResults.length > 0) {
            var response = this.formatDetailedResponse(searchResults);
            this.addToHistory('bot', response);
            return response;
        }
        
        // مساعدة
        if (msgLower.indexOf('مساعدة') !== -1 || msgLower.indexOf('help') !== -1) {
            var response = this.getHelpMessage();
            this.addToHistory('bot', response);
            return response;
        }
        
        // اقتراحات
        var response = this.getSuggestions(msgLower);
        this.addToHistory('bot', response);
        return response;
    },

    // ===== تنسيق الرد المفصل =====
    formatDetailedResponse: function(results) {
        if (results.length === 0) return 'لم أجد معلومات عن هذا الموضوع.';
        
        var response = '';
        var count = Math.min(results.length, 3);
        
        for (var i = 0; i < count; i++) {
            var r = results[i];
            var data = r.data;
            
            response += this.formatTopicCard(r, i + 1);
            
            if (i < count - 1) {
                response += '\n' + '─'.repeat(40) + '\n\n';
            }
        }
        
        if (results.length > 3) {
            response += '\n📊 *تم العثور على ' + results.length + ' نتيجة. حدد موضوعك بدقة أكثر.*';
        }
        
        // إضافة أسئلة مقترحة
        response += '\n\n' + this.generateRelatedQuestions(results[0]);
        
        return response;
    },

    // ===== بطاقة الموضوع =====
    formatTopicCard: function(r, num) {
        var data = r.data;
        var card = '';
        
        card += '╔══════════════════════════════════╗\n';
        card += '║  📚 **' + num + '. ' + r.name + '**\n';
        card += '║  📂 ' + r.chapter + '\n';
        card += '╚══════════════════════════════════╝\n\n';
        
        // التعريف
        if (data.definition) {
            card += '📝 **التعريف:**\n';
            card += data.definition + '\n\n';
        }
        
        // الأنواع
        if (data.types) {
            card += '📊 **الأنواع:**\n';
            for (var typeKey in data.types) {
                card += '• **' + typeKey + '**: ' + data.types[typeKey] + '\n';
            }
            card += '\n';
        }
        
        // الأعراض
        if (data.symptoms) {
            card += '🩺 **الأعراض الرئيسية:**\n';
            var symptoms = Array.isArray(data.symptoms) ? data.symptoms.slice(0, 5) : [data.symptoms];
            symptoms.forEach(function(s) { card += '• ' + s + '\n'; });
            if (Array.isArray(data.symptoms) && data.symptoms.length > 5) {
                card += '• ...والمزيد (اكتب "أعراض ' + r.englishName + '" للقائمة الكاملة)\n';
            }
            card += '\n';
        }
        
        // الأسباب
        if (data.causes) {
            card += '🔬 **الأسباب:**\n';
            var causes = Array.isArray(data.causes) ? data.causes.slice(0, 4) : [data.causes];
            causes.forEach(function(c) { card += '• ' + c + '\n'; });
            card += '\n';
        }
        
        // العلاج
        if (data.treatment) {
            card += '💊 **العلاج:**\n';
            var treatments = Array.isArray(data.treatment) ? data.treatment.slice(0, 4) : [data.treatment];
            treatments.forEach(function(t) { card += '• ' + t + '\n'; });
            card += '\n';
        }
        
        // الرعاية التمريضية
        if (data.nursingCare) {
            card += '🏥 **الرعاية التمريضية:**\n';
            var care = Array.isArray(data.nursingCare) ? data.nursingCare.slice(0, 4) : [data.nursingCare];
            care.forEach(function(c) { card += '• ' + c + '\n'; });
            card += '\n';
        }
        
        // علامات خاصة
        if (data.specialSigns) {
            card += '🔍 **العلامات الخاصة:**\n';
            for (var signKey in data.specialSigns) {
                card += '• **' + signKey + '**: ' + data.specialSigns[signKey] + '\n';
            }
            card += '\n';
        }
        
        // عوامل الخطر
        if (data.riskFactors) {
            card += '⚠️ **عوامل الخطر:**\n';
            if (data.riskFactors.modifiable) {
                card += '• *قابل للتعديل:* ' + data.riskFactors.modifiable.join('، ') + '\n';
            }
            if (data.riskFactors.nonModifiable) {
                card += '• *غير قابل للتعديل:* ' + data.riskFactors.nonModifiable.join('، ') + '\n';
            }
            card += '\n';
        }
        
        // المضاعفات
        if (data.complications) {
            card += '🚨 **المضاعفات:**\n';
            var comps = Array.isArray(data.complications) ? data.complications.slice(0, 4) : [data.complications];
            comps.forEach(function(c) { card += '• ' + c + '\n'; });
            card += '\n';
        }
        
        // التشخيص
        if (data.diagnosis) {
            card += '🔬 **التشخيص:**\n';
            var diag = Array.isArray(data.diagnosis) ? data.diagnosis.slice(0, 4) : [data.diagnosis];
            diag.forEach(function(d) { card += '• ' + d + '\n'; });
            card += '\n';
        }
        
        return card;
    },

    // ===== توليد اختبار =====
    generateQuiz: function(msg) {
        var searchResults = MedicalKnowledgeBase.search(msg.replace(/اختبرني|امتحان|quiz|في/g, ''));
        
        if (searchResults.length === 0) {
            return '🎯 **وضع الاختبار**\n\nلم أجد موضوعاً محدداً. جرب:\n• "اختبرني في السكري"\n• "امتحان في الكسور"\n• "اختبرني في الأمراض التنفسية"';
        }
        
        var topic = searchResults[0];
        var data = topic.data;
        var questions = [];
        
        // توليد أسئلة متنوعة
        if (data.definition) {
            questions.push({
                q: '❓ ما هو تعريف ' + topic.name + '؟',
                a: data.definition
            });
        }
        
        if (data.symptoms && Array.isArray(data.symptoms) && data.symptoms.length > 0) {
            questions.push({
                q: '❓ اذكر 3 أعراض لـ ' + topic.name,
                a: data.symptoms.slice(0, 3).join('، ')
            });
        }
        
        if (data.causes && Array.isArray(data.causes) && data.causes.length > 0) {
            questions.push({
                q: '❓ ما هي أسباب ' + topic.name + '؟',
                a: data.causes.slice(0, 3).join('، ')
            });
        }
        
        if (data.nursingCare && Array.isArray(data.nursingCare) && data.nursingCare.length > 0) {
            questions.push({
                q: '❓ اذكر 3 تدخلات تمريضية لـ ' + topic.name,
                a: data.nursingCare.slice(0, 3).join('، ')
            });
        }
        
        if (data.types) {
            questions.push({
                q: '❓ اذكر أنواع ' + topic.name,
                a: Object.keys(data.types).map(function(k) { return k + ': ' + data.types[k]; }).join('، ')
            });
        }
        
        var quiz = '🎯 **اختبار سريع: ' + topic.name + '**\n\n';
        quiz += 'أجب عن الأسئلة التالية ثم تحقق من إجاباتك:\n\n';
        
        for (var i = 0; i < Math.min(questions.length, 5); i++) {
            quiz += '**' + (i+1) + '.** ' + questions[i].q + '\n';
            quiz += '   ✅ *الإجابة:* ' + questions[i].a + '\n\n';
        }
        
        quiz += '📊 **عدد الأسئلة:** ' + Math.min(questions.length, 5) + '\n';
        quiz += '💡 *نصيحة:* اكتب "اختبرني في [موضوع]" لتوليد اختبار جديد';
        
        return quiz;
    },

    // ===== توليد ملخص =====
    generateSummary: function(msg) {
        var searchResults = MedicalKnowledgeBase.search(msg.replace(/لخص|ملخص|summary|عن/g, ''));
        
        if (searchResults.length === 0) {
            return '📄 **وضع التلخيص**\n\nلم أجد موضوعاً محدداً. جرب:\n• "لخص السكري"\n• "ملخص الكسور"';
        }
        
        var topic = searchResults[0];
        var data = topic.data;
        
        var summary = '📄 **ملخص: ' + topic.name + '**\n';
        summary += '📂 الفصل: ' + topic.chapter + '\n';
        summary += '═'.repeat(30) + '\n\n';
        
        if (data.definition) {
            summary += '📝 **التعريف:** ' + data.definition + '\n\n';
        }
        
        if (data.types) {
            summary += '📊 **الأنواع:** ';
            summary += Object.keys(data.types).map(function(k) { return k + ': ' + data.types[k]; }).join(' | ');
            summary += '\n\n';
        }
        
        if (data.causes) {
            summary += '🔬 **الأسباب الرئيسية:** ';
            summary += (Array.isArray(data.causes) ? data.causes.slice(0, 3) : [data.causes]).join('، ');
            summary += '\n\n';
        }
        
        if (data.symptoms) {
            summary += '🩺 **الأعراض:** ';
            summary += (Array.isArray(data.symptoms) ? data.symptoms.slice(0, 5) : [data.symptoms]).join('، ');
            summary += '\n\n';
        }
        
        if (data.nursingCare) {
            summary += '🏥 **التدخلات التمريضية الأساسية:**\n';
            (Array.isArray(data.nursingCare) ? data.nursingCare.slice(0, 5) : [data.nursingCare]).forEach(function(c, i) {
                summary += (i+1) + '. ' + c + '\n';
            });
            summary += '\n';
        }
        
        if (data.treatment) {
            summary += '💊 **العلاج:** ';
            summary += (Array.isArray(data.treatment) ? data.treatment.slice(0, 3) : [data.treatment]).join('، ');
            summary += '\n\n';
        }
        
        summary += '═'.repeat(30) + '\n';
        summary += '📌 *للمزيد من التفاصيل، اسأل عن أي جزء محدد.*';
        
        return summary;
    },

    // ===== توليد مقارنة =====
    generateComparison: function(msg) {
        var msgClean = msg.replace(/قارن|الفرق|بين|compare|between|و/g, ' ').replace(/\s+/g, ' ').trim();
        var words = msgClean.split(' ');
        
        // محاولة استخراج موضوعين للمقارنة
        var searchResults = MedicalKnowledgeBase.search(msgClean);
        
        if (searchResults.length < 2) {
            return '🔍 **وضع المقارنة**\n\nلم أجد موضوعين للمقارنة. جرب:\n• "قارن بين السكري النوع الأول والثاني"\n• "الفرق بين الكسر المفتوح والمغلق"\n• "قارن بين قصور وفرط نشاط الغدة الدرقية"';
        }
        
        var comparison = '⚖️ **مقارنة:**\n\n';
        
        for (var i = 0; i < Math.min(searchResults.length, 3); i++) {
            var r = searchResults[i];
            comparison += '**' + (i+1) + '. ' + r.name + '**\n';
            if (r.data.definition) comparison += '   📝 ' + r.data.definition + '\n';
            if (r.data.symptoms) {
                comparison += '   🩺 الأعراض: ' + (Array.isArray(r.data.symptoms) ? r.data.symptoms.slice(0, 3).join('، ') : r.data.symptoms) + '\n';
            }
            if (r.data.treatment) {
                comparison += '   💊 العلاج: ' + (Array.isArray(r.data.treatment) ? r.data.treatment.slice(0, 3).join('، ') : r.data.treatment) + '\n';
            }
            comparison += '\n';
        }
        
        return comparison;
    },

    // ===== أسئلة مقترحة =====
    generateRelatedQuestions: function(result) {
        var data = result.data;
        var questions = [];
        var topicName = result.arabicName || result.name;
        var englishName = result.englishName || result.topicKey;
        
        if (data.symptoms) questions.push('🩺 ما أعراض ' + topicName + '؟');
        if (data.causes) questions.push('🔬 ما أسباب ' + topicName + '؟');
        if (data.treatment) questions.push('💊 ما علاج ' + topicName + '؟');
        if (data.nursingCare) questions.push('🏥 ما الرعاية التمريضية لـ ' + topicName + '؟');
        if (data.complications) questions.push('🚨 ما مضاعفات ' + topicName + '؟');
        if (data.diagnosis) questions.push('🔍 كيف يتم تشخيص ' + topicName + '؟');
        if (data.types) questions.push('📊 ما أنواع ' + topicName + '؟');
        questions.push('📝 اختبرني في ' + topicName);
        questions.push('📄 لخص ' + topicName);
        
        var html = '💡 **أسئلة مقترحة:**\n';
        for (var i = 0; i < Math.min(questions.length, 5); i++) {
            html += '• ' + questions[i] + '\n';
        }
        
        return html;
    },

    // ===== دوال المعلومات المتخصصة =====
    getSymptomsInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/أعراض|علامات|symptoms/g, ''));
        if (results.length === 0) return 'لم أجد معلومات عن الأعراض. حدد المرض من فضلك.';
        
        var topic = results[0];
        var response = '🩺 **أعراض ' + topic.name + ':**\n\n';
        
        if (topic.data.symptoms) {
            var symptoms = Array.isArray(topic.data.symptoms) ? topic.data.symptoms : [topic.data.symptoms];
            symptoms.forEach(function(s, i) { response += (i+1) + '. ' + s + '\n'; });
        } else {
            response += 'لا توجد معلومات مفصلة عن الأعراض. جرب السؤال عن المرض نفسه.';
        }
        
        if (topic.data.lifeThreatening) {
            response += '\n⚠️ **أعراض مهددة للحياة:**\n';
            var life = Array.isArray(topic.data.lifeThreatening) ? topic.data.lifeThreatening : [topic.data.lifeThreatening];
            life.forEach(function(l) { response += '• ' + l + '\n'; });
        }
        
        return response;
    },

    getTreatmentInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/علاج|treatment|أدوية/g, ''));
        if (results.length === 0) return 'لم أجد معلومات عن العلاج. حدد المرض من فضلك.';
        
        var topic = results[0];
        var response = '💊 **علاج ' + topic.name + ':**\n\n';
        
        if (topic.data.treatment) {
            var treatments = Array.isArray(topic.data.treatment) ? topic.data.treatment : [topic.data.treatment];
            treatments.forEach(function(t, i) { response += (i+1) + '. ' + t + '\n'; });
        }
        
        if (topic.data.treatmentModalities) {
            response += '\n📋 **طرق العلاج:**\n';
            var mods = Array.isArray(topic.data.treatmentModalities) ? topic.data.treatmentModalities : [topic.data.treatmentModalities];
            mods.forEach(function(m) { response += '• ' + m + '\n'; });
        }
        
        return response;
    },

    getNursingInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/تمريض|رعاية|nursing|عناية/g, ''));
        if (results.length === 0) return 'لم أجد معلومات تمريضية. حدد الموضوع من فضلك.';
        
        var topic = results[0];
        var response = '🏥 **الرعاية التمريضية لـ ' + topic.name + ':**\n\n';
        
        if (topic.data.nursingCare) {
            var care = Array.isArray(topic.data.nursingCare) ? topic.data.nursingCare : [topic.data.nursingCare];
            care.forEach(function(c, i) { response += (i+1) + '. ' + c + '\n'; });
        }
        
        if (topic.data.nursingRoles) {
            response += '\n👩‍⚕️ **الأدوار التمريضية:**\n';
            for (var role in topic.data.nursingRoles) {
                response += '• **' + role + '**: ' + topic.data.nursingRoles[role] + '\n';
            }
        }
        
        if (topic.data.preoperativeCare) {
            response += '\n📋 **الرعاية قبل الجراحة:**\n';
            topic.data.preoperativeCare.forEach(function(c) { response += '• ' + c + '\n'; });
        }
        
        return response;
    },

    getCausesInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/أسباب|causes|عوامل/g, ''));
        if (results.length === 0) return 'لم أجد معلومات عن الأسباب. حدد المرض من فضلك.';
        
        var topic = results[0];
        var response = '🔬 **أسباب ' + topic.name + ':**\n\n';
        
        if (topic.data.causes) {
            var causes = Array.isArray(topic.data.causes) ? topic.data.causes : [topic.data.causes];
            causes.forEach(function(c, i) { response += (i+1) + '. ' + c + '\n'; });
        }
        
        if (topic.data.riskFactors) {
            response += '\n⚠️ **عوامل الخطر:**\n';
            if (topic.data.riskFactors.modifiable) {
                response += '*قابل للتعديل:* ' + topic.data.riskFactors.modifiable.join('، ') + '\n';
            }
            if (topic.data.riskFactors.nonModifiable) {
                response += '*غير قابل للتعديل:* ' + topic.data.riskFactors.nonModifiable.join('، ') + '\n';
            }
        }
        
        return response;
    },

    getComplicationsInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/مضاعفات|complications/g, ''));
        if (results.length === 0) return 'لم أجد معلومات عن المضاعفات.';
        
        var topic = results[0];
        var response = '🚨 **مضاعفات ' + topic.name + ':**\n\n';
        
        if (topic.data.complications) {
            var comps = Array.isArray(topic.data.complications) ? topic.data.complications : [topic.data.complications];
            comps.forEach(function(c, i) { response += (i+1) + '. ' + c + '\n'; });
        } else {
            response += 'لا توجد معلومات مفصلة عن المضاعفات.';
        }
        
        return response;
    },

    getDiagnosisInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/تشخيص|diagnosis|فحص/g, ''));
        if (results.length === 0) return 'لم أجد معلومات عن التشخيص.';
        
        var topic = results[0];
        var response = '🔬 **تشخيص ' + topic.name + ':**\n\n';
        
        if (topic.data.diagnosis) {
            var diag = Array.isArray(topic.data.diagnosis) ? topic.data.diagnosis : [topic.data.diagnosis];
            diag.forEach(function(d, i) { response += (i+1) + '. ' + d + '\n'; });
        } else {
            response += 'لا توجد معلومات مفصلة عن التشخيص.';
        }
        
        return response;
    },

    getDefinitionInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/ما هو|عرف|تعريف|what is/g, ''));
        if (results.length === 0) return 'لم أجد تعريفاً لهذا الموضوع.';
        
        var topic = results[0];
        var response = '📝 **' + topic.name + '**\n\n';
        
        if (topic.data.definition) {
            response += topic.data.definition + '\n\n';
        }
        
        if (topic.data.nickname) {
            response += '🔖 *يعرف أيضاً بـ:* ' + topic.data.nickname + '\n\n';
        }
        
        if (topic.data.types) {
            response += '📊 **الأنواع:**\n';
            for (var typeKey in topic.data.types) {
                response += '• ' + typeKey + ': ' + topic.data.types[typeKey] + '\n';
            }
        }
        
        return response;
    },

    getListInfo: function(msg) {
        var results = MedicalKnowledgeBase.search(msg.replace(/اذكر|عدد|list|أنواع/g, ''));
        if (results.length === 0) return 'لم أجد قائمة لهذا الموضوع.';
        
        var topic = results[0];
        var response = '📋 **' + topic.name + ':**\n\n';
        
        // محاولة عرض أي قوائم موجودة
        var found = false;
        var data = topic.data;
        
        if (data.types) {
            for (var typeKey in data.types) {
                response += '• ' + typeKey + ': ' + data.types[typeKey] + '\n';
                found = true;
            }
        }
        
        if (data.causes && Array.isArray(data.causes)) {
            response += '\n**الأسباب:**\n';
            data.causes.forEach(function(c) { response += '• ' + c + '\n'; });
            found = true;
        }
        
        if (data.symptoms && Array.isArray(data.symptoms)) {
            response += '\n**الأعراض:**\n';
            data.symptoms.forEach(function(s) { response += '• ' + s + '\n'; });
            found = true;
        }
        
        if (!found) {
            response += 'استخدم معلومات الموضوع المتاحة أعلاه.';
        }
        
        return response;
    },

    // ===== الاقتراحات =====
    getSuggestions: function(msg) {
        var response = '🤔 لم أفهم سؤالك تماماً.\n\n';
        response += '💡 **جرّب:**\n';
        response += '• اكتب اسم المرض مباشرة: "السكري"\n';
        response += '• اسأل عن الأعراض: "أعراض الالتهاب الرئوي"\n';
        response += '• اسأل عن العلاج: "علاج ارتفاع الضغط"\n';
        response += '• اسأل عن التمريض: "الرعاية التمريضية للكسور"\n';
        response += '• اختبر نفسك: "اختبرني في السكري"\n';
        response += '• اطلب ملخص: "لخص الذبحة الصدرية"\n';
        response += '• قارن: "الفرق بين الكسر المفتوح والمغلق"\n';
        response += '• اكتب "مساعدة" للقائمة الكاملة';
        
        return response;
    },

    // ===== التحية =====
    isGreeting: function(msg) {
        var greetings = ['مرحبا', 'اهلا', 'سلام', 'صباح', 'مساء', 'هاي', 'hello', 'hi', 'hey'];
        return greetings.some(function(g) { return msg.indexOf(g) !== -1; });
    },

    getGreetingResponse: function() {
        var hour = new Date().getHours();
        var timeGreeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء الخير';
        
        var response = timeGreeting + '! 🌟\n\n';
        response += 'أنا **مساعدك الدراسي الذكي** لمنهج **Medical Surgical Nursing**.\n\n';
        response += '📚 **قاعدة معرفتي:** 11 فصلاً كاملاً\n';
        response += '🦠 **الأمراض:** 30+ مرض وحالة\n';
        response += '💊 **الأدوية:** 15+ دواء\n';
        response += '🏥 **الإجراءات التمريضية:** 20+ إجراء\n\n';
        
        response += '🎯 **ماذا يمكنني أن أفعل لك؟**\n\n';
        response += '📝 **شرح أي موضوع:** اكتب اسم المرض\n';
        response += '🩺 **الأعراض:** "أعراض + المرض"\n';
        response += '💊 **العلاج:** "علاج + المرض"\n';
        response += '🏥 **التمريض:** "رعاية تمريضية + المرض"\n';
        response += '🔬 **الأسباب:** "أسباب + المرض"\n';
        response += '📊 **الأنواع:** "أنواع + المرض"\n';
        response += '🚨 **المضاعفات:** "مضاعفات + المرض"\n';
        response += '🔍 **التشخيص:** "تشخيص + المرض"\n';
        response += '📄 **تلخيص:** "لخص + المرض"\n';
        response += '🎯 **اختبار:** "اختبرني في + المرض"\n';
        response += '⚖️ **مقارنة:** "قارن بين + مرضين"\n\n';
        
        response += '💡 *اكتب "مساعدة" في أي وقت.*\n';
        response += '🗑️ *اكتب "مسح" لبدء محادثة جديدة.*';
        
        return response;
    },

    // ===== المساعدة =====
    getHelpMessage: function() {
        var response = '🤖 **دليل استخدام المساعد الذكي**\n\n';
        response += '═'.repeat(30) + '\n\n';
        
        response += '📝 **الأوامر الأساسية:**\n';
        response += '• اكتب اسم المرض مباشرة للمعلومات الكاملة\n';
        response += '• "أعراض [المرض]" للأعراض\n';
        response += '• "علاج [المرض]" للعلاج\n';
        response += '• "أسباب [المرض]" للأسباب\n';
        response += '• "رعاية تمريضية [المرض]" للتدخلات\n';
        response += '• "تشخيص [المرض]" للتشخيص\n';
        response += '• "مضاعفات [المرض]" للمضاعفات\n';
        response += '• "أنواع [المرض]" للأنواع\n\n';
        
        response += '🎯 **أوامر متقدمة:**\n';
        response += '• "لخص [المرض]" لملخص سريع\n';
        response += '• "اختبرني في [المرض]" لاختبار\n';
        response += '• "قارن بين [مرض1] و [مرض2]" للمقارنة\n';
        response += '• "اذكر [الموضوع]" للقوائم\n\n';
        
        response += '⚙️ **أوامر النظام:**\n';
        response += '• "مساعدة" - هذه القائمة\n';
        response += '• "مسح" - مسح سجل المحادثة\n\n';
        
        response += '📚 **المواضيع المتاحة:**\n';
        response += 'السكري، ارتفاع ضغط الدم، الالتهاب الرئوي، الربو، الذبحة الصدرية، السكتة الدماغية، الكسور، هشاشة العظام، التهاب المعدة، الزائدة الدودية، التهاب المرارة، احتباس البول، سلس البول، الصداع، السرطان، الحروق، الرضوح، الغيبوبة، قصور الدرقية، فرط الدرقية، الرعاية التلطيفية، الرعاية ما حول الجراحة...';
        
        return response;
    },

    // ===== التاريخ =====
    addToHistory: function(role, message) {
        this.conversationHistory.push({ role: role, message: message, time: new Date().toISOString() });
        if (this.conversationHistory.length > this.maxHistory) this.conversationHistory.shift();
    },

    clearHistory: function() { this.conversationHistory = []; }
};
