"use client";

import { useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { format } from "date-fns";
import { db } from "@/lib/firebase/config";
import { ShoppingRequest } from "../types";
import { toDateOrNull } from "../lib/dateUtils";
import { useAdminPasswordGate } from "./useAdminPasswordGate";

export function useArchiveManagement(
  requests: ShoppingRequest[],
  showToast: (message: string, type: "success" | "warning") => void
) {
  const { verify: verifyAdminPassword } = useAdminPasswordGate();

  const [showArchivePrompt, setShowArchivePrompt] = useState(false);
  const [showResetArchiveModal, setShowResetArchiveModal] = useState(false);
  const [archivePassword, setArchivePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isClearingArchive, setIsClearingArchive] = useState(false);
  const [showDeleteArchiveDayModal, setShowDeleteArchiveDayModal] = useState(false);
  const [showCycleClosureModal, setShowCycleClosureModal] = useState(false);

  const triggerClearArchiveModal = () => {
    setArchivePassword("");
    setPasswordError("");
    setShowResetArchiveModal(true);
  };

  const handleConfirmResetArchive = async () => {
    const gateResult = await verifyAdminPassword(archivePassword.trim());
    if (!gateResult.success) {
      setPasswordError(gateResult.error || "סיסמת מנהל שגויה!");
      return;
    }

    setIsClearingArchive(true);
    try {
      const archivedItems = requests.filter((r) => r.status === "archived");
      if (archivedItems.length === 0) {
        showToast("הארכיון כבר ריק", "warning");
        setShowResetArchiveModal(false);
        return;
      }

      const batchSize = 450;
      for (let i = 0; i < archivedItems.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = archivedItems.slice(i, i + batchSize);
        chunk.forEach((item) => {
          batch.delete(doc(db, "shopping_requests", item.id));
        });
        await batch.commit();
      }

      showToast(`ארכיון הקניות אופס ונמחק בהצלחה! (${archivedItems.length} פריטים נמחקו)`, "success");
      setShowResetArchiveModal(false);
      setArchivePassword("");
      setPasswordError("");
    } catch (err) {
      console.error(err);
      showToast("שגיאה באיפוס הארכיון", "warning");
    } finally {
      setIsClearingArchive(false);
    }
  };

  // Delete a single archived day (scoped strictly to status === "archived" for that date;
  // never touches pending/approved/purchased items in the active list)
  const handleDeleteArchiveDay = async (
    dateKey: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const gateResult = await verifyAdminPassword(password);
    if (!gateResult.success) {
      return { success: false, error: gateResult.error || "סיסמת מנהל שגויה!" };
    }
    try {
      const toDelete = requests.filter((r) => {
        if (r.status !== "archived") return false;
        const d = toDateOrNull(r.archivedAt ?? r.updatedAt ?? r.createdAt);
        if (!d) return false;
        return format(d, "yyyy-MM-dd") === dateKey;
      });

      if (toDelete.length === 0) {
        showToast("לא נמצאו פריטים למחיקה ביום זה", "warning");
        return { success: true };
      }

      const batchSize = 450;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        toDelete.slice(i, i + batchSize).forEach((item) => {
          batch.delete(doc(db, "shopping_requests", item.id));
        });
        await batch.commit();
      }

      showToast(`נמחקו ${toDelete.length} פריטים מארכיון ${dateKey}`, "success");
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false, error: "שגיאה במחיקת היום מהארכיון" };
    }
  };

  return {
    verifyAdminPassword,
    showArchivePrompt, setShowArchivePrompt,
    showResetArchiveModal, setShowResetArchiveModal,
    archivePassword, setArchivePassword,
    passwordError, setPasswordError,
    isClearingArchive,
    showDeleteArchiveDayModal, setShowDeleteArchiveDayModal,
    showCycleClosureModal, setShowCycleClosureModal,
    triggerClearArchiveModal, handleConfirmResetArchive, handleDeleteArchiveDay,
  };
}
