// Personal rehabilitation plan (תוכנית שיקום אישית): the plan's shape, ready-made texts and the
// "smart" parts that turn the participant's program activities into suggestions. No database access,
// so it can be tested on its own. Stored in rehab_plans/{patientId}.

import type { Workshop } from "./workshops/types";
import type { ActivityType } from "./workshops/activityTypesCore";

export interface RehabArea {
  id: string;            // preset id, or "custom_…"
  title: string;
  description: string;
  farmActions: string[]; // activity names at the farm (ways of action)
}

export interface RehabPlan {
  date: string;          // dd/MM/yyyy, as printed
  therapistName: string; // איש הצוות הטיפולי המלווה בחווה
  districtWorker: string;
  areas: RehabArea[];    // in order of importance
  goal: string;
  objectives: string[];
  ways: string[];        // דרכים אפשריות להשגת המטרה
  supports: string[];    // מקורות סיוע
  signerName: string;
  signerTitle: string;
  signerOrg: string;
}

export interface AreaPreset {
  id: string;
  title: string;
  description: string;
  keywords: string[];    // matched against activity names to suggest ways of action
}

export const AREA_PRESETS: AreaPreset[] = [
  {
    id: "regulation",
    title: "ויסות רגשי והרגעת מערכת העצבים",
    description: "שיפור הוויסות הרגשי והפחתת עוררות יתר, שבאה לידי ביטוי בדריכות גבוהה, סף תסכול נמוך וקשיי שינה.",
    keywords: ["כלב", "יוגה", "קרמיקה", "ביופידבק", "דיקור", "מדיטצי", "נשימ", "מיינדפולנס", "טבע", "סוס", "רפלקס", "עיסוי", "שיאצו", "גינ"],
  },
  {
    id: "interpersonal",
    title: "תפקוד ויכולות בינאישיות",
    description: "שיפור תפקוד וקשב: חיזוק יכולת הריכוז, המיקוד וההתמדה במשימות רציפות בחווה.\nתקשורת וקשר בינאישי: התמודדות עם דפוסי הימנעות, הגברת תחושת הביטחון בקשרים קרובים, ופיתוח יכולת לשיתוף מותאם במסגרת קבוצתית.",
    keywords: ["קבוצ", "שיח", "מעגל", "בישול", "חקלאות", "גילוף", "נגרות", "משק", "צוות", "תיאטרון", "מוזיק"],
  },
  {
    id: "personal",
    title: "התפתחות אישית: חיפוש מטפל/ת",
    description: "איתור טיפול פרטני עם מטפל/ת מתמחה בעבודה סומטית (גופנית) בטראומה.",
    keywords: ["פרטני", "שיחה אישית", "סומטי"],
  },
  {
    id: "routine",
    title: "שגרה ותפקוד יומיומי",
    description: "בניית שגרת יום יציבה: הגעה סדירה, שעות שינה קבועות, תזונה מסודרת ועמידה בהתחייבויות.",
    keywords: ["בישול", "ארוח", "משק", "גינ", "חקלאות"],
  },
  {
    id: "body",
    title: "בריאות גופנית ופעילות גופנית",
    description: "חיזוק הגוף והחיבור אליו באמצעות פעילות גופנית סדירה ומותאמת, לצד הקשבה לצרכים ולגבולות הגוף.",
    keywords: ["כושר", "ספורט", "יוגה", "הליכ", "טיול", "תנוע", "פילאטיס", "שחי"],
  },
  {
    id: "employment",
    title: "תעסוקה והכשרה מקצועית",
    description: "גיבוש כיוון תעסוקתי, רכישת הרגלי עבודה ומיומנויות מקצועיות לקראת השתלבות בעבודה או בלימודים.",
    keywords: ["נגרות", "חקלאות", "גילוף", "קרמיקה", "בישול", "סדנ", "הכשר", "מחשב"],
  },
  {
    id: "family",
    title: "קשרים משפחתיים וזוגיות",
    description: "חיזוק התקשורת והקשר עם בני המשפחה, והתמודדות עם מתחים במערכת המשפחתית.",
    keywords: ["משפח", "זוג", "הורות", "שיח"],
  },
];

