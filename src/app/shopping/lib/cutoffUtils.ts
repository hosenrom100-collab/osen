import { CutoffConfig, CutoffStatus, ShoppingRequest } from "../types";
import { getCutoffBoundaries, hasItemBefore } from "./freeze";

export function getCutoffStatus(config?: CutoffConfig, activeRequests?: ShoppingRequest[]): CutoffStatus {
  if (!config || !config.enabled) {
    return { isEnabled: false, isPassed: false, formattedTarget: "", timeLeftFormatted: "" };
  }

  const daysHebrew = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const targetDayName = daysHebrew[config.day] ?? "שני";
  const deliveryDayFormatted =
    config.deliveryDay !== undefined && config.deliveryDay !== null && config.deliveryDay >= 0 && daysHebrew[config.deliveryDay]
      ? `יום ${daysHebrew[config.deliveryDay]}`
      : undefined;

  const now = new Date();

  // Same boundaries the Firestore freeze uses (Israel time), so the screen and the rules agree.
  // Frozen: the most recent cutoff has passed and the list still holds items from before it
  // (i.e. it was never closed), so a list left open over the weekend stays frozen until closed.
  const { last: lastCutoff, next: targetDate } = getCutoffBoundaries(config, now);
  if (hasItemBefore(activeRequests, lastCutoff)) {
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
