'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getPosterUrl } from '@/lib/tmdb';
import { evaluarLenguaje } from '@/lib/filtroLenguaje';
import {
  Users, UserPlus, Check, X, MessageSquare,
  Search, Star, Flame, Plus, Send, Trash2, UserMinus,
  ListVideo, Dices, Sparkles, Eye, CheckCircle2, Clock
} from 'lucide-react';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

interface ComunidadFeedProps {
  user: any;
  onSelectSerie: (serie: any) => void;
  onSelectUser: (userId: string) => void;
  onRequireAuth: () => void;
}

type TipoReaccion = 'fire' | 'heart' | 'eyes';
type EstadoWatchlistGrupo = 'pending' | 'watching' | 'completed';

interface MiembroGrupo {
  id: string;
  username: string;
}

interface GrupoAmigo {
  id: string;
  name: string;
  created_by: string;
  memberIds: string[];
  members: MiembroGrupo[];
}

interface InvitacionGrupo {
  id: string;
  group_id: string;
  group_name: string;
  inviter_id: string;
  inviter_username: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
}

interface ItemWatchlistGrupo {
  id: string;
  group_id: string;
  added_by: string;
  added_by_username: string;
  tmdb_id: number;
  media_type: 'tv' | 'movie';
  title: string;
  poster_path: string | null;
  vote_average: number;
  status: EstadoWatchlistGrupo;
  note?: string | null;
  created_at: string;
}

interface ResultadoBusquedaTMDB {
  id: number;
  media_type: 'tv' | 'movie';
  title: string;
  year: string;
  poster_path: string | null;
  vote_average: number;
}

const OPCIONES_REACCION: { key: TipoReaccion; emoji: string; label: string }[] = [
  { key: 'fire', emoji: '🔥', label: 'Top' },
  { key: 'heart', emoji: '❤️', label: 'Me encanta' },
  { key: 'eyes', emoji: '👀', label: 'Qué ganas' },
];

