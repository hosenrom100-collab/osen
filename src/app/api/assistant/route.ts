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

  return `אתה Hosen AI - עוזר חכם ואישי של מערכת חוסן.
אתה מכיר את כל הצוות, הלוז, המטופלים, הקניות והנוכחות.

━━ פרטי המשתמש ━━
שם: ${userName} | תפקיד: ${userRole} | הרשאות: ${isAdmin ? "אדמין" : isManager ? "מנהל" : "עובד"}

━━ מצב היום - ${hebrewDate} ━━
📅 לו"ז: ${schedule.hasDutyInstructor ? `מדריך תורן: ${schedule.dutyInstructorName}` : "⚠️ אין תורן"}
${scheduleText}

👥 נוכחות: פעילים: ${attendance.totalActive} | נוכחים: ${attendance.totalPresent} | חסרים: ${attendance.missingCount}

🛒 קניות (${shopping.pendingCount}): ${pendingShoppingText}

━━ צוות ━━
${staffList.slice(0, 15).map((s) => s.name).join(", ")}

━━ מטופלים (חלקי) ━━
${patientList.slice(0, 20).map((p) => p.fullName).join(", ")}

━━ קטגוריות מוצרים ━━
${appData.validCategories?.join(", ")}

━━ זיכרון אישי וכללים (Memory) ━━
${appData.memory && appData.memory.length > 0 ? appData.memory.map((m: string) => `• ${m}`).join("\n") : "אין זיכרונות עדיין."}

━━ כללי התנהגות ━━
ענה בעברית טבעית וקצרה.
זהה כוונות: "צריך X" -> הוסף לקניות, "מי חסר?" -> נוכחות.
- אם המשתמש מבקש להוסיף מוצר שאינו קיים במאגר (productPool), החזר action: "add_shopping_item" וסמן requiresConfirmation: true עם הודעה לבקשת אישור.
- אם המשתמש מבקש למחוק פריט מהקניות, החזר action: "delete_shopping_item" וחובה לסמן requiresConfirmation: true עם שאלת וידוא לפני המחיקה (למשל: "האם אתה בטוח שברצונך למחוק את החלב מהרשימה?").
- אם המשתמש מבקש ממך לזכור משהו (לדוגמה: "תזכור שאני תמיד קונה חלב ביום שלישי" או "זכור שדני לא אוהב עגבניות"), החזר action: "learn_fact" וב-actionData ציין את העובדה בשדה "fact" כדי להוסיף אותה לזיכרון ארוך הטווח שלך.

החזר תמיד JSON תקין בלבד:
{
  "response": "...",
  "action": "none|navigate|add_shopping_item|add_shopping_items|delete_shopping_item|add_patient|create_absence_request|send_notification|learn_fact",
  "actionData": {},
  "requiresConfirmation": false,
  "confirmationMessage": ""
}`;
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
  validCategories: string[];
  productPool: string[];
  memory: string[];
}

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ response: "חסר GEMINI_API_KEY", action: "none" });
    }

    const { messages, userContext, appData } = await req.json();
    const systemPrompt = buildSystemPrompt(userContext as UserContext, appData as AppData);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
    });

    const allMessages = messages as Array<{ role: string; content: string }>;
    let history = allMessages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? "user" : "model" as const,
      parts: [{ text: m.content }],
    }));

    while (history.length > 0 && history[0].role === "model") {
      history.shift();
    }

    const lastMessage = allMessages[allMessages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const rawText = result.response.text();

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return NextResponse.json(JSON.parse(jsonMatch[0]));
      } catch { }
    }

    return NextResponse.json({ response: rawText, action: "none" });
  } catch (err: any) {
    console.error("[Assistant API] Gemini error:", err);
    return NextResponse.json({ response: "אירעה שגיאה. אנא נסה שוב.", action: "none" });
  }
}
