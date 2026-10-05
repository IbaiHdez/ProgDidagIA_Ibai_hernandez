/** Análisis de estructura compartido por navegador y servidor. Sin dependencias. */
export function normalizarTexto(texto = '') {
  return texto.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
    .replace(/^\s*--\s*\d+\s*(?:de|of)\s*\d+\s*--\s*$/gim, '')
    .replace(/^\s*Página\s+\d+(?:\s*de\s*\d+)?\s*$/gim, '')
    .replace(/^\s*-\s*\d+\s*-\s*$/gm, '')
    .split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const TITULO_RAIZ = /^(introducci[oó]n|[ií]ndice|justificaci[oó]n|context[ou]|objetivos?|competencias?|contenidos?|metodolog[ií]a|evaluaci[oó]n|calificaci[oó]n|recursos?|materiales?|temporalizaci[oó]n|distribuci[oó]n|atenci[oó]n|resultados?|criterios?|actividades?|anexos?|bibliograf[ií]a|marco|normativa|programaci[oó]n|m[oó]dulos?|organizaci[oó]n|identificaci[oó]n|propuestas?|desarrollo|seguimiento|recuperaci[oó]n|medidas|formaci[oó]n|unidades?)\b/i;
const esIndice = (linea) => /(?:\.{2,}|…|\t)\s*\d+\s*$/.test(linea);
const clave = (h) => `${h.codigo}|${h.titulo.toLocaleLowerCase('es').replace(/\s+/g, ' ')}`;

export function leerEncabezado(linea, { permitirNivel1 = false } = {}) {
  const limpia = linea.replace(/\u00a0/g, ' ').trim();
  if (esIndice(limpia) || limpia.length > 260) return null;
  const m = limpia.match(/^(\d{1,3}(?:\s*\.\s*\d{1,3}){0,7})\s*[.)\-–—:]?\s+([^\d\s].*)$/u);
  if (!m) return null;
  const codigo = m[1].replace(/\s/g, '');
  // Una nota decimal al principio de una frase (0.75 serán...) no es un epígrafe.
  if (codigo.startsWith('0.') || /[.!?;]$/.test(m[2]) && m[2].length > 100) return null;
  const nivel = codigo.split('.').length;
  if (nivel === 1 && !permitirNivel1) return null;
  return { codigo, titulo: m[2].trim(), nivel };
}

/** Todas las profundidades. Las posiciones identifican incluso códigos duplicados. */
export function detectarApartados(texto = '') {
  const lineas = texto.split('\n');
  const candidatos = [];
  let offset = 0;
  for (let i = 0; i < lineas.length; i++) {
    let encabezado = leerEncabezado(lineas[i], { permitirNivel1: true });
    let finCabecera = offset + lineas[i].length;
    // Algunos PDF separan el número y el título en dos líneas.
    if (!encabezado && /^\s*\d{1,3}(?:\.\d{1,3})+\.?\s*$/.test(lineas[i])) {
      const siguiente = lineas[i + 1]?.trim();
      if (siguiente && siguiente.length < 180 && !/^\d/.test(siguiente)) {
        encabezado = leerEncabezado(`${lineas[i].trim()} ${siguiente}`);
        finCabecera += 1 + lineas[i + 1].length;
      }
    }
    // Encabezados sin número: solo títulos reconocibles o versales cortas.
    if (!encabezado) {
      const t = lineas[i].trim();
      const aislado = (i === 0 || !lineas[i - 1].trim()) && (i === lineas.length - 1 || !lineas[i + 1].trim());
      if (aislado && t.length >= 4 && t.length <= 90 && !/[.;!?]$/.test(t) && !esIndice(t) &&
          (TITULO_RAIZ.test(t) || (/^[A-ZÁÉÍÓÚÜÑ\s/()\-]+$/.test(t) && t.split(/\s+/).length >= 2))) {
        encabezado = { codigo: '', titulo: t, nivel: 1 };
      }
    }
    if (encabezado && /\b(?:de|del|los|las|y|en|para)\s*$/i.test(encabezado.titulo)) {
      const siguiente = lineas[i + 1]?.trim();
      if (siguiente && /^[a-záéíóúñ]/.test(siguiente) && siguiente.length < 70 && !/[;!?]/.test(siguiente)) {
        encabezado.titulo += ` ${siguiente}`;
        finCabecera += 1 + lineas[i + 1].length;
      }
    }
    if (encabezado) candidatos.push({ ...encabezado, inicio: offset, finCabecera, linea: i });
    offset += lineas[i].length + 1;
  }

  const aceptados = candidatos.filter((h) => {
    if (h.nivel !== 1 || !h.codigo) return true;
    // No confundir listas numeradas con capítulos: exigir descendientes o un título reconocible.
    return TITULO_RAIZ.test(h.titulo) || candidatos.some((c) => c.codigo.startsWith(`${h.codigo}.`));
  }).filter((h, i, todos) => {
    const repetidoDespues = todos.slice(i + 1).some((otro) => clave(otro) === clave(h));
    const contenido = texto.slice(h.finCabecera, todos[i + 1]?.inicio ?? texto.length).trim();
    // Índices sin puntos guía y cabeceras repetidas sin contenido.
    return !(repetidoDespues && (contenido.length === 0 || /^\d+$/.test(contenido)));
  });

  return aceptados.map((h, i) => {
    let siguiente = i + 1;
    while (siguiente < aceptados.length && aceptados[siguiente].nivel > h.nivel) siguiente++;
    const fin = aceptados[siguiente]?.inicio ?? texto.length;
    return { ...h, id: `apartado-${h.inicio}`, fin, caracteres: fin - h.inicio };
  });
}

export function recortarApartado(texto, idOCodigo) {
  const apartados = detectarApartados(texto);
  const h = apartados.find((a) => a.id === idOCodigo) || apartados.find((a) => a.codigo === idOCodigo);
  return h ? { texto: texto.slice(h.inicio, h.fin).trim(), encontrado: true, titulo: h.titulo, apartado: h }
    : { texto, encontrado: false, titulo: null };
}

/** Secciones propias (sin duplicar descendientes); cada carácter pertenece a una sola. */
export function crearSeccionesFuente(texto) {
  const apartados = detectarApartados(texto);
  if (!apartados.length) return [{ id: 'fuente-0', codigo: '', titulo: 'Contenido del documento', nivel: 1, texto }];
  const secciones = [];
  const inicial = texto.slice(0, apartados[0].inicio);
  if (inicial.trim()) secciones.push({ id: 'fuente-inicial', codigo: '', titulo: 'Contenido inicial', nivel: 1, texto: inicial });
  apartados.forEach((h, i) => secciones.push({
    id: h.id, codigo: h.codigo, titulo: h.titulo, nivel: h.nivel,
    texto: texto.slice(h.finCabecera, apartados[i + 1]?.inicio ?? texto.length),
  }));
  return secciones;
}
