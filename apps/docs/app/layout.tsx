import { RootProvider } from "fumadocs-ui/provider/next";
import { Analytics } from "@vercel/analytics/next";
import { DM_Sans, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { BASE_URL } from "@/lib/constants";
import "./global.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-dm-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Augure",
    default: "Augure — Your Personal AI Agent",
  },
  description:
    "An open-source AI agent that runs 24/7. It sees, learns, and acts on your behalf.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "Augure — Your Personal AI Agent That Sees, Learns & Acts",
    description:
      "Deploy an open-source AI agent on your server in 5 minutes. It learns your preferences, connects to your apps, and acts proactively — 24/7.",
    url: BASE_URL,
    siteName: "Augure",
    type: "website",
  },
  other: {
    "og:logo": `${BASE_URL}/favicon.svg`,
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider
          theme={{
            forcedTheme: "dark",
            attribute: "class",
          }}
        >
          {children}
        </RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
