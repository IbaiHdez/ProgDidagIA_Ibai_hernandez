import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectarApartados, crearSeccionesFuente, normalizarTexto, recortarApartado } from '../src/lib/estructura.js';
import { crearPlanFragmentos, fragmentarTexto, coberturaContenido, fusionarResultados } from '../src/lib/ai/fragmentar.js';
import { buildSystemPrompt, buildUserPrompt } from '../src/lib/ai/schema.js';
import { sanearRespuesta } from '../src/lib/ai/sanitize.js';
import { analizarDocumentoFragmentado } from '../src/lib/ai/index.js';
import { esperarAnalisis } from '../src/lib/analysisClient.js';
import { validarProgramacion, nombreDescarga } from '../src/lib/validacion.js';
import { generateHTMLTemplate } from '../src/lib/pdfTemplate.js';
import { extraerTexto } from '../src/lib/documento.js';

const muestra = `Portada del ciclo\n\n10.2. Desarrollo web\n10.2.1. Introducción\nTexto inicial.\n10.3.4. Metodología\nTexto del mismo módulo con numeración incorrecta.\n10.3.4.1. Estrategias\n1. El alumno trabaja con otras personas.\n0.75 serán redondeados.\n10.2.8. Criterios de\nevaluación.\nEvaluar resultados.\n10.3. Despliegue\n10.3.1. Introducción\nOtro módulo.\n`;

test('índice completo, título partido y decimal sin falso epígrafe', () => {
  const a = detectarApartados(muestra);
  assert.deepEqual(a.map((s) => s.codigo), ['10.2','10.2.1','10.3.4','10.3.4.1','10.2.8','10.3','10.3.1']);
  assert.equal(a[4].titulo, 'Criterios de evaluación.');
  const r = recortarApartado(muestra, a[0].id);
  assert.match(r.texto, /10\.3\.4\. Metodología/);
  assert.doesNotMatch(r.texto, /10\.3\. Despliegue/);
});

test('índice duplicado no reemplaza el contenido; códigos repetidos tienen identidad propia', () => {
  const t = '1.1. Tema\n1.2. Otro\n1.1. Tema\nContenido real A\n1.2. Otro\nContenido B\n1.1. Tema\nContenido real C';
  const a = detectarApartados(t);
  assert.equal(a.length, 3);
  assert.notEqual(a[0].id, a[2].id);
  assert.match(recortarApartado(t, a[2].id).texto, /Contenido real C/);
});

test('fragmentos acotados reconstruyen exactamente párrafos largos y tablas', () => {
  const t = muestra + 'Contenido sin saltos '.repeat(3000) + '\nA\tB\n' + 'dato\totro\n'.repeat(2000);
  const f = fragmentarTexto(t, 1000);
  assert.equal(f.join(''), t);
  assert.ok(f.every((v) => v.length <= 1000));
  const plan = crearPlanFragmentos(t, 1000);
  assert.ok(plan.fragmentos.every((f) => f.texto.length <= 1000));
  for (const s of plan.secciones) {
    const recuperado = plan.fragmentos.flatMap((f) => f.partes).filter((p) => p.sourceId === s.id).map((p) => p.texto).join('');
    assert.equal(recuperado, s.texto);
  }
});

test('fusión conserva continuaciones diferentes de un mismo apartado', () => {
  const s = { codigo: '1.1', titulo: 'Tabla', sourceId: 'a', bloques: [{ tipo: 'texto', texto: 'primera parte' }] };
  const r = fusionarResultados([{ modulo:{}, secciones:[s] }, { modulo:{}, secciones:[{ ...s, bloques:[{tipo:'texto',texto:'segunda parte'}] }] }]);
  assert.equal(r.secciones[0].bloques.length, 2);
});

test('prompts procesan todo y respetan la selección con numeración errónea', () => {
  assert.match(buildSystemPrompt(), /TODOS los módulos/);
  assert.doesNotMatch(buildUserPrompt('t'), /primero completo/);
  assert.match(buildUserPrompt('t', { moduleCode: '10.2' }), /10\.2/);
  assert.match(buildSystemPrompt({ moduleCode: '10.2' }), /ya está recortado por posición/);
});

test('saneado mantiene las celdas extra y admite tablas vacías', () => {
  const r = sanearRespuesta({modulo:{},secciones:[{codigo:'1.1',titulo:'T',bloques:[{tipo:'tabla',columnas:['A'],filas:[['1','2','3']]},{tipo:'tabla',columnas:[],filas:[]}]}]});
  assert.deepEqual(r.secciones[0].bloques[0].filas[0], ['1','2','3']);
  assert.equal(r.secciones[0].bloques[0].columnas.length, 3);
});

test('detector de pérdida rechaza resúmenes y tolera orden de celdas', () => {
  assert.equal(coberturaContenido('uno dos tres', [{tipo:'tabla',columnas:['tres'],filas:[['dos uno']]}]).conservacion, 1);
  assert.ok(coberturaContenido('uno dos tres', [{tipo:'texto',texto:'uno'}]).conservacion < 0.98);
});

