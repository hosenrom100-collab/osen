import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle,
  ImageRun,
  Header,
  Footer
} from "docx";
import PizZip from "pizzip";

/**
 * Trigger client-side download of a docx Document
 */
export const downloadDocx = async (doc: Document, filename: string) => {
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const generateDocxBlobWithLetterhead = async (bodyDoc: Document): Promise<Blob> => {
  // 1. Generate the body doc as a blob and get its array buffer
  const bodyBlob = await Packer.toBlob(bodyDoc);
  const bodyBuffer = await bodyBlob.arrayBuffer();

  // 2. Fetch the empty letterhead template
  const templateRes = await fetch("/דף לוגו ריק.docx");
  if (!templateRes.ok) {
    throw new Error("Could not load /דף לוגו ריק.docx. Please ensure it exists in the public directory.");
  }
  const templateBuffer = await templateRes.arrayBuffer();

  // 3. Load both zip files using PizZip
  const templateZip = new PizZip(templateBuffer);
  const bodyZip = new PizZip(bodyBuffer);

  // 4. Extract word/document.xml contents
  const templateFile = templateZip.file("word/document.xml");
  const bodyFile = bodyZip.file("word/document.xml");
  if (!templateFile || !bodyFile) {
    throw new Error("Invalid docx zip structure: word/document.xml not found.");
  }
  const templateXmlText = templateFile.asText();
  const bodyXmlText = bodyFile.asText();

  // Helper to get everything inside <w:body> except the final <w:sectPr>
  const getBodyContent = (xml: string) => {
    const bodyStart = xml.indexOf("<w:body>");
    const bodyEnd = xml.indexOf("</w:body>");
    if (bodyStart === -1 || bodyEnd === -1) return "";
    const bodyInner = xml.substring(bodyStart + 8, bodyEnd);
    
    const sectStart = bodyInner.lastIndexOf("<w:sectPr");
    if (sectStart !== -1) {
      return bodyInner.substring(0, sectStart);
    }
    return bodyInner;
  };

  // Helper to extract the <w:sectPr> tag from the template
  const getSectPr = (xml: string) => {
    const bodyStart = xml.indexOf("<w:body>");
    const bodyEnd = xml.indexOf("</w:body>");
    if (bodyStart === -1 || bodyEnd === -1) return "";
    const bodyInner = xml.substring(bodyStart + 8, bodyEnd);
    
    const sectStart = bodyInner.lastIndexOf("<w:sectPr");
    if (sectStart !== -1) {
      return bodyInner.substring(sectStart);
    }
    return "";
  };

  const generatedBodyContent = getBodyContent(bodyXmlText);
  const templateSectPr = getSectPr(templateXmlText);

  // 5. Replace template body content with generated content + template's section properties (header/footer)
  const newDocumentXml = templateXmlText.replace(
    /<w:body>([\s\S]*?)<\/w:body>/,
    `<w:body>${generatedBodyContent}${templateSectPr}</w:body>`
  );

  templateZip.file("word/document.xml", newDocumentXml);

  // 6. Generate the merged zip file as a blob
  return templateZip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
};

export const generateDocxWithLetterhead = async (bodyDoc: Document, filename: string) => {
  try {
    const outBlob = await generateDocxBlobWithLetterhead(bodyDoc);
    const url = window.URL.createObjectURL(outBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error generating docx with letterhead:", error);
    await downloadDocx(bodyDoc, filename);
  }
};

export const downloadPdfFromWord = async (bodyDoc: Document, filename: string) => {
  try {
    const docxBlob = await generateDocxBlobWithLetterhead(bodyDoc);
    
    // Create form data to upload the docx file
    const formData = new FormData();
    formData.append("file", docxBlob, filename.replace(/\.pdf$/, ".docx"));
    
    // Send to our conversion endpoint
    const response = await fetch("/api/convert-to-pdf", {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const errJson = await response.json();
      throw new Error(errJson.error || "Server failed to convert document");
    }
    
    const pdfBlob = await response.blob();
    
    // Download the PDF
    const url = window.URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error converting docx to pdf:", error);
    alert("שגיאה בהמרת הקובץ ל-PDF. קובץ ה-Word יורד במקום.");
    // Fallback to word download
    await generateDocxWithLetterhead(bodyDoc, filename.replace(/\.pdf$/, ".docx"));
  }
};

// Thin borders for tables
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

const detectImageType = (data: Uint8Array): "png" | "jpg" | "gif" => {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return "png";
  }
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return "jpg";
  }
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "gif";
  }
  return "png"; // default fallback
};

