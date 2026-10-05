/**
 * Tests de la capa de IA con las APIs simuladas (no consumen cuota ni necesitan
 * claves reales). Ejecutar con:  npm test
 *
 * Las variables de entorno se fijan aquí para poder ejercitar la cascada sin
 * tocar tu .env.local.
 */
process.env.GROQ_API_KEY = 'groq-test';
process.env.GEMINI_API_KEY = 'gemini-test';
process.env.AI_PROVIDER_ORDER = 'gemini,groq';
process.env.GEMINI_MODELS = 'gemini-3.8-flash,gemini-3.5-flash-lite';
process.env.GROQ_MODELS = 'openai/gpt-oss-120b,openai/gpt-oss-20b';
process.env.AI_MAX_ATTEMPTS = '2';
process.env.AI_ERROR_COOLDOWN_MS = '10';
process.env.AI_MAX_BACKOFF_MS = '20';

import test from 'node:test';
import assert from 'node:assert/strict';

const { analizarDocumento, analizarDocumentoFragmentado, construirCandidatos, estadoProveedores } =
  await import('../src/lib/ai/index.js');
const { resetCircuitos } = await import('../src/lib/ai/circuitBreaker.js');
const { extraerJson, sanearRespuesta } = await import('../src/lib/ai/sanitize.js');
const { toGeminiSchema, aStrictGroqSchema, groqSchema, programacionSchema, bloqueVariantes } =
  await import('../src/lib/ai/schema.js');
const { isModelUnavailableError, toProviderError } = await import('../src/lib/ai/errors.js');
const { normalizarTexto, detectarModulos, recortarModulo } = await import('../src/lib/documento.js');
const { fragmentarTexto, fusionarResultados } = await import('../src/lib/ai/fragmentar.js');

// -------------------------------------------------------------- Datos de prueba

const SECCIONES = [
  { codigo: '10.2.1', titulo: 'Introducción', nivel: 3, orden: 1, bloques: [{ tipo: 'texto', texto: 'Contenido' }] },
  {
    codigo: '10.2.2', titulo: 'Resultados', nivel: 3, orden: 2,
    bloques: [{ tipo: 'tabla', columnas: ['RA', 'EA'], filas: [['RA1', 'EA-1']] }],
  },
];

const JSON_VALIDO = {
  modulo: { codigo: '0613', nombre: 'Desarrollo Web en Entorno Servidor', curso: '2º', profesor: 'Ibai' },
  secciones: SECCIONES,
};

// ------------------------------------------------------------------- Dobles de API

const okGroq = (contenido = JSON.stringify(JSON_VALIDO)) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: contenido }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }),
});

const errorGroq = (status, mensaje) => ({
  ok: false,
  status,
  text: async () => JSON.stringify({ error: { message: mensaje } }),
});

const okGemini = (contenido = JSON.stringify(JSON_VALIDO)) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({
    candidates: [{ content: { role: 'model', parts: [{ text: contenido }] }, finishReason: 'STOP' }],
    usageMetadata: { totalTokenCount: 42 },
    modelVersion: 'gemini-3.8-flash',
  }),
  text: async () => '{}',
});

const errorGemini = (status, mensaje) => ({
  ok: false,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ error: { code: status, message: mensaje, status: 'UNAVAILABLE' } }),
  text: async () => JSON.stringify({ error: { message: mensaje } }),
});

const esGeminiUrl = (url) => String(url).includes('generativelanguage');

/** Sustituye fetch por un doble que responde según proveedor y modelo. */
function mockFetch(responder) {
  const llamadas = [];
  let n = 0;

  globalThis.fetch = async (url, opts) => {
    n++;
    const gemini = esGeminiUrl(url);
    const body = opts?.body ? safeJson(opts.body) : null;
    const modelo = gemini ? modeloDeUrl(url) : body?.model;
    llamadas.push(`${gemini ? 'gemini' : 'groq'}:${modelo}`);

    const r = responder({ url: String(url), body, n, gemini, modelo });
    return r;
  };

  return llamadas;
}

function safeJson(texto) {
  try { return JSON.parse(texto); } catch { return null; }
}

function modeloDeUrl(url) {
  return String(url).split('/models/')[1]?.split(':')[0] || 'desconocido';
}

/** Fuerza la cascada a un solo proveedor (la config se relee en cada llamada). */
function soloProveedor(id) {
  process.env.AI_PROVIDER_ORDER = id;
  resetCircuitos();
}

