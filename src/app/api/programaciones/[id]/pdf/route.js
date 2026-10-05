import { NextResponse } from 'next/server';
import { programacionDAO } from '@/dao/programacionDAO';
import { generateHTMLTemplate } from '@/lib/pdfTemplate';
import puppeteer from 'puppeteer';

export async function GET(request, { params }) {
  let browser;
  try {
    const { id } = await params;
    const programacion = await programacionDAO.findById(id);

    if (!programacion) {
      return NextResponse.json({ error: "Programación no encontrada." }, { status: 404 });
    }

    // Convertimos JSON a HTML usando la plantilla
    const htmlContent = generateHTMLTemplate(programacion);

    // Arrancamos Puppeteer
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Inyectamos el HTML
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1.5cm',
        right: '1.5cm',
        bottom: '1.5cm',
        left: '1.5cm'
      },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:10px; color:#000; padding:0;">
          <span class="pageNumber"></span>
        </div>`
    });

    await browser.close();

    // Nombre del archivo seguro (quitamos espacios y caracteres raros)
    const safeName = (programacion.modulo?.nombre || 'programacion')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const codigo = programacion.modulo?.codigo || '0000';
    const filename = `${codigo}_${safeName}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error(`Error GET /api/programaciones/${(await params).id}/pdf:`, error);
    return NextResponse.json({ error: "Error al generar el PDF." }, { status: 500 });
  }
}
