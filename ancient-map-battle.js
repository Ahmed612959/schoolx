// ====================== البطولات الأسبوعية ======================

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function getSmartApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE && API_BASE.trim() !== '') 
        return API_BASE.trim().replace(/\/+$/, "");
    try {
        return new URL(window.location.href).origin;
    } catch(e) {}
    return '';
}

async function smartFetch(endpoint, options) {
    var api = getSmartApiBase();
    if (!api) throw new Error('NO_BASE|لم يتم تحديد رابط السيرفر');
    try {
        var response = await fetch(api + endpoint, {
            ...options, 
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json', 
                ...(options?.headers || {}) 
            }
        });
        if (!response.ok) {
            var err = await response.json().catch(() => ({}));
            throw new Error('SERVER_ERROR|' + (err.error || 'خطأ: ' + response.status));
        }
        return await response.json();
    } catch (error) {
        if (error.message && error.message.includes('|')) throw error;
        throw new Error('NETWORK_ERROR|فشل الاتصال بالسيرفر');
    }
}

function handleTournamentError(error) {
    var msg = (error.message || 'حدث خطأ').split('|').pop();
    showToast('❌ ' + msg, 'error');
}

// ====================== فتح قائمة البطولات ======================
function openTournaments() {
    var isAdmin = typeof currentUser !== 'undefined' && 
                  currentUser && currentUser.type === 'admin';
    
    var h = '<h2>🏆 البطولات الأسبوعية</h2>';
    h += '<div style="margin-bottom:15px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">';
    if (isAdmin) {
        h += '<button class="modal-btn btn-success" onclick="showCreateTournamentForm()">';
        h += '<i class="fas fa-plus"></i> إنشاء بطولة</button>';
    }
    h += '<button class="modal-btn btn-info" onclick="fetchActiveTournaments()" style="background:var(--blue);">';
    h += '<i class="fas fa-sync"></i> تحديث</button>';
    h += '<button class="modal-btn btn-primary" onclick="showJoinByCodeForm()">';
    h += '<i class="fas fa-key"></i> انضمام بكود</button>';
    h += '</div>';
    
    // صندوق الكود
    h += '<div id="joinByCodeBox" style="display:none;margin-bottom:15px;';
    h += 'background:var(--gold-light);padding:15px;border-radius:16px;text-align:center;">';
    h += '<p style="font-weight:700;margin-bottom:10px;color:var(--gold-dark);">أدخل كود البطولة</p>';
    h += '<div style="display:flex;gap:8px;justify-content:center;max-width:350px;margin:0 auto;">';
    h += '<input type="text" id="tournamentCodeInput" placeholder="ABC123" maxlength="6" ';
    h += 'style="flex:1;padding:10px;border-radius:12px;border:2px solid var(--gold);';
    h += 'text-align:center;font-size:1.4rem;font-weight:900;letter-spacing:4px;';
    h += 'text-transform:uppercase;background:var(--card-bg);color:var(--dark);font-family:monospace;">';
    h += '<button class="modal-btn btn-success" onclick="joinByCode()">انضمام</button>';
    h += '</div></div>';
    
    h += '<div id="tournamentList" style="max-height:50vh;overflow-y:auto;">';
    h += '<p style="color:var(--text-secondary);text-align:center;padding:20px;">⏳ جاري التحميل...</p>';
    h += '</div>';
    h += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentModal\')">إغلاق</button>';
    
    openModal('tournamentModal', h);
    fetchActiveTournaments();
    
    setTimeout(function() {
        var input = document.getElementById('tournamentCodeInput');
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') joinByCode();
            });
        }
    }, 200);
}

function showJoinByCodeForm() {
    var box = document.getElementById('joinByCodeBox');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') {
        setTimeout(function() {
            var input = document.getElementById('tournamentCodeInput');
            if (input) input.focus();
        }, 100);
    }
}

async function joinByCode() {
    var input = document.getElementById('tournamentCodeInput');
    var code = input ? input.value.trim().toUpperCase() : '';
    
    if (!code || code.length !== 6) { 
        showToast('⚠️ الكود يجب أن يكون 6 أحرف', 'warning'); 
        return; 
    }
    
    var btn = document.querySelector('#joinByCodeBox .btn-success');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    
    try {
        var result = await smartFetch('/api/tournaments/join-by-code', { 
            method: 'POST', 
            body: JSON.stringify({ code: code }) 
        });
        
        if (result.success && result.questions) {
            showToast('✅ تم التحقق! ابدأ الحل الآن', 'success');
            closeModal('tournamentModal');
            startTournamentQuiz(
                result.tournamentId, 
                result.questions,
                result.timeLimitMinutes || 10,
                result.title || 'بطولة'
            );
        } else { 
            showToast('❌ ' + (result.error || 'فشل الانضمام'), 'error'); 
        }
    } catch (error) { 
        handleTournamentError(error); 
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'انضمام'; }
    }
}

async function fetchActiveTournaments() {
    var container = document.getElementById('tournamentList');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">⏳ جاري التحميل...</p>';
    try {
        var tournaments = await smartFetch('/api/tournaments/active');
        renderTournaments(tournaments);
    } catch (error) {
        container.innerHTML = '<p style="color:var(--red);text-align:center;padding:20px;">❌ فشل تحميل البطولات<br><button class="modal-btn btn-primary" onclick="fetchActiveTournaments()" style="margin-top:10px;">🔄 إعادة المحاولة</button></p>';
        handleTournamentError(error);
    }
}

