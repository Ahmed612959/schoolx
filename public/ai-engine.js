// ==================== AI Engine - المحرك المتطور ====================
var AIEngine = {
    version: '2.0',
    
    medicalKeywords: {
        diseases: ['مرض', 'التهاب', 'عدوى', 'سرطان', 'فشل', 'قصور', 'انسداد', 'نزيف', 'جلطة', 'تليف', 'سكري', 'ربو', 'ذبحة', 'سكتة', 'كسر', 'هشاشة', 'ورم', 'خبيث', 'حميد'],
        symptoms: ['ألم', 'صداع', 'حمى', 'غثيان', 'دوار', 'تعب', 'ضعف', 'تورم', 'احمرار', 'حكة', 'سعال', 'ضيق تنفس', 'خفقان', 'رعاش', 'إمساك', 'إسهال', 'فقدان وزن', 'زيادة وزن'],
        treatments: ['علاج', 'جراحة', 'دواء', 'عملية', 'علاج كيميائي', 'مضاد', 'مسكن', 'أنسولين', 'جبس', 'رد', 'بتر', 'استئصال'],
        nursing: ['تمريض', 'عناية', 'رعاية', 'ملاحظة', 'متابعة', 'تقييم', 'تخطيط', 'تنفيذ', 'NPO', 'وضعية', 'فاولر', 'تعقيم', 'ضماد'],
        vitals: ['ضغط الدم', 'النبض', 'الحرارة', 'التنفس', 'الأكسجين', 'السكر', 'GCS', 'تشبع'],
        diagnostic: ['تشخيص', 'فحص', 'تحليل', 'أشعة', 'CT', 'MRI', 'تخطيط', 'خزعة', 'منظار', 'رنين'],
        complications: ['مضاعفات', 'خطورة', 'خطر', 'نزيف', 'عدوى', 'فشل', 'صدمة', 'غرغرينا']
    },

    extractKeywords: function(text) {
        var keywords = [];
        var textLower = text.toLowerCase();
        
        for (var category in this.medicalKeywords) {
            var words = this.medicalKeywords[category];
            for (var i = 0; i < words.length; i++) {
                var word = words[i].toLowerCase();
                if (textLower.indexOf(word) !== -1) {
                    keywords.push({
                        word: words[i],
                        category: category,
                        importance: this.calculateImportance(word, textLower)
                    });
                }
            }
        }
        
        return keywords.sort(function(a, b) { return b.importance - a.importance; });
    },

    calculateImportance: function(word, text) {
        var escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp(escapedWord, 'gi');
        var count = (text.match(regex) || []).length;
        var position = text.indexOf(word);
        var positionScore = position === 0 ? 5 : position < text.length * 0.2 ? 3 : 1;
        return count * positionScore;
    },

    classifyQuery: function(query) {
        var queryLower = query.toLowerCase();
        var classification = {
            isDefinition: false,
            isSymptomQuery: false,
            isTreatmentQuery: false,
            isNursingQuery: false,
            isCauseQuery: false,
            isComplicationQuery: false,
            isDiagnosisQuery: false,
            isComparisonQuery: false,
            isListQuery: false,
            isQuizRequest: false,
            isSummaryRequest: false
        };
        
        if (/ما هو|عرف|تعريف|what is|define/i.test(queryLower)) classification.isDefinition = true;
        if (/أعراض|علامات|symptoms|signs|manifestations/i.test(queryLower)) classification.isSymptomQuery = true;
        if (/علاج|treatment|therapy|أدوية|medication/i.test(queryLower)) classification.isTreatmentQuery = true;
        if (/تمريض|رعاية|عناية|nursing|care|management/i.test(queryLower)) classification.isNursingQuery = true;
        if (/أسباب|causes|etiology|عوامل|risk factors/i.test(queryLower)) classification.isCauseQuery = true;
        if (/مضاعفات|complications/i.test(queryLower)) classification.isComplicationQuery = true;
        if (/تشخيص|diagnosis|فحص|تحليل|test/i.test(queryLower)) classification.isDiagnosisQuery = true;
        if (/قارن|الفرق|compare|difference|بين.*و/i.test(queryLower)) classification.isComparisonQuery = true;
        if (/اذكر|عدد|list|أنواع|types/i.test(queryLower)) classification.isListQuery = true;
        if (/اختبر|امتحان|quiz|test me/i.test(queryLower)) classification.isQuizRequest = true;
        if (/لخص|ملخص|summarize|summary/i.test(queryLower)) classification.isSummaryRequest = true;
        
        return classification;
    },

    summarize: function(text, maxSentences) {
        maxSentences = maxSentences || 3;
        var sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 10; });
        if (sentences.length <= maxSentences) return text;
        
        var scored = sentences.map(function(sentence, index) {
            var score = 0;
            var keywords = AIEngine.extractKeywords(sentence);
            score += keywords.length * 2;
            if (index === 0) score += 5;
            if (index === sentences.length - 1) score += 2;
            for (var i = 0; i < keywords.length; i++) {
                if (keywords[i].category === 'diseases' || keywords[i].category === 'treatments') score += 3;
            }
            return { sentence: sentence.trim(), score: score };
        });
        
        scored.sort(function(a, b) { return b.score - a.score; });
        return scored.slice(0, maxSentences).map(function(s) { return s.sentence; }).join('. ') + '.';
    },

    generateFlashcardContent: function(topic) {
        var front = '';
        var back = '';
        
        front += '📝 **' + topic.arabicName + '** (' + topic.topicKey + ')\n\n';
        if (topic.data.definition) {
            front += '❓ ما هو تعريف ' + topic.arabicName + '؟\n';
        }
        
        back += '✅ **' + topic.arabicName + '**\n\n';
        if (topic.data.definition) {
            back += '📝 ' + topic.data.definition + '\n\n';
        }
        if (topic.data.symptoms) {
            back += '🩺 الأعراض: ' + (Array.isArray(topic.data.symptoms) ? topic.data.symptoms.slice(0, 5).join('، ') : topic.data.symptoms) + '\n\n';
        }
        if (topic.data.nursingCare) {
            back += '🏥 التمريض: ' + (Array.isArray(topic.data.nursingCare) ? topic.data.nursingCare.slice(0, 3).join('، ') : topic.data.nursingCare) + '\n\n';
        }
        
        return { front: front, back: back };
    }
};
