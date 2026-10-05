"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProgramacionEditor from "@/components/ProgramacionEditor";
import { Boton, Icono, Cargando, Aviso } from "@/components/ui";

export default function EditarProgramacion() {
  const { id } = useParams();
  const [programacion, setProgramacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let vivo = true;

    fetch(`/api/programaciones/${id}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("Esta programación ya no existe.");
        if (!res.ok) throw new Error("No se ha podido cargar la programación.");
        return res.json();
      })
      .then((datos) => {
        if (vivo) setProgramacion(datos);
      })
      .catch((e) => {
        if (vivo) setError(e.message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [id]);

  if (cargando) {
    return (
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
        <Cargando texto="Cargando la programación…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-16">
        <Aviso tipo="error" titulo={error}>
          <p>Puede que la hayas eliminado o que el enlace no sea correcto.</p>
        </Aviso>
        <div className="mt-6">
          <Link href="/programaciones">
            <Boton variante="secundario" icono="flechaAtras">
              Volver a mis programaciones
            </Boton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight truncate">
            {programacion?.modulo?.nombre || "Programación"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Editando una programación ya guardada</p>
        </div>

        <Link href="/programaciones">
          <Boton variante="secundario" icono="flechaAtras">
            Volver al listado
          </Boton>
        </Link>
      </div>

      <ProgramacionEditor datosIniciales={programacion} idExistente={id} />
    </div>
  );
}