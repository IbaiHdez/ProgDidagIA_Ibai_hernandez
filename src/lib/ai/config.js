/**
 * Configuración de proveedores de IA, leída desde variables de entorno.
 * Todos los valores tienen un valor por defecto razonable para poder ejecutar
 * el proyecto sin tocar nada más que las API keys.
 */

const splitList = (value, fallback) => {
  const list = (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
};

/** Proveedores soportados, en el orden por defecto de la cascada. */
export const PROVEEDORES = ['groq', 'gemini'];

export function getProvidersConfig() {
  const groqKey = process.env.GROQ_API_KEY?.trim() || null;

  const config = {
    groq: {
      id: 'groq',
      label: 'Groq',
      apiKey: groqKey,
      baseUrl: process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1',
      // Modelos OpenAI-compatible hosted por Groq. Se prueban en orden hasta que
      // uno responda (comprueba los disponibles en https://console.groq.com).
      // Verificados contra la API con la cuota gratuita. Comprobado en
      // https://console.groq.com: `llama-3.3-70b-versatile` devuelve 404
      // ("does not exist or you do not have access to it").
      models: splitList(process.env.GROQ_MODELS, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']),
      maxTokens: Number(process.env.GROQ_MAX_TOKENS || 32768),
      // Tope duro del endpoint: si se configura más, la API rechaza la petición.
      maxTokensCap: 65536,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
    },
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      apiKey: process.env.GEMINI_API_KEY?.trim() || null,
      // El SDK ya añade la versión de la API al construir la URL, así que la base
      // debe ir sin "/v1beta" o se duplicaría.
      baseUrl: process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com',
      apiVersion: process.env.GEMINI_API_VERSION?.trim() || 'v1beta',
      // Verificados contra la API. Los modelos 2.5 devuelven 404 para cuentas nuevas
      // ("no longer available to new users"), por eso se usan los 3.x.
      models: splitList(process.env.GEMINI_MODELS, ['gemini-3.8-flash', 'gemini-3.5-flash-lite']),
      maxTokens: Number(process.env.GEMINI_MAX_TOKENS || 65536),
      // La API no devuelve más de 65.536 tokens de salida.
      maxTokensCap: 65536,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000),
    },
  };

  // Cascada por defecto: Gemini 3.8 Flash -> Gemini 3.5 Flash Lite ->
  // Groq GPT-OSS 120B -> Groq GPT-OSS 20B. Se puede invertir con la variable.
  const orden = (process.env.AI_PROVIDER_ORDER || 'gemini,groq')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => PROVEEDORES.includes(p));

  const order = orden.length > 0 ? [...new Set(orden)] : [...PROVEEDORES];

  return {
    order,
    providers: config,
    retries: Number(process.env.AI_MAX_ATTEMPTS || 3),
    cooldownMs: Number(process.env.AI_ERROR_COOLDOWN_MS || 2000),
    maxBackoffMs: Number(process.env.AI_MAX_BACKOFF_MS || 8000),
  };
}

/** Proveedores que tienen credencial configurada, en el orden de la cascada. */
export function getActiveProviders() {
  const { order, providers, ...rest } = getProvidersConfig();
  return {
    ...rest,
    order,
    providers,
    activeOrder: order.filter((id) => Boolean(providers[id]?.apiKey)),
  };
}

/**
 * Normaliza el límite de tokens de salida de un proveedor.
 * Si el valor configurado supera el tope de la API, la petición se rechaza
 * entera (error 400), así que aquí se recorta al máximo permitido.
 */
export function limitarTokens(config) {
  const cap = config.maxTokensCap || 65536;
  const pedidos = Number(config.maxTokens);

  if (!Number.isFinite(pedidos) || pedidos <= 0) return Math.min(cap, 32768);
  if (pedidos > cap) {
    console.warn(`[IA] ${config.label}: max_tokens=${pedidos} supera el máximo de la API (${cap}); se ajusta.`);
    return cap;
  }
  return pedidos;
}