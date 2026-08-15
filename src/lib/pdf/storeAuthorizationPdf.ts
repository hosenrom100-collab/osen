import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

/**
 * Converts Hebrew text string so that standard jsPDF LTR text rendering
 * correctly displays visual RTL Hebrew without reversed characters.
 */
function toRTL(str: string): string {
  if (!str) return "";
  const hasHebrew = /[\u0590-\u05FF]/.test(str);
  if (!hasHebrew) return str;

  const words = str.split(" ");
  const reversedWords = words.map((w) => {
    if (/[\u0590-\u05FF]/.test(w)) {
      return w.split("").reverse().join("");
    }
    return w;
  });

  return reversedWords.reverse().join(" ");
}

function formatDate(val: any): string {
  if (!val) return "";
  try {
    if (typeof val.toDate === "function") return val.toDate().toLocaleDateString("he-IL");
    if (val._seconds) return new Date(val._seconds * 1000).toLocaleDateString("he-IL");
    if (val.seconds) return new Date(val.seconds * 1000).toLocaleDateString("he-IL");
    return new Date(val).toLocaleDateString("he-IL");
  } catch (err) {
    console.error("Error formatting date:", err);
    return "";
  }
}

export async function generateStoreAuthorizationPDF(
  request: any,
  requestId: string
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Load Heebo custom fonts for full Hebrew support
  try {
    const regularFontPath = path.join(process.cwd(), "public", "Heebo-Regular.ttf");
    const boldFontPath = path.join(process.cwd(), "public", "Heebo-Bold.ttf");

    if (fs.existsSync(regularFontPath)) {
      const regBuffer = fs.readFileSync(regularFontPath);
      doc.addFileToVFS("Heebo-Regular.ttf", regBuffer.toString("base64"));
      doc.addFont("Heebo-Regular.ttf", "Heebo", "normal");
    }

    if (fs.existsSync(boldFontPath)) {
      const boldBuffer = fs.readFileSync(boldFontPath);
      doc.addFileToVFS("Heebo-Bold.ttf", boldBuffer.toString("base64"));
      doc.addFont("Heebo-Bold.ttf", "Heebo", "bold");
    }

    doc.setFont("Heebo", "normal");
  } catch (fontErr) {
    console.error("Failed to load Heebo fonts:", fontErr);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  let yPosition = margin;
  let hasBackground = false;

  // 1. Add Full Page Background if logopage.png exists
  try {
    const pageLogoPath = path.join(process.cwd(), "public", "logopage.png");
    if (fs.existsSync(pageLogoPath)) {
      const logoBuffer = fs.readFileSync(pageLogoPath);
      const logoBase64 = logoBuffer.toString("base64");
      // Add as background covering the entire page
      doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", 0, 0, pageWidth, pageHeight);
      hasBackground = true;
      yPosition = 45; // Start content below the header logo on the template
    }
  } catch (err) {
    console.error("Error embedding page logo background in PDF:", err);
  }

  // 2. If no full background page, render individual logoup.png with correct aspect ratio
  if (!hasBackground) {
    try {
      const headerLogoPath = path.join(process.cwd(), "public", "logoup.png");
      if (fs.existsSync(headerLogoPath)) {
        const logoBuffer = fs.readFileSync(headerLogoPath);
        const logoBase64 = logoBuffer.toString("base64");
        
        // logoup.png is 522x421 (Ratio: 1.24). Let's render it right-aligned with height 24mm
        const imgHeight = 24;
        const imgWidth = imgHeight * (522 / 421); // ~29.7mm
        const imgX = pageWidth - margin - imgWidth; // Align to right margin
        
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", imgX, yPosition, imgWidth, imgHeight);
        yPosition += 28;
      }
    } catch (err) {
      console.error("Error embedding header logo in PDF:", err);
    }
  }

  // 3. Document Main Title
  doc.setFontSize(16);
  doc.setFont("Heebo", "bold");
  doc.text(toRTL("אישור קנייה אד הוק"), pageWidth / 2, yPosition + 4, { align: "center" });
  yPosition += 10;

  // 4. Request Number and Date Subtitle
  const createdDate = formatDate(request.createdAt) || new Date().toLocaleDateString("he-IL");

  doc.setFontSize(11);
  doc.setFont("Heebo", "bold");
  doc.text(
    toRTL(`מספר אישור: #${request.requestNumber || ""}  |  תאריך: ${createdDate}`),
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );

  yPosition += 10;

  // 5. Recipient & Organization Info Card
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPosition - 2, contentWidth, 34, "F");
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, yPosition - 2, contentWidth, 34, "S");

  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  doc.text(toRTL("פרטי האישור והגוף המנפיק:"), pageWidth - margin - 4, yPosition + 4, { align: "right" });

  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);

  // Right column
  doc.text(toRTL(`גוף מנפיק: מרכז חוסן - חוות רום`), pageWidth - margin - 4, yPosition + 10, { align: "right" });
  doc.text(toRTL(`לכבוד: הנהלת החנות / אברהם שיווק`), pageWidth - margin - 4, yPosition + 16, { align: "right" });
  doc.text(toRTL(`שם המבקש/ת המורשה: ${request.requestedByName || "עובד/ת"}`), pageWidth - margin - 4, yPosition + 22, { align: "right" });

  // Left column
  doc.text(toRTL(`מספר בקשה במערכת: #${request.requestNumber}`), margin + 4, yPosition + 10, { align: "left" });
  doc.text(toRTL(`סטטוס אישור: ${request.status === "approved" ? "מאושר סופית" : "בהמתנה"}`), margin + 4, yPosition + 16, { align: "left" });
  doc.text(toRTL(`גורם מאשר: מירב סארמילי - מנהלת תפעול`), margin + 4, yPosition + 22, { align: "left" });
  if (request.status === "approved" && request.approvedAt) {
    doc.text(toRTL(`תאריך אישור: ${formatDate(request.approvedAt)}`), margin + 4, yPosition + 28, { align: "left" });
  }

  yPosition += 40;

  // 6. Items & Quantity Table Header
  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  doc.text(toRTL("פירוט המוצרים והכמויות המאושרות לקנייה:"), pageWidth - margin, yPosition, { align: "right" });
  yPosition += 6;

  // Table Headers Setup
  const tableTop = yPosition;
  const colWidths = [105, 45, 30]; // [Product Name, Quantity, Status]
  const headers = ["שם המוצר", "כמות", "סטטוס"];

  doc.setFillColor(30, 58, 138); // Dark Navy Blue Header
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, tableTop, contentWidth, 8, "F");

  doc.setFont("Heebo", "bold");
  doc.setFontSize(9);

  let curX = margin;
  // Col 0: Status (Left)
  doc.text(toRTL(headers[2]), curX + colWidths[2] / 2, tableTop + 5.5, { align: "center" });
  curX += colWidths[2];

  // Col 1: Quantity (Center)
  doc.text(toRTL(headers[1]), curX + colWidths[1] / 2, tableTop + 5.5, { align: "center" });
  curX += colWidths[1];

  // Col 2: Product Name (Right)
  doc.text(toRTL(headers[0]), margin + contentWidth - 4, tableTop + 5.5, { align: "right" });

  // 7. Table Rows
  doc.setTextColor(0, 0, 0);
  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);

  let rowY = tableTop + 13;
  // Only include items that are approved for purchase
  const items = (request.items || []).filter((item: any) => item.status === "approved" || !item.status);

  items.forEach((item: any, index: number) => {
    // Zebra striping
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, rowY - 4.5, contentWidth, 8, "F");
    }

    let x = margin;

    // Status
    const statusLabel = item.status === "approved" ? "אושר" : item.status === "rejected" ? "נדחה" : "בהמתנה";
    doc.text(toRTL(statusLabel), x + colWidths[2] / 2, rowY, { align: "center" });
    x += colWidths[2];

    // Quantity (with unit if provided)
    const qtyText = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
    doc.text(toRTL(qtyText), x + colWidths[1] / 2, rowY, { align: "center" });
    x += colWidths[1];

    // Product Name
    const pName = (item.productName || "").substring(0, 45);
    doc.text(toRTL(pName), margin + contentWidth - 4, rowY, { align: "right" });

    rowY += 8.5;
  });

  yPosition = Math.max(rowY + 4, yPosition + 35);

  // 8. Notes Section (if any)
  if (request.notes) {
    doc.setFont("Heebo", "bold");
    doc.setFontSize(9);
    doc.text(toRTL("הערות לבקשה:"), pageWidth - margin, yPosition, { align: "right" });
    yPosition += 4.5;

    doc.setFont("Heebo", "normal");
    doc.setFontSize(8.5);
    doc.text(toRTL(request.notes), pageWidth - margin, yPosition, { align: "right" });
    yPosition += 8;
  }

  // 9. Important Notice / Invoice Condition Box
  doc.setFillColor(254, 243, 199); // Amber 100
  doc.rect(margin, yPosition, contentWidth, 18, "F");
  doc.setDrawColor(245, 158, 11); // Amber 500
  doc.rect(margin, yPosition, contentWidth, 18, "S");

  doc.setFont("Heebo", "bold");
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9);
  doc.text(toRTL("⚠️ התנאי החשוב להכרה בהוצאה:"), pageWidth - margin - 4, yPosition + 5, { align: "right" });

  doc.setFont("Heebo", "normal");
  doc.setFontSize(8.5);
  doc.text(
    toRTL("עם המצאת הרכש, חובה לצרף חשבונית קנייה מקורית חתומה למסמך אישור זה עבור הנהלת החשבונות."),
    pageWidth - margin - 4,
    yPosition + 12,
    { align: "right" }
  );

  yPosition += 26;

  // 10. Official Signature Section - Merav Sarmili
  doc.setTextColor(0, 0, 0);

  // Signatory Box
  const sigX = pageWidth / 2;

  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  doc.text(toRTL("מאושר וחתום ע\"י:"), sigX, yPosition, { align: "center" });
  yPosition += 5;

  doc.setFont("Heebo", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text(toRTL("מירב סארמילי"), sigX, yPosition + 2, { align: "center" });

  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(toRTL("מנהלת תפעול, מרכז חוסן חוות רום"), sigX, yPosition + 7, { align: "center" });

  // Signature Line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(sigX - 30, yPosition + 12, sigX + 30, yPosition + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(toRTL("חתימה וחותמת מורשית דיגיטלית"), sigX, yPosition + 16, { align: "center" });

  // 11. Add Footer Logo at bottom if no fullpage background is loaded
  if (!hasBackground) {
    try {
      const footerLogoPath = path.join(process.cwd(), "public", "logodown.png");
      if (fs.existsSync(footerLogoPath)) {
        const footerBuffer = fs.readFileSync(footerLogoPath);
        const footerBase64 = footerBuffer.toString("base64");
        
        // logodown.png is 2481x745 (Ratio: 3.33). Center it with width 120mm
        const footerWidth = 120;
        const footerHeight = footerWidth / (2481 / 745); // ~36mm
        const footerX = (pageWidth - footerWidth) / 2;
        
        doc.addImage(`data:image/png;base64,${footerBuffer.toString("base64")}`, "PNG", footerX, pageHeight - footerHeight - 10, footerWidth, footerHeight);
      }
    } catch (err) {
      console.error("Error embedding footer logo in PDF:", err);
    }
  }

  // Footer text line
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    toRTL(`מסמך אישור רשמי מס' #${request.requestNumber}  |  מרכז חוסן חוות רום  |  הונפק בתאריך ${createdDate}`),
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  );

  const pdfBytes = doc.output("arraybuffer");
  return Buffer.from(pdfBytes);
}
