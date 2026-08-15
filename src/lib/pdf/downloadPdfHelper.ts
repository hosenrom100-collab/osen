/**
 * Safely opens or downloads a PDF file from an HTTPS URL or Base64 Data URL,
 * handling browser popup blockers, mobile browser limits, and Blob URLs.
 */
export function openOrDownloadPdf(url: string, filename = "אישור_קנייה_אד_הוק.pdf") {
  if (!url) return;

  try {
    // 1. Handle Base64 Data URLs (data:application/pdf;base64,...)
    if (url.startsWith("data:application/pdf") || url.startsWith("data:base64")) {
      const parts = url.split(",");
      const base64Data = parts[1] || parts[0];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);

      // Open Blob URL in new window/tab
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        // Fallback for mobile / popup blocker
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return;
    }

    // 2. Handle Standard HTTPS URLs
    let targetUrl = url;
    try {
      if (url.startsWith("http") && !url.includes("data:")) {
        const urlObj = new URL(url);
        urlObj.searchParams.set("t", Date.now().toString());
        targetUrl = urlObj.toString();
      }
    } catch (urlErr) {
      console.error("Error adding cache buster to PDF URL:", urlErr);
    }

    const win = window.open(targetUrl, "_blank");
    if (!win) {
      // Fallback if popup blocked
      const link = document.createElement("a");
      link.href = targetUrl;
      link.target = "_blank";
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.error("Error downloading/opening PDF:", err);
    // Ultimate fallback
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
