import type { Metadata } from "next";
import { headers } from "next/headers";

const TITLE = "טפסים למילוי | חוות רום";
const DESCRIPTION = "פרטים אישיים, חוזה טיפולי וויתור סודיות. ממלאים בנייד ושולחים בוואטסאפ.";

/**
 * כרטיס תצוגה לשיתוף (וואטסאפ וכו'): כותרת, תיאור ותמונה עם לוגו החווה.
 * הכתובת המלאה נגזרת מהדומיין שבו האפליקציה רצה, כי רשתות חברתיות דורשות כתובת תמונה מוחלטת.
 */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const image = { url: `${origin}/og-forms.png`, width: 1200, height: 630, alt: "טפסים למילוי – חוות רום" };

  return {
    metadataBase: new URL(origin),
    title: TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: "חוות רום – מרכז חוסן",
      url: `${origin}/forms`,
      title: "טפסים למילוי",
      description: DESCRIPTION,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: "טפסים למילוי", description: DESCRIPTION, images: [image.url] },
  };
}

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