/** Vuelve a la cascada completa por defecto. */
function cascadaCompleta() {
  process.env.AI_PROVIDER_ORDER = 'gemini,groq';
  resetCircuitos();
}

/**
 * Responde con un modelo simulado de Gemini:
 * llama a `manejador({ modelo, cuerpo })` y espera un string de respuesta.
 */
function geminiSimulado(manejador) {
  return async ({ gemini, modelo, url, body }) => {
    if (!gemini) return { ok: false, status: 400, text: async () => 'no es una llamada a Gemini' };
    const texto = await manejador({ modelo, cuerpo: body, url });
    if (texto === null) return errorGemini(503, 'Service Unavailable: high demand');
    return okGemini(texto);
  };
}

// ------------------------------------------------------------------ Configuración

test('la cascada por defecto es Gemini 3.8 -> 3.5 Lite -> Groq 120B -> 20B', () => {
  cascadaCompleta();
  const candidatos = construirCandidatos();

  assert.deepEqual(
    candidatos.map((c) => `${c.id}/${c.model}`),
    [
      'gemini/gemini-3.8-flash',
      'gemini/gemini-3.5-flash-lite',
      'groq/openai/gpt-oss-120b',
      'groq/openai/gpt-oss-20b',
    ]
  );
});

test('no quedan referencias a modelos que ya no existen', () => {
  const enUso = construirCandidatos().map((c) => c.model);

  for (const muerto of ['llama-3.3-70b-versatile', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.7-flash']) {
    assert.ok(!enUso.includes(muerto), `no debe usar ${muerto}`);
  }
});

test('el esquema de Groq usa una unión discriminada por tipo de bloque', () => {
  const bloque = groqSchema.properties.secciones.items.properties.bloques.items;

  assert.ok(Array.isArray(bloque.anyOf), 'bloques debe ser anyOf');
  assert.equal(bloque.anyOf.length, 3);

  const porTipo = Object.fromEntries(bloque.anyOf.map((v) => [v.properties.tipo.enum[0], v]));
  // Cada variante declara SOLO sus campos: es lo que evita "expected object, but got arr".
  assert.deepEqual(Object.keys(porTipo.texto.properties), ['tipo', 'texto']);
  assert.deepEqual(Object.keys(porTipo.lista.properties), ['tipo', 'items']);
  assert.deepEqual(Object.keys(porTipo.tabla.properties), ['tipo', 'titulo', 'columnas', 'filas']);
});

test('el esquema de Groq cumple las reglas de strict que exige la API', () => {
  const estricto = aStrictGroqSchema();

  assert.equal(estricto.additionalProperties, false);
  assert.deepEqual(estricto.required, ['modulo', 'secciones']);

  const seccion = estricto.properties.secciones.items;
  assert.equal(seccion.additionalProperties, false);
  assert.deepEqual(seccion.required, ['sourceId', 'codigo', 'titulo', 'nivel', 'orden', 'bloques']);

  for (const variante of seccion.properties.bloques.items.anyOf) {
    assert.equal(variante.additionalProperties, false);
    assert.deepEqual(variante.required, Object.keys(variante.properties));
  }
});

test('el esquema se traduce al formato del SDK de Gemini', () => {
  const gemini = toGeminiSchema(programacionSchema);

  assert.equal(gemini.type, 'OBJECT');
  assert.equal(gemini.properties.secciones.items.properties.nivel.type, 'INTEGER');
  assert.equal(gemini.properties.secciones.items.properties.bloques.items.properties.tipo.enum.length, 3);
  assert.equal(bloqueVariantes.length, 3);
});

// ---------------------------------------------------------------- Integración

test('un objeto JSON válido se procesa correctamente', async () => {
  cascadaCompleta();
  mockFetch(geminiSimulado(() => JSON.stringify(JSON_VALIDO)));

  const { data, meta } = await analizarDocumento('texto del módulo', { moduleCode: '10.2' });

  assert.equal(meta.proveedor, 'gemini');
  assert.equal(meta.modelo, 'gemini-3.8-flash');
  assert.equal(data.modulo.nombre, 'Desarrollo Web en Entorno Servidor');
  assert.equal(data.secciones.length, 2);
  assert.equal(data.secciones[1].bloques[0].filas[0][1], 'EA-1');
});

test('un array en la raíz se adapta y no rompe el sistema', async () => {
  cascadaCompleta();
  // Array de secciones: es la forma alternativa más habitual.
  mockFetch(geminiSimulado(() => JSON.stringify(SECCIONES)));

  const { data } = await analizarDocumento('texto');

  assert.equal(data.secciones.length, 2);
  assert.equal(data.modulo.codigo, '');
});

test('un array con el objeto completo envuelto también se adapta', async () => {
  cascadaCompleta();
  mockFetch(geminiSimulado(() => JSON.stringify([JSON_VALIDO])));

  const { data } = await analizarDocumento('texto');

  assert.equal(data.modulo.nombre, 'Desarrollo Web en Entorno Servidor');
  assert.equal(data.secciones.length, 2);
});

test('un array que no encaja falla con un mensaje claro', async () => {
  cascadaCompleta();
  mockFetch(geminiSimulado(() => JSON.stringify(['texto suelto', 42])));

  await assert.rejects(() => analizarDocumento('texto'), /no se puede convertir/);
});

test('reintenta ante 503 y lo consigue', async () => {
  cascadaCompleta();
  let intentos = 0;
  mockFetch(geminiSimulado(() => {
    intentos++;
    return intentos === 1 ? null : JSON.stringify(JSON_VALIDO);
  }));

  const { meta } = await analizarDocumento('texto');

  assert.equal(meta.proveedor, 'gemini');
  assert.equal(meta.intentos, 2);
});

test('un modelo no disponible salta al siguiente sin gastar reintentos', async () => {
  cascadaCompleta();
  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    const gemini = esGeminiUrl(url);
    const modelo = gemini ? modeloDeUrl(url) : JSON.parse(opts.body).model;
    llamadas.push(`${gemini ? 'gemini' : 'groq'}:${modelo}`);

    // gemini-3.8-flash no existe; gemini-3.5-flash-lite tampoco responde.
    if (modelo === 'gemini-3.8-flash') return errorGemini(404, 'The model does not exist or you do not have access to it.');
    if (modelo === 'gemini-3.5-flash-lite') return errorGemini(503, 'Service Unavailable: high demand');
    return okGroq();
  };

  const { meta } = await analizarDocumento('texto');

  assert.equal(meta.proveedor, 'groq');
  assert.equal(meta.modelo, 'openai/gpt-oss-120b');
  // 3.8 falla 1 vez (definitivo), 3.5-lite 2 veces (reintentable) y luego Groq.
  assert.equal(llamadas.filter((c) => c === 'gemini:gemini-3.8-flash').length, 1);
  assert.ok(llamadas.includes('gemini:gemini-3.5-flash-lite'));
  assert.ok(llamadas.includes('groq:openai/gpt-oss-120b'));
});