test('conservación tolera maquetación de PDF y cabeceras generadas, sin bajar el umbral', () => {
  const original = 'Calificación\n• Aplica-\nciones: RA 1, 0,75 y 15%.\no \tCalificación RA3 -> 6';
  const bloques = [{tipo:'tabla',columnas:['Columna 1','Calificación'],filas:[['Aplicaciones: RA1, 0.75 y 15%.','Calificación RA3 -> 6']]}];
  assert.equal(coberturaContenido(original, bloques).valido, true);
  assert.equal(coberturaContenido('RA Nota\nRA1 5\nRA Nota\nRA2 6', [
    {tipo:'tabla',columnas:['RA','Nota'],filas:[['RA1','5'],['RA2','6']]},
  ]).valido, true);
});

test('conservación no permite suprimir repeticiones del cuerpo ni alterar cifras o porcentajes', () => {
  for (const [origen, salida] of [
    ['Actividad obligatoria. Actividad obligatoria.', 'Actividad obligatoria.'],
    ['El alumnado no podrá superar el 15%.', 'El alumnado podrá superar el 15%.'],
    ['0.75', '75.0'], ['15%', '15'], ['RA1.a Se evalúa el acceso.', 'RA1 Se evalúa el acceso.'],
  ]) assert.equal(coberturaContenido(origen,[{tipo:'texto',texto:salida}]).valido,false,origen);
  assert.equal(coberturaContenido('RA1 5',[{tipo:'tabla',columnas:['Inventada'],filas:[['RA1 5']]}]).valido,false);
});

test('plan corta entre fichas de aprendizaje antes que en el interior de sus tablas', () => {
  const ficha = (n) => `Situación de aprendizaje ${n}: Aplicaciones\n` + 'Celda de contenido '.repeat(22) + '\n';
  const texto = '10.2.5 Situaciones de aprendizaje\n' + ficha(1) + ficha(2) + ficha(3);
  const plan = crearPlanFragmentos(texto,1000);
  const partes = plan.fragmentos.flatMap((f)=>f.partes);
  assert.equal(partes.length,3);
  assert.ok(partes.every((p)=>p.texto.trimStart().startsWith('Situación de aprendizaje')));
  assert.equal(partes.map((p)=>p.texto).join(''),plan.secciones[0].texto);
});

test('fragmentación general: unidades de nombres diferentes, texto sin títulos y Unicode', () => {
  for (const rotulo of ['Actividad', 'Unidad didáctica', 'Tabla', 'Lesson', 'Capítulo']) {
    const fuente = Array.from({length:4},(_,i)=>`${rotulo} ${i+1}: Contenido\n${'Información con acentos y emoji 🧪 '.repeat(15)}\n`).join('');
    const plan=crearPlanFragmentos(fuente,1000);
    const partes=plan.fragmentos.flatMap((f)=>f.partes);
    assert.equal(partes.map((p)=>p.texto).join(''),fuente);
    assert.ok(plan.fragmentos.every((f)=>f.texto.length<=1000));
    assert.ok(partes.every((p)=>p.texto.startsWith(rotulo)));
  }
  const fuente='Texto sin encabezados 🧪 '.repeat(2000);
  const plan=crearPlanFragmentos(fuente,1000);
  assert.equal(plan.secciones.length,1);
  assert.equal(plan.fragmentos.flatMap((f)=>f.partes).map((p)=>p.texto).join(''),fuente);
});

test('tablas con cabeceras y sin filas no pierden su texto al sanear', () => {
  const r=sanearRespuesta({modulo:{},secciones:[{titulo:'Contenido',bloques:[{tipo:'tabla',titulo:'Evaluación',columnas:['Criterio','Peso'],filas:[]}]}]});
  assert.equal(r.secciones[0].bloques[0].tipo,'tabla');
  assert.equal(coberturaContenido('Evaluación Criterio Peso',r.secciones[0].bloques).valido,true);
});

test('cabeceras vacías no desplazan las celdas de una tabla', () => {
  const r = sanearRespuesta({modulo:{},secciones:[{titulo:'T',bloques:[{tipo:'tabla',columnas:['','Ponderación'],filas:[['RA1','20%']]}]}]});
  assert.deepEqual(r.secciones[0].bloques[0].columnas,['Columna 1','Ponderación']);
  assert.deepEqual(r.secciones[0].bloques[0].filas,[['RA1','20%']]);
});

