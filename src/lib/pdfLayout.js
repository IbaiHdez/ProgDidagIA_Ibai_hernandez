import { PDFParse, LineStore, Line, Point } from 'pdf-parse';
import { OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizarTexto } from './estructura.js';

const identidad = () => [1, 0, 0, 1, 0, 0];
const transformar = ([x,y], m) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const contiene = (r, x, y) => x >= r.minXY.x - 0.3 && x <= r.maxXY.x + 0.3 && y >= r.minXY.y - 0.3 && y <= r.maxXY.y + 0.3;
const unicos = (valores) => valores.sort((a,b)=>a-b).filter((v,i,a)=>!i || v-a[i-1]>1);
const indice = (valores, v) => valores.findIndex((x)=>Math.abs(x-v)<1.1);
function unirItems(items) {
  let texto='', previo;
  for(const it of items) {
    if(!it.str) continue;
    if(previo && !/\s$/.test(texto) && !/^\s/.test(it.str)) {
      if(Math.abs(it.y-previo.y)>Math.max(2,Math.min(it.height,previo.height)*0.6)) texto+='\n';
      else if(it.x-previo.x-previo.width>2) texto+=' ';
    }
    texto+=it.str+(it.hasEOL?'\n':''); previo=it;
  }
  return texto;
}

/** Bordes trazados y bordes dibujados como rectángulos rellenos. Nunca usa
 * nombres de asignaturas, códigos de apartados ni plantillas de contenido. */
export async function geometriaTablas(page) {
  const ops = await page.getOperatorList(), viewport = page.getViewport({ scale: 1 });
  const store = new LineStore(), fondos = [], pila = [];
  let matriz = identidad(), color = '#000000';
  const punto = (x,y) => transformar(transformar([x,y], matriz), viewport.transform);
  const linea = (x,y,x2,y2) => {
    const a=punto(x,y), b=punto(x2,y2);
    if (Math.min(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1])) > 0.5) return;
    store.add(new Line(new Point(...a),new Point(...b)));
  };
  for (let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i], a=ops.argsArray[i];
    if (op===OPS.save) pila.push({ matriz:[...matriz], color });
    else if (op===OPS.restore) { const prev=pila.pop(); if(prev) { matriz=prev.matriz; color=prev.color; } }
    else if (op===OPS.transform) matriz=Util.transform(matriz,a);
    else if (op===OPS.setFillRGBColor && /^#[a-f\d]{6}$/i.test(a?.[0])) color=a[0];
    else if (op===OPS.constructPath) {
      const modo=a[0], b=a[2]; if (!b || !Number.isFinite(b[0])) continue;
      const relleno=[OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke].includes(modo);
      if (relleno) {
        const w=b[2]-b[0], h=b[3]-b[1];
        if (w>5 && h<=2) linea(b[0],(b[1]+b[3])/2,b[2],(b[1]+b[3])/2);
        else if (h>5 && w<=2) linea((b[0]+b[2])/2,b[1],(b[0]+b[2])/2,b[3]);
        else if (w>5 && h>5) {
          const p=punto(b[0],b[1]),q=punto(b[2],b[3]);
          fondos.push({minXY:{x:Math.min(p[0],q[0]),y:Math.min(p[1],q[1])},maxXY:{x:Math.max(p[0],q[0]),y:Math.max(p[1],q[1])},color});
        }
      }
      if ([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke].includes(modo)) {
        for (const path of a[1] || []) {
          let x,y,sx,sy;
          for(let j=0;j<path.length;) {
            const c=path[j++];
            if(c===0) {x=sx=path[j++];y=sy=path[j++];}
            else if(c===1) {const nx=path[j++],ny=path[j++];linea(x,y,nx,ny);x=nx;y=ny;}
            else if(c===2) {x=path[j+4];y=path[j+5];j+=6;}
            else if(c===3) linea(x,y,sx,sy);
            else break;
          }
        }
      }
    }
  }
  store.normalize();
  return { tablas:store.getTableData().filter((t)=>t.check() && t.cellCount>=2 && t.rowCount<=1000), fondos };
}

