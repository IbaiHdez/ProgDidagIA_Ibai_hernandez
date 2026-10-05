import { ProviderError } from '../errors';
import { limitarTokens } from '../config';
import { aStrictGroqSchema, buildSystemPrompt, buildUserPrompt, ESQUEMA_JSON } from '../schema';

/**
 * Proveedor Groq (API compatible con OpenAI).
 *
 * Groq ofrece salida estructurada en dos flavours:
 *   - `json_schema`: valida el esquema en servidor (ideal, pero algunos modelos
 *     de Groq no lo soportan).
 *   - `json_object`: mucho más extendido, solo exige JSON válido.
 *
 * Por eso el proveedor pide `json_schema` y, si el modelo lo rechaza con un 400,
 * degrada a `json_object` + instrucciones del esquema en el prompt.
 *
 * El esquema enviado es `aStrictGroqSchema()`, con `bloques` como unión
 * discriminada por `tipo`. Ver `schema.js`: el esquema plano provoca que el
 * modelo rellene `texto`, `items` y `filas` a la vez y la API rechace la
 * respuesta con "expected object, but got arr".
 */

async function llamarGroq({ config, model, messages, responseFormat, signal }) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), config.timeoutMs || 120000);

  // Si quien llama cancela (el usuario cierra la página), se aborta también.
  const alCancelar = () => controlador.abort();
  signal?.addEventListener('abort', alCancelar, { once: true });

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        // Sin `temperature`: los modelos de razonamiento (gpt-oss) solo aceptan 1.
        max_tokens: limitarTokens(config),
        response_format: responseFormat,
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let mensaje = raw;
      try {
        const parsed = JSON.parse(raw);
        mensaje = parsed?.error?.message || parsed?.message || raw;
      } catch {
        /* respuesta no JSON, se usa el cuerpo tal cual */
      }
      const error = new Error(mensaje || `Groq respondió ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    // Los modelos de razonamiento pueden separar su razonamiento del contenido.
    const contenido = choice?.message?.content ?? choice?.message?.reasoning;

    if (!contenido) {
      const motivo = choice?.finish_reason === 'length'
        ? 'la respuesta se truncó por el límite de tokens'
        : 'la respuesta vino vacía';
      throw new ProviderError(`Groq devolvió una respuesta inválida: ${motivo}.`, {
        provider: 'groq', model, status: 502, retryable: false,
      });
    }

    if (choice.finish_reason === 'length') {
      throw new ProviderError('Groq truncó la respuesta por límite de tokens (sube GROQ_MAX_TOKENS o divide el módulo).', {
        provider: 'groq', model, status: 502, retryable: false, code: 'TRUNCATED',
      });
    }

    return { contenido, usage: data?.usage || null };
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', alCancelar);
  }
}

function construirMessages(systemPrompt, userPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Analiza un documento con Groq.
 * @returns {Promise<{ texto: string, usage: object|null, modeloEfectivo: string }>}
 */
export async function analizarConGroq({ config, text, moduleCode, model, signal }) {
  if (!config.apiKey) {
    throw new ProviderError('Falta GROQ_API_KEY en .env.local', {
      provider: 'groq', code: 'MISSING_API_KEY', retryable: false,
    });
  }

  // El modelo lo elige el orquestador; esta función solo degrada el formato.
  const modelo = model || config.models[0];
  const systemPrompt = buildSystemPrompt({ moduleCode });
  const userPrompt = buildUserPrompt(text, { moduleCode });

  const formatoEstricto = {
    type: 'json_schema',
    json_schema: {
      name: 'programacion_didactica',
      strict: true,
      schema: aStrictGroqSchema(),
    },
  };

  try {
    const { contenido, usage } = await llamarGroq({
      config,
      model: modelo,
      messages: construirMessages(systemPrompt, userPrompt),
      responseFormat: formatoEstricto,
      signal,
    });
    return { texto: contenido, usage, modeloEfectivo: modelo };
  } catch (error) {
    const lower = (error?.message || '').toLowerCase();
    const soportaEsquema =
      !error?.retryable &&
      (error?.status === 400 || error?.status === 422) &&
      (lower.includes('response_format') || lower.includes('json_schema') || lower.includes('structured'));

    if (!soportaEsquema) throw error;
  }

  // Degradación 1: mismo modelo con json_object + esquema dentro del prompt.
  const systemDegradado = `${systemPrompt}\n\nDEBES responder con un único objeto JSON válido que cumpla este esquema:\n${ESQUEMA_JSON}`;
  try {
    const { contenido, usage } = await llamarGroq({
      config,
      model: modelo,
      messages: construirMessages(systemDegradado, userPrompt),
      responseFormat: { type: 'json_object' },
      signal,
    });
    return { texto: contenido, usage, modeloEfectivo: modelo };
  } catch (error) {
    const lower = (error?.message || '').toLowerCase();
    const soportaJsonObject =
      !error?.retryable &&
      (error?.status === 400 || error?.status === 422) &&
      lower.includes('json_object');

    if (!soportaJsonObject) throw error;
  }

  // Degradación 2: sin response_format, con el esquema embebido en el prompt.
  const { contenido, usage } = await llamarGroq({
    config,
    model: modelo,
    messages: construirMessages(`${systemDegradado}\n\nNO uses bloques de código: responde solo con el JSON.`, userPrompt),
    responseFormat: undefined,
    signal,
  });

  return { texto: contenido, usage, modeloEfectivo: modelo };
}