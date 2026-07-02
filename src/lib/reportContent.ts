import { ParticipantProfile } from "./participantProfile";

export function composeParagraph(fragments: string[]): string {
  return fragments
    .filter((f): f is string => Boolean(f && f.trim()))
    .map((f) => {
      const trimmed = f.trim();
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .join(" ");
}

function fillName(text: string, name: string): string {
  return text.replace(/\{name\}/g, name);
}

const emotionalFunctionalFragments: Record<string, string> = {
  anxious: "{name} מגיע לרוב במצב של חרדה וכיווץ פנימי, המורגשים בשפת גופו ובקצב דיבורו",
  depressed: "ניכר אצל {name} מצב רוח דיכאוני ונטייה להסתגרות, המקשים עליו ליזום פעילות באופן עצמאי",
  unstable: "מצבו הרגשי של {name} מתאפיין בתנודתיות וסערה פנימית, כך שרמת התפקוד משתנה מיום ליום",
  stable: "{name} מציג יציבות ואיזון רגשי יחסיים, המהווים בסיס טוב להמשך התהליך",
};

const regulationFunctionalFragments: Record<string, string> = {
  stable: "יכולת הוויסות שלו תקינה ברובה, והוא מצליח להכיל מצבים מאתגרים ללא הפרעה משמעותית בתפקוד",
  dysregulated: "בולט אצלו קושי בוויסות עצמי, המתבטא בהתפרצויות כעס או בעוררות יתר מול טריגרים שונים",
  sensory: "רגישותו החושית הגבוהה לרעש ולריח יוצרת אצלו עומס ומצריכה התאמות סביבתיות מתמשכות",
  overwhelmed: "בעתות לחץ קיימת נטייה להצפה ולניתוק דיסוציאטיבי, המקשים עליו להישאר נוכח בכאן ועכשיו",
};

const personalityFunctionalFragments: Record<string, string> = {
  adaptive: "מבחינה אישיותית הוא מגלה יכולת הסתגלות טובה ושיתוף פעולה עם דמויות הצוות ועם שגרת החווה",
  difficulty: "הוא נוטה להתקשות בהסתגלות לשינויים ולדרישות חדשות, ונדרש לו זמן ותיווך כדי להתארגן מחדש",
  introverted: "אופיו המופנם והחששני גורם לו לנקוט משנה זהירות בטרם ייצור קשר עם אנשים חדשים",
  motivated: "ניכרת אצלו מוטיבציה גבוהה לעשייה ולשינוי, המהווה מנוע מרכזי בתהליך השיקומי",
};

const trustFunctionalFragments: Record<string, string> = {
  trusting: "בנוסף, הוא נותן אמון בקלות יחסית בצוות המטפל ונעזר בו בעת הצורך",
  suspicious: "לצד זאת, בולטת חשדנות המקשה עליו לתת אמון מלא בדמויות הסמכות שסביבו",
  gradual: "עם זאת, האמון שהוא רוכש בצוות ובמסגרת נבנה בהדרגה ומתחזק ככל שחולף הזמן",
  avoidant: "כמו כן, ניכרת נטייה להימנע מקרבה או משיתוף רגשי גם כאשר מוצע לו סיוע",
};

const symptomPhraseFragments: Record<string, string> = {
  flashbacks: "פלאשבקים חודרניים",
  nightmares: "קשיי שינה וסיוטים",
  concentration: "קשיי ריכוז ומיקוד",
  authority: "קושי בקבלת סמכות",
  transit: "הימנעות מתחבורה ציבורית",
  worthlessness: "דימוי עצמי נמוך",
};

const regulationSymptomFragments: Record<string, string> = {
  stable: "",
  dysregulated: "קשיי ויסות רגשי והתפרצויות זעם",
  sensory: "רגישות חושית מוגברת",
  overwhelmed: "נטייה להצפה ולניתוק דיסוציאטיבי",
};

const emotionalSymptomFragments: Record<string, string> = {
  anxious: "חרדה ומתח מתמשכים",
  depressed: "ירידה במצב הרוח והסתגרות",
  unstable: "תנודתיות רגשית ניכרת",
  stable: "",
};

const familyFamilyFragments: Record<string, string> = {
  supported: "{name} נהנה ממארג משפחתי עוטף ותומך, המהווה עבורו עוגן משמעותי במהלך התהליך",
  complex: "מערכת היחסים המשפחתית של {name} מורכבת ולעיתים טעונה, ודורשת רגישות בטיפול בנושאים הקשורים אליה",
  isolated: "{name} מתמודד עם בדידות וניתוק ממשפחתו, מה שמעצים את הצורך במעטפת תומכת חלופית במסגרת החווה",
};

const socialFamilyFragments: Record<string, string> = {
  connected: "לצד זאת, יכולתו ליצור קשר עם הסביבה הקרובה תורמת ומקלה במעט על הבדידות",
  isolated: "לצד זאת, נטייתו להתבודד גם מחוץ למשפחה מעמיקה את תחושת הניתוק",
  needs_mediation: "לצד זאת, הוא זקוק לתיווך גם בקשריו הקרובים ביותר על מנת לשמר אותם",
  leader: "לצד זאת, מעורבותו החברתית האקטיבית מסייעת לו לפצות במידה מסוימת על הקושי המשפחתי",
};

const trustFamilyFragments: Record<string, string> = {
  trusting: "כמו כן, נכונותו לתת אמון בסביבתו מסייעת בבניית מערכות יחסים תומכות נוספות",
  suspicious: "כמו כן, החשדנות המאפיינת אותו ניכרת גם בזירה המשפחתית ומקשה על תקשורת פתוחה",
  gradual: "כמו כן, גם בזירה המשפחתית האמון נבנה אצלו בהדרגה ובזהירות",
  avoidant: "כמו כן, הימנעותו משיתוף רגשי משפיעה גם על הקִרבה במעגל המשפחתי",
};

const attendanceProgressFragments: Record<string, string> = {
  regular: "{name} מתמיד בהגעתו לחווה ומגלה מחויבות רבה למסגרת ולשגרת הפעילות בה",
  absences: "נוכחותו של {name} מלווה בחיסורים מרובים עקב מצבו הנפשי או הפיזי, אולם כאשר הוא מגיע ניכרת מעורבות של ממש",
  unstable: "נוכחותו של {name} תנודתית, אך ניכרים אצלו ניסיונות גיוס עצמי חוזרים ונשנים כדי לשמר את הקשר עם החווה",
};

const farmAreaProgressFragments: Record<string, string> = {
  agriculture: "העבודה החקלאית ובחממות מהווה עבורו מרחב לקרקוע ולוויסות רגשי דרך מגע ישיר עם האדמה",
  animals: "הטיפול בבעלי החיים ובאורווה מעורר אצלו אחריות, עדינות ותחושת שייכות משמעותית",
  ancient_crafts: "השתלבותו בסדנת המלאכות הקדומות מאפשרת לו ביטוי יצירתי ותחושת הישג מוחשית",
  ceramics: "העבודה בקרמיקה מספקת לו מרחב רגוע לעיבוד רגשי מתוך יצירה בחומר",
  yoga: "תרגול היוגה תורם לשיפור יכולת הוויסות הגופני והנשימתי שלו",
  grazing: "השהות בשטחי המרעה מעניקה לו מרחב פתוח ורגיעה הרחק מגירויים מציפים",
  art: "עיסוקו באומנות מאפשר לו ביטוי רגשי בדרך לא-מילולית ומעודד אותו לחקור צדדים חדשים בעצמו",
};

const socialProgressFragments: Record<string, string> = {
  connected: "מבחינה חברתית, {name} משתלב בקלות יחסית ויוצר קשר עם משתתפים נוספים בחווה",
  isolated: "מבחינה חברתית, {name} נוטה להתבודד ומעדיף לעבוד לבדו, אך נוכחותו במרחב המשותף מהווה כשלעצמה התקדמות",
  needs_mediation: "מבחינה חברתית, {name} מביע רצון בקשר עם אחרים אך זקוק לתיווך הצוות כדי לממש אותו",
  leader: "מבחינה חברתית, {name} מגלה יוזמה ומנהיגות חיובית ותורם לשיתופי הפעולה בקבוצה",
};

const personalityProgressFragments: Record<string, string> = {
  adaptive: "מגמת ההסתגלות החיובית שלו למסגרת ניכרת גם בהתקדמות שהוא מפגין לאורך התהליך",
  difficulty: "למרות הקושי המוכר שלו בהסתגלות לשינויים, ניתן לראה סימני התקדמות הדרגתיים",
  introverted: "חרף אופיו המופנם, הוא מגלה נכונות הולכת וגדלה להיחשף ולהשתתף באופן פעיל יותר",
  motivated: "המוטיבציה הגבוהה שלו באה לידי ביטוי בהתמדה ובנכונות ללמוד מיומנויות חדשות",
};

const futureDirectionRehabFragments: Record<string, string> = {
  supported_employment: "כיוון ההשתלבות בתעסוקה נתמכת נבחר עבור {name} כמענה המתאים למאפייניו וליכולותיו הנוכחיות",
  continued_therapeutic: "עבור {name} נבחר כיוון של המשך תהליך טיפולי-שיקומי במסגרת החווה, כמענה התומך ביותר במצבו הנוכחי",
  gradual_independence: "עבור {name} נקבע כיוון של עצמאות והתנתקות הדרגתית מהמסגרת, בהתאם לקצב ההתקדמות שלו",
  too_early: "בשלב זה מוקדם מדי לקבוע כיוון עתידי סופי עבור {name}, וההערכה תתעדכן בהמשך התהליך",
};

const processStageRehabFragments: Record<string, string> = {
  early: "{name} נמצא בתחילת דרכו במסגרת ובשלב של היכרות עם הצוות ועם מרחבי הפעילות",
  stabilizing: "{name} נמצא באמצע התהליך ומפגין סימני התייצבות הדרגתית",
  transitioning: "{name} מתקרב לשלב של מעבר או סיום בתהליכו במסגרת",
};

const attendanceRecommendationFragments: Record<string, string> = {
  regular: "לאור נוכחותו הסדירה, מומלץ להמשיך ולבסס את מתכונת ההשתתפות הקיימת",
  absences: "לאור החיסורים המרובים, מומלץ לבחון מענים תומכים נוספים (כגון ליווי או הסעות) שיסייעו בהתמדה",
  unstable: "לאור התנודתיות בנוכחות, מומלץ ללוות את {name} בתמיכה מותאמת שתחזק את יכולתו להתמיד",
};

const trustRecommendationFragments: Record<string, string> = {
  trusting: "יכולתו לתת אמון בצוות מהווה משאב שיש להמשיך ולטפח בהמשך הדרך",
  suspicious: "מומלץ להמשיך ולעבוד בהדרגתיות על בניית אמון בסיסי מול הצוות והמסגרת",
  gradual: "מומלץ להמשיך בקצב מותאם המאפשר בניית אמון הדרגתית, כפי שהוכח כמתאים עבורו עד כה",
  avoidant: "מומלץ להמשיך ולעודד שיתוף רגשי בעדינות, מתוך רגישות לנטייתו להימנעות",
};

function composeFunctionalText(profile: ParticipantProfile): string {
  const fragments: string[] = [];
  if (profile.emotional) fragments.push(emotionalFunctionalFragments[profile.emotional]);
  if (profile.regulation) fragments.push(regulationFunctionalFragments[profile.regulation]);
  if (profile.personality) fragments.push(personalityFunctionalFragments[profile.personality]);
  if (profile.trust) fragments.push(trustFunctionalFragments[profile.trust]);
  return composeParagraph(fragments);
}

function composeSymptomsText(profile: ParticipantProfile, name: string): string {
  const items: string[] = [];
  for (const d of profile.difficulties) {
    const phrase = symptomPhraseFragments[d];
    if (phrase) items.push(phrase);
  }
  const regulationPhrase = profile.regulation ? regulationSymptomFragments[profile.regulation] : "";
  if (regulationPhrase && !items.includes(regulationPhrase)) items.push(regulationPhrase);
  const emotionalPhrase = profile.emotional ? emotionalSymptomFragments[profile.emotional] : "";
  if (emotionalPhrase && !items.includes(emotionalPhrase)) items.push(emotionalPhrase);

  const trimmed = items.slice(0, 5);
  if (trimmed.length === 0) {
    return fillName(
      `כיום, {name} מתפקד ללא קשיים בולטים במיוחד המשפיעים על שגרתו היומיומית.`,
      name
    );
  }
  const list = trimmed.join(", ");
  return fillName(
    `כיום, {name} מתמודד עם מגוון קשיים המשפיעים על תפקודו היומיומי, ובהם: ${list}.`,
    name
  );
}

function composeFamilyText(profile: ParticipantProfile): string {
  const fragments: string[] = [];
  if (profile.family) fragments.push(familyFamilyFragments[profile.family]);
  if (profile.social) fragments.push(socialFamilyFragments[profile.social]);
  if (profile.trust) fragments.push(trustFamilyFragments[profile.trust]);
  return composeParagraph(fragments);
}

function composeProgressText(profile: ParticipantProfile): string {
  const fragments: string[] = [];
  if (profile.attendance) fragments.push(attendanceProgressFragments[profile.attendance]);
  for (const area of profile.farmAreas) {
    const fragment = farmAreaProgressFragments[area];
    if (fragment) fragments.push(fragment);
  }
  if (profile.social) fragments.push(socialProgressFragments[profile.social]);
  if (profile.personality) fragments.push(personalityProgressFragments[profile.personality]);
  return composeParagraph(fragments);
}

function composeRecommendationsText(profile: ParticipantProfile): string {
  const fragments: string[] = [];
  if (profile.futureDirection) fragments.push(futureDirectionRehabFragments[profile.futureDirection]);
  if (profile.processStage) fragments.push(processStageRehabFragments[profile.processStage]);
  if (profile.attendance) fragments.push(attendanceRecommendationFragments[profile.attendance]);
  if (profile.trust) fragments.push(trustRecommendationFragments[profile.trust]);
  return composeParagraph(fragments);
}

export interface FunctionalSections {
  functionalText: string;
  symptomsText: string;
  familyText: string;
  progressText: string;
  recommendationsText: string;
}

export function composeFunctionalSections(profile: ParticipantProfile, name: string): FunctionalSections {
  const functionalText = fillName(composeFunctionalText(profile), name);
  const symptomsText = composeSymptomsText(profile, name);
  const familyText = fillName(composeFamilyText(profile), name);
  const progressText = fillName(composeProgressText(profile), name);
  const recommendationsText = fillName(composeRecommendationsText(profile), name);

  return { functionalText, symptomsText, familyText, progressText, recommendationsText };
}

export type PeriodicReportType =
  | "דו\"ח השמה"
  | "דו\"ח עזיבה"
  | "דו\"ח חצי שנתי"
  | "דו\"ח סיכום תקופה"
  | "בקשה להארכה";

export interface PeriodicSections {
  rehabDescription: string;
  summaryProcess: string;
  recommendations: string;
}

const personalityIntakeFragments: Record<string, string> = {
  adaptive: "{name} מגלה כבר בשלב זה יכולת הסתגלות טובה למסגרת ולדרישותיה",
  difficulty: "{name} צפוי להזדקק לתמיכה בהסתגלות למסגרת חדשה ולשגרתה",
  introverted: "{name} מגיע עם אופי מופנם וחששני, המחייב בניית קשר הדרגתית ומתונה",
  motivated: "{name} מגיע עם מוטיבציה ניכרת לשינוי ולעשייה, המהווה משאב חשוב לתהליך",
};

const regulationIntakeFragments: Record<string, string> = {
  stable: "יכולת הוויסות הבסיסית שלו תקינה, מה שמאפשר בניית תוכנית עבודה מובנית",
  dysregulated: "מתועד אצלו קושי בוויסות רגשי, שיילקח בחשבון בבניית קצב ההתקדמות",
  sensory: "רגישותו החושית הגבוהה תילקח בחשבון בהתאמת סביבות הפעילות עבורו",
  overwhelmed: "נטייתו להצפה דיסוציאטיבית מחייבת ליווי צמוד בשלב הראשוני",
};

const futureDirectionIntakeFragments: Record<string, string> = {
  supported_employment: "יעד ראשוני שהוגדר הוא בחינת מסלול לקראת תעסוקה נתמכת בעתיד",
  continued_therapeutic: "יעד ראשוני שהוגדר הוא שילוב מתמשך במסגרת הטיפולית-שיקומית של החווה",
  gradual_independence: "יעד ראשוני שהוגדר הוא קידום הדרגתי לעבר עצמאות תפקודית",
  too_early: "בשלב זה מוקדם לקבוע יעד סופי, וייקבע יעד מדויק יותר בהמשך הליווי",
};

const processStageIntakeFragments: Record<string, string> = {
  early: "{name} נקלט במסגרת ונמצא בראשית תהליך ההיכרות עם הצוות ועם מרחבי הפעילות בחווה",
  stabilizing: "{name} נקלט במסגרת לאחר תקופת הערכה ראשונית ומצוי כעת בבניית שגרה יציבה",
  transitioning: "{name} נקלט במסגרת לקראת המשך תהליך שכבר החל להניב סימני התקדמות",
};

const attendanceExitFragments: Record<string, string> = {
  regular: "לאורך התהליך שמר {name} על נוכחות סדירה ומחויבות גבוהה למסגרת",
  absences: "חרף חיסורים שליוו חלקים מהתהליך, {name} הפגין נכונות מתמדת לחזור ולהשתלב",
  unstable: "נוכחותו של {name} הייתה תנודתית, אך ניכרו לאורך הדרך ניסיונות גיוס עצמי חוזרים",
};

const socialExitFragments: Record<string, string> = {
  connected: "מבחינה חברתית חל אצלו שיפור והוא הצליח ליצור קשרים משמעותיים בקבוצת השווים",
  isolated: "מבחינה חברתית נותר קושי מסוים בהתבודדות, אף שנרשמה נוכחות פעילה במרחב המשותף",
  needs_mediation: "מבחינה חברתית נעשתה עבודה משמעותית בתיווך קשריו החברתיים",
  leader: "מבחינה חברתית הוא התפתח לדמות מובילה ותורמת בתוך הקבוצה",
};

const regulationExitFragments: Record<string, string> = {
  stable: "יכולת הוויסות שלו נשמרה יציבה לאורך התהליך",
  dysregulated: "נרשם שיפור הדרגתי ביכולתו לווסת מצבי כעס ועוררות יתר",
  sensory: "נעשו התאמות סביבתיות שסייעו בהפחתת העומס החושי שחווה",
  overwhelmed: "נרשמה ירידה בתדירות אירועי ההצפה הדיסוציאטיבית לאורך הזמן",
};

const futureDirectionExitFragments: Record<string, string> = {
  supported_employment: "בסיום התהליך, הצעד הבא המומלץ הוא בחינת השתלבות בתעסוקה נתמכת",
  continued_therapeutic: "בסיום התהליך בחווה, מומלץ להמשיך בליווי טיפולי-שיקומי במסגרת מתאימה אחרת",
  gradual_independence: "בסיום התהליך, {name} פונה לעבר עצמאות תפקודית הולכת וגוברת",
  too_early: "בסיום תקופת השהות, טרם ניתן לקבוע כיוון עתידי חד-משמעי",
};

const attendancePeriodFragments: Record<string, string> = {
  regular: "בתקופה הנסקרת שמר {name} על נוכחות סדירה ומחויבות גבוהה למסגרת",
  absences: "בתקופה הנסקרת ליוו את {name} חיסורים הנובעים ממצבו, אך ניכרת מעורבות משמעותית בעת נוכחותו",
  unstable: "בתקופה הנסקרת נוכחותו של {name} הייתה תנודתית, לצד ניסיונות גיוס עצמי חוזרים",
};

const personalityPeriodFragments: Record<string, string> = {
  adaptive: "מבחינה אישיותית, הוא ממשיך להפגין הסתגלות טובה לדרישות המסגרת",
  difficulty: "מבחינה אישיותית, ניכרת התקדמות הדרגתית בהתמודדותו עם שינויים ודרישות חדשות",
  introverted: "מבחינה אישיותית, ניכרת פתיחות הולכת וגדלה חרף אופיו המופנם",
  motivated: "מבחינה אישיותית, המוטיבציה הגבוהה שלו ממשיכה להניע התקדמות מורגשת",
};

const attendanceExtensionFragments: Record<string, string> = {
  regular: "הנוכחות הסדירה שהפגין {name} עד כה מעידה על מחויבות אמיתית להמשך התהליך",
  absences: "על אף חיסורים שליוו חלק מהתקופה, ניכרת אצל {name} השקעה ורצון להמשיך ולהתמיד",
  unstable: "התנודתיות בנוכחות מדגישה את הצורך בהמשך ליווי מובנה שיסייע לייצב את ההשתתפות",
};

const processStageExtensionFragments: Record<string, string> = {
  early: "{name} עדיין נמצא בשלבים הראשונים של התהליך ונדרש זמן נוסף להשלמת ההיכרות וההתערבות",
  stabilizing: "{name} נמצא בעיצומו של תהליך התייצבות שטרם הבשיל במלואו ומחייב המשך ליווי",
  transitioning: "{name} מתקרב לשלב מעבר, אך נדרשת תקופה נוספת לביסוס ההישגים שהושגו",
};

function farmAreaLabel(id: string): string {
  const map: Record<string, string> = {
    agriculture: "חקלאות",
    animals: "טיפול בבעלי חיים",
    ancient_crafts: "מלאכות קדומות",
    ceramics: "קרמיקה",
    yoga: "יוגה",
    grazing: "מרעה",
    art: "אומנות",
  };
  return map[id] ?? id;
}

function farmAreasSentence(profile: ParticipantProfile, verbPhrase: string): string {
  if (profile.farmAreas.length === 0) return "";
  const labels = profile.farmAreas.map(farmAreaLabel).join(", ");
  return `{name} ${verbPhrase} בתחומי הפעילות הבאים: ${labels}`;
}

function composeRehabDescription(profile: ParticipantProfile, reportType: PeriodicReportType): string {
  const fragments: string[] = [];
  switch (reportType) {
    case "דו\"ח השמה":
      if (profile.personality) fragments.push(personalityIntakeFragments[profile.personality]);
      if (profile.regulation) fragments.push(regulationIntakeFragments[profile.regulation]);
      if (profile.processStage) fragments.push(processStageIntakeFragments[profile.processStage]);
      if (profile.futureDirection) fragments.push(futureDirectionIntakeFragments[profile.futureDirection]);
      break;
    case "דו\"ח עזיבה":
      if (profile.attendance) fragments.push(attendanceExitFragments[profile.attendance]);
      fragments.push(farmAreasSentence(profile, "השתלב לאורך התהליך"));
      if (profile.social) fragments.push(socialExitFragments[profile.social]);
      if (profile.regulation) fragments.push(regulationExitFragments[profile.regulation]);
      break;
    case "דו\"ח חצי שנתי":
    case "דו\"ח סיכום תקופה":
      if (profile.attendance) fragments.push(attendancePeriodFragments[profile.attendance]);
      fragments.push(farmAreasSentence(profile, "השתתף בתקופה הנסקרת"));
      if (profile.social) fragments.push(socialProgressFragments[profile.social]);
      break;
    case "בקשה להארכה":
      if (profile.attendance) fragments.push(attendanceExtensionFragments[profile.attendance]);
      fragments.push(farmAreasSentence(profile, "השתלב עד כה"));
      if (profile.social) fragments.push(socialProgressFragments[profile.social]);
      break;
  }
  return composeParagraph(fragments);
}

function composeSummaryProcess(profile: ParticipantProfile, reportType: PeriodicReportType): string {
  const fragments: string[] = [];
  switch (reportType) {
    case "דו\"ח השמה":
      if (profile.personality) fragments.push(personalityIntakeFragments[profile.personality]);
      if (profile.trust) fragments.push(trustFunctionalFragments[profile.trust]);
      if (profile.family) fragments.push(familyFamilyFragments[profile.family]);
      break;
    case "דו\"ח עזיבה":
      if (profile.personality) fragments.push(personalityProgressFragments[profile.personality]);
      if (profile.social) fragments.push(socialExitFragments[profile.social]);
      if (profile.regulation) fragments.push(regulationExitFragments[profile.regulation]);
      break;
    case "דו\"ח חצי שנתי":
    case "דו\"ח סיכום תקופה":
      if (profile.personality) fragments.push(personalityPeriodFragments[profile.personality]);
      if (profile.regulation) fragments.push(regulationExitFragments[profile.regulation]);
      if (profile.social) fragments.push(socialProgressFragments[profile.social]);
      break;
    case "בקשה להארכה":
      fragments.push(farmAreasSentence(profile, "מגלה מעורבות פעילה"));
      if (profile.social) fragments.push(socialProgressFragments[profile.social]);
      if (profile.regulation) fragments.push(regulationExitFragments[profile.regulation]);
      break;
  }
  return composeParagraph(fragments);
}

function composeRecommendationsPeriodic(profile: ParticipantProfile, reportType: PeriodicReportType): string {
  const fragments: string[] = [];
  switch (reportType) {
    case "דו\"ח השמה":
      if (profile.futureDirection) fragments.push(futureDirectionIntakeFragments[profile.futureDirection]);
      if (profile.processStage) fragments.push(processStageIntakeFragments[profile.processStage]);
      break;
    case "דו\"ח עזיבה":
      if (profile.futureDirection) fragments.push(futureDirectionExitFragments[profile.futureDirection]);
      if (profile.trust) fragments.push(trustRecommendationFragments[profile.trust]);
      break;
    case "דו\"ח חצי שנתי":
    case "דו\"ח סיכום תקופה":
      if (profile.futureDirection) fragments.push(futureDirectionRehabFragments[profile.futureDirection]);
      if (profile.processStage) fragments.push(processStageRehabFragments[profile.processStage]);
      if (profile.attendance) fragments.push(attendanceRecommendationFragments[profile.attendance]);
      break;
    case "בקשה להארכה":
      if (profile.processStage) fragments.push(processStageExtensionFragments[profile.processStage]);
      if (profile.futureDirection) fragments.push(futureDirectionRehabFragments[profile.futureDirection]);
      if (profile.trust) fragments.push(trustRecommendationFragments[profile.trust]);
      break;
  }
  return composeParagraph(fragments);
}

export function composePeriodicSections(
  profile: ParticipantProfile,
  name: string,
  reportType: PeriodicReportType
): PeriodicSections {
  return {
    rehabDescription: fillName(composeRehabDescription(profile, reportType), name),
    summaryProcess: fillName(composeSummaryProcess(profile, reportType), name),
    recommendations: fillName(composeRecommendationsPeriodic(profile, reportType), name),
  };
}

export interface RehabPlanSections {
  areasOfImprovement: string[];
  specificGoal: string;
  waysToAchieve: string[];
  sourcesOfSupport: string[];
}

const difficultyImprovementPhrase: Record<string, string> = {
  flashbacks: "עיבוד והתמודדות עם פלאשבקים",
  nightmares: "שיפור איכות השינה",
  concentration: "חיזוק יכולת הריכוז והמיקוד",
  authority: "שיפור ההתמודדות מול דמויות סמכות",
  transit: "הרחבת יכולת הניידות והתחבורה",
  worthlessness: "חיזוק הדימוי העצמי",
};

const farmAreaImprovementPhrase: Record<string, string> = {
  agriculture: "פיתוח מיומנויות חקלאיות",
  animals: "חיזוק אחריות דרך טיפול בבעלי חיים",
  ancient_crafts: "פיתוח מיומנויות במלאכות קדומות",
  ceramics: "ביטוי יצירתי בעבודה בקרמיקה",
  yoga: "שיפור ויסות גופני ונשימתי דרך יוגה",
  grazing: "רגיעה והפחתת גירויים דרך שהות במרעה",
  art: "ביטוי רגשי דרך אומנות",
};

const futureDirectionGoalFragments: Record<string, string> = {
  supported_employment: "קידום {name} לקראת השתלבות בתעסוקה נתמכת בשוק העבודה",
  continued_therapeutic: "המשך ליווי טיפולי-שיקומי מותאם עבור {name} במסגרת החווה",
  gradual_independence: "קידום {name} לעבר עצמאות תפקודית הדרגתית",
  too_early: "בניית תשתית ראשונית להערכה עתידית מדויקת יותר עבור {name}",
};

const processStageWaysPhrase: Record<string, string> = {
  early: "בניית קשר ראשוני ואמון עם הצוות והמסגרת",
  stabilizing: "ביסוס שגרת השתתפות קבועה ויציבה",
  transitioning: "ליווי לקראת מעבר או סיום בליווי מותאם",
};

const regulationWaysPhrase: Record<string, string> = {
  stable: "שימור מיומנויות הוויסות הקיימות",
  dysregulated: "תרגול כלים לוויסות רגשי וניהול כעסים",
  sensory: "התאמת סביבת הפעילות לרגישות החושית",
  overwhelmed: "תרגול כלי קרקוע להתמודדות עם הצפה",
};

const socialWaysPhrase: Record<string, string> = {
  connected: "עידוד המשך מעורבות בקבוצת השווים",
  isolated: "עידוד הדרגתי להשתלבות חברתית",
  needs_mediation: "תיווך קשרים חברתיים בליווי הצוות",
  leader: "טיפוח כישורי המנהיגות החברתית",
};

const trustSupportPhrase: Record<string, string> = {
  trusting: "המשך בניית קשר אמון עם הצוות המטפל",
  suspicious: "עבודה הדרגתית על בניית אמון בסיסי עם הצוות",
  gradual: "ליווי מותאם קצב לבניית אמון עם הצוות",
  avoidant: "יצירת מרחב בטוח לשיתוף רגשי הדרגתי",
};

const familySupportPhrase: Record<string, string> = {
  supported: "מעטפת משפחתית תומכת",
  complex: "תיווך וגישור במערכת המשפחתית",
  isolated: "בניית מעטפת תמיכה חלופית מחוץ למשפחה",
};

const socialSupportPhrase: Record<string, string> = {
  connected: "קבוצת השווים בחווה",
  isolated: "עידוד יצירת קשרים תומכים בחווה",
  needs_mediation: "תיווך הצוות ביצירת קשרים חברתיים",
  leader: "מעמד חברתי חיובי בקבוצה",
};

export function composeRehabPlanSections(profile: ParticipantProfile, name: string): RehabPlanSections {
  const areasOfImprovementRaw: string[] = [];
  for (const area of profile.farmAreas) {
    const phrase = farmAreaImprovementPhrase[area];
    if (phrase) areasOfImprovementRaw.push(phrase);
  }
  for (const d of profile.difficulties) {
    const phrase = difficultyImprovementPhrase[d];
    if (phrase) areasOfImprovementRaw.push(phrase);
  }
  const areasOfImprovement = areasOfImprovementRaw.slice(0, 4);

  const specificGoal = fillName(
    profile.futureDirection ? futureDirectionGoalFragments[profile.futureDirection] : "גיבוש מטרה שיקומית מותאמת עבור {name}",
    name
  );

  const waysToAchieveRaw: string[] = [];
  if (profile.processStage) waysToAchieveRaw.push(processStageWaysPhrase[profile.processStage]);
  if (profile.regulation) waysToAchieveRaw.push(regulationWaysPhrase[profile.regulation]);
  if (profile.social) waysToAchieveRaw.push(socialWaysPhrase[profile.social]);
  const waysToAchieve = waysToAchieveRaw.filter(Boolean).slice(0, 4);

  const sourcesOfSupportRaw: string[] = [];
  if (profile.trust) sourcesOfSupportRaw.push(trustSupportPhrase[profile.trust]);
  if (profile.family) sourcesOfSupportRaw.push(familySupportPhrase[profile.family]);
  if (profile.social) sourcesOfSupportRaw.push(socialSupportPhrase[profile.social]);
  const sourcesOfSupport = sourcesOfSupportRaw.filter(Boolean).slice(0, 3);

  return { areasOfImprovement, specificGoal, waysToAchieve, sourcesOfSupport };
}