test('fallo total de IA mantiene TODOS los apartados, incluido contenido inicial', async () => {
  const keys = [process.env.GEMINI_API_KEY,process.env.GROQ_API_KEY];
  delete process.env.GEMINI_API_KEY; delete process.env.GROQ_API_KEY;
  try {
    const {data,meta} = await analizarDocumentoFragmentado(muestra, { nombreDocumento:'Ciclo.pdf' });
    const source = crearSeccionesFuente(muestra);
    assert.deepEqual(data.secciones.map((s)=>s.codigo), source.map((s)=>s.codigo));
    assert.equal(data.modulo.nombre,'Ciclo');
    source.forEach((s,i) => assert.equal(data.secciones[i].textoOriginal,s.texto.trim()));
    source.forEach((s,i) => assert.equal(data.secciones[i].bloques.map((b)=>b.texto).join('\n'),s.texto.trim()));
    assert.ok(meta.avisos.length);
  } finally {
    if(keys[0]) process.env.GEMINI_API_KEY=keys[0]; if(keys[1]) process.env.GROQ_API_KEY=keys[1];
  }
});

test('presupuesto de IA agotado conserva todos los apartados en vez de descartar el análisis', async () => {
  const {data,meta}=await analizarDocumentoFragmentado(muestra,{presupuestoMs:0});
  assert.equal(meta.presupuestoAgotado,true);
  assert.equal(meta.avisos.length,1);
  assert.deepEqual(data.secciones.map((s)=>s.codigo),crearSeccionesFuente(muestra).map((s)=>s.codigo));
  assert.ok(data.secciones.filter((s)=>s.textoOriginal).every((s)=>s.bloques[0].texto===s.textoOriginal));
  const abort=new AbortController();abort.abort();
  await assert.rejects(analizarDocumentoFragmentado(muestra,{signal:abort.signal,presupuestoMs:0}),{name:'AbortError'});
});

test('errores del sondeo llegan al asistente, éxito conserva resultado y progreso', async () => {
  await assert.rejects(esperarAnalisis('x',{fetcher:async()=>({ok:true,json:async()=>({estado:'error',error:{message:'fallo controlado'}})})}), /fallo controlado/);
  await assert.rejects(esperarAnalisis('x',{fetcher:async()=>({ok:false,json:async()=>({error:'caducado'})})}), /caducado/);
  let n=0;const progresos=[];
  const r=await esperarAnalisis('x',{intervalo:1,onProgress:(p)=>progresos.push(p),fetcher:async()=>({ok:true,json:async()=>++n===1?{estado:'analizando',progreso:{completados:1}}:{estado:'listo',resultado:{ok:true}}})});
  assert.equal(r.resultado.ok,true);assert.equal(progresos.length,1);
  const abort=new AbortController();abort.abort();
  await assert.rejects(esperarAnalisis('x',{signal:abort.signal}), {name:'AbortError'});
});

test('validación de persistencia rechaza operadores y tablas descuadradas', () => {
  const d={modulo:{nombre:'Documento'},secciones:[{codigo:'1.1',titulo:'Título',bloques:[{tipo:'tabla',columnas:['A'],filas:[['uno']]}]}],$set:{admin:true}};
  assert.equal(validarProgramacion(d).$set,undefined);
  d.secciones[0].bloques[0].filas=[['uno','dos']];
  assert.throws(()=>validarProgramacion(d),/celdas/);
});

test('exportación escapa HTML y nombres de descarga', () => {
  const d={modulo:{nombre:'<script>alert(1)</script>'},secciones:[{codigo:'1',titulo:'<img src=x>',nivel:1,bloques:[{tipo:'texto',texto:'<script>alert(2)</script>'}]}]};
  const html=generateHTMLTemplate(d);
  assert.doesNotMatch(html,/<script>|<img /);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/Índice de contenidos/);
  assert.doesNotMatch(nombreDescarga({codigo:'a"\r\nb',nombre:'Prueba'},'pdf'),/["\r\n]/);
});

const rutaPdf = new URL('../PD_DAW_25-26_DWES.pdf', import.meta.url);
test('regresión PDF real: 23 títulos, selección exacta de DWES y continuidad completa', {skip:!fs.existsSync(rutaPdf)}, async () => {
  const {texto}=await extraerTexto(fs.readFileSync(rutaPdf),'PD_DAW_25-26_DWES.pdf');
  const a=detectarApartados(texto);
  assert.equal(a.length,23);
  assert.ok(a.some((s)=>s.codigo==='10.2.8' && s.titulo.endsWith('evaluación.')));
  assert.ok(!a.some((s)=>s.codigo==='0.75'));
  const dwes=recortarApartado(texto,'10.2');
  assert.equal(detectarApartados(dwes.texto).length,20);
  assert.doesNotMatch(dwes.texto,/10\.3\. Despliegue de aplicaciones web/);
  assert.match(dwes.texto,/10\.3\.7\.5/);
  const f=fragmentarTexto(texto,14000);
  assert.equal(f.join(''),texto);
  const plan=crearPlanFragmentos(texto);
  assert.equal(plan.secciones.length,24); // 23 títulos + contenido previo de otro módulo.
  for(const s of plan.secciones) assert.equal(plan.fragmentos.flatMap((f)=>f.partes).filter((p)=>p.sourceId===s.id).map((p)=>p.texto).join(''),s.texto);
  assert.equal(normalizarTexto(texto),texto);
});
