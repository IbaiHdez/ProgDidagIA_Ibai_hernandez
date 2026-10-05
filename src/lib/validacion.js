export class ValidationError extends Error { constructor(message) { super(message); this.status = 400; } }
export const idValido = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
export function validarProgramacion(data) {
  const esObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const texto = (v, campo, max = 500000) => {
    if (typeof v !== 'string' || v.length > max) throw new ValidationError(`El campo ${campo} debe ser texto (máximo ${max} caracteres).`);
    return v;
  };
  if (!esObjeto(data) || !esObjeto(data.modulo) || !Array.isArray(data.secciones)) throw new ValidationError('Se esperan datos del módulo y una lista de apartados.');
  if (JSON.stringify(data).length > 4_000_000) throw new ValidationError('La programación es demasiado grande.');
  if (!data.secciones.length || data.secciones.length > 5000) throw new ValidationError('La programación debe contener entre 1 y 5000 apartados.');
  const modulo = Object.fromEntries(['codigo','nombre','curso','profesor'].map((c) => [c, texto(data.modulo[c] ?? '', c, 1000)]));
  if (!modulo.nombre.trim()) throw new ValidationError('Escribe el nombre del módulo o documento.');
  const secciones = data.secciones.map((s, i) => {
    if (!esObjeto(s) || !Array.isArray(s.bloques)) throw new ValidationError(`El apartado ${i + 1} no es válido.`);
    const codigo = texto(s.codigo ?? '', 'código', 100), titulo = texto(s.titulo ?? '', 'título', 1000);
    if (!titulo.trim()) throw new ValidationError(`El apartado ${i + 1} necesita un título.`);
    const bloques = s.bloques.map((b) => {
      if (!esObjeto(b)) throw new ValidationError('Bloque inválido.');
      if (b.tipo === 'texto') return { tipo: 'texto', texto: texto(b.texto ?? '', 'contenido') };
      if (b.tipo === 'lista' && Array.isArray(b.items)) return { tipo: 'lista', items: b.items.map((v) => texto(v, 'elemento')) };
      if (b.tipo === 'tabla' && Array.isArray(b.columnas) && b.columnas.length && Array.isArray(b.filas)) {
        const columnas = b.columnas.map((v) => texto(v, 'columna'));
        const filas = b.filas.map((f) => {
          if (!Array.isArray(f) || f.length !== columnas.length) throw new ValidationError('Todas las filas deben tener tantas celdas como columnas.');
          return f.map((v) => texto(v, 'celda'));
        });
        return { tipo: 'tabla', columnas, filas, ...(b.titulo ? { titulo: texto(b.titulo, 'título de tabla', 1000) } : {}),
          ...(b.diseno ? {diseno:validarDisenoTabla(b.diseno,columnas,filas)} : {}) };
      }
      throw new ValidationError('El bloque debe ser texto, lista o tabla.');
    });
    return { codigo, titulo, nivel: codigo ? codigo.split('.').filter(Boolean).length : Math.max(1, Math.min(8, Number(s.nivel) || 1)), orden: i + 1, bloques,
      ...(typeof s.sourceId === 'string' ? { sourceId: s.sourceId.slice(0,100) } : {}),
      ...(typeof s.textoOriginal === 'string' ? { textoOriginal: texto(s.textoOriginal, 'texto original', 2000000) } : {}), revisar: Boolean(s.revisar) };
  });
  return { modulo, secciones };
}

export function validarDisenoTabla(d, columnas, filas) {
  const n=columnas.length, m=filas.length;
  if(d?.origen!=='pdf' || n>40 || m>2000 || !Array.isArray(d.anchosColumnas) || d.anchosColumnas.length!==n ||
    d.anchosColumnas.some((x)=>!Number.isFinite(x)||x<=0||x>100) || Math.abs(d.anchosColumnas.reduce((a,b)=>a+b,0)-100)>0.1) throw new ValidationError('Los anchos originales de la tabla no son válidos.');
  const entero=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  if(!entero(d.filasCabecera,0,m) || !Array.isArray(d.combinaciones) || !Array.isArray(d.estilos) || d.combinaciones.length>m*n || d.estilos.length>m*n) throw new ValidationError('Diseño de tabla inválido.');
  const ocupadas=new Set();
  const combinaciones=d.combinaciones.map((c)=>{
    if(!entero(c.fila,0,m-1)||!entero(c.columna,0,n-1)||!entero(c.filas,1,m-c.fila)||!entero(c.columnas,1,n-c.columna)) throw new ValidationError('Combinación de celdas fuera de la tabla.');
    if(c.fila<d.filasCabecera && c.fila+c.filas>d.filasCabecera) throw new ValidationError('Una celda combinada atraviesa el límite de cabecera.');
    for(let f=c.fila;f<c.fila+c.filas;f++) for(let col=c.columna;col<c.columna+c.columnas;col++) {
      const k=`${f}:${col}`;
      if(ocupadas.has(k) || (f!==c.fila||col!==c.columna)&&filas[f][col].trim()) throw new ValidationError('Las celdas combinadas se solapan u ocultan contenido.');
      ocupadas.add(k);
    }
    return {fila:c.fila,columna:c.columna,filas:c.filas,columnas:c.columnas};
  });
  const estilos=d.estilos.map((e)=>{
    if(!entero(e.fila,0,m-1)||!entero(e.columna,0,n-1)||[e.fondo,e.color].some((c)=>c!==undefined&&!/^[a-f\d]{6}$/i.test(c))) throw new ValidationError('Estilo de celda inválido.');
    return {fila:e.fila,columna:e.columna,negrita:Boolean(e.negrita),...(e.fondo?{fondo:e.fondo}:{}),...(e.color?{color:e.color}:{})};
  });
  return {origen:'pdf',pagina:entero(d.pagina,1,10000)?d.pagina:1,anchosColumnas:[...d.anchosColumnas],filasCabecera:d.filasCabecera,combinaciones,estilos};
}

export function validarTablasImportadas(tablas = {}) {
  if(!tablas || typeof tablas!=='object' || Array.isArray(tablas) || Object.keys(tablas).length>500) throw new ValidationError('Listado de tablas inválido.');
  const ids=Object.keys(tablas);
  if(ids.some((id)=>!/^p\d+-t\d+$/.test(id))) throw new ValidationError('Identificador de tabla inválido.');
  if(!ids.length) return {};
  const datos=validarProgramacion({modulo:{nombre:'Importación'},secciones:[{titulo:'Tablas',bloques:ids.map((id)=>tablas[id])}]});
  if(datos.secciones[0].bloques.some((b)=>b.tipo!=='tabla'||b.diseno?.origen!=='pdf')) throw new ValidationError('Se esperaban tablas del PDF.');
  return Object.fromEntries(ids.map((id,i)=>[id,datos.secciones[0].bloques[i]]));
}

export function nombreDescarga(modulo, extension) {
  const base = [modulo?.codigo, modulo?.nombre || 'programacion'].filter(Boolean).join('_')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 140);
  return `${base || 'programacion'}.${extension}`;
}