function construirTabla(t, items, fondos, pagina) {
  const celdas=t.rows.flat();
  const xs=unicos(celdas.flatMap((c)=>[c.minXY.x,c.maxXY.x]));
  const ys=unicos(celdas.flatMap((c)=>[c.minXY.y,c.maxXY.y]));
  if(xs.length<2 || xs.length>41 || ys.length<2) return null;
  const filas=Array.from({length:ys.length-1},()=>Array(xs.length-1).fill(''));
  const combinaciones=[], estilos=[], usados=new Set();
  for(const c of celdas) {
    const f=indice(ys,c.minXY.y), col=indice(xs,c.minXY.x), hastaF=indice(ys,c.maxXY.y), hastaC=indice(xs,c.maxXY.x);
    if(f<0 || col<0 || hastaF<=f || hastaC<=col) return null;
    const dentro=items.filter((it)=>!usados.has(it.i) && contiene(c,it.x,it.y));
    for(const it of dentro) usados.add(it.i);
    filas[f][col]=unirItems(dentro).trim();
    if(hastaF-f>1 || hastaC-col>1) combinaciones.push({fila:f,columna:col,filas:hastaF-f,columnas:hastaC-col});
    const centro=[(c.minXY.x+c.maxXY.x)/2,(c.minXY.y+c.maxXY.y)/2];
    const fondo=fondos.filter((r)=>contiene(r,...centro)).at(-1)?.color;
    const negrita=dentro.some((it)=>it.bold) && dentro.filter((it)=>it.bold).map((it)=>it.str).join('').length > dentro.map((it)=>it.str).join('').length*0.6;
    if(fondo && fondo!=='#ffffff' || negrita) {
      const rgb=fondo?.slice(1).match(/../g)?.map((n)=>parseInt(n,16));
      estilos.push({fila:f,columna:col,...(fondo?{fondo:fondo.slice(1),color:rgb.reduce((a,b)=>a+b,0)<420?'FFFFFF':'111111'}:{}),negrita});
    }
  }
  // Si queda texto dentro del contorno que no cabe en ninguna celda, no ocultarlo.
  if(items.some((it)=>it.str.trim() && contiene(t,it.x,it.y) && !usados.has(it.i))) return null;
  if(!filas.flat().some((s)=>s.trim())) return null;
  const ancho=xs.at(-1)-xs[0];
  const anchosColumnas=xs.slice(1).map((x,i)=>(x-xs[i])/ancho*100);
  let filasCabecera=0;
  while(filasCabecera<Math.min(filas.length,3)) {
    const r=filasCabecera;
    const ocupadas=filas[r].map((s,c)=>({s,c})).filter(({s})=>s.trim());
    if(!ocupadas.length || ys[r+1]-ys[r]>50 || !ocupadas.every(({c})=>estilos.some((e)=>e.fila===r&&e.columna===c&&(e.negrita||e.fondo)))) break;
    filasCabecera++;
  }
  // Una cabecera con rowspan debe repetirse como unidad completa.
  for(const c of combinaciones) if(c.fila<filasCabecera) filasCabecera=Math.max(filasCabecera,c.fila+c.filas);
  return { usados, y:t.minXY.y, bloque:{tipo:'tabla',columnas:anchosColumnas.map((_,i)=>`Columna ${i+1}`),filas,
    diseno:{origen:'pdf',pagina,anchosColumnas,combinaciones,estilos,filasCabecera}} };
}

/** Adaptador probado con pdf-parse 2.4.5 / PDF.js 5.4.296 (versiones fijadas).
 * El cargador de pdf-parse configura las dependencias de PDF.js en Node. */
export async function extraerPdfConTablas(buffer) {
  const parser=new PDFParse({data:buffer});
  try {
    const doc=await parser.load();
    const paginas=[], tablas={}, avisos=[];
    for(let numero=1;numero<=doc.numPages;numero++) {
      const page=await doc.getPage(numero), vp=page.getViewport({scale:1});
      const contenido=await page.getTextContent();
      const items=contenido.items.filter((it)=>typeof it.str==='string').map((it,i)=>{
        const [x,y]=transformar([it.transform[4],it.transform[5]],vp.transform);
        return {...it,i,x:x+Math.min(it.width/2,1),y:y-Math.min(it.height/2,2),bold:/bold|black|demi/i.test(contenido.styles[it.fontName]?.fontFamily||it.fontName)};
      });
      let detectadas=[];
      try { const geo=await geometriaTablas(page); detectadas=geo.tablas.map((t)=>construirTabla(t,items,geo.fondos,numero)).filter(Boolean); }
      catch { avisos.push(`Página ${numero}: no se pudo comprobar la geometría de las tablas; se conserva su texto.`); }
      const propietarios=new Map(), primeras=new Map();
      detectadas.sort((a,b)=>a.y-b.y).forEach((t,j)=>{
        if([...t.usados].some((i)=>propietarios.has(i))) return;
        const id=`p${numero}-t${j+1}`;tablas[id]=t.bloque;
        for(const i of t.usados) propietarios.set(i,id);
        primeras.set(Math.min(...t.usados),id);
      });
      let texto='';
      for(const it of items) {
        if(primeras.has(it.i)) texto+=`\n\n[[TABLA_PDF:${primeras.get(it.i)}]]\n\n`;
        if(!propietarios.has(it.i)) texto+=it.str+(it.hasEOL?'\n':'');
      }
      paginas.push(texto);
      page.cleanup();
    }
    const iniciales=paginas.map((p)=>p.trim().match(/^(\d{1,5})\s*\n/)?.[1]);
    const consecutivos=iniciales.slice(1).filter((n,i)=>n&&iniciales[i]&&Number(n)===Number(iniciales[i])+1).length;
    const paginacion=paginas.length>1&&consecutivos>=(paginas.length-1)*0.7;
    return {texto:normalizarTexto(paginas.map((p)=>paginacion?p.replace(/^\s*\d{1,5}\s*\n/,''):p).join('\n\n')),tablas,avisos,formato:'pdf'};
  } finally {await parser.destroy();}
}
