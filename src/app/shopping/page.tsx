"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { ShoppingCart, Plus, Check, X, Clock, Package, Tag, User, Search, Filter, Loader2, ArrowRight, MoreVertical, Trash2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import * as XLSX from 'xlsx';

interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: 'pending' | 'approved' | 'purchased';
  requestedBy: string;
  requestedByName: string;
  createdAt: any;
  notes?: string;
  priority?: 'low' | 'normal' | 'urgent';
}

interface Product {
  id: string;
  name: string;
  category: string;
}

export default function ShoppingPage() {
  const { user, role, isAdmin } = useAuth();
  const [requests, setRequests] = useState<ShoppingRequest[]>([]);
  const [productPool, setProductPool] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [activeTab, setActiveTab] = useState<'requests' | 'logistics' | 'pool' | 'archive'>('requests');
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("כללי");
  const [newQuantity, setNewQuantity] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [editingPoolProduct, setEditingPoolProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState([
    "גבינות ומחלבה",
    "לחם ומאפים",
    "חומרי ניקוי",
    "מוצרי נייר וחד פעמי",
    "שימורים ובישול",
    "פירות וירקות",
    "טואלטיקה והיגיינה",
    "בשר ודגים",
    "קפואים",
    "כללי"
  ]);
  const router = useRouter();

  useEffect(() => {
    fetchProductPool();
    
    // Real-time listener for requests
    const q = query(collection(db, "shopping_requests"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ShoppingRequest[] = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as ShoppingRequest));
      setRequests(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchProductPool = async () => {
    try {
      const snap = await getDocs(collection(db, "product_pool"));
      const list: Product[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Product));
      list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      setProductPool(list);
    } catch (error) {
      console.error("Error fetching pool:", error);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newQuantity) return;

    try {
      await addDoc(collection(db, "shopping_requests"), {
        name: newName,
        category: newCategory,
        quantity: newQuantity,
        notes: newNotes,
        priority: newPriority,
        status: 'pending',
        requestedBy: user?.uid,
        requestedByName: user?.displayName || user?.email,
        createdAt: new Date(),
      });
      
      setIsAdding(false);
      setNewName("");
      setNewQuantity("");
      setNewNotes("");
    } catch (error) {
      console.error("Error adding request:", error);
    }
  };

  const handleQuickAdd = async (product: Product) => {
    // Check for duplicates in current pending/approved requests
    const isDuplicate = requests.some(r => r.name === product.name && (r.status === 'pending' || r.status === 'approved'));
    if (isDuplicate) {
      alert(`המוצר "${product.name}" כבר קיים ברשימה!`);
      return;
    }

    try {
      setJustAdded(product.id);
      setTimeout(() => setJustAdded(null), 1500);
      
      await addDoc(collection(db, "shopping_requests"), {
        name: product.name,
        category: product.category,
        quantity: "", 
        notes: "",
        status: 'pending',
        requestedBy: user?.uid,
        requestedByName: user?.displayName || user?.email,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error("Error quick adding:", error);
    }
  };

  const handleAddCustom = async (name: string) => {
    const isDuplicate = requests.some(r => r.name === name && (r.status === 'pending' || r.status === 'approved'));
    if (isDuplicate) {
      alert(`המוצר "${name}" כבר קיים ברשימה!`);
      return;
    }

    try {
      // 1. Add to pool
      const docId = name.replace(/\//g, "-");
      const poolRef = doc(db, "product_pool", docId);
      await setDoc(poolRef, { name, category: "כללי" }, { merge: true });
      
      // 2. Add to current list
      await addDoc(collection(db, "shopping_requests"), {
        name,
        category: "כללי",
        quantity: "",
        notes: "",
        status: 'pending',
        requestedBy: user?.uid,
        requestedByName: user?.displayName || user?.email,
        createdAt: new Date(),
      });
      
      setSearchTerm("");
      fetchProductPool();
    } catch (error) {
      console.error("Error adding custom:", error);
    }
  };

  const handleStatusChange = async (requestId: string, newStatus: 'pending' | 'approved' | 'purchased' | 'deleted', extraData = {}) => {
    try {
      if (newStatus === 'deleted') {
        await deleteDoc(doc(db, "shopping_requests", requestId));
      } else {
        await updateDoc(doc(db, "shopping_requests", requestId), { 
          status: newStatus,
          updatedAt: new Date(),
          updatedBy: user?.uid,
          ...extraData
        });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  useEffect(() => {
    const loadCategories = async () => {
      const docRef = doc(db, "settings", "shopping");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().categories) {
        setCategories(docSnap.data().categories);
      }
    };
    loadCategories();
  }, []);

  const addCategory = async () => {
    const cat = prompt("הזן שם לקטגוריה חדשה:");
    if (!cat || categories.includes(cat)) return;
    const newCats = [...categories, cat];
    setCategories(newCats);
    await setDoc(doc(db, "settings", "shopping"), { categories: newCats }, { merge: true });
  };

  const handleUpdatePoolProduct = async (id: string, name: string, category: string) => {
    try {
      await updateDoc(doc(db, "product_pool", id), { name, category });
      setEditingPoolProduct(null);
      fetchProductPool();
    } catch (err) {
      console.error(err);
      alert("שגיאה בעדכון המוצר");
    }
  };

  const categoriesUI = categories; // Alias for backward compatibility if needed

  const handleBulkImport = async () => {
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
      const { writeBatch, doc } = await import("firebase/firestore");
      const batch = writeBatch(db);
      for (const [category, name] of baseProducts) {
        const docId = name.replace(/\//g, "-");
        const newDocRef = doc(db, "product_pool", docId);
        batch.set(newDocRef, { name, category }, { merge: true });
      }
      await batch.commit();
      await fetchProductPool();
      alert("כל המוצרים יובאו בהצלחה!");
    } catch (err) {
      console.error(err);
      alert("שגיאה בייבוא");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'גבינות ומחלבה': return <div className="w-8 h-8 bg-yellow-500/10 text-yellow-500 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      case 'בשר ודגים': return <div className="w-8 h-8 bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      case 'פירות וירקות': return <div className="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      case 'חומרי ניקוי': return <div className="w-8 h-8 bg-cyan-500/10 text-cyan-500 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      case 'מוצרי נייר וחד פעמי': return <div className="w-8 h-8 bg-slate-500/10 text-slate-500 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      case 'לחם ומאפים': return <div className="w-8 h-8 bg-amber-700/10 text-amber-700 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
      default: return <div className="w-8 h-8 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center"><Package className="w-4 h-4" /></div>;
    }
  };

  const filteredRequests = requests.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved');
  const archivedRequests = filteredRequests.filter(r => r.status === 'purchased');

  const canApprove = isAdmin || role === 'manager' || role === 'logistics';
  const canPurchase = isAdmin || role === 'manager' || role === 'logistics';

  const GroupedRequests = ({ items, title, colorClass, icon: Icon }: { items: ShoppingRequest[], title: string, colorClass: string, icon: any }) => {
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, ShoppingRequest[]>);

    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className={`text-sm font-black flex items-center gap-2 ${colorClass}`}>
            <Icon className="w-4 h-4" />
            {title} ({items.length})
          </h2>
        </div>
        
        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full w-fit">
              {getCategoryIcon(category)}
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{category}</span>
            </div>
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {catItems.map((req) => (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`bg-white/5 border p-4 rounded-[2rem] flex items-center justify-between group relative overflow-hidden transition-all ${req.priority === 'urgent' ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)]' : 'border-white/5'}`}
                  >
                    <div className="absolute top-0 right-0 w-1 h-full opacity-20 bg-current" style={{ color: req.priority === 'urgent' ? '#f43f5e' : colorClass.includes('emerald') ? '#10b981' : '#f59e0b' }} />
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            defaultValue={req.name}
                            onBlur={(e) => {
                              if (e.target.value !== req.name) {
                                handleStatusChange(req.id, req.status, { name: e.target.value });
                              }
                            }}
                            className="bg-transparent border-none font-bold text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mr-1"
                          />
                          {req.priority === 'urgent' && (
                            <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse">דחוף</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <select 
                            defaultValue={req.category}
                            onChange={(e) => handleStatusChange(req.id, req.status, { category: e.target.value })}
                            className="bg-white/5 border-none text-[10px] text-slate-500 flex items-center gap-1 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded pr-1"
                          >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <span className="text-[10px] text-slate-500 font-bold">|</span>
                          <button 
                            onClick={() => handleStatusChange(req.id, req.status, { priority: req.priority === 'urgent' ? 'normal' : 'urgent' })}
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md transition-all ${req.priority === 'urgent' ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-500'}`}
                          >
                            {req.priority === 'urgent' ? 'דחוף 🔥' : 'סמן דחוף'}
                          </button>
                          <span className="text-[10px] text-slate-500 font-bold">|</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-blue-400 font-bold">כמות:</span>
                            <input 
                              type="text"
                              defaultValue={req.quantity}
                              placeholder="..."
                              onBlur={(e) => {
                                if (e.target.value !== req.quantity) {
                                  handleStatusChange(req.id, req.status, { quantity: e.target.value });
                                }
                              }}
                              className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white w-14 focus:outline-none focus:border-blue-500 transition-all"
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold mx-1">|</span>
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] text-slate-500 font-medium">{req.requestedByName || 'אנונימי'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          {canApprove && (
                            <>
                              <button 
                                onClick={() => handleStatusChange(req.id, 'approved')}
                                className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded-xl hover:bg-emerald-500/20 transition-all"
                                title="אשר רכישה"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleStatusChange(req.id, 'deleted')}
                                className="p-2.5 bg-rose-500/10 text-rose-400 border border-rose-500/10 rounded-xl hover:bg-rose-500/20 transition-all"
                                title="דחה בקשה"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {!canApprove && req.requestedBy === user?.uid && (
                            <button 
                              onClick={() => handleStatusChange(req.id, 'deleted')}
                              className="p-2.5 bg-white/5 text-slate-500 rounded-xl hover:text-rose-400 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        canPurchase && req.status === 'approved' && (
                          <button 
                            onClick={() => handleStatusChange(req.id, 'purchased')}
                            className="flex flex-col items-center gap-1 bg-emerald-500 text-white p-3 rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                          >
                            <Check className="w-5 h-5" />
                            <span className="text-[8px] font-black uppercase">נרכש</span>
                          </button>
                        )
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </section>
    );
  };
  
  const ShoppingArchive = ({ items }: { items: ShoppingRequest[] }) => {
    const groupedByDate = items.reduce((acc, item) => {
      const date = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
      const dateStr = date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(item);
      return acc;
    }, {} as Record<string, ShoppingRequest[]>);

    const exportToExcel = () => {
      const data = items.map(req => {
        const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
        return {
          'תאריך': date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          'מוצר': req.name,
          'קטגוריה': req.category,
          'כמות': req.quantity || '1',
          'מבקש': req.requestedByName || 'אנונימי',
          'סטטוס': 'נרכש'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data, { header: ['תאריך', 'מוצר', 'קטגוריה', 'כמות', 'מבקש', 'סטטוס'] });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ארכיון רכש");
      XLSX.writeFile(workbook, `ארכיון_רכש_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.xlsx`);
    };

    return (
      <section className="space-y-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-black flex items-center gap-2 text-slate-400">
            <Clock className="w-4 h-4" />
            ארכיון רכישות שבוצעו
          </h2>
          {items.length > 0 && (
            <button 
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-black hover:bg-emerald-600/20 transition-all shadow-lg active:scale-95"
            >
              <Package className="w-3.5 h-3.5" />
              ייצוא לאקסל
            </button>
          )}
        </div>
        
        {Object.entries(groupedByDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, dateItems]) => (
          <div key={date} className="space-y-4">
            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl w-fit">
              <span className="text-[11px] font-black text-blue-400">{date}</span>
              <span className="text-[10px] text-slate-500 font-bold">({dateItems.length} מוצרים)</span>
            </div>
            <div className="grid gap-2">
              {dateItems.map((req) => (
                <div key={req.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between opacity-80">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-200 line-through decoration-slate-600">{req.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500">{req.category}</span>
                        <span className="text-[10px] text-slate-500">|</span>
                        <span className="text-[10px] text-slate-500">כמות: {req.quantity || '1'}</span>
                        <span className="text-[10px] text-slate-500">|</span>
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-600" />
                          <span className="text-[10px] text-slate-600 font-medium">{req.requestedByName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('האם למחוק פריט זה מהארכיון לצמיתות?')) {
                        handleStatusChange(req.id, 'deleted');
                      }
                    }}
                    className="p-2 text-slate-700 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[3rem]">
            <Clock className="w-12 h-12 text-slate-800 mx-auto mb-4 opacity-20" />
            <p className="text-slate-500 text-sm italic">הארכיון ריק כרגע.</p>
          </div>
        )}
      </section>
    );
  };
  return (
    <RoleGuard allowedRoles={["admin", "manager", "instructor", "social_worker", "employee", "logistics"]} redirectTo="/">
      <main className="min-h-screen bg-slate-950 text-white p-4 pb-24 md:p-8">
        <header className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push("/")}
                className="p-2.5 bg-white/5 border border-white/10 rounded-2xl active:scale-95 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-3">
                  <ShoppingCart className="w-6 h-6 text-blue-400" />
                  רשימת קניות חכמה
                </h1>
                <p className="text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">ניהול רכש ומלאי שוטף</p>
              </div>
            </div>
            
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-2xl font-bold transition-all text-sm shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              בקשה חדשה
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="חיפוש מהיר או הזנת מוצר..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (activeTab !== 'pool') setActiveTab('pool');
              }}
              className="w-full bg-white/5 border border-white/10 rounded-[1.25rem] py-4 pr-11 pl-4 text-sm focus:outline-none focus:border-blue-500 transition-all shadow-xl shadow-black/20"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-1 bg-white/10 rounded-full hover:bg-white/20 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </header>

        <div className="max-w-4xl mx-auto mb-6 flex bg-white/5 p-1 rounded-2xl border border-white/10">
          <button 
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'requests' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Clock className="w-4 h-4" />
            בקשות ({pendingRequests.length})
          </button>
          <button 
            onClick={() => setActiveTab('logistics')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'logistics' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <ShoppingCart className="w-4 h-4" />
            לוגיסטיקה ({approvedRequests.length})
          </button>
          <button 
            onClick={() => setActiveTab('pool')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'pool' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Package className="w-4 h-4" />
            פול
          </button>
          <button 
            onClick={() => setActiveTab('archive')}
            className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'archive' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Clock className="w-4 h-4" />
            ארכיון
          </button>
        </div>

        <div className="max-w-4xl mx-auto space-y-12">
          {activeTab === 'requests' && (
            <GroupedRequests 
              items={pendingRequests} 
              title="ממתין לאישור" 
              colorClass="text-amber-400" 
              icon={Clock} 
            />
          )}

          {activeTab === 'logistics' && (
            <div className="space-y-8">
              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-400">התקדמות קניות</span>
                  <span className="text-xs font-black text-emerald-400">
                    {requests.filter(r => r.status === 'purchased').length} / {requests.filter(r => r.status === 'approved' || r.status === 'purchased').length} מוצרים
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(requests.filter(r => r.status === 'purchased').length / (requests.filter(r => r.status === 'approved' || r.status === 'purchased').length || 1)) * 100}%` }}
                    className="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                  />
                </div>
              </div>
              <GroupedRequests 
                items={approvedRequests} 
                title="רשימת רכש ללוגיסטיקה" 
                colorClass="text-emerald-400" 
                icon={ShoppingCart} 
              />
            </div>
          )}

          {activeTab === 'pool' && (
            <section className="space-y-12">
              {productPool.length > 0 && searchTerm === "" && (
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                    <Clock className="w-3 h-3 text-blue-400" />
                    מוצרים בשימוש תדיר
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {productPool
                      .filter(p => requests.some(r => r.name === p.name))
                      .slice(0, 4)
                      .map(product => (
                        <motion.button
                          key={`freq-${product.id}`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleQuickAdd(product)}
                          className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-[2rem] text-center hover:bg-blue-600/20 transition-all group relative overflow-hidden"
                        >
                          <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {justAdded === product.id ? <CheckCircle2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                          </div>
                          <span className="text-[11px] font-black text-white block truncate">{product.name}</span>
                        </motion.button>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4 px-2 pt-4 border-t border-white/5">
                <h2 className="text-sm font-black flex items-center gap-2 text-blue-400">
                  <Package className="w-4 h-4" />
                  פול מוצרים נפוצים
                </h2>
                  <button 
                    onClick={() => router.push("/admin/shopping-pool")}
                    className="text-[10px] text-blue-400 font-bold underline"
                  >
                    נהל פול
                  </button>
              </div>

              {searchTerm && !productPool.some(p => p.name === searchTerm) && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => handleAddCustom(searchTerm)}
                  className="w-full bg-blue-600/10 border border-blue-500/30 p-8 rounded-[3rem] text-center hover:bg-blue-600/20 transition-all group mb-8"
                >
                  <p className="text-xs font-bold text-blue-400 mb-2">המוצר "<span className="text-white">{searchTerm}</span>" לא קיים בפול</p>
                  <div className="flex items-center justify-center gap-3 text-white font-black text-lg">
                    <Plus className="w-6 h-6" />
                    הוסף לפול ולרשימת הקניות עכשיו
                  </div>
                </motion.button>
              )}

              {Object.entries(
                productPool
                  .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()))
                  .reduce((acc, p) => {
                    if (!acc[p.category]) acc[p.category] = [];
                    acc[p.category].push(p);
                    return acc;
                  }, {} as Record<string, Product[]>)
              ).map(([category, products]) => (
                <div key={category} className="space-y-4">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl w-fit">
                    {getCategoryIcon(category)}
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{category}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {products.map((product) => (
                      <div key={product.id} className="relative group">
                        <motion.div
                          layout
                          whileHover={{ y: -5 }}
                          onClick={() => handleQuickAdd(product)}
                          className="w-full bg-white/5 border border-white/5 p-6 rounded-[2.5rem] text-right hover:bg-white/10 transition-all relative overflow-hidden flex flex-col items-center text-center h-full shadow-xl shadow-black/20 cursor-pointer"
                        >
                          <div className="absolute top-0 right-0 w-1.5 h-full opacity-20 bg-blue-500" />
                          
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPoolProduct(product);
                              }}
                              className="absolute top-3 left-3 p-2.5 bg-blue-600 text-white rounded-2xl opacity-0 group-hover:opacity-100 transition-all shadow-lg active:scale-90 z-20"
                            >
                              <Filter className="w-3.5 h-3.5" />
                            </button>

                          <div className="w-16 h-16 bg-white/5 text-blue-400 rounded-[1.5rem] flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner border border-white/5">
                            {justAdded === product.id ? <CheckCircle2 className="w-8 h-8 text-emerald-400" /> : <Plus className="w-8 h-8" />}
                          </div>

                          <h3 className="font-black text-sm leading-tight group-hover:text-white transition-colors">{product.name}</h3>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {productPool.length === 0 && (
                <div className="text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[3rem]">
                  <Package className="w-12 h-12 text-slate-800 mx-auto mb-4 opacity-20" />
                  <p className="text-slate-400 text-sm mb-8">רשימת המוצרים שלך ריקה.</p>
                  <button 
                    onClick={handleBulkImport}
                    disabled={loading}
                    className="bg-blue-600 text-white px-10 py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-blue-600/30 active:scale-95 transition-all flex items-center gap-3 mx-auto"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                    ייבוא כל המוצרים עכשיו
                  </button>
                </div>
              )}
            </section>
          )}

          {activeTab === 'archive' && (
            <ShoppingArchive items={archivedRequests} />
          )}
        </div>

        {/* Floating Add Modal */}
        <AnimatePresence>
          {isAdding && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAdding(false)}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative bg-slate-900 border-t sm:border border-white/10 w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl p-8"
              >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 sm:hidden" />
                
                <h2 className="text-2xl font-bold mb-2 tracking-tight">בקשת רכש חדשה</h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase mb-8 tracking-widest">הזן פרטי מוצר וכמות מבוקשת</p>

                <form onSubmit={handleSubmitRequest} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 mr-1">שם המוצר</label>
                    <div className="relative">
                      <input 
                        list="product-pool-list"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value);
                          const prod = productPool.find(p => p.name === e.target.value);
                          if (prod) setNewCategory(prod.category);
                        }}
                        placeholder="מה צריך לקנות?"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:border-blue-500 transition-all"
                        required
                      />
                      <datalist id="product-pool-list">
                        {productPool.map(p => <option key={p.id} value={p.name} />)}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 mr-1">קטגוריה</label>
                      <select 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:border-blue-500 transition-all appearance-none"
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 mr-1">כמות / יחידות</label>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {["1", "2", "5", "10", "ק\"ג", "ארגז"].map(q => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setNewQuantity(q)}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${newQuantity === q ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                        <input 
                          type="text"
                          value={newQuantity}
                          onChange={(e) => setNewQuantity(e.target.value)}
                          placeholder="כמות (אופציונלי)"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:border-blue-500 transition-all"
                        />
                      </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-3 mr-1 text-center">רמת דחיפות</label>
                      <div className="flex gap-2">
                        {(['normal', 'urgent'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setNewPriority(p)}
                            className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 border-2 ${newPriority === p 
                              ? p === 'urgent' ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20'
                              : 'bg-white/5 border-transparent text-slate-500 hover:bg-white/10'}`}
                          >
                            {p === 'urgent' ? <Clock className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                            {p === 'urgent' ? 'דחוף ביותר' : 'רגיל'}
                          </button>
                        ))}
                      </div>
                    </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 mr-1">הערות נוספות (אופציונלי)</label>
                    <textarea 
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="דגשים מיוחדים..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:border-blue-500 transition-all h-24 resize-none"
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="submit"
                      className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                    >
                      שלח לאישור
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all"
                    >
                      ביטול
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {/* Pool Edit Modal */}
        <AnimatePresence>
          {editingPoolProduct && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[3rem] p-8 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black flex items-center gap-3 text-white">
                    <Tag className="w-6 h-6 text-blue-400" />
                    עריכת מוצר בפול
                  </h2>
                  <button onClick={() => setEditingPoolProduct(null)} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3 mr-1">שם המוצר</label>
                    <input 
                      type="text"
                      defaultValue={editingPoolProduct.name}
                      id="edit-pool-name"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-lg font-bold focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3 mr-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">קטגוריה</label>
                      <button onClick={addCategory} className="text-[10px] text-blue-400 font-bold hover:underline">+ הוסף קטגוריה</button>
                    </div>
                    <select 
                      defaultValue={editingPoolProduct.category}
                      id="edit-pool-category"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-lg font-bold focus:outline-none focus:border-blue-500 transition-all appearance-none"
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={() => {
                      const name = (document.getElementById("edit-pool-name") as HTMLInputElement).value;
                      const category = (document.getElementById("edit-pool-category") as HTMLSelectElement).value;
                      handleUpdatePoolProduct(editingPoolProduct.id, name, category);
                    }}
                    className="flex-1 bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                  >
                    שמור שינויים
                  </button>
                  <button 
                    onClick={() => setEditingPoolProduct(null)}
                    className="flex-1 bg-white/5 text-slate-400 py-5 rounded-2xl font-bold text-lg active:scale-95 transition-all"
                  >
                    ביטול
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
