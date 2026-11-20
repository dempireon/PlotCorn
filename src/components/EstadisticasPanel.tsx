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
  PauseCircle,
  Table as TableIcon,
  Calendar,
  Repeat,
} from 'lucide-react';

interface ItemBiblioteca {
  id?: string | number;
  tmdb_id: number;
  media_type: 'tv' | 'movie';
  status: 'watching' | 'completed' | 'watchlist' | 'dropped';
  rating?: number | null;
  score?: number | null;
  user_rating?: number | null;
  rewatch_count?: number | null;
  title?: string;
  poster_path?: string | null;
  current_season?: number;
  current_episode?: number;
}

interface RegistroFechaEstadistica {
  id: string;
  tmdb_id: number;
  media_type: 'tv' | 'movie';
  started_date?: string | null;
  finished_date?: string | null;
  watched_date: string;
  created_at?: string;
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

function formatearFechaES(fechaStr?: string | null): string | null {
  if (!fechaStr) return null;
  const partes = fechaStr.slice(0, 10).split('-');
  if (partes.length !== 3) return fechaStr;
  const fechaObj = new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2])
  );
  if (Number.isNaN(fechaObj.getTime())) return fechaStr;
  return fechaObj.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function describirRegistroFecha(reg: RegistroFechaEstadistica): string {
  const ini = formatearFechaES(reg.started_date);
  const fin = formatearFechaES(reg.finished_date);
  const unica = formatearFechaES(reg.watched_date);
  if (ini && fin) return `${ini} → ${fin}`;
  if (fin) return `Vista el ${fin}`;
  if (ini) return `Inicio: ${ini}`;
  return `Vista el ${unica || 'sin fecha'}`;
}

