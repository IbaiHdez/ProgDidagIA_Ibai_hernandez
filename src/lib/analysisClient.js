/** Sondeo independiente de React: errores y cancelación siempre llegan al llamador. */
export async function esperarAnalisis(jobId, { signal, onProgress, fetcher = fetch, intervalo = 2000, timeoutMs = 300000 } = {}) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    signal?.throwIfAborted();
    const res = await fetcher(`/api/analyze?jobId=${encodeURIComponent(jobId)}`, { signal, cache: 'no-store' });
    const job = await res.json();
    if (!res.ok) throw new Error(typeof job.error === 'string' ? job.error : 'No se pudo consultar el análisis.');
    if (job.progreso) onProgress?.(job.progreso);
    if (job.estado === 'listo') return job;
    if (job.estado === 'error') throw new Error(job.error?.message || 'El análisis ha fallado.');
    if (job.estado === 'cancelado') throw new DOMException('Análisis cancelado.', 'AbortError');
    await new Promise((resolve, reject) => {
      const terminar = () => { signal?.removeEventListener('abort', cancelar); resolve(); };
      const timer = setTimeout(terminar, intervalo);
      const cancelar = () => { clearTimeout(timer); reject(signal.reason || new DOMException('Cancelado', 'AbortError')); };
      signal?.addEventListener('abort', cancelar, { once: true });
      if (signal?.aborted) cancelar();
    });
  }
  throw new Error('El análisis ha tardado demasiado. Prueba con un apartado más pequeño.');
}
