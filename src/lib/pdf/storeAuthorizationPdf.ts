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

function splitMixedText(str: string): { text: string; isHebrew: boolean }[] {
  const runs: { text: string; isHebrew: boolean }[] = [];
  let currentRun = "";
  let currentIsHebrew = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const isHeb = /[\u0590-\u05FF]/.test(char);
    
    if (char === " ") {
      currentRun += char;
      continue;
    }

    if (currentRun === "") {
      currentIsHebrew = isHeb;
      currentRun += char;
    } else if (isHeb === currentIsHebrew) {
      currentRun += char;
    } else {
      runs.push({ text: currentRun, isHebrew: currentIsHebrew });
      currentIsHebrew = isHeb;
      currentRun = char;
    }
  }
  if (currentRun) {
    runs.push({ text: currentRun, isHebrew: currentIsHebrew });
  }

  return runs;
}

function reverseHebrewWord(w: string): string {
  return w.split("").reverse().join("");
}

function toRTLRun(text: string, isHebrew: boolean): string {
  if (!isHebrew) return text;
  const words = text.split(" ");
  const reversedWords = words.map(w => {
    if (/[\u0590-\u05FF]/.test(w)) {
      return reverseHebrewWord(w);
    }
    return w;
  });
  return reversedWords.reverse().join(" ");
}

function drawSegmentedText(doc: any, str: string, x: number, y: number, align: "right" | "center" | "left" = "right") {
  const runs = splitMixedText(str);
  
  let totalWidth = 0;
  const processedRuns = runs.map(run => {
    const text = toRTLRun(run.text, run.isHebrew);
    const width = doc.getTextWidth(text);
    totalWidth += width;
    return { text, width };
  });

  let curX = x;
  if (align === "right") {
    curX = x;
  } else if (align === "center") {
    curX = x + totalWidth / 2;
  } else if (align === "left") {
    curX = x + totalWidth;
  }

  for (const run of processedRuns) {
    doc.text(run.text, curX, y, { align: "right" });
    curX -= run.width;
  }
}

