"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  ShieldCheck, FileText, Calendar, EyeOff, Users, ArrowLeft, 
  HelpCircle, Sparkles, CheckCircle2, Lock, Heart, Award, ArrowDown
} from "lucide-react";
import Link from "next/link";

export default function WelcomePage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-violet-500/30 selection:text-violet-200 overflow-x-hidden font-sans pb-16" dir="rtl">
      {/* Background Gradient Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header/Nav */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-wide text-white leading-none">Hosen Connect</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">מרכז חוסן | חוות רום</p>
          </div>
        </div>
        
        <Link 
          href="/" 
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-2xl text-xs font-black text-slate-200 hover:text-white transition-all cursor-pointer no-underline"
        >
          <span>כניסה למערכת</span>
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-black"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>אבטחת מידע קפדנית ללא שמירת תוכן בשרת</span>
          </motion.div>

          <motion.h2 
            variants={itemVariants}
            className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 leading-tight tracking-tight max-w-4xl mx-auto"
          >
            מערכת ניהול, נוכחות והפקת דוחות מתקדמת למרכזי שיקום
          </motion.h2>

          <motion.p 
            variants={itemVariants}
            className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed font-bold"
          >
            Hosen Connect מייעלת את תהליכי העבודה בחוות רום. הפקת אישורי שהייה,
            ניהול נסיעות מרובה-חודשים, רישום נוכחות קבוצתי והפקת דוחות תקופתיים עשירים בלחיצת כפתור אחת.
          </motion.p>

          <motion.div 
            variants={itemVariants}
            className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link 
              href="/" 
              className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-violet-500/25 transition-all transform hover:scale-[1.02] cursor-pointer no-underline"
            >
              התחל שימוש במערכת
            </Link>
            
            <a 
              href="#security" 
              className="px-6 py-3.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-2xl text-xs font-black text-slate-300 hover:text-white transition-all cursor-pointer no-underline flex items-center gap-2"
            >
              כיצד אנו מגנים על המידע?
              <ArrowDown className="w-4 h-4" />
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Bento Grid Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 */}
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 hover:border-violet-500/30 transition-all duration-300 flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white">מחולל דוחות תקופתיים חכם</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-bold">
                שאלון תפקודי קצר מייצר מסמך Word עשיר בניסוחים קליניים זורמים ומקצועיים. מגוון ניסוחים עצום המבוסס על אלגוריתם ייחודי המונע כתיבה רובוטית.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 hover:border-violet-500/30 transition-all duration-300 flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white">ניהול נוכחות ונסיעות מרוכז</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-bold">
                רישום יומי פשוט ומהיר לפי קבוצות. הפקת החזרי נסיעות רב-חודשיים אוטומטיים הסורקים את נתוני האמת של המטופלים ומספקים אישור מודפס מעוצב.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 hover:border-violet-500/30 transition-all duration-300 flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-white">פרטיות ברמת Zero-Knowledge</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-bold">
                הקבצים מיוצרים מקומית בדפדפן ואינם נשלחים לשרת. תכני הדוחות המילוליים לא נשמרים בענן בשום שלב, ומאבטחים הגנה מלאה על פרטיות המטופלים.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* Security & Privacy Section */}
      <section id="security" className="relative z-10 max-w-4xl mx-auto px-6 py-24">
        <div className="text-center space-y-4 mb-12">
          <h2 className="text-2xl md:text-3xl font-black text-white">מחויבות בלתי מתפשרת לאבטחת מידע 🔒</h2>
          <p className="text-xs md:text-sm text-slate-400 font-bold max-w-xl mx-auto">
            מתוך הבנת הרגישות הרבה במידע הטיפולי, המערכת תוכננה כך שאין אגירה של תכנים רפואיים או מילוליים בשרת.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 bg-slate-950/40 border-b border-slate-800 flex items-center gap-3">
            <Lock className="w-5 h-5 text-violet-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">טבלת שקיפות המידע והפרטיות</h3>
          </div>
          
          <div className="divide-y divide-slate-800 text-xs">
            <div className="grid grid-cols-3 p-4 bg-slate-950/20 font-black text-slate-300">
              <div>סוג הנתון</div>
              <div>איפה הוא נשמר?</div>
              <div>מנגנון אבטחה</div>
            </div>

            <div className="grid grid-cols-3 p-4 items-center">
              <div className="font-bold text-white">פסקאות הדוח התקופתי</div>
              <div className="text-rose-400 font-bold">אינו נשמר בענן!</div>
              <div className="text-slate-400">מעובד מקומית בדפדפן ומורד מיידית כקובץ Word.</div>
            </div>

            <div className="grid grid-cols-3 p-4 items-center">
              <div className="font-bold text-white">פרטים מזהים של מטופלים</div>
              <div className="text-emerald-400 font-bold">מסד נתונים בענן (Firebase)</div>
              <div className="text-slate-400">ללא ת.ז! נשמרים אך ורק: שם פרטי, אות ראשונה של שם משפחה, שיוך לקבוצה/תוכנית ותאריכי טיפול.</div>
            </div>

            <div className="grid grid-cols-3 p-4 items-center">
              <div className="font-bold text-white">רשומות נוכחות וימי פעילות</div>
              <div className="text-emerald-400 font-bold">מסד נתונים בענן (Firebase)</div>
              <div className="text-slate-400">חוקי אבטחה קפדניים ברמת משתמש (Security Rules).</div>
            </div>

            <div className="grid grid-cols-3 p-4 items-center">
              <div className="font-bold text-white">לוגו הארגון והגדרות ראשיות</div>
              <div className="text-emerald-400 font-bold">מסד נתונים ו-Storage בענן</div>
              <div className="text-slate-400">גישה מורשית למנהלי מערכת בלבד.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Quality Grid */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-12 border-t border-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h3 className="text-xl font-black text-white">חוויית פרימיום לעבודה יומיומית</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-bold">
              האפליקציה פותחה מתוך מחשבה על עובדים סוציאליים, מנחים ומנהלים. היא מציעה ממשק ריספונסיבי מהיר למובייל ולמחשב, פילטרים מהירים, לוחות מחוונים ברורים ורכיבים מעוצבים התומכים במעברים חלקים.
            </p>
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-slate-300 font-bold">תואם לכל סוגי הניידים והטאבלטים</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-slate-300 font-bold">ייצוא נתונים ישיר ל-Excel ללא הגבלת רשומות</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-slate-300 font-bold">מערכת עזרה והדרכה מובנית בכל עמודי המערכת</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-900 text-center space-y-2">
              <Heart className="w-8 h-8 text-rose-500 mx-auto" />
              <h4 className="text-xs font-black text-white">ממוקד מטופל</h4>
              <p className="text-[10px] text-slate-400">מאפשר להתרכז בתהליך ולא בניירת</p>
            </div>
            <div className="p-6 rounded-2xl bg-slate-900/20 border border-slate-900 text-center space-y-2">
              <Award className="w-8 h-8 text-amber-500 mx-auto" />
              <h4 className="text-xs font-black text-white">מקצועיות</h4>
              <p className="text-[10px] text-slate-400">הפקת מסמכים מלוטשת מול משרד הביטחון</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 pt-24 text-center text-[10px] text-slate-600 font-bold border-t border-slate-900/60 mt-16">
        <p>© {new Date().getFullYear()} Hosen Connect. פותח עבור מרכז חוסן, חוות רום.</p>
        <p className="mt-1">המערכת מאובטחת ועומדת בתקני אבטחת המידע המחמירים ביותר.</p>
      </footer>
    </div>
  );
}
