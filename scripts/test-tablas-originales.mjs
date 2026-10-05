import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {geometriaTablas,extraerPdfConTablas} from '../src/lib/pdfLayout.js';
import {extraerTexto} from '../src/lib/documento.js';
import {detectarApartados,recortarApartado} from '../src/lib/estructura.js';
import {validarTablasImportadas,validarProgramacion} from '../src/lib/validacion.js';
import {analizarDocumentoFragmentado} from '../src/lib/ai/index.js';
import {expandirTablas,separarTablas,mapaCeldas} from '../src/lib/tablasOriginales.js';
import {generateHTMLTemplate} from '../src/lib/pdfTemplate.js';
import {generateWordDocument} from '../src/lib/wordTemplate.js';
import {Packer} from 'docx';
import JSZip from 'jszip';

const bloque={tipo:'tabla',columnas:['Columna 1','Columna 2'],filas:[['Cabecera',''],['Una celda','Otra celda']],diseno:{origen:'pdf',pagina:1,anchosColumnas:[30,70],filasCabecera:1,combinaciones:[{fila:0,columna:0,filas:1,columnas:2}],estilos:[{fila:0,columna:0,fondo:'808080',color:'FFFFFF',negrita:true}]}};

test('geometría general detecta bordes trazados y rectángulos rellenos en una cuadrícula',async()=>{
  for(const modo of [OPS.fill,OPS.stroke]) {
    const segmentos=[[0,0,120,0],[0,30,120,30],[0,60,120,60],[0,0,0,60],[60,0,60,60],[120,0,120,60]];
    const ops={fnArray:[],argsArray:[]};
    for(const [x,y,x2,y2] of segmentos) {
      ops.fnArray.push(OPS.constructPath);
      ops.argsArray.push(modo===OPS.fill?[modo,[],[x,y,x2+(x===x2?0.4:0),y2+(y===y2?0.4:0)]]:[modo,[[0,x,y,1,x2,y2]],[x,y,x2,y2]]);
    }
    const {tablas}=await geometriaTablas({getOperatorList:async()=>ops,getViewport:()=>({transform:[1,0,0,1,0,0]})});
    assert.equal(tablas.length,1);
    assert.equal(tablas[0].cellCount,4);
  }
});

test('las tablas originales no se envían a IA ni se sustituyen por texto aunque no haya presupuesto',async()=>{
  const text='2.1 Tablas\n[[TABLA_PDF:p1-t1]]';
  const tablas=validarTablasImportadas({'p1-t1':bloque});
  for(const usarIA of [true,false]) {
    const r=await analizarDocumentoFragmentado(text,{tablas,usarIA,presupuestoMs:0});
    assert.deepEqual(r.data.secciones[0].bloques,[bloque]);
    assert.equal(r.meta.tablasOriginales,1);
    assert.equal(r.meta.avisos.length,0);
  }
  assert.throws(()=>separarTablas(text,{}),/Falta una tabla/);
});

test('la validación impide combinaciones que oculten texto y estilos inyectados',()=>{
  const a=structuredClone(bloque);a.filas[0][1]='No ocultar';
  assert.throws(()=>validarTablasImportadas({'p1-t1':a}),/ocultan contenido/);
  const b=structuredClone(bloque);b.diseno.estilos[0].fondo='red;background:url(x)';
  assert.throws(()=>validarTablasImportadas({'p1-t1':b}),/Estilo/);
  const c=structuredClone(bloque);c.diseno.combinaciones[0].columnas=20;
  assert.throws(()=>validarTablasImportadas({'p1-t1':c}),/fuera/);
});

test('el agotamiento de IA en texto conserva las tablas intercaladas y el orden entre apartados',async()=>{
  const text='2.1 Introducción\nTexto anterior.\n[[TABLA_PDF:p1-t1]]\nTexto posterior.\n2.2 Conclusiones\nCierre.';
  const r=await analizarDocumentoFragmentado(text,{tablas:{'p1-t1':bloque},usarIA:true,presupuestoMs:0});
  assert.equal(r.meta.presupuestoAgotado,true);
  assert.equal(r.data.secciones.length,2);
  assert.deepEqual(r.data.secciones[0].bloques,[{tipo:'texto',texto:'Texto anterior.'},bloque,{tipo:'texto',texto:'Texto posterior.'}]);
  assert.deepEqual(r.data.secciones[1].bloques,[{tipo:'texto',texto:'Cierre.'}]);
  assert.doesNotMatch(r.data.secciones[0].textoOriginal,/TABLA_PDF/);
});

test('PDF y Word conservan la cuadrícula original y no imprimen cabeceras inventadas',async()=>{
  const data=validarProgramacion({modulo:{nombre:'Tablas'},secciones:[{titulo:'Contenido',bloques:[bloque]}]});
  const html=generateHTMLTemplate(data);
  assert.match(html,/colspan="2"/);assert.match(html,/background:#808080/);
  assert.doesNotMatch(html,/Columna 1/);
  const zip=await JSZip.loadAsync(await Packer.toBuffer(generateWordDocument(data)));
  const xml=await zip.file('word/document.xml').async('string');
  assert.match(xml,/<w:gridSpan w:val="2"/);assert.match(xml,/w:fill="808080"/);
  assert.doesNotMatch(xml,/Columna 1/);
  assert.ok(mapaCeldas(bloque).cubiertas.has('0:1'));
});

const pdf=new URL('../PD_DAW_25-26_DWES.pdf',import.meta.url);
test('PDF real: 51 tablas, texto íntegro, 23 títulos y 25 tablas seleccionadas en situaciones', {skip:!fs.existsSync(pdf)},async()=>{
  const buffer=fs.readFileSync(pdf),r=await extraerPdfConTablas(buffer);
  assert.equal(Object.keys(r.tablas).length,51);
  assert.equal(detectarApartados(r.texto).length,23);
  const bolsa=(s)=>{
    const m=new Map();
    for(const t of s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[])m.set(t,(m.get(t)||0)+1);
    return [...m].sort(([a],[b])=>a.localeCompare(b));
  };
  assert.deepEqual(bolsa(expandirTablas(r.texto,r.tablas)),bolsa((await extraerTexto(buffer,'fuente.pdf')).texto));
  const tablas=validarTablasImportadas(r.tablas);
  const seleccion=recortarApartado(r.texto,'10.2.5');
  const salida=await analizarDocumentoFragmentado(seleccion.texto,{tablas,usarIA:false});
  validarProgramacion(salida.data);
  assert.equal(salida.meta.tablasOriginales,25);
  assert.deepEqual(salida.meta.avisos,[]);
  const tablasSalida=salida.data.secciones.flatMap((s)=>s.bloques).filter((b)=>b.tipo==='tabla');
  assert.ok(tablasSalida.some((b)=>b.columnas.length===11));
  assert.ok(tablasSalida.some((b)=>b.diseno.combinaciones.some((c)=>c.filas>1)));
});