test('si el primer modelo de Groq va mal se usa el segundo', async () => {
  soloProveedor('groq');
  const llamadas = [];
  mockFetch(({ modelo }) => {
    llamadas.push(modelo);
    if (modelo === 'openai/gpt-oss-120b') return errorGroq(503, 'Service Unavailable: high demand');
    return okGroq();
  });

  const { meta } = await analizarDocumento('texto');

  assert.equal(meta.modelo, 'openai/gpt-oss-20b');
  assert.ok(llamadas.includes('openai/gpt-oss-120b'));
});

test('el circuit breaker evita repetir un proveedor caído', async () => {
  cascadaCompleta();
  mockFetch(geminiSimulado(() => null)); // Gemini siempre saturado
  await assert.rejects(() => analizarDocumento('texto'));

  const llamadas = mockFetch(({ gemini }) => (gemini ? errorGemini(503, 'high demand') : okGroq()));
  const { meta } = await analizarDocumento('texto');

  assert.equal(meta.proveedor, 'groq');
  assert.ok(!llamadas.some((c) => c.startsWith('gemini')), 'no debe volver a llamar a Gemini');
  assert.equal(estadoProveedores().find((p) => p.id === 'gemini').circuito, 'enfriamiento');
});

test('si todos fallan, el error enumera proveedor, modelo y siguiente', async () => {
  cascadaCompleta();
  globalThis.fetch = async (url) =>
    esGeminiUrl(url)
      ? errorGemini(503, 'Service Unavailable: high demand')
      : errorGroq(429, 'Rate limit reached');

  await assert.rejects(() => analizarDocumento('texto'), (error) => {
    assert.equal(error.isUnavailable, true);
    assert.ok(error.attempts.length > 0);
    // Cada intento debe decir qué modelo es, qué pasó y qué viene después.
    for (const a of error.attempts) {
      assert.ok(a.proveedor, 'falta proveedor');
      assert.ok(a.modelo, 'falta modelo');
      assert.ok(a.estado, 'falta estado');
      assert.ok('detalle' in a, 'falta detalle');
      assert.ok('siguiente' in a, 'falta siguiente modelo');
    }
    assert.match(error.message, /gemini\/gemini-3\.8-flash/);
    assert.match(error.message, /groq\/openai\/gpt-oss-120b/);
    return true;
  });
});

