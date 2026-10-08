import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksFallback } from "@/components/NavLinks";
import { ScanBadge } from "@/components/ScanBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Streaming",
  description: "Meu streaming pessoal",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
          Pular para o conteúdo
        </a>
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-accent-fg">
            Streaming
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <ScanBadge />
            <Suspense fallback={<NavLinksFallback />}>
              <NavLinks />
            </Suspense>
          </div>
        </header>
        <main id="conteudo" className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
