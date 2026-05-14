export async function sendPush(params: {
  userId?: string;
  role?: string | string[];
  groupId?: string;
  programId?: string;
  everyone?: boolean;
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // Non-blocking — notification failures should never break the main flow
  }
}
