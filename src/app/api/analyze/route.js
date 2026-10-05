import { randomUUID } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { analizarDocumentoFragmentado, estadoProveedores } from '@/lib/ai';
import { recortarModulo } from '@/lib/documento';

// Analizar un módulo completo puede tardar varios minutos: sin límite artificial.
export const maxDuration = 300;

/**
 * Cola de análisis en memoria.
 *
 * El análisis de un documento largo puede tardar minutos. Si la ruta esperase
 * a terminar, el navegador se queda mirando una petición abierta sin saber qué
 * pasa. En su lugar la ruta responde al instante con un `jobId` y el trabajo
 * sigue en segundo plano (`after`), mientras el frontend va consultando el
 * progreso fragmento a fragmento.
 *
 * Vive en `globalThis` para no perderla con el Fast Refresh de Next.js.
 */
const trabajos = (globalThis.__progdidactaiJobs ||= new Map());

function actualizar(jobId, cambios) {
  const job = trabajos.get(jobId);
  if (job) trabajos.set(jobId, { ...job, ...cambios });
}

/** Crea el trabajo y lanza el análisis en segundo plano. */
export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida: se esperaba JSON.' }, { status: 400 });
  }

  const moduleCode = (body?.moduleCode || '').toString().trim() || null;
  let text = (body?.text || '').toString();

  if (!text.trim()) {
    return NextResponse.json({ error: 'Falta el texto extraído del documento' }, { status: 400 });
  }

  // Si el frontend no recortó el módulo, lo hacemos aquí: enviar el PDF entero
  // de un ciclo formativo mezcla apartados de módulos distintos.
  if (moduleCode) {
    const { texto, encontrado } = recortarModulo(text, moduleCode);
    if (encontrado) {
      console.log(`[IA] Recorte automático del módulo ${moduleCode}: ${text.length} -> ${texto.length} caracteres`);
      text = texto;
    } else {
      console.warn(`[IA] No se encontró el encabezado del módulo ${moduleCode}; se analiza el documento completo.`);
    }
  }

  const jobId = randomUUID();

  trabajos.set(jobId, {
    estado: 'pendiente',
    progreso: null,
    resultado: null,
    error: null,
    meta: null,
    creadoEn: Date.now(),
  });

  after(async () => {
    try {
      actualizar(jobId, { estado: 'analizando' });

      const { data, meta } = await analizarDocumentoFragmentado(text, {
        moduleCode,
        onProgress: (progreso) => actualizar(jobId, { progreso }),
      });

      console.log(
        `[IA] Trabajo ${jobId} completado con ${meta.proveedor}/${meta.modelo}` +
        (meta.fragmentos > 1 ? ` en ${meta.fragmentos} fragmentos` : '')
      );

      actualizar(jobId, { estado: 'listo', resultado: data, meta });

      // Los trabajos terminados se limpian solos para no filtrar memoria.
      setTimeout(() => trabajos.delete(jobId), 10 * 60 * 1000);
    } catch (error) {
      console.error(`[IA] Trabajo ${jobId} falló:`, error);

      actualizar(jobId, {
        estado: 'error',
        error: {
          message: error.message,
          isUnavailable: Boolean(error.isUnavailable),
          intentos: error.attempts || null,
        },
      });

      setTimeout(() => trabajos.delete(jobId), 10 * 60 * 1000);
    }
  });

  return NextResponse.json({ jobId, estado: 'pendiente' }, { status: 202 });
}

/**
 * GET /api/analyze            -> estado de los proveedores de IA.
 * GET /api/analyze?jobId=xxx  -> progreso y resultado de un análisis.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    const providers = estadoProveedores();
    return NextResponse.json({
      providers,
      operativo: providers.some((p) => p.activo && p.circuito === 'operativo'),
    });
  }

  const job = trabajos.get(jobId);

  if (!job) {
    return NextResponse.json(
      { estado: 'desconocido', error: 'El análisis ya no está en memoria. Vuelve a lanzarlo.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    jobId,
    estado: job.estado,
    progreso: job.progreso,
    resultado: job.resultado,
    error: job.error,
    meta: job.meta,
  });
}