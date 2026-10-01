import { format } from "date-fns";
import { Product, ShoppingRequest, TargetFramework } from "../types";
import { FRAMEWORK_LABELS, TARGET_FRAMEWORKS } from "./constants";
import { generateShoppingListPdf } from "@/lib/pdf/shoppingListPdf";
import { generateShoppingListWord, generateDocxBlobWithLetterhead } from "@/lib/word-generator";

/** Where the weekly lists go, and what the mail says. Saved in `settings/shopping.emailConfig`. */
export interface EmailConfig {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  to: "",
  cc: "",
  subject: "רשימות קניות לחוסן",
  body: [
    "מצ״ב רשימות קניות לחוסן.",
    "יש להפריד את הרשימות ולציין בכל משלוח לאיזה מסגרת זה מיועד.",
    "",
    "בברכה,",
    "מירב סארמילי",
    "חוות רום",
    "052-609-1158",
  ].join("\n"),
};

export interface MailAttachment {
  name: string;
  /** Which list and framework this file is for, for the preview. */
  label: string;
  blob: Blob;
  mime: string;
}

type ListType = "supermarket" | "large";

const isOpen = (r: ShoppingRequest) => r.status === "approved" || r.status === "pending";
const inList = (r: ShoppingRequest, t: ListType) => (t === "large" ? r.listType === "large" : r.listType !== "large");

/** How many open items each list has per framework: what would be attached. */
export function mailableLists(requests: ShoppingRequest[]) {
  const out: { listType: ListType; framework: TargetFramework; count: number }[] = [];
  for (const listType of ["supermarket", "large"] as ListType[]) {
    for (const fw of TARGET_FRAMEWORKS) {
      const count = requests.filter(r => isOpen(r) && inList(r, listType) && (r.targetFramework || "main") === fw.id).length;
      if (count) out.push({ listType, framework: fw.id, count });
    }
  }
  return out;
}

/** One file per list and framework, so the supplier gets them separated. */
export async function buildAttachments(
  requests: ShoppingRequest[],
  pool: Product[],
  weekLabels: { supermarket: string; large: string },
  fmt: "word" | "pdf",
): Promise<MailAttachment[]> {
  const stamp = format(new Date(), "yyyy-MM-dd");
  const dateStr = format(new Date(), "dd/MM/yyyy");
  const out: MailAttachment[] = [];
  for (const { listType, framework } of mailableLists(requests)) {
    const fwLabel = FRAMEWORK_LABELS[framework] || framework;
    const items = requests
      .filter(r => isOpen(r) && inList(r, listType) && (r.targetFramework || "main") === framework)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map(r => {
        const match = pool.find(p => (p.name || "").trim().toLowerCase() === (r.name || "").trim().toLowerCase());
        return { name: r.name, category: r.category, quantity: r.quantity || "1", notes: r.notes || match?.defaultNotes || "", requestedByName: r.requestedByName || "" };
      });
    const meta = {
      date: dateStr,
      title: listType === "large" ? `רשימת רכש וציוד ${weekLabels.large}` : `רשימת קניות ${weekLabels.supermarket}`,
      subtitle: `מרכז חוסן - חרבות ברזל · ${fwLabel}`,
    };
    const base = `${listType === "large" ? "רשימת_רכש" : "רשימת_קניות"}_${fwLabel.replace(/["״\s]/g, "_")}_${stamp}`;
    const label = `${listType === "large" ? "רכש וציוד" : "קניות"} · ${fwLabel}`;
    if (fmt === "pdf") {
      const blob = (await generateShoppingListPdf(items, meta, null)) as Blob;
      out.push({ name: `${base}.pdf`, label, blob, mime: "application/pdf" });
    } else {
      const blob = await generateDocxBlobWithLetterhead(generateShoppingListWord(items, meta));
      out.push({ name: `${base}.docx`, label, blob, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    }
  }
  return out;
}

// ── .eml ───────────────────────────────────────────────────────────────────
// A browser cannot attach files through a mailto: link, but a .eml file can carry them: opening it
// in the desktop mail program gives a message with the attachments in place. `X-Unsent: 1` marks it
// as a draft to send rather than a message received.

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/(.{76})/g, "$1\r\n");
};
const word = (s: string) => `=?UTF-8?B?${btoa(String.fromCharCode(...utf8(s)))}?=`;
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const splitAddresses = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
export const validAddresses = (s: string) => splitAddresses(s).every(a => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));

export async function buildEml(cfg: EmailConfig, files: MailAttachment[]): Promise<Blob> {
  const id = Math.random().toString(36).slice(2);
  const outer = `----=_mixed_${id}`, inner = `----=_alt_${id}`;
  const html = `<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;font-size:14px">${escapeHtml(cfg.body).replace(/\n/g, "<br>")}</div>`;
  const parts: string[] = [
    [
      "X-Unsent: 1",
      "MIME-Version: 1.0",
      cfg.to.trim() ? `To: ${splitAddresses(cfg.to).join(", ")}` : "",
      cfg.cc.trim() ? `Cc: ${splitAddresses(cfg.cc).join(", ")}` : "",
      `Subject: ${word(cfg.subject)}`,
      `Content-Type: multipart/mixed; boundary="${outer}"`,
    ].filter(Boolean).join("\r\n") + "\r\n",
    `--${outer}\r\nContent-Type: multipart/alternative; boundary="${inner}"\r\n`,
    `--${inner}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(utf8(cfg.body))}\r\n`,
    `--${inner}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(utf8(html))}\r\n`,
    `--${inner}--\r\n`,
  ];
  for (const f of files) {
    const bytes = new Uint8Array(await f.blob.arrayBuffer());
    parts.push(
      `--${outer}\r\nContent-Type: ${f.mime}; name="${word(f.name)}"\r\nContent-Transfer-Encoding: base64\r\n` +
      `Content-Disposition: attachment; filename="${word(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}\r\n\r\n${b64(bytes)}\r\n`,
    );
  }
  parts.push(`--${outer}--\r\n`);
  return new Blob([parts.join("\r\n")], { type: "message/rfc822" });
}
