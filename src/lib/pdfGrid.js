/** Reconstruye una cuadrícula aunque un borde exterior esté parcialmente abierto.
 * Solo une casillas cuando falta su separador; rechaza uniones no rectangulares. */
export function reconstruirCuadricula(tabla, bordesVerticales = []) {
  const hs=tabla.hLines, vs=tabla.vLines;
  if(hs.length<2 || vs.length<2) return null;
  const xs=[...tabla.colPivots], ys=tabla.rowPivots;
  const izquierda=Math.min(...hs.map(l=>l.from.x)), derecha=Math.max(...hs.map(l=>l.to.x));
  if(xs[0]-izquierda>2) xs.unshift(izquierda);
  if(derecha-xs.at(-1)>2) xs.push(derecha);
  const n=xs.length-1,m=ys.length-1;
  if(n<1||n>40||m<1||m>1000) return null;
  const padres=Array.from({length:n*m},(_,i)=>i);
  const raiz=(i)=>{while(padres[i]!==i){padres[i]=padres[padres[i]];i=padres[i];}return i;};
  const unir=(a,b)=>{padres[raiz(a)]=raiz(b);};
  const cubre=(lineas,pos,medio,vertical)=>lineas.some(l=>{
    const eje=vertical?'x':'y', largo=vertical?'y':'x';
    return Math.abs(l.from[eje]-pos)<1.5 && l.from[largo]<=medio+0.5 && l.to[largo]>=medio-0.5 &&
      !l.gaps.some(g=>g.from[largo]<medio-0.5 && g.to[largo]>medio+0.5);
  });
  // En columnas con el borde exterior interrumpido, el comienzo de un nuevo
  // tramo alineado con una fila aporta el límite de un nuevo grupo de filas.
  const comienzaGrupo=(c,y)=>c===0 && bordesVerticales.some(l=>Math.abs(l.from.x-xs[0])<1.5 && Math.abs(l.from.y-y)<1.5);
  for(let f=0;f<m;f++) for(let c=0;c<n;c++) {
    if(c+1<n&&!cubre(vs,xs[c+1],(ys[f]+ys[f+1])/2,true)) unir(f*n+c,f*n+c+1);
    if(f+1<m&&!cubre(hs,ys[f+1],(xs[c]+xs[c+1])/2,false)&&!comienzaGrupo(c,ys[f+1])) unir(f*n+c,(f+1)*n+c);
  }
  const grupos=new Map();
  for(let f=0;f<m;f++) for(let c=0;c<n;c++) {
    const key=raiz(f*n+c);if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push([f,c]);
  }
  const rows=Array.from({length:m},()=>[]);
  for(const casillas of grupos.values()) {
    const f=Math.min(...casillas.map(p=>p[0])),c=Math.min(...casillas.map(p=>p[1]));
    const f2=Math.max(...casillas.map(p=>p[0]))+1,c2=Math.max(...casillas.map(p=>p[1]))+1;
    if((f2-f)*(c2-c)!==casillas.length) return null;
    rows[f].push({minXY:{x:xs[c],y:ys[f]},maxXY:{x:xs[c2],y:ys[f2]}});
  }
  if(grupos.size<2)return null;
  for(const row of rows)row.sort((a,b)=>a.minXY.x-b.minXY.x);
  return {rows,minXY:{x:xs[0],y:ys[0]},maxXY:{x:xs.at(-1),y:ys.at(-1)},cellCount:grupos.size,rowCount:m};
}
