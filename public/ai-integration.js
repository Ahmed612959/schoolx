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
            chatbotBtn.className
