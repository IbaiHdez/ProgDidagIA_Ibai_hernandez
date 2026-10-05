/**
 * Clasificación de errores de los proveedores de IA.
 * Distingue entre "reintentable" (saturación, cuota, red) y "definitivo"
 * (credenciales, modelo inexistente, petición inválida) para no gastar
 * reintentos tontos ni cascadear proveedores que no van a funcionar.
 */

export class ProviderError extends Error {
  constructor(message, { provider, model, status = null, code = null, retryable = false, cause } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

/** Error de negocio: no hay ningún proveedor operativo ahora mismo. */
export class AiUnavailableError extends Error {
  constructor(message, { attempts = [] } = {}) {
    super(message);
    this.name = 'AiUnavailableError';
    this.isUnavailable = true;
    this.attempts = attempts;
  }
}

const PATRONES_TRANSIENTOS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'high demand',
  'overloaded',
  'resource_exhausted',
  'resource exhausted',
  'unavailable',
  'deadline exceeded',
  'timeout',
  'timed out',
  'etimedout',
  'econnreset',
  'econnrefused',
  'socket hang up',
  'fetch failed',
  'network',
  'overloaded_error',
  'server_error',
  'internal error',
  'service unavailable',
  'temporarily unavailable',
  'capacity',
  'try again later',
];

/**
 * Errores que NO tienen sentido reintentar: hay que cambiar de modelo/provider
 * de inmediato. Un modelo inexistente o sin acceso nunca aparecerá al
 * reintentarlo, y sin esta clasificación se gastarían 3 intentos por modelo.
 */
const PATRONES_NO_REINTENTABLES = [
  'does not exist',
  'do not have access',
  'model_not_found',
  'model not found',
  'no longer available',
  'is not found for api version',
  'unsupported model',
  'invalid model',
  'unknown model',
];

const ESTADOS_TRANSIENTOS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export function isRetryableStatus(status) {
  return typeof status === 'number' && ESTADOS_TRANSIENTOS.has(status);
}

/** ¿El error indica que ese modelo no existe o no está disponible? */
export function isModelUnavailableError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    error?.code === 'MODEL_UNAVAILABLE' ||
    PATRONES_NO_REINTENTABLES.some((p) => msg.includes(p))
  );
}

export function isMissingKeyError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    error?.code === 'MISSING_API_KEY' ||
    msg.includes('api key') ||
    msg.includes('api_key') ||
    msg.includes('apikey') ||
    msg.includes('unauthorized') ||
    msg.includes('401')
  );
}

/** Envuelve cualquier excepción del SDK/fetch en un ProviderError clasificado. */
export function toProviderError(error, { provider, model }) {
  if (error instanceof ProviderError) return error;

  const message = error?.message || String(error);
  const status = extractStatus(error);
  const code = error?.code || error?.cause?.code || null;
  const lower = message.toLowerCase();

  if (isMissingKeyError(error)) {
    return new ProviderError(`API key de ${provider} ausente o inválida: ${message}`, {
      provider, model, status: status ?? 401, code, retryable: false, cause: error,
    });
  }

  if (lower.includes('quota exceeded') || lower.includes('exceeded your current quota') || lower.includes('insufficient_quota')) {
    return new ProviderError(`Cuota de ${provider} agotada: ${message}`, {
      provider, model, status: status ?? 429, code: 'QUOTA_EXCEEDED', retryable: false, cause: error,
    });
  }

  // Modelo caído/no disponible: definitivo, se prueba el siguiente de la cascada.
  if (isModelUnavailableError(error)) {
    return new ProviderError(`El modelo "${model}" de ${provider} no está disponible: ${message}`, {
      provider, model, status, code: code || 'MODEL_UNAVAILABLE', retryable: false, cause: error,
    });
  }

  const retryable =
    isRetryableStatus(status) ||
    (status === 400 && PATRONES_TRANSIENTOS.some((p) => lower.includes(p))) ||
    PATRONES_TRANSIENTOS.some((p) => lower.includes(p));

  return new ProviderError(message, { provider, model, status, code, retryable, cause: error });
}

function extractStatus(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.response?.statusCode,
    error?.cause?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return Number(candidate);
  }

  // Los SDKs suelen incrustar el código en el mensaje, ej: "[429 Too Many Requests]"
  const match = error?.message?.match(/\[?(\d{3})\s/);
  if (match) return Number(match[1]);

  return null;
}
