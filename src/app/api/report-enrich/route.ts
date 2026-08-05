import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParticipantProfile } from "@/lib/participantProfile";

type ReportKind = "periodic" | "functional";

interface ReportEnrichRequest {
  profile: ParticipantProfile;
  reportKind: ReportKind;
  periodicReportType?: string;
  additionalNotes?: string;
}

interface PeriodicEnrichResult {
  rehabDescription: string;
  summaryProcess: string;
  recommendations: string;
  nextPeriodGoal: string;
}

interface FunctionalEnrichResult {
  functionalText: string;
  symptomsText: string;
  familyText: string;
  progressText: string;
  recommendationsText: string;
}

const UNCLEAR_LABEL = "מצב מעורב/לא אחיד שאינו נצפה באחת האפשרויות הקבועות - יש להתייחס להערות הצוות בהמשך";

const PROFILE_LABELS: Record<string, Record<string, string>> = {
  emotional: {
    anxious: "חרדה ומתח", depressed: "מצב רוח ירוד / נסיגה",
    unstable: "תנודתיות רגשית בין ימים", irritable: "עצבנות / כעס מוגבר",
    flat: "שטיחות רגשית / ניתוק", stable: "יציבות רגשית יחסית",
    optimistic: "אופטימיות ותקווה", fluctuating_daily: "משתנה מיום ליום, תלוי אירועים",
    unclear: UNCLEAR_LABEL,
  },
  family: {
    supported: "עטוף ותומך מאוד", complex: "תמיכה משפחתית מתוחה או מורכבת",
    isolated: "בדידות / חוסר תמיכה משפחתית", unclear: UNCLEAR_LABEL,
  },
  personality: {
    adaptive: "מסתגל ומשתף פעולה בקלות", difficulty: "מתקשה להסתגל לשינויים",
    introverted: "מופנם, ביישן וחששן", motivated: "מוטיבציה גבוהה לעשייה",
    unclear: UNCLEAR_LABEL,
  },
  regulation: {
    stable: "ויסות רגשי תקין ומאוזן", dysregulated: "קושי בויסות (כעס/עוררות)",
    sensory: "רגישות חושית גבוהה (רעש/ריח)", overwhelmed: "נטייה להצפה דיסוציאטיבית",
    unclear: UNCLEAR_LABEL,
  },
  social: {
    connected: "משתלב חברתית ויוצר קשר בקלות", isolated: "נוטה להתבודד ומעדיף לעבוד לבד",
    needs_mediation: "מעוניין בקשר אך זקוק לתיווך", leader: "מנהיג חיובי ויוזם שיתופי פעולה",
    unclear: UNCLEAR_LABEL,
  },
  trust: {
    trusting: "נותן אמון ומסתייע בקלות", suspicious: "חשדן ומתקשה לתת אמון",
    gradual: "רוכש אמון בהדרגה ואיטיות", avoidant: "נמנע מקשר קרוב או שיתוף רגשי",
    unclear: UNCLEAR_LABEL,
  },
  attendance: {
    regular: "נוכחות רציפה ומחויבות גבוהה", absences: "חיסורים מרובים עקב מצב נפשי/פיזי",
    unstable: "נוכחות תנודתית עם נסיונות גיוס עצמי", unclear: UNCLEAR_LABEL,
  },
  futureDirection: {
    supported_employment: "תעסוקה נתמכת בעתיד", continued_therapeutic: "המשך טיפולי-שיקומי בחווה",
    gradual_independence: "עצמאות והתנתקות הדרגתית", too_early: "מוקדם מדי לקבוע כיוון",
    unclear: UNCLEAR_LABEL,
  },
  processStage: {
    early: "תחילת דרך והיכרות", stabilizing: "באמצע תהליך והתייצבות",
    transitioning: "לקראת מעבר או סיום", unclear: UNCLEAR_LABEL,
  },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  flashbacks: "פלאשבקים", nightmares: "בעיות שינה/סיוטים", concentration: "קשיי קשב/מיקוד",
  authority: "קושי עם סמכות", transit: "נמנע מתחבורה", worthlessness: "דימוי עצמי נמוך",
};

const FARM_AREA_LABELS: Record<string, string> = {
  agriculture: "חקלאות, חממות ומשתלה", animals: "טיפול בבעלי חיים ואורווה",
  ancient_crafts: "מלאכות קדומות", ceramics: "קרמיקה", yoga: "יוגה",
  grazing: "מרעה", art: "אומנות",
};

