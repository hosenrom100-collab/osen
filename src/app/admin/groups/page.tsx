"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, updateDoc } from "firebase/firestore";
import { Users, Plus, Trash2, ArrowRight, Loader2, Layers, Edit2, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Group {
  id: string;
  name: string;
  color?: string;
}

export default function GroupManagementPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "groups"), orderBy("name"));
      const querySnapshot = await getDocs(q);
      const list: Group[] = [];
      querySnapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Group);
      });
      
      // If no groups exist, seed with Upper/Lower as a starting point
      if (list.length === 0) {
        setGroups([
          { id: "upper-seed", name: "חוסן עליון" },
          { id: "lower-seed", name: "חוסן תחתון" }
        ]);
      } else {
        setGroups(list);
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
    } finally {
      setLoading(false);
    }
  };

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "groups"), {
        name: newGroupName.trim(),
        createdAt: new Date().toISOString()
      });
      setGroups(prev => [...prev, { id: docRef.id, name: newGroupName.trim() }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName("");
    } catch (error) {
      console.error("Error adding group:", error);
      alert("שגיאה בהוספת קבוצה");
    } finally {
      setAdding(false);
    }
  };

  const removeGroup = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק קבוצה זו? שים לב: מטופלים המשויכים לקבוצה זו יזדקקו לשיוך מחדש.")) return;
    
    try {
      await deleteDoc(doc(db, "groups", id));
      setGroups(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      console.error("Error deleting group:", error);
      alert("שגיאה במחיקת קבוצה");
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6">
        <header className="flex items-center gap-4 mb-10">
          <button 
            onClick={() => router.push("/admin")}
            className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Layers className="w-6 h-6 text-purple-400" />
              ניהול קבוצות / מסגרות
            </h1>
            <p className="text-slate-400 text-sm">הגדרת קבוצות הפעילות במרכז (לשעבר חוסן עליון/תחתון)</p>
          </div>
        </header>

        <div className="max-w-2xl mx-auto">
          {/* Add Group Form */}
          <form onSubmit={addGroup} className="mb-10 flex gap-3">
            <div className="relative flex-1">
              <Users className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="שם הקבוצה (למשל: קבוצת בוקר, חוסן צפון...)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              הוסף
            </button>
          </form>

          {/* Groups List */}
          {loading ? (
            <div className="flex justify-center p-20">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-3">
              <AnimatePresence>
                {groups.map((group, index) => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-2xl flex items-center justify-center">
                        <Layers className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="font-bold text-lg">{group.name}</span>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">מזהה: {group.id.slice(0, 8)}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeGroup(group.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {groups.length === 0 && (
                <div className="text-center py-20 bg-white/5 border border-white/10 border-dashed rounded-[3rem]">
                  <Layers className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">טרם הוגדרו קבוצות פעילות</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
