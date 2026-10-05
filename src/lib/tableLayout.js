/** Geometría compartida por PDF y Word, sin modificar celdas ni su orden. */
import { mapaCeldas } from './tablasOriginales.js';
export function calcularDisenoTabla(bloque) {
  const n = Math.max(bloque.columnas?.length || 0, 1);
  const filas = bloque.filas || [];
  const pesos = Array.from({ length: n }, (_, i) => {
    const longitudes = [bloque.columnas?.[i] || '', ...filas.map((f) => f[i] || '')]
      .map((c) => String(c).length).sort((a, b) => a - b);
    const habitual = longitudes[Math.ceil((longitudes.length - 1) * 0.75)] || 0;
    return Math.min(8, Math.max(1, Math.sqrt(habitual) / 2));
  });
  const total = pesos.reduce((s, p) => s + p, 0);
  const originales=bloque.diseno?.anchosColumnas;
  const anchos = originales?.length===n ? [...originales] : pesos.map((p) => Math.round(p / total * 10000) / 100);
  anchos[n - 1] = Math.round((100 - anchos.slice(0, -1).reduce((s, p) => s + p, 0)) * 100) / 100;
  const fuente = n >= 8 ? 9 : 10;
  const {celdas}=mapaCeldas(bloque);
  const centradas = Array.from({ length: n }, (_, i) => filas.length > 0 && filas.every((f) =>
    /^(?:\s*|[xX✓–—-]|(?:RA|SA)?\s*\d+(?:[.,]\d+)?\s*[%ªº]?)$/.test(String(f[i] || '').trim())));
  const lineasFila = (fila, f) => Math.max(1, ...fila.map((c, i) => {
    // A4, 18 cm útiles; estimación conservadora para permitir filas multipágina.
    const ancho=anchos.slice(i,i+(celdas.get(`${f}:${i}`)?.columnas||1)).reduce((a,b)=>a+b,0);
    const caracteres = Math.max(3, Math.floor((180 * ancho / 100 - 4) / (fuente * 0.19)));
    return String(c || '').split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / caracteres)), 0);
  }));
  return { anchos, fuente, centradas, dividirFilas: filas.map((fila,f) => lineasFila(fila,f) > 35) };
}
