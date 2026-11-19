'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import {
  X, UserPlus, UserCheck, MessageSquare, Send,
  Eye, Check, Clock, Star, Folder, Copy, Edit3, Save, Share2, Users, BarChart3
} from 'lucide-react';

interface UserProfileModalProps {
  targetUserId: string;
  currentUser: any;
  onClose: () => void;
  onSelectMedia: (media: MediaTMDB) => void;
  onRequireAuth: () => void;
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
  const [episodiosUsuario, setEpisodiosUsuario] = useState<any[]>([]);
  const [coleccionesPublicas, setColeccionesPublicas] = useState<any[]>([]);
  const [seguidoresCount, setSeguidoresCount] = useState(0);
  const [siguiendoCount, setSiguiendoCount] = useState(0);
  const [loSigo, setLoSigo] = useState(false);

  const [estadoAmistad, setEstadoAmistad] = useState<'none' | 'sent' | 'received' | 'friends'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  const [misSolicitudes, setMisSolicitudes] = useState<any[]>([]);
  const [misAmigos, setMisAmigos] = useState<any[]>([]);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState<Record<string, number>>({});

  const [tabPerfil, setTabPerfil] = useState<'estadisticas' | 'colecciones' | 'amigos' | 'chat'>('estadisticas');

  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [cargando, setCargando] = useState(true);
  const [clonandoColId, setClonandoColId] = useState<string | null>(null);
  const [perfilCopiado, setPerfilCopiado] = useState(false);

  const esMiPerfil = currentUser?.id === targetUserId;

  useEffect(() => {
    setTabPerfil('estadisticas');
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

  async function compartirPerfil() {
    const url = `${window.location.origin}/?user=${targetUserId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Perfil de @${perfil?.username || 'usuario'} en PlotCorn`,
          url,
        });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(url);
    setPerfilCopiado(true);
    setTimeout(() => setPerfilCopiado(false), 2500);
  }

