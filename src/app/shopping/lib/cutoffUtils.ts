import { CutoffConfig, CutoffStatus, ShoppingRequest } from "../types";
import { toDateOrNull } from "./dateUtils";

export function getCutoffStatus(config?: CutoffConfig, activeRequests?: ShoppingRequest[]): CutoffStatus {
  if (!config || !config.enabled) {
    return { isEnabled: false, isPassed: false, formattedTarget: "", timeLeftFormatted: "" };
  }

  const daysHebrew = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const targetDayName = daysHebrew[config.day] ?? "שני";
  const [targetHour, targetMinute] = (config.time || "16:00").split(":").map(Number);
  const deliveryDayFormatted =
    config.deliveryDay !== undefined && config.deliveryDay !== null && config.deliveryDay >= 0 && daysHebrew[config.deliveryDay]
      ? `יום ${daysHebrew[config.deliveryDay]}`
      : undefined;

  const now = new Date();

  // The cutoff falls on config.day of the current calendar week. Depending on today it is either
  // still ahead (the one that passed is last week's) or already behind (the next is next week's).
  const thisWeekCutoff = new Date(now);
  thisWeekCutoff.setDate(now.getDate() + (config.day - now.getDay()));
  thisWeekCutoff.setHours(targetHour ?? 16, targetMinute ?? 0, 0, 0);

  const lastCutoff = new Date(thisWeekCutoff);
  let targetDate = new Date(thisWeekCutoff);
  if (thisWeekCutoff > now) lastCutoff.setDate(lastCutoff.getDate() - 7);
  else targetDate.setDate(targetDate.getDate() + 7);

  // Frozen: the most recent cutoff has passed and the list still holds items from before it
  // (i.e. it was never closed). Looking at the previous cutoff, not just this week's, keeps a
  // list that was left open over the weekend frozen until someone closes it.
  const hasActiveBeforeCutoff = activeRequests?.some((r) => {
    const createdAt = toDateOrNull(r.createdAt);
    return createdAt !== null && createdAt < lastCutoff;
  });
  if (hasActiveBeforeCutoff) {
    return {
      isEnabled: true,
      isPassed: true,
      cutoffAt: lastCutoff,
      formattedTarget: `יום ${targetDayName} בשעה ${config.time || "16:00"}`,
      timeLeftFormatted: "המועד חלף",
      deliveryDayFormatted,
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
    formattedTarget: `יום ${targetDayName} בשעה ${config.time || "16:00"}`,
    timeLeftFormatted,
    msLeft: diffMs,
    deliveryDayFormatted,
  };
}
