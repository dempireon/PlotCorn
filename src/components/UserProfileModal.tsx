'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import {
  X, UserPlus, UserCheck, UserMinus, MessageSquare, Send,
  Tv, Film, Eye, Check, Clock, Star, Folder, Copy, Edit3, Save
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
  const [bioEdit, setBioEdit] = useState('');
  const [editandoBio, setEditandoBio] = useState(false);

  const [seriesUsuario, setSeriesUsuario] = useState<any[]>([]);
  const [coleccionesPublicas, setColeccionesPublicas] = useState<any[]>([]);
  const [seguidoresCount, setSeguidoresCount] = useState(0);
  const [siguiendoCount, setSiguiendoCount] = useState(0);
  const [loSigo, setLoSigo] = useState(false);

  // Estado de amistad: 'none' | 'sent' | 'received' | 'friends'
  const [estadoAmistad, setEstadoAmistad] = useState<'none' | 'sent' | 'received' | 'friends'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  // Pestaña activa dentro del perfil: 'biblioteca' | 'colecciones' | 'chat'
  const [tabPerfil, setTabPerfil] = useState<'biblioteca' | 'colecciones' | 'chat'>('biblioteca');

  // Chat directo
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [cargando, setCargando] = useState(true);
  const [clonandoColId, setClonandoColId] = useState<string | null>(null);

  const esMiPerfil = currentUser?.id === targetUserId;

  useEffect(() => {
    cargarTodoPerfil();
  }, [targetUserId, currentUser?.id]);

  useEffect(() => {
    if (tabPerfil === 'chat' && currentUser && !esMiPerfil) {
      cargarMensajes();
      const intervalo = setInterval(cargarMensajes, 4000);
      return () => clearInterval(intervalo);
    }
  }, [tabPerfil, targetUserId, currentUser?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function cargarTodoPerfil() {
    setCargando(true);

    // 1. Perfil
    const { data: profData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    setPerfil(profData || { id: targetUserId, username: 'usuario', bio: '' });
    setBioEdit(profData?.bio || '');

    // 2. Biblioteca del usuario + caché de títulos
    const { data: uSeries } = await supabase
      .from('user_series')
      .select('*')
      .eq('user_id', targetUserId)
      .order('updated_at', { ascending: false });

    const ids = Array.from(new Set((uSeries || []).map((u) => u.tmdb_id)));
    const cacheMap: Record<string, { title: string; poster_path: string | null }> = {};
    if (ids.length > 0) {
      const { data: cData } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', ids);
      (cData || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = {
          title: c.title,
          poster_path: c.poster_path,
        };
      });
    }

    const combinados = (uSeries || []).map((u: any) => {
      const clave = `${u.media_type || 'tv'}-${u.tmdb_id}`;
      return {
        ...u,
        media_type: (u.media_type || 'tv') as MediaType,
        title: cacheMap[clave]?.title || 'Título',
        poster_path: cacheMap[clave]?.poster_path || null,
      };
    });
    setSeriesUsuario(combinados);

    // 3. Colecciones públicas
    const { data: cols } = await supabase
      .from('user_collections')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (cols && cols.length > 0) {
      const colIds = cols.map((c) => c.id);
      const { data: cItems } = await supabase
        .from('collection_items')
        .select('*')
        .in('collection_id', colIds);

      const itemIds = Array.from(new Set((cItems || []).map((ci) => ci.tmdb_id)));
      if (itemIds.length > 0) {
        const { data: cCache } = await supabase
          .from('series_cache')
          .select('*')
          .in('tmdb_id', itemIds);
        (cCache || []).forEach((c: any) => {
          cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = {
            title: c.title,
            poster_path: c.poster_path,
          };
        });
      }

      setColeccionesPublicas(
        cols.map((col: any) => ({
          ...col,
          items: (cItems || [])
            .filter((ci) => ci.collection_id === col.id)
            .map((ci) => {
              const clave = `${ci.media_type || 'tv'}-${ci.tmdb_id}`;
              return {
                tmdb_id: ci.tmdb_id,
                media_type: (ci.media_type || 'tv') as MediaType,
                title: cacheMap[clave]?.title || 'Título',
                poster_path: cacheMap[clave]?.poster_path || null,
              };
            }),
        }))
      );
    } else {
      setColeccionesPublicas([]);
    }

    // 4. Contadores de seguidores / siguiendo
    const { count: segCount } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', targetUserId);
    setSeguidoresCount(segCount || 0);

    const { count: sigCount } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', targetUserId);
    setSiguiendoCount(sigCount || 0);

    // 5. Relación con el usuario actual (follow y amistad)
    if (currentUser && !esMiPerfil) {
      const { data: followRow } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId)
        .maybeSingle();
      setLoSigo(!!followRow);

      const { data: friendRow } = await supabase
        .from('friendships')
        .select('*')
        .or(
          `and(requester_id.eq.${currentUser.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUser.id})`
        )
        .maybeSingle();

      if (!friendRow) {
        setEstadoAmistad('none');
        setFriendshipId(null);
      } else {
        setFriendshipId(friendRow.id);
        if (friendRow.status === 'accepted') {
          setEstadoAmistad('friends');
        } else if (friendRow.requester_id === currentUser.id) {
          setEstadoAmistad('sent');
        } else {
          setEstadoAmistad('received');
        }
      }
    }

    setCargando(false);
  }

  async function toggleSeguir() {
    if (!currentUser) return onRequireAuth();
    if (loSigo) {
      setLoSigo(false);
      setSeguidoresCount((c) => Math.max(0, c - 1));
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId);
    } else {
      setLoSigo(true);
      setSeguidoresCount((c) => c + 1);
      await supabase.from('follows').insert({
        follower_id: currentUser.id,
        following_id: targetUserId,
      });
    }
  }

  async function gestionarAmistad() {
    if (!currentUser) return onRequireAuth();

    if (estadoAmistad === 'none') {
      const { data } = await supabase
        .from('friendships')
        .insert({
          requester_id: currentUser.id,
          addressee_id: targetUserId,
          status: 'pending',
        })
        .select()
        .single();
      if (data) {
        setFriendshipId(data.id);
        setEstadoAmistad('sent');
      }
    } else if (estadoAmistad === 'received' && friendshipId) {
      await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);
      setEstadoAmistad('friends');
    } else if ((estadoAmistad === 'sent' || estadoAmistad === 'friends') && friendshipId) {
      await supabase.from('friendships').delete().eq('id', friendshipId);
      setFriendshipId(null);
      setEstadoAmistad('none');
    }
  }

  async function guardarBio() {
    if (!currentUser || !esMiPerfil) return;
    await supabase
      .from('profiles')
      .update({ bio: bioEdit.trim() })
      .eq('id', currentUser.id);
    setPerfil((p: any) => ({ ...p, bio: bioEdit.trim() }));
    setEditandoBio(false);
  }

  async function cargarMensajes() {
    if (!currentUser) return;
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true });

    setMensajes(data || []);

    // Marcar como leídos los recibidos
    await supabase
      .from('direct_messages')
      .update({ read: true })
      .eq('sender_id', targetUserId)
      .eq('receiver_id', currentUser.id)
      .eq('read', false);
  }

  async function enviarMensaje(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return onRequireAuth();
    if (!nuevoMensaje.trim() || enviandoMsg) return;

    setEnviandoMsg(true);
    const texto = nuevoMensaje.trim();
    setNuevoMensaje('');

    const { data } = await supabase
      .from('direct_messages')
      .insert({
        sender_id: currentUser.id,
        receiver_id: targetUserId,
        content: texto,
      })
      .select()
      .single();

    if (data) {
      setMensajes((prev) => [...prev, data]);
    }
    setEnviandoMsg(false);
  }

  async function clonarColeccion(col: any) {
    if (!currentUser) return onRequireAuth();
    setClonandoColId(col.id);

    const { data: nuevaCol, error } = await supabase
      .from('user_collections')
      .insert({
        user_id: currentUser.id,
        name: `${col.name} (de @${perfil?.username || 'usuario'})`,
        description: col.description || '',
        is_public: false,
      })
      .select()
      .single();

    if (!error && nuevaCol && col.items.length > 0) {
      await supabase.from('collection_items').insert(
        col.items.map((it: any) => ({
          collection_id: nuevaCol.id,
          tmdb_id: it.tmdb_id,
          media_type: it.media_type,
        }))
      );
    }

    setClonandoColId(null);
    alert(`¡Colección "${col.name}" guardada en tu biblioteca!`);
  }

  const viendo = seriesUsuario.filter((s) => s.status === 'watching');
  const completadas = seriesUsuario.filter((s) => s.status === 'completed');
  const pendientes = seriesUsuario.filter((s) => s.status === 'watchlist');

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* Cabecera del perfil */}
        <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold uppercase text-white shadow-lg shadow-indigo-600/30">
                {(perfil?.username || 'U')[0]}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-white">@{perfil?.username || 'usuario'}</h2>
                  {estadoAmistad === 'friends' && (
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                      Amigos
                    </span>
                  )}
                </div>

                {/* Bio */}
                {esMiPerfil && editandoBio ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={140}
                      value={bioEdit}
                      onChange={(e) => setBioEdit(e.target.value)}
                      placeholder="Escribe algo sobre tus gustos..."
                      className="w-64 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={guardarBio}
                      className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-500"
                    >
                      <Save className="h-3 w-3" /> Guardar
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-slate-400">
                      {perfil?.bio || (esMiPerfil ? 'Sin biografía aún.' : 'Amante de las series y el cine.')}
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

                <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>
                    <strong className="text-white">{seriesUsuario.length}</strong> títulos
                  </span>
                  <span>
                    <strong className="text-white">{seguidoresCount}</strong> seguidores
                  </span>
                  <span>
                    <strong className="text-white">{siguiendoCount}</strong> siguiendo
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!esMiPerfil && (
                <>
                  {/* Botón Seguir */}
                  <button
                    onClick={toggleSeguir}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                      loSigo
                        ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-red-500/40 hover:text-red-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500'
                    }`}
                  >
                    {loSigo ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {loSigo ? 'Siguiendo' : 'Seguir'}
                  </button>

                  {/* Botón Amistad */}
                  <button
                    onClick={gestionarAmistad}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                      estadoAmistad === 'friends'
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:border-red-500/40 hover:text-red-400'
                        : estadoAmistad === 'received'
                        ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                        : estadoAmistad === 'sent'
                        ? 'border-slate-700 bg-slate-900 text-slate-400'
                        : 'border-slate-700 bg-slate-900 text-white hover:border-indigo-500'
                    }`}
                  >
                    {estadoAmistad === 'friends' && (
                      <>
                        <UserCheck className="h-3.5 w-3.5" /> Amigos
                      </>
                    )}
                    {estadoAmistad === 'received' && (
                      <>
                        <UserPlus className="h-3.5 w-3.5" /> Aceptar solicitud
                      </>
                    )}
                    {estadoAmistad === 'sent' && (
                      <>
                        <Clock className="h-3.5 w-3.5" /> Solicitud enviada
                      </>
                    )}
                    {estadoAmistad === 'none' && (
                      <>
                        <UserPlus className="h-3.5 w-3.5" /> Añadir amigo
                      </>
                    )}
                  </button>

                  {/* Botón Mensaje directo */}
                  <button
                    onClick={() => {
                      if (!currentUser) return onRequireAuth();
                      setTabPerfil('chat');
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/25"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Mensaje
                  </button>
                </>
              )}

              <button
                onClick={onClose}
                className="rounded-xl bg-slate-900 p-2 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Navegación interna del perfil */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setTabPerfil('biblioteca')}
              className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                tabPerfil === 'biblioteca'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950/70 text-slate-400 hover:text-white'
              }`}
            >
              Biblioteca ({seriesUsuario.length})
            </button>
            <button
              onClick={() => setTabPerfil('colecciones')}
              className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                tabPerfil === 'colecciones'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-950/70 text-slate-400 hover:text-white'
              }`}
            >
              Colecciones ({coleccionesPublicas.length})
            </button>
            {!esMiPerfil && (
              <button
                onClick={() => {
                  if (!currentUser) return onRequireAuth();
                  setTabPerfil('chat');
                }}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
                  tabPerfil === 'chat'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950/70 text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat privado
              </button>
            )}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6">
          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando perfil...</div>
          ) : tabPerfil === 'chat' && !esMiPerfil ? (
            <div className="flex h-[50vh] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {mensajes.length === 0 ? (
                  <p className="py-16 text-center text-xs text-slate-500">
                    Inicia la conversación con @{perfil?.username}. ¡Recomiéndale una serie!
                  </p>
                ) : (
                  mensajes.map((m) => {
                    const mio = m.sender_id === currentUser?.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${mio ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs ${
                            mio
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-800 bg-slate-950 text-slate-200'
                          }`}
                        >
                          {m.content}
                        </div>
                        <span className="mt-1 text-[10px] text-slate-500">
                          {new Date(m.created_at).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={enviarMensaje} className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                <input
                  type="text"
                  value={nuevoMensaje}
                  onChange={(e) => setNuevoMensaje(e.target.value)}
                  placeholder={`Escribe un mensaje a @${perfil?.username}...`}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!nuevoMensaje.trim() || enviandoMsg}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </button>
              </form>
            </div>
          ) : tabPerfil === 'colecciones' ? (
            <div className="space-y-6">
              {coleccionesPublicas.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">
                  Este usuario aún no tiene colecciones públicas.
                </p>
              ) : (
                coleccionesPublicas.map((col) => (
                  <section
                    key={col.id}
                    className="rounded-3xl border border-indigo-500/30 bg-slate-900/45 p-5"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <Folder className="h-4 w-4 text-indigo-400" />
                        <div>
                          <h4 className="text-sm font-bold text-white">{col.name}</h4>
                          {col.description && (
                            <p className="text-xs text-slate-400">{col.description}</p>
                          )}
                        </div>
                      </div>

                      {!esMiPerfil && (
                        <button
                          onClick={() => clonarColeccion(col)}
                          disabled={clonandoColId === col.id}
                          className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {clonandoColId === col.id ? 'Guardando...' : 'Guardar en mi biblioteca'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                      {col.items.map((it: any) => (
                        <div
                          key={`${it.media_type}-${it.tmdb_id}`}
                          onClick={() => {
                            onClose();
                            onSelectMedia({
                              id: it.tmdb_id,
                              media_type: it.media_type,
                              name: it.title,
                              overview: '',
                              poster_path: it.poster_path,
                              backdrop_path: null,
                              first_air_date: '',
                              vote_average: 0,
                            });
                          }}
                          className="cursor-pointer space-y-1.5"
                        >
                          <img
                            src={getPosterUrl(it.poster_path)}
                            alt={it.title}
                            className="aspect-[2/3] w-full rounded-xl object-cover hover:opacity-85"
                          />
                          <p className="truncate text-xs font-medium text-slate-200">{it.title}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : (
            /* BIBLIOTECA EN BLOQUES ESTILO MISTBOOK */
            <div className="space-y-6">
              {seriesUsuario.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">
                  Su biblioteca está vacía por ahora.
                </p>
              ) : (
                [
                  {
                    titulo: 'Viendo ahora',
                    icono: <Eye className="h-4 w-4 text-indigo-400" />,
                    border: 'border-indigo-500/30',
                    lista: viendo,
                  },
                  {
                    titulo: 'Terminadas y Vistas',
                    icono: <Check className="h-4 w-4 text-emerald-400" />,
                    border: 'border-emerald-500/30',
                    lista: completadas,
                  },
                  {
                    titulo: 'Pendientes',
                    icono: <Clock className="h-4 w-4 text-amber-400" />,
                    border: 'border-amber-500/30',
                    lista: pendientes,
                  },
                ]
                  .filter((b) => b.lista.length > 0)
                  .map((bloque) => (
                    <section
                      key={bloque.titulo}
                      className={`rounded-3xl border ${bloque.border} bg-slate-900/45 p-4`}
                    >
                      <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2.5">
                        {bloque.icono}
                        <h4 className="text-sm font-bold text-white">
                          {bloque.titulo} ({bloque.lista.length})
                        </h4>
                      </div>

                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                        {bloque.lista.map((it) => (
                          <div
                            key={`${it.media_type}-${it.tmdb_id}`}
                            onClick={() => {
                              onClose();
                              onSelectMedia({
                                id: it.tmdb_id,
                                media_type: it.media_type,
                                name: it.title,
                                overview: '',
                                poster_path: it.poster_path,
                                backdrop_path: null,
                                first_air_date: '',
                                vote_average: it.rating || 0,
                              });
                            }}
                            className="cursor-pointer space-y-1"
                          >
                            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-900">
                              <img
                                src={getPosterUrl(it.poster_path)}
                                alt={it.title}
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                              {it.rating > 0 && (
                                <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                                  <Star className="h-2.5 w-2.5 fill-amber-400" />
                                  {it.rating}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs font-medium text-slate-200">{it.title}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}