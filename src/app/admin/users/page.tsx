"use client";

import React, { useState, useEffect } from "react";
import { useAuth, UserRole, UserStatus } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { 
  Shield, UserPlus, ArrowRight, Search, Loader2, 
  ChevronDown, ChevronUp, Check, X, ShieldAlert, Users, Layers, Edit3
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/admin/users/StatusBadge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  status: UserStatus;
  assignedProgramIds: string[];
  assignedGroupIds: string[];
}

export interface Program { id: string; name: string }
export interface Group { id: string; name: string; programId?: string }

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "אדמין",
  manager: "מנהל/ת",
  social_worker: "עו״ס",
  instructor: "מדריך/ה",
  logistics: "לוגיסטיקה",
  employee: "עובד/ת",
  participant: "משתתף/ת"
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-purple-500/10 text-purple-600 border border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-600 border border-blue-500/20",
  social_worker: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
  instructor: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
  logistics: "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20",
  employee: "bg-zinc-500/10 text-zinc-600 border border-zinc-500/20",
  participant: "bg-teal-500/10 text-teal-600 border border-teal-500/20"
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    open: boolean;
    type: "block" | "unblock" | "approve";
    user: UserProfile | null;
  }>({ open: false, type: "block", user: null });

  const router = useRouter();
  const [activeRoleDropdownId, setActiveRoleDropdownId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  const handleSaveName = async (userId: string) => {
    if (!tempName.trim()) return;
    const finalName = tempName.trim();
    setEditingNameId(null);
    await updateUser(userId, { displayName: finalName, name: finalName });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [uSnap, pSnap, gSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), orderBy("email"))),
        getDocs(query(collection(db, "programs"), orderBy("name"))),
        getDocs(query(collection(db, "groups"), orderBy("name")))
      ]);

      setPrograms(pSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      
      const userList: UserProfile[] = uSnap.docs
        .filter(d => {
          const data = d.data();
          const roles = data.roles || (data.role ? [data.role] : []);
          return !roles.includes("participant") && data.role !== "participant";
        })
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            email: data.email || "",
            name: data.displayName || data.name || "ללא שם",
            roles: data.roles || (data.role ? [data.role] : ["employee"]),
            status: data.status || "pending",
            assignedProgramIds: data.assignedProgramIds || [],
            assignedGroupIds: data.assignedGroupIds || data.assignedGroups || []
          };
        });
      setUsers(userList);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userId: string, updates: any) => {
    setUpdatingId(userId);
    try {
      const finalUpdates = { ...updates };
      if (updates.roles && updates.roles.length > 0) {
        finalUpdates.role = updates.roles[0];
      }
      
      await updateDoc(doc(db, "users", userId), { ...finalUpdates, updatedAt: new Date() });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...finalUpdates } : u));
    } catch (error) {
      console.error("Error updating user:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleItem = async (list: string[], item: string, field: keyof UserProfile, userId: string) => {
    const newList = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
    await updateUser(userId, { [field]: newList });
  };

  const handleStatusChange = async () => {
    if (!showConfirmModal.user) return;
    const targetStatus = showConfirmModal.type === "block" ? "blocked" : "approved";
    await updateUser(showConfirmModal.user.id, { status: targetStatus });
    setShowConfirmModal({ open: false, type: "block", user: null });
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-8">
        
        {/* Ambient background glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/3 rounded-full blur-[120px]" />
        </div>

        <div className="max-w-6xl mx-auto space-y-6 relative">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/admin")}
                className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:bg-[var(--foreground)]/5 transition-colors shrink-0"
                title="חזרה ללוח בקרה"
              >
                <ArrowRight className="w-4 h-4 text-[var(--muted)]" />
              </button>
              <div>
                <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-500" />
                  ניהול צוות והרשאות
                </h1>
                <p className="text-[var(--muted)] text-[10px] font-bold uppercase tracking-wider mt-0.5">
                  רשימת עובדי המרכז, הקצאת תפקידים ושיוך לתוכניות וקבוצות
                </p>
              </div>
            </div>

            <div className="relative max-w-sm w-full">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]/50" />
              <input
                type="text"
                placeholder="חיפוש עובד לפי שם או אימייל..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl py-2.5 pr-10 pl-4 text-xs font-medium focus:outline-none focus:border-emerald-500/30 transition-colors"
              />
            </div>
          </div>

          {/* Loader */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3 opacity-30">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-widest">טוען נתוני צוות...</p>
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto min-h-[320px]">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--foreground)]/[0.02] text-[var(--muted)]/70 font-black">
                      <th className="py-3 px-4 font-black">שם</th>
                      <th className="py-3 px-4 font-black">אימייל</th>
                      <th className="py-3 px-4 font-black">תפקיד במערכת</th>
                      <th className="py-3 px-4 font-black">סטטוס</th>
                      <th className="py-3 px-4 font-black text-center">תוכניות וקבוצות</th>
                      <th className="py-3 px-4 font-black text-left">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredUsers.map((user, index) => {
                      const isUpdating = updatingId === user.id;
                      return (
                        <React.Fragment key={user.id}>
                          <tr className="hover:bg-[var(--foreground)]/[0.01] transition-colors">
                            {/* Name */}
                            <td className="py-3.5 px-4 font-black text-[var(--foreground)]">
                              <div className="flex items-center gap-2 group max-w-[200px]">
                                {editingNameId === user.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={tempName}
                                      onChange={(e) => setTempName(e.target.value)}
                                      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs font-black focus:outline-none focus:border-emerald-500/40 text-[var(--foreground)] max-w-[130px]"
                                      autoFocus
                                      onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                          await handleSaveName(user.id);
                                        } else if (e.key === "Escape") {
                                          setEditingNameId(null);
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveName(user.id)}
                                      className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer shrink-0"
                                      title="שמור"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingNameId(null)}
                                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer shrink-0"
                                      title="ביטול"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="truncate">{user.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNameId(user.id);
                                        setTempName(user.name);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--muted)] hover:text-emerald-500 hover:bg-[var(--foreground)]/5 rounded-md transition-all shrink-0 cursor-pointer"
                                      title="ערוך שם"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Email */}
                            <td className="py-3.5 px-4 text-[var(--muted)] font-medium">
                              {user.email}
                            </td>

                            {/* Role Multi-Select Dropdown */}
                            <td className="py-3.5 px-4">
                              <div className="relative">
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => setActiveRoleDropdownId(activeRoleDropdownId === user.id ? null : user.id)}
                                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:border-emerald-500/40 text-[var(--foreground)] flex items-center justify-between gap-2 shadow-sm cursor-pointer select-none min-w-[140px]"
                                >
                                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                                    {user.roles && user.roles.length > 0 ? (
                                      user.roles.map(r => (
                                        <span key={r} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${ROLE_COLORS[r]}`}>
                                          {ROLE_LABELS[r] || r}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-[var(--muted)]">ללא תפקיד</span>
                                    )}
                                  </div>
                                  <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                                </button>

                                {activeRoleDropdownId === user.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-40" 
                                      onClick={() => setActiveRoleDropdownId(null)}
                                    />
                                    <div className={`absolute right-0 w-48 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-2 z-50 space-y-1 animation-fade-in ${
                                      (index === filteredUsers.length - 1 && filteredUsers.length > 1) ||
                                      (index === filteredUsers.length - 2 && filteredUsers.length > 2)
                                        ? "bottom-full mb-2"
                                        : "top-full mt-2"
                                    }`}>
                                      <div className="px-3 py-1.5 text-[9px] font-black uppercase text-[var(--muted)] tracking-wider">
                                        בחר תפקידים:
                                      </div>
                                      {(["social_worker", "instructor", "logistics", "manager", "admin", "employee"] as UserRole[]).map(roleVal => {
                                        const isSelected = user.roles?.includes(roleVal);
                                        return (
                                          <div
                                            key={roleVal}
                                            onClick={async (e) => {
                                              e.preventDefault();
                                              const currentRoles = user.roles || [];
                                              const nextRoles = currentRoles.includes(roleVal)
                                                ? currentRoles.filter(r => r !== roleVal)
                                                : [...currentRoles, roleVal];
                                              if (nextRoles.length === 0) {
                                                alert("איש צוות חייב להחזיק לפחות בתפקיד אחד");
                                                return;
                                              }
                                              await updateUser(user.id, { roles: nextRoles });
                                            }}
                                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black cursor-pointer select-none transition-all ${
                                              isSelected 
                                                ? "bg-emerald-500/10 text-emerald-600" 
                                                : "hover:bg-[var(--foreground)]/5 text-[var(--foreground)]"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                readOnly
                                                className="rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500 w-3.5 h-3.5 ml-2 cursor-pointer"
                                              />
                                              {ROLE_LABELS[roleVal]}
                                            </div>
                                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              <StatusBadge status={user.status} />
                            </td>

                            {/* Program/Group assignments trigger button */}
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black transition-all ${
                                  expandedUserId === user.id
                                    ? "bg-[var(--foreground)] text-[var(--background)] border-transparent"
                                    : "bg-[var(--foreground)]/5 border-[var(--border)] hover:bg-[var(--foreground)]/10 text-[var(--foreground)]"
                                }`}
                              >
                                {expandedUserId === user.id ? "סגור שיוכים" : `שיוכים (${(user.assignedProgramIds?.length || 0) + (user.assignedGroupIds?.length || 0)})`}
                                {expandedUserId === user.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>

                            {/* Action Buttons */}
                            <td className="py-3.5 px-4 text-left">
                              <div className="inline-flex items-center gap-2">
                                {isUpdating ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                                ) : user.status === "pending" ? (
                                  <button
                                    onClick={() => setShowConfirmModal({ open: true, type: "approve", user })}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black transition-colors"
                                  >
                                    אשר גישה
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setShowConfirmModal({ 
                                      open: true, 
                                      type: user.status === "blocked" ? "unblock" : "block", 
                                      user 
                                    })}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-colors ${
                                      user.status === "blocked"
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20"
                                        : "bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20"
                                    }`}
                                  >
                                    {user.status === "blocked" ? "שחרר חסימה" : "חסום גישה"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded assignments drawer inside row */}
                          {expandedUserId === user.id && (
                            <tr className="bg-[var(--foreground)]/[0.01]">
                              <td colSpan={6} className="py-4 px-6 border-b border-[var(--border)]">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  
                                  {/* Programs */}
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-[var(--muted)] mr-1">
                                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                                      שיוך לתוכניות
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {programs.map(p => {
                                        const isSelected = user.assignedProgramIds?.includes(p.id);
                                        return (
                                          <button
                                            key={p.id}
                                            disabled={isUpdating}
                                            onClick={() => toggleItem(user.assignedProgramIds || [], p.id, 'assignedProgramIds', user.id)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                                              isSelected 
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 font-extrabold' 
                                                : 'bg-transparent border-[var(--border)] opacity-50 hover:opacity-100'
                                            }`}
                                          >
                                            {p.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Groups */}
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-[var(--muted)] mr-1">
                                      <Users className="w-3.5 h-3.5 text-rose-500" />
                                      שיוך לקבוצות
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {groups.map(g => {
                                        const isSelected = user.assignedGroupIds?.includes(g.id);
                                        return (
                                          <button
                                            key={g.id}
                                            disabled={isUpdating}
                                            onClick={() => toggleItem(user.assignedGroupIds || [], g.id, 'assignedGroupIds', user.id)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                                              isSelected 
                                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 font-extrabold' 
                                                : 'bg-transparent border-[var(--border)] opacity-50 hover:opacity-100'
                                            }`}
                                          >
                                            {g.name}
                                            {g.programId && (
                                              <span className="mr-1 opacity-40 font-medium">
                                                ({programs.find(p => p.id === g.programId)?.name})
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-20 text-[var(--muted)] font-medium italic">
                          לא נמצאו משתמשים התואמים לחיפוש
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action Confirm Modal */}
        <ConfirmModal 
          isOpen={showConfirmModal.open}
          onClose={() => setShowConfirmModal({ open: false, type: "block", user: null })}
          onConfirm={handleStatusChange}
          isLoading={updatingId === showConfirmModal.user?.id}
          type={showConfirmModal.type === "block" ? "danger" : "success"}
          title={
            showConfirmModal.type === "block" ? "חסימת גישת עובד" : 
            showConfirmModal.type === "unblock" ? "שחרור חסימה" : 
            "אישור כניסת עובד"
          }
          message={
            showConfirmModal.type === "block" ? `האם אתה בטוח שברצונך לחסום את הגישה של ${showConfirmModal.user?.name}? העובד לא יוכל להתחבר למערכת.` :
            showConfirmModal.type === "unblock" ? `האם לאפשר ל-${showConfirmModal.user?.name} גישה מחודשת למערכת?` :
            `האם לאשר את הצטרפותו של ${showConfirmModal.user?.name} לצוות המרכז?`
          }
          confirmLabel={
            showConfirmModal.type === "block" ? "כן, חסום גישה" :
            showConfirmModal.type === "unblock" ? "כן, שחרר חסימה" :
            "כן, אשר הצטרפות"
          }
        />

      </main>
    </RoleGuard>
  );
}
