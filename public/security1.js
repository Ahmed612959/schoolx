// security.js - حماية كاملة

(function() {
    'use strict';
    
    // ===== منع Console تماماً =====
    const noop = function() {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.info = noop;
    console.debug = noop;
    console.trace = noop;
    console.table = noop;
    console.group = noop;
    console.groupEnd = noop;
    console.groupCollapsed = noop;
    console.time = noop;
    console.timeEnd = noop;
    console.timeLog = noop;
    console.assert = noop;
    console.count = noop;
    console.countReset = noop;
    console.dir = noop;
    console.dirxml = noop;
    console.profile = noop;
    console.profileEnd = noop;
    
    // ===== منع أي محاولة لإعادة تعريف Console =====
    Object.defineProperty(window, 'console', {
        value: console,
        writable: false,
        configurable: false
    });
    
    // ===== منع فتح DevTools =====
    document.addEventListener('keydown', function(e) {
        const blockedKeys = ['F12', 'F5'];
        const blockedCombos = [
            { ctrl: true, shift: true, key: 'I' },
            { ctrl: true, shift: true, key: 'J' },
            { ctrl: true, shift: true, key: 'C' },
            { ctrl: true, key: 'U' },
            { ctrl: true, key: 'S' },
            { ctrl: true, key: 'P' },
            { ctrl: true, shift: true, key: 'P' },
            { meta: true, alt: true, key: 'I' }
        ];
        
        // التحقق من المفاتيح المحظورة
        if (blockedKeys.includes(e.key)) {
            e.preventDefault();
            return false;
        }
        
        // التحقق من التراكيب المحظورة
        for (const combo of blockedCombos) {
            const ctrlMatch = combo.ctrl ? e.ctrlKey : true;
            const shiftMatch = combo.shift ? e.shiftKey : true;
            const metaMatch = combo.meta ? e.metaKey : true;
            const altMatch = combo.alt ? e.altKey : true;
            const keyMatch = combo.key ? e.key.toUpperCase() === combo.key.toUpperCase() : true;
            
            if (ctrlMatch && shiftMatch && metaMatch && altMatch && keyMatch) {
                e.preventDefault();
                return false;
            }
        }
        
        return true;
    });
    
    // ===== منع النقر بزر الماوس الأيمن =====
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // ===== منع التحديد =====
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    // ===== منع النسخ والقص =====
    document.addEventListener('copy', function(e) {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('cut', function(e) {
        e.preventDefault();
        return false;
    });
    
    // ===== منع السحب =====
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    // ===== كشف DevTools =====
    let devtoolsOpen = false;
    const element = new Image();
    
    Object.defineProperty(element, 'id', {
        get: function() {
            devtoolsOpen = true;
            throw new Error('DevTools detected');
        }
    });
    
    setInterval(function() {
        devtoolsOpen = false;
        console.dir(element);
        if (devtoolsOpen) {
            // تم فتح DevTools
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a2526;color:#d4af37;font-family:sans-serif;flex-direction:column;text-align:center;padding:20px;">
                    <h1 style="font-size:3rem;">🚫</h1>
                    <h2 style="font-size:2rem;">ممنوع فتح أدوات المطور!</h2>
                    <p style="font-size:1.2rem;color:#ccc;max-width:500px;">تم تعطيل أدوات المطور لحماية حقوق الملكية.</p>
                    <button onclick="location.reload()" style="margin-top:20px;padding:12px 30px;background:#d4af37;color:#1a2526;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:bold;">🔄 إعادة تحميل الصفحة</button>
                </div>
            `;
            document.body.style.margin = '0';
            document.body.style.padding = '0';
        }
    }, 1000);
    
    console.log('%c🔒 الصفحة محمية بالكامل!', 'font-size: 20px; color: #d4af37; font-weight: bold;');
})();
