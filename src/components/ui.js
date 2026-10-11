"use client";

import React from "react";

/**
 * Piezas de interfaz reutilizables de ProgDidactAI.
 *
 * Sin dependencias externas: los iconos son SVG propios para no añadir peso
 * ni dependencias a un proyecto que ya tiene bastante.
 */

const cx = (...clases) => clases.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Iconos */

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export function Icono({ nombre, className = "w-5 h-5", ...props }) {
  const paths = ICONOS[nombre];
  if (!paths) return null;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...base} {...props}>
      {paths}
    </svg>
  );
}

const ICONOS = {
  subir: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 17v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1" /></>,
  documento: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  pdf: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m9 18 1.5-3 1.5 3M10.2 16.8h1.6" /></>,
  word: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m8.5 12 1.3 6 1.2-4 1.2 4 1.3-6" /></>,
  brujula: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  rayo: <><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></>,
  check: <><path d="m4 12.5 5 5L20 6.5" /></>,
  checkCirculo: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  cruz: <><path d="M6 6l12 12M18 6 6 18" /></>,
  aviso: <><path d="M12 8.5v5" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  basura: <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M10 11v6M14 11v6" /></>,
  editar: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" /></>,
  flecha: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  flechaAtras: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  carpeta: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  refrescar: <><path d="M20 11a8 8 0 0 0-14.1-4.6L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.1 4.6L20 16" /><path d="M20 20v-4h-4" /></>,
  escudo: <><path d="M12 3 5 6v6c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  modulos: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  lista: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></>,
  chip: <><rect x="6.5" y="6.5" width="11" height="11" rx="2" /><path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" /></>,
  sparkles: <><path d="m12 3 1.7 4.9L18.6 9.6l-4.9 1.7L12 16.2l-1.7-4.9L5.4 9.6l4.9-1.7z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  spinner: <><path d="M12 3a9 9 0 0 1 9 9" opacity="0.9" /></>,
};

/* ------------------------------------------------------------------ Botón */

const VARIANTES = {
  primario: "brand-gradient text-white shadow-lg shadow-brand-600/20 hover:shadow-xl hover:shadow-brand-600/30 hover:brightness-110",
  secundario: "bg-white text-slate-800 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300",
  fantasma: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  peligro: "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300",
  peligroSolido: "bg-red-600 text-white border border-transparent shadow-lg shadow-red-600/20 hover:bg-red-700",
  exito: "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700",
};