function renderTournaments(tournaments) {
    var container = document.getElementById('tournamentList');
    if (!container) return;
    
    if (!tournaments || tournaments.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:30px;"><i class="fas fa-trophy" style="font-size:2rem;color:var(--gold);display:block;text-align:center;margin-bottom:10px;"></i><h3 style="text-align:center;">لا توجد بطولات نشطة حالياً</h3></div>';
        return;
    }
    
    var isAdmin = typeof currentUser !== 'undefined' && 
                  currentUser && currentUser.type === 'admin';
    var html = '';
    
    for (var i = 0; i < tournaments.length; i++) {
        var t = tournaments[i];
        var borderColor = t.hasParticipated ? 'var(--green)' : 'var(--gold)';
        
        html += '<div style="background:var(--card-bg);border-radius:16px;padding:15px;';
        html += 'margin-bottom:12px;border:2px solid ' + borderColor + ';">';
        
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">';
        html += '<div style="flex:1;">';
        html += '<h4 style="color:var(--dark);font-size:0.95rem;margin-bottom:6px;">🏆 ' + escapeHtml(t.title) + '</h4>';
        html += '<div style="font-size:0.75rem;color:var(--text-secondary);line-height:2;">';
        html += '📚 ' + escapeHtml(t.chapterName || '') + ' | ';
        html += '📝 ' + (t.questionCount || 0) + ' سؤال | ';
        html += '⏱️ ' + (t.timeLimitMinutes || 10) + ' دقيقة<br>';
        html += '📅 تنتهي: ' + escapeHtml(t.endDate || '') + ' | ';
        html += '👥 ' + (t.participantsCount || 0) + ' مشارك';
        html += '</div>';
        html += '<div style="margin-top:6px;display:inline-block;background:var(--light-bg);';
        html += 'padding:4px 12px;border-radius:8px;">';
        html += '<span style="font-size:0.85rem;font-weight:800;color:var(--gold-dark);';
        html += 'letter-spacing:3px;font-family:monospace;">🔑 ' + escapeHtml(t.code || '') + '</span>';
        html += '</div></div>';
        
        if (t.hasParticipated && t.myScore !== null) {
            var sc = t.myScore;
            var scColor = sc >= 70 ? 'var(--green)' : sc >= 40 ? 'var(--orange)' : 'var(--red)';
            html += '<div style="text-align:center;padding:8px 15px;background:var(--light-bg);border-radius:12px;">';
            html += '<div style="font-size:1.5rem;font-weight:900;color:' + scColor + ';">' + sc + '%</div>';
            html += '<div style="font-size:0.7rem;color:var(--text-secondary);">نتيجتك</div>';
            html += '</div>';
        }
        html += '</div>';
        
        html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
        if (!t.hasParticipated) {
            html += '<button class="modal-btn btn-primary" ';
            html += 'onclick="startTournamentById(\'' + t._id + '\',\'' + t.code + '\')">📝 شارك الآن</button>';
        } else {
            html += '<button class="modal-btn btn-info" style="background:var(--blue);" ';
            html += 'onclick="viewTournamentResults(\'' + t._id + '\')">📊 النتائج</button>';
        }
        if (isAdmin) {
            html += '<button class="modal-btn btn-danger" style="font-size:0.7rem;padding:4px 10px;" ';
            html += 'onclick="finishTournament(\'' + t._id + '\')">🏁 إنهاء</button>';
        }
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function startTournamentById(id, code) {
    if (!confirm('🏆 هل أنت مستعد؟\nسيبدأ العد التنازلي فور الموافقة!')) return;
    try {
        var result = await smartFetch('/api/tournaments/join-by-code', { 
            method: 'POST', 
            body: JSON.stringify({ code: code }) 
        });
        if (result.success && result.questions) { 
            closeModal('tournamentModal'); 
            startTournamentQuiz(
                result.tournamentId, 
                result.questions,
                result.timeLimitMinutes || 10,
                result.title || 'بطولة'
            ); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل'), 'error'); 
        }
    } catch (error) { 
        handleTournamentError(error); 
    }
}

// ====================== إنشاء بطولة (للأدمن) ======================
var _tournamentQuestions = [];

function showCreateTournamentForm() {
    if (typeof currentUser === 'undefined' || !currentUser || currentUser.type !== 'admin') {
        showToast('❌ هذه الميزة للأدمن فقط', 'error');
        return;
    }
    
    var chapterOptions = '';
    for (var id in chaptersData) {
        if (chaptersData.hasOwnProperty(id)) {
            chapterOptions += '<option value="' + id + '">' + 
                escapeHtml(chaptersData[id].name) + '</option>';
        }
    }
    
    var h = '<h2>🏆 إنشاء بطولة جديدة</h2>';
    h += '<div style="text-align:right;max-height:60vh;overflow-y:auto;">';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    
    h += '<div style="grid-column:span 2;">';
    h += '<label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">عنوان البطولة *</label>';
    h += '<input type="text" id="tournamentTitle" placeholder="مثال: بطولة الفصل الأول" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);font-family:\'Tajawal\',sans-serif;">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">الفصل *</label>';
    h += '<select id="tournamentChapter" onchange="previewTournamentQuestions()" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += chapterOptions + '</select></div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">عدد الأسئلة</label>';
    h += '<input type="number" id="tournamentCount" value="20" min="5" max="50" ';
    h += 'onchange="previewTournamentQuestions()" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">وقت الاختبار (دقيقة)</label>';
    h += '<input type="number" id="tournamentTime" value="10" min="5" max="60" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">تاريخ البداية *</label>';
    h += '<input type="date" id="tournamentStartDate" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">تاريخ النهاية *</label>';
    h += '<input type="date" id="tournamentEndDate" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '</div>';
    
    h += '<div id="tournamentQPreview" style="margin-top:12px;padding:10px;';
    h += 'background:var(--light-bg);border-radius:10px;font-size:0.8rem;';
    h += 'color:var(--text-secondary);text-align:center;">👆 سيتم اختيار الأسئلة تلقائياً</div>';
    
    h += '<button class="modal-btn btn-success" id="createTournamentBtn" ';
    h += 'onclick="createTournament()" style="margin-top:10px;width:100%;padding:12px;">🚀 إنشاء البطولة</button>';
    h += '</div>';
    h += '<button class="modal-btn btn-close" onclick="closeModal(\'createTournamentModal\')" ';
    h += 'style="margin-top:8px;">إلغاء</button>';
    
    openModal('createTournamentModal', h);
    _tournamentQuestions = [];
    
    var today = new Date();
    var nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    setTimeout(function() {
        var startEl = document.getElementById('tournamentStartDate');
        var endEl = document.getElementById('tournamentEndDate');
        if (startEl) startEl.value = today.toISOString().split('T')[0];
        if (endEl) endEl.value = nextWeek.toISOString().split('T')[0];
        previewTournamentQuestions();
    }, 100);
}

function previewTournamentQuestions() {
    var chapterId = document.getElementById('tournamentChapter')?.value;
    var count = parseInt(document.getElementById('tournamentCount')?.value) || 20;
    
    if (!chapterId || typeof getAllQuestions !== 'function') return;
    
    var allQ = getAllQuestions(chapterId, 'all');
    _tournamentQuestions = allQ.sort(function() { 
        return Math.random() - 0.5; 
    }).slice(0, Math.min(count, allQ.length));
    
    var preview = document.getElementById('tournamentQPreview');
    if (!preview) return;
    
    if (_tournamentQuestions.length === 0) {
        preview.innerHTML = '❌ لا توجد أسئلة في هذا الفصل';
        preview.style.color = 'var(--red)';
    } else {
        var typeCounts = {};
        _tournamentQuestions.forEach(function(q) {
            var label = getCategoryLabel(q.cat || 'mcq');
            typeCounts[label] = (typeCounts[label] || 0) + 1;
        });
        var typeText = Object.entries(typeCounts)
            .map(function(e) { return e[0] + ': ' + e[1]; })
            .join(' | ');
        preview.innerHTML = '✅ <strong>' + _tournamentQuestions.length + ' سؤال</strong> | ' + typeText;
        preview.style.color = 'var(--green)';
    }
}

async function createTournament() {
    var title = document.getElementById('tournamentTitle')?.value.trim();
    var chapterId = document.getElementById('tournamentChapter')?.value;
    var timeLimitMinutes = parseInt(document.getElementById('tournamentTime')?.value) || 10;
    var startDate = document.getElementById('tournamentStartDate')?.value;
    var endDate = document.getElementById('tournamentEndDate')?.value;
    
    if (!title) return showToast('⚠️ يرجى إدخال عنوان البطولة', 'warning');
    if (!startDate || !endDate) return showToast('⚠️ يرجى تحديد التواريخ', 'warning');
    if (startDate > endDate) return showToast('⚠️ تاريخ البداية يجب أن يكون قبل النهاية', 'warning');
    
    // تحديث الأسئلة أوتوماتيك لو مش محدثة
    previewTournamentQuestions();
    
    if (_tournamentQuestions.length === 0) {
        return showToast('⚠️ لا توجد أسئلة في هذا الفصل', 'warning');
    }
    
    var btn = document.getElementById('createTournamentBtn');
    if (btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...'; 
    }
    
    try {
        var result = await smartFetch('/api/tournaments', { 
            method: 'POST', 
            body: JSON.stringify({ 
                title: title,
                chapterId: chapterId,
                chapterName: chaptersData[chapterId]?.name || 'فصل',
                questionCount: _tournamentQuestions.length,
                categoryFilter: 'all',
                timeLimitMinutes: timeLimitMinutes,
                startDate: startDate,
                endDate: endDate,
                questions: _tournamentQuestions
            }) 
        });
        
        if (result.success) { 
            spawnConfetti();
            showToast('🎉 تم الإنشاء! الكود: ' + result.tournament.code, 'success'); 
            closeModal('createTournamentModal');
            _tournamentQuestions = [];
            fetchActiveTournaments(); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل الإنشاء'), 'error'); 
        }
    } catch (error) { 
        console.error('خطأ في إنشاء البطولة:', error);
        handleTournamentError(error); 
    } finally {
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '🚀 إنشاء البطولة'; 
        }
    }
}

// ====================== نظام الاختبار ======================
var tournamentState = {};
var tournamentTimerInterval = null;
var tournamentSubmitted = false;
var _tourSelectedAnswers = {};

function startTournamentQuiz(tournamentId, questions, timeLimitMinutes, title) {
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    tournamentState = { 
        id: tournamentId, 
        questions: questions || [], 
        startTime: Date.now(),
        timeLimitSeconds: (timeLimitMinutes || 10) * 60,
        title: title || 'بطولة'
    };
    tournamentSubmitted = false;
    _tourSelectedAnswers = {};
    renderTournamentQuizPage();
}

function renderTournamentQuizPage() {
    var questions = tournamentState.questions;
    if (!questions || questions.length === 0) {
        showToast('❌ لا توجد أسئلة في البطولة', 'error');
        return;
    }
    
    var totalMins = Math.floor(tournamentState.timeLimitSeconds / 60);
    
    var html = '<div style="position:sticky;top:0;z-index:10;background:var(--card-bg);';
    html += 'padding:10px;border-radius:12px;border:1px solid var(--border-color);';
    html += 'margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;gap:8px;">';
    html += '<div style="font-size:0.8rem;font-weight:700;color:var(--dark);flex:1;">🏆 ' + escapeHtml(tournamentState.title) + '</div>';
    html += '<div id="tourProgress" style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;">0/' + questions.length + ' ✓</div>';
    html += '<div class="modal-timer" id="tourTimer" style="margin:0;font-size:1.2rem;font-weight:900;">';
    html += String(totalMins).padStart(2,'0') + ':00</div>';
    html += '<button class="modal-btn btn-danger" id="tourSubmitBtn" onclick="submitTournamentAnswers(false)" ';
    html += 'style="padding:6px 14px;font-size:0.8rem;white-space:nowrap;">';
    html += '<i class="fas fa-paper-plane"></i> تسليم</button>';
    html += '</div>';
    
    html += '<div style="max-height:60vh;overflow-y:auto;" id="tourScrollContainer">';
    
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        var type = q.cat || 'mcq';
        var badgeMap = {
            truefalse: 'badge-tf', complete: 'badge-complete',
            explain: 'badge-explain', list: 'badge-list',
            situations: 'badge-situation', mcq: 'badge-mcq'
        };
        var badgeClass = badgeMap[type] || 'badge-mcq';
        
        html += '<div class="quiz-q" id="tourQ_' + i + '" ';
        html += 'style="border:2px solid var(--border-color);border-right:4px solid var(--gold);';
        html += 'border-radius:12px;margin-bottom:12px;padding:12px;background:var(--card-bg);">';
        
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span class="question-badge ' + badgeClass + '" style="font-size:0.65rem;">';
        html += '<i class="fas ' + getCategoryIcon(type) + '"></i> ' + getCategoryLabel(type) + '</span>';
        html += '<span style="font-size:0.7rem;color:var(--text-muted);">#' + (i+1) + '</span>';
        html += '</div>';
        
        html += '<div style="font-weight:700;font-size:0.9rem;color:var(--dark);line-height:1.8;margin-bottom:8px;">';
        html += escapeHtml(q.text || '') + '</div>';
        
        if (q.translation) {
            html += '<div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 10px;';
            html += 'background:var(--light-bg);border-radius:8px;border-right:3px solid var(--gold);margin-bottom:8px;">';
            html += '<i class="fas fa-language"></i> ' + escapeHtml(q.translation) + '</div>';
        }
        
        if (type === 'mcq' && q.options && q.options.length > 0) {
            for (var j = 0; j < q.options.length; j++) {
                var opt = q.options[j];
                html += '<button class="quiz-opt" ';
                html += 'data-qindex="' + i + '" ';
                html += 'data-value="' + escapeHtml(opt) + '" ';
                html += 'onclick="selectTournamentOpt(this,' + i + ')">';
                html += escapeHtml(opt) + '</button>';
            }
        } else if (type === 'truefalse') {
            html += '<button class="quiz-opt" data-qindex="' + i + '" data-value="صواب" ';
            html += 'onclick="selectTournamentOpt(this,' + i + ')">✅ صواب (True)</button>';
            html += '<button class="quiz-opt" data-qindex="' + i + '" data-value="خطأ" ';
            html += 'onclick="selectTournamentOpt(this,' + i + ')">❌ خطأ (False)</button>';
        } else {
            var placeholder = type === 'complete' ? 'أكمل الجملة...' : 
                             type === 'list' ? 'اكتب النقاط...' : 'اكتب إجابتك...';
            var minH = (type === 'list' || type === 'explain' || type === 'situations') ? 
                       'min-height:70px;' : '';
            html += '<textarea class="def-input" id="tourText_' + i + '" ';
            html += 'placeholder="' + placeholder + '" ';
            html += 'oninput="updateTourProgress()" ';
            html += 'style="width:100%;' + minH + 'padding:10px;border-radius:10px;';
            html += 'border:2px solid var(--border-color);background:var(--card-bg);';
            html += 'color:var(--text-primary);font-family:\'Tajawal\',sans-serif;resize:vertical;"></textarea>';
        }
        
        html += '</div>';
    }
    html += '</div>';
    
    openModal('tournamentQuizModal', html);
    startTournamentTimer();
}

