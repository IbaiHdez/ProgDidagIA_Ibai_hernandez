import { ProviderError, toProviderError } from './errors';

/**
 * Circuit breaker por proveedor.
 *
 * Cuando un proveedor falla varias veces seguidas (saturación, cuota agotada),
 * se abre el circuito y se salta durante un periodo de enfriamiento. Así una
 * única petición del usuario no encadena 2 proveedores x N modelos x N reintentos
 * y se agota el tiempo de espera del cliente.
 *
 * El estado vive en `globalThis` para sobrevivir al Fast Refresh de Next.js.
 */

const store = (globalThis.__progdidactaiBreakers ||= new Map());

const MAX_FALLIDOS = 3;
const BASE_ENFRIAMIENTO_MS = 30_000;
const MAX_ENFRIAMIENTO_MS = 5 * 60_000;

function obtenerEstado(id) {
  if (!store.has(id)) store.set(id, { fallos: 0, abiertoHasta: 0, ultimoFallo: 0, aperturas: 0 });
  return store.get(id);
}

/** @returns {{ abierto: boolean, restanteMs: number, fallos: number }} */
export function estadoCircuito(id) {
  const estado = obtenerEstado(id);
  const restante = estado.abiertoHasta - Date.now();
  return {
    abierto: restante > 0,
    restanteMs: Math.max(0, restante),
    fallos: estado.fallos,
  };
}

/** Registra un fallo y abre el circuito si se supera el umbral. */
export function registrarFallo(id) {
  const estado = obtenerEstado(id);
  estado.fallos += 1;
  estado.ultimoFallo = Date.now();

  if (estado.fallos >= MAX_FALLIDOS) {
    // Enfriamiento exponencial: 30s, 60s, 120s... hasta 5 minutos.
    const escalon = Math.min(estado.aperturas++, 4);
    const enfriamiento = Math.min(BASE_ENFRIAMIENTO_MS * 2 ** escalon, MAX_ENFRIAMIENTO_MS);
    estado.abiertoHasta = Date.now() + enfriamiento;
    estado.fallos = 0;
    return { abierto: true, restanteMs: enfriamiento };
  }

  return { abierto: false, restanteMs: 0 };
}

/** Un éxito reinicia el contador de fallos. */
export function registrarExito(id) {
  obtenerEstado(id).fallos = 0;
  obtenerEstado(id).aperturas = 0;
  obtenerEstado(id).abiertoHasta = 0;
}

/** Comprueba si un proveedor está disponible para recibir peticiones. */
export function puedeUsarse(id) {
  return !estadoCircuito(id).abierto;
}

/**
 * Envuelve una llamada a un proveedor con el circuito y la clasificación de errores.
 *
 * Clasificar aquí es importante: los SDKs lanzan errores "crudos" (sin marca de
 * reintentable), así que si solo mirásemos `error.retryable` el circuito nunca
 * registraría los 429/503 y el proveedor saturado se seguiría reintentando.
 *
 * @param {string} id
 * @param {() => Promise<any>} fn
 * @param {{ model?: string }} [opciones]
 */
export async function conCircuito(id, fn, { model } = {}) {
  const estado = estadoCircuito(id);

  if (estado.abierto) {
    throw new ProviderError(
      `${id}: circuito abierto por saturación previa. Reintenta en ${Math.ceil(estado.restanteMs / 1000)}s.`,
      { provider: id, model, status: 503, retryable: true, code: 'CIRCUIT_OPEN' }
    );
  }

  try {
    const resultado = await fn();
    registrarExito(id);
    return resultado;
  } catch (error) {
    const clasificado = toProviderError(error, { provider: id, model });
    if (clasificado.retryable) registrarFallo(id);
    throw clasificado;
  }
}

/** Utilidad para tests / diagnóstico: limpia el estado de los circuits. */
export function resetCircuitos() {
  store.clear();
}