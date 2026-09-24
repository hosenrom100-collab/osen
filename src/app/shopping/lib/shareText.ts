import { ShoppingRequest, TargetFramework } from "../types";
import { CAT_EMOJI, FRAMEWORK_LABELS, TARGET_FRAMEWORKS } from "./constants";
import { formatUnitShort, parseQuantity } from "./quantityUtils";

interface ShareTextOptions {
  listType: "supermarket" | "large";
  framework: "all" | TargetFramework;
  /** Category order as shown on screen, so the message reads like the list does. */
  categories: string[];
  /** e.g. "יום שני" — shown only when the cutoff settings define a delivery day. */
  deliveryDay?: string;
}

/**
 * Plain-text version of the open items, laid out for a WhatsApp message:
 * `*bold*` category headers, one "☐ item – qty" line each. Purchased and deleted items
 * are left out on purpose — the recipient only needs what is still to be bought.
 */
export function buildShareText(items: ShoppingRequest[], { listType, framework, categories, deliveryDay }: ShareTextOptions): string {
  const kind = listType === "large" ? "רשימת רכש וציוד" : "רשימת קניות";
  const scope = framework === "all" ? "כל המסגרות" : FRAMEWORK_LABELS[framework] || framework;

  const lines: string[] = [`🛒 *${kind}* – ${scope}`];
  if (deliveryDay) lines.push(`🚚 משלוח: ${deliveryDay}`);

  // Screen order first, then any category the settings no longer list (kept, never dropped).
  const known = categories.filter((c) => items.some((i) => i.category === c));
  const orphans = Array.from(new Set(items.map((i) => i.category))).filter((c) => !categories.includes(c)).sort();

  for (const cat of [...known, ...orphans]) {
    const catItems = items
      .filter((i) => i.category === cat)
      .sort((a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || a.name.localeCompare(b.name));

    lines.push("", `*${CAT_EMOJI[cat] ?? CAT_EMOJI["כללי"]} ${cat}*`);
    for (const item of catItems) {
      const { value, unit } = parseQuantity(item.quantity);
      let line = `☐ ${item.name} – ${value} ${formatUnitShort(unit)}`;
      if (item.priority === "urgent") line += " 🔥";
      if (framework === "all") {
        const fw = TARGET_FRAMEWORKS.find((f) => f.id === (item.targetFramework || "main"));
        if (fw) line += ` [${fw.shortName}]`;
      }
      if (item.notes?.trim()) line += ` (${item.notes.trim()})`;
      lines.push(line);
    }
  }

  lines.push("", `סה״כ ${items.length} פריטים`);
  return lines.join("\n");
}
