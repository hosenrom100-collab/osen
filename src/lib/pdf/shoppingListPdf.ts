import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ShoppingListExportData } from "@/lib/word-generator";

// Heebo files are already small (~44KB each); they are embedded once per PDF and the
// document is compressed, so a typical list stays well under 100KB.
const fontCache: Record<string, string> = {};

async function loadFont(file: string): Promise<string> {
  if (fontCache[file]) return fontCache[file];
  const buf = await (await fetch(`/${file}`)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return (fontCache[file] = btoa(bin));
}

/** jsPDF draws strictly left-to-right: reverse Hebrew words' letters and the word order. */
function rtl(str: string): string {
  if (!str || !/[֐-׿]/.test(str)) return str;
  return str
    .split(" ")
    // jsPDF's own bidi pass flips digit/Latin runs (dates, quantities), so those are pre-reversed too.
    .map((w) => (/[\u0590-\u05FF\dA-Za-z]/.test(w) ? w.split("").reverse().join("").replace(/[()]/g, (c) => (c === "(" ? ")" : "(")) : w))
    .reverse()
    .join(" ");
}

const MARGIN = 14;
const MIN_ROOM_FOR_NEW_SECTION = 40; // mm: category title + column labels + at least one row

export async function generateShoppingListPdf(
  items: ShoppingListExportData[],
  meta: { date: string; title: string; subtitle?: string; weekLabel?: string },
  filename: string
) {
  const [regular, bold] = await Promise.all([loadFont("Heebo-Regular.ttf"), loadFont("Heebo-Bold.ttf")]);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Heebo-Regular.ttf", regular);
  doc.addFont("Heebo-Regular.ttf", "Heebo", "normal");
  doc.addFileToVFS("Heebo-Bold.ttf", bold);
  doc.addFont("Heebo-Bold.ttf", "Heebo", "bold");
  doc.setFont("Heebo", "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const right = pageW - MARGIN;
  const showFramework = items.some((i) => !!i.frameworkName);

  // ── Title block ──
  let y = 16;
  doc.setFont("Heebo", "bold");
  doc.setFontSize(18);
  doc.text(rtl(meta.title), pageW / 2, y, { align: "center" });
  y += 7;
  if (meta.subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(rtl(meta.subtitle), pageW / 2, y, { align: "center" });
    y += 6;
  }
  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(rtl(`תאריך: ${meta.date}`), right, y, { align: "right" });
  doc.setTextColor(30);
  y += 5;

  // ── One table per category; the category name is a header row repeated on each page it spans ──
  const byCategory = new Map<string, ShoppingListExportData[]>();
  [...items]
    .sort((a, b) => a.category.localeCompare(b.category, "he") || a.name.localeCompare(b.name, "he"))
    .forEach((it) => {
      const cat = it.category || "כללי";
      byCategory.set(cat, [...(byCategory.get(cat) ?? []), it]);
    });

  // Columns are listed left→right, so the visual right-to-left order is reversed here.
  const colLabels = [...(showFramework ? ["מסגרת"] : []), "מזמין", "הערות", "כמות", "מוצר"];
  const colCount = colLabels.length;
  const colStyles: Record<number, object> = {
    [colCount - 1]: { cellWidth: "auto", fontStyle: "bold" },
    [colCount - 2]: { cellWidth: 20, halign: "center" },
    [colCount - 3]: { cellWidth: 46 },
    [colCount - 4]: { cellWidth: 28 },
  };
  if (showFramework) colStyles[0] = { cellWidth: 26 };

  for (const [cat, rows] of byCategory) {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    let startY = last ? Math.max(last.finalY, y) + 6 : y + 2;
    // Never strand a category title at the bottom of a page.
    if (pageH - MARGIN - startY < MIN_ROOM_FOR_NEW_SECTION) {
      doc.addPage();
      startY = MARGIN;
    }

    autoTable(doc, {
      startY,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: { font: "Heebo", fontSize: 10, cellPadding: 2.2, halign: "right", valign: "middle", lineColor: [220, 220, 225], lineWidth: 0.2, textColor: 30 },
      headStyles: { font: "Heebo", fontStyle: "bold" },
      head: [
        [{ content: rtl(`${cat} (${rows.length})`), colSpan: colCount, styles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 11, halign: "right" } }],
        colLabels.map((l) => ({ content: rtl(l), styles: { fillColor: [240, 240, 244], textColor: 60, fontSize: 9, halign: l === "כמות" ? "center" : "right" } })),
      ],
      body: rows.map((r) => [
        ...(showFramework ? [rtl(r.frameworkName || "")] : []),
        rtl(r.requestedByName || ""),
        rtl(r.notes || ""),
        rtl(r.quantity || "1"),
        rtl(r.name),
      ]),
      columnStyles: colStyles,
    });
  }

  // ── Footer: page numbers ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("Heebo", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(rtl(`עמוד ${p} מתוך ${pages}`), pageW / 2, pageH - 8, { align: "center" });
  }

  doc.save(filename);
}
