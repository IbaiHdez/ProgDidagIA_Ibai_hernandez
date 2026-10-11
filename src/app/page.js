import Link from "next/link";
import { Boton, Tarjeta, Icono, Etiqueta } from "@/components/ui";

const VENTAJAS = [
  {
    icono: "chip",
    titulo: "Detecta los apartados solo",
    texto:
      "No importa cómo esté redactada tu programación ni cuántos apartados tenga: la IA lee el documento y encuentra la jerarquía real.",
  },
  {
    icono: "editar",
    titulo: "Todo editable",
    texto:
      "Cada apartado, lista y tabla se abre en un formulario. Cambias títulos, numeración y contenido sin pelearte con el PDF.",
  },
  {
    icono: "modulos",
    titulo: "Unifica el ciclo completo",
    texto:
      "Procesa cada módulo por separado y descárgalos en PDF institucional o Word editable, listos para entregar.",
  },
];

const PASOS = [
  { n: 1, titulo: "Sube tu PDF o Word", texto: "Arrastra el archivo. Verás qué módulos ha encontrado." },
  { n: 2, titulo: "Revisa y corrige", texto: "Editas cada apartado en un formulario claro." },
  { n: 3, titulo: "Guarda y exporta", texto: "Descarga el PDF o el Word definitivo." },
];

export default function Home() {
  return (
    <>
      {/* ------------------------------------------------------------ Portada */}
      <section className="relative overflow-hidden hero-grid border-b border-slate-200">
        <div
          className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-brand-50/70 to-transparent pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24 text-center">
          <div className="animate-fade-up">
            <Etiqueta tono="azul" className="mb-6">
              <Icono nombre="rayo" className="w-3.5 h-3.5" />
              Automatización con inteligencia artificial
            </Etiqueta>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.05] max-w-4xl mx-auto">
              Moderniza tu programación
              <br className="hidden sm:block" />{" "}
              <span className="brand-gradient bg-clip-text text-transparent">didáctica en minutos</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Sube la del curso pasado, deja que la IA la ordene por apartados y llévatela
              en PDF o Word. Sin tocar una sola tabla a mano.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/asistente" className="w-full sm:w-auto">
                <Boton tamano="lg" className="w-full sm:w-auto" iconoDerecha="flecha">
                  Empezar ahora
                </Boton>
              </Link>
              <Link href="/programaciones" className="w-full sm:w-auto">
                <Boton tamano="lg" variante="secundario" className="w-full sm:w-auto" icono="carpeta">
                  Ver mis programaciones
                </Boton>
              </Link>
            </div>

            <p className="mt-6 text-sm text-slate-500 flex items-center justify-center gap-2">
              <Icono nombre="escudo" className="w-4 h-4 text-emerald-600" />
              Tus documentos se procesan con IA gratuita y se guardan en tu servidor.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Cómo funciona */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Tres pasos, sin complicaciones
          </h2>
          <p className="mt-3 text-slate-600 max-w-xl mx-auto">
            Diseñado para que no haga falta ninguna explicación: se entra y se usa.
          </p>
        </div>

        <ol className="grid gap-5 sm:grid-cols-3">
          {PASOS.map((paso) => (
            <li key={paso.n} className="animate-fade-up">
              <Tarjeta hover className="p-6 h-full">
                <span className="brand-gradient w-10 h-10 rounded-xl grid place-items-center text-white font-bold text-sm mb-4 shadow-md shadow-brand-600/20">
                  {paso.n}
                </span>
                <h3 className="font-bold text-slate-900 mb-1.5">{paso.titulo}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{paso.texto}</p>
              </Tarjeta>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ Ventajas */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Pensado para el día a día del profesorado
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {VENTAJAS.map((ventaja) => (
              <Tarjeta key={ventaja.titulo} className="p-6">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand-50 text-brand-600 mb-4">
                  <Icono nombre={ventaja.icono} className="w-5.5 h-5.5" />
                </span>
                <h3 className="font-bold text-slate-900 mb-1.5">{ventaja.titulo}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{ventaja.texto}</p>
              </Tarjeta>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Cierre */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <div className="brand-gradient rounded-3xl px-8 py-12 sm:px-14 text-center text-white shadow-2xl shadow-brand-600/20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            ¿Empezamos con la del curso pasado?
          </h2>
          <p className="mt-3 text-brand-50/90 max-w-xl mx-auto leading-relaxed">
            Solo necesitas el PDF. El resto lo hace la aplicación.
          </p>
          <Link href="/asistente" className="inline-block mt-8">
            <Boton
              tamano="lg"
              variante="secundario"
              iconoDerecha="flecha"
              className="bg-white! text-brand-700! border-transparent! hover:bg-brand-50!"
            >
              Subir mi programación
            </Boton>
          </Link>
        </div>
      </section>
    </>
  );
}