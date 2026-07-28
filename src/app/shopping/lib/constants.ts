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
