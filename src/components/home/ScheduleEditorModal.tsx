"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { 
  X, Plus, Trash2, Loader2, Save, Calendar, Clock, 
  FolderHeart, BookOpen, Layers, MapPin, User, ChevronDown, ChevronUp, Sparkles, Edit3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialDate: string;
}

interface ActivityItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  locationId: string;
  groupId: string;
  type: 'activity' | 'break' | 'meal' | 'swap' | 'custom';
  staffIds: string[];
}

interface ActivityTemplate {
  id: string;
  title: string;
  locationId: string;
  groupId: string;
  type: 'activity' | 'break' | 'meal' | 'swap' | 'custom';
  startTime?: string;
  endTime?: string;
  staffIds?: string[];
}

const ACT_TYPES = [
  { id: "activity", name: "פעילות", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { id: "break", name: "הפסקה", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  { id: "meal", name: "ארוחה", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "swap", name: "החלפה", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  { id: "custom", name: "אחר", color: "bg-rose-500/10 text-rose-500 border-rose-500/20" }
];

export function ScheduleEditorModal({ isOpen, onClose, onSaved, initialDate }: ScheduleEditorModalProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Metadata loaders
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  // Repositories
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [skeleton, setSkeleton] = useState<ActivityTemplate[]>([]);
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  // Tab or sections management
  const [activeTab, setActiveTab] = useState<'schedule' | 'templates' | 'skeleton' | 'locations'>('schedule');

  // Expanded staff selector for specific activities
  const [expandedStaffSelect, setExpandedStaffSelect] = useState<string | null>(null);

  // New location management states
  const [newLocationName, setNewLocationName] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");

  // Edit template states
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplate | null>(null);

  // Template Form State
  const [newTemplate, setNewTemplate] = useState<Omit<ActivityTemplate, "id">>({
    title: "",
    locationId: "",
    groupId: "all",
    type: "activity",
    startTime: "09:00",
    endTime: "10:00",
    staffIds: []
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(initialDate);
      fetchMetadata();
      fetchSchedule(initialDate);
      fetchTemplatesAndSkeleton();
    }
  }, [isOpen, initialDate]);

  useEffect(() => {
    if (isOpen) {
      fetchSchedule(selectedDate);
    }
  }, [selectedDate]);

  const fetchMetadata = async () => {
    try {
      const [locsSnap, groupsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "locations")),
        getDocs(collection(db, "groups")),
        getDocs(collection(db, "users"))
      ]);

      setLocations(locsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setGroups(groupsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));

      const staffList: any[] = [];
      usersSnap.forEach(d => {
        const udata = d.data();
        const roles = udata.roles || (udata.role ? [udata.role] : []);
        const isStaff = !roles.includes("participant") && udata.role !== "participant";
        if (isStaff && (udata.status === "approved" || udata.status === "active")) {
          staffList.push({ id: d.id, name: udata.name || udata.displayName || udata.email || "עובד" });
        }
      });
      setStaff(staffList);
    } catch (err) {
      console.error("Error loading metadata:", err);
    }
  };

  const fetchSchedule = async (dateStr: string) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "schedules", dateStr));
      if (snap.exists()) {
        const data = snap.data();
        const acts = (data.activities || []).map((a: any) => ({
          id: a.id || Math.random().toString(36).substring(2, 9),
          title: a.title || a.activityType || "",
          startTime: a.startTime || "",
          endTime: a.endTime || "",
          locationId: a.locationId || "",
          groupId: a.groupId || a.hosenType || "all",
          type: a.type || "activity",
          staffIds: a.staffIds || (a.instructorId ? [a.instructorId] : [])
        }));
        setActivities(acts.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)));
      } else {
        setActivities([]);
      }
    } catch (err) {
      console.error("Error fetching schedule:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplatesAndSkeleton = async () => {
    try {
      const [repoSnap, skelSnap] = await Promise.all([
        getDoc(doc(db, "settings", "activity_templates")),
        getDoc(doc(db, "settings", "schedule_skeleton"))
      ]);

      if (repoSnap.exists()) {
        setTemplates(repoSnap.data().templates || []);
      }
      if (skelSnap.exists()) {
        setSkeleton(skelSnap.data().activities || []);
      }
    } catch (err) {
      console.error("Error fetching templates and skeleton:", err);
    }
  };

  // ── Actions for Schedule ──

  const handleAddFreeText = () => {
    const newAct: ActivityItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: "",
      startTime: "09:00",
      endTime: "10:00",
      locationId: locations[0]?.id || "",
      groupId: "all",
      type: "activity",
      staffIds: []
    };
    setActivities(prev => [...prev, newAct].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const handleAddFromTemplate = (tmpl: ActivityTemplate) => {
    const newAct: ActivityItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: tmpl.title,
      startTime: tmpl.startTime || "09:00",
      endTime: tmpl.endTime || "10:00",
      locationId: tmpl.locationId || "",
      groupId: tmpl.groupId || "all",
      type: tmpl.type || "activity",
      staffIds: tmpl.staffIds || []
    };
    setActivities(prev => [...prev, newAct].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    setShowRepoSelector(false);
  };

  const handleLoadSkeleton = () => {
    if (skeleton.length === 0) {
      alert("השלד הקבוע ריק. הגדר פעילויות בשלד הקבוע תחילה.");
      return;
    }
    if (activities.length > 0 && !window.confirm("טעינת השלד הקבוע תמחק את הפעילויות הנוכחיות ליום זה. להמשיך?")) {
      return;
    }

    const loadedActs: ActivityItem[] = skeleton.map(s => ({
      id: Math.random().toString(36).substring(2, 9),
      title: s.title,
      startTime: s.startTime || "08:30",
      endTime: s.endTime || "09:00",
      locationId: s.locationId || "",
      groupId: s.groupId || "all",
      type: s.type || "activity",
      staffIds: s.staffIds || []
    }));

    setActivities(loadedActs.sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  const getDayName = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    return dayNames[dayOfWeek] || "";
  };

  const handleLoadFromPreviousSameDayOfWeek = async () => {
    if (activities.length > 0 && !window.confirm("טעינת הלו\"ז משבוע שעבר תמחוק את הפעילויות הנוכחיות ליום זה. להמשיך?")) {
      return;
    }
    setLoading(true);
    try {
      const dateObj = new Date(selectedDate);
      const dayOfWeekName = getDayName(selectedDate);
      let foundActivities: ActivityItem[] = [];

      // Check up to 5 weeks back
      for (let i = 1; i <= 5; i++) {
        const prevDate = new Date(dateObj);
        prevDate.setDate(prevDate.getDate() - (i * 7));
        const prevDateStr = prevDate.toISOString().split("T")[0];

        const docSnap = await getDoc(doc(db, "schedules", prevDateStr));
        if (docSnap.exists() && docSnap.data().activities?.length > 0) {
          foundActivities = docSnap.data().activities;
          break;
        }
      }

      if (foundActivities.length > 0) {
        const newActs = foundActivities.map(act => ({
          ...act,
          id: Math.random().toString(36).substring(2, 9)
        }));
        setActivities(newActs.sort((a, b) => a.startTime.localeCompare(b.startTime)));
      } else {
        alert(`לא נמצא לו"ז פעיל ב-5 השבועות האחרונים עבור ימי ${dayOfWeekName}`);
      }
    } catch (err) {
      console.error("Error loading previous same day:", err);
      alert("שגיאה בטעינת לו\"ז מיום קודם");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromWeeklySkeleton = async () => {
    if (activities.length > 0 && !window.confirm("טעינת השלד השבועי תמחוק את הפעילויות הנוכחיות ליום זה. להמשיך?")) {
      return;
    }
    setLoading(true);
    try {
      const dateObj = new Date(selectedDate);
      const dayOfWeek = dateObj.getDay(); // 0-6
      const dayOfWeekName = getDayName(selectedDate);

      const docSnap = await getDoc(doc(db, "settings", "weekly_skeleton"));
      if (docSnap.exists()) {
        const weeklyData = docSnap.data().schedules || {};
        const dayActivities = weeklyData[dayOfWeek] || [];
        if (dayActivities.length > 0) {
          const newActs: ActivityItem[] = dayActivities.map((act: any) => ({
            id: Math.random().toString(36).substring(2, 9),
            title: act.title || "",
            startTime: act.startTime || "09:00",
            endTime: act.endTime || "10:00",
            locationId: act.locationId || "",
            groupId: act.groupId || "all",
            type: act.type || "activity",
            staffIds: act.staffIds || []
          }));
          setActivities(newActs.sort((a, b) => a.startTime.localeCompare(b.startTime)));
        } else {
          alert(`טרם הוגדר שלד קבוע עבור ימי ${dayOfWeekName}. באפשרותך לבנות לו"ז ולשמור אותו כשלד קבוע ליום זה.`);
        }
      } else {
        alert(`טרם הוגדר שלד קבוע עבור ימי ${dayOfWeekName}. באפשרותך לבנות לו"ז ולשמור אותו כשלד קבוע ליום זה.`);
      }
    } catch (err) {
      console.error("Error loading weekly skeleton:", err);
      alert("שגיאה בטעינת שלד שבועי");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToWeeklySkeleton = async () => {
    if (activities.length === 0) {
      alert("אין פעילויות בלו\"ז הנוכחי לשמירה");
      return;
    }
    const dayOfWeekName = getDayName(selectedDate);
    if (!confirm(`האם אתה בטוח שברצונך לשמור את הלו"ז הנוכחי כברירת המחדל הקבועה עבור ימי ${dayOfWeekName}?`)) return;

    try {
      const dateObj = new Date(selectedDate);
      const dayOfWeek = dateObj.getDay(); // 0-6

      const templateActs = activities.map(act => ({
        title: act.title,
        startTime: act.startTime,
        endTime: act.endTime,
        locationId: act.locationId,
        groupId: act.groupId,
        type: act.type,
        staffIds: act.staffIds
      }));

      const docSnap = await getDoc(doc(db, "settings", "weekly_skeleton"));
      let currentSchedules = {};
      if (docSnap.exists()) {
        currentSchedules = docSnap.data().schedules || {};
      }

      const updatedSchedules = {
        ...currentSchedules,
        [dayOfWeek]: templateActs
      };

      await setDoc(doc(db, "settings", "weekly_skeleton"), { schedules: updatedSchedules }, { merge: true });
      alert(`הלו"ז נשמר בהצלחה כשלד קבוע עבור ימי ${dayOfWeekName}`);
    } catch (err) {
      console.error("Error saving weekly skeleton:", err);
      alert("שגיאה בשמירת שלד שבועי");
    }
  };

  const handleUpdateActivity = (id: string, updates: Partial<ActivityItem>) => {
    setActivities(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      if (updates.startTime) {
        return next.sort((a, b) => a.startTime.localeCompare(b.startTime));
      }
      return next;
    });
  };

  const handleDeleteActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
  };

  const toggleStaffInActivity = (actId: string, staffId: string) => {
    const act = activities.find(a => a.id === actId);
    if (!act) return;
    const currentStaff = act.staffIds || [];
    const newStaff = currentStaff.includes(staffId)
      ? currentStaff.filter(id => id !== staffId)
      : [...currentStaff, staffId];
    handleUpdateActivity(actId, { staffIds: newStaff });
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      const schedRef = doc(db, "schedules", selectedDate);
      const snap = await getDoc(schedRef);

      const dbActivities = activities.map(a => ({
        id: a.id,
        title: a.title,
        startTime: a.startTime,
        endTime: a.endTime,
        locationId: a.locationId,
        groupId: a.groupId,
        type: a.type,
        staffIds: a.staffIds
      }));

      if (snap.exists()) {
        await setDoc(schedRef, { activities: dbActivities }, { merge: true });
      } else {
        await setDoc(schedRef, {
          activities: dbActivities,
          dutyInstructorId: "",
          updatedAt: new Date().toISOString()
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Error saving schedule:", err);
      alert("שגיאה בשמירת הלו\"ז");
    } finally {
      setSaving(false);
    }
  };

  // ── Repository Templates Management ──

  const handleAddTemplateToRepo = async () => {
    if (!newTemplate.title.trim()) {
      alert("נא להזין שם לפעילות");
      return;
    }

    const newTmpl: ActivityTemplate = {
      id: Math.random().toString(36).substring(2, 9),
      ...newTemplate
    };

    const updatedTemplates = [...templates, newTmpl];
    setTemplates(updatedTemplates);

    try {
      await setDoc(doc(db, "settings", "activity_templates"), { templates: updatedTemplates }, { merge: true });
      // Reset form
      setNewTemplate({
        title: "",
        locationId: locations[0]?.id || "",
        groupId: "all",
        type: "activity",
        startTime: "09:00",
        endTime: "10:00",
        staffIds: []
      });
    } catch (err) {
      console.error("Error saving template to repository:", err);
      alert("שגיאה בשמירת הפעילות במאגר");
    }
  };

  const handleDeleteTemplateFromRepo = async (tmplId: string) => {
    const updated = templates.filter(t => t.id !== tmplId);
    setTemplates(updated);
    try {
      await setDoc(doc(db, "settings", "activity_templates"), { templates: updated }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTemplateInRepo = async () => {
    if (!editingTemplate || !editingTemplate.title.trim()) return;
    const updated = templates.map(t => t.id === editingTemplate.id ? editingTemplate : t);
    setTemplates(updated);
    try {
      await setDoc(doc(db, "settings", "activity_templates"), { templates: updated }, { merge: true });
      setEditingTemplateId(null);
      setEditingTemplate(null);
    } catch (err) {
      console.error(err);
      alert("שגיאה בעדכון הפעילות");
    }
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) {
      alert("נא להזין שם למיקום");
      return;
    }
    try {
      const newDocRef = doc(collection(db, "locations"));
      await setDoc(newDocRef, { name: newLocationName.trim() });
      setNewLocationName("");
      fetchMetadata();
    } catch (err) {
      console.error("Error adding location:", err);
      alert("שגיאה בהוספת המיקום");
    }
  };

  const handleUpdateLocation = async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      await setDoc(doc(db, "locations", id), { name: name.trim() }, { merge: true });
      setEditingLocationId(null);
      fetchMetadata();
    } catch (err) {
      console.error("Error updating location:", err);
      alert("שגיאה בעדכון המיקום");
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("האם למחוק מיקום זה? פעולה זו עלולה להשפיע על פעילויות קיימות.")) return;
    try {
      await deleteDoc(doc(db, "locations", id));
      fetchMetadata();
    } catch (err) {
      console.error("Error deleting location:", err);
      alert("שגיאה במחיקת המיקום");
    }
  };

  // ── Skeleton Management ──

  const handleAddActivityToSkeleton = async () => {
    if (!newTemplate.title.trim()) {
      alert("נא להזין שם לפעילות");
      return;
    }

    const newSkel: ActivityTemplate = {
      id: Math.random().toString(36).substring(2, 9),
      ...newTemplate
    };

    const updatedSkeleton = [...skeleton, newSkel].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    setSkeleton(updatedSkeleton);

    try {
      await setDoc(doc(db, "settings", "schedule_skeleton"), { activities: updatedSkeleton }, { merge: true });
      // Reset
      setNewTemplate({
        title: "",
        locationId: locations[0]?.id || "",
        groupId: "all",
        type: "activity",
        startTime: "09:00",
        endTime: "10:00",
        staffIds: []
      });
    } catch (err) {
      console.error(err);
      alert("שגיאה בשמירת הפעילות בשלד הקבוע");
    }
  };

  const handleDeleteSkeletonActivity = async (skelId: string) => {
    const updated = skeleton.filter(s => s.id !== skelId);
    setSkeleton(updated);
    try {
      await setDoc(doc(db, "settings", "schedule_skeleton"), { activities: updated }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal content */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-[var(--surface)] border border-[var(--border)] w-full max-w-4xl h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden text-right"
        >
          {/* Header */}
          <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-l from-violet-600/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black">ניהול סדר יום ולו״ז יומי</h2>
                <p className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-widest mt-0.5">Schedule & Activity Manager</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--foreground)]/5 text-[var(--muted)] hover:bg-[var(--foreground)]/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation tabs */}
          <div className="flex border-b border-[var(--border)] px-6 bg-[var(--foreground)]/2 gap-1.5 py-2">
            {[
              { id: "schedule", name: "לו״ז יומי", icon: Calendar },
              { id: "templates", name: "מאגר פעילויות", icon: BookOpen },
              { id: "skeleton", name: "שלד קבוע", icon: FolderHeart },
              { id: "locations", name: "מאגר מיקומים", icon: MapPin }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                    activeTab === tab.id
                      ? "bg-violet-600 text-white shadow-md shadow-violet-600/15"
                      : "text-[var(--muted)] hover:bg-[var(--foreground)]/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Main Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* TAB 1: DAILY SCHEDULE */}
            {activeTab === "schedule" && (
              <div className="space-y-6">
                
                {/* Date Selection and Top Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[var(--foreground)]/5 border border-[var(--border)] p-4 rounded-3xl">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-[var(--muted)] shrink-0">תאריך לעריכה:</span>
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-[var(--surface)] border border-[var(--border)] text-xs font-black rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={handleLoadSkeleton}
                      className="px-3.5 py-2 rounded-xl border border-violet-500/20 bg-violet-500/5 text-violet-500 hover:bg-violet-500/10 text-xs font-black transition-all"
                    >
                      טען שלד קבוע
                    </button>
                    <button 
                      onClick={() => setShowRepoSelector(!showRepoSelector)}
                      className="px-3.5 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10 text-xs font-black transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      הוסף ממאגר פעילויות
                    </button>
                    <button 
                      onClick={handleAddFreeText}
                      className="px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--foreground)]/5 text-xs font-black transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-400" />
                      רישום חופשי (ריק)
                    </button>
                  </div>
                </div>

                {/* Weekly Template / Day-of-week Actions */}
                <div className="flex flex-wrap items-center justify-start gap-2 bg-violet-500/[0.02] border border-violet-500/10 p-3 rounded-2xl -mt-4">
                  <span className="text-[10px] font-black text-violet-500 shrink-0 ml-2">ימי {getDayName(selectedDate)}:</span>
                  <button 
                    onClick={handleLoadFromWeeklySkeleton}
                    className="px-2.5 py-1.5 rounded-lg border border-violet-500/10 bg-white hover:bg-violet-50 text-violet-600 text-[10px] font-black transition-all shadow-sm cursor-pointer"
                  >
                    טען שלד קבוע ליום {getDayName(selectedDate)}
                  </button>
                  <button 
                    onClick={handleLoadFromPreviousSameDayOfWeek}
                    className="px-2.5 py-1.5 rounded-lg border border-violet-500/10 bg-white hover:bg-violet-50 text-violet-600 text-[10px] font-black transition-all shadow-sm cursor-pointer"
                  >
                    טען מיום {getDayName(selectedDate)} שעבר
                  </button>
                  <button 
                    onClick={handleSaveToWeeklySkeleton}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 text-[10px] font-black transition-all shadow-sm cursor-pointer"
                  >
                    שמור לו"ז זה כשלד קבוע ליום {getDayName(selectedDate)}
                  </button>
                </div>

                {/* Templates Selector Dropdown */}
                {showRepoSelector && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    className="border border-[var(--border)] rounded-3xl p-4 bg-[var(--surface-raised)] space-y-3"
                  >
                    <h3 className="text-xs font-black text-slate-700">בחר פעילות להוספה מתוך המאגר:</h3>
                    {templates.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] italic">המאגר ריק. תוכל להוסיף פעילויות למאגר בלשונית "מאגר פעילויות".</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {templates.map(tmpl => (
                          <button
                            key={tmpl.id}
                            onClick={() => handleAddFromTemplate(tmpl)}
                            className="p-3 text-right bg-[var(--surface)] hover:bg-[var(--foreground)]/5 border border-[var(--border)] rounded-2xl transition-all hover:scale-[1.01] active:scale-95 flex flex-col justify-between h-20"
                          >
                            <span className="text-xs font-black text-[var(--foreground)] line-clamp-1">{tmpl.title}</span>
                            <span className="text-[9px] text-[var(--muted)] font-medium">
                              {ACT_TYPES.find(t => t.id === tmpl.type)?.name || "פעילות"} · {locations.find(l => l.id === tmpl.locationId)?.name || "ללא מיקום"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Activities List */}
                <div className="space-y-4">
                  {loading ? (
                    <div className="py-20 flex flex-col items-center gap-2 opacity-55">
                      <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
                      <span className="text-xs font-bold">טוען את נתוני הלו״ז...</span>
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-[var(--border)] rounded-[2.5rem] bg-[var(--surface-raised)] space-y-3">
                      <Calendar className="w-10 h-10 text-[var(--muted)] mx-auto opacity-30 stroke-1" />
                      <p className="text-xs font-black">אין פעילויות מוגדרות ליום זה</p>
                      <p className="text-[10px] text-[var(--muted)] font-bold">לחץ על כפתור טעינת שלד קבוע או הוסף פעילות חדשה למעלה</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((act) => (
                        <div 
                          key={act.id}
                          className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl p-5 relative group/item hover:border-violet-500/20 transition-all shadow-sm"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_120px_120px_1fr_40px] gap-4 items-center">
                            
                            {/* Times */}
                            <div className="flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-2xl px-2 py-1">
                              <input 
                                type="text"
                                placeholder="00:00"
                                value={act.startTime}
                                onChange={(e) => handleUpdateActivity(act.id, { startTime: e.target.value })}
                                className="w-12 text-center bg-transparent border-none text-xs font-black outline-none focus:text-violet-500"
                              />
                              <span className="text-[10px] text-[var(--muted)] font-bold">-</span>
                              <input 
                                type="text"
                                placeholder="00:00"
                                value={act.endTime}
                                onChange={(e) => handleUpdateActivity(act.id, { endTime: e.target.value })}
                                className="w-12 text-center bg-transparent border-none text-xs font-black outline-none focus:text-violet-500"
                              />
                            </div>

                            {/* Title */}
                            <div>
                              <input 
                                type="text"
                                placeholder="שם הפעילות..."
                                value={act.title}
                                onChange={(e) => handleUpdateActivity(act.id, { title: e.target.value })}
                                className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                              />
                            </div>

                            {/* Type */}
                            <div>
                              <select
                                value={act.type}
                                onChange={(e) => handleUpdateActivity(act.id, { type: e.target.value as any })}
                                className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                              >
                                {ACT_TYPES.map(t => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Location */}
                            <div>
                              <select
                                value={act.locationId}
                                onChange={(e) => handleUpdateActivity(act.id, { locationId: e.target.value })}
                                className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                              >
                                <option value="">-- מיקום --</option>
                                {locations.map(l => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Group */}
                            <div>
                              <select
                                value={act.groupId}
                                onChange={(e) => handleUpdateActivity(act.id, { groupId: e.target.value })}
                                className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                              >
                                <option value="all">כלל המשתתפים</option>
                                <option value="staff_only">צוות בלבד</option>
                                {groups.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Delete */}
                            <div className="flex justify-center">
                              <button 
                                onClick={() => handleDeleteActivity(act.id)}
                                className="w-10 h-10 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition-all active:scale-90 shadow-sm border border-rose-500/10"
                                title="מחק פעילות"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                          </div>

                          {/* Staff selection inline */}
                          <div className="mt-3 pt-3 border-t border-[var(--border)]/40 flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black text-[var(--muted)] flex items-center gap-1 shrink-0">
                              <User className="w-3 h-3" />
                              צוות משויך:
                            </span>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {staff.map(member => {
                                const isAssigned = act.staffIds?.includes(member.id);
                                return (
                                  <button
                                    key={member.id}
                                    onClick={() => toggleStaffInActivity(act.id, member.id)}
                                    className={`px-3 py-1 rounded-xl text-[10px] font-bold border transition-all active:scale-95 ${
                                      isAssigned
                                        ? "bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/10"
                                        : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                                    }`}
                                  >
                                    {member.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Save */}
                <div className="pt-4 border-t border-[var(--border)] flex justify-end">
                  <button
                    onClick={handleSaveSchedule}
                    disabled={saving || loading}
                    className="flex items-center gap-2 px-6 py-3.5 bg-violet-600 border border-violet-500 hover:bg-violet-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-violet-600/20 transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    שמור לו״ז יומי
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: TEMPLATE REPOSITORY */}
            {activeTab === "templates" && (
              <div className="space-y-6">
                
                {/* Add new template to repo form */}
                <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-violet-500">
                    <Sparkles className="w-4 h-4" />
                    <h3 className="text-xs font-black">הוספת תבנית חדשה למאגר הפעילויות</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">שם הפעילות</label>
                      <input 
                        type="text"
                        placeholder="למשל: סדנת יוגה"
                        value={newTemplate.title}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2.5 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">סוג פעילות</label>
                      <select
                        value={newTemplate.type}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, type: e.target.value as any }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2.5 focus:outline-none focus:border-violet-500/50"
                      >
                        {ACT_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">מיקום ברירת מחדל</label>
                      <select
                        value={newTemplate.locationId}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, locationId: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2.5 focus:outline-none focus:border-violet-500/50"
                      >
                        <option value="">-- בחר מיקום --</option>
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleAddTemplateToRepo}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 border border-emerald-500 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/10 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף למאגר
                    </button>
                  </div>
                </div>

                {/* Templates List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-700">תבניות פעילות במאגר:</h3>
                  {templates.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] italic text-center py-10 bg-[var(--foreground)]/2 rounded-2xl border">אין עדיין תבניות במאגר. השתמש בטופס למעלה להוספה.</p>
                  ) : (
                    <div className="border border-[var(--border)] rounded-[2rem] overflow-hidden divide-y divide-[var(--border)] bg-[var(--surface)]">
                      {templates.map(tmpl => {
                        const isEditing = editingTemplateId === tmpl.id;
                        return (
                          <div key={tmpl.id} className="p-4 flex flex-col gap-3 hover:bg-[var(--foreground)]/[0.01]">
                            {isEditing && editingTemplate ? (
                              <div className="space-y-3 bg-[var(--foreground)]/[0.02] border border-[var(--border)] p-3 rounded-2xl">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[9px] font-bold text-[var(--muted)] mb-1">שם הפעילות</label>
                                    <input
                                      type="text"
                                      value={editingTemplate.title}
                                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, title: e.target.value } : null)}
                                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-[var(--muted)] mb-1">סוג פעילות</label>
                                    <select
                                      value={editingTemplate.type}
                                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, type: e.target.value as any } : null)}
                                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none"
                                    >
                                      {ACT_TYPES.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-[var(--muted)] mb-1">מיקום ברירת מחדל</label>
                                    <select
                                      value={editingTemplate.locationId}
                                      onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, locationId: e.target.value } : null)}
                                      className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none"
                                    >
                                      <option value="">-- בחר מיקום --</option>
                                      {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    onClick={() => {
                                      setEditingTemplateId(null);
                                      setEditingTemplate(null);
                                    }}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black transition-all border border-slate-200"
                                  >
                                    ביטול
                                  </button>
                                  <button
                                    onClick={handleUpdateTemplateInRepo}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black transition-all border border-emerald-500 shadow-sm"
                                  >
                                    עדכן תבנית
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-bold shrink-0">
                                    {ACT_TYPES.find(t => t.id === tmpl.type)?.name.charAt(0) || "פ"}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-[var(--foreground)]">{tmpl.title}</p>
                                    <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">
                                      סוג: {ACT_TYPES.find(t => t.id === tmpl.type)?.name} | מיקום: {locations.find(l => l.id === tmpl.locationId)?.name || "לא הוגדר"}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingTemplateId(tmpl.id);
                                      setEditingTemplate(tmpl);
                                    }}
                                    className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 flex items-center justify-center border border-violet-500/10 transition-all"
                                    title="ערוך פעילות"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplateFromRepo(tmpl.id)}
                                    className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 flex items-center justify-center border border-rose-500/10 transition-all"
                                    title="מחק פעילות"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 3: DAILY FIXED SKELETON */}
            {activeTab === "skeleton" && (
              <div className="space-y-6">
                
                {/* Form to add skeleton activity */}
                <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-violet-500">
                    <FolderHeart className="w-4 h-4" />
                    <h3 className="text-xs font-black">הוספת פעילות קבועה לשלד היומי</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">שם הפעילות (קבועה)</label>
                      <input 
                        type="text"
                        placeholder="למשל: מפגש בוקר קבוע"
                        value={newTemplate.title}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">שעת התחלה</label>
                      <input 
                        type="text"
                        placeholder="08:30"
                        value={newTemplate.startTime}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50 text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">שעת סיום</label>
                      <input 
                        type="text"
                        placeholder="09:00"
                        value={newTemplate.endTime}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50 text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">מיקום ברירת מחדל</label>
                      <select
                        value={newTemplate.locationId}
                        onChange={(e) => setNewTemplate(prev => ({ ...prev, locationId: e.target.value }))}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2 focus:outline-none focus:border-violet-500/50"
                      >
                        <option value="">-- בחר מיקום --</option>
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleAddActivityToSkeleton}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 border border-violet-500 hover:bg-violet-500 text-white rounded-xl text-xs font-black shadow-md shadow-violet-600/10 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף לשלד הקבוע
                    </button>
                  </div>
                </div>

                {/* Skeleton List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-700">פעילויות בשלד הקבוע:</h3>
                  {skeleton.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] italic text-center py-10 bg-[var(--foreground)]/2 rounded-2xl border">אין עדיין פעילויות בשלד הקבוע. השתמש בטופס למעלה להוספה.</p>
                  ) : (
                    <div className="border border-[var(--border)] rounded-[2rem] overflow-hidden divide-y divide-[var(--border)] bg-[var(--surface)]">
                      {skeleton.map(skel => (
                        <div key={skel.id} className="p-4 flex items-center justify-between gap-4 hover:bg-[var(--foreground)]/[0.01]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center border border-violet-500/20 shrink-0 text-xs font-black">
                              {skel.startTime}
                            </div>
                            <div>
                              <p className="text-xs font-black text-[var(--foreground)]">{skel.title}</p>
                              <p className="text-[9px] text-[var(--muted)] font-bold mt-0.5">
                                שעות: {skel.startTime} - {skel.endTime || "ללא סיום"} | מיקום: {locations.find(l => l.id === skel.locationId)?.name || "לא הוגדר"}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteSkeletonActivity(skel.id)}
                            className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 flex items-center justify-center border border-rose-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* TAB 4: LOCATIONS MANAGEMENT */}
            {activeTab === "locations" && (
              <div className="space-y-6">
                
                {/* Form to add new location */}
                <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-3xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-violet-500">
                    <MapPin className="w-4 h-4" />
                    <h3 className="text-xs font-black">הוספת מיקום חדש למאגר</h3>
                  </div>

                  <div className="flex flex-col sm:flex-row items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[var(--muted)] mb-1">שם המיקום</label>
                      <input 
                        type="text"
                        placeholder="למשל: חדר אוכל, חממה, מרכז למידה"
                        value={newLocationName}
                        onChange={(e) => setNewLocationName(e.target.value)}
                        className="w-full bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-2xl px-3 py-2.5 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <button
                      onClick={handleAddLocation}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 border border-emerald-500 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/10 transition-all shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף מיקום
                    </button>
                  </div>
                </div>

                {/* Locations List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-700">מיקומים מוגדרים במערכת:</h3>
                  {locations.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] italic text-center py-10 bg-[var(--foreground)]/2 rounded-2xl border">אין עדיין מיקומים במערכת. השתמש בטופס למעלה להוספה.</p>
                  ) : (
                    <div className="border border-[var(--border)] rounded-[2rem] overflow-hidden divide-y divide-[var(--border)] bg-[var(--surface)]">
                      {locations.map(loc => {
                        const isEditing = editingLocationId === loc.id;
                        return (
                          <div key={loc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-[var(--foreground)]/[0.01]">
                            {isEditing ? (
                              <div className="flex items-center gap-3 w-full">
                                <input
                                  type="text"
                                  value={editingLocationName}
                                  onChange={(e) => setEditingLocationName(e.target.value)}
                                  className="flex-1 bg-[var(--background)] border border-[var(--border)] text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none"
                                />
                                <button
                                  onClick={() => {
                                    setEditingLocationId(null);
                                    setEditingLocationName("");
                                  }}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black transition-all border border-slate-200"
                                >
                                  ביטול
                                </button>
                                <button
                                  onClick={() => handleUpdateLocation(loc.id, editingLocationName)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black transition-all border border-emerald-500 shadow-sm"
                                >
                                  שמור
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                                    <MapPin className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs font-black text-[var(--foreground)]">{loc.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingLocationId(loc.id);
                                      setEditingLocationName(loc.name);
                                    }}
                                    className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 flex items-center justify-center border border-violet-500/10 transition-all"
                                    title="ערוך מיקום"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLocation(loc.id)}
                                    className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 flex items-center justify-center border border-rose-500/10 transition-all"
                                    title="מחק מיקום"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