window.selectTournamentOpt = function(btn, qIndex) {
    if (tournamentSubmitted) return;
    
    var opts = document.querySelectorAll('#tourQ_' + qIndex + ' .quiz-opt');
    opts.forEach(function(b) {
        b.classList.remove('correct', 'wrong');
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
        b.style.fontWeight = '';
    });
    
    btn.style.borderColor = 'var(--gold)';
    btn.style.background = 'var(--gold-light)';
    btn.style.color = 'var(--darker)';
    btn.style.fontWeight = '700';
    
    _tourSelectedAnswers[qIndex] = btn.getAttribute('data-value');
    updateTourProgress();
};

function updateTourProgress() {
    var questions = tournamentState.questions || [];
    var answered = 0;
    
    for (var i = 0; i < questions.length; i++) {
        var type = (questions[i].cat || 'mcq');
        if (type === 'mcq' || type === 'truefalse') {
            if (_tourSelectedAnswers[i]) answered++;
        } else {
            var el = document.getElementById('tourText_' + i);
            if (el && el.value.trim().length > 0) answered++;
        }
    }
    
    var progressEl = document.getElementById('tourProgress');
    if (progressEl) {
        progressEl.textContent = answered + '/' + questions.length + ' ✓';
        progressEl.style.color = answered === questions.length ? 
            'var(--green)' : 'var(--text-secondary)';
    }
}

function startTournamentTimer() {
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    
    tournamentTimerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - tournamentState.startTime) / 1000);
        var tLeft = Math.max(0, tournamentState.timeLimitSeconds - elapsed);
        
        if (tLeft <= 0) { 
            clearInterval(tournamentTimerInterval);
            showToast('⏰ انتهى الوقت! سيتم التسليم تلقائياً', 'warning');
            setTimeout(function() { submitTournamentAnswers(true); }, 1000);
            return; 
        }
        
        var timerEl = document.getElementById('tourTimer');
        if (timerEl) {
            var m = Math.floor(tLeft / 60);
            var s = tLeft % 60;
            timerEl.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            
            if (tLeft <= 60) {
                timerEl.style.color = 'var(--red)';
            } else if (tLeft <= 180) {
                timerEl.style.color = 'var(--orange)';
            } else {
                timerEl.style.color = 'var(--dark)';
            }
        }
    }, 1000);
}

async function submitTournamentAnswers(autoSubmit) {
    if (tournamentSubmitted) return;
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    
    var questions = tournamentState.questions || [];
    
    // حساب الأسئلة بدون إجابة
    var unanswered = 0;
    for (var i = 0; i < questions.length; i++) {
        var type = questions[i].cat || 'mcq';
        if (type === 'mcq' || type === 'truefalse') {
            if (!_tourSelectedAnswers[i]) unanswered++;
        } else {
            var el = document.getElementById('tourText_' + i);
            if (!el || el.value.trim().length === 0) unanswered++;
        }
    }
    
    if (!autoSubmit && unanswered > 0) {
        if (!confirm('⚠️ لديك ' + unanswered + ' سؤال(أسئلة) بدون إجابة.\nهل تريد التسليم على أي حال؟')) {
            startTournamentTimer();
            return;
        }
    }
    
    var submitBtn = document.getElementById('tourSubmitBtn');
    if (submitBtn) { 
        submitBtn.disabled = true; 
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسليم...'; 
    }
    
    // جمع الإجابات
    var answers = [];
    for (var i = 0; i < questions.length; i++) {
        var type = questions[i].cat || 'mcq';
        var userAnswer = '';
        
        if (type === 'mcq' || type === 'truefalse') {
            userAnswer = _tourSelectedAnswers[i] || '';
        } else {
            var textEl = document.getElementById('tourText_' + i);
            userAnswer = textEl ? textEl.value.trim() : '';
        }
        
        answers.push({ questionIndex: i, answer: userAnswer });
    }
    
    var finalTimeTaken = Math.floor((Date.now() - tournamentState.startTime) / 1000);
    tournamentSubmitted = true;
    
    try {
        var result = await smartFetch('/api/tournaments/' + tournamentState.id + '/participate', {
            method: 'POST',
            body: JSON.stringify({ 
                answers: answers, 
                timeTaken: finalTimeTaken 
            })
        });
        
        var score = result.score || 0;
        var correctCount = result.correctCount || 0;
        var totalCount = questions.length;
        var wrongCount = totalCount - correctCount;
        var rank = result.rank || 0;
        var xpEarned = result.xpEarned || 10;
        var rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        var scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--red)';
        var timeStr = Math.floor(finalTimeTaken/60) + ':' + String(finalTimeTaken%60).padStart(2,'0');
        
        var content = '<div style="text-align:center;padding:20px 10px;">';
        content += '<div style="font-size:3.5rem;margin-bottom:10px;">' + rankEmoji + '</div>';
        content += '<h2 style="color:var(--dark);margin-bottom:5px;">تم تسليم البطولة!</h2>';
        content += '<div style="font-size:3rem;font-weight:900;color:' + scoreColor + ';margin:15px 0;">';
        content += score + '%</div>';
        
        content += '<div style="display:flex;justify-content:center;gap:15px;margin:15px 0;flex-wrap:wrap;">';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.3rem;font-weight:900;color:var(--green);">' + correctCount + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">✅ صحيح</div></div>';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.3rem;font-weight:900;color:var(--red);">' + wrongCount + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">❌ خطأ</div></div>';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.1rem;font-weight:900;color:var(--dark);">' + timeStr + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">⏱️ الوقت</div></div>';
        content += '</div>';
        
        if (rank > 0) {
            content += '<div style="display:inline-block;background:var(--gold-light);padding:8px 25px;';
            content += 'border-radius:50px;font-size:1rem;font-weight:800;color:var(--gold-dark);';
            content += 'border:1px solid var(--gold);margin:10px 0;">';
            content += rankEmoji + ' المركز ' + rank + '</div><br>';
        }
        
        content += '<div style="background:var(--light-bg);padding:6px 20px;border-radius:10px;';
        content += 'margin:8px auto;display:inline-block;">';
        content += '<span style="color:var(--gold-dark);font-weight:700;">+' + xpEarned + ' XP 🌟</span></div>';
        
        content += '<div style="display:flex;gap:8px;justify-content:center;margin-top:15px;flex-wrap:wrap;">';
        content += '<button class="modal-btn btn-info" style="background:var(--blue);" ';
        content += 'onclick="closeModal(\'tournamentQuizModal\');viewTournamentResults(\'' + tournamentState.id + '\');">';
        content += '📊 عرض النتائج الكاملة</button>';
        content += '<button class="modal-btn btn-close" ';
        content += 'onclick="closeModal(\'tournamentQuizModal\');openTournaments();" ';
        content += 'style="padding:8px 20px;">🏆 عودة للبطولات</button>';
        content += '</div></div>';
        
        openModal('tournamentQuizModal', content);
        
        if (typeof addXP === 'function') addXP(xpEarned);
        if (score >= 70) spawnConfetti();
        
    } catch (error) {
        handleTournamentError(error);
        
        var errContent = '<div style="text-align:center;padding:30px;">';
        errContent += '<div style="font-size:3rem;margin-bottom:15px;">⚠️</div>';
        errContent += '<h2 style="color:var(--red);font-size:1.1rem;">لم يتم تسجيل النتيجة في السيرفر</h2>';
        errContent += '<p style="color:var(--text-secondary);margin:15px 0;">';
        errContent += 'الوقت المستغرق: ' + Math.floor(finalTimeTaken/60) + ':' + String(finalTimeTaken%60).padStart(2,'0') + '</p>';
        errContent += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
        errContent += '<button class="modal-btn btn-danger" ';
        errContent += 'onclick="tournamentSubmitted=false;submitTournamentAnswers(false)">';
        errContent += '<i class="fas fa-redo"></i> إعادة المحاولة</button>';
        errContent += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentQuizModal\');">إغلاق</button>';
        errContent += '</div></div>';
        openModal('tournamentQuizModal', errContent);
    }
}

// ====================== نتائج وإنهاء البطولة ======================
async function finishTournament(id) {
    if (!confirm('⚠️ هل أنت متأكد من إنهاء البطولة وتوزيع المكافآت؟')) return;
    try {
        var result = await smartFetch('/api/tournaments/' + id + '/finish', { method: 'POST' });
        if (result.success) { 
            spawnConfetti();
            showToast('🎉 تم إنهاء البطولة! الفائز: ' + (result.winner || ''), 'success'); 
            fetchActiveTournaments(); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل'), 'error'); 
        }
    } catch (error) { handleTournamentError(error); }
}

