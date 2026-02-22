import { RootProvider } from "fumadocs-ui/provider/next";
import { DM_Sans, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import type { Metadata } from "next";
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
  metadataBase: new URL("https://augure.dev"),
  openGraph: {
    title: "Augure",
    description:
      "An open-source AI agent that runs 24/7 on your server. No cloud dependency. No vendor lock-in.",
    siteName: "Augure",
    type: "website",
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
      </body>
    </html>
  );
}
