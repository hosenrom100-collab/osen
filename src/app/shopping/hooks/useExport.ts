"use client";

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ShoppingRequest, Product, TargetFramework } from "../types";
import { toDateOrNull } from "../lib/dateUtils";
import { FRAMEWORK_LABELS } from "../lib/constants";
import { generateShoppingListWord, generateDocxWithLetterhead } from "@/lib/word-generator";

export function useExport(
  requests: ShoppingRequest[],
  pool: Product[],
  showToast: (message: string, type: "success" | "warning") => void
) {
  const exportItemsToWord = async (
    items: ShoppingRequest[],
    options: {
      title: string;
      subtitle?: string;
      filename: string;
      successMsg: string;
      includeFrameworkName?: boolean;
    }
  ) => {
    try {
      const sortedItems = [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      const itemsToExport = sortedItems.map((r) => {
        const poolMatch = pool.find((p) => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        const fwName = r.targetFramework ? (FRAMEWORK_LABELS[r.targetFramework] || r.targetFramework) : undefined;
        return {
          name: r.name,
          category: r.category,
          quantity: r.quantity || "1",
          notes: r.notes || poolMatch?.defaultNotes || "",
          requestedByName: r.requestedByName || "",
          frameworkName: options.includeFrameworkName ? fwName : undefined,
        };
      });

      const dateStr = format(new Date(), "dd/MM/yyyy");
      const docx = generateShoppingListWord(itemsToExport, {
        date: dateStr,
        title: options.title,
        subtitle: options.subtitle,
      });
      await generateDocxWithLetterhead(docx, `${options.filename}_${format(new Date(), "yyyy-MM-dd")}.docx`);
      showToast(options.successMsg, "success");
    } catch (e) {
      console.error(e);
      showToast("שגיאה בהפקת הקובץ. נסה שוב.", "warning");
    }
  };

  const exportOngoingList = async (framework: "all" | TargetFramework = "all") => {
    const active = requests.filter(
      (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType !== "large"
    );
    const filtered = framework === "all" ? active : active.filter((r) => (r.targetFramework || "main") === framework);

    const label = framework === "all" ? "מאוחדת" : FRAMEWORK_LABELS[framework] || framework;
    const frameworkTitle = `רשימת קניות סופר - ${label}`;
    const filename = `רשימת_קניות_${label.replace(/["״\s]/g, "_")}`;

    await exportItemsToWord(filtered, {
      title: frameworkTitle,
      subtitle: "מרכז חוסן - חרבות ברזל",
      filename,
      successMsg: `הופקה ${frameworkTitle} והורדה בהצלחה!`,
      includeFrameworkName: framework === "all",
    });
  };

  const exportProcurementList = async (framework: "all" | TargetFramework = "all") => {
    const active = requests.filter(
      (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType === "large"
    );
    const filtered = framework === "all" ? active : active.filter((r) => (r.targetFramework || "main") === framework);

    const label = framework === "all" ? "מאוחדת" : FRAMEWORK_LABELS[framework] || framework;
    const frameworkTitle = `רשימת רכש וציוד - ${label}`;
    const filename = `רשימת_רכש_${label.replace(/["״\s]/g, "_")}`;

    await exportItemsToWord(filtered, {
      title: frameworkTitle,
      subtitle: "מרכז חוסן - חרבות ברזל",
      filename,
      successMsg: `הופקה ${frameworkTitle} והורדה בהצלחה!`,
      includeFrameworkName: framework === "all",
    });
  };

  const exportSplitOngoingLists = async () => {
    await exportOngoingList("main");
    // small timeout so browser allows multiple downloads
    setTimeout(async () => {
      await exportOngoingList("lower");
    }, 600);
  };

  const exportSplitProcurementLists = async () => {
    await exportProcurementList("main");
    setTimeout(async () => {
      await exportProcurementList("lower");
    }, 600);
  };

  return {
    exportProcurementList,
    exportOngoingList,
    exportSplitOngoingLists,
    exportSplitProcurementLists,
  };
}

