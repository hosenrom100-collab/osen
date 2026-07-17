"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, writeBatch, getDoc, setDoc } from "firebase/firestore";
import { Package, Plus, Trash2, Tag, Search, ArrowRight, Loader2, Settings, X, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

interface Product {
  id: string;
  name: string;
  category: string;
}

export default function ShoppingPoolPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("כללי");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  
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
        batch.set(newDocRef, { name, category }, { merge: true });
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
        "קטגוריה": "גבינות ומחלבה"
      },
      {
        "מוצר": "נייר טואלט",
        "קטגוריה": "מוצרי נייר וחד פעמי"
      },
      {
        "מוצר": "עגבניות",
        "קטגוריה": "פירות וירקות"
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

          const docId = name.replace(/\//g, "-");
          const newDocRef = doc(db, "product_pool", docId);
          batch.set(newDocRef, { name, category }, { merge: true });
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
    if (!newName) return;

    try {
      const docId = newName.replace(/\//g, "-");
      await setDoc(doc(db, "product_pool", docId), {
        name: newName,
        category: newCategory
      });
      setProducts([...products.filter(p => p.id !== docId), { id: docId, name: newName, category: newCategory }].sort((a,b) => a.name.localeCompare(b.name)));
      setNewName("");
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

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics"]} redirectTo="/">
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 pb-24 md:p-8" dir="rtl">
        <header className="max-w-2xl mx-auto mb-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/shopping")}
                className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">ניהול פול מוצרים</h1>
                <p className="text-slate-400 text-sm">נהל את רשימת המוצרים הקבועים במערכת</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-500/10 text-slate-300 border border-slate-500/20 rounded-xl text-xs font-medium hover:bg-slate-500/20 transition-all cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>ניהול קטגוריות</span>
              </button>
              <button
                onClick={handleBulkImport}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl text-xs font-medium hover:bg-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                ייבוא מוצרי בסיס
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
                className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-medium hover:bg-indigo-500/20 transition-all cursor-pointer"
                title="הורדת תבנית אקסל להזנת מאגר מוצרים"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>תבנית יבוא</span>
              </button>
              <label
                htmlFor="import-excel-pool-file"
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium hover:bg-indigo-700 transition-all cursor-pointer shadow-sm shadow-indigo-600/15"
              >
                <Upload className="w-3.5 h-3.5 text-white" />
                <span>ייבוא מאקסל</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="חיפוש מוצר..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
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
                    <div className="flex gap-4">
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
                        className="w-40 bg-[var(--background)] border border-[var(--border)] rounded-xl px-2 text-xs focus:outline-none text-right"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-blue-600 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg shadow-blue-600/20">
                        הוסף לפול
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setIsAdding(false)}
                        className="px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs font-bold"
                      >
                        ביטול
                      </button>
                    </div>
                  </motion.form>
                )}

                {filtered.map((prod) => (
                  <motion.div
                    key={prod.id}
                    layout
                    className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-2xl flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[var(--background)] text-slate-500 rounded-xl flex items-center justify-center border border-[var(--border)]">
                        <Package className="w-5 h-5" />
                      </div>
                      <div className="text-right">
                        <h3 className="font-bold text-sm">{prod.name}</h3>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 justify-start">
                          <Tag className="w-3 h-3" />
                          {prod.category}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(prod.id)}
                      className="p-2 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

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

                {/* Add category form */}
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

                {/* Categories list */}
                <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-2">
                  {categories.map(cat => (
                    <div 
                      key={cat} 
                      className="flex items-center justify-between bg-[var(--background)] border border-[var(--border)] px-4 py-2.5 rounded-xl"
                    >
                      <span className="text-sm font-semibold">{cat}</span>
                      {cat !== "כללי" && (
                        <button 
                          onClick={() => handleDeleteCategory(cat)}
                          className="text-slate-500 hover:text-rose-500 p-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </RoleGuard>
  );
}
