import { newest, TimeMark } from "./model";

export type StatusMap = Record<string, "present" | "absent" | "unset">; // key: patientId_yyyy-MM-dd

export interface DayExtra {
  late?: TimeMark | null;
  leftEarly?: TimeMark | null;
  note?: string;
  /** Ids of every document found for this participant and day. */
  docIds: string[];
}

const mark = (v: unknown): TimeMark | null =>
  v && typeof v === "object" ? { at: typeof (v as TimeMark).at === "string" ? (v as TimeMark).at : null } : null;

/** Month or year of attendance documents into a status map plus late / early-leave marks. */
export function parseDayDocs(docs: { id: string; data: () => Record<string, unknown> }[]) {
  const status: StatusMap = {};
  const extras: Record<string, DayExtra> = {};
  const picked: Record<string, Record<string, unknown>> = {};

  for (const d of docs) {
    const data = d.data();
    if (typeof data.patientId !== "string" || typeof data.date !== "string") continue;
    const key = `${data.patientId}_${data.date}`;
    const ids = extras[key]?.docIds ?? [];
    ids.push(d.id);
    if (picked[key] && newest(picked[key], data) === picked[key]) {
      extras[key].docIds = ids;
      continue;
    }
    picked[key] = data;
    const s = data.status === "present" || data.status === "absent" ? data.status : "unset";
    status[key] = s;
    extras[key] = {
      late: s === "present" ? mark(data.late) : null,
      leftEarly: s === "present" ? mark(data.leftEarly) : null,
      docIds: ids,
    };
  }
  return { status, extras };
}

/** What a present cell says in the spreadsheet: "+", or "+א" (late) / "+י" (left early). */
export function presentCellText(extra?: DayExtra): string {
  return `+${extra?.late ? "א" : ""}${extra?.leftEarly ? "י" : ""}`;
}

/** Tooltip text for a cell: the marks and the note. */
export function cellTitle(extra?: DayExtra): string | undefined {
  if (!extra) return undefined;
  const parts: string[] = [];
  if (extra.late) parts.push(extra.late.at ? `איחור ${extra.late.at}` : "איחור");
  if (extra.leftEarly) parts.push(extra.leftEarly.at ? `יצא ${extra.leftEarly.at}` : "יצא מוקדם");
  if (extra.note) parts.push(extra.note);
  return parts.length ? parts.join(" · ") : undefined;
}
