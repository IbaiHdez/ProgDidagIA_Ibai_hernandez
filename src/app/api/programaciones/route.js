import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';
import { validarProgramacion } from '@/lib/validacion';
import { resumenizar } from '@/lib/estado';
export async function GET() {
  try { return NextResponse.json((await programacionDAO.findAll()).map(resumenizar)); }
  catch (error) { console.error(error); return NextResponse.json({ error: 'No se pudo conectar con la base de datos.' }, { status: 503 }); }
}
export async function POST(request) {
  try {
    const data = validarProgramacion(await request.json());
    return NextResponse.json(await programacionDAO.create(data), { status: 201 });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 503);
    return NextResponse.json({ error: status === 400 ? error.message : 'No se pudo guardar. Comprueba la conexión a la base de datos.' }, { status });
  }
}