export default function ComunidadFeed({
  user,
  onSelectSerie,
  onSelectUser,
  onRequireAuth,
}: ComunidadFeedProps) {
  const [actividad, setActividad] = useState<any[]>([]);
  const [mostrarTodoFeed, setMostrarTodoFeed] = useState(false);
  const [tabComunidad, setTabComunidad] = useState<'actividad' | 'amigos' | 'grupos'>('actividad');
  const [filtroAmigoId, setFiltroAmigoId] = useState<string>('all');

  const [reaccionesMap, setReaccionesMap] = useState<
    Record<string, { counts: Record<TipoReaccion, number>; mia?: TipoReaccion }>
  >({});

  const [usuariosBusqueda, setUsuariosBusqueda] = useState<any[]>([]);
  const [busquedaUser, setBusquedaUser] = useState('');

  const [solicitudesEntrantes, setSolicitudesEntrantes] = useState<any[]>([]);
  const [amigos, setAmigos] = useState<any[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(true);

  const [grupos, setGrupos] = useState<GrupoAmigo[]>([]);
  const [grupoActivoId, setGrupoActivoId] = useState<string | null>(null);
  const [vistaGrupo, setVistaGrupo] = useState<'chat' | 'watchlist'>('chat');
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [miembrosSeleccionados, setMiembrosSeleccionados] = useState<string[]>([]);
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [eliminandoGrupo, setEliminandoGrupo] = useState(false);
  const [invitacionesRecibidas, setInvitacionesRecibidas] = useState<InvitacionGrupo[]>([]);
  const [invitacionesEnviadasGrupo, setInvitacionesEnviadasGrupo] = useState<string[]>([]);
  const [procesandoMiembroId, setProcesandoMiembroId] = useState<string | null>(null);
  const [avisoGrupo, setAvisoGrupo] = useState<string | null>(null);
  const [mensajesGrupo, setMensajesGrupo] = useState<any[]>([]);
  const [textoGrupo, setTextoGrupo] = useState('');
  const [enviandoGrupo, setEnviandoGrupo] = useState(false);
  const [eliminandoGrupoMsgId, setEliminandoGrupoMsgId] = useState<string | null>(null);
  const chatGrupoEndRef = useRef<HTMLDivElement | null>(null);

  // Estado de "Para ver juntos" en el grupo
  const [watchlistGrupo, setWatchlistGrupo] = useState<ItemWatchlistGrupo[]>([]);
  const [filtroWatchlistGrupo, setFiltroWatchlistGrupo] = useState<'all' | EstadoWatchlistGrupo>('all');
  const [queryTituloGrupo, setQueryTituloGrupo] = useState('');
  const [notaTituloGrupo, setNotaTituloGrupo] = useState('');
  const [resultadosTituloTMDB, setResultadosTituloTMDB] = useState<ResultadoBusquedaTMDB[]>([]);
  const [buscandoTituloTMDB, setBuscandoTituloTMDB] = useState(false);
  const [anadiendoTituloId, setAnadiendoTituloId] = useState<string | null>(null);
  const [actualizandoItemId, setActualizandoItemId] = useState<string | null>(null);
  const [ganadorGrupo, setGanadorGrupo] = useState<ItemWatchlistGrupo | null>(null);
  const [sorteandoGrupo, setSorteandoGrupo] = useState(false);

  useEffect(() => {
    cargarComunidad();
  }, [user?.id]);

  // Presencia en tiempo real para el indicador verde de amigos conectados
  useEffect(() => {
    if (!user?.id) {
      setOnlineUserIds(new Set());
      return;
    }

    let activo = true;
    const canalPresencia = supabase.channel('plotverse-online-users', {
      config: { presence: { key: user.id } },
    });

    const actualizarConectados = () => {
      if (!activo) return;
      const state = canalPresencia.presenceState();
      setOnlineUserIds(new Set(Object.keys(state)));
    };

    canalPresencia
      .on('presence', { event: 'sync' }, actualizarConectados)
      .on('presence', { event: 'join' }, actualizarConectados)
      .on('presence', { event: 'leave' }, actualizarConectados)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && activo) {
          await canalPresencia.track({
            user_id: user.id,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'usuario',
            online_at: new Date().toISOString(),
          });
          actualizarConectados();
        }
      });

    return () => {
      activo = false;
      supabase.removeChannel(canalPresencia);
    };
  }, [user?.id]);

  // Sincronización Realtime de invitaciones y membresías de grupos
  useEffect(() => {
    if (!user?.id) return;

    const canalGruposSync = supabase
      .channel(`grupos-sync-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_group_invitations',
        },
        () => {
          cargarGruposUsuario(user.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_group_members',
        },
        () => {
          cargarGruposUsuario(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalGruposSync);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !grupoActivoId) {
      setInvitacionesEnviadasGrupo([]);
      return;
    }

    let activo = true;
    async function cargarInvitacionesEnviadas() {
      const { data } = await supabase
        .from('friend_group_invitations')
        .select('invitee_id')
        .eq('group_id', grupoActivoId)
        .eq('status', 'pending');

      if (activo) {
        setInvitacionesEnviadasGrupo((data || []).map((d: any) => d.invitee_id));
      }
    }

    cargarInvitacionesEnviadas();
    return () => {
      activo = false;
    };
  }, [user?.id, grupoActivoId]);

  // Cargar y sincronizar en tiempo real la lista "Para ver juntos" del grupo activo
  useEffect(() => {
    setGanadorGrupo(null);
    setResultadosTituloTMDB([]);
    setQueryTituloGrupo('');
    setNotaTituloGrupo('');

    if (!user || !grupoActivoId) {
      setWatchlistGrupo([]);
      return;
    }

    let activo = true;

    async function cargarWatchlistGrupo() {
      const { data, error } = await supabase
        .from('friend_group_watchlist')
        .select('id, group_id, added_by, tmdb_id, media_type, title, poster_path, vote_average, status, note, created_at')
        .eq('group_id', grupoActivoId)
        .order('created_at', { ascending: false });

      if (!activo) return;
      if (error) {
        console.error('Error cargando watchlist del grupo:', error);
        setWatchlistGrupo([]);
        return;
      }

      const rows = data || [];
      const autoresIds = Array.from(new Set(rows.map((r: any) => r.added_by).filter(Boolean)));
      const nombresMap: Record<string, string> = {};

      if (autoresIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', autoresIds);
        (profs || []).forEach((p: any) => {
          nombresMap[p.id] = p.username || 'usuario';
        });
      }

      setWatchlistGrupo(
        rows.map((r: any) => ({
          ...r,
          media_type: r.media_type === 'movie' ? 'movie' : 'tv',
          vote_average: Number(r.vote_average || 0),
          status: (r.status || 'pending') as EstadoWatchlistGrupo,
          added_by_username:
            r.added_by === user.id
              ? user.user_metadata?.username || user.email?.split('@')[0] || 'tú'
              : nombresMap[r.added_by] || 'usuario',
        }))
      );
    }

    cargarWatchlistGrupo();

    const canalWatchlist = supabase
      .channel(`grupo-watchlist-${grupoActivoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_group_watchlist',
          filter: `group_id=eq.${grupoActivoId}`,
        },
        () => {
          if (activo) cargarWatchlistGrupo();
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canalWatchlist);
    };
  }, [user?.id, grupoActivoId]);

  // Búsqueda en TMDB para añadir títulos a "Para ver juntos"
  useEffect(() => {
    const q = queryTituloGrupo.trim();
    if (!q || !TMDB_API_KEY) {
      setResultadosTituloTMDB([]);
      setBuscandoTituloTMDB(false);
      return;
    }

    let activo = true;
    setBuscandoTituloTMDB(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
            q
          )}&page=1`
        );
        const data = await res.json();
        if (!activo) return;

        const filtrados: ResultadoBusquedaTMDB[] = (data.results || [])
          .filter((item: any) => item.media_type === 'tv' || item.media_type === 'movie')
          .slice(0, 6)
          .map((item: any) => ({
            id: item.id,
            media_type: item.media_type === 'movie' ? 'movie' : 'tv',
            title: item.title || item.name || 'Título',
            year: (item.release_date || item.first_air_date || '').slice(0, 4),
            poster_path: item.poster_path || null,
            vote_average: Number(item.vote_average || 0),
          }));

        setResultadosTituloTMDB(filtrados);
      } catch (err) {
        console.error('Error buscando en TMDB para el grupo:', err);
      } finally {
        if (activo) setBuscandoTituloTMDB(false);
      }
    }, 300);

    return () => {
      activo = false;
      clearTimeout(timer);
    };
  }, [queryTituloGrupo]);

  useEffect(() => {
    if (!user || !grupoActivoId) {
      setMensajesGrupo([]);
      return;
    }

    let activo = true;

    async function cargarMensajesGrupo() {
      const { data } = await supabase
        .from('friend_group_messages')
        .select('id, group_id, user_id, content, created_at')
        .eq('group_id', grupoActivoId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!activo) return;
      const rows = data || [];
      const uIds = Array.from(new Set(rows.map((r: any) => r.user_id)));
      const nombresMap: Record<string, string> = {};

      if (uIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', uIds);
        (profs || []).forEach((p: any) => {
          nombresMap[p.id] = p.username;
        });
      }

      setMensajesGrupo(
        rows.map((r: any) => ({
          ...r,
          username: nombresMap[r.user_id] || 'usuario',
        }))
      );
    }

    cargarMensajesGrupo();

    const canalGrupo = supabase
      .channel(`grupo-chat-${grupoActivoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_group_messages',
          filter: `group_id=eq.${grupoActivoId}`,
        },
        async (payload: any) => {
          const nuevo = payload.new;
          if (!nuevo) return;

          let autor = 'usuario';
          if (nuevo.user_id === user.id) {
            autor = user.user_metadata?.username || user.email?.split('@')[0] || 'tú';
          } else {
            const { data: prof } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', nuevo.user_id)
              .single();
            if (prof?.username) autor = prof.username;
          }

          if (!activo) return;
          setMensajesGrupo((prev) => {
            if (prev.some((m) => m.id === nuevo.id)) return prev;
            return [...prev, { ...nuevo, username: autor }];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'friend_group_messages',
          filter: `group_id=eq.${grupoActivoId}`,
        },
        (payload: any) => {
          if (!activo || !payload.old?.id) return;
          setMensajesGrupo((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canalGrupo);
    };
  }, [user?.id, grupoActivoId]);

  useEffect(() => {
    if (vistaGrupo === 'chat') {
      chatGrupoEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajesGrupo.length, vistaGrupo]);

  async function cargarGruposUsuario(userId: string, listaAmigosRef: any[] = amigos) {
    const [{ data: groupsRows }, { data: membersRows }, { data: invRows }] = await Promise.all([
      supabase
        .from('friend_groups')
        .select('id, name, created_by')
        .order('created_at', { ascending: false }),
      supabase.from('friend_group_members').select('group_id, user_id'),
      supabase
        .from('friend_group_invitations')
        .select('id, group_id, inviter_id, invitee_id, status')
        .eq('invitee_id', userId)
        .eq('status', 'pending'),
    ]);

    const gruposMapNombres: Record<string, string> = {};
    (groupsRows || []).forEach((g: any) => {
      gruposMapNombres[g.id] = g.name;
    });

    const todosMiembrosIds = Array.from(
      new Set([
        ...(membersRows || []).map((m: any) => m.user_id).filter(Boolean),
        ...(invRows || []).map((i: any) => i.inviter_id).filter(Boolean),
      ])
    );
    if (userId && !todosMiembrosIds.includes(userId)) {
      todosMiembrosIds.push(userId);
    }

    const nombresMap: Record<string, string> = {};
    if (todosMiembrosIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', todosMiembrosIds);
      (profs || []).forEach((p: any) => {
        nombresMap[p.id] = p.username || 'usuario';
      });
    }

    const amigoNombreMap: Record<string, string> = {};
    (listaAmigosRef || []).forEach((a: any) => {
      if (a?.id) amigoNombreMap[a.id] = a.username || 'usuario';
    });

    const gruposFormateados: GrupoAmigo[] = (groupsRows || []).map((g: any) => {
      const idsDelGrupo = Array.from(
        new Set(
          (membersRows || [])
            .filter((m: any) => m.group_id === g.id)
            .map((m: any) => m.user_id)
            .filter(Boolean)
        )
      );

      const listaMiembros: MiembroGrupo[] = idsDelGrupo.map((uid: string) => ({
        id: uid,
        username:
          nombresMap[uid] ||
          amigoNombreMap[uid] ||
          (uid === userId
            ? user?.user_metadata?.username || user?.email?.split('@')[0] || 'tú'
            : 'usuario'),
      }));

      return {
        id: g.id,
        name: g.name,
        created_by: g.created_by,
        memberIds: idsDelGrupo,
        members: listaMiembros,
      };
    });

    setGrupos(gruposFormateados);
    if (gruposFormateados.length > 0) {
      setGrupoActivoId((prev) =>
        prev && gruposFormateados.some((g) => g.id === prev) ? prev : gruposFormateados[0].id
      );
    } else {
      setGrupoActivoId(null);
    }

    setInvitacionesRecibidas(
      (invRows || []).map((inv: any) => ({
        id: inv.id,
        group_id: inv.group_id,
        group_name: gruposMapNombres[inv.group_id] || 'Grupo',
        inviter_id: inv.inviter_id,
        inviter_username:
          nombresMap[inv.inviter_id] || amigoNombreMap[inv.inviter_id] || 'usuario',
        invitee_id: inv.invitee_id,
        status: inv.status,
      }))
    );
  }

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

    if (userIds.length > 0 && tmdbIds.length > 0) {
      const { data: reacts } = await supabase
        .from('activity_reactions')
        .select('*')
        .in('activity_user_id', userIds)
        .in('tmdb_id', tmdbIds);

      const mapaR: Record<string, { counts: Record<TipoReaccion, number>; mia?: TipoReaccion }> = {};
      (reacts || []).forEach((r: any) => {
        const key = `${r.activity_user_id}-${r.media_type || 'tv'}-${r.tmdb_id}`;
        if (!mapaR[key]) {
          mapaR[key] = { counts: { fire: 0, heart: 0, eyes: 0 } };
        }
        const tipo = r.reaction as TipoReaccion;
        if (mapaR[key].counts[tipo] !== undefined) {
          mapaR[key].counts[tipo] += 1;
        }
        if (user?.id && r.reactor_user_id === user.id) {
          mapaR[key].mia = tipo;
        }
      });
      setReaccionesMap(mapaR);
    } else {
      setReaccionesMap({});
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

      const listaAmigosCalculada = aceptadas.map((a) => {
        const friendId = a.requester_id === user.id ? a.addressee_id : a.requester_id;
        return {
          friendshipId: a.id,
          ...(socialMap[friendId] || { id: friendId, username: 'usuario' }),
        };
      });
      setAmigos(listaAmigosCalculada);

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

      await cargarGruposUsuario(user.id, listaAmigosCalculada);
    } else {
      setSolicitudesEntrantes([]);
      setAmigos([]);
      setMensajesNoLeidos({});
      setGrupos([]);
      setGrupoActivoId(null);
      setInvitacionesRecibidas([]);
    }

    setCargando(false);
  }

  function toggleSeleccionMiembro(amigoId: string) {
    setMiembrosSeleccionados((prev) =>
      prev.includes(amigoId) ? prev.filter((id) => id !== amigoId) : [...prev, amigoId]
    );
  }

  async function handleCrearGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    const nombreLimpio = nombreGrupo.trim();
    if (!nombreLimpio || creandoGrupo) return;

    setAvisoGrupo(null);
    setCreandoGrupo(true);

    const { data: nuevoGrupo, error } = await supabase
      .from('friend_groups')
      .insert({
        name: nombreLimpio,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !nuevoGrupo) {
      console.error('Error creando grupo:', error);
      setAvisoGrupo(
        error?.message ||
        'No se pudo crear el grupo. Revisa la tabla friend_groups y sus políticas RLS.'
      );
      setCreandoGrupo(false);
      return;
    }

    const { error: errorCreador } = await supabase
      .from('friend_group_members')
      .insert({
        group_id: nuevoGrupo.id,
        user_id: user.id,
      });

    if (errorCreador) {
      console.error('Error añadiendo creador al grupo:', errorCreador);
      setAvisoGrupo(errorCreador.message || 'No se pudo registrar tu membresía en el grupo.');
      setCreandoGrupo(false);
      return;
    }

    if (miembrosSeleccionados.length > 0) {
      const { error: errorInv } = await supabase
        .from('friend_group_invitations')
        .upsert(
          miembrosSeleccionados.map((uid) => ({
            group_id: nuevoGrupo.id,
            inviter_id: user.id,
            invitee_id: uid,
            status: 'pending',
          })),
          { onConflict: 'group_id,invitee_id' }
        );

      if (errorInv) {
        console.error('Error enviando invitaciones de grupo:', errorInv);
        setAvisoGrupo('Grupo creado, pero falló el envío de alguna invitación.');
      } else {
        setAvisoGrupo(
          `Grupo "${nuevoGrupo.name}" creado. Invitación enviada a ${miembrosSeleccionados.length} ${miembrosSeleccionados.length === 1 ? 'amigo' : 'amigos'
          }.`
        );
      }
    }

    setNombreGrupo('');
    setMiembrosSeleccionados([]);
    await cargarGruposUsuario(user.id, amigos);
    setGrupoActivoId(nuevoGrupo.id);
    setCreandoGrupo(false);
  }

  async function handleEliminarGrupo() {
    if (!user || !grupoActivo || eliminandoGrupo) return;
    if (grupoActivo.created_by !== user.id) return;

    setAvisoGrupo(null);
    setEliminandoGrupo(true);

    const idBorrar = grupoActivo.id;
    const nombreBorrar = grupoActivo.name;

    const { error } = await supabase
      .from('friend_groups')
      .delete()
      .eq('id', idBorrar)
      .eq('created_by', user.id);

    if (error) {
      console.error('Error eliminando grupo:', error);
      setAvisoGrupo(error.message || 'No se pudo eliminar el grupo.');
      setEliminandoGrupo(false);
      return;
    }

    setGrupoActivoId((prev) => (prev === idBorrar ? null : prev));
    await cargarGruposUsuario(user.id, amigos);
    setAvisoGrupo(`Grupo "${nombreBorrar}" eliminado.`);
    setEliminandoGrupo(false);
  }

  async function handleInvitarAmigoAGrupo(amigoId: string, usernameAmigo: string) {
    if (!user || !grupoActivoId || !amigoId) return;
    if (invitacionesEnviadasGrupo.includes(amigoId)) return;

    setAvisoGrupo(null);
    const { error } = await supabase
      .from('friend_group_invitations')
      .upsert(
        {
          group_id: grupoActivoId,
          inviter_id: user.id,
          invitee_id: amigoId,
          status: 'pending',
        },
        { onConflict: 'group_id,invitee_id' }
      );

    if (error) {
      console.error('Error enviando invitación:', error);
      setAvisoGrupo(error.message || 'No se pudo enviar la invitación.');
      return;
    }

    setInvitacionesEnviadasGrupo((prev) => [...prev, amigoId]);
    setAvisoGrupo(`Invitación enviada a @${usernameAmigo}.`);
  }

  async function handleResponderInvitacionGrupo(inv: InvitacionGrupo, aceptar: boolean) {
    if (!user) return;
    setAvisoGrupo(null);

    if (aceptar) {
      const { error: errMember } = await supabase
        .from('friend_group_members')
        .insert({
          group_id: inv.group_id,
          user_id: user.id,
        });

      if (errMember && !errMember.message?.toLowerCase().includes('duplicate')) {
        console.error('Error al unirse al grupo:', errMember);
        setAvisoGrupo(errMember.message || 'No se pudo unirte al grupo.');
        return;
      }

      await supabase
        .from('friend_group_invitations')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('invitee_id', user.id);

      await cargarGruposUsuario(user.id, amigos);
      setGrupoActivoId(inv.group_id);
      setAvisoGrupo(`Te has unido a "${inv.group_name}".`);
    } else {
      await supabase
        .from('friend_group_invitations')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('invitee_id', user.id);

      setInvitacionesRecibidas((prev) => prev.filter((item) => item.id !== inv.id));
    }
  }

  async function handleEliminarMiembroGrupo(miembroId: string, usernameMiembro: string) {
    if (!user || !grupoActivo || procesandoMiembroId) return;
    const soyCreador = grupoActivo.created_by === user.id;
    const esMiUsuario = miembroId === user.id;
    if (!soyCreador && !esMiUsuario) return;

    setAvisoGrupo(null);
    setProcesandoMiembroId(miembroId);

    const { error } = await supabase
      .from('friend_group_members')
      .delete()
      .eq('group_id', grupoActivo.id)
      .eq('user_id', miembroId);

    if (error) {
      console.error('Error eliminando miembro del grupo:', error);
      setAvisoGrupo(error.message || 'No se pudo eliminar al miembro del grupo.');
      setProcesandoMiembroId(null);
      return;
    }

    await supabase
      .from('friend_group_invitations')
      .delete()
      .eq('group_id', grupoActivo.id)
      .eq('invitee_id', miembroId);

    setInvitacionesEnviadasGrupo((prev) => prev.filter((id) => id !== miembroId));
    await cargarGruposUsuario(user.id, amigos);
    setAvisoGrupo(
      esMiUsuario ? `Has salido de "${grupoActivo.name}".` : `@${usernameMiembro} eliminado del grupo.`
    );
    setProcesandoMiembroId(null);
  }

  async function handleAnadirTituloWatchlistGrupo(item: ResultadoBusquedaTMDB) {
    if (!user) return onRequireAuth();
    if (!grupoActivoId || anadiendoTituloId) return;

    const clave = `${item.media_type}-${item.id}`;
    const yaExiste = watchlistGrupo.some(
      (w) => w.tmdb_id === item.id && w.media_type === item.media_type
    );
    if (yaExiste) {
      setAvisoGrupo(`"${item.title}" ya está en la lista del grupo.`);
      return;
    }

    setAvisoGrupo(null);
    setAnadiendoTituloId(clave);

    const notaLimpia = notaTituloGrupo.trim().slice(0, 120) || null;
    const miUsername = user.user_metadata?.username || user.email?.split('@')[0] || 'tú';

    const { data, error } = await supabase
      .from('friend_group_watchlist')
      .insert({
        group_id: grupoActivoId,
        added_by: user.id,
        tmdb_id: item.id,
        media_type: item.media_type,
        title: item.title,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        status: 'pending',
        note: notaLimpia,
      })
      .select('id, group_id, added_by, tmdb_id, media_type, title, poster_path, vote_average, status, note, created_at')
      .single();

    if (error || !data) {
      console.error('Error añadiendo título al grupo:', error);
      setAvisoGrupo(
        error?.message ||
        'No se pudo añadir el título. Revisa la tabla friend_group_watchlist y sus políticas RLS.'
      );
      setAnadiendoTituloId(null);
      return;
    }

    const nuevoItem: ItemWatchlistGrupo = {
      ...data,
      media_type: data.media_type === 'movie' ? 'movie' : 'tv',
      vote_average: Number(data.vote_average || 0),
      status: (data.status || 'pending') as EstadoWatchlistGrupo,
      added_by_username: miUsername,
    };

    setWatchlistGrupo((prev) =>
      prev.some((w) => w.id === nuevoItem.id) ? prev : [nuevoItem, ...prev]
    );
    setQueryTituloGrupo('');
    setNotaTituloGrupo('');
    setResultadosTituloTMDB([]);
    setAvisoGrupo(`"${item.title}" añadido a "Para ver juntos".`);
    setAnadiendoTituloId(null);
  }

  async function handleCambiarEstadoWatchlistGrupo(
    itemId: string,
    nuevoEstado: EstadoWatchlistGrupo
  ) {
    if (!user || !grupoActivoId || actualizandoItemId) return;
    setActualizandoItemId(itemId);

    const { error } = await supabase
      .from('friend_group_watchlist')
      .update({ status: nuevoEstado })
      .eq('id', itemId)
      .eq('group_id', grupoActivoId);

    if (!error) {
      setWatchlistGrupo((prev) =>
        prev.map((w) => (w.id === itemId ? { ...w, status: nuevoEstado } : w))
      );
    } else {
      console.error('Error actualizando estado en watchlist del grupo:', error);
    }

    setActualizandoItemId(null);
  }

  async function handleEliminarWatchlistGrupo(item: ItemWatchlistGrupo) {
    if (!user || !grupoActivo || actualizandoItemId) return;
    const puedeBorrar = item.added_by === user.id || grupoActivo.created_by === user.id;
    if (!puedeBorrar) return;

    setActualizandoItemId(item.id);
    const { error } = await supabase
      .from('friend_group_watchlist')
      .delete()
      .eq('id', item.id)
      .eq('group_id', grupoActivo.id);

    if (!error) {
      setWatchlistGrupo((prev) => prev.filter((w) => w.id !== item.id));
      if (ganadorGrupo?.id === item.id) setGanadorGrupo(null);
    }
    setActualizandoItemId(null);
  }

  function handleSortearTituloGrupo() {
    if (sorteandoGrupo) return;
    const pendientes = watchlistGrupo.filter((w) => w.status === 'pending');
    const pool = pendientes.length > 0 ? pendientes : watchlistGrupo;
    if (pool.length === 0) return;

    setSorteandoGrupo(true);
    setGanadorGrupo(null);

    let pasos = 0;
    const totalPasos = 12;
    const timer = setInterval(() => {
      const elegido = pool[Math.floor(Math.random() * pool.length)];
      setGanadorGrupo(elegido);
      pasos++;
      if (pasos >= totalPasos) {
        clearInterval(timer);
        setSorteandoGrupo(false);
      }
    }, 80);
  }

  async function handleAnunciarElegidoEnChat(item: ItemWatchlistGrupo) {
    if (!user || !grupoActivoId) return;
    await handleCambiarEstadoWatchlistGrupo(item.id, 'watching');

    const { data } = await supabase
      .from('friend_group_messages')
      .insert({
        group_id: grupoActivoId,
        user_id: user.id,
        content: `🎲 ¡Ha tocado ver juntos "${item.title}"!`,
      })
      .select('id, group_id, user_id, content, created_at')
      .single();

    if (data) {
      const autor = user.user_metadata?.username || user.email?.split('@')[0] || 'tú';
      setMensajesGrupo((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...data, username: autor }]
      );
    }

    setVistaGrupo('chat');
  }

  async function handleEnviarMensajeGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!grupoActivoId || enviandoGrupo) return;

    const limpio = textoGrupo.trim();
    if (!limpio) return;

    const chequeo = evaluarLenguaje(limpio);
    if (!chequeo.permitido) return;

    setEnviandoGrupo(true);
    setTextoGrupo('');

    const { data } = await supabase
      .from('friend_group_messages')
      .insert({
        group_id: grupoActivoId,
        user_id: user.id,
        content: limpio,
      })
      .select('id, group_id, user_id, content, created_at')
      .single();

    if (data) {
      const autor = user.user_metadata?.username || user.email?.split('@')[0] || 'tú';
      setMensajesGrupo((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, { ...data, username: autor }]
      );
    }

    setEnviandoGrupo(false);
  }

  async function handleBorrarMensajeGrupo(idMsg: string) {
    if (!user || eliminandoGrupoMsgId) return;
    setEliminandoGrupoMsgId(idMsg);
    const { error } = await supabase
      .from('friend_group_messages')
      .delete()
      .eq('id', idMsg)
      .eq('user_id', user.id);

    if (!error) {
      setMensajesGrupo((prev) => prev.filter((m) => m.id !== idMsg));
    }
    setEliminandoGrupoMsgId(null);
  }

  async function toggleReaccion(act: any, tipo: TipoReaccion) {
    if (!user) return onRequireAuth();

    const mediaType = act.media_type || 'tv';
    const key = `${act.user_id}-${mediaType}-${act.tmdb_id}`;
    const actual = reaccionesMap[key] || { counts: { fire: 0, heart: 0, eyes: 0 } };
    const yaPuesta = actual.mia === tipo;

    const nuevosCounts = { ...actual.counts };
    if (actual.mia) {
      nuevosCounts[actual.mia] = Math.max(0, nuevosCounts[actual.mia] - 1);
    }
    if (!yaPuesta) {
      nuevosCounts[tipo] = (nuevosCounts[tipo] || 0) + 1;
    }

    setReaccionesMap((prev) => ({
      ...prev,
      [key]: {
        counts: nuevosCounts,
        mia: yaPuesta ? undefined : tipo,
      },
    }));

    if (yaPuesta) {
      await supabase
        .from('activity_reactions')
        .delete()
        .eq('activity_user_id', act.user_id)
        .eq('tmdb_id', act.tmdb_id)
        .eq('media_type', mediaType)
        .eq('reactor_user_id', user.id);
    } else {
      await supabase.from('activity_reactions').upsert(
        {
          activity_user_id: act.user_id,
          tmdb_id: act.tmdb_id,
          media_type: mediaType,
          reactor_user_id: user.id,
          reaction: tipo,
        },
        { onConflict: 'activity_user_id,tmdb_id,media_type,reactor_user_id' }
      );
    }
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
  const badgeGrupos = invitacionesRecibidas.length;
  const idsAmigos = new Set(amigos.map((a) => a.id));

  const actividadFiltrada = actividad.filter((act) => {
    if (filtroAmigoId === 'all') return true;
    if (filtroAmigoId === 'friends_only') return idsAmigos.has(act.user_id);
    return act.user_id === filtroAmigoId;
  });

  const actividadVisible = mostrarTodoFeed
    ? actividadFiltrada
    : actividadFiltrada.slice(0, 8);

  const amigoSeleccionado =
    filtroAmigoId !== 'all' && filtroAmigoId !== 'friends_only'
      ? amigos.find((a) => a.id === filtroAmigoId)
      : null;

  const grupoActivo = grupos.find((g) => g.id === grupoActivoId) || null;
  const candidatosGrupo = grupoActivo
    ? amigos.filter((am) => !grupoActivo.memberIds.includes(am.id))
    : [];

  const watchlistFiltrada = watchlistGrupo.filter((w) =>
    filtroWatchlistGrupo === 'all' ? true : w.status === filtroWatchlistGrupo
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTabComunidad('actividad')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${tabComunidad === 'actividad'
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
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${tabComunidad === 'amigos'
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

          <button
            type="button"
            onClick={() => (user ? setTabComunidad('grupos') : onRequireAuth())}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${tabComunidad === 'grupos'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Grupos ({grupos.length})
            {badgeGrupos > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                {badgeGrupos}
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

          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFiltroAmigoId('all');
                setMostrarTodoFeed(false);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${filtroAmigoId === 'all'
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
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${filtroAmigoId === 'friends_only'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-emerald-500/40 hover:text-white'
                    }`}
                >
                  Solo amigos ({amigos.length})
                </button>

                <select
                  value={amigoSeleccionado ? filtroAmigoId : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setFiltroAmigoId(e.target.value);
                      setMostrarTodoFeed(false);
                    }
                  }}
                  className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition focus:outline-none ${amigoSeleccionado
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
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/70" />
              ))}
            </div>
          ) : actividadVisible.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 py-10 text-center">
              <p className="text-xs text-slate-400">
                {amigoSeleccionado
                  ? `@${amigoSeleccionado.username} no tiene actividad reciente.`
                  : filtroAmigoId === 'friends_only'
                    ? 'Tus amigos no tienen actividad reciente.'
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
              {actividadVisible.map((act) => {
                const mediaType = act.media_type || 'tv';
                const reactKey = `${act.user_id}-${mediaType}-${act.tmdb_id}`;
                const reactInfo = reaccionesMap[reactKey] || {
                  counts: { fire: 0, heart: 0, eyes: 0 },
                };

                return (
                  <div
                    key={act.id}
                    className="group flex items-start gap-3.5 rounded-2xl border border-slate-800/90 bg-slate-950/85 p-3 transition hover:border-indigo-500/45"
                  >
                    <img
                      src={getPosterUrl(act.poster_path, 'w342')}
                      alt={act.title}
                      onClick={() =>
                        onSelectSerie({
                          id: act.tmdb_id,
                          media_type: mediaType,
                          name: act.title,
                          overview: '',
                          poster_path: act.poster_path,
                          backdrop_path: null,
                          first_air_date: '',
                          vote_average: act.rating || 0,
                        })
                      }
                      className="h-16 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-800 object-cover transition group-hover:scale-105"
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
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${act.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : act.status === 'watching'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : act.status === 'dropped'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                            }`}
                        >
                          {act.status === 'completed'
                            ? 'Vista'
                            : act.status === 'watching'
                              ? `Viendo · T${act.current_season} E${act.current_episode}`
                              : act.status === 'dropped'
                                ? 'Abandonada'
                                : 'Pendiente'}
                        </span>
                      </div>

                      <p
                        onClick={() =>
                          onSelectSerie({
                            id: act.tmdb_id,
                            media_type: mediaType,
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

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {act.rating > 0 ? (
                          <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                            <Star className="h-3 w-3 fill-amber-400" />
                            <span>{act.rating}/5</span>
                          </div>
                        ) : (
                          <span />
                        )}

                        <div className="flex items-center gap-1">
                          {OPCIONES_REACCION.map((op) => {
                            const activa = reactInfo.mia === op.key;
                            const total = reactInfo.counts[op.key] || 0;
                            return (
                              <button
                                key={op.key}
                                type="button"
                                onClick={() => toggleReaccion(act, op.key)}
                                title={op.label}
                                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold transition active:scale-95 ${activa
                                    ? 'border-indigo-400/70 bg-indigo-600/30 text-white'
                                    : 'border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                  }`}
                              >
                                <span>{op.emoji}</span>
                                {total > 0 && <span>{total}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : tabComunidad === 'grupos' ? (
        <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg">
          {!user ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 text-center">
              <p className="text-xs text-slate-300">
                Inicia sesión para crear grupos con tus amigos y chatear en privado.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
              >
                Entrar a mi cuenta
              </button>
            </div>
          ) : (
            <>
              {invitacionesRecibidas.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/85 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                    <UserPlus className="h-3.5 w-3.5" />
                    Invitaciones a grupos ({invitacionesRecibidas.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {invitacionesRecibidas.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">
                            {inv.group_name}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            De @{inv.inviter_username}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleResponderInvitacionGrupo(inv, true)}
                            className="flex items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-500"
                          >
                            <Check className="h-3 w-3" /> Aceptar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResponderInvitacionGrupo(inv, false)}
                            className="rounded-xl border border-slate-800 bg-slate-950 p-1 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="space-y-4">
                  <form
                    onSubmit={handleCrearGrupo}
                    className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/85 p-4"
                  >
                    <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-300">
                      <Plus className="h-3.5 w-3.5" />
                      Nuevo grupo de amigos
                    </h4>

                    <input
                      type="text"
                      maxLength={60}
                      required
                      value={nombreGrupo}
                      onChange={(e) => setNombreGrupo(e.target.value)}
                      placeholder="Nombre del grupo (ej. Club de series)"
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />

                    {amigos.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-400">
                          Invitar amigos al crear ({miembrosSeleccionados.length} seleccionados):
                        </p>
                        <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                          {amigos.map((am) => {
                            const marcado = miembrosSeleccionados.includes(am.id);
                            return (
                              <button
                                key={am.id}
                                type="button"
                                onClick={() => toggleSeleccionMiembro(am.id)}
                                className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-xs transition ${marcado
                                    ? 'border-indigo-500/50 bg-indigo-600/20 font-bold text-white'
                                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:bg-slate-900'
                                  }`}
                              >
                                <span className="truncate">@{am.username}</span>
                                {marcado && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={creandoGrupo || !nombreGrupo.trim()}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {creandoGrupo ? 'Creando...' : 'Crear grupo'}
                    </button>

                    {avisoGrupo && (
                      <p className="text-[11px] font-semibold text-indigo-300">{avisoGrupo}</p>
                    )}
                  </form>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Tus grupos ({grupos.length})
                    </p>
                    {grupos.length === 0 ? (
                      <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-500">
                        Aún no perteneces a ningún grupo. Crea uno arriba.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {grupos.map((g) => {
                          const activo = g.id === grupoActivoId;
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setGrupoActivoId(g.id)}
                              className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left text-xs transition ${activo
                                  ? 'border-indigo-500/60 bg-indigo-600/20 font-bold text-white'
                                  : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
                                }`}
                            >
                              <span className="truncate">{g.name}</span>
                              <span className="rounded-xl bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                                {g.members.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex min-h-[460px] flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/85 p-4 lg:col-span-2">
                  {!grupoActivo ? (
                    <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
                      Selecciona o crea un grupo para empezar a chatear o armar su lista.
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 space-y-2.5 border-b border-slate-800 pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-white">{grupoActivo.name}</h4>
                            <p className="text-[11px] text-slate-400">
                              {grupoActivo.members.length}{' '}
                              {grupoActivo.members.length === 1 ? 'miembro' : 'miembros'} ·{' '}
                              {watchlistGrupo.length}{' '}
                              {watchlistGrupo.length === 1 ? 'título en cola' : 'títulos en cola'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5">
                              <button
                                type="button"
                                onClick={() => setVistaGrupo('chat')}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${vistaGrupo === 'chat'
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                  }`}
                              >
                                <MessageSquare className="h-3 w-3" />
                                Chat
                              </button>
                              <button
                                type="button"
                                onClick={() => setVistaGrupo('watchlist')}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${vistaGrupo === 'watchlist'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-white'
                                  }`}
                              >
                                <ListVideo className="h-3 w-3" />
                                Ver juntos ({watchlistGrupo.length})
                              </button>
                            </div>

                            {grupoActivo.created_by === user.id && (
                              <button
                                type="button"
                                onClick={handleEliminarGrupo}
                                disabled={eliminandoGrupo}
                                title="Eliminar grupo"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-950/25 px-3 py-1.5 text-[11px] font-bold text-rose-300 transition hover:border-rose-500/45 hover:bg-rose-950/45 hover:text-rose-200 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{eliminandoGrupo ? 'Borrando...' : 'Eliminar'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {grupoActivo.members.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {grupoActivo.members.map((miembro) => {
                              const puedeQuitar =
                                grupoActivo.created_by === user.id || miembro.id === user.id;
                              const enLinea = onlineUserIds.has(miembro.id);
                              return (
                                <div
                                  key={miembro.id}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-indigo-300"
                                >
                                  <span
                                    title={enLinea ? 'Conectado' : 'Desconectado'}
                                    className={`h-2 w-2 rounded-full ${enLinea ? 'bg-emerald-400' : 'bg-slate-600'
                                      }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => onSelectUser(miembro.id)}
                                    className="transition hover:text-white hover:underline"
                                  >
                                    @{miembro.username}
                                  </button>
                                  {puedeQuitar && (
                                    <button
                                      type="button"
                                      disabled={procesandoMiembroId === miembro.id}
                                      onClick={() =>
                                        handleEliminarMiembroGrupo(miembro.id, miembro.username)
                                      }
                                      title={
                                        miembro.id === user.id
                                          ? 'Salir del grupo'
                                          : `Eliminar a @${miembro.username}`
                                      }
                                      className="rounded-lg p-0.5 text-slate-400 transition hover:bg-rose-950/50 hover:text-rose-300 disabled:opacity-50"
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {candidatosGrupo.length > 0 && (
                          <div className="space-y-1.5 pt-0.5">
                            <p className="text-[11px] font-semibold text-slate-400">
                              Invitar amigos al grupo:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {candidatosGrupo.map((am) => {
                                const yaInvitado = invitacionesEnviadasGrupo.includes(am.id);
                                return (
                                  <button
                                    key={am.id}
                                    type="button"
                                    disabled={yaInvitado}
                                    onClick={() => handleInvitarAmigoAGrupo(am.id, am.username)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${yaInvitado
                                        ? 'border-indigo-500/30 bg-indigo-950/30 text-indigo-300'
                                        : 'border-slate-800 bg-slate-900/70 text-slate-200 hover:border-indigo-500/50 hover:bg-slate-900 hover:text-white'
                                      }`}
                                  >
                                    {yaInvitado ? (
                                      <Check className="h-3.5 w-3.5 text-indigo-400" />
                                    ) : (
                                      <UserPlus className="h-3.5 w-3.5 text-indigo-400" />
                                    )}
                                    <span>@{am.username}</span>
                                    <span className="text-[11px] text-slate-400">
                                      {yaInvitado ? 'Invitado' : 'Invitar'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {vistaGrupo === 'chat' ? (
                        <>
                          <div className="h-64 flex-1 space-y-2.5 overflow-y-auto pr-1">
                            {mensajesGrupo.length === 0 ? (
                              <p className="py-16 text-center text-xs text-slate-500">
                                Aún no hay mensajes en este grupo. ¡Saluda a tus amigos!
                              </p>
                            ) : (
                              mensajesGrupo.map((m) => {
                                const mio = m.user_id === user.id;
                                return (
                                  <div
                                    key={m.id}
                                    className={`flex flex-col ${mio ? 'items-end' : 'items-start'}`}
                                  >
                                    <div
                                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs ${mio
                                          ? 'bg-indigo-600 text-white'
                                          : 'border border-slate-800 bg-slate-900 text-slate-200'
                                        }`}
                                    >
                                      {!mio && (
                                        <p className="mb-0.5 text-[10px] font-bold text-indigo-300">
                                          @{m.username}
                                        </p>
                                      )}
                                      <p className="break-words">{m.content}</p>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                      <span>
                                        {new Date(m.created_at).toLocaleTimeString('es-ES', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                      {mio && (
                                        <button
                                          type="button"
                                          onClick={() => handleBorrarMensajeGrupo(m.id)}
                                          disabled={eliminandoGrupoMsgId === m.id}
                                          className="text-slate-600 hover:text-rose-400"
                                          title="Borrar mensaje"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                            <div ref={chatGrupoEndRef} />
                          </div>

                          <form
                            onSubmit={handleEnviarMensajeGrupo}
                            className="mt-3 flex gap-2 border-t border-slate-800 pt-3"
                          >
                            <input
                              type="text"
                              maxLength={600}
                              value={textoGrupo}
                              onChange={(e) => setTextoGrupo(e.target.value)}
                              placeholder={`Escribe en ${grupoActivo.name}...`}
                              className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!textoGrupo.trim() || enviandoGrupo}
                              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Enviar
                            </button>
                          </form>
                        </>
                      ) : (
                        <div className="flex flex-1 flex-col space-y-3.5 overflow-y-auto pr-1">
                          {/* Buscador para añadir títulos a ver juntos */}
                          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/75 p-3">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <div className="relative sm:col-span-2">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400" />
                                <input
                                  type="text"
                                  value={queryTituloGrupo}
                                  onChange={(e) => setQueryTituloGrupo(e.target.value)}
                                  placeholder="Buscar serie, peli, doc o reality para ver juntos..."
                                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                                />
                              </div>
                              <input
                                type="text"
                                maxLength={100}
                                value={notaTituloGrupo}
                                onChange={(e) => setNotaTituloGrupo(e.target.value)}
                                placeholder="Nota (ej. Para el finde)"
                                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                              />
                            </div>

                            {buscandoTituloTMDB && (
                              <p className="text-[11px] text-slate-400">Buscando títulos...</p>
                            )}

                            {resultadosTituloTMDB.length > 0 && (
                              <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
                                {resultadosTituloTMDB.map((resItem) => {
                                  const clave = `${resItem.media_type}-${resItem.id}`;
                                  const yaEsta = watchlistGrupo.some(
                                    (w) =>
                                      w.tmdb_id === resItem.id &&
                                      w.media_type === resItem.media_type
                                  );
                                  return (
                                    <div
                                      key={clave}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2"
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <img
                                          src={getPosterUrl(resItem.poster_path, 'w342')}
                                          alt={resItem.title}
                                          className="h-10 w-7 shrink-0 rounded object-cover"
                                        />
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-bold text-white">
                                            {resItem.title}
                                          </p>
                                          <p className="text-[10px] text-slate-400">
                                            {resItem.media_type === 'movie' ? 'Película' : 'Serie'}
                                            {resItem.year ? ` · ${resItem.year}` : ''}
                                          </p>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        disabled={yaEsta || anadiendoTituloId === clave}
                                        onClick={() => handleAnadirTituloWatchlistGrupo(resItem)}
                                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${yaEsta
                                            ? 'bg-slate-800 text-slate-400'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                                          }`}
                                      >
                                        {yaEsta
                                          ? 'En cola'
                                          : anadiendoTituloId === clave
                                            ? '...'
                                            : '+ Añadir'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Filtros de estado + Sorteo rápido entre títulos del grupo */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {(
                                [
                                  { id: 'all', label: `Todos (${watchlistGrupo.length})` },
                                  {
                                    id: 'pending',
                                    label: `Pendientes (${watchlistGrupo.filter((w) => w.status === 'pending').length})`,
                                  },
                                  {
                                    id: 'watching',
                                    label: `Viendo (${watchlistGrupo.filter((w) => w.status === 'watching').length})`,
                                  },
                                  {
                                    id: 'completed',
                                    label: `Vistas (${watchlistGrupo.filter((w) => w.status === 'completed').length})`,
                                  },
                                ] as const
                              ).map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => setFiltroWatchlistGrupo(f.id)}
                                  className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition ${filtroWatchlistGrupo === f.id
                                      ? 'bg-indigo-600 text-white'
                                      : 'border border-slate-800 bg-slate-900 text-slate-300 hover:text-white'
                                    }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>

                            {watchlistGrupo.length > 0 && (
                              <button
                                type="button"
                                disabled={sorteandoGrupo}
                                onClick={handleSortearTituloGrupo}
                                className="inline-flex items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
                              >
                                <Dices className="h-3.5 w-3.5" />
                                {sorteandoGrupo ? 'Sorteando...' : 'Sortear título'}
                              </button>
                            )}
                          </div>

                          {ganadorGrupo && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/25 p-3">
                              <div className="flex items-center gap-2.5">
                                <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-emerald-300">
                                    Elección del grupo
                                  </p>
                                  <p className="text-xs font-bold text-white">
                                    {ganadorGrupo.title}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAnunciarElegidoEnChat(ganadorGrupo)}
                                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-500"
                              >
                                Empezar y avisar en chat
                              </button>
                            </div>
                          )}

                          {watchlistFiltrada.length === 0 ? (
                            <p className="rounded-2xl border border-slate-800/80 bg-slate-900/50 py-10 text-center text-xs text-slate-500">
                              No hay títulos en esta vista de "Para ver juntos". Busca uno arriba para añadirlo.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {watchlistFiltrada.map((item) => {
                                const puedeBorrar =
                                  item.added_by === user.id || grupoActivo.created_by === user.id;

                                return (
                                  <div
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-2.5"
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <img
                                        src={getPosterUrl(item.poster_path, 'w342')}
                                        alt={item.title}
                                        onClick={() =>
                                          onSelectSerie({
                                            id: item.tmdb_id,
                                            media_type: item.media_type,
                                            name: item.title,
                                            overview: '',
                                            poster_path: item.poster_path,
                                            backdrop_path: null,
                                            first_air_date: '',
                                            vote_average: item.vote_average,
                                          })
                                        }
                                        className="h-14 w-10 shrink-0 cursor-pointer rounded-lg object-cover"
                                      />
                                      <div className="min-w-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onSelectSerie({
                                              id: item.tmdb_id,
                                              media_type: item.media_type,
                                              name: item.title,
                                              overview: '',
                                              poster_path: item.poster_path,
                                              backdrop_path: null,
                                              first_air_date: '',
                                              vote_average: item.vote_average,
                                            })
                                          }
                                          className="block truncate text-left text-xs font-bold text-white hover:text-indigo-300"
                                        >
                                          {item.title}
                                        </button>
                                        <p className="text-[10px] text-slate-400">
                                          Propuesto por @{item.added_by_username} ·{' '}
                                          {item.media_type === 'movie' ? 'Película' : 'Serie'}
                                        </p>
                                        {item.note && (
                                          <p className="mt-0.5 truncate text-[11px] italic text-indigo-300">
                                            "{item.note}"
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={actualizandoItemId === item.id}
                                        onClick={() =>
                                          handleCambiarEstadoWatchlistGrupo(item.id, 'pending')
                                        }
                                        title="Marcar como pendiente"
                                        className={`rounded-lg p-1.5 text-[11px] transition ${item.status === 'pending'
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : 'bg-slate-950 text-slate-500 hover:text-amber-300'
                                          }`}
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={actualizandoItemId === item.id}
                                        onClick={() =>
                                          handleCambiarEstadoWatchlistGrupo(item.id, 'watching')
                                        }
                                        title="Viendo juntos"
                                        className={`rounded-lg p-1.5 text-[11px] transition ${item.status === 'watching'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-950 text-slate-500 hover:text-indigo-300'
                                          }`}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={actualizandoItemId === item.id}
                                        onClick={() =>
                                          handleCambiarEstadoWatchlistGrupo(item.id, 'completed')
                                        }
                                        title="Vista por el grupo"
                                        className={`rounded-lg p-1.5 text-[11px] transition ${item.status === 'completed'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-950 text-slate-500 hover:text-emerald-300'
                                          }`}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </button>

                                      {puedeBorrar && (
                                        <button
                                          type="button"
                                          disabled={actualizandoItemId === item.id}
                                          onClick={() => handleEliminarWatchlistGrupo(item)}
                                          title="Quitar de la lista del grupo"
                                          className="rounded-lg bg-slate-950 p-1.5 text-slate-500 transition hover:bg-rose-950/50 hover:text-rose-400"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
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
                  {usuariosBusqueda.map((u) => {
                    const estaConectado = onlineUserIds.has(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => onSelectUser(u.id)}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left transition hover:border-indigo-500/60"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold uppercase text-white">
                            {(u.username || 'U')[0]}
                            {estaConectado && (
                              <span
                                title="Conectado"
                                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900"
                              />
                            )}
                          </div>
                          <div className="truncate">
                            <p className="truncate text-xs font-bold text-white">@{u.username}</p>
                            <p className="truncate text-[11px] text-slate-400">
                              {estaConectado ? 'En línea' : u.bio || 'Ver perfil'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
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
                const estaConectado = onlineUserIds.has(am.id);
                return (
                  <button
                    key={am.id}
                    type="button"
                    onClick={() => onSelectUser(am.id)}
                    className={`flex items-center justify-between rounded-2xl border p-3 text-left transition hover:border-indigo-500/60 ${sinLeer > 0
                        ? 'border-indigo-400/60 bg-indigo-950/35'
                        : 'border-slate-800 bg-slate-950/85 hover:bg-slate-900'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600/25 text-xs font-bold uppercase text-indigo-200">
                        {(am.username || 'A')[0]}
                        <span
                          title={estaConectado ? 'Conectado' : 'Desconectado'}
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${
                            estaConectado ? 'bg-emerald-400' : 'bg-slate-600'
                          }`}
                        />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-white">@{am.username}</p>
                          {estaConectado && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              En línea
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {estaConectado ? 'Conectado ahora · Ver perfil / Chat' : 'Ver perfil / Chat'}
                        </p>
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
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}