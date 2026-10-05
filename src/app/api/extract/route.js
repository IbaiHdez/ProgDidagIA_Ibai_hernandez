import { NextResponse } from 'next/server';
import { extraerTexto, detectarModulos, recortarModulo } from '@/lib/documento';

// Extracción de PDF/Word de documentos grandes.
export const maxDuration = 120;

const FORMATOS_ACEPTADOS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const moduleCode = (formData.get('moduleCode') || '').toString().trim();

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No se ha subido ningún archivo.' }, { status: 400 });
    }

    const nombre = file.name || '';
    const buffer = Buffer.from(await file.arrayBuffer());

    // pdf-parse se traga cualquier cosa, así que validamos el tipo antes.
    const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(nombre);
    const esDocx = FORMATOS_ACEPTADOS[file.type] === 'docx' || /\.docx$/i.test(nombre);

    if (!esPdf && !esDocx) {
      return NextResponse.json(
        { error: 'Formato no admitido. Sube un archivo PDF o Word (.docx).' },
        { status: 415 }
      );
    }

    const { texto, formato } = await extraerTexto(buffer, nombre);
    const modulos = detectarModulos(texto);

    let resultado = { texto, modulo: null, recortado: false };

    if (moduleCode) {
      const { texto: recortado, encontrado, titulo } = recortarModulo(texto, moduleCode);
      resultado = {
        texto: recortado,
        modulo: { codigo: moduleCode, titulo, encontrado },
        recortado: encontrado,
      };
    }

    return NextResponse.json({
      text: resultado.texto,
      formato,
      caracteres: resultado.texto.length,
      modulos,
      modulo: resultado.modulo,
      recortado: resultado.recortado,
    });
  } catch (error) {
    console.error('Error parsing document:', error);
    return NextResponse.json(
      { error: error.message || 'Hubo un error interno al procesar el documento.' },
      { status: 500 }
    );
  }
}

/** GET devuelve los formatos soportados, útil para el frontend. */
export async function GET() {
  return NextResponse.json({
    formatos: ['pdf', 'docx'],
    aceptaModuleCode: true,
  });
}