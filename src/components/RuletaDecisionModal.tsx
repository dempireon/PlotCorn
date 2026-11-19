'use client';

import { useState } from 'react';
import { getPosterUrl, MediaTMDB, MediaType, discoverMediaAvanzado } from '@/lib/tmdb';
import { Dices, X, Eye, Sparkles, Tv, Film, RotateCw, Globe } from 'lucide-react';

interface RuletaDecisionModalProps {
  itemsBiblioteca: any[];
  onClose: () => void;
  onSelectMedia: (media: MediaTMDB) => void;
  onMarcarViendo: (media: MediaTMDB) => void;
}

export default function RuletaDecisionModal({
  itemsBiblioteca,
  onClose,
  onSelectMedia,
  onMarcarViendo,
}: RuletaDecisionModalProps) {
  const [filtroOrigen, setFiltroOrigen] = useState<'catalogo' | 'watchlist' | 'all'>('catalogo');
  const [filtroFormato, setFiltroFormato] = useState<'all' | 'tv' | 'movie'>('all');
  const [girando, setGirando] = useState(false);
  const [candidatoActual, setCandidatoActual] = useState<any | null>(null);
  const [ganadorFinal, setGanadorFinal] = useState<any | null>(null);
  const [poolCatalogo, setPoolCatalogo] = useState<any[]>([]);

  const candidatosLocales = itemsBiblioteca.filter((item) => {
    if (filtroOrigen === 'watchlist' && item.status !== 'watchlist') return false;
    if (filtroFormato !== 'all' && item.media_type !== filtroFormato) return false;
    return true;
  });

  async function girarRuleta() {
    if (girando) return;
    setGirando(true);
    setGanadorFinal(null);

    let listaSorteo = candidatosLocales;

    if (filtroOrigen === 'catalogo') {
      try {
        const res = await discoverMediaAvanzado({
          categoria: filtroFormato === 'all' ? 'all' : filtroFormato,
          plataformaId: '',
          generoId: '',
        });
        listaSorteo = res.map((m) => ({
          tmdb_id: m.id,
          media_type: m.media_type,
          title: m.name,
          poster_path: m.poster_path,
          rating: m.vote_average,
        }));
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
        className="w-full max-w-md overflow-hidden rounded-3xl border border-indigo-500/40 bg-slate-950 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
              <Dices className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">¿Qué veo hoy?</h3>
              <p className="text-xs text-slate-400">Deja que el azar elija por ti</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 p-2 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filtros de origen (Todo primero) y formato */}
        <div className="mb-5 space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => {
                setFiltroOrigen('catalogo');
                setGanadorFinal(null);
              }}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${
                filtroOrigen === 'catalogo'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="h-3 w-3" /> Todo
            </button>
            <button
              onClick={() => {
                setFiltroOrigen('watchlist');
                setGanadorFinal(null);
              }}
              className={`rounded-lg py-1.5 text-[11px] font-semibold transition ${
                filtroOrigen === 'watchlist'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => {
                setFiltroOrigen('all');
                setGanadorFinal(null);
              }}
              className={`rounded-lg py-1.5 text-[11px] font-semibold transition ${
                filtroOrigen === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Mi biblioteca
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => setFiltroFormato('all')}
              className={`rounded-lg py-1 text-xs font-semibold transition ${
                filtroFormato === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Todo
            </button>
            <button
              onClick={() => setFiltroFormato('tv')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1 text-xs font-semibold transition ${
                filtroFormato === 'tv' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <Tv className="h-3 w-3" /> Series
            </button>
            <button
              onClick={() => setFiltroFormato('movie')}
              className={`flex items-center justify-center gap-1 rounded-lg py-1 text-xs font-semibold transition ${
                filtroFormato === 'movie' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              <Film className="h-3 w-3" /> Pelis
            </button>
          </div>
        </div>

        {/* Zona central de sorteo */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
          {!puedeGirar ? (
            <p className="py-8 text-xs text-slate-400">
              No tienes títulos en esta sección. Prueba seleccionando <strong className="text-emerald-400">Todo</strong> para sortear del catálogo global.
            </p>
          ) : !candidatoActual ? (
            <div className="space-y-3 py-6">
              <Sparkles className="mx-auto h-10 w-10 text-indigo-400" />
              <p className="text-xs text-slate-300">
                {filtroOrigen === 'catalogo' ? (
                  <>Sorteo abierto entre las mejores series y películas del catálogo.</>
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
                className={`mx-auto h-52 w-36 overflow-hidden rounded-2xl border-2 shadow-xl transition-all ${
                  ganadorFinal
                    ? 'scale-105 border-emerald-400 shadow-emerald-500/20'
                    : 'border-slate-700 opacity-85'
                }`}
              >
                <img
                  src={getPosterUrl(candidatoActual.poster_path)}
                  alt={candidatoActual.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div>
                {ganadorFinal && (
                  <span className="inline-block rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    ¡Te toca ver esto!
                  </span>
                )}
                <h4 className="mt-1 text-base font-bold text-white">{candidatoActual.title}</h4>
              </div>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="mt-5 space-y-2.5">
          <button
            onClick={girarRuleta}
            disabled={!puedeGirar || girando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} />
            {girando ? 'Sorteando...' : ganadorFinal ? 'Volver a tirar' : '¡Girar ruleta!'}
          </button>

          {ganadorFinal && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const m = convertirAMedia(ganadorFinal);
                  onClose();
                  onSelectMedia(m);
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-slate-200 hover:border-indigo-500 hover:text-white"
              >
                Ver ficha técnica
              </button>

              <button
                onClick={() => {
                  const m = convertirAMedia(ganadorFinal);
                  onMarcarViendo(m);
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500"
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