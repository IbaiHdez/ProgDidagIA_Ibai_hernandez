"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProgramacionEditor from "@/components/ProgramacionEditor";
import { Boton, Tarjeta, Icono, Etiqueta, Aviso, Progreso, Pasos } from "@/components/ui";

const FORMATOS = ["pdf", "docx"];
const INTERVALO_SONDEO = 2000;
const TIMEOUT_SONDEO = 20 * 60 * 1000;

const esValido = (archivo) => archivo && FORMATOS.some((f) => archivo.name.toLowerCase().endsWith(`.${f}`));

const tamanoLegible = (bytes) => {
  if (!bytes) return "0 KB";
  const unidades = ["Bytes", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${unidades[i]}`;
};

/** Traduce el estado técnico del análisis a un mensaje que entienda un profesor. */
const MOTIVOS = [
  {
    clave: "IA_NO_DISPONIBLE",
    titulo: "Ahora mismo la inteligencia artificial está saturada",
    consejo:
      "Es algo puntual: los servicios gratuitos se congestionan. Vuelve a intentarlo en unos minutos; la aplicación prueba varios motores por ti.",
  },
  {
    clave: "MODELO",
    titulo: "Se agotaron los intentos con los modelos de IA",
    consejo: "Reinténtalo. Si se repite mucho tiempo, avisa al responsable del centro.",
  },
];

export default function Asistente() {
  const [archivo, setArchivo] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);

  const [fase, setFase] = useState(null); // "leyendo" | "eligiendo" | "analizando" | "listo"
  const [progreso, setProgreso] = useState(null);
  const [extraccion, setExtraccion] = useState(null);
  const [moduloElegido, setModuloElegido] = useState("");
  const [analisis, setAnalisis] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [motores, setMotores] = useState(null);

  const entradaRef = useRef(null);
  const sondeoRef = useRef(null);

  const cancelarSondeo = useCallback(() => {
    if (sondeoRef.current) {
      clearTimeout(sondeoRef.current);
      sondeoRef.current = null;
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    // Estado de los motores: solo informativo, se consulta al entrar.
    fetch("/api/analyze")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d) setMotores(d);
      })
      .catch(() => {});

    return () => {
      vivo = false;
      cancelarSondeo();
    };
  }, [cancelarSondeo]);

  /* ----------------------------------------------------------- Archivo */

  const elegirArchivo = (elegido) => {
    if (!esValido(elegido)) {
      setError({
        titulo: "Formato no válido",
        consejo: "Solo se admiten archivos PDF o de Word (.docx).",
      });
      return;
    }

    setArchivo(elegido);
    setExtraccion(null);
    setModuloElegido("");
    setError(null);
    setAnalisis(null);
  };

  const alSoltar = (e) => {
    e.preventDefault();
    setArrastrando(false);
    elegirArchivo(e.dataTransfer?.files?.[0]);
  };

  /* ----------------------------------------------------------- Lectura */

  const leerDocumento = async (codigo = "") => {
    const datos = new FormData();
    datos.append("file", archivo);
    if (codigo) datos.append("moduleCode", codigo);

    const res = await fetch("/api/extract", { method: "POST", body: datos });
    const json = await res.json();

    if (!res.ok) {
      throw Object.assign(new Error(json.error || "No se pudo leer el archivo."), {
        titulo: "No se pudo leer el documento",
        consejo: "Comprueba que el PDF no esté protegido con contraseña. Si es un escaneo, necesita pasarse por OCR antes.",
      });
    }

    setExtraccion(json);
    return json;
  };

  const alPulsarAnalizar = async () => {
    if (!archivo) return;

    setError(null);
    setFase("leyendo");

    try {
      const datos = await leerDocumento();

      // Si solo hay un módulo, no hay nada que decidir: seguimos directos.
      if ((datos.modulos?.length || 0) > 1) {
        setFase("eligiendo");
        return;
      }

      setModuloElegido(datos.modulos?.[0]?.codigo || "");
      setFase("analizando");
      await lanzarAnalisis(datos.text, datos.modulos?.[0]?.codigo || "");
    } catch (e) {
      setError({ titulo: e.titulo || "Ha ocurrido un error", consejo: e.message });
      setFase(null);
    }
  };

  const elegirModulo = async (codigo) => {
    setModuloElegido(codigo || "");
    setError(null);
    setFase("analizando");

    try {
      // Si el módulo no estaba en la lista, hay que releer el documento para recortarlo.
      const texto = extraccion?.modulo?.codigo === codigo ? extraccion.text : (await leerDocumento(codigo)).text;
      await lanzarAnalisis(texto, codigo);
    } catch (e) {
      setError({ titulo: e.titulo || "Ha ocurrido un error", consejo: e.message });
      setFase(null);
    }
  };

  /* ----------------------------------------------------------- Análisis */

  const lanzarAnalisis = async (texto, codigo) => {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto, moduleCode: codigo || null }),
    });

    if (res.status === 202) {
      const { jobId } = await res.json();
      seguirJob(jobId);
      return;
    }

    const json = await res.json();

    if (res.status === 503) {
      throw Object.assign(new Error(json.error || "Los motores de IA están saturados."), {
        titulo: MOTIVOS.find((m) => m.clave === json.code)?.titulo || "Ahora mismo la IA está saturada",
        consejo: MOTIVOS.find((m) => m.clave === json.code)?.consejo || "Reinténtalo en unos minutos.",
        detalle: json.intentos,
      });
    }

    if (!res.ok) {
      throw Object.assign(new Error(json.error || "Error al analizar el documento."), {
        titulo: "No se ha podido analizar el documento",
        consejo: "Prueba con otro archivo o revisa que no esté protegido.",
      });
    }

    setResultado(json);
    setFase("listo");
  };

  const seguirJob = (jobId) =>
    new Promise((resolve, reject) => {
      const inicio = Date.now();

      const consultar = async () => {
        if (Date.now() - inicio > TIMEOUT_SONDEO) {
          reject(Object.assign(new Error("El análisis ha tardado demasiado."), {
            titulo: "El análisis se ha alargado demasiado",
            consejo: "Prueba a procesar un módulo más pequeño o inténtalo de nuevo.",
          }));
          return;
        }

        try {
          const res = await fetch(`/api/analyze?jobId=${jobId}`);
          const job = await res.json();

          if (res.status === 404) {
            reject(Object.assign(new Error("El proceso se perdió en el servidor."), {
              titulo: "Se ha interrumpido el análisis",
              consejo: "Vuelve a lanzarlo; el archivo sigue seleccionado.",
            }));
            return;
          }

          if (job.progreso) setProgreso(job.progreso);

          if (job.estado === "listo") {
            cancelarSondeo();
            setAnalisis(job.meta);
            setResultado(job.resultado);
            setFase("listo");
            resolve();
            return;
          }

          if (job.estado === "error") {
            cancelarSondeo();
            reject(
              Object.assign(new Error(job.error?.message || "Error en el análisis."), {
                titulo: job.error?.isUnavailable
                  ? "Ahora mismo la inteligencia artificial está saturada"
                  : "No se ha podido completar el análisis",
                consejo: job.error?.isUnavailable
                  ? "Es algo puntual: los servicios gratuitos se congestionan. Reinténtalo en unos minutos."
                  : "Reinténtalo; si el problema persiste, prueba con otro archivo.",
                detalle: job.error?.intentos,
              })
            );
            return;
          }

          sondeoRef.current = setTimeout(consultar, INTERVALO_SONDEO);
        } catch (e) {
          cancelarSondeo();
          reject(Object.assign(new Error(e.message), {
            titulo: "Se ha perdido la conexión",
            consejo: "Comprueba tu red y reinténtalo.",
          }));
        }
      };

      consultar();
    });

  const reintentar = async () => {
    if (!extraccion) return alPulsarAnalizar();

    setError(null);
    setFase("analizando");
    try {
      await lanzarAnalisis(extraccion.text, moduloElegido);
    } catch (e) {
      setError({ titulo: e.titulo || "Ha ocurrido un error", consejo: e.message, detalle: e.detalle });
      setFase(null);
    }
  };

  const empezarDeNuevo = () => {
    cancelarSondeo();
    setArchivo(null);
    setExtraccion(null);
    setModuloElegido("");
    setAnalisis(null);
    setResultado(null);
    setError(null);
    setFase(null);
    setProgreso(null);
    if (entradaRef.current) entradaRef.current.value = "";
  };

  /* ----------------------------------------------------------- Pantallas */

  // 3. Resultado listo -> editor
  if (resultado) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2.5">
            <Etiqueta tono="verde">
              <Icono nombre="checkCirculo" className="w-3.5 h-3.5" />
              Documento listo
            </Etiqueta>
            {analisis?.modelo && (
              <span className="text-xs text-slate-500">
                Procesado con {analisis.modelo}
                {analisis.fragmentos > 1 && ` en ${analisis.fragmentos} partes`}
              </span>
            )}
          </div>
          <Boton variante="secundario" icono="refrescar" onClick={empezarDeNuevo}>
            Procesar otro archivo
          </Boton>
        </div>

        <ProgramacionEditor datosIniciales={resultado} idExistente={null} />

        <Aviso tipo="aviso" className="mt-6" titulo="Antes de entregarlo">
          <p>
            La IA puede interpretive mal algún apartado. Revisa los títulos y las tablas: están
            todos editables antes de guardar.
          </p>
        </Aviso>
      </div>
    );
  }

  // 2b. Elección de módulo
  if (fase === "eligiendo") {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <Encabezado pasoActual={1} />

        <Tarjeta className="p-6 sm:p-8 animate-fade-up">
          <h2 className="text-xl font-bold text-slate-900 mb-1">¿Qué módulo quieres actualizar?</h2>
          <p className="text-sm text-slate-600 mb-6">
            Hemos encontrado {extraccion.modulos.length} módulos en el documento. Elige uno para
            procesarlo por separado, o todos si prefieres empezar por el documento completo.
          </p>

          <ul className="grid gap-2.5 sm:grid-cols-2">
            <li>
              <BotonTarjeta
                activo={moduloElegido === ""}
                onClick={() => elegirModulo("")}
                titulo="Todo el documento"
                descripcion="Procesa el archivo completo de una vez"
                icono="documento"
              />
            </li>
            {extraccion.modulos.map((mod) => (
              <li key={mod.codigo}>
                <BotonTarjeta
                  activo={moduloElegido === mod.codigo}
                  onClick={() => elegirModulo(mod.codigo)}
                  titulo={mod.codigo}
                  descripcion={mod.titulo}
                  mono
                />
              </li>
            ))}
          </ul>

          {error && <AvisoError error={error} onReintentar={empezarDeNuevo} />}

          <div className="mt-6 pt-5 border-t border-slate-200">
            <Boton variante="fantasma" icono="flechaAtras" onClick={empezarDeNuevo}>
              Volver a cambiar el archivo
            </Boton>
          </div>
        </Tarjeta>
      </div>
    );
  }

  // 2. Procesando
  if (fase === "leyendo" || fase === "analizando") {
    const leyendo = fase === "leyendo";
    const partes = progreso?.total > 1;

    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <div className="text-center animate-fade-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl brand-gradient text-white shadow-lg shadow-brand-600/25 mb-6">
            <Icono nombre="sparkles" className="w-8 h-8 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {leyendo ? "Leyendo tu documento…" : "Ordenando los apartados…"}
          </h2>
          <p className="text-slate-600 leading-relaxed mb-8 max-w-md mx-auto">
            {leyendo
              ? "Localizando apartados, listas y tablas en el archivo."
              : partes
                ? `La inteligencia artificial está procesando el módulo por partes (${progreso.fragmento} de ${progreso.total}) para que no se le corte el texto.`
                : "La inteligencia artificial está identificando cada apartado, sus listas y sus tablas. Esto puede tardar entre 15 y 60 segundos."}
          </p>

          {partes && progreso && (
            <Progreso
              valor={progreso.fragmento}
              maximo={progreso.total}
              etiqueta={progreso.fase === "fusionando" ? "Uniendo el resultado…" : `Parte ${progreso.fragmento} de ${progreso.total}`}
              className="max-w-sm mx-auto"
            />
          )}

          {!partes && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Icono nombre="reloj" className="w-4 h-4" />
              {leyendo ? "Un momento…" : "Puedes esperar, no hace falta que hagas nada"}
            </div>
          )}

          <p className="mt-10 text-xs text-slate-400">
            Si el documento es muy largo, esto puede tardar algunos minutos.
          </p>
        </div>
      </div>
    );
  }

  // 1. Subida
  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Encabezado pasoActual={0} />

      <Tarjeta className="p-6 sm:p-8 animate-fade-up">
        <h2 className="text-xl font-bold text-slate-900 mb-1.5">Sube tu programación didáctica</h2>
        <p className="text-sm text-slate-600 mb-6">
          Aceptamos PDF y Word (.docx). No hace falta que el documento tenga un formato concreto.
        </p>

        {/* Zona de arrastre */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={alSoltar}
          onClick={() => entradaRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && entradaRef.current?.click()}
          aria-label="Seleccionar archivo"
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 ${
            arrastrando
              ? "border-brand-500 bg-brand-50 scale-[1.01]"
              : "border-slate-300 bg-slate-50/60 hover:border-brand-400 hover:bg-brand-50/40"
          } ${error && !archivo ? "border-red-300 bg-red-50/40" : ""}`}
        >
          <input
            ref={entradaRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && elegirArchivo(e.target.files[0])}
          />

          {!archivo ? (
            <div className="px-6 py-12 text-center">
              <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white text-brand-600 shadow-sm border border-slate-200 mb-4">
                <Icono nombre="subir" className="w-6 h-6" />
              </span>
              <p className="text-slate-900 font-semibold mb-1">
                Arrastra tu archivo aquí o <span className="text-brand-600">búscalo en tu equipo</span>
              </p>
              <p className="text-xs text-slate-500">PDF o Word (.docx) · sin límite de tamaño</p>
            </div>
          ) : (
            <div className="px-5 py-5 flex items-center gap-4 animate-pop">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <Icono nombre="documento" className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 truncate">{archivo.name}</p>
                <p className="text-xs text-slate-500">{tamanoLegible(archivo.size)}</p>
              </div>
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  empezarDeNuevo();
                }}
              >
                Cambiar
              </Boton>
            </div>
          )}
        </div>

        {error && !extraccion && <AvisoError error={error} onReintentar={empezarDeNuevo} />}
        {error && extraccion && <AvisoError error={error} onReintentar={reintentar} className="mt-5" />}

        {extraccion && !error && (
          <div className="mt-5 flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <Icono nombre="checkCirculo" className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-sm text-emerald-900 min-w-0">
              <p className="font-semibold">
                {extraccion.modulos.length > 0
                  ? `${extraccion.modulos.length} módulos detectados`
                  : "Documento leído correctamente"}
              </p>
              <p className="text-emerald-800/80">
                {extraccion.caracteres.toLocaleString("es-ES")} caracteres extraídos
                {extraccion.modulos.length > 0 &&
                  ` · ${extraccion.modulos.slice(0, 3).map((m) => m.codigo).join(", ")}${extraccion.modulos.length > 3 ? "…" : ""}`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <EstadoMotores motores={motores} />
          <Boton
            tamano="lg"
            iconoDerecha="flecha"
            onClick={alPulsarAnalizar}
            disabled={!archivo || Boolean(error)}
            className="w-full sm:w-auto"
          >
            {extraccion ? "Continuar" : "Analizar documento"}
          </Boton>
        </div>
      </Tarjeta>

      <p className="mt-6 text-center text-xs text-slate-400">
        La IA puede equivocarse: siempre podrás revisar y corregir cada apartado antes de guardar.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- Subcomponentes */

function Encabezado({ pasoActual }) {
  return (
    <div className="mb-8 animate-fade-up">
      <Pasos pasos={["Subir archivo", "Revisar y corregir", "Guardar y exportar"]} actual={pasoActual} />
    </div>
  );
}

function AvisoError({ error, onReintentar, className = "mt-5" }) {
  return (
    <Aviso
      tipo="error"
      className={className}
      titulo={error.titulo}
      accion={
        <div className="flex flex-wrap gap-2">
          <Boton tamano="sm" icono="refrescar" onClick={onReintentar}>
            Reintentar
          </Boton>
        </div>
      }
    >
      <p>{error.consejo}</p>
      {error.detalle?.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium underline underline-offset-2">
            Ver detalle técnico
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] leading-relaxed">
            {error.detalle.map((d, i) => (
              <li key={i}>
                {d.proveedor}/{d.modelo} — {d.estado}
                {d.siguiente && <span className="opacity-70"> → siguiente: {d.siguiente}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Aviso>
  );
}

function BotonTarjeta({ activo, onClick, titulo, descripcion, icono, mono }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-150 ${
        activo
          ? "border-brand-500 bg-brand-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icono && (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 shrink-0">
            <Icono nombre={icono} className="w-4 h-4" />
          </span>
        )}
        <span className={`font-semibold text-slate-900 ${mono ? "font-mono text-sm" : "text-sm"}`}>
          {titulo}
        </span>
        {activo && <Icono nombre="checkCirculo" className="w-4 h-4 text-brand-600 ml-auto shrink-0" />}
      </div>
      {descripcion && (
        <p className="text-xs text-slate-500 mt-1 truncate" title={descripcion}>
          {descripcion}
        </p>
      )}
    </button>
  );
}

function EstadoMotores({ motores }) {
  if (!motores) {
    return (
      <p className="text-xs text-slate-400 flex items-center gap-2">
        <Icono nombre="chip" className="w-4 h-4" />
        Comprobando motores de IA…
      </p>
    );
  }

  const sinClave = motores.providers.filter((p) => !p.configurado);

  if (sinClave.length === motores.providers.length) {
    return (
      <p className="text-xs text-red-600 flex items-center gap-2">
        <Icono nombre="aviso" className="w-4 h-4" />
        Falta configurar las claves de IA en el servidor.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {motores.providers.map((p) => (
        <span
          key={p.id}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${
            !p.configurado
              ? "bg-slate-100 text-slate-400"
              : p.circuito === "operativo"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
          }`}
          title={p.modelos.join(", ")}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !p.configurado ? "bg-slate-300" : p.circuito === "operativo" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {p.label}
        </span>
      ))}
    </div>
  );
}