const THURSDAY = 4;

/**
 * The delivery date (dd/MM) for a list, always a Thursday.
 * A list opened by closing the previous cycle is for the Thursday of the following
 * Sunday–Saturday week, whatever day it was closed. A list that was never closed is for the
 * next Thursday after its first item.
 */
export function getDeliveryDate(start: Date, openedByClose: boolean): string {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (openedByClose) {
    d.setDate(d.getDate() - d.getDay() + 7 + THURSDAY);
  } else {
    d.setDate(d.getDate() + (((THURSDAY - d.getDay() + 7) % 7) || 7));
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
