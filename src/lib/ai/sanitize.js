import { TIPOS_BLOQUE } from './schema';

/**
 * Saneado y normalización de la respuesta de la IA.
 *
 * Ningún proveedor garantiza que un JSON "válido" lo sea *útil*: los modelos
 * pueden devolver niveles como `"2"`, filas de tabla con menos celdas que
 * columnas, o secciones sin bloques. Aquí dejamos siempre una estructura
 * coherente con lo que espera el editor del frontend.
 */

const comoTexto = (valor) => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) return valor.map(comoTexto).join('\n');
  if (typeof valor === 'object') {
    return Object.values(valor).map(comoTexto).join('\n');
  }
  return String(valor);
};

const comoEntero = (valor, porDefecto = 0) => {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
};

function sanearBloque(bloque) {
  const tipoCrudo = comoTexto(bloque?.tipo).trim().toLowerCase();
  let tipo = TIPOS_BLOQUE.includes(tipoCrudo) ? tipoCrudo : null;

  if (!tipo) {
    // Inferimos el tipo por la forma de los datos si el modelo no lo concreta.
    if (Array.isArray(bloque?.filas) || Array.isArray(bloque?.columnas)) tipo = 'tabla';
    else if (Array.isArray(bloque?.items)) tipo = 'lista';
    else tipo = 'texto';
  }

  if (tipo === 'tabla') {
    const columnas = (Array.isArray(bloque?.columnas) ? bloque.columnas : [])
      .map((c) => comoTexto(c).trim())
      .filter(Boolean);

    const filas = (Array.isArray(bloque?.filas) ? bloque.filas : [])
      .filter(Array.isArray)
      .map((fila) => {
        const celdas = fila.map((celda) => comoTexto(celda));
        // Rellenamos o recortamos para que todas las filas cuadren con las columnas.
        while (celdas.length < columnas.length) celdas.push('');
        return celdas.slice(0, Math.max(columnas.length, celdas.length));
      });

    // Sin cabeceras pero con datos: generamos cabeceras genéricas.
    const columnasFinales = columnas.length > 0
      ? columnas
      : (filas[0]?.length || 1) > 0
        ? Array.from({ length: filas[0].length }, (_, i) => `Columna ${i + 1}`)
        : ['Contenido'];

    return {
      tipo: 'tabla',
      columnas: columnasFinales,
      filas: filas.map((fila) => {
        const celdas = [...fila];
        while (celdas.length < columnasFinales.length) celdas.push('');
        return celdas.slice(0, columnasFinales.length);
      }),
    };
  }

  if (tipo === 'lista') {
    // Un item puede venir como array (el modelo metió, por ejemplo, la matriz de una
    // tabla dentro de `items`), por eso `comoTexto` aplana cada elemento en lugar
    // de romper la respuesta.
    const items = (Array.isArray(bloque?.items) ? bloque.items : [])
      .map((item) => comoTexto(item).trim())
      .filter(Boolean);
    return { tipo: 'lista', items };
  }

  return { tipo: 'texto', texto: comoTexto(bloque?.texto).trim() };
}

function sanearSeccion(seccion, indice, total) {
  const codigo = comoTexto(seccion?.codigo).trim();
  const titulo = comoTexto(seccion?.titulo).trim();

  // El nivel jerárquico sale de los puntos del código (9.4.1 -> 3). Si el modelo se
  // contradice con la numeración, la numeración manda: es la jerarquía que pide el
  // enunciado para agrupar aunque los epígrafes cambien entre documentos.
  const nivelPorCodigo = codigo.split('.').filter((p) => p !== '').length;
  const nivel = nivelPorCodigo || comoEntero(seccion?.nivel, 1) || 1;

  const bloques = (Array.isArray(seccion?.bloques) ? seccion.bloques : [])
    .map(sanearBloque)
    .filter((b) => b.texto || b.items?.length || b.filas?.length);

  return {
    codigo,
    titulo: titulo || `Sección ${indice + 1}`,
    nivel,
    orden: comoEntero(seccion?.orden, indice + 1) || indice + 1,
    bloques: bloques.length > 0 ? bloques : [{ tipo: 'texto', texto: '' }],
  };
}

function sanearModulo(modulo) {
  return {
    codigo: comoTexto(modulo?.codigo).trim(),
    nombre: comoTexto(modulo?.nombre).trim(),
    curso: comoTexto(modulo?.curso).trim(),
    profesor: comoTexto(modulo?.profesor).trim(),
  };
}

/**
 * La aplicación solo admite `{ modulo, secciones }`. Cuando el modelo devuelve un
 * array en la raíz (habitual cuando se le pide JSON sin esquema estricto), se
 * intentamos encajar en esa forma DESPUÉS de comprobar que los elementos son
 * realmente secciones. No se convierte a ciegas: si no encajan, se falla.
 *
 * @returns {{ payload: object, avisos: string[] }}
 */
