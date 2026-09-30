"use client";

import { useMemo } from "react";
import { Person, ROLE_LABEL } from "@/lib/workshops/types";
import { labelCls } from "./Dialog";

/**
 * Pick staff for an activity. Quick chips add a whole set at once — the program's team, the group's team,
 * or everyone of one role (social workers…) — and a tap on the chip again takes that set back out.
 * People who are busy or absent at the chosen time sink to the bottom, with the reason next to their name.
 */
export function StaffPicker({ label, staff, selected, onChange, programId, groupIds = [], busyOf }: {
  label: string; staff: Person[]; selected: string[]; onChange: (ids: string[]) => void;
  programId?: string; groupIds?: string[]; busyOf?: (id: string) => string | undefined;
}) {
  const chips = useMemo(() => {
    const inProgram = programId ? staff.filter(p => p.programIds?.includes(programId)) : [];
    const pool = inProgram.length ? inProgram : staff;
    const out: { key: string; label: string; ids: string[] }[] = [];
    if (inProgram.length) out.push({ key: "program", label: "כל צוות התוכנית", ids: inProgram.map(p => p.id) });
    if (groupIds.length) {
      const g = staff.filter(p => p.groupIds?.some(id => groupIds.includes(id)));
      if (g.length) out.push({ key: "group", label: "צוות הקבוצה", ids: g.map(p => p.id) });
    }
    const roles = [...new Set(pool.flatMap(p => p.roles || []))].filter(r => ROLE_LABEL[r]);
    roles.forEach(r => out.push({ key: `role:${r}`, label: ROLE_LABEL[r], ids: pool.filter(p => p.roles?.includes(r)).map(p => p.id) }));
    return out.filter(c => c.ids.length > 0);
  }, [staff, programId, groupIds]);

  const toggleSet = (ids: string[]) => {
    const all = ids.every(id => selected.includes(id));
    onChange(all ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const sorted = [...staff].sort((a, b) => Number(!!busyOf?.(a.id)) - Number(!!busyOf?.(b.id)));

  return (
    <div>
      <label className={labelCls}>{label}{selected.length > 0 && <span className="font-normal"> · נבחרו {selected.length}</span>}</label>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chips.map(c => {
            const on = c.ids.every(id => selected.includes(id));
            return (
              <button key={c.key} type="button" onClick={() => toggleSet(c.ids)} aria-pressed={on} title={`${c.ids.length} אנשים`}
                className={`h-7 px-3 rounded-full text-[13px] font-medium ${on ? "bg-[var(--btn)] text-[var(--btn-text)]" : "bg-[var(--btn-soft)] text-[var(--btn-soft-text)] hover:bg-[var(--btn-soft-hover)]"}`}>
                {c.label} <span className="opacity-70 tabular-nums">{c.ids.length}</span>
              </button>
            );
          })}
        </div>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 max-h-56 overflow-y-auto border border-[var(--border)] rounded-lg px-2.5 py-1">
        {sorted.map(p => {
          const busy = busyOf?.(p.id);
          return (
            <li key={p.id}>
              <label className={`flex items-center gap-2 py-1 text-sm cursor-pointer ${busy && !selected.includes(p.id) ? "text-[var(--foreground)]/45" : ""}`} title={busy ? `תפוס/ה: ${busy}` : undefined}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.name}{p.roles?.length ? <span className="text-xs text-[var(--foreground)]/45"> · {p.roles.filter(r => ROLE_LABEL[r]).map(r => ROLE_LABEL[r]).join(", ")}</span> : null}</span>
                {busy && <span className="text-[11px] text-amber-600">· {busy}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
