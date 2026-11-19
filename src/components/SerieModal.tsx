'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getMediaDetails,
  getWatchProviders,
  getSeasonEpisodes,
  getPosterUrl,
  MediaTMDB,
  MediaDetalle,
  EpisodioTMDB,
} from '@/lib/tmdb';
import { supabase } from '@/lib/supabase';
import {
  X, Star, MessageSquare, Send, ShieldAlert, Tv, Film,
  SendHorizonal, CheckCircle2, Eye, Clock, Check, ListChecks
} from 'lucide-react';

interface SerieModalProps {
  serie: MediaTMDB;
  user: any;
  estadoActual?: {
    status: 'watching' | 'completed' | 'watchlist';
    rating: number;
    current_season: number;
    current_episode: number;
  };
  onUpdateEstado?: (
    status: 'watching' | 'completed' | 'watchlist',
    rating: number,
    season: number,
    episode: number
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
  const esPelicula = serie.media_type === 'movie';

  const [detalle, setDetalle] = useState<MediaDetalle | null>(null);
  const [plataformas, setPlataformas] = useState<any[]>([]);
  const [tab, setTab] = useState<'episodios' | 'chat' | 'resenas'>(esPelicula ? 'chat' : 'episodios');

  // Cuadrícula de episodios, notas y comentarios por episodio
  const [tempVistaCuadro, setTempVistaCuadro] = useState<number>(estadoActual?.current_season || 1);
  const [episodiosTemp, setEpisodiosTemp] = useState<EpisodioTMDB[]>([]);
  const [episodiosVistos, setEpisodiosVistos] = useState<Record<string, { watched: boolean; rating: number }>>({});
  const [cargandoEpisodios, setCargandoEpisodios] = useState(false);

  const [episodioSeleccionado, setEpisodioSeleccionado] = useState<EpisodioTMDB | null>(null);
  const [comentariosEp, setComentariosEp] = useState<any[]>([]);
  const [nuevoComentarioEp, setNuevoComentarioEp] = useState('');
  const [cargandoComentariosEp, setCargandoComentariosEp] = useState(false);

  // Reseñas generales
  const [reviews, setReviews] = useState<any[]>([]);
  const [nuevaReview, setNuevaReview] = useState('');
  const [tieneSpoilers, setTieneSpoilers] = useState(false);
  const [revelarSpoilers, setRevelarSpoilers] = useState<Record<string, boolean>>({});

  // Chat general
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [temporadaSeleccionada, setTemporadaSeleccionada] = useState(1);
  const [filtroMaxTemporada, setFiltroMaxTemporada] = useState<number>(99);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cargarTodo();

    const channel = supabase
      .channel(`chat-${serie.media_type}-${serie.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `tmdb_id=eq.${serie.id}`,
        },
        async (payload) => {
          if ((payload.new.media_type || 'tv') !== serie.media_type) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', payload.new.user_id)
            .single();

          setMensajes((prev) => [
            ...prev,
            { ...payload.new, profiles: { username: profile?.username || 'usuario' } },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serie.id, serie.media_type]);

  useEffect(() => {
    if (!esPelicula) {
      setEpisodioSeleccionado(null);
      cargarEpisodiosDeTemporada(tempVistaCuadro);
    }
  }, [tempVistaCuadro, serie.id, esPelicula]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, tab]);

  async function cargarTodo() {
    const [det, provs] = await Promise.all([
      getMediaDetails(serie.id, serie.media_type),
      getWatchProviders(serie.id, serie.media_type),
    ]);
    setDetalle(det);
    setPlataformas(provs);
    if (det?.number_of_seasons) {
      setFiltroMaxTemporada(det.number_of_seasons);
    }

    if (!esPelicula && user) {
      const { data: vistos } = await supabase
        .from('watched_episodes')
        .select('season_number, episode_number, rating')
        .eq('user_id', user.id)
        .eq('tmdb_id', serie.id);

      if (vistos) {
        const mapaVistos: Record<string, { watched: boolean; rating: number }> = {};
        vistos.forEach((v) => {
          mapaVistos[`${v.season_number}-${v.episode_number}`] = {
            watched: true,
            rating: v.rating || 0,
          };
        });
        setEpisodiosVistos(mapaVistos);
      }
    }

    const { data: revs } = await supabase
      .from('reviews')
      .select('*, profiles(username)')
      .eq('tmdb_id', serie.id)
      .eq('media_type', serie.media_type)
      .order('created_at', { ascending: false });
    if (revs) setReviews(revs);

    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*, profiles(username)')
      .eq('tmdb_id', serie.id)
      .eq('media_type', serie.media_type)
      .order('created_at', { ascending: true })
      .limit(100);
    if (msgs) setMensajes(msgs);
  }

  async function cargarEpisodiosDeTemporada(seasonNum: number) {
    setCargandoEpisodios(true);
    const eps = await getSeasonEpisodes(serie.id, seasonNum);
    setEpisodiosTemp(eps);
    setCargandoEpisodios(false);
  }

  async function abrirDetalleEpisodio(ep: EpisodioTMDB) {
    setEpisodioSeleccionado(ep);
    setCargandoComentariosEp(true);
    const { data } = await supabase
      .from('episode_comments')
      .select('*, profiles(username)')
      .eq('tmdb_id', serie.id)
      .eq('season_number', tempVistaCuadro)
      .eq('episode_number', ep.episode_number)
      .order('created_at', { ascending: false });

    setComentariosEp(data || []);
    setCargandoComentariosEp(false);
  }

  async function toggleEpisodioVisto(seasonNum: number, episodeNum: number) {
    if (!user) return onRequireAuth();

    const clave = `${seasonNum}-${episodeNum}`;
    const yaVisto = episodiosVistos[clave]?.watched;
    const copia = { ...episodiosVistos };

    if (yaVisto) {
      delete copia[clave];
      setEpisodiosVistos(copia);
      await supabase
        .from('watched_episodes')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', serie.id)
        .eq('season_number', seasonNum)
        .eq('episode_number', episodeNum);
    } else {
      copia[clave] = { watched: true, rating: 0 };
      setEpisodiosVistos(copia);
      await supabase.from('watched_episodes').upsert({
        user_id: user.id,
        tmdb_id: serie.id,
        season_number: seasonNum,
        episode_number: episodeNum,
        rating: 0,
      });

      if (onUpdateEstado && estadoActual?.status !== 'completed') {
        onUpdateEstado('watching', estadoActual?.rating || 0, seasonNum, episodeNum);
      }
    }
  }

  async function puntuarEpisodio(seasonNum: number, episodeNum: number, rating: number) {
    if (!user) return onRequireAuth();

    const clave = `${seasonNum}-${episodeNum}`;
    setEpisodiosVistos((prev) => ({
      ...prev,
      [clave]: { watched: true, rating },
    }));

    await supabase.from('watched_episodes').upsert({
      user_id: user.id,
      tmdb_id: serie.id,
      season_number: seasonNum,
      episode_number: episodeNum,
      rating,
    });

    if (onUpdateEstado && !estadoActual) {
      onUpdateEstado('watching', 0, seasonNum, episodeNum);
    }
  }

  async function publicarComentarioEpisodio(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!episodioSeleccionado || !nuevoComentarioEp.trim()) return;

    const texto = nuevoComentarioEp.trim();
    setNuevoComentarioEp('');

    const { data, error } = await supabase
      .from('episode_comments')
      .insert({
        user_id: user.id,
        tmdb_id: serie.id,
        season_number: tempVistaCuadro,
        episode_number: episodioSeleccionado.episode_number,
        content: texto,
      })
      .select('*, profiles(username)')
      .single();

    if (!error && data) {
      setComentariosEp([data, ...comentariosEp]);
    }
  }

  async function marcarTemporadaCompleta(seasonNum: number) {
    if (!user) return onRequireAuth();
    if (episodiosTemp.length === 0) return;

    const copia = { ...episodiosVistos };
    const filas = episodiosTemp.map((ep) => {
      const clave = `${seasonNum}-${ep.episode_number}`;
      const notaPrevia = copia[clave]?.rating || 0;
      copia[clave] = { watched: true, rating: notaPrevia };
      return {
        user_id: user.id,
        tmdb_id: serie.id,
        season_number: seasonNum,
        episode_number: ep.episode_number,
        rating: notaPrevia,
      };
    });

    setEpisodiosVistos(copia);
    await supabase.from('watched_episodes').upsert(filas);

    if (onUpdateEstado && estadoActual?.status !== 'completed') {
      const ultimoEp = episodiosTemp[episodiosTemp.length - 1].episode_number;
      onUpdateEstado('watching', estadoActual?.rating || 0, seasonNum, ultimoEp);
    }
  }

  async function asegurarEnCache() {
    await supabase.from('series_cache').upsert({
      tmdb_id: serie.id,
      media_type: serie.media_type,
      title: serie.name,
      poster_path: serie.poster_path,
      total_seasons: detalle?.number_of_seasons || 1,
    });
  }

  async function publicarReview(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!nuevaReview.trim()) return;

    await asegurarEnCache();
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        user_id: user.id,
        tmdb_id: serie.id,
        media_type: serie.media_type,
        content: nuevaReview.trim(),
        has_spoilers: tieneSpoilers,
      })
      .select('*, profiles(username)')
      .single();

    if (!error && data) {
      setReviews([data, ...reviews]);
      setNuevaReview('');
      setTieneSpoilers(false);
    }
  }

  async function enviarMensajeChat(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!nuevoMensaje.trim()) return;

    const texto = nuevoMensaje.trim();
    setNuevoMensaje('');

    await asegurarEnCache();
    await supabase.from('chat_messages').insert({
      tmdb_id: serie.id,
      media_type: serie.media_type,
      user_id: user.id,
      message: texto,
      season_tag: esPelicula ? 1 : temporadaSeleccionada,
    });
  }

  const totalTemporadas = detalle?.number_of_seasons || 1;
  const mensajesFiltrados = esPelicula
    ? mensajes
    : mensajes.filter((m) => (m.season_tag || 1) <= filtroMaxTemporada);

  const seasonActual = estadoActual?.current_season || 1;
  const episodeActual = estadoActual?.current_episode || 1;

  const vistosEnEstaTemp = episodiosTemp.filter(
    (ep) => episodiosVistos[`${tempVistaCuadro}-${ep.episode_number}`]?.watched
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto p-6">
          {/* Cabecera */}
          <div className="flex flex-col gap-6 sm:flex-row">
            <img
              src={getPosterUrl(serie.poster_path)}
              alt={serie.name}
              className="h-72 w-48 self-center rounded-2xl object-cover shadow-2xl sm:self-start"
            />

            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    esPelicula
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-indigo-500/20 text-indigo-300'
                  }`}
                >
                  {esPelicula ? <Film className="h-3.5 w-3.5" /> : <Tv className="h-3.5 w-3.5" />}
                  {esPelicula ? 'Película' : 'Serie'}
                </span>
                <h2 className="text-2xl font-bold text-white">{serie.name}</h2>
                {serie.vote_average > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-400">
                    <Star className="h-3.5 w-3.5 fill-amber-400" />
                    {serie.vote_average.toFixed(1)}
                  </span>
                )}
              </div>

