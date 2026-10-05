import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { normalizarTexto, detectarApartados, recortarApartado } from './estructura.js';
export { normalizarTexto, leerEncabezado, detectarApartados, recortarApartado } from './estructura.js';

export async function textoDesdePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = result.pages || [];
    // Eliminar números impresos solo si forman una secuencia de paginación.
    const iniciales = pages.map((p) => p.text?.trim().match(/^(\d{1,5})\s*\n/)?.[1]);
    const consecutivos = iniciales.slice(1).filter((n, i) => n && iniciales[i] && Number(n) === Number(iniciales[i]) + 1).length;
    if (pages.length > 1 && consecutivos >= (pages.length - 1) * 0.7) {
      return pages.map((p) => p.text.replace(/^\s*\d{1,5}\s*\n/, '')).join('\n\n');
    }
    return result.text || '';
  } finally { await parser.destroy(); }
}

export async function textoDesdeDocx(buffer) {
  return (await mammoth.extractRawText({ buffer })).value || '';
}

// Alias conservados para integraciones anteriores; ahora incluyen toda la jerarquía.
export const detectarModulos = detectarApartados;
export const recortarModulo = recortarApartado;

export async function extraerTexto(buffer, nombreArchivo = '') {
  const esDocx = /\.(docx|dotx)$/i.test(nombreArchivo);
  const texto = normalizarTexto(await (esDocx ? textoDesdeDocx(buffer) : textoDesdePdf(buffer)));
  if (!texto) throw new Error('El documento no contiene texto extraíble. Si es un escaneo, necesita OCR.');
  return { texto, formato: esDocx ? 'docx' : 'pdf' };
}
