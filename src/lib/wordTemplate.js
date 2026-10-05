import { calcularDisenoTabla } from './tableLayout.js';
import { mapaCeldas } from './tablasOriginales.js';
import { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle, 
  ShadingType,
  PageNumber,
  Footer,
  VerticalAlign,
  Header,
  TableOfContents,
  TableLayoutType
} from "docx";

export function generateWordDocument(data) {
  const { secciones, modulo = {} } = data;
  const nivelBase = Math.min(...secciones.map((s) => Number(s.nivel) || 1), 8);

  const children = [
    new Paragraph({ children: [new TextRun({ text: 'PROGRAMACIÓN DIDÁCTICA', size: 22, color: '64748b' })], spacing: { before: 1400, after: 400 } }),
    new Paragraph({ children: [new TextRun({ text: modulo.nombre || 'Documento completo', size: 52, bold: true, color: '19375a' })], spacing: { after: 600 } }),
    ...[['Código', modulo.codigo], ['Curso', modulo.curso], ['Profesorado', modulo.profesor]].filter(([,v]) => v).map(([k,v]) => new Paragraph({ children: [new TextRun({ text: k + ': ', bold: true }), new TextRun({ text: v })], spacing: { after: 200 } })),
    new Paragraph({ text: 'Índice de contenidos', pageBreakBefore: true, spacing: { after: 300 } }),
    new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-4' }),
    new Paragraph({ pageBreakBefore: true }),
  ];

  const parseTextWithLineBreaks = (text, options = {}) => {
    if (!text) return [new TextRun({ text: "", ...options })];
    const lines = text.split("\n");
    return lines.map((line, index) => {
      return new TextRun({
        text: line.trim(),
        break: index > 0 ? 1 : 0,
        ...options
      });
    });
  };

  const renderBloques = (bloques) => {
    if (!bloques || !Array.isArray(bloques)) return;
    bloques.forEach(b => {
      if (b.tipo === 'texto') {
        const lines = (b.texto || "").split("\n");
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed, size: 22 })],
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 120 }
              })
            );
          }
        });
        // Extra spacing after the text block
        children.push(new Paragraph({ spacing: { after: 100 } }));
      } else if (b.tipo === 'lista') {
        (b.items || []).forEach(item => {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item, size: 22 })],
              bullet: { level: 0 },
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 120 }
            })
          );
        });
        // Extra spacing after the list
        children.push(new Paragraph({ spacing: { after: 100 } }));
      } else if (b.tipo === 'tabla') {
        if(b.diseno?.origen==='pdf') {
          const d=calcularDisenoTabla(b), {celdas,cubiertas,estilos}=mapaCeldas(b);
          const anchos=d.anchos.map((a)=>Math.round(10206*a/100));
          anchos[anchos.length-1]=10206-anchos.slice(0,-1).reduce((a,b)=>a+b,0);
          if(b.titulo) children.push(new Paragraph({children:parseTextWithLineBreaks(b.titulo,{bold:true}),keepNext:true}));
          children.push(new Table({width:{size:10206,type:WidthType.DXA},columnWidths:anchos,layout:TableLayoutType.FIXED,
            rows:b.filas.map((fila,f)=>new TableRow({tableHeader:f<b.diseno.filasCabecera,cantSplit:!d.dividirFilas[f],children:fila.flatMap((valor,c)=>{
              const k=`${f}:${c}`;if(cubiertas.has(k))return [];
              const span=celdas.get(k)||{},e=estilos.get(k)||{};
              return [new TableCell({columnSpan:span.columnas||1,rowSpan:span.filas||1,
                width:{size:anchos.slice(c,c+(span.columnas||1)).reduce((a,b)=>a+b,0),type:WidthType.DXA},
                ...(e.fondo?{shading:{fill:e.fondo,type:ShadingType.CLEAR,color:'auto'}}:{}),
                verticalAlign:VerticalAlign.TOP,margins:{top:80,bottom:80,left:90,right:90},
                children:[new Paragraph({children:parseTextWithLineBreaks(valor,{size:d.fuente*2,bold:e.negrita||false,color:e.color||'111111'}),spacing:{after:0,line:250},widowControl:true})],
              })];
            })})),
            borders:Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map((k)=>[k,{style:BorderStyle.SINGLE,size:4,color:'555555'}])),
          }));
          children.push(new Paragraph({spacing:{after:100}}));
          return;
        }
        const tableRows = [];
        
        const diseno = calcularDisenoTabla(b);
        const anchoPagina = 10206; // A4 menos los márgenes laterales.
        const anchosTwips = diseno.anchos.map((p) => Math.round(anchoPagina * p / 100));
        anchosTwips[anchosTwips.length - 1] = anchoPagina - anchosTwips.slice(0, -1).reduce((s, n) => s + n, 0);
        const columnWidths = anchosTwips.map((size) => ({ size, type: WidthType.DXA }));

        if (b.titulo) tableRows.push(new TableRow({ tableHeader: true, cantSplit: true, children: [
          new TableCell({ columnSpan: b.columnas.length, width: { size: anchoPagina, type: WidthType.DXA },
            shading: { fill: '808080', type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 90, bottom: 90, left: 100, right: 100 },
            children: [new Paragraph({ children: parseTextWithLineBreaks(b.titulo, { bold: true, color: 'FFFFFF', size: diseno.fuente * 2 }), alignment: AlignmentType.CENTER, spacing: { after: 0 } })],
          }),
        ] }));

        // Header Row
        if (b.columnas && b.columnas.length > 0) {
          tableRows.push(
            new TableRow({
              tableHeader: true, // Repeat header row at the top of each page
              children: b.columnas.map((col, index) => {
                let cellAlignment = AlignmentType.LEFT;
                if (diseno.centradas[index]) {
                  cellAlignment = AlignmentType.CENTER;
                }
                
                return new TableCell({
                  children: [
                    new Paragraph({
                      children: [...parseTextWithLineBreaks(col, { bold: true, color: "111111", size: diseno.fuente * 2 })], // 10pt
                      alignment: cellAlignment,
                      spacing: { after: 0, line: 260 },
                      widowControl: true,
                    })
                  ],
                  width: columnWidths[index],
                  shading: {
                    fill: "dedede",
                    type: ShadingType.CLEAR,
                    color: "auto"
                  },
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                  verticalAlign: VerticalAlign.TOP,
                });
              })
            })
          );
        }

        // Body Rows
        if (b.filas && b.filas.length > 0) {
          b.filas.forEach((fila, filaIndex) => {
            tableRows.push(
              new TableRow({
                cantSplit: !diseno.dividirFilas[filaIndex], // Las filas mayores que una página deben poder continuar.
                children: fila.map((cell, index) => {
                  let cellAlignment = AlignmentType.LEFT;
                  if (diseno.centradas[index]) {
                    cellAlignment = AlignmentType.CENTER;
                  }
                  
                  return new TableCell({
                    children: [
                      new Paragraph({
                        // No split by line break for short table cells to avoid issues, just a single paragraph 
                        // but if there are newlines in a cell, we map them correctly
                        children: parseTextWithLineBreaks(cell, { size: diseno.fuente * 2 }), // 10pt
                        alignment: cellAlignment,
                        spacing: { after: 0, line: 260 },
                        widowControl: true,
                      })
                    ],
                    width: columnWidths[index],
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    verticalAlign: VerticalAlign.TOP,
                  });
                })
              })
            );
          });
        }

        if (tableRows.length > 0) {
          children.push(
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              layout: TableLayoutType.FIXED,
              columnWidths: anchosTwips,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
                insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "555555" },
              },
            })
          );
          children.push(new Paragraph({ spacing: { after: 200 } }));
        }
      }
    });
  };

  const renderSecciones = (seccs) => {
    if (!seccs || !Array.isArray(seccs)) return;
    seccs.forEach(s => {
      // Título
      let title = '';
      if (s.codigo) {
        let cod = String(s.codigo).trim();
        if (!cod.endsWith('.')) cod += '.';
        title = `${cod} ${s.titulo || ''}`.trim();
      } else {
        title = (s.titulo || '').trim();
      }

      let headingLevel = HeadingLevel.HEADING_4;
      let fontSize = 22; // 11pt
      let spaceBefore = 240;
      let spaceAfter = 120;
      let isBold = true;

      if (s.nivel - nivelBase + 1 === 1) {
        headingLevel = HeadingLevel.HEADING_1;
        fontSize = 28; // 14pt
        spaceBefore = 480;
        spaceAfter = 200;
      } else if (s.nivel - nivelBase + 1 === 2) {
        headingLevel = HeadingLevel.HEADING_2;
        fontSize = 26; // 13pt
        spaceBefore = 360;
      } else if (s.nivel - nivelBase + 1 === 3) {
        headingLevel = HeadingLevel.HEADING_3;
        fontSize = 24; // 12pt
        spaceBefore = 280;
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({ 
              text: title, 
              color: "1a365d", 
              bold: isBold,
              size: fontSize
            })
          ],
          heading: headingLevel,
          keepNext: true,
          spacing: { before: spaceBefore, after: spaceAfter }
        })
      );

      // Bloques
      renderBloques(s.bloques);
    });
  };

  // Start rendering
  renderSecciones(secciones);

  // Return Document instance
  return new Document({
    features: { updateFields: true },
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 850,    // approx 1.5 cm
              right: 850,
              bottom: 850,
              left: 850,
            }
          }
        },
        headers: {
          default: new Header({
            children: [] // No artificial header
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 20
                  })
                ]
              })
            ]
          })
        },
        children: children
      }
    ]
  });
}
