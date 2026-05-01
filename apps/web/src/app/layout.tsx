import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabPartner | McMaster Lab Matching",
  description: "A McMaster-focused lab and tutorial partner matching platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
