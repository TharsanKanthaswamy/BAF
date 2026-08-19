import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import "./globals.css";

/*
 * No webfont is loaded, deliberately.
 *
 * Apple licenses San Francisco for Apple-platform UI only. There is no webfont
 * distribution and it cannot legally be self-hosted, so the honest choice is to
 * ask for it by name and let it resolve locally. The stacks in globals.css are
 * Apple's own production chain from apple.com, unchanged: SF Pro, then Helvetica
 * Neue, then Helvetica, then Arial. No substitute family is bolted on, because
 * every candidate would be a face Apple does not use.
 *
 * Consequences, stated rather than hidden: on Apple hardware this is the genuine
 * article. On Windows or Linux without SF Pro installed it lands on Helvetica or
 * Arial, which is exactly what apple.com serves those visitors. Installing SF Pro
 * (free from Apple's developer font downloads) switches the whole app over with no
 * code change, because the stack already names it.
 */
export const metadata: Metadata = {
  title: {
    default: "Detectra Fraud Operations",
    template: "%s · Detectra",
  },
  description:
    "Real-time transaction fraud triage: velocity analytics, autoencoder and isolation-forest scoring, and LLM-narrated risk explanations.",
  applicationName: "Detectra",
  icons: {
    icon: "/fevicon.jpeg",
    shortcut: "/fevicon.jpeg",
    apple: "/fevicon.jpeg",
  },
  keywords: [
    "fraud detection",
    "transaction monitoring",
    "anomaly detection",
    "risk triage",
  ],
  // An internal operations console, so keep it out of search indexes.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <ClerkProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}