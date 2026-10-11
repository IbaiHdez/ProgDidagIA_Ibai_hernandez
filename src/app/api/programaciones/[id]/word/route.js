import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';
import { idValido, nombreDescarga } from '@/lib/validacion';
import { generateWordDocument } from '@/lib/wordTemplate';
import { Packer } from 'docx';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(request, { params }) {
  const { id } = await params;
  if (!idValido(id)) return NextResponse.json({ error: 'Programación no encontrada.' }, { status: 404 });
  try {
    const data = await programacionDAO.findById(id);
    if (!data) return NextResponse.json({ error: 'Programación no encontrada.' }, { status: 404 });
    const buffer = await Packer.toBuffer(generateWordDocument(data));
    // La marca de exportación no debe impedir la descarga si falla.
    try { await programacionDAO.marcarExportada(id); } catch (e) { console.error('No se pudo registrar la exportación:', e); }
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${nombreDescarga(data.modulo, 'docx')}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error exportando word:', error);
    return NextResponse.json({ error: 'No se pudo generar el documento. Inténtalo de nuevo.' }, { status: 500 });
  }
}
