import { getActiveProviders } from './config';
import { ProviderError, AiUnavailableError, toProviderError } from './errors';
import { conCircuito, estadoCircuito } from './circuitBreaker';
import { extraerJson, sanearRespuesta } from './sanitize';
import { fragmentarTexto, fusionarResultados } from './fragmentar';
import { analizarConGroq } from './providers/groq';
import { analizarConGemini } from './providers/gemini';

/**
 * Orquestador de IA con cascada de proveedores.
 *
 * Estrategia (Groq -> Gemini por defecto, configurable con AI_PROVIDER_ORDER):
 *   Proveedor A -> modelo A.1, A.2 ... -> Proveedor B -> modelo B.1, B.2 ...
 *
 * - Los errores reintentables (429, 503, saturación, red) se reintentan con
 *   backoff exponencial + jitter dentro del mismo proveedor y modelo.
 * - Los errores definitivos (credenciales, esquema rechazado, respuesta
 *   truncada) saltan directamente al siguiente candidato.
 * - El circuit breaker evita encadenar reintentos cuando un proveedor está caído.
 *
 * Solo cuando TODOS los candidatos fallan se devuelve AiUnavailableError, que la
 * ruta API traduce a un 503 que el frontend sabe reintentar.
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

/**
 * Analiza un documento largo troceándolo por apartados y fusionando los resultados.
 *
 * Un módulo de programación real ocupa 50-150 páginas: enviado de una vez, el
 * modelo se trunca y el análisis falla. Aquí cada fragmento se analiza por
 * separado (cada uno con su propia cascada de proveedores) y se unen.
 *
 * Si un fragmento falla, no se tira el trabajo: se continúa con los demás y se
 * informa en `avisos`. Solo si fallan todos se propaga el error.
 *
 * @param {string} text
 * @param {{ moduleCode?: string, signal?: AbortSignal, onProgress?: (p) => void }} options
 */
export async function analizarDocumentoFragmentado(text, { moduleCode, signal, onProgress } = {}) {
  const fragmentos = fragmentarTexto(text);
  const total = fragmentos.length;

  if (total <= 1) {
    onProgress?.({ fragmento: 1, total: 1, fase: 'analizando' });
    const { data, meta } = await analizarDocumento(text, { moduleCode, signal });
    onProgress?.({ fragmento: 1, total: 1, fase: 'terminado' });
    return { data, meta: { ...meta, fragmentos: 1 } };
  }

  console.log(`[IA] Documento troceado en ${total} fragmentos`);

  const resultados = [];
  const avisos = [];
  let metaGanador = null;

  for (let i = 0; i < total; i++) {
    onProgress?.({ fragmento: i + 1, total, fase: 'analizando' });

    try {
      const { data, meta } = await analizarDocumento(fragmentos[i], { moduleCode, signal });
      resultados.push(data);
      metaGanador = metaGanador ? { ...metaGanador, usoMultiple: true } : meta;
    } catch (error) {
      // Un fragmento problemático no debe invalidar el módulo entero: si los
      // proveedores están saturados puede que el siguiente fragmento sí cuaje
      // (y si no, el aviso se traslada al usuario al final).
      avisos.push(`Fragmento ${i + 1}/${total}: ${error.message}`);
      console.warn(`[IA] Fragmento ${i + 1}/${total} falló:`, error.message);

      if (resultados.length === 0 && i === total - 1) throw error;
    }
  }

  onProgress?.({ fragmento: total, total, fase: 'fusionando' });
  const data = fusionarResultados(resultados);

  if (data.secciones.length === 0) {
    throw new AiUnavailableError(
      `No se pudo analizar ningún fragmento del documento (${avisos.length} de ${total} fallaron).`,
      { attempts: avisos }
    );
  }

  onProgress?.({ fragmento: total, total, fase: 'terminado' });

  return {
    data,
    meta: {
      ...(metaGanador || { proveedor: 'desconocido', modelo: 'desconocido' }),
      fragmentos: total,
      fragmentosOk: resultados.length,
      avisos,
    },
  };
}