# ProgDidactAI

Aplicación para importar programaciones didácticas en PDF o DOCX, conservar su estructura, organizar el contenido con IA, revisarlo, guardarlo en MongoDB y exportarlo a PDF o Word.

## Instalación

Requisitos: Node.js 20.19 o posterior compatible con las dependencias, npm y MongoDB local o Atlas. Las versiones exactas están fijadas en `package-lock.json`.

```bash
npm ci
```

Copia `.env.example` a `.env.local` y configura `MONGODB_URI`. Para la estructuración automática añade al menos `GEMINI_API_KEY` o `GROQ_API_KEY`. No publiques tus credenciales.

```bash
npm run dev
```

Abre http://localhost:3000. Para producción local:

```bash
npm run build
npm start
```

La interfaz usa tipografías del sistema: compilar no necesita descargar Google Fonts. Puppeteer necesita su instalación de Chrome for Testing para exportar PDF (se descarga normalmente al instalar sus dependencias).

## Uso

1. Sube un PDF con texto o un archivo DOCX, de hasta 30 MB. Los PDF escaneados requieren OCR previo.
2. Revisa el listado de apartados. Se muestran todos los niveles detectados y puedes buscar por número o título.
3. Elige **Documento completo** o un apartado con sus descendientes. La selección usa posiciones del texto; los errores de numeración del original se conservan.
4. Si la extracción ha separado o confundido un encabezado, abre **Ver texto extraído y corregir encabezados**, activa las correcciones y pulsa **Aplicar correcciones**. El índice se recalcula.
5. Pulsa **Abrir conservando las tablas**. Este modo no necesita IA: mantiene las tablas detectadas y organiza el texto en párrafos. Si quieres organizar también el texto con IA, activa la casilla opcional. Las tablas originales quedan protegidas en ambos modos. Puedes cancelar; los errores vuelven a la selección conservando el documento.
6. Revisa los bloques de texto, listas y tablas. Los apartados que conservan texto sin estructurar quedan marcados **Por revisar**.
7. Guarda. Puedes volver a modificar el contenido y guardar otra vez, incluso con Ctrl/Cmd+S. Las exportaciones se habilitan cuando la versión visible está guardada.
8. Desde **Mis programaciones**, abre, busca, exporta o elimina los documentos guardados.

## Estructura y conservación del contenido

`src/lib/estructura.js` detecta encabezados de distintas profundidades, algunos títulos sin número y títulos partidos en dos líneas. Descarta entradas de índice con puntos guía y evita confundir notas decimales como `0.75` con apartados. Cada encabezado tiene una identidad basada en su posición; dos códigos iguales pueden representar secciones distintas.

La detección es heurística. Documentos con diseños inusuales, columnas o encabezados ambiguos requieren revisar el listado o corregir el texto extraído. No se promete reconstrucción visual idéntica del PDF original.

`src/lib/ai/fragmentar.js` crea un plan por secciones. Los apartados pequeños viajan juntos; los grandes se dividen en partes acotadas que conservan su identidad. No hay solapamiento ni deduplicación que descarte continuaciones. Prioriza los límites de unidades o fichas numeradas (sin códigos o nombres específicos del documento) y los párrafos antes de cortar una tabla por tamaño. Incluso los párrafos sin saltos tienen un límite de tamaño. Las pruebas reconstruyen el texto de todas las partes para comprobar que no se pierde contenido.

