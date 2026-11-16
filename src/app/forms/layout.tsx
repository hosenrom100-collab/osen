import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "טפסים | חוות רום",
  description: "טפסים למילוי – חוות רום",
  robots: { index: false, follow: false },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
