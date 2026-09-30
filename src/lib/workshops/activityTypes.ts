import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";

/** An activity type. Managers add, rename, recolour and remove these (settings/schedule). */
export interface ActivityType {
  id: string;
  label: string;
  hue: number;            // pastel hue 0-359
  band: boolean;          // drawn as a quiet band (meal, break…) instead of a card
  hasStaff: boolean;      // has a leader, checked for conflicts
  hasParticipants: boolean;
  audience?: "participants" | "staff"; // "staff" = team meeting: staff attend, nothing is shared with participants
  order: number;
  archived?: boolean;     // hidden from pickers, still shown where already used
}

export const DEFAULT_TYPES: ActivityType[] = [
  { id: "workshop", label: "סדנה", hue: 212, band: false, hasStaff: true, hasParticipants: true, order: 0 },
  { id: "therapy", label: "טיפול / שיחה", hue: 152, band: false, hasStaff: true, hasParticipants: true, order: 1 },
  { id: "staff_meeting", label: "ישיבת צוות", hue: 282, band: false, hasStaff: true, hasParticipants: false, audience: "staff", order: 2 },
  { id: "event", label: "אירוע", hue: 28, band: false, hasStaff: true, hasParticipants: true, order: 3 },
  { id: "meal", label: "ארוחה", hue: 48, band: true, hasStaff: false, hasParticipants: false, order: 4 },
  { id: "break", label: "הפסקה", hue: 184, band: true, hasStaff: false, hasParticipants: false, order: 5 },
  { id: "transport", label: "הסעה", hue: 252, band: true, hasStaff: false, hasParticipants: false, order: 6 },
  { id: "free", label: "זמן חופשי", hue: 92, band: true, hasStaff: false, hasParticipants: false, order: 7 },
];

export const typeById = (types: ActivityType[], id?: string) =>
  types.find(t => t.id === (id || "workshop")) || types.find(t => t.id === "workshop") || DEFAULT_TYPES[0];

const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/**
 * Pastel hues not yet in use, best first: 24 random candidates ordered by how far they are
 * from the closest existing hue. The UI walks the list on "another colour".
 */
export function pastelCandidates(used: number[]): number[] {
  const cand = Array.from({ length: 24 }, () => Math.floor(Math.random() * 360));
  const far = (h: number) => (used.length ? Math.min(...used.map(u => gap(h, u))) : 360);
  return cand.sort((a, b) => far(b) - far(a));
}

// One fixed recipe keeps every hue soft and every label readable (AA on the fill).
export const pastel = (hue: number) => ({
  fill: `hsl(${hue} 65% 93%)`,
  bar: `hsl(${hue} 45% 56%)`,
  ink: `hsl(${hue} 45% 22%)`,
  soft: `hsl(${hue} 40% 86%)`,
});

export async function loadActivityTypes(): Promise<ActivityType[]> {
  try {
    const snap = await getDoc(doc(db, "settings", "schedule"));
    const list: ActivityType[] | undefined = snap.data()?.activityTypes;
    if (list?.length) return [...list].sort((a, b) => a.order - b.order);
  } catch { /* fall back to defaults */ }
  return DEFAULT_TYPES;
}

export async function saveActivityTypes(types: ActivityType[]) {
  await setDoc(doc(db, "settings", "schedule"), { activityTypes: types.map((t, i) => ({ ...t, order: i })) }, { merge: true });
}
