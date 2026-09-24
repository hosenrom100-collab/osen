"use client";

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ShoppingRequest, Product, TargetFramework } from "../types";
import { toDateOrNull } from "../lib/dateUtils";
import { FRAMEWORK_LABELS, TARGET_FRAMEWORKS } from "../lib/constants";
import { buildShareText } from "../lib/shareText";
import { generateShoppingListWord, generateDocxWithLetterhead } from "@/lib/word-generator";

export function useExport(
  requests: ShoppingRequest[],
  pool: Product[],
  showToast: (message: string, type: "success" | "warning") => void,
  categories: string[] = []
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

    if (filtered.length === 0) {
      showToast(`אין פריטים פעילים ברשימה עבור "${label}"`, "warning");
      return;
    }

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

    if (filtered.length === 0) {
      showToast(`אין פריטים פעילים ברשימה עבור "${label}"`, "warning");
      return;
    }

    await exportItemsToWord(filtered, {
      title: frameworkTitle,
      subtitle: "מרכז חוסן - חרבות ברזל",
      filename,
      successMsg: `הופקה ${frameworkTitle} והורדה בהצלחה!`,
      includeFrameworkName: framework === "all",
    });
  };

  const exportSplitOngoingLists = async () => {
    const active = requests.filter(
      (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType !== "large"
    );
    const frameworksWithItems = TARGET_FRAMEWORKS.filter((fw) =>
      active.some((r) => (r.targetFramework || "main") === fw.id)
    );

    if (frameworksWithItems.length === 0) {
      showToast("אין פריטים פעילים לייצוא", "warning");
      return;
    }

    for (let i = 0; i < frameworksWithItems.length; i++) {
      const fw = frameworksWithItems[i];
      if (i === 0) {
        await exportOngoingList(fw.id);
      } else {
        setTimeout(async () => {
          await exportOngoingList(fw.id);
        }, i * 800);
      }
    }
  };

  const exportSplitProcurementLists = async () => {
    const active = requests.filter(
      (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType === "large"
    );
    const frameworksWithItems = TARGET_FRAMEWORKS.filter((fw) =>
      active.some((r) => (r.targetFramework || "main") === fw.id)
    );

    if (frameworksWithItems.length === 0) {
      showToast("אין פריטים פעילים לייצוא", "warning");
      return;
    }

    for (let i = 0; i < frameworksWithItems.length; i++) {
      const fw = frameworksWithItems[i];
      if (i === 0) {
        await exportProcurementList(fw.id);
      } else {
        setTimeout(async () => {
          await exportProcurementList(fw.id);
        }, i * 800);
      }
    }
  };

  // Native share sheet on phones (straight into WhatsApp); clipboard where there isn't one.
  const shareList = async (
    listType: "supermarket" | "large",
    framework: "all" | TargetFramework = "all",
    deliveryDay?: string
  ) => {
    const items = requests.filter(
      (r) =>
        (r.status === "approved" || r.status === "pending") &&
        (listType === "large" ? r.listType === "large" : r.listType !== "large") &&
        (framework === "all" || (r.targetFramework || "main") === framework)
    );

    if (items.length === 0) {
      showToast("אין פריטים פתוחים לשיתוף", "warning");
      return;
    }

    const text = buildShareText(items, { listType, framework, categories, deliveryDay });

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error("Share failed, falling back to clipboard:", e);
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast("הרשימה הועתקה — אפשר להדביק בוואטסאפ", "success");
    } catch (e) {
      console.error(e);
      showToast("לא ניתן היה לשתף את הרשימה. נסה שוב.", "warning");
    }
  };

  return {
    shareList,
    exportProcurementList,
    exportOngoingList,
    exportSplitOngoingLists,
    exportSplitProcurementLists,
  };
}

