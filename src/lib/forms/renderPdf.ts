import { jsPDF } from "jspdf";
import { fieldValue, type FormDef, type FormValues } from "./definitions";

const W = 1275;
const H = 1651;
const X_RIGHT = 1165;
const X_LEFT = 110;
const Y_START = 310;
const Y_END = 1450;
const INK = "#1f2a44";
const MUTED = "#5b6785";
const FONT = '"Assistant Local", Arial, sans-serif';

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

/** מייצר PDF (Blob) של הטופס על דף הלוגו */
export async function renderFormPdf(def: FormDef, values: FormValues): Promise<Blob> {
  try {
    await document.fonts.load(`400 30px ${FONT}`);
    await document.fonts.load(`700 30px ${FONT}`);
  } catch {}
  const bg = await loadImage("/logopage.png");
  const sig = values.signature ? await loadImage(values.signature) : null;

  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = Y_START;

  const newPage = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    ctx = c.getContext("2d")!;
    ctx.drawImage(bg, 0, 0, W, H);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    pages.push(c);
    y = Y_START;
  };
  const ensure = (h: number) => {
    if (y + h > Y_END) newPage();
  };
  const text = (t: string, size: number, weight: number, color: string, gap = 1.45) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    for (const line of wrap(ctx, t, X_RIGHT - X_LEFT)) {
      ensure(size * gap);
      ctx.fillText(line, X_RIGHT, y + size);
      y += size * gap;
    }
  };

  newPage();
  text(def.title, 52, 700, INK, 1.3);
  y += 6;
  ctx.fillStyle = "#c98c70";
  ctx.fillRect(X_LEFT, y, X_RIGHT - X_LEFT, 3);
  y += 28;

  for (const p of def.paragraphs ?? []) {
    if (p.heading) text(p.heading, 28, 700, INK);
    text(p.body, 26, 400, INK);
    y += 12;
  }
  if (def.paragraphs?.length) y += 8;

  for (const f of def.fields) {
    const v = fieldValue(f, values);
    ensure(90);
    text(f.label, 22, 400, MUTED, 1.3);
    text(v || "—", 28, 700, INK, 1.4);
    ctx.fillStyle = "#d5dae6";
    ctx.fillRect(X_LEFT, y + 2, X_RIGHT - X_LEFT, 1.5);
    y += 20;
  }

  if (def.needsSignature) {
    ensure(240);
    y += 10;
    text((values.agree === "1" ? "☑ " : "☐ ") + (def.agreeLabel ?? ""), 26, 700, INK);
    y += 14;
    text(`תאריך: ${new Date().toLocaleDateString("he-IL")}`, 24, 400, MUTED);
    y += 8;
    text("חתימה:", 24, 400, MUTED);
    if (sig) {
      const h = 130;
      const w = Math.min(420, (sig.width / sig.height) * h);
      ctx.drawImage(sig, X_RIGHT - w, y, w, h);
    }
    y += 140;
  }

  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  pages.forEach((c, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 612, 792);
  });
  return pdf.output("blob");
}
