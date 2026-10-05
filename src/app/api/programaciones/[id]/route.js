import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';
import { validarProgramacion, idValido } from '@/lib/validacion';
const respuestaError = (error) => NextResponse.json({ error: error.status === 400 ? error.message : 'No se pudo completar la operación con la base de datos.' }, { status: error.status || (error instanceof SyntaxError ? 400 : 503) });
const noExiste = () => NextResponse.json({ error: 'Programación no encontrada.' }, { status: 404 });
export async function GET(request, { params }) {
  const { id } = await params;
  if (!idValido(id)) return noExiste();
  try { const p = await programacionDAO.findById(id); return p ? NextResponse.json(p) : noExiste(); }
  catch (e) { return respuestaError(e); }
}
export async function PUT(request, { params }) {
  const { id } = await params;
  if (!idValido(id)) return noExiste();
  try { const data = validarProgramacion(await request.json()); const p = await programacionDAO.update(id, data); return p ? NextResponse.json(p) : noExiste(); }
  catch (e) { return respuestaError(e); }
}
export async function DELETE(request, { params }) {
  const { id } = await params;
  if (!idValido(id)) return noExiste();
  try { return await programacionDAO.delete(id) ? NextResponse.json({ message: 'Eliminada.' }) : noExiste(); }
  catch (e) { return respuestaError(e); }
}