async function viewTournamentResults(id) {
    try {
        var data = await smartFetch('/api/tournaments/' + id + '/results');
        
        var html = '<h2>📊 نتائج البطولة</h2>';
        html += '<h4 style="color:var(--gold-dark);margin-bottom:15px;text-align:center;">';
        html += escapeHtml(data.title || '') + '</h4>';
        
        if (data.top3 && data.top3.length > 0) {
            var medals = ['🥇', '🥈', '🥉'];
            var colors = ['#f59e0b', '#94a3b8', '#cd7f32'];
            html += '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;">';
            for (var i = 0; i < data.top3.length; i++) {
                var p = data.top3[i];
                html += '<div style="text-align:center;padding:12px 16px;background:var(--card-bg);';
                html += 'border-radius:12px;border:2px solid ' + colors[i] + ';min-width:90px;">';
                html += '<div style="font-size:1.8rem;">' + medals[i] + '</div>';
                html += '<div style="font-weight:700;font-size:0.8rem;margin-top:4px;">';
                html += escapeHtml(p.studentName || '') + '</div>';
                html += '<div style="font-size:1rem;font-weight:900;color:' + colors[i] + ';">';
                html += p.score + '%</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        
        html += '<div style="max-height:40vh;overflow-y:auto;">';
        html += '<table class="leaderboard-table" style="width:100%;">';
        html += '<tr><th>#</th><th>👤 الطالب</th><th>📊 النتيجة</th><th>⏱️ الوقت</th></tr>';
        
        var participants = data.participants || [];
        for (var j = 0; j < participants.length; j++) {
            var p = participants[j];
            var rowClass = j === 0 ? 'rank-1' : j === 1 ? 'rank-2' : j === 2 ? 'rank-3' : '';
            var accClass = p.score >= 70 ? 'high' : p.score >= 40 ? 'medium' : 'low';
            var tStr = Math.floor((p.timeTaken||0)/60) + ':' + String((p.timeTaken||0)%60).padStart(2,'0');
            
            html += '<tr class="' + rowClass + '">';
            html += '<td>' + (j+1) + '</td>';
            html += '<td>' + escapeHtml(p.studentName || '') + '</td>';
            html += '<td class="lb-accuracy ' + accClass + '">' + p.score + '%</td>';
            html += '<td>' + tStr + '</td>';
            html += '</tr>';
        }
        
        html += '</table></div>';
        html += '<p style="text-align:center;font-size:0.8rem;color:var(--text-secondary);margin-top:10px;">';
        html += 'إجمالي المشاركين: ' + (data.totalParticipants || 0) + '</p>';
        html += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentResultsModal\')" ';
        html += 'style="margin-top:10px;">إغلاق</button>';
        
        openModal('tournamentResultsModal', html);
    } catch (error) { handleTournamentError(error); }
}




// ====================== البطولات الأسبوعية ======================

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function getSmartApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE && API_BASE.trim() !== '') 
        return API_BASE.trim().replace(/\/+$/, "");
    try {
        return new URL(window.location.href).origin;
    } catch(e) {}
    return '';
}

async function smartFetch(endpoint, options) {
    var api = getSmartApiBase();
    if (!api) throw new Error('NO_BASE|لم يتم تحديد رابط السيرفر');
    try {
        var response = await fetch(api + endpoint, {
            ...options, 
            credentials: 'include',
            headers: { 
                'Content-Type': 'application/json', 
                ...(options?.headers || {}) 
            }
        });
        if (!response.ok) {
            var err = await response.json().catch(() => ({}));
            throw new Error('SERVER_ERROR|' + (err.error || 'خطأ: ' + response.status));
        }
        return await response.json();
    } catch (error) {
        if (error.message && error.message.includes('|')) throw error;
        throw new Error('NETWORK_ERROR|فشل الاتصال بالسيرفر');
    }
}

function handleTournamentError(error) {
    var msg = (error.message || 'حدث خطأ').split('|').pop();
    showToast('❌ ' + msg, 'error');
}

// ====================== فتح قائمة البطولات ======================
function openTournaments() {
    var isAdmin = typeof currentUser !== 'undefined' && 
                  currentUser && currentUser.type === 'admin';
    
    var h = '<h2>🏆 البطولات الأسبوعية</h2>';
    h += '<div style="margin-bottom:15px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">';
    if (isAdmin) {
        h += '<button class="modal-btn btn-success" onclick="showCreateTournamentForm()">';
        h += '<i class="fas fa-plus"></i> إنشاء بطولة</button>';
    }
    h += '<button class="modal-btn btn-info" onclick="fetchActiveTournaments()" style="background:var(--blue);">';
    h += '<i class="fas fa-sync"></i> تحديث</button>';
    h += '<button class="modal-btn btn-primary" onclick="showJoinByCodeForm()">';
    h += '<i class="fas fa-key"></i> انضمام بكود</button>';
    h += '</div>';
    
    // صندوق الكود
    h += '<div id="joinByCodeBox" style="display:none;margin-bottom:15px;';
    h += 'background:var(--gold-light);padding:15px;border-radius:16px;text-align:center;">';
    h += '<p style="font-weight:700;margin-bottom:10px;color:var(--gold-dark);">أدخل كود البطولة</p>';
    h += '<div style="display:flex;gap:8px;justify-content:center;max-width:350px;margin:0 auto;">';
    h += '<input type="text" id="tournamentCodeInput" placeholder="ABC123" maxlength="6" ';
    h += 'style="flex:1;padding:10px;border-radius:12px;border:2px solid var(--gold);';
    h += 'text-align:center;font-size:1.4rem;font-weight:900;letter-spacing:4px;';
    h += 'text-transform:uppercase;background:var(--card-bg);color:var(--dark);font-family:monospace;">';
    h += '<button class="modal-btn btn-success" onclick="joinByCode()">انضمام</button>';
    h += '</div></div>';
    
    h += '<div id="tournamentList" style="max-height:50vh;overflow-y:auto;">';
    h += '<p style="color:var(--text-secondary);text-align:center;padding:20px;">⏳ جاري التحميل...</p>';
    h += '</div>';
    h += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentModal\')">إغلاق</button>';
    
    openModal('tournamentModal', h);
    fetchActiveTournaments();
    
    setTimeout(function() {
        var input = document.getElementById('tournamentCodeInput');
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') joinByCode();
            });
        }
    }, 200);
}

function showJoinByCodeForm() {
    var box = document.getElementById('joinByCodeBox');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
    if (box.style.display === 'block') {
        setTimeout(function() {
            var input = document.getElementById('tournamentCodeInput');
            if (input) input.focus();
        }, 100);
    }
}

async function joinByCode() {
    var input = document.getElementById('tournamentCodeInput');
    var code = input ? input.value.trim().toUpperCase() : '';
    
    if (!code || code.length !== 6) { 
        showToast('⚠️ الكود يجب أن يكون 6 أحرف', 'warning'); 
        return; 
    }
    
    var btn = document.querySelector('#joinByCodeBox .btn-success');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    
    try {
        var result = await smartFetch('/api/tournaments/join-by-code', { 
            method: 'POST', 
            body: JSON.stringify({ code: code }) 
        });
        
        if (result.success && result.questions) {
            showToast('✅ تم التحقق! ابدأ الحل الآن', 'success');
            closeModal('tournamentModal');
            startTournamentQuiz(
                result.tournamentId, 
                result.questions,
                result.timeLimitMinutes || 10,
                result.title || 'بطولة'
            );
        } else { 
            showToast('❌ ' + (result.error || 'فشل الانضمام'), 'error'); 
        }
    } catch (error) { 
        handleTournamentError(error); 
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'انضمام'; }
    }
}

async function fetchActiveTournaments() {
    var container = document.getElementById('tournamentList');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">⏳ جاري التحميل...</p>';
    try {
        var tournaments = await smartFetch('/api/tournaments/active');
        renderTournaments(tournaments);
    } catch (error) {
        container.innerHTML = '<p style="color:var(--red);text-align:center;padding:20px;">❌ فشل تحميل البطولات<br><button class="modal-btn btn-primary" onclick="fetchActiveTournaments()" style="margin-top:10px;">🔄 إعادة المحاولة</button></p>';
        handleTournamentError(error);
    }
}

function renderTournaments(tournaments) {
    var container = document.getElementById('tournamentList');
    if (!container) return;
    
    if (!tournaments || tournaments.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:30px;"><i class="fas fa-trophy" style="font-size:2rem;color:var(--gold);display:block;text-align:center;margin-bottom:10px;"></i><h3 style="text-align:center;">لا توجد بطولات نشطة حالياً</h3></div>';
        return;
    }
    
    var isAdmin = typeof currentUser !== 'undefined' && 
                  currentUser && currentUser.type === 'admin';
    var html = '';
    
    for (var i = 0; i < tournaments.length; i++) {
        var t = tournaments[i];
        var borderColor = t.hasParticipated ? 'var(--green)' : 'var(--gold)';
        
        html += '<div style="background:var(--card-bg);border-radius:16px;padding:15px;';
        html += 'margin-bottom:12px;border:2px solid ' + borderColor + ';">';
        
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">';
        html += '<div style="flex:1;">';
        html += '<h4 style="color:var(--dark);font-size:0.95rem;margin-bottom:6px;">🏆 ' + escapeHtml(t.title) + '</h4>';
        html += '<div style="font-size:0.75rem;color:var(--text-secondary);line-height:2;">';
        html += '📚 ' + escapeHtml(t.chapterName || '') + ' | ';
        html += '📝 ' + (t.questionCount || 0) + ' سؤال | ';
        html += '⏱️ ' + (t.timeLimitMinutes || 10) + ' دقيقة<br>';
        html += '📅 تنتهي: ' + escapeHtml(t.endDate || '') + ' | ';
        html += '👥 ' + (t.participantsCount || 0) + ' مشارك';
        html += '</div>';
        html += '<div style="margin-top:6px;display:inline-block;background:var(--light-bg);';
        html += 'padding:4px 12px;border-radius:8px;">';
        html += '<span style="font-size:0.85rem;font-weight:800;color:var(--gold-dark);';
        html += 'letter-spacing:3px;font-family:monospace;">🔑 ' + escapeHtml(t.code || '') + '</span>';
        html += '</div></div>';
        
        if (t.hasParticipated && t.myScore !== null) {
            var sc = t.myScore;
            var scColor = sc >= 70 ? 'var(--green)' : sc >= 40 ? 'var(--orange)' : 'var(--red)';
            html += '<div style="text-align:center;padding:8px 15px;background:var(--light-bg);border-radius:12px;">';
            html += '<div style="font-size:1.5rem;font-weight:900;color:' + scColor + ';">' + sc + '%</div>';
            html += '<div style="font-size:0.7rem;color:var(--text-secondary);">نتيجتك</div>';
            html += '</div>';
        }
        html += '</div>';
        
        html += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
        if (!t.hasParticipated) {
            html += '<button class="modal-btn btn-primary" ';
            html += 'onclick="startTournamentById(\'' + t._id + '\',\'' + t.code + '\')">📝 شارك الآن</button>';
        } else {
            html += '<button class="modal-btn btn-info" style="background:var(--blue);" ';
            html += 'onclick="viewTournamentResults(\'' + t._id + '\')">📊 النتائج</button>';
        }
        if (isAdmin) {
            html += '<button class="modal-btn btn-danger" style="font-size:0.7rem;padding:4px 10px;" ';
            html += 'onclick="finishTournament(\'' + t._id + '\')">🏁 إنهاء</button>';
        }
        html += '</div></div>';
    }
    
    container.innerHTML = html;
}

