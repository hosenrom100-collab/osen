"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { Package, Plus, Trash2, Tag, Search, ArrowRight, Loader2, Edit2, Save, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    fetchProducts();
  }, []);

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
      ["חומרי ניקוי", "ספריי חלונות"], ["חומרי ניקוי", "אקונומיקה"], ["חומרי ניקוי", "טבליות למדיח"],
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
        // Use a sanitized name or the name itself as the ID to prevent duplicates
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

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    try {
      const docRef = await addDoc(collection(db, "product_pool"), {
        name: newName,
        category: newCategory
      });
      setProducts([...products, { id: docRef.id, name: newName, category: newCategory }].sort((a,b) => a.name.localeCompare(b.name)));
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

  const categories = ["כללי", "ניקיון", "מזון", "משרדי", "תחזוקה", "אחר"];

  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-4 pb-24 md:p-8">
        <header className="max-w-2xl mx-auto mb-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/shopping")}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold">ניהול פול מוצרים</h1>
                <p className="text-slate-400 text-sm">נהל את רשימת המוצרים הקבועים במערכת</p>
              </div>
            </div>
            <button
              onClick={handleBulkImport}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl text-sm font-medium hover:bg-purple-500/20 transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              ייבוא מוצרי בסיס
            </button>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="חיפוש מוצר..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all"
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
                    className="bg-white/10 border border-blue-500/30 p-4 rounded-[1.5rem] flex flex-col gap-4 shadow-2xl shadow-blue-500/10"
                  >
                    <div className="flex gap-4">
                      <input 
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="שם המוצר החדש..."
                        className="flex-1 bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-blue-500"
                        required
                      />
                      <select 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-32 bg-black/20 border border-white/10 rounded-xl px-2 text-xs focus:outline-none"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-blue-600 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20">
                        הוסף לפול
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setIsAdding(false)}
                        className="px-4 py-2.5 bg-white/5 rounded-xl text-xs font-bold"
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
                    className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/5 text-slate-500 rounded-xl flex items-center justify-center">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">{prod.name}</h3>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
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
      </main>
    </RoleGuard>
  );
}
