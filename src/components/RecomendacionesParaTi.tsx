'use client';

import { useState, useEffect } from 'react';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import { Sparkles, Star, Plus, Tv, Film, RefreshCw } from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface ItemBiblioteca {
  tmdb_id: number;
  media_type: MediaType;
  status: 'watching' | 'completed' | 'watchlist';
  rating: number;
  title?: string;
}

interface RecomendacionesParaTiProps {
  bibliotecaUsuario: ItemBiblioteca[];
  onSelectMedia: (media: MediaTMDB) => void;
  onQuickAdd: (media: MediaTMDB) => void;
}

export default function RecomendacionesParaTi({
  bibliotecaUsuario,
  onSelectMedia,
  onQuickAdd,
}: RecomendacionesParaTiProps) {
  const [recomendaciones, setRecomendaciones] = useState<MediaTMDB[]>([]);
  const [tituloBase, setTituloBase] = useState<string>('');
  const [cargando, setCargando] = useState(false);
  const [indiceSemilla, setIndiceSemilla] = useState(0);

  // Candidatos válidos para generar recomendaciones (priorizando mejor puntuadas)
  const candidatosSemilla = [...bibliotecaUsuario]
    .filter((i) => i.status === 'completed' || i.status === 'watching' || i.rating >= 3)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const listaSemillas =
    candidatosSemilla.length > 0 ? candidatosSemilla : bibliotecaUsuario;

  useEffect(() => {
    if (listaSemillas.length > 0) {
      cargarRecomendaciones(0);
    }
  }, [bibliotecaUsuario.length]);

  async function cargarRecomendaciones(forzarIndice?: number) {
    if (listaSemillas.length === 0 || cargando) return;
    setCargando(true);

    const idxActual =
      typeof forzarIndice === 'number'
        ? forzarIndice % listaSemillas.length
        : (indiceSemilla + 1) % listaSemillas.length;

    setIndiceSemilla(idxActual);
    const semilla = listaSemillas[idxActual];
    setTituloBase(semilla.title || 'tus gustos');

    const idsYaGuardados = new Set(
      bibliotecaUsuario.map((i) => `${i.media_type}-${i.tmdb_id}`)
    );

    try {
      const paginaAleatoria = Math.floor(Math.random() * 2) + 1;
      const res = await fetch(
        `https://api.themoviedb.org/3/${semilla.media_type}/${semilla.tmdb_id}/recommendations?api_key=${TMDB_API_KEY}&language=es-ES&page=${paginaAleatoria}`
      );
      const data = await res.json();
      let resultadosRaw = data.results || [];

      // Si la página 2 viene vacía, pedimos la 1
      if (resultadosRaw.length === 0 && paginaAleatoria > 1) {
        const res1 = await fetch(
          `https://api.themoviedb.org/3/${semilla.media_type}/${semilla.tmdb_id}/recommendations?api_key=${TMDB_API_KEY}&language=es-ES&page=1`
        );
        const data1 = await res1.json();
        resultadosRaw = data1.results || [];
      }

      const filtrados: MediaTMDB[] = resultadosRaw
        .filter((r: any) => !idsYaGuardados.has(`${semilla.media_type}-${r.id}`))
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .map((r: any) => ({
          id: r.id,
          media_type: semilla.media_type,
          name: r.title || r.name,
          overview: r.overview || '',
          poster_path: r.poster_path,
          backdrop_path: r.backdrop_path,
          first_air_date: r.release_date || r.first_air_date || '',
          vote_average: r.vote_average || 0,
        }));

      setRecomendaciones(filtrados);
    } catch (err) {
      console.error('Error cargando recomendaciones:', err);
    }

    setCargando(false);
  }

  if (bibliotecaUsuario.length === 0) return null;

  return (
    <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-indigo-950/20 p-5 shadow-lg sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/30 bg-slate-950 text-indigo-400 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Recomendado para ti</h3>
            <p className="text-xs text-slate-400">
              Porque viste o puntuaste{' '}
              <span className="font-semibold text-indigo-300">{tituloBase}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => cargarRecomendaciones()}
          disabled={cargando}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-indigo-400 hover:bg-slate-900 hover:text-white active:scale-[0.98] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-indigo-400 ${cargando ? 'animate-spin' : ''}`} />
          Nuevas ideas
        </button>
      </div>

      {cargando && recomendaciones.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] animate-pulse rounded-2xl border border-slate-800 bg-slate-950/70"
            />
          ))}
        </div>
      ) : recomendaciones.length === 0 ? (
        <p className="rounded-2xl border border-slate-800/80 bg-slate-950/55 py-7 text-center text-xs text-slate-400">
          No hay más sugerencias nuevas para este título. Pulsa{' '}
          <strong className="text-indigo-300">Nuevas ideas</strong> para probar con otro de tu lista.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {recomendaciones.map((item) => {
            const esPeli = item.media_type === 'movie';
            return (
              <div key={`${item.media_type}-${item.id}`} className="group flex flex-col">
                <div
                  onClick={() => onSelectMedia(item)}
                  className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-md transition group-hover:border-indigo-500/50"
                >
                  <img
                    src={getPosterUrl(item.poster_path)}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />

                  <div
                    className={`absolute left-2 top-2 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase backdrop-blur-md ${
                      esPeli
                        ? 'border-rose-500/30 bg-rose-950/85 text-rose-300'
                        : 'border-slate-700/80 bg-slate-950/85 text-slate-200'
                    }`}
                  >
                    {esPeli ? <Film className="h-2.5 w-2.5" /> : <Tv className="h-2.5 w-2.5" />}
                    {esPeli ? 'Peli' : 'Serie'}
                  </div>

                  {item.vote_average > 0 && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-950/90 px-2 py-0.5 text-[11px] font-bold text-amber-400">
                      <Star className="h-2.5 w-2.5 fill-amber-400" />
                      {item.vote_average.toFixed(1)}
                    </div>
                  )}
                </div>

                <p
                  onClick={() => onSelectMedia(item)}
                  className="mt-2 line-clamp-1 cursor-pointer text-xs font-bold text-white transition hover:text-indigo-300"
                >
                  {item.name}
                </p>

                <button
                  type="button"
                  onClick={() => onQuickAdd(item)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-950 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-amber-400/60 hover:bg-amber-500/15 hover:text-amber-300 active:scale-[0.98]"
                >
                  <Plus className="h-3 w-3 text-amber-400" />
                  A pendientes
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}