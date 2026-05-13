"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, orderBy, doc, updateDoc, where } from "firebase/firestore";
import { Users, UserPlus, Search, ArrowRight, User, ArrowLeftRight, Loader2, Filter, Calendar, Clock, Check, X, Phone, UserCheck, ChevronLeft, MoreVertical, Briefcase, Plus, Layers, Edit3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export type PatientStatus = "active" | "finished" | "waiting_intake" | "waiting_start";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  startDate: string;
  endDate: string;
  hosenType?: string;
  status: PatientStatus;
  assignedWorkerId?: string;
}

interface Group {
  id: string;
  name: string;
}

export default function PatientsPage() {
  const { assignedGroups, isAdmin, role } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [socialWorkers, setSocialWorkers] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHosen, setFilterHosen] = useState<string>("all");
  const [filterWorker, setFilterWorker] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAll, setShowAll] = useState(isAdmin || assignedGroups.length === 0);

  const [selectedPatientForEdit, setSelectedPatientForEdit] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState<Partial<Patient>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPatientForAttendance, setSelectedPatientForAttendance] = useState<Patient | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<{date: string, status: string}[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchGroups();
    fetchSocialWorkers();
    fetchPatients();
  }, []);

  const fetchGroups = async () => {
    try {
      const q = query(collection(db, "groups"), orderBy("name"));
      const snap = await getDocs(q);
      const list: Group[] = [];
      snap.forEach(doc => list.push({ id: doc.id, name: doc.data().name }));
      setGroups(list);
    } catch (error) {
      console.error("Error fetching groups:", error);
    }
  };

  const fetchSocialWorkers = async () => {
    try {
      const q = query(collection(db, "users"));
      const querySnapshot = await getDocs(q);
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

  const fetchPatients = async () => {
    try {
      const q = query(collection(db, "patients"));
      const querySnapshot = await getDocs(q);
      const list: Patient[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        list.push({ 
          id: doc.id, 
          ...data,
          status: data.status || "active"
        } as Patient);
      });
      setPatients(list);
    } catch (error) {
      console.error("Error fetching patients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceHistory = async (patient: Patient) => {
    setSelectedPatientForAttendance(patient);
    setLoadingHistory(true);
    try {
      const q = query(collection(db, "attendance"), where("patientId", "==", patient.id), orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      const history: {date: string, status: string}[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        history.push({ date: data.date, status: data.status });
      });
      setAttendanceHistory(history);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const updatePatientStatus = async (patientId: string, newStatus: PatientStatus) => {
    try {
      await updateDoc(doc(db, "patients", patientId), { status: newStatus });
      setPatients(patients.map(p => p.id === patientId ? { ...p, status: newStatus } : p));
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleSaveQuickEdit = async () => {
    if (!selectedPatientForEdit) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "patients", selectedPatientForEdit.id), editForm);
      setPatients(patients.map(p => p.id === selectedPatientForEdit.id ? { ...p, ...editForm } : p));
      setSelectedPatientForEdit(null);
    } catch (error) {
      console.error("Error saving quick edit:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = patients.filter(p => {
    const matchesSearch = `${p.firstName || ""} ${p.lastName || ""}`.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.idNumber || "").includes(searchTerm);
    
    const isVisibleByGroup = showAll || assignedGroups.includes(p.hosenType || "") || 
                            groups.find(g => g.id === p.hosenType)?.name === groups.find(g => assignedGroups.includes(g.id))?.name;

    const matchesHosen = filterHosen === "all" || p.hosenType === filterHosen;
    const matchesWorker = filterWorker === "all" || p.assignedWorkerId === filterWorker;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    
    return matchesSearch && isVisibleByGroup && matchesHosen && matchesWorker && matchesStatus;
  });

  const getStatusStyle = (status: PatientStatus) => {
    switch (status) {
      case "active": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "finished": return "bg-slate-500/10 text-slate-400 border-slate-500/20";
      case "waiting_intake": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "waiting_start": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default: return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const statusLabels: Record<PatientStatus, string> = {
    active: "פעיל",
    finished: "סיום",
    waiting_intake: "ממתין לאינטייק",
    waiting_start: "ממתין להתחלה"
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-4 pb-24 md:p-8">
        <header className="max-w-7xl mx-auto mb-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-40 py-2 pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/")}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-3">
                  מצבת מטופלים
                </h1>
                <p className="text-slate-500 text-[10px] font-bold mt-1">
                  {filtered.length} מטופלים רשומים
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">

              {assignedGroups.length > 0 && (
                <button 
                  onClick={() => setShowAll(!showAll)}
                  className={`p-2.5 rounded-2xl border transition-all flex items-center gap-2 ${showAll ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-white/5 border-white/10 text-slate-400"}`}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="text-[10px] font-bold">{showAll ? "הצג רק שלי" : "הצג הכל"}</span>
                </button>
              )}
              <button 
                onClick={() => router.push("/patients/new")}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-bold transition-all text-sm shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                מטופל חדש
              </button>
            </div>
          </div>

          <div className="relative mb-6">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="חיפוש לפי שם או ת.ז..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-[1.25rem] py-3.5 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all shadow-xl shadow-black/20"
            />
          </div>

          {/* Filter Bar */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
            <select 
              value={filterHosen}
              onChange={(e) => setFilterHosen(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-400 focus:outline-none focus:border-blue-500 flex-shrink-0"
            >
              <option value="all">כל הקבוצות</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-400 focus:outline-none focus:border-blue-500 flex-shrink-0"
            >
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <select 
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-400 focus:outline-none focus:border-blue-500 flex-shrink-0"
            >
              <option value="all">כל העו״סים</option>
              {socialWorkers.map(worker => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-slate-500 text-xs animate-pulse">טוען רשימת מטופלים...</p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden overflow-x-auto shadow-2xl">
              <table className="w-full text-right border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">מטופל</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">ת.ז</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">קבוצה</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">עו״ס מטפל</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">סטטוס</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">תאריך התחלה</th>
                    <th className="p-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((patient) => (
                    <tr key={patient.id} className="border-b border-white/5 hover:bg-white/5 transition-all group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center">
                            <User className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-sm">{patient.firstName} {patient.lastName}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-xs">{patient.idNumber}</td>
                      <td className="p-4">
                        <span className="text-xs font-bold text-slate-400 bg-white/5 px-2 py-1 rounded-lg">
                          {groups.find(g => g.id === patient.hosenType || g.name === patient.hosenType)?.name || "לא הוגדר"}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-400">
                        {socialWorkers.find(w => w.id === patient.assignedWorkerId)?.name || "—"}
                      </td>
                      <td className="p-4">
                        <select
                          value={patient.status}
                          onChange={(e) => updatePatientStatus(patient.id, e.target.value as PatientStatus)}
                          className={`px-2 py-1 rounded-full border bg-transparent focus:outline-none cursor-pointer font-bold text-[9px] ${getStatusStyle(patient.status)}`}
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value} className="bg-slate-900 text-white">{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-xs text-slate-500">{patient.startDate}</td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => fetchAttendanceHistory(patient)}
                            className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedPatientForEdit(patient);
                              setEditForm({
                                firstName: patient.firstName,
                                lastName: patient.lastName,
                                idNumber: patient.idNumber,
                                hosenType: patient.hosenType,
                                assignedWorkerId: patient.assignedWorkerId,
                                status: patient.status
                              });
                            }}
                            className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => router.push(`/patients/${patient.id}`)}
                            className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-all"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <div className="col-span-full text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[2.5rem]">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-20" />
              <p className="text-slate-500 text-sm">לא נמצאו מטופלים רלוונטיים</p>
            </div>
          )}
        </div>

        {/* Attendance History Modal */}
        <AnimatePresence>
          {selectedPatientForAttendance && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedPatientForAttendance(null)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 sm:hidden" />
                
                <div className="p-8 border-b border-white/10 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">היסטוריית נוכחות</h2>
                    <p className="text-emerald-500 text-[10px] font-bold uppercase mt-1 tracking-wider">
                      {selectedPatientForAttendance.firstName} {selectedPatientForAttendance.lastName}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedPatientForAttendance(null)}
                    className="p-3 hover:bg-white/5 rounded-2xl transition-colors hidden sm:block"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar pb-12">
                  {loadingHistory ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      <p className="text-slate-500 text-[10px] font-bold uppercase">טוען נתונים...</p>
                    </div>
                  ) : attendanceHistory.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {attendanceHistory.map((record, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-[1.5rem]"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-bold text-sm tracking-tight">{record.date}</p>
                              <p className="text-[10px] text-slate-600 font-bold uppercase">רישום נוכחות</p>
                            </div>
                          </div>
                          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold ${
                            record.status === "present" 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}>
                            {record.status === "present" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {record.status === "present" ? "נוכח" : "נפקד"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20">
                      <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-800 opacity-50" />
                      <p className="text-slate-500 text-sm italic tracking-tight">לא נמצאו רישומי נוכחות למטופל זה</p>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-slate-900 border-t border-white/5 sticky bottom-0 flex gap-3">
                  <button 
                    onClick={() => setSelectedPatientForAttendance(null)}
                    className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-bold text-sm"
                  >
                    סגור חלונית
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          {selectedPatientForEdit && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedPatientForEdit(null)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 mb-2 sm:hidden" />
                
                <div className="p-8 border-b border-white/10 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-xl tracking-tight">עריכה מהירה</h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">עדכון פרטי {editForm.firstName} {editForm.lastName}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedPatientForEdit(null)}
                    className="p-3 bg-white/5 border border-white/10 rounded-2xl text-slate-500 hover:text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase px-1">שם פרטי</label>
                      <input 
                        value={editForm.firstName || ""}
                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase px-1">שם משפחה</label>
                      <input 
                        value={editForm.lastName || ""}
                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">תעודת זהות</label>
                    <input 
                      value={editForm.idNumber || ""}
                      onChange={(e) => setEditForm({ ...editForm, idNumber: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">קבוצה (חוסן)</label>
                    <select 
                      value={editForm.hosenType || ""}
                      onChange={(e) => setEditForm({ ...editForm, hosenType: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                    >
                      <option value="">בחר קבוצה</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">עו״ס מטפל</label>
                    <select 
                      value={editForm.assignedWorkerId || ""}
                      onChange={(e) => setEditForm({ ...editForm, assignedWorkerId: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                    >
                      <option value="">בחר עו״ס</option>
                      {socialWorkers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">סטטוס</label>
                    <select 
                      value={editForm.status || ""}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as PatientStatus })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:border-blue-500 transition-all outline-none"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-8 bg-slate-900 border-t border-white/10 flex gap-4">
                  <button 
                    onClick={() => setSelectedPatientForEdit(null)}
                    className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-bold text-sm"
                  >
                    ביטול
                  </button>
                  <button 
                    onClick={handleSaveQuickEdit}
                    disabled={isSaving}
                    className="flex-1 py-4 bg-blue-600 rounded-2xl hover:bg-blue-500 transition-all font-bold text-sm shadow-xl shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "שמור שינויים"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}

