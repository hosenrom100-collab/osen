// Vegetarian main dish on a catering order: how many of the total portions are vegetarian.

export const DEFAULT_VEGETARIAN_DISH = "מנה צמחונית";

/** Keeps the vegetarian count a whole number between 0 and the total portions. */
export function clampVegetarian(count: number, total: number): number {
  const max = Math.max(0, Math.floor(total || 0));
  const n = Math.floor(Number.isFinite(count) ? count : 0);
  return Math.min(Math.max(0, n), max);
}

/** Vegetarian portions of a saved order; orders saved before the field existed have none. */
export function vegetarianOf(order: { vegetarianPortions?: number; totalPortions?: number }): number {
  return clampVegetarian(order.vegetarianPortions ?? 0, order.totalPortions ?? 0);
}

/** One summary line, e.g. "מנה צמחונית: 3 מתוך 25 מנות (22 רגילות)". Empty when there are none. */
export function vegetarianLine(count: number, total: number, dish?: string): string {
  const veg = clampVegetarian(count, total);
  if (veg === 0) return "";
  const name = dish?.trim() || DEFAULT_VEGETARIAN_DISH;
  return `${name}: ${veg} מתוך ${total} מנות (${total - veg} רגילות)`;
}
