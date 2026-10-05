import { crearSeccionesFuente, detectarApartados } from '../estructura.js';
import { separarTablas } from '../tablasOriginales.js';
export { coberturaContenido } from './integridad.js';

const limiteConfigurado = () => {
  const n = Number(process.env.AI_CHUNK_CHARS || 14000);
  return Number.isFinite(n) && n >= 512 ? Math.min(n, 40000) : 14000;
};

/** Partición exacta y acotada: sin solapamientos, incluso con párrafos gigantes. */
export function dividirTexto(texto, limite, respetarTablas = false) {
  if (!Number.isFinite(limite) || limite < 1) throw new Error('Límite de fragmento inválido.');
  const partes = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = Math.min(inicio + limite, texto.length);
    if (fin < texto.length) {
      const salto = texto.lastIndexOf('\n', fin - 1);
      const espacio = texto.lastIndexOf(' ', fin - 1);
      const candidato = salto > inicio + limite * 0.5 ? salto + 1 : espacio + 1;
      if (candidato > inicio + limite * 0.5) fin = candidato;
      if (respetarTablas) {
        // Rótulos de unidades numeradas: «Actividad 3:», «Tabla 2:»,
        // «Situación de aprendizaje 1:»... Sin depender de un documento concreto.
        const tramo = texto.slice(inicio, inicio + limite);
        const fichas = [...tramo.matchAll(/^\p{L}[\p{L}\t ]{2,65}\s+\d+\s*:/gimu)];
        const ficha = fichas.at(-1)?.index;
        const parrafo = tramo.lastIndexOf('\n\n');
        if (ficha > limite * 0.25) fin = inicio + ficha;
        else if (parrafo > limite * 0.5) fin = inicio + parrafo + 2;
      }
      // No cortar una pareja UTF-16.
      if (fin > inicio && /[\uD800-\uDBFF]/.test(texto[fin - 1])) fin--;
    }
    if (fin <= inicio) fin = Math.min(inicio + 2, texto.length);
    partes.push(texto.slice(inicio, fin));
    inicio = fin;
  }
  return partes;
}

export const formatearParte = (p) =>
  `[APARTADO sourceId="${p.sourceId}" parte="${p.parte}"]\n${p.codigo} ${p.titulo}\n${p.texto}\n[/APARTADO]`;

export function crearPlanFragmentos(texto, maxChars = limiteConfigurado(), tablas = {}) {
  if (!Number.isFinite(maxChars) || maxChars < 512) throw new Error('El tamaño mínimo es 512 caracteres.');
  const secciones = crearSeccionesFuente(texto);
  const fragmentos = [];
  let partes = [], longitud = 0;
  const cerrar = () => {
    if (partes.length) fragmentos.push({ partes, texto: partes.map(formatearParte).join('\n') });
    partes = []; longitud = 0;
  };
  for (const s of secciones) {
    const presupuesto = Math.max(128, maxChars - s.titulo.length - s.codigo.length - 150);
    const trozos = separarTablas(s.texto,tablas).flatMap((p)=>p.bloqueOriginal?[p]:dividirTexto(p.texto,presupuesto,true).map((texto)=>({texto})));
    if (!trozos.length) trozos.push({texto:''});
    trozos.forEach((trozo, i) => {
      if(trozo.bloqueOriginal) {
        cerrar();
        fragmentos.push({sinIA:true,texto:'',partes:[{sourceId:s.id,bloqueOriginal:trozo.bloqueOriginal,tablaId:trozo.tablaId}]});
        return;
      }
      const textoParte=trozo.texto;
      const peso = textoParte.length + s.titulo.length + s.codigo.length + 150;
      if (longitud + peso > maxChars || partes.some((p) => p.sourceId === s.id)) cerrar();
      partes.push({ sourceId: s.id, codigo: s.codigo, titulo: s.titulo, nivel: s.nivel, parte: i + 1, texto: textoParte });
      longitud += peso;
    });
  }
  cerrar();
  return { secciones, fragmentos };
}

/** API compatible: fragmentos de texto exactos, sin pérdida ni duplicación. */
export function fragmentarTexto(texto, maxChars = limiteConfigurado()) {
  if (!texto) return [];
  const puntos = [...new Set([0, ...detectarApartados(texto).map((s) => s.inicio), texto.length])];
  const fragmentos = [];
  let actual = '';
  for (let i = 0; i < puntos.length - 1; i++) {
    for (const parte of dividirTexto(texto.slice(puntos[i], puntos[i + 1]), maxChars)) {
      if (actual.length + parte.length > maxChars) { fragmentos.push(actual); actual = ''; }
      actual += parte;
    }
  }
  if (actual) fragmentos.push(actual);
  return fragmentos;
}

export function fusionarResultados(resultados) {
  const modulo = resultados.find((r) => r?.modulo && Object.values(r.modulo).some(Boolean))?.modulo || {};
  const secciones = [], vistas = new Map();
  for (const resultado of resultados) for (const s of resultado?.secciones || []) {
    const key = s.sourceId || `${s.codigo}|${s.titulo}`;
    const existente = vistas.get(key);
    if (existente) {
      for (const bloque of s.bloques || []) {
        if (!existente.bloques.some((b) => JSON.stringify(b) === JSON.stringify(bloque))) existente.bloques.push(bloque);
      }
    } else {
      const nueva = { ...s, bloques: [...(s.bloques || [])], orden: secciones.length + 1 };
      secciones.push(nueva); vistas.set(key, nueva);
    }
  }
  return { modulo: { codigo: '', nombre: '', curso: '', profesor: '', ...modulo }, secciones };
}