function envolverRaizArray(array) {
  const comoTexto = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));

  const pareceSeccion = (item) =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    ('codigo' in item || 'titulo' in item || 'bloques' in item);

  const avisos = ['La IA devolvió un array en la raíz; se ha adaptado al formato { modulo, secciones }.'];

  // Caso A: el array es la lista de secciones.
  if (array.every(pareceSeccion)) {
    return { payload: { modulo: {}, secciones: array }, avisos };
  }

  // Caso B: el array envuelve el objeto completo, p. ej. [{ modulo, secciones }].
  if (array.length === 1 && array[0] && typeof array[0] === 'object' && !Array.isArray(array[0])) {
    const interior = array[0];
    if (Array.isArray(interior.secciones)) {
      avisos.push('La IA envolvió la respuesta en un array de un solo elemento.');
      return { payload: interior, avisos };
    }
  }

  // Caso C: mixes de [modulo, secciones] u objetos parciales que se pueden unir.
  const conSecciones = array.filter((i) => Array.isArray(i?.secciones));
  if (conSecciones.length > 0) {
    const secciones = conSecciones.flatMap((i) => i.secciones);
    const modulo = array.find((i) => i?.modulo && typeof i.modulo === 'object')?.modulo || {};
    avisos.push('La IA devolvió varios objetos JSON; se han unido en una única programación.');
    return { payload: { modulo, secciones }, avisos };
  }

  throw new Error(
    'La IA devolvió un array en la raíz que no se puede convertir en { modulo, secciones }. ' +
    `Primer elemento: ${comoTexto(array[0]).slice(0, 120)}`
  );
}

/**
 * Valida y normaliza el objeto devuelto por la IA a la estructura interna única.
 * @returns {{ modulo: object, secciones: object[] }}
 * @throws {Error} si la forma no se puede llevar a `{ modulo, secciones }`.
 */
export function sanearRespuesta(payload) {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    throw new Error('La IA no devolvió un objeto JSON.');
  }

  let datos = payload;
  let avisos = [];

  if (Array.isArray(payload)) {
    const envuelto = envolverRaizArray(payload);
    datos = envuelto.payload;
    avisos = envuelto.avisos;
  }

  if (!datos.modulo || !Array.isArray(datos.secciones)) {
    throw new Error('Estructura inválida devuelta por la IA (faltan "modulo" o "secciones").');
  }

  const secciones = datos.secciones
    .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
    .map(sanearSeccion);

  if (secciones.length === 0) {
    throw new Error('La IA no detectó ninguna sección en el documento.');
  }

  const resultado = {
    modulo: sanearModulo(datos.modulo),
    secciones,
  };

  if (avisos.length > 0) resultado._avisos = avisos;

  return resultado;
}

/**
 * Extrae el JSON de una respuesta que puede venir envuelto en ```json ... ```,
 * acompañada de texto, o empezar por un array en lugar de un objeto.
 *
 * Se usa una pila porque el resultado puede ser un objeto `{...}` o un array
 * `[...]`, y dentro puede haber llaves o corchetes anidados. Antes solo se
 * balanceaban las llaves, así que un array de secciones se truncaba a su primer
 * elemento y la validación fallaba con "faltan modulo o secciones".
 */
export function extraerJson(texto) {
  if (typeof texto !== 'string' || !texto.trim()) {
    throw new Error('La IA devolvió una respuesta vacía.');
  }

  let limpio = texto.trim();

  const valla = limpio.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (valla) limpio = valla[1].trim();

  // Primer `{` o `[` del texto: lo que haya ahí es lo que hay que balancear.
  const inicio = limpio.search(/[[{]/);
  if (inicio === -1) {
    throw new Error('No se encontró ningún JSON válido (ni objeto ni array) en la respuesta de la IA.');
  }

  const pila = [];
  let enCadena = false;
  let escapado = false;

  for (let i = inicio; i < limpio.length; i++) {
    const char = limpio[i];

    if (escapado) { escapado = false; continue; }
    if (char === '\\') { escapado = true; continue; }
    if (char === '"') { enCadena = !enCadena; continue; }
    if (enCadena) continue;

    if (char === '{' || char === '[') {
      pila.push(char === '{' ? '}' : ']');
      continue;
    }

    if (char === '}' || char === ']') {
      if (pila.at(-1) === char) {
        pila.pop();
        if (pila.length === 0) return limpio.slice(inicio, i + 1);
      }
      // Si no corresponde, venia ruido: se ignora el carácter.
    }
  }

  // Sin cierre balanceado: puede ser JSON truncado. Se devuelve lo que hay para
  // que JSON.parse falle con un error descriptivo en vez de un fallo genérico.
  return limpio.slice(inicio);
}