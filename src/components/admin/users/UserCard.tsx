"use client";

import { UserProfile, Program, Group } from "@/app/admin/users/page";
import { UserRole, UserStatus } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { User, Check, X, ShieldAlert, BellRing, Layers, Users as UsersIcon, ChevronDown, ChevronUp } from "lucide-react";
import { RoleSelector } from "./RoleSelector";
import { useState } from "react";

interface UserCardProps {
  user: UserProfile;
  index: number;
  updatingId: string | null;
  programs: Program[];
  groups: Group[];
  onUpdate: (updates: Partial<UserProfile>) => void;
}

export function UserCard({ user, index, updatingId, programs, groups, onUpdate }: UserCardProps) {
  const isUpdating = updatingId === user.id;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleItem = (list: string[], item: string, field: keyof UserProfile) => {
    const newList = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
    onUpdate({ [field]: newList });
  };

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden transition-all ${isExpanded ? 'ring-1 ring-[var(--primary)]/10' : ''}`}
    >
      {/* Main Row */}
      <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 rounded-xl bg-[var(--foreground)]/5 flex items-center justify-center text-[var(--muted)]/50">
            <User className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-black tracking-tight text-[var(--foreground)]">{user.name}</h3>
              <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                user.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                user.status === 'pending' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' :
                'bg-rose-500/10 border-rose-500/20 text-rose-500'
              }`}>
                {user.status === 'approved' ? 'פעיל' : user.status === 'pending' ? 'ממתין' : 'חסום'}
              </div>
            </div>
            <p className="text-xs font-bold text-[var(--muted)]/60 mt-0.5">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <RoleSelector 
            value={user.roles} 
            onChange={(roles) => onUpdate({ roles })}
            disabled={isUpdating}
          />

          <div className="h-8 w-[1px] bg-[var(--border)] hidden md:block" />

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "סגור פירוט" : "ניהול שיוכים לתוכניות וקבוצות"}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[var(--foreground)]/10 transition-all"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            ניהול שיוכים
          </button>

          {user.status === "pending" ? (
            <button
              onClick={() => onUpdate({ status: "approved" })}
              disabled={isUpdating}
              title="אשר כניסת עובד למערכת"
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-500 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              אשר כניסה
            </button>
          ) : (
            <button
              onClick={() => onUpdate({ status: user.status === "blocked" ? "approved" : "blocked" })}
              disabled={isUpdating}
              title={user.status === 'blocked' ? 'שחרר חסימה' : 'חסום גישה למערכת'}
              className={`p-2.5 rounded-xl border transition-all ${
                user.status === 'blocked' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20'
              }`}
            >
              {user.status === 'blocked' ? <Check className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </button>
          )}

          {isUpdating && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-500"></div>}
        </div>
      </div>

      {/* Expanded Area: Assignments */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[var(--border)] bg-[var(--foreground)]/[0.01]"
          >
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Programs */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/30 mr-2">
                  <Layers className="w-4 h-4" />
                  שיוך לתוכניות
                </div>
                <div className="flex flex-wrap gap-2">
                  {programs.map(p => {
                    const isSelected = user.assignedProgramIds?.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleItem(user.assignedProgramIds || [], p.id, 'assignedProgramIds')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          isSelected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-transparent border-[var(--border)] opacity-40 hover:opacity-100'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Groups */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-[var(--foreground)]/30 mr-2">
                  <UsersIcon className="w-4 h-4" />
                  שיוך לקבוצות
                </div>
                <div className="flex flex-wrap gap-2">
                  {groups.map(g => {
                    const isSelected = user.assignedGroupIds?.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleItem(user.assignedGroupIds || [], g.id, 'assignedGroupIds')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          isSelected ? 'bg-rose-500/10 border-rose-500/30 text-rose-600' : 'bg-transparent border-[var(--border)] opacity-40 hover:opacity-100'
                        }`}
                      >
                        {g.name}
                        {g.programId && <span className="mr-1 opacity-40">({programs.find(p => p.id === g.programId)?.name})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
