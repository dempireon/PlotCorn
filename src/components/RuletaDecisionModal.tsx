'use client';

import { useState } from 'react';
import { getPosterUrl, MediaTMDB, MediaType, discoverMediaAvanzado } from '@/lib/tmdb';
import { Dices, X, Eye, Sparkles, Tv, Film, RotateCw, Globe, Star, Clapperboard, Flame } from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface RuletaDecisionModalProps {
  itemsBiblioteca: any[];
  onClose: () => void;
  onSelectMedia: (media: MediaTMDB) => void;
  onMarcarViendo: (media: MediaTMDB) => void;
}

type FiltroFormatoRuleta = 'all' | 'tv' | 'movie' | 'documentary' | 'reality';

export default function RuletaDecisionModal({
  itemsBiblioteca,
  onClose,
  onSelectMedia,
  onMarcarViendo,
}: RuletaDecisionModalProps) {
  const [filtroOrigen, setFiltroOrigen] = useState<'catalogo' | 'watchlist' | 'all'>('catalogo');
  const [filtroFormato, setFiltroFormato] = useState<FiltroFormatoRuleta>('all');
  const [girando, setGirando] = useState(false);
  const [candidatoActual, setCandidatoActual] = useState<any | null>(null);
  const [ganadorFinal, setGanadorFinal] = useState<any | null>(null);
  const [poolCatalogo, setPoolCatalogo] = useState<any[]>([]);

  function coincideConFormato(item: any, formato: FiltroFormatoRuleta): boolean {
    if (formato === 'all') return true;
    const tipo = item.media_type || 'tv';
    const cat = (item.category || item.categoria || '').toString().toLowerCase();
    const generos: number[] = Array.isArray(item.genre_ids)
      ? item.genre_ids.map((g: any) => Number(g))
      : [];

    if (formato === 'movie') return tipo === 'movie';
    if (formato === 'tv') {
      return tipo === 'tv' && cat !== 'documentary' && cat !== 'reality';
    }
    if (formato === 'documentary') {
      return cat === 'documentary' || generos.includes(99);
    }
    if (formato === 'reality') {
      return cat === 'reality' || generos.includes(10764) || generos.includes(10767);
    }
    return true;
  }

  const candidatosLocales = itemsBiblioteca.filter((item) => {
    if (filtroOrigen === 'watchlist' && item.status !== 'watchlist') return false;
    return coincideConFormato(item, filtroFormato);
  });

  async function obtenerCandidatosCatalogo(formato: FiltroFormatoRuleta) {
    if (formato === 'documentary' || formato === 'reality') {
      try {
        const res = await discoverMediaAvanzado({
          categoria: formato as any,
          plataformaId: '',
          generoId: '',
        });
        if (Array.isArray(res) && res.length > 0) {
          return res.map((m) => ({
            tmdb_id: m.id,
            media_type: m.media_type,
            title: m.name,
            poster_path: m.poster_path,
            rating: m.vote_average,
          }));
        }
      } catch {
        // Fallback directo a TMDB discover por género si el helper no contempla la categoría
      }

      if (TMDB_API_KEY) {
        const genreId = formato === 'documentary' ? '99' : '10764';
        const url =
          formato === 'documentary'
            ? `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`
            : `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&with_genres=${genreId}&sort_by=popularity.desc`;
        const resp = await fetch(url);
        const data = await resp.json();
        return (data.results || []).map((r: any) => ({
          tmdb_id: r.id,
          media_type: 'tv' as MediaType,
          title: r.name || r.title || 'Título',
          poster_path: r.poster_path || null,
          rating: r.vote_average || 0,
        }));
      }
      return [];
    }

    const res = await discoverMediaAvanzado({
      categoria: formato,
      plataformaId: '',
      generoId: '',
    });

    return (res || []).map((m) => ({
      tmdb_id: m.id,
      media_type: m.media_type,
      title: m.name,
      poster_path: m.poster_path,
      rating: m.vote_average,
    }));
  }

  async function girarRuleta() {
    if (girando) return;
    setGirando(true);
    setGanadorFinal(null);

    let listaSorteo = candidatosLocales;

    if (filtroOrigen === 'catalogo') {
      try {
        listaSorteo = await obtenerCandidatosCatalogo(filtroFormato);
        setPoolCatalogo(listaSorteo);
      } catch (e) {
        console.error(e);
        listaSorteo = poolCatalogo;
      }
    }

    if (listaSorteo.length === 0) {
      setGirando(false);
      return;
    }

    let pasos = 0;
    const totalPasos = 18;
    const intervalo = setInterval(() => {
      const idx = Math.floor(Math.random() * listaSorteo.length);
      setCandidatoActual(listaSorteo[idx]);
      pasos++;

      if (pasos >= totalPasos) {
        clearInterval(intervalo);
        const elegido = listaSorteo[Math.floor(Math.random() * listaSorteo.length)];
        setCandidatoActual(elegido);
        setGanadorFinal(elegido);
        setGirando(false);
      }
    }, 85);
  }

  const convertirAMedia = (item: any): MediaTMDB => ({
    id: item.tmdb_id,
    media_type: (item.media_type || 'tv') as MediaType,
    name: item.title || 'Título elegido',
    overview: '',
    poster_path: item.poster_path || null,
    backdrop_path: null,
    first_air_date: '',
    vote_average: item.rating || 0,
  });

  const puedeGirar =
    filtroOrigen === 'catalogo' ? true : candidatosLocales.length > 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-indigo-500/40 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-800/90 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-400/40 bg-indigo-600/20 text-indigo-300 shadow-sm">
              <Dices className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">¿Qué veo hoy?</h3>
              <p className="text-xs text-slate-400">Deja que el azar elija por ti</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filtros de origen y formato (incluyendo documentales y realities) */}
        <div className="mb-5 space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/90 p-1.5">
            <button
              type="button"
              onClick={() => {
                setFiltroOrigen('catalogo');
                setGanadorFinal(null);
              }}
              className={`flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-bold transition active:scale-[0.98] ${
                filtroOrigen === 'catalogo'
                  ? 'border border-emerald-400/50 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Globe className="h-3.5 w-3.5" /> Todo
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroOrigen('watchlist');
                setGanadorFinal(null);
              }}
              className={`rounded-xl py-2 text-xs font-bold transition active:scale-[0.98] ${
                filtroOrigen === 'watchlist'
                  ? 'border border-amber-400/50 bg-amber-600 text-white shadow-md shadow-amber-600/25'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              Pendientes
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroOrigen('all');
                setGanadorFinal(null);
              }}
              className={`rounded-xl py-2 text-xs font-bold transition active:scale-[0.98] ${
                filtroOrigen === 'all'
                  ? 'border border-indigo-400/50 bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              Mi biblioteca
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/90 p-1.5">
            <button
              type="button"
              onClick={() => {
                setFiltroFormato('all');
                setGanadorFinal(null);
              }}
              className={`flex-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                filtroFormato === 'all'
                  ? 'border border-slate-600 bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroFormato('tv');
                setGanadorFinal(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                filtroFormato === 'tv'
                  ? 'border border-indigo-400/50 bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Tv className="h-3.5 w-3.5" /> Series
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroFormato('movie');
                setGanadorFinal(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                filtroFormato === 'movie'
                  ? 'border border-rose-400/50 bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Film className="h-3.5 w-3.5" /> Pelis
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroFormato('documentary');
                setGanadorFinal(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                filtroFormato === 'documentary'
                  ? 'border border-amber-400/50 bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Clapperboard className="h-3.5 w-3.5" /> Docs
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroFormato('reality');
                setGanadorFinal(null);
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                filtroFormato === 'reality'
                  ? 'border border-fuchsia-400/50 bg-fuchsia-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Flame className="h-3.5 w-3.5" /> Realities
            </button>
          </div>
        </div>

        {/* Zona central de sorteo */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800/90 bg-slate-900/60 p-6 text-center shadow-inner">
          {!puedeGirar ? (
            <p className="py-8 text-xs text-slate-400">
              No tienes títulos en esta sección. Prueba seleccionando{' '}
              <strong className="text-emerald-400">Todo</strong> para sortear del catálogo global.
            </p>
          ) : !candidatoActual ? (
            <div className="space-y-3 py-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/15 text-indigo-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-xs text-slate-300">
                {filtroOrigen === 'catalogo' ? (
                  <>
                    Sorteo abierto entre series, películas, documentales y realities del catálogo.
                  </>
                ) : (
                  <>
                    Tienes <strong className="text-white">{candidatosLocales.length}</strong> opciones listas para sortear.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className={`relative mx-auto h-52 w-36 overflow-hidden rounded-2xl border-2 shadow-xl transition-all ${
                  ganadorFinal
                    ? 'scale-105 border-emerald-400 shadow-emerald-500/25'
                    : 'border-slate-700 opacity-85'
                }`}
              >
                <img
                  src={getPosterUrl(candidatoActual.poster_path)}
                  alt={candidatoActual.title}
                  className="h-full w-full object-cover"
                />
                {Number(candidatoActual.rating) > 0 && (
                  <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-slate-950/90 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    <Star className="h-2.5 w-2.5 fill-amber-400" />
                    {Number(candidatoActual.rating).toFixed(1)}
                  </span>
                )}
              </div>

              <div>
                {ganadorFinal && (
                  <span className="inline-block rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    ¡Te toca ver esto!
                  </span>
                )}
                <h4 className="mt-1.5 text-base font-bold text-white">{candidatoActual.title}</h4>
              </div>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={girarRuleta}
            disabled={!puedeGirar || girando}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/50 bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/35 transition hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} />
            {girando ? 'Sorteando...' : ganadorFinal ? 'Volver a tirar' : '¡Girar ruleta!'}
          </button>

          {ganadorFinal && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const m = convertirAMedia(ganadorFinal);
                  onClose();
                  onSelectMedia(m);
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-slate-200 transition hover:border-indigo-400 hover:bg-slate-800 hover:text-white active:scale-[0.98]"
              >
                Ver ficha técnica
              </button>

              <button
                type="button"
                onClick={() => {
                  const m = convertirAMedia(ganadorFinal);
                  onMarcarViendo(m);
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-500 active:scale-[0.98]"
              >
                <Eye className="h-3.5 w-3.5" />
                Empezar ahora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}