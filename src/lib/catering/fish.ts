// Fish main dish on a catering order: how many of the total portions are fish.

export const DEFAULT_FISH_DISH = "דג";

/** Keeps the fish count a whole number between 0 and the total portions. */
export function clampFish(count: number, total: number): number {
  const max = Math.max(0, Math.floor(total || 0));
  const n = Math.floor(Number.isFinite(count) ? count : 0);
  return Math.min(Math.max(0, n), max);
}

/** Fish portions of a saved order; orders saved before the field existed have none. */
export function fishOf(order: { fishPortions?: number; totalPortions?: number }): number {
  return clampFish(order.fishPortions ?? 0, order.totalPortions ?? 0);
}

/** One summary line, e.g. "דג: 3 מתוך 25 מנות (22 רגילות)". Empty when there are none. */
export function fishLine(count: number, total: number, dish?: string): string {
  const fish = clampFish(count, total);
  if (fish === 0) return "";
  const name = dish?.trim() || DEFAULT_FISH_DISH;
  return `${name}: ${fish} מתוך ${total} מנות (${total - fish} רגילות)`;
}