export const createDocxDocument = (
  children: any[],
  logoHeaderData?: Uint8Array,
  logoFooterData?: Uint8Array
): Document => {
  const sectionOptions: any = {
    children
  };

  if (logoHeaderData) {
    sectionOptions.headers = {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new ImageRun({
                data: logoHeaderData,
                type: detectImageType(logoHeaderData),
                transformation: {
                  width: 120,
                  height: 97
                }
              })
            ]
          })
        ]
      })
    };
  }

  if (logoFooterData) {
    sectionOptions.footers = {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: logoFooterData,
                type: detectImageType(logoFooterData),
                transformation: {
                  width: 600,
                  height: 180
                }
              })
            ]
          })
        ]
      })
    };
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            rightToLeft: true,
            font: "Arial",
            language: {
              bidirectional: "he-IL"
            }
          },
          paragraph: {
            alignment: AlignmentType.START,
          }
        }
      }
    },
    sections: [sectionOptions]
  });
};

/**
 * Creates a standard RTL paragraph with optional bolding, sizing, alignment, and spacing.
 */
export const createParagraph = (
  text: string, 
  options: { bold?: boolean; size?: number; alignment?: any; spacingAfter?: number } = {}
) => {
  return new Paragraph({
    alignment: options.alignment || AlignmentType.START,
    bidirectional: true,
    spacing: { after: options.spacingAfter !== undefined ? options.spacingAfter : 120 }, // 120 = 6pt
    children: [
      new TextRun({
        text,
        bold: options.bold || false,
        size: options.size || 24, // 12pt
        rightToLeft: true,
        font: "Arial",
      })
    ]
  });
};

/**
 * Creates a paragraph with a bold label followed by regular text.
 */
export const createLabelValueParagraph = (
  label: string,
  value: string,
  options: { size?: number; spacingAfter?: number } = {}
) => {
  return new Paragraph({
    alignment: AlignmentType.START,
    bidirectional: true,
    spacing: { after: options.spacingAfter !== undefined ? options.spacingAfter : 120 },
    children: [
      new TextRun({
        text: label + " ",
        bold: true,
        size: options.size || 24,
        rightToLeft: true,
        font: "Arial",
      }),
      new TextRun({
        text: value,
        bold: false,
        size: options.size || 24,
        rightToLeft: true,
        font: "Arial",
      })
    ]
  });
};

/**
 * Creates a paragraph containing multiline text (splits by newline and injects line breaks).
 */
export const createMultilineParagraph = (
  text: string,
  options: { bold?: boolean; size?: number; alignment?: any; spacingAfter?: number } = {}
) => {
  const lines = text.split("\n");
  const children = lines.map((line, idx) => {
    return new TextRun({
      text: line,
      bold: options.bold || false,
      size: options.size || 24,
      rightToLeft: true,
      font: "Arial",
      break: idx > 0 ? 1 : undefined,
    });
  });

  return new Paragraph({
    alignment: options.alignment || AlignmentType.START,
    bidirectional: true,
    spacing: { after: options.spacingAfter !== undefined ? options.spacingAfter : 120 },
    children,
  });
};

/**
 * Creates a clean spacing paragraph (empty line).
 */
export const createSpacer = (heightDxa: number = 240) => {
  return new Paragraph({
    spacing: { before: heightDxa },
    children: []
  });
};

/**
 * 1. Generate Personal Rehabilitation Plan Word Document
 */
export interface RehabPlanData {
  areasOfImprovement: string[];
  specificGoal: string;
  waysToAchieve: string[];
  sourcesOfSupport: string[];
}

