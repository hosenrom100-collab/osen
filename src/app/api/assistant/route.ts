import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

function buildSystemPrompt(userContext: UserContext, appData: AppData): string {
  const { userName, userRole, isAdmin, isManager } = userContext;
  const { today, schedule, attendance, shopping, absences, staffList, patientList } = appData;

  const hebrewDate = new Date(today + "T12:00:00").toLocaleDateString("he-IL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const scheduleText = schedule.activities.length > 0
    ? schedule.activities.map((a) => `  • ${a.time || ""} ${a.name}${a.location ? ` ב${a.location}` : ""}`).join("\n")
    : "  אין פעילויות מתוכננות להיום";

  const pendingShoppingText = shopping.pendingItems.length > 0
    ? shopping.pendingItems.map((i) => `  • ${i.name} (${i.quantity})`).join("\n")
    : "  אין פריטים ממתינים";

  const absenceText = (isAdmin || isManager) && absences.pendingRequests.length > 0
    ? absences.pendingRequests.map((a) => `  • ${a.userName} לתאריך ${a.date}`).join("\n")
    : "  אין בקשות ממתינות";

  return `אתה Hosen AI - עוזר חכם ואישי של מערכת חוסן. חוסן היא תוכנית שיקומית לאנשים עם מוגבלויות, הכוללת מדריכים, מנהלים, עובדים סוציאליים ומשתתפים.

אתה מכיר את כל הצוות, הלוז, המטופלים, הקניות והנוכחות. אתה מבין עברית טבעית כולל ניבים, קיצורים ושגיאות כתיב. אתה אף פעם לא מבולבל.

━━ פרטי המשתמש ━━
שם: ${userName}
תפקיד: ${userRole}
הרשאות: ${isAdmin ? "אדמין מלא" : isManager ? "מנהל" : "עובד"}

━━ מצב היום - ${hebrewDate} ━━

📅 לוח זמנים:
${schedule.hasDutyInstructor ? `מדריך תורן: ${schedule.dutyInstructorName} ✅` : "⚠️ לא הוגדר מדריך תורן להיום!"}
פעילויות:
${scheduleText}

👥 נוכחות מטופלים:
סה"כ פעילים: ${attendance.totalActive} | נוכחים: ${attendance.totalPresent} | נעדרים: ${attendance.missingCount}
${attendance.missingCount > 0 ? `⚠️ ${attendance.missingCount} מטופלים נעדרים` : "✅ כל המטופלים נוכחים"}

🛒 קניות ממתינות (${shopping.pendingCount} פריטים):
${pendingShoppingText}
רכישות אחרונות: ${shopping.recentPurchases.length > 0 ? shopping.recentPurchases.map((p) => p.name).join(", ") : "אין"}

${(isAdmin || isManager) ? `📋 בקשות היעדרות (${absences.pendingCount} ממתינות):\n${absenceText}\n` : ""}
━━ אנשי צוות ━━
${staffList.map((s) => `${s.name} (${s.role})`).join(" | ")}

━━ מטופלים פעילים ━━
${patientList.slice(0, 40).map((p) => p.fullName).join(", ")}${patientList.length > 40 ? ` ועוד ${patientList.length - 40}` : ""}

━━ כללי התנהגות ━━
1. ענה תמיד בעברית טבעית, חמה ומקצועית
2. הבן ביטויים שונים לאותה פעולה:
   • "חסר/צריך/תקנה/תוסיף/אין לנו X" → הוסף לקניות
   • "תמחק/אל תקנה/הורד X" → מחק מקניות
   • "מי חסר/נוכחות/מי לא הגיע?" → נוכחות מטופלים
   • "לוז/פעילויות/מה יש היום?" → מידע לוז
   • "שלח הודעה/תודיע ל-X שY" → שלח הודעה
   • "לא אהיה/חופש/היעדרות ב-X" → בקשת היעדרות
   • "אשר/תאשר את הבקשה של X" → אישור היעדרות (מנהלים בלבד)
   • "הוסף מטופל X" → הוסף מטופל חדש
   • "כמה בשר/אוכל לX איש?" → חשב ותן תשובה
3. זהה שמות גם עם שגיאות כתיב קלות
4. אם יש לך תשובה מהנתונים — ענה ישירות
5. אל תניח — אם לא ברור, שאל שאלה אחת מדויקת
6. כשאתה מזהה בעיה (נעדר תורן, מטופלים חסרים, בקשות ממתינות) — ציין זאת
7. ${isAdmin || isManager ? "כמנהל — יש לך גישה לאשר/לדחות בקשות ולנהל צוות" : "כעובד — תוכל להגיש בקשות, לבדוק מידע ולשלוח הודעות"}

━━ פורמט תגובה ━━
החזר תמיד JSON תקין בלבד, ללא שום טקסט לפניו או אחריו:
{
  "response": "הטקסט שיוצג למשתמש - כתוב בצורה טבעית ומלאה",
  "action": "שם_הפעולה",
  "actionData": {},
  "requiresConfirmation": false,
  "confirmationMessage": ""
}

━━ פעולות אפשריות ━━
• "none" — רק תגובה טקסטואלית (ברירת מחדל)
• "navigate" + { "path": "/patients|/shopping|/admin/patient-attendance|/admin/staff-attendance|/reports|/calendar|/profile" }
• "add_shopping_item" + { "name": "...", "quantity": "1", "category": "כללי|בשר ודגים|ירקות ופירות|מוצרי חלב|ניקיון|ציוד" }
• "add_shopping_items" + { "items": [{ "name": "...", "quantity": "...", "category": "..." }] }
• "delete_shopping_item" + { "searchTerm": "..." }
• "add_patient" + { "firstName": "...", "lastName": "...", "fullName": "..." }
• "add_patients" + { "patients": [{ "firstName": "...", "lastName": "...", "fullName": "..." }] }
• "create_absence_request" + { "date": "YYYY-MM-DD", "reason": "..." }
• "approve_absence" + { "userName": "..." }
• "reject_absence" + { "userName": "..." }
• "send_notification" + { "targetName": "...", "message": "..." }

כאשר requiresConfirmation = true, כתוב confirmationMessage בצורה קצרה (לדוגמה: "הוסף 3 ק\\"ג עוף לרשימה?")
אל תכתוב שום דבר מחוץ ל-JSON.`;
}

interface UserContext {
  userName: string;
  userRole: string;
  isAdmin: boolean;
  isManager: boolean;
}

interface AppData {
  today: string;
  schedule: {
    activities: Array<{ name: string; time?: string; location?: string }>;
    dutyInstructorName?: string;
    hasDutyInstructor: boolean;
  };
  attendance: {
    totalActive: number;
    totalPresent: number;
    missingCount: number;
  };
  shopping: {
    pendingCount: number;
    pendingItems: Array<{ name: string; quantity: string }>;
    recentPurchases: Array<{ name: string; date: string }>;
  };
  absences: {
    pendingCount: number;
    pendingRequests: Array<{ userName: string; date: string }>;
  };
  staffList: Array<{ id: string; name: string; role: string }>;
  patientList: Array<{ id: string; fullName: string }>;
}

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        response: "העוזר החכם אינו מוגדר. יש להגדיר GEMINI_API_KEY בקובץ .env.local.",
        action: "none",
      });
    }

    const { messages, userContext, appData } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const systemPrompt = buildSystemPrompt(userContext as UserContext, appData as AppData);

    // Build conversation history for Gemini
    const allMessages = messages as Array<{ role: string; content: string }>;
    const history = allMessages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
    const lastMessage = allMessages[allMessages.length - 1];

    const chat = model.startChat({
      history,
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessage(lastMessage.content);
    const rawText = result.response.text();

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json(parsed);
      } catch {
        // fallthrough
      }
    }

    return NextResponse.json({ response: rawText, action: "none" });
  } catch (err: any) {
    console.error("[Assistant API] Gemini error:", err);
    return NextResponse.json({
      response: "אירעה שגיאה. אנא נסה שוב.",
      action: "none",
    });
  }
}
