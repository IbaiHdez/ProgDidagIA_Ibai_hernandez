# ProgDidactAI

## Descripción
ProgDidactAI permite importar una programación didáctica en PDF o Word, analizarla mediante inteligencia artificial, transformarla en información estructurada editable, almacenarla en MongoDB y exportarla posteriormente a PDF y Word.

## Tecnologías utilizadas
- Next.js 16 (App Router) y React 19
- Tailwind CSS 4
- MongoDB Atlas y Mongoose
- **Groq API** y **Google Gemini** (con cascada automática entre ambos)
- pdf-parse, mammoth y docx
- Puppeteer

## Requisitos
- Node.js 20 o superior
- npm
- MongoDB local (o una cuenta en MongoDB Atlas)
- Al menos una API key gratuita: Groq (https://console.groq.com/keys) o Google AI Studio (https://aistudio.google.com/apikey)

## Instalación
Para instalar y configurar el proyecto, ejecuta los siguientes comandos en tu terminal:

```bash
git clone <url-del-repositorio>
cd ProgDidactAI
npm install
```

## Variables de entorno
Copia el archivo de ejemplo y edita tus credenciales:

```bash
cp .env.example .env.local
```

Obligatorias:
- `GROQ_API_KEY`: API key de Groq (https://console.groq.com/keys), motor de respaldo.
- `GEMINI_API_KEY`: API key de Google AI Studio (https://aistudio.google.com/apikey), motor principal.
- `MONGODB_URI`: cadena de conexión de MongoDB.

### Base de datos local (sin Atlas)

No necesitas Atlas para probar el proyecto. Si tienes MongoDB instalado:

```bash
# Ubuntu/Debian: arranca el servicio (ya viene escuchando en 127.0.0.1:27017)
sudo systemctl start mongod

# Comprueba que responde y crea la base de datos
mongosh "mongodb://127.0.0.1:27017/progdidactai" --eval 'db.runCommand({ping:1})'
```

Y en `.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/progdidactai
```

Para volver a Atlas, cambia esa misma variable por la cadena `mongodb+srv://...`.

Con **una sola** de las dos claves de IA la aplicación funciona: si falta la otra, la cascada simplemente la salta.

Opcionales (todo tiene un valor por defecto razonable):

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `AI_PROVIDER_ORDER` | `gemini,groq` | Orden en el que se prueban los motores. |
| `GROQ_MODELS` | `openai/gpt-oss-120b,openai/gpt-oss-20b` | Modelos de Groq a probar, en orden. |
| `GEMINI_MODELS` | `gemini-3.8-flash,gemini-3.5-flash-lite` | Modelos de Gemini a probar, en orden. |
| `AI_MAX_ATTEMPTS` | `3` | Reintentos por modelo antes de cambiar de motor. |
| `AI_ERROR_COOLDOWN_MS` | `2000` | Espera base del backoff exponencial entre reintentos. |
| `AI_MAX_BACKOFF_MS` | `8000` | Tope máximo de esa espera. |
| `AI_TIMEOUT_MS` | `120000` | Timeout por petición al proveedor. |
| `GROQ_MAX_TOKENS` | `32768` | Súbelo si algún módulo se trunca por longitud (máx. real: 65536). |
| `GEMINI_MAX_TOKENS` | `65536` | Ídem para Gemini. |
| `AI_CHUNK_CHARS` | `14000` | Caracteres por fragmento al trocear documentos largos. |

### Modelos verificados con las cuentas gratuitas

| Proveedor | Modelos | Notas |
| --- | --- | --- |
| Groq | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | `llama-3.3-70b-versatile` devuelve **404** (`does not exist or you do not have access`). |
| Gemini | `gemini-3.8-flash`, `gemini-3.5-flash-lite` | Los modelos 2.5 devuelven **404** para cuentas nuevas (`no longer available to new users`). `gemini-3.8-flash` da 503 con frecuencia por demanda alta, por eso la cascada y los reintentos son imprescindible. |

## Ejecutar en desarrollo
```bash
npm run dev
```
Y abre en tu navegador: [http://localhost:3000](http://localhost:3000)

## Funcionamiento
1. Nueva programación: accede al asistente para crear una nueva.
2. Subir documento: sube la programación en **PDF o Word (.docx)**, con clic o arrastrando.
3. Extraer: se detecta la jerarquía de módulos del documento (`10.1`, `10.2`...) y puedes elegir cuál procesar; la app recorta ese módulo automáticamente.
4. Analizar: la IA convierte el texto en JSON estructurado (apartados, listas y tablas).
5. Revisar y editar: utiliza el formulario dinámico para corregir lo necesario, incluidos los títulos y su numeración.
6. Guardar en MongoDB: guarda tu programación en la base de datos.
7. Consultar desde Mis programaciones: lista, edita, exporta o elimina cualquier programación.
8. Exportar PDF: documento con plantilla institucional (Puppeteer).
9. Exportar Word: documento DOCX totalmente editable.

## Inteligencia artificial: dos motores con cascada automática

Gemini se satura con mucha facilidad (`429`, `503`, "high demand"), así que la aplicación **nunca depende de un único proveedor**. El orquestador (`src/lib/ai/index.js`) recorre candidatos en cascada:

```
gemini/gemini-3.8-flash
  ↓
gemini/gemini-3.5-flash-lite
  ↓
groq/openai/gpt-oss-120b
  ↓
groq/openai/gpt-oss-20b
```

El orden se cambia con `AI_PROVIDER_ORDER`, y los modelos de cada proveedor con `GEMINI_MODELS` y `GROQ_MODELS`.

- **Reintentos con backoff exponencial + jitter** para errores transitorios (429, 5xx, errores de red, 503 "high demand") dentro del mismo modelo.
- **Salto inmediato** al siguiente candidato ante errores definitivos: modelo inexistente o sin acceso, credenciales inválidas, esquema rechazado o respuesta truncada. Un modelo que devuelve 404 no se reintenta: se pierde el tiempo.
- **Circuit breaker**: si un motor acumula 3 fallos seguidos se lo salta durante 30 s (hasta 5 min si sigue fallingando), para no encadenar reintentos mientras la API está caída.
- **Degradación de formato en Groq**: `json_schema` → `json_object` → esquema dentro del prompt, porque no todos los modelos de Groq aceptan salida estructurada.
- **Fragmentación**: los documentos largos se trocean por encabezados (`AI_CHUNK_CHARS`) y se analizan fragmento a fragmento, fusionando después los resultados. Si un fragmento falla, se conserva el resto y se avisa.
- **Saneado de la respuesta** (`src/lib/ai/sanitize.js`): aunque el JSON sea válido, los modelos inventan tipos. La app normaliza niveles, tipos de bloque, filas de tabla, vallas de markdown y arrays en la raíz antes de devolverlo al editor. Todos los proveedores terminan en la **misma estructura interna** `{ modulo, secciones }`, que es la que usan el editor, el DAO y las exportaciones.
- Si **todos** los candidatos fallan, la API responde `503` enumerando proveedor, modelo, motivo e intento de cada fallo.
- `GET /api/analyze` devuelve el estado de cada motor (configurado, listo o saturado) y la interfaz lo muestra en pantalla.

### Por qué el esquema de Groq es distinto al de Gemini

Groq exige que en modo `strict` **todas** las claves estén en `required`. Con un único objeto de bloque que declara a la vez `texto`, `items` y `columnas`/`filas`, el modelo tiene que rellenar los tres campos aunque no apliquen, mete filas dentro de `items` y la API rechaza la respuesta con:

```
Generated JSON does not match the expected schema ... expected object, but got arr
```

La solución (`src/lib/ai/schema.js`) es declarar `bloques` como una unión discriminada por `tipo`: cada variante solo contiene los campos de su tipo (`texto`, `items` o `columnas`+`filas`). El resultado es idéntico en ambos proveedores y el saneado lo unifica.

## Arquitectura
**Flujo de datos (backend):**
Frontend ↓ API Routes ↓ Servicios (IA / documentos) ↓ DAO ↓ MongoDB

**Flujo de transformación de documento:**
PDF/Word ↓ Extracción y recorte por jerarquía ↓ IA (Groq ⇄ Gemini) ↓ JSON saneado ↓ Formulario ↓ MongoDB ↓ PDF / Word

```
src/lib/
├── ai/
│   ├── index.js          # Orquestador: cascada, reintentos y diagnóstico
│   ├── config.js         # Proveedores y modelos desde variables de entorno
│   ├── errors.js         # Clasificación de errores reintentables/definitivos
│   ├── circuitBreaker.js # Circuit breaker por proveedor
│   ├── sanitize.js       # Saneado y validación del JSON de la IA
│   ├── schema.js         # Esquema de salida + prompts compartidos
│   └── providers/        # Implementación de Groq y de Gemini
└── documento.js          # Extracción de PDF/Word y recorte por módulo
```

## Patrón DAO
Las rutas API no acceden directamente a los modelos de Mongoose. Toda la lógica de persistencia se canaliza a través de un único `ProgramacionDAO`, separando así las responsabilidades.

## Exportaciones
- **PDF institucional:** plantilla HTML y renderizado headless con Puppeteer.
- **Word editable:** librería `docx` para generar un documento nativo y editable.

## Tests
Los tests simulan ambas APIs (no consumen cuota ni necesitan claves reales) y cubren la cascada, los reintentos, el circuit breaker, la degradación de formato, el saneado del JSON y el recorte de módulos:

```bash
npm test
```

## Estructura del proyecto
```
ProgDidactAI/
├── public/                 # Archivos estáticos
├── scripts/                # Tests de la capa de IA (npm test)
├── src/
│   ├── app/                # Rutas y páginas de Next.js (Frontend y API)
│   ├── components/         # Componentes React reutilizables (ProgramacionEditor)
│   ├── dao/                # Objetos de Acceso a Datos (ProgramacionDAO)
│   ├── lib/                # Capa de IA, extracción de documentos y plantillas
│   └── models/             # Esquemas de Mongoose
├── .env.example            # Variables de entorno de ejemplo
├── next.config.mjs         # Configuración de Next.js
└── package.json            # Dependencias y scripts
```

## Problemas frecuentes
- **"Todos los servicios de IA están saturados"**: ambos motores están caídos a la vez. Reintenta en unos minutos; si solo falla uno, la app ya saltó al otro automáticamente.
- **Respuesta truncada**: el módulo es muy largo para el límite de tokens. Sube `GROQ_MAX_TOKENS` / `GEMINI_MAX_TOKENS` o procesa el módulo por partes.
- **"No se encontró el encabezado del módulo 10.2"**: ese código no aparece como apartado de dos niveles en el PDF. Elige otro en la lista de módulos detectados o procesa el documento completo.
- **PDF escaneado**: al ser imágenes no contiene texto. Necesita pasarse por OCR antes de subirse.

## Autor
Ibai Hernández Ruiz