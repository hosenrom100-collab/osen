/**
 * Client-side PDF generation for the certificates that are today produced as Word files
 * (stay certificate, travel reimbursement, attendance report).
 *
 * The text content mirrors the Word generators in `src/lib/word-generator.ts` exactly.
 * Each certificate is rendered as HTML on an off-screen A4 canvas, captured with
 * html2canvas and placed as one JPEG on a single jsPDF page. Nothing is sent to a server.
 */
import type {
  AttendanceReportData,
  StayCertData,
  TravelReimbData,
} from "@/lib/word-generator";

// ---------------------------------------------------------------------------
// Page geometry (CSS px at 96 DPI, A4 = 794 x 1123)
// ---------------------------------------------------------------------------
const PAGE_W = 794;
const PAGE_H = 1123;
const SIDE_MARGIN = 75; // same left/right margin as the preview template
const HEADER_TOP = 24; // letterhead header: top offset
const HEADER_W = 120; // same size as the Word header image
const HEADER_H = 97;
const FOOTER_W = 600; // same size as the Word footer image
const FOOTER_H = 180;
const FOOTER_BOTTOM = 20;
const CONTENT_TOP = 150; // below the header
const CONTENT_BOTTOM = FOOTER_BOTTOM + FOOTER_H + 8; // above the footer
const AVAILABLE_H = PAGE_H - CONTENT_TOP - CONTENT_BOTTOM;

const HEADER_SRC = "/logoup.png";
const FOOTER_SRC = "/logodown.png";
const FALLBACK_HEADER_TEXT = "חוות רום - מרכז חוסן";

const JPEG_QUALITY = 0.75;
const JPEG_QUALITY_LOW = 0.65;
const MAX_PDF_BYTES = 300 * 1024;

const FONT_STACK = "'Heebo', 'Assistant', Arial, sans-serif";

/**
 * Shrink steps, applied in order until the content fits on one page.
 * fontPt: body font size. space: multiplier for the Word spacing values.
 * dateCols: columns for long date lists (2+ columns narrow the list).
 */
interface Layout {
  fontPt: number;
  space: number;
  dateCols: number;
}

