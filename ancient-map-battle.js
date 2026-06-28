const tournamentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    chapterId: { type: String, required: true },
    chapterName: { type: String, required: true },
    questionCount: { type: Number, default: 20 },
    categoryFilter: { type: String, default: 'all' },
    timeLimitMinutes: { type: Number, default: 10 }, // أضف السطر ده
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