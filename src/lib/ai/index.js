import { getActiveProviders } from './config';
import { ProviderError, AiUnavailableError, toProviderError } from './errors';
import { conCircuito, estadoCircuito } from './circuitBreaker';
import { extraerJson, sanearRespuesta } from './sanitize';
import { crearPlanFragmentos, coberturaContenido, formatearParte } from './fragmentar';
import { analizarConGroq } from './providers/groq';
import { analizarConGemini } from './providers/gemini';
import { expandirTablas, bloquesTexto } from '../tablasOriginales.js';

/**
 * Orquestador de IA con cascada de proveedores.
 *
 * Estrategia (Gemini -> Groq por defecto, configurable con AI_PROVIDER_ORDER):
 *   Proveedor A -> modelo A.1, A.2 ... -> Proveedor B -> modelo B.1, B.2 ...
 *
 * - Los errores reintentables (429, 503, saturación, red) se reintentan con
 *   backoff exponencial + jitter dentro del mismo proveedor y modelo.
 * - Los errores definitivos (credenciales, esquema rechazado, respuesta
 *   truncada) saltan directamente al siguiente candidato.
 * - El circuit breaker evita encadenar reintentos cuando un proveedor está caído.
 *
 * Si todos los candidatos fallan se lanza AiUnavailableError; el plan conserva
 * el texto de esa parte y avisa al usuario.
 */

const PROVEEDORES_IMPL = {
  groq: analizarConGroq,
  gemini: analizarConGemini,
};

