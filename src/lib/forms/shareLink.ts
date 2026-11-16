/** כתובת העמוד הציבורי של הטפסים */
export function formsUrl(): string {
  return `${window.location.origin}/forms`;
}

/** מעתיק את קישור הטפסים ללוח (עם גיבוי לשדה זמני כשאין הרשאת לוח) */
export async function copyFormsLink(): Promise<boolean> {
  const url = formsUrl();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
