'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl, MediaTMDB, MediaType } from '@/lib/tmdb';
import EditarPerfilModal from '@/components/EditarPerfilModal';
import {
  UserPlus, UserCheck, MessageSquare, Send,
  Star, Folder, Copy, Edit3, Save, Share2,
  Users, BarChart3, ArrowLeft, Clock,
  Camera, Wifi, Check
} from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface UserProfileModalProps {
  targetUserId: string;
  currentUser: any;
  onClose: () => void;
  onSelectMedia: (media: MediaTMDB) => void;
  onRequireAuth: () => void;
  onNotify?: (msg: string) => void;
  onGoToComunidad?: () => void;
}

type FormatoDetallado = 'tv' | 'movie' | 'reality' | 'documentary';

const tmdbFormatCache = new Map<string, FormatoDetallado>();

function formatearFechaES(fechaStr?: string | null, corto = false): string {
  if (!fechaStr) return '';
  const partes = String(fechaStr).slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) {
    return String(fechaStr);
  }
  const [anio, mes, dia] = partes;
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: corto ? 'short' : '2-digit',
    year: 'numeric',
  });
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

function detectarFormatoDetallado(item: any): FormatoDetallado {
  if (item?.is_reality === true) return 'reality';
  if (item?.is_documentary === true) return 'documentary';

  const rawType = String(
    item?.format || item?.kind || item?.subtype || item?.category || item?.media_type || ''
  ).toLowerCase();

  if (rawType.includes('reality')) return 'reality';
  if (rawType.includes('doc')) return 'documentary';

  const textoGeneros = Array.isArray(item?.genres)
    ? item.genres
      .map((g: any) => (typeof g === 'string' ? g : g?.name || ''))
      .join(' ')
      .toLowerCase()
    : String(item?.genres || item?.genre || '').toLowerCase();

  const genreIds: number[] = Array.isArray(item?.genre_ids)
    ? item.genre_ids.map((id: any) => Number(id))
    : [];

  const tituloLower = String(item?.title || item?.name || '').toLowerCase();

  if (
    genreIds.includes(10764) ||
    textoGeneros.includes('reality') ||
    tituloLower.includes('reality')
  ) {
    return 'reality';
  }

  if (
    genreIds.includes(99) ||
    textoGeneros.includes('documental') ||
    textoGeneros.includes('documentary') ||
    tituloLower.includes('documental')
  ) {
    return 'documentary';
  }

  return item?.media_type === 'movie' ? 'movie' : 'tv';
}

async function resolverFormatoConTMDB(
  tmdbId: number,
  mediaType: MediaType,
  itemActual: any
): Promise<FormatoDetallado> {
  const actual = detectarFormatoDetallado(itemActual);
  if (actual === 'reality' || actual === 'documentary') {
    return actual;
  }

  const cacheKey = `${mediaType}-${tmdbId}`;
  if (tmdbFormatCache.has(cacheKey)) {
    return tmdbFormatCache.get(cacheKey)!;
  }

  if (!TMDB_API_KEY) {
    tmdbFormatCache.set(cacheKey, actual);
    return actual;
  }

  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const res = await fetch(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
    );
    if (!res.ok) {
      tmdbFormatCache.set(cacheKey, actual);
      return actual;
    }
    const data = await res.json();
    const genres: Array<{ id?: number; name?: string }> = Array.isArray(data?.genres)
      ? data.genres
      : [];

    const esDoc =
      genres.some((g) => Number(g.id) === 99) ||
      genres.some((g) => /documental|documentary/i.test(String(g.name || '')));

    const esReality =
      genres.some((g) => Number(g.id) === 10764) ||
      genres.some((g) => /reality/i.test(String(g.name || '')));

    const resuelto: FormatoDetallado = esReality
      ? 'reality'
      : esDoc
        ? 'documentary'
        : mediaType === 'movie'
          ? 'movie'
          : 'tv';

    tmdbFormatCache.set(cacheKey, resuelto);
    return resuelto;
  } catch {
    tmdbFormatCache.set(cacheKey, actual);
    return actual;
  }
}

