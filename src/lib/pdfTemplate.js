import { calcularDisenoTabla } from './tableLayout.js';
import { mapaCeldas } from './tablasOriginales.js';
export const escaparHTML = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const texto = (s) => escaparHTML(s).replace(/\n/g, '<br/>');
const titulo = (s) => `${s.codigo ? `${String(s.codigo).replace(/\.$/, '')}. ` : ''}${s.titulo || ''}`;
export function generateHTMLTemplate(data) {
  const { modulo = {}, secciones = [] } = data;
  const nivelBase = Math.min(...secciones.map((s) => Number(s.nivel) || 1), 8);
  const bloques = (lista = []) => lista.map((b) => {
    if (b.tipo === 'texto') return `<div class="parrafo">${texto(b.texto)}</div>`;
    if (b.tipo === 'lista') return `<ul>${(b.items || []).map((i) => `<li>${texto(i)}</li>`).join('')}</ul>`;
    if (b.tipo === 'tabla') {
      const d = calcularDisenoTabla(b);
      if(b.diseno?.origen==='pdf') {
        const {celdas,cubiertas,estilos}=mapaCeldas(b);
        const filas=(b.filas||[]).map((fila,f)=>`<tr${d.dividirFilas[f]?' class="fila-larga"':''}>${fila.map((valor,c)=>{
          const k=`${f}:${c}`;if(cubiertas.has(k))return '';
          const span=celdas.get(k)||{}, e=estilos.get(k)||{};
          return `<td colspan="${span.columnas||1}" rowspan="${span.filas||1}" style="${e.fondo?`background:#${e.fondo};`:''}${e.color?`color:#${e.color};`:''}${e.negrita?'font-weight:bold;':''}">${texto(valor)}</td>`;
        }).join('')}</tr>`);
        const cab=b.diseno.filasCabecera||0;
        return `<table class="tabla-original" style="font-size:${d.fuente}pt">${b.titulo?`<caption>${texto(b.titulo)}</caption>`:''}<colgroup>${d.anchos.map((a)=>`<col style="width:${a}%"/>`).join('')}</colgroup>${cab?`<thead>${filas.slice(0,cab).join('')}</thead>`:''}<tbody>${filas.slice(cab).join('')}</tbody></table>`;
      }
      return `<table style="font-size:${d.fuente}pt">${b.titulo ? `<caption>${texto(b.titulo)}</caption>` : ''}<colgroup>${d.anchos.map((a)=>`<col style="width:${a}%"/>`).join('')}</colgroup><thead><tr>${(b.columnas || []).map((c,i) => `<th scope="col" style="text-align:${d.centradas[i]?'center':'left'}">${texto(c)}</th>`).join('')}</tr></thead><tbody>${(b.filas || []).map((f,j) => `<tr${d.dividirFilas[j]?' class="fila-larga"':''}>${f.map((c,i) => `<td style="text-align:${d.centradas[i]?'center':'left'}">${texto(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return '';
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHTML(modulo.nombre || 'Programación didáctica')}</title><style>
    *{box-sizing:border-box}body{font:11pt/1.45 Arial,sans-serif;color:#172033;margin:0;overflow-wrap:anywhere}
    .portada{break-after:page;padding-top:45mm}.marca{font-size:10pt;letter-spacing:2px;text-transform:uppercase;color:#64748b}.portada h1{font-size:30pt;line-height:1.2;color:#19375a;margin:15mm 0 12mm}.portada dl{border-top:2px solid #19375a;padding-top:8mm}.portada dt{color:#64748b;font-size:9pt;margin-top:5mm}.portada dd{margin:1mm 0;font-size:12pt}
    .indice{break-after:page}.indice h2{font-size:20pt;color:#19375a}.indice a{display:block;color:#19375a;text-decoration:none;margin:3mm 0;font-size:10pt}
    h2,h3,h4,h5,h6{color:#19375a;break-after:avoid;margin:8mm 0 3mm;font-size:12pt}h2{font-size:16pt;border-bottom:1px solid #cbd5e1;padding-bottom:2mm}h3{font-size:14pt}.parrafo{margin:0 0 4mm;text-align:justify}li{margin-bottom:2mm}
    table{width:100%;border-collapse:collapse;margin:4mm 0 6mm;table-layout:fixed;line-height:1.3;color:#111}th,td{border:0.6pt solid #555;padding:1.6mm;vertical-align:top;overflow-wrap:anywhere}th{background:#dedede;color:#111;font-weight:bold}caption{background:#808080;color:#fff;font-weight:bold;padding:1.6mm;border:0.6pt solid #555;border-bottom:0;text-align:center;break-after:avoid}thead{display:table-header-group}tr{break-inside:avoid}tr.fila-larga{break-inside:auto}p{orphans:3;widows:3}
  </style></head><body>
    <section class="portada"><p class="marca">Programación didáctica</p><h1>${texto(modulo.nombre || 'Documento completo')}</h1><dl>
    ${[['Código',modulo.codigo],['Curso',modulo.curso],['Profesorado',modulo.profesor]].filter(([,v])=>v).map(([k,v])=>`<dt>${k}</dt><dd>${texto(v)}</dd>`).join('')}
    </dl></section>
    <nav class="indice" aria-label="Índice"><h2>Índice de contenidos</h2>${secciones.map((s,i)=>`<a href="#seccion-${i}" style="margin-left:${Math.min(Math.max((s.nivel || 1)-nivelBase,0),5)*5}mm">${escaparHTML(titulo(s))}</a>`).join('')}</nav>
    ${secciones.map((s,i)=>{const h=Math.min(Math.max((s.nivel || 1)-nivelBase+2,2),6);return `<section id="seccion-${i}"><h${h}>${escaparHTML(titulo(s))}</h${h}>${bloques(s.bloques)}</section>`;}).join('')}
  </body></html>`;
}