test('Groq degrada json_schema -> json_object -> prompt si no soporta el esquema', async () => {
  soloProveedor('groq');
  const formatos = [];
  mockFetch(({ body }) => {
    const tipo = body.response_format?.type;
    formatos.push(tipo || 'sin-formato');
    if (tipo === 'json_schema') return errorGroq(400, "Unsupported parameter: 'response_format.type' must be 'json_object'");
    if (tipo === 'json_object') return errorGroq(400, 'response_format json_object is not supported');
    return okGroq();
  });

  const { data } = await analizarDocumento('texto');

  assert.deepEqual(formatos, ['json_schema', 'json_object', 'sin-formato']);
  assert.equal(data.secciones.length, 2);
});

test('extrae el JSON aunque venga en un bloque de markdown', async () => {
  soloProveedor('groq');
  mockFetch(() => okGroq('```json\n' + JSON.stringify(JSON_VALIDO) + '\n```'));

  const { data } = await analizarDocumento('texto');

  assert.equal(data.secciones.length, 2);
});

// -------------------------------------------------------------------- Saneado

test('sanearRespuesta normaliza los tipos que inventan los modelos', () => {
  const limpio = sanearRespuesta({
    modulo: { codigo: 613, nombre: null, curso: '2º', profesor: ['Ibai', 'Ruth'] },
    secciones: [
      { codigo: '9.4.1', titulo: '', nivel: '2', orden: 0, bloques: [{ tipo: 'TABLA', columnas: ['A', 'B', 'C'], filas: [['1', '2']] }] },
      { codigo: '9.4.2', titulo: 'Lista', nivel: 9, bloques: [{ tipo: 'loquesea', items: [' uno ', '', 'dos'] }] },
      { codigo: '9.4.3', titulo: 'Sin bloques', bloques: [] },
    ],
  });

  assert.equal(limpio.modulo.codigo, '613');
  assert.equal(limpio.modulo.profesor, 'Ibai\nRuth');
  // La numeración manda sobre el nivel que dice el modelo (9.4.1 -> 3).
  assert.equal(limpio.secciones[0].nivel, 3);
  assert.deepEqual(limpio.secciones[0].bloques[0].filas[0], ['1', '2', '']);
  assert.equal(limpio.secciones[1].bloques[0].tipo, 'lista');
  assert.deepEqual(limpio.secciones[1].bloques[0].items, ['uno', 'dos']);
  assert.equal(limpio.secciones[2].bloques[0].tipo, 'texto');
  assert.equal(limpio.secciones[0].orden, 1);
});

test('un bloque de lista con un array dentro no rompe la normalización', () => {
  const limpio = sanearRespuesta({
    modulo: { codigo: '1' },
    secciones: [{ codigo: '1.1', titulo: 'X', bloques: [{ tipo: 'lista', items: [['a', 'b'], 'c'] }] }],
  });

  assert.equal(limpio.secciones[0].bloques[0].tipo, 'lista');
  assert.ok(limpio.secciones[0].bloques[0].items.length > 0);
});

test('sanearRespuesta rechaza estructuras irrecuperables', () => {
  assert.throws(() => sanearRespuesta(null), /no devolvió un objeto JSON/);
  assert.throws(() => sanearRespuesta({ modulo: {} }), /faltan "modulo" o "secciones"/);
  assert.throws(() => sanearRespuesta({ modulo: {}, secciones: [] }), /ninguna sección/);
});

test('extraerJson aísla el objeto aunque haya texto alrededor', () => {
  assert.equal(extraerJson('Aquí tienes:\n{"a":1}\nfin'), '{"a":1}');
  assert.equal(extraerJson('texto ```json\n{"a":"}"}\n``` mas'), '{"a":"}"}');
  assert.throws(() => extraerJson('sin json aqui'), /No se encontró ningún JSON válido/);
});