async function startTournamentById(id, code) {
    if (!confirm('🏆 هل أنت مستعد؟\nسيبدأ العد التنازلي فور الموافقة!')) return;
    try {
        var result = await smartFetch('/api/tournaments/join-by-code', { 
            method: 'POST', 
            body: JSON.stringify({ code: code }) 
        });
        if (result.success && result.questions) { 
            closeModal('tournamentModal'); 
            startTournamentQuiz(
                result.tournamentId, 
                result.questions,
                result.timeLimitMinutes || 10,
                result.title || 'بطولة'
            ); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل'), 'error'); 
        }
    } catch (error) { 
        handleTournamentError(error); 
    }
}

// ====================== إنشاء بطولة (للأدمن) ======================
var _tournamentQuestions = [];

function showCreateTournamentForm() {
    if (typeof currentUser === 'undefined' || !currentUser || currentUser.type !== 'admin') {
        showToast('❌ هذه الميزة للأدمن فقط', 'error');
        return;
    }
    
    var chapterOptions = '';
    for (var id in chaptersData) {
        if (chaptersData.hasOwnProperty(id)) {
            chapterOptions += '<option value="' + id + '">' + 
                escapeHtml(chaptersData[id].name) + '</option>';
        }
    }
    
    var h = '<h2>🏆 إنشاء بطولة جديدة</h2>';
    h += '<div style="text-align:right;max-height:60vh;overflow-y:auto;">';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    
    h += '<div style="grid-column:span 2;">';
    h += '<label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">عنوان البطولة *</label>';
    h += '<input type="text" id="tournamentTitle" placeholder="مثال: بطولة الفصل الأول" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);font-family:\'Tajawal\',sans-serif;">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">الفصل *</label>';
    h += '<select id="tournamentChapter" onchange="previewTournamentQuestions()" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += chapterOptions + '</select></div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">عدد الأسئلة</label>';
    h += '<input type="number" id="tournamentCount" value="20" min="5" max="50" ';
    h += 'onchange="previewTournamentQuestions()" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">وقت الاختبار (دقيقة)</label>';
    h += '<input type="number" id="tournamentTime" value="10" min="5" max="60" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">تاريخ البداية *</label>';
    h += '<input type="date" id="tournamentStartDate" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '<div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">تاريخ النهاية *</label>';
    h += '<input type="date" id="tournamentEndDate" ';
    h += 'style="width:100%;padding:10px;border-radius:10px;border:2px solid var(--border-color);';
    h += 'background:var(--card-bg);color:var(--text-primary);">';
    h += '</div>';
    
    h += '</div>';
    
    h += '<div id="tournamentQPreview" style="margin-top:12px;padding:10px;';
    h += 'background:var(--light-bg);border-radius:10px;font-size:0.8rem;';
    h += 'color:var(--text-secondary);text-align:center;">👆 سيتم اختيار الأسئلة تلقائياً</div>';
    
    h += '<button class="modal-btn btn-success" id="createTournamentBtn" ';
    h += 'onclick="createTournament()" style="margin-top:10px;width:100%;padding:12px;">🚀 إنشاء البطولة</button>';
    h += '</div>';
    h += '<button class="modal-btn btn-close" onclick="closeModal(\'createTournamentModal\')" ';
    h += 'style="margin-top:8px;">إلغاء</button>';
    
    openModal('createTournamentModal', h);
    _tournamentQuestions = [];
    
    var today = new Date();
    var nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    setTimeout(function() {
        var startEl = document.getElementById('tournamentStartDate');
        var endEl = document.getElementById('tournamentEndDate');
        if (startEl) startEl.value = today.toISOString().split('T')[0];
        if (endEl) endEl.value = nextWeek.toISOString().split('T')[0];
        previewTournamentQuestions();
    }, 100);
}

function previewTournamentQuestions() {
    var chapterId = document.getElementById('tournamentChapter')?.value;
    var count = parseInt(document.getElementById('tournamentCount')?.value) || 20;
    
    if (!chapterId || typeof getAllQuestions !== 'function') return;
    
    var allQ = getAllQuestions(chapterId, 'all');
    _tournamentQuestions = allQ.sort(function() { 
        return Math.random() - 0.5; 
    }).slice(0, Math.min(count, allQ.length));
    
    var preview = document.getElementById('tournamentQPreview');
    if (!preview) return;
    
    if (_tournamentQuestions.length === 0) {
        preview.innerHTML = '❌ لا توجد أسئلة في هذا الفصل';
        preview.style.color = 'var(--red)';
    } else {
        var typeCounts = {};
        _tournamentQuestions.forEach(function(q) {
            var label = getCategoryLabel(q.cat || 'mcq');
            typeCounts[label] = (typeCounts[label] || 0) + 1;
        });
        var typeText = Object.entries(typeCounts)
            .map(function(e) { return e[0] + ': ' + e[1]; })
            .join(' | ');
        preview.innerHTML = '✅ <strong>' + _tournamentQuestions.length + ' سؤال</strong> | ' + typeText;
        preview.style.color = 'var(--green)';
    }
}

async function createTournament() {
    var title = document.getElementById('tournamentTitle')?.value.trim();
    var chapterId = document.getElementById('tournamentChapter')?.value;
    var timeLimitMinutes = parseInt(document.getElementById('tournamentTime')?.value) || 10;
    var startDate = document.getElementById('tournamentStartDate')?.value;
    var endDate = document.getElementById('tournamentEndDate')?.value;
    
    if (!title) return showToast('⚠️ يرجى إدخال عنوان البطولة', 'warning');
    if (!startDate || !endDate) return showToast('⚠️ يرجى تحديد التواريخ', 'warning');
    if (startDate > endDate) return showToast('⚠️ تاريخ البداية يجب أن يكون قبل النهاية', 'warning');
    
    // تحديث الأسئلة أوتوماتيك لو مش محدثة
    previewTournamentQuestions();
    
    if (_tournamentQuestions.length === 0) {
        return showToast('⚠️ لا توجد أسئلة في هذا الفصل', 'warning');
    }
    
    var btn = document.getElementById('createTournamentBtn');
    if (btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...'; 
    }
    
    try {
        var result = await smartFetch('/api/tournaments', { 
            method: 'POST', 
            body: JSON.stringify({ 
                title: title,
                chapterId: chapterId,
                chapterName: chaptersData[chapterId]?.name || 'فصل',
                questionCount: _tournamentQuestions.length,
                categoryFilter: 'all',
                timeLimitMinutes: timeLimitMinutes,
                startDate: startDate,
                endDate: endDate,
                questions: _tournamentQuestions
            }) 
        });
        
        if (result.success) { 
            spawnConfetti();
            showToast('🎉 تم الإنشاء! الكود: ' + result.tournament.code, 'success'); 
            closeModal('createTournamentModal');
            _tournamentQuestions = [];
            fetchActiveTournaments(); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل الإنشاء'), 'error'); 
        }
    } catch (error) { 
        console.error('خطأ في إنشاء البطولة:', error);
        handleTournamentError(error); 
    } finally {
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '🚀 إنشاء البطولة'; 
        }
    }
}

// ====================== نظام الاختبار ======================
var tournamentState = {};
var tournamentTimerInterval = null;
var tournamentSubmitted = false;
var _tourSelectedAnswers = {};

function startTournamentQuiz(tournamentId, questions, timeLimitMinutes, title) {
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    tournamentState = { 
        id: tournamentId, 
        questions: questions || [], 
        startTime: Date.now(),
        timeLimitSeconds: (timeLimitMinutes || 10) * 60,
        title: title || 'بطولة'
    };
    tournamentSubmitted = false;
    _tourSelectedAnswers = {};
    renderTournamentQuizPage();
}

