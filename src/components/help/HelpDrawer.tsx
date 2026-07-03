"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, HelpCircle, BookOpen, ShieldAlert, CheckCircle, FileText } from "lucide-react";
import { usePathname } from "next/navigation";
import { getHelpForPath } from "./helpContent";

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpDrawer({ isOpen, onClose }: HelpDrawerProps) {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<"page" | "search" | "faq">("page");
  const [searchQuery, setSearchQuery] = useState("");
  const pageHelp = getHelpForPath(pathname || "/");

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // List of all FAQs
  const faqs = [
    {
      q: "האם הנתונים האישיים של הדוחות נשמרים בשרת?",
      a: "בשום אופן לא. המערכת מתוכננת בגישת Zero-Knowledge לקבצים המיוצרים. כל פסקאות הדוחות המילוליים שאתם עורכים או מייצרים בדוח התקופתי מחושבים ישירות בדפדפן ומורדים למחשב שלכם כקובץ Word. שום תוכן מילולי או הערה טיפולית לא עולה לענן."
    },
    {
      q: "אילו פרטים של המטופלים כן נשמרים בענן?",
      a: "בענן נשמרים אך ורק פרטי הזיהוי והניהול הבסיסיים ביותר: שם פרטי, אות ראשנה של שם משפחה, שיוך לקבוצה ותוכנית, תאריכי התחלה וסיום טיפול ורשומות נוכחות יומיות (שם פרטי בלבד). נתונים אלו מוצפנים במעבר ובמנוחה בשרתי Firebase מאובטחים."
    },
    {
      q: "איך מעדכנים שעות או ימי פעילות של תוכנית?",
      a: "מנהלים יכולים לגשת לממשק הניהול (אדמין) -> תוכניות -> לבחור בתוכנית הרצויה ולערוך את שעות הפעילות ואת ימי הפעילות. שעות אלו יוזרקו אוטומטית לכל אישורי השהייה ואישורי הנסיעות המופקים למשתתפי אותה תוכנית."
    },
    {
      q: "כיצד עובד מנגנון הפקת דוח נסיעות למספר חודשים?",
      a: "בתוך תיק המשתתף, בלשונית 'אישורים', לחצו על 'החזר נסיעות'. המערכת תאפשר לכם לסמן בתיבות סימון את החודשים הרלוונטיים. המערכת תסרוק את ימי הנוכחות בפועל של המשתתף בכל חודש ותייצר מסמך Word מרוכז עם שורת פירוט ייחודית לכל חודש ושנה."
    },
    {
      q: "האם ניתן להעלות לוגו מותאם אישית של הארגון?",
      a: "כן. דרך ממשק הניהול (אדמין) -> הגדרות (Settings), ניתן להעלות קובץ תמונה ללוגו כותרת עליונה ולוגו כותרת תחתונה. הלוגואים הללו יופיעו בכל דוחות ה-Word המופקים מהמערכת באופן אוטומטי."
    }
  ];

  const allHelpSections = [
    { path: "/", title: "לוח בקרה / דשבורד", content: "נוכחות היום, תובנות והתראות מערכת, שינוי קבוצה ראשית, ציר זמן יומי, קישורים מהירים" },
    { path: "/patients", title: "ניהול משתתפים", content: "חיפוש וסינון מטופלים, הוספת משתתף חדש, ייצוא נתוני משתתפים לאקסל Excel" },
    { path: "/patients/[id]", title: "תיק משתתף", content: "כרטיס מידע אישי, עריכת פרטי משתתף, סקירת אחוזי נוכחות חודשיים, הפקת אישור שהייה, הפקת החזר נסיעות חודשי מרוכז, מחולל דוח תקופתי עם שאלון תפקודי והיגדים מגוונים" },
    { path: "/attendance", title: "רישום נוכחות", content: "סימון נוכח/נעדר/חופשה יומי, לוג נוכחות, סקירה כללית של כלל התוכניות והקבוצות בחווה" },
    { path: "/admin", title: "ניהול מערכת (אדמין)", content: "הגדרות ראשיות, העלאת לוגו כותרת, העלאת לוגו פוטר, עריכת טקסט תיאור פעילות, ניהול תוכניות, שעות וימי פעילות, ניהול קבוצות, הרשאות משתמשים" }
  ];

  const searchResults = searchQuery.trim()
    ? allHelpSections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Drawer Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="relative w-full max-w-[390px] h-full bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="מדריך עזרה מובנה"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <HelpCircle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-wide text-white">מדריך המערכת</h2>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">עזרה מובנית והסברים מהירים</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white cursor-pointer border-none"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Privacy Badge */}
            <div className="mx-4 mt-4 p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-start gap-2.5">
              <ShieldAlert className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed text-slate-300">
                <span className="font-black text-white">אבטחת מידע קפדנית:</span> תכני הדוחות והאישורים מיוצרים על מחשבך בלבד. המערכת שומרת בענן רק פרטי זיהוי ונוכחות בסיסיים.
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-4 mt-4 flex border-b border-slate-800 shrink-0">
              {[
                { id: "page", label: "העמוד הנוכחי", icon: BookOpen },
                { id: "search", label: "חיפוש במדריך", icon: Search },
                { id: "faq", label: "שאלות נפוצות", icon: HelpCircle }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 pb-3 flex flex-col items-center gap-1.5 text-[11px] font-black tracking-wider transition-all relative border-none bg-transparent cursor-pointer ${
                      isActive ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeHelpTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {activeTab === "page" && (
                <div className="space-y-4">
                  <div className="pb-1">
                    <h3 className="text-xs font-black text-white">{pageHelp.title}</h3>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">{pageHelp.subtitle}</p>
                  </div>
                  {pageHelp.sections.map((section, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-2 hover:border-slate-700/60 transition-all"
                    >
                      <h4 className="text-[11px] font-black text-violet-200 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        {section.title}
                      </h4>
                      <ul className="space-y-1.5">
                        {section.content.map((item, idx) => (
                          <li key={idx} className="text-[10px] text-slate-300 leading-relaxed list-disc list-inside">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "search" && (
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="חפש במדריכי המערכת..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 pr-3 pl-10 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-violet-500 transition-all font-medium text-right"
                    />
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  </div>

                  {searchQuery.trim() === "" ? (
                    <div className="text-center py-8 text-slate-500 space-y-2">
                      <Search className="w-8 h-8 mx-auto stroke-1" />
                      <p className="text-[10px] font-medium">הקלידו מילת מפתח (לדוגמה: נוכחות, אקסל, לוגו, דוח)</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p className="text-xs">לא נמצאו תוצאות עבור "{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {searchResults.map((res, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-1.5">
                          <h4 className="text-[11px] font-black text-violet-200 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            {res.title}
                          </h4>
                          <p className="text-[10px] text-slate-300 leading-relaxed">{res.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "faq" && (
                <div className="space-y-3">
                  {faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-2 hover:border-slate-700/60 transition-all"
                    >
                      <h4 className="text-[11px] font-black text-white leading-snug">
                        {faq.q}
                      </h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-800/50 pt-2">
                        {faq.a}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Welcome Page Link */}
            <div className="p-4 border-t border-slate-800 shrink-0 bg-slate-950/40">
              <a
                href="/welcome"
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center gap-2 cursor-pointer no-underline border-none"
              >
                <span>עמוד הצגת המערכת המלא (Welcome)</span>
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
