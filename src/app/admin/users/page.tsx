"use client";

import { useAuth, UserRole, UserStatus } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { Shield, UserPlus, ArrowRight, Search, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { UserCard } from "@/components/admin/users/UserCard";

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

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

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
      
      const userList: UserProfile[] = uSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email || "",
          name: data.displayName || data.name || "ללא שם",
          roles: data.roles || (data.role ? [data.role] : ["employee"]),
          status: data.status || "approved",
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
      setUsers(users.map(u => u.id === userId ? { ...u, ...finalUpdates } : u));
    } catch (error) {
      console.error("Error updating user:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingUsers = filteredUsers.filter(u => u.status === "pending");
  const otherUsers = filteredUsers.filter(u => u.status !== "pending");

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-12">
        <header className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => router.push("/admin")}
              className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <ArrowRight className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                <Shield className="w-8 h-8 text-rose-500" />
                ניהול צוות והרשאות
              </h1>
              <p className="text-[var(--foreground)]/40 text-xs font-bold uppercase tracking-widest mt-1">אישור עובדים חדשים והקצאת תפקידים</p>
            </div>
          </div>

          <div className="relative max-w-md w-full">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              type="text"
              placeholder="חיפוש עובד לפי שם או אימייל..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-xl py-3.5 pr-12 pl-4 text-xs font-bold focus:outline-none focus:border-rose-500/20 transition-colors"
            />
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
            <Loader2 className="w-10 h-10 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">טוען צוות...</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-16">
            {pendingUsers.length > 0 && (
              <section className="space-y-6">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-3 mr-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  ממתינים לאישור ({pendingUsers.length})
                </h2>
                <div className="grid grid-cols-1 gap-6">
                  {pendingUsers.map((user, i) => (
                    <UserCard 
                      key={user.id} 
                      user={user} 
                      index={i}
                      updatingId={updatingId}
                      programs={programs}
                      groups={groups}
                      onUpdate={(updates) => updateUser(user.id, updates)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-6">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[var(--foreground)]/20 mr-2">
                צוות המרכז ({otherUsers.length})
              </h2>
              <div className="grid grid-cols-1 gap-6">
                {otherUsers.map((user, i) => (
                  <UserCard 
                    key={user.id} 
                    user={user} 
                    index={i}
                    updatingId={updatingId}
                    programs={programs}
                    groups={groups}
                    onUpdate={(updates) => updateUser(user.id, updates)}
                  />
                ))}
              </div>

              {filteredUsers.length === 0 && (
                <div className="text-center py-40 bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-[3rem] opacity-20">
                  <UserPlus className="w-12 h-12 text-[var(--foreground)]/10 mx-auto mb-4" />
                  <p className="text-sm font-bold italic">לא נמצאו משתמשים התואמים לחיפוש</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </RoleGuard>
  );
}
