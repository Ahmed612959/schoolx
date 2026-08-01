// ==========================================================
// بنك أسئلة مبادئ وأسس التمريض (Fundamentals of Nursing)
// الفصل الثاني: التواصل (Communication)
// ترجمة تمريضية علمية دقيقة
// ==========================================================
var fon_chapter2 = {
  name: "الفصل 2: التواصل",
  icon: "fas fa-comments",

  definitions: [
    {text:"Communication", translation:"التواصل", answer:"Is the process of exchanging information and generating meanings between two or more people.", answerTranslation:"هو عملية تبادل المعلومات واستخلاص المعاني بين شخصين أو أكثر."},
    {text:"Verbal communication", translation:"التواصل اللفظي", answer:"Is the exchange of information using spoken or written words.", answerTranslation:"تبادل المعلومات باستخدام الكلمات المنطوقة أو المكتوبة."},
    {text:"Non-verbal communication", translation:"التواصل غير اللفظي", answer:"Is the transmission of information without the use of words, also known as body language.", answerTranslation:"نقل المعلومات دون استخدام الكلمات، ويُعرف أيضًا بلغة الجسد."},
    {text:"Feedback", translation:"الرد/التغذية الراجعة", answer:"Confirmation of the message provides feedback that the receiver has understood the intended message.", answerTranslation:"التأكد من أنّ المستقبل قد فهم الرسالة المقصودة؛ وهو ما يُعرف بالتغذية الراجعة."},
    {text:"Active listening", translation:"الاستماع الفعّال", answer:"Is paying full attention to the speaker, both verbally and non-verbally, to understand their message.", answerTranslation:"إيلاء الاهتمام الكامل للمتحدّث لفهم رسالته، من خلال ملاحظة الكلام والإشارات غير اللفظية على حدّ سواء."},
    {text:"Interpersonal communication", translation:"التواصل بين الأشخاص", answer:"Is one-on-one interaction, usually face-to-face, between individuals, such as a nurse and a patient.", answerTranslation:"التفاعل الفردي المباشر (وجهًا لوجه) بين شخصين، كالممرّضة والمريض."},
    {text:"Therapeutic communication", translation:"التواصل العلاجي", answer:"Is a purposeful interaction aimed at promoting a patient's emotional well-being.", answerTranslation:"تفاعل مقصود يهدف إلى دعم الصحة النفسية والعاطفية للمريض."},
    {text:"Intrapersonal communication", translation:"التواصل الذاتي", answer:"Refers to self-talk, self-verbalization or inner thought one has with oneself.", answerTranslation:"الحوار الداخلي مع النفس، أو التفكير الصامت والتخاطب الذاتي."}
  ],

  truefalse: [
    {text:"Effective communication is only one-way.", translation:"التواصل الفعّال اتجاه واحد فقط.", correct:false, correctTranslation:"التواصل الفعّال عملية ثنائية الاتجاه؛ يشمل مرسلًا ومستقبلًا وتغذية راجعة."},
    {text:"Therapeutic communication builds trust between nurses and patients.", translation:"التواصل العلاجي يبني الثقة بين الممرّض والمريض.", correct:true},
    {text:"Non-verbal communication includes facial expressions and gestures.", translation:"التواصل غير اللفظي يشمل تعبيرات الوجه والإيماءات.", correct:true},
    {text:"The sender is the person who receives the message.", translation:"المرسل هو الشخص الذي يستقبل الرسالة.", correct:false, correctTranslation:"المرسل هو من يبدأ التواصل ويُرسل الرسالة؛ أما المستقبل فهو من يستقبلها ويفكّك رموزها."},
    {text:"Environmental factors like noise can hinder communication.", translation:"العوامل البيئية كالضجيج يمكن أن تعيق التواصل.", correct:true},
    {text:"Feedback is optional in effective communication.", translation:"التغذية الراجعة اختيارية في التواصل الفعّال.", correct:false, correctTranslation:"التغذية الراجعة ضرورية للتأكد من أن الرسالة وُصلت وفُهمت كما هو مقصود."},
    {text:"Communication between healthcare workers is unimportant.", translation:"التواصل بين العاملين في الرعاية الصحية غير مهم.", correct:false, correctTranslation:"التواصل بين فريق الرعاية الصحية أمرٌ حيوي لسلامة المريض واستمرارية العلاج."},
    {text:"Body posture is an example of non-verbal communication.", translation:"وضعية الجسد مثال على التواصل غير اللفظي.", correct:true},
    {text:"Communication always involves both a sender and a receiver.", translation:"التواصل يشمل دائمًا مرسلًا ومستقبلًا.", correct:true},
    {text:"Silence can be used therapeutically in nursing.", translation:"الصمت يمكن استخدامه علاجيًا في التمريض.", correct:true},
    {text:"Effective communication is not influenced by emotional states.", translation:"التواصل الفعّال لا يتأثر بالحالات الانفعالية.", correct:false, correctTranslation:"التواصل يتأثر بشكل كبير بالحالة الانفعالية والنفسية لكل من المرسل والمستقبل."},
    {text:"The nurse must interpret the patient's verbal and non-verbal messages.", translation:"على الممرّضة تفسير رسائل المريض اللفظية وغير اللفظية.", correct:true},
    {text:"Eye contact is a non-verbal cue that shows attentiveness.", translation:"التواصل البصري (النظر إلى العينين) إشارة غير لفظية تُظهر الاهتمام.", correct:true},
    {text:"Therapeutic communication requires empathy.", translation:"التواصل العلاجي يتطلب التعاطف (الإحساس بما يشعر به المريض).", correct:true}
  ],

  complete: [
    {text:"__________ communication uses words to share information.", translation:"التّواصل __________ يستخدم الكلمات لمشاركة المعلومات.", completion:"Verbal", completionTranslation:"اللفظي"},
    {text:"__________ listening ensures that the nurse understands the patient's message.", translation:"الاستماع __________ يضمن للممرّضة فهم رسالة المريض.", completion:"Active", completionTranslation:"الفعّال"},
    {text:"The __________ initiates the communication process.", translation:"__________ هو من يبدأ عملية التواصل.", completion:"Sender", completionTranslation:"المرسل"},
    {text:"A __________ is the actual content of communication.", translation:"__________ هو المحتوى الفعلي للتواصل.", completion:"Message", completionTranslation:"الرسالة"},
    {text:"Communication without words is called __________ communication.", translation:"التواصل دون كلمات يُسمّى التواصل __________.", completion:"Non-verbal", completionTranslation:"غير اللفظي"},
    {text:"__________ communication involves sharing information through touch and body movement.", translation:"التواصل __________ يتضمن مشاركة المعلومات عبر اللمس وحركة الجسد.", completion:"Kinesthetic", completionTranslation:"الحركي/الجسدي"},
    {text:"Nurses use __________ techniques to build trust with patients.", translation:"تستخدم الممرّضات تقنيات __________ لبناء الثقة مع المرضى.", completion:"Therapeutic", completionTranslation:"علاجية"},
    {text:"__________ refers to how the receiver interprets the message.", translation:"__________ يشير إلى كيفية تفسير المستقبل للرسالة.", completion:"Decoding", completionTranslation:"فك الترميز/فهم الرسالة"},
    {text:"Silence is used as a __________ tool in nursing communication.", translation:"يُستخدم الصمت كأداة __________ في التواصل التمريضي.", completion:"Therapeutic", completionTranslation:"علاجية"},
    {text:"__________ communication occurs between healthcare professionals and patients.", translation:"التواصل __________ يحدث بين مقدّمي الرعاية الصحية والمرضى.", completion:"Interpersonal", completionTranslation:"الشخصي/بين الأفراد"},
    {text:"The __________ provides a response to the sender.", translation:"__________ يُقدّم ردًا للمرسل.", completion:"Receiver", completionTranslation:"المستقبل"},
    {text:"Messages transmitted through body language are examples of __________ communication.", translation:"الرسائل المنقولة عبر لغة الجسد أمثلة على التواصل __________.", completion:"Non-verbal", completionTranslation:"غير اللفظي"},
    {text:"__________ listening involves focusing entirely on the speaker's message.", translation:"الاستماع __________ يتطلب التركيز الكامل على رسالة المتحدّث.", completion:"Active", completionTranslation:"الفعّال"},
    {text:"Using touch is part of __________ communication.", translation:"استخدام اللمس جزء من التواصل __________.", completion:"Kinesthetic", completionTranslation:"الحركي"},
    {text:"__________ is essential to ensure the message was understood as intended.", translation:"__________ ضروري للتأكد من أن الرسالة فُهمت كما هو مقصود.", completion:"Feedback", completionTranslation:"التغذية الراجعة"},
    {text:"Communication channels like emails belong to __________ communication.", translation:"قنوات التواصل كالبريد الإلكتروني تنتمي إلى التواصل __________.", completion:"Electronic", completionTranslation:"الإلكتروني"}
  ],

  mcq: [
    {text:"What is the primary purpose of therapeutic communication?", translation:"ما الغرض الأساسي من التواصل العلاجي؟", options:["a. To gather patient data","b. To build trust","c. To diagnose conditions","d. To document care"], correct:"b. To build trust", correctTranslation:"بناء الثقة"},
    {text:"Which of the following is an example of non-verbal communication?", translation:"أيّ مما يلي يُعدّ مثالًا على التواصل غير اللفظي؟", options:["a. Email","b. Gestures","c. Phone call","d. Written report"], correct:"b. Gestures", correctTranslation:"الإيماءات"},
    {text:"What is a critical component of active listening?", translation:"ما المكوّن الحاسم في الاستماع الفعّال؟", options:["a. Interrupting frequently","b. Paying full attention","c. Avoiding eye contact","d. Finishing the patient's sentences"], correct:"b. Paying full attention", correctTranslation:"إيلاء الاهتمام الكامل"},
    {text:"What does the sender transmit?", translation:"ما الذي يُرسله المرسل؟", options:["a. Message","b. Feedback","c. Channel","d. Noise"], correct:"a. Message", correctTranslation:"الرسالة"},
    {text:"Which is a common barrier to communication?", translation:"ما العائق الشائع للتواصل؟", options:["a. Clear instructions","b. Emotional distress","c. Accurate feedback","d. Quiet environment"], correct:"b. Emotional distress", correctTranslation:"الضيق الانفعالي"},
    {text:"Which form of communication involves body language?", translation:"أيّ نوع من التواصل يشمل لغة الجسد؟", options:["a. Verbal","b. Kinesthetic","c. Auditory","d. Electronic"], correct:"b. Kinesthetic", correctTranslation:"التواصل الحركي"},
    {text:"What is the final step in the communication process?", translation:"ما الخطوة الأخيرة في عملية التواصل؟", options:["a. Sending the message","b. Providing feedback","c. Encoding the message","d. Choosing the channel"], correct:"b. Providing feedback", correctTranslation:"تقديم التغذية الراجعة"},
    {text:"What is the purpose of feedback in communication?", translation:"ما هدف التغذية الراجعة في التواصل؟", options:["a. To confuse the sender","b. To confirm understanding","c. To terminate the conversation","d. To encode the message"], correct:"b. To confirm understanding", correctTranslation:"التأكد من الفهم"},
    {text:"Which factor can hinder effective communication?", translation:"أيّ عامل يمكن أن يعيق التواصل الفعّال؟", options:["a. Empathy","b. Noise","c. Clarity","d. Rapport"], correct:"b. Noise", correctTranslation:"الضجيج/الضوضاء"},
    {text:"What is intrapersonal communication?", translation:"ما هو التواصل الذاتي؟", options:["a. Talking to oneself","b. Group discussion","c. Presentation to an audience","d. Nurse-patient interaction"], correct:"a. Talking to oneself", correctTranslation:"التحدث مع النفس/الحوار الداخلي"}
  ],

  explain: [
    {text:"Why is feedback important in communication?", translation:"لماذا تُعدّ التغذية الراجعة مهمة في التواصل؟", answer:"It confirms whether the message was understood as intended and helps clarify any misunderstandings.", answerTranslation:"تؤكد ما إذا كانت الرسالة قد فُهمت كما هو مقصود، وتساعد في توضيح أي سوء فهم."},
    {text:"What role does empathy play in therapeutic communication?", translation:"ما دور التعاطف في التواصل العلاجي؟", answer:"It helps the nurse understand and accept the patient's reality and accurately perceive their feelings.", answerTranslation:"يساعد الممرّض على فهم واقع المريض وتقبّله، وإدراك مشاعره بدقة."},
    {text:"How does active listening improve communication?", translation:"كيف يُحسّن الاستماع الفعّال من التواصل؟", answer:"Active listening means being attentive to what a patient is saying both verbally and nonverbally, which builds trust and prevents errors.", answerTranslation:"يعني الاستماع الفعّال الانتباه لما يقوله المريض لفظيًا وغير لفظيًّا، مما يبني الثقة ويقلل الأخطاء."},
    {text:"What is the effect of environmental noise on communication?", translation:"ما تأثير الضوضاء البيئية على التواصل؟", answer:"Noise can interfere with the transmission and reception of messages, leading to misinterpretation.", answerTranslation:"يمكن أن تتداخل الضوضاء مع إرسال واستقبال الرسائل، مما يؤدي إلى سوء التفسير."},
    {text:"Explain the difference between verbal and non-verbal communication.", translation:"اشرح الفرق بين التواصل اللفظي وغير اللفظي.", answer:"Verbal communication uses words (spoken or written), while non-verbal communication relies on body language, facial expressions, gestures, and tone of voice.", answerTranslation:"يستخدم التواصل اللفظي الكلمات (منطوقة أو مكتوبة)، بينما يعتمد التواصل غير اللفظي على لغة الجسد وتعبيرات الوجه والإيماءات ونبرة الصوت."},
    {text:"How can silence be used therapeutically?", translation:"كيف يمكن استخدام الصمت علاجيًا؟", answer:"Silence prompts some people to talk, allows a patient to think and gather thoughts, and conveys acceptance and respect.", answerTranslation:"يُشجّع الصمت بعض الأشخاص على الكلام، ويمنح المريض فرصة للتفكير وتجميع أفكاره، كما يُ conveys القبول والاحترام."},
    {text:"Why is clarity important in communication?", translation:"لماذا الوضوح مهم في التواصل؟", answer:"Clarity ensures the message is understood accurately; if unclear, the nurse should restate the message to confirm understanding.", answerTranslation:"الوضوح يضمن فهم الرسالة بدقة؛ وإذا كانت غير واضحة، يجب على الممرّضة إعادة صياغتها للتحقق من الفهم."},
    {text:"How do emotions influence communication?", translation:"كيف تؤثر العواطف على التواصل؟", answer:"Emotions are subjective feelings that affect how messages are sent and received; unexpressed feelings may cause stress and hinder effective interaction.", answerTranslation:"المشاعر هي أحاسيس ذاتية تؤثر في كيفية إرسال واستقبال الرسائل؛ والمشاعر المكبوتة قد تسبب التوتر وتعيق التفاعل الفعّال."}
  ]
};