test('los errores de modelo no disponible se clasifican como definitivos', () => {
  const casos = [
    'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.',
    'This model models/gemini-2.5-flash is no longer available to new users.',
    'model_not_found',
  ];

  for (const mensaje of casos) {
    assert.equal(isModelUnavailableError(new Error(mensaje)), true, mensaje);
    assert.equal(toProviderError(new Error(mensaje), { provider: 'x', model: 'm' }).retryable, false);
  }

  // Y un 503 por demanda alta sí es reintentable.
  assert.equal(toProviderError(new Error('Service Unavailable: high demand'), { provider: 'gemini', model: 'm' }).retryable, true);
});

// ------------------------------------------------- Documentos con estructuras varias

test('detecta apartados con numeración propia de cada documento', () => {
  // Documento A: jerarquía x.y con módulos
  const a = normalizarTexto(`10.1. Programación
Contenido
10.2. Desarrollo web en entorno servidor
9.4.1 Resultados
10.3. Despliegue`);
  assert.deepEqual(detectarModulos(a).map((m) => m.codigo), ['10.1', '10.2', '9.4.1', '10.3']);

  // Documento B: otra numeración, otro número de apartados y otros títulos
  const b = normalizarTexto(`3. Marco normativo
Contenido
4. Objetivos formativos
4.1. Objetivos específicos
4.1.1. Conocimientos
5. Metodología
5.1. Actividades
5.1.1. Prácticas
6. Evaluación`);
  assert.deepEqual(detectarModulos(b).map((m) => m.codigo), ['3', '4', '4.1', '4.1.1', '5', '5.1', '5.1.1', '6']);

  const r5 = recortarModulo(b, '5.1');
  assert.ok(r5.texto.startsWith('5.1. Actividades'));
  assert.ok(r5.texto.includes('5.1.1. Prácticas'), 'incluye sus subapartados');
  assert.ok(!r5.texto.includes('4. Objetivos'), 'no incluye el módulo anterior');
  assert.ok(!r5.texto.includes('6. Evaluación'), 'un título raíz reconocido cierra el apartado');
});

test('el recorte funciona con distintos formatos de encabezado', () => {
  const texto = normalizarTexto(`7.1 Programación
Texto A
7.2) DEVELOPMENT AND DEPLOYMENT
Texto B
7.3 - Diseño de interfaces
Texto C
7.4. Caso final
Texto D`);

  assert.deepEqual(detectarModulos(texto).map((m) => m.codigo), ['7.1', '7.2', '7.3', '7.4']);

  const r = recortarModulo(texto, '7.2');
  assert.equal(r.encontrado, true);
  assert.ok(r.texto.includes('Texto B'));
  assert.ok(!r.texto.includes('Texto A'));
  assert.ok(!r.texto.includes('Texto C'));
});

test('un apartado de un solo nivel se recorta hasta el siguiente', () => {
  const texto = normalizarTexto(`6. Evaluación
6.1. Criterios
Contenido
7. Calificación
Otro`);

  const r = recortarModulo(texto, '6');

  assert.equal(r.encontrado, true);
  assert.ok(r.texto.includes('6.1. Criterios'));
  assert.ok(!r.texto.includes('7. Calificación'));
});

test('normalizarTexto quita paginación y colapsa líneas en blanco', () => {
  const limpio = normalizarTexto('Portada\n-- 1 de 38 --\n10.1. Programación\nTexto\n\n\n\n10.2. Otro\n');

  assert.ok(!limpio.includes('1 de 38'));
  assert.ok(!/\n{3,}/.test(limpio));
});

test('recortarModulo ignora códigos que no existen', () => {
  assert.equal(recortarModulo(normalizarTexto('10.1. A\nTexto'), '77.7').encontrado, false);
});

// --------------------------------------------------------------- Fragmentación

/** Documento largo sintético con apartados numerados. */
function documentoLargo(numApartados = 40, relleno = 400) {
  const partes = [];
  for (let i = 1; i <= numApartados; i++) {
    partes.push(`9.4.${i} Apartado número ${i}`);
    partes.push('contenido '.repeat(Math.ceil(relleno / 10)));
  }
  return partes.join('\n');
}

