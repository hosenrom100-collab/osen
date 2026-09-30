import { redirect } from "next/navigation";

// The old day-by-day schedule editor was replaced by the workshop-based weekly schedule.
export default function LegacySchedulePage() {
  redirect("/schedule");
}
