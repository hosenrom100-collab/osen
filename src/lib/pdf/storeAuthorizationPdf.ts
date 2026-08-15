import { jsPDF } from "jspdf";
import { StoreAuthorizationRequest } from "@/app/shopping/types";

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

  // RTL support
  doc.setLanguage("ar");

  // Header - Logo and Title
  doc.setFontSize(12);
  doc.setFont("Arial", "bold");

  // Title
  doc.text("אישור קנייה לסופר", pageWidth / 2, margin + 10, {
    align: "center",
  });

  // Request Number and Date
  doc.setFontSize(10);
  doc.setFont("Arial", "normal");
  const createdDate = new Date(request.createdAt).toLocaleDateString("he-IL");
  doc.text(
    `מספר אישור: #${request.requestNumber} | תאריך: ${createdDate}`,
    pageWidth / 2,
    margin + 20,
    { align: "center" }
  );

  let yPosition = margin + 35;

  // Organization Info
  doc.setFontSize(10);
  doc.setFont("Arial", "bold");
  doc.text("מרכז חוסן חוות רום", margin, yPosition);
  yPosition += 5;
  doc.setFont("Arial", "normal");
  doc.text("לכבוד אברהם שיווק", margin, yPosition);
  yPosition += 10;

  // Request Details Section
  doc.setFillColor(200, 220, 255);
  doc.rect(margin, yPosition - 2, contentWidth, 25, "F");

  doc.setFont("Arial", "bold");
  doc.setFontSize(10);
  doc.text("פרטי הבקשה:", margin + 2, yPosition + 2);

  doc.setFont("Arial", "normal");
  doc.setFontSize(9);
  doc.text(`שם הבקשה: ${request.requestedByName}`, margin + 2, yPosition + 8);
  doc.text(
    `תאריך הבקשה: ${createdDate}`,
    pageWidth / 2,
    yPosition + 8
  );
  doc.text(`מספר בקשה: #${request.requestNumber}`, margin + 2, yPosition + 14);
  doc.text(
    `סטטוס: ${request.status === "approved" ? "אושר" : "בהמתנה"}`,
    pageWidth / 2,
    yPosition + 14
  );

  if (request.approvedByName) {
    doc.text(
      `אושר על ידי: ${request.approvedByName}`,
      margin + 2,
      yPosition + 20
    );
  }

  yPosition += 30;

  // Items Table
  doc.setFont("Arial", "bold");
  doc.setFontSize(10);
  doc.text("פריטים לקנייה:", margin, yPosition);
  yPosition += 7;

  // Table Headers
  const tableTop = yPosition;
  const colWidths = [100, 40, 40];
  const headers = ["שם המוצר", "כמות", "סטטוס"];

  doc.setFillColor(100, 149, 237);
  doc.setTextColor(255, 255, 255);
  doc.setFont("Arial", "bold");
  doc.setFontSize(9);

  let xPos = margin + contentWidth - 5;
  for (let i = 0; i < headers.length; i++) {
    const headerText = headers[i];
    doc.text(headerText, xPos - colWidths[i] / 2, tableTop + 4, {
      align: "center",
    });
    xPos -= colWidths[i];
  }

  // Table Rows
  doc.setTextColor(0, 0, 0);
  doc.setFont("Arial", "normal");
  doc.setFontSize(9);

  let rowYPosition = tableTop + 8;
  request.items.forEach((item: any, index: number) => {
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, rowYPosition - 3, contentWidth, 6, "F");
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

    // Quantity
    doc.text(item.quantity, xPos - colWidths[1] / 2, rowYPosition, {
      align: "center",
    });
    xPos -= colWidths[1];

    // Product Name
    const productName = item.productName.substring(0, 25);
    doc.text(productName, xPos - colWidths[0] / 2, rowYPosition, {
      align: "right",
    });

    rowYPosition += 7;
  });

  yPosition = rowYPosition + 5;

  // Notes Section (if exists)
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
  doc.setFillColor(255, 250, 205);
  doc.rect(margin, yPosition - 2, contentWidth, 20, "F");
  doc.setFont("Arial", "bold");
  doc.setFontSize(9);
  doc.setTextColor(180, 140, 0);
  doc.text("⚠️ התנאי החשוב:", margin + 2, yPosition + 2);

  doc.setFont("Arial", "normal");
  doc.setFontSize(9);
  doc.text(
    "עם ההמצאה חייב להיות מצורף חשבונית קנייה חתומה מטה",
    margin + 2,
    yPosition + 8
  );

  yPosition += 25;

  // Signature Section
  doc.setFont("Arial", "bold");
  doc.setFontSize(10);

  // Approver Signature
  doc.text("חתימת המאשר:", margin, yPosition);
  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  doc.text(`${request.approvedByName || ""}`, margin, yPosition + 5);

  // Date Line
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

  // Signature line
  doc.line(pageWidth / 2 - 25, yPosition + 12, pageWidth / 2 + 25, yPosition + 12);

  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  doc.text("חתימה", pageWidth / 2, yPosition + 16, { align: "center" });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `אישור #${request.requestNumber} | ${createdDate}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  // Convert to buffer
  const pdfBytes = doc.output("arraybuffer");
  return Buffer.from(pdfBytes);
}
