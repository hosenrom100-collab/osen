"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle, Clock, XCircle, Download } from "lucide-react";
import { StoreAuthorizationRequest } from "@/app/shopping/types";
import { openOrDownloadPdf } from "@/lib/pdf/downloadPdfHelper";

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "בהמתנה", color: "text-yellow-700 bg-yellow-50" },
  approved: { label: "אושר", color: "text-green-700 bg-green-50" },
  rejected: { label: "נדחה", color: "text-red-700 bg-red-50" },
};

const getDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (date.toDate) return date.toDate();
  return new Date(date);
};

export default function RequestDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [request, setRequest] = useState<StoreAuthorizationRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) return;

    const fetchRequest = async () => {
      try {
        const docSnapshot = await getDoc(
          doc(db, "storeAuthorizationRequests", requestId)
        );

        if (docSnapshot.exists()) {
          setRequest({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          } as StoreAuthorizationRequest);
        }
      } catch (error) {
        console.error("Error fetching request:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [requestId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow border border-slate-200 p-8 text-center">
          <p className="text-slate-600 mb-4">בקשה לא נמצאה</p>
          <Link href="/store-authorization/requests">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              חזרה לבקשותיי
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const status = statusLabels[request.status];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/store-authorization/requests">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">בקשה #{request.requestNumber}</h1>
            <div className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
              {status.label}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Info Card */}
        <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">שם המבקש</p>
              <p className="font-semibold text-slate-900">{request.requestedByName}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">תאריך בקשה</p>
              <p className="font-semibold text-slate-900">
                {getDate(request.createdAt).toLocaleDateString("he-IL")}
              </p>
            </div>
            {request.approvedByName && (
              <>
                <div>
                  <p className="text-sm text-slate-500">אושר על ידי</p>
                  <p className="font-semibold text-slate-900">{request.approvedByName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">תאריך אישור</p>
                  <p className="font-semibold text-slate-900">
                    {request.approvedAt
                      ? getDate(request.approvedAt).toLocaleDateString("he-IL")
                      : "-"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Items Section */}
        <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">פריטים ({request.items.length})</h2>
          </div>

          <div className="divide-y divide-slate-200">
            {request.items.map((item, idx) => (
              <div key={idx} className="p-4 hover:bg-slate-50 transition">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{item.productName}</p>
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
                      {item.status === "approved" ? "✓ אושר" : "✗ נדחה"}
                    </span>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-slate-500 mt-1">הערה: {item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Notes Section */}
        {request.notes && (
          <div className="bg-white rounded-lg shadow border border-slate-200 p-6">
            <p className="text-sm font-semibold text-slate-900 mb-2">הערות:</p>
            <p className="text-slate-600">{request.notes}</p>
          </div>
        )}

        {/* PDF Download */}
        {request.status === "approved" && request.pdfUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <p className="text-sm font-semibold text-green-900 mb-4">אישור PDF זמין</p>
            <button
              type="button"
              onClick={() => openOrDownloadPdf(request.pdfUrl!, `אישור_קנייה_${request.requestNumber}.pdf`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition cursor-pointer font-bold border-none"
            >
              <Download className="w-4 h-4 text-white" />
              <span>הורד אישור PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
