import { google } from "googleapis";
import { NextResponse } from "next/server";

/* ── Shared auth setup ── */
function buildAuth() {
  const calendarId  = process.env.GOOGLE_CALENDAR_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let   privateKey  = process.env.FIREBASE_PRIVATE_KEY ?? "";

  // Normalise: strip surrounding quotes, convert escaped \n → real newlines
  // 1. Convert escaped \n to real newlines and handle quotes
  privateKey = privateKey.trim();
  
  // If it's wrapped in quotes, it might be a JSON string or just a quoted string
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try {
      // Try parsing as JSON first (handles escaped characters perfectly)
      const parsed = JSON.parse(privateKey);
      if (typeof parsed === 'string') privateKey = parsed;
    } catch {
      // Fallback: manual slice and replace
      privateKey = privateKey.slice(1, -1).replace(/\\n/g, "\n");
    }
  } else {
    // If not quoted, just replace \n
    privateKey = privateKey.replace(/\\n/g, "\n");
  }
  
  privateKey = privateKey.trim();

  // Verification log (to help us debug if it still fails)
  console.log(`[Calendar Auth] Key length: ${privateKey.length}, Starts with PEM: ${privateKey.startsWith('-----BEGIN')}`);

  const missing = [
    !calendarId  && "GOOGLE_CALENDAR_ID",
    !clientEmail && "FIREBASE_CLIENT_EMAIL",
    !privateKey  && "FIREBASE_PRIVATE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key:   privateKey,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    return { auth, calendarId: calendarId! };
  } catch (err: any) {
    console.error("[Calendar Auth Error] JWT creation failed:", err.message);
    throw err;
  }
}

function mapItem(item: any) {
  return {
    id:          item.id,
    summary:     item.summary     || "(ללא כותרת)",
    description: item.description || "",
    location:    item.location    || "",
    start:       item.start,   // { dateTime?, date? }
    end:         item.end,
    htmlLink:    item.htmlLink || "",
    status:      item.status   || "confirmed",
  };
}

function calendarError(err: any) {
  const code = err.code || err.status;
  const msg  = (err.message || "שגיאה לא ידועה") as string;

  if (err.type === "MISSING_CONFIG") {
    return NextResponse.json({
      error: "הגדרות חסרות",
      hint:  `הוסף ל-.env.local: ${err.message}`,
      type:  "MISSING_CONFIG",
    }, { status: 400 });
  }
  if (code === 404 || msg.toLowerCase().includes("not found")) {
    return NextResponse.json({
      error: "לוח שנה לא נמצא",
      hint:  `ה-Calendar ID '${process.env.GOOGLE_CALENDAR_ID}' לא קיים או אינו נגיש. בדוק שהלוח שותף עם חשבון השירות.`,
      type:  "NOT_FOUND",
    }, { status: 404 });
  }
  if (code === 403 || msg.includes("insufficient") || msg.includes("forbidden")) {
    return NextResponse.json({
      error: "אין הרשאת גישה",
      hint:  `שתף את לוח השנה עם ${process.env.FIREBASE_CLIENT_EMAIL} (לפחות "ראה פרטי אירועים"). לכתיבה: "בצע שינויים לאירועים".`,
      type:  "FORBIDDEN",
    }, { status: 403 });
  }
  if (code === 401 || msg.includes("invalid_grant") || msg.includes("unauthorized")) {
    return NextResponse.json({
      error: "שגיאת אימות",
      hint:  "מפתח הפרטי של חשבון השירות שגוי או פג תוקף. הורד מפתח חדש מ-Firebase Console.",
      type:  "AUTH_ERROR",
    }, { status: 401 });
  }
  return NextResponse.json({ error: msg, type: "SERVER_ERROR" }, { status: 500 });
}

/* ─────────────────────────────────────────────
   GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
   Returns events in the given date range.
   Defaults: today → +3 months
───────────────────────────────────────────── */
export async function GET(req: Request) {
  try {
    const { auth, calendarId } = buildAuth();
    const url = new URL(req.url);

    const fromStr = url.searchParams.get("from");
    const toStr   = url.searchParams.get("to");

    const now        = new Date();
    const timeMin    = fromStr ? new Date(`${fromStr}T00:00:00`) : now;
    const defaultMax = new Date(now); defaultMax.setMonth(defaultMax.getMonth() + 3);
    const timeMax    = toStr   ? new Date(`${toStr}T23:59:59`)  : defaultMax;

    const cal = google.calendar({ version: "v3", auth });
    const res = await cal.events.list({
      calendarId,
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: true,
      orderBy:      "startTime",
      maxResults:   500,
    });

    return NextResponse.json((res.data.items ?? []).map(mapItem));
  } catch (err: any) {
    console.error("[Calendar GET]", err.message);
    return calendarError(err);
  }
}