export default function EstadisticasPanel({
  userId,
  itemsBiblioteca,
}: EstadisticasPanelProps) {
  const [episodiosBiblioteca, setEpisodiosBiblioteca] = useState<any[]>([]);
  const [historialFechas, setHistorialFechas] = useState<RegistroFechaEstadistica[]>([]);
  const [filtroEstadoTabla, setFiltroEstadoTabla] = useState<
    'all' | 'watching' | 'watchlist' | 'completed' | 'dropped'
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
    async function cargarHistorialYFechas() {
      if (!userId || idsBibliotecaSet.size === 0) {
        setEpisodiosBiblioteca([]);
        setHistorialFechas([]);
        return;
      }

      const [{ data: epRows }, { data: fechasRows }] = await Promise.all([
        supabase.from('watched_episodes').select('*').eq('user_id', userId),
        supabase
          .from('watch_history_dates')
          .select('id, tmdb_id, media_type, started_date, finished_date, watched_date, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      const filtradosEp = (epRows || []).filter((e: any) => {
        const tmdbIdNum = Number(e.tmdb_id ?? e.series_id ?? e.media_id);
        return !Number.isNaN(tmdbIdNum) && idsBibliotecaSet.has(tmdbIdNum);
      });

      const filtradasFechas = (fechasRows || []).filter((f: any) => {
        const tmdbIdNum = Number(f.tmdb_id);
        return !Number.isNaN(tmdbIdNum) && idsBibliotecaSet.has(tmdbIdNum);
      });

      setEpisodiosBiblioteca(filtradosEp);
      setHistorialFechas(filtradasFechas);
    }

    cargarHistorialYFechas();
  }, [userId, idsBibliotecaSet]);

  const totalEpisodiosVistos = episodiosBiblioteca.length;

  const fechasPorClave = useMemo(() => {
    const mapa: Record<string, RegistroFechaEstadistica[]> = {};
    historialFechas.forEach((reg) => {
      const clave = `${reg.media_type || 'tv'}-${reg.tmdb_id}`;
      if (!mapa[clave]) mapa[clave] = [];
      mapa[clave].push(reg);
    });
    return mapa;
  }, [historialFechas]);

  const totalVecesVistas = useMemo(() => {
    if (historialFechas.length > 0) return historialFechas.length;
    return bibliotecaActiva.reduce(
      (acc, item) => acc + Math.max(0, Number(item.rewatch_count || 0)),
      0
    );
  }, [historialFechas, bibliotecaActiva]);

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
  const abandonadosCount = bibliotecaActiva.filter((i) => i.status === 'dropped').length;

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

  const barrasResumen = useMemo(() => {
    const base = Math.max(1, totalTitulos);
    const maxVal = Math.max(
      1,
      viendoCount,
      pendientesCount,
      completadosCount,
      abandonadosCount,
      totalSeries,
      totalPelis
    );

    return [
      {
        key: 'watching',
        label: 'Viendo',
        count: viendoCount,
        pct: totalTitulos > 0 ? Math.round((viendoCount / base) * 100) : 0,
        barPct: viendoCount > 0 ? Math.max(8, Math.round((viendoCount / maxVal) * 100)) : 0,
        color: '#6366f1',
        badgeCls: 'text-indigo-300',
      },
      {
        key: 'watchlist',
        label: 'Pendientes',
        count: pendientesCount,
        pct: totalTitulos > 0 ? Math.round((pendientesCount / base) * 100) : 0,
        barPct:
          pendientesCount > 0 ? Math.max(8, Math.round((pendientesCount / maxVal) * 100)) : 0,
        color: '#f59e0b',
        badgeCls: 'text-amber-300',
      },
      {
        key: 'completed',
        label: 'Completadas',
        count: completadosCount,
        pct: totalTitulos > 0 ? Math.round((completadosCount / base) * 100) : 0,
        barPct:
          completadosCount > 0
            ? Math.max(8, Math.round((completadosCount / maxVal) * 100))
            : 0,
        color: '#10b981',
        badgeCls: 'text-emerald-300',
      },
      {
        key: 'dropped',
        label: 'Abandonadas',
        count: abandonadosCount,
        pct: totalTitulos > 0 ? Math.round((abandonadosCount / base) * 100) : 0,
        barPct:
          abandonadosCount > 0 ? Math.max(8, Math.round((abandonadosCount / maxVal) * 100)) : 0,
        color: '#f43f5e',
        badgeCls: 'text-rose-300',
      },
      {
        key: 'tv',
        label: 'Series',
        count: totalSeries,
        pct: totalTitulos > 0 ? Math.round((totalSeries / base) * 100) : 0,
        barPct: totalSeries > 0 ? Math.max(8, Math.round((totalSeries / maxVal) * 100)) : 0,
        color: '#818cf8',
        badgeCls: 'text-indigo-200',
      },
      {
        key: 'movie',
        label: 'Películas',
        count: totalPelis,
        pct: totalTitulos > 0 ? Math.round((totalPelis / base) * 100) : 0,
        barPct: totalPelis > 0 ? Math.max(8, Math.round((totalPelis / maxVal) * 100)) : 0,
        color: '#fb7185',
        badgeCls: 'text-rose-200',
      },
    ];
  }, [
    totalTitulos,
    viendoCount,
    pendientesCount,
    completadosCount,
    abandonadosCount,
    totalSeries,
    totalPelis,
  ]);

  const filasTabla = useMemo(() => {
    return bibliotecaActiva.filter((item) =>
      filtroEstadoTabla === 'all' ? true : item.status === filtroEstadoTabla
    );
  }, [bibliotecaActiva, filtroEstadoTabla]);

  const titulosConCacheMap = useMemo(() => {
    const mapa: Record<string, string> = {};
    bibliotecaActiva.forEach((item) => {
      mapa[`${item.media_type}-${item.tmdb_id}`] =
        item.title || `Título #${item.tmdb_id}`;
    });
    return mapa;
  }, [bibliotecaActiva]);

  return (
    <section className="space-y-6 rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/85 via-slate-900/55 to-indigo-950/20 p-4 shadow-xl sm:p-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/35 bg-slate-950 shadow-sm">
            <BarChart3 className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Estadísticas de tu biblioteca</h3>
            <p className="text-xs text-slate-400">
              Gráficos adaptados a móvil, fechas vistas y puntuaciones
            </p>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Títulos guardados</span>
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-white">{totalTitulos}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {totalSeries} series · {totalPelis} pelis
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Veces vistas</span>
            <Repeat className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-300">{totalVecesVistas}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Fechas guardadas: {historialFechas.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Episodios vistos</span>
            <Tv className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-white">{totalEpisodiosVistos}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">En tu biblioteca</p>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Nota media</span>
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-300">
            {mediaPuntuacion}
            {Number(mediaPuntuacion) > 0 && (
              <span className="ml-1 text-xs font-semibold text-slate-400">/ 5</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {notasParaGrafico.length}{' '}
            {notasParaGrafico.length === 1 ? 'valoración' : 'valoraciones'}
          </p>
        </div>
      </div>

      {/* Gráfico con leyenda para móvil + Distribución de notas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              Estados y formatos
            </h4>
            <span className="text-[11px] font-semibold text-slate-400">
              {totalTitulos} {totalTitulos === 1 ? 'título' : 'títulos'}
            </span>
          </div>

          {/* Leyenda compacta y clara en móvil */}
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-[11px]">
            {barrasResumen.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-2 py-1 font-semibold text-slate-200"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                <span>{b.label}</span>
                <strong className={b.badgeCls}>{b.count}</strong>
              </span>
            ))}
          </div>

          {/* Gráfico de barras */}
          <div className="space-y-2.5">
            {barrasResumen.map((b) => (
              <div key={b.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{b.label}</span>
                  <span className="font-bold text-slate-300">
                    {b.count}{' '}
                    <span className="text-[11px] font-normal text-slate-400">
                      ({b.pct}%)
                    </span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    style={{
                      width: `${b.barPct}%`,
                      backgroundColor: b.color,
                    }}
                    className="h-full rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico de barras por estrellas */}
        <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                Puntuaciones (1 a 5)
              </h4>
              <span className="text-[11px] font-semibold text-amber-300">
                {notasParaGrafico.length}{' '}
                {notasParaGrafico.length === 1 ? 'valoración' : 'valoraciones'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {usandoNotasEpisodios
                ? 'Basado en las notas de tus episodios puntuados'
                : 'Reparto de notas en tu biblioteca'}
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
                  <div className="flex w-10 shrink-0 items-center justify-end gap-1 font-bold text-amber-300">
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
              ? 'Aún no hay notas registradas. Puntúa un título o un episodio.'
              : `Has puntuado ${notasParaGrafico.length} ${
                  usandoNotasEpisodios ? 'episodios' : 'títulos'
                }.`}
          </p>
        </div>
      </div>

      {/* Historial de fechas vistas */}
      <div className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
            <Calendar className="h-4 w-4 text-emerald-400" />
            Historial de fechas vistas ({historialFechas.length})
          </h4>
        </div>

        {historialFechas.length === 0 ? (
          <p className="rounded-xl border border-slate-800/80 bg-slate-900/50 py-5 text-center text-xs text-slate-400">
            Aún no has guardado fechas de visionado. Abre cualquier título y guarda su fecha de inicio o fin.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {historialFechas.slice(0, 16).map((reg) => {
              const nombreTitulo =
                titulosConCacheMap[`${reg.media_type || 'tv'}-${reg.tmdb_id}`] ||
                `Título #${reg.tmdb_id}`;
              return (
                <div
                  key={reg.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-1.5 text-xs"
                >
                  <span className="font-bold text-white">{nombreTitulo}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className="text-emerald-300">{describirRegistroFecha(reg)}</span>
                </div>
              );
            })}
          </div>
        )}
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
              { id: 'dropped', label: 'Abandonadas' },
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
                  <th className="px-3.5 py-2.5">Estado</th>
                  <th className="px-3.5 py-2.5">Veces y fechas</th>
                  <th className="px-3.5 py-2.5 text-right">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-slate-950/60">
                {filasTabla.map((item, idx) => {
                  const clave = `${item.media_type}-${item.tmdb_id}`;
                  const { valor: notaItem, origen } = obtenerNotaEfectiva(item);
                  const fechasItem = fechasPorClave[clave] || [];
                  const vecesItem =
                    fechasItem.length > 0
                      ? fechasItem.length
                      : Math.max(0, Number(item.rewatch_count || 0));

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
                      : item.status === 'dropped'
                      ? {
                          label: 'Abandonada',
                          icon: <PauseCircle className="h-3 w-3" />,
                          cls: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
                        }
                      : {
                          label: 'Pendiente',
                          icon: <Clock className="h-3 w-3" />,
                          cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
                        };

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
                          <div className="min-w-0">
                            <p className="truncate font-bold text-white">
                              {item.title || `Título #${item.tmdb_id}`}
                            </p>
                            <p className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                              {item.media_type === 'movie' ? (
                                <Film className="h-2.5 w-2.5 text-rose-400" />
                              ) : (
                                <Tv className="h-2.5 w-2.5 text-indigo-400" />
                              )}
                              {item.media_type === 'movie' ? 'Película' : 'Serie'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${estadoConfig.cls}`}
                        >
                          {estadoConfig.icon}
                          {estadoConfig.label}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-slate-300">
                        <p className="font-bold text-white">
                          {vecesItem} {vecesItem === 1 ? 'vez' : 'veces'}
                        </p>
                        {fechasItem.length > 0 ? (
                          <p className="text-[10px] text-emerald-300">
                            {fechasItem.map((f) => describirRegistroFecha(f)).join(' · ')}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-500">Sin fechas</p>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        {notaItem > 0 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-300">
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