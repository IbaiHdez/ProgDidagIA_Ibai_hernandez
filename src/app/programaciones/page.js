"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boton, Tarjeta, Icono, Etiqueta, Aviso, Cargando, EstadoVacio } from "@/components/ui";

export default function MisProgramaciones() {
  const [programaciones, setProgramaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/programaciones");
      if (!res.ok) throw new Error("No se han podido cargar tus programaciones.");
      setProgramaciones(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    let vivo = true;

    fetch("/api/programaciones")
      .then((res) => {
        if (!res.ok) throw new Error("No se han podido cargar tus programaciones.");
        return res.json();
      })
      .then((datos) => {
        if (vivo) setProgramaciones(datos);
      })
      .catch((e) => {
        if (vivo) setError(e.message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, []);

  const eliminar = async (id, nombre) => {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`/api/programaciones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se ha podido eliminar.");
      setProgramaciones((previas) => previas.filter((p) => p._id !== id));
    } catch (e) {
      alert(e.message);
    }
  };

  // Búsqueda por nombre, código, curso o profesor.
  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return programaciones;

    return programaciones.filter((p) =>
      [p.modulo?.nombre, p.modulo?.codigo, p.modulo?.curso, p.modulo?.profesor]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(termino))
    );
  }, [programaciones, busqueda]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Encabezado total={programaciones.length} />

      {cargando && <Cargando texto="Cargando tus programaciones…" />}

      {!cargando && error && (
        <Aviso
          tipo="error"
          titulo="No se han podido cargar tus programaciones"
          accion={
            <Boton tamano="sm" icono="refrescar" onClick={cargar}>
              Reintentar
            </Boton>
          }
        >
          <p>{error}</p>
        </Aviso>
      )}

      {!cargando && !error && programaciones.length === 0 && (
        <Tarjeta>
          <EstadoVacio
            icono="carpeta"
            titulo="Todavía no hay programaciones guardadas"
            descripcion="Sube la programación del curso pasado y la tendrás aquí lista para editar y exportar."
            accion={
              <Link href="/asistente">
                <Boton icono="subir">Subir mi primera programación</Boton>
              </Link>
            }
          />
        </Tarjeta>
      )}

      {!cargando && !error && programaciones.length > 0 && (
        <>
          {programaciones.length > 4 && (
            <div className="relative mb-6 max-w-md">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Icono nombre="buscar" className="w-4 h-4" />
              </span>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, código o profesor…"
                aria-label="Buscar programaciones"
                className="campo pl-10"
              />
            </div>
          )}

          {filtradas.length === 0 ? (
            <Tarjeta>
              <EstadoVacio
                icono="buscar"
                titulo="Sin resultados"
                descripcion={`No hay programaciones que coincidan con "${busqueda}".`}
                accion={
                  <Boton variante="secundario" onClick={() => setBusqueda("")}>
                    Limpiar búsqueda
                  </Boton>
                }
              />
            </Tarjeta>
          ) : (
            <>
              {busqueda && (
                <p className="text-sm text-slate-500 mb-4">
                  {filtradas.length} de {programaciones.length} programaciones
                </p>
              )}

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtradas.map((prog) => (
                  <li key={prog._id}>
                    <TarjetaProg
                      prog={prog}
                      onEliminar={() =>
                        eliminar(prog._id, `${prog.modulo?.nombre || "Sin nombre"}`)
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Piezas */

function Encabezado({ total }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Mis programaciones</h1>
        <p className="text-slate-600 mt-1.5">
          {total > 0
            ? `${total} ${total === 1 ? "programación guardada" : "programaciones guardadas"}`
            : "Todas las que hayas procesado, listas para editar y exportar."}
        </p>
      </div>

      <Link href="/asistente">
        <Boton icono="subir">Nueva programación</Boton>
      </Link>
    </div>
  );
}

function TarjetaProg({ prog, onEliminar }) {
  const { nombre, codigo, curso, profesor } = prog.modulo || {};
  const apartados = prog.secciones?.length || 0;
  const fecha = prog.updatedAt
    ? new Date(prog.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <Tarjeta hover className="p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Etiqueta tono="azul" className="font-mono">
          {codigo || "Sin código"}
        </Etiqueta>
        {curso && <Etiqueta tono="neutro">{curso}</Etiqueta>}
      </div>

      <h2 className="font-bold text-slate-900 leading-snug mb-1.5 line-clamp-2">
        {nombre || "Sin nombre"}
      </h2>

      <p className="text-sm text-slate-500 mb-4">
        {profesor ? `Prof. ${profesor}` : "Sin profesor asignado"}
      </p>

      <dl className="flex items-center gap-4 text-xs text-slate-500 mb-5 mt-auto">
        <div className="flex items-center gap-1.5">
          <Icono nombre="lista" className="w-3.5 h-3.5" />
          <dd>{apartados} apartados</dd>
        </div>
        {fecha && (
          <div className="flex items-center gap-1.5">
            <Icono nombre="reloj" className="w-3.5 h-3.5" />
            <dd>{fecha}</dd>
          </div>
        )}
      </dl>

      <div className="flex gap-2 pt-4 border-t border-slate-100">
        <Link href={`/programaciones/${prog._id}/editar`} className="flex-1">
          <Boton tamano="sm" variante="secundario" className="w-full" icono="editar">
            Editar
          </Boton>
        </Link>

        <a
          href={`/api/programaciones/${prog._id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          title="Descargar PDF"
          aria-label={`Descargar ${nombre} en PDF`}
          className="inline-flex items-center justify-center px-3 rounded-xl border border-slate-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <Icono nombre="pdf" className="w-4 h-4" />
        </a>

        <a
          href={`/api/programaciones/${prog._id}/word`}
          title="Descargar Word"
          aria-label={`Descargar ${nombre} en Word`}
          className="inline-flex items-center justify-center px-3 rounded-xl border border-slate-200 text-teal-600 hover:bg-teal-50 transition-colors"
        >
          <Icono nombre="word" className="w-4 h-4" />
        </a>

        <button
          onClick={onEliminar}
          title="Eliminar"
          aria-label={`Eliminar ${nombre}`}
          className="inline-flex items-center justify-center px-3 rounded-xl border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <Icono nombre="basura" className="w-4 h-4" />
        </button>
      </div>
    </Tarjeta>
  );
}