/* ─────────────────────────────────────────────
   POST /api/calendar
   Body: { title, startDate, startTime?, endDate?, endTime?, allDay?, description?, location? }
   Creates an event in Google Calendar. Requires "Make changes" sharing permission.
───────────────────────────────────────────── */
export async function POST(req: Request) {
  try {
    const { auth, calendarId } = buildAuth();
    const body = await req.json();
    const { title, startDate, startTime, endDate, endTime, allDay, description, location } = body;

    if (!title?.trim() || !startDate) {
      return NextResponse.json({ error: "כותרת ותאריך נדרשים" }, { status: 400 });
    }

    const TZ = "Asia/Jerusalem";
    const eventBody: any = {
      summary:     title.trim(),
      description: description?.trim() || "",
      location:    location?.trim()    || "",
    };

    if (allDay) {
      eventBody.start = { date: startDate };
      eventBody.end   = { date: endDate || startDate };
    } else {
      const st = startTime || "09:00";
      const et = endTime   || "10:00";
      eventBody.start = { dateTime: `${startDate}T${st}:00`, timeZone: TZ };
      eventBody.end   = { dateTime: `${endDate || startDate}T${et}:00`, timeZone: TZ };
    }

    const cal = google.calendar({ version: "v3", auth });
    const created = await cal.events.insert({ calendarId, requestBody: eventBody });

    return NextResponse.json(mapItem(created.data), { status: 201 });
  } catch (err: any) {
    console.error("[Calendar POST]", err.message);
    if (err.code === 403) {
      return NextResponse.json({
        error: "אין הרשאת כתיבה",
        hint:  `הענק הרשאת "בצע שינויים לאירועים" לחשבון: ${process.env.FIREBASE_CLIENT_EMAIL}`,
        type:  "WRITE_FORBIDDEN",
      }, { status: 403 });
    }
    return calendarError(err);
  }
}

/* ─────────────────────────────────────────────
   DELETE /api/calendar?eventId=xxx
   Deletes a single event.
───────────────────────────────────────────── */
export async function DELETE(req: Request) {
  try {
    const { auth, calendarId } = buildAuth();
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ error: "eventId נדרש" }, { status: 400 });

    const cal = google.calendar({ version: "v3", auth });
    await cal.events.delete({ calendarId, eventId });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Calendar DELETE]", err.message);
    return calendarError(err);
  }
}

/* ─────────────────────────────────────────────
   PATCH /api/calendar?eventId=xxx
   Body: { title, startDate, startTime?, endDate?, endTime?, allDay?, description?, location? }
   Updates an existing event.
───────────────────────────────────────────── */
export async function PATCH(req: Request) {
  try {
    const { auth, calendarId } = buildAuth();
    const eventId = new URL(req.url).searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ error: "eventId נדרש" }, { status: 400 });

    const body = await req.json();
    const { title, startDate, startTime, endDate, endTime, allDay, description, location } = body;

    const TZ = "Asia/Jerusalem";
    const eventBody: any = {};
    if (title)       eventBody.summary     = title.trim();
    if (description) eventBody.description = description.trim();
    if (location)    eventBody.location    = location.trim();

    if (startDate) {
      if (allDay) {
        eventBody.start = { date: startDate };
        eventBody.end   = { date: endDate || startDate };
      } else {
        const st = startTime || "09:00";
        const et = endTime   || "10:00";
        eventBody.start = { dateTime: `${startDate}T${st}:00`, timeZone: TZ };
        eventBody.end   = { dateTime: `${endDate || startDate}T${et}:00`, timeZone: TZ };
      }
    }

    const cal = google.calendar({ version: "v3", auth });
    const updated = await cal.events.patch({ calendarId, eventId, requestBody: eventBody });

    return NextResponse.json(mapItem(updated.data));
  } catch (err: any) {
    console.error("[Calendar PATCH]", err.message);
    return calendarError(err);
  }
}

