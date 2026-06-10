import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

function buildSystemPrompt(userContext: UserContext, appData: AppData): string {
  const { userName, userRole, isAdmin, isManager } = userContext;
  const { today, schedule, attendance, shopping, absences, staffList, patientList, groupList, programList } = appData;

  const hebrewDate = new Date(today + "T12:00:00").toLocaleDateString("he-IL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const scheduleText = schedule.activities.length > 0
    ? schedule.activities.map((a) => `  • [מזהה: ${a.id || "ללא"}] ${a.time || ""} ${a.name}${a.location ? ` ב${a.location}` : ""}`).join("\n")
    : "  אין פעילויות מתוכננות להיום";

  const pendingShoppingText = shopping.pendingItems.length > 0
    ? shopping.pendingItems.map((i) => `  • ${i.name} (${i.quantity})`).join("\n")
    : "  אין פריטים ממתינים";

  const absenceText = (isAdmin || isManager) && absences.pendingRequests.length > 0
    ? absences.pendingRequests.map((a) => `  • ${a.userName} לתאריך ${a.date}`).join("\n")
    : "  אין בקשות ממתינות";

  const missingNamesText = attendance.missingPatientsNames && attendance.missingPatientsNames.length > 0
    ? attendance.missingPatientsNames.join(", ")
    : "אין חסרים ממתינים";

  const patientText = patientList.map((p) => {
    const pGroups = p.groupIds && groupList
      ? p.groupIds.map((gid) => groupList.find((g) => g.id === gid)?.name).filter(Boolean).join(", ")
      : "";
    const pProg = p.hosenType && programList
      ? programList.find((pr) => pr.id === p.hosenType)?.name
      : "";
    
    let details = [];
    if (pGroups) details.push(`קבוצות: ${pGroups}`);
    if (pProg) details.push(`תוכנית: ${pProg}`);
    const detailsStr = details.length > 0 ? ` [${details.join(" | ")}]` : "";
    return `• ${p.fullName} (מזהה: ${p.id})${detailsStr}`;
  }).join("\n");

  return `אתה Hosen AI - עוזר חכם ואישי של מערכת חוסן.
אתה מכיר את כל הצוות, הלוז, המשתתפים, הקניות והנוכחות.

━━ פרטי המשתמש ━━
שם: ${userName} | תפקיד: ${userRole} | הרשאות: ${isAdmin ? "אדמין" : isManager ? "מנהל" : "עובד"}

━━ מצב היום - ${hebrewDate} ━━
📅 לו"ז: ${schedule.hasDutyInstructor ? `מדריך תורן: ${schedule.dutyInstructorName}` : "⚠️ אין תורן"}
${scheduleText}

👥 נוכחות: פעילים: ${attendance.totalActive} | נוכחים: ${attendance.totalPresent} | חסרים: ${attendance.missingCount}
לא מסומנים היום: ${missingNamesText}

🛒 קניות (${shopping.pendingCount}):
${pendingShoppingText}

━━ תוכניות וקבוצות במערכת ━━
${programList && programList.length > 0 ? programList.map((p) => `תוכנית: ${p.name} (מזהה: ${p.id})`).join("\n") : "אין תוכניות."}
${groupList && groupList.length > 0 ? groupList.map((g) => `קבוצה: ${g.name} (מזהה: ${g.id}, תחת תוכנית: ${g.programId || "כללי"})`).join("\n") : "אין קבוצות."}

━━ צוות (אנשי צוות ומדריכים) ━━
${staffList.map((s) => `• ${s.name} (תפקיד: ${s.role}, מזהה: ${s.id})`).join("\n")}

━━ משתתפים (מטופלים פעילים) ━━
${patientText}

━━ קטגוריות מוצרים ━━
${appData.validCategories?.join(", ")}

━━ זיכרון אישי וכללים (Memory) ━━
${appData.memory && appData.memory.length > 0 ? appData.memory.map((m: string) => `• ${m}`).join("\n") : "אין זיכרונות עדיין."}

━━ כללי התנהגות ויכולות ━━
ענה בעברית טבעית, מקצועית וקצרה.
אתה תומך בביצוע מגוון פעולות ישירות מתוך השיחה על ידי החזרת השדה "action" המתאים ופרמטרים ב-"actionData":

1. נוכחות משתתפים (mark_attendance / mark_attendance_batch):
   - עדכון בודד (mark_attendance): אם המשתמש אומר שמשתתף כלשהו הגיע/נוכח או לא הגיע/נעדר/חסר (למשל: "דני כהן הגיע היום"), זהה אותו ברשימה, קח את ה-patientId שלו והחזר:
     action: "mark_attendance", actionData: { "patientId": "מזהה המטופל", "status": "present|absent|unset", "patientName": "שם המטופל" }
   - עדכון קבוצתי/מרובה (mark_attendance_batch): אם המשתמש מבקש לעדכן נוכחות עבור קבוצה שלמה, תוכנית שלמה, או מספר אנשים (למשל: "סמן את כל קבוצת כפיר כנוכחים חוץ מאבי זלמן" או "דני, יוסי וירון הגיעו"), זהה את האנשים הרלוונטיים (קבוצה -> מצא את כל המשתתפים ששייכים לה), ולבנות מערך של עדכונים:
     action: "mark_attendance_batch", actionData: { "updates": [ { "patientId": "מזהה משתתף", "status": "present|absent|unset" }, ... ] }

2. ניהול מדריך תורן (set_duty_instructor):
   - אם המשתמש מבקש לשנות או לקבוע מדריך תורן (למשל: "שים את רותם כמדריך תורן היום"), זהה את איש הצוות ברשימת הצוות, קח את ה-id שלו והחזר:
     action: "set_duty_instructor", actionData: { "instructorId": "מזהה המדריך", "instructorName": "שם המדריך" }
   - שים לב: ניתן לקבוע רק אנשי צוות שקיימים ברשימת הצוות!

3. ניהול ועדכון פעילויות בלו"ז (add_schedule_activity / delete_schedule_activity / update_schedule_activity):
   - הוספה: אם המשתמש מבקש להוסיף פעילות/שיעור/סדנה ללו"ז (למשל: "תוסיף סדנת נשימות ב-11:00"), החזר:
     action: "add_schedule_activity", actionData: { "title": "שם הפעילות", "startTime": "HH:MM", "notes": "הערות אם יש" }
   - מחיקה: אם המשתמש מבקש למחוק או לבטל פעילות קיימת בלו"ז (למשל: "תבטל את סדנת נשימות"), זהה את הפעילות בלו"ז היום, קח את ה-id שלה והחזר:
     action: "delete_schedule_activity", actionData: { "activityId": "מזהה הפעילות" }
   - עדכון (update_schedule_activity): אם המשתמש מבקש לשנות או לעדכן פעילות קיימת (למשל: "תזיז את סדנת נשימות ל-12:00" או "תוסיף הערה לשיעור יוגה שזה באולם ב'"), זהה את מזהה הפעילות בלו"ז, והחזר:
     action: "update_schedule_activity", actionData: { "activityId": "מזהה הפעילות", "updates": { "title": "שם מעודכן (אם שונה)", "startTime": "HH:MM (אם שונה)", "notes": "הערות מעודכנות/חדשות" } }

4. ניהול רשימת קניות (add_shopping_item / delete_shopping_item / purchase_shopping_item):
   - הוספה (add_shopping_item): אם המשתמש מבקש להוסיף מוצר (למשל: "צריך לקנות חלב 3%"), זהה את שם המוצר והכמות. אם המוצר אינו קיים ב-productPool, סמן requiresConfirmation: true עם הודעת בקשת אישור קטגוריה.
   - מחיקה (delete_shopping_item): אם המשתמש מבקש למחוק מוצר מהקניות, חובה לסמן requiresConfirmation: true עם הודעת אישור.
   - סימון כנקנה (purchase_shopping_item): אם המשתמש מציין שהוא קנה מוצר כלשהו, או שהמוצר כבר נקנה (למשל: "קניתי את החלב 3%" או "תסמן שנקנה לחם"), זהה את שם המוצר והחזר:
     action: "purchase_shopping_item", actionData: { "searchTerm": "שם המוצר" }

5. למידת עובדות לזיכרון (learn_fact):
   - אם המשתמש מבקש ממך לזכור עובדה כלשהי (למשל: "תזכור שיוסי אלרגי לבוטנים"), החזר:
     action: "learn_fact", actionData: { "fact": "העובדה לזכור" }

החזר תמיד JSON תקין בלבד:
{
  "response": "התשובה המילולית שלך למשתמש",
  "action": "none|navigate|add_shopping_item|add_shopping_items|delete_shopping_item|add_patient|create_absence_request|send_notification|learn_fact|mark_attendance|mark_attendance_batch|set_duty_instructor|add_schedule_activity|delete_schedule_activity|update_schedule_activity|purchase_shopping_item",
  "actionData": {
    "name": "שם המוצר (אם מוסיפים לקניות)",
    "quantity": "כמות",
    "searchTerm": "מילת חיפוש (למחיקת או סימון קנייה של מוצר)",
    "fact": "העובדה לשמירה (עבור learn_fact)",
    "patientId": "מזהה משתתף",
    "status": "present|absent|unset",
    "patientName": "שם המטופל",
    "instructorId": "מזהה מדריך",
    "instructorName": "שם המדריך",
    "title": "שם פעילות ללוז",
    "startTime": "HH:MM",
    "notes": "הערות לפעילות לוז",
    "activityId": "מזהה פעילות למחיקה או לעדכון",
    "updates": [ { "patientId": "מזהה משתתף", "status": "present|absent|unset" } ] / { "title": "שם מעודכן", "startTime": "HH:MM", "notes": "הערות" }
  },
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
    activities: Array<{ id: string; name: string; time?: string; location?: string }>;
    dutyInstructorName?: string;
    hasDutyInstructor: boolean;
  };
  attendance: {
    totalActive: number;
    totalPresent: number;
    missingCount: number;
    missingPatientsNames?: string[];
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
  patientList: Array<{ id: string; fullName: string; groupIds?: string[]; hosenType?: string }>;
  groupList?: Array<{ id: string; name: string; programId?: string }>;
  programList?: Array<{ id: string; name: string }>;
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
      model: "gemini-2.5-flash",
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

    // Send message with exponential backoff retry logic for transient errors
    let result;
    let maxRetries = 3;
    let delay = 1000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await chat.sendMessage(lastMessage.content);
        break; // Success, break out of loop
      } catch (err: any) {
        const isTransient = err.status === 503 || err.status === 429 || 
                            err.message?.includes("503") || err.message?.includes("429") ||
                            err.message?.includes("Service Unavailable") || err.message?.includes("Too Many Requests") ||
                            err.message?.includes("high demand");
        
        if (isTransient && attempt < maxRetries) {
          console.warn(`[Assistant API] Attempt ${attempt} failed with transient error: ${err.message}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          throw err;
        }
      }
    }

    if (!result) {
      throw new Error("Failed to send message after retries");
    }

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