export async function generateStoreAuthorizationPDF(
  request: any,
  requestId: string,
  options?: { meravSignatureImage?: string }
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

  // 1. Add Full Page Background if logopage exists (.jpg preferred, then .png)
  try {
    const pageLogoPathJpg = path.join(process.cwd(), "public", "logopage.jpg");
    const pageLogoPathPng = path.join(process.cwd(), "public", "logopage.png");

    if (fs.existsSync(pageLogoPathJpg)) {
      const logoBuffer = fs.readFileSync(pageLogoPathJpg);
      doc.addImage(`data:image/jpeg;base64,${logoBuffer.toString("base64")}`, "JPEG", 0, 0, pageWidth, pageHeight);
      hasBackground = true;
      yPosition = 45; // Start content below the header logo on the template
    } else if (fs.existsSync(pageLogoPathPng)) {
      const logoBuffer = fs.readFileSync(pageLogoPathPng);
      doc.addImage(`data:image/png;base64,${logoBuffer.toString("base64")}`, "PNG", 0, 0, pageWidth, pageHeight);
      hasBackground = true;
      yPosition = 45;
    }
  } catch (err) {
    console.error("Error embedding page logo background in PDF:", err);
  }

  // 2. If no full background page, render individual logoup with correct aspect ratio
  if (!hasBackground) {
    try {
      const headerLogoPathJpg = path.join(process.cwd(), "public", "logoup.jpg");
      const headerLogoPathPng = path.join(process.cwd(), "public", "logoup.png");
      
      let imgPath = "";
      let imgType = "PNG";
      
      if (fs.existsSync(headerLogoPathJpg)) {
        imgPath = headerLogoPathJpg;
        imgType = "JPEG";
      } else if (fs.existsSync(headerLogoPathPng)) {
        imgPath = headerLogoPathPng;
        imgType = "PNG";
      }
      
      if (imgPath) {
        const logoBuffer = fs.readFileSync(imgPath);
        const logoBase64 = logoBuffer.toString("base64");
        
        // logoup.png is 522x421 (Ratio: 1.24). Let's render it right-aligned with height 24mm
        const imgHeight = 24;
        const imgWidth = imgHeight * (522 / 421); // ~29.7mm
        const imgX = pageWidth - margin - imgWidth; // Align to right margin
        
        doc.addImage(`data:image/${imgType.toLowerCase()};base64,${logoBase64}`, imgType, imgX, yPosition, imgWidth, imgHeight);
        yPosition += 28;
      }
    } catch (err) {
      console.error("Error embedding header logo in PDF:", err);
    }
  }

  // 3. Document Main Title
  doc.setFontSize(16);
  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "אישור קנייה לעובד", pageWidth / 2, yPosition + 4, "center");
  yPosition += 12;

  // Format request created date once for use
  const createdDate = formatDate(request.createdAt) || new Date().toLocaleDateString("he-IL");

  // 5. Recipient & Organization Info Card
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPosition - 2, contentWidth, 34, "F");
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, yPosition - 2, contentWidth, 34, "S");

  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  drawSegmentedText(doc, "פרטי האישור והגוף המנפיק:", pageWidth - margin - 4, yPosition + 4, "right");

  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);

  // Right column (X positions: labels at pageWidth - margin - 4, values at pageWidth - margin - 35)
  // Rendering labels and values separately prevents RTL reversal of number/symbol characters in values
  const rightColLabelX = pageWidth - margin - 4;
  const rightColValX = pageWidth - margin - 35;

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "גוף מנפיק:", rightColLabelX, yPosition + 10, "right");
  doc.setFont("Heebo", "normal");
  drawSegmentedText(doc, "מרכז חוסן - חוות רום", rightColValX, yPosition + 10, "right");

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "לכבוד:", rightColLabelX, yPosition + 16, "right");
  doc.setFont("Heebo", "normal");
  drawSegmentedText(doc, request.storeName || "אברהם שיווק", rightColValX, yPosition + 16, "right");

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "שם המבקש/ת:", rightColLabelX, yPosition + 22, "right");
  doc.setFont("Heebo", "normal");
  drawSegmentedText(doc, request.requestedByName || "עובד/ת", rightColValX, yPosition + 22, "right");

  // Left column (X positions: labels at margin + 80, values at margin + 48)
  // Dates and numbers are printed in separate LTR calls to guarantee correct display direction
  const leftColLabelX = margin + 80;
  const leftColValX = margin + 48;

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "מספר בקשה:", leftColLabelX, yPosition + 10, "right");
  doc.setFont("Heebo", "normal");
  doc.text(`#${request.requestNumber}`, leftColValX, yPosition + 10, { align: "right" });

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "סטטוס אישור:", leftColLabelX, yPosition + 16, "right");
  doc.setFont("Heebo", "normal");
  drawSegmentedText(doc, request.status === "approved" ? "מאושר סופית" : "בהמתנה", leftColValX, yPosition + 16, "right");

  doc.setFont("Heebo", "bold");
  drawSegmentedText(doc, "גורם מאשר:", leftColLabelX, yPosition + 22, "right");
  doc.setFont("Heebo", "normal");
  drawSegmentedText(doc, "מירב סארמילי", leftColValX, yPosition + 22, "right");

  if (request.status === "approved" && request.approvedAt) {
    doc.setFont("Heebo", "bold");
    drawSegmentedText(doc, "תאריך אישור:", leftColLabelX, yPosition + 28, "right");
    doc.setFont("Heebo", "normal");
    doc.text(formatDate(request.approvedAt), leftColValX, yPosition + 28, { align: "right" });
  }

  yPosition += 40;

  // 6. Items & Quantity Table Header
  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  drawSegmentedText(doc, "פירוט המוצרים והכמויות המאושרות לקנייה:", pageWidth - margin, yPosition, "right");
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
  drawSegmentedText(doc, headers[2], curX + colWidths[2] / 2, tableTop + 5.5, "center");
  curX += colWidths[2];

  // Col 1: Quantity (Center)
  drawSegmentedText(doc, headers[1], curX + colWidths[1] / 2, tableTop + 5.5, "center");
  curX += colWidths[1];

  // Col 2: Product Name (Right)
  drawSegmentedText(doc, headers[0], margin + contentWidth - 4, tableTop + 5.5, "right");

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
    drawSegmentedText(doc, statusLabel, x + colWidths[2] / 2, rowY, "center");
    x += colWidths[2];

    // Quantity (with unit if provided)
    const qtyText = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
    drawSegmentedText(doc, qtyText, x + colWidths[1] / 2, rowY, "center");
    x += colWidths[1];

    // Product Name
    const pName = (item.productName || "").substring(0, 45);
    drawSegmentedText(doc, pName, margin + contentWidth - 4, rowY, "right");

    rowY += 8.5;
  });

  yPosition = Math.max(rowY + 4, yPosition + 35);

  // 8. Notes Section (if any)
  if (request.notes) {
    doc.setFont("Heebo", "bold");
    doc.setFontSize(9);
    drawSegmentedText(doc, "הערות לבקשה:", pageWidth - margin, yPosition, "right");
    yPosition += 4.5;

    doc.setFont("Heebo", "normal");
    doc.setFontSize(8.5);
    drawSegmentedText(doc, request.notes, pageWidth - margin, yPosition, "right");
    yPosition += 8;
  }

  // 9. Important Notice Box
  doc.setFillColor(254, 243, 199); // Amber 100
  doc.rect(margin, yPosition, contentWidth, 10, "F");
  doc.setDrawColor(245, 158, 11); // Amber 500
  doc.rect(margin, yPosition, contentWidth, 10, "S");

  doc.setFont("Heebo", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(180, 83, 9);
  drawSegmentedText(doc, "⚠️ נא לצרף את האישור לחשבונית הקנייה.", pageWidth - margin - 4, yPosition + 6.5, "right");

  yPosition += 18;

  // 10. Official Signature Section - Merav Sarmili
  doc.setTextColor(0, 0, 0);

  // Signatory Box
  const sigX = pageWidth / 2;

  doc.setFont("Heebo", "bold");
  doc.setFontSize(10);
  drawSegmentedText(doc, "מאושר וחתום ע\"י:", sigX, yPosition, "center");
  yPosition += 5;

  // Render signature image if available
  if (options?.meravSignatureImage) {
    try {
      let sigBase64 = options.meravSignatureImage;
      if (sigBase64.startsWith("data:image")) {
        const commaIdx = sigBase64.indexOf(",");
        if (commaIdx !== -1) {
          sigBase64 = sigBase64.substring(commaIdx + 1);
        }
      }
      const sigWidth = 45;
      const sigHeight = 18;
      // Center the signature above the name
      doc.addImage(`data:image/png;base64,${sigBase64}`, "PNG", sigX - sigWidth / 2, yPosition, sigWidth, sigHeight);
      yPosition += 20;
    } catch (sigImgErr) {
      console.error("Error rendering signature image in PDF:", sigImgErr);
      yPosition += 5;
    }
  } else {
    yPosition += 5;
  }

  doc.setFont("Heebo", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  drawSegmentedText(doc, "מירב סארמילי", sigX, yPosition + 2, "center");

  doc.setFont("Heebo", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  drawSegmentedText(doc, "מנהלת תפעול, מרכז חוסן חוות רום", sigX, yPosition + 7, "center");

  // Signature Line
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(sigX - 30, yPosition + 12, sigX + 30, yPosition + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  drawSegmentedText(doc, "חתימה וחותמת מורשית דיגיטלית", sigX, yPosition + 16, "center");

  // 11. Add Footer Logo at bottom if no fullpage background is loaded (.jpg preferred, then .png)
  if (!hasBackground) {
    try {
      const footerLogoPathJpg = path.join(process.cwd(), "public", "logodown.jpg");
      const footerLogoPathPng = path.join(process.cwd(), "public", "logodown.png");
      
      let imgPath = "";
      let imgType = "PNG";
      
      if (fs.existsSync(footerLogoPathJpg)) {
        imgPath = footerLogoPathJpg;
        imgType = "JPEG";
      } else if (fs.existsSync(footerLogoPathPng)) {
        imgPath = footerLogoPathPng;
        imgType = "PNG";
      }
      
      if (imgPath) {
        const footerBuffer = fs.readFileSync(imgPath);
        const footerBase64 = footerBuffer.toString("base64");
        
        // logodown is 2481x745 (Ratio: 3.33). Center it with width 120mm
        const footerWidth = 120;
        const footerHeight = footerWidth / (2481 / 745); // ~36mm
        const footerX = (pageWidth - footerWidth) / 2;
        
        doc.addImage(`data:image/${imgType.toLowerCase()};base64,${footerBase64}`, imgType, footerX, pageHeight - footerHeight - 10, footerWidth, footerHeight);
      }
    } catch (err) {
      console.error("Error embedding footer logo in PDF:", err);
    }
  }

  // Footer text line - split date to render as separate LTR block preventing PDF viewer auto-reversal
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const footerLabel = `מסמך אישור רשמי מס' #${request.requestNumber}  |  מרכז חוסן חוות רום  |  הונפק בתאריך: `;
  
  const runs = splitMixedText(footerLabel);
  let labelWidth = 0;
  runs.forEach(run => {
    labelWidth += doc.getTextWidth(toRTLRun(run.text, run.isHebrew));
  });
  
  const dateWidth = doc.getTextWidth(createdDate);
  const totalFooterWidth = labelWidth + 2 + dateWidth;
  const startX = (pageWidth - totalFooterWidth) / 2;
  
  doc.text(createdDate, startX, pageHeight - 5, { align: "left" });
  drawSegmentedText(doc, footerLabel, startX + dateWidth + 2, pageHeight - 5, "left");

  const pdfBytes = doc.output("arraybuffer");
  return Buffer.from(pdfBytes);
}
