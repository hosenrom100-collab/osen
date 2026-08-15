"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  collection, query, getDocs, orderBy, updateDoc, doc, deleteDoc,
} from "firebase/firestore";
import {
  Clock, CheckCircle, XCircle, FileText, Loader2, ArrowLeft,
  Download, ChevronDown, ChevronUp, Edit3, AlertCircle, Trash2,
} from "lucide-react";
import Link from "next/link";
import { StoreAuthorizationRequest, StoreAuthorizationItem } from "@/app/shopping/types";
import { sendPush } from "@/lib/notify";
import { openOrDownloadPdf } from "@/lib/pdf/downloadPdfHelper";

const statusColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  pending: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    icon: <Clock className="w-5 h-5" />,
  },
  approved: {
    bg: "bg-green-50",
    text: "text-green-700",
    icon: <CheckCircle className="w-5 h-5" />,
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    icon: <XCircle className="w-5 h-5" />,
  },
};

const statusLabels: Record<string, string> = {
  pending: "בהמתנה",
  approved: "אושר",
  rejected: "נדחה",
};

const getDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (date.toDate) return date.toDate();
  return new Date(date);
};

export default function StoreRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<StoreAuthorizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
  const [editedItems, setEditedItems] = useState<StoreAuthorizationItem[]>([]);
  const [loadingPdfId, setLoadingPdfId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [storeNames, setStoreNames] = useState<Record<string, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteRequest = async (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation();
    if (!window.confirm("האם אתה בטוח שברצונך למחוק לצמיתות בקשה זו מהשרת?")) return;
    try {
      await deleteDoc(doc(db, "storeAuthorizationRequests", requestId));
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast("הבקשה נמחקה לצמיתות מהשרת", "success");
      if (expandedId === requestId) {
        setExpandedId(null);
      }
    } catch (err) {
      console.error("Error deleting request:", err);
      showToast("שגיאה במחיקת הבקשה", "error");
    }
  };

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const q = query(
          collection(db, "storeAuthorizationRequests"),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as StoreAuthorizationRequest[];

        setRequests(data);

        // Initialize store names mapping
        const names: Record<string, string> = {};
        data.forEach((r) => {
          names[r.id] = r.storeName || "אברהם שיווק";
        });
        setStoreNames(names);
      } catch (error) {
        console.error("Error fetching requests:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  const handleApprove = async (requestId: string) => {
    try {
      setLoadingPdfId(requestId);
      const targetReq = requests.find((r) => r.id === requestId);
      let itemsToUpdate = editingRequest === requestId ? editedItems : targetReq?.items || [];
      const storeName = storeNames[requestId] || "אברהם שיווק";

      // Check if manager explicitly set ALL items to rejected during editing
      const allItemsExplicitlyRejected = itemsToUpdate.length > 0 && itemsToUpdate.every((item) => item.status === "rejected");
      if (allItemsExplicitlyRejected) {
        await handleReject(requestId);
        return;
      }

      // Mark all non-rejected items (pending or approved) as approved
      itemsToUpdate = itemsToUpdate.map((item) => ({
        ...item,
        status: item.status === "rejected" ? ("rejected" as const) : ("approved" as const),
      }));

      await updateDoc(doc(db, "storeAuthorizationRequests", requestId), {
        status: "approved",
        items: itemsToUpdate,
        approvedAt: new Date(),
        approvedBy: user?.uid,
        approvedByName: user?.displayName,
        storeName: storeName,
      });

      setEditingRequest(null);

      // Generate PDF (will only contain approved items)
      let finalPdfUrl = "";
      try {
        const pdfRes = await fetch(`/api/store-requests/${requestId}/generate-pdf`, {
          method: "POST",
        });
        const pdfData = await pdfRes.json();
        if (pdfData.pdfUrl) {
          finalPdfUrl = pdfData.pdfUrl;
        }
      } catch (pdfErr) {
        console.error("Error generating PDF during approval:", pdfErr);
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
              ...r,
              status: "approved" as const,
              items: itemsToUpdate,
              pdfUrl: finalPdfUrl || r.pdfUrl,
              approvedAt: new Date(),
              approvedBy: user?.uid || "",
              approvedByName: user?.displayName || "",
              storeName: storeName,
            }
            : r
        )
      );

      showToast("הבקשה אושרה והאישור הופק בהצלחה", "success");

      if (targetReq?.requestedBy) {
        sendPush({
          userId: targetReq.requestedBy,
          title: `✅ בקשת אישור קנייה אד הוק אושרה! (#${targetReq.requestNumber})`,
          body: `בקשת הקנייה שלך אושרה על ידי ${user?.displayName || "ההנהלה"}. אישור ה-PDF הרשמי מוכן להורדה.`,
          link: "/store-authorization/requests",
        });
      }
    } catch (error) {
      console.error("Error approving request:", error);
      showToast("שגיאה בעדכון הבקשה", "error");
    } finally {
      setLoadingPdfId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const reqData = requests.find((r) => r.id === requestId);

      await updateDoc(doc(db, "storeAuthorizationRequests", requestId), {
        status: "rejected",
        approvedAt: new Date(),
        approvedBy: user?.uid,
        approvedByName: user?.displayName,
        pdfUrl: null, // Clear any PDF URL completely for rejected requests
      });

      setRequests(
        requests.map((r) =>
          r.id === requestId
            ? {
              ...r,
              status: "rejected" as const,
              pdfUrl: undefined,
              approvedAt: new Date(),
              approvedBy: user?.uid || "",
              approvedByName: user?.displayName || "",
            }
            : r
        )
      );

      setEditingRequest(null);
      showToast("הבקשה נדחתה בהצלחה", "success");

      if (reqData?.requestedBy) {
        sendPush({
          userId: reqData.requestedBy,
          title: `❌ עדכון: בקשת אישור קנייה אד הוק נדחתה (#${reqData.requestNumber})`,
          body: `בקשת הקנייה שלך נדחתה על ידי ${user?.displayName || "ההנהלה"}. לחץ לצפייה בפרטים.`,
          link: "/store-authorization/requests",
        });
      }
    } catch (error) {
      console.error("Error rejecting request:", error);
      showToast("שגיאה בעדכון הבקשה", "error");
    }
  };

  const handleEditStart = (requestId: string) => {
    const request = requests.find((r) => r.id === requestId);
    if (request) {
      setEditingRequest(requestId);
      setEditedItems(JSON.parse(JSON.stringify(request.items)));
    }
  };

  const handleItemChange = (index: number, field: keyof StoreAuthorizationItem, value: string) => {
    const newItems = [...editedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditedItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setEditedItems(editedItems.filter((_, i) => i !== index));
  };

  const handleGeneratePdf = async (requestId: string) => {
    try {
      setLoadingPdfId(requestId);
      const targetReq = requests.find((r) => r.id === requestId);
      const res = await fetch(`/api/store-requests/${requestId}/generate-pdf`, { method: "POST" });
      const data = await res.json();
      if (data.pdfUrl) {
        setRequests(requests.map((r) => (r.id === requestId ? { ...r, pdfUrl: data.pdfUrl } : r)));
        showToast("האישור הופק בהצלחה", "success");
        openOrDownloadPdf(data.pdfUrl, `אישור_קנייה_${targetReq?.requestNumber || requestId}.pdf`);
      } else {
        showToast("שגיאה בהפקת ה-PDF", "error");
      }
    } catch (err) {
      console.error("Error generating PDF:", err);
      showToast("שגיאה בהפקת קובץ ה-PDF", "error");
    } finally {
      setLoadingPdfId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <RoleGuard allowedRoles={["admin", "manager", "logistics"]}>
      <ConnectionStatusBanner />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link href="/admin">
              <button className="p-2 hover:bg-slate-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">בקשות קנייה אד הוק</h1>
              <p className="text-sm text-slate-500">ניהול ואישור בקשות קנייה אד הוק</p>
            </div>
            {pendingRequests.length > 0 && (
              <div className="ml-auto bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                {pendingRequests.length} בהמתנה
              </div>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`max-w-5xl mx-auto mt-4 px-4 py-3 rounded-lg flex items-center gap-2 animate-pulse ${
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

        {/* Content */}
        <div className="max-w-5xl mx-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-lg shadow border border-slate-200 p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500 text-lg">אין בקשות</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-3">בהמתנה לאישור</h2>
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        isExpanded={expandedId === request.id}
                        onToggle={() =>
                          setExpandedId(expandedId === request.id ? null : request.id)
                        }
                        onApprove={() => handleApprove(request.id)}
                        onReject={() => handleReject(request.id)}
                        isEditing={editingRequest === request.id}
                        editedItems={editedItems}
                        onEditStart={() => handleEditStart(request.id)}
                        onEditCancel={() => setEditingRequest(null)}
                        onItemChange={handleItemChange}
                        onRemoveItem={handleRemoveItem}
                        onGeneratePdf={() => handleGeneratePdf(request.id)}
                        loadingPdfId={loadingPdfId}
                        onDelete={(e) => handleDeleteRequest(e, request.id)}
                        storeName={storeNames[request.id]}
                        onStoreNameChange={(val) => setStoreNames((prev) => ({ ...prev, [request.id]: val }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Processed Requests */}
              {processedRequests.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-3">בקשות מעובדות</h2>
                  <div className="space-y-3">
                    {processedRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        isExpanded={expandedId === request.id}
                        onToggle={() =>
                          setExpandedId(expandedId === request.id ? null : request.id)
                        }
                        isEditing={false}
                        onGeneratePdf={() => handleGeneratePdf(request.id)}
                        loadingPdfId={loadingPdfId}
                        onDelete={(e) => handleDeleteRequest(e, request.id)}
                        storeName={request.storeName || storeNames[request.id] || "אברהם שיווק"}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}

interface RequestCardProps {
  request: StoreAuthorizationRequest;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isEditing?: boolean;
  editedItems?: StoreAuthorizationItem[];
  onEditStart?: () => void;
  onEditCancel?: () => void;
  onItemChange?: (index: number, field: keyof StoreAuthorizationItem, value: string) => void;
  onRemoveItem?: (index: number) => void;
  onGeneratePdf?: () => void;
  loadingPdfId?: string | null;
  onDelete?: (e: React.MouseEvent) => void;
  storeName?: string;
  onStoreNameChange?: (val: string) => void;
}

function RequestCard({
  request,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  isEditing,
  editedItems,
  onEditStart,
  onEditCancel,
  onItemChange,
  onRemoveItem,
  onGeneratePdf,
  loadingPdfId,
  onDelete,
  storeName,
  onStoreNameChange,
}: RequestCardProps) {
  const status = statusColors[request.status];
  const isPending = request.status === "pending";

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 hover:shadow-md transition">
      {/* Header */}
      <div
        onClick={onToggle}
        className="p-4 cursor-pointer hover:bg-slate-50 transition"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-start justify-between flex-1">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-slate-900">
                  בקשה #{request.requestNumber}
                </span>
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${status.bg} ${status.text}`}
                >
                  {status.icon}
                  {statusLabels[request.status]}
                </div>
              </div>
              <p className="text-sm text-slate-600">
                <span className="font-medium">{request.requestedByName}</span>
                {" | "}
                {getDate(request.createdAt).toLocaleDateString("he-IL")}
              </p>
              {request.approvedByName && (
                <p className="text-xs text-slate-400 mt-1">
                  אושר על ידי: {request.approvedByName}
                  {" | "}
                  {getDate(request.approvedAt!).toLocaleDateString("he-IL")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(e);
                  }}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition active:scale-95 border-none cursor-pointer"
                  title="מחק בקשה לצמיתות מהשרת"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          {/* Items List */}
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 mb-3">פריטים:</h3>
            <div className="space-y-2">
              {(isEditing && editedItems ? editedItems : request.items).map(
                (item, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-3 rounded border border-slate-200"
                  >
                    {isEditing && isPending ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) =>
                            onItemChange?.(idx, "productName", e.target.value)
                          }
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          placeholder="שם המוצר"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={item.quantity}
                            onChange={(e) =>
                              onItemChange?.(idx, "quantity", e.target.value)
                            }
                            className="px-2 py-1 border border-slate-300 rounded text-sm"
                            placeholder="כמות"
                          />
                          <select
                            value={item.status}
                            onChange={(e) =>
                              onItemChange?.(
                                idx,
                                "status",
                                e.target.value as "pending" | "approved" | "rejected"
                              )
                            }
                            className="px-2 py-1 border border-slate-300 rounded text-sm"
                          >
                            <option value="pending">בהמתנה</option>
                            <option value="approved">אושר</option>
                            <option value="rejected">נדחה</option>
                          </select>
                        </div>
                        <button
                          onClick={() => onRemoveItem?.(idx)}
                          className="text-red-600 text-sm hover:underline"
                        >
                          הסרה
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-900">
                            {item.productName}
                          </p>
                          <p className="text-sm text-slate-600">
                            כמות: {item.quantity} {item.unit ? `(${item.unit})` : ""}
                          </p>
                        </div>
                        {item.status !== "pending" && (
                          <span
                            className={`text-sm font-medium px-2 py-1 rounded ${
                              item.status === "approved"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.status === "approved" ? "אושר" : "נדחה"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Store Name Input */}
          <div className="mb-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              שם החנות לאישור (לכבוד):
            </label>
            <input
              type="text"
              disabled={request.status !== "pending"}
              value={storeName || "אברהם שיווק"}
              onChange={(e) => onStoreNameChange?.(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:opacity-75 disabled:cursor-not-allowed"
              placeholder="אברהם שיווק"
            />
          </div>

          {/* Notes */}
          {request.notes && (
            <div className="mb-4 p-3 bg-white rounded border border-slate-200">
              <p className="text-sm font-medium text-slate-900 mb-1">הערות:</p>
              <p className="text-sm text-slate-600">{request.notes}</p>
            </div>
          )}

          {/* Actions */}
          {isPending && (
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <button
                    disabled={loadingPdfId !== null}
                    onClick={onEditStart}
                    className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Edit3 className="w-4 h-4" />
                    עריכה
                  </button>
                  <button
                    disabled={loadingPdfId !== null}
                    onClick={onApprove}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loadingPdfId === request.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    <span>{loadingPdfId === request.id ? "מאשר..." : "אישור"}</span>
                  </button>
                  <button
                    disabled={loadingPdfId !== null}
                    onClick={onReject}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    דחיה
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={loadingPdfId !== null}
                    onClick={onApprove}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loadingPdfId === request.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : null}
                    <span>{loadingPdfId === request.id ? "שומר..." : "שמור ואשר"}</span>
                  </button>
                  <button
                    disabled={loadingPdfId !== null}
                    onClick={onEditCancel}
                    className="flex-1 px-4 py-2 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 transition font-medium disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </>
              )}
            </div>
          )}

          {/* Approved - Download / Generate PDF Button */}
          {request.status === "approved" && (
            <div className="flex gap-2 mt-2">
              {request.pdfUrl ? (
                <button
                  type="button"
                  onClick={() => openOrDownloadPdf(request.pdfUrl!, `אישור_קנייה_${request.requestNumber}.pdf`)}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 !text-white rounded-xl hover:from-emerald-700 hover:to-green-700 transition font-bold text-xs flex items-center justify-center gap-2 shadow-sm border-none cursor-pointer"
                >
                  <Download className="w-4 h-4 text-white" />
                  <span>הורד אישור PDF חתום (מירב סארמילי)</span>
                </button>
              ) : (
                <button
                  disabled={loadingPdfId !== null}
                  onClick={onGeneratePdf}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50 !text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition font-bold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer border-none"
                >
                  {loadingPdfId === request.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <FileText className="w-4 h-4 text-white" />
                  )}
                  <span>{loadingPdfId === request.id ? "מפיק..." : "הפק והורד אישור PDF חתום"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