const LAYOUT_STEPS: Layout[] = [
  { fontPt: 12, space: 1, dateCols: 1 },
  { fontPt: 11, space: 0.8, dateCols: 1 },
  { fontPt: 10, space: 0.6, dateCols: 1 },
  { fontPt: 10, space: 0.5, dateCols: 3 },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateStayCertificatePdf(data: StayCertData): Promise<Blob> {
  return renderCertificatePdf(
    (L) => stayBody(data, L),
    data.logoHeaderData,
    data.logoFooterData
  );
}

export async function generateTravelReimbursementPdf(data: TravelReimbData): Promise<Blob> {
  return renderCertificatePdf(
    (L) => travelBody(data, L),
    data.logoHeaderData,
    data.logoFooterData
  );
}

export async function generateAttendanceReportPdf(data: AttendanceReportData): Promise<Blob> {
  return renderCertificatePdf(
    (L) => attendanceBody(data, L),
    data.logoHeaderData,
    data.logoFooterData
  );
}

// ---------------------------------------------------------------------------
// Certificate bodies (same text as the Word generators)
// ---------------------------------------------------------------------------

function stayBody(d: StayCertData, L: Layout): string {
  const name = `${d.firstName} ${d.lastName}`;
  const activityDays = d.activityDays.replace(/^(בימים|ביום)\s+/, "");
  return [
    dateLine(L, d.date),
    labelValue(L, "עבור:", d.recipient, 24),
    title(L, "אישור שהייה בחווה שיקומית", 24),
    labelValue(L, "הנדון:", name, 8),
    labelValue(L, "ת.ז:", d.idNumber, 16),
    para(L, `הרינו לאשר בזאת כי ${name} שולב בתהליך השיקום בחוות רום החל מתאריך ${d.startDate}.`, 12),
    para(
      L,
      `הפעילות בתוכנית "${d.programName}"${d.programTrack ? ` (${d.programTrack})` : ""} מתקיימת בימים ${activityDays} בין השעות ${d.activityHours || "9:00-15:00"}.`,
      12
    ),
    d.fundingSource ? para(L, `המימון לפעילות מוסדר באמצעות: ${d.fundingSource}.`, 12) : "",
    d.specialRemarks ? para(L, `הערות: ${d.specialRemarks}`, 12) : "",
    para(
      L,
      d.activityDetailText ||
        "תחומי העשייה המגוונים במסגרת שהותו בחווה כוללים: עבודה חקלאית בשדות ובחממות, גילוף בעץ ומלאכות קדומות, סדנאות יצירה ואמנות, תרגול יוגה ונשימה בקבוצה וליווי רגשי מתמשך.",
      24
    ),
    signatureBlock(
      L,
      { name: d.signatoryName, title: d.signatoryTitle, org: d.signatoryOrg, signature: d.signatureImage },
      d.managerName
        ? {
            name: d.managerName,
            title: d.managerTitle,
            org: d.managerOrg,
            signature: d.managerSignature,
          }
        : undefined
    ),
  ].join("");
}

function travelBody(d: TravelReimbData, L: Layout): string {
  const name = `${d.firstName} ${d.lastName}`;
  const activityDays = d.activityDays.replace(/^(בימים|ביום)\s+/, "");
  const dateItems = (d.attendanceDatesStr || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [
    dateLine(L, d.date),
    title(L, "החזר נסיעות חודשי", 24),
    labelValue(L, "עבור:", d.recipient, 16),
    labelValue(L, "הנדון:", name, 8),
    labelValue(L, "ת.ז:", d.idNumber, 16),
    para(L, `הרינו לאשר בזאת כי ${name} שולב בתהליך השיקום בחוות רום החל מתאריך ${d.startDate}.`, 12),
    para(
      L,
      `הפעילות בתוכנית "${d.programName}" מתקיימת בימים ${activityDays} בין השעות ${d.activityHours || "9:00-15:00"}.`,
      12
    ),
    para(L, "אופן ההגעה לחווה: הגעה לחווה ברכב פרטי.", 12),
    para(
      L,
      d.activityDetailText ||
        "הפעילות השיקומית בחווה מקיפה מגוון תחומים ובהם: עבודה חקלאית יומיומית, מלאכות יד וגילוף, סדנאות יוגה וקבוצות שיח תמיכתיות.",
      12
    ),
    para(L, 'הנ"ל מבקש החזר נסיעות עבור ההגעה לחווה בתאריכים:', 8),
    dateList(L, dateItems, { bold: true, underline: true, after: 4 }),
    signatureBlock(
      L,
      { name: d.signatoryName, title: d.signatoryTitle, org: d.signatoryOrg, signature: d.signatureImage },
      d.managerName
        ? {
            name: d.managerName,
            title: d.managerTitle,
            org: d.managerOrg,
            signature: d.managerSignature,
          }
        : undefined
    ),
  ].join("");
}

function attendanceBody(d: AttendanceReportData, L: Layout): string {
  const hasDates = d.arrivedDates.length > 0;
  return [
    dateLine(L, d.date),
    labelValue(L, "עבור:", d.recipient, 16),
    title(L, "אישור נוכחות בחווה", 24),
    labelValue(L, "הנדון:", d.patientName, 8),
    labelValue(L, "ת.ז:", d.idNumber || "—", 16),
    para(L, `הרינו לאשר כי קיבל אישור להגעה לחווה החל מהתאריך: ${d.startDate || "—"}.`, 12),
    para(L, `הפעילות בחווה בתוכנית "${d.programName}" מתקיימת ${d.activityDaysText}.`, 12),
    hasDates
      ? [
          para(L, "להלן תאריכי ההגעה בחודש זה:", 4, true),
          dateList(L, d.arrivedDates, { bold: true, joiner: ", ", after: 8 }),
          para(L, `סה״כ ${d.totalDays} ימי נוכחות.`, 24),
        ].join("")
      : para(L, "אין ימי נוכחות רשומים בחודש זה.", 24),
    signatureBlock(
      L,
      { name: d.signatoryName, title: d.signatoryTitle, org: "חוות רום - מרכז חוסן", signature: d.signatureImage },
      d.managerName
        ? {
            name: d.managerName,
            title: d.managerTitle,
            org: d.managerOrg,
            signature: d.managerSignature,
          }
        : undefined
    ),
  ].join("");
}

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------

/** Spacing in px, scaled by the current layout step. */
function sp(L: Layout, px: number): string {
  return `${Math.round(px * L.space)}px`;
}

function dateLine(L: Layout, date: string): string {
  return `<div style="font-weight:700;margin-bottom:${sp(L, 8)}">תאריך: ${esc(date)}</div>`;
}

function title(L: Layout, text: string, after: number): string {
  return `<div style="text-align:center;font-weight:700;font-size:${L.fontPt + 4}pt;margin-bottom:${sp(L, after)}">${esc(text)}</div>`;
}

function labelValue(L: Layout, label: string, value: string, after: number): string {
  return `<div style="margin-bottom:${sp(L, after)}"><b>${esc(label)}</b> ${esc(value)}</div>`;
}

function para(L: Layout, text: string, after: number, bold = false): string {
  // Keep time ranges like 8:00-16:30 on one line (no break after the hyphen).
  const html = esc(text).replace(
    /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g,
    '<span style="white-space:nowrap;direction:ltr;unicode-bidi:isolate;">$1-$2</span>'
  );
  return `<p style="margin:0 0 ${sp(L, after)};${bold ? "font-weight:700;" : ""}">${html}</p>`;
}

/**
 * List of dates. Short lists are shown inline (attendance) or one per line (travel).
 * Long lists are laid out in several narrow columns so they stay on one page.
 */
function dateList(
  L: Layout,
  items: string[],
  opts: { bold?: boolean; underline?: boolean; joiner?: string; after: number }
): string {
  if (items.length === 0) return "";
  const style = `${opts.bold ? "font-weight:700;" : ""}${opts.underline ? "text-decoration:underline;" : ""}`;
  const cols = items.length > 8 || L.dateCols > 1 ? 3 : 1;

  if (cols === 1 && opts.joiner !== undefined) {
    return `<div style="${style}margin-bottom:${sp(L, opts.after)}">${esc(items.join(opts.joiner))}</div>`;
  }
  if (cols === 1) {
    return items
      .map((item) => `<div style="${style}margin-bottom:${sp(L, opts.after)}">${esc(item)}</div>`)
      .join("");
  }
  const cells = items.map((item) => `<div style="${style}">${esc(item)}</div>`).join("");
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);column-gap:12px;row-gap:${sp(L, opts.after)};margin-bottom:${sp(L, 8)}">${cells}</div>`;
}

function hasSignature(s?: string): s is string {
  return !!s && s.includes(",");
}

function signatureImageHtml(s?: string): string {
  if (hasSignature(s)) {
    return `<img src="${esc(s)}" width="120" height="48" alt="" style="display:block;width:120px;height:48px;margin:0 0 4px 0">`;
  }
  return `<div style="height:8px"></div>`;
}

interface SignerInfo {
  name: string;
  title?: string;
  org?: string;
  signature?: string;
}

/** Two-column signature block: therapist on the right, manager (if any) on the left. */
function signatureBlock(L: Layout, therapist: SignerInfo, manager?: SignerInfo): string {
  const right = `<div style="flex:1;min-width:0">
      <div style="margin-bottom:4px">בברכה,</div>
      ${signatureImageHtml(therapist.signature)}
      <div style="font-weight:700;margin-bottom:2px">${esc(therapist.name)}</div>
      <div style="margin-bottom:2px">${esc(therapist.title || "")}</div>
      <div style="margin-bottom:2px">${esc(therapist.org || "")}</div>
    </div>`;

  const left = manager?.name
    ? `<div style="flex:1;min-width:0">
        <div style="margin-bottom:4px">בברכה / אישור:</div>
        ${signatureImageHtml(manager.signature)}
        <div style="font-weight:700;margin-bottom:2px">${esc(manager.name)}</div>
        <div style="margin-bottom:2px">${esc(manager.title || 'עו"ס MSW, מנהלת מקצועית חוסן')}</div>
        ${manager.org ? `<div style="margin-bottom:2px">${esc(manager.org)}</div>` : ""}
      </div>`
    : `<div style="flex:1;min-width:0"></div>`;

  return `<div style="display:flex;gap:24px;margin-top:${sp(L, 16)};page-break-inside:avoid">${right}${left}</div>`;
}

// ---------------------------------------------------------------------------
// Rendering pipeline
// ---------------------------------------------------------------------------

async function renderCertificatePdf(
  bodyFor: (L: Layout) => string,
  logoHeaderData?: Uint8Array,
  logoFooterData?: Uint8Array
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("certificatePdf: PDF generation runs only in the browser");
  }

  // Dynamic imports: the libraries are loaded only when a PDF is actually built.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const headerSrc = logoHeaderData ? bytesToDataUrl(logoHeaderData) : HEADER_SRC;
  const footerSrc = logoFooterData ? bytesToDataUrl(logoFooterData) : FOOTER_SRC;

  const root = buildShell(headerSrc, footerSrc);
  document.body.appendChild(root);

  try {
    const inner = root.querySelector<HTMLElement>("[data-cert-inner]");
    if (!inner) throw new Error("certificatePdf: template missing");

    await waitForFonts();
    await waitForHeaderOrFallback(root);

    // Pick the first layout step that fits the content area on one page.
    for (const step of LAYOUT_STEPS) {
      inner.innerHTML = bodyFor(step);
      if (inner.offsetHeight <= AVAILABLE_H) break;
    }

    // Last resort: scale the content area only (letterhead is untouched).
    const contentHeight = inner.offsetHeight;
    if (contentHeight > AVAILABLE_H) {
      const scale = (AVAILABLE_H / contentHeight) * 0.98;
      inner.style.transformOrigin = "top right";
      inner.style.transform = `scale(${scale.toFixed(4)})`;
    }

    await waitForImages(root);
    await waitForNextFrame();

    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: PAGE_W,
      height: PAGE_H,
      windowWidth: PAGE_W,
      windowHeight: PAGE_H,
    });

    let jpeg = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    let blob = singlePagePdf(jsPDF, jpeg);

    if (blob.size > MAX_PDF_BYTES) {
      jpeg = canvas.toDataURL("image/jpeg", JPEG_QUALITY_LOW);
      blob = singlePagePdf(jsPDF, jpeg);
    }

    return blob;
  } finally {
    root.remove();
  }
}

