'use client';

import { useState, useEffect } from 'react';
import { getProximosEstrenosUsuario, getPosterUrl, ProximoEstreno, MediaTMDB } from '@/lib/tmdb';
import { Calendar, Sparkles, Clock } from 'lucide-react';

interface ProximosEstrenosBarProps {
  seriesEnSeguimientoIds: number[];
  onSelectSerie: (media: MediaTMDB) => void;
}

export default function ProximosEstrenosBar({
  seriesEnSeguimientoIds,
  onSelectSerie,
}: ProximosEstrenosBarProps) {
  const [estrenos, setEstrenos] = useState<ProximoEstreno[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      const lista = await getProximosEstrenosUsuario(seriesEnSeguimientoIds);
      if (activo) {
        setEstrenos(lista);
        setCargando(false);
      }
    }
    cargar();
    return () => {
      activo = false;
    };
  }, [seriesEnSeguimientoIds.join(',')]);

  function calcularDiffDias(airDateStr: string) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaEstreno = new Date(airDateStr + 'T00:00:00');
    return Math.round((fechaEstreno.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  }

  function calcularEtiquetaFecha(airDateStr: string) {
    const diffDias = calcularDiffDias(airDateStr);
    const fechaEstreno = new Date(airDateStr + 'T00:00:00');

    if (diffDias === 0) return { texto: '¡Hoy!', urgente: true };
    if (diffDias === 1) return { texto: 'Mañana', urgente: true };
    if (diffDias <= 7) return { texto: `En ${diffDias} días`, urgente: false };

    return {
      texto: fechaEstreno.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      urgente: false,
    };
  }

  if (cargando) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-900" />
        ))}
      </div>
    );
  }

  if (estrenos.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-12 text-center">
        <p className="text-slate-400">
          Ninguna de tus series en seguimiento tiene fecha confirmada de próximo episodio por ahora.
        </p>
      </div>
    );
  }

  const estaSemana = estrenos.filter((e) => calcularDiffDias(e.air_date) <= 7);
  const proximamente = estrenos.filter((e) => calcularDiffDias(e.air_date) > 7);

  function renderBloqueEstrenos(
    titulo: string,
    subtitulo: string,
    icono: React.ReactNode,
    acentoBorder: string,
    acentoBadge: string,
    lista: ProximoEstreno[]
  ) {
    if (lista.length === 0) return null;
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
                {lista.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">{subtitulo}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((est) => {
            const badge = calcularEtiquetaFecha(est.air_date);
            return (
              <div
                key={`${est.tmdb_id}-${est.season_number}-${est.episode_number}`}
                onClick={() =>
                  onSelectSerie({
                    id: est.tmdb_id,
                    media_type: 'tv',
                    name: est.serie_name,
                    overview: '',
                    poster_path: est.poster_path,
                    backdrop_path: null,
                    first_air_date: '',
                    vote_average: 0,
                  })
                }
                className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/80 p-3 transition hover:border-indigo-500/50 hover:bg-slate-950"
              >
                <img
                  src={getPosterUrl(est.poster_path, 'w342')}
                  alt={est.serie_name}
                  className="h-16 w-11 shrink-0 rounded-xl object-cover"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-white group-hover:text-indigo-400">
                      {est.serie_name}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        badge.urgente
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {badge.texto}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] font-semibold text-indigo-300">
                    T{est.season_number} E{est.episode_number}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">{est.episode_name}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {renderBloqueEstrenos(
        'Esta semana',
        'Nuevos episodios en los próximos 7 días',
        <Sparkles className="h-4 w-4 text-emerald-400" />,
        'border-emerald-500/30',
        'bg-emerald-500/20 text-emerald-300',
        estaSemana
      )}

      {renderBloqueEstrenos(
        'Próximamente',
        'Estrenos confirmados más adelante',
        <Calendar className="h-4 w-4 text-indigo-400" />,
        'border-indigo-500/30',
        'bg-indigo-500/20 text-indigo-300',
        proximamente
      )}
    </div>
  );
}