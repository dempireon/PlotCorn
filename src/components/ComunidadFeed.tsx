'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl } from '@/lib/tmdb';
import {
  Users, UserPlus, Check, X, MessageSquare,
  Search, Star, Flame
} from 'lucide-react';

interface ComunidadFeedProps {
  user: any;
  onSelectSerie: (serie: any) => void;
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
  const [mostrarTodoFeed, setMostrarTodoFeed] = useState(false);
  const [tabComunidad, setTabComunidad] = useState<'actividad' | 'amigos'>('actividad');
  const [filtroAmigoId, setFiltroAmigoId] = useState<string>('all');

  const [usuariosBusqueda, setUsuariosBusqueda] = useState<any[]>([]);
  const [busquedaUser, setBusquedaUser] = useState('');

  const [solicitudesEntrantes, setSolicitudesEntrantes] = useState<any[]>([]);
  const [amigos, setAmigos] = useState<any[]>([]);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarComunidad();
  }, [user?.id]);

  async function cargarComunidad() {
    setCargando(true);

    let queryActs = supabase
      .from('user_series')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(35);

    if (user?.id) {
      queryActs = queryActs.neq('user_id', user.id);
    }

    const { data: acts } = await queryActs;

    const userIds = Array.from(new Set((acts || []).map((a) => a.user_id)));
    const tmdbIds = Array.from(new Set((acts || []).map((a) => a.tmdb_id)));

    const perfilesMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);
      (profs || []).forEach((p: any) => {
        perfilesMap[p.id] = p.username;
      });
    }

    const cacheMap: Record<string, { title: string; poster_path: string | null }> = {};
    if (tmdbIds.length > 0) {
      const { data: cache } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', tmdbIds);
      (cache || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = {
          title: c.title,
          poster_path: c.poster_path,
        };
      });
    }

    setActividad(
      (acts || [])
        .filter((a: any) => (!user?.id ? true : a.user_id !== user.id))
        .map((a: any) => {
          const clave = `${a.media_type || 'tv'}-${a.tmdb_id}`;
          return {
            ...a,
            username: perfilesMap[a.user_id] || 'usuario',
            title: cacheMap[clave]?.title || 'Título',
            poster_path: cacheMap[clave]?.poster_path || null,
          };
        })
    );

    if (user) {
      const { data: fRows } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const entrantes = (fRows || []).filter(
        (f) => f.status === 'pending' && f.addressee_id === user.id
      );
      const aceptadas = (fRows || []).filter((f) => f.status === 'accepted');

      const todosSocialIds = Array.from(
        new Set([
          ...entrantes.map((e) => e.requester_id),
          ...aceptadas.map((a) => (a.requester_id === user.id ? a.addressee_id : a.requester_id)),
        ])
      );

      const socialMap: Record<string, any> = {};
      if (todosSocialIds.length > 0) {
        const { data: sProfs } = await supabase
          .from('profiles')
          .select('id, username, bio')
          .in('id', todosSocialIds);
        (sProfs || []).forEach((p: any) => {
          socialMap[p.id] = p;
        });
      }

      setSolicitudesEntrantes(
        entrantes.map((e) => ({
          ...e,
          sender: socialMap[e.requester_id] || { id: e.requester_id, username: 'usuario' },
        }))
      );

      setAmigos(
        aceptadas.map((a) => {
          const friendId = a.requester_id === user.id ? a.addressee_id : a.requester_id;
          return {
            friendshipId: a.id,
            ...(socialMap[friendId] || { id: friendId, username: 'usuario' }),
          };
        })
      );

      const { data: unread } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('read', false);

      const conteo: Record<string, number> = {};
      (unread || []).forEach((m: any) => {
        conteo[m.sender_id] = (conteo[m.sender_id] || 0) + 1;
      });
      setMensajesNoLeidos(conteo);
    } else {
      setSolicitudesEntrantes([]);
      setAmigos([]);
      setMensajesNoLeidos({});
    }

    setCargando(false);
  }

  async function buscarUsuarios(texto: string) {
    setBusquedaUser(texto);
    if (!texto.trim()) {
      setUsuariosBusqueda([]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, bio')
      .ilike('username', `%${texto.trim()}%`)
      .limit(8);
    setUsuariosBusqueda(data || []);
  }

  async function responderSolicitud(friendshipId: string, aceptar: boolean) {
    if (aceptar) {
      await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);
    } else {
      await supabase.from('friendships').delete().eq('id', friendshipId);
    }
    cargarComunidad();
  }

  const totalNoLeidos = Object.values(mensajesNoLeidos).reduce((acc, n) => acc + n, 0);
  const badgeSocial = solicitudesEntrantes.length + totalNoLeidos;
  const idsAmigos = new Set(amigos.map((a) => a.id));

  const actividadFiltrada = actividad.filter((act) => {
    if (filtroAmigoId === 'all') return true;
    if (filtroAmigoId === 'friends_only') return idsAmigos.has(act.user_id);
    return act.user_id === filtroAmigoId;
  });

  const actividadVisible = mostrarTodoFeed
    ? actividadFiltrada
    : actividadFiltrada.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Selector limpio de sección dentro de Comunidad */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTabComunidad('actividad')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabComunidad === 'actividad'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            Actividad
          </button>

          <button
            type="button"
            onClick={() => setTabComunidad('amigos')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tabComunidad === 'amigos'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Amigos y Chat
            {badgeSocial > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badgeSocial}
              </span>
            )}
          </button>
        </div>

        {tabComunidad === 'amigos' && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
            <input
              type="text"
              value={busquedaUser}
              onChange={(e) => buscarUsuarios(e.target.value)}
              placeholder="Buscar @usuario..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* PESTAÑA 1: ACTIVIDAD RECIENTE */}
      {tabComunidad === 'actividad' ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
          <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-800/80 pb-3.5 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-bold text-white">Actividad en directo</h3>
              <p className="text-xs text-slate-400">
                Lo que están viendo o puntuando otros miembros de la comunidad
              </p>
            </div>

            {actividadFiltrada.length > 8 && (
              <button
                type="button"
                onClick={() => setMostrarTodoFeed(!mostrarTodoFeed)}
                className="self-start rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-indigo-300 transition hover:border-indigo-500 hover:text-white sm:self-auto"
              >
                {mostrarTodoFeed ? 'Ver menos' : `Ver todos (${actividadFiltrada.length})`}
              </button>
            )}
          </div>

          {/* Filtro por amigo */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFiltroAmigoId('all');
                setMostrarTodoFeed(false);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filtroAmigoId === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              Todos
            </button>

            {user && amigos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFiltroAmigoId('friends_only');
                    setMostrarTodoFeed(false);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    filtroAmigoId === 'friends_only'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-emerald-500/40 hover:text-white'
                  }`}
                >
                  Solo amigos ({amigos.length})
                </button>

                <select
                  value={filtroAmigoId === 'all' || filtroAmigoId === 'friends_only' ? '' : filtroAmigoId}
                  onChange={(e) => {
                    if (e.target.value) {
                      setFiltroAmigoId(e.target.value);
                      setMostrarTodoFeed(false);
                    }
                  }}
                  className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition focus:outline-none ${
                    filtroAmigoId !== 'all' && filtroAmigoId !== 'friends_only'
                      ? 'border-indigo-400 bg-indigo-600 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-indigo-500/60'
                  }`}
                >
                  <option value="" className="bg-slate-900 text-slate-400">
                    Elegir amigo...
                  </option>
                  {amigos.map((am) => (
                    <option key={am.id} value={am.id} className="bg-slate-900 text-white">
                      @{am.username}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {cargando ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/70" />
              ))}
            </div>
          ) : actividadVisible.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 py-10 text-center">
              <p className="text-xs text-slate-400">
                {filtroAmigoId !== 'all'
                  ? 'No hay actividad reciente con este filtro de amigos.'
                  : 'Por ahora no hay actividad reciente de otros miembros.'}
              </p>
              {filtroAmigoId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFiltroAmigoId('all')}
                  className="mt-3 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                >
                  Mostrar todos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {actividadVisible.map((act) => (
                <div
                  key={act.id}
                  className="group flex items-center gap-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3 transition hover:border-indigo-500/45"
                >
                  <img
                    src={getPosterUrl(act.poster_path, 'w342')}
                    alt={act.title}
                    onClick={() =>
                      onSelectSerie({
                        id: act.tmdb_id,
                        media_type: act.media_type || 'tv',
                        name: act.title,
                        overview: '',
                        poster_path: act.poster_path,
                        backdrop_path: null,
                        first_air_date: '',
                        vote_average: act.rating || 0,
                      })
                    }
                    className="h-14 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-800 object-cover transition group-hover:scale-105"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectUser(act.user_id)}
                        className="truncate text-xs font-bold text-indigo-400 hover:underline"
                      >
                        @{act.username}
                      </button>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          act.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : act.status === 'watching'
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {act.status === 'completed'
                          ? 'Vista'
                          : act.status === 'watching'
                          ? `Viendo · T${act.current_season} E${act.current_episode}`
                          : 'Pendiente'}
                      </span>
                    </div>

                    <p
                      onClick={() =>
                        onSelectSerie({
                          id: act.tmdb_id,
                          media_type: act.media_type || 'tv',
                          name: act.title,
                          overview: '',
                          poster_path: act.poster_path,
                          backdrop_path: null,
                          first_air_date: '',
                          vote_average: act.rating || 0,
                        })
                      }
                      className="mt-1 cursor-pointer truncate text-sm font-semibold text-white transition hover:text-indigo-300"
                    >
                      {act.title}
                    </p>

                    {act.rating > 0 && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-bold text-amber-400">
                        <Star className="h-3 w-3 fill-amber-400" />
                        <span>{act.rating}/5</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* PESTAÑA 2: AMIGOS, SOLICITUDES Y BUSCADOR */
        <section className="space-y-5 rounded-3xl border border-indigo-500/30 bg-slate-900/50 p-5 shadow-lg">
          {busquedaUser.trim() !== '' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3.5">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Usuarios encontrados ({usuariosBusqueda.length})
              </p>
              {usuariosBusqueda.length === 0 ? (
                <p className="text-xs text-slate-500">No se encontró ningún usuario.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {usuariosBusqueda.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => onSelectUser(u.id)}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left transition hover:border-indigo-500/60"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold uppercase text-white">
                        {(u.username || 'U')[0]}
                      </div>
                      <div className="truncate">
                        <p className="truncate text-xs font-bold text-white">@{u.username}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {u.bio || 'Ver perfil'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {user && solicitudesEntrantes.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <UserPlus className="h-3.5 w-3.5" />
                Solicitudes pendientes ({solicitudesEntrantes.length})
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {solicitudesEntrantes.map((sol) => (
                  <div
                    key={sol.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectUser(sol.sender.id)}
                      className="text-xs font-bold text-indigo-300 hover:underline"
                    >
                      @{sol.sender.username}
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => responderSolicitud(sol.id, true)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                      >
                        <Check className="h-3 w-3" /> Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => responderSolicitud(sol.id, false)}
                        className="rounded-lg bg-slate-800 p-1 text-slate-400 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!user ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-center">
              <p className="text-xs text-slate-300">
                Inicia sesión para gestionar tus amigos y enviar mensajes privados.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                Entrar a mi cuenta
              </button>
            </div>
          ) : amigos.length === 0 ? (
            <p className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-xs text-slate-400">
              Aún no tienes amigos. Busca un <strong className="text-indigo-300">@usuario</strong> arriba para abrir su perfil y enviarle solicitud.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {amigos.map((am) => {
                const sinLeer = mensajesNoLeidos[am.id] || 0;
                return (
                  <div
                    key={am.id}
                    onClick={() => onSelectUser(am.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3 transition hover:border-indigo-500/60 ${
                      sinLeer > 0
                        ? 'border-indigo-400/60 bg-indigo-950/35'
                        : 'border-slate-800 bg-slate-950/85 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/25 text-xs font-bold uppercase text-indigo-200">
                        {(am.username || 'A')[0]}
                      </div>
                      <div className="truncate">
                        <p className="truncate text-xs font-bold text-white">@{am.username}</p>
                        <p className="text-[11px] text-slate-400">Ver perfil / Chat</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4 text-indigo-400" />
                      {sinLeer > 0 && (
                        <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {sinLeer}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}