function describeProfile(profile: ParticipantProfile): string {
  const lines: string[] = [];
  if (profile.emotional?.length) {
    const labels = profile.emotional.map((v) => PROFILE_LABELS.emotional?.[v] || v);
    lines.push(
      profile.emotional.length > 1
        ? `- מצב רגשי (מספר מאפיינים חלים בו-זמנית, יש לשלב אותם לתמונה אחת קוהרנטית ולא לפרט כל אחד בנפרד): ${labels.join(", ")}`
        : `- מצב רגשי: ${labels[0]}`
    );
  }
  for (const key of ["family", "personality", "regulation", "social", "trust", "attendance", "futureDirection", "processStage"] as const) {
    const value = profile[key];
    if (value) lines.push(`- ${key}: ${PROFILE_LABELS[key]?.[value] || value}`);
  }
  if (profile.farmAreas?.length) {
    lines.push(`- תחומי פעילות בחווה: ${profile.farmAreas.map(a => FARM_AREA_LABELS[a] || a).join(", ")}`);
  }
  if (profile.difficulties?.length) {
    lines.push(`- קשיים ותסמינים בולטים: ${profile.difficulties.map(d => DIFFICULTY_LABELS[d] || d).join(", ")}`);
  }
  return lines.join("\n");
}

const COHERENCE_DIRECTIVE = `
עקרונות ליבה לאיכות הכתיבה - קרא בעיון והקפד עליהם:
1. סינתזה, לא רשימה: כשקיבלת כמה מאפיינים באותה קטגוריה (למשל כמה מאפיינים רגשיים בו-זמנית), אל תפרט אותם זה אחרי זה כרשימת עובדות נפרדות. גבש אותם לתיאור קליני אחד, מדויק ורהוט, שמסביר כיצד המאפיינים מתקיימים יחד (למשל: חרדה שמתקיימת לצד אופטימיות ביחס לתהליך, או תנודתיות שמתבטאת בין ימים טובים לקשים).
2. אל תייצר סתירות גלויות: אם נראה שמאפיינים שונים "מתנגשים" (למשל יציבות יחסית לצד קושי בוויסות), אל תציג זאת כסתירה אלא כתמונה מורכבת ומדויקת - הסבר את היחס ביניהם (מתי כל מאפיין בא לידי ביטוי, מה משפיע על המעבר ביניהם) במקום לכתוב שני משפטים שסותרים זה את זה ללא קשר.
3. כשמופיע מאפיין "מצב מעורב/לא אחיד" (unclear) בקטגוריה כלשהי - אל תמציא לו תוכן קליני משלך. הישען במפורש על "הערות נוספות מהצוות המטפל" אם סופקו, ותאר את המורכבות בכנות (למשל "מצבו... מורכב ואינו ניתן לאפיון חד-משמעי"), במקום לכתוב תיאור גנרי וריק מתוכן.
4. גיוון לשוני: הימנע מנוסחאות קבועות וממשפטי פתיחה חוזרים בין הקטעים השונים ("מבחינה רגשית...", "בתחום המשפחתי..."). כתוב כטקסט קליני זורם וטבעי, לא כמילוי תבנית.
5. דיוק לפני יופי: אם המידע שסופק דל, חסר או סותר, עדיף ניסוח זהיר וכן ("התמונה חלקית", "נדרשת הערכה נוספת") על פני ניסוח בטוח ומרשים שאינו מבוסס.`;

const PERIODIC_SYSTEM_PROMPT = `אתה כותב דוחות שיקום מקצועיים עבור חוות טיפולית-שיקומית (חוות רום), המיועדים למשרד הביטחון - אגף שיקום נכים.
אתה מקבל אך ורק מאפיינים אנונימיים של המשתתף (ללא שם, ת.ז. או כל פרט מזהה) ומתבקש לנסח בעברית תקנית, מקצועית, אמפתית וטיפולית ארבעה קטעי טקסט לדוח תקופתי.
אל תמציא פרטים שלא נמסרו לך (כגון שם, גיל, אבחנות רפואיות ספציפיות). התבסס רק על המאפיינים שסופקו.
אם סופקו "הערות נוספות מהצוות המטפל" - שלב אותן בתוך הטקסט בצורה טבעית ואינטגרטיבית (לא כפסקה נפרדת ולא כציטוט), כך שהן משפיעות על הניסוח וההדגשים בכל הקטעים הרלוונטיים, בהתאם למאפיינים שנבחרו בשאלון. במקרה שההערות סותרות לכאורה מאפיין שנבחר בשאלון, ההערות הן המידע העדכני והמדויק יותר - תן להן עדיפות.
${COHERENCE_DIRECTIVE}
החזר אך ורק אובייקט JSON תקין (ללא טקסט נוסף, ללא markdown) במבנה הבא:
{
  "rehabDescription": "תיאור תוכנית השיקום והשתלבות המשתתף בחווה - פסקה אחת",
  "summaryProcess": "סיכום תהליך הליווי וההשתלבות בתקופה הנסקרת - פסקה אחת",
  "recommendations": "המלצות מקצועיות להמשך - פסקה אחת",
  "nextPeriodGoal": "יעד מרכזי ומוגדר לתקופה הבאה - משפט או שניים"
}`;

