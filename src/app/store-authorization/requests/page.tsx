"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import {
  collection, query, where, getDocs, orderBy,
} from "firebase/firestore";
import {
  Clock, CheckCircle, XCircle, FileText, Loader2, ArrowLeft, Download,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StoreAuthorizationRequest } from "@/app/shopping/types";

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

export default function RequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<StoreAuthorizationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchRequests = async () => {
      try {
        const q = query(
          collection(db, "storeAuthorizationRequests"),
          where("requestedBy", "==", user.uid),
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
  }, [user]);

  const handleViewRequest = (id: string) => {
    router.push(`/store-authorization/${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/store-authorization">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">בקשותיי</h1>
            <p className="text-sm text-slate-500">בקשות קנייה בסופר שלי</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow border border-slate-200 p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500 text-lg">אין בקשות עדיין</p>
            <Link href="/store-authorization">
              <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                יצירת בקשה ראשונה
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const status = statusColors[request.status];
              return (
                <div
                  key={request.id}
                  onClick={() => handleViewRequest(request.id)}
                  className="bg-white rounded-lg shadow border border-slate-200 hover:shadow-md hover:border-slate-300 transition cursor-pointer p-4"
                >
                  <div className="flex items-start justify-between">
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
                      <p className="text-sm text-slate-500">
                        {request.items.length} פריטים
                        {" | "}
                        {getDate(request.createdAt).toLocaleDateString("he-IL")}
                      </p>
                      {request.approvedByName && (
                        <p className="text-xs text-slate-400 mt-1">
                          אושר על ידי: {request.approvedByName}
                        </p>
                      )}
                    </div>
                    {request.pdfUrl && request.status === "approved" && (
                      <div className="ml-4 shrink-0">
                        <a
                          href={request.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 !text-white rounded-xl transition text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 border-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-4 h-4 text-white" />
                          <span>הורד אישור PDF</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
