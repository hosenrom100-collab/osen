"use client";

import { useAuth, UserRole, UserStatus } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { Shield, UserPlus, ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { UserCard } from "@/components/admin/users/UserCard";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, "users"), orderBy("email"));
      const querySnapshot = await getDocs(q);
      const userList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        userList.push({
          id: doc.id,
          email: data.email || "",
          name: data.name || "ללא שם",
          role: data.role || "employee",
          status: data.status || "approved" // Default for old users
        });
      });
      setUsers(userList);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, "users", userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating role:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const updateUserStatus = async (userId: string, newStatus: UserStatus) => {
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, "users", userId), { status: newStatus });
      setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const sendNotification = async (userId: string) => {
    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: "בדיקת נוכחות",
          body: "נא לסמן נוכחות במערכת חוסן-קונקט"
        })
      });
      
      const data = await response.json();
      if (data.success) {
        alert("התראה נשלחה בהצלחה!");
      } else {
        alert("שגיאה בשליחת התראה: " + (data.error || "משתמש לא רשום להתראות"));
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      alert("שגיאה בתקשורת עם השרת");
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
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/admin")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-purple-400" />
                ניהול צוות והרשאות
              </h1>
              <p className="text-slate-400 text-sm">אישור עובדים חדשים והקצאת תפקידים</p>
            </div>
          </div>

          <div className="relative max-w-md w-full">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="חיפוש עובד לפי שם או אימייל..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pr-11 pl-4 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        ) : (
          <div className="space-y-10">
            {pendingUsers.length > 0 && (
              <section>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-400">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  ממתינים לאישור כניסה ({pendingUsers.length})
                </h2>
                <div className="space-y-4">
                  {pendingUsers.map((user, i) => (
                    <UserCard 
                      key={user.id} 
                      user={user} 
                      index={i}
                      updatingId={updatingId}
                      onUpdateRole={updateUserRole}
                      onUpdateStatus={updateUserStatus}
                      onSendNotification={sendNotification}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-lg font-bold mb-4 text-slate-300">
                צוות המרכז ({otherUsers.length})
              </h2>
              <div className="space-y-4">
                {otherUsers.map((user, i) => (
                  <UserCard 
                    key={user.id} 
                    user={user} 
                    index={i}
                    updatingId={updatingId}
                    onUpdateRole={updateUserRole}
                    onUpdateStatus={updateUserStatus}
                    onSendNotification={sendNotification}
                  />
                ))}
              </div>

              {filteredUsers.length === 0 && (
                <div className="text-center py-20 bg-white/5 border border-white/10 border-dashed rounded-3xl">
                  <UserPlus className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">לא נמצאו משתמשים התואמים לחיפוש</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </RoleGuard>
  );
}

