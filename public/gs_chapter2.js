// ==========================================================
// بنك أسئلة الجراحة العامة - الفصل الثاني: الصدمة (Shock)
// ترجمة طبية علمية وليست حرفية
// ==========================================================
var gs_chapter2 = {
  name: "الفصل 3: الصدمة (Shock)",
  icon: "fas fa-heartbeat",

  definitions: [
    {text:"Shock", translation:"الصدمة", answer:"Is a drop in blood circulation, resulting from an imbalance between blood volume and circulatory volume, either due to blood loss, or due to expansion of the circulatory volume.", answerTranslation:"هبوط في الدورة الدموية ناتج عن اختلال التوازن بين حجم الدم وحجم الجهاز الدوري، سواء بفقد الدم أو باتساع السرير الوعائي."},
    {text:"Surgical shock", translation:"الصدمة الجراحية (النزفية)", answer:"As a result of massive loss of blood or fluids from the body, as happens in cases of bleeding, burns, vomiting, and severe diarrhea.", answerTranslation:"تنتج عن فقد شديد للدم أو السوائل من الجسم كما يحدث في النزيف والحروق والقيء والإسهال الشديد."},
    {text:"Neurogenic shock", translation:"الصدمة العصبية", answer:"Occurs as a result of severe pain.", answerTranslation:"تحدث نتيجة ألم شديد."},
    {text:"Septic shock", translation:"صدمة الإنتان", answer:"Occurs as a result of severe inflammation in the body. The inflammation may be in the urethra, pneumonia, purulent or gangrenous infection of the wound, internal abscess, or advanced peritonitis.", answerTranslation:"تحدث نتيجة التهاب شديد بالجسم، سواء بالمسالك البولية أو الرئة (التهاب رئوي) أو عدوى قيحية أو غرغرينية بالجرح أو خراج داخلي أو التهاب صفاق متقدم."}
  ],

  mcq: [
    {text:"The symptoms of septic shock:", translation:"من أعراض صدمة الإنتان:", options:["A- Facial pallor and profuse sweating","B- Elevated temperature","C- High blood pressure"], correct:"B- Elevated temperature", correctTranslation:"ارتفاع درجة الحرارة"}
  ],

  complete: [
    {text:"Types of shock: ……………, ……………………………, ……………………………….", translation:"أنواع الصدمة: ……، ……………………، ……………………….", completion:"Surgical shock, Neurogenic shock, and Septic shock", completionTranslation:"الصدمة الجراحية (النزفية)، الصدمة العصبية، وصدمة الإنتان"},
    {text:"The symptoms of surgical shock: ……………, ………………, ……………………., ……………", translation:"أعراض الصدمة الجراحية: ……، ………………، ……………………، ……………", completion:"Facial pallor and profuse sweating, rapid and weak pulse, low blood pressure, rapid and shallow breathing", completionTranslation:"شحوب الوجه والتعرق الغزير، نبض سريع وضعيف، انخفاض ضغط الدم، تنفس سريع وسطحي"},
    {text:"The symptoms of neurogenic shock: ………………………., ……………………, …………………………", translation:"أعراض الصدمة العصبية: ………، ……………، …………………", completion:"Slow and weak pulse, low blood pressure, pallor and profuse sweating", completionTranslation:"نبض بطيء وضعيف، انخفاض ضغط الدم، شحوب وتعرق غزير"},
    {text:"The symptoms of septic shock: …………………………., …………………………………, ……………………………", translation:"أعراض صدمة الإنتان: ………، ……………………، ……………………", completion:"Elevated temperature, rapid pulse, low blood pressure and local symptoms", completionTranslation:"ارتفاع الحرارة، تسرع النبض، انخفاض ضغط الدم، وأعراض موضعية"}
  ],

  explain: [
    {text:"Treatment of surgical shock", translation:"علاج الصدمة الجراحية (النزفية)", answer:"1- Place the patient lying on their back with head lowered. 2- Administer blood intravenously. 3- Administer solutions like glucose saline or Ringer's or lactated Ringer's. 4- Administer vasopressors for circulation and hydrocortisone which helps the circulation retain fluids. 5- Treat the cause.", answerTranslation:"1- وضع المريض مستلقياً على ظهره مع خفض الرأس. 2- نقل الدم وريدياً. 3- إعطاء محاليل مثل الجلوكوز الملحي أو رينجر أو رينجر لاكتات. 4- إعطاء مقبضات وعائية لدعم الدورة الدموية وهيدروكورتيزون للمساعدة على احتباس السوائل بالدورة الدموية. 5- علاج السبب."},
    {text:"Treatment of septic shock", translation:"علاج صدمة الإنتان", answer:"1- Treat the cause, and usually surgical treatment is the most important type of treatment. 2- Administer solutions intravenously and transfuse plasma and blood. 3- Strong antibiotics appropriate for the expected type of bacteria. 4- Administer Zantac intravenously to prevent stomach ulcers. 5- Improve breathing to increase oxygen in the blood.", answerTranslation:"1- علاج السبب، والعلاج الجراحي غالباً هو الأهم. 2- إعطاء محاليل وريدية ونقل بلازما ودم. 3- مضادات حيوية قوية مناسبة لنوع البكتيريا المتوقع. 4- إعطاء زانتاك وريدياً للوقاية من قرحة المعدة. 5- تحسين التنفس لزيادة الأكسجين بالدم."},
    {text:"Treatment of neurogenic shock", translation:"علاج الصدمة العصبية", answer:"Place the patient in a lying position with head lowered, stimulate the patient, and administer solutions.", answerTranslation:"وضع المريض مستلقياً مع خفض الرأس، وتنبيه المريض، وإعطاء المحاليل الوريدية."}
  ],

  truefalse: [
    {text:"The first stage of shock is called irreversible shock.", translation:"المرحلة الأولى من الصدمة تُسمى الصدمة غير القابلة للارتداد.", correct:false},
    {text:"In the second stage of shock, the patient does not respond to treatment and shows no improvement in vital signs.", translation:"في المرحلة الثانية من الصدمة لا يستجيب المريض للعلاج ولا يظهر تحسناً بالعلامات الحيوية.", correct:true},
    {text:"Surgical shock occurs as a result of massive loss of blood or fluids from the body.", translation:"تحدث الصدمة الجراحية نتيجة فقد شديد للدم أو السوائل من الجسم.", correct:true},
    {text:"Neurogenic shock occurs as a result of severe inflammation in the body.", translation:"تحدث الصدمة العصبية نتيجة التهاب شديد بالجسم.", correct:false}
  ]
};