              {detalle && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-lg bg-slate-800/90 px-2.5 py-1 font-medium">
                    {esPelicula
                      ? `${detalle.runtime || '?'} min · ${detalle.first_air_date?.slice(0, 4) || ''}`
                      : `${detalle.number_of_seasons} Temporadas · ${detalle.number_of_episodes} Episodios`}
                  </span>
                  {detalle.genres?.map((g) => (
                    <span key={g.id} className="rounded-lg border border-slate-800 px-2.5 py-1 text-slate-400">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-sm leading-relaxed text-slate-300">
                {detalle?.overview || serie.overview || 'Sin sinopsis disponible en español.'}
              </p>

              {/* Controles de Estado y Nota */}
              {onUpdateEstado && (
                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Tu estado
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-xs text-slate-400">Nota global:</span>
                      {[1, 2, 3, 4, 5].map((estrella) => (
                        <button
                          key={estrella}
                          onClick={() =>
                            onUpdateEstado(
                              estadoActual?.status || 'completed',
                              estrella,
                              seasonActual,
                              episodeActual
                            )
                          }
                          className="p-0.5 transition hover:scale-110"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              (estadoActual?.rating || 0) >= estrella
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-600 hover:text-amber-400'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() =>
                        onUpdateEstado('watching', estadoActual?.rating || 0, seasonActual, episodeActual)
                      }
                      className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                        estadoActual?.status === 'watching'
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      {esPelicula ? 'Viendo' : 'Siguiendo'}
                    </button>
                    <button
                      onClick={() =>
                        onUpdateEstado('completed', estadoActual?.rating || 0, seasonActual, episodeActual)
                      }
                      className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                        estadoActual?.status === 'completed'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {esPelicula ? 'Vista' : 'Terminada'}
                    </button>
                    <button
                      onClick={() =>
                        onUpdateEstado('watchlist', estadoActual?.rating || 0, seasonActual, episodeActual)
                      }
                      className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition ${
                        estadoActual?.status === 'watchlist'
                          ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      Pendiente
                    </button>
                  </div>
                </div>
              )}

              {plataformas.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-400">Dónde ver en España:</p>
                  <div className="flex flex-wrap gap-2">
                    {plataformas.map((p: any) => (
                      <div
                        key={p.provider_id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
                      >
                        <img
                          src={`https://image.tmdb.org/t/p/original${p.logo_path}`}
                          alt={p.provider_name}
                          className="h-4 w-4 rounded"
                        />
                        {p.provider_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pestañas */}
          <div className="mt-8 border-b border-slate-800">
            <div className="flex gap-6">
              {!esPelicula && (
                <button
                  onClick={() => setTab('episodios')}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
                    tab === 'episodios'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <ListChecks className="h-4 w-4" />
                  Episodios ({Object.keys(episodiosVistos).length} vistos)
                </button>
              )}
              <button
                onClick={() => setTab('chat')}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
                  tab === 'chat'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Tv className="h-4 w-4" />
                Chat general ({mensajesFiltrados.length})
              </button>
              <button
                onClick={() => setTab('resenas')}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
                  tab === 'resenas'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                Reseñas ({reviews.length})
              </button>
            </div>
          </div>

          {/* CUADRO VISUAL DE EPISODIOS + NOTA Y COMENTARIOS POR CAPÍTULO */}
          {!esPelicula && tab === 'episodios' && (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {[...Array(totalTemporadas)].map((_, idx) => {
                    const numTemp = idx + 1;
                    return (
                      <button
                        key={numTemp}
                        onClick={() => setTempVistaCuadro(numTemp)}
                        className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                          tempVistaCuadro === numTemp
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        Temp {numTemp}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400">
                    {vistosEnEstaTemp} / {episodiosTemp.length} vistos
                  </span>
                  <button
                    onClick={() => marcarTemporadaCompleta(tempVistaCuadro)}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-600 hover:text-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar Temp {tempVistaCuadro} vista
                  </button>
                </div>
              </div>

              {episodiosTemp.length > 0 && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.round((vistosEnEstaTemp / episodiosTemp.length) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {/* Cuadrícula de episodios */}
              {cargandoEpisodios ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-950" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                  {episodiosTemp.map((ep) => {
                    const infoEp = episodiosVistos[`${tempVistaCuadro}-${ep.episode_number}`];
                    const visto = infoEp?.watched;
                    const seleccionado = episodioSeleccionado?.episode_number === ep.episode_number;

                    return (
                      <div
                        key={ep.id || ep.episode_number}
                        onClick={() => abrirDetalleEpisodio(ep)}
                        className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3 transition ${
                          seleccionado
                            ? 'border-indigo-500 bg-indigo-950/40 ring-1 ring-indigo-500'
                            : visto
                            ? 'border-emerald-500/50 bg-emerald-950/30 hover:border-emerald-400'
                            : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs font-bold ${
                                visto ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              Ep. {ep.episode_number}
                            </span>
                            {infoEp && infoEp.rating > 0 && (
                              <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                                ★{infoEp.rating}
                              </span>
                            )}
                          </div>

                          {/* Botón directo de visto */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEpisodioVisto(tempVistaCuadro, ep.episode_number);
                            }}
                            title={visto ? 'Desmarcar visto' : 'Marcar como visto'}
                            className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
                              visto
                                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                : 'border border-slate-700 bg-slate-900 text-slate-500 hover:border-emerald-500 hover:text-emerald-400'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          </button>
                        </div>

                        <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-200">
                          {ep.name || `Episodio ${ep.episode_number}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PANEL INTERACTIVO DEL EPISODIO SELECCIONADO (Nota + Comentarios) */}
              {episodioSeleccionado ? (
                <div className="rounded-2xl border border-indigo-500/40 bg-slate-950/90 p-5 shadow-xl space-y-4">
                  <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                        Temporada {tempVistaCuadro} · Episodio {episodioSeleccionado.episode_number}
                      </span>
                      <h4 className="text-lg font-bold text-white">
                        {episodioSeleccionado.name}
                      </h4>
                    </div>

                    {/* Puntuación del episodio */}
                    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                      <span className="text-xs text-slate-400">Tu nota del ep:</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((estrella) => {
                          const notaEp =
                            episodiosVistos[`${tempVistaCuadro}-${episodioSeleccionado.episode_number}`]
                              ?.rating || 0;
                          return (
                            <button
                              key={estrella}
                              onClick={() =>
                                puntuarEpisodio(
                                  tempVistaCuadro,
                                  episodioSeleccionado.episode_number,
                                  estrella
                                )
                              }
                              className="transition hover:scale-110"
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  notaEp >= estrella
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-600 hover:text-amber-400'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {episodioSeleccionado.overview && (
                    <p className="text-xs leading-relaxed text-slate-400">
                      {episodioSeleccionado.overview}
                    </p>
                  )}

                  {/* Caja para comentar este episodio */}
                  <form onSubmit={publicarComentarioEpisodio} className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoComentarioEp}
                      onChange={(e) => setNuevoComentarioEp(e.target.value)}
                      placeholder={`Comenta qué te ha parecido el T${tempVistaCuadro}E${episodioSeleccionado.episode_number}...`}
                      className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Comentar
                    </button>
                  </form>

                  {/* Lista de comentarios de este episodio */}
                  <div className="max-h-48 space-y-2 overflow-y-auto pt-1">
                    {cargandoComentariosEp ? (
                      <p className="text-center text-xs text-slate-500">Cargando comentarios...</p>
                    ) : comentariosEp.length === 0 ? (
                      <p className="py-3 text-center text-xs text-slate-500">
                        Nadie ha comentado este episodio aún. ¡Sé el primero!
                      </p>
                    ) : (
                      comentariosEp.map((com) => (
                        <div
                          key={com.id}
                          className="rounded-xl border border-slate-800/80 bg-slate-900/80 p-3"
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-400">
                              @{com.profiles?.username || 'usuario'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200">{com.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-500">
                  Haz clic en cualquier episodio de la cuadrícula para puntuarlo y leer o escribir comentarios sobre ese capítulo.
                </p>
              )}
            </div>
          )}

          {/* Chat general */}
          {tab === 'chat' && (
            <div className="mt-4 space-y-4">
              {!esPelicula && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/80 p-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <span>Escudo anti-spoilers: mostrar mensajes hasta la</span>
                  </div>
                  <select
                    value={filtroMaxTemporada}
                    onChange={(e) => setFiltroMaxTemporada(Number(e.target.value))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-white focus:border-indigo-500 focus:outline-none"
                  >
                    {[...Array(totalTemporadas)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Temporada {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="h-60 space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                {mensajesFiltrados.length === 0 ? (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Nadie ha comentado aún. ¡Rompe el hielo!
                  </p>
                ) : (
                  mensajesFiltrados.map((msg) => {
                    const esMio = user && msg.user_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}
                      >
                        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="font-semibold text-indigo-400">
                            @{msg.profiles?.username || 'usuario'}
                          </span>
                          {!esPelicula && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
                              T{msg.season_tag || 1}
                            </span>
                          )}
                        </div>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                            esMio
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-100'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={enviarMensajeChat} className="flex gap-2">
                {!esPelicula && (
                  <select
                    value={temporadaSeleccionada}
                    onChange={(e) => setTemporadaSeleccionada(Number(e.target.value))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    {[...Array(totalTemporadas)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        T{i + 1}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={nuevoMensaje}
                  onChange={(e) => setNuevoMensaje(e.target.value)}
                  placeholder={
                    user
                      ? 'Escribe en el chat general...'
                      : 'Inicia sesión para participar en el chat'
                  }
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center rounded-xl bg-indigo-600 px-4 text-white transition hover:bg-indigo-500"
                >
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {/* Reseñas */}
          {tab === 'resenas' && (
            <div className="mt-4 space-y-5">
              <form onSubmit={publicarReview} className="space-y-3 rounded-2xl bg-slate-950/60 p-4">
                <textarea
                  rows={3}
                  value={nuevaReview}
                  onChange={(e) => setNuevaReview(e.target.value)}
                  placeholder={`Escribe tu opinión sobre esta ${esPelicula ? 'película' : 'serie'}...`}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={tieneSpoilers}
                      onChange={(e) => setTieneSpoilers(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                    />
                    Contiene spoilers
                  </label>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publicar reseña
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {reviews.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Aún no hay reseñas. Sé el primero en valorar.
                  </p>
                ) : (
                  reviews.map((rev) => {
                    const oculto = rev.has_spoilers && !revelarSpoilers[rev.id];
                    return (
                      <div
                        key={rev.id}
                        className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-indigo-400">
                            @{rev.profiles?.username || 'usuario'}
                          </span>
                          {rev.has_spoilers && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                              Spoiler
                            </span>
                          )}
                        </div>
                        {oculto ? (
                          <button
                            onClick={() =>
                              setRevelarSpoilers((prev) => ({ ...prev, [rev.id]: true }))
                            }
                            className="w-full rounded-xl bg-slate-900 py-3 text-xs text-slate-400 hover:text-white"
                          >
                            ⚠️ Reseña oculta por spoilers. Haz clic para leer.
                          </button>
                        ) : (
                          <p className="text-sm text-slate-200">{rev.content}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}