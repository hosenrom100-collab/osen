"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  Users, ShieldCheck, ClipboardList, Package,
  Calendar, BarChart3, AlertCircle, MapPin, Layers,
  ChevronLeft, Shield, Bell,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MODULES = [
  { title: "ניהול צוות",         desc: "אישור עובדים והרשאות",       icon: ShieldCheck,   path: "/admin/users",              color: "text-violet-500 bg-violet-50",  roles: ["admin","manager"] },
  { title: "תוכניות וקבוצות",    desc: "תוכניות ולוחות זמנים",         icon: Layers,        path: "/admin/programs",           color: "text-blue-500 bg-blue-50",      roles: ["admin","manager"] },
  { title: "מטופלים",             desc: "מאגר מטופלים ותיקי חוסן",              icon: Users,         path: "/patients",                 color: "text-teal-500 bg-teal-50",      roles: ["admin","manager","instructor"] },
  { title: "נוכחות מטופלים",     desc: "סימון נוכחות יומית",                   icon: ClipboardList, path: "/admin/patient-attendance",  color: "text-emerald-500 bg-emerald-50",roles: ["admin","manager","instructor","employee"] },
  { title: "נוכחות צוות",        desc: "מעקב שעות ונוכחות",             icon: Users,         path: "/admin/staff-attendance",   color: "text-orange-500 bg-orange-50",  roles: ["admin","manager"] },
  { title: "בקשות היעדרות",       desc: "אישור ודחיית בקשות",           icon: AlertCircle,   path: "/admin/leaves",             color: "text-rose-500 bg-rose-50",      roles: ["admin","manager"] },
  { title: "מיקומי פעילות",       desc: "הגדרת מיקומי סדנאות",        icon: MapPin,        path: "/admin/locations",          color: "text-amber-500 bg-amber-50",    roles: ["admin","manager"] },
  { title: "ניהול לוז יומי",      desc: "שיבוץ מדריכים ופעילויות",              icon: Calendar,      path: "/admin/schedule",           color: "text-rose-500 bg-rose-50",      roles: ["admin","manager"] },
  { title: "דוחות",               desc: "ייצוא נתונים וסיכומים",          icon: BarChart3,     path: "/reports",                  color: "text-cyan-500 bg-cyan-50",      roles: ["admin","manager"] },
  { title: "לוגיסטיקה ורכש",     desc: "ניהול מלאי וציוד",                    icon: Package,       path: "/admin/resources",          color: "text-amber-500 bg-amber-50",    roles: ["admin","manager","logistics"] },
  { title: "הודעות לצוות",        desc: "שליחת פוש נוטיפיקציות",       icon: Bell,          path: "/admin/notifications",      color: "text-pink-500 bg-pink-50",      roles: ["admin","manager"] },
  { title: "מעקב מטופלים",        desc: "תוכניות שיקום והארכות",   icon: ClipboardList, path: "/patients/tracking",        color: "text-teal-500 bg-teal-50",      roles: ["admin","manager","social_worker"] },
];

const ROLE_HE: Record<string, string> = {
  admin: "מנהל מערכת", manager: "מנהל", logistics: "לוגיסטיקה",
  instructor: "מדריך", social_worker: 'עו"ס', employee: "עובד",
};

export default function AdminDashboard() {
  const { role } = useAuth();
  const router   = useRouter();

  const modules = MODULES.filter(m => role && m.roles.includes(role));
  const roleLabel = ROLE_HE[role || ""] ?? role;

  return (
    <RoleGuard allowedRoles={["admin","manager","logistics","instructor"]} redirectTo="/">
      <div dir="rtl" className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-[var(--background)]/95 backdrop-blur-xl border-b border-[var(--border)] px-4 md:px-6">
          <div className="flex items-center gap-3 h-12">
            {/* Breadcrumb desktop */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Link href="/" className="hover:text-[var(--foreground)] transition-colors">בית</Link>
              <ChevronLeft className="w-3 h-3 opacity-30 rotate-180" />
              <span className="text-[var(--foreground)]/70">ניהול</span>
            </div>
            {/* Mobile */}
            <button onClick={() => router.push("/")} className="md:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>

            <div className="flex items-center gap-2 md:hidden">
              <Shield className="w-4 h-4 text-slate-400" />
              <h1 className="text-sm font-black text-slate-900">ניהול</h1>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              <h1 className="text-sm font-semibold">ממשק ניהול ובקרה</h1>
            </div>

            <div className="mr-auto">
              <span className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1 rounded-lg uppercase tracking-widest">
                {roleLabel}
              </span>
            </div>
          </div>
        </header>

        {/* ── Content ── */}
        <main className="px-4 md:px-6 py-6 pb-24">
          <div className="max-w-5xl mx-auto">

            {/* Grid of modules */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {modules.map(mod => {
                const [textCls, bgCls] = mod.color.split(" ");
                return (
                  <button
                    key={mod.title}
                    onClick={() => router.push(mod.path)}
                    className="group flex flex-col items-start gap-4 p-5 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 transition-all text-right active:scale-[0.98]"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgCls} ${textCls} border border-transparent group-hover:border-current/10`}>
                      <mod.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black leading-tight text-slate-900">{mod.title}</p>
                      <p className="text-[9px] text-slate-400 mt-1.5 font-bold uppercase tracking-widest leading-relaxed line-clamp-2">{mod.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </RoleGuard>
  );
}
