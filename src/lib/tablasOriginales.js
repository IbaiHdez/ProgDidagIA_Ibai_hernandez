export const patronTablas = () => /\[\[TABLA_PDF:([a-zA-Z0-9_-]+)\]\]/g;
export function separarTablas(texto, tablas = {}) {
  const partes=[]; let inicio=0;
  for(const m of texto.matchAll(patronTablas())) {
    if(!Object.hasOwn(tablas,m[1])) throw new Error('Falta una tabla del documento. Vuelve a importar el archivo.');
    if(m.index>inicio) partes.push({texto:texto.slice(inicio,m.index)});
    partes.push({bloqueOriginal:tablas[m[1]],tablaId:m[1]});inicio=m.index+m[0].length;
  }
  if(inicio<texto.length) partes.push({texto:texto.slice(inicio)});
  return partes;
}
export const textoTabla = (b) => [b.titulo||'', ...b.filas.map((f)=>f.join('\t'))].filter(Boolean).join('\n');
export const expandirTablas = (texto, tablas) => separarTablas(texto,tablas).map((p)=>p.bloqueOriginal?textoTabla(p.bloqueOriginal):p.texto).join('');

/** Mejora la lectura del texto ajeno a tablas sin reescribirlo. */
export function bloquesTexto(texto) {
  return texto.split(/\n\s*\n|\n(?=\s*[•●▪])/).map((p)=>p.trim()).filter(Boolean)
    .map((p)=>({tipo:'texto',texto:p.replace(/\s*\n\s*/g,' ')}));
}

export function mapaCeldas(bloque) {
  const celdas=new Map(), cubiertas=new Set();
  for(const c of bloque.diseno?.combinaciones || []) {
    celdas.set(`${c.fila}:${c.columna}`,c);
    for(let f=c.fila;f<c.fila+c.filas;f++) for(let col=c.columna;col<c.columna+c.columnas;col++) {
      if(f!==c.fila || col!==c.columna) cubiertas.add(`${f}:${col}`);
    }
  }
  const estilos=new Map((bloque.diseno?.estilos||[]).map((e)=>[`${e.fila}:${e.columna}`,e]));
  return {celdas,cubiertas,estilos};
}