/** Simula a la IA: devuelve los apartados que aparecen en ese fragmento. */
function seccionesDelFragmento(texto) {
  return [...texto.matchAll(/\[APARTADO sourceId="([^"]+)" parte="\d+"\]\n([^\n]*)\n([\s\S]*?)\n\[\/APARTADO\]/g)].map((m) => {
    const encabezado = m[2].match(/^(\S+)\s+(.*)$/);
    return { sourceId: m[1], codigo: encabezado?.[1] || '', titulo: encabezado?.[2] || '', nivel: 3, bloques: [{ tipo: 'texto', texto: m[3] }] };
  });
}

test('fragmentarTexto no toca los documentos cortos', () => {
  assert.equal(fragmentarTexto('texto corto', 1000).length, 1);
});

test('fragmentarTexto trocea sin partir apartados', () => {
  const texto = documentoLargo();
  const fragmentos = fragmentarTexto(texto, 4000);

  assert.ok(fragmentos.length > 1, `debería trocearse (${fragmentos.length})`);

  for (const fragmento of fragmentos) {
    assert.match(fragmento.trim(), /^9\.4\.\d+\s/, `mal cortado: ${fragmento.slice(0, 40)}`);
    assert.ok(fragmento.length <= 6000, `fragmento demasiado largo: ${fragmento.length}`);
  }

  const unido = fragmentos.join(' ');
  for (let i = 1; i <= 40; i++) {
    assert.ok(unido.includes(`9.4.${i} Apartado número ${i}`), `falta el apartado ${i}`);
  }
});

test('fusionarResultados une, deduplica y renumera', () => {
  const fusionado = fusionarResultados([
    { modulo: { codigo: '0613', nombre: 'DWES' }, secciones: [
      { codigo: '9.4.1', titulo: 'A' }, { codigo: '9.4.2', titulo: 'B' },
    ] },
    { modulo: {}, secciones: [
      { codigo: '9.4.2', titulo: 'B' }, // solapamiento entre fragmentos
      { codigo: '9.4.3', titulo: 'C' },
    ] },
  ]);

  assert.equal(fusionado.modulo.nombre, 'DWES');
  assert.deepEqual(fusionado.secciones.map((s) => s.codigo), ['9.4.1', '9.4.2', '9.4.3']);
  assert.deepEqual(fusionado.secciones.map((s) => s.orden), [1, 2, 3]);
});

test('el análisis fragmentado procesa todo y devuelve el documento unido', async () => {
  cascadaCompleta();
  mockFetch(({ gemini, body }) =>
    gemini ? okGemini(JSON.stringify({ modulo: { codigo: '0613' }, secciones: seccionesDelFragmento(body.contents?.[0]?.parts?.[0]?.text || '') }))
           : okGroq()
  );

  const progreso = [];
  const { data, meta } = await analizarDocumentoFragmentado(documentoLargo(), {
    moduleCode: '9.4',
    onProgress: (p) => progreso.push(p),
  });

  assert.ok(meta.fragmentos > 1, 'debería haber fragmentado');
  assert.equal(meta.fragmentosOk, meta.fragmentos);
  assert.equal(data.secciones.length, 40, `secciones fusionadas: ${data.secciones.length}`);
  assert.deepEqual(data.secciones.map((s) => s.orden), data.secciones.map((_, i) => i + 1));
  assert.ok(progreso.some((p) => p.fase === 'fusionando'));
  assert.equal(progreso.at(-1).fase, 'terminado');
});

test('revisión automática recupera una tabla omitida sin repetir apartados válidos', async () => {
  cascadaCompleta();
  const enviados = [];
  mockFetch(({ body }) => {
    const texto = body.contents?.[0]?.parts?.[0]?.text || '';
    enviados.push(texto);
    const secciones = seccionesDelFragmento(texto);
    if (enviados.length === 1) secciones[1].bloques = [{tipo:'texto',texto:'resumen incorrecto'}];
    return okGemini(JSON.stringify({modulo:{},secciones}));
  });
  const {data,meta} = await analizarDocumentoFragmentado('10.2.1 Introducción\nTexto completo.\n10.2.5 Situaciones\nRA1 15%\nRA2 85%');
  assert.equal(enviados.length,2);
  assert.doesNotMatch(enviados[1],/Texto completo/);
  assert.equal(meta.partesRecuperadas,1);
  assert.equal(meta.avisos.length,0);
  assert.equal(data.secciones[1].bloques[0].texto,'RA1 15%\nRA2 85%');
});

