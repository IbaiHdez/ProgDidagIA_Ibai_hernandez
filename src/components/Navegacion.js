"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/components/ui";

/**
 * Cabecera con la marca y las dos acciones principales.
 * Se marca la pestaña activa para que el profesorado sepa siempre dónde está.
 */
export default function Navegacion() {
  const ruta = usePathname();

  const enlaces = [
    { href: "/programaciones", etiqueta: "Mis programaciones", icono: "carpeta" },
    { href: "/asistente", etiqueta: "Nueva programación", icono: "subir", destacar: true },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <span className="brand-gradient w-9 h-9 rounded-xl grid place-items-center text-white shadow-md shadow-brand-600/25 group-hover:shadow-lg transition-shadow">
            <Icono nombre="sparkles" className="w-5 h-5" />
          </span>
          <span className="text-slate-900 font-bold tracking-tight text-[17px]">
            ProgDidact<span className="text-brand-600">AI</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {enlaces.map((enlace) => {
            const activo = ruta === enlace.href || (enlace.href !== "/" && ruta.startsWith(enlace.href));

            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                aria-label={enlace.etiqueta}
                className={
                  enlace.destacar
                    ? "inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-sm font-semibold rounded-xl brand-gradient text-white shadow-md shadow-brand-600/20 hover:shadow-lg hover:shadow-brand-600/30 hover:brightness-110 transition-all"
                    : `inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 text-sm font-medium rounded-xl transition-colors ${
                        activo
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                }
              >
                <Icono nombre={enlace.icono} className="w-4 h-4" />
                <span className="hidden xs:inline sm:inline">{enlace.etiqueta}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
