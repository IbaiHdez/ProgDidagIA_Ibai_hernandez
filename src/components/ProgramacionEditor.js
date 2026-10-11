"use client";
import { mapaCeldas } from '@/lib/tablasOriginales';

import { useEffect, useMemo, useState } from "react";
import { Boton, Tarjeta, Icono, Etiqueta, Confirmar, Notificacion, useNotificacion } from "@/components/ui";

/** Array vacío estable: evita recrear referencias en cada render. */
const EMPTY = [];

/**
 * Editor de la programación didáctica.
 *
 * Pensado para el profesorado: todo lo editable está a la vista, los apartados
 * se despliegan sin ceremonias y siempre se ve si hay cambios sin guardar.
 */
export default function ProgramacionEditor({ datosIniciales, idExistente = null }) {
  const [programacion, setProgramacion] = useState(datosIniciales);
  // El id pasa de null a valor al guardar por primera vez, así que es estado
  // (y no un ref) para poder mostrar los botones de exportación al momento.
  const [idGuardada, setIdGuardada] = useState(idExistente);
  const [versionGuardada, setVersionGuardada] = useState(() => idExistente ? JSON.stringify(datosIniciales) : null);
  const [guardando, setGuardando] = useState(false);
  const [verJson, setVerJson] = useState(false);
  // Los dos primeros apartados nacen desplegados: así se ve de un vistazo que
  // todo es editable, sin tener que ir abriendo uno a uno.
  const [desplegados, setDesplegados] = useState(
    () => new Set([0, 1].filter((i) => i < (datosIniciales?.secciones?.length ?? 0)))
  );
  const [notificacion, avisar, cerrarNotificacion] = useNotificacion();
  // Confirmación destructiva en curso: { titulo, descripcion, confirmar, tono, alConfirmar }.
  const [confirmacion, setConfirmacion] = useState(null);
  const pedirConfirmar = (config) => setConfirmacion(config);
  const cerrarConfirmar = () => setConfirmacion(null);

  const secciones = programacion?.secciones ?? EMPTY;

  /* --------------------------------------------------------------- Datos */

  const cambiarModulo = (campo, valor) =>
    setProgramacion((p) => ({ ...p, modulo: { ...p.modulo, [campo]: valor } }));

  const cambiarSeccion = (indice, campo, valor) =>
    setProgramacion((p) => {
      const nuevas = [...(p.secciones || [])];
      nuevas[indice] = { ...nuevas[indice], [campo]: valor, ...(campo === 'codigo' ? { nivel: valor.split('.').filter(Boolean).length || 1 } : {}) };
      return { ...p, secciones: nuevas };
    });

  const cambiarBloque = (indiceSeccion, indiceBloque, campo, valor) =>
    setProgramacion((p) => {
      const nuevas = [...p.secciones];
      const seccion = { ...nuevas[indiceSeccion] };
      const bloques = [...(seccion.bloques || [])];
      bloques[indiceBloque] = campo === '__tabla' ? { ...bloques[indiceBloque], ...valor } : { ...bloques[indiceBloque], [campo]: valor };
      seccion.bloques = bloques;
      nuevas[indiceSeccion] = seccion;
      return { ...p, secciones: nuevas };
    });

  const eliminarSeccion = (indice) => {
    setProgramacion((p) => ({
      ...p,
      secciones: (p.secciones || []).filter((_, i) => i !== indice),
    }));
    setDesplegados((prev) => new Set([...prev].filter((i) => i !== indice).map((i) => i > indice ? i - 1 : i)));
    avisar("Apartado eliminado", "info");
  };

  const anadirSeccion = () => {
    const ultimo = secciones.at(-1);
    setProgramacion((p) => ({
      ...p,
      secciones: [
        ...(p.secciones || []),
        {
          codigo: "",
          titulo: "Nuevo apartado",
          nivel: ultimo?.nivel || 1,
          orden: (p.secciones || []).length + 1,
          bloques: [{ tipo: "texto", texto: "" }],
        },
      ],
    }));
    setDesplegados(new Set([...desplegados, (programacion.secciones || []).length]));
    avisar("Apartado añadido al final. Edítalo y no olvides guardar.");
  };

  const renumerar = () => {
    setProgramacion((p) => ({
      ...p,
      secciones: (p.secciones || []).map((s, i) => ({ ...s, orden: i + 1 })),
    }));
    avisar("Orden de apartados actualizado");
  };

  /* --------------------------------------------------------------- Guardado */

  const hayCambios = JSON.stringify(programacion) !== versionGuardada;

  const guardar = async () => {
    setGuardando(true);
    const instantanea = JSON.stringify(programacion);
    try {
      const esNuevo = !idGuardada;
      const res = await fetch(
        esNuevo ? "/api/programaciones" : `/api/programaciones/${idGuardada}`,
        {
          method: esNuevo ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: instantanea,
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se ha podido guardar.");

      if (esNuevo) setIdGuardada(json._id);
      setVersionGuardada(instantanea);
      avisar(esNuevo ? "Programación guardada correctamente" : "Cambios guardados");
    } catch (e) {
      avisar(e.message, "error", 5000);
    } finally {
      setGuardando(false);
    }
  };

  // Aviso al intentar cerrar con cambios sin guardar.
  useEffect(() => {
    if (!hayCambios) return;

    const antesDeCerrar = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", antesDeCerrar);
    return () => window.removeEventListener("beforeunload", antesDeCerrar);
  }, [hayCambios]);

  // Ctrl/Cmd + S guarda sin buscar el botón.
  useEffect(() => {
    const alPulsar = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (hayCambios && !guardando) guardar();
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  });

  /* --------------------------------------------------------------- Vista */

  const irA = (indice) => {
    setDesplegados((prev) => new Set(prev).add(indice));
    const nodo = document.getElementById(`apartado-${indice}`);
    nodo?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resumen = useMemo(
    () => ({
      apartados: secciones.length,
      bloques: secciones.reduce((n, s) => n + (s.bloques?.length || 0), 0),
      tablas: secciones.reduce(
        (n, s) => n + (s.bloques || []).filter((b) => b.tipo === "tabla").length,
        0
      ),
      listas: secciones.reduce(
        (n, s) => n + (s.bloques || []).filter((b) => b.tipo === "lista").length,
        0
      ),
    }),
    [secciones]
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
      {/* ------------------------------------------------------- Contenido */}
      <div className="min-w-0 space-y-5">
        {/* Datos del módulo */}
        <Tarjeta className="p-6">
          <h2 className="font-bold text-slate-900 mb-1">Datos del módulo</h2>
          <p className="text-sm text-slate-500 mb-5">Comprueba que están bien, aparecerán en la cabecera del documento.</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Código" ancho="sm:col-span-1">
              <input
                className="campo"
                value={programacion.modulo?.codigo || ""}
                onChange={(e) => cambiarModulo("codigo", e.target.value)}
                placeholder="0613"
              />
            </Campo>
            <Campo etiqueta="Curso">
              <input
                className="campo"
                value={programacion.modulo?.curso || ""}
                onChange={(e) => cambiarModulo("curso", e.target.value)}
                placeholder="2º"
              />
            </Campo>
            <Campo etiqueta="Nombre del módulo" ancho="sm:col-span-2">
              <input
                className="campo"
                value={programacion.modulo?.nombre || ""}
                onChange={(e) => cambiarModulo("nombre", e.target.value)}
                placeholder="Desarrollo Web en Entorno Servidor"
              />
            </Campo>
            <Campo etiqueta="Profesorado" ancho="sm:col-span-2">
              <input
                className="campo"
                value={programacion.modulo?.profesor || ""}
                onChange={(e) => cambiarModulo("profesor", e.target.value)}
                placeholder="Nombre del profesor o profesora"
              />
            </Campo>
          </div>
        </Tarjeta>

        {/* Apartados */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Apartados
                <span className="text-sm font-normal text-slate-500">{secciones.length}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {resumen.bloques} bloques · {resumen.listas} listas · {resumen.tablas} tablas
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Boton tamano="sm" variante="secundario" icono="lista" onClick={() => setDesplegados(new Set(secciones.map((_, i) => i)))}>
                Desplegar todo
              </Boton>
              <Boton tamano="sm" variante="secundario" onClick={() => setDesplegados(new Set())}>
                Plegar todo
              </Boton>
              <Boton tamano="sm" variante="secundario" icono="refrescar" onClick={renumerar}>
                Actualizar orden
              </Boton>
              <Boton tamano="sm" icono="panel" onClick={anadirSeccion}>
                Añadir apartado
              </Boton>
            </div>
          </div>

          {secciones.some((s) => s.revisar) && <p className="text-sm text-amber-700 mb-3">Los apartados marcados conservan texto original. Comprueba su formato antes de entregarlos.</p>}
          {secciones.length === 0 ? (
            <Tarjeta className="p-10 text-center">
              <p className="text-slate-600 mb-4">
                La IA no ha detectado apartados en este documento. Puedes añadirlos a mano.
              </p>
              <Boton onClick={anadirSeccion} icono="panel">
                Añadir el primero
              </Boton>
            </Tarjeta>
          ) : (
            <ul className="space-y-3">
              {secciones.map((seccion, i) => (
                <li key={i} id={`apartado-${i}`}>
                  <Apartado
                    seccion={seccion}
                    indice={i}
                    abierto={desplegados.has(i)}
                    onToggle={() =>
                      setDesplegados((prev) => {
                        const nuevo = new Set(prev);
                        nuevo.has(i) ? nuevo.delete(i) : nuevo.add(i);
                        return nuevo;
                      })
                    }
                    onCambiar={cambiarSeccion}
                    onCambiarBloque={cambiarBloque}
                    onEliminar={eliminarSeccion}
                    pedirConfirmar={pedirConfirmar}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- Panel lateral */}
      <aside className="lg:sticky lg:top-24 space-y-4">
        <Tarjeta className="p-5">
          <h3 className="font-bold text-slate-900 text-sm mb-3">Guardar y exportar</h3>

          <div className="flex items-center gap-2 mb-4">
            <span
              className={`w-2 h-2 rounded-full ${hayCambios ? "bg-amber-500" : "bg-emerald-500"}`}
              aria-hidden="true"
            />
            <span className="text-xs text-slate-600">
              {hayCambios ? "Tienes cambios sin guardar" : "Todo guardado"}
            </span>
          </div>

          <div className="space-y-2">
            <Boton
              className="w-full"
              onClick={guardar}
              cargando={guardando}
              disabled={!hayCambios}
              icono="check"
            >
              {idGuardada ? "Guardar cambios" : "Guardar programación"}
            </Boton>

            {idGuardada && !hayCambios && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`/api/programaciones/${idGuardada}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Icono nombre="pdf" className="w-4 h-4 text-indigo-600" />
                  PDF
                </a>
                <a
                  href={`/api/programaciones/${idGuardada}/word`}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Icono nombre="word" className="w-4 h-4 text-teal-600" />
                  Word
                </a>
              </div>
            )}
          </div>

          {hayCambios && (
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Guarda los cambios para exportar la última versión en PDF o Word.
            </p>
          )}

          <button
            onClick={() => setVerJson(!verJson)}
            className="mt-4 text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors"
          >
            {verJson ? "Ocultar" : "Ver"} datos en JSON
          </button>
        </Tarjeta>

        {/* Índice para saltar de un apartado a otro */}
        {secciones.length > 3 && (
          <Tarjeta className="p-5 max-h-[40vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Índice de apartados</h3>
            <ul className="space-y-0.5">
              {secciones.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => irA(i)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors flex items-start gap-2"
                  >
                    <span className="font-mono text-slate-400 shrink-0 w-12 truncate">
                      {s.codigo || "—"}
                    </span>
                    <span className="truncate">{s.titulo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        {verJson && (
          <Tarjeta className="p-4 bg-slate-900 border-slate-800">
            <pre className="text-emerald-400 font-mono text-[11px] max-h-72 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(programacion, null, 2)}
            </pre>
          </Tarjeta>
        )}
      </aside>

      <Notificacion notificacion={notificacion} onCerrar={cerrarNotificacion} />

      <Confirmar
        abierto={!!confirmacion}
        titulo={confirmacion?.titulo}
        descripcion={confirmacion?.descripcion}
        textoConfirmar={confirmacion?.confirmar || "Eliminar"}
        tono={confirmacion?.tono || "peligro"}
        onCancelar={cerrarConfirmar}
        onConfirmar={() => {
          confirmacion?.alConfirmar?.();
          cerrarConfirmar();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Apartado */

function Apartado({ seccion, indice, abierto, onToggle, onCambiar, onCambiarBloque, onEliminar, pedirConfirmar }) {
  const tituloCorto = `${seccion.codigo || ""} ${seccion.titulo || ""}`.trim() || "este apartado";
  const pedirEliminarSeccion = () =>
    pedirConfirmar({
      titulo: `¿Eliminar ${tituloCorto === "este apartado" ? "este apartado" : `"${tituloCorto}"`}?`,
      descripcion: "Se eliminará el apartado con todos sus bloques. Esta acción no se puede deshacer.",
      confirmar: "Eliminar",
      alConfirmar: () => onEliminar(indice),
    });
  const pedirRestaurar = () =>
    pedirConfirmar({
      titulo: "¿Restaurar el texto original?",
      descripcion: "Se sustituirán los bloques de este apartado por su texto original.",
      confirmar: "Restaurar",
      tono: "info",
      alConfirmar: () => onCambiar(indice, "bloques", [{ tipo: "texto", texto: seccion.textoOriginal }]),
    });
  const pedirEliminarBloque = (i) =>
    pedirConfirmar({
      titulo: "¿Eliminar este bloque?",
      descripcion: "Se eliminará el bloque del apartado. Esta acción no se puede deshacer.",
      confirmar: "Eliminar",
      alConfirmar: () => onCambiar(indice, "bloques", seccion.bloques.filter((_, n) => n !== i)),
    });
  return (
    <Tarjeta className="overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <button
          onClick={onToggle}
          aria-expanded={abierto}
          aria-label={abierto ? "Plegar apartado" : "Desplegar apartado"}
          className="shrink-0 w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Icono nombre="flecha" className={`w-4 h-4 transition-transform duration-200 ${abierto ? "rotate-90" : ""}`} />
        </button>

        <input
          value={seccion.codigo || ""}
          onChange={(e) => onCambiar(indice, "codigo", e.target.value)}
          placeholder="10.2.1"
          aria-label="Código del apartado"
          className="campo-mono w-24 shrink-0 text-center"
        />

        <input
          value={seccion.titulo || ""}
          onChange={(e) => onCambiar(indice, "titulo", e.target.value)}
          placeholder="Título del apartado"
          aria-label="Título del apartado"
          className="campo flex-1 min-w-0 font-medium"
        />

        {seccion.revisar && <button className="text-xs text-amber-700 underline shrink-0" onClick={() => onCambiar(indice, "revisar", false)} title="Marcar como revisado">Por revisar</button>}
        <Etiqueta tono="neutro" className="hidden sm:inline-flex shrink-0" title="Nivel de jerarquía">
          N{seccion.nivel || 1}
        </Etiqueta>

        <button
          onClick={pedirEliminarSeccion}
          aria-label="Eliminar apartado"
          title="Eliminar apartado"
          className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Icono nombre="basura" className="w-4 h-4" />
        </button>
      </div>

      {/* Contenido */}
      {abierto && (
        <div className="border-t border-slate-200 p-4 sm:p-5 bg-slate-50/50 animate-fade-in">
          {seccion.textoOriginal && <details className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-600">Comparar con el texto original</summary>
            <pre className="whitespace-pre-wrap font-sans text-xs max-h-64 overflow-auto mt-3 text-slate-600">{seccion.textoOriginal}</pre>
            <button className="text-xs text-brand-700 underline mt-3" onClick={pedirRestaurar}>Restaurar texto original</button>
          </details>}
          <ul className="space-y-3">
            {(seccion.bloques || []).map((bloque, i) => (
              <li key={i}>
                <EditorBloque
                  bloque={bloque}
                  onCambiar={(campo, valor) => onCambiarBloque(indice, i, campo, valor)}
                  onEliminar={() => pedirEliminarBloque(i)}
                  pedirConfirmar={pedirConfirmar}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200">
            <Boton tamano="sm" variante="secundario" onClick={() => añadirBloque(indice, "texto", seccion, onCambiar)}>
              + Texto
            </Boton>
            <Boton tamano="sm" variante="secundario" onClick={() => añadirBloque(indice, "lista", seccion, onCambiar)}>
              + Lista
            </Boton>
            <Boton tamano="sm" variante="secundario" onClick={() => añadirBloque(indice, "tabla", seccion, onCambiar)}>
              + Tabla
            </Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

function añadirBloque(indice, tipo, seccion, onCambiar) {
  const nuevo =
    tipo === "tabla"
      ? { tipo: "tabla", columnas: ["Columna 1", "Columna 2"], filas: [["", ""]] }
      : tipo === "lista"
        ? { tipo: "lista", items: [""] }
        : { tipo: "texto", texto: "" };

  onCambiar(indice, "bloques", [...(seccion.bloques || []), nuevo]);
}

/* ------------------------------------------------------------------ Bloques */

const ETIQUETA_TIPO = {
  texto: { texto: "Texto", icono: "documento", tono: "azul" },
  lista: { texto: "Lista", icono: "lista", tono: "violeta" },
  tabla: { texto: "Tabla", icono: "panel", tono: "verde" },
};

function EditorBloque({ bloque, onCambiar, onEliminar, pedirConfirmar }) {
  const meta = ETIQUETA_TIPO[bloque.tipo] || ETIQUETA_TIPO.texto;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-slate-100 bg-slate-50/60">
        <Etiqueta tono={meta.tono}>
          <Icono nombre={meta.icono} className="w-3 h-3" />
          {meta.texto}
        </Etiqueta>
        <button onClick={onEliminar} aria-label="Eliminar bloque" className="p-1 text-slate-400 hover:text-red-600"><Icono nombre="basura" className="w-4 h-4" /></button>
      </div>

      <div className="p-3.5">
        {bloque.tipo === "texto" && (
          <textarea
            className="campo min-h-28 leading-relaxed resize-y"
            value={bloque.texto || ""}
            onChange={(e) => onCambiar("texto", e.target.value)}
            placeholder="Escribe aquí el contenido…"
            aria-label="Contenido de texto"
          />
        )}

        {bloque.tipo === "lista" && (
          <ul className="space-y-2">
            {(bloque.items || []).map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-6 h-9 shrink-0 grid place-items-center text-xs text-slate-400 tabular-nums">
                  {i + 1}
                </span>
                <input
                  className="campo"
                  value={item}
                  onChange={(e) => {
                    const nuevos = [...bloque.items];
                    nuevos[i] = e.target.value;
                    onCambiar("items", nuevos);
                  }}
                  placeholder="Elemento de la lista"
                  aria-label={`Elemento ${i + 1} de la lista`}
                />
                <button
                  onClick={() => onCambiar("items", bloque.items.filter((_, x) => x !== i))}
                  aria-label={`Eliminar elemento ${i + 1}`}
                  className="shrink-0 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Icono nombre="cruz" className="w-4 h-4 mx-auto" />
                </button>
              </li>
            ))}
            <li>
              <button
                onClick={() => onCambiar("items", [...(bloque.items || []), ""])}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 pl-8 py-1 transition-colors"
              >
                + Añadir elemento
              </button>
            </li>
          </ul>
        )}

        {bloque.tipo === "tabla" && <EditorTabla bloque={bloque} onCambiar={onCambiar} pedirConfirmar={pedirConfirmar} />}
      </div>
    </div>
  );
}

function EditorTabla({ bloque, onCambiar, pedirConfirmar }) {
  if(bloque.diseno?.origen==='pdf') return <EditorTablaOriginal bloque={bloque} onCambiar={onCambiar} pedirConfirmar={pedirConfirmar} />;
  const columnas = bloque.columnas || [];

  const actualizarColumna = (i, valor) => {
    const nuevas = [...columnas];
    nuevas[i] = valor;
    onCambiar("columnas", nuevas);
  };

  const actualizarCelda = (f, c, valor) => {
    const nuevas = (bloque.filas || []).map((fila) => [...fila]);
    nuevas[f][c] = valor;
    onCambiar("filas", nuevas);
  };

  return (
    <div className="overflow-x-auto -mx-3.5 px-3.5">
      <label className="block text-xs font-semibold text-slate-600 mb-3">Título de la tabla (si existe en el original)
        <input className="campo mt-1 w-full" value={bloque.titulo || ''} onChange={(e) => onCambiar('titulo', e.target.value)} placeholder="Sin título" />
      </label>
      <table className="w-full border-collapse text-sm min-w-[420px]">
        <thead>
          <tr>
            {columnas.map((col, c) => (
              <th key={c} className="p-0.5">
                <input
                  value={col}
                  onChange={(e) => actualizarColumna(c, e.target.value)}
                  aria-label={`Cabecera de la columna ${c + 1}`}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 focus:bg-white focus:border-brand-400 transition-colors"
                />
                <button type="button" disabled={columnas.length <= 1} aria-label={`Eliminar columna ${c + 1}`} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-30 mt-1"
                  onClick={() => pedirConfirmar({
                    titulo: `¿Eliminar la columna ${c + 1} y sus celdas?`,
                    descripcion: "Se eliminará la columna con todo su contenido. Esta acción no se puede deshacer.",
                    confirmar: "Eliminar",
                    alConfirmar: () => onCambiar("__tabla", { columnas: columnas.filter((_, n) => n !== c), filas: (bloque.filas || []).map((f) => f.filter((_, n) => n !== c)) }),
                  })}>Eliminar columna</button>
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {(bloque.filas || []).map((fila, f) => (
            <tr key={f}>
              {fila.map((celda, c) => (
                <td key={c} className="p-0.5 align-top">
                  <textarea
                    value={celda}
                    onChange={(e) => actualizarCelda(f, c, e.target.value)}
                    rows={2}
                    aria-label={`Celda fila ${f + 1}, columna ${c + 1}`}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 focus:border-brand-400 transition-colors resize-y min-h-12"
                  />
                </td>
              ))}
              <td className="text-center align-top pt-1">
                <button
                  onClick={() => onCambiar("filas", bloque.filas.filter((_, i) => i !== f))}
                  aria-label={`Eliminar fila ${f + 1}`}
                  className="w-7 h-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Icono nombre="cruz" className="w-3.5 h-3.5 mx-auto" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-3 mt-3">
        <button
          onClick={() => onCambiar("filas", [...(bloque.filas || []), columnas.map(() => "")])}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          + Añadir fila
        </button>
        <button
          onClick={() => onCambiar("__tabla", { columnas: [...columnas, `Columna ${columnas.length + 1}`], filas: (bloque.filas || []).map((f) => [...f, ""]) })}
          className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          + Añadir columna
        </button>
      </div>
    </div>
  );
}

function EditorTablaOriginal({bloque,onCambiar,pedirConfirmar}) {
  const {celdas,cubiertas,estilos}=mapaCeldas(bloque);
  return <div className="overflow-x-auto">
    <p className="text-xs text-brand-700 mb-3">Tabla original · página {bloque.diseno.pagina} · Puedes editar el contenido de cada celda.</p>
    <table className="w-full border-collapse table-fixed text-sm min-w-[650px]" aria-label={`Tabla original de la página ${bloque.diseno.pagina}`}>
      <colgroup>{bloque.diseno.anchosColumnas.map((a,i)=><col key={i} style={{width:`${a}%`}} />)}</colgroup>
      <tbody>{bloque.filas.map((fila,f)=><tr key={f}>{fila.map((valor,c)=>{
        const k=`${f}:${c}`;if(cubiertas.has(k))return null;
        const span=celdas.get(k)||{},e=estilos.get(k)||{};
        return <td key={c} colSpan={span.columnas||1} rowSpan={span.filas||1} className="border border-slate-400 align-top p-1" style={{backgroundColor:e.fondo?`#${e.fondo}`:undefined,color:e.color?`#${e.color}`:undefined,fontWeight:e.negrita?700:400}}>
          <textarea value={valor} aria-label={`Celda original fila ${f+1}, columna ${c+1}`} rows={Math.min(18,Math.max(2,valor.split('\n').length))}
            className="w-full min-w-0 bg-transparent resize-y p-1 outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(event)=>{const nuevas=bloque.filas.map((r)=>[...r]);nuevas[f][c]=event.target.value;onCambiar('filas',nuevas);}} />
        </td>;
      })}</tr>)}</tbody>
    </table>
    <button className="text-xs text-slate-500 underline mt-3" onClick={() => pedirConfirmar({
      titulo: '¿Convertir a tabla simple?',
      descripcion: 'Se conserva el texto, pero se eliminan las combinaciones de celdas y los estilos originales.',
      confirmar: 'Convertir',
      tono: 'info',
      alConfirmar: () => onCambiar('__tabla', { diseno: undefined }),
    })}>Editar filas y columnas como tabla simple</button>
  </div>;
}

/* ------------------------------------------------------------------ Campos */

function Campo({ etiqueta, ancho, children }) {
  return (
    <label className={`block ${ancho || ""}`}>
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">{etiqueta}</span>
      {children}
    </label>
  );
}
