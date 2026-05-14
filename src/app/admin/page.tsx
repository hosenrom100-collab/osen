"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { motion } from "framer-motion";
import { 
  Users, ShieldCheck, ClipboardList, Package, 
  Calendar, BarChart3, Settings, ArrowRight,
  AlertCircle, MapPin, Layers, ChevronRight,
  Shield, LayoutGrid, Activity, ExternalLink
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminDashboard() {
  const { user, role } = useAuth();
  const router = useRouter();

  const adminModules = [
    { 
      title: "ניהול צוות", 
      desc: "אישור עובדים, תפקידים והרשאות", 
      icon: ShieldCheck, 
      path: "/admin/users",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      roles: ["admin", "manager"]
    },
    {
      title: "ניהול תוכניות",
      desc: "יצירת תוכניות, קבוצות ולוחות זמנים",
      icon: Layers,
      path: "/admin/programs",
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      roles: ["admin", "manager"]
    },
    { 
      title: "ניהול מטופלים", 
      desc: "מאגר מטופלים ותיקי חוסן", 
      icon: Users, 
      path: "/patients",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      roles: ["admin", "manager", "instructor"]
    },
    { 
      title: "נוכחות מטופלים", 
      desc: "סימון נוכחות יומית (עליון/תחתון)", 
      icon: ClipboardList, 
      path: "/admin/patient-attendance",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      roles: ["admin", "manager", "instructor", "employee"]
    },
    { 
      title: "נוכחות צוות", 
      desc: "מעקב שעות ונוכחות עובדים", 
      icon: Users, 
      path: "/admin/staff-attendance",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      roles: ["admin", "manager"]
    },
    { 
      title: "בקשות היעדרות", 
      desc: "אישור או דחיית בקשות צוות", 
      icon: AlertCircle, 
      path: "/admin/leaves",
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      roles: ["admin", "manager"]
    },
    { 
      title: "מקומות פעילות", 
      desc: "הגדרת מיקומי סדנאות ופעילויות", 
      icon: MapPin, 
      path: "/admin/locations",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      roles: ["admin", "manager"]
    },
    { 
      title: "לוגיסטיקה ורכש", 
      desc: "ניהול מלאי וציוד חירום", 
      icon: Package, 
      path: "/admin/resources",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      roles: ["admin", "manager", "logistics"]
    },
    { 
      title: "ניהול לו״ז יומי", 
      desc: "שיבוץ מדריכים ופעילויות סדנא", 
      icon: Calendar, 
      path: "/admin/schedule",
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      roles: ["admin", "manager"]
    },
    { 
      title: "דוחות וניתוחים", 
      desc: "ייצוא נתונים וסיכומי פעילות", 
      icon: BarChart3, 
      path: "/admin/reports",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      roles: ["admin", "manager"]
    }
  ];

  const filteredModules = adminModules.filter(m => role && m.roles.includes(role));

  const roleLabel = {
    admin: "מנהל מערכת",
    manager: "מנהל",
    logistics: "לוגיסטיקה",
    instructor: "מדריך",
    social_worker: "עו״ס",
    employee: "עובד סוציאלי"
  }[role || "employee"];

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics", "instructor"]} redirectTo="/">
      <div dir="rtl" className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
        
        {/* ── Desktop CRM Header ── */}
        <header className="hidden md:flex items-center justify-between px-8 h-16 shrink-0 border-b border-border bg-card-bg/40 backdrop-blur-md z-30">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                <Link href="/" className="hover:text-purple-400 transition-colors">בית</Link>
                <ChevronRight className="w-2.5 h-2.5 opacity-30" />
                <span className="text-slate-400">ניהול מערכת</span>
              </div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                ממשק ניהול ובקרה
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400 text-[10px] font-black uppercase tracking-widest">
                {roleLabel}
             </div>
             <button onClick={() => router.push("/")} className="p-2 text-slate-500 hover:text-white transition-colors">
                <ArrowRight className="w-4 h-4" />
             </button>
          </div>
        </header>

        {/* ── Mobile Header ── */}
        <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3 flex items-center justify-between">
           <div className="flex items-center gap-3">
              <button onClick={() => router.push("/")} className="p-2 bg-white/5 rounded-xl"><ArrowRight className="w-4 h-4" /></button>
              <h1 className="text-base font-bold">ניהול</h1>
           </div>
           <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">{roleLabel}</div>
        </header>

        <main className="flex-1 overflow-y-auto no-scrollbar custom-scrollbar">
           <div className="max-w-[1400px] mx-auto p-4 md:p-12">
              
              <div className="mb-10">
                 <h2 className="text-2xl md:text-4xl font-black text-white mb-2">מרכז שליטה "חוסן"</h2>
                 <p className="text-slate-500 font-medium max-w-2xl leading-relaxed">ברוכים הבאים לממשק הניהול. מכאן ניתן לנהל את כל היבטי המערכת - החל מכוח אדם ותוכניות עבודה ועד לוגיסטיקה ודוחות ביצוע.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {filteredModules.map((module, index) => (
                  <motion.div
                    key={module.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => router.push(module.path)}
                    className="group bg-white/[0.02] border border-white/[0.05] p-6 rounded-[2rem] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all cursor-pointer flex flex-col justify-between min-h-[180px] relative overflow-hidden"
                  >
                    <div className="relative z-10">
                      <div className={`w-12 h-12 ${module.bg} ${module.color} rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 group-hover:rotate-3`}>
                        <module.icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold mb-1.5 text-white group-hover:text-blue-400 transition-colors">{module.title}</h3>
                      <p className="text-slate-500 text-xs font-medium leading-relaxed">{module.desc}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-6 relative z-10">
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-400 transition-colors">ניהול מודול</span>
                       <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                          <ChevronRight className="w-4 h-4 -rotate-180" />
                       </div>
                    </div>

                    {/* Subtle Background Glow */}
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 blur-3xl opacity-0 group-hover:opacity-10 transition-opacity rounded-full ${module.bg}`} />
                  </motion.div>
                ))}
              </div>

              {/* System Health Section (CRM Feel) */}
              <div className="mt-16 pt-10 border-t border-white/[0.05]">
                 <div className="flex items-center gap-2 mb-6">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">מצב מערכת</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex items-center gap-4">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                       <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase">שרת מסד נתונים</p>
                          <p className="text-xs font-bold text-slate-300">Firebase Realtime: פעיל</p>
                       </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex items-center gap-4">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                       <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase">סנכרון יומנים</p>
                          <p className="text-xs font-bold text-slate-300">Google API: מחובר</p>
                       </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl flex items-center gap-4">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                       <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase">הרשאות גישה</p>
                          <p className="text-xs font-bold text-slate-300">RBAC: מאובטח</p>
                       </div>
                    </div>
                 </div>
              </div>

           </div>
        </main>
      </div>
    </RoleGuard>
  );
}
