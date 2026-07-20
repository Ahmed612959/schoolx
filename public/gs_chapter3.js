// ==========================================================
var gs_chapter3 = {
  name: "الفصل 4: مضاعفات ما بعد الجراحة ونقل الدم",
  icon: "fas fa-procedures",

  definitions: [
    {text:"Air embolism", translation:"الانصمام الهوائي", answer:"A rare condition that may occur with the insertion of a central venous catheter, where air enters the bloodstream and travels to the heart or lungs.", answerTranslation:"حالة نادرة قد تحدث مع إدخال القسطرة الوريدية المركزية، حيث يدخل الهواء إلى مجرى الدم وينتقل إلى القلب أو الرئتين."},
    {text:"Pulmonary embolism", translation:"الانصمام الرئوي", answer:"Occurs as a result of a clot forming in a peripheral vein, and part of it travels through the bloodstream to lodge in the pulmonary vessels.", answerTranslation:"يحدث نتيجة تكوّن جلطة في وريد طرفي، وينتقل جزء منها عبر مجرى الدم ليستقر في أوعية الرئة."},
    {text:"Paralytic Ileus", translation:"الانسداد المعوي الشللي", answer:"Loss of normal intestinal motility, resulting from potassium deficiency and occurring after operations for peritonitis and pancreatitis.", answerTranslation:"فقدان الحركة الطبيعية للأمعاء، ينتج عن نقص البوتاسيوم ويحدث بعد عمليات التهاب الصفاق والبنكرياس."},
    {text:"Gastric dilatation", translation:"اتساع المعدة", answer:"Acute distension of the stomach that occurs due to stomach operations performed without using a nasogastric tube or without suction during and after the operation.", answerTranslation:"اتساع حاد بالمعدة يحدث نتيجة عمليات بالمعدة دون استخدام أنبوب أنفي معدي أو دون شفط أثناء وبعد العملية."},
    {text:"Hematoma", translation:"الورم الدموي", answer:"A localized collection of clotted blood in the tissues, resulting from bleeding due to a technical shortcoming in surgery or the patient's predisposition to bleeding.", answerTranslation:"تجمع موضعي من الدم المتجلط بالأنسجة، ينتج عن نزيف بسبب قصور فني بالجراحة أو استعداد المريض للنزيف."},
    {text:"Seroma", translation:"الورم المصلي", answer:"A localized collection of serous fluid that occurs after operations like mastectomy or hernia repair, due to dissection and cutting of lymphatic vessels under the skin.", answerTranslation:"تجمع موضعي للسائل المصلي يحدث بعد عمليات مثل استئصال الثدي أو إصلاح الفتق، بسبب تشريح وقطع الأوعية الليمفاوية تحت الجلد."},
    {text:"Bronchitis", translation:"التهاب الشعب الهوائية", answer:"Inflammation of the bronchi resulting from the aspiration of fluids over a period of time and their entry into the lungs.", answerTranslation:"التهاب بالشعب الهوائية ينتج عن استنشاق سوائل خلال فترة زمنية ودخولها إلى الرئتين."},
    {text:"Pneumonia", translation:"الالتهاب الرئوي", answer:"An infection of the lung tissue caused by a microbe (bacterial, viral, or fungal).", answerTranslation:"عدوى بنسيج الرئة يسببها ميكروب (بكتيري أو فيروسي أو فطري)."},
    {text:"Jaundice", translation:"اليرقان", answer:"A condition transmitted via blood transfusion, resulting from the patient becoming infected with Hepatitis B or C if the donor was infected with one of these viruses (during the incubation period).", answerTranslation:"حالة تنتقل عن طريق نقل الدم، تنتج عن إصابة المريض بالتهاب الكبد الفيروسي B أو C إذا كان المتبرع مصاباً بأحد هذين الفيروسين (أثناء فترة الحضانة)."}
  ],

  complete: [
    {text:"Complications of solution (blood) transfusion are divided into ____ and ____.", translation:"تنقسم مضاعفات نقل المحاليل (الدم) إلى ____ و ____.", completion:"Local complications / General complications", completionTranslation:"مضاعفات موضعية / مضاعفات عامة"},
    {text:"Symptoms of pyrogenic reaction are ____, ____, and ____.", translation:"أعراض التفاعل الحموي (البيروجيني) هي ____ و ____ و ____.", completion:"Sudden rise in temperature / Chills / Shivering", completionTranslation:"ارتفاع مفاجئ بدرجة الحرارة / قشعريرة / رعشة"},
    {text:"Symptoms of pulmonary embolism are ____, ____, and ____.", translation:"أعراض الانصمام الرئوي هي ____ و ____ و ____.", completion:"Rapid pulse / Elevated blood pressure / Rapid breathing and cyanosis", completionTranslation:"تسرع النبض / ارتفاع الضغط / تسرع التنفس والزرقة"},
    {text:"Complications of the wound include ____, ____, and ____.", translation:"من مضاعفات الجرح ____ و ____ و ____.", completion:"Hematoma / Seroma / Wound dehiscence", completionTranslation:"ورم دموي / ورم مصلي / انفكاك الجرح"},
    {text:"Symptoms of deep vein thrombosis (DVT) are ____, ____, and ____.", translation:"أعراض تجلط الأوردة العميقة هي ____ و ____ و ____.", completion:"Swelling of the leg compared to the other / Leg pain especially on movement / Slight rise in temperature", completionTranslation:"تورم الساق مقارنة بالأخرى / ألم بالساق خاصة عند الحركة / ارتفاع طفيف بدرجة الحرارة"}
  ],

  explain: [
    {text:"List the complications of general anesthesia.", translation:"اذكر مضاعفات التخدير العام.", answer:"Malignant hyperthermia, nausea and vomiting, vocal cord spasm, urinary retention, decreased body temperature, and injury of some nerves.", answerTranslation:"فرط الحرارة الخبيث، الغثيان والقيء، تشنج الحبال الصوتية، احتباس البول، انخفاض درجة حرارة الجسم، وإصابة بعض الأعصاب."},
    {text:"Describe the treatment of pulmonary embolism.", translation:"اشرح علاج الانصمام الرئوي.", answer:"Transfer the patient to intensive care to give oxygen and artificial respiration when needed, along with blood-thinning drugs such as heparin and streptokinase.", answerTranslation:"نقل المريض للعناية المركزة لإعطاء الأكسجين والتنفس الصناعي عند الحاجة، مع أدوية مميعة للدم مثل الهيبارين والستربتوكيناز."},
    {text:"List the symptoms of transfusion incompatibility.", translation:"اذكر أعراض عدم توافق نقل الدم.", answer:"Elevated temperature and chills, rapid pulse, drop in blood pressure, pain in the kidney region, difficulty breathing, and cyanosis of the lips and extremities.", answerTranslation:"ارتفاع الحرارة مع القشعريرة، تسرع النبض، هبوط ضغط الدم، ألم بمنطقة الكلى، صعوبة التنفس، وزرقة الشفاه والأطراف."},
    {text:"Describe the treatment of urinary retention.", translation:"اشرح علاج احتباس البول.", answer:"Treatment involves giving analgesics, helping the patient relax, and attempting to assist urination.", answerTranslation:"يشمل العلاج إعطاء المسكنات، ومساعدة المريض على الاسترخاء، ومحاولة مساعدته على التبول."}
  ],

  truefalse: [
    {text:"Hematoma occurs after operations like mastectomy or hernia repair due to dissection and cutting of lymphatic vessels under the skin.", translation:"الورم الدموي يحدث بعد عمليات مثل استئصال الثدي أو إصلاح الفتق بسبب تشريح وقطع الأوعية الليمفاوية تحت الجلد.", correct:false},
    {text:"Bronchitis results from the aspiration of fluids over a period of time and their entry into the lungs.", translation:"التهاب الشعب الهوائية ينتج عن استنشاق سوائل خلال فترة زمنية ودخولها إلى الرئتين.", correct:true},
    {text:"Pneumonia results from a lung infection by a microbe.", translation:"الالتهاب الرئوي ينتج عن عدوى بالرئة بسبب ميكروب.", correct:true},
    {text:"Cardiac arrhythmias include impaired heart function, coronary insufficiency, and myocardial infarction.", translation:"اضطرابات نظم القلب تشمل ضعف وظيفة القلب، وقصور الشرايين التاجية، واحتشاء عضلة القلب.", correct:true},
    {text:"Fever occurs in 10% of patients after surgery.", translation:"تحدث الحمى لدى 10% من المرضى بعد الجراحة.", correct:false},
    {text:"Paralytic ileus occurs due to stomach operations without using a nasogastric tube or without suction during and after the operation.", translation:"الانسداد المعوي الشللي يحدث بسبب عمليات المعدة دون استخدام أنبوب أنفي معدي أو دون شفط أثناء وبعد العملية.", correct:false},
    {text:"Gastric dilatation results from potassium deficiency and occurs after operations for peritonitis and pancreatitis.", translation:"اتساع المعدة ينتج عن نقص البوتاسيوم ويحدث بعد عمليات التهاب الصفاق والبنكرياس.", correct:false},
    {text:"After hernia operations, urinary retention may occur due to pain, or after prostate operations.", translation:"بعد عمليات الفتق قد يحدث احتباس بول بسبب الألم، أو بعد عمليات البروستاتا.", correct:true},
    {text:"Incompatibility reactions are the most dangerous complication of blood transfusion.", translation:"تفاعلات عدم التوافق هي أخطر مضاعفات نقل الدم.", correct:true},
    {text:"Jaundice is transmitted via blood, resulting from the patient being infected with hepatitis B and C if the donor is infected with one of these viruses.", translation:"اليرقان ينتقل عبر الدم، وينتج عن إصابة المريض بالتهاب الكبد B و C إذا كان المتبرع مصاباً بأحد هذين الفيروسين.", correct:true}
  ]
};
