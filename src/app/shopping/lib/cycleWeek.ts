import { CutoffConfig } from "../types";

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * The Sunday–Saturday week a list refers to, e.g. "לשבוע 05/10 – 11/10".
 *
 * `cycleStart` is when this list was opened: the close time of the previous cycle, or the
 * first item added if it was never closed. With a delivery day configured the list belongs
 * to the week of the first delivery on/after that start (so closing after this week's
 * delivery moves the list to next week). Without one, a list opened on Fri/Sat is for the
 * following week.
 */
export function getCycleWeekLabel(cycleStart: Date, config?: CutoffConfig): string {
  const anchor = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
  const delivery = config?.enabled ? config.deliveryDay : null;

  if (delivery !== null && delivery !== undefined && delivery >= 0) {
    anchor.setDate(anchor.getDate() + ((delivery - anchor.getDay() + 7) % 7));
  } else if (anchor.getDay() >= 5) {
    anchor.setDate(anchor.getDate() + (7 - anchor.getDay()));
  }

  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - anchor.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `לשבוע ${fmt(sunday)} – ${fmt(saturday)}`;
}
