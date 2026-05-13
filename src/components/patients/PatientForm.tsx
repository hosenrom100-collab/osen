"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { UserPlus, Calendar, CreditCard, User, ArrowRight, Loader2, CheckCircle, Briefcase } from "lucide-react";

export function PatientForm() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    hosenType: "upper" as "upper" | "lower",
    status: "active" as "active" | "finished" | "waiting_intake" | "waiting_start",
    assignedWorkerId: ""
  });
  const [socialWorkers, setSocialWorkers] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const fetchSocialWorkers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const workers: {id: string, name: string}[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role === "social_worker" || data.role === "admin" || data.role === "manager") {
            workers.push({ id: doc.id, name: data.name || data.email });
          }
        });
        setSocialWorkers(workers);
      } catch (error) {
        console.error("Error fetching social workers:", error);
      }
    };
    fetchSocialWorkers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await addDoc(collection(db, "patients"), {
        ...formData,
        fullName: `${formData.firstName} ${formData.lastName}`,
        createdAt: serverTimestamp(),
      });
      router.push("/patients");
    } catch (error) {
      console.error("Error adding patient:", error);
      alert("שגיאה בהוספת מטופל");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hosen Type Selection */}
        <div className="md:col-span-2 p-1 bg-slate-900/50 rounded-2xl border border-white/5 flex gap-1">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, hosenType: "upper" })}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${formData.hosenType === "upper" ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" : "text-slate-400 hover:text-white"}`}
          >
            חוסן עליון
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, hosenType: "lower" })}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${formData.hosenType === "lower" ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" : "text-slate-400 hover:text-white"}`}
          >
            חוסן תחתון
          </button>
        </div>

        {/* First Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <User className="w-4 h-4" /> שם פרטי
          </label>
          <input
            required
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white"
            placeholder="ישראל"
          />
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <User className="w-4 h-4" /> שם משפחה
          </label>
          <input
            required
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white"
            placeholder="ישראלי"
          />
        </div>

        {/* ID Number */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> תעודת זהות
          </label>
          <input
            required
            type="text"
            pattern="[0-9]*"
            maxLength={9}
            value={formData.idNumber}
            onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white"
            placeholder="000000000"
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> סטטוס מטופל
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white [color-scheme:dark]"
          >
            <option value="active">פעיל</option>
            <option value="waiting_intake">ממתין לאינטייק</option>
            <option value="waiting_start">ממתין להתחלה</option>
            <option value="finished">סיום</option>
          </select>
        </div>

        {/* Assigned Worker */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> עו״ס מטפל
          </label>
          <select
            value={formData.assignedWorkerId}
            onChange={(e) => setFormData({ ...formData, assignedWorkerId: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white [color-scheme:dark]"
          >
            <option value="">בחר עו״ס...</option>
            {socialWorkers.map(worker => (
              <option key={worker.id} value={worker.id}>{worker.name}</option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> תאריך התחלה
          </label>
          <input
            required
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white [color-scheme:dark]"
          />
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> תאריך סיום (משוער)
          </label>
          <input
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-all text-white [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="pt-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowRight className="w-4 h-4" /> ביטול וחזרה
        </button>
        
        <button
          disabled={loading}
          type="submit"
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-8 rounded-2xl hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <UserPlus className="w-5 h-5" />
          )}
          הוסף מטופל למערכת
        </button>
      </div>
    </form>
  );
}
