export const DEFAULT_CATEGORIES = [
  "גבינות ומחלבה", "לחם ומאפים", "חומרי ניקוי",
  "מוצרי נייר וחד פעמי", "שימורים ובישול", "פירות וירקות",
  "טואלטיקה והיגיינה", "בשר ודגים", "קפואים", "כללי",
];

export const MEASUREMENT_UNITS = [
  "יחידות",
  "ק״ג",
  "גרם",
  "ליטר",
  "מ״ל",
  "אריזה",
  "ארגז",
  "בקבוק",
  "פחית",
  "שקית",
];

export const CAT_COLOR: Record<string, string> = {
  "גבינות ומחלבה":       "text-amber-500 bg-amber-500/10 border-amber-500/20",
  "בשר ודגים":            "text-rose-500 bg-rose-500/10 border-rose-500/20",
  "פירות וירקות":         "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "לחם ומאפים":           "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "חומרי ניקוי":          "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  "מוצרי נייר וחד פעמי": "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  "טואלטיקה והיגיינה":   "text-teal-500 bg-teal-500/10 border-teal-500/20",
  "שימורים ובישול":       "text-slate-500 bg-slate-500/10 border-slate-500/20",
  "קפואים":               "text-sky-500 bg-sky-500/10 border-sky-500/20",
  "כללי":                 "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

export const CAT_EMOJI: Record<string, string> = {
  "גבינות ומחלבה":       "🧀",
  "בשר ודגים":            "🥩",
  "פירות וירקות":         "🥬",
  "לחם ומאפים":           "🍞",
  "חומרי ניקוי":          "🧽",
  "מוצרי נייר וחד פעמי": "🧻",
  "טואלטיקה והיגיינה":   "🧴",
  "שימורים ובישול":       "🥫",
  "קפואים":               "🧊",
  "כללי":                 "📦",
};

export const CAT_SOLID: Record<string, string> = {
  "גבינות ומחלבה":       "bg-amber-500 border-amber-400",
  "בשר ודגים":            "bg-rose-500 border-rose-400",
  "פירות וירקות":         "bg-emerald-500 border-emerald-400",
  "לחם ומאפים":           "bg-orange-500 border-orange-400",
  "חומרי ניקוי":          "bg-cyan-500 border-cyan-400",
  "מוצרי נייר וחד פעמי": "bg-indigo-500 border-indigo-400",
  "טואלטיקה והיגיינה":   "bg-teal-500 border-teal-400",
  "שימורים ובישול":       "bg-slate-500 border-slate-400",
  "קפואים":               "bg-sky-500 border-sky-400",
  "כללי":                 "bg-slate-400 border-slate-300",
};

export const TARGET_FRAMEWORKS = [
  {
    id: "main" as const,
    name: "קבוצת ״ראשית״",
    shortName: "ראשית",
    color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/25",
    activeBg: "bg-blue-600 hover:bg-blue-500",
    pillInactive: "text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 border-blue-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    id: "lower" as const,
    name: "חוסן תחתון (+בישול)",
    shortName: "תחתון (+בישול)",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    activeBg: "bg-emerald-600 hover:bg-emerald-500",
    pillInactive: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border-emerald-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "veterans_morning" as const,
    name: "ותיקים בוקר",
    shortName: "ותיקים בוקר",
    color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
    activeBg: "bg-amber-600 hover:bg-amber-500",
    pillInactive: "text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/15 border-amber-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    id: "veterans_evening" as const,
    name: "ותיקים ערב",
    shortName: "ותיקים ערב",
    color: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25",
    activeBg: "bg-purple-600 hover:bg-purple-500",
    pillInactive: "text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/15 border-purple-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  {
    id: "iron_swords_evening" as const,
    name: "ח.ברזל ערב",
    shortName: "ח.ברזל ערב",
    color: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25",
    activeBg: "bg-rose-600 hover:bg-rose-500",
    pillInactive: "text-rose-600 dark:text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border-rose-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  {
    id: "forest" as const,
    name: "יער",
    shortName: "יער",
    color: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/25",
    activeBg: "bg-teal-600 hover:bg-teal-500",
    pillInactive: "text-teal-600 dark:text-teal-400 bg-teal-500/5 hover:bg-teal-500/15 border-teal-500/20",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
] as const;

export const FRAMEWORK_LABELS: Record<string, string> = {
  main: "קבוצת ״ראשית״",
  lower: "חוסן תחתון (+בישול)",
  veterans_morning: "ותיקים בוקר",
  veterans_evening: "ותיקים ערב",
  iron_swords_evening: "ח.ברזל ערב",
  forest: "יער",
};

