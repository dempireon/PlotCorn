'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl } from '@/lib/tmdb';
import {
  BarChart3,
  Tv,
  Film,
  Star,
  CheckCircle2,
  Eye,
  Clock,
  Table as TableIcon,
  PieChart,
} from 'lucide-react';

interface ItemBiblioteca {
  id?: string | number;
  tmdb_id: number;
  media_type: 'tv' | 'movie';
  status: 'watching' | 'completed' | 'watchlist';
  rating?: number | null;
  score?: number | null;
  user_rating?: number | null;
  title?: string;
  poster_path?: string | null;
  current_season?: number;
  current_episode?: number;
}

interface EstadisticasPanelProps {
  userId: string;
  itemsBiblioteca: ItemBiblioteca[];
}

function extraerNotaRegistro(obj: any): number {
  if (!obj) return 0;
  const candidatos = [
    obj.rating,
    obj.score,
    obj.user_rating,
    obj.stars,
    obj.valoracion,
    obj.note,
  ];
  for (const val of candidatos) {
    const num = Number(val);
    if (!Number.isNaN(num) && num > 0 && num <= 5) {
      return num;
    }
  }
  return 0;
}

export default function EstadisticasPanel({
  userId,
  itemsBiblioteca,
}: EstadisticasPanelProps) {
  const [episodiosBiblioteca, setEpisodiosBiblioteca] = useState<any[]>([]);
  const [filtroEstadoTabla, setFiltroEstadoTabla] = useState<
    'all' | 'watching' | 'watchlist' | 'completed'
  >('all');

  const bibliotecaActiva = useMemo(
    () => (Array.isArray(itemsBiblioteca) ? itemsBiblioteca : []),
    [itemsBiblioteca]
  );

  const idsBibliotecaSet = useMemo(() => {
    return new Set(
      bibliotecaActiva
        .map((item) => Number(item.tmdb_id))
        .filter((id) => !Number.isNaN(id) && id > 0)
    );
  }, [bibliotecaActiva]);

  useEffect(() => {
    async function cargarHistorialEpisodios() {
      if (!userId || idsBibliotecaSet.size === 0) {
        setEpisodiosBiblioteca([]);
        return;
      }

      const { data: epRows } = await supabase
        .from('watched_episodes')
        .select('*')
        .eq('user_id', userId);

      const filtrados = (epRows || []).filter((e: any) => {
        const tmdbIdNum = Number(e.tmdb_id ?? e.series_id ?? e.media_id);
        return !Number.isNaN(tmdbIdNum) && idsBibliotecaSet.has(tmdbIdNum);
      });

      setEpisodiosBiblioteca(filtrados);
    }

    cargarHistorialEpisodios();
  }, [userId, idsBibliotecaSet]);

  const totalEpisodiosVistos = episodiosBiblioteca.length;

  const notasPorSerie = useMemo(() => {
    const agrupadas: Record<number, number[]> = {};
    episodiosBiblioteca.forEach((e: any) => {
      const notaNum = extraerNotaRegistro(e);
      const tmdbIdNum = Number(e.tmdb_id ?? e.series_id ?? e.media_id);
      if (notaNum > 0 && tmdbIdNum && idsBibliotecaSet.has(tmdbIdNum)) {
        if (!agrupadas[tmdbIdNum]) agrupadas[tmdbIdNum] = [];
        agrupadas[tmdbIdNum].push(notaNum);
      }
    });
    return agrupadas;
  }, [episodiosBiblioteca, idsBibliotecaSet]);

  function obtenerNotaEfectiva(item: ItemBiblioteca): {
    valor: number;
    origen: 'titulo' | 'episodios' | null;
  } {
    const notaDirecta = extraerNotaRegistro(item);
    if (notaDirecta > 0) {
      return { valor: notaDirecta, origen: 'titulo' };
    }

    const idNum = Number(item.tmdb_id);
    const notasEp = notasPorSerie[idNum];
    if (notasEp && notasEp.length > 0) {
      const promedio = notasEp.reduce((acc, n) => acc + n, 0) / notasEp.length;
      return {
        valor: Number(promedio.toFixed(1)),
        origen: 'episodios',
      };
    }

    return { valor: 0, origen: null };
  }

  const totalTitulos = bibliotecaActiva.length;
  const totalSeries = bibliotecaActiva.filter((i) => i.media_type === 'tv').length;
  const totalPelis = bibliotecaActiva.filter((i) => i.media_type === 'movie').length;

  const viendoCount = bibliotecaActiva.filter((i) => i.status === 'watching').length;
  const completadosCount = bibliotecaActiva.filter((i) => i.status === 'completed').length;
  const pendientesCount = bibliotecaActiva.filter((i) => i.status === 'watchlist').length;

  const notasDeEpisodiosPuntuados = useMemo(() => {
    if (totalTitulos === 0) return [];
    return episodiosBiblioteca
      .map((e: any) => extraerNotaRegistro(e))
      .filter((n) => n > 0);
  }, [episodiosBiblioteca, totalTitulos]);

  const notasDeTitulos = useMemo(() => {
    if (totalTitulos === 0) return [];
    return bibliotecaActiva
      .map((item) => obtenerNotaEfectiva(item).valor)
      .filter((n) => n > 0);
  }, [bibliotecaActiva, totalTitulos, notasPorSerie]);

  const usandoNotasEpisodios = notasDeEpisodiosPuntuados.length > 0;

  const notasParaGrafico = usandoNotasEpisodios
    ? notasDeEpisodiosPuntuados
    : notasDeTitulos;

  const mediaPuntuacion =
    notasParaGrafico.length > 0
      ? (
          notasParaGrafico.reduce((acc, n) => acc + n, 0) / notasParaGrafico.length
        ).toFixed(1)
      : '0';

  const pctSeries = totalTitulos > 0 ? Math.round((totalSeries / totalTitulos) * 100) : 0;
  const pctPelis = totalTitulos > 0 ? 100 - pctSeries : 0;

  const distribucionNotas = useMemo(() => {
    return [5, 4, 3, 2, 1].map((estrella) => {
      const cantidad = notasParaGrafico.filter(
        (nota) => Math.round(nota) === estrella
      ).length;
      const pct =
        notasParaGrafico.length > 0
          ? Math.round((cantidad / notasParaGrafico.length) * 100)
          : 0;
      return { estrella, cantidad, pct };
    });
  }, [notasParaGrafico]);

  const maxNotaCantidad = Math.max(1, ...distribucionNotas.map((d) => d.cantidad));

  const estadosDonut = useMemo(() => {
    const base = totalTitulos > 0 ? totalTitulos : 1;
    return [
      {
        key: 'watching',
        label: 'Viendo ahora',
        count: viendoCount,
        pct: totalTitulos > 0 ? Math.round((viendoCount / base) * 100) : 0,
        color: '#6366f1',
      },
      {
        key: 'watchlist',
        label: 'Pendientes',
        count: pendientesCount,
        pct: totalTitulos > 0 ? Math.round((pendientesCount / base) * 100) : 0,
        color: '#f59e0b',
      },
      {
        key: 'completed',
        label: 'Terminadas / Vistas',
        count: completadosCount,
        pct: totalTitulos > 0 ? Math.round((completadosCount / base) * 100) : 0,
        color: '#10b981',
      },
    ];
  }, [viendoCount, pendientesCount, completadosCount, totalTitulos]);

  const radio = 42;
  const circunferencia = 2 * Math.PI * radio;
  let acumuladoOffset = 0;

  const filasTabla = useMemo(() => {
    return bibliotecaActiva.filter((item) =>
      filtroEstadoTabla === 'all' ? true : item.status === filtroEstadoTabla
    );
  }, [bibliotecaActiva, filtroEstadoTabla]);

  return (
    <section className="space-y-6 rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/85 via-slate-900/55 to-indigo-950/20 p-5 shadow-xl sm:p-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/35 bg-slate-950 shadow-sm">
            <BarChart3 className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Estadísticas de tu biblioteca</h3>
            <p className="text-xs text-slate-400">
              Análisis visual de tu actividad, puntuaciones y detalle título a título
            </p>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 transition hover:border-indigo-500/40">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Títulos guardados</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 flex h-8 items-center text-2xl font-extrabold text-white">
            {totalTitulos}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {totalSeries} {totalSeries === 1 ? 'serie' : 'series'} · {totalPelis}{' '}
            {totalPelis === 1 ? 'peli' : 'pelis'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 transition hover:border-emerald-500/40">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Episodios vistos</span>
            <Tv className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 flex h-8 items-center text-2xl font-extrabold text-white">
            {totalEpisodiosVistos}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            De los títulos en tu biblioteca
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 transition hover:border-amber-500/40">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Nota media</span>
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
          <p className="mt-2 flex h-8 items-center text-2xl font-extrabold text-amber-300">
            {mediaPuntuacion}
            {Number(mediaPuntuacion) > 0 && (
              <span className="ml-1 text-xs font-semibold text-slate-400">/ 5</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {usandoNotasEpisodios
              ? `En ${notasParaGrafico.length} ${
                  notasParaGrafico.length === 1 ? 'episodio puntuado' : 'episodios puntuados'
                }`
              : `En ${notasParaGrafico.length} ${
                  notasParaGrafico.length === 1 ? 'título puntuado' : 'títulos puntuados'
                }`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 transition hover:border-indigo-500/40">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">En progreso</span>
            <Eye className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 flex h-8 items-center text-2xl font-extrabold text-indigo-300">
            {viendoCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {completadosCount} vistas · {pendientesCount} pendientes
          </p>
        </div>
      </div>

      {/* Gráficos: Donut de estados + Barras de puntuaciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Donut de distribución por estado */}
        <div className="space-y-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
              <PieChart className="h-4 w-4 text-indigo-400" />
              Distribución por estado
            </h4>
            <span className="text-[11px] font-semibold text-slate-400">
              Total: {totalTitulos}
            </span>
          </div>

          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 110 110">
                <circle
                  cx="55"
                  cy="55"
                  r={radio}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="12"
                />
                {totalTitulos > 0 &&
                  estadosDonut.map((seg) => {
                    const fraccion = seg.count / totalTitulos;
                    const longitud = fraccion * circunferencia;
                    const dashArray = `${longitud} ${circunferencia}`;
                    const dashOffset = -acumuladoOffset;
                    acumuladoOffset += longitud;

                    if (seg.count === 0) return null;
                    return (
                      <circle
                        key={seg.key}
                        cx="55"
                        cy="55"
                        r={radio}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="12"
                        strokeDasharray={dashArray}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                      />
                    );
                  })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-extrabold text-white">{totalTitulos}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Títulos
                </span>
              </div>
            </div>

            <div className="w-full flex-1 space-y-2.5">
              {estadosDonut.map((seg) => (
                <div
                  key={seg.key}
                  className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-semibold text-slate-200">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{seg.pct}%</span>
                    <span className="rounded-md bg-slate-950 px-2 py-0.5 font-extrabold text-white">
                      {seg.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800/80 pt-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-rose-400" />
                Series vs Películas
              </span>
              <span className="text-slate-400">
                {pctSeries}% / {pctPelis}%
              </span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-900">
              <div
                style={{ width: `${pctSeries}%` }}
                className="bg-indigo-500 transition-all duration-300"
              />
              <div
                style={{ width: `${pctPelis}%` }}
                className="bg-rose-500 transition-all duration-300"
              />
            </div>
          </div>
        </div>

        {/* Gráfico de barras por estrellas */}
        <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                Puntuaciones (1 a 5 estrellas)
              </h4>
              <span className="text-[11px] font-semibold text-amber-300">
                {notasParaGrafico.length}{' '}
                {notasParaGrafico.length === 1 ? 'valoración' : 'valoraciones'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {usandoNotasEpisodios
                ? 'Reparto según las notas de tus episodios puntuados'
                : 'Cómo repartes tus notas en la biblioteca'}
            </p>
          </div>

          <div className="space-y-2.5">
            {distribucionNotas.map((fila) => {
              const anchoBarra =
                fila.cantidad > 0
                  ? Math.max(8, Math.round((fila.cantidad / maxNotaCantidad) * 100))
                  : 0;

              return (
                <div key={fila.estrella} className="flex items-center gap-3 text-xs">
                  <div className="flex w-11 shrink-0 items-center justify-end gap-1 font-bold text-amber-300">
                    <span>{fila.estrella}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </div>

                  <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-900">
                    <div
                      style={{ width: `${anchoBarra}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-300"
                    />
                  </div>

                  <div className="w-16 shrink-0 text-right font-bold text-slate-200">
                    {fila.cantidad}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      ({fila.pct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400">
            {notasParaGrafico.length === 0
              ? 'Aún no hay notas registradas. Puntúa un título o un episodio para ver tu distribución.'
              : usandoNotasEpisodios
              ? `Mostrando ${notasParaGrafico.length} ${
                  notasParaGrafico.length === 1 ? 'episodio puntuado' : 'episodios puntuados'
                } en tu biblioteca.`
              : `Has puntuado el ${Math.round(
                  (notasParaGrafico.length / Math.max(1, totalTitulos)) * 100
                )}% de tu biblioteca.`}
          </p>
        </div>
      </div>

      {/* Tabla detallada de títulos */}
      <div className="space-y-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
            <TableIcon className="h-4 w-4 text-indigo-400" />
            Detalle de títulos ({filasTabla.length})
          </h4>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'watching', label: 'Viendo' },
              { id: 'watchlist', label: 'Pendientes' },
              { id: 'completed', label: 'Vistas' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroEstadoTabla(tab.id as any)}
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
                  filtroEstadoTabla === tab.id
                    ? 'border-indigo-400/50 bg-indigo-600 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filasTabla.length === 0 ? (
          <p className="rounded-xl border border-slate-800/80 bg-slate-900/50 py-8 text-center text-xs text-slate-400">
            No hay títulos en este estado para mostrar en la tabla.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/90">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5">Título</th>
                  <th className="px-3.5 py-2.5">Formato</th>
                  <th className="px-3.5 py-2.5">Estado</th>
                  <th className="px-3.5 py-2.5">Progreso</th>
                  <th className="px-3.5 py-2.5 text-right">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                {filasTabla.map((item, idx) => {
                  const esPeli = item.media_type === 'movie';
                  const { valor: notaItem, origen } = obtenerNotaEfectiva(item);
                  const estadoConfig =
                    item.status === 'completed'
                      ? {
                          label: 'Vista',
                          icon: <CheckCircle2 className="h-3 w-3" />,
                          cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
                        }
                      : item.status === 'watching'
                      ? {
                          label: 'Viendo',
                          icon: <Eye className="h-3 w-3" />,
                          cls: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300',
                        }
                      : {
                          label: 'Pendiente',
                          icon: <Clock className="h-3 w-3" />,
                          cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
                        };

                  const progresoTexto = esPeli
                    ? item.status === 'completed'
                      ? 'Completada'
                      : 'Película'
                    : item.current_season || item.current_episode
                    ? `T${item.current_season || 1} · E${item.current_episode || 1}`
                    : '—';

                  return (
                    <tr
                      key={`${item.media_type}-${item.tmdb_id}-${idx}`}
                      className="transition hover:bg-slate-900/70"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={getPosterUrl(item.poster_path || null, 'w342')}
                            alt={item.title || `ID ${item.tmdb_id}`}
                            className="h-10 w-7 shrink-0 rounded border border-slate-800 object-cover"
                          />
                          <span className="font-bold text-white">
                            {item.title || `Título #${item.tmdb_id}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            esPeli
                              ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                              : 'border-slate-700 bg-slate-900 text-slate-300'
                          }`}
                        >
                          {esPeli ? <Film className="h-2.5 w-2.5" /> : <Tv className="h-2.5 w-2.5" />}
                          {esPeli ? 'Película' : 'Serie'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${estadoConfig.cls}`}
                        >
                          {estadoConfig.icon}
                          {estadoConfig.label}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-medium text-slate-300">
                        {progresoTexto}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        {notaItem > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 font-bold text-amber-300"
                            title={
                              origen === 'episodios'
                                ? 'Media calculada a partir de tus episodios puntuados'
                                : 'Puntuación general del título'
                            }
                          >
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {notaItem}/5
                            {origen === 'episodios' && (
                              <span className="text-[10px] font-semibold text-indigo-300">
                                (ep)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}