export const generateRehabPlanWord = (
  planData: RehabPlanData,
  metadata: {
    date: string;
    patientName: string;
    patientId: string;
    therapistName: string;
    therapistTitle: string;
    districtWorker: string;
    logoHeaderData?: Uint8Array;
    logoFooterData?: Uint8Array;
  }
): any => {
  const children: any[] = [
    // Top Date - Aligned Left
    createParagraph(`תאריך: ${metadata.date}`, { alignment: AlignmentType.END, bold: true }),
    createSpacer(120),

    // Header/Title - Aligned Center, Bold, 16pt
    createParagraph("תוכנית שיקום אישית", { alignment: AlignmentType.CENTER, bold: true, size: 32, spacingAfter: 360 }),

    // Administrative Details
    createLabelValueParagraph("שם המטופל/ת:", metadata.patientName || "—"),
    createLabelValueParagraph("ת.ז:", metadata.patientId || "—"),
    createLabelValueParagraph("איש הצוות הטיפולי המלווה בחווה:", metadata.therapistName || "—"),
    createLabelValueParagraph("שם העו\"ס במחוז:", metadata.districtWorker || "—", { spacingAfter: 360 }),

    // Section א: Areas for Improvement
    createParagraph("א. באילו תחומים בחייך היית מעוניין לראות שיפור? ציין את התחומים על פי סדר החשיבות:", { bold: true }),
  ];

  // List areas
  if (planData.areasOfImprovement.length > 0) {
    planData.areasOfImprovement.forEach((area, idx) => {
      children.push(createParagraph(`${idx + 1}. ${area}`, { spacingAfter: 60 }));
    });
  } else {
    children.push(createParagraph("לא הוגדרו תחומים", { spacingAfter: 120 }));
  }

  children.push(createSpacer(120));

  // Section ב: Specific Goal
  children.push(createParagraph("ב. הגדר את המטרה באופן ספציפי וברור:", { bold: true }));
  children.push(createMultilineParagraph(planData.specificGoal || "לא הוגדרה מטרה ספציפית", { spacingAfter: 360 }));

  // Section 2 Column Table for Ways to Achieve and Sources of Support
  const waysParagraphs = planData.waysToAchieve.length > 0 
    ? planData.waysToAchieve.map(way => createParagraph(way, { spacingAfter: 60 })) 
    : [createParagraph("אין רשומות")];

  const supportsParagraphs = planData.sourcesOfSupport.length > 0
    ? planData.sourcesOfSupport.map(sup => createParagraph(sup, { spacingAfter: 60 }))
    : [createParagraph("אין רשומות")];

  const table = new Table({
    visuallyRightToLeft: true, // RTL order of columns
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      // Table Header
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.START,
                bidirectional: true,
                children: [
                  new TextRun({
                    text: "דרכים אפשריות להשגת המטרה (בדגש החווה)",
                    bold: true,
                    size: 24,
                    rightToLeft: true,
                    font: "Arial"
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.START,
                bidirectional: true,
                children: [
                  new TextRun({
                    text: "מקורות סיוע להשגת המטרה - מה או מי יכול לסייע?",
                    bold: true,
                    size: 24,
                    rightToLeft: true,
                    font: "Arial"
                  })
                ]
              })
            ]
          })
        ]
      }),
      // Table Body
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: waysParagraphs
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: supportsParagraphs
          })
        ]
      })
    ]
  });

  children.push(table);
  children.push(createSpacer(240));

  // Signature Block
  children.push(createParagraph("בברכה,", { spacingAfter: 60 }));
  children.push(createParagraph(metadata.therapistName, { bold: true, spacingAfter: 30 }));
  children.push(createParagraph(metadata.therapistTitle, { spacingAfter: 30 }));
  children.push(createParagraph("צוות טיפולי, חוות רום", { spacingAfter: 30 }));

  return createDocxDocument(children, metadata.logoHeaderData, metadata.logoFooterData);
};

/**
 * 2. Generate Stay Certificate Word Document
 */
export interface StayCertData {
  date: string;
  recipient: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  startDate: string;
  programName: string;
  activityDays: string;
  activityHours?: string;
  activityDetailText?: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryOrg: string;
  logoHeaderData?: Uint8Array;
  logoFooterData?: Uint8Array;
}

