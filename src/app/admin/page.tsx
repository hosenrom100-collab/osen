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
  { title: "ניהול צוות",         desc: "אישור עובדים, תפקידים והרשאות",       icon: ShieldCheck,   path: "/admin/users",              color: "text-violet-400 bg-violet-500/8",  roles: ["admin","manager"] },
  { title: "תוכניות וקבוצות",    desc: "תוכניות, קבוצות ולוחות זמנים",         icon: Layers,        path: "/admin/programs",           color: "text-blue-400 bg-blue-500/8",      roles: ["admin","manager"] },
  { title: "מטופלים",             desc: "מאגר מטופלים ותיקי חוסן",              icon: Users,         path: "/patients",                 color: "text-teal-400 bg-teal-500/8",      roles: ["admin","manager","instructor"] },
  { title: "נוכחות מטופלים",     desc: "סימון נוכחות יומית",                   icon: ClipboardList, path: "/admin/patient-attendance",  color: "text-emerald-400 bg-emerald-500/8",roles: ["admin","manager","instructor","employee"] },
  { title: "נוכחות צוות",        desc: "מעקב שעות ונוכחות עובדים",             icon: Users,         path: "/admin/staff-attendance",   color: "text-orange-400 bg-orange-500/8",  roles: ["admin","manager"] },
  { title: "בקשות היעדרות",       desc: "אישור ודחיית בקשות היעדרות",           icon: AlertCircle,   path: "/admin/leaves",             color: "text-rose-400 bg-rose-500/8",      roles: ["admin","manager"] },
  { title: "מיקומי פעילות",       desc: "הגדרת מיקומי סדנאות ופעילויות",        icon: MapPin,        path: "/admin/locations",          color: "text-amber-400 bg-amber-500/8",    roles: ["admin","manager"] },
  { title: "ניהול לוז יומי",      desc: "שיבוץ מדריכים ופעילויות",              icon: Calendar,      path: "/admin/schedule",           color: "text-rose-400 bg-rose-500/8",      roles: ["admin","manager"] },
  { title: "דוחות",               desc: "ייצוא נתונים וסיכומי פעילות",          icon: BarChart3,     path: "/reports",                  color: "text-cyan-400 bg-cyan-500/8",      roles: ["admin","manager"] },
  { title: "לוגיסטיקה ורכש",     desc: "ניהול מלאי וציוד",                    icon: Package,       path: "/admin/resources",          color: "text-amber-400 bg-amber-500/8",    roles: ["admin","manager","logistics"] },
  { title: "הודעות לצוות",        desc: "שליחת פוש נוטיפיקציות לעובדים",       icon: Bell,          path: "/admin/notifications",      color: "text-pink-400 bg-pink-500/8",      roles: ["admin","manager"] },
  { title: "מעקב מטופלים",        desc: "תוכניות שיקום, תאריכי סיום והארכות",   icon: ClipboardList, path: "/patients/tracking",        color: "text-teal-400 bg-teal-500/8",      roles: ["admin","manager","social_worker"] },
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
              <Shield className="w-4 h-4 text-violet-400" />
              <h1 className="text-sm font-semibold">ניהול</h1>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              <h1 className="text-sm font-semibold">ממשק ניהול ובקרה</h1>
            </div>

            <div className="mr-auto">
              <span className="text-[10px] font-medium text-violet-400 bg-violet-500/8 border border-violet-500/15 px-2.5 py-1 rounded-full uppercase tracking-wider">
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
                    className="group flex flex-col items-start gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-strong)] hover:bg-[var(--foreground)]/[0.02] transition-all text-right active:scale-[0.98]"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bgCls} ${textCls}`}>
                      <mod.icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">{mod.title}</p>
                      <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-relaxed line-clamp-2">{mod.desc}</p>
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
