"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  Users, ShieldCheck, ClipboardList, Package,
  Calendar, AlertCircle, MapPin, Layers,
  ChevronLeft, Shield, Bell, MessageCircle, Briefcase, Settings, Receipt
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ROLE_HE: Record<string, string> = {
  admin: "מנהל מערכת", manager: "מנהל", logistics: "לוגיסטיקה",
  instructor: "מדריך", social_worker: 'עו"ס', employee: "עובד",
};

// Modules organized by category with role access
const CATEGORIES = [
  {
    title: "ניהול משתתפים",
    color: "text-teal-500",
    modules: [
      { title: "משתתפים",         desc: "מאגר משתתפים ותיקי חוסן",    icon: Users,         path: "/patients",                color: "text-teal-500 bg-teal-500/10",      roles: ["admin","manager","instructor","social_worker","logistics"] },
      { title: "נוכחות משתתפים",  desc: "סימון נוכחות יומית",         icon: ClipboardList, path: "/admin/patient-attendance",  color: "text-emerald-500 bg-emerald-500/10",roles: ["admin","manager","instructor","employee","social_worker","logistics"] },
      { title: "מעקב תקופות שהות", desc: "הארכות ותוכניות שיקום",      icon: Calendar,      path: "/patients/tracking",        color: "text-teal-500 bg-teal-500/10",      roles: ["admin","manager","social_worker"] },
      { title: "תזכורות והארכות",  desc: "משתתפים הדורשים טיפול דחוף", icon: Bell,          path: "/admin/reminders",          color: "text-rose-500 bg-rose-500/10",      roles: ["admin","manager","social_worker"] },
      { title: "מאגר עו״ס שיקום",  desc: "ניהול מלווי משרד הביטחון",  icon: Briefcase,     path: "/admin/rehab-workers",      color: "text-teal-500 bg-teal-500/10",      roles: ["admin","manager","social_worker"] },
    ],
  },
  {
    title: "ניהול עובדים",
    color: "text-violet-500",
    modules: [
      { title: "ניהול צוות",      desc: "אישור עובדים והרשאות",       icon: ShieldCheck,   path: "/admin/users",              color: "text-violet-500 bg-violet-500/10",  roles: ["admin","manager"] },
      { title: "נוכחות צוות",     desc: "בקשות היעדרות ונוכחות יומית", icon: ClipboardList, path: "/admin/staff-attendance",   color: "text-violet-500 bg-violet-500/10",  roles: ["admin","manager"] },
    ],
  },
  {
    title: "תוכניות ולוז",
    color: "text-blue-500",
    modules: [
      { title: "תוכניות וקבוצות", desc: "ניהול תוכניות ולוחות זמנים", icon: Layers,        path: "/admin/programs",           color: "text-blue-500 bg-blue-500/10",      roles: ["admin","manager"] },
    ],
  },
  {
    title: "הגדרות מערכת",
    color: "text-slate-500",
    modules: [
      { title: "הגדרות ראשיות",   desc: "עריכת פורמט פעילויות ולוגואים", icon: Settings,    path: "/admin/settings",           color: "text-slate-500 bg-slate-500/10",    roles: ["admin","manager"] },
      { title: "פול מוצרים",      desc: "ניהול מאגר המוצרים לקניות",   icon: Package,     path: "/admin/shopping-pool",      color: "text-slate-500 bg-slate-500/10",    roles: ["admin","manager","logistics"] },
      { title: "ארכיון קבלות",     desc: "צילום וניהול קבלות רכש",      icon: Receipt,     path: "/admin/receipts-archive",   color: "text-indigo-500 bg-indigo-500/10",  roles: ["admin","manager","logistics"] },
    ],
  },
];

export default function AdminDashboard() {
  const { roles, role } = useAuth();
  const router = useRouter();
  const roleLabel = ROLE_HE[role || ""] ?? role;

  const visibleCategories = CATEGORIES
    .map(cat => ({
      ...cat,
      modules: cat.modules.filter(m => roles.some(r => m.roles.includes(r))),
    }))
    .filter(cat => cat.modules.length > 0);

  return (
    <RoleGuard allowedRoles={["admin","manager","logistics","instructor","social_worker"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/" className="hover:text-[var(--foreground)] transition-colors">בית</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">ניהול</span>
            </div>
            <button onClick={() => router.push("/")} title="חזור לדף הבית" className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>

            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              <h1 className="text-sm font-semibold">ממשק ניהול ובקרה</h1>
            </div>

            <div className="mr-auto">
              <span className="text-[10px] font-black text-[var(--foreground)] bg-[var(--foreground)]/5 border border-[var(--border)] px-3 py-1 rounded-lg uppercase tracking-widest">
                {roleLabel}
              </span>
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="px-4 md:px-6 py-6 pb-24">
          <div className="max-w-5xl mx-auto space-y-8">
            {visibleCategories.map(cat => (
              <section key={cat.title}>
                <h2 className={`text-[10px] font-black uppercase tracking-[0.2em] ${cat.color} mb-3 flex items-center gap-2`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  {cat.title}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {cat.modules.map(mod => {
                    const [textCls, bgCls] = mod.color.split(" ");
                    return (
                      <button
                        key={mod.title}
                        onClick={() => router.push(mod.path)}
                        title={mod.desc}
                        className="group flex flex-col items-start gap-4 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl hover:border-[var(--muted)]/30 transition-all text-right active:scale-[0.98] shadow-lg shadow-[var(--foreground)]/[0.02]"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgCls} ${textCls} border border-transparent group-hover:border-current/10`}>
                          <mod.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black leading-tight text-[var(--foreground)]">{mod.title}</p>
                          <p className="text-[9px] text-[var(--muted)] mt-1.5 font-bold uppercase tracking-widest leading-relaxed line-clamp-2">{mod.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
