'use client';

import { useState } from 'react';
import { FolderPlus, Folder, Lock, Globe, Trash2, X, Check } from 'lucide-react';

export interface Coleccion {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_public: boolean;
  itemsKeys: string[];
}

interface ColeccionesBarProps {
  colecciones: Coleccion[];
  coleccionActivaId: string | null;
  onSelectColeccion: (id: string | null) => void;
  onCrearColeccion: (name: string, description: string, isPublic: boolean) => Promise<void>;
  onToggleVisibilidad: (id: string, nuevoEstadoPublico: boolean) => Promise<void>;
  onEliminarColeccion: (id: string) => Promise<void>;
}

export default function ColeccionesBar({
  colecciones,
  coleccionActivaId,
  onSelectColeccion,
  onCrearColeccion,
  onToggleVisibilidad,
  onEliminarColeccion,
}: ColeccionesBarProps) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esPublica, setEsPublica] = useState(true);
  const [guardando, setGuardando] = useState(false);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    await onCrearColeccion(nombre.trim(), descripcion.trim(), esPublica);
    setNombre('');
    setDescripcion('');
    setEsPublica(true);
    setCreando(false);
    setGuardando(false);
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Mis Colecciones ({colecciones.length})
          </span>
          <span className="text-[11px] text-slate-500">
            · Pulsa el globo/candado para cambiar privacidad
          </span>
        </div>

        <button
          onClick={() => setCreando(!creando)}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          {creando ? <X className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}
          {creando ? 'Cancelar' : 'Nueva colección'}
        </button>
      </div>

      {/* Formulario rápido de creación */}
      {creando && (
        <form
          onSubmit={handleCrear}
          className="flex flex-col gap-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            required
            maxLength={40}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Maratón de finde)"
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <input
            type="text"
            maxLength={90}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción opcional..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setEsPublica(!esPublica)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              esPublica
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
            title="Cambiar visibilidad"
          >
            {esPublica ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {esPublica ? 'Pública' : 'Privada'}
          </button>

          <button
            type="submit"
            disabled={guardando || !nombre.trim()}
            className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Crear
          </button>
        </form>
      )}

      {/* Lista de colecciones */}
      {colecciones.length === 0 ? (
        <p className="text-xs text-slate-500">
          Crea listas temáticas (ej. &quot;Para ver en pareja&quot;, &quot;Top Thriller&quot;) y añade títulos desde el botón de cada tarjeta.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colecciones.map((col) => {
            const activa = coleccionActivaId === col.id;
            return (
              <div
                key={col.id}
                className={`group flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                  activa
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                }`}
              >
                {/* Botón interactivo para cambiar Pública / Privada */}
                <button
                  type="button"
                  onClick={() => onToggleVisibilidad(col.id, !col.is_public)}
                  title={
                    col.is_public
                      ? 'Pública (haz clic para hacerla privada)'
                      : 'Privada (haz clic para hacerla pública)'
                  }
                  className={`rounded-md p-1 transition ${
                    activa
                      ? 'hover:bg-indigo-700'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  {col.is_public ? (
                    <Globe className={`h-3.5 w-3.5 ${activa ? 'text-white' : 'text-emerald-400'}`} />
                  ) : (
                    <Lock className={`h-3.5 w-3.5 ${activa ? 'text-indigo-200' : 'text-amber-400'}`} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectColeccion(activa ? null : col.id)}
                  className="flex items-center gap-1.5"
                  title={col.description || col.name}
                >
                  <span>{col.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      activa ? 'bg-indigo-700 text-white' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {col.itemsKeys.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`¿Eliminar la colección "${col.name}"?`)) {
                      onEliminarColeccion(col.id);
                    }
                  }}
                  className={`ml-0.5 rounded p-1 opacity-60 transition hover:opacity-100 ${
                    activa ? 'hover:text-red-200' : 'hover:text-red-400'
                  }`}
                  title="Eliminar colección"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}