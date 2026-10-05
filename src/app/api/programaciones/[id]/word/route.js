import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';
import { generateWordDocument } from '@/lib/wordTemplate';
import { Packer } from 'docx';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const programacion = await programacionDAO.findById(id);

    if (!programacion) {
      return NextResponse.json({ error: "Programación no encontrada." }, { status: 404 });
    }

    // Generar documento Word usando docx
    const doc = generateWordDocument(programacion);
    
    // Convertir el documento a un buffer
    const buffer = await Packer.toBuffer(doc);

    // Nombre del archivo
    const safeName = (programacion.modulo?.nombre || 'programacion')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const codigo = programacion.modulo?.codigo || '0000';
    const filename = `${codigo}_${safeName}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error(`Error GET /api/programaciones/${(await params).id}/word:`, error);
    return NextResponse.json({ error: "Error al generar el documento Word." }, { status: 500 });
  }
}
