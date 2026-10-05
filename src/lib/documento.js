/**
 * Utilidades de extracción de texto y detección de apartados.
 *
 * Los PDFs de programación didáctica de un centro suelen traer TODOS los módulos
 * del ciclo formativo seguidos (10.1, 10.2, 10.3...). Enviarlo entero a la IA es
 * caro y hace que el modelo se mezcle entre módulos, así que aquí recortamos el
 * módulo pedido usando su jerarquía numérica.
 *
 * Nada está hardcodeado: se detecta la jerarquía a partir del documento recibido,
 * de modo que sirve tanto para "10.2. Desarrollo web" como para "4.1) Objetivos
 * específicos" o "5.3 - Metodología".
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Ruido típico de los PDF exportados desde Word: pies de página y cabeceras. */
const PATRONES_RUIDO = [
  /--\s*\d+\s*(?:de|of)\s*\d+\s*--/gi, // "12 de 38" / "12 of 38"
  /^\s*Página\s+\d+\s*(?:de\s*\d+)?\s*$/gim,
  /^\s*-\s*\d+\s*-\s*$/gm, // paginación corta "- 12 -"
];

export function normalizarTexto(texto) {
  if (!texto) return '';

  let limpio = texto.replace(/\r\n?/g, '\n');

  for (const patron of PATRONES_RUIDO) limpio = limpio.replace(patron, '');

  // Espacios al final de línea y bloques de líneas en blanco repetidas.
  limpio = limpio
    .split('\n')
    .map((linea) => linea.replace(/[ \t ]+$/g, ''))
    .join('\n');

  return limpio.replace(/\n{3,}/g, '\n\n').trim();
}

/** Extrae texto plano de un PDF. */
export async function textoDesdePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

/** Extrae texto plano de un .docx (incluye párrafos y celdas de tabla). */
export async function textoDesdeDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Encabezado numerado: "10.2. Título", "4.1) Título", "5.3 - Título", "7.2 Título".
 * El código puede tener 1 o 2 dígitos por nivel (hasta "10.2.1"), y el separador
 * entre código y título es opcional.
 */
const RE_CODIGO = /^\s*(\d{1,2}(?:\.\d{1,2})*)\s*[.)-]?\s+(\S.{0,110})\s*$/;

/**
 * Analiza una línea como posible encabezado numerado.
 *
 * `permitirNivel1` está apagado a propósito: dentro de un módulo hay listas
 * numeradas ("1. El alumno instala...") indistinguibles de un apartado de primer
 * nivel; reconocerlas de entrada truncaría el módulo y perderíamos contenido.
 * Solo se activa cuando el usuario pide explícitamente un apartado de un solo
 * nivel (por ejemplo "6"), donde sí queremos cerrar el recorte ahí.
 *
 * @returns {{ codigo: string, titulo: string, nivel: number }|null}
 */
export function leerEncabezado(linea, { permitirNivel1 = false } = {}) {
  const match = linea.match(RE_CODIGO);
  if (!match) return null;

  const codigo = match[1];
  const nivel = codigo.split('.').length;

  if (nivel < 2 && !permitirNivel1) return null;

  return { codigo, titulo: match[2].trim(), nivel };
}

/**
 * Lista los códigos de módulo (x.y) que aparecen como encabezado en el documento.
 * Son los candidatos que la interfaz ofrece para elegir.
 */
export function detectarModulos(texto) {
  if (!texto) return [];

  const encontrados = new Map();

  for (const linea of texto.split('\n')) {
    const encabezado = leerEncabezado(linea);
    // Los módulos son los apartados de dos niveles (10.2, no 10.2.1).
    if (!encabezado || encabezado.nivel !== 2 || encontrados.has(encabezado.codigo)) continue;
    encontrados.set(encabezado.codigo, encabezado.titulo);
  }

  return [...encontrados.entries()].map(([codigo, titulo]) => ({ codigo, titulo }));
}

/**
 * Recorta el texto de un módulo concreto (ej: "10.2") desde su encabezado hasta
 * el siguiente apartado del mismo nivel o de nivel superior.
 *
 * @returns {{ texto: string, encontrado: boolean, titulo: string|null }}
 */
export function recortarModulo(texto, codigo) {
  if (!texto || !codigo) return { texto, encontrado: false, titulo: null };

  const nivelObjetivo = codigo.split('.').filter(Boolean).length;
  // Si piden "6" (un solo nivel) hay que admitir ese nivel para poder cerrar el
  // recorte en el "7." siguiente.
  const opciones = { permitirNivel1: nivelObjetivo === 1 };

  const lineas = texto.split('\n');

  let inicio = -1;
  let titulo = null;

  for (let i = 0; i < lineas.length; i++) {
    const encabezado = leerEncabezado(lineas[i], opciones);
    if (encabezado?.codigo === codigo) {
      inicio = i;
      titulo = encabezado.titulo;
      break;
    }
  }

  if (inicio === -1) return { texto, encontrado: false, titulo: null };

  let fin = lineas.length;
  for (let i = inicio + 1; i < lineas.length; i++) {
    const encabezado = leerEncabezado(lineas[i], opciones);
    if (encabezado && encabezado.nivel <= nivelObjetivo) {
      fin = i;
      break;
    }
  }

  const recortado = lineas.slice(inicio, fin).join('\n').trim();

  return { texto: recortado || texto, encontrado: true, titulo };
}

/** Punto de entrada: según la extensión del buffer, extrae y normaliza el texto. */
export async function extraerTexto(buffer, nombreArchivo = '') {
  const nombre = nombreArchivo.toLowerCase();
  const esDocx = nombre.endsWith('.docx') || nombre.endsWith('.dotx');

  const crudo = esDocx ? await textoDesdeDocx(buffer) : await textoDesdePdf(buffer);
  const texto = normalizarTexto(crudo);

  if (!texto) {
    throw new Error(
      'No se pudo extraer texto del archivo. Si es un PDF escaneado, necesita pasarse por OCR antes.'
    );
  }

  return { texto, formato: esDocx ? 'docx' : 'pdf' };
}