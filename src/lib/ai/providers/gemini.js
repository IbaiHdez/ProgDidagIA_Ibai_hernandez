import { GoogleGenAI } from '@google/genai';
import { ProviderError } from '../errors';
import { limitarTokens } from '../config';
import { programacionSchema, toGeminiSchema, buildSystemPrompt, buildUserPrompt } from '../schema';

/**
 * Proveedor Google Gemini (SDK @google/genai).
 *
 * Gemini valida el esquema en el servidor mediante `responseSchema`, así que
 * el prompt puede ser más corto. Si el modelo elegido no soporta un esquema
 * estricto o se agota la cuota, el orquestador prueba con el siguiente modelo
 * de la lista y, si todos fallan, salta a Groq.
 */

let schemaGeminiCache;

function obtenerSchemaGemini() {
  schemaGeminiCache ??= toGeminiSchema(programacionSchema);
  return schemaGeminiCache;
}

function obtenerCliente(config) {
  if (!config.apiKey) {
    throw new ProviderError('Falta GEMINI_API_KEY en .env.local', {
      provider: 'gemini', code: 'MISSING_API_KEY', retryable: false,
    });
  }
  return new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: { baseUrl: config.baseUrl, apiVersion: config.apiVersion },
  });
}

/**
 * Analiza un documento con Gemini.
 * @returns {Promise<{ texto: string, usage: object|null, modeloEfectivo: string }>}
 */
export async function analizarConGemini({ config, text, moduleCode, model, signal }) {
  const modelo = model || config.models[0];
  const ai = obtenerCliente(config);

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), config.timeoutMs || 180000);
  const alCancelar = () => controlador.abort();
  signal?.addEventListener('abort', alCancelar, { once: true });

  try {
    const response = await ai.models.generateContent({
      model: modelo,
      contents: buildUserPrompt(text, { moduleCode }),
      config: {
        systemInstruction: buildSystemPrompt({ moduleCode }),
        responseMimeType: 'application/json',
        responseSchema: obtenerSchemaGemini(),
        maxOutputTokens: limitarTokens(config),
        abortSignal: controlador.signal,
      },
    });

    const texto = response?.text;

    if (!texto) {
      const finishReason = response?.candidates?.[0]?.finishReason;
      throw new ProviderError(
        `Gemini no devolvió contenido${finishReason ? ` (finishReason: ${finishReason})` : ''}.`,
        { provider: 'gemini', model: modelo, status: 502, retryable: false }
      );
    }

    if (finishReasonEsTruncado(response)) {
      throw new ProviderError('Gemini truncó la respuesta por límite de tokens (sube GEMINI_MAX_TOKENS o divide el módulo).', {
        provider: 'gemini', model: modelo, status: 502, retryable: false, code: 'TRUNCATED',
      });
    }

    return {
      texto,
      usage: response?.usageMetadata || null,
      modeloEfectivo: modelo,
    };
  } finally {
    clearTimeout(temporizador);
    signal?.removeEventListener('abort', alCancelar);
  }
}

function finishReasonEsTruncado(response) {
  const reason = response?.candidates?.[0]?.finishReason;
  return reason === 'MAX_TOKENS' || reason === 'max_tokens';
}