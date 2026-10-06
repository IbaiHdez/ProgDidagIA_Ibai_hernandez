"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import ProgramacionEditor from '@/components/ProgramacionEditor';
import { Boton, Tarjeta, Icono, Etiqueta, Aviso, Confirmar, Progreso, Pasos } from '@/components/ui';
import { detectarApartados, normalizarTexto, recortarApartado } from '@/lib/estructura';
import { esperarAnalisis } from '@/lib/analysisClient';
import { patronTablas, textoTabla } from '@/lib/tablasOriginales';

const MAX_BYTES = 30 * 1024 * 1024;
export default function Asistente() {
  const [archivo, setArchivo] = useState(null);
  const [texto, setTexto] = useState('');
  const [tablas, setTablas] = useState({});
  const [avisosExtraccion, setAvisosExtraccion] = useState([]);
  const [usarIA, setUsarIA] = useState(false);
  const [fase, setFase] = useState('subir');
  const [seleccion, setSeleccion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editarTexto, setEditarTexto] = useState(false);
  const [borradorTexto, setBorradorTexto] = useState('');
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [pidiendoReinicio, setPidiendoReinicio] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [meta, setMeta] = useState(null);
  const [motores, setMotores] = useState(null);
  const input = useRef(null), controlador = useRef(null), job = useRef(null);
  const longitudContenido = (valor) => valor.replace(patronTablas(), (marca, id) => tablas[id] ? textoTabla(tablas[id]) : marca).length;
  const apartados = useMemo(() => detectarApartados(texto), [texto]);
  const filtrados = useMemo(() => apartados.filter((a) => `${a.codigo} ${a.titulo}`.toLowerCase().includes(busqueda.toLowerCase())), [apartados, busqueda]);
  const elegido = apartados.find((a) => a.id === seleccion);
  const preview = seleccion ? recortarApartado(texto, seleccion).texto : texto;

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/analyze', { signal: abort.signal }).then((r) => r.json()).then(setMotores).catch(() => {});
    return () => { abort.abort(); controlador.current?.abort(); };
  }, []);

  const elegirArchivo = (file) => {
    if (!file || !/\.(pdf|docx)$/i.test(file.name)) return setError('Selecciona un archivo PDF o Word (.docx).');
    if (file.size > MAX_BYTES) return setError('El tamaño máximo es 30 MB. Divide el documento antes de subirlo.');
    setArchivo(file); setError('');
  };
  const leer = async () => {
    const abort = new AbortController(); controlador.current = abort;
    setFase('leyendo'); setError('');
    try {
      const form = new FormData(); form.append('file', archivo);
      const res = await fetch('/api/extract', { method: 'POST', body: form, signal: abort.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTexto(data.text); setTablas(data.tablas || {}); setAvisosExtraccion(data.avisos || []); setSeleccion(''); setBusqueda(''); setFase('elegir');
    } catch (e) { if (!abort.signal.aborted) { setError(e.message); setFase('subir'); } }
  };
  const analizar = async () => {
    if (seleccion && !elegido) return setError('Revisa la selección del apartado.');
    const abort = new AbortController(); controlador.current = abort;
    setFase('analizando'); setError(''); setProgreso(null); setEditarTexto(false);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ text: texto, tablas, usarIA, scope: seleccion ? 'apartado' : 'documento', sectionId: seleccion || null, nombreDocumento: archivo.name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el análisis.');
      job.current = data.jobId;
      const terminado = await esperarAnalisis(data.jobId, { signal: abort.signal, onProgress: setProgreso });
      if (abort.signal.aborted) return;
      setResultado(terminado.resultado); setMeta({...terminado.meta,avisos:[...avisosExtraccion,...(terminado.meta?.avisos || [])]}); setFase('listo');
      job.current = null;
    } catch (e) {
      if (!abort.signal.aborted) {
        if (job.current) fetch(`/api/analyze?jobId=${job.current}`, { method: 'DELETE' }).catch(() => {});
        job.current = null; setError(e.message); setFase('elegir');
      }
    }
  };
  const cancelar = () => {
    controlador.current?.abort();
    if (job.current) fetch(`/api/analyze?jobId=${job.current}`, { method: 'DELETE' }).catch(() => {});
    job.current = null; setFase(texto ? 'elegir' : 'subir');
  };
  const reiniciar = () => {
    if (resultado) return setPidiendoReinicio(true);
    hacerReinicio();
  };
  const hacerReinicio = () => {
    setPidiendoReinicio(false);
    cancelar(); setArchivo(null); setTexto(''); setTablas({}); setAvisosExtraccion([]); setResultado(null); setMeta(null); setSeleccion(''); setError(''); setFase('subir');
  };

  if (resultado) return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div><Etiqueta tono={meta?.avisos?.length ? 'ambar' : 'verde'}>{meta?.avisos?.length ? 'Revisión necesaria' : 'Documento estructurado'}</Etiqueta>
          <h1 className="text-2xl font-bold mt-3">Revisa tu programación</h1>
          <p className="text-sm text-slate-500 mt-1">{resultado.secciones.length} apartados · {meta?.tablasOriginales || 0} tablas conservadas del PDF</p></div>
        <Boton variante="secundario" icono="subir" onClick={reiniciar}>Otro documento</Boton>
      </div>
      {meta?.avisos?.length > 0 && <Aviso tipo="aviso" titulo="Se ha conservado texto original para evitar pérdidas" className="mb-6">
        <p>Algunas partes necesitan revisión manual. Los apartados afectados están marcados en el editor.</p>
        <details className="mt-2"><summary className="cursor-pointer font-semibold">Ver {meta.avisos.length} avisos</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">{meta.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
      </Aviso>}
      <ProgramacionEditor datosIniciales={resultado} />

      <Confirmar
        abierto={pidiendoReinicio}
        titulo="¿Procesar otro documento?"
        descripcion="Asegúrate de haber guardado tus cambios: al continuar se descartará el resultado actual."
        textoConfirmar="Continuar"
        tono="info"
        onCancelar={() => setPidiendoReinicio(false)}
        onConfirmar={hacerReinicio}
      />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Pasos pasos={['Subir documento', 'Elegir contenido', 'Revisar y guardar']} actual={fase === 'subir' ? 0 : fase === 'analizando' ? 2 : 1} />
      <div className="mt-8 mb-6"><h1 className="text-3xl font-bold tracking-tight">{fase === 'elegir' ? 'Elige qué quieres procesar' : 'Nueva programación'}</h1>
        <p className="text-slate-500 mt-2">Conserva la estructura de tu documento y revisa cada apartado antes de guardarlo.</p></div>
      {error && <Aviso tipo="error" titulo="No se pudo completar la operación" className="mb-5"><p>{error}</p></Aviso>}

      {fase === 'subir' && <Tarjeta className="p-6 sm:p-10">
        <div role="button" tabIndex={0} aria-label="Seleccionar PDF o Word"
          onClick={() => input.current?.click()} onKeyDown={(e) => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegirArchivo(e.dataTransfer.files[0]); }}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${arrastrando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 bg-slate-50'}`}>
          <input ref={input} type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
          <Icono nombre="subir" className="w-10 h-10 mx-auto text-brand-600 mb-4" />
          <p className="font-semibold text-lg break-words">{archivo?.name || 'Arrastra tu documento o pulsa para seleccionarlo'}</p>
          <p className="text-sm text-slate-500 mt-2">{archivo ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB · Pulsa para cambiar` : 'PDF o Word (.docx) · Hasta 30 MB'}</p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">{motores?.providers?.some((p) => p.configurado) ? 'IA configurada · Revisión manual disponible' : 'Sin IA configurada: se conservará el texto para edición manual'}</p>
          <Boton iconoDerecha="flecha" onClick={leer} disabled={!archivo}>Leer documento</Boton>
        </div>
      </Tarjeta>}

      {(fase === 'leyendo' || fase === 'analizando') && <Tarjeta className="p-10 text-center">
        <Icono nombre="spinner" className="w-10 h-10 mx-auto text-brand-600 animate-spin-slow mb-5" />
        <h2 className="text-xl font-bold">{fase === 'leyendo' ? 'Leyendo el documento…' : progreso?.fase === 'revisando' ? 'Comprobando y completando el contenido…' : 'Organizando el contenido…'}</h2>
        <p className="text-slate-500 mt-2 mb-6">{fase === 'leyendo' ? 'Buscando títulos y subapartados de todos los niveles.' : 'Los documentos extensos se procesan por partes. Puede tardar varios minutos.'}</p>
        {progreso && <Progreso className="max-w-md mx-auto mb-6" valor={progreso.completados || 0} maximo={progreso.total} etiqueta={`${progreso.completados || 0} de ${progreso.total} partes completadas`} />}
        <Boton variante="secundario" onClick={cancelar}>Cancelar</Boton>
      </Tarjeta>}

      {fase === 'elegir' && <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <Tarjeta className="overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <label className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer border-2 ${!seleccion ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="alcance" checked={!seleccion} onChange={() => setSeleccion('')} className="mt-1 accent-blue-600" />
              <span><strong className="block">Documento completo</strong><span className="text-sm text-slate-500">Todos los módulos, apartados y contenido inicial, en su orden original.</span></span>
            </label>
            <div className="flex items-center justify-between mt-6 mb-3"><h2 className="font-semibold">O un apartado y sus subapartados</h2><Etiqueta>{apartados.length}</Etiqueta></div>
            <input className="campo" type="search" aria-label="Buscar apartados" placeholder="Buscar por número o título…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-3" role="group" aria-label="Apartados detectados">
            {filtrados.map((a) => <label key={a.id} className={`flex gap-3 p-3 rounded-xl cursor-pointer mb-1 ${seleccion === a.id ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50'}`} style={{ marginLeft: `${Math.min(Math.max(a.nivel - 2, 0), 4) * 12}px` }}>
              <input type="radio" name="alcance" checked={seleccion === a.id} onChange={() => setSeleccion(a.id)} className="mt-1 shrink-0 accent-blue-600" />
              <span className="min-w-0"><span className="font-mono text-xs text-brand-700 mr-2">{a.codigo || 'Sin número'}</span><span className="text-sm font-medium">{a.titulo}</span>
                <span className="block text-xs text-slate-400 mt-1">Nivel {a.nivel} · {longitudContenido(texto.slice(a.inicio,a.fin)).toLocaleString('es-ES')} caracteres con subapartados</span></span>
            </label>)}
            {!filtrados.length && <p className="p-5 text-sm text-slate-500">{apartados.length ? 'No hay coincidencias.' : 'No se han reconocido títulos. Puedes procesar todo o corregir el texto detectado.'}</p>}
          </div>
        </Tarjeta>
        <div className="space-y-4 lg:sticky lg:top-24">
          <Tarjeta className="p-5"><h2 className="font-semibold mb-3">Contenido seleccionado</h2>
            <p className="text-sm font-medium text-brand-700">{elegido ? `${elegido.codigo} ${elegido.titulo}` : 'Documento completo'}</p>
            <p className="text-xs text-slate-500 my-3">{longitudContenido(preview).toLocaleString('es-ES')} caracteres · Se respetarán los títulos y la numeración del original.</p>
            <p className="text-sm text-brand-700 mb-3">{Object.keys(tablas).filter((id)=>preview.includes(`[[TABLA_PDF:${id}]]`)).length} tablas originales detectadas en la selección.</p>
            <label className="flex gap-2 text-sm mb-4"><input type="checkbox" checked={usarIA} onChange={(e)=>setUsarIA(e.target.checked)} />Organizar también el texto con IA (opcional). Las tablas originales se conservan.</label>
            <Boton className="w-full" onClick={analizar} disabled={!texto.trim()} icono="sparkles">{usarIA?'Procesar con IA':'Abrir conservando las tablas'}</Boton>
            <Boton className="w-full mt-2" variante="fantasma" onClick={reiniciar}>Cambiar archivo</Boton>
          </Tarjeta>
          <Aviso tipo="info"><p>La detección es automática. Revisa el listado; si falta un título, puedes corregir el texto antes de procesarlo.</p></Aviso>
        </div>
        <Tarjeta className="p-5 lg:col-span-2">
          <details><summary className="cursor-pointer font-semibold">Ver texto extraído y corregir encabezados</summary>
            <p className="text-sm text-slate-500 my-3">El listado se recalcula al editar. Escribe cada título numerado en su propia línea; al cambiar el texto se selecciona de nuevo el documento completo.</p>
            {Object.keys(tablas).length>0 && <p className="text-sm text-slate-500 mb-3">Las referencias TABLA_PDF reservan la posición de las tablas. Su contenido se edita por celdas en el siguiente paso. Mantén esas referencias para conservarlas.</p>}
            <label className="flex gap-2 text-sm mb-3"><input type="checkbox" checked={editarTexto} onChange={(e) => { setBorradorTexto(texto); setEditarTexto(e.target.checked); }} />Permitir correcciones</label>
            <textarea aria-label="Texto extraído" readOnly={!editarTexto} className="campo font-mono text-xs min-h-80" value={editarTexto ? borradorTexto : preview}
              onChange={(e) => setBorradorTexto(e.target.value)} />
            {editarTexto && <Boton className="mt-3" onClick={() => { setTexto(normalizarTexto(borradorTexto)); setSeleccion(''); setEditarTexto(false); }}>Aplicar correcciones</Boton>}
          </details>
        </Tarjeta>
      </div>}
    </div>
  );
}
