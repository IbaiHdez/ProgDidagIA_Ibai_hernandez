import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navegacion from "@/components/Navegacion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "ProgDidactAI · Moderniza tus programaciones didácticas",
    template: "%s · ProgDidactAI",
  },
  description:
    "Sube la programación didáctica del curso pasado, deja que la IA la ordene por apartados y expórtala lista para entregar. Sin tocar una sola tabla.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:bg-white focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-semibold"
        >
          Saltar al contenido
        </a>

        <Navegacion />

        <main id="contenido" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>ProgDidactAI · Automatización de programaciones didácticas</p>
            <p>
              La IA puede equivocarse: revisa siempre el documento antes de entregarlo.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}