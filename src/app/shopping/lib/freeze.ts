import type { CutoffConfig } from "../types";

/**
 * Cutoff and freeze arithmetic shared by the browser and the sync API route.
 *
 * Everything is computed in Israel time on purpose: the Firestore rules compare `request.time`
 * (a server instant) with the stored `freezeAt`, so the boundary must be the same instant no
 * matter which device or server computed it, daylight-saving changes included.
 */
export const CUTOFF_TIME_ZONE = "Asia/Jerusalem";

export type ListKey = "supermarket" | "large";
export const LIST_KEYS: ListKey[] = ["supermarket", "large"];

type TimestampLike = Date | { toDate: () => Date } | null | undefined;

const toDate = (v: TimestampLike): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : v.toDate();
  return isNaN(d.getTime()) ? null : d;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of an instant in the cutoff time zone. */
function zonedParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CUTOFF_TIME_ZONE,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    weekday: WEEKDAYS.indexOf(get("weekday")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** The instant whose Israel wall-clock reading is the given date and time. */
function zonedToInstant(year: number, month: number, day: number, hour: number, minute: number): number {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms: number) => {
    const p = zonedParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  let instant = wallAsUtc - offsetAt(wallAsUtc);
  const corrected = wallAsUtc - offsetAt(instant); // the offset can differ across a DST switch
  if (corrected !== instant) instant = corrected;
  return instant;
}

/** The cutoff that most recently passed and the next one to come, relative to `now`. */
export function getCutoffBoundaries(config: CutoffConfig, now: Date): { last: Date; next: Date } {
  const [hour, minute] = (config.time || "16:00").split(":").map(Number);
  const p = zonedParts(now.getTime());
  const thisWeek = zonedToInstant(p.year, p.month, p.day + (config.day - p.weekday), hour ?? 16, minute ?? 0);
  const weekMs = zonedToInstant(p.year, p.month, p.day + (config.day - p.weekday) + 7, hour ?? 16, minute ?? 0) - thisWeek;
  const prevMs = thisWeek - zonedToInstant(p.year, p.month, p.day + (config.day - p.weekday) - 7, hour ?? 16, minute ?? 0);

  return thisWeek > now.getTime()
    ? { last: new Date(thisWeek - prevMs), next: new Date(thisWeek) }
    : { last: new Date(thisWeek), next: new Date(thisWeek + weekMs) };
}

/** True when the list holds an item that was created before the cutoff that last passed. */
export function hasItemBefore(items: { createdAt: TimestampLike }[] | undefined, cutoff: Date): boolean {
  return !!items?.some((r) => {
    const created = toDate(r.createdAt);
    return created !== null && created < cutoff;
  });
}

/**
 * The instant from which non-managers may no longer touch a list, or null when there is none.
 * A list is frozen from the last cutoff while it still holds items from before it (it was never
 * closed); otherwise the boundary is the next cutoff. Closing or emptying the list therefore
 * moves the boundary forward on its own, which is what unfreezes it.
 */
export function computeFreezeAt(
  config: CutoffConfig | undefined,
  items: { createdAt: TimestampLike }[] | undefined,
  now: Date
): Date | null {
  if (!config || !config.enabled) return null;
  const { last, next } = getCutoffBoundaries(config, now);
  return hasItemBefore(items, last) ? last : next;
}

/** Items of the given statuses, split per list, from a flat list. */
export const listKeyOf = (item: { listType?: string | null }): ListKey => (item.listType === "large" ? "large" : "supermarket");
