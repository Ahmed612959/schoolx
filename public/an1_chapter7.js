// ====================== الفصل السابع - بنك أسئلة التشريح (الصف الأول الثانوي) ======================
// Chapter 7: The Urinary System - الجهاز البولي
var an1_chapter7 = {
  name: "الفصل 7: الجهاز البولي (Urinary System)",
  icon: "fas fa-kidneys",

  definitions: [
    { questionId: "an1_ch7_def_1", text: "The outer part of the kidney.", translation: "الجزء الخارجي من الكلية.", cat: "definitions", answer: "Cortex (القشرة)" },
    { questionId: "an1_ch7_def_2", text: "The beginning of the ureter.", translation: "بداية الحالب (Ureter).", cat: "definitions", answer: "Renal Pelvis (حوض الكلية)" },
    { questionId: "an1_ch7_def_3", text: "The ureter enters it from behind, and the urethra exits from its inferior aspect.", translation: "يدخل الحالب إليها من الخلف، ويخرج منها الإحليل من أسفلها.", cat: "definitions", answer: "Urinary Bladder (المثانة البولية)" },
    { questionId: "an1_ch7_def_4", text: "The passage through which urine exits from its inferior aspect.", translation: "الممر الذي يخرج البول من خلاله من أسفل المثانة.", cat: "definitions", answer: "Urethra (الإحليل)" },
    { questionId: "an1_ch7_def_5", text: "The inner part of the kidney.", translation: "الجزء الداخلي من الكلية.", cat: "definitions", answer: "Medulla (لُب الكلية)" }
  ],

  mcq: [
    { questionId: "an1_ch7_mcq_1", text: "The length of the male urethra is:", translation: "طول الإحليل عند الذكر هو:", cat: "mcq", options: ["4 cm", "10 cm", "15 cm", "20 cm"], correct: 3 },
    { questionId: "an1_ch7_mcq_2", text: "The kidney is located:", translation: "تقع الكلية:", cat: "mcq", options: ["In front of the vertebral column (أمام العمود الفقري)", "Beside the vertebral column (بجانب العمود الفقري)", "In the pelvis (في الحوض)", "In front of the stomach (أمام المعدة)"], correct: 1 },
    { questionId: "an1_ch7_mcq_3", text: "The longest part of the male urethra is the:", translation: "أطول جزء في الإحليل عند الذكر هو الجزء:", cat: "mcq", options: ["Prostatic part (البروستاتي)", "Membranous part (الغشائي)", "Penile part (القضيبي)", "Pelvic part (الحوضي)"], correct: 2 }
  ],

  truefalse: [
    { questionId: "an1_ch7_tf_1", text: "The length of the urethra in male is 20 cm.", translation: "طول الإحليل عند الذكر 20 سم.", cat: "truefalse", correct: true, explanation: "" },
    { questionId: "an1_ch7_tf_2", text: "Semen excretion is from functions of male's urethra.", translation: "إخراج المني هو من وظائف الإحليل عند الذكر.", cat: "truefalse", correct: true, explanation: "" },
    { questionId: "an1_ch7_tf_3", text: "Urine excretion is from functions of urethra for both male and female.", translation: "إخراج البول من وظائف الإحليل عند كل من الذكر والأنثى.", cat: "truefalse", correct: true, explanation: "" },
    { questionId: "an1_ch7_tf_4", text: "The right kidney is slightly lower than the left.", translation: "الكلية اليمنى أقل ارتفاعًا قليلًا من اليسرى.", cat: "truefalse", correct: true, explanation: "" },
    { questionId: "an1_ch7_tf_5", text: "Kidneys lie on one side of the vertebral column.", translation: "تقع الكليتان على جانب واحد من العمود الفقري.", cat: "truefalse", correct: false, explanation: "تقع الكليتان على جانبي العمود الفقري (كل كلية على جانب)." },
    { questionId: "an1_ch7_tf_6", text: "Kidneys are located in the abdomen directly above the diaphragm.", translation: "تقع الكليتان في البطن مباشرة أعلى الحجاب الحاجز.", cat: "truefalse", correct: false, explanation: "تقع الكليتان في البطن مباشرة أسفل الحجاب الحاجز." },
    { questionId: "an1_ch7_tf_7", text: "Cortex is the inner part of the kidney.", translation: "القشرة (Cortex) هي الجزء الداخلي من الكلية.", cat: "truefalse", correct: false, explanation: "القشرة هي الجزء الخارجي من الكلية." },
    { questionId: "an1_ch7_tf_8", text: "The urinary bladder is pear-shaped.", translation: "المثانة البولية على شكل كمثرى.", cat: "truefalse", correct: false, explanation: "المثانة البولية هرمية الشكل (Pyramidal)." },
    { questionId: "an1_ch7_tf_9", text: "Urethra is much shorter in males than in females.", translation: "الإحليل أقصر بكثير عند الذكر منه عند الأنثى.", cat: "truefalse", correct: false, explanation: "الإحليل أقصر بكثير عند الأنثى منه عند الذكر." },
    { questionId: "an1_ch7_tf_10", text: "Urethra in male has no parts.", translation: "ليس للإحليل عند الذكر أجزاء.", cat: "truefalse", correct: false, explanation: "الإحليل عند الأنثى هو الذي ليس له أجزاء؛ أما عند الذكر فله أجزاء (بروستاتي، غشائي، قضيبي)." },
    { questionId: "an1_ch7_tf_11", text: "The length of urethra in males is 4 cm.", translation: "طول الإحليل عند الذكر 4 سم.", cat: "truefalse", correct: false, explanation: "طول الإحليل عند الأنثى 4 سم؛ أما عند الذكر فطوله 20 سم." }
  ],

  complete: [
    { questionId: "an1_ch7_comp_1", text: "The right kidney lies on the ……. side and is ………. than the left kidney due to……………...", translation: "تقع الكلية اليمنى في الجانب ……. وهي ………. من الكلية اليسرى بسبب……………...", cat: "complete", completion: "Right (الأيمن) - Slightly lower (أقل ارتفاعًا قليلًا) - Pressure from the liver above it (الضغط الناتج من الكبد فوقها)" },
    { questionId: "an1_ch7_comp_2", text: "The renal artery arises from ………….. while the renal vein empties into ………..", translation: "ينشأ الشريان الكلوي من ………….. بينما يصب الوريد الكلوي في ………..", cat: "complete", completion: "Aorta (الأبهر) - Inferior Vena Cava (الوريد الأجوف السفلي)" },
    { questionId: "an1_ch7_comp_3", text: "The ureter is ………….. long and connects ……………..", translation: "طول الحالب ………….. ويصل ……………..", cat: "complete", completion: "25-30 cm - Kidney and urinary bladder (الكلية والمثانة البولية)" }
  ],

  explain: [
    { questionId: "an1_ch7_exp_1", text: "Compare between the urethra in males and females (Length, parts, function).", translation: "قارن بين الإحليل عند الذكر والأنثى (الطول، الأجزاء، الوظيفة).", cat: "explain", answer: "عند الذكر (In Males):\n- الطول: 20 سم (Length: 20 cm)\n- الأجزاء: 1) الجزء البروستاتي (داخل البروستاتا، طوله 4 سم) 2) الجزء الغشائي (بين غشاءين، طوله 1.5-2 سم) 3) الجزء القضيبي (داخل القضيب، طوله 15 سم)\n- الوظيفة: 1) إخراج البول 2) إخراج المني\n\nعند الأنثى (In Females):\n- الطول: 4 سم (Length: 4 cm)\n- الأجزاء: ليس له أجزاء (Has no parts)\n- الوظيفة: إخراج البول فقط (Urine excretion only)" },
    { questionId: "an1_ch7_exp_2", text: "Describe the shape of urinary bladder.", translation: "صف شكل المثانة البولية.", cat: "explain", answer: "هرمية الشكل (Pyramidal in shape)." },
    { questionId: "an1_ch7_exp_3", text: "Mention parts of Kidney.", translation: "اذكر أجزاء الكلية.", cat: "explain", answer: "- القشرة (Cortex): الجزء الخارجي (The outer part)\n- اللب (Medulla): الجزء الداخلي (The inner part)\n- حوض الكلية (Renal Pelvis): بداية الحالب (The beginning of the ureter)" },
    { questionId: "an1_ch7_exp_4", text: "Describe the ureters.", translation: "صف الحالبين.", cat: "explain", answer: "الطول: 25-30 سم. يصلان الكلية بالمثانة البولية. يتحرك البول عبر الحالب بواسطة انقباضات عضلاته. وفي حالة وجود تضيق أو انسداد بسبب حصوة، تزداد هذه الانقباضات مما يؤدي إلى المغص الكلوي (Length: 25-30 cm. They connect the kidney to the urinary bladder. Urine moves through the ureter by contractions of its muscles. If there is a stricture or obstruction due to a stone, these contractions increase, leading to renal colic)." },
    { questionId: "an1_ch7_exp_5", text: "Describe the urethra.", translation: "صف الإحليل.", cat: "explain", answer: "الممر الذي يخرج البول من خلاله من المثانة البولية إلى الخارج. وهو أطول بكثير عند الذكر منه عند الأنثى (The passage through which urine exits from the urinary bladder to the outside. It is much longer in males than in females)." },
    { questionId: "an1_ch7_exp_6", text: "Mention location of Kidney.", translation: "اذكر موقع الكلية.", cat: "explain", answer: "- تقع في البطن، مباشرة أسفل الحجاب الحاجز (Located in the abdomen, directly below the diaphragm)\n- على جانبي العمود الفقري (On either side of the vertebral column)\n- تقع خلف كل الأحشاء الأخرى، ومتصلة بعضلات الظهر من الداخل (They lie behind all other viscera, attached to the back muscles internally)\n- الكلية اليمنى أقل ارتفاعًا قليلًا من اليسرى بسبب ضغط الكبد فوقها (The right kidney is slightly lower than the left due to pressure from the liver above it)" },
    { questionId: "an1_ch7_exp_7", text: "Mention location of urinary bladder.", translation: "اذكر موقع المثانة البولية.", cat: "explain", answer: "الموقع: في الحوض عندما تكون فارغة، ولكن عند امتلائها تصعد إلى البطن (Location: In the pelvis when empty. But when full, it ascends into the abdomen)." },
    { questionId: "an1_ch7_exp_8", text: "Mention parts of urinary system in female.", translation: "اذكر أجزاء الجهاز البولي عند الأنثى.", cat: "explain", answer: "- الوريد الأجوف السفلي (Inferior vena cava)\n- الأبهر (Aorta)\n- الشريان الكلوي (Renal artery)\n- الحالب (Ureter)\n- المثانة البولية (Urinary bladder)\n- الإحليل (Urethra)" }
  ],

  list: [],

  situations: []
};
