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
    <div className="mb-6 space-y-3.5 rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/80 via-slate-900/55 to-indigo-950/20 p-4 shadow-lg sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-500/30 bg-slate-950">
            <Folder className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Mis Colecciones ({colecciones.length})
          </span>
          <span className="text-[11px] text-slate-400">
            · Pulsa el globo/candado para cambiar privacidad
          </span>
        </div>

        <button
          type="button"
          onClick={() => setCreando(!creando)}
          className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${
            creando
              ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
              : 'border-indigo-400/50 bg-indigo-600 text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500'
          }`}
        >
          {creando ? <X className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}
          {creando ? 'Cancelar' : 'Nueva colección'}
        </button>
      </div>

      {/* Formulario rápido de creación */}
      {creando && (
        <form
          onSubmit={handleCrear}
          className="flex flex-col gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5 shadow-inner sm:flex-row sm:items-center"
        >
          <input
            type="text"
            required
            maxLength={40}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Maratón de finde)"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 transition focus:border-indigo-400 focus:outline-none"
          />

          <input
            type="text"
            maxLength={90}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción opcional..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 transition focus:border-indigo-400 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setEsPublica(!esPublica)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
              esPublica
                ? 'border-emerald-400/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                : 'border-amber-400/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
            }`}
            title="Cambiar visibilidad"
          >
            {esPublica ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {esPublica ? 'Pública' : 'Privada'}
          </button>

          <button
            type="submit"
            disabled={guardando || !nombre.trim()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Crear
          </button>
        </form>
      )}

      {/* Lista de colecciones */}
      {colecciones.length === 0 ? (
        <p className="rounded-2xl border border-slate-800/80 bg-slate-950/55 px-4 py-3 text-xs text-slate-400">
          Crea listas temáticas (ej. &quot;Para ver en pareja&quot;, &quot;Top Thriller&quot;) y añade títulos desde el botón de cada tarjeta.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {colecciones.map((col) => {
            const activa = coleccionActivaId === col.id;
            return (
              <div
                key={col.id}
                className={`group flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-bold transition ${
                  activa
                    ? 'border-indigo-400 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'border-slate-700/90 bg-slate-950/90 text-slate-200 hover:border-indigo-500/50 hover:bg-slate-900'
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
                  className={`rounded-lg p-1 transition ${
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
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activa ? 'bg-indigo-800/80 text-white' : 'bg-slate-900 text-indigo-300'
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
                  className={`ml-0.5 rounded-lg p-1 text-slate-400 transition hover:bg-red-500/20 ${
                    activa ? 'text-indigo-100 hover:text-white' : 'hover:text-red-400'
                  }`}
                  title="Eliminar colección"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}