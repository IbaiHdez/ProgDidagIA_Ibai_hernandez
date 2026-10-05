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
  TableLayoutType
} from "docx";

export function generateWordDocument(data) {
  const { secciones } = data;

  const children = [];

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
        const tableRows = [];
        
        // Comprobar si es la tabla de 11 columnas (Situaciones de Aprendizaje)
        const is11Columns = b.columnas && b.columnas.length === 11;
        
        let columnWidths = [];
        if (is11Columns) {
          columnWidths = [
            { size: 7, type: WidthType.PERCENTAGE },
            { size: 39, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE },
            { size: 6, type: WidthType.PERCENTAGE }
          ];
        }

        // Header Row
        if (b.columnas && b.columnas.length > 0) {
          tableRows.push(
            new TableRow({
              tableHeader: true, // Repeat header row at the top of each page
              children: b.columnas.map((col, index) => {
                let cellAlignment = AlignmentType.LEFT;
                if (is11Columns && (index === 0 || index > 1)) {
                  cellAlignment = AlignmentType.CENTER;
                }
                
                return new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: col, bold: true, color: "1a202c", size: 20 })], // 10pt
                      alignment: cellAlignment
                    })
                  ],
                  width: is11Columns ? columnWidths[index] : undefined,
                  shading: {
                    fill: "e2e8f0",
                    type: ShadingType.CLEAR,
                    color: "auto"
                  },
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                  verticalAlign: VerticalAlign.CENTER,
                });
              })
            })
          );
        }

        // Body Rows
        if (b.filas && b.filas.length > 0) {
          b.filas.forEach(fila => {
            tableRows.push(
              new TableRow({
                cantSplit: true, // Prevent row breaking across pages
                children: fila.map((cell, index) => {
                  let cellAlignment = AlignmentType.LEFT;
                  if (is11Columns && (index === 0 || index > 1)) {
                    cellAlignment = AlignmentType.CENTER;
                  }
                  
                  return new TableCell({
                    children: [
                      new Paragraph({
                        // No split by line break for short table cells to avoid issues, just a single paragraph 
                        // but if there are newlines in a cell, we map them correctly
                        children: parseTextWithLineBreaks(cell, { size: 20 }), // 10pt
                        alignment: cellAlignment
                      })
                    ],
                    width: is11Columns ? columnWidths[index] : undefined,
                    margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    verticalAlign: VerticalAlign.CENTER,
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
              layout: is11Columns ? TableLayoutType.FIXED : TableLayoutType.AUTOFIT,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
                left: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
                right: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "718096" },
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

      if (s.nivel === 1) {
        headingLevel = HeadingLevel.HEADING_1;
        fontSize = 28; // 14pt
        spaceBefore = 480;
        spaceAfter = 200;
      } else if (s.nivel === 2) {
        headingLevel = HeadingLevel.HEADING_2;
        fontSize = 26; // 13pt
        spaceBefore = 360;
      } else if (s.nivel === 3) {
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
    sections: [
      {
        properties: {
          page: {
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