/** Estado de cada proveedor, útil para diagnóstico y para la UI. */
export function estadoProveedores() {
  const { order, providers, activeOrder } = getActiveProviders();

  return order.map((id) => {
    const config = providers[id];
    const circuito = estadoCircuito(id);
    return {
      id,
      label: config?.label || id,
      configurado: Boolean(config?.apiKey),
      activo: activeOrder.includes(id),
      modelos: config?.models || [],
      circuito: circuito.abierto ? 'enfriamiento' : 'operativo',
      restanteMs: circuito.restanteMs,
    };
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backoff = (intento, base, max) => {
  const exponencial = Math.min(base * 2 ** (intento - 1), max);
  // Jitter completo para que varios usuarios no reintenten a la vez.
  return Math.floor(Math.random() * exponencial);
};

/** Construye la lista plana de candidatos: proveedor + modelo, respetando la cascada. */
export function construirCandidatos() {
  const { activeOrder, providers } = getActiveProviders();
  const candidatos = [];

  for (const id of activeOrder) {
    const config = providers[id];
    if (!config?.apiKey) continue;
    for (const model of config.models) {
      candidatos.push({ id, config, model });
    }
  }

  return candidatos;
}

/**
 * Analiza el texto de un documento y devuelve la estructura normalizada.
 * @param {string} text Texto plano extraído del PDF/Word.
 * @param {{ moduleCode?: string, signal?: AbortSignal }} options
 * @returns {Promise<{ data: object, meta: object }>}
 */
export async function analizarDocumento(text, { moduleCode = null, signal } = {}) {
  if (!text || !text.trim()) {
    throw new Error('El texto a analizar está vacío.');
  }

  const { order, retries, cooldownMs, maxBackoffMs } = getActiveProviders();
  const candidatos = construirCandidatos();

  if (candidatos.length === 0) {
    throw new AiUnavailableError(
      'No hay ninguna API key de IA configurada. Añade GROQ_API_KEY o GEMINI_API_KEY en .env.local.',
      { attempts: [] }
    );
  }

  const diagnostico = [];
  let usados = new Set();

  for (const candidato of candidatos) {
    signal?.throwIfAborted();
    const { id, config, model } = candidato;
    const circuito = estadoCircuito(id);

    if (circuito.abierto) {
      diagnostico.push({ proveedor: id, modelo: model, estado: 'circuito-abierto', detalle: `enfriamiento ${Math.ceil(circuito.restanteMs / 1000)}s` });
      continue;
    }

    const implementar = PROVEEDORES_IMPL[id];
    if (!implementar) {
      diagnostico.push({ proveedor: id, modelo: model, estado: 'desconocido', detalle: 'proveedor no implementado' });
      continue;
    }

    usados.add(id);

    for (let intento = 1; intento <= retries; intento++) {
      try {
        const startedAt = Date.now();
        const { texto, usage, modeloEfectivo } = await conCircuito(id, () =>
          implementar({ config, text, moduleCode, model, signal }),
          { model }
        );

        const raw = extraerJson(texto);
        let payload;

        try {
          payload = JSON.parse(raw);
        } catch (error) {
          // JSON truncado: no tiene sentido reintentar, cambia de modelo/proveedor.
          throw new ProviderError(
            `La IA devolvió un JSON incompleto: ${error.message}`,
            { provider: id, model: modeloEfectivo, status: 502, retryable: false, code: 'BAD_JSON' }
          );
        }

        const data = sanearRespuesta(payload);
        delete data._avisos; // es interno del saneado

        return {
          data,
          meta: {
            proveedor: id,
            modelo: modeloEfectivo,
            intentos: intento,
            duracionMs: Date.now() - startedAt,
            usage: usage || null,
            cascada: order.filter((p) => usados.has(p)),
          },
        };
      } catch (error) {
        signal?.throwIfAborted();
        const providerError = toProviderError(error, { provider: id, model });

        // El siguiente modelo que se probará tras este fallo (para el diagnóstico).
        const siguiente = candidatos[candidatos.indexOf(candidato) + 1];
        const resumen = `${providerError.message.slice(0, 200)}${
          siguiente ? ` -> siguiente: ${siguiente.id}/${siguiente.model}` : ' -> no quedan modelos'
        }`;

        if (!providerError.retryable) {
          diagnostico.push({
            proveedor: id,
            modelo: model,
            intento: intento,
            estado: 'fallo-definitivo',
            detalle: resumen,
            siguiente: siguiente ? `${siguiente.id}/${siguiente.model}` : null,
          });
          break;
        }

        if (intento < retries) {
          const espera = Math.max(backoff(intento, cooldownMs, maxBackoffMs), 500);
          diagnostico.push({
            proveedor: id,
            modelo: model,
            intento: intento,
            estado: 'reintentando',
            detalle: `${providerError.message.slice(0, 120)} (intento ${intento}/${retries}, reintento en ${espera}ms)`,
            siguiente: `${id}/${model}`,
          });
          await sleep(espera);
          continue;
        }

        diagnostico.push({
          proveedor: id,
          modelo: model,
          intento: intento,
          estado: 'agotado',
          detalle: resumen,
          siguiente: siguiente ? `${siguiente.id}/${siguiente.model}` : null,
        });
        break;
      }
    }
  }

  // El mensaje enumera lo que se intentó, para no esconder los errores reales.
  const resumenFallos = diagnostico
    .map((d) => `[${d.proveedor}/${d.modelo}] ${d.estado}: ${d.detalle}`)
    .join(' | ');

  const candidatosProbados = new Set(diagnostico.map((d) => `${d.proveedor}/${d.modelo}`)).size;

  const mensaje =
    'Ningún modelo de IA pudo completar el análisis. ' +
    `Se probaron ${candidatosProbados} modelo(s) en ${diagnostico.length} intento(s). ` +
    `Detalle: ${resumenFallos || 'sin detalle'}`;

  throw new AiUnavailableError(mensaje, { attempts: diagnostico });
}

/** Procesa partes con identidad estable; nunca descarta texto por fallos de IA. */
export async function analizarDocumentoFragmentado(text, { moduleCode, signal, onProgress, nombreDocumento, presupuestoMs = 240_000, tablas = {}, usarIA = true } = {}) {
  if (!text?.trim()) throw new Error('El texto a analizar está vacío.');
  const { secciones, fragmentos } = crearPlanFragmentos(text,undefined,tablas);
  const total = fragmentos.length, avisos = [], diagnosticos = [], proveedores = new Set();
  const salida = new Map(secciones.map((s, i) => [s.id, {
    sourceId: s.id, codigo: s.codigo, titulo: s.titulo, nivel: s.nivel, orden: i + 1, textoOriginal: expandirTablas(s.texto,tablas).trim(), bloques: [],
  }]));
  let metaPrimera = null, fragmentosOk = 0, partesConservadas = 0, reintentosIntegridad = 0, partesRecuperadas = 0;
  const finPresupuesto = Date.now() + Math.max(0, Math.min(presupuestoMs, 240_000));
  let presupuestoAgotado = false;
  const signalAcotada = (ms) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const evaluar = (data, parte) => {
    const normal = (s) => String(s || '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
    const exactas = data?.secciones.filter((s) => s.sourceId === parte.sourceId) || [];
    const candidatas = exactas.length ? exactas : data?.secciones.filter((s) =>
      !s.sourceId && normal(s.codigo) === normal(parte.codigo) && normal(s.titulo) === normal(parte.titulo)) || [];
    const bloques = candidatas.flatMap((s) => s.bloques || []);
    const cobertura = coberturaContenido(parte.texto, bloques);
    return { bloques, cobertura, valido: candidatas.length > 0 && cobertura.valido };
  };
  for (let i = 0; i < total; i++) {
    signal?.throwIfAborted();
    const fragmento = fragmentos[i];
    onProgress?.({ fragmento: i + 1, completados: i, total, fase: 'analizando' });
    if(fragmento.sinIA || !usarIA || fragmento.partes.every((p)=>!p.texto?.trim())) {
      for(const parte of fragmento.partes) salida.get(parte.sourceId).bloques.push(...(parte.bloqueOriginal?[structuredClone(parte.bloqueOriginal)]:bloquesTexto(parte.texto)));
      onProgress?.({fragmento:i+1,completados:i+1,total,fase:'analizando'});
      continue;
    }
    let data;
    try {
      const restante = finPresupuesto - Date.now();
      if (restante <= 0) throw new Error('PRESUPUESTO_AGOTADO');
      const respuesta = await analizarDocumento(fragmento.texto, { moduleCode, signal: signalAcotada(Math.min(restante, 60_000)) });
      data = respuesta.data;
      metaPrimera ||= { ...respuesta.meta, modulo: data.modulo };
      proveedores.add(`${respuesta.meta.proveedor}/${respuesta.meta.modelo}`);
      fragmentosOk++;
    } catch (error) {
      signal?.throwIfAborted();
      if (Date.now() >= finPresupuesto) {
        if (!presupuestoAgotado) avisos.push('Se alcanzó el tiempo máximo de IA. Se conserva el trabajo completado y el texto original de las partes pendientes.');
        presupuestoAgotado = true;
      } else {
        avisos.push(`Parte ${i + 1}/${total}: no se pudo estructurar con IA. Se ha conservado el texto original.`);
        console.warn(`[IA] Fragmento ${i + 1}:`, error.message);
      }
    }
    const evaluaciones = fragmento.partes.map((parte) => evaluar(data, parte));
    const pendientes = fragmento.partes.filter((parte, j) => parte.texto.trim() && !evaluaciones[j].valido);
    let reparacion;
    if (data && pendientes.length && finPresupuesto > Date.now()) {
      // Una única segunda pasada por fragmento, solo con el contenido rechazado.
      // Un fallo de formato no provoca reintentar el documento ni bucles de IA.
      reintentosIntegridad++;
      onProgress?.({ fragmento: i + 1, completados: i, total, fase: 'revisando' });
      const revisionSignal = signalAcotada(Math.max(1, Math.min(30_000, finPresupuesto - Date.now())));
      try {
        const diferencias = pendientes.map((p) => {
          const c = evaluaciones[fragmento.partes.indexOf(p)].cobertura;
          return `${p.codigo || p.titulo}: faltantes ${JSON.stringify(c.faltantes)}; adicionales ${JSON.stringify(c.anadidos)}.`;
        }).join('\n');
        const respuesta = await analizarDocumento(
          'REVISIÓN DE TRANSCRIPCIÓN: en una respuesta anterior faltaban o sobraban los siguientes términos (cantidad = ocurrencias). Comprueba en la fuente sus frases completas y conserva TODAS sus apariciones, especialmente los rótulos de tablas.\n' + diferencias + '\nTranscribe literalmente TODO el contenido de estos apartados, conservando tablas, letras de criterios, viñetas, cifras y repeticiones. No resumas ni corrijas. Si una tabla está incompleta, conserva ese tramo como texto.\n\n' + pendientes.map(formatearParte).join('\n'),
          { moduleCode, signal: revisionSignal });
        reparacion = respuesta.data;
        proveedores.add(`${respuesta.meta.proveedor}/${respuesta.meta.modelo}`);
      } catch {
        signal?.throwIfAborted();
      }
    }
    for (const [j, parte] of fragmento.partes.entries()) {
      const destino = salida.get(parte.sourceId);
      let evaluacion = evaluaciones[j];
      if (!evaluacion.valido && reparacion) {
        const segunda = evaluar(reparacion, parte);
        if (segunda.valido) { evaluacion = segunda; partesRecuperadas++; }
        else if (segunda.cobertura.perdidos + segunda.cobertura.extras < evaluacion.cobertura.perdidos + evaluacion.cobertura.extras) evaluacion = segunda;
      }
      if (evaluacion.valido) {
        destino.bloques.push(...evaluacion.bloques);
      } else if (parte.texto.trim()) {
        destino.bloques.push({ tipo: 'texto', texto: parte.texto.trim() });
        destino.revisar = true;
        partesConservadas++;
        if (data) {
          const { perdidos, extras } = evaluacion.cobertura;
          const motivo = evaluacion.bloques.length
            ? `faltaban ${perdidos} términos y había ${extras} términos adicionales`
            : 'la IA no devolvió el apartado con su identificador';
          avisos.push(`${parte.codigo || parte.titulo}, parte ${parte.parte}: ${motivo}. La revisión automática no lo resolvió; se conserva el original.`);
          diagnosticos.push({ codigo: parte.codigo, parte: parte.parte, ...evaluacion.cobertura });
        }
      }
    }
    onProgress?.({ fragmento: i + 1, completados: i + 1, total, fase: 'analizando' });
  }
  signal?.throwIfAborted();
  onProgress?.({ fragmento: total, completados: total, total, fase: 'fusionando' });
  const modulo = moduleCode ? metaPrimera?.modulo || { codigo: moduleCode, nombre: secciones[0]?.titulo || '', curso: '', profesor: '' }
    : { codigo: '', nombre: nombreDocumento?.replace(/\.(pdf|docx)$/i, '') || 'Documento completo', curso: '', profesor: '' };
  const data = { modulo, secciones: [...salida.values()] };
  onProgress?.({ fragmento: total, completados: total, total, fase: 'terminado' });
  const { modulo: _modulo, ...meta } = metaPrimera || {};
  void _modulo;
  return { data, meta: {
    ...meta, proveedor: meta.proveedor || 'extracción directa', modelo: meta.modelo || 'Estructura del documento',
    tablasOriginales: fragmentos.filter((f)=>f.sinIA).length,
    fragmentos: total, fragmentosOk, partesConservadas, presupuestoAgotado, reintentosIntegridad, partesRecuperadas, diagnosticos, proveedores: [...proveedores], avisos,
  } };
}