export const generateStayCertificateWord = (data: StayCertData): any => {
  const children = [
    // Date
    createParagraph(`תאריך: ${data.date}`, { alignment: AlignmentType.END, bold: true }),
    createSpacer(120),

    // Recipient
    createLabelValueParagraph("עבור:", data.recipient, { spacingAfter: 360 }),

    // Document Title
    createParagraph("אישור שהייה בחווה שיקומית", { alignment: AlignmentType.CENTER, bold: true, size: 32, spacingAfter: 360 }),

    // Subject
    createLabelValueParagraph("הנדון:", `${data.firstName} ${data.lastName}`),
    createLabelValueParagraph("ת.ז:", data.idNumber, { spacingAfter: 240 }),

    // Body text
    createParagraph(`הרינו לאשר כי הנ"ל החל בהגעה לחווה מהתאריך ${data.startDate}.`, { spacingAfter: 180 }),
    createParagraph(`הפעילות בחווה בתוכנית "${data.programName}" מתקיימת ${data.activityDays} בין השעות ${data.activityHours || "9:00-15:00"}.`, { spacingAfter: 180 }),
    createParagraph(data.activityDetailText || "הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.", { spacingAfter: 360 }),

    createSpacer(240),

    // Signature Block
    createParagraph("בברכה,", { spacingAfter: 60 }),
    createParagraph(data.signatoryName, { bold: true, spacingAfter: 30 }),
    createParagraph(data.signatoryTitle, { spacingAfter: 30 }),
    createParagraph(data.signatoryOrg, { spacingAfter: 30 })
  ];

  return createDocxDocument(children, data.logoHeaderData, data.logoFooterData);
};

/**
 * 3. Generate Travel Reimbursement Word Document
 */
export interface TravelReimbData {
  date: string;
  recipient: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  startDate: string;
  programName: string;
  activityDays: string;
  activityDetailText?: string;
  attendanceDatesStr: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryOrg: string;
  logoHeaderData?: Uint8Array;
  logoFooterData?: Uint8Array;
}

export const generateTravelReimbursementWord = (data: TravelReimbData): any => {
  const children: any[] = [
    // Date
    createParagraph(`תאריך: ${data.date}`, { alignment: AlignmentType.END, bold: true }),
    createSpacer(120),

    // Document Title
    createParagraph("החזר נסיעות חודשי", { alignment: AlignmentType.CENTER, bold: true, size: 32, spacingAfter: 360 }),

    // Recipient
    createLabelValueParagraph("עבור:", data.recipient, { spacingAfter: 240 }),

    // Subject & ID
    createLabelValueParagraph("הנדון:", `${data.firstName} ${data.lastName}`),
    createLabelValueParagraph("ת.ז:", data.idNumber, { spacingAfter: 240 }),

    // Body text
    createParagraph(`הרינו לאשר כי הנ"ל קיבל אישור להגעה לחווה מהתאריך ${data.startDate}.`, { spacingAfter: 180 }),
    createParagraph(`הפעילות בחווה בתוכנית "${data.programName}" מתקיימת בימי ${data.activityDays}.`, { spacingAfter: 180 }),
    createParagraph(data.activityDetailText || "הפעילויות השונות המתקיימות בחווה: עבודה חקלאית, גילוף בעץ ומלאכות קדומות, דיקור, יוגה, סדנאות שונות ושיחות קבוצתיות.", { spacingAfter: 180 }),
    
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'הנ"ל מבקש החזר נסיעות עבור ההגעה לחווה בתאריכים:',
          rightToLeft: true,
          font: "Arial",
          size: 24
        })
      ]
    })
  ];

  // Render each date line as a separate bold, underlined paragraph
  const dateLines = (data.attendanceDatesStr || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  dateLines.forEach(line => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.START,
        bidirectional: true,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: line,
            bold: true,
            underline: {},
            rightToLeft: true,
            font: "Arial",
            size: 24
          })
        ]
      })
    );
  });

  children.push(createSpacer(240));

  // Signature Block
  children.push(createParagraph("בברכה,", { spacingAfter: 60 }));
  children.push(createParagraph(data.signatoryName, { bold: true, spacingAfter: 30 }));
  children.push(createParagraph(data.signatoryTitle, { spacingAfter: 30 }));
  children.push(createParagraph(data.signatoryOrg, { spacingAfter: 30 }));

  return createDocxDocument(children, data.logoHeaderData, data.logoFooterData);
};

/**
 * 4. Generate Attendance Report (Fallback) Word Document
 */
export interface AttendanceReportData {
  date: string;
  recipient: string;
  patientName: string;
  idNumber: string;
  startDate: string;
  programName: string;
  activityDaysText: string;
  arrivedDates: string[];
  totalDays: number;
  signatoryName: string;
  signatoryTitle: string;
  logoHeaderData?: Uint8Array;
  logoFooterData?: Uint8Array;
}

