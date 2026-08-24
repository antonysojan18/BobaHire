import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const fontBrand = Outfit({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "BobaHire — Executive Recruitment Dashboard",
  description: "Screen leads, dispatch CV upload requests, and monitor automated AI candidate scoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontBrand.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
