import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

export async function generateStoreAuthorizationPDF(
  request: any,
  requestId: string
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  let yPosition = margin;

  // 1. Add Header Logo if available
  try {
    const headerLogoPath = path.join(process.cwd(), "public", "logoup.png");
    if (fs.existsSync(headerLogoPath)) {
      const logoBuffer = fs.readFileSync(headerLogoPath);
      const logoBase64 = logoBuffer.toString("base64");
      doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", margin, yPosition, contentWidth, 22);
      yPosition += 26;
    }
  } catch (err) {
    console.error("Error embedding header logo in PDF:", err);
  }

  // RTL support
  doc.setLanguage("ar");

  // Title
  doc.setFontSize(16);
  doc.setFont("Arial", "bold");
  doc.text("אישור קנייה לסופר", pageWidth / 2, yPosition + 6, {
    align: "center",
  });
  yPosition += 12;

  // Request Number and Date
  doc.setFontSize(10);
  doc.setFont("Arial", "normal");
  const createdDate = new Date(request.createdAt).toLocaleDateString("he-IL");
  doc.text(
    `מספר אישור: #${request.requestNumber} | תאריך: ${createdDate}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );

  yPosition += 10;

  // Organization Info
  doc.setFontSize(10);
  doc.setFont("Arial", "bold");
  doc.text("מרכז חוסן חוות רום", margin, yPosition);
  yPosition += 5;
  doc.setFont("Arial", "normal");
  doc.text("לכבוד אברהם שיווק", margin, yPosition);
  yPosition += 10;

  // Request Details Section
  doc.setFillColor(235, 243, 255);
  doc.rect(margin, yPosition - 2, contentWidth, 25, "F");
  doc.setDrawColor(180, 205, 245);
  doc.rect(margin, yPosition - 2, contentWidth, 25, "S");

  doc.setFont("Arial", "bold");
  doc.setFontSize(10);
  doc.text("פרטי הבקשה:", margin + 4, yPosition + 4);

  doc.setFont("Arial", "normal");
  doc.setFontSize(9);
  doc.text(`שם המבקש: ${request.requestedByName}`, margin + 4, yPosition + 10);
  doc.text(
    `תאריך הבקשה: ${createdDate}`,
    pageWidth / 2,
    yPosition + 10
  );
  doc.text(`מספר בקשה: #${request.requestNumber}`, margin + 4, yPosition + 16);
  doc.text(
    `סטטוס: ${request.status === "approved" ? "אושר" : "בהמתנה"}`,
    pageWidth / 2,
    yPosition + 16
  );

  if (request.approvedByName) {
    doc.text(
      `אושר על ידי: ${request.approvedByName}`,
      margin + 4,
      yPosition + 22
    );
  }

  yPosition += 32;

  // Items Table
  doc.setFont("Arial", "bold");
  doc.setFontSize(10);
  doc.text("פריטים לקנייה:", margin, yPosition);
  yPosition += 7;

  // Table Headers
  const tableTop = yPosition;
  const colWidths = [100, 40, 40];
  const headers = ["שם המוצר", "כמות", "סטטוס"];

  doc.setFillColor(59, 130, 246);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, tableTop, contentWidth, 7, "F");

  doc.setFont("Arial", "bold");
  doc.setFontSize(9);

  let xPos = margin + contentWidth - 5;
  for (let i = 0; i < headers.length; i++) {
    const headerText = headers[i];
    doc.text(headerText, xPos - colWidths[i] / 2, tableTop + 5, {
      align: "center",
    });
    xPos -= colWidths[i];
  }

  // Table Rows
  doc.setTextColor(0, 0, 0);
  doc.setFont("Arial", "normal");
  doc.setFontSize(9);

  let rowYPosition = tableTop + 12;
  (request.items || []).forEach((item: any, index: number) => {
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, rowYPosition - 4, contentWidth, 7, "F");
    }

    xPos = margin + contentWidth - 5;

    // Status
    const statusText =
      item.status === "approved"
        ? "אושר"
        : item.status === "rejected"
          ? "דחוי"
          : "בהמתנה";
    doc.text(statusText, xPos - colWidths[2] / 2, rowYPosition, {
      align: "center",
    });
    xPos -= colWidths[2];

    // Quantity (with unit if exists)
    const qtyText = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
    doc.text(qtyText, xPos - colWidths[1] / 2, rowYPosition, {
      align: "center",
    });
    xPos -= colWidths[1];

    // Product Name
    const productName = (item.productName || "").substring(0, 35);
    doc.text(productName, xPos - colWidths[0] / 2, rowYPosition, {
      align: "right",
    });

    rowYPosition += 8;
  });

  yPosition = rowYPosition + 5;

  // Notes Section
  if (request.notes) {
    doc.setFont("Arial", "bold");
    doc.setFontSize(10);
    doc.text("הערות:", margin, yPosition);
    yPosition += 5;

    doc.setFont("Arial", "normal");
    doc.setFontSize(9);
    const notesLines = doc.splitTextToSize(request.notes, contentWidth);
    doc.text(notesLines, margin, yPosition);
    yPosition += notesLines.length * 5 + 5;
  }

  yPosition += 5;

  // Important Note Section
  doc.setFillColor(254, 243, 199);
  doc.rect(margin, yPosition - 2, contentWidth, 18, "F");
  doc.setDrawColor(245, 158, 11);
  doc.rect(margin, yPosition - 2, contentWidth, 18, "S");
  doc.setFont("Arial", "bold");
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9);
  doc.text("⚠️ התנאי החשוב:", margin + 4, yPosition + 4);

  doc.setFont("Arial", "normal");
  doc.setFontSize(9);
  doc.text(
    "עם ההמצאה חייבת להיות מצורפת חשבונית קנייה חתומה מטה",
    margin + 4,
    yPosition + 11
  );

  yPosition += 25;

  // Signature Section
  doc.setTextColor(0, 0, 0);
  doc.setFont("Arial", "bold");
  doc.setFontSize(10);

  // Approver Signature
  doc.text("חתימת המאשר:", margin, yPosition);
  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  doc.text(`${request.approvedByName || ""}`, margin, yPosition + 5);

  const approvedDate = request.approvedAt
    ? new Date(request.approvedAt).toLocaleDateString("he-IL")
    : "";
  doc.text(`תאריך: ${approvedDate}`, margin, yPosition + 10);

  // Signature space
  doc.setDrawColor(0);
  doc.line(margin, yPosition + 15, margin + 40, yPosition + 15);

  // Myriam Sarmily signature
  const signatureName = "מירב סארמילי";
  const signatureTitle = "מנהלת תפעול מרכז חוסן חוות רום";

  doc.setFont("Arial", "bold");
  doc.setFontSize(10);
  doc.text(signatureName, pageWidth / 2, yPosition, { align: "center" });

  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  doc.text(signatureTitle, pageWidth / 2, yPosition + 5, { align: "center" });

  doc.line(pageWidth / 2 - 25, yPosition + 12, pageWidth / 2 + 25, yPosition + 12);

  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  doc.text("חתימה", pageWidth / 2, yPosition + 16, { align: "center" });

  // Add Footer Logo at bottom if available
  try {
    const footerLogoPath = path.join(process.cwd(), "public", "logodown.png");
    if (fs.existsSync(footerLogoPath)) {
      const footerBuffer = fs.readFileSync(footerLogoPath);
      const footerBase64 = footerBuffer.toString("base64");
      doc.addImage(`data:image/png;base64,${footerBase64}`, "PNG", margin, pageHeight - 22, contentWidth, 15);
    }
  } catch (err) {
    console.error("Error embedding footer logo in PDF:", err);
  }

  // Footer text
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `אישור #${request.requestNumber} | ${createdDate}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" }
  );

  const pdfBytes = doc.output("arraybuffer");
  return Buffer.from(pdfBytes);
}