function renderTournamentQuizPage() {
    var questions = tournamentState.questions;
    if (!questions || questions.length === 0) {
        showToast('❌ لا توجد أسئلة في البطولة', 'error');
        return;
    }
    
    var totalMins = Math.floor(tournamentState.timeLimitSeconds / 60);
    
    var html = '<div style="position:sticky;top:0;z-index:10;background:var(--card-bg);';
    html += 'padding:10px;border-radius:12px;border:1px solid var(--border-color);';
    html += 'margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;gap:8px;">';
    html += '<div style="font-size:0.8rem;font-weight:700;color:var(--dark);flex:1;">🏆 ' + escapeHtml(tournamentState.title) + '</div>';
    html += '<div id="tourProgress" style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;">0/' + questions.length + ' ✓</div>';
    html += '<div class="modal-timer" id="tourTimer" style="margin:0;font-size:1.2rem;font-weight:900;">';
    html += String(totalMins).padStart(2,'0') + ':00</div>';
    html += '<button class="modal-btn btn-danger" id="tourSubmitBtn" onclick="submitTournamentAnswers(false)" ';
    html += 'style="padding:6px 14px;font-size:0.8rem;white-space:nowrap;">';
    html += '<i class="fas fa-paper-plane"></i> تسليم</button>';
    html += '</div>';
    
    html += '<div style="max-height:60vh;overflow-y:auto;" id="tourScrollContainer">';
    
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        var type = q.cat || 'mcq';
        var badgeMap = {
            truefalse: 'badge-tf', complete: 'badge-complete',
            explain: 'badge-explain', list: 'badge-list',
            situations: 'badge-situation', mcq: 'badge-mcq'
        };
        var badgeClass = badgeMap[type] || 'badge-mcq';
        
        html += '<div class="quiz-q" id="tourQ_' + i + '" ';
        html += 'style="border:2px solid var(--border-color);border-right:4px solid var(--gold);';
        html += 'border-radius:12px;margin-bottom:12px;padding:12px;background:var(--card-bg);">';
        
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span class="question-badge ' + badgeClass + '" style="font-size:0.65rem;">';
        html += '<i class="fas ' + getCategoryIcon(type) + '"></i> ' + getCategoryLabel(type) + '</span>';
        html += '<span style="font-size:0.7rem;color:var(--text-muted);">#' + (i+1) + '</span>';
        html += '</div>';
        
        html += '<div style="font-weight:700;font-size:0.9rem;color:var(--dark);line-height:1.8;margin-bottom:8px;">';
        html += escapeHtml(q.text || '') + '</div>';
        
        if (q.translation) {
            html += '<div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 10px;';
            html += 'background:var(--light-bg);border-radius:8px;border-right:3px solid var(--gold);margin-bottom:8px;">';
            html += '<i class="fas fa-language"></i> ' + escapeHtml(q.translation) + '</div>';
        }
        
        if (type === 'mcq' && q.options && q.options.length > 0) {
            for (var j = 0; j < q.options.length; j++) {
                var opt = q.options[j];
                html += '<button class="quiz-opt" ';
                html += 'data-qindex="' + i + '" ';
                html += 'data-value="' + escapeHtml(opt) + '" ';
                html += 'onclick="selectTournamentOpt(this,' + i + ')">';
                html += escapeHtml(opt) + '</button>';
            }
        } else if (type === 'truefalse') {
            html += '<button class="quiz-opt" data-qindex="' + i + '" data-value="صواب" ';
            html += 'onclick="selectTournamentOpt(this,' + i + ')">✅ صواب (True)</button>';
            html += '<button class="quiz-opt" data-qindex="' + i + '" data-value="خطأ" ';
            html += 'onclick="selectTournamentOpt(this,' + i + ')">❌ خطأ (False)</button>';
        } else {
            var placeholder = type === 'complete' ? 'أكمل الجملة...' : 
                             type === 'list' ? 'اكتب النقاط...' : 'اكتب إجابتك...';
            var minH = (type === 'list' || type === 'explain' || type === 'situations') ? 
                       'min-height:70px;' : '';
            html += '<textarea class="def-input" id="tourText_' + i + '" ';
            html += 'placeholder="' + placeholder + '" ';
            html += 'oninput="updateTourProgress()" ';
            html += 'style="width:100%;' + minH + 'padding:10px;border-radius:10px;';
            html += 'border:2px solid var(--border-color);background:var(--card-bg);';
            html += 'color:var(--text-primary);font-family:\'Tajawal\',sans-serif;resize:vertical;"></textarea>';
        }
        
        html += '</div>';
    }
    html += '</div>';
    
    openModal('tournamentQuizModal', html);
    startTournamentTimer();
}

window.selectTournamentOpt = function(btn, qIndex) {
    if (tournamentSubmitted) return;
    
    var opts = document.querySelectorAll('#tourQ_' + qIndex + ' .quiz-opt');
    opts.forEach(function(b) {
        b.classList.remove('correct', 'wrong');
        b.style.borderColor = '';
        b.style.background = '';
        b.style.color = '';
        b.style.fontWeight = '';
    });
    
    btn.style.borderColor = 'var(--gold)';
    btn.style.background = 'var(--gold-light)';
    btn.style.color = 'var(--darker)';
    btn.style.fontWeight = '700';
    
    _tourSelectedAnswers[qIndex] = btn.getAttribute('data-value');
    updateTourProgress();
};

function updateTourProgress() {
    var questions = tournamentState.questions || [];
    var answered = 0;
    
    for (var i = 0; i < questions.length; i++) {
        var type = (questions[i].cat || 'mcq');
        if (type === 'mcq' || type === 'truefalse') {
            if (_tourSelectedAnswers[i]) answered++;
        } else {
            var el = document.getElementById('tourText_' + i);
            if (el && el.value.trim().length > 0) answered++;
        }
    }
    
    var progressEl = document.getElementById('tourProgress');
    if (progressEl) {
        progressEl.textContent = answered + '/' + questions.length + ' ✓';
        progressEl.style.color = answered === questions.length ? 
            'var(--green)' : 'var(--text-secondary)';
    }
}

function startTournamentTimer() {
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    
    tournamentTimerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - tournamentState.startTime) / 1000);
        var tLeft = Math.max(0, tournamentState.timeLimitSeconds - elapsed);
        
        if (tLeft <= 0) { 
            clearInterval(tournamentTimerInterval);
            showToast('⏰ انتهى الوقت! سيتم التسليم تلقائياً', 'warning');
            setTimeout(function() { submitTournamentAnswers(true); }, 1000);
            return; 
        }
        
        var timerEl = document.getElementById('tourTimer');
        if (timerEl) {
            var m = Math.floor(tLeft / 60);
            var s = tLeft % 60;
            timerEl.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            
            if (tLeft <= 60) {
                timerEl.style.color = 'var(--red)';
            } else if (tLeft <= 180) {
                timerEl.style.color = 'var(--orange)';
            } else {
                timerEl.style.color = 'var(--dark)';
            }
        }
    }, 1000);
}

async function submitTournamentAnswers(autoSubmit) {
    if (tournamentSubmitted) return;
    if (tournamentTimerInterval) clearInterval(tournamentTimerInterval);
    
    var questions = tournamentState.questions || [];
    
    // حساب الأسئلة بدون إجابة
    var unanswered = 0;
    for (var i = 0; i < questions.length; i++) {
        var type = questions[i].cat || 'mcq';
        if (type === 'mcq' || type === 'truefalse') {
            if (!_tourSelectedAnswers[i]) unanswered++;
        } else {
            var el = document.getElementById('tourText_' + i);
            if (!el || el.value.trim().length === 0) unanswered++;
        }
    }
    
    if (!autoSubmit && unanswered > 0) {
        if (!confirm('⚠️ لديك ' + unanswered + ' سؤال(أسئلة) بدون إجابة.\nهل تريد التسليم على أي حال؟')) {
            startTournamentTimer();
            return;
        }
    }
    
    var submitBtn = document.getElementById('tourSubmitBtn');
    if (submitBtn) { 
        submitBtn.disabled = true; 
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسليم...'; 
    }
    
    // جمع الإجابات
    var answers = [];
    for (var i = 0; i < questions.length; i++) {
        var type = questions[i].cat || 'mcq';
        var userAnswer = '';
        
        if (type === 'mcq' || type === 'truefalse') {
            userAnswer = _tourSelectedAnswers[i] || '';
        } else {
            var textEl = document.getElementById('tourText_' + i);
            userAnswer = textEl ? textEl.value.trim() : '';
        }
        
        answers.push({ questionIndex: i, answer: userAnswer });
    }
    
    var finalTimeTaken = Math.floor((Date.now() - tournamentState.startTime) / 1000);
    tournamentSubmitted = true;
    
    try {
        var result = await smartFetch('/api/tournaments/' + tournamentState.id + '/participate', {
            method: 'POST',
            body: JSON.stringify({ 
                answers: answers, 
                timeTaken: finalTimeTaken 
            })
        });
        
        var score = result.score || 0;
        var correctCount = result.correctCount || 0;
        var totalCount = questions.length;
        var wrongCount = totalCount - correctCount;
        var rank = result.rank || 0;
        var xpEarned = result.xpEarned || 10;
        var rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        var scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--red)';
        var timeStr = Math.floor(finalTimeTaken/60) + ':' + String(finalTimeTaken%60).padStart(2,'0');
        
        var content = '<div style="text-align:center;padding:20px 10px;">';
        content += '<div style="font-size:3.5rem;margin-bottom:10px;">' + rankEmoji + '</div>';
        content += '<h2 style="color:var(--dark);margin-bottom:5px;">تم تسليم البطولة!</h2>';
        content += '<div style="font-size:3rem;font-weight:900;color:' + scoreColor + ';margin:15px 0;">';
        content += score + '%</div>';
        
        content += '<div style="display:flex;justify-content:center;gap:15px;margin:15px 0;flex-wrap:wrap;">';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.3rem;font-weight:900;color:var(--green);">' + correctCount + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">✅ صحيح</div></div>';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.3rem;font-weight:900;color:var(--red);">' + wrongCount + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">❌ خطأ</div></div>';
        content += '<div style="padding:10px 15px;background:var(--light-bg);border-radius:12px;min-width:70px;">';
        content += '<div style="font-size:1.1rem;font-weight:900;color:var(--dark);">' + timeStr + '</div>';
        content += '<div style="font-size:0.75rem;color:var(--text-secondary);">⏱️ الوقت</div></div>';
        content += '</div>';
        
        if (rank > 0) {
            content += '<div style="display:inline-block;background:var(--gold-light);padding:8px 25px;';
            content += 'border-radius:50px;font-size:1rem;font-weight:800;color:var(--gold-dark);';
            content += 'border:1px solid var(--gold);margin:10px 0;">';
            content += rankEmoji + ' المركز ' + rank + '</div><br>';
        }
        
        content += '<div style="background:var(--light-bg);padding:6px 20px;border-radius:10px;';
        content += 'margin:8px auto;display:inline-block;">';
        content += '<span style="color:var(--gold-dark);font-weight:700;">+' + xpEarned + ' XP 🌟</span></div>';
        
        content += '<div style="display:flex;gap:8px;justify-content:center;margin-top:15px;flex-wrap:wrap;">';
        content += '<button class="modal-btn btn-info" style="background:var(--blue);" ';
        content += 'onclick="closeModal(\'tournamentQuizModal\');viewTournamentResults(\'' + tournamentState.id + '\');">';
        content += '📊 عرض النتائج الكاملة</button>';
        content += '<button class="modal-btn btn-close" ';
        content += 'onclick="closeModal(\'tournamentQuizModal\');openTournaments();" ';
        content += 'style="padding:8px 20px;">🏆 عودة للبطولات</button>';
        content += '</div></div>';
        
        openModal('tournamentQuizModal', content);
        
        if (typeof addXP === 'function') addXP(xpEarned);
        if (score >= 70) spawnConfetti();
        
    } catch (error) {
        handleTournamentError(error);
        
        var errContent = '<div style="text-align:center;padding:30px;">';
        errContent += '<div style="font-size:3rem;margin-bottom:15px;">⚠️</div>';
        errContent += '<h2 style="color:var(--red);font-size:1.1rem;">لم يتم تسجيل النتيجة في السيرفر</h2>';
        errContent += '<p style="color:var(--text-secondary);margin:15px 0;">';
        errContent += 'الوقت المستغرق: ' + Math.floor(finalTimeTaken/60) + ':' + String(finalTimeTaken%60).padStart(2,'0') + '</p>';
        errContent += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
        errContent += '<button class="modal-btn btn-danger" ';
        errContent += 'onclick="tournamentSubmitted=false;submitTournamentAnswers(false)">';
        errContent += '<i class="fas fa-redo"></i> إعادة المحاولة</button>';
        errContent += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentQuizModal\');">إغلاق</button>';
        errContent += '</div></div>';
        openModal('tournamentQuizModal', errContent);
    }
}

