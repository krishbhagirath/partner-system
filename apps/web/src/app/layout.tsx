import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Sora, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PartnerUp | Find Your McMaster Lab Partner",
  description:
    "Import your Mosaic schedule with one click and get matched with classmates in your exact labs and tutorials at McMaster.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${sora.variable} ${sourceSans.variable}`} lang="en">
      <body>
        {children}
        {/*
          Vercel Web Analytics: page views and visitors, no cookies and no
          cross-site tracking, so it needs no consent banner. Sends nothing when
          running outside a Vercel deployment, so local dev is unaffected.
          Requires Web Analytics to be enabled for the project in the Vercel
          dashboard — the script 404s until that switch is on.
        */}
        <Analytics />
      </body>
    </html>
  );
}
