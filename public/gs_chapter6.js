// ==========================================================
var gs_chapter6 = {
  name: "الفصل 8: أمراض العين الشائعة",
  icon: "fas fa-eye",

  definitions: [
    {text:"Conjunctivitis", translation:"التهاب الملتحمة", answer:"Inflammation of the conjunctiva.", answerTranslation:"التهاب يصيب الملتحمة (الغشاء المبطن للجفن وبياض العين)."},
    {text:"Trichiasis (Rubbing lash)", translation:"الشعرة الطاعنة (الرمش الاحتكاكي)", answer:"The inward direction of eyelashes, scratching the surface of the cornea and conjunctiva.", answerTranslation:"اتجاه الرموش نحو الداخل، مما يسبب خدش سطح القرنية والملتحمة."},
    {text:"Entropion", translation:"انقلاب الجفن للداخل", answer:"The inward turning of the eyelid margin, often arising from an old trachoma infection.", answerTranslation:"انقلاب حافة الجفن نحو الداخل، وغالباً ما ينتج عن إصابة قديمة بالتراخوما."},
    {text:"Ectropion", translation:"انقلاب الجفن للخارج", answer:"The outward turning of the eyelid margin, often affecting the elderly due to weakness of the eyelid muscles and tissues.", answerTranslation:"انقلاب حافة الجفن نحو الخارج، ويصيب غالباً كبار السن بسبب ضعف عضلات وأنسجة الجفن."},
    {text:"Ptosis", translation:"تدلي الجفن", answer:"Drooping of the eyelid.", answerTranslation:"هبوط أو تدلي الجفن العلوي."},
    {text:"Corneal Ulcer", translation:"قرحة القرنية", answer:"The loss of the surface epithelium of the cornea.", answerTranslation:"فقدان الطبقة الظهارية السطحية للقرنية."},
    {text:"Cataract", translation:"الساد (المياه البيضاء)", answer:"Partial or complete loss of the lens's transparency.", answerTranslation:"فقدان جزئي أو كامل لشفافية عدسة العين."},
    {text:"Glaucoma", translation:"الزرق (المياه الزرقاء)", answer:"The elevation of intraocular pressure above normal levels (10-21 mmHg), which leads to atrophy of the retina and optic nerve and deterioration of the visual field.", answerTranslation:"ارتفاع ضغط العين فوق المعدل الطبيعي (10-21 ملم زئبقي)، مما يؤدي لضمور الشبكية والعصب البصري وتدهور مجال الرؤية."},
    {text:"6/6 visual acuity", translation:"حدة الإبصار 6/6", answer:"The person can identify the direction of all the signs on the vision chart from a distance of six meters.", answerTranslation:"قدرة الشخص على تمييز اتجاه كل الرموز بلوحة قياس النظر من مسافة ستة أمتار."},
    {text:"Myopia (Short-sightedness)", translation:"قصر النظر", answer:"Light rays entering the eye focus in front of the retina.", answerTranslation:"تتجمع أشعة الضوء الداخلة للعين أمام الشبكية بدلاً من عليها."},
    {text:"Hypermetropia (Long-sightedness)", translation:"طول النظر", answer:"Light rays entering the eye focus behind the retina.", answerTranslation:"تتجمع أشعة الضوء الداخلة للعين خلف الشبكية."},
    {text:"Astigmatism", translation:"الاستجماتيزم (اللابؤرية)", answer:"The difference in the refractive power of the eye in different meridians.", answerTranslation:"اختلاف في قوة انكسار العين باتجاهات (محاور) مختلفة."},
    {text:"Retinal Detachment", translation:"انفصال الشبكية", answer:"The separation of the retina from the choroid which nourishes it.", answerTranslation:"انفصال الشبكية عن المشيمية التي تغذيها."}
  ],

  mcq: [
    {text:"The diameter of the human eye is:", translation:"قطر مقلة العين البشرية هو:", options:["A) 12 mm","B) 24 mm","C) 36 mm"], correct:"B) 24 mm", correctTranslation:"24 ملم"},
    {text:"The middle layer of the eye wall consists of:", translation:"تتكون الطبقة الوسطى لجدار العين من:", options:["A) Cornea and Sclera","B) Retina","C) Iris, ciliary body, and choroid"], correct:"C) Iris, ciliary body, and choroid", correctTranslation:"القزحية والجسم الهدبي والمشيمية"},
    {text:'The "Thief of Sight" refers to:', translation:'"لص البصر" يشير إلى:', options:["A) Closed-angle glaucoma","B) Open-angle glaucoma","C) Senile cataract"], correct:"B) Open-angle glaucoma", correctTranslation:"الزرق مفتوح الزاوية"},
    {text:"Normal intraocular pressure levels are:", translation:"المعدل الطبيعي لضغط العين هو:", options:["A) 10-21 mmHg","B) 5-10 mmHg","C) 25-30 mmHg"], correct:"A) 10-21 mmHg", correctTranslation:"10-21 ملم زئبقي"},
    {text:"Myopia is corrected using:", translation:"يُصحَّح قصر النظر باستخدام:", options:["A) Convex lenses","B) Concave lenses","C) Bifocal lenses"], correct:"B) Concave lenses", correctTranslation:"العدسات المقعرة"}
  ],

  truefalse: [
    {text:"The cornea and lens focus light rays on the macula of the retina.", translation:"تُركِّز القرنية والعدسة أشعة الضوء على النقرة المركزية بالشبكية (البقعة الصفراء).", correct:true},
    {text:"Chalazion arises from inflammation of the lacrimal gland.", translation:"البردة (الشلازيون) تنشأ من التهاب الغدة الدمعية.", correct:false},
    {text:"Spring Catarrh is a chronic eye allergy that increases in winter.", translation:"رمد الربيع هو حساسية مزمنة بالعين تزداد شدتها في الشتاء.", correct:false},
    {text:"Pterygium is treated by surgical removal if it affects visual acuity.", translation:"الظفرة تُعالَج بالاستئصال الجراحي إذا أثّرت على حدة الإبصار.", correct:true},
    {text:"Senile cataract usually affects only one eye.", translation:"الساد الشيخوخي يصيب عادة عيناً واحدة فقط.", correct:false},
    {text:"Hypermetropia may lead to esotropia (convergent squint) in children.", translation:"طول النظر قد يؤدي للحول الأنسي (التقاربي) لدى الأطفال.", correct:true}
  ],

  explain: [
    {text:"List the three layers of the eye wall.", translation:"اذكر طبقات جدار العين الثلاث.", answer:"The Outer Layer: consists of the cornea and the sclera. The Middle Layer: consists of the iris + ciliary body + choroid. The Inner Layer: the retina.", answerTranslation:"الطبقة الخارجية: تتكون من القرنية والصلبة. الطبقة الوسطى: تتكون من القزحية + الجسم الهدبي + المشيمية. الطبقة الداخلية: الشبكية."},
    {text:"List the three chambers of the interior of the eye.", translation:"اذكر حجرات العين الداخلية الثلاث.", answer:"Anterior chamber: between the iris and the cornea. Posterior chamber: between the iris and the lens. Vitreous chamber: behind the eye's lens.", answerTranslation:"الحجرة الأمامية: بين القزحية والقرنية. الحجرة الخلفية: بين القزحية والعدسة. الحجرة الزجاجية: خلف عدسة العين."},
    {text:"List the accessory structures of the eye.", translation:"اذكر الملحقات التابعة للعين.", answer:"Eyelids. Conjunctiva. Lacrimal apparatus. Eye muscles.", answerTranslation:"الجفون. الملتحمة. الجهاز الدمعي. عضلات العين."},
    {text:"List the common symptoms complained of by eye patients.", translation:"اذكر الأعراض الشائعة التي يشتكي منها مرضى العيون.", answer:"Gradual weakening of vision (blurring). Rapid loss of vision. Burning and itching of the eye. Eye pain. Discharge and redness of the eye. Deviation and squint (strabismus) of the eye. Continuous tearing.", answerTranslation:"ضعف تدريجي بالرؤية (ضبابية). فقدان سريع للبصر. حرقان وحكة بالعين. ألم بالعين. إفرازات واحمرار بالعين. انحراف وحول بالعين. دموع مستمرة."},
    {text:"List the complications of Trachoma.", translation:"اذكر مضاعفات التراخوما.", answer:"Trichiasis, Entropion, Fatty cysts, Conjunctival dryness, Corneal ulcer and opacities.", answerTranslation:"الشعرة الطاعنة، انقلاب الجفن للداخل، الأكياس الدهنية، جفاف الملتحمة، قرحة القرنية وعتامتها."},
    {text:"List the causes of Corneal Ulcers.", translation:"اذكر أسباب قرح القرنية.", answer:"Eye injuries. Hypopyon ulcer. Viral ulcer caused by the herpes virus. Deficiency of proteins and vitamin A. Secondary ulcer resulting from trachoma.", answerTranslation:"إصابات العين. قرحة صديدية داخل الحجرة الأمامية. قرحة فيروسية بسبب فيروس الهربس. نقص البروتينات وفيتامين أ. قرحة ثانوية ناتجة عن التراخوما."},
    {text:"List the types of Acquired Cataract.", translation:"اذكر أنواع الساد المكتسب.", answer:"Senile cataract (in the elderly). Cataract resulting from injuries. Secondary cataract.", answerTranslation:"الساد الشيخوخي (لدى كبار السن). الساد الناتج عن إصابات. الساد الثانوي."},
    {text:"List the steps to prepare a patient for cataract surgery.", translation:"اذكر خطوات تجهيز المريض لعملية الساد.", answer:"Thorough eye examination. Examination of the retina or performing an ultrasound. Performing necessary tests such as blood sugar, liver, and kidney function. Measuring the power of the intraocular lens (IOL). Sterilizing the eye surface with povidone-iodine drops and covering the eyelashes.", answerTranslation:"فحص شامل للعين. فحص الشبكية أو إجراء موجات فوق صوتية. إجراء الفحوصات اللازمة كسكر الدم ووظائف الكبد والكلى. قياس قوة العدسة داخل العين. تعقيم سطح العين بقطرات بوفيدون آيودين وتغطية الرموش."},
    {text:"List the diagnostic criteria for open-angle glaucoma.", translation:"اذكر معايير تشخيص الزرق مفتوح الزاوية.", answer:"Elevated intraocular pressure. Cupping of the optic disc. Changes in the visual field. Open eye angle.", answerTranslation:"ارتفاع ضغط العين. تجويف (تكهف) القرص البصري. تغيرات بمجال الرؤية. زاوية عين مفتوحة."},
    {text:"List the stages of Diabetic Retinopathy.", translation:"اذكر مراحل اعتلال الشبكية السكري.", answer:"Mild Diabetic Retinopathy: characterized by microaneurysms and hemorrhages. The stage of growth of new blood vessels from the retina and optic nerve.", answerTranslation:"اعتلال الشبكية السكري الخفيف: يتميز بأمهات دم دقيقة ونزيف. مرحلة نمو أوعية دموية جديدة من الشبكية والعصب البصري."}
  ]
};
