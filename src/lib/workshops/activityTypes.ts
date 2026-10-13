import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ActivityType, DEFAULT_TYPES } from "./activityTypesCore";

export * from "./activityTypesCore";

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
