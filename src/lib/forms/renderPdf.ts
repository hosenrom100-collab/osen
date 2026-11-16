import { jsPDF } from "jspdf";
import { fieldValue, type FieldDef, type FormDef, type FormValues } from "./definitions";

// עמוד A4 (יחס 1:1.4142) על בסיס רוחב דף הלוגו
const W = 1275;
const H = 1804;
const X_RIGHT = 1165;
const X_LEFT = 110;
const GAP = 40;
const COL_W = (X_RIGHT - X_LEFT - GAP) / 2;
const Y_START = 310;
const Y_END = 1615;
const INK = "#1f2a44";
const MUTED = "#5b6785";
const FONT = '"Assistant Local", Arial, sans-serif';

// דף הלוגו המקורי הוא 1275x1651; מותחים אותו ל-A4 בלי עיוות:
// פס עליון (הלוגו) צמוד למעלה, פס תחתון (הפוטר) צמוד למטה, והאמצע לבן.
const BG_H = 1651;
const TOP_SLICE = 300;
const BOTTOM_SLICE_Y = 1290;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

interface Layout {
  pages: HTMLCanvasElement[];
}

/** מצייר את הטופס בקנה מידה נתון ומחזיר את העמודים */
function draw(def: FormDef, values: FormValues, bg: HTMLImageElement, sig: HTMLImageElement | null, s: number): Layout {
  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = Y_START;

  const newPage = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, TOP_SLICE, 0, 0, W, TOP_SLICE);
    const bh = BG_H - BOTTOM_SLICE_Y;
    ctx.drawImage(bg, 0, BOTTOM_SLICE_Y, W, bh, 0, H - bh, W, bh);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    pages.push(c);
    y = Y_START;
  };
  const ensure = (h: number) => {
    if (y + h > Y_END) newPage();
  };
  const setFont = (size: number, weight: number) => {
    ctx.font = `${weight} ${size * s}px ${FONT}`;
  };
  /** טקסט לרוחב מלא */
  const text = (t: string, size: number, weight: number, color: string, gap = 1.45) => {
    setFont(size, weight);
    ctx.fillStyle = color;
    for (const line of wrap(ctx, t, X_RIGHT - X_LEFT)) {
      ensure(size * s * gap);
      ctx.fillText(line, X_RIGHT, y + size * s);
      y += size * s * gap;
    }
  };

  /** תא של שדה: תווית + ערך + קו תחתון. x = הקצה הימני של התא */
  const cell = (f: FieldDef, x: number, w: number) => {
    const v = fieldValue(f, values) || "—";
    setFont(22, 400);
    const labelLines = wrap(ctx, f.label, w);
    setFont(28, 700);
    const valueLines = wrap(ctx, v, w);
    const labelH = labelLines.length * 22 * s * 1.3;
    const valueH = valueLines.length * 28 * s * 1.4;
    return {
      height: labelH + valueH + 22 * s,
      paint: (top: number) => {
        let yy = top;
        setFont(22, 400);
        ctx.fillStyle = MUTED;
        for (const l of labelLines) {
          ctx.fillText(l, x, yy + 22 * s);
          yy += 22 * s * 1.3;
        }
        setFont(28, 700);
        ctx.fillStyle = INK;
        for (const l of valueLines) {
          ctx.fillText(l, x, yy + 28 * s);
          yy += 28 * s * 1.4;
        }
        ctx.fillStyle = "#d5dae6";
        ctx.fillRect(x - w, yy + 2, w, 1.5);
      },
    };
  };

  const drawFields = () => {
    // שדות בצורה אופקית: שני שדות בשורה (הראשון בימין). שדה טקסט ארוך – בשורה משלו.
    const queue = [...def.fields];
    while (queue.length) {
      const first = queue.shift()!;
      let row: { f: FieldDef; x: number; w: number }[];
      if (first.type === "textarea") {
        row = [{ f: first, x: X_RIGHT, w: X_RIGHT - X_LEFT }];
      } else {
        row = [{ f: first, x: X_RIGHT, w: COL_W }];
        if (queue.length && queue[0].type !== "textarea") {
          row.push({ f: queue.shift()!, x: X_RIGHT - COL_W - GAP, w: COL_W });
        }
      }
      const cells = row.map((r) => cell(r.f, r.x, r.w));
      const h = Math.max(...cells.map((c) => c.height));
      ensure(h);
      cells.forEach((c) => c.paint(y));
      y += h + 6 * s;
    }
  };

  const drawParagraphs = () => {
    for (const p of def.paragraphs ?? []) {
      ensure(p.heading ? 130 * s : 60 * s);
      if (p.heading) text(p.heading, 28, 700, INK);
      text(p.body, 25, 400, INK);
      if (p.note) text("* " + p.note, 24, 700, "#9a4b2f");
      y += 14 * s;
    }
    if (def.paragraphs?.length) y += 8 * s;
  };

  newPage();
  text(def.title, 52, 700, INK, 1.3);
  y += 6;
  ctx.fillStyle = "#c98c70";
  ctx.fillRect(X_LEFT, y, X_RIGHT - X_LEFT, 3);
  y += 24 * s;

  if (def.fieldsFirst) {
    drawFields();
    y += 10 * s;
    drawParagraphs();
  } else {
    drawParagraphs();
    drawFields();
  }

  if (def.needsSignature) {
    const sigH = 120 * s;
    ensure(150 * s + sigH);
    y += 10 * s;
    text((values.agree === "1" ? "☑ " : "☐ ") + (def.agreeLabel ?? ""), 26, 700, INK);
    y += 10 * s;
    // תאריך (ימין) וחתימה (שמאל) באותה שורה
    const top = y;
    setFont(24, 400);
    ctx.fillStyle = MUTED;
    ctx.fillText("תאריך:", X_RIGHT, top + 24 * s);
    setFont(28, 700);
    ctx.fillStyle = INK;
    ctx.fillText(new Date().toLocaleDateString("he-IL"), X_RIGHT - 100 * s, top + 26 * s);
    const sigRight = X_RIGHT - COL_W - GAP;
    setFont(24, 400);
    ctx.fillStyle = MUTED;
    ctx.fillText("חתימה:", sigRight, top + 24 * s);
    if (sig) {
      const w = Math.min(COL_W - 100 * s, (sig.width / sig.height) * sigH);
      ctx.drawImage(sig, sigRight - 100 * s - w, top, w, sigH);
    }
    ctx.fillStyle = "#d5dae6";
    ctx.fillRect(X_RIGHT - COL_W, top + sigH + 2, COL_W, 1.5);
    ctx.fillRect(sigRight - COL_W, top + sigH + 2, COL_W, 1.5);
    y += sigH + 10;
  }

  return { pages };
}

/** מייצר PDF (Blob) בגודל A4. טפסים מסוג singlePage מוקטנים אוטומטית עד שנכנסים לעמוד אחד */
export async function renderFormPdf(def: FormDef, values: FormValues): Promise<Blob> {
  try {
    await document.fonts.load(`400 30px ${FONT}`);
    await document.fonts.load(`700 30px ${FONT}`);
  } catch {}
  const bg = await loadImage("/logopage.png");
  const sig = values.signature ? await loadImage(values.signature) : null;

  let scale = 1;
  let layout = draw(def, values, bg, sig, scale);
  while (def.singlePage && layout.pages.length > 1 && scale > 0.45) {
    scale -= 0.05;
    layout = draw(def, values, bg, sig, scale);
  }

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  layout.pages.forEach((c, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
  });
  return pdf.output("blob");
}
