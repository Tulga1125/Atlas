import type { Metadata } from "next";
import {
  Archivo,
  Lilita_One,
  Noto_Sans,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";
import { getLocale } from "@/modules/i18n/server";

const archivo = Archivo({
  variable: "--font-headline",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const lilita = Lilita_One({
  variable: "--font-mark",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const mongolian = Noto_Sans({
  variable: "--font-mongolian",
  subsets: ["cyrillic", "latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Atlas Charts — The Pulse, Charted.",
    template: "%s · Atlas Charts",
  },
  description:
    "A daily record of what Mongolia is listening to, beginning with Apple Music Top 100: Mongolia.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html data-scroll-behavior="smooth" lang={locale}>
      <body
        className={`${archivo.variable} ${jakarta.variable} ${lilita.variable} ${mongolian.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