export const generateAttendanceReportWord = (data: AttendanceReportData): any => {
  const children: any[] = [
    // Date
    createParagraph(`תאריך: ${data.date}`, { alignment: AlignmentType.END, bold: true }),
    createSpacer(120),

    // Recipient
    createLabelValueParagraph("עבור:", data.recipient, { spacingAfter: 240 }),

    // Document Title
    createParagraph("אישור נוכחות בחווה", { alignment: AlignmentType.CENTER, bold: true, size: 32, spacingAfter: 360 }),

    // Subject & ID
    createLabelValueParagraph("הנדון:", data.patientName),
    createLabelValueParagraph("ת.ז:", data.idNumber || "—", { spacingAfter: 240 }),

    // Body text
    createParagraph(`הרינו לאשר כי קיבל אישור להגעה לחווה החל מהתאריך: ${data.startDate || "—"}.`, { spacingAfter: 180 }),
    createParagraph(`הפעילות בחווה בתוכנית "${data.programName}" מתקיימת ${data.activityDaysText}.`, { spacingAfter: 180 }),
  ];

  // Dates list
  if (data.arrivedDates.length > 0) {
    children.push(createParagraph("להלן תאריכי ההגעה בחודש זה:", { bold: true, spacingAfter: 60 }));
    children.push(createParagraph(data.arrivedDates.join(", "), { spacingAfter: 120, bold: true }));
    children.push(createParagraph(`סה״כ ${data.totalDays} ימי נוכחות.`, { spacingAfter: 360 }));
  } else {
    children.push(createParagraph("אין ימי נוכחות רשומים בחודש זה.", { spacingAfter: 360 }));
  }

  children.push(createSpacer(240));

  // Signature Block
  children.push(createParagraph("בברכה,", { spacingAfter: 60 }));
  children.push(createParagraph(data.signatoryName, { bold: true, spacingAfter: 30 }));
  children.push(createParagraph(data.signatoryTitle, { spacingAfter: 30 }));

  return createDocxDocument(children, data.logoHeaderData, data.logoFooterData);
};

/**
 * 5. Generate Periodic Report (דו"ח תקופתי) Word Document
 */
export interface PeriodicReportData {
  date: string;
  reportType: string; // e.g. "דו\"ח השמה", "דו\"ח עזיבה", "דו\"ח חצי שנתי", "דו\"ח סיכום תקופה", "בקשה להארכה"
  recipient: string;
  rehabDistrict: string;
  rehabWorker: string; // עו"ס משרד הביטחון
  patientName: string;
  patientId: string;
  startDate: string;
  periodStart: string;
  periodEnd: string;
  rehabDescription: string;
  placementLocation: string;
  workDays: string;
  workHours: string;
  summaryProcess: string;
  recommendations: string;
  farmSocialWorker: string; // עו"ס בחווה
  logoHeaderData?: Uint8Array;
  logoFooterData?: Uint8Array;
}

