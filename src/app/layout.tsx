import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Outfit, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const source = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MediKiosk — AI clinical history before the consultation",
  description:
    "Patient-facing clinical intake for Indian OPDs. Voice + touch history, document intelligence, AYUSH Dashavidha Pariksha, and ABDM-ready summaries.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${source.variable} bg-[#f6f0e4] text-[#1b1712] antialiased`}>
        {children}
      </body>
    </html>
  );
}