// ====================== نتائج وإنهاء البطولة ======================
async function finishTournament(id) {
    if (!confirm('⚠️ هل أنت متأكد من إنهاء البطولة وتوزيع المكافآت؟')) return;
    try {
        var result = await smartFetch('/api/tournaments/' + id + '/finish', { method: 'POST' });
        if (result.success) { 
            spawnConfetti();
            showToast('🎉 تم إنهاء البطولة! الفائز: ' + (result.winner || ''), 'success'); 
            fetchActiveTournaments(); 
        } else { 
            showToast('❌ ' + (result.error || 'فشل'), 'error'); 
        }
    } catch (error) { handleTournamentError(error); }
}

async function viewTournamentResults(id) {
    try {
        var data = await smartFetch('/api/tournaments/' + id + '/results');
        
        var html = '<h2>📊 نتائج البطولة</h2>';
        html += '<h4 style="color:var(--gold-dark);margin-bottom:15px;text-align:center;">';
        html += escapeHtml(data.title || '') + '</h4>';
        
        if (data.top3 && data.top3.length > 0) {
            var medals = ['🥇', '🥈', '🥉'];
            var colors = ['#f59e0b', '#94a3b8', '#cd7f32'];
            html += '<div style="display:flex;justify-content:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;">';
            for (var i = 0; i < data.top3.length; i++) {
                var p = data.top3[i];
                html += '<div style="text-align:center;padding:12px 16px;background:var(--card-bg);';
                html += 'border-radius:12px;border:2px solid ' + colors[i] + ';min-width:90px;">';
                html += '<div style="font-size:1.8rem;">' + medals[i] + '</div>';
                html += '<div style="font-weight:700;font-size:0.8rem;margin-top:4px;">';
                html += escapeHtml(p.studentName || '') + '</div>';
                html += '<div style="font-size:1rem;font-weight:900;color:' + colors[i] + ';">';
                html += p.score + '%</div>';
                html += '</div>';
            }
            html += '</div>';
        }
        
        html += '<div style="max-height:40vh;overflow-y:auto;">';
        html += '<table class="leaderboard-table" style="width:100%;">';
        html += '<tr><th>#</th><th>👤 الطالب</th><th>📊 النتيجة</th><th>⏱️ الوقت</th></tr>';
        
        var participants = data.participants || [];
        for (var j = 0; j < participants.length; j++) {
            var p = participants[j];
            var rowClass = j === 0 ? 'rank-1' : j === 1 ? 'rank-2' : j === 2 ? 'rank-3' : '';
            var accClass = p.score >= 70 ? 'high' : p.score >= 40 ? 'medium' : 'low';
            var tStr = Math.floor((p.timeTaken||0)/60) + ':' + String((p.timeTaken||0)%60).padStart(2,'0');
            
            html += '<tr class="' + rowClass + '">';
            html += '<td>' + (j+1) + '</td>';
            html += '<td>' + escapeHtml(p.studentName || '') + '</td>';
            html += '<td class="lb-accuracy ' + accClass + '">' + p.score + '%</td>';
            html += '<td>' + tStr + '</td>';
            html += '</tr>';
        }
        
        html += '</table></div>';
        html += '<p style="text-align:center;font-size:0.8rem;color:var(--text-secondary);margin-top:10px;">';
        html += 'إجمالي المشاركين: ' + (data.totalParticipants || 0) + '</p>';
        html += '<button class="modal-btn btn-close" onclick="closeModal(\'tournamentResultsModal\')" ';
        html += 'style="margin-top:10px;">إغلاق</button>';
        
        openModal('tournamentResultsModal', html);
    } catch (error) { handleTournamentError(error); }
}






// ====================== Schema البطولات ======================
const tournamentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, default: 20 },
    categoryFilter: { type: String, default: 'all' },
    timeLimitMinutes: { type: Number, default: 10 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    createdBy: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    questions: { type: Array, default: [] },
    participants: [{
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        score: { type: Number, default: 0 },
        timeTaken: { type: Number, default: 0 },
        answers: { type: Array, default: [] },
        submittedAt: { type: Date, default: Date.now }
    }],
    winner1: { type: String, default: '' },
    winner2: { type: String, default: '' },
    winner3: { type: String, default: '' }
}, { timestamps: true });

const Tournament = mongoose.models.Tournament || 
    mongoose.model('Tournament', tournamentSchema);

// ====================== دالة توليد الكود ======================
function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ====================== 1. إنشاء بطولة (للأدمن) ======================
app.post('/api/tournaments', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const { 
            title, chapterId, chapterName, questionCount, 
            categoryFilter, timeLimitMinutes, startDate, endDate, questions 
        } = req.body;
        
        if (!title || !chapterId || !startDate || !endDate) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        if (!questions || questions.length === 0) {
            return res.status(400).json({ error: 'يجب إضافة أسئلة للبطولة' });
        }
        if (startDate > endDate) {
            return res.status(400).json({ error: 'تاريخ البداية يجب أن يكون قبل النهاية' });
        }
        
        // توليد كود فريد
        let uniqueCode = generateTournamentCode();
        let codeExists = await Tournament.findOne({ code: uniqueCode });
        let attempts = 0;
        while (codeExists && attempts < 10) {
            uniqueCode = generateTournamentCode();
            codeExists = await Tournament.findOne({ code: uniqueCode });
            attempts++;
        }

        const newTournament = new Tournament({
            title: title.trim(),
            code: uniqueCode,
            chapterId,
            chapterName: chapterName || 'فصل غير معروف',
            questionCount: questions.length,
            categoryFilter: categoryFilter || 'all',
            timeLimitMinutes: timeLimitMinutes || 10,
            startDate,
            endDate,
            createdBy: req.user.username,
            questions: questions,
            isActive: true
        });
        
        await newTournament.save();
        console.log('✅ تم إنشاء بطولة:', uniqueCode, '| أسئلة:', questions.length);
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء البطولة بنجاح',
            tournament: {
                _id: newTournament._id,
                title: newTournament.title,
                code: newTournament.code,
                questionCount: newTournament.questionCount,
                timeLimitMinutes: newTournament.timeLimitMinutes,
                startDate: newTournament.startDate,
                endDate: newTournament.endDate
            }
        });
    } catch (error) {
        console.error('❌ خطأ في إنشاء البطولة:', error);
        res.status(500).json({ error: 'خطأ في إنشاء البطولة: ' + error.message });
    }
});

// ====================== 2. جلب البطولات النشطة ======================
app.get('/api/tournaments/active', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const today = new Date().toISOString().split('T')[0];
        
        const tournaments = await Tournament.find({
            isActive: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        }).sort({ createdAt: -1 }).lean();
        
        const result = tournaments.map(t => {
            try {
                const participants = t.participants || [];
                const userParticipant = participants.find(
                    p => p.studentId === req.user.username
                );
                return {
                    _id: t._id,
                    title: t.title,
                    code: t.code,
                    chapterName: t.chapterName || '',
                    questionCount: t.questionCount || 0,
                    timeLimitMinutes: t.timeLimitMinutes || 10,
                    startDate: t.startDate,
                    endDate: t.endDate,
                    participantsCount: participants.length,
                    hasParticipated: !!userParticipant,
                    myScore: userParticipant ? userParticipant.score : null,
                    myTime: userParticipant ? userParticipant.timeTaken : null
                };
            } catch(err) {
                console.error('خطأ في معالجة بطولة:', t._id, err);
                return null;
            }
        }).filter(t => t !== null);
        
        res.json(result);
    } catch (error) {
        console.error('❌ خطأ في جلب البطولات:', error);
        res.status(500).json({ error: 'خطأ في جلب البطولات: ' + error.message });
    }
});

