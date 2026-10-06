"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boton, Tarjeta, Icono, Etiqueta, Aviso, Cargando, Confirmar, EstadoVacio } from "@/components/ui";

export default function MisProgramaciones() {
  const [programaciones, setProgramaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [bannerCerrado, setBannerCerrado] = useState(false);
  const [borrado, setBorrado] = useState(null); // { id, nombre } pendiente de confirmar
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState(null);

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

  const eliminar = async () => {
    if (!borrado) return;
    setBorrando(true);
    setErrorBorrado(null);
    try {
      const res = await fetch(`/api/programaciones/${borrado.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se ha podido eliminar.");
      setProgramaciones((previas) => previas.filter((p) => p._id !== borrado.id));
      setBorrado(null);
    } catch (e) {
      setErrorBorrado(e.message);
    } finally {
      setBorrando(false);
    }
  };

  // Búsqueda por nombre, código, curso o profesor, más filtro por estado.
  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return programaciones.filter(
      (p) =>
        (filtro === "todas" || p.estado?.clave === filtro) &&
        (!termino ||
          [p.modulo?.nombre, p.modulo?.codigo, p.modulo?.curso, p.modulo?.profesor]
            .filter(Boolean)
            .some((campo) => campo.toLowerCase().includes(termino)))
    );
  }, [programaciones, busqueda, filtro]);

  const desactualizadas = useMemo(
    () => programaciones.filter((p) => p.exportadaDesactualizada).length,
    [programaciones]
  );

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Encabezado total={programaciones.length} />

      {!cargando && !error && programaciones.length > 0 && (
        <ResumenPanel programaciones={programaciones} filtro={filtro} onFiltrar={setFiltro} />
      )}

      {!cargando && !error && desactualizadas > 0 && !bannerCerrado && (
        <Aviso
          tipo="aviso"
          titulo="Cambios pendientes de exportar"
          className="mb-6"
          onCerrar={() => setBannerCerrado(true)}
        >
          <p>
            {desactualizadas === 1
              ? "Una programación ha cambiado desde su última exportación."
              : `${desactualizadas} programaciones han cambiado desde su última exportación.`}{" "}
            Vuelve a descargarla para entregar la versión actual.
          </p>
        </Aviso>
      )}

      {cargando && <Cargando texto="Cargando tus programaciones…" />}

      {errorBorrado && (
        <Aviso tipo="error" titulo="No se ha podido eliminar" className="mb-6" onCerrar={() => setErrorBorrado(null)}>
          <p>{errorBorrado}</p>
        </Aviso>
      )}

      <Confirmar
        abierto={!!borrado}
        titulo={`¿Eliminar "${borrado?.nombre}"?`}
        descripcion="Esta acción no se puede deshacer. Se borrará la programación con todos sus apartados."
        textoConfirmar="Eliminar"
        ocupado={borrando}
        onCancelar={() => { if (!borrando) setBorrado(null); }}
        onConfirmar={eliminar}
      />
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
                        setBorrado({ id: prog._id, nombre: prog.modulo?.nombre || "Sin nombre" })
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
  const estado = prog.estado || {};
  const modificada = fechaCorta(prog.modificada);
  const exportada = fechaCorta(prog.exportada);

  return (
    <Tarjeta hover className="p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Etiqueta tono="azul" className="font-mono">
          {codigo || "Sin código"}
        </Etiqueta>
        {estado.etiqueta && (
          <Etiqueta tono={estado.tono || "neutro"} title={textoPendientes(estado)}>
            <Icono nombre={estado.icono} className="w-3.5 h-3.5" />
            {estado.etiqueta}
          </Etiqueta>
        )}
      </div>

      <h2 className="font-bold text-slate-900 leading-snug mb-1.5 line-clamp-2">
        {nombre || "Sin nombre"}
      </h2>

      <p className="text-sm text-slate-500 mb-4">
        {[curso, profesor ? `Prof. ${profesor}` : "Sin profesor asignado"].filter(Boolean).join(" · ")}
      </p>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 mb-2 mt-auto">
        <div className="flex items-center gap-1.5">
          <Icono nombre="lista" className="w-3.5 h-3.5" />
          <dd>{prog.apartados ?? prog.secciones?.length ?? 0} apartados</dd>
        </div>
        {(prog.tablas ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Icono nombre="panel" className="w-3.5 h-3.5" />
            <dd>{prog.tablas} tablas</dd>
          </div>
        )}
        {modificada && (
          <div className="flex items-center gap-1.5" title={exportada ? `Exportada el ${exportada}` : "Aún no exportada"}>
            <Icono nombre="reloj" className="w-3.5 h-3.5" />
            <dd>{modificada}</dd>
          </div>
        )}
      </dl>

      {prog.exportadaDesactualizada && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 mb-2">
          <Icono nombre="aviso" className="w-3.5 h-3.5 shrink-0" />
          Cambios sin exportar desde el {exportada}
        </p>
      )}
      {estado.pendientes > 0 && (
        <p className="text-xs text-slate-500 mb-1">{textoPendientes(estado)}</p>
      )}

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

const fechaCorta = (epoch) =>
  epoch
    ? new Date(epoch).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

// "3 por revisar: 2 sin estructurar por la IA y 1 vacío"
const textoPendientes = (estado) => {
  if (!estado?.pendientes) return undefined;
  const partes = [];
  if (estado.detalle?.sinEstructurar > 0) {
    partes.push(
      estado.detalle.sinEstructurar === 1
        ? "1 con texto sin estructurar por la IA"
        : `${estado.detalle.sinEstructurar} con texto sin estructurar por la IA`
    );
  }
  if (estado.detalle?.vacios > 0) {
    partes.push(
      estado.detalle.vacios === 1 ? "1 vacío" : `${estado.detalle.vacios} vacíos`
    );
  }
  const base =
    estado.pendientes === 1 ? "1 apartado por revisar" : `${estado.pendientes} apartados por revisar`;
  return partes.length ? `${base}: ${partes.join(" y ")}` : base;
};

/* ------------------------------------------------- Panel de estado (Paso 5) */

const FILTROS = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "porRevisar", etiqueta: "Por revisar" },
  { clave: "lista", etiqueta: "Listas" },
  { clave: "exportada", etiqueta: "Exportadas" },
];

function ResumenPanel({ programaciones, filtro, onFiltrar }) {
  const cuenta = (clave) =>
    clave === "todas"
      ? programaciones.length
      : programaciones.filter((p) => p.estado?.clave === clave).length;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTROS.map((f) => {
          const activo = filtro === f.clave;
          return (
            <button
              key={f.clave}
              onClick={() => onFiltrar(f.clave)}
              aria-pressed={activo}
              className={
                activo
                  ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white border border-slate-900"
                  : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:border-slate-300 transition-colors"
              }
            >
              {f.etiqueta}
              <span className={activo ? "text-slate-300" : "text-slate-400"}>{cuenta(f.clave)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}