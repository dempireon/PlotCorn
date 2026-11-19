'use client';

import { useState, useEffect } from 'react';
import { getPosterUrl, MediaTMDB } from '@/lib/tmdb';
import { Calendar, Tv, Star } from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface ProximosEstrenosBarProps {
  seriesEnSeguimientoIds: number[];
  onSelectSerie: (media: MediaTMDB) => void;
}

interface EstrenoItem {
  media: MediaTMDB;
  nextEpisodeDate: string;
  nextEpisodeLabel: string;
}

export default function ProximosEstrenosBar({
  seriesEnSeguimientoIds,
  onSelectSerie,
}: ProximosEstrenosBarProps) {
  const [estrenos, setEstrenos] = useState<EstrenoItem[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargarEstrenos();
  }, [seriesEnSeguimientoIds.join(',')]);

  async function cargarEstrenos() {
    if (!TMDB_API_KEY || seriesEnSeguimientoIds.length === 0) {
      setEstrenos([]);
      return;
    }

    setCargando(true);
    const hoyStr = new Date().toISOString().slice(0, 10);
    const idsUnicos = Array.from(new Set(seriesEnSeguimientoIds)).slice(0, 20);

    try {
      const detalles = await Promise.all(
        idsUnicos.map(async (id) => {
          const res = await fetch(
            `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&language=es-ES`
          );
          if (!res.ok) return null;
          return res.json();
        })
      );

      const encontrados: EstrenoItem[] = [];
      for (const d of detalles) {
        if (!d) continue;
        const proximoEp = d.next_episode_to_air;
        const fechaCandidata = proximoEp?.air_date || '';
        if (fechaCandidata && fechaCandidata >= hoyStr) {
          encontrados.push({
            media: {
              id: d.id,
              media_type: 'tv',
              name: d.name,
              overview: d.overview || '',
              poster_path: d.poster_path,
              backdrop_path: d.backdrop_path,
              first_air_date: d.first_air_date || '',
              vote_average: d.vote_average || 0,
            },
            nextEpisodeDate: fechaCandidata,
            nextEpisodeLabel: `T${proximoEp.season_number} · Ep ${proximoEp.episode_number}`,
          });
        }
      }

      encontrados.sort((a, b) => a.nextEpisodeDate.localeCompare(b.nextEpisodeDate));
      setEstrenos(encontrados);
    } catch (err) {
      console.error('Error cargando próximos estrenos:', err);
    }

    setCargando(false);
  }

  return (
    <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-indigo-950/20 p-5 shadow-lg sm:p-6">
      <div className="mb-5 flex items-center justify-between border-b border-slate-800/90 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/30 bg-slate-950">
            <Calendar className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Próximos estrenos</h3>
              {estrenos.length > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
                  {estrenos.length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Nuevos episodios programados para tus series en seguimiento
            </p>
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/70" />
          ))}
        </div>
      ) : estrenos.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-8 text-center">
          <Tv className="mx-auto mb-2 h-6 w-6 text-slate-500" />
          <p className="text-xs text-slate-400">
            No hay próximos episodios confirmados ahora mismo en las series que sigues.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {estrenos.map(({ media, nextEpisodeDate, nextEpisodeLabel }) => (
            <div
              key={media.id}
              onClick={() => onSelectSerie(media)}
              className="group flex cursor-pointer items-center gap-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3 transition hover:-translate-y-0.5 hover:border-indigo-500/50 hover:bg-slate-950"
            >
              <img
                src={getPosterUrl(media.poster_path, 'w342')}
                alt={media.name}
                className="h-20 w-14 shrink-0 rounded-xl border border-slate-800 object-cover transition group-hover:scale-105"
              />

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300">
                    {nextEpisodeLabel}
                  </span>
                  {media.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400" />
                      {media.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>

                <h4 className="truncate text-sm font-bold text-white transition group-hover:text-indigo-300">
                  {media.name}
                </h4>

                <p className="text-xs font-semibold text-emerald-300">
                  Estreno:{' '}
                  {new Date(`${nextEpisodeDate}T00:00:00`).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}