/** One A4 page; the image fills exactly 210 x 297 mm. Never adds a second page. */
function singlePagePdf(
  jsPDFCtor: typeof import("jspdf").jsPDF,
  jpegDataUrl: string
): Blob {
  const pdf = new jsPDFCtor({ unit: "mm", format: "a4", compress: true });
  pdf.addImage(jpegDataUrl, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  return pdf.output("blob");
}

function buildShell(headerSrc: string, footerSrc: string): HTMLDivElement {
  const root = document.createElement("div");
  root.setAttribute("dir", "rtl");
  root.setAttribute("lang", "he");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${PAGE_W}px`,
    `height:${PAGE_H}px`,
    "background:#ffffff",
    "color:#000000",
    "overflow:hidden",
    "direction:rtl",
    `font-family:${FONT_STACK}`,
    "font-size:12pt",
    "box-sizing:border-box",
  ].join(";");

  root.innerHTML = `
    <style>
      @font-face { font-family: 'Heebo'; src: url('/Heebo-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
      @font-face { font-family: 'Heebo'; src: url('/Heebo-Bold.ttf') format('truetype'); font-weight: 700; font-style: normal; font-display: block; }
    </style>
    <div data-cert-header style="position:absolute;top:${HEADER_TOP}px;left:${SIDE_MARGIN - 27}px;width:${HEADER_W}px;height:${HEADER_H}px;">
      <img src="${esc(headerSrc)}" width="${HEADER_W}" height="${HEADER_H}" alt="" style="display:block;width:${HEADER_W}px;height:${HEADER_H}px;">
    </div>
    <div data-cert-content style="position:absolute;left:${SIDE_MARGIN}px;right:${SIDE_MARGIN}px;top:${CONTENT_TOP}px;height:${AVAILABLE_H}px;overflow:hidden;">
      <div data-cert-inner></div>
    </div>
    <div data-cert-footer style="position:absolute;left:${(PAGE_W - FOOTER_W) / 2}px;bottom:${FOOTER_BOTTOM}px;width:${FOOTER_W}px;height:${FOOTER_H}px;">
      <img src="${esc(footerSrc)}" width="${FOOTER_W}" height="${FOOTER_H}" alt="" style="display:block;width:${FOOTER_W}px;height:${FOOTER_H}px;">
    </div>`;

  return root;
}

/**
 * If the header image cannot be loaded, show the organisation name as plain text instead.
 * TODO: replace the fallback with the real letterhead header when the asset is missing in production.
 */
async function waitForHeaderOrFallback(root: HTMLElement): Promise<void> {
  const header = root.querySelector<HTMLElement>("[data-cert-header]");
  const img = header?.querySelector("img");
  if (!header || !img) return;
  try {
    await img.decode();
  } catch {
    header.innerHTML = `<div style="font-size:14pt;font-weight:700;padding-top:20px;text-align:left">${esc(FALLBACK_HEADER_TEXT)}</div>`;
  }
}

/** Footer and signature images: drop any that fail, so capture is never blocked. */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.decode().catch(() => {
        img.remove();
      })
    )
  );
}

async function waitForFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load("400 12pt Heebo"),
      document.fonts.load("700 12pt Heebo"),
    ]);
  } catch {
    // Fonts unavailable: the fallback stack is used.
  }
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function bytesToDataUrl(bytes: Uint8Array): string {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${isJpeg ? "image/jpeg" : "image/png"};base64,${btoa(binary)}`;
}