La IA recibe identificadores de apartado y debe devolver bloques asociados a ellos. El servidor conserva los títulos y el orden de origen. Compara los términos y cifras del texto fuente normalizando diferencias de formato (palabras partidas, viñetas extraídas, cabeceras repetidas o generadas). No acepta resúmenes, omisiones del cuerpo ni cifras alteradas. Si detecta diferencias, hace una segunda pasada acotada sobre las partes afectadas, indicando los términos pendientes; si no consigue verificarlas, conserva el original y explica el motivo. Cada solicitud tiene un límite y el análisis dispone de un presupuesto total de cuatro minutos: si lo agota, devuelve los apartados completados y conserva como texto los pendientes. La cancelación explícita del usuario sí detiene el trabajo. Esta comprobación no equivale a una validación semántica: no demuestra que cada dato se haya colocado en la celda correcta. Cada apartado conserva además su texto original en MongoDB: puedes compararlo o restaurarlo desde el editor. Un resultado sin IA sigue siendo editable, pero puede necesitar reconstrucción manual de tablas.

**Documento completo** incluye todo el archivo, aunque empiece a mitad de un módulo o termine entrando en otro. El texto anterior al primer encabezado se conserva como **Contenido inicial**. Para exportar solo DWES, selecciona su encabezado `10.2`.

## Tablas en PDF y Word

Ambas exportaciones usan un cálculo común de anchos: las columnas de descripciones reciben más espacio que las de cifras o marcas. Mantienen filas, columnas, celdas vacías y saltos internos; repiten las cabeceras entre páginas y permiten continuar las filas demasiado largas. Los rótulos originales se exportan como cabecera de tabla (celda combinada en Word). No se deduplican filas del cuerpo.

La importación de PDF analiza también su geometría: detecta cuadrículas con bordes trazados o dibujados mediante rectángulos finos. Conserva el contenido de las celdas, sus combinaciones, anchos relativos y fondos detectados. Las tablas viajan como bloques protegidos y nunca se envían a la IA para que las reescriba. El editor permite modificar sus celdas manteniendo el diseño; para cambiar filas o columnas, ofrece una conversión explícita a tabla simple.

La reconstrucción no es una copia visual exacta: las tablas sin bordes o con geometría no reconocible pueden quedar como texto; las imágenes, fuentes y saltos de página originales no se reproducen automáticamente. Los PDF escaneados necesitan OCR externo. DOCX mantiene por ahora su ruta de extracción de texto. Si falla el análisis geométrico de una página, se conserva su texto y se muestra un aviso.

El adaptador `src/lib/pdfLayout.js` utiliza el cargador y las primitivas geométricas de `pdf-parse` y los operadores de PDF.js. Sus versiones están fijadas a `2.4.5` y `5.4.296`; al actualizarlas deben ejecutarse las regresiones de geometría y conservación del texto.

## IA y configuración

Gemini y Groq se prueban en cascada según la configuración. Los modelos indicados son valores configurados, no una garantía de disponibilidad en todas las cuentas. Cambia los identificadores si el proveedor los retira o tu cuenta no tiene acceso.

| Variable | Valor predeterminado | Función |
| --- | --- | --- |
| `AI_PROVIDER_ORDER` | `gemini,groq` | Orden de proveedores |
| `GEMINI_MODELS` | `gemini-3.8-flash,gemini-3.5-flash-lite` | Modelos de Gemini |
| `GROQ_MODELS` | `openai/gpt-oss-120b,openai/gpt-oss-20b` | Modelos de Groq |
| `AI_MAX_ATTEMPTS` | `3` | Intentos por candidato |
| `AI_ERROR_COOLDOWN_MS` | `2000` | Base de la espera entre intentos |
| `AI_MAX_BACKOFF_MS` | `8000` | Espera máxima |
| `AI_TIMEOUT_MS` | Groq: `120000`; Gemini: `180000` | Tiempo de una petición |
| `GROQ_MAX_TOKENS` | `32768` | Límite de salida de Groq |
| `GEMINI_MAX_TOKENS` | `65536` | Límite de salida de Gemini |
| `AI_CHUNK_CHARS` | `14000` | Presupuesto por fragmento; mínimo 512 |

Las respuestas se validan y normalizan. Groq puede degradar de `json_schema` a `json_object` y después a instrucciones de formato. El circuito de cada proveedor se enfría tras fallos transitorios reiterados. Los errores definitivos pasan al siguiente candidato.

