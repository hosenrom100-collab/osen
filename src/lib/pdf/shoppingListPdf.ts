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
  meta: { date: string; title: string; subtitle?: string },
  /** A file name saves the PDF; null returns it as a Blob. */
  filename: string | null
): Promise<Blob | void> {
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

  // ── Sections: one per framework (when items carry one), each with a table per category ──
  const sorted = [...items].sort(
    (a, b) =>
      (a.frameworkName || "").localeCompare(b.frameworkName || "", "he") ||
      (a.category || "כללי").localeCompare(b.category || "כללי", "he") ||
      a.name.localeCompare(b.name, "he")
  );
  const sections = new Map<string, Map<string, ShoppingListExportData[]>>();
  for (const it of sorted) {
    const fw = it.frameworkName || "";
    const cat = it.category || "כללי";
    const cats = sections.get(fw) ?? new Map<string, ShoppingListExportData[]>();
    cats.set(cat, [...(cats.get(cat) ?? []), it]);
    sections.set(fw, cats);
  }

  // Columns left→right, so the visual right-to-left order is reversed: ☐ | product | quantity | notes.
  // Every width is fixed so the table can never run past the margins.
  const innerW = pageW - MARGIN * 2;
  const W_BOX = 10;
  const W_QTY = 22;
  const W_NOTES = 62;
  const W_NAME = innerW - W_BOX - W_QTY - W_NOTES;
  const PAD = 2.2;
  const FONT_SIZE = 10;

  /**
   * Wraps in logical order first and only then reverses each line for jsPDF. Letting autoTable
   * wrap an already-reversed string would put the end of the sentence on the first line.
   */
  const wrap = (text: string, width: number, bold = false): string => {
    doc.setFont("Heebo", bold ? "bold" : "normal");
    doc.setFontSize(FONT_SIZE);
    const lines: string[] = doc.splitTextToSize(text || "", width - PAD * 2);
    return lines.map(rtl).join("\n");
  };

  const colStyles: Record<number, object> = {
    0: { cellWidth: W_NOTES },
    1: { cellWidth: W_QTY, halign: "center" },
    2: { cellWidth: W_NAME, fontStyle: "bold" },
    3: { cellWidth: W_BOX },
  };

  for (const [framework, cats] of sections) {
    if (framework) {
      const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      let fy = last ? last.finalY + 8 : y + 4;
      if (pageH - MARGIN - fy < MIN_ROOM_FOR_NEW_SECTION + 10) {
        doc.addPage();
        fy = MARGIN + 4;
      }
      doc.setFont("Heebo", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(rtl(framework), right, fy, { align: "right" });
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, fy + 2, right, fy + 2);
      y = fy + 3;
      (doc as unknown as { lastAutoTable?: unknown }).lastAutoTable = undefined;
    }

    for (const [cat, rows] of cats) {
      const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
      let startY = last ? last.finalY + 6 : y + 3;
      // Never strand a category title at the bottom of a page.
      if (pageH - MARGIN - startY < MIN_ROOM_FOR_NEW_SECTION) {
        doc.addPage();
        startY = MARGIN;
      }

      autoTable(doc, {
        startY,
        margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 16 },
        tableWidth: innerW,
        theme: "grid",
        showHead: "everyPage",
        rowPageBreak: "avoid",
        styles: { font: "Heebo", fontSize: FONT_SIZE, cellPadding: PAD, halign: "right", valign: "middle", lineColor: [200, 200, 208], lineWidth: 0.2, textColor: 30, overflow: "linebreak" },
        headStyles: { font: "Heebo", fontStyle: "bold" },
        head: [
          [{ content: rtl(`${cat} (${rows.length})`), colSpan: 4, styles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 11, halign: "right" } }],
          ["הערות", "כמות", "מוצר", ""].map((l) => ({
            content: rtl(l),
            styles: { fillColor: [240, 240, 244], textColor: 60, fontSize: 9, halign: l === "כמות" ? "center" : "right" } as const,
          })),
        ],
        body: rows.map((r) => [
          wrap(r.notes || "", W_NOTES),
          rtl(r.quantity || "1"),
          wrap(r.name, W_NAME, true),
          "",
        ]),
        columnStyles: colStyles,
        // The empty last column becomes a tick box for the shopper.
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index !== 3) return;
          const size = 4;
          doc.setDrawColor(90);
          doc.setLineWidth(0.3);
          doc.rect(data.cell.x + (data.cell.width - size) / 2, data.cell.y + (data.cell.height - size) / 2, size, size);
        },
      });
    }
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

  if (filename === null) return doc.output("blob");
  doc.save(filename);
}