export const GOAL_PRESETS = [
  "העמקת התהליך הטיפולי-שיקומי בחווה לצורך השגת איזון פנימי וחיזוק אישי.",
  "בניית שגרה יציבה ומיטיבה שתאפשר חזרה הדרגתית לתפקוד מלא בבית, בעבודה ובקהילה.",
  "רכישת כלים לוויסות רגשי והתמודדות עם מצבי לחץ, ויישומם בחיי היומיום.",
  "גיבוש כיוון תעסוקתי ברור וצעדים מעשיים להשתלבות בעבודה או בלימודים.",
];

export const OBJECTIVE_PRESETS = [
  "התמדה: רצף ויציבות בתהליך הטיפולי הפרטני שהחל לאחרונה.",
  "תקשורת ואמון: רכישת כלים מעשיים לפתיחות, שיתוף והגברת האמון הבינאישי, תוך יישומם גם בתקשורת ובמערכות היחסים בבית.",
  "הגעה סדירה: נוכחות קבועה בימי הפעילות בחווה.",
  "ויסות: זיהוי מוקדם של סימני עוררות ושימוש בכלי הרגעה שנרכשו.",
  "שינה: שיפור איכות השינה ובניית שגרת ערב קבועה.",
  "השתלבות קבוצתית: לקיחת חלק פעיל במשימות ובשיח הקבוצתי.",
  "תעסוקה: בירור תחומי עניין ויכולות לקראת צעד תעסוקתי ראשון.",
];

export const WAY_PRESETS = [
  "יצירת קשר אישי בטוח, בניית יחסי אמון הדדי עם הצוות והסתגלות לכללי המקום.",
  "תיווך קשרים חברתיים מונחה על ידי הצוות, ויצירת משימות עבודה משותפות.",
  "שיחות אישיות קבועות עם איש הצוות המלווה.",
  "בניית סדר יום אישי בחווה ומעקב שבועי אחר יישומו.",
];

export const SUPPORT_PRESETS = [
  "ליווי אישי מותאם קצב לבניית אמון יציב ומתמשך, תוך כבוד לגבולות ולקצב הפנימי.",
  "שיחות גישור, תיווך ומתן כלים להתמודדות בתוך המערכת המשפחתית.",
  "ליווי ותיווך פעיל של הצוות המקצועי לביסוס קשרים חברתיים בריאים ומקדמים.",
  "עו\"ס השיקום במחוז.",
  "מטפל/ת פרטני/ת בקהילה.",
  "בני המשפחה ותמיכה חברתית.",
];

export const DEFAULT_SIGNER_ORG = "צוות טיפולי, חוות רום";

/** dd/MM/yyyy, the way the plan prints its date. */
export const formatPlanDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** A plan with nothing chosen yet, with the header fields already filled in. */
export function emptyPlan(o: Partial<RehabPlan> = {}): RehabPlan {
  return {
    date: formatPlanDate(new Date()), therapistName: "", districtWorker: "",
    areas: [], goal: "", objectives: [], ways: [], supports: [],
    signerName: "", signerTitle: "", signerOrg: DEFAULT_SIGNER_ORG,
    ...o,
  };
}

export const areaFromPreset = (p: AreaPreset, farmActions: string[] = []): RehabArea =>
  ({ id: p.id, title: p.title, description: p.description, farmActions });

/** One entry per activity name, with how many times the participant attended it (0 if unknown). */
export interface ProgramActivity { name: string; attended: number }

/**
 * The activities of the participant's programs that a plan can lean on: workshops of those programs
 * that are not cancelled, whose type is for participants (no meals, breaks or team meetings), and that
 * still run on `today` or later. If none are current, past ones of the programs are used instead.
 * Sorted by attendance, then name.
 */
export function programActivities(
  workshops: Workshop[], programIds: string[], types: ActivityType[], today: string,
  attendedByWorkshop: Record<string, number> = {},
): ProgramActivity[] {
  const usable = (w: Workshop) => {
    if (!programIds.includes(w.programId) || w.status === "cancelled" || !w.name?.trim()) return false;
    const t = types.find(x => x.id === (w.kind || "workshop"));
    return !t || (!t.band && t.hasParticipants && t.audience !== "staff");
  };
  const all = workshops.filter(usable);
  const current = all.filter(w => !w.endDate || w.endDate >= today);
  const by = new Map<string, number>();
  for (const w of current.length ? current : all) {
    const name = w.name.trim();
    by.set(name, (by.get(name) ?? 0) + (attendedByWorkshop[w.id] ?? 0));
  }
  return [...by].map(([name, attended]) => ({ name, attended }))
    .sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name, "he"));
}

