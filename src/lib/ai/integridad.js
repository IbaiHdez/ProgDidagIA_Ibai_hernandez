// Compara contenido sin confundir cambios de maquetación con una omisión.
// No admite paráfrasis: las palabras, cifras y repeticiones del cuerpo cuentan.
function normalizar(texto) {
  return String(texto).normalize('NFKC').toLowerCase()
    .replace(/\r\n?/g, '\n')
    .replace(/\u00ad\s*/g, '')
    .replace(/(\p{L})-\s*\n\s*(?=\p{Ll})/gu, '$1')
    // pdf-parse representa algunas viñetas de segundo nivel como «o TAB».
    .replace(/^\s*o(?:[ \t]*\t| {2,})/gm, '')
    .replace(/\b(ra|sa)\s+(\d+)/g, '$1$2')
    .replace(/(\d),(?=\d)/g, '$1.');
}

function tokens(texto) {
  // Un decimal o una referencia (10.2.7.4) es una unidad, no cifras sueltas.
  return normalizar(texto).match(/\p{L}[\p{L}\p{N}]*|\p{N}+(?:\.\p{N}+)*|[%€]/gu) || [];
}
const clave = (texto) => tokens(texto).join(' ');
const contar = (lista) => {
  const bolsa = new Map();
  for (const t of lista) bolsa.set(t, (bolsa.get(t) || 0) + 1);
  return bolsa;
};

export function coberturaContenido(original, bloques) {
  const cabeceras = bloques.filter((b) => b.tipo === 'tabla').map((b) => b.columnas || []);
  const origenNormalizado = normalizar(original);
  const origenClave = ` ${clave(original)} `;
  const conocidas = new Set(cabeceras.map((c) => clave(c.join(' '))).filter(Boolean));
  const vistas = new Set();
  // Un encabezado de tabla puede repetirse al cambiar de página del PDF.
  const fuente = origenNormalizado.split('\n').filter((linea) => {
    const k = clave(linea);
    if (!conocidas.has(k)) return true;
    if (vistas.has(k)) return false;
    vistas.add(k); return true;
  }).join('\n');
  const origen = tokens(fuente), destino = [], extrasCabecera = [];
  for (const b of bloques) {
    if (b.tipo === 'tabla') {
      destino.push(...tokens(b.titulo || ''));
      for (const columna of b.columnas || []) {
        const k = clave(columna);
        // Cabeceras vacías rellenadas por el saneador son presentación.
        if (/^columna \d+$/.test(k) && !origenClave.includes(` ${k} `)) continue;
        const ts = tokens(columna);
        destino.push(...ts);
        // Solo permiten duplicación las cabeceras que existen en la fuente.
        if (k && origenClave.includes(` ${k} `)) extrasCabecera.push(...ts);
      }
      for (const fila of b.filas || []) for (const celda of fila) destino.push(...tokens(celda));
    } else if (b.tipo === 'lista') {
      for (const item of b.items || []) destino.push(...tokens(item));
    } else destino.push(...tokens(b.texto || ''));
  }
  const bolsaOrigen = contar(origen), bolsaDestino = contar(destino), permitidos = contar(extrasCabecera);
  const faltantes = [], anadidos = [];
  let perdidos = 0, extras = 0;
  for (const [t, n] of bolsaOrigen) {
    const cantidad = Math.max(0, n - (bolsaDestino.get(t) || 0));
    perdidos += cantidad;
    if (cantidad) faltantes.push({ texto: t, cantidad });
  }
  for (const [t, n] of bolsaDestino) {
    const cantidad = Math.max(0, n - (bolsaOrigen.get(t) || 0) - (permitidos.get(t) || 0));
    extras += cantidad;
    if (cantidad) anadidos.push({ texto: t, cantidad });
  }
  return {
    conservacion: origen.length ? 1 - perdidos / origen.length : 1,
    precision: destino.length ? 1 - extras / destino.length : 1,
    valido: perdidos === 0 && extras === 0,
    perdidos, extras, faltantes: faltantes.slice(0, 8), anadidos: anadidos.slice(0, 8),
  };
}
