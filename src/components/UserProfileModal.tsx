'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import EstadisticasPanel from './EstadisticasPanel';
import {
  X, UserPlus, UserCheck, Star, Tv, Film, Users, Edit3, Save, Folder, Library, BarChart3
} from 'lucide-react';

interface UserProfileModalProps {
  targetUserId: string;
  currentUser: any;
  onClose: () => void;
  onSelectMedia: (media: MediaTMDB) => void;
  onRequireAuth: () => void;
}

export default function UserProfileModal({
  targetUserId,
  currentUser,
  onClose,
  onSelectMedia,
  onRequireAuth,
}: UserProfileModalProps) {
  const [perfil, setPerfil] = useState<any>(null);
  const [biblioteca, setBiblioteca] = useState<any[]>([]);
  const [coleccionesPub, setColeccionesPub] = useState<any[]>([]);
  const [tabPerfil, setTabPerfil] = useState<'biblioteca' | 'colecciones' | 'estadisticas'>('biblioteca');
  const [colSeleccionadaId, setColSeleccionadaId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'watching' | 'completed' | 'watchlist'>('all');
  const [seguidoresCount, setSeguidoresCount] = useState(0);
  const [siguiendoCount, setSiguiendoCount] = useState(0);
  const [leSigo, setLeSigo] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editandoBio, setEditandoBio] = useState(false);
  const [bioTexto, setBioTexto] = useState('');

  const esMiPerfil = currentUser && currentUser.id === targetUserId;

  useEffect(() => {
    cargarPerfilCompleto();
  }, [targetUserId, currentUser]);

  async function cargarPerfilCompleto() {
    setLoading(true);

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (prof) {
      setPerfil(prof);
      setBioTexto(prof.bio || '');
    }

    const { data: userSeries } = await supabase
      .from('user_series')
      .select('*')
      .eq('user_id', targetUserId)
      .order('updated_at', { ascending: false });

    const { data: cols } = await supabase
      .from('user_collections')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: true });

    let colItems: any[] = [];
    if (cols && cols.length > 0) {
      const { data: ci } = await supabase
        .from('collection_items')
        .select('*')
        .in('collection_id', cols.map((c) => c.id));
      colItems = ci || [];
    }

    const ids = Array.from(
      new Set([
        ...(userSeries || []).map((u) => u.tmdb_id),
        ...colItems.map((ci) => ci.tmdb_id),
      ])
    );

    const cMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: cacheData } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', ids);

      (cacheData || []).forEach((c: any) => {
        cMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c;
      });
    }

    const colsListas = (cols || []).map((c: any) => ({
      ...c,
      items: colItems
        .filter((ci) => ci.collection_id === c.id)
        .map((ci) => {
          const tipo = (ci.media_type || 'tv') as MediaType;
          const info = cMap[`${tipo}-${ci.tmdb_id}`];
          return {
            tmdb_id: ci.tmdb_id,
            media_type: tipo,
            title: info?.title || 'Título',
            poster_path: info?.poster_path || null,
            status: 'watchlist',
            rating: 0,
          };
        }),
    }));
    setColeccionesPub(colsListas);
    if (colsListas.length > 0) setColSeleccionadaId(colsListas[0].id);

    if (userSeries && userSeries.length > 0) {
      const combinada = userSeries.map((item: any) => {
        const tipo = (item.media_type || 'tv') as MediaType;
        const infoCache = cMap[`${tipo}-${item.tmdb_id}`];
        return {
          ...item,
          media_type: tipo,
          title: infoCache?.title || 'Título',
          poster_path: infoCache?.poster_path || null,
        };
      });
      setBiblioteca(combinada);
    } else {
      setBiblioteca([]);
    }

    const [{ count: followers }, { count: following }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetUserId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetUserId),
    ]);

    setSeguidoresCount(followers || 0);
    setSiguiendoCount(following || 0);

    if (currentUser && !esMiPerfil) {
      const { data: rel } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId)
        .maybeSingle();
      setLeSigo(!!rel);
    }

    setLoading(false);
  }

  async function toggleSeguir() {
    if (!currentUser) return onRequireAuth();
    if (esMiPerfil) return;

    if (leSigo) {
      setLeSigo(false);
      setSeguidoresCount((c) => Math.max(0, c - 1));
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId);
    } else {
      setLeSigo(true);
      setSeguidoresCount((c) => c + 1);
      await supabase
        .from('follows')
        .insert({ follower_id: currentUser.id, following_id: targetUserId });
    }
  }

  async function guardarBio() {
    if (!esMiPerfil) return;
    await supabase
      .from('profiles')
      .update({ bio: bioTexto.trim() })
      .eq('id', currentUser.id);
    setPerfil((prev: any) => ({ ...prev, bio: bioTexto.trim() }));
    setEditandoBio(false);
  }

  const colActiva = coleccionesPub.find((c) => c.id === colSeleccionadaId) || coleccionesPub[0];

  const listaFiltrada =
    tabPerfil === 'colecciones'
      ? colActiva?.items || []
      : filtroEstado === 'all'
      ? biblioteca
      : biblioteca.filter((item) => item.status === filtroEstado);

  const stats = {
    watching: biblioteca.filter((i) => i.status === 'watching').length,
    completed: biblioteca.filter((i) => i.status === 'completed').length,
    watchlist: biblioteca.filter((i) => i.status === 'watchlist').length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-4 py-12">
              <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-slate-800" />
              <div className="mx-auto h-6 w-48 animate-pulse rounded-lg bg-slate-800" />
            </div>
          ) : !perfil ? (
            <p className="py-12 text-center text-slate-400">No se encontró este perfil.</p>
          ) : (
            <div className="space-y-5">
              {/* Cabecera compacta del perfil */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 sm:flex-row sm:items-center">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-2xl font-bold text-white shadow-lg">
                    {(perfil.username || 'U')[0].toUpperCase()}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-white">@{perfil.username}</h2>
                      {esMiPerfil && (
                        <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                          Tu perfil
                        </span>
                      )}
                    </div>

                    {editandoBio ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          maxLength={140}
                          value={bioTexto}
                          onChange={(e) => setBioTexto(e.target.value)}
                          placeholder="Escribe algo sobre tus gustos..."
                          className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          onClick={guardarBio}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          <Save className="h-3 w-3" />
                          Guardar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-400">
                          {perfil.bio || (esMiPerfil ? 'Añade una biografía corta...' : 'Sin biografía.')}
                        </p>
                        {esMiPerfil && (
                          <button
                            onClick={() => setEditandoBio(true)}
                            className="text-slate-500 hover:text-indigo-400"
                            title="Editar biografía"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-1 text-xs text-slate-300">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-indigo-400" />
                        <strong className="text-white">{seguidoresCount}</strong> seguidores
                      </span>
                      <span>
                        <strong className="text-white">{siguiendoCount}</strong> siguiendo
                      </span>
                    </div>
                  </div>
                </div>

                {!esMiPerfil && (
                  <button
                    onClick={toggleSeguir}
                    className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition ${
                      leSigo
                        ? 'border border-slate-700 bg-slate-800 text-slate-200 hover:border-red-500/50 hover:text-red-400'
                        : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500'
                    }`}
                  >
                    {leSigo ? (
                      <>
                        <UserCheck className="h-4 w-4" />
                        Siguiendo
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Seguir usuario
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* PESTAÑAS PRINCIPALES DEL PERFIL */}
              <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setTabPerfil('biblioteca')}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    tabPerfil === 'biblioteca'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <Library className="h-3.5 w-3.5" />
                  Biblioteca ({biblioteca.length})
                </button>

                <button
                  onClick={() => setTabPerfil('colecciones')}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    tabPerfil === 'colecciones'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <Folder className="h-3.5 w-3.5" />
                  Colecciones ({coleccionesPub.length})
                </button>

                <button
                  onClick={() => setTabPerfil('estadisticas')}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    tabPerfil === 'estadisticas'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Estadísticas
                </button>
              </div>

              {/* CONTENIDO SEGÚN PESTAÑA DEL PERFIL */}
              {tabPerfil === 'estadisticas' ? (
                <EstadisticasPanel userId={targetUserId} itemsBiblioteca={biblioteca} />
              ) : (
                <>
                  {tabPerfil === 'colecciones' && (
                    coleccionesPub.length === 0 ? (
                      <p className="py-10 text-center text-xs text-slate-500">
                        Este usuario no tiene colecciones públicas.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {coleccionesPub.map((col) => {
                          const activa = colActiva?.id === col.id;
                          return (
                            <button
                              key={col.id}
                              onClick={() => setColSeleccionadaId(col.id)}
                              className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
                                activa
                                  ? 'border-indigo-500 bg-indigo-600 text-white'
                                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              {col.name} ({col.items.length})
                            </button>
                          );
                        })}
                      </div>
                    )
                  )}

                  {tabPerfil === 'biblioteca' && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'all', label: `Todo (${biblioteca.length})` },
                        { key: 'watching', label: `Viendo (${stats.watching})` },
                        { key: 'completed', label: `Terminadas (${stats.completed})` },
                        { key: 'watchlist', label: `Pendientes (${stats.watchlist})` },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setFiltroEstado(f.key as any)}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                            filtroEstado === f.key
                              ? 'bg-slate-200 text-slate-950'
                              : 'bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Cuadrícula */}
                  {listaFiltrada.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-500">
                      No hay títulos en esta categoría.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
                      {listaFiltrada.map((item: any) => {
                        const esPeli = item.media_type === 'movie';
                        return (
                          <div
                            key={`${item.media_type}-${item.tmdb_id}`}
                            onClick={() => {
                              onClose();
                              onSelectMedia({
                                id: item.tmdb_id,
                                media_type: item.media_type,
                                name: item.title,
                                overview: '',
                                poster_path: item.poster_path,
                                backdrop_path: null,
                                first_air_date: '',
                                vote_average: item.rating || 0,
                              });
                            }}
                            className="group cursor-pointer space-y-1.5"
                          >
                            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                              <img
                                src={getPosterUrl(item.poster_path, 'w342')}
                                alt={item.title}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                              <div className="absolute left-1.5 top-1.5 rounded-full bg-slate-950/85 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                                {esPeli ? <Film className="inline h-2.5 w-2.5" /> : <Tv className="inline h-2.5 w-2.5" />}
                              </div>
                              {item.rating > 0 && (
                                <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                                  <Star className="h-2.5 w-2.5 fill-amber-400" />
                                  {item.rating}
                                </div>
                              )}
                            </div>
                            <p className="line-clamp-1 text-xs font-semibold text-slate-200 group-hover:text-indigo-400">
                              {item.title}
                            </p>
                            {tabPerfil === 'biblioteca' && (
                              <p className="text-[11px] text-slate-500">
                                {item.status === 'watching' &&
                                  (esPeli ? 'Viendo' : `Viendo · T${item.current_season || 1} E${item.current_episode || 1}`)}
                                {item.status === 'completed' && (esPeli ? 'Vista' : 'Terminada')}
                                {item.status === 'watchlist' && 'Pendiente'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}