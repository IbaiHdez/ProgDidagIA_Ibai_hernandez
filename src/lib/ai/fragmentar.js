/**
 * Fragmentación del documento.
 *
 * Los módulos de programación didáctica ocupan con facilidad 50-150 páginas, muy
 * por encima de lo que un modelo responde en una sola llamada: el JSON de salida
 * se trunca y el análisis falla. Aquí se trocea el texto en trozos manejables
 * **cortando por encabezados** (nunca a mitad de un apartado) y con solapamiento
 * para que un apartado partido entre dos trozos aparezca completo en alguno.
 *
 * Después el orquestador analiza cada fragmento por separado y fusiona los
 * resultados (ver `analizarDocumentoFragmentado` en `src/lib/ai/index.js`).
 */

import { leerEncabezado } from '../documento.js';

const CARACTERES_POR_FRAGMENTO = Number(process.env.AI_CHUNK_CHARS || 14000);
const SOLAPAMIENTO = Number(process.env.AI_CHUNK_OVERLAP || 1200);

/**
 * Divide el texto en fragmentos por límites de encabezado.
 * @returns {string[]}
 */
export function fragmentarTexto(texto, maxChars = CARACTERES_POR_FRAGMENTO) {
  if (!texto) return [];
  if (texto.length <= maxChars) return [texto];

  const lineas = texto.split('\n');

  // Puntos de corte candidatos: inicio de cada encabezado numerado.
  const cortes = [];
  for (let i = 0; i < lineas.length; i++) {
    const encabezado = leerEncabezado(lineas[i]);
    if (!encabezado) continue;

    const desde = cortes.length > 0 ? cortes.at(-1).indice : 0;
    const longitud = lineas.slice(desde, i).join('\n').length;
    if (longitud >= maxChars * 0.6) {
      cortes.push({ indice: i, nivel: encabezado.nivel, codigo: encabezado.codigo });
    }
  }

  if (cortes.length === 0) {
    // Sin encabezados reconocibles: cortamos por párrafos completos.
    return cortarPorParrafos(lineas, maxChars);
  }

  const fragmentos = [];
  let inicio = 0;

  for (const corte of cortes) {
    if (corte.indice <= inicio) continue;

    const trozo = lineas.slice(inicio, corte.indice).join('\n');
    if (trozo.trim().length === 0) continue;

    fragmentos.push(trozo);
    inicio = corte.indice;
  }

  const resto = lineas.slice(inicio).join('\n');
  if (resto.trim()) fragmentos.push(resto);

  // Si aun así algún fragmento se pasa del límite (encabezados muy largos),
  // lo troceamos por párrafos.
  return fragmentos.flatMap((fragmento) =>
    fragmento.length > maxChars * 1.5 ? cortarPorParrafos(fragmento.split('\n'), maxChars) : [fragmento]
  );
}

function cortarPorParrafos(lineas, maxChars) {
  const fragmentos = [];
  let actual = [];

  for (const linea of lineas) {
    const candidata = [...actual, linea].join('\n');

    if (candidata.length > maxChars && actual.length > 0) {
      fragmentos.push(actual.join('\n'));
      // Solapamiento: arrastramos el final para no perder contexto entre trozos.
      actual = actual.slice(-Math.ceil(SOLAPAMIENTO / 80));
    }

    actual.push(linea);
  }

  if (actual.length > 0) fragmentos.push(actual.join('\n'));

  return fragmentos.filter((f) => f.trim());
}

/**
 * Fusiona los resultados de varios fragmentos en una única programación.
 * - `modulo`: el primer resultado no vacío.
 * - `secciones`: concatenadas, deduplicadas por código+título y renumeradas.
 */
export function fusionarResultados(resultados) {
  const modulo = resultados.find((r) => r?.modulo && Object.values(r.modulo).some(Boolean))?.modulo || {};
  const vistas = new Set();
  const secciones = [];

  for (const resultado of resultados) {
    for (const seccion of resultado?.secciones || []) {
      // Un mismo apartado puede caer en dos fragmentos por el solapamiento.
      const clave = `${seccion.codigo}|${seccion.titulo}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      secciones.push({ ...seccion, orden: secciones.length + 1 });
    }
  }

  return {
    modulo: {
      codigo: modulo.codigo || '',
      nombre: modulo.nombre || '',
      curso: modulo.curso || '',
      profesor: modulo.profesor || '',
    },
    secciones,
  };
}