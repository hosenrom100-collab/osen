import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "מפתח GEMINI_API_KEY חסר בהגדרות השרת" },
        { status: 500 }
      );
    }

    const { rawText } = await req.json();
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return NextResponse.json(
        { error: "תוכן גולמי ריק או לא תקין" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `אתה פסיכולוג קליני ועובד סוציאלי בכיר (MSW) המומחה בשיקום פוסט-טראומה ובניית תוכניות חוסן עבור נפגעי פעולות איבה ומלחמה (חרבות ברזל).
תפקידך לקבל תוכן גולמי (כגון סיכומי פגישות, הערות טיפוליות, רשמים או ציטוטים של מטופל בחווה שיקומית) ולזקק אותו לתוכנית שיקום אישית ומקצועית ביותר.

הקפד על הכללים הבאים באופן מוחלט:
1. שפה: עברית רהוטה, עשירה, רגישה ומקצועית בלבד. אל תשתמש במילים באנגלית כלל.
2. שמירה על פרטיות: אל תכלול שמות פרטיים, שמות משפחה, תעודות זהות או פרטים מזהים אחרים. השתמש בגוף ראשון או שלישי כללי ("המטופל", "המשתתף", "אני" בהקשר של המטרות).
3. פלט: החזר פלט בפורמט JSON בלבד, התואם בדיוק למבנה הבא:

{
  "areasOfImprovement": [
    "תחום 1 כולל כותרת קצרה והסבר מקצועי משקם המותאם לחווה (למשל: 'חוסן ומצב נפשי: שיפור המצב הרגשי...')",
    "תחום 2 כולל כותרת קצרה והסבר (למשל: 'התמדה ורצף טיפולי: חיזוק...')",
    "תחום 3 (אם יש) כולל כותרת קצרה והסבר (למשל: 'מיומנויות חברתיות ובין-אישיות: שיפור...')"
  ],
  "specificGoal": "ניסוח יעד רגשי/נפשי, יעד תפקודי (התמדה בחווה) ויעד חברתי בצורה רשמית ומקצועית מאוד התומכת בתהליך השיקום של המטופל.",
  "waysToAchieve": [
    "דרך 1 מותאמת אישית לחווה (למשל: 'סדנאות נגרות וקרמיקה: תיעול אנרגיה וחרדה...')",
    "דרך 2 (למשל: 'מרחב הטבע והחווה: שהייה בסביבה פתוחה ומאזנת...')",
    "דרך 3 (למשל: 'בניית שגרת הגעה מותאמת: קביעת עוגנים קבועים...')"
  ],
  "sourcesOfSupport": [
    "מקור סיוע 1 (למשל: 'צוות החווה המקצועי: מנחי הסדנאות והעו\"ס בחווה הנותנים ליווי...')",
    "מקור סיוע 2 (למשל: 'חברים בחווה: קבוצת השווים המתמודדת עם חוויות דומות ומעניקה תמיכה...')",
    "מקור סיוע 3 (למשל: 'מרחב החווה והטבע: כלים, חומרים ושקט סביבתי...')",
    "מקור סיוע 4 (למשל: 'גורמי טיפול חיצוניים: שילוב משרד הביטחון/עו\"ס מלווה וטיפול אישי...')"
  ]
}

התוכן הגולמי לעיבוד:
\"\"\"
${rawText}
\"\"\"`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse the JSON output and validate it
    const parsedData = JSON.parse(responseText);
    
    return NextResponse.json(parsedData);
  } catch (err: any) {
    console.error("[Generate Rehab API] Error:", err);
    return NextResponse.json(
      { error: "שגיאה בעיבוד התוכנית באמצעות הבינה המלאכותית: " + err.message },
      { status: 500 }
    );
  }
}
