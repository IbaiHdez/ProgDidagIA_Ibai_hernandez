import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const programacion = await programacionDAO.findById(id);
    
    if (!programacion) {
      return NextResponse.json({ error: "Programación no encontrada." }, { status: 404 });
    }

    return NextResponse.json(programacion);
  } catch (error) {
    console.error(`Error GET /api/programaciones/${(await params).id}:`, error);
    return NextResponse.json({ error: "Error interno al obtener la programación." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || !body.modulo || !body.secciones) {
      return NextResponse.json({ error: "El JSON proporcionado no tiene el formato correcto." }, { status: 400 });
    }

    const actualizada = await programacionDAO.update(id, body);
    
    if (!actualizada) {
      return NextResponse.json({ error: "Programación no encontrada para actualizar." }, { status: 404 });
    }

    return NextResponse.json(actualizada);
  } catch (error) {
    console.error(`Error PUT /api/programaciones/${(await params).id}:`, error);
    return NextResponse.json({ error: "Error al actualizar la programación." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const borrada = await programacionDAO.delete(id);

    if (!borrada) {
      return NextResponse.json({ error: "Programación no encontrada para eliminar." }, { status: 404 });
    }

    return NextResponse.json({ message: "Eliminada correctamente." });
  } catch (error) {
    console.error(`Error DELETE /api/programaciones/${(await params).id}:`, error);
    return NextResponse.json({ error: "Error al eliminar la programación." }, { status: 500 });
  }
}
