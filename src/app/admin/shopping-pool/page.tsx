"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, orderBy, where, doc, deleteDoc, writeBatch, getDoc, setDoc } from "firebase/firestore";
import { Package, Plus, Trash2, Tag, Search, ArrowRight, Loader2, Settings, X, Download, Upload, Edit3, Check, Eye, EyeOff, Boxes, Layers, AlertTriangle, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

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
  "שקית"
];

interface Product {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
  defaultNotes?: string;
  isRecurring?: boolean;
  recurringQuantity?: string;
  trackInventory?: boolean;
  isActive?: boolean;
  isStar?: boolean;
}

const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const normalizeHebrewString = (str: string): string => {
  return str
    .trim()
    .replace(/["'׳״\-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(word => {
      if (word.startsWith("ה") && word.length > 3) {
        return word.substring(1);
      }
      return word;
    })
    .join(" ");
};

export default function ShoppingPoolPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("כללי");
  const [newDefaultUnit, setNewDefaultUnit] = useState("יחידות");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewValue, setEditingCatNewValue] = useState("");

  // Product Inline Edit State
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [editingProdName, setEditingProdName] = useState("");
  const [editingProdCat, setEditingProdCat] = useState("");
  const [editingProdUnit, setEditingProdUnit] = useState("יחידות");
  const [editingProdNotes, setEditingProdNotes] = useState("");

  const [newDefaultNotes, setNewDefaultNotes] = useState("");

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "inventory">("all");

  // Duplicate Scanner State
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicatePairs, setDuplicatePairs] = useState<{ p1: Product; p2: Product }[]>([]);

  const router = useRouter();

  const [categories, setCategories] = useState([
    "גבינות ומחלבה","לחם ומאפים","חומרי ניקוי",
    "מוצרי נייר וחד פעמי","שימורים ובישול","פירות וירקות",
    "טואלטיקה והיגיינה","בשר ודגים","קפואים","כללי",
  ]);

  useEffect(() => {
    fetchProducts();
    getDoc(doc(db, "settings", "shopping")).then((s) => {
      if (s.exists() && s.data().categories) setCategories(s.data().categories);
    });
  }, []);

  const syncCategoryInRequests = async (oldName: string, newName: string) => {
    const snap = await getDocs(query(collection(db, "shopping_requests"), where("category", "==", oldName)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach(d => batch.update(doc(db, "shopping_requests", d.id), { category: newName }));
    await batch.commit();
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCat = newCatInput.trim();
    if (!cleanCat) return;
    if (categories.includes(cleanCat)) {
      alert("קטגוריה זו כבר קיימת!");
      return;
    }
    const updatedCats = [...categories, cleanCat];
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: updatedCats }, { merge: true });
      setCategories(updatedCats);
      setNewCatInput("");
    } catch (err) {
      console.error("Error adding category:", err);
      alert("שגיאה בהוספת קטגוריה");
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName) {
      setEditingCatName(null);
      return;
    }
    if (categories.includes(trimmedNew)) {
      alert("קטגוריה עם שם זה כבר קיימת!");
      return;
    }
    const updatedCats = categories.map(c => c === oldName ? trimmedNew : c);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: updatedCats }, { merge: true });
      setCategories(updatedCats);
      setEditingCatName(null);

      const productsInCat = products.filter(p => p.category === oldName);
      if (productsInCat.length > 0) {
        const batch = writeBatch(db);
        productsInCat.forEach(p => batch.update(doc(db, "product_pool", p.id), { category: trimmedNew }));
        await batch.commit();
        setProducts(products.map(p => p.category === oldName ? { ...p, category: trimmedNew } : p));
      }

      await syncCategoryInRequests(oldName, trimmedNew);
    } catch (err) {
      console.error("Error renaming category:", err);
      alert("שגיאה בעדכון הקטגוריה");
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (catToDelete === "כללי") {
      alert("לא ניתן למחוק את קטגוריית ברירת המחדל 'כללי'");
      return;
    }
    const productsInCat = products.filter(p => p.category === catToDelete);
    if (productsInCat.length > 0) {
      if (!confirm(`שים לב: ישנם ${productsInCat.length} מוצרים המשויכים לקטגוריה זו. אם תמחק אותה, מוצרים אלו יוצגו תחת 'כללי'. האם להמשיך?`)) {
        return;
      }
      
      const batch = writeBatch(db);
      productsInCat.forEach(p => {
        batch.update(doc(db, "product_pool", p.id), { category: "כללי" });
      });
      await batch.commit();
      
      setProducts(products.map(p => p.category === catToDelete ? { ...p, category: "כללי" } : p));
    } else {
      if (!confirm(`האם למחוק את הקטגוריה '${catToDelete}'?`)) return;
    }

    const updatedCats = categories.filter(c => c !== catToDelete);
    try {
      await setDoc(doc(db, "settings", "shopping"), { categories: updatedCats }, { merge: true });
      setCategories(updatedCats);
      if (newCategory === catToDelete) {
        setNewCategory("כללי");
      }
      await syncCategoryInRequests(catToDelete, "כללי");
    } catch (err) {
      console.error("Error deleting category:", err);
      alert("שגיאה במחיקת קטגוריה");
    }
  };

  const fetchProducts = async () => {
    try {
      const q = query(collection(db, "product_pool"), orderBy("name"));
      const snap = await getDocs(q);
      const list: Product[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(list);
    } catch (error) {
      console.error("Error fetching pool:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProductActive = async (id: string, currentActive?: boolean) => {
    const nextVal = currentActive === false ? true : false;
    try {
      await setDoc(doc(db, "product_pool", id), { isActive: nextVal }, { merge: true });
      setProducts(products.map(p => p.id === id ? { ...p, isActive: nextVal } : p));
    } catch (e) {
      console.error("Error updating active status:", e);
    }
  };

  const toggleProductTrackInventory = async (id: string, currentTrack?: boolean) => {
    const nextVal = !currentTrack;
    try {
      await setDoc(doc(db, "product_pool", id), { trackInventory: nextVal }, { merge: true });
      setProducts(products.map(p => p.id === id ? { ...p, trackInventory: nextVal } : p));
    } catch (e) {
      console.error("Error updating trackInventory:", e);
    }
  };

  const toggleProductStar = async (id: string, currentIsStar?: boolean) => {
    const nextVal = !currentIsStar;
    try {
      await setDoc(doc(db, "product_pool", id), { isStar: nextVal }, { merge: true });
      setProducts(products.map(p => p.id === id ? { ...p, isStar: nextVal } : p));
    } catch (e) {
      console.error("Error updating isStar:", e);
    }
  };

  const handleUpdateProduct = async (id: string) => {
    const cleanName = editingProdName.trim();
    if (!cleanName) return;
    try {
      await setDoc(doc(db, "product_pool", id), {
        name: cleanName,
        category: editingProdCat,
        defaultUnit: editingProdUnit,
        defaultNotes: editingProdNotes.trim(),
      }, { merge: true });
      setProducts(products.map(p => p.id === id ? { ...p, name: cleanName, category: editingProdCat, defaultUnit: editingProdUnit, defaultNotes: editingProdNotes.trim() } : p));
      setEditingProdId(null);
    } catch (e) {
      console.error("Error updating product:", e);
    }
  };

  const handleScanDuplicates = () => {
    const pairs: { p1: Product; p2: Product }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const p1 = products[i];
        const p2 = products[j];
        const pairKey = [p1.id, p2.id].sort().join("::");
        if (seen.has(pairKey)) continue;

        const n1 = normalizeHebrewString(p1.name);
        const n2 = normalizeHebrewString(p2.name);

        if (n1 === n2) {
          pairs.push({ p1, p2 });
          seen.add(pairKey);
        } else {
          const dist = getLevenshteinDistance(n1, n2);
          const minLen = Math.min(n1.length, n2.length);
          const maxDist = minLen >= 6 ? 2 : (minLen >= 4 ? 1 : 0);
          if (dist <= maxDist && minLen > 2) {
            pairs.push({ p1, p2 });
            seen.add(pairKey);
          }
        }
      }
    }
    setDuplicatePairs(pairs);
    setShowDuplicatesModal(true);
  };

  const handleMergeDeleteDuplicate = async (removeId: string) => {
    try {
      await deleteDoc(doc(db, "product_pool", removeId));
      setProducts(products.filter(p => p.id !== removeId));
      setDuplicatePairs(duplicatePairs.filter(pair => pair.p1.id !== removeId && pair.p2.id !== removeId));
    } catch (e) {
      console.error("Error deleting duplicate:", e);
    }
  };

  const handleBulkImport = async () => {
    if (!confirm("האם לייבא את רשימת מוצרי הבסיס למערכת?")) return;
    setLoading(true);
    const baseProducts = [
      ["גבינות ומחלבה", "גבינה לבנה 5%"], ["גבינות ומחלבה", "קוטג' 5%"], ["גבינות ומחלבה", "גבינה צהובה פרוסה"],
      ["גבינות ומחלבה", "חמאה"], ["גבינות ומחלבה", "שמנת חמוצה 15%"], ["גבינות ומחלבה", "יוגורט טבעי"],
      ["גבינות ומחלבה", "חלב 3% בקרטון"], ["גבינות ומחלבה", "שוקו בשקית/בקבוק"], ["גבינות ומחלבה", "מעדן שוקולד עם קצפת"],
      ["גבינות ומחלבה", "גבינה בולגרית"], ["לחם ומאפים", "לחם אחיד פרוס"], ["לחם ומאפים", "פיתות טריות"],
      ["לחם ומאפים", "חלה לשבת"], ["לחם ומאפים", "לחמניות שומשום"], ["לחם ומאפים", "פריכיות אורז"],
      ["לחם ומאפים", "לחם כוסמין מלא"], ["לחם ומאפים", "באגט צרפתי"], ["לחם ומאפים", "פיתות מקמח מלא"],
      ["לחם ומאפים", "קרקרים מלוחים"], ["לחם ומאפים", "ביסקוויטים"], ["חומרי ניקוי", "נוזל כלים"],
      ["חומרי ניקוי", "אבקת/נוזל כביסה"], ["חומרי ניקוי", "מרכך כביסה"], ["חומרי ניקוי", "נוזל רצפות"],
      ["חומרי ניקוי", "ספריי חלונות"], ["חומרי ניקוי", "קונומיקה"], ["חומרי ניקוי", "טבליות למדיח"],
      ["חומרי ניקוי", "מסיר שומנים"], ["חומרי ניקוי", "מנקה אסלות"], ["חומרי ניקוי", "נוזל לניקוי כללי"],
      ["מוצרי נייר וחד פעמי", "נייר טואלט"], ["מוצרי נייר וחד פעמי", "מגבות נייר (נייר סופג)"], ["מוצרי נייר וחד פעמי", "מפיות"],
      ["מוצרי נייר וחד פעמי", "כוסות חד פעמיות (קר/חם)"], ["מוצרי נייר וחד פעמי", "צלחות חד פעמיות"], ["מוצרי נייר וחד פעמי", "סכו\"ם חד פעמי"],
      ["מוצרי נייר וחד פעמי", "שקיות אשפה גדולות"], ["מוצרי נייר וחד פעמי", "שקיות אוכל"], ["מוצרי נייר וחד פעמי", "תבניות אלומיניום"],
      ["מוצרי נייר וחד פעמי", "נייר אפייה"], ["שימורים ובישול", "שמן קנולה/חמניות"], ["שימורים ובישול", "שמן זית"],
      ["שימורים ובישול", "רסק עגבניות"], ["שימורים ובישול", "טונה בשמן/מים"], ["שימורים ובישול", "תירס בשימורים"],
      ["שימורים ובישול", "זיתים מושחרים/ירוקים"], ["שימורים ובישול", "מלפפון חמוץ במלח/חומץ"], ["שימורים ובישול", "פסטה (סוגים שונים)"],
      ["שימורים ובישול", "אורז פרסי/יסמין"], ["שימורים ובישול", "פתיתים"], ["שימורים ובישול", "קוסקוס"],
      ["שימורים ובישול", "קמח חיטה לבן"], ["שימורים ובישול", "סוכר לבן"], ["שימורים ובישול", "מלח שולחן"],
      ["שימורים ובישול", "קפה נמס"], ["שימורים ובישול", "קפה שחור"], ["שימורים ובישול", "תה (טעמים שונים)"],
      ["שימורים ובישול", "קטשופ"], ["שימורים ובישול", "מיונז"], ["שימורים ובישול", "חרדל"],
      ["שימורים ובישול", "תבלינים (פפריקה, כמון, כורכום)"], ["פירות וירקות", "עגבניות"], ["פירות וירקות", "מלפפונים"],
      ["פירות וירקות", "פלפל גמבה אדום"], ["פירות וירקות", "בצל יבש"], ["פירות וירקות", "תפוחי אדמה"],
      ["פירות וירקות", "גזר"], ["פירות וירקות", "קישואים"], ["פירות וירקות", "חסה"],
      ["פירות וירקות", "לימון"], ["פירות וירקות", "בננות"], ["פירות וירקות", "תפוחי עץ"],
      ["פירות וירקות", "פירות העונה"], ["טואלטיקה והיגיינה", "סבון ידיים נוזלי"], ["טואלטיקה והיגיינה", "שמפו"],
      ["טואלטיקה והיגיינה", "מרכך שיער"], ["טואלטיקה והיגיינה", "סבון גוף נוזלי/מוצק"], ["טואלטיקה והיגיינה", "משחת שיניים"],
      ["טואלטיקה והיגיינה", "מברשות שיניים"], ["טואלטיקה והיגיינה", "דאודורנט"], ["טואלטיקה והיגיינה", "טיטולים (מידות שונות)"],
      ["טואלטיקה והיגיינה", "מגבונים לחים"], ["טואלטיקה והיגיינה", "תחבושות היגייניות/טמפונים"]
    ];

    try {
      const batch = writeBatch(db);
      
      let addedCount = 0;
      for (const [category, name] of baseProducts) {
        const docId = name.replace(/\//g, "-"); 
        const newDocRef = doc(db, "product_pool", docId);
        batch.set(newDocRef, { name, category, isActive: true }, { merge: true });
        addedCount++;
      }
      
      if (addedCount > 0) {
        await batch.commit();
      }
      
      await fetchProducts();
      alert(`הייבוא הסתיים! נוספו ${addedCount} מוצרים חדשים.`);
    } catch (error) {
      console.error("Error importing:", error);
      alert("שגיאה בייבוא. בדוק חיבור לאינטרנט או הרשאות.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPoolTemplateXlsx = () => {
    const sampleData = [
      {
        "מוצר": "חלב 3% בקרטון",
        "קטגוריה": "גבינות ומחלבה",
        "יחידת מדידה": "ליטר"
      },
      {
        "מוצר": "נייר טואלט",
        "קטגוריה": "מוצרי נייר וחד פעמי",
        "יחידת מדידה": "אריזה"
      },
      {
        "מוצר": "עגבניות",
        "קטגוריה": "פירות וירקות",
        "יחידת מדידה": "ק״ג"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "תבנית מאגר מוצרים");
    XLSX.writeFile(wb, "תבנית_מאגר_מוצרים.xlsx");
  };

  const handleImportPoolXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          alert("הקובץ ריק או לא תקין.");
          setLoading(false);
          return;
        }

        const hasProduct = data.some(row => row["מוצר"]);
        if (!hasProduct) {
          alert("קובץ לא תקין. חובה להזין עמודת 'מוצר'.");
          setLoading(false);
          return;
        }

        const batch = writeBatch(db);
        let addedCount = 0;

        for (const row of data) {
          const name = row["מוצר"]?.toString().trim();
          if (!name) continue;
          const category = row["קטגוריה"]?.toString().trim() || "כללי";
          const defaultUnit = row["יחידת מדידה"]?.toString().trim() || row["יחידה"]?.toString().trim() || "יחידות";

          const docId = name.replace(/\//g, "-");
          const newDocRef = doc(db, "product_pool", docId);
          batch.set(newDocRef, { name, category, defaultUnit, isActive: true }, { merge: true });
          addedCount++;
        }

        if (addedCount > 0) {
          await batch.commit();
        }

        await fetchProducts();
        alert(`הייבוא מאקסל הסתיים בהצלחה! נוספו/עודכנו ${addedCount} מוצרים במאגר.`);
        e.target.value = "";
      } catch (err) {
        console.error("Error importing xlsx pool:", err);
        alert("שגיאה בקריאת קובץ האקסל.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    if (cleanName.includes(",") || cleanName.includes("،")) {
      alert("אין להוסיף כמה מוצרים מופרדים בפסיקים במכה אחת. יש להוסיף כל מוצר בנפרד!");
      return;
    }

    try {
      const docId = cleanName.replace(/\//g, "-");
      await setDoc(doc(db, "product_pool", docId), {
        name: cleanName,
        category: newCategory,
        defaultUnit: newDefaultUnit,
        defaultNotes: newDefaultNotes.trim(),
        isActive: true,
        trackInventory: false
      }, { merge: true });
      setProducts([...products.filter(p => p.id !== docId), { id: docId, name: cleanName, category: newCategory, defaultUnit: newDefaultUnit, defaultNotes: newDefaultNotes.trim(), isActive: true, trackInventory: false }].sort((a,b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewDefaultUnit("יחידות");
      setNewDefaultNotes("");
      setIsAdding(false);
    } catch (error) {
      console.error("Error adding product:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם למחוק מוצר זה מהפול?")) return;
    try {
      await deleteDoc(doc(db, "product_pool", id));
      setProducts(products.filter(p => p.id !== id));
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const filtered = products.filter(p => {
    if (statusFilter === "active" && p.isActive === false) return false;
    if (statusFilter === "inactive" && p.isActive !== false) return false;
    if (statusFilter === "inventory" && p.trackInventory !== true) return false;

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = products.filter(p => p.isActive !== false).length;
  const inactiveCount = products.filter(p => p.isActive === false).length;
  const inventoryCount = products.filter(p => p.trackInventory === true).length;

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 pb-24 md:p-8" dir="rtl">
        <header className="max-w-2xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/shopping")}
                className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl transition-all hover:bg-[var(--foreground)]/5"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">ניהול פול מוצרים</h1>
                <p className="text-slate-400 text-sm">נהל וערוך את מאגר המוצרים במערכת</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={handleScanDuplicates}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer"
                title="סרוק כפילויות חכמות"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>סריקת כפילויות</span>
              </button>

              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-500/10 text-slate-300 border border-slate-500/20 rounded-xl text-xs font-medium hover:bg-slate-500/20 transition-all cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>קטגוריות</span>
              </button>

              <button
                onClick={handleBulkImport}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl text-xs font-medium hover:bg-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                מוצרי בסיס
              </button>

              {/* Excel Import for Pool */}
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleImportPoolXlsx} 
                className="hidden" 
                id="import-excel-pool-file" 
              />
              <button
                onClick={downloadPoolTemplateXlsx}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-medium hover:bg-indigo-500/20 transition-all cursor-pointer"
                title="הורדת תבנית אקסל להזנת מאגר מוצרים"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>תבנית</span>
              </button>
              <label
                htmlFor="import-excel-pool-file"
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-all cursor-pointer shadow-sm shadow-indigo-600/15"
              >
                <Upload className="w-3.5 h-3.5 text-white" />
                <span>ייבוא</span>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="חיפוש מוצר..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-10 text-sm focus:outline-none focus:border-blue-500 transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer border-none flex items-center justify-center"
                    title="נקה חיפוש"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === "all"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                הכל ({products.length})
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === "active"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                פעילים ({activeCount})
              </button>
              <button
                onClick={() => setStatusFilter("inactive")}
                className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === "inactive"
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                לא פעילים ({inactiveCount})
              </button>
              <button
                onClick={() => setStatusFilter("inventory")}
                className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === "inventory"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)] hover:bg-[var(--foreground)]/5"
                }`}
              >
                במעקב מלאי ({inventoryCount})
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {isAdding && (
                  <motion.form 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onSubmit={handleAddProduct}
                    className="bg-[var(--surface)] border border-blue-500/30 p-4 rounded-[1.5rem] flex flex-col gap-4 shadow-2xl shadow-blue-500/10"
                  >
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input 
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="שם המוצר החדש..."
                        className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500 text-right"
                        required
                      />
                      <select 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full sm:w-36 bg-[var(--background)] border border-[var(--border)] rounded-xl px-2 py-3 text-xs focus:outline-none text-right font-bold"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select 
                        value={newDefaultUnit}
                        onChange={(e) => setNewDefaultUnit(e.target.value)}
                        className="w-full sm:w-28 bg-[var(--background)] border border-[var(--border)] rounded-xl px-2 py-3 text-xs focus:outline-none text-right font-bold text-indigo-600 dark:text-indigo-400"
                        title="יחידת מדידה קבועה"
                      >
                        {MEASUREMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={newDefaultNotes}
                        onChange={(e) => setNewDefaultNotes(e.target.value)}
                        placeholder="הערה קבועה ברירת מחדל (אופציונלי)..."
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 px-3 text-xs text-right focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-blue-600 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg shadow-blue-600/20 cursor-pointer">
                        הוסף לפול
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setIsAdding(false)}
                        className="px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs font-bold cursor-pointer"
                      >
                        ביטול
                      </button>
                    </div>
                  </motion.form>
                )}

                {filtered.map((prod) => {
                  const isEditingThis = editingProdId === prod.id;
                  const isInactive = prod.isActive === false;
                  const isTracked = prod.trackInventory === true;

                  return (
                    <motion.div
                      key={prod.id}
                      layout
                      className={`bg-[var(--surface)] border p-4 rounded-2xl flex items-center justify-between gap-3 group transition-all ${
                        isInactive ? "opacity-60 border-slate-500/20 bg-slate-500/5" : "border-[var(--border)]"
                      }`}
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 w-full flex-wrap sm:flex-nowrap">
                          <input
                            type="text"
                            value={editingProdName}
                            onChange={(e) => setEditingProdName(e.target.value)}
                            className="flex-1 bg-[var(--background)] border border-blue-500/40 rounded-xl py-1.5 px-3 text-sm font-bold text-right focus:outline-none min-w-[120px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdateProduct(prod.id);
                              if (e.key === "Escape") setEditingProdId(null);
                            }}
                          />
                          <input
                            type="text"
                            value={editingProdNotes}
                            onChange={(e) => setEditingProdNotes(e.target.value)}
                            placeholder="הערה קבועה..."
                            className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-xl py-1.5 px-2 text-xs text-right focus:outline-none min-w-[100px]"
                          />
                          <select
                            value={editingProdCat}
                            onChange={(e) => setEditingProdCat(e.target.value)}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-1.5 px-2 text-xs font-bold text-right"
                          >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select
                            value={editingProdUnit}
                            onChange={(e) => setEditingProdUnit(e.target.value)}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-xl py-1.5 px-2 text-xs font-bold text-right text-indigo-600 dark:text-indigo-400"
                            title="יחידת מדידה"
                          >
                            {MEASUREMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateProduct(prod.id)}
                              className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-xl border border-emerald-500/20 transition-all cursor-pointer"
                              title="שמור"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingProdId(null)}
                              className="p-2 bg-[var(--foreground)]/5 text-slate-400 hover:bg-[var(--foreground)]/10 rounded-xl border border-[var(--border)] transition-all cursor-pointer"
                              title="ביטול"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                              isInactive ? "bg-slate-500/10 text-slate-400 border-slate-500/20" : "bg-[var(--background)] text-slate-500 border-[var(--border)]"
                            }`}>
                              <Package className="w-5 h-5" />
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`font-bold text-sm ${isInactive ? "line-through text-slate-400" : ""}`}>
                                  {prod.name}
                                </h3>
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                  {prod.defaultUnit || "יחידות"}
                                </span>
                                {prod.defaultNotes && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                    הערה: {prod.defaultNotes}
                                  </span>
                                )}
                                {isInactive && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                    לא פעיל
                                  </span>
                                )}
                                {isTracked && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                    במעקב מלאי
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 justify-start">
                                <Tag className="w-3 h-3" />
                                {prod.category}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleProductActive(prod.id, prod.isActive)}
                              className={`p-2 rounded-xl transition-all cursor-pointer ${
                                isInactive 
                                  ? "text-rose-400 hover:bg-rose-500/10" 
                                  : "text-emerald-500 hover:bg-emerald-500/10"
                              }`}
                              title={isInactive ? "הפוך למוצר פעיל" : "הפוך למוצר לא פעיל"}
                            >
                              {isInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>

                            <button
                              onClick={() => toggleProductTrackInventory(prod.id, prod.trackInventory)}
                              className={`p-2 rounded-xl transition-all cursor-pointer ${
                                isTracked 
                                  ? "text-indigo-500 bg-indigo-500/10 border border-indigo-500/20" 
                                  : "text-slate-400 hover:bg-slate-500/10"
                              }`}
                              title={isTracked ? "הסר ממעקב מלאי" : "הוסף למעקב מלאי"}
                            >
                              <Boxes className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => {
                                setEditingProdId(prod.id);
                                setEditingProdName(prod.name);
                                setEditingProdCat(prod.category);
                                setEditingProdUnit(prod.defaultUnit || "יחידות");
                                setEditingProdNotes(prod.defaultNotes || "");
                              }}
                              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all cursor-pointer"
                              title="ערוך מוצר"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button 
                              onClick={() => handleDelete(prod.id)}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                              title="מחק מוצר"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Categories Modal */}
        <AnimatePresence>
          {showCategoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowCategoryModal(false)} 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] shadow-2xl p-6 overflow-hidden flex flex-col gap-6"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-bold">ניהול קטגוריות מוצרים</h2>
                  </div>
                  <button 
                    onClick={() => setShowCategoryModal(false)} 
                    className="p-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-slate-400 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddCategory} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="שם קטגוריה חדשה..."
                    value={newCatInput}
                    onChange={e => setNewCatInput(e.target.value)}
                    className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-500 text-right"
                    required
                  />
                  <button 
                    type="submit" 
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    הוסף
                  </button>
                </form>

                <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-2">
                  {categories.map(cat => {
                    const isEditing = editingCatName === cat;
                    return (
                      <div
                        key={cat}
                        className="flex items-center justify-between bg-[var(--background)] border border-[var(--border)] px-4 py-2.5 rounded-xl gap-2"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-grow">
                            <input
                              type="text"
                              value={editingCatNewValue}
                              onChange={e => setEditingCatNewValue(e.target.value)}
                              className="flex-grow bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:border-blue-500 text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCategory(cat, editingCatNewValue);
                                else if (e.key === "Escape") setEditingCatName(null);
                              }}
                            />
                            <button
                              onClick={() => handleRenameCategory(cat, editingCatNewValue)}
                              className="p-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                              title="שמור שם"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingCatName(null)}
                              className="p-1.5 bg-[var(--foreground)]/5 text-slate-400 hover:bg-[var(--foreground)]/10 border border-[var(--border)] rounded-lg transition-colors cursor-pointer"
                              title="ביטול"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-semibold">{cat}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingCatName(cat);
                                  setEditingCatNewValue(cat);
                                }}
                                className="text-slate-500 hover:text-blue-500 p-1 transition-colors cursor-pointer"
                                title="ערוך קטגוריה"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {cat !== "כללי" && (
                                <button
                                  onClick={() => handleDeleteCategory(cat)}
                                  className="text-slate-500 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                                  title="מחק קטגוריה"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Duplicates Modal */}
        <AnimatePresence>
          {showDuplicatesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setShowDuplicatesModal(false)} 
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[2rem] shadow-2xl p-6 overflow-hidden flex flex-col gap-4 max-h-[85vh]"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-bold">תוצאות סריקת כפילויות בפול</h2>
                  </div>
                  <button 
                    onClick={() => setShowDuplicatesModal(false)} 
                    className="p-1.5 rounded-full hover:bg-[var(--foreground)]/5 text-slate-400 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-[var(--muted)] font-semibold">
                  נמצאו {duplicatePairs.length} זוגות מוצרים דומים בעלי שם או כתיב כמעט זהה. תוכל להשאיר מוצר אחד ולמחוק את הכפיל:
                </p>

                <div className="max-h-[50vh] overflow-y-auto pr-1 flex flex-col gap-3">
                  {duplicatePairs.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm font-bold">
                      🎉 לא נמצאו כפילויות בפול המוצרים!
                    </div>
                  ) : (
                    duplicatePairs.map(({ p1, p2 }, idx) => (
                      <div key={idx} className="bg-[var(--background)] border border-[var(--border)] p-3 rounded-xl flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-blue-500">{p1.name} <span className="text-[10px] text-slate-500">({p1.category})</span></span>
                          <span className="text-slate-400">מול</span>
                          <span className="text-purple-500">{p2.name} <span className="text-[10px] text-slate-500">({p2.category})</span></span>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)]/60 pt-2">
                          <button
                            onClick={() => handleMergeDeleteDuplicate(p2.id)}
                            className="px-2.5 py-1 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            מחק "{p2.name}"
                          </button>
                          <button
                            onClick={() => handleMergeDeleteDuplicate(p1.id)}
                            className="px-2.5 py-1 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            מחק "{p1.name}"
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex justify-end">
                  <button
                    onClick={() => setShowDuplicatesModal(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    סגור
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}
