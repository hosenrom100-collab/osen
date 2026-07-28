"use client";

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ShoppingRequest, Product } from "../types";
import { toDateOrNull } from "../lib/dateUtils";
import { generateShoppingListWord, generateDocxWithLetterhead } from "@/lib/word-generator";

export function useExport(
  requests: ShoppingRequest[],
  pool: Product[],
  showToast: (message: string, type: "success" | "warning") => void
) {
  const exportProcurementList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType === "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map((r) => {
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          name: r.name,
          category: r.category,
          quantity: r.quantity || "1",
          notes: r.notes || poolMatch?.defaultNotes || "",
          requestedByName: r.requestedByName || "",
        };
      });
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const docx = generateShoppingListWord(itemsToExport, { date: dateStr, title: "רשימת רכש וציוד - חוות רום" });
      await generateDocxWithLetterhead(docx, `רשימת_רכש_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימת רכש והורדה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const exportOngoingList = async () => {
    try {
      const activeSession = requests.filter((r) => r.status !== "archived" && r.listType !== "large");
      const sortedItems = [...activeSession].sort((a, b) => a.category.localeCompare(b.category));
      const itemsToExport = sortedItems.map((r) => {
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          name: r.name,
          category: r.category,
          quantity: r.quantity || "1",
          notes: r.notes || poolMatch?.defaultNotes || "",
          requestedByName: r.requestedByName || "",
        };
      });
      const dateStr = format(new Date(), "dd/MM/yyyy");
      const docx = generateShoppingListWord(itemsToExport, { date: dateStr, title: "רשימת קניות שוטפת סופר - חוות רום" });
      await generateDocxWithLetterhead(docx, `רשימת_קניות_סופר_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast("הופקה רשימה שוטפת והורדה בהצלחה!", "success");
    } catch (e) {
      console.error(e);
    }
  };

  const exportXlsx = () => {
    const data = requests
      .filter((r) => r.status === "archived")
      .map((r) => {
        const d = toDateOrNull(r.createdAt) ?? new Date(0);
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return {
          תאריך: d.toLocaleDateString("he-IL"),
          מוצר: r.name,
          קטגוריה: r.category,
          כמות: r.quantity || "1",
          הערות: r.notes || poolMatch?.defaultNotes || "",
          מבקש: r.requestedByName,
        };
      });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ארכיון רכש");
    XLSX.writeFile(wb, `ארכיון_רכש_${new Date().toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`);
  };

  return { exportProcurementList, exportOngoingList, exportXlsx };
}
