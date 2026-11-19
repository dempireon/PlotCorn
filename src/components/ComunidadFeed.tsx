'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import {
  Users, UserPlus, UserCheck, Star, Eye, Check, Clock,
  Sparkles, Tv, Film, Search
} from 'lucide-react';

interface ComunidadFeedProps {
  user: any;
  onSelectSerie: (serie: MediaTMDB) => void;
  onSelectUser: (userId: string) => void;
  onRequireAuth: () => void;
}

export default function ComunidadFeed({
  user,
  onSelectSerie,
  onSelectUser,
  onRequireAuth,
}: ComunidadFeedProps) {
  const [actividad, setActividad] = useState<any[]>([]);
  const [seguidos, setSeguidos] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'seguidos'>('todos');
  const [loading, setLoading] = useState(true);

  // Buscador de amigos
  const [busquedaUser, setBusquedaUser] = useState('');
  const [resultadosUsers, setResultadosUsers] = useState<any[]>([]);
  const [buscandoUsers, setBuscandoUsers] = useState(false);

  useEffect(() => {
    cargarComunidad();
  }, [user]);

  async function cargarComunidad() {
    setLoading(true);

    // 1. Última actividad global
    const { data: feed } = await supabase
      .from('user_series')
      .select('id, user_id, tmdb_id, media_type, status, rating, updated_at, profiles (username)')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (feed && feed.length > 0) {
      const ids = feed.map((f) => f.tmdb_id);
      const { data: cacheData } = await supabase
        .from('series_cache')
        .select('tmdb_id, media_type, title, poster_path')
        .in('tmdb_id', ids);

      const cacheMap: Record<string, any> = {};
      (cacheData || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c;
      });

      const feedEnriquecido = feed.map((item: any) => {
        const tipo = item.media_type || 'tv';
        return {
          ...item,
          series_cache: cacheMap[`${tipo}-${item.tmdb_id}`] || { title: 'Título', poster_path: null },
        };
      });
      setActividad(feedEnriquecido);
    } else {
      setActividad([]);
    }

    // 2. Usuarios seguidos
    if (user) {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (followsData) {
        setSeguidos(followsData.map((f) => f.following_id));
      }
    } else {
      setSeguidos([]);
    }

    setLoading(false);
  }

  async function buscarUsuarios(texto: string) {
    setBusquedaUser(texto);
    const limpio = texto.replace(/^@/, '').trim();
    if (!limpio) {
      setResultadosUsers([]);
      return;
    }

    setBuscandoUsers(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, bio')
      .ilike('username', `%${limpio}%`)
      .limit(8);

    setResultadosUsers(data || []);
    setBuscandoUsers(false);
  }

  async function toggleSeguir(targetUserId: string) {
    if (!user) return onRequireAuth();
    if (targetUserId === user.id) return;

    const yaLeSigo = seguidos.includes(targetUserId);

    if (yaLeSigo) {
      setSeguidos((prev) => prev.filter((id) => id !== targetUserId));
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);
    } else {
      setSeguidos((prev) => [...prev, targetUserId]);
      await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: targetUserId });
    }
  }

  function textoEstado(status: string) {
    switch (status) {
      case 'watching':
        return { label: 'está viendo', color: 'text-indigo-400', icon: Eye };
      case 'completed':
        return { label: 'ha terminado', color: 'text-emerald-400', icon: Check };
      default:
        return { label: 'quiere ver', color: 'text-amber-400', icon: Clock };
    }
  }

  const actividadFiltrada =
    filtro === 'seguidos'
      ? actividad.filter((item) => seguidos.includes(item.user_id))
      : actividad;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Buscador de amigos */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busquedaUser}
            onChange={(e) => buscarUsuarios(e.target.value)}
            placeholder="Buscar amigos por nombre de usuario (ej. @alex)..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {busquedaUser.trim() !== '' && (
          <div className="space-y-2 pt-1">
            {buscandoUsers ? (
              <p className="text-xs text-slate-500">Buscando usuarios...</p>
            ) : resultadosUsers.length === 0 ? (
              <p className="text-xs text-slate-500">No se encontraron usuarios con ese nombre.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {resultadosUsers.map((u) => {
                  const esMio = user && u.id === user.id;
                  const leSigo = seguidos.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3"
                    >
                      <div
                        onClick={() => onSelectUser(u.id)}
                        className="flex cursor-pointer items-center gap-2.5 min-w-0"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/30 text-sm font-bold text-indigo-300">
                          {(u.username || 'U')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white hover:text-indigo-400">
                            @{u.username}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {u.bio || 'Ver biblioteca pública'}
                          </p>
                        </div>
                      </div>

                      {!esMio && (
                        <button
                          onClick={() => toggleSeguir(u.id)}
                          className={`ml-2 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            leSigo
                              ? 'bg-slate-800 text-slate-300 hover:text-red-400'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500'
                          }`}
                        >
                          {leSigo ? 'Siguiendo' : 'Seguir'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cabecera del feed */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Actividad de la Comunidad</h2>
            <p className="text-xs text-slate-400">
              Pulsa en cualquier @usuario para ver su biblioteca completa
            </p>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl bg-slate-950 p-1">
          <button
            onClick={() => setFiltro('todos')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filtro === 'todos' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Global
          </button>
          <button
            onClick={() => (user ? setFiltro('seguidos') : onRequireAuth())}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filtro === 'seguidos' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Siguiendo ({seguidos.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-900" />
          ))}
        </div>
      ) : actividadFiltrada.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">
            {filtro === 'seguidos'
              ? 'Aún no sigues a nadie o tus amigos no han registrado títulos todavía.'
              : 'Todavía no hay actividad registrada en la comunidad.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {actividadFiltrada.map((item) => {
            const info = textoEstado(item.status);
            const Icono = info.icon;
            const esMio = user && item.user_id === user.id;
            const leSigo = seguidos.includes(item.user_id);
            const tipo = (item.media_type || 'tv') as MediaType;
            const esPeli = tipo === 'movie';

            const mediaObj: MediaTMDB = {
              id: item.tmdb_id,
              media_type: tipo,
              name: item.series_cache?.title || 'Título',
              overview: '',
              poster_path: item.series_cache?.poster_path || null,
              backdrop_path: null,
              first_air_date: '',
              vote_average: item.rating || 0,
            };

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 transition hover:border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <img
                    onClick={() => onSelectSerie(mediaObj)}
                    src={getPosterUrl(item.series_cache?.poster_path, 'w342')}
                    alt={item.series_cache?.title}
                    className="h-20 w-14 cursor-pointer rounded-xl object-cover shadow transition hover:scale-105"
                  />

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <button
                        onClick={() => onSelectUser(item.user_id)}
                        className="font-bold text-indigo-400 hover:underline"
                      >
                        @{item.profiles?.username || 'usuario'}
                      </button>
                      <span className={`flex items-center gap-1 font-medium ${info.color}`}>
                        <Icono className="h-3.5 w-3.5" />
                        {info.label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          esPeli
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {esPeli ? <Film className="h-2.5 w-2.5" /> : <Tv className="h-2.5 w-2.5" />}
                        {esPeli ? 'Peli' : 'Serie'}
                      </span>
                    </div>

                    <h3
                      onClick={() => onSelectSerie(mediaObj)}
                      className="cursor-pointer text-base font-bold text-white hover:text-indigo-400"
                    >
                      {item.series_cache?.title || 'Título'}
                    </h3>

                    {item.rating > 0 && (
                      <div className="flex items-center gap-1 pt-0.5">
                        {[...Array(5)].map((_, idx) => (
                          <Star
                            key={idx}
                            className={`h-3.5 w-3.5 ${
                              idx < item.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!esMio && (
                  <button
                    onClick={() => toggleSeguir(item.user_id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      leSigo
                        ? 'border border-slate-700 bg-slate-800 text-slate-200 hover:border-red-500/50 hover:text-red-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500'
                    }`}
                  >
                    {leSigo ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5" />
                        Siguiendo
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Seguir
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}