const FUNCTIONAL_SYSTEM_PROMPT = `אתה כותב דוחות תפקודיים מקצועיים עבור חוות טיפולית-שיקומית (חוות רום), המיועדים למשרד הביטחון - אגף השיקום.
אתה מקבל אך ורק מאפיינים אנונימיים של המשתתף (ללא שם, ת.ז. או כל פרט מזהה) ומתבקש לנסח בעברית תקנית, מקצועית, אמפתית וטיפולית חמישה קטעי טקסט לדוח תפקודי.
אל תמציא פרטים שלא נמסרו לך. התבסס רק על המאפיינים שסופקו.
אם סופקו "הערות נוספות מהצוות המטפל" - שלב אותן בתוך הטקסט בצורה טבעית ואינטגרטיבית (לא כפסקה נפרדת ולא כציטוט), כך שהן משפיעות על הניסוח וההדגשים בכל הקטעים הרלוונטיים, בהתאם למאפיינים שנבחרו בשאלון. במקרה שההערות סותרות לכאורה מאפיין שנבחר בשאלון, ההערות הן המידע העדכני והמדויק יותר - תן להן עדיפות.
${COHERENCE_DIRECTIVE}
החזר אך ורק אובייקט JSON תקין (ללא טקסט נוסף, ללא markdown) במבנה הבא:
{
  "functionalText": "תיאור המצב התפקודי הכללי - פסקה אחת",
  "symptomsText": "תיאור סימפטומים ומאפיינים בולטים - פסקה אחת",
  "familyText": "תיאור המצב המשפחתי והתמיכתי - פסקה אחת",
  "progressText": "תיאור ההתקדמות בחווה בתקופה הנסקרת - פסקה אחת",
  "recommendationsText": "המלצות מקצועיות להמשך - פסקה אחת"
}`;

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "AI enrichment unavailable" }, { status: 503 });
    }

    const { profile, reportKind, periodicReportType, additionalNotes } = (await req.json()) as ReportEnrichRequest;
    if (!profile || (reportKind !== "periodic" && reportKind !== "functional")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const systemPrompt = reportKind === "periodic" ? PERIODIC_SYSTEM_PROMPT : FUNCTIONAL_SYSTEM_PROMPT;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    });

    const trimmedNotes = (additionalNotes || "").trim().slice(0, 1000);

    const userPrompt = [
      reportKind === "periodic" && periodicReportType ? `סוג הדוח: ${periodicReportType}` : null,
      "מאפייני המשתתף:",
      describeProfile(profile),
      trimmedNotes ? `\nהערות נוספות מהצוות המטפל (שלב בצורה אינטגרטיבית בטקסט, לא כפסקה נפרדת):\n${trimmedNotes}` : null,
    ].filter(Boolean).join("\n");

    let result;
    let maxRetries = 3;
    let delay = 1000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent(userPrompt);
        break;
      } catch (err: any) {
        const isTransient = err.status === 503 || err.status === 429 ||
          err.message?.includes("503") || err.message?.includes("429") ||
          err.message?.includes("Service Unavailable") || err.message?.includes("Too Many Requests") ||
          err.message?.includes("high demand");

        if (isTransient && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        } else {
          throw err;
        }
      }
    }

    if (!result) {
      throw new Error("Failed to generate content after retries");
    }

    const rawText = result.response.text();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI response parse failure" }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as PeriodicEnrichResult | FunctionalEnrichResult;
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("[Report Enrich API] Gemini error:", err);
    return NextResponse.json({ error: "AI enrichment failed" }, { status: 500 });
  }
}