/** Activities that fit an area: keyword matches first (best attended first), then the rest. */
export function suggestForArea(area: Pick<AreaPreset, "keywords"> | undefined, activities: ProgramActivity[]): { fits: string[]; others: string[] } {
  const kws = area?.keywords ?? [];
  const fits: string[] = [], others: string[] = [];
  for (const a of activities) (kws.some(k => a.name.includes(k)) ? fits : others).push(a.name);
  return { fits, others };
}

/** "א", "א ו-ב", "א, ב ו-ג". */
export function hebrewList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

/** The "ways of action at the farm" line under an area, as printed. */
export const farmActionsLine = (names: string[]) =>
  names.length ? `דרכי פעולה בחווה: שילוב בפעילויות כגון ${hebrewList(names)}.` : "";

/** A ready "ways to achieve" line built from the activities the participant connects to. */
export const activitiesWay = (names: string[]) =>
  names.length ? `באמצעות חיבור לפעילות בחווה אשר המשתתף/ת מתחבר/ת אליה, כגון: ${hebrewList(names)}.` : "";

export const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter(x => x !== item) : [...list, item];

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** What still needs filling before the plan can be printed (empty = ready). */
export function missingParts(p: RehabPlan): string[] {
  const out: string[] = [];
  if (!p.areas.length) out.push("תחום שיפור אחד לפחות");
  if (!p.goal.trim()) out.push("הגדרת המטרה");
  if (!p.objectives.some(o => o.trim())) out.push("יעד מרכזי אחד לפחות");
  return out;
}

/** Reads a stored plan defensively: anything missing or of the wrong type falls back to the default. */
export function parsePlan(raw: unknown, defaults: RehabPlan): RehabPlan {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  const str = (k: keyof RehabPlan) => (typeof r[k] === "string" ? (r[k] as string) : (defaults[k] as string));
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const areas = Array.isArray(r.areas)
    ? r.areas.filter(a => a && typeof a === "object").map((a, i) => {
        const x = a as Record<string, unknown>;
        return {
          id: typeof x.id === "string" ? x.id : `custom_${i}`,
          title: typeof x.title === "string" ? x.title : "",
          description: typeof x.description === "string" ? x.description : "",
          farmActions: strs(x.farmActions),
        };
      })
    : defaults.areas;
  return {
    date: str("date"), therapistName: str("therapistName"), districtWorker: str("districtWorker"),
    areas, goal: str("goal"),
    objectives: Array.isArray(r.objectives) ? strs(r.objectives) : defaults.objectives,
    ways: Array.isArray(r.ways) ? strs(r.ways) : defaults.ways,
    supports: Array.isArray(r.supports) ? strs(r.supports) : defaults.supports,
    signerName: str("signerName"), signerTitle: str("signerTitle"), signerOrg: str("signerOrg"),
  };
}

/**
 * One tap to a full first draft: the three most common areas with the program activities that fit
 * them, the first goal, two objectives, ways (including one built from the chosen activities) and
 * supports. The header and signature are kept. The worker then only edits.
 */
export function quickFill(p: RehabPlan, activities: ProgramActivity[]): RehabPlan {
  const areas = AREA_PRESETS.slice(0, 3).map(pr => areaFromPreset(pr, suggestForArea(pr, activities).fits.slice(0, 4)));
  const chosen = [...new Set(areas.flatMap(a => a.farmActions))];
  return {
    ...p,
    areas,
    goal: GOAL_PRESETS[0],
    objectives: OBJECTIVE_PRESETS.slice(0, 2),
    ways: [...WAY_PRESETS.slice(0, 2), ...(chosen.length ? [activitiesWay(chosen)] : [])],
    supports: SUPPORT_PRESETS.slice(0, 3),
  };
}
