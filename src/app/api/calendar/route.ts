import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!calendarId || !clientEmail || !privateKey) {
    return NextResponse.json({ error: "Missing calendar configuration" }, { status: 400 });
  }

  try {
    // Clean the private key
    const formattedKey = privateKey
      .replace(/\\n/g, "\n")
      .replace(/"/g, "")
      .trim();

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: formattedKey,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // Fetch events for the next 3 months
    const now = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(now.getMonth() + 3);

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: now.toISOString(),
      timeMax: threeMonthsLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items?.map((item) => ({
      id: item.id,
      summary: item.summary,
      description: item.description,
      location: item.location,
      start: item.start,
      end: item.end,
      color: "bg-blue-500", // Default color
    }));

    return NextResponse.json(events || []);
  } catch (error: any) {
    console.error("Error fetching Google Calendar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