test('revisión fallida es acotada y explica la pérdida conservando el original', async () => {
  cascadaCompleta();
  const llamadas = mockFetch(({body}) => {
    const secciones = seccionesDelFragmento(body.contents?.[0]?.parts?.[0]?.text || '');
    secciones.forEach((s)=>{ s.bloques=[{tipo:'texto',texto:'RA1 10%'}]; });
    return okGemini(JSON.stringify({modulo:{},secciones}));
  });
  const {data,meta} = await analizarDocumentoFragmentado('10.2.5 Situaciones\nRA1 15%');
  assert.equal(llamadas.length,2);
  assert.equal(meta.reintentosIntegridad,1);
  assert.equal(meta.partesRecuperadas,0);
  assert.match(meta.avisos[0],/faltaban 1 términos/);
  assert.deepEqual(data.secciones[0].bloques,[{tipo:'texto',texto:'RA1 15%'}]);
  assert.equal(data.secciones[0].revisar,true);
});

test('Groq recupera un fallo de generación del esquema mediante JSON validado localmente', async () => {
  soloProveedor('groq');
  const formatos=[];
  mockFetch(({body})=>{
    formatos.push(body.response_format.type);
    return body.response_format.type==='json_schema'
      ? errorGroq(400, 'Generated JSON does not match the expected schema. Error: jsonschema: /secciones/1')
      : okGroq();
  });
  const {data}=await analizarDocumento('Texto');
  assert.deepEqual(formatos,['json_schema','json_object']);
  assert.equal(data.secciones.length,2);
});

test('cuota agotada no se presenta como modelo inexistente', () => {
  const e=toProviderError({status:429,message:'You exceeded your current quota, please check your plan and billing details.'},{provider:'gemini',model:'modelo'});
  assert.equal(e.code,'QUOTA_EXCEEDED');
  assert.equal(e.retryable,false);
  assert.equal(isModelUnavailableError(e),false);
});

test('un fragmento fallido no tira el trabajo: se avisa y se continúa', async () => {
  cascadaCompleta();
  let primeraFirma = null;

  mockFetch(({ gemini, body }) => {
    const texto = gemini
      ? body?.contents?.[0]?.parts?.[0]?.text || ''
      : body?.messages?.[1]?.content || '';
    // Firma = texto completo: todos los fragmentos comparten el encabezado del
    // prompt, así que un prefijo no los distinguiría.
    const firma = texto;

    // El PRIMER fragmento falla en todos sus modelos (si solo fallara en uno, la
    // cascada lo resolvería con el siguiente y no habría nada que avisar).
    if (primeraFirma === null) primeraFirma = firma;
    if (firma === primeraFirma) {
      return errorGemini(400, 'The model does not exist or you do not have access to it.');
    }

    const contenido = JSON.stringify({ modulo: { codigo: '0613' }, secciones: seccionesDelFragmento(texto) });
    return gemini ? okGemini(contenido) : okGroq(contenido);
  });

  const { data, meta } = await analizarDocumentoFragmentado(documentoLargo(), { moduleCode: '9.4' });

  assert.ok(meta.avisos.length >= 1, `debe avisar (avisos: ${meta.avisos.length})`);
  assert.ok(data.secciones.length > 0, 'conserva lo que sí se pudo analizar');
});

test('si fallan todos los fragmentos se conserva todo el texto y se avisa', async () => {
  cascadaCompleta();
  globalThis.fetch = async (url) =>
    esGeminiUrl(url) ? errorGemini(503, 'high demand') : errorGroq(500, 'Internal error');

  const { data, meta } = await analizarDocumentoFragmentado(documentoLargo(), {});
  assert.equal(data.secciones.length, 40);
  assert.equal(meta.fragmentosOk, 0);
  assert.ok(meta.avisos.length > 0);
  assert.ok(data.secciones.every((s) => s.revisar));
});

test('sin API keys configuradas el error es explícito', async () => {
  const groq = process.env.GROQ_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const { analizarDocumento: sinKeys } = await import(`../src/lib/ai/index.js?v=${Date.now()}`);
    await assert.rejects(() => sinKeys('texto'), /API key/i);
  } finally {
    process.env.GROQ_API_KEY = groq;
    process.env.GEMINI_API_KEY = gemini;
  }
});
