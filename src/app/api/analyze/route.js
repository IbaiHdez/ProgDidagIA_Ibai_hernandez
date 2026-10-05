import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { analizarDocumentoFragmentado, estadoProveedores } from '@/lib/ai';
import { normalizarTexto, recortarApartado } from '@/lib/estructura';
import { validarTablasImportadas } from '@/lib/validacion';
import { separarTablas } from '@/lib/tablasOriginales';

export const runtime = 'nodejs';
export const maxDuration = 300;
const trabajos = (globalThis.__progdidactaiJobs ||= new Map());
const TTL = 30 * 60 * 1000;
const responder = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function limpiar() {
  for (const [id, job] of trabajos) if (Date.now() - job.creadoEn > TTL) {
    job.controlador?.abort(); trabajos.delete(id);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return responder({ error: 'Se esperaba una petición JSON.' }, 400); }
  if (typeof body?.text !== 'string' || !body.text.trim()) return responder({ error: 'Falta el texto del documento.' }, 400);
  if (body.text.length > 2_000_000) return responder({ error: 'El documento supera los dos millones de caracteres. Divide el archivo.' }, 413);
  const scope = body.scope || (body.moduleCode ? 'apartado' : 'documento');
  if (!['documento', 'apartado'].includes(scope)) return responder({ error: 'Alcance de análisis inválido.' }, 400);
  let text = normalizarTexto(body.text), moduleCode = null;
  if (scope === 'apartado') {
    const seleccion = recortarApartado(text, body.sectionId || body.moduleCode);
    if (!seleccion.encontrado) return responder({ error: 'El apartado seleccionado ya no existe. Revisa la selección.' }, 422);
    text = seleccion.texto; moduleCode = seleccion.apartado.codigo || seleccion.apartado.titulo;
  }
  let tablas;
  try { tablas=validarTablasImportadas(body.tablas); separarTablas(text,tablas); }
  catch(error) {return responder({error:error.message},422);}
  limpiar();
  if ([...trabajos.values()].filter((j) => ['pendiente', 'analizando'].includes(j.estado)).length >= 2) {
    return responder({ error: 'Ya hay dos análisis en curso. Espera a que termine uno o cancélalo.' }, 429);
  }
  const jobId = randomUUID(), controlador = new AbortController();
  const job = { estado: 'pendiente', progreso: null, resultado: null, error: null, meta: null, creadoEn: Date.now(), controlador };
  trabajos.set(jobId, job);
  after(async () => {
    const timeout = setTimeout(() => controlador.abort(new Error('El análisis superó el límite de tiempo. Prueba con un apartado más pequeño.')), 270_000);
    try {
      controlador.signal.throwIfAborted(); job.estado = 'analizando';
      const { data, meta } = await analizarDocumentoFragmentado(text, {
        moduleCode, nombreDocumento: typeof body.nombreDocumento === 'string' ? body.nombreDocumento.slice(0, 250) : '',
        signal: controlador.signal,
        tablas, usarIA: body.usarIA !== false,
        onProgress: (progreso) => { job.progreso = progreso; },
      });
      controlador.signal.throwIfAborted();
      Object.assign(job, { estado: 'listo', resultado: data, meta });
    } catch (error) {
      if (job.estado !== 'cancelado') Object.assign(job, { estado: 'error', error: { message: error.message || 'No se pudo completar el análisis.' } });
    } finally { clearTimeout(timeout); }
  });
  return responder({ jobId, estado: 'pendiente' }, 202);
}

export async function GET(request) {
  limpiar();
  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) {
    const providers = estadoProveedores();
    return responder({ providers, operativo: providers.some((p) => p.activo && p.circuito === 'operativo') });
  }
  const job = trabajos.get(jobId);
  if (!job) return responder({ error: 'El análisis ha caducado o el servidor se ha reiniciado. Vuelve a iniciarlo.' }, 404);
  const { estado, progreso, resultado, error, meta } = job;
  return responder({ jobId, estado, progreso, resultado, error, meta });
}

export async function DELETE(request) {
  const job = trabajos.get(new URL(request.url).searchParams.get('jobId'));
  if (!job) return responder({ error: 'Análisis no encontrado.' }, 404);
  if (['pendiente', 'analizando'].includes(job.estado)) { job.estado = 'cancelado'; job.controlador.abort(); }
  return responder({ estado: job.estado });
}
