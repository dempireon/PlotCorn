'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import {
  X, Star, Eye, Check, Clock, Play, Tv, Film,
  Calendar, Sparkles, Users, MessageSquare, Send, Share2
} from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface SerieModalProps {
  serie: MediaTMDB;
  user: any;
  estadoActual?: {
    status: 'watching' | 'completed' | 'watchlist';
    rating: number;
    current_season: number;
    current_episode: number;
  };
  onUpdateEstado: (
    status: 'watching' | 'completed' | 'watchlist',
    rating: number,
    season?: number,
    episode?: number
  ) => void;
  onClose: () => void;
  onRequireAuth: () => void;
}

export default function SerieModal({
  serie,
  user,
  estadoActual,
  onUpdateEstado,
  onClose,
  onRequireAuth,
}: SerieModalProps) {
  const [detalle, setDetalle] = useState<any>(null);
  const [reparto, setReparto] = useState<any[]>([]);
  const [plataformasES, setPlataformasES] = useState<any[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [mostrarTrailer, setMostrarTrailer] = useState(false);
  const [similares, setSimilares] = useState<MediaTMDB[]>([]);
  const [copiadoEnlace, setCopiadoEnlace] = useState(false);

  const [temporadaSeleccionada, setTemporadaSeleccionada] = useState<number>(
    estadoActual?.current_season || 1
  );
  const [episodiosTemp, setEpisodiosTemp] = useState<any[]>([]);
  const [episodiosVistosMap, setEpisodiosVistosMap] = useState<
    Record<string, { rating: number; review: string }>
  >({});

  const [comentarios, setComentarios] = useState<any[]>([]);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoCom, setEnviandoCom] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [mediaActiva, setMediaActiva] = useState<MediaTMDB>(serie);

  const esPeli = mediaActiva.media_type === 'movie';

  useEffect(() => {
    setMediaActiva(serie);
    setMostrarTrailer(false);
  }, [serie]);

  useEffect(() => {
    cargarFichaCompleta();
  }, [mediaActiva.id, mediaActiva.media_type, user?.id]);

  useEffect(() => {
    if (!esPeli && mediaActiva.id) {
      cargarEpisodiosTemporada(temporadaSeleccionada);
      recargarEpisodiosVistos();
    }
  }, [temporadaSeleccionada, mediaActiva.id, esPeli, user?.id]);

  async function compartirFicha() {
    const url = `${window.location.origin}/?media=${mediaActiva.media_type || 'tv'}-${mediaActiva.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${titulo} en PlotCorn`,
          text: `Mira ${titulo} en PlotCorn`,
          url,
        });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopiadoEnlace(true);
    setTimeout(() => setCopiadoEnlace(false), 2500);
  }

  async function cargarFichaCompleta() {
    setCargando(true);
    const tipo = mediaActiva.media_type || 'tv';

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/${tipo}/${mediaActiva.id}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=credits,videos,watch/providers,recommendations`
      );
      const data = await res.json();
      setDetalle(data);

      setReparto((data.credits?.cast || []).slice(0, 12));

      const provES = data['watch/providers']?.results?.ES;
      const flatrate = provES?.flatrate || [];
      const free = provES?.free || [];
      const ads = provES?.ads || [];
      const unicosMap: Record<number, any> = {};
      [...flatrate, ...free, ...ads].forEach((p: any) => {
        unicosMap[p.provider_id] = p;
      });
      setPlataformasES(Object.values(unicosMap));

      let videos = data.videos?.results || [];
      if (videos.length === 0) {
        const resEn = await fetch(
          `https://api.themoviedb.org/3/${tipo}/${mediaActiva.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`
        );
        const dataEn = await resEn.json();
        videos = dataEn.results || [];
      }
      const trailer =
        videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
        videos.find((v: any) => v.site === 'YouTube');
      setTrailerKey(trailer?.key || null);

      const recs = (data.recommendations?.results || []).slice(0, 5).map((r: any) => ({
        id: r.id,
        media_type: (r.media_type || tipo) as MediaType,
        name: r.title || r.name,
        overview: r.overview || '',
        poster_path: r.poster_path,
        backdrop_path: r.backdrop_path,
        first_air_date: r.release_date || r.first_air_date || '',
        vote_average: r.vote_average || 0,
      }));
      setSimilares(recs);

      if (tipo === 'tv' && user) {
        const { data: vistos } = await supabase
          .from('watched_episodes')
          .select('*')
          .eq('user_id', user.id)
          .eq('tmdb_id', mediaActiva.id);

        const mapa: Record<string, { rating: number; review: string }> = {};
        (vistos || []).forEach((v: any) => {
          mapa[`${v.season_number}-${v.episode_number}`] = {
            rating: v.rating || 0,
            review: v.review || '',
          };
        });

        if (estadoActual?.status === 'watching') {
          const topeTemp = estadoActual.current_season || 1;
          const topeEp = estadoActual.current_episode || 1;
          const nuevosVistos: any[] = [];

          for (let t = 1; t <= topeTemp; t++) {
            const limiteEpTemp = t < topeTemp ? 30 : topeEp;
            for (let e = 1; e <= limiteEpTemp; e++) {
              const clave = `${t}-${e}`;
              if (!mapa[clave]) {
                mapa[clave] = { rating: 0, review: '' };
                nuevosVistos.push({
                  user_id: user.id,
                  tmdb_id: mediaActiva.id,
                  season_number: t,
                  episode_number: e,
                  rating: 0,
                  watched_at: new Date().toISOString(),
                });
              }
            }
          }

          if (nuevosVistos.length > 0) {
            await supabase.from('watched_episodes').upsert(nuevosVistos, {
              onConflict: 'user_id,tmdb_id,season_number,episode_number',
              ignoreDuplicates: true,
            });
          }
        }

        setEpisodiosVistosMap(mapa);
      } else {
        setEpisodiosVistosMap({});
      }

      await cargarComentarios();
    } catch (err) {
      console.error('Error cargando ficha:', err);
    }

    setCargando(false);
  }

  async function recargarEpisodiosVistos() {
    if (esPeli || !user) return;
    const { data: vistos } = await supabase
      .from('watched_episodes')
      .select('season_number, episode_number, rating, review')
      .eq('user_id', user.id)
      .eq('tmdb_id', mediaActiva.id);

    setEpisodiosVistosMap((prev) => {
      const mapa: Record<string, { rating: number; review: string }> = { ...prev };
      (vistos || []).forEach((v: any) => {
        const key = `${v.season_number}-${v.episode_number}`;
        const notaBd = v.rating || 0;
        const notaPrev = mapa[key]?.rating || 0;
        mapa[key] = {
          rating: notaBd > 0 ? notaBd : notaPrev,
          review: v.review || mapa[key]?.review || '',
        };
      });
      return mapa;
    });
  }

  async function cargarEpisodiosTemporada(seasonNum: number) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/tv/${mediaActiva.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=es-ES`
      );
      if (!res.ok) return;
      const data = await res.json();
      setEpisodiosTemp(data.episodes || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleEpisodioVisto(seasonNum: number, episodeNum: number) {
    if (!user) return onRequireAuth();
    const clave = `${seasonNum}-${episodeNum}`;
    const yaVisto = !!episodiosVistosMap[clave];

    if (yaVisto) {
      setEpisodiosVistosMap((prev) => {
        const copia = { ...prev };
        delete copia[clave];
        return copia;
      });
      await supabase
        .from('watched_episodes')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', mediaActiva.id)
        .eq('season_number', seasonNum)
        .eq('episode_number', episodeNum);
    } else {
      setEpisodiosVistosMap((prev) => ({
        ...prev,
        [clave]: { rating: 0, review: '' },
      }));

      await supabase.from('watched_episodes').upsert(
        {
          user_id: user.id,
          tmdb_id: mediaActiva.id,
          season_number: seasonNum,
          episode_number: episodeNum,
          rating: 0,
          watched_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tmdb_id,season_number,episode_number' }
      );

      onUpdateEstado(
        estadoActual?.status === 'completed' ? 'completed' : 'watching',
        estadoActual?.rating || 0,
        seasonNum,
        episodeNum
      );
    }
  }

  async function puntuarEpisodio(seasonNum: number, episodeNum: number, rating: number) {
    if (!user) return onRequireAuth();
    const clave = `${seasonNum}-${episodeNum}`;
    setEpisodiosVistosMap((prev) => ({
      ...prev,
      [clave]: { rating, review: prev[clave]?.review || '' },
    }));

    await supabase.from('watched_episodes').upsert(
      {
        user_id: user.id,
        tmdb_id: mediaActiva.id,
        season_number: seasonNum,
        episode_number: episodeNum,
        rating,
        watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,season_number,episode_number' }
    );
  }

  async function cargarComentarios() {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('tmdb_id', mediaActiva.id)
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
      setComentarios([]);
      return;
    }

    const uIds = Array.from(new Set(data.map((c: any) => c.user_id)));
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', uIds);

    const pMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => {
      pMap[p.id] = p.username;
    });

    setComentarios(
      data.map((c: any) => ({
        ...c,
        username: pMap[c.user_id] || 'usuario',
      }))
    );
  }

  async function publicarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!nuevoComentario.trim() || enviandoCom) return;

    setEnviandoCom(true);
    const texto = nuevoComentario.trim();
    setNuevoComentario('');

    const { error } = await supabase.from('comments').insert({
      user_id: user.id,
      tmdb_id: mediaActiva.id,
      media_type: mediaActiva.media_type || 'tv',
      content: texto,
    });

    if (!error) {
      await cargarComentarios();
    }
    setEnviandoCom(false);
  }

  const titulo = detalle?.title || detalle?.name || mediaActiva.name;
  const fechaLanzamiento = detalle?.release_date || detalle?.first_air_date || '';
  const anio = fechaLanzamiento ? fechaLanzamiento.slice(0, 4) : '';
  const duracion = esPeli
    ? detalle?.runtime
      ? `${detalle.runtime} min`
      : null
    : detalle?.number_of_seasons
    ? `${detalle.number_of_seasons} temp${detalle.number_of_seasons > 1 ? 's' : ''}`
    : null;

  const temporadasValidas = (detalle?.seasons || []).filter((s: any) => s.season_number > 0);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-5 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[93vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* Cabecera compacta en móvil y amplia en escritorio */}
        <div className="relative border-b border-slate-800 bg-slate-900">
          {detalle?.backdrop_path && (
            <img
              src={`https://image.tmdb.org/t/p/w1280${detalle.backdrop_path}`}
              alt={titulo}
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-950/45" />

          <button
            onClick={onClose}
            aria-label="Cerrar ficha"
            className="absolute right-3 top-3 z-10 rounded-full bg-slate-950/85 p-2 text-slate-300 backdrop-blur-md transition hover:bg-slate-800 hover:text-white sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <div className="relative flex flex-row items-start gap-3.5 p-4 pr-12 sm:items-end sm:gap-5 sm:p-6 sm:pr-6">
            <img
              src={getPosterUrl(detalle?.poster_path || mediaActiva.poster_path)}
              alt={titulo}
              className="h-28 w-20 shrink-0 rounded-xl border border-slate-700/80 object-cover shadow-xl sm:h-44 sm:w-32 sm:rounded-2xl sm:shadow-2xl"
            />

            <div className="min-w-0 flex-1 space-y-2 sm:space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:px-2.5 sm:text-[11px] ${
                    esPeli
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-indigo-500/20 text-indigo-300'
                  }`}
                >
                  {esPeli ? <Film className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <Tv className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                  {esPeli ? 'Película' : 'Serie'}
                </span>

                {anio && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-300 sm:text-xs">
                    <Calendar className="h-3 w-3 text-slate-400 sm:h-3.5 sm:w-3.5" />
                    {anio}
                  </span>
                )}

                {duracion && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-300 sm:text-xs">
                    <Clock className="h-3 w-3 text-slate-400 sm:h-3.5 sm:w-3.5" />
                    {duracion}
                  </span>
                )}

                {(detalle?.vote_average || mediaActiva.vote_average) > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-400 sm:px-2.5 sm:text-xs">
                    <Star className="h-3 w-3 fill-amber-400 sm:h-3.5 sm:w-3.5" />
                    {(detalle?.vote_average || mediaActiva.vote_average).toFixed(1)}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-bold leading-snug text-white sm:text-2xl sm:leading-tight">
                {titulo}
              </h2>

              {detalle?.genres && detalle.genres.length > 0 && (
                <div className="hidden flex-wrap gap-1.5 sm:flex">
                  {detalle.genres.map((g: any) => (
                    <span
                      key={g.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-0.5 text-[11px] text-slate-300"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Controles compactos en móvil */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 sm:gap-2 sm:pt-1">
                <button
                  onClick={() => onUpdateEstado('watching', estadoActual?.rating || 0)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs ${
                    estadoActual?.status === 'watching'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'border border-slate-700 bg-slate-900/90 text-slate-200 hover:border-indigo-500'
                  }`}
                >
                  <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Viendo
                </button>

                <button
                  onClick={() => onUpdateEstado('completed', estadoActual?.rating || 0)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs ${
                    estadoActual?.status === 'completed'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'border border-slate-700 bg-slate-900/90 text-slate-200 hover:border-emerald-500'
                  }`}
                >
                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {esPeli ? 'Vista' : 'Terminada'}
                </button>

                <button
                  onClick={() => onUpdateEstado('watchlist', estadoActual?.rating || 0)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs ${
                    estadoActual?.status === 'watchlist'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : 'border border-slate-700 bg-slate-900/90 text-slate-200 hover:border-amber-500'
                  }`}
                >
                  <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  Pendiente
                </button>

                <div className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1 sm:gap-1 sm:rounded-xl sm:px-2.5 sm:py-1.5">
                  {[1, 2, 3, 4, 5].map((num) => {
                    const notaActual = estadoActual?.rating || 0;
                    const nuevaNota = notaActual === num ? 0 : num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() =>
                          onUpdateEstado(estadoActual?.status || 'completed', nuevaNota)
                        }
                        className="text-slate-600 transition hover:scale-110 hover:text-amber-400"
                        title={nuevaNota === 0 ? 'Quitar puntuación' : `Puntuar con ${num}`}
                      >
                        <Star
                          className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${
                            notaActual >= num
                              ? 'fill-amber-400 text-amber-400'
                              : ''
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {trailerKey && (
                  <button
                    onClick={() => setMostrarTrailer(!mostrarTrailer)}
                    className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500 sm:gap-1.5 sm:rounded-xl sm:px-3.5 sm:py-1.5 sm:text-xs"
                  >
                    <Play className="h-3 w-3 fill-white sm:h-3.5 sm:w-3.5" />
                    {mostrarTrailer ? 'Ocultar' : 'Tráiler'}
                  </button>
                )}

                <button
                  onClick={compartirFicha}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-[11px] font-bold text-slate-200 transition hover:border-indigo-500 hover:text-white sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-xs"
                >
                  {copiadoEnlace ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400 sm:h-3.5 sm:w-3.5" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3 w-3 text-indigo-400 sm:h-3.5 sm:w-3.5" />
                      Compartir
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal con espacio cómodo en móvil */}
        <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Cargando ficha técnica...
            </div>
          ) : (
            <>
              {mostrarTrailer && trailerKey && (
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-xl">
                  <div className="aspect-video w-full">
                    <iframe
                      src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                      title="Tráiler oficial"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/45 p-4 lg:col-span-2">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Sinopsis
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-200">
                    {detalle?.overview ||
                      mediaActiva.overview ||
                      'No hay sinopsis disponible en español para este título.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/45 p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-300">
                    <Tv className="h-3.5 w-3.5" />
                    Dónde ver en España
                  </h3>
                  {plataformasES.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No disponible actualmente en suscripción en España.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {plataformasES.map((prov: any) => (
                        <div
                          key={prov.provider_id}
                          className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5"
                          title={prov.provider_name}
                        >
                          <img
                            src={`https://image.tmdb.org/t/p/original${prov.logo_path}`}
                            alt={prov.provider_name}
                            className="h-5 w-5 rounded-md object-cover sm:h-6 sm:w-6 sm:rounded-lg"
                          />
                          <span className="text-xs font-semibold text-slate-200">
                            {prov.provider_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {reparto.length > 0 && (
                <section className="rounded-2xl border border-slate-800/80 bg-slate-900/45 p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Users className="h-3.5 w-3.5 text-indigo-400" />
                    Reparto principal
                  </h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {reparto.map((actor: any) => (
                      <div
                        key={actor.id}
                        className="w-24 shrink-0 rounded-xl border border-slate-800 bg-slate-950 p-2 text-center"
                      >
                        <img
                          src={
                            actor.profile_path
                              ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                              : 'https://via.placeholder.com/185x278/1e293b/94a3b8?text=Sin+Foto'
                          }
                          alt={actor.name}
                          className="mx-auto h-24 w-20 rounded-lg object-cover"
                        />
                        <p className="mt-1.5 line-clamp-1 text-[11px] font-bold text-white">
                          {actor.name}
                        </p>
                        <p className="line-clamp-1 text-[10px] text-slate-400">
                          {actor.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!esPeli && temporadasValidas.length > 0 && (
                <section className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Episodios por temporada
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {temporadasValidas.map((temp: any) => (
                        <button
                          key={temp.season_number}
                          onClick={() => setTemporadaSeleccionada(temp.season_number)}
                          className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                            temporadaSeleccionada === temp.season_number
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          Temp {temp.season_number}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {episodiosTemp.map((ep: any) => {
                      const clave = `${temporadaSeleccionada}-${ep.episode_number}`;
                      const infoEp = episodiosVistosMap[clave];
                      const visto = !!infoEp;

                      return (
                        <div
                          key={ep.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                            visto
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-slate-800 bg-slate-950/80'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <button
                              onClick={() =>
                                toggleEpisodioVisto(temporadaSeleccionada, ep.episode_number)
                              }
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                                visto
                                  ? 'border-emerald-500 bg-emerald-600 text-white'
                                  : 'border-slate-700 bg-slate-900 text-transparent hover:border-indigo-500'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                            </button>

                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-white">
                                {ep.episode_number}. {ep.name}
                              </p>
                              <p className="line-clamp-1 text-[11px] text-slate-400">
                                {ep.overview || 'Sin descripción disponible'}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((estrella) => {
                              const notaEpActual = infoEp?.rating || 0;
                              const nuevaNotaEp = notaEpActual === estrella ? 0 : estrella;
                              return (
                                <button
                                  key={estrella}
                                  type="button"
                                  onClick={() =>
                                    puntuarEpisodio(
                                      temporadaSeleccionada,
                                      ep.episode_number,
                                      nuevaNotaEp
                                    )
                                  }
                                  className="p-0.5 text-slate-700 hover:text-amber-400"
                                  title={nuevaNotaEp === 0 ? 'Quitar puntuación' : `Puntuar con ${estrella}`}
                                >
                                  <Star
                                    className={`h-3 w-3 ${
                                      notaEpActual >= estrella
                                        ? 'fill-amber-400 text-amber-400'
                                        : ''
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {similares.length > 0 && (
                <section className="rounded-2xl border border-slate-800/80 bg-slate-900/45 p-4">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Títulos similares recomendados
                  </h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {similares.map((sim) => (
                      <div
                        key={sim.id}
                        onClick={() => {
                          setMostrarTrailer(false);
                          setMediaActiva(sim);
                        }}
                        className="cursor-pointer space-y-1.5"
                      >
                        <img
                          src={getPosterUrl(sim.poster_path)}
                          alt={sim.name}
                          className="aspect-[2/3] w-full rounded-xl object-cover transition hover:scale-105"
                        />
                        <p className="truncate text-xs font-semibold text-slate-200">
                          {sim.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/45 p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                  Opiniones de la comunidad ({comentarios.length})
                </h3>

                <form onSubmit={publicarComentario} className="flex gap-2">
                  <input
                    type="text"
                    value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    placeholder="Escribe qué te pareció este título..."
                    className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!nuevoComentario.trim() || enviandoCom}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publicar
                  </button>
                </form>

                {comentarios.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {comentarios.map((com) => (
                      <div
                        key={com.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-indigo-400">@{com.username}</span>
                          <span className="text-slate-500">
                            {new Date(com.created_at).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-200">{com.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}