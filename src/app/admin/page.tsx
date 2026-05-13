"use client";

import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { motion } from "framer-motion";
import { 
  Users, 
  ShieldCheck, 
  ClipboardList, 
  Package, 
  Calendar, 
  BarChart3, 
  Settings,
  ArrowLeft,
  AlertCircle,
  MapPin,
  Layers
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const { user, isAdmin, isManager, isLogistics, isInstructor, role } = useAuth();
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
      title: "ניהול קבוצות", 
      desc: "הגדרת קבוצות ומסגרות פעילות", 
      icon: Layers, 
      path: "/admin/groups",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
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

  // Filter modules based on user role
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
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <header className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push("/")}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">ממשק ניהול</h1>
              <p className="text-slate-400 text-sm">מרכז חוסן - שליטה ובקרה</p>
            </div>
          </div>
          <div className="px-4 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full text-purple-400 text-xs font-bold uppercase tracking-wider">
            {roleLabel}
          </div>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: "עובדים במשמרת", value: "12", sub: "מתוך 45 סה״כ" },
            { label: "מטופלים פעילים", value: "158", sub: "+12 השבוע" },
            { label: "משימות פתוחות", value: "8", sub: "3 בדחיפות גבוהה" }
          ].map((stat, i) => (
            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-3xl">
              <p className="text-slate-400 text-sm mb-1">{stat.label}</p>
              <h3 className="text-3xl font-bold">{stat.value}</h3>
              <p className="text-slate-500 text-xs mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModules.map((module, index) => (
            <motion.div
              key={module.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => router.push(module.path)}
              className="group bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-white/10 transition-all cursor-pointer"
            >
              <div className={`w-12 h-12 ${module.bg} ${module.color} rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                <module.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-1">{module.title}</h3>
              <p className="text-slate-500 text-sm">{module.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>
    </RoleGuard>
  );
}
