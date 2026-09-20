/* ====================== german-syllabus.js ======================
   قواعد كل مستوى (A1 → C1) + مواضيع المحادثة والحياة اليومية والتمريض/المستشفى.
   ده "المرجع" اللي بيتبعت لموديل الذكاء الاصطناعي عشان يبني الخطة على أساسه.
   الموديل ملزم يغطّي كل بند هنا، وحرّ يضيف قواعد إضافية يشوفها مهمة (بتظهر للطالب بعلامة "إضافة").
   المصادر: قائمة قواعد Goethe-Zertifikat A1 (Fit in Deutsch 1)، مصفوفة ÖIF للمستويين A2 وB1،
   فهارس Hueber "Grammatik leicht" A2/B1، وتدريب القواعد B2 من telc / برنامج Goethe لـ B2–C1،
   ومواضيع التمريض من كتب telc "Deutsch Pflege" (B1·B2) ودورات Deutsch in der Pflege. */

const g = (id, de, ar, note) => ({ id, de, ar, note: note || '' });

const LEVELS = {
    A1: {
        id: 'A1', titleAr: 'المبتدئ', unitCount: 12,
        goalAr: 'تعرّف بنفسك وتتكلم في المواقف اليومية البسيطة، وتفهم كلمات وجمل المستشفى الأساسية.',
        sourceAr: 'مبنية على قائمة قواعد Goethe-Zertifikat A1 الرسمية.',
        grammar: [
            g('a1-pron', 'Personalpronomen & Höflichkeitsform Sie', 'ضمائر الفاعل (ich, du, er…) وصيغة الاحترام Sie', 'ich/du/er/sie/es/wir/ihr/sie/Sie'),
            g('a1-sein-haben', 'sein & haben im Präsens', 'تصريف sein وhaben في المضارع'),
            g('a1-verben', 'Regelmäßige Verben & Vokalwechsel im Präsens', 'تصريف الأفعال المنتظمة، والأفعال المتغيّرة الحرف (fahren, sprechen, essen, sehen, lesen, nehmen)'),
            g('a1-v2', 'Verbzweitstellung (Aussagesatz)', 'ترتيب الجملة الخبرية: الفعل في المركز الثاني (Ich fahre morgen / Morgen fahre ich)'),
            g('a1-fragen', 'Fragesatz: W-Fragen & Ja/Nein-Fragen', 'أسئلة W (wer, was, wo, woher, wohin, wie, wann, warum) وأسئلة نعم/لا'),
            g('a1-artikel', 'Genus & Artikel: der/die/das, ein/eine, Nullartikel', 'الجنس النحوي والأدوات: المعرفة والنكرة وعدم وجود أداة'),
            g('a1-plural', 'Plural der Nomen', 'جمع الأسماء وطرق تكوينه'),
            g('a1-akk', 'Nominativ & Akkusativ (Akkusativergänzung)', 'حالتا الرفع Nominativ والنصب Akkusativ (der → den, ein → einen)'),
            g('a1-neg', 'Negation: nicht & kein', 'النفي بـ nicht وkein/keine'),
            g('a1-poss', 'Possessivartikel: mein, dein, sein, ihr, unser, euer, Ihr', 'أدوات الملكية'),
            g('a1-modal', 'Modalverben (Präsens): können, wollen, müssen, möchten (dürfen)', 'الأفعال الناقصة: يقدر، يريد، يجب، أودّ، يُسمح (مع الإطار Satzklammer)'),
            g('a1-trennbar', 'Verben mit trennbarem Präfix', 'الأفعال المنفصلة (aufstehen, einkaufen, anrufen)', 'Satzklammer'),
            g('a1-imperativ', 'Imperativ (du-, ihr- und Sie-Form)', 'فعل الأمر للمفرد والجمع وصيغة الاحترام'),
            g('a1-dativ-pron', 'Personalpronomen im Akkusativ und Dativ (mich/dich…, mir/dir…)', 'ضمائر المفعول (mich, dich, ihn…) وضمائر Dativ (mir, dir, ihm…) في عبارات مثل Wie geht es dir?'),
            g('a1-dativ', 'Dativ nach mit/bei/nach/von/zu/aus & Verben wie helfen, danken, gefallen', 'حالة Dativ بعد حروف الجر mit, bei, nach, von, zu, aus وبعض الأفعال'),
            g('a1-lokal', 'Lokale Präpositionen: in, an, auf, aus, zu, nach, bei, von', 'حروف الجر المكانية (wo? woher? wohin?)'),
            g('a1-temporal', 'Temporale Präpositionen & Uhrzeit: am, im, um, von…bis, vor, nach', 'حروف الجر الزمنية والساعة والأيام والشهور'),
            g('a1-konnektoren', 'Satzverbindungen: und, oder, aber, deshalb, dann', 'أدوات الربط البسيطة'),
            g('a1-adj', 'Adjektive (prädikativ, adverbial) & Komparation: gern – lieber – am liebsten', 'الصفات واستخدامها في الجملة، وgern/lieber'),
            g('a1-dem', 'Demonstrativartikel & Indefinitpronomen: dieser, man, etwas, nichts, alles', 'أدوات الإشارة (dieser/diese/dieses) وman وetwas وnichts وalles'),
            g('a1-prat', 'Präteritum von sein & haben (war, hatte) & Konjunktiv II von mögen (möchte)', 'الماضي البسيط لـ sein وhaben وصيغة möchte المهذّبة'),
            g('a1-zahlen', 'Zahlen, Uhrzeit, Datum', 'الأرقام والساعة والتاريخ')
        ],
        dailyThemes: ['Begrüßung & Vorstellung', 'Länder & Sprachen', 'Zahlen, Alter, Telefon', 'Familie & Freunde', 'Essen & Trinken', 'Tagesablauf & Uhrzeit', 'Wohnung & Zimmer', 'Stadt & Verkehr', 'Einkaufen, Kleidung, Farben, Preise', 'Freizeit & Hobbys', 'Wetter & Jahreszeiten'],
        talkThemes: ['sich vorstellen', 'Small Talk', 'Verabredungen', 'Hobbys erzählen', 'um Hilfe bitten'],
        nurseThemes: ['Körperteile & Schmerzen', 'Krankenhaus: Räume, Berufe, Station', 'Patientendaten (Name, Alter, Geburtsdatum, Adresse)', 'einfache Anweisungen an Patienten (Bitte setzen Sie sich…)', 'Medikamente einfach (Tablette, Tropfen, dreimal täglich)']
    },
    A2: {
        id: 'A2', titleAr: 'ما قبل المتوسط', unitCount: 12,
        goalAr: 'تحكي عن الماضي، تعبّر عن رأيك وأسبابك، وتتعامل مع المريض في المواقف الروتينية.',
        sourceAr: 'مبنية على مصفوفة ÖIF لمستوى A2 وفهارس Goethe وHueber.',
        grammar: [
            g('a2-perfekt', 'Perfekt: haben/sein + Partizip II (regelmäßig & unregelmäßig)', 'الماضي التام Perfekt مع haben وsein'),
            g('a2-perfekt-trenn', 'Perfekt mit trennbaren/untrennbaren Verben & Verben auf -ieren', 'Perfekt مع الأفعال المنفصلة وغير المنفصلة وأفعال -ieren'),
            g('a2-haben-sein', 'Perfekt: haben oder sein?', 'متى نستخدم haben ومتى sein في Perfekt'),
            g('a2-prat-sh', 'Präteritum: sein & haben', 'الماضي البسيط لـ sein وhaben (war, hatte)'),
            g('a2-prat-modal', 'Präteritum der Modalverben', 'الماضي البسيط للأفعال الناقصة (konnte, musste, wollte, durfte, sollte)'),
            g('a2-prat-reg', 'Präteritum: häufige Verben (ging, kam, sah…) — rezeptiv', 'الماضي البسيط للأفعال الشائعة (للفهم)'),
            g('a2-dativ-pron', 'Personalpronomen im Dativ & Verben mit Dativ (helfen, gefallen, gehören, schmecken, passen)', 'ضمائر Dativ والأفعال التي تأخذ Dativ'),
            g('a2-zwei-obj', 'Verben mit Akkusativ- und Dativergänzung (geben, schenken, zeigen, schicken)', 'أفعال بمفعولين وترتيب المفعولين'),
            g('a2-kasus', 'Kasus-Übersicht: Nominativ, Akkusativ, Dativ (Artikel & Nomen)', 'مراجعة الحالات الثلاث مع الأدوات'),
            g('a2-wechsel', 'Wechselpräpositionen: Wo? (Dativ) / Wohin? (Akkusativ) — stehen/stellen, liegen/legen, sitzen/setzen', 'حروف الجر المتغيّرة مع Dativ وAkkusativ'),
            g('a2-praep', 'Temporale & lokale Präpositionen: seit, vor, ab, bis, während, bei, nach, gegenüber', 'حروف جر زمنية ومكانية'),
            g('a2-nebensatz', 'Nebensätze mit weil, dass, wenn (Verb am Ende)', 'الجمل الفرعية بـ weil وdass وwenn'),
            g('a2-konn', 'Hauptsatz-Konnektoren: denn, deshalb, trotzdem, darum, sondern', 'أدوات ربط الجمل الرئيسية'),
            g('a2-damit', 'Nebensatz mit damit & Infinitiv mit zu (einfach)', 'الجمل بـ damit ومصدر zu البسيط'),
            g('a2-indirekt', 'Indirekte Fragesätze mit ob und W-Wort', 'الأسئلة غير المباشرة بـ ob وأدوات الاستفهام'),
            g('a2-reflexiv', 'Reflexive Verben & Reflexivpronomen', 'الأفعال الانعكاسية (sich waschen, sich freuen, sich fühlen)'),
            g('a2-verb-praep', 'Verben mit Präpositionen & Fragen mit Präposition (warten auf, sich freuen über; Worauf? Auf wen?)', 'أفعال مع حروف جر وأسئلتها'),
            g('a2-komp', 'Komparativ & Superlativ (größer, am größten; als, wie)', 'المقارنة والتفضيل'),
            g('a2-adjdekl', 'Adjektivdeklination nach bestimmtem/unbestimmtem Artikel und Nullartikel', 'تصريف نهايات الصفات'),
            g('a2-poss-dem', 'Possessivartikel im Akkusativ/Dativ & Demonstrativartikel', 'أدوات الملكية والإشارة في حالات مختلفة'),
            g('a2-konj2', 'Konjunktiv II: würde, hätte, wäre, könnte (höfliche Bitten, Wünsche, Ratschläge)', 'صيغة Konjunktiv II للطلب المهذّب والنصيحة'),
            g('a2-passiv', 'Passiv Präsens', 'المبني للمجهول في المضارع'),
            g('a2-genitiv', 'Genitiv (einfach): Namen, während, wegen', 'حالة Genitiv البسيطة'),
            g('a2-zeit', 'Zeitangaben, Ordinalzahlen, Futur mit werden', 'التواريخ والأعداد الترتيبية والمستقبل بـ werden'),
            g('a2-indef', 'lassen, man, es & Indefinitpronomen (jemand, niemand, welche)', 'lassen وman وes وضمائر غير محدّدة')
        ],
        dailyThemes: ['Wochenende & Freizeit erzählen', 'Reisen & Urlaub', 'Wohnen & Möbel', 'Einladungen, Feste & Geschenke', 'Arbeit & Beruf', 'Restaurant & Essen bestellen', 'Kleidung & Einkaufen', 'Wetter & Gesundheit im Alltag', 'Behörden, Post, Bank', 'Verkehr & Wegbeschreibung', 'Schule, Lernen & Pläne'],
        talkThemes: ['über die Vergangenheit sprechen', 'Meinungen & Gründe', 'Vorschläge & Verabredungen', 'sich beschweren & entschuldigen', 'Telefongespräche'],
        nurseThemes: ['Körperpflege beim Patienten', 'Essenswünsche & Ernährung', 'Arztbesuch & Beschwerden (seit wann?)', 'Medikamentengabe', 'Vitalzeichen messen', 'Pflegeübergabe (Basics)', 'Hilfsmittel & Mobilisation']
    },
    B1: {
        id: 'B1', titleAr: 'المتوسط', unitCount: 12,
        goalAr: 'تتكلم بطلاقة نسبية عن الخبرات والخطط، وتكتب وتفهم نصوص الحياة والعمل، وتتواصل بأمان مع المرضى وزملاء الفريق.',
        sourceAr: 'مبنية على مصفوفة ÖIF لمستوى B1 وفهرس Hueber "Grammatik leicht B1".',
        grammar: [
            g('b1-prat', 'Präteritum (alle Verben) & Erzählen in der Vergangenheit', 'الماضي البسيط لكل الأفعال والسرد'),
            g('b1-plusq', 'Plusquamperfekt', 'الماضي البعيد Plusquamperfekt'),
            g('b1-futur', 'Futur I (werden + Infinitiv) & Vermutungen', 'المستقبل والتوقّعات'),
            g('b1-passiv', 'Passiv: Präsens, Präteritum, Perfekt, mit Modalverben', 'المبني للمجهول في الأزمنة المختلفة ومع الأفعال الناقصة'),
            g('b1-konj2', 'Konjunktiv II: Gegenwart & Vergangenheit (irreale Wünsche/Bedingungen, Ratschläge)', 'Konjunktiv II للحاضر والماضي: أمنيات وشروط غير واقعية'),
            g('b1-relativ', 'Relativsätze: Nominativ, Akkusativ, Dativ, mit Präposition, was/wo', 'الجمل الموصولة بأنواعها'),
            g('b1-infinitiv', 'Infinitivsätze: zu, um…zu, ohne…zu, (an)statt…zu', 'جمل المصدر بـ zu وum…zu وohne…zu وstatt…zu'),
            g('b1-temporal', 'Temporale Nebensätze: als/wenn, bevor, nachdem, während, seit(dem), bis', 'الجمل الفرعية الزمنية'),
            g('b1-kausal', 'Kausale & konzessive Nebensätze: weil, da, obwohl; final: damit', 'أسباب وتنازل وغاية'),
            g('b1-konditional', 'Konditionalsätze: wenn, falls (real & irreal)', 'جمل الشرط'),
            g('b1-zweiteilig', 'Zweiteilige Konnektoren: sowohl…als auch, nicht nur…sondern auch, weder…noch, entweder…oder, zwar…aber, je…desto', 'الروابط ثنائية الأجزاء'),
            g('b1-genitiv', 'Genitiv & Präpositionen mit Genitiv: wegen, trotz, während, statt', 'Genitiv وحروف الجر معه'),
            g('b1-n-dekl', 'n-Deklination', 'تصريف الأسماء بـ n (der Student → den Studenten)'),
            g('b1-adj', 'Adjektivdeklination (vollständig), Komparativ/Superlativ als Adjektiv, Partizip als Adjektiv', 'تصريف الصفات كاملًا والصفات من الأفعال'),
            g('b1-indirekt', 'Indirekte Fragen & indirekte Aufforderung', 'الأسئلة والطلبات غير المباشرة'),
            g('b1-verb-praep', 'Verben, Nomen & Adjektive mit Präpositionen; Pronominaladverbien (darauf, davon…)', 'أفعال وأسماء وصفات مع حروف جر'),
            g('b1-modal', 'Modalverben in Präteritum/Perfekt & Ersatzformen; brauchen … zu; lassen', 'الأفعال الناقصة في الماضي وبدائلها'),
            g('b1-part', 'Modalpartikeln & Redemittel (doch, mal, ja, eben, halt)', 'كلمات التلطيف في الكلام المحكي'),
            g('b1-wort', 'Wortbildung: Nominalisierung, Vor- & Nachsilben', 'تكوين الكلمات')
        ],
        dailyThemes: ['Erfahrungen & Lebenslauf', 'Träume, Wünsche & Pläne', 'Beruf, Bewerbung & Vorstellungsgespräch', 'Wohnungssuche & Nachbarn', 'Medien & Internet', 'Umwelt & Verkehr', 'Feste & Traditionen', 'Bildung & Ausbildung', 'Gesundheit & Lebensstil', 'Konflikte lösen & Beschwerden', 'Reisen & Kultur'],
        talkThemes: ['Erfahrungen erzählen', 'Meinung begründen & diskutieren', 'Ratschläge geben', 'Vor- und Nachteile', 'Präsentation kurz halten'],
        nurseThemes: ['Aufnahme & Pflegeanamnese', 'Vitalzeichenkontrolle', 'Ausscheidung & Hygiene', 'Sturz & Prophylaxen', 'Wundversorgung & Dekubitus', 'Arzt- und Pflegevisite', 'Übergabegespräch', 'Zusammenarbeit im Team']
    },
    B2: {
        id: 'B2', titleAr: 'فوق المتوسط', unitCount: 12,
        goalAr: 'تناقش موضوعات معقّدة، تكتب تقارير وتوثيقًا مهنيًا، وتدير محادثات مع المرضى وذويهم والفريق الطبي.',
        sourceAr: 'مبنية على تدريب القواعد B2 (telc) وبرنامج Goethe لمستويي B2–C1.',
        grammar: [
            g('b2-passiv', 'Passiv in allen Zeiten, Zustandspassiv & Passiversatzformen (sich lassen + Infinitiv, sein + zu, -bar/-lich)', 'المبني للمجهول بكل أشكاله وبدائله'),
            g('b2-konj1', 'Konjunktiv I & indirekte Rede', 'Konjunktiv I والكلام المنقول'),
            g('b2-konj2', 'Konjunktiv II: Vergangenheit, irreale Vergleiche (als ob), Höflichkeit', 'Konjunktiv II للماضي والتشبيه غير الواقعي والتهذيب'),
            g('b2-modal-subj', 'Modalverben: objektiver & subjektiver Gebrauch (soll, will, dürfte, muss)', 'الأفعال الناقصة بمعنى موضوعي وشخصي (تخمين ونقل)'),
            g('b2-partizip', 'Partizipialattribute: Partizip I/II als Adjektiv, erweiterte Attribute', 'الصفات المشتقة من اسم الفاعل والمفعول والمركّبات'),
            g('b2-nominal', 'Nominalisierung & Verbalisierung; Nominalstil vs. Verbalstil', 'تحويل الأفعال لأسماء والعكس'),
            g('b2-konnektoren', 'Konnektoren: kausal, konzessiv, konditional, konsekutiv, final, modal, adversativ (obwohl, trotzdem, dennoch, folglich, indem, sodass, falls, sofern)', 'أدوات الربط بأنواعها'),
            g('b2-relativ', 'Relativsätze: mit Präposition, wer/was, Genitiv (dessen/deren)', 'الجمل الموصولة المتقدّمة'),
            g('b2-infinitiv', 'Infinitivsätze & Zeitformen; Infinitiv vs. dass-Satz', 'جمل المصدر والأزمنة'),
            g('b2-genitiv-praep', 'Präpositionen mit Genitiv: aufgrund, hinsichtlich, anlässlich, im Rahmen…', 'حروف جر مع Genitiv للكتابة الرسمية'),
            g('b2-nvv', 'Nomen-Verb-Verbindungen (Funktionsverbgefüge): in Betracht ziehen, zur Verfügung stehen', 'تعبيرات اسم + فعل'),
            g('b2-praep-verb', 'Verben, Nomen & Adjektive mit festen Präpositionen', 'أفعال وأسماء وصفات بحروف جر ثابتة'),
            g('b2-satzbau', 'Satzbau: Position I/II, Mittelfeld, Angaben, Negation, Satzklammer', 'ترتيب الجملة المتقدّم'),
            g('b2-text', 'Textkohäsion: Pronominaladverbien, Konnektoren, Referenz', 'ترابط النص')
        ],
        dailyThemes: ['Gesellschaft & Zusammenleben', 'Arbeitswelt & Karriere', 'Medien & Werbung', 'Wissenschaft & Technik', 'Umwelt & Klima', 'Kultur & Literatur', 'Politik & Recht (Alltag)', 'Wirtschaft & Verbraucher', 'Migration & Integration', 'Gesundheitssystem', 'Diskussion & Debatte'],
        talkThemes: ['Argumentieren', 'Stellung nehmen', 'Zusammenfassen', 'Höflich widersprechen', 'Beschwerdegespräche'],
        nurseThemes: ['Pflegeplanung & Dokumentation', 'Medikamentengabe, Infusion, Blutabnahme', 'Aufnahme, Entlassung, Überleitung', 'Demenz & Kommunikation', 'Angehörigengespräch', 'Anleitungsgespräch (Patienten anleiten)', 'Notfälle & Vitalzeichen', 'Hygiene & Infektionsschutz', 'Kultursensible Pflege']
    },
    C1: {
        id: 'C1', titleAr: 'المتقدّم', unitCount: 12,
        goalAr: 'تتكلم وتكتب بدقة وأسلوب مناسب لكل موقف مهني وأكاديمي، وتقود مناقشات الحالات والنقاشات الفنية.',
        sourceAr: 'مبنية على فهارس Übungsgrammatik B2–C2 وبرنامج Goethe للقواعد B2–C1.',
        grammar: [
            g('c1-partizip', 'Erweiterte Partizipialattribute & Nominalstil (Fach- und Wissenschaftssprache)', 'التراكيب الاسمية والصفات الموسّعة في اللغة العلمية'),
            g('c1-konj1', 'Konjunktiv I: Zeitformen, indirekte Rede in Berichten', 'Konjunktiv I في التقارير بكل أزمنته'),
            g('c1-konj2', 'Konjunktiv II komplex: irreale Konditional-, Wunsch-, Vergleichs- und Konsekutivsätze', 'Konjunktiv II المعقّد'),
            g('c1-modal', 'Modalverben & modalverbähnliche Verben: subjektiver Gebrauch, Vermutung, Wiedergabe', 'التخمين ونقل كلام الآخرين'),
            g('c1-passiv', 'Passivvarianten & Funktionsverbgefüge im Passiv', 'أشكال المبني للمجهول المتقدّمة'),
            g('c1-konn', 'Komplexe Konnektoren: insofern…als, sofern, indessen, wohingegen, geschweige denn, zumal', 'روابط معقّدة'),
            g('c1-praep', 'Präpositionen mit Genitiv (zwecks, mittels, infolge, angesichts…)', 'حروف جر رسمية مع Genitiv'),
            g('c1-satzgefuege', 'Komplexe Satzgefüge, Mittelfeld & Stilistik', 'الجمل المركّبة والأسلوب'),
            g('c1-modalpart', 'Modalpartikeln, Ellipsen & Register (formell/informell)', 'مستويات الأسلوب والتلطيف والحذف'),
            g('c1-wort', 'Wortschatzerweiterung: Idiomatik, feste Wendungen, Fachbegriffe', 'التعبيرات الثابتة والمصطلحات المتخصصة')
        ],
        dailyThemes: ['Wissenschaft & Forschung', 'Kunst, Literatur & Medien', 'Wirtschaft & Globalisierung', 'Ethik & Gesellschaft', 'Bildung & Zukunft', 'Recht & Verwaltung', 'Umwelt & Nachhaltigkeit'],
        talkThemes: ['Fachgespräch führen', 'Vortrag & Diskussion', 'verhandeln & vermitteln', 'Stellungnahme schreiben'],
        nurseThemes: ['Fallbesprechung & Fallvorstellung', 'Palliativpflege & Patientenverfügung', 'psychisch kranke Patienten', 'Konfliktgespräche im Team', 'Beratung & Anleitung von Angehörigen', 'Fachtexte & Leitlinien lesen', 'Delegation, Leitung & Qualitätsmanagement']
    }
};

const TRACKS = {
    talk: { ar: 'محادثة عامة' },
    life: { ar: 'حياة يومية' },
    nurse: { ar: 'تمريض ومستشفى' }
};

module.exports = { LEVELS, TRACKS, LEVEL_IDS: Object.keys(LEVELS) };
