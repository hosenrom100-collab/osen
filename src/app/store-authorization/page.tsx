"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  collection, addDoc, query, where, getDocs, orderBy, limit,
} from "firebase/firestore";
import {
  Plus, Trash2, Send, Loader2, ShoppingCart, ArrowLeft, AlertCircle, CheckCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StoreAuthorizationItem } from "@/app/shopping/types";

interface FormItem extends StoreAuthorizationItem {
  id: string;
}

const UNITS = ["יחידה", "ק״ג", "גרם", "ליטר", "מ״ל", "מארז", "עטיפה", "קופסה", "שקית", "פחית"];

export default function StoreAuthorizationPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<FormItem[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        productName: "",
        quantity: "",
        unit: "",
        status: "pending",
      },
    ]);
  };

  const updateItem = (id: string, field: keyof FormItem, value: string) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !items.length) {
      setToast({ message: "יש להוסיף לפחות מוצר אחד", type: "error" });
      return;
    }

    // Validate items
    if (items.some((item) => !item.productName.trim() || !item.quantity.trim())) {
      setToast({ message: "יש למלא שם מוצר וכמות עבור כל פריט", type: "error" });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get next request number
      const requestsRef = collection(db, "storeAuthorizationRequests");
      const q = query(requestsRef, orderBy("requestNumber", "desc"), limit(1));
      const snapshot = await getDocs(q);
      const nextNumber = snapshot.empty ? 1001 : snapshot.docs[0].data().requestNumber + 1;

      // Create request
      const cleanItems = items.map((item) => ({
        productName: item.productName.trim(),
        quantity: item.quantity.trim(),
        unit: item.unit?.trim() || "",
        status: "pending" as const,
      }));

      await addDoc(requestsRef, {
        requestNumber: nextNumber,
        requestedBy: user.uid,
        requestedByName: user.displayName || "משתמש ללא שם",
        items: cleanItems,
        status: "pending",
        createdAt: new Date(),
        notes: notes.trim() || "",
      });

      setToast({ message: `בקשה #${nextNumber} נשלחה בהצלחה`, type: "success" });
      setTimeout(() => router.push("/store-authorization/requests"), 1500);
    } catch (error) {
      console.error("Error creating request:", error);
      setToast({ message: "שגיאה בשליחת הבקשה", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics", "instructor", "social_worker", "employee"]}>
      <ConnectionStatusBanner />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link href="/admin">
              <button className="p-2 hover:bg-slate-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ShoppingCart className="w-6 h-6 text-blue-600" />
                בקשת קנייה בסופר
              </h1>
              <p className="text-sm text-amber-700 font-medium">⚠️ מקרים דחופים בלבד - קנייה עצמאית בסופר של מוצרים שלא בפול</p>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`max-w-3xl mx-auto mt-4 px-4 py-3 rounded-lg flex items-center gap-2 animate-pulse ${
              toast.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {toast.message}
          </div>
        )}

        {/* Form */}
        <div className="max-w-3xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Items Section */}
            <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-900">פריטים לקנייה</h2>
              </div>

              <div className="p-6 space-y-4">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>אין פריטים עדיין. לחץ להוספה למטה</p>
                  </div>
                ) : (
                  items.map((item, idx) => (
                    <div key={item.id} className="flex gap-3 items-start pb-4 border-b border-slate-200 last:border-0">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-sm font-medium text-blue-600">
                        {idx + 1}
                      </div>
                      <div className="flex-1 space-y-3">
                        <input
                          type="text"
                          placeholder="שם המוצר"
                          value={item.productName}
                          onChange={(e) => updateItem(item.id, "productName", e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            placeholder="כמות"
                            min="0"
                            step="0.1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            inputMode="decimal"
                          />
                          <select
                            value={item.unit || "יחידה"}
                            onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}

                <button
                  type="button"
                  onClick={addItem}
                  className="w-full mt-4 py-3 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition flex items-center justify-center gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" />
                  הוספת פריט
                </button>
              </div>
            </div>

            {/* Notes Section */}
            <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                הערות (אופציונלי)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות על הקנייה..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || items.length === 0}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  שליחה...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  שלח בקשה
                </>
              )}
            </button>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-medium mb-2">💡 תהליך:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>הבקשה נשלחת לאישור מירב</li>
                <li>יונפק אישור כתוב לפי המוצרים שאושרו</li>
                <li>האישור יצורף לחשבונית הקנייה</li>
              </ul>
            </div>
          </form>
        </div>
      </div>
    </RoleGuard>
  );
}
