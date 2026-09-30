"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc, writeBatch, query, where } from "firebase/firestore";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, ArrowLeftRight } from "lucide-react";
import { Dialog, fieldCls, labelCls, btnPrimary, btnGhost } from "@/components/workshops/Dialog";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Segmented, SortTh, WHITE_VARS, nextSort, selectCls, Dir } from "@/components/workshops/ListKit";
import { usePersisted } from "@/lib/usePersisted";
import { DAY_SHORT, Workshop } from "@/lib/workshops/types";

interface Space {
  id: string;
  name: string;
  type?: string;
  capacity?: number;
  notes?: string;
  active: boolean;
}

type Status = "active" | "archived" | "all";
type Use = "all" | "used" | "unused";
type SortKey = "name" | "type" | "capacity" | "usage";
const TYPE_SUGGESTIONS = ["חדר", "אולם", "חצר", "מטבח", "חוץ"];

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Space> | null>(null);
  // Filters and sort are remembered in this browser.
  const [status, setStatus] = usePersisted<Status>("spaces.status", "active");
  const [typeFilter, setTypeFilter] = usePersisted("spaces.type", "");
  const [useFilter, setUseFilter] = usePersisted<Use>("spaces.use", "all");
  const [sortState, setSortState] = usePersisted<{ sort: SortKey; dir: Dir }>("spaces.sort", { sort: "name", dir: "asc" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [moving, setMoving] = useState<Space | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const load = useCallback(async () => {
    const [sSnap, wSnap] = await Promise.all([getDocs(collection(db, "locations")), getDocs(collection(db, "workshops"))]);
    setSpaces(sSnap.docs.map(d => ({
      id: d.id, name: d.data().name || "", type: d.data().type || "", capacity: d.data().capacity, notes: d.data().notes, active: d.data().active !== false,
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
      type: (editing.type || "").trim(),
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

  const usedCount = (id: string) => usage(id).length;
  const visible = useMemo(() => {
    const { sort, dir } = sortState;
    const list = spaces.filter(x =>
      (status === "all" || (status === "active") === x.active) &&
      (!typeFilter || (x.type || "") === typeFilter) &&
      (useFilter === "all" || (useFilter === "used") === usedCount(x.id) > 0) &&
      (!search || x.name.includes(search)));
    const val = (x: Space): string | number => sort === "name" ? x.name : sort === "type" ? x.type || "\uffff" : sort === "capacity" ? x.capacity ?? -1 : usedCount(x.id);
    return list.sort((a, b) => {
      const p = val(a), q = val(b);
      const r = typeof p === "number" ? p - (q as number) : String(p).localeCompare(String(q), "he");
      return (dir === "asc" ? r : -r) || a.name.localeCompare(b.name, "he");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces, workshops, status, typeFilter, useFilter, search, sortState]);

  if (loading) return <PageSkeleton />;
  const usedTypes = [...new Set(spaces.map(x => x.type || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
  const th = { sort: sortState.sort, dir: sortState.dir, onSort: (k: SortKey) => setSortState(cur => nextSort(cur, k)) };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" style={WHITE_VARS} className="min-h-screen bg-white text-[var(--foreground)]">
        <header className="border-b border-[var(--border)] px-4 md:px-6 h-14 flex items-center gap-3">
          <h1 className="text-lg font-bold">מרחבים</h1>
          <span className="text-sm text-[var(--foreground)]/45 tabular-nums">{visible.length}</span>
          <span className="flex-1" />
          <Link href="/admin/workshops" className={btnGhost}>פעילויות</Link>
          <button onClick={() => setEditing({ active: true })} className={`${btnPrimary} flex items-center gap-1.5`}>
            <Plus className="w-4 h-4" /> מרחב חדש
          </button>
        </header>

        <div className="px-4 md:px-6 py-4 space-y-3 max-w-5xl">
          <p className="text-sm text-[var(--foreground)]/60">
            המקומות שבהם מתקיימות הפעילויות. בחירת מרחב לפעילות מאפשרת ליומן להתריע כששני מפגשים נקבעו לאותו מקום באותה שעה.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="סטטוס" value={status} onChange={setStatus} options={[["active", "פעילים"], ["archived", "ארכיון"], ["all", "הכול"]]} />
            {usedTypes.length > 0 && (
              <select className={selectCls} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="סוג מרחב">
                <option value="">כל הסוגים</option>
                {usedTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <select className={selectCls} value={useFilter} onChange={e => setUseFilter(e.target.value as Use)} aria-label="שימוש">
              <option value="all">כל המרחבים</option><option value="used">בשימוש</option><option value="unused">לא בשימוש</option>
            </select>
            <input className={`${selectCls} w-44`} placeholder="חיפוש לפי שם" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}

          {visible.length === 0 ? (
            <p className="text-sm text-[var(--foreground)]/50 py-14 text-center border border-[var(--border)] rounded-xl">
              {spaces.length === 0 ? "עדיין לא הוגדרו מרחבים." : "אין מרחבים שמתאימים לסינון."}
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--border)] rounded-xl bg-white">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="text-xs text-[var(--foreground)]/55 bg-[var(--foreground)]/[0.03] border-b border-[var(--border)]">
                  <tr>
                    <SortTh k="name" {...th} className="ps-4">מרחב</SortTh>
                    <SortTh k="type" {...th}>סוג</SortTh>
                    <SortTh k="capacity" {...th}>קיבולת</SortTh>
                    <SortTh k="usage" {...th}>שימוש</SortTh>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {visible.map(s => {
                    const use = usage(s.id);
                    return (
                      <tr key={s.id} className={s.active ? "" : "opacity-55"}>
                        <td className="py-3 ps-4 pe-2 align-top">
                          <span className="font-semibold">{s.name}</span>{!s.active && <span className="text-xs text-[var(--foreground)]/50"> · בארכיון</span>}
                          {s.notes && <span className="block text-xs text-[var(--foreground)]/55">{s.notes}</span>}
                        </td>
                        <td className="pe-2 align-top pt-3.5">{s.type ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--foreground)]/[0.06]">{s.type}</span> : <span className="text-[var(--foreground)]/35">—</span>}</td>
                        <td className="pe-2 tabular-nums align-top pt-3">{s.capacity || "—"}</td>
                        <td className="pe-2 align-top pt-3 text-[var(--foreground)]/70 max-w-[22rem]">
                          {use.length === 0 ? <span className="text-[var(--foreground)]/40">לא בשימוש</span> : (
                            <span title={use.map(u => `${u.workshop.name} (${u.slots.join(", ")})`).join("\n")}>
                              <span className="font-semibold tabular-nums text-[var(--foreground)]">{use.length}</span> {use.length === 1 ? "פעילות" : "פעילויות"}
                              <span className="block text-xs text-[var(--foreground)]/50 truncate">{use.map(u => u.workshop.name).join(", ")}</span>
                            </span>
                          )}
                        </td>
                        <td className="pe-2 align-top">
                          <div className="flex items-center gap-0.5 justify-end">
                            {use.length > 0 && (
                              <button onClick={() => { setMoving(s); setMoveTo(""); }} aria-label="העבר פעילויות למרחב אחר" title="העבר פעילויות למרחב אחר" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><ArrowLeftRight className="w-4 h-4" /></button>
                            )}
                            <button onClick={() => setEditing(s)} aria-label="עריכה" className="p-2 rounded-md hover:bg-[var(--foreground)]/5"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => toggleArchive(s)} aria-label={s.active ? "העבר לארכיון" : "שחזר"} className="p-2 rounded-md hover:bg-[var(--foreground)]/5">
                              {s.active ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                            </button>
                            <button onClick={() => remove(s)} aria-label="מחיקה" className="p-2 rounded-md hover:bg-[var(--foreground)]/5 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[var(--foreground)]/50">
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
              <label className={labelCls}>סוג מרחב (לא חובה)</label>
              <input list="space-types" className={fieldCls} value={editing.type || ""} placeholder="חדר, חצר, מטבח…"
                onChange={e => setEditing({ ...editing, type: e.target.value })} />
              <datalist id="space-types">{[...new Set([...TYPE_SUGGESTIONS, ...spaces.map(x => x.type || "").filter(Boolean)])].map(t => <option key={t} value={t} />)}</datalist>
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
