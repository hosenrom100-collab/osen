"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { 
  collection, getDocs, addDoc, deleteDoc, 
  doc, query, orderBy, updateDoc 
} from "firebase/firestore";
import { 
  MapPin, Plus, Trash2, ArrowRight, 
  Loader2, Home, Users, Check, X,
  Search
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Location {
  id: string;
  name: string;
  permanentStaffIds?: string[];
}

interface Staff {
  id: string;
  name: string;
}

export default function LocationManagementPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLocationName, setNewLocationName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lSnap, sSnap] = await Promise.all([
        getDocs(query(collection(db, "locations"), orderBy("name"))),
        getDocs(collection(db, "users"))
      ]);

      setLocations(lSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
      
      const staffList: Staff[] = [];
      sSnap.forEach(d => {
        const data = d.data();
        if (data.status === "approved") {
          staffList.push({ id: d.id, name: data.displayName || data.name || data.email });
        }
      });
      setStaff(staffList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error fetching data:", error);
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
        permanentStaffIds: [],
        createdAt: new Date().toISOString()
      });
      setLocations(prev => [...prev, { 
        id: docRef.id, 
        name: newLocationName.trim(),
        permanentStaffIds: [] 
      }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLocationName("");
    } catch (error) {
      console.error("Error adding location:", error);
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
    }
  };

  const toggleStaff = async (locId: string, staffId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return;

    const currentIds = loc.permanentStaffIds || [];
    const newIds = currentIds.includes(staffId) 
      ? currentIds.filter(id => id !== staffId)
      : [...currentIds, staffId];

    try {
      await updateDoc(doc(db, "locations", locId), { permanentStaffIds: newIds });
      setLocations(prev => prev.map(l => l.id === locId ? { ...l, permanentStaffIds: newIds } : l));
    } catch (error) {
      console.error("Error updating staff:", error);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-12">
        <header className="max-w-4xl mx-auto flex items-center gap-6 mb-16">
          <button 
            onClick={() => router.push("/admin")}
            className="p-3 bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl hover:bg-[var(--foreground)]/10 transition-colors"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <MapPin className="w-8 h-8 text-amber-500" />
              ניהול מקומות פעילות
            </h1>
            <p className="text-[var(--foreground)]/40 text-xs font-bold uppercase tracking-widest mt-1">הגדרה וניהול של המיקומים הפיזיים והצוות הקבוע</p>
          </div>
        </header>

        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* Add Location Form */}
          <form onSubmit={addLocation} className="flex gap-4 p-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] shadow-xl shadow-black/5">
            <div className="relative flex-1">
              <Home className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/20" />
              <input
                type="text"
                placeholder="שם המקום (למשל: סדנת קרמיקה, חדר מוזיקה...)"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                className="w-full bg-transparent border-none rounded-2xl py-4 pr-12 pl-4 text-sm font-bold focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-[1.5rem] text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20 disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              הוסף מיקום
            </button>
          </form>

          {/* Locations List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4 opacity-20">
              <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
              <p className="text-xs font-black uppercase tracking-widest">טוען מיקומים...</p>
            </div>
          ) : (
            <div className="grid gap-6">
              <AnimatePresence>
                {locations.map((loc, index) => (
                  <motion.div
                    key={loc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-[2.5rem] overflow-hidden transition-all ${editingLocId === loc.id ? 'ring-2 ring-amber-500/30' : ''}`}
                  >
                    <div className="p-6 md:p-8 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
                          <MapPin className="w-7 h-7" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black tracking-tight">{loc.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Users className="w-3.5 h-3.5 text-[var(--foreground)]/30" />
                            <span className="text-xs font-bold text-[var(--foreground)]/40">
                              {loc.permanentStaffIds?.length || 0} אנשי צוות קבועים
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditingLocId(editingLocId === loc.id ? null : loc.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            editingLocId === loc.id 
                              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' 
                              : 'bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10'
                          }`}
                        >
                          {editingLocId === loc.id ? <Check className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                          ניהול צוות
                        </button>
                        <button
                          onClick={() => removeLocation(loc.id)}
                          className="p-2.5 text-[var(--foreground)]/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Staff Selection */}
                    <AnimatePresence>
                      {editingLocId === loc.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-[var(--border)] bg-[var(--foreground)]/[0.01]"
                        >
                          <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-black uppercase tracking-widest text-[var(--foreground)]/30">בחר אנשי צוות קבועים למיקום זה:</h4>
                              <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--foreground)]/20" />
                                <input 
                                  type="text" 
                                  placeholder="חפש עובד..."
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  className="bg-[var(--background)] border border-[var(--border)] rounded-lg py-1.5 pr-8 pl-3 text-[10px] font-bold outline-none focus:border-amber-500/50"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {staff
                                .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(s => {
                                  const isSelected = loc.permanentStaffIds?.includes(s.id);
                                  return (
                                    <button
                                      key={s.id}
                                      onClick={() => toggleStaff(loc.id, s.id)}
                                      className={`flex items-center gap-2 p-3 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all ${
                                        isSelected 
                                          ? 'bg-amber-600 border-transparent text-white shadow-lg shadow-amber-600/20' 
                                          : 'bg-transparent border-[var(--border)] text-[var(--foreground)]/40 hover:border-[var(--foreground)]/20 hover:text-[var(--foreground)]/60'
                                      }`}
                                    >
                                      {isSelected ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 border border-current rounded-full" />}
                                      {s.name}
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>

              {locations.length === 0 && (
                <div className="text-center py-40 bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-[3rem] opacity-20">
                  <MapPin className="w-12 h-12 text-[var(--foreground)]/10 mx-auto mb-4" />
                  <p className="text-sm font-bold italic">טרם הוגדרו מקומות פעילות</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