export default function UserProfileModal({
  targetUserId,
  currentUser,
  onClose,
  onSelectMedia,
  onRequireAuth,
  onNotify,
  onGoToComunidad,
}: UserProfileModalProps) {
  const [usuarioActivoId, setUsuarioActivoId] = useState<string>(targetUserId);

  const [perfil, setPerfil] = useState<any>(null);
  const [bioEdit, setBioEdit] = useState('');
  const [editandoBio, setEditandoBio] = useState(false);
  const [mostrarEditarPerfil, setMostrarEditarPerfil] = useState(false);

  const [seriesUsuario, setSeriesUsuario] = useState<any[]>([]);
  const [episodiosUsuario, setEpisodiosUsuario] = useState<any[]>([]);
  const [resenasUsuario, setResenasUsuario] = useState<any[]>([]);
  const [coleccionesPublicas, setColeccionesPublicas] = useState<any[]>([]);
  const [seguidoresCount, setSeguidoresCount] = useState(0);
  const [siguiendoCount, setSiguiendoCount] = useState(0);
  const [loSigo, setLoSigo] = useState(false);

  const [estadoAmistad, setEstadoAmistad] = useState<'none' | 'sent' | 'received' | 'friends'>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  const [misSolicitudes, setMisSolicitudes] = useState<any[]>([]);
  const [misAmigos, setMisAmigos] = useState<any[]>([]);
  const [soloConectados, setSoloConectados] = useState(false);
  const [usuariosConectadosIds, setUsuariosConectadosIds] = useState<Set<string>>(new Set());
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState<Record<string, number>>({});

  const [tabPerfil, setTabPerfil] = useState<'estadisticas' | 'colecciones' | 'amigos' | 'chat'>('estadisticas');

  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [cargando, setCargando] = useState(true);
  const [clonandoColId, setClonandoColId] = useState<string | null>(null);
  const [perfilCopiado, setPerfilCopiado] = useState(false);

  useEffect(() => {
    setUsuarioActivoId(targetUserId);
  }, [targetUserId]);

  const esMiPerfil = currentUser?.id === usuarioActivoId;

  useEffect(() => {
    setTabPerfil('estadisticas');
    cargarTodoPerfil(usuarioActivoId);
  }, [usuarioActivoId, currentUser?.id]);

  // Presencia global en vivo para saber quién está conectado en amigos
  useEffect(() => {
    let activo = true;
    const presenceKey = currentUser?.id
      ? `${currentUser.id}-${Math.random().toString(36).slice(2, 7)}`
      : `anon-${Math.random().toString(36).slice(2, 8)}`;

    const canalPresencia = supabase.channel('plotverse-presencia-global', {
      config: { presence: { key: presenceKey } },
    });

    const actualizarConectados = () => {
      if (!activo) return;
      const state = canalPresencia.presenceState();
      const idsOnline = new Set<string>();
      Object.values(state).forEach((presencias: any) => {
        (presencias || []).forEach((p: any) => {
          if (p?.user_id) idsOnline.add(String(p.user_id));
        });
      });
      setUsuariosConectadosIds(idsOnline);
    };

    canalPresencia
      .on('presence', { event: 'sync' }, actualizarConectados)
      .on('presence', { event: 'join' }, actualizarConectados)
      .on('presence', { event: 'leave' }, actualizarConectados)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && activo && currentUser?.id) {
          await canalPresencia.track({
            user_id: currentUser.id,
            username: perfil?.username || currentUser.email?.split('@')[0] || 'usuario',
            online_at: new Date().toISOString(),
          });
          actualizarConectados();
        }
      });

    return () => {
      activo = false;
      supabase.removeChannel(canalPresencia);
    };
  }, [currentUser?.id, perfil?.username]);

  useEffect(() => {
    if (tabPerfil === 'chat' && currentUser && !esMiPerfil) {
      cargarMensajes(usuarioActivoId);
      const intervalo = setInterval(() => cargarMensajes(usuarioActivoId), 4000);
      return () => clearInterval(intervalo);
    }
  }, [tabPerfil, usuarioActivoId, currentUser?.id, esMiPerfil]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function compartirPerfil() {
    const url = `${window.location.origin}/?user=${usuarioActivoId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Perfil de @${perfil?.username || 'usuario'} en PlotVerse`,
          url,
        });
        return;
      } catch { }
    }
    await navigator.clipboard.writeText(url);
    setPerfilCopiado(true);
    setTimeout(() => setPerfilCopiado(false), 2500);
  }

  async function cargarTodoPerfil(uid: string) {
    setCargando(true);

    const { data: profData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();

    setPerfil(profData || { id: uid, username: 'usuario', bio: '', avatar_url: null });
    setBioEdit(profData?.bio || '');

    const [{ data: uSeries }, { data: epRows }, { data: cRows }] = await Promise.all([
      supabase
        .from('user_series')
        .select('*')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false }),
      supabase
        .from('watched_episodes')
        .select('*')
        .eq('user_id', uid),
      supabase
        .from('comments')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    const ids = Array.from(new Set((uSeries || []).map((u) => Number(u.tmdb_id)).filter(Boolean)));
    const idsSet = new Set(ids);

    const episodiosFiltrados = (epRows || []).filter((e: any) => {
      const tmdbIdNum = Number(e.tmdb_id ?? e.series_id ?? e.media_id);
      return !Number.isNaN(tmdbIdNum) && idsSet.has(tmdbIdNum);
    });
    setEpisodiosUsuario(episodiosFiltrados);

    const cacheMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: cData } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', ids);
      (cData || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c;
      });
    }

    const combinadosBase = (uSeries || []).map((u: any) => {
      const tipo = (u.media_type || 'tv') as MediaType;
      const clave = `${tipo}-${u.tmdb_id}`;
      const cached = cacheMap[clave];
      return {
        ...u,
        media_type: tipo,
        title: cached?.title || 'Título',
        poster_path: cached?.poster_path || null,
        genres: cached?.genres || cached?.genre || cached?.category || u.genres || u.genre || null,
        genre_ids: cached?.genre_ids || u.genre_ids || null,
      };
    });

    const combinadosEnriquecidos = await Promise.all(
      combinadosBase.map(async (item) => {
        const formatoResuelto = await resolverFormatoConTMDB(
          Number(item.tmdb_id),
          item.media_type,
          item
        );
        return {
          ...item,
          formato_resuelto: formatoResuelto,
        };
      })
    );

    setSeriesUsuario(combinadosEnriquecidos);

    const reviewIds = Array.from(
      new Set((cRows || []).map((r: any) => Number(r.tmdb_id)).filter(Boolean))
    );
    const missingReviewIds = reviewIds.filter((rid) => !idsSet.has(rid));
    if (missingReviewIds.length > 0) {
      const { data: extraCache } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', missingReviewIds);
      (extraCache || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c;
      });
    }

    setResenasUsuario(
      (cRows || []).map((r: any) => {
        const tipo = (r.media_type || 'tv') as MediaType;
        const clave = `${tipo}-${r.tmdb_id}`;
        const cached = cacheMap[clave];
        return {
          ...r,
          media_type: tipo,
          mediaTitle: cached?.title || null,
          poster_path: cached?.poster_path || null,
        };
      })
    );

    const { data: cols } = await supabase
      .from('user_collections')
      .select('*')
      .eq('user_id', uid)
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
          cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = c;
        });
      }

      setColeccionesPublicas(
        cols.map((col: any) => ({
          ...col,
          items: (cItems || [])
            .filter((ci) => ci.collection_id === col.id)
            .map((ci) => {
              const clave = `${ci.media_type || 'tv'}-${ci.tmdb_id}`;
              const cached = cacheMap[clave];
              return {
                tmdb_id: ci.tmdb_id,
                media_type: (ci.media_type || 'tv') as MediaType,
                title: cached?.title || 'Título',
                poster_path: cached?.poster_path || null,
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
      .eq('following_id', uid);
    setSeguidoresCount(segCount || 0);

    const { count: sigCount } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', uid);
    setSiguiendoCount(sigCount || 0);

    const esPerfilPropio = currentUser?.id === uid;

    if (currentUser && esPerfilPropio) {
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
          .select('id, username, bio, avatar_url')
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
    } else if (currentUser && !esPerfilPropio) {
      setMisSolicitudes([]);
      setMisAmigos([]);
      setMensajesNoLeidos({});

      const { data: followRow } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', uid)
        .maybeSingle();
      setLoSigo(!!followRow);

      const { data: friendRow } = await supabase
        .from('friendships')
        .select('*')
        .or(
          `and(requester_id.eq.${currentUser.id},addressee_id.eq.${uid}),and(requester_id.eq.${uid},addressee_id.eq.${currentUser.id})`
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
    cargarTodoPerfil(usuarioActivoId);
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
        .eq('following_id', usuarioActivoId);
    } else {
      setLoSigo(true);
      setSeguidoresCount((c) => c + 1);
      await supabase.from('follows').insert({
        follower_id: currentUser.id,
        following_id: usuarioActivoId,
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
          addressee_id: usuarioActivoId,
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
    onNotify?.('Biografía actualizada');
  }

  async function cargarMensajes(uid: string) {
    if (!currentUser) return;
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true });

    setMensajes(data || []);

    await supabase
      .from('direct_messages')
      .update({ read: true })
      .eq('sender_id', uid)
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
        receiver_id: usuarioActivoId,
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
    onNotify?.(`Colección "${col.name}" guardada en tu biblioteca`);
  }

  const amigosConectadosCount = useMemo(() => {
    return misAmigos.filter((am) => usuariosConectadosIds.has(String(am.id))).length;
  }, [misAmigos, usuariosConectadosIds]);

  const amigosVisibles = useMemo(() => {
    if (!soloConectados) return misAmigos;
    return misAmigos.filter((am) => usuariosConectadosIds.has(String(am.id)));
  }, [misAmigos, soloConectados, usuariosConectadosIds]);

  const formatosConteo = useMemo(() => {
    let series = 0;
    let pelis = 0;
    let realities = 0;
    let documentales = 0;

    seriesUsuario.forEach((item) => {
      const fmt: FormatoDetallado =
        item?.formato_resuelto || detectarFormatoDetallado(item);
      if (fmt === 'reality') realities += 1;
      else if (fmt === 'documentary') documentales += 1;
      else if (fmt === 'movie') pelis += 1;
      else series += 1;
    });

    return { series, pelis, realities, documentales };
  }, [seriesUsuario]);

  const totalTitulos = seriesUsuario.length;
  const totalSeries = formatosConteo.series;
  const totalPelis = formatosConteo.pelis;
  const totalRealities = formatosConteo.realities;
  const totalDocumentales = formatosConteo.documentales;

  const viendoCount = seriesUsuario.filter((s) => s.status === 'watching').length;
  const completadosCount = seriesUsuario.filter((s) => s.status === 'completed').length;
  const pendientesCount = seriesUsuario.filter((s) => s.status === 'watchlist').length;
  const abandonadosCount = seriesUsuario.filter((s) => s.status === 'dropped').length;

  const totalVisionados = useMemo(() => {
    return seriesUsuario.reduce((acc, item) => {
      const veces = Number(item?.rewatch_count || 0);
      if (veces > 0) return acc + veces;
      return acc + (item?.status === 'completed' ? 1 : 0);
    }, 0);
  }, [seriesUsuario]);

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

  const segmentosDonutFormato = useMemo(() => {
    return [
      { key: 'tv', label: 'Series', count: totalSeries, color: '#6366f1' },
      { key: 'movie', label: 'Películas', count: totalPelis, color: '#f43f5e' },
      { key: 'reality', label: 'Realities', count: totalRealities, color: '#f59e0b' },
      { key: 'documentary', label: 'Documentales', count: totalDocumentales, color: '#06b6d4' },
    ];
  }, [totalSeries, totalPelis, totalRealities, totalDocumentales]);

  const sumaDonutFormato = segmentosDonutFormato.reduce(
    (acc, item) => acc + Math.max(0, item.count),
    0
  );

  const barrasEstado = useMemo(() => {
    return [
      { key: 'watching', label: 'Viendo', value: viendoCount, barClass: 'bg-indigo-500' },
      { key: 'completed', label: 'Vistas', value: completadosCount, barClass: 'bg-emerald-500' },
      { key: 'watchlist', label: 'Pendientes', value: pendientesCount, barClass: 'bg-amber-400' },
      { key: 'dropped', label: 'Abandonadas', value: abandonadosCount, barClass: 'bg-rose-500' },
    ];
  }, [viendoCount, completadosCount, pendientesCount, abandonadosCount]);

  const maxBarraEstado = Math.max(1, ...barrasEstado.map((b) => Math.max(0, b.value)));

  const distribucionEstrellas = useMemo(() => {
    return [5, 4, 3, 2, 1].map((estrella) => {
      const cantidad = notasParaGrafico.filter((n) => Math.round(n) === estrella).length;
      const pct =
        notasParaGrafico.length > 0 ? Math.round((cantidad / notasParaGrafico.length) * 100) : 0;
      return { estrella, cantidad, pct };
    });
  }, [notasParaGrafico]);

  const modaEstrella = useMemo(() => {
    if (notasParaGrafico.length === 0) return null;
    let mejor: number | null = null;
    let maxCant = 0;
    distribucionEstrellas.forEach((d) => {
      if (d.cantidad > maxCant) {
        maxCant = d.cantidad;
        mejor = d.estrella;
      }
    });
    return mejor;
  }, [distribucionEstrellas, notasParaGrafico.length]);

  const maxEstrella = Math.max(1, ...distribucionEstrellas.map((d) => d.cantidad));

  const totalNoLeidos = Object.values(mensajesNoLeidos).reduce((a, b) => a + b, 0);
  const badgeAmigos = misSolicitudes.length + totalNoLeidos;
  const perfilEstaConectado = usuariosConectadosIds.has(String(usuarioActivoId));

  const radioDonut = 30;
  const circunferenciaDonut = 2 * Math.PI * radioDonut;
  let acumuladoDonut = 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800/90 bg-slate-950 shadow-2xl">
      <div className="border-b border-slate-800/90 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/45 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (currentUser && !esMiPerfil) {
                  setUsuarioActivoId(currentUser.id);
                } else {
                  onClose();
                }
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-indigo-400 hover:bg-slate-800 hover:text-white"
              title={currentUser && !esMiPerfil ? 'Volver a mi perfil' : 'Volver'}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="relative shrink-0">
              {perfil?.avatar_url ? (
                <img
                  src={perfil.avatar_url}
                  alt={perfil?.username || 'Avatar'}
                  className="h-16 w-16 rounded-2xl border border-indigo-400/40 object-cover shadow-lg shadow-indigo-600/30"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-400/40 bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold uppercase text-white shadow-lg shadow-indigo-600/30">
                  {(perfil?.username || 'U')[0]}
                </div>
              )}
              {perfilEstaConectado && (
                <span
                  title="Conectado ahora"
                  className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-950 bg-emerald-400"
                />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-white">@{perfil?.username || 'usuario'}</h2>
                {perfilEstaConectado && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    En línea
                  </span>
                )}
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
                  <button
                    type="button"
                    onClick={() => {
                      setBioEdit(perfil?.bio || '');
                      setEditandoBio(false);
                    }}
                    className="rounded-xl border border-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
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
            {esMiPerfil && (
              <>
                <button
                  type="button"
                  onClick={() => setMostrarEditarPerfil(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-[0.98]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Cambiar foto y nick
                </button>

                {onGoToComunidad && (
                  <button
                    type="button"
                    onClick={onGoToComunidad}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-indigo-400 hover:bg-slate-800 hover:text-white active:scale-[0.98]"
                  >
                    <Users className="h-3.5 w-3.5 text-indigo-400" />
                    Grupos de amigos
                  </button>
                )}
              </>
            )}

            {!esMiPerfil && (
              <>
                <button
                  type="button"
                  onClick={toggleSeguir}
                  className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${loSigo
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
                  className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition active:scale-[0.98] ${estadoAmistad === 'friends'
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
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTabPerfil('estadisticas')}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${tabPerfil === 'estadisticas'
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
            className={`rounded-xl border px-4 py-1.5 text-xs font-bold transition ${tabPerfil === 'colecciones'
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
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${tabPerfil === 'amigos'
                ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
            >
              <Users className="h-3.5 w-3.5" />
              Amigos ({amigosConectadosCount}/{misAmigos.length} en línea)
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
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-xs font-bold transition ${tabPerfil === 'chat'
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

      <div className="p-5 sm:p-6">
        {cargando ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando perfil...</div>
        ) : tabPerfil === 'amigos' && esMiPerfil ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <Wifi className="h-3.5 w-3.5" />
                {amigosConectadosCount} {amigosConectadosCount === 1 ? 'amigo conectado' : 'amigos conectados'} ahora
              </span>
              <button
                type="button"
                onClick={() => setSoloConectados(!soloConectados)}
                className={`rounded-xl border px-3 py-1 text-[11px] font-bold transition ${
                  soloConectados
                    ? 'border-emerald-400/50 bg-emerald-600/20 text-emerald-200'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
                }`}
              >
                {soloConectados ? 'Ver todos los amigos' : 'Solo conectados'}
              </button>
            </div>

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
                      <button
                        type="button"
                        onClick={() => setUsuarioActivoId(sol.sender.id)}
                        className="text-xs font-bold text-indigo-300 hover:underline"
                      >
                        @{sol.sender.username}
                      </button>
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

            {amigosVisibles.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
                <p className="text-xs text-slate-400">
                  {soloConectados
                    ? 'No hay amigos conectados en este momento.'
                    : 'Aún no tienes amigos agregados. Explora la pestaña Comunidad para buscar usuarios y enviarles solicitud.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {amigosVisibles.map((am) => {
                  const sinLeer = mensajesNoLeidos[am.id] || 0;
                  const estaOnline = usuariosConectadosIds.has(String(am.id));
                  return (
                    <button
                      key={am.id}
                      type="button"
                      onClick={() => setUsuarioActivoId(am.id)}
                      className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 text-left transition hover:border-indigo-500/50"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="relative shrink-0">
                          {am.avatar_url ? (
                            <img
                              src={am.avatar_url}
                              alt={am.username || 'Amigo'}
                              className="h-9 w-9 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/25 text-xs font-bold uppercase text-indigo-200">
                              {(am.username || 'A')[0]}
                            </div>
                          )}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-slate-900 ${
                              estaOnline ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                        </div>
                        <div className="truncate">
                          <p className="truncate text-xs font-bold text-white">@{am.username}</p>
                          <p className="truncate text-[11px] text-slate-400">
                            {estaOnline ? 'Conectado ahora' : am.bio || 'Amigo en PlotVerse'}
                          </p>
                        </div>
                      </div>

                      {sinLeer > 0 && (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          {sinLeer}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : tabPerfil === 'chat' && !esMiPerfil ? (
          <div className="flex h-[420px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
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
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs font-medium ${mio
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
                        onClick={() =>
                          onSelectMedia({
                            id: it.tmdb_id,
                            media_type: it.media_type,
                            name: it.title,
                            overview: '',
                            poster_path: it.poster_path,
                            backdrop_path: null,
                            first_air_date: '',
                            vote_average: 0,
                          })
                        }
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
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <p className="text-[11px] font-semibold text-slate-400">Títulos</p>
                <p className="mt-1 text-2xl font-extrabold text-white">{totalTitulos}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {totalVisionados} {totalVisionados === 1 ? 'visionado' : 'visionados'}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <p className="text-[11px] font-semibold text-slate-400">Viendo ahora</p>
                <p className="mt-1 text-2xl font-extrabold text-indigo-400">{viendoCount}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">En progreso</p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <p className="text-[11px] font-semibold text-slate-400">Terminadas / Vistas</p>
                <p className="mt-1 text-2xl font-extrabold text-emerald-400">{completadosCount}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{pendientesCount} pendientes</p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
                <p className="text-[11px] font-semibold text-slate-400">Nota media</p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-extrabold text-amber-400">
                  {Number(notaMedia) > 0 && (
                    <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  )}
                  {Number(notaMedia) > 0 ? notaMedia : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {notasParaGrafico.length}{' '}
                  {notasParaGrafico.length === 1 ? 'valoración' : 'valoraciones'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Formato y estados
                  </h4>
                  <span className="text-[11px] font-medium text-slate-400">
                    {totalTitulos} {totalTitulos === 1 ? 'título' : 'títulos'}
                  </span>
                </div>

                {/* Donut de formato + leyenda compacta */}
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 shrink-0">
                    <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
                      <circle
                        cx="38"
                        cy="38"
                        r={radioDonut}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="9"
                      />
                      {sumaDonutFormato > 0 &&
                        segmentosDonutFormato.map((item) => {
                          const val = Math.max(0, item.count);
                          if (val === 0) return null;
                          const longitud = (val / sumaDonutFormato) * circunferenciaDonut;
                          const offset = -acumuladoDonut;
                          acumuladoDonut += longitud;

                          return (
                            <circle
                              key={item.key}
                              cx="38"
                              cy="38"
                              r={radioDonut}
                              fill="none"
                              stroke={item.color}
                              strokeWidth="9"
                              strokeDasharray={`${longitud} ${circunferenciaDonut}`}
                              strokeDashoffset={offset}
                              strokeLinecap="round"
                            />
                          );
                        })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-extrabold leading-none text-white">
                        {totalTitulos}
                      </span>
                      <span className="mt-0.5 text-[9px] text-slate-400">títulos</span>
                    </div>
                  </div>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                    {segmentosDonutFormato.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/75 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="font-bold text-white">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Barras finas redondeadas de estado (solo número a la derecha) */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  {barrasEstado.map((est) => {
                    const val = Math.max(0, est.value);
                    const pct = Math.round((val / maxBarraEstado) * 100);
                    return (
                      <div key={est.key} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-slate-300">{est.label}</span>
                          <span className="font-bold text-white">{val}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${est.barClass}`}
                            style={{ width: `${val > 0 ? Math.max(pct, 8) : 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    Puntuaciones
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {modaEstrella && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                        Moda: {modaEstrella}★
                      </span>
                    )}
                    <span>
                      {notasParaGrafico.length}{' '}
                      {notasParaGrafico.length === 1 ? 'nota' : 'notas'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {distribucionEstrellas.map((fila) => {
                    const ancho =
                      fila.cantidad > 0
                        ? Math.max(8, Math.round((fila.cantidad / maxEstrella) * 100))
                        : 0;
                    return (
                      <div key={fila.estrella} className="flex items-center gap-2.5 text-xs">
                        <span className="w-8 text-right font-bold text-amber-300">
                          {fila.estrella}★
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-950">
                          {fila.cantidad > 0 && (
                            <div
                              style={{ width: `${ancho}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-300"
                            />
                          )}
                        </div>
                        <span className="w-16 text-right font-bold text-slate-300">
                          {fila.cantidad}{' '}
                          <span className="text-[10px] text-slate-500">({fila.pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {seriesUsuario.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Fechas y veces vista
                  </h4>
                  <span className="text-[11px] font-semibold text-indigo-300">
                    {totalVisionados}{' '}
                    {totalVisionados === 1 ? 'visionado total' : 'visionados totales'}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {seriesUsuario.slice(0, 8).map((item) => {
                    const fmt = item?.formato_resuelto || detectarFormatoDetallado(item);
                    const etiquetaFormato =
                      fmt === 'reality'
                        ? 'Reality'
                        : fmt === 'documentary'
                          ? 'Documental'
                          : fmt === 'movie'
                            ? 'Película'
                            : 'Serie';

                    const veces = Number(item?.rewatch_count ?? 0);
                    const inicioFormateado = formatearFechaES(item.started_at);
                    const finFormateado = formatearFechaES(item.finished_at);
                    const textoFechas = [
                      inicioFormateado ? `Inicio: ${inicioFormateado}` : null,
                      finFormateado
                        ? `Fin: ${finFormateado}`
                        : item.status === 'watching'
                          ? 'En curso'
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <div
                        key={`${item.media_type}-${item.tmdb_id}`}
                        onClick={() =>
                          onSelectMedia({
                            id: item.tmdb_id,
                            media_type: item.media_type,
                            name: item.title,
                            overview: '',
                            poster_path: item.poster_path || null,
                            backdrop_path: null,
                            first_air_date: '',
                            vote_average: 0,
                          })
                        }
                        className="flex cursor-pointer flex-col justify-between gap-2 py-2.5 text-xs transition hover:bg-slate-900/50 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">{item.title}</p>
                          <p className="text-[11px] text-slate-400">
                            {etiquetaFormato}
                            {textoFechas ? ` · ${textoFechas}` : ' · Sin fechas registradas'}
                          </p>
                        </div>

                        <span className="w-fit shrink-0 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-bold text-indigo-200">
                          {veces} {veces === 1 ? 'vez' : 'veces'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {resenasUsuario.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                  Reseñas recientes ({resenasUsuario.length})
                </h4>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {resenasUsuario.map((rev) => (
                    <div
                      key={rev.id}
                      onClick={() =>
                        onSelectMedia({
                          id: rev.tmdb_id,
                          media_type: rev.media_type,
                          name: rev.mediaTitle || 'Título',
                          overview: '',
                          poster_path: rev.poster_path || null,
                          backdrop_path: null,
                          first_air_date: '',
                          vote_average: 0,
                        })
                      }
                      className="cursor-pointer rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 transition hover:border-indigo-500/40"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-bold text-indigo-300">
                          {rev.mediaTitle ||
                            `${rev.media_type === 'movie' ? 'Película' : 'Serie'} #${rev.tmdb_id}`}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {Number(rev.rating || 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                              {rev.rating}/5
                            </span>
                          )}
                          <span className="text-slate-500">
                            {new Date(rev.created_at).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-200">
                        {rev.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {mostrarEditarPerfil && currentUser && (
        <EditarPerfilModal
          userId={currentUser.id}
          currentUsername={perfil?.username || ''}
          currentAvatarUrl={perfil?.avatar_url || null}
          onClose={() => setMostrarEditarPerfil(false)}
          onSaved={(nuevoNick, nuevaFoto) => {
            setPerfil((prev: any) => ({
              ...prev,
              username: nuevoNick,
              avatar_url: nuevaFoto,
            }));
            onNotify?.('Perfil actualizado');
          }}
        />
      )}
    </div>
  );
}