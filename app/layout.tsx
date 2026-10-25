import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Desloper",
  description:
    "Paste a landing page. Get a score for how generic it is, every finding, and a prompt your AI can use to fix it.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full`}>
      <body className="flex min-h-dvh flex-col bg-bg text-ink">
        <Header />
        {children}
      </body>
    </html>
  );
}
