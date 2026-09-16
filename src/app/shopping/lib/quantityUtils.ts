// Shopping quantities are stored as a single free-text string (e.g. "400 גרם" or "3")
// with the unit embedded as a trailing word. These helpers keep that unit intact
// whenever the numeric value is parsed, stepped, or rebuilt.

export interface ParsedQuantity {
  value: number;
  unit: string;
}

// Units typically bought/measured in bulk, so the +/- stepper should move by more than 1.
const QUANTITY_STEP_BY_UNIT: Record<string, number> = {
  "גרם": 50,
  "מ״ל": 50,
  "ק״ג": 0.5,
  "ליטר": 0.5,
};

// The lowest sensible quantity per unit — weight/volume units are routinely bought in
// fractions (0.5 ק"ג), unlike countable units which bottom out at 1.
const MIN_QUANTITY_BY_UNIT: Record<string, number> = {
  "ק״ג": 0.5,
  "ליטר": 0.5,
};

export function parseQuantity(qtyStr: string | undefined | null): ParsedQuantity {
  const trimmed = (qtyStr ?? "").trim();
  if (!trimmed) return { value: 1, unit: "יחידות" };

  const match = trimmed.match(/^(-?[\d.]+)\s*(.*)$/);
  if (!match) return { value: 1, unit: "יחידות" };

  const value = parseFloat(match[1]);
  const unit = match[2].trim() || "יחידות";
  return { value: Number.isNaN(value) ? 1 : value, unit };
}

export function formatUnitShort(unit: string): string {
  return unit === "יחידות" ? "יח׳" : unit;
}

export function buildQuantityString(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  const formattedValue = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return unit === "יחידות" ? formattedValue : `${formattedValue} ${unit}`;
}

export function getQuantityStep(unit: string): number {
  return QUANTITY_STEP_BY_UNIT[unit] ?? 1;
}

export function getMinQuantity(unit: string): number {
  return MIN_QUANTITY_BY_UNIT[unit] ?? 1;
}

// Moves `value` to the next/previous round multiple of `step` (e.g. 1 -> 50 -> 100,
// not 1 -> 51 -> 101), so stepping a weight-based quantity always lands on a clean number.
// `min` is the lowest value the unit may settle on (0.5 for ק"ג/ליטר, otherwise 1).
export function steppedQuantity(value: number, step: number, direction: 1 | -1, min = 1): number {
  if (step <= 1) return Math.max(min, value + direction * step);
  if (direction > 0) {
    return Math.floor(value / step) * step + step;
  }
  return Math.max(min, Math.ceil(value / step) * step - step);
}
