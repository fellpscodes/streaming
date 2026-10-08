import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-accent">
            Streaming
          </Link>
          <nav className="flex gap-5 text-sm text-neutral-300">
            <Link href="/" className="hover:text-white">Início</Link>
            <Link href="/catalogo" className="hover:text-white">Catálogo</Link>
            <Link href="/configuracoes" className="hover:text-white">Configurações</Link>
          </nav>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