// ====================== 3. الانضمام بكود البطولة ======================
app.post('/api/tournaments/join-by-code', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'يرجى إدخال كود البطولة' });
        }

        const tournament = await Tournament.findOne({ 
            code: code.toUpperCase().trim(), 
            isActive: true 
        });
        
        if (!tournament) {
            return res.status(404).json({ 
                error: 'كود البطولة غير صحيح أو البطولة منتهية' 
            });
        }

        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) {
            return res.status(400).json({ 
                error: 'البطولة لم تبدأ بعد، تبدأ في: ' + tournament.startDate 
            });
        }
        if (tournament.endDate < today) {
            return res.status(400).json({ error: 'انتهت مدة البطولة' });
        }

        const alreadyJoined = tournament.participants.find(
            p => p.studentId === req.user.username
        );
        if (alreadyJoined) {
            return res.status(400).json({ 
                error: 'لقد شاركت في هذه البطولة بالفعل',
                alreadyParticipated: true,
                score: alreadyJoined.score
            });
        }

        // إرجاع الأسئلة بدون الإجابات الصحيحة
        const questionsWithoutAnswers = (tournament.questions || []).map(q => ({
            text: q.text || '',
            translation: q.translation || '',
            cat: q.cat || 'mcq',
            options: q.options || []
        }));

        res.json({ 
            success: true, 
            tournamentId: tournament._id,
            title: tournament.title,
            chapterName: tournament.chapterName,
            timeLimitMinutes: tournament.timeLimitMinutes || 10,
            endDate: tournament.endDate,
            questions: questionsWithoutAnswers,
            totalQuestions: questionsWithoutAnswers.length,
            message: 'تم التحقق بنجاح، ابدأ الحل الآن!'
        });
    } catch (error) {
        console.error('❌ خطأ في الانضمام:', error);
        res.status(500).json({ error: 'خطأ في الانضمام: ' + error.message });
    }
});

// ====================== 4. المشاركة وإرسال الإجابات ======================
app.post('/api/tournaments/:id/participate', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const { answers, timeTaken } = req.body;
        
        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'بيانات الإجابات غير صحيحة' });
        }
        
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) {
            return res.status(404).json({ error: 'البطولة غير موجودة' });
        }
        
        const today = new Date().toISOString().split('T')[0];
        if (tournament.startDate > today) {
            return res.status(400).json({ error: 'البطولة لم تبدأ بعد' });
        }
        if (tournament.endDate < today) {
            return res.status(400).json({ error: 'البطولة انتهت' });
        }
        if (!tournament.isActive) {
            return res.status(400).json({ error: 'البطولة مغلقة' });
        }
        
        const existingParticipant = tournament.participants.find(
            p => p.studentId === req.user.username
        );
        if (existingParticipant) {
            return res.status(400).json({ 
                error: 'لقد شاركت بالفعل في هذه البطولة' 
            });
        }
        
        // التحقق من الوقت (منع الغش)
        const minTime = Math.min(20, (tournament.questions || []).length * 2);
        if (timeTaken < minTime) {
            return res.status(400).json({ 
                error: 'وقت الحل غير منطقي' 
            });
        }
        
        // تصحيح الإجابات
        let correctCount = 0;
        const detailedAnswers = [];
        const questions = tournament.questions || [];
        
        for (const answer of answers) {
            const question = questions[answer.questionIndex];
            if (!question) continue;
            
            let isCorrect = false;
            const qType = question.cat || 'mcq';
            const userAns = String(answer.answer || '').trim().toLowerCase();
            
            if (qType === 'mcq') {
                const correctAns = String(question.correct || '').trim().toLowerCase();
                isCorrect = userAns === correctAns;
                
                // مقارنة بالخيارات
                if (!isCorrect && question.options) {
                    isCorrect = question.options.some(opt => {
                        const optLower = String(opt).trim().toLowerCase();
                        return optLower === userAns && optLower === correctAns;
                    });
                }
            }
            else if (qType === 'truefalse') {
                const correctIsTrue = (
                    question.correct === true || 
                    String(question.correct).toLowerCase() === 'true'
                );
                const userIsTrue = (
                    userAns === 'true' || 
                    userAns === 'صواب' || 
                    userAns === 'صح'
                );
                const userIsFalse = (
                    userAns === 'false' || 
                    userAns === 'خطأ' || 
                    userAns === 'غلط'
                );
                if (correctIsTrue) isCorrect = userIsTrue;
                else isCorrect = userIsFalse;
            }
            else if (qType === 'complete') {
                const completion = String(question.completion || '').trim().toLowerCase();
                if (completion && userAns.length > 1) {
                    const keywords = completion.split(/\s+/).filter(w => w.length > 3);
                    if (keywords.length === 0) {
                        isCorrect = userAns === completion;
                    } else {
                        const matched = keywords.filter(kw => userAns.includes(kw));
                        isCorrect = matched.length / keywords.length >= 0.6;
                    }
                }
            }
            else if (qType === 'list' || qType === 'explain' || qType === 'situations') {
                isCorrect = userAns.length > 10;
            }
            
            if (isCorrect) correctCount++;
            detailedAnswers.push({ 
                questionIndex: answer.questionIndex, 
                answer: answer.answer || '', 
                isCorrect 
            });
        }
        
        const totalQuestions = questions.length || 1;
        const score = Math.round((correctCount / totalQuestions) * 100);
        
        const student = await Student.findOne({ username: req.user.username });
        
        tournament.participants.push({
            studentId: req.user.username,
            studentName: student ? student.fullName : req.user.username,
            score,
            timeTaken: timeTaken || 0,
            answers: detailedAnswers,
            submittedAt: new Date()
        });
        
        // ترتيب: الأعلى درجة أولاً، ثم الأسرع وقتاً
        tournament.participants.sort((a, b) => 
            b.score !== a.score ? b.score - a.score : a.timeTaken - b.timeTaken
        );
        
        await tournament.save();
        
        const userRank = tournament.participants.findIndex(
            p => p.studentId === req.user.username
        ) + 1;
        
        // مكافأة XP حسب الترتيب
        const xpReward = userRank === 1 ? 50 : userRank === 2 ? 30 : userRank === 3 ? 20 : 10;
        
        try {
            await Progress.findOneAndUpdate(
                { userId: req.user.username },
                { $inc: { xp: xpReward } },
                { upsert: true }
            );
        } catch(xpErr) {
            console.error('خطأ في تحديث XP:', xpErr);
        }
        
        console.log(`✅ مشاركة: ${req.user.username} | درجة: ${score}% | ترتيب: ${userRank}`);
        
        res.json({ 
            success: true,
            score,
            rank: userRank,
            correctCount,
            totalQuestions,
            xpEarned: xpReward,
            message: `أحسنت! حصلت على ${score}%`
        });
        
    } catch (error) {
        console.error('❌ خطأ في المشاركة:', error);
        res.status(500).json({ error: 'خطأ في المشاركة: ' + error.message });
    }
});

// ====================== 5. جلب نتائج البطولة ======================
app.get('/api/tournaments/:id/results', verifyToken, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Tournament.findById(req.params.id).lean();
        if (!tournament) {
            return res.status(404).json({ error: 'البطولة غير موجودة' });
        }
        
        // التحقق من الصلاحية
        if (req.user.type !== 'admin') {
            const isParticipant = (tournament.participants || []).some(
                p => p.studentId === req.user.username
            );
            if (!isParticipant) {
                return res.status(403).json({ 
                    error: 'يجب المشاركة في البطولة أولاً لعرض النتائج' 
                });
            }
        }
        
        const participants = tournament.participants || [];
        
        res.json({ 
            title: tournament.title,
            chapterName: tournament.chapterName,
            participants: participants.map(p => ({
                studentName: p.studentName,
                score: p.score,
                timeTaken: p.timeTaken,
                submittedAt: p.submittedAt
            })),
            top3: participants.slice(0, 3),
            totalParticipants: participants.length
        });
    } catch (error) {
        console.error('❌ خطأ في جلب النتائج:', error);
        res.status(500).json({ error: 'خطأ في جلب النتائج: ' + error.message });
    }
});

// ====================== 6. إنهاء البطولة (للأدمن) ======================
app.post('/api/tournaments/:id/finish', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) {
            return res.status(404).json({ error: 'البطولة غير موجودة' });
        }
        if (!tournament.isActive) {
            return res.status(400).json({ error: 'البطولة منتهية بالفعل' });
        }
        
        tournament.isActive = false;
        
        const participants = tournament.participants || [];
        if (participants.length >= 1) {
            tournament.winner1 = participants[0]?.studentId || '';
            tournament.winner2 = participants[1]?.studentId || '';
            tournament.winner3 = participants[2]?.studentId || '';
            
            // توزيع مكافآت الفائزين
            const rewards = [
                { id: tournament.winner1, xp: 100 },
                { id: tournament.winner2, xp: 60 },
                { id: tournament.winner3, xp: 30 }
            ];
            
            for (const reward of rewards) {
                if (reward.id) {
                    try {
                        await Progress.findOneAndUpdate(
                            { userId: reward.id },
                            { $inc: { xp: reward.xp } },
                            { upsert: true }
                        );
                    } catch(err) {
                        console.error('خطأ في مكافأة:', reward.id, err);
                    }
                }
            }
        }
        
        await tournament.save();
        console.log('✅ تم إنهاء البطولة:', tournament.title);
        
        res.json({ 
            success: true, 
            message: 'تم إنهاء البطولة وتوزيع المكافآت بنجاح',
            winner: participants[0]?.studentName || 'لا يوجد'
        });
    } catch (error) {
        console.error('❌ خطأ في إنهاء البطولة:', error);
        res.status(500).json({ error: 'خطأ في إنهاء البطولة: ' + error.message });
    }
});

// ====================== 7. جلب كل البطولات (للأدمن) ======================
app.get('/api/tournaments/all', verifyToken, isAdmin, async (req, res) => {
    try {
        await connectToDatabase();
        const tournaments = await Tournament.find()
            .sort({ createdAt: -1 })
            .lean();
            
        const result = tournaments.map(t => ({
            _id: t._id,
            title: t.title,
            code: t.code,
            chapterName: t.chapterName,
            questionCount: t.questionCount,
            startDate: t.startDate,
            endDate: t.endDate,
            isActive: t.isActive,
            participantsCount: (t.participants || []).length,
            createdAt: t.createdAt
        }));
        
        res.json(result);
    } catch (error) {
        console.error('❌ خطأ في جلب البطولات:', error);
        res.status(500).json({ error: 'خطأ في جلب البطولات: ' + error.message });
    }
});