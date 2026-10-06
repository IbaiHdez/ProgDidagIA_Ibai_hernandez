/**
 * Estado de cada programación para el panel de control (Paso 5 del acta).
 *
 * Se calcula en el servidor (GET /api/programaciones) para que el listado
 * no viaje con los textos originales y la interfaz no reproduzca estas reglas.
 */

export const ESTADOS = {
  porRevisar: { clave: 'porRevisar', etiqueta: 'Por revisar', tono: 'ambar', icono: 'aviso' },
  lista: { clave: 'lista', etiqueta: 'Lista para entregar', tono: 'verde', icono: 'checkCirculo' },
  exportada: { clave: 'exportada', etiqueta: 'Exportada', tono: 'azul', icono: 'pdf' },
};

const instante = (valor) => {
  if (!valor) return null;
  const t = valor instanceof Date ? valor.getTime() : Date.parse(valor);
  return Number.isNaN(t) ? null : t;
};

// Un apartado vacío NO siempre está pendiente: los encabezados contenedores
// (padres jerárquicos como "10.2", cuyo contenido vive en "10.2.1"…) son
// estructurales y es normal que no tengan bloques propios.
const esCodigoHijo = (padre, hijo) =>
  typeof padre === 'string' && padre !== '' &&
  typeof hijo === 'string' && hijo !== padre &&
  hijo.startsWith(padre.endsWith('.') ? padre : `${padre}.`);

export function esContenedor(seccion, secciones = []) {
  if (!seccion?.codigo) return false;
  if (secciones.some((otra) => otra !== seccion && esCodigoHijo(seccion.codigo, otra?.codigo))) return true;
  // Respaldo para numeraciones irregulares: si el siguiente apartado cuelga
  // de este por nivel, este es su padre. Solo con niveles numéricos.
  const i = secciones.indexOf(seccion);
  const siguiente = i >= 0 ? secciones[i + 1] : null;
  return Number.isInteger(seccion?.nivel) && Number.isInteger(siguiente?.nivel) && siguiente.nivel > seccion.nivel;
}

// Motivo por el que un apartado está pendiente: 'sinEstructurar' (la IA
// conservó el texto original), 'vacio' (hoja sin contenido) o null.
export function motivoPendiente(seccion, secciones = []) {
  if (seccion?.revisar) return 'sinEstructurar';
  if (!Array.isArray(seccion?.bloques) || seccion.bloques.length === 0) {
    return esContenedor(seccion, secciones) ? null : 'vacio';
  }
  return null;
}

export const seccionPendiente = (s) => motivoPendiente(s) !== null;

export function estadoDe(prog = {}) {
  const secciones = Array.isArray(prog.secciones) ? prog.secciones : [];
  const motivos = secciones.map((s) => motivoPendiente(s, secciones));
  const sinEstructurar = motivos.filter((m) => m === 'sinEstructurar').length;
  const vacios = motivos.filter((m) => m === 'vacio').length;
  const pendientes = sinEstructurar + vacios;
  const detalle = { sinEstructurar, vacios };
  if (pendientes) return { ...ESTADOS.porRevisar, pendientes, detalle };
  const exportada = instante(prog.exportadaEn);
  const modificada = instante(prog.updatedAt);
  // La exportación solo cuenta si es posterior a la última edición.
  if (exportada && (!modificada || exportada >= modificada)) return { ...ESTADOS.exportada, pendientes: 0, detalle };
  return { ...ESTADOS.lista, pendientes: 0, detalle };
}

// Resumen ligero para el listado: sin textos ni bloques, solo contadores.
export function resumenizar(prog = {}) {
  const secciones = Array.isArray(prog.secciones) ? prog.secciones : [];
  const exportada = instante(prog.exportadaEn);
  const modificada = instante(prog.updatedAt);
  return {
    _id: String(prog._id ?? ''),
    modulo: prog.modulo || {},
    apartados: secciones.length,
    tablas: secciones.reduce((n, s) => n + (s?.bloques || []).filter((b) => b?.tipo === 'tabla').length, 0),
    estado: estadoDe(prog),
    modificada,
    exportada,
    // Ya se exportó, pero el contenido ha cambiado después.
    exportadaDesactualizada: Boolean(exportada && modificada && exportada < modificada),
  };
}
