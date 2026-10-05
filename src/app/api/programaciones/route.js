import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';

export async function GET() {
  try {
    const programaciones = await programacionDAO.findAll();
    return NextResponse.json(programaciones);
  } catch (error) {
    console.error("Error GET /api/programaciones:", error);
    return NextResponse.json({ error: "Error al obtener programaciones." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Validación súper básica
    if (!body || !body.modulo || !body.secciones) {
      return NextResponse.json({ error: "El JSON proporcionado no tiene el formato correcto." }, { status: 400 });
    }

    const nuevaProgramacion = await programacionDAO.create(body);
    return NextResponse.json(nuevaProgramacion, { status: 201 });
  } catch (error) {
    console.error("Error POST /api/programaciones:", error);
    return NextResponse.json({ error: "Error al guardar la programación." }, { status: 500 });
  }
}