export const generatePeriodicReportWord = (data: PeriodicReportData): any => {
  const children: any[] = [];

  // 2. Title - דו"ח תקופתי
  children.push(
    createParagraph("דו\"ח תקופתי", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 32,
      spacingAfter: 240
    })
  );

  // 3. Sender / Recipient Table (Borderless)
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  const headerTable = new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          // Right column (recipient)
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              createParagraph("לכבוד:", { bold: true, spacingAfter: 60 }),
              createParagraph(data.recipient || "אגף שיקום נכים משרד הביטחון", { spacingAfter: 60 }),
              createLabelValueParagraph("עו\"ס/יועץ:", data.rehabWorker || "—", { spacingAfter: 60 }),
              createLabelValueParagraph("לשכת מחוז השיקום:", data.rehabDistrict || "—", { spacingAfter: 60 }),
            ]
          }),
          // Left column (sender)
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              createParagraph("מאת:", { bold: true, spacingAfter: 60 }),
              createParagraph("חוות רום השקעות בע\"מ", { spacingAfter: 60 }),
              createParagraph("כתובת ד.צ. בית הכרם, כמון", { spacingAfter: 60 }),
              createParagraph("טלפון 049886147", { spacingAfter: 60 }),
              createParagraph("מס' ספק 00110011722", { spacingAfter: 60 }),
            ]
          })
        ]
      })
    ]
  });
  children.push(headerTable);
  children.push(createSpacer(180));

  // 4. Participant Info row
  children.push(
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "שם הזכאי: ",
          bold: true,
          size: 24,
          rightToLeft: true,
          font: "Arial"
        }),
        new TextRun({
          text: data.patientName + "    ",
          size: 24,
          rightToLeft: true,
          font: "Arial"
        }),
        new TextRun({
          text: "ת\"ז: ",
          bold: true,
          size: 24,
          rightToLeft: true,
          font: "Arial"
        }),
        new TextRun({
          text: data.patientId || "—",
          size: 24,
          rightToLeft: true,
          font: "Arial"
        })
      ]
    })
  );

  // 5. Selected Subtitle centered & bold
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 240 },
      children: [
        new TextRun({
          text: data.reportType,
          bold: true,
          size: 28,
          rightToLeft: true,
          font: "Arial"
        })
      ]
    })
  );

  // 6. Start date
  children.push(
    createLabelValueParagraph("התחיל טיפול בתאריך:", data.startDate || "—", { spacingAfter: 120 })
  );

  // 7. Activity Items Table
  const itemsTable = new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("מק\"ט", { bold: true, alignment: AlignmentType.CENTER })]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("שם הפריט", { bold: true })]
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("כמות", { bold: true, alignment: AlignmentType.CENTER })]
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("תקופה", { bold: true, alignment: AlignmentType.CENTER })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("054274", { alignment: AlignmentType.CENTER })]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("חווה שיקומית- שהות יומית לזכאי")]
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("")]
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [createParagraph("בשבוע", { alignment: AlignmentType.CENTER })]
          })
        ]
      })
    ]
  });
  children.push(itemsTable);
  children.push(createSpacer(180));

  // 8. Period Sentence (Split into multiple runs to guarantee correct Right-to-Left order of dates and text)
  children.push(
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "דו\"ח זה מתייחס לטיפול שהתקיים בתקופה מתאריך ",
          bold: true,
          rightToLeft: true,
          font: "Arial",
          size: 24
        }),
        new TextRun({
          text: data.periodStart || "______",
          bold: true,
          rightToLeft: true,
          font: "Arial",
          size: 24
        }),
        new TextRun({
          text: " עד תאריך ",
          bold: true,
          rightToLeft: true,
          font: "Arial",
          size: 24
        }),
        new TextRun({
          text: data.periodEnd || "______",
          bold: true,
          rightToLeft: true,
          font: "Arial",
          size: 24
        })
      ]
    })
  );

  // 9. Numbered Sections
  children.push(createLabelValueParagraph("1. תיאור תוכנית השיקום:", "", { spacingAfter: 60 }));
  children.push(createMultilineParagraph(data.rehabDescription || "—", { spacingAfter: 180 }));

  children.push(createLabelValueParagraph("2. מקום ההשמה:", data.placementLocation || "חוות רום - מרכז חוסן.", { spacingAfter: 180 }));

  children.push(
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 180 },
      children: [
        new TextRun({ text: "3. ימי עבודה: ", bold: true, rightToLeft: true, font: "Arial", size: 24 }),
        new TextRun({ text: (data.workDays || "—") + " ", rightToLeft: true, font: "Arial", size: 24 }),
        new TextRun({ text: "שעות עבודה: ", bold: true, rightToLeft: true, font: "Arial", size: 24 }),
        new TextRun({ text: data.workHours || "—", rightToLeft: true, font: "Arial", size: 24 }),
      ]
    })
  );

  children.push(createLabelValueParagraph("4. סיכום תהליך הליווי / השתלבות:", "", { spacingAfter: 60 }));
  children.push(createMultilineParagraph(data.summaryProcess || "—", { spacingAfter: 180 }));

  children.push(createLabelValueParagraph("5. המלצות להמשך:", "", { spacingAfter: 60 }));
  children.push(createMultilineParagraph(data.recommendations || "—", { spacingAfter: 180 }));

  children.push(createLabelValueParagraph("6. תאריך:", data.date || "—", { spacingAfter: 240 }));

  // 10. Signature Block
  children.push(createParagraph("בברכה:", { alignment: AlignmentType.CENTER, bold: true, spacingAfter: 180 }));

  const signatureTable = new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          // Right: Farm Social Worker name
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              createLabelValueParagraph("עו\"ס:", data.farmSocialWorker || "—"),
            ]
          }),
          // Left: MSW / Title
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              createParagraph("MSW", { bold: true, alignment: AlignmentType.END }),
              createParagraph("מנהלת מרכז חוסן", { bold: true, alignment: AlignmentType.END })
            ]
          })
        ]
      })
    ]
  });
  children.push(signatureTable);

  return createDocxDocument(children, data.logoHeaderData, data.logoFooterData);
};
