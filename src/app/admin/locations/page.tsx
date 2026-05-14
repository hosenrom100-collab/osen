"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { MapPin, Plus, Trash2, ArrowRight, Loader2, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Location {
  id: string;
  name: string;
  type: string;
}

export default function LocationManagementPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLocationName, setNewLocationName] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "locations"), orderBy("name"));
      const querySnapshot = await getDocs(q);
      const list: Location[] = [];
      querySnapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Location);
      });
      setLocations(list);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, "locations"), {
        name: newLocationName.trim(),
        createdAt: new Date().toISOString()
      });
      setLocations(prev => [...prev, { id: docRef.id, name: newLocationName.trim(), type: "standard" }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLocationName("");
    } catch (error) {
      console.error("Error adding location:", error);
      alert("שגיאה בהוספת מיקום");
    } finally {
      setAdding(false);
    }
  };

  const removeLocation = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק מיקום זה?")) return;
    
    try {
      await deleteDoc(doc(db, "locations", id));
      setLocations(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error("Error deleting location:", error);
      alert("שגיאה במחיקת מיקום");
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
              <MapPin className="w-6 h-6 text-amber-400" />
              ניהול מקומות פעילות
            </h1>
            <p className="text-slate-400 text-sm">הגדרה וניהול של המיקומים הפיזיים במרכז</p>
          </div>
        </header>

        <div className="max-w-2xl mx-auto">
          {/* Add Location Form */}
          <form onSubmit={addLocation} className="mb-10 flex gap-3">
            <div className="relative flex-1">
              <Home className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="שם המקום (למשל: סדנת קרמיקה, חדר מוזיקה...)"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              הוסף
            </button>
          </form>

          {/* Locations List */}
          {loading ? (
            <div className="flex justify-center p-20">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-3">
              <AnimatePresence>
                {locations.map((loc, index) => (
                  <motion.div
                    key={loc.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <span className="font-bold">{loc.name}</span>
                    </div>
                    <button
                      onClick={() => removeLocation(loc.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {locations.length === 0 && (
                <div className="text-center py-20 bg-white/5 border border-white/10 border-dashed rounded-[3rem]">
                  <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500">טרם הוגדרו מקומות פעילות</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
