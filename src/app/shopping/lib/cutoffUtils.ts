import { CutoffConfig, CutoffStatus } from "../types";

export function getCutoffStatus(config?: CutoffConfig): CutoffStatus {
  if (!config || !config.enabled) {
    return { isEnabled: false, isPassed: false, formattedTarget: "", timeLeftFormatted: "" };
  }

  const daysHebrew = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const targetDayName = daysHebrew[config.day] ?? "שלישי";
  const [targetHour, targetMinute] = (config.time || "12:00").split(":").map(Number);

  const now = new Date();
  const currentDay = now.getDay();

  // Find target cutoff Date for current week
  let targetDate = new Date(now);
  let dayDiff = config.day - currentDay;

  targetDate.setDate(now.getDate() + dayDiff);
  targetDate.setHours(targetHour || 12, targetMinute || 0, 0, 0);

  // If today is past the cutoff targetDate in the current week cycle
  if (now > targetDate) {
    return {
      isEnabled: true,
      isPassed: true,
      formattedTarget: `יום ${targetDayName} בשעה ${config.time || "12:00"}`,
      timeLeftFormatted: "המועד חלף",
    };
  }

  // Calculate time remaining
  const diffMs = targetDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hoursLeft = Math.floor(totalMinutes / 60);
  const minutesLeft = totalMinutes % 60;

  let timeLeftFormatted = "";
  if (hoursLeft >= 24) {
    const daysLeft = Math.floor(hoursLeft / 24);
    const remHours = hoursLeft % 24;
    timeLeftFormatted = `עוד ${daysLeft} ימים ו-${remHours} שעות`;
  } else if (hoursLeft > 0) {
    timeLeftFormatted = `עוד ${hoursLeft} שעות ו-${minutesLeft} דקות`;
  } else {
    timeLeftFormatted = `עוד ${minutesLeft} דקות`;
  }

  return {
    isEnabled: true,
    isPassed: false,
    formattedTarget: `יום ${targetDayName} בשעה ${config.time || "12:00"}`,
    timeLeftFormatted,
  };
}
