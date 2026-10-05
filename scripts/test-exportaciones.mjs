import test from 'node:test';
import assert from 'node:assert/strict';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { calcularDisenoTabla } from '../src/lib/tableLayout.js';
import { generateHTMLTemplate } from '../src/lib/pdfTemplate.js';
import { generateWordDocument } from '../src/lib/wordTemplate.js';
import { sanearRespuesta } from '../src/lib/ai/sanitize.js';
import { validarProgramacion } from '../src/lib/validacion.js';
import { coberturaContenido } from '../src/lib/ai/integridad.js';

const tabla = {tipo:'tabla',columnas:['EV','Situación de aprendizaje',...Array.from({length:9},(_,i)=>`RA${i+1}`)],filas:[
  ['1ª','Desarrollo de aplicaciones web en el entorno del servidor', 'X','','X','','','','','',''],
  ['2ª','Acceso a bases de datos y servicios web', '','','','X','','','','',''],
]};
const datos = (b) => ({modulo:{nombre:'Comprobación de tablas'},secciones:[{codigo:'10.2.5',titulo:'Situaciones',nivel:3,bloques:[b]}]});

test('matriz de RA conserva todas las columnas con más espacio para descripciones', () => {
  const d=calcularDisenoTabla(tabla);
  assert.equal(d.anchos.length,11);
  assert.ok(Math.abs(d.anchos.reduce((a,b)=>a+b,0)-100)<0.001);
  assert.ok(d.anchos[1]>d.anchos[2]*2);
  assert.deepEqual(d.dividirFilas,[false,false]);
  const html=generateHTMLTemplate(datos(tabla));
  assert.equal((html.match(/<col style=/g)||[]).length,11);
  assert.equal((html.match(/<td /g)||[]).length,22);
  assert.match(html,/<thead>/);
});

test('filas mayores que una página pueden continuar en PDF y Word sin recortar celdas', async () => {
  const b={tipo:'tabla',columnas:['Criterio','Descripción'],filas:[['RA1','Breve'],['RA2',Array(100).fill('Contenido largo del criterio.').join('\n')]]};
  assert.deepEqual(calcularDisenoTabla(b).dividirFilas,[false,true]);
  assert.match(generateHTMLTemplate(datos(b)),/<tr class="fila-larga">/);
  const zip=await JSZip.loadAsync(await Packer.toBuffer(generateWordDocument(datos(b))));
  const xml=await zip.file('word/document.xml').async('string');
  const filas=xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g);
  assert.equal(filas.length,3);
  assert.match(filas[0],/<w:tblHeader/);
  assert.match(filas[1],/<w:cantSplit\s*\/>/);
  assert.ok(!/<w:cantSplit\s*\/>/.test(filas[2]));
  assert.equal((xml.match(/Contenido largo del criterio\./g)||[]).length,100);
  assert.equal((xml.match(/<w:gridCol /g)||[]).length,2);
});

test('rótulos de tabla sobreviven a IA, guardado, PDF y Word como cabeceras combinadas', async () => {
  const b={tipo:'tabla',titulo:'Criterios de evaluación',columnas:['RA','Descripción'],filas:[['RA1','Aplicaciones']]};
  const d=validarProgramacion(sanearRespuesta(datos(b)));
  const guardada=d.secciones[0].bloques[0];
  assert.equal(guardada.titulo,b.titulo);
  assert.equal(coberturaContenido('Criterios de evaluación\nRA Descripción\nRA1 Aplicaciones',[guardada]).valido,true);
  assert.match(generateHTMLTemplate(d),/<caption>Criterios de evaluación<\/caption>/);
  const zip=await JSZip.loadAsync(await Packer.toBuffer(generateWordDocument(d)));
  const xml=await zip.file('word/document.xml').async('string');
  assert.match(xml,/<w:gridSpan w:val="2"\/>/);
  assert.match(xml,/Criterios de evaluación/);
});
