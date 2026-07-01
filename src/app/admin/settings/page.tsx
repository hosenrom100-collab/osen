"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { 
  ArrowRight, Save, Loader2, Settings, FileText, 
  Upload, Image as ImageIcon, Check, AlertCircle 
} from "lucide-react";
import { useRouter } from "next/navigation";

interface ReportSettings {
  participationActivityDetail: string;
  travelActivityDetail: string;
  logoHeaderUrl?: string;
  logoFooterUrl?: string;
}

interface ProgramSettings {
  id: string;
  name: string;
  activityHours?: string;
  participationActivityDetail?: string;
  travelActivityDetail?: string;
}

const DEFAULT_ACTIVITY_DETAIL = "הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [participationActivityDetail, setParticipationActivityDetail] = useState(DEFAULT_ACTIVITY_DETAIL);
  const [travelActivityDetail, setTravelActivityDetail] = useState(DEFAULT_ACTIVITY_DETAIL);
  const [logoHeaderUrl, setLogoHeaderUrl] = useState<string>("");
  const [logoFooterUrl, setLogoFooterUrl] = useState<string>("");
  const [programs, setPrograms] = useState<ProgramSettings[]>([]);

  // Logo upload loading states
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "settings", "reports"));
      if (snap.exists()) {
        const data = snap.data() as ReportSettings;
        setParticipationActivityDetail(data.participationActivityDetail || DEFAULT_ACTIVITY_DETAIL);
        setTravelActivityDetail(data.travelActivityDetail || DEFAULT_ACTIVITY_DETAIL);
        setLogoHeaderUrl(data.logoHeaderUrl || "");
        setLogoFooterUrl(data.logoFooterUrl || "");
      }

      const progsSnap = await getDocs(collection(db, "programs"));
      const progsList = progsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          activityHours: data.activityHours || "",
          participationActivityDetail: data.participationActivityDetail || "",
          travelActivityDetail: data.travelActivityDetail || "",
        };
      });
      setPrograms(progsList);
    } catch (err) {
      console.error("Error loading settings:", err);
      setError("שגיאה בטעינת ההגדרות");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "header" | "footer") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate is image
    if (!file.type.startsWith("image/")) {
      alert("אנא בחר קובץ תמונה בלבד");
      return;
    }

    if (type === "header") setUploadingHeader(true);
    else setUploadingFooter(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await res.json();
      const url = data.url;

      if (type === "header") {
        setLogoHeaderUrl(url);
      } else {
        setLogoFooterUrl(url);
      }
    } catch (err) {
      console.error(`Error uploading logo ${type}:`, err);
      alert("שגיאה בהעלאת התמונה");
    } finally {
      if (type === "header") setUploadingHeader(false);
      else setUploadingFooter(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await setDoc(doc(db, "settings", "reports"), {
        participationActivityDetail,
        travelActivityDetail,
        logoHeaderUrl,
        logoFooterUrl,
        updatedAt: new Date()
      }, { merge: true });

      await Promise.all(
        programs.map(prog => 
          updateDoc(doc(db, "programs", prog.id), {
            activityHours: prog.activityHours || "",
            participationActivityDetail: prog.participationActivityDetail || "",
            travelActivityDetail: prog.travelActivityDetail || "",
          })
        )
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("שגיאה בשמירת ההגדרות");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["admin", "manager"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3.5">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => router.push("/admin")}
              className="w-9 h-9 rounded-xl bg-[var(--foreground)]/5 border border-[var(--border)] active:scale-95 transition-all flex items-center justify-center text-[var(--foreground)]">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0 text-right">
              <h1 className="text-sm font-black leading-tight">הגדרות ראשיות</h1>
              <p className="text-[10px] text-[var(--foreground)]/40 font-bold uppercase tracking-widest mt-0.5">Main System Settings</p>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 border border-violet-500 hover:bg-violet-500 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              שמור הגדרות
            </button>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="max-w-2xl mx-auto px-4 pt-6 pb-28 space-y-6">
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-500">
              <Check className="w-5 h-5 shrink-0" />
              <p className="text-xs font-black">ההגדרות נשמרו בהצלחה!</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-500">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-xs font-black">{error}</p>
            </div>
          )}

          {/* 1. Activity Descriptions */}
          <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 space-y-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <FileText className="w-5 h-5 text-violet-500" />
              <h2 className="text-xs font-black">פירוט פעילויות בדוחות</h2>
            </div>

            <div className="space-y-4 text-right">
              <div>
                <label className="block text-[10px] font-black text-[var(--foreground)]/40 uppercase tracking-wider mb-1.5">
                  פירוט פעילות באישור שהייה
                </label>
                <textarea
                  value={participationActivityDetail}
                  onChange={e => setParticipationActivityDetail(e.target.value)}
                  rows={3}
                  className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-3.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-[var(--foreground)]/40 uppercase tracking-wider mb-1.5">
                  פירוט פעילות באישור נסיעות
                </label>
                <textarea
                  value={travelActivityDetail}
                  onChange={e => setTravelActivityDetail(e.target.value)}
                  rows={3}
                  className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-3.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors resize-none leading-relaxed"
                />
              </div>
            </div>
          </section>

          {/* 3. Program Specific Settings */}
          <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-[2rem] p-6 space-y-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Settings className="w-5 h-5 text-violet-500" />
              <h2 className="text-xs font-black">הגדרות לפי תוכנית (שעות ופירוט פעילות)</h2>
            </div>

            <div className="space-y-6">
              {programs.map((prog, idx) => (
                <div key={prog.id} className="border-b border-[var(--border-subtle)] pb-6 last:border-b-0 last:pb-0 text-right">
                  <h3 className="text-xs font-black text-slate-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    תוכנית: {prog.name}
                  </h3>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[9px] font-black text-[var(--foreground)]/40 uppercase tracking-wider mb-1">
                        שעות פעילות
                      </label>
                      <input
                        type="text"
                        value={prog.activityHours || ""}
                        placeholder="למשל: 9:00-15:00"
                        onChange={e => {
                          const updated = [...programs];
                          updated[idx].activityHours = e.target.value;
                          setPrograms(updated);
                        }}
                        className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-2.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-black text-[var(--foreground)]/40 uppercase tracking-wider mb-1">
                          פירוט פעילות באישור שהייה (מותאם לתוכנית)
                        </label>
                        <textarea
                          value={prog.participationActivityDetail || ""}
                          placeholder="השאר ריק לשימוש בפירוט ברירת המחדל"
                          onChange={e => {
                            const updated = [...programs];
                            updated[idx].participationActivityDetail = e.target.value;
                            setPrograms(updated);
                          }}
                          rows={3}
                          className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-2.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors resize-none leading-relaxed"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-black text-[var(--foreground)]/40 uppercase tracking-wider mb-1">
                          פירוט פעילות באישור נסיעות (מותאם לתוכנית)
                        </label>
                        <textarea
                          value={prog.travelActivityDetail || ""}
                          placeholder="השאר ריק לשימוש בפירוט ברירת המחדל"
                          onChange={e => {
                            const updated = [...programs];
                            updated[idx].travelActivityDetail = e.target.value;
                            setPrograms(updated);
                          }}
                          rows={3}
                          className="w-full bg-[var(--foreground)]/5 border border-[var(--border)] text-[var(--foreground)] rounded-xl p-2.5 text-xs font-bold focus:border-violet-500 outline-none transition-colors resize-none leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>


        </main>
      </div>
    </RoleGuard>
  );
}
