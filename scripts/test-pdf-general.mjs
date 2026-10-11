import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detectarApartados,crearSeccionesFuente,recortarApartado} from '../src/lib/estructura.js';
import {extraerPdfConTablas} from '../src/lib/pdfLayout.js';
import {extraerTexto} from '../src/lib/documento.js';
import {expandirTablas} from '../src/lib/tablasOriginales.js';
import {analizarDocumentoFragmentado} from '../src/lib/ai/index.js';
import {validarProgramacion} from '../src/lib/validacion.js';
import {reconstruirCuadricula} from '../src/lib/pdfGrid.js';

test('el índice multilínea se conserva sin convertir sus referencias en apartados',async()=>{
  const texto='Portada\n\nÍndice\n1. Introducción .......... 2\n1.1. Marco .......... 3\n9.8. Ponderaciones de los\nresultados .......... 200\n\n1. Introducción\nContenido inicial.\n1.1. Marco\nContenido final.';
  assert.deepEqual(detectarApartados(texto).map(s=>s.codigo),['1','1.1']);
  const r=await analizarDocumentoFragmentado(texto,{usarIA:false});
  const indice=r.data.secciones.find(s=>s.sourceId==='fuente-indice');
  assert.match(indice.bloques[0].texto,/resultados \.{10} 200/);
  assert.equal(r.meta.tablasOriginales,0);
});

test('no confunde cifras ni listas con capítulos y mantiene títulos en minúscula',()=>{
  const texto='1. Introducción\n1.1. contexto\nLa ciudad tiene\n35.000 habitantes y se divide en\n6 poblaciones.\n2. Competencias\n2.1. Desarrollo\n1. Organizar las tareas.\n2. Motivar eficazmente.\n3. Objetivos\n4. Evaluación\n4.1. criterios\n1. ¿Qué has aprendido?\n2. ¿Qué cambiarías?';
  assert.deepEqual(detectarApartados(texto).map(s=>s.codigo),['1','1.1','2','2.1','3','4','4.1']);
  assert.match(recortarApartado(texto,'2').texto,/Motivar eficazmente/);
});

test('un subtítulo sin número no corta su capítulo y un índice posterior no borra el texto anterior',()=>{
  const texto='5. Metodología\n5.1. Programa\nContenido.\n\nMetodología\n\nOtros párrafos.\n5.2. Recursos\nFinal.\n\nÍndice\n5. Metodología .... 1\n5.1. Programa .... 2\n5.2. Recursos .... 3';
  const a=detectarApartados(texto);
  assert.equal(a.find(h=>!h.codigo).nivel,3);
  assert.match(recortarApartado(texto,'5').texto,/Otros párrafos/);
  assert.equal(a[0].codigo,'5');
});

test('la cuadrícula con borde abierto conserva una celda combinada verticalmente',()=>{
  const h=(y,x=0)=>({from:{x,y},to:{x:90,y},gaps:[]});
  const v=x=>({from:{x,y:0},to:{x,y:60},gaps:[]});
  const t=reconstruirCuadricula({hLines:[h(0),h(20),h(40,30),h(60)],vLines:[v(0),v(30),v(90)],rowPivots:[0,20,40,60],colPivots:[0,30,90]});
  assert.equal(t.cellCount,5);
  assert.deepEqual(t.rows[1][0],{minXY:{x:0,y:20},maxXY:{x:30,y:60}});
});

const ruta=process.env.PDF_REGRESSION_SMR;
test('SMR: índice, listas, tablas abiertas y contenido completo en extracción directa y fallo de IA',{skip:!ruta||!fs.existsSync(ruta)},async()=>{
  const buffer=fs.readFileSync(ruta),r=await extraerPdfConTablas(buffer);
  assert.equal(Object.keys(r.tablas).length,14);
  assert.equal(r.paginas,47);
  const apartados=detectarApartados(r.texto);
  assert.equal(apartados.filter(s=>s.codigo).length,39);
  assert.equal(apartados.at(-1).codigo,'9.1.2');
  assert.equal(apartados.filter(s=>s.codigo==='9.1.8').length,0);
  for(const id of ['p39-t1','p40-t1'])assert.equal(r.tablas[id].columnas.length,3);
  assert.equal(r.tablas['p39-t1'].filas[0][0],'1º');
  assert.equal(r.tablas['p39-t1'].filas[8][0],'2º');
  assert.equal(r.tablas['p39-t1'].diseno.combinaciones[0].filas,8);
  assert.equal(r.tablas['p40-t1'].diseno.filasCabecera,1);
  assert.ok(r.tablas['p40-t1'].diseno.estilos.some(e=>e.fila===0&&e.negrita));
  const bolsa=s=>{
    const m=new Map();for(const t of s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])m.set(t,(m.get(t)||0)+1);return m;
  };
  const original=bolsa((await extraerTexto(buffer,'original.pdf')).texto);
  // El original tiene 33 folios impresos en los márgenes, después del índice.
  for(let i=1;i<=33;i++)original.set(String(i),original.get(String(i))-1);
  const ordenar=m=>[...m].filter(([,n])=>n).sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(ordenar(bolsa(expandirTablas(r.texto,r.tablas))),ordenar(original));
  for(const usarIA of [false,true]) {
    const salida=await analizarDocumentoFragmentado(r.texto,{tablas:r.tablas,usarIA,presupuestoMs:0});
    validarProgramacion(salida.data);
    assert.equal(salida.meta.tablasOriginales,14);
    assert.equal(salida.data.secciones.at(-1).codigo,'9.1.2');
    const recuperado=salida.data.secciones.map(s=>`${s.codigo} ${s.titulo} ${s.bloques.map(b=>b.tipo==='tabla'?b.filas.flat().join(' '):b.texto).join(' ')}`).join(' ');
    const fuente=crearSeccionesFuente(r.texto).map(s=>`${s.codigo} ${s.titulo} ${expandirTablas(s.texto,r.tablas)}`).join(' ');
    assert.deepEqual(ordenar(bolsa(recuperado)),ordenar(bolsa(fuente)));
  }
});
