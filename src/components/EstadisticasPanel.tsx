'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Clock, Tv, Film, Star, CheckCircle2,
  History, Clapperboard, Flame
} from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface EstadisticasPanelProps {
  userId: string;
  itemsBiblioteca: {
    tmdb_id: number;
    media_type: 'tv' | 'movie';
    status: 'watching' | 'completed' | 'watchlist';
    rating: number;
    title?: string;
  }[];
}

type SubCategoria = 'tv' | 'movie' | 'documentary' | 'reality';

export default function EstadisticasPanel({ userId, itemsBiblioteca }: EstadisticasPanelProps) {
  const [episodiosDetalle, setEpisodiosDetalle] = useState<any[]>([]);
  const [titulosCache, setTitulosCache] = useState<Record<string, string>>({});
  const [subCategoriasMap, setSubCategoriasMap] = useState<Record<string, SubCategoria>>({});

  useEffect(() => {
    cargarMetricasDetalladas();
  }, [userId, itemsBiblioteca]);

  async function cargarMetricasDetalladas() {
    const { data: eps } = await supabase
      .from('watched_episodes')
      .select('*')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false });

    const listaEps = eps || [];
    setEpisodiosDetalle(listaEps);

    const mapaNombres: Record<string, string> = {};
    itemsBiblioteca.forEach((item) => {
      if (item.title) {
        mapaNombres[`${item.media_type}-${item.tmdb_id}`] = item.title;
      }
    });

    const idsUnicos = Array.from(
      new Set([
        ...itemsBiblioteca.map((i) => ({ id: i.tmdb_id, type: i.media_type })),
        ...listaEps.map((e) => ({ id: e.tmdb_id, type: 'tv' as const })),
      ].map((x) => `${x.type}-${x.id}`))
    );

    const idsNumericos = Array.from(new Set(idsUnicos.map((k) => Number(k.split('-')[1]))));
    if (idsNumericos.length > 0) {
      const { data: cache } = await supabase
        .from('series_cache')
        .select('tmdb_id, media_type, title')
        .in('tmdb_id', idsNumericos);

      (cache || []).forEach((c: any) => {
        mapaNombres[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c.title;
      });
    }
    setTitulosCache(mapaNombres);

    const mapaSubCats: Record<string, SubCategoria> = {};
    await Promise.all(
      idsUnicos.map(async (clave) => {
        const [tipo, idStr] = clave.split('-');
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/${tipo}/${idStr}?api_key=${TMDB_API_KEY}&language=es-ES`
          );
          if (!res.ok) {
            mapaSubCats[clave] = tipo === 'movie' ? 'movie' : 'tv';
            return;
          }
          const data = await res.json();
          const genreIds: number[] = (data.genres || []).map((g: any) => g.id);

          if (genreIds.includes(99)) {
            mapaSubCats[clave] = 'documentary';
          } else if (genreIds.includes(10764)) {
            mapaSubCats[clave] = 'reality';
          } else {
            mapaSubCats[clave] = tipo === 'movie' ? 'movie' : 'tv';
          }
        } catch {
          mapaSubCats[clave] = tipo === 'movie' ? 'movie' : 'tv';
        }
      })
    );
    setSubCategoriasMap(mapaSubCats);
  }

  const getCat = (mediaType: 'tv' | 'movie', tmdbId: number): SubCategoria =>
    subCategoriasMap[`${mediaType}-${tmdbId}`] || mediaType;

  const seriesPuras = itemsBiblioteca.filter((i) => getCat(i.media_type, i.tmdb_id) === 'tv');
  const pelisPuras = itemsBiblioteca.filter((i) => getCat(i.media_type, i.tmdb_id) === 'movie');
  const documentales = itemsBiblioteca.filter((i) => getCat(i.media_type, i.tmdb_id) === 'documentary');
  const realities = itemsBiblioteca.filter((i) => getCat(i.media_type, i.tmdb_id) === 'reality');

  const pelisVistas = itemsBiblioteca.filter((i) => i.media_type === 'movie' && i.status === 'completed');
  const tvTerminadas = itemsBiblioteca.filter((i) => i.media_type === 'tv' && i.status === 'completed');

  const minutosTotales = episodiosDetalle.length * 45 + pelisVistas.length * 115;
  const horasTotales = Math.round(minutosTotales / 60);
  const diasTotales = (horasTotales / 24).toFixed(1);

  const itemsPuntuados = itemsBiblioteca.filter((i) => (i.rating || 0) > 0);
  const epsPuntuados = episodiosDetalle.filter((e) => (e.rating || 0) > 0);

  const notaMediaGlobal =
    itemsPuntuados.length > 0
      ? (itemsPuntuados.reduce((acc, i) => acc + i.rating, 0) / itemsPuntuados.length).toFixed(1)
      : epsPuntuados.length > 0
      ? (epsPuntuados.reduce((acc, e) => acc + e.rating, 0) / epsPuntuados.length).toFixed(1)
      : '-';

  const totalItems = itemsBiblioteca.length;
  const pctSeries = totalItems > 0 ? Math.round((seriesPuras.length / totalItems) * 100) : 0;
  const pctPelis = totalItems > 0 ? Math.round((pelisPuras.length / totalItems) * 100) : 0;
  const pctDocs = totalItems > 0 ? Math.round((documentales.length / totalItems) * 100) : 0;
  const pctRealities = totalItems > 0 ? Math.max(0, 100 - pctSeries - pctPelis - pctDocs) : 0;

  const epsPorSerie: Record<number, any[]> = {};
  episodiosDetalle.forEach((ep) => {
    if (!epsPorSerie[ep.tmdb_id]) epsPorSerie[ep.tmdb_id] = [];
    epsPorSerie[ep.tmdb_id].push(ep);
  });

  function renderBloqueEpisodicos(
    titulo: string,
    subtitulo: string,
    icono: React.ReactNode,
    acentoBorder: string,
    acentoBadge: string,
    listaItems: typeof itemsBiblioteca,
    subCatFiltro: SubCategoria
  ) {
    const idsExtras = Object.keys(epsPorSerie)
      .map(Number)
      .filter((id) => getCat('tv', id) === subCatFiltro);

    const todosIds = Array.from(new Set([...listaItems.map((i) => i.tmdb_id), ...idsExtras]));
    if (todosIds.length === 0) return null;

    return (
      <section className={`rounded-3xl border ${acentoBorder} bg-slate-900/45 p-5 shadow-lg`}>
        <div className="mb-4 flex items-center gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
            {icono}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{titulo}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${acentoBadge}`}>
                {todosIds.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">{subtitulo}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {todosIds.map((tmdbId) => {
            const info = listaItems.find((s) => s.tmdb_id === tmdbId);
            const mediaType = info?.media_type || 'tv';
            const epsDeEste = (epsPorSerie[tmdbId] || []).sort((a, b) =>
              a.season_number !== b.season_number
                ? a.season_number - b.season_number
                : a.episode_number - b.episode_number
            );
            const nombre = info?.title || titulosCache[`${mediaType}-${tmdbId}`] || `Título #${tmdbId}`;
            const horas =
              mediaType === 'movie'
                ? info?.status === 'completed'
                  ? '1.9'
                  : '0'
                : ((epsDeEste.length * 45) / 60).toFixed(1);

            const epsConNota = epsDeEste.filter((e) => (e.rating || 0) > 0);
            const mediaCaps =
              epsConNota.length > 0
                ? (epsConNota.reduce((acc, e) => acc + e.rating, 0) / epsConNota.length).toFixed(1)
                : null;

            return (
              <div
                key={`${mediaType}-${tmdbId}`}
                className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{nombre}</p>
                    <p className="text-[11px] text-slate-400">
                      {mediaType === 'movie'
                        ? `Formato película · ~${horas}h vistas`
                        : `${epsDeEste.length} capítulos marcados · ~${horas}h vistas`}
                      {mediaCaps && ` · Media caps: ★ ${mediaCaps}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {info && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          info.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : info.status === 'watching'
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {info.status === 'completed'
                          ? 'Terminado'
                          : info.status === 'watching'
                          ? 'Viendo'
                          : 'Pendiente'}
                      </span>
                    )}

                    {info && info.rating > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" />
                        {info.rating}/5
                      </span>
                    )}
                  </div>
                </div>

                {epsDeEste.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {epsDeEste.map((ep) => (
                      <span
                        key={`${ep.season_number}-${ep.episode_number}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        <span>
                          T{ep.season_number} E{ep.episode_number}
                        </span>
                        {ep.rating > 0 && (
                          <span className="font-semibold text-amber-400">★{ep.rating}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {/* BLOQUE 1: RESUMEN GLOBAL */}
      <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/30 p-5 shadow-xl space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
            <Flame className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Resumen Global</h3>
            <p className="text-xs text-slate-400">Métricas totales de tu actividad</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-2 text-indigo-400">
              <Clock className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase text-slate-400">Tiempo visto</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-white">{horasTotales}h</p>
            <p className="text-[11px] text-slate-500">Equivale a {diasTotales} días</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase text-slate-400">Episodios</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-white">{episodiosDetalle.length}</p>
            <p className="text-[11px] text-slate-500">En {Object.keys(epsPorSerie).length} títulos</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-2 text-amber-400">
              <Star className="h-4 w-4 fill-amber-400" />
              <span className="text-[11px] font-semibold uppercase text-slate-400">Nota media</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-white">
              {notaMediaGlobal} <span className="text-xs font-normal text-slate-500">/ 5</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {itemsPuntuados.length} títulos · {epsPuntuados.length} caps
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-2 text-rose-400">
              <Film className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase text-slate-400">Completados</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-white">
              {tvTerminadas.length + pelisVistas.length}
            </p>
            <p className="text-[11px] text-slate-500">
              {tvTerminadas.length} series/shows · {pelisVistas.length} pelis
            </p>
          </div>
        </div>

        {totalItems > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap justify-between gap-2 text-[11px] font-medium">
              <span className="flex items-center gap-1 text-indigo-300">
                <Tv className="h-3 w-3" /> Series ({seriesPuras.length})
              </span>
              <span className="flex items-center gap-1 text-rose-300">
                <Film className="h-3 w-3" /> Películas ({pelisPuras.length})
              </span>
              <span className="flex items-center gap-1 text-emerald-300">
                <Clapperboard className="h-3 w-3" /> Documentales ({documentales.length})
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <Flame className="h-3 w-3" /> Realities ({realities.length})
              </span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-950">
              <div className="bg-indigo-500 transition-all duration-500" style={{ width: `${pctSeries}%` }} />
              <div className="bg-rose-500 transition-all duration-500" style={{ width: `${pctPelis}%` }} />
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${pctDocs}%` }} />
              <div className="bg-amber-500 transition-all duration-500" style={{ width: `${pctRealities}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* BLOQUES APILADOS POR CATEGORÍA */}
      {renderBloqueEpisodicos(
        'Series',
        'Progreso por serie, capítulos marcados y notas',
        <Tv className="h-4 w-4 text-indigo-400" />,
        'border-indigo-500/30',
        'bg-indigo-500/20 text-indigo-300',
        seriesPuras,
        'tv'
      )}

      {pelisPuras.length > 0 && (
        <section className="rounded-3xl border border-rose-500/30 bg-slate-900/45 p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-3 border-b border-slate-800/80 pb-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
              <Film className="h-4 w-4 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Películas</h3>
                <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-300">
                  {pelisPuras.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">Largometrajes registrados y valoraciones</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {pelisPuras.map((peli) => (
              <div
                key={peli.tmdb_id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
                    {peli.title || titulosCache[`movie-${peli.tmdb_id}`] || `Película #${peli.tmdb_id}`}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {peli.status === 'completed'
                      ? 'Vista (~1h 55m)'
                      : peli.status === 'watching'
                      ? 'Viendo ahora'
                      : 'En pendientes'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {peli.rating > 0 ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400" />
                      {peli.rating}/5
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">Sin nota</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {renderBloqueEpisodicos(
        'Documentales',
        'Docuseries y documentales registrados',
        <Clapperboard className="h-4 w-4 text-emerald-400" />,
        'border-emerald-500/30',
        'bg-emerald-500/20 text-emerald-300',
        documentales,
        'documentary'
      )}

      {renderBloqueEpisodicos(
        'Realities',
        'Programas y realities en seguimiento',
        <Flame className="h-4 w-4 text-amber-400" />,
        'border-amber-500/30',
        'bg-amber-500/20 text-amber-300',
        realities,
        'reality'
      )}

      {episodiosDetalle.length > 0 && (
        <section className="rounded-3xl border border-slate-700/60 bg-slate-900/45 p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-3 border-b border-slate-800/80 pb-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
              <History className="h-4 w-4 text-slate-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Últimos capítulos vistos</h3>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-300">
                  {episodiosDetalle.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">Historial cronológico de episodios marcados</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {episodiosDetalle.slice(0, 18).map((ep, idx) => {
              const nombreSerie = titulosCache[`tv-${ep.tmdb_id}`] || `Título #${ep.tmdb_id}`;
              return (
                <div
                  key={`${ep.tmdb_id}-${ep.season_number}-${ep.episode_number}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">
                      {nombreSerie}{' '}
                      <span className="text-indigo-400">
                        · T{ep.season_number} E{ep.episode_number}
                      </span>
                    </p>
                    {ep.review && (
                      <p className="truncate text-[11px] italic text-slate-400">
                        &quot;{ep.review}&quot;
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {ep.rating > 0 ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" />
                        {ep.rating}/5
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Sin nota</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}