  async function cargarTodoPerfil() {
    setCargando(true);

    const { data: profData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    setPerfil(profData || { id: targetUserId, username: 'usuario', bio: '' });
    setBioEdit(profData?.bio || '');

    const [{ data: uSeries }, { data: epRows }] = await Promise.all([
      supabase
        .from('user_series')
        .select('*')
        .eq('user_id', targetUserId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('watched_episodes')
        .select('*')
        .eq('user_id', targetUserId),
    ]);

    const ids = Array.from(new Set((uSeries || []).map((u) => Number(u.tmdb_id)).filter(Boolean)));
    const idsSet = new Set(ids);

    const episodiosFiltrados = (epRows || []).filter((e: any) => {
      const tmdbIdNum = Number(e.tmdb_id ?? e.series_id ?? e.media_id);
      return !Number.isNaN(tmdbIdNum) && idsSet.has(tmdbIdNum);
    });
    setEpisodiosUsuario(episodiosFiltrados);

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

    if (currentUser && esMiPerfil) {
      const { data: fRows } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

      const entrantes = (fRows || []).filter(
        (f) => f.status === 'pending' && f.addressee_id === currentUser.id
      );
      const aceptadas = (fRows || []).filter((f) => f.status === 'accepted');

      const todosIds = Array.from(
        new Set([
          ...entrantes.map((e) => e.requester_id),
          ...aceptadas.map((a) =>
            a.requester_id === currentUser.id ? a.addressee_id : a.requester_id
          ),
        ])
      );

      const perfilesSociales: Record<string, any> = {};
      if (todosIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, bio')
          .in('id', todosIds);
        (profs || []).forEach((p: any) => {
          perfilesSociales[p.id] = p;
        });
      }

      setMisSolicitudes(
        entrantes.map((e) => ({
          ...e,
          sender: perfilesSociales[e.requester_id] || {
            id: e.requester_id,
            username: 'usuario',
          },
        }))
      );

      setMisAmigos(
        aceptadas.map((a) => {
          const friendId =
            a.requester_id === currentUser.id ? a.addressee_id : a.requester_id;
          return {
            friendshipId: a.id,
            ...(perfilesSociales[friendId] || { id: friendId, username: 'usuario' }),
          };
        })
      );

      const { data: unread } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', currentUser.id)
        .eq('read', false);

      const conteo: Record<string, number> = {};
      (unread || []).forEach((m: any) => {
        conteo[m.sender_id] = (conteo[m.sender_id] || 0) + 1;
      });
      setMensajesNoLeidos(conteo);
    } else if (currentUser && !esMiPerfil) {
      setMisSolicitudes([]);
      setMisAmigos([]);
      setMensajesNoLeidos({});

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

  async function responderSolicitudPropia(idSolicitud: string, aceptar: boolean) {
    if (aceptar) {
      await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', idSolicitud);
    } else {
      await supabase.from('friendships').delete().eq('id', idSolicitud);
    }
    cargarTodoPerfil();
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

  const totalTitulos = seriesUsuario.length;
  const totalSeries = seriesUsuario.filter((s) => s.media_type === 'tv').length;
  const totalPelis = seriesUsuario.filter((s) => s.media_type === 'movie').length;

  const viendoCount = seriesUsuario.filter((s) => s.status === 'watching').length;
  const completadosCount = seriesUsuario.filter((s) => s.status === 'completed').length;
  const pendientesCount = seriesUsuario.filter((s) => s.status === 'watchlist').length;

  const notasDeEpisodiosPuntuados = useMemo(() => {
    if (totalTitulos === 0) return [];
    return episodiosUsuario
      .map((e: any) => extraerNotaRegistro(e))
      .filter((n) => n > 0);
  }, [episodiosUsuario, totalTitulos]);

  const notasDeTitulos = useMemo(() => {
    if (totalTitulos === 0) return [];
    return seriesUsuario
      .map((s) => extraerNotaRegistro(s))
      .filter((n) => n > 0);
  }, [seriesUsuario, totalTitulos]);

  const notasParaGrafico =
    notasDeEpisodiosPuntuados.length > 0 ? notasDeEpisodiosPuntuados : notasDeTitulos;

  const notaMedia =
    notasParaGrafico.length > 0
      ? (
          notasParaGrafico.reduce((acc, n) => acc + n, 0) / notasParaGrafico.length
        ).toFixed(1)
      : '0';

  const pctSeries = totalTitulos > 0 ? Math.round((totalSeries / totalTitulos) * 100) : 0;
  const pctPelis = totalTitulos > 0 ? 100 - pctSeries : 0;

  const distribucionEstrellas = useMemo(() => {
    return [5, 4, 3, 2, 1].map((estrella) => {
      const cantidad = notasParaGrafico.filter((n) => Math.round(n) === estrella).length;
      const pct =
        notasParaGrafico.length > 0 ? Math.round((cantidad / notasParaGrafico.length) * 100) : 0;
      return { estrella, cantidad, pct };
    });
  }, [notasParaGrafico]);

  const maxEstrella = Math.max(1, ...distribucionEstrellas.map((d) => d.cantidad));

  const totalNoLeidos = Object.values(mensajesNoLeidos).reduce((a, b) => a + b, 0);
  const badgeAmigos = misSolicitudes.length + totalNoLeidos;

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
        <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/45 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/40 bg-indigo-600 text-2xl font-bold uppercase text-white shadow-lg shadow-indigo-600/30">
                {(perfil?.username || 'U')[0]}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-white">@{perfil?.username || 'usuario'}</h2>
                  {esMiPerfil && (
                    <span className="rounded-full border border-indigo-400/30 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                      Mi perfil
                    </span>
                  )}
                  {estadoAmistad === 'friends' && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                      Amigos
                    </span>
                  )}
                </div>

                {esMiPerfil && editandoBio ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      maxLength={140}
                      value={bioEdit}
                      onChange={(e) => setBioEdit(e.target.value)}
                      placeholder="Escribe algo sobre tus gustos..."
                      className="w-64 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={guardarBio}
                      className="flex items-center gap-1 rounded-xl border border-indigo-400/50 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500"
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
                        type="button"
                        onClick={() => setEditandoBio(true)}
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-indigo-400"
                        title="Editar biografía"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>
                    <strong className="text-white">{totalTitulos}</strong> títulos
                  </span>
                  <span>
                    <strong className="text-white">{seguidoresCount}</strong> seguidores
                  </span>
                  <span>
                    <strong className="text-white">{siguiendoCount}</strong> siguiendo
                  </span>
                  {Number(notaMedia) > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <strong>{notaMedia}</strong> media
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!esMiPerfil && (
                <>
                  <button
                    type="button"
                    onClick={toggleSeguir}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${
                      loSigo
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-300'
                        : 'border-indigo-400/50 bg-indigo-600 text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500'
                    }`}
                  >
                    {loSigo ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {loSigo ? 'Siguiendo' : 'Seguir'}
                  </button>

                  <button
                    type="button"
                    onClick={gestionarAmistad}
                    className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${
                      estadoAmistad === 'friends'
                        ? 'border-emerald-400/50 bg-emerald-600/20 text-emerald-300 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-300'
                        : estadoAmistad === 'received'
                        ? 'border-amber-400/50 bg-amber-600/25 text-amber-200 hover:bg-amber-600/35'
                        : estadoAmistad === 'sent'
                        ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-red-500/40 hover:text-red-300'
                        : 'border-slate-700 bg-slate-900 text-white hover:border-indigo-400 hover:bg-slate-800'
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

                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) return onRequireAuth();
                      setTabPerfil('chat');
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-600/20 px-3.5 py-2 text-xs font-bold text-indigo-200 transition hover:bg-indigo-600 hover:text-white active:scale-[0.98]"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Mensaje
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={compartirPerfil}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-indigo-400 hover:bg-slate-800 hover:text-white active:scale-[0.98]"
                title="Copiar enlace al perfil"
              >
                {perfilCopiado ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5 text-indigo-400" />
                    Compartir
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTabPerfil('estadisticas')}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${
                tabPerfil === 'estadisticas'
                  ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Estadísticas
            </button>

            <button
              type="button"
              onClick={() => setTabPerfil('colecciones')}
              className={`rounded-xl border px-4 py-1.5 text-xs font-bold transition ${
                tabPerfil === 'colecciones'
                  ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              Colecciones ({coleccionesPublicas.length})
            </button>

            {esMiPerfil ? (
              <button
                type="button"
                onClick={() => setTabPerfil('amigos')}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${
                  tabPerfil === 'amigos'
                    ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Amigos ({misAmigos.length})
                {badgeAmigos > 0 && (
                  <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {badgeAmigos}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) return onRequireAuth();
                  setTabPerfil('chat');
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${
                  tabPerfil === 'chat'
                    ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat privado
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando perfil...</div>
          ) : tabPerfil === 'amigos' && esMiPerfil ? (
            <div className="space-y-6">
              {misSolicitudes.length > 0 && (
                <div className="space-y-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <UserPlus className="h-4 w-4" />
                    Solicitudes de amistad pendientes ({misSolicitudes.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {misSolicitudes.map((sol) => (
                      <div
                        key={sol.id}
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5"
                      >
                        <span className="text-xs font-bold text-white">
                          @{sol.sender.username}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => responderSolicitudPropia(sol.id, true)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                          >
                            <Check className="h-3 w-3" /> Aceptar
                          </button>
                          <button
                            type="button"
                            onClick={() => responderSolicitudPropia(sol.id, false)}
                            className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-red-500/20 hover:text-red-300"
                          >
                            Rechazar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {misAmigos.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
                  <p className="text-xs text-slate-400">
                    Aún no tienes amigos agregados. Explora la pestaña <strong className="text-indigo-300">Comunidad</strong> para buscar usuarios y enviarles solicitud.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {misAmigos.map((am) => {
                    const sinLeer = mensajesNoLeidos[am.id] || 0;
                    return (
                      <div
                        key={am.id}
                        onClick={() => cargarTodoPerfil()}
                        className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 transition hover:border-indigo-500/50"
                      >
                        <div className="flex items-center gap-3 truncate">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/25 text-xs font-bold uppercase text-indigo-200">
                            {(am.username || 'A')[0]}
                          </div>
                          <div className="truncate">
                            <p className="truncate text-xs font-bold text-white">@{am.username}</p>
                            <p className="truncate text-[11px] text-slate-400">
                              {am.bio || 'Amigo en PlotCorn'}
                            </p>
                          </div>
                        </div>

                        {sinLeer > 0 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {sinLeer}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : tabPerfil === 'chat' && !esMiPerfil ? (
            <div className="flex h-[50vh] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
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
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs font-medium ${
                            mio
                              ? 'bg-indigo-600 text-white shadow-sm'
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
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 transition focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!nuevoMensaje.trim() || enviandoMsg}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </button>
              </form>
            </div>
          ) : tabPerfil === 'colecciones' ? (
            <div className="space-y-6">
              {coleccionesPublicas.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
                  <p className="text-sm text-slate-400">
                    {esMiPerfil
                      ? 'No tienes colecciones públicas visibles aquí. Puedes crearlas y gestionar su privacidad en Mi Biblioteca.'
                      : 'Este usuario aún no tiene colecciones públicas.'}
                  </p>
                </div>
              ) : (
                coleccionesPublicas.map((col) => (
                  <section
                    key={col.id}
                    className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-slate-900/80 via-slate-900/50 to-indigo-950/15 p-5"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
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
                          type="button"
                          onClick={() => clonarColeccion(col)}
                          disabled={clonandoColId === col.id}
                          className="flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600/20 px-3.5 py-1.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-600 hover:text-white"
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
                            className="aspect-[2/3] w-full rounded-xl border border-slate-800 object-cover transition hover:scale-105 hover:border-indigo-500/50"
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
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">Títulos</p>
                  <p className="mt-1 text-xl font-extrabold text-white">{totalTitulos}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {totalSeries} series · {totalPelis} pelis
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">Viendo ahora</p>
                  <p className="mt-1 text-xl font-extrabold text-indigo-300">{viendoCount}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">En progreso</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">Terminadas / Vistas</p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-300">{completadosCount}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{pendientesCount} pendientes</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-400">Nota media</p>
                  <p className="mt-1 flex items-center gap-1 text-xl font-extrabold text-amber-300">
                    {Number(notaMedia) > 0 && (
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    )}
                    {notaMedia}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {notasParaGrafico.length}{' '}
                    {notasParaGrafico.length === 1 ? 'valoración' : 'valoraciones'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Formato y estados
                  </h4>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Series ({totalSeries})</span>
                      <span>Películas ({totalPelis})</span>
                    </div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-950">
                      <div style={{ width: `${pctSeries}%` }} className="bg-indigo-500" />
                      <div style={{ width: `${pctPelis}%` }} className="bg-rose-500" />
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 text-xs">
                    <div className="flex items-center justify-between rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2">
                      <span className="flex items-center gap-1.5 font-semibold text-indigo-200">
                        <Eye className="h-3.5 w-3.5 text-indigo-400" /> Viendo ahora
                      </span>
                      <span className="font-extrabold text-white">{viendoCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                      <span className="flex items-center gap-1.5 font-semibold text-amber-200">
                        <Clock className="h-3.5 w-3.5 text-amber-400" /> Pendientes
                      </span>
                      <span className="font-extrabold text-white">{pendientesCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                      <span className="flex items-center gap-1.5 font-semibold text-emerald-200">
                        <Check className="h-3.5 w-3.5 text-emerald-400" /> Terminadas / Vistas
                      </span>
                      <span className="font-extrabold text-white">{completadosCount}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    Puntuaciones
                  </h4>

                  <div className="space-y-2">
                    {distribucionEstrellas.map((fila) => {
                      const ancho =
                        fila.cantidad > 0
                          ? Math.max(10, Math.round((fila.cantidad / maxEstrella) * 100))
                          : 0;
                      return (
                        <div key={fila.estrella} className="flex items-center gap-2.5 text-xs">
                          <span className="w-8 text-right font-bold text-amber-300">
                            {fila.estrella}★
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-950">
                            <div
                              style={{ width: `${ancho}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-indigo-500"
                            />
                          </div>
                          <span className="w-12 text-right font-bold text-slate-300">
                            {fila.cantidad}{' '}
                            <span className="text-[10px] text-slate-500">({fila.pct}%)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}