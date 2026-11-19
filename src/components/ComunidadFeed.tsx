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

    // 1. Actividad reciente global
    const { data: acts } = await supabase
      .from('user_series')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(25);

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
      (acts || []).map((a: any) => {
        const clave = `${a.media_type || 'tv'}-${a.tmdb_id}`;
        return {
          ...a,
          username: perfilesMap[a.user_id] || 'usuario',
          title: cacheMap[clave]?.title || 'Título',
          poster_path: cacheMap[clave]?.poster_path || null,
        };
      })
    );

    // 2. Datos sociales del usuario logueado (amigos, solicitudes y mensajes no leídos)
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

      // Mensajes sin leer
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

  return (
    <div className="space-y-8">
      {/* BLOQUE 1: RED SOCIAL, BUSCADOR DE USUARIOS Y AMIGOS */}
      <section className="space-y-5 rounded-3xl border border-indigo-500/30 bg-slate-900/45 p-5 shadow-lg">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Amigos y Mensajes</h3>
              <p className="text-xs text-slate-400">
                Busca perfiles, acepta solicitudes y chatea en privado
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busquedaUser}
              onChange={(e) => buscarUsuarios(e.target.value)}
              placeholder="Buscar @usuario..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Resultados de búsqueda de usuarios */}
        {busquedaUser.trim() !== '' && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase text-slate-400">
              Usuarios encontrados ({usuariosBusqueda.length})
            </p>
            {usuariosBusqueda.length === 0 ? (
              <p className="text-xs text-slate-500">No se encontró ningún usuario con ese nombre.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {usuariosBusqueda.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onSelectUser(u.id)}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left transition hover:border-indigo-500/50"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold uppercase text-white">
                        {(u.username || 'U')[0]}
                      </div>
                      <div className="truncate">
                        <p className="truncate text-xs font-bold text-white">@{u.username}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {u.bio || 'Ver perfil y biblioteca'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Solicitudes de amistad pendientes */}
        {user && solicitudesEntrantes.length > 0 && (
          <div className="space-y-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <UserPlus className="h-3.5 w-3.5" />
              Solicitudes de amistad pendientes ({solicitudesEntrantes.length})
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {solicitudesEntrantes.map((sol) => (
                <div
                  key={sol.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                >
                  <button
                    onClick={() => onSelectUser(sol.sender.id)}
                    className="text-xs font-bold text-white hover:text-indigo-400"
                  >
                    @{sol.sender.username}
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => responderSolicitud(sol.id, true)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                    >
                      <Check className="h-3 w-3" /> Aceptar
                    </button>
                    <button
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

        {/* Lista de amigos */}
        {!user ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
            <p className="text-xs text-slate-400">
              Inicia sesión para agregar amigos y enviar mensajes privados.
            </p>
            <button
              onClick={onRequireAuth}
              className="mt-2.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
            >
              Entrar a mi cuenta
            </button>
          </div>
        ) : amigos.length === 0 ? (
          <p className="text-xs text-slate-400">
            Aún no tienes amigos agregados. Haz clic en cualquier <strong>@usuario</strong> de abajo o búscalos arriba para abrir su perfil y enviarles solicitud.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {amigos.map((am) => {
              const sinLeer = mensajesNoLeidos[am.id] || 0;
              return (
                <div
                  key={am.id}
                  onClick={() => onSelectUser(am.id)}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-3 transition hover:border-indigo-500/50"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/25 text-xs font-bold uppercase text-indigo-300">
                      {(am.username || 'A')[0]}
                    </div>
                    <div className="truncate">
                      <p className="truncate text-xs font-bold text-white">@{am.username}</p>
                      <p className="text-[11px] text-slate-400">Ver perfil / Chat</p>
                    </div>
                  </div>

                  <div className="relative flex items-center">
                    <MessageSquare className="h-4 w-4 text-indigo-400" />
                    {sinLeer > 0 && (
                      <span className="ml-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
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

      {/* BLOQUE 2: ACTIVIDAD RECIENTE DE LA COMUNIDAD */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/45 p-5 shadow-lg">
        <div className="mb-5 flex items-center gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
            <Flame className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Actividad en directo</h3>
            <p className="text-xs text-slate-400">
              Pulsa en cualquier usuario para abrir su perfil o en la carátula para ver la ficha
            </p>
          </div>
        </div>

        {cargando ? (
          <div className="py-10 text-center text-xs text-slate-400">Cargando actividad...</div>
        ) : actividad.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Aún no hay actividad reciente en la comunidad.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {actividad.map((act) => (
              <div
                key={act.id}
                className="flex items-center gap-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/80 p-3"
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
                  className="h-16 w-11 shrink-0 cursor-pointer rounded-xl object-cover hover:opacity-85"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <button
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
                        ? 'Terminada'
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
                    className="mt-1 cursor-pointer truncate text-sm font-semibold text-white hover:text-indigo-300"
                  >
                    {act.title}
                  </p>

                  {act.rating > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-400">
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
    </div>
  );
}