import { NextResponse } from 'next/server';
import { extraerTexto, detectarApartados } from '@/lib/documento';
import { extraerPdfConTablas } from '@/lib/pdfLayout';
export const runtime = 'nodejs';
export const maxDuration = 120;
const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'Selecciona un archivo.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo supera el límite de 30 MB.' }, { status: 413 });
    if (!/\.(pdf|docx)$/i.test(file.name)) return NextResponse.json({ error: 'Solo se admiten PDF y Word (.docx).' }, { status: 415 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdf = /\.pdf$/i.test(file.name);
    if (pdf ? !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')) : buffer.subarray(0, 2).toString() !== 'PK') {
      return NextResponse.json({ error: 'El contenido no corresponde al formato del archivo.' }, { status: 415 });
    }
    const { texto, formato, tablas = {}, avisos = [] } = pdf ? await extraerPdfConTablas(buffer) : await extraerTexto(buffer, file.name);
    if(!texto.trim()) throw new Error('Documento sin texto extraíble.');
    const apartados = detectarApartados(texto);
    return NextResponse.json({ text: texto, formato, tablas, avisos, caracteres: texto.length, apartados, modulos: apartados });
  } catch (error) {
    console.error('Error de extracción:', error);
    return NextResponse.json({ error: 'No se pudo leer el documento. Comprueba que contiene texto y que no está protegido ni dañado.' }, { status: 422 });
  }
}
export async function GET() { return NextResponse.json({ formatos: ['pdf', 'docx'], maxBytes: MAX_BYTES }); }