## Arquitectura

```text
React → rutas API de Next.js
  ├─ Extracción PDF/DOCX → estructura → selección
  ├─ Plan de fragmentos → Gemini/Groq → revisión de conservación
  └─ Editor → validación → ProgramacionDAO → MongoDB
                                            └─ PDF / DOCX
```

Datos principales: `{ modulo: { codigo, nombre, curso, profesor }, secciones: [{ sourceId, codigo, titulo, nivel, orden, revisar, textoOriginal, bloques }] }`. Los bloques son de tipo `texto`, `lista` o `tabla`; las tablas admiten un `titulo` opcional y metadatos `diseno` para la geometría original, conservados en el editor, MongoDB y ambas exportaciones. Se validan los límites y combinaciones de celdas para impedir que oculten contenido. Los datos de entrada se limitan a campos permitidos antes de llegar al DAO.

Rutas principales:

| Ruta | Métodos | Uso |
| --- | --- | --- |
| `/api/extract` | POST | Extraer texto y listar apartados |
| `/api/analyze` | POST / GET / DELETE | Iniciar, consultar y cancelar un análisis |
| `/api/programaciones` | GET / POST | Listar y crear |
| `/api/programaciones/:id` | GET / PUT / DELETE | Leer, editar y eliminar |
| `/api/programaciones/:id/pdf` | GET | Exportar PDF |
| `/api/programaciones/:id/word` | GET | Exportar Word |

## Exportaciones

PDF: portada con los datos del documento, índice con enlaces, títulos jerárquicos, tablas y páginas numeradas. Se escapa el contenido HTML y se deshabilitan JavaScript y peticiones HTTP externas durante el renderizado.

Word: documento nativo editable con portada, estilos de título, tabla de contenido y numeración. Word puede pedir actualizar los campos al abrirlo; acepta la actualización para calcular las páginas del índice.

## Comprobaciones

```bash
npm test
npm run lint
npm run build
```

Los tests de proveedores usan respuestas simuladas y no consumen cuota ni requieren claves reales. Cubren cascada, formatos de respuesta, normalización, conservación de fragmentos, selección completa/parcial, errores del sondeo, validación y escape HTML.

Si está presente `PD_DAW_25-26_DWES.pdf`, se ejecutan también las regresiones del caso real: 23 títulos, 20 encabezados al seleccionar DWES, conservación de numeración irregular y reconstrucción completa de los fragmentos. Se comprueban además 51 tablas originales, 25 en el apartado de situaciones de aprendizaje, y la igualdad de todos los términos y cifras respecto a la extracción de texto. Si falta el archivo, se omiten estas pruebas del caso real; se mantienen las pruebas sintéticas de geometría, validación y exportación.

## Límites del despliegue actual

- Aplicación de un único usuario o entorno local de confianza. No tiene autenticación ni aislamiento de documentos por usuario. Hace falta añadirlos antes de publicarla en Internet.
- Los análisis viven en memoria de una única instancia. Caducan a los 30 minutos y se pierden al reiniciar el servidor. Hay dos análisis simultáneos como máximo y un límite de ejecución de 270 segundos. Para procesos mayores o varias instancias, hace falta una cola persistente y un worker.
- MongoDB guarda la última versión de cada programación; no se implementa historial de versiones ni edición colaborativa.
- Se importa un archivo cada vez. Un archivo puede contener varios módulos y exportarse completo; no hay consolidación de varios registros guardados en un único archivo.
- La calidad de tablas y contenido extraído debe revisarse antes de una entrega oficial. Las plantillas son genéricas y no incluyen logotipos ni certificación institucional.

## Entrega

Excluye `node_modules`, `.next`, `.env.local` y archivos temporales del ZIP. Incluye fuentes, `package.json`, `package-lock.json`, `.env.example` sin credenciales y este README.

Autor: Ibai Hernández Ruiz.
