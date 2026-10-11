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

/** Índices con puntos guía, incluidos títulos partidos en varias líneas. */
export function localizarIndices(texto = '') {
  const lineas = texto.split('\n'), rangos = [];
  let offset = 0;
  const posiciones = lineas.map((l) => { const p = offset; offset += l.length + 1; return p; });
  for (let i = 0; i < lineas.length; i++) {
    if (!/^\s*(?:[ií]ndice(?:\s+(?:de\s+)?contenidos?)?|tabla de contenidos|contents|table of contents)\s*$/i.test(lineas[i])) continue;
    let entradas = 0, sinEntrada = 0, ultima = i;
    for (let j = i + 1; j < lineas.length; j++) {
      if (esIndice(lineas[j])) { entradas++; ultima = j; sinEntrada = 0; }
      else if (lineas[j].trim() && !/^\s*\d+\s*$/.test(lineas[j]) && ++sinEntrada > 3) break;
    }
    if (entradas >= 3) { rangos.push({inicio:posiciones[i],fin:posiciones[ultima]+lineas[ultima].length}); i = ultima; }
  }
  return rangos;
}

export function leerEncabezado(linea, { permitirNivel1 = false } = {}) {
  const limpia = linea.replace(/\u00a0/g, ' ').trim();
  if (esIndice(limpia) || limpia.length > 260) return null;
  const m = limpia.match(/^(\d{1,3}(?:\s*\.\s*\d{1,3}){0,7})\s*[.)\-–—:]?\s+([^\d\s].*)$/u);
  if (!m) return null;
  const codigo = m[1].replace(/\s/g, '');
  // Una nota decimal al principio de una frase (0.75 serán...) no es un epígrafe.
  const nivel = codigo.split('.').length;
  const minuscula=/^[a-záéíóúüñ]/.test(m[2]);
  if (codigo.startsWith('0.') || /^[¿¡]/.test(m[2]) || minuscula && (nivel===1 ? !TITULO_RAIZ.test(m[2]) : /\.\d{3}$/.test(codigo)) || /[!?;]$/.test(m[2]) || /[.]$/.test(m[2]) && m[2].length > 100) return null;
  if (nivel === 1 && !permitirNivel1) return null;
  return { codigo, titulo: m[2].trim(), nivel };
}

/** Todas las profundidades. Las posiciones identifican incluso códigos duplicados. */
export function detectarApartados(texto = '') {
  const lineas = texto.split('\n');
  const indices = localizarIndices(texto);
  const indiceInicial=indices[0] && !texto.slice(0,indices[0].inicio).split('\n').some(l=>leerEncabezado(l,{permitirNivel1:true}));
  const candidatos = [];
  let offset = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (indices.some((r) => offset >= r.inicio && offset <= r.fin) || indiceInicial && offset < indices[0].inicio) { offset += lineas[i].length + 1; continue; }
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
      if (aislado && t.length >= 4 && t.length <= 70 && /^[A-ZÁÉÍÓÚÜÑ]/.test(t) && t.split(/\s+/).length<=10 && !/[.,;!?]$|:/.test(t) && !esIndice(t) &&
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
    // Una entrada de índice puede tener los puntos guía en su segunda línea.
    if (encabezado && !esIndice(lineas[i + 1] || '')) candidatos.push({ ...encabezado, inicio: offset, finCabecera, linea: i });
    offset += lineas[i].length + 1;
  }

  const raices = new Set();
  const aceptados = candidatos.filter((h, i) => {
    if (h.nivel !== 1 || !h.codigo) return true;
    // Los descendientes deben estar después y dentro de este capítulo.
    // Un 1.1 anterior no convierte cualquier elemento «1.» en un título.
    const siguientes = candidatos.slice(i + 1);
    const limite = siguientes.findIndex((c) => c.nivel <= h.nivel);
    const descendientes = (limite < 0 ? siguientes : siguientes.slice(0,limite)).some((c) => c.codigo.startsWith(`${h.codigo}.`));
    if (!descendientes && (raices.has(h.codigo) || !TITULO_RAIZ.test(h.titulo) || /[.]$/.test(h.titulo))) return false;
    raices.add(h.codigo);
    return true;
  }).filter((h, i, todos) => {
    const repetidoDespues = todos.slice(i + 1).some((otro) => clave(otro) === clave(h));
    const contenido = texto.slice(h.finCabecera, todos[i + 1]?.inicio ?? texto.length).trim();
    // Índices sin puntos guía y cabeceras repetidas sin contenido.
    return !(repetidoDespues && (contenido.length === 0 || /^\d+$/.test(contenido)));
  });

  let anteriorNumerado;
  for (const h of aceptados) {
    if (h.codigo) anteriorNumerado = h;
    else if (anteriorNumerado && h.titulo !== h.titulo.toUpperCase()) h.nivel = Math.min(8,anteriorNumerado.nivel+1);
  }
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
  if (inicial.trim()) {
    const indice = localizarIndices(inicial)[0];
    if (indice) {
      if (inicial.slice(0,indice.inicio).trim()) secciones.push({id:'fuente-inicial',codigo:'',titulo:'Contenido inicial',nivel:1,texto:inicial.slice(0,indice.inicio)});
      secciones.push({id:'fuente-indice',codigo:'',titulo:'Índice original',nivel:1,texto:inicial.slice(indice.inicio,indice.fin),sinIA:true});
      if (inicial.slice(indice.fin).trim()) secciones.push({id:'fuente-preliminar',codigo:'',titulo:'Contenido preliminar',nivel:1,texto:inicial.slice(indice.fin)});
    } else secciones.push({ id: 'fuente-inicial', codigo: '', titulo: 'Contenido inicial', nivel: 1, texto: inicial });
  }
  apartados.forEach((h, i) => secciones.push({
    id: h.id, codigo: h.codigo, titulo: h.titulo, nivel: h.nivel,
    texto: texto.slice(h.finCabecera, apartados[i + 1]?.inicio ?? texto.length),
  }));
  return secciones;
}
