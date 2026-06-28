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