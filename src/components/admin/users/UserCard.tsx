"use client";

import { UserProfile, Program, Group } from "@/app/admin/users/page";
import { UserRole, UserStatus } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, Check, X, ShieldAlert, BellRing, Layers, 
  Users as UsersIcon, ChevronDown, ChevronUp, ShieldOff,
  UserCheck, ShieldCheck, Loader2
} from "lucide-react";
import { RoleSelector } from "./RoleSelector";
import { StatusBadge } from "./StatusBadge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  const [showConfirmModal, setShowConfirmModal] = useState<{
    open: boolean;
    type: "block" | "unblock" | "approve";
  }>({ open: false, type: "block" });

  const toggleItem = (list: string[], item: string, field: keyof UserProfile) => {
    const newList = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
    onUpdate({ [field]: newList });
  };

  const handleStatusChange = () => {
    if (showConfirmModal.type === "block") {
      onUpdate({ status: "blocked" });
    } else {
      onUpdate({ status: "approved" });
    }
    setShowConfirmModal({ ...showConfirmModal, open: false });
  };

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-3xl overflow-hidden transition-all duration-300 ${isExpanded ? 'shadow-xl ring-1 ring-[var(--foreground)]/5' : 'hover:shadow-lg'}`}
    >
      {/* Main Row */}
      <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--foreground)]/5 flex items-center justify-center text-[var(--muted)]/40 relative">
             <User className="w-8 h-8" />
             {user.status === 'blocked' && (
               <div className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 rounded-full border-4 border-[var(--surface)] flex items-center justify-center">
                 <ShieldOff className="w-3 h-3 text-white" />
               </div>
             )}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-black tracking-tight text-[var(--foreground)]">{user.name}</h3>
              <StatusBadge status={user.status} />
            </div>
            <p className="text-sm font-bold text-[var(--muted)]/60 mt-1">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <RoleSelector 
            value={user.roles} 
            onChange={(roles) => onUpdate({ roles })}
            disabled={isUpdating}
          />

          <div className="h-10 w-[1px] bg-[var(--border)] hidden lg:block" />

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "סגור פירוט" : "ניהול שיוכים לתוכניות וקבוצות"}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
              isExpanded ? 'bg-[var(--foreground)] text-[var(--background)] shadow-lg' : 'bg-[var(--foreground)]/5 border border-[var(--border)] hover:bg-[var(--foreground)]/10'
            }`}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            ניהול שיוכים
          </button>

          {user.status === "pending" ? (
            <button
              onClick={() => setShowConfirmModal({ open: true, type: "approve" })}
              disabled={isUpdating}
              className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              אשר כניסה
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmModal({ 
                open: true, 
                type: user.status === "blocked" ? "unblock" : "block" 
              })}
              disabled={isUpdating}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black transition-all active:scale-95 disabled:opacity-50 border ${
                user.status === 'blocked' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20'
              }`}
            >
              {user.status === 'blocked' ? (
                <><ShieldCheck className="w-4 h-4" /> שחרר חסימה</>
              ) : (
                <><ShieldOff className="w-4 h-4" /> חסום גישה</>
              )}
            </button>
          )}

          {isUpdating && <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] ml-2" />}
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
                        disabled={isUpdating}
                        onClick={() => toggleItem(user.assignedProgramIds || [], p.id, 'assignedProgramIds')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all active:scale-95 ${
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
                        disabled={isUpdating}
                        onClick={() => toggleItem(user.assignedGroupIds || [], g.id, 'assignedGroupIds')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all active:scale-95 ${
                          isSelected ? 'bg-rose-500/10 border-rose-500/30 text-rose-600' : 'bg-transparent border-[var(--border)] opacity-40 hover:opacity-100'
                        }`}
                      >
                        {g.name}
                        {g.programId && <span className="mr-2 opacity-30 font-medium">({programs.find(p => p.id === g.programId)?.name})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={showConfirmModal.open}
        onClose={() => setShowConfirmModal({ ...showConfirmModal, open: false })}
        onConfirm={handleStatusChange}
        isLoading={isUpdating}
        type={showConfirmModal.type === "block" ? "danger" : "success"}
        title={
          showConfirmModal.type === "block" ? "חסימת גישת עובד" : 
          showConfirmModal.type === "unblock" ? "שחרור חסימה" : 
          "אישור כניסת עובד"
        }
        message={
          showConfirmModal.type === "block" ? `האם אתה בטוח שברצונך לחסום את הגישה של ${user.name}? העובד לא יוכל להתחבר למערכת.` :
          showConfirmModal.type === "unblock" ? `האם לאפשר ל-${user.name} גישה מחודשת למערכת?` :
          `האם לאשר את הצטרפותו של ${user.name} לצוות המרכז?`
        }
        confirmLabel={
          showConfirmModal.type === "block" ? "כן, חסום גישה" :
          showConfirmModal.type === "unblock" ? "כן, שחרר חסימה" :
          "כן, אשר הצטרפות"
        }
      />
    </div>
  );
}
