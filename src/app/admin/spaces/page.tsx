"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc, writeBatch, query, where } from "firebase/firestore";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, ArrowLeftRight } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DAY_SHORT, Workshop } from "@/lib/workshops/types";

interface Space {
  id: string;
  name: string;
  capacity?: number;
  notes?: string;
  active: boolean;
}

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Space> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [moving, setMoving] = useState<Space | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const load = useCallback(async () => {
    const [sSnap, wSnap] = await Promise.all([getDocs(collection(db, "locations")), getDocs(collection(db, "workshops"))]);
    setSpaces(sSnap.docs.map(d => ({
      id: d.id, name: d.data().name || "", capacity: d.data().capacity, notes: d.data().notes, active: d.data().active !== false,
    })).sort((a, b) => a.name.localeCompare(b.name, "he")));
    setWorkshops(wSnap.docs.map(d => ({ id: d.id, ...d.data() } as Workshop)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Which live workshops use a space, and when.
  const usage = (spaceId: string) => {
    const rows: { workshop: Workshop; slots: string[] }[] = [];
    for (const w of workshops) {
      if (w.status === "cancelled") continue;
      const slots = (w.slots || []).filter(s => s.locationId === spaceId).map(s => `${DAY_SHORT[s.day]} ${s.start}–${s.end}`);
      if (slots.length) rows.push({ workshop: w, slots });
    }
    return rows;
  };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    const data = {
      name: editing.name.trim(),
      capacity: editing.capacity ? Number(editing.capacity) : null,
      notes: (editing.notes || "").trim(),
      active: editing.active !== false,
    };
    if (editing.id) await updateDoc(doc(db, "locations", editing.id), data);
    else await addDoc(collection(db, "locations"), data);
    setEditing(null);
    load();
  };

  const toggleArchive = async (s: Space) => {
    await updateDoc(doc(db, "locations", s.id), { active: !s.active });
    load();
  };

  const remove = async (s: Space) => {
    setError("");
    if (usage(s.id).length) { setError(`"${s.name}" משובץ בסדנאות — אפשר להעביר לארכיון במקום למחוק.`); return; }
    if (!confirm(`למחוק את "${s.name}"?`)) return;
    await deleteDoc(doc(db, "locations", s.id));
    load();
  };

  // Re-point every slot (and per-session room override) from one space to another.
  const moveAll = async () => {
    if (!moving || !moveTo) return;
    const batch = writeBatch(db);
    for (const w of workshops) {
      if (!(w.slots || []).some(sl => sl.locationId === moving.id)) continue;
      batch.update(doc(db, "workshops", w.id), {
        slots: w.slots.map(sl => (sl.locationId === moving.id ? { ...sl, locationId: moveTo } : sl)),
      });
    }
    const chSnap = await getDocs(query(collection(db, "session_changes"), where("locationId", "==", moving.id)));
    chSnap.docs.forEach(d => batch.update(d.ref, { locationId: moveTo }));
    await batch.commit();
    setMoving(null); setMoveTo("");
    load();
  };

  if (loading) return <PageSkeleton />;
  const visible = spaces.filter(s => showArchived || s.active);

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-3">
          <h1 className="text-base font-bold flex-1">מרחבים</h1>
          <label className="flex items-center gap-1.5 text-xs text-[var(--foreground)]/60">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            הצג ארכיון
          </label>
          <button onClick={() => setEditing({ active: true })} className={`${btnPrimary} flex items-center gap-1.5`}>
            <Plus className="w-4 h-4" /> מרחב חדש
          </button>
        </header>

        <div className="px-4 md:px-6 py-5 max-w-3xl">
          <p className="text-sm text-[var(--foreground)]/60 mb-4">
            המקומות שבהם מתקיימות הסדנאות. בחירת מרחב לסדנה מאפשרת ליומן להתריע כששני מפגשים נקבעו לאותו מקום באותה שעה.
          </p>
          {error && <p className="text-sm text-rose-500 mb-3">{error}</p>}

          {visible.length === 0 ? (
            <p className="text-sm text-[var(--foreground)]/50 py-10 text-center">עדיין לא הוגדרו מרחבים.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {visible.map(s => {
                const use = usage(s.id);
                return (
                  <li key={s.id} className={`py-3 flex gap-3 items-start ${s.active ? "" : "opacity-50"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">
                        {s.name}
                        {s.capacity ? <span className="font-normal text-[var(--foreground)]/50"> · עד {s.capacity} משתתפים</span> : null}
                        {!s.active && <span className="font-normal text-[var(--foreground)]/50"> · בארכיון</span>}
                      </p>
                      {s.notes && <p className="text-xs text-[var(--foreground)]/55 mt-0.5">{s.notes}</p>}
                      <p className="text-xs text-[var(--foreground)]/50 mt-1">
                        {use.length === 0 ? "לא בשימוש" : use.map(u => `${u.workshop.name} (${u.slots.join(", ")})`).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {use.length > 0 && (
                        <button onClick={() => { setMoving(s); setMoveTo(""); }} aria-label="העבר סדנאות למרחב אחר" title="העבר סדנאות למרחב אחר" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><ArrowLeftRight className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => setEditing(s)} aria-label="עריכה" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => toggleArchive(s)} aria-label={s.active ? "העבר לארכיון" : "שחזר"} className="p-2 rounded-md hover:bg-[var(--foreground)]/5">
                        {s.active ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                      </button>
                      <button onClick={() => remove(s)} aria-label="מחיקה" className="p-2 rounded-md hover:bg-[var(--foreground)]/5 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-[var(--foreground)]/50 mt-4">
            <Link href="/schedule" className="underline">לתפוסת המרחבים ביומן השבועי</Link>
          </p>
        </div>

        {moving && (
          <Dialog title={`העברת סדנאות מ"${moving.name}"`} onClose={() => setMoving(null)}
            footer={<>
              <button onClick={moveAll} disabled={!moveTo} className={btnPrimary}>העבר</button>
              <button onClick={() => setMoving(null)} className={btnGhost}>ביטול</button>
            </>}>
            <p className="text-sm text-[var(--foreground)]/70">
              כל המפגשים הקבועים והשינויים הנקודתיים המשובצים ל־{moving.name} יועברו למרחב שתבחר.
            </p>
            <div>
              <label className={labelCls}>מרחב חדש</label>
              <select className={fieldCls} value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                <option value="">בחר מרחב…</option>
                {spaces.filter(x => x.active && x.id !== moving.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
          </Dialog>
        )}

        {editing && (
          <Dialog title={editing.id ? "עריכת מרחב" : "מרחב חדש"} onClose={() => setEditing(null)}
            footer={<>
              <button onClick={save} disabled={!editing.name?.trim()} className={btnPrimary}>שמור</button>
              <button onClick={() => setEditing(null)} className={btnGhost}>ביטול</button>
            </>}>
            <div>
              <label className={labelCls}>שם המרחב</label>
              <input autoFocus className={fieldCls} value={editing.name || ""} placeholder="חדר יצירה, מטבח, חצר…"
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>קיבולת (לא חובה)</label>
              <input type="number" min={1} className={fieldCls} value={editing.capacity || ""}
                onChange={e => setEditing({ ...editing, capacity: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <label className={labelCls}>הערות</label>
              <input className={fieldCls} value={editing.notes || ""} placeholder="ציוד קיים, נגישות…"
                onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </Dialog>
        )}
      </div>
    </RoleGuard>
  );
}