const TAMANOS = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export function Boton({
  variante = "primario",
  tamano = "md",
  cargando = false,
  icono,
  iconoDerecha,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      className={cx(
        "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        VARIANTES[variante],
        TAMANOS[tamano],
        className
      )}
    >
      {cargando ? <Icono nombre="spinner" className="w-4 h-4 animate-spin-slow" /> : icono ? <Icono nombre={icono} className="w-4 h-4 shrink-0" /> : null}
      {children}
      {iconoDerecha && !cargando ? <Icono nombre={iconoDerecha} className="w-4 h-4 shrink-0" /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ Tarjeta */

export function Tarjeta({ className, children, hover = false, ...props }) {
  return (
    <div
      {...props}
      className={cx(
        "bg-white rounded-2xl border border-slate-200/80 shadow-sm",
        hover && "transition-all duration-200 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Etiqueta */

const TONOS = {
  neutro: "bg-slate-100 text-slate-600 ring-slate-200",
  azul: "bg-brand-50 text-brand-700 ring-brand-200",
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ambar: "bg-amber-50 text-amber-700 ring-amber-200",
  rojo: "bg-red-50 text-red-700 ring-red-200",
  violeta: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Etiqueta({ tono = "neutro", className, children, ...props }) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset",
        TONOS[tono],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Aviso */

const AVISOS = {
  info: { caja: "bg-brand-50/70 border-brand-200 text-brand-950", pastilla: "bg-brand-100 text-brand-700", icono: "info" },
  exito: { caja: "bg-emerald-50/80 border-emerald-200 text-emerald-950", pastilla: "bg-emerald-100 text-emerald-700", icono: "checkCirculo" },
  aviso: { caja: "bg-amber-50 border-amber-200/90 text-amber-950", pastilla: "bg-amber-100 text-amber-700", icono: "aviso" },
  error: { caja: "bg-red-50 border-red-200 text-red-950", pastilla: "bg-red-100 text-red-600", icono: "cruz" },
};

export function Aviso({ tipo = "info", titulo, children, accion, onCerrar, className }) {
  const conf = AVISOS[tipo] || AVISOS.info;

  return (
    <div
      className={cx("flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl border shadow-sm", conf.caja, className)}
      role={tipo === "error" ? "alert" : "status"}
    >
      <span className={cx("grid place-items-center w-9 h-9 rounded-xl shrink-0", conf.pastilla)} aria-hidden="true">
        <Icono nombre={conf.icono} className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0 text-sm">
        {titulo && <p className="font-bold tracking-tight mb-1">{titulo}</p>}
        {children && <div className="leading-relaxed text-[13px] opacity-90 [&_p+p]:mt-1.5">{children}</div>}
        {accion && <div className="mt-3">{accion}</div>}
      </div>
      {onCerrar && (
        <button
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="grid place-items-center w-7 h-7 -mr-1 -mt-1 rounded-lg shrink-0 opacity-60 hover:opacity-100 hover:bg-black/5 transition-all"
        >
          <Icono nombre="cruz" className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Diálogo de confirmación */

const TONOS_CONFIRMAR = {
  peligro: { pastilla: "bg-red-100 text-red-600", icono: "aviso", boton: "peligroSolido" },
  info: { pastilla: "bg-brand-100 text-brand-700", icono: "info", boton: "primario" },
};

/**
 * Sustituto del `confirm()` nativo: modal centrado con la identidad de la app.
 * Controlado por el padre con `abierto`; `ocupado` desactiva los botones
 * mientras se ejecuta la acción (p. ej. un borrado en el servidor).
 */
export function Confirmar({
  abierto,
  titulo,
  descripcion,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  tono = "peligro",
  ocupado = false,
  onConfirmar,
  onCancelar,
}) {
  const conf = TONOS_CONFIRMAR[tono] || TONOS_CONFIRMAR.peligro;
  const botonRef = React.useRef(null);

  React.useEffect(() => {
    if (!abierto) return;
    botonRef.current?.focus();
    const alPulsar = (e) => {
      if (e.key === "Escape") onCancelar?.();
    };
    document.addEventListener("keydown", alPulsar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = anterior;
    };
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-slate-950/50 backdrop-blur-[2px] animate-fade-in"
      onClick={() => { if (!ocupado) onCancelar?.(); }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-pop"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby={descripcion ? "confirmar-descripcion" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <span className={cx("grid place-items-center w-10 h-10 rounded-xl shrink-0", conf.pastilla)} aria-hidden="true">
            <Icono nombre={conf.icono} className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirmar-titulo" className="font-bold text-slate-900 tracking-tight leading-snug">
              {titulo}
            </h2>
            {descripcion && (
              <p id="confirmar-descripcion" className="text-sm text-slate-600 leading-relaxed mt-1">
                {descripcion}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Boton
            variante="secundario"
            className="flex-1"
            onClick={onCancelar}
            disabled={ocupado}
          >
            {textoCancelar}
          </Boton>
          <Boton
            ref={botonRef}
            variante={conf.boton}
            className="flex-1"
            onClick={onConfirmar}
            cargando={ocupado}
          >
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Progreso */

export function Progreso({ valor, maximo = 100, etiqueta, className, mostrarDetalle = true }) {
  const pct = Math.max(0, Math.min(100, Math.round((valor / maximo) * 100)));

  return (
    <div className={className}>
      {mostrarDetalle && (etiqueta || pct < 100) && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-2">
          <span>{etiqueta}</span>
          <span className="tabular-nums text-slate-500">{pct}%</span>
        </div>
      )}
      <div
        className="h-2 w-full bg-slate-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full brand-gradient rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Estados */

export function Cargando({ texto = "Cargando…", className, compacto = false }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-slate-500 animate-fade-in", compacto ? "py-6 gap-2" : "py-16 gap-3", className)}>
      <Icono nombre="spinner" className={compacto ? "w-6 h-6 text-brand-600 animate-spin-slow" : "w-9 h-9 text-brand-600 animate-spin-slow"} />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function EstadoVacio({ icono = "documento", titulo, descripcion, accion, className }) {
  return (
    <div className={cx("text-center py-14 px-6 animate-fade-up", className)}>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 mb-5">
        <Icono nombre={icono} className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1.5">{titulo}</h3>
      {descripcion && <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">{descripcion}</p>}
      {accion}
    </div>
  );
}

/* ------------------------------------------------------------------ Pasos */

export function Pasos({ pasos, actual = 0 }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 w-full" aria-label="Progreso de la tarea">
      {pasos.map((paso, i) => {
        const hecho = i < actual;
        const activo = i === actual;
        return (
          <li key={paso} className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cx(
                  "shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-bold transition-all duration-300",
                  hecho && "bg-emerald-500 text-white",
                  activo && "brand-gradient text-white shadow-md shadow-brand-600/25",
                  !hecho && !activo && "bg-slate-200 text-slate-500"
                )}
              >
                {hecho ? <Icono nombre="check" className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span
                className={cx(
                  "text-xs sm:text-sm font-medium truncate transition-colors",
                  activo ? "text-slate-900" : hecho ? "text-slate-600" : "text-slate-400"
                )}
              >
                {paso}
              </span>
            </div>
            {i < pasos.length - 1 && (
              <span className={cx("hidden sm:block h-px flex-1 min-w-4 rounded-full transition-colors", hecho ? "bg-emerald-300" : "bg-slate-200")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ Aviso flotante */

export function Notificacion({ notificacion, onCerrar }) {
  if (!notificacion) return null;

  const { tipo = "exito", texto } = notificacion;
  const estilos = {
    exito: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-slate-900 text-white",
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-pop" role="status" aria-live="polite">
      <div className={cx("flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium", estilos[tipo])}>
        <Icono nombre={tipo === "exito" ? "checkCirculo" : tipo === "error" ? "aviso" : "info"} className="w-5 h-5 shrink-0" />
        <span>{texto}</span>
        <button onClick={onCerrar} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100 transition-opacity">
          <Icono nombre="cruz" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Atajo para lanzar y cerrar notificaciones de forma declarativa. */
export function useNotificacion() {
  const [notificacion, setNotificacion] = React.useState(null);
  const timer = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const avisar = React.useCallback((texto, tipo = "exito", ms = 3200) => {
    clearTimeout(timer.current);
    setNotificacion({ texto, tipo });
    timer.current = setTimeout(() => setNotificacion(null), ms);
  }, []);

  return [notificacion, avisar, () => setNotificacion(null)];
}