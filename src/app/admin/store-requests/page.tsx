"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ConnectionStatusBanner } from "@/components/ui/ConnectionStatusBanner";
import { db } from "@/lib/firebase/config";
import {
  collection, query, getDocs, orderBy, updateDoc, doc,
} from "firebase/firestore";
import {
  Clock, CheckCircle, XCircle, FileText, Loader2, ArrowLeft,
  Download, ChevronDown, ChevronUp, Edit3, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { StoreAuthorizationRequest, StoreAuthorizationItem } from "@/app/shopping/types";
import { sendPush } from "@/lib/notify";

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
  rejected: "דחוי",
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
      const itemsToUpdate = editingRequest === requestId ? editedItems : requests.find((r) => r.id === requestId)?.items || [];

      await updateDoc(doc(db, "storeAuthorizationRequests", requestId), {
        status: "approved",
        items: itemsToUpdate,
        approvedAt: new Date(),
        approvedBy: user?.uid,
        approvedByName: user?.displayName,
      });

      setRequests(
        requests.map((r) =>
          r.id === requestId
            ? {
              ...r,
              status: "approved" as const,
              items: itemsToUpdate,
              approvedAt: new Date(),
              approvedBy: user?.uid || "",
              approvedByName: user?.displayName || "",
            }
            : r
        )
      );

      setEditingRequest(null);

      const reqData = requests.find((r) => r.id === requestId);

      // Generate PDF
      await fetch(`/api/store-requests/${requestId}/generate-pdf`, {
        method: "POST",
      });

      if (reqData?.requestedBy) {
        sendPush({
          userId: reqData.requestedBy,
          title: "אישור קנייה בסופר אושר! 🎉",
          body: `אישור PDF עבור בקשה #${reqData.requestNumber} מוכן להורדה`,
          link: "/store-authorization/requests",
        });
      }
    } catch (error) {
      console.error("Error approving request:", error);
      alert("שגיאה בעדכון הבקשה");
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
      });

      setRequests(
        requests.map((r) =>
          r.id === requestId
            ? {
              ...r,
              status: "rejected" as const,
              approvedAt: new Date(),
              approvedBy: user?.uid || "",
              approvedByName: user?.displayName || "",
            }
            : r
        )
      );

      setEditingRequest(null);

      if (reqData?.requestedBy) {
        sendPush({
          userId: reqData.requestedBy,
          title: "עדכון לבקשת קנייה בסופר ❌",
          body: `בקשה #${reqData.requestNumber} נדחתה על ידי ${user?.displayName || "מנהל"}. לחץ לצפייה בפרטים.`,
          link: "/store-authorization/requests",
        });
      }
    } catch (error) {
      console.error("Error rejecting request:", error);
      alert("שגיאה בעדכון הבקשה");
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
              <h1 className="text-xl font-bold">בקשות קנייה בסופר</h1>
              <p className="text-sm text-slate-500">ניהול ואישור בקשות קנייה</p>
            </div>
            {pendingRequests.length > 0 && (
              <div className="ml-auto bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                {pendingRequests.length} בהמתנה
              </div>
            )}
          </div>
        </div>

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
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
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
                            <option value="rejected">דחוי</option>
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
                            {item.status === "approved" ? "אושר" : "דחוי"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
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
                    onClick={onEditStart}
                    className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition font-medium flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    עריכה
                  </button>
                  <button
                    onClick={onApprove}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    אישור
                  </button>
                  <button
                    onClick={onReject}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    דחיה
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onApprove}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium"
                  >
                    שמור ואשר
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="flex-1 px-4 py-2 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 transition font-medium"
                  >
                    ביטול
                  </button>
                </>
              )}
            </div>
          )}

          {/* Approved - Download Button */}
          {request.status === "approved" && request.pdfUrl && (
            <div className="flex gap-2">
              <a
                href={request.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                הורד אישור PDF
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
