export function generateHTMLTemplate(data) {
  const { secciones } = data;

  // Renderiza los bloques de cada sección
  const renderBloques = (bloques) => {
    if (!bloques || !Array.isArray(bloques)) return '';
    return bloques.map(b => {
      if (b.tipo === 'texto') {
        return `<div class="bloque-texto">${b.texto.replace(/\n/g, '<br/>')}</div>`;
      }
      if (b.tipo === 'lista') {
        const itemsHtml = (b.items || []).map(item => `<li>${item}</li>`).join('');
        return `<ul class="bloque-lista">${itemsHtml}</ul>`;
      }
      if (b.tipo === 'tabla') {
        const headerHtml = (b.columnas || []).map(col => `<th>${col}</th>`).join('');
        const rowsHtml = (b.filas || []).map(fila => {
          const cells = fila.map(cell => `<td>${cell.replace(/\n/g, '<br/>')}</td>`).join('');
          return `<tr>${cells}</tr>`;
        }).join('');
        
        return `
          <table class="bloque-tabla">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `;
      }
      return '';
    }).join('');
  };

  // Renderiza recursivamente/secuencialmente las secciones
  const renderSecciones = (seccs) => {
    if (!seccs || !Array.isArray(seccs)) return '';
    return seccs.map(s => {
      // Ajustamos heading tag
      const headingTag = `h${Math.min(s.nivel + 1, 6)}`;
      
      // Construcción del título EXACTAMENTE como pide el usuario
      let title = '';
      if (s.codigo) {
        let cod = String(s.codigo).trim();
        // Solo añadimos punto si el usuario no lo ha puesto y si realmente es un código jerárquico
        if (!cod.endsWith('.')) cod += '.';
        title = `${cod} ${s.titulo || ''}`.trim();
      } else {
        title = (s.titulo || '').trim();
      }
      
      return `
        <div class="seccion">
          <${headingTag} class="seccion-titulo nivel-${s.nivel}">${title}</${headingTag}>
          <div class="seccion-contenido">
            ${renderBloques(s.bloques)}
          </div>
        </div>
      `;
    }).join('');
  };

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Programación</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #000;
          line-height: 1.35;
          margin: 0;
          padding: 0;
          font-size: 11pt; /* Aumentada legibilidad */
        }
        
        /* Secciones y contenido */
        .seccion {
          margin-bottom: 20px;
        }
        .seccion-titulo {
          color: #1a365d; /* Azul oscuro institucional */
          margin-top: 24px;
          margin-bottom: 12px;
          font-family: Arial, sans-serif;
          font-weight: bold;
        }
        .nivel-1 { font-size: 14pt; margin-top: 32px; border-bottom: 2px solid #1a365d; padding-bottom: 4px; }
        .nivel-2 { font-size: 13pt; margin-top: 26px; border-bottom: 1px solid #cbd5e0; padding-bottom: 4px; }
        .nivel-3 { font-size: 12pt; margin-top: 20px; }
        .nivel-4 { font-size: 11pt; margin-top: 16px; }
        
        .bloque-texto {
          margin-bottom: 14px;
          text-align: justify;
          text-indent: 0;
        }
        
        .bloque-lista {
          margin-bottom: 14px;
          margin-top: 8px;
          padding-left: 24px;
        }
        .bloque-lista li {
          margin-bottom: 6px;
          text-align: justify;
        }

        /* Tablas */
        .bloque-tabla {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          margin-top: 12px;
          table-layout: auto;
          break-inside: auto;
        }
        .bloque-tabla thead {
          display: table-header-group;
        }
        .bloque-tabla tbody {
          display: table-row-group;
        }
        .bloque-tabla tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .bloque-tabla th, .bloque-tabla td {
          border: 1px solid #718096; /* Bordes finos gris */
          padding: 8px 10px; /* Padding más cómodo */
          text-align: left;
          vertical-align: top;
          word-wrap: break-word;
          font-size: 10pt; /* Legible pero contenido */
        }
        .bloque-tabla th {
          background-color: #e2e8f0; /* Gris institucional claro */
          color: #1a202c;
          font-weight: bold;
        }
        .bloque-tabla td {
          background-color: #ffffff;
        }
      </style>
    </head>
    <body>
      <div class="contenido">
        ${renderSecciones(secciones)}
      </div>
    </body>
    </html>
  `;
}
