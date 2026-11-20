'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MediaTMDB } from '@/lib/tmdb';
import { evaluarLenguaje } from '@/lib/filtroLenguaje';
import { X, MessageSquare, Send, Eye, Trash2, Lock, Users } from 'lucide-react';

interface ChatSalaTituloModalProps {
  media: MediaTMDB;
  user: any;
  estadoUsuario?: {
    status?: 'watching' | 'completed' | 'watchlist' | 'dropped';
  };
  onMarcarViendo?: (media: MediaTMDB) => void;
  onClose: () => void;
  onRequireAuth: () => void;
}

interface GrupoUsuario {
  id: string;
  name: string;
}

type ModoSalaChat = 'general' | 'privado';

const LIMITE_MENSAJES_EN_VISTA = 60;
const COOLDOWN_SEGUNDOS = 3;
const MAX_MENSAJES_POR_MINUTO = 12;

export default function ChatSalaTituloModal({
  media,
  user,
  estadoUsuario,
  onMarcarViendo,
  onClose,
  onRequireAuth,
}: ChatSalaTituloModalProps) {
  const [modoSala, setModoSala] = useState<ModoSalaChat>('general');
  const [gruposUsuario, setGruposUsuario] = useState<GrupoUsuario[]>([]);
  const [grupoSeleccionadoId, setGrupoSeleccionadoId] = useState<string>('amigos');

  const [mensajes, setMensajes] = useState<any[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [viendoAhoraCount, setViendoAhoraCount] = useState<number>(0);
  const [enChatCount, setEnChatCount] = useState<number>(0);
  const [estadoEnBd, setEstadoEnBd] = useState<string | null>(
    estadoUsuario?.status || null
  );
  const [segundosEspera, setSegundosEspera] = useState<number>(0);
  const [avisoSpam, setAvisoSpam] = useState<string | null>(null);

  const listaMensajesRef = useRef<HTMLDivElement | null>(null);
  const seguirAlFinalRef = useRef<boolean>(true);
  const marcasEnvioRef = useRef<number[]>([]);
  const ultimoTextoRef = useRef<string>('');

  const tipo = media.media_type || 'tv';
  const estaViendo =
    !!user && (estadoEnBd === 'watching' || estadoUsuario?.status === 'watching');
  const puedeEscribirEnModoActual =
    !!user && (modoSala === 'privado' || estaViendo);

  useEffect(() => {
    if (estadoUsuario?.status) {
      setEstadoEnBd(estadoUsuario.status);
    }
  }, [estadoUsuario?.status]);

  useEffect(() => {
    if (segundosEspera <= 0) return;
    const timer = setInterval(() => {
      setSegundosEspera((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [segundosEspera]);

  useEffect(() => {
    setAvisoSpam(null);
  }, [modoSala, grupoSeleccionadoId]);

  useEffect(() => {
    if (!user?.id) {
      setGruposUsuario([]);
      setGrupoSeleccionadoId('amigos');
      return;
    }

    let activo = true;

    async function cargarGruposDeUsuario() {
      const { data: membresias } = await supabase
        .from('friend_group_members')
        .select('group_id')
        .eq('user_id', user.id);

      const groupIds = Array.from(
        new Set((membresias || []).map((m: any) => m.group_id).filter(Boolean))
      );

      if (!activo) return;

      if (groupIds.length === 0) {
        setGruposUsuario([]);
        setGrupoSeleccionadoId('amigos');
        return;
      }

      const { data: grupos } = await supabase
        .from('friend_groups')
        .select('id, name')
        .in('id', groupIds)
        .order('name', { ascending: true });

      if (!activo) return;
      setGruposUsuario(grupos || []);
    }

    cargarGruposDeUsuario();

    return () => {
      activo = false;
    };
  }, [user?.id]);

  function handleScrollLista() {
    const el = listaMensajesRef.current;
    if (!el) return;
    const distanciaAlFondo = el.scrollHeight - el.scrollTop - el.clientHeight;
    seguirAlFinalRef.current = distanciaAlFondo < 72;
  }

  function bajarAlFinal(suave = true) {
    const el = listaMensajesRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: suave ? 'smooth' : 'auto',
    });
  }

  useEffect(() => {
    let activo = true;
    seguirAlFinalRef.current = true;
    setMensajes([]);

    async function resolverNombres(userIds: string[]) {
      const nombresMap: Record<string, string> = {};
      const unicos = Array.from(new Set(userIds.filter(Boolean)));
      if (unicos.length === 0) return nombresMap;

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', unicos);

      (profs || []).forEach((p: any) => {
        nombresMap[p.id] = p.username;
      });
      return nombresMap;
    }

    async function cargarEstadoYAsistentes() {
      const { data } = await supabase
        .from('user_series')
        .select('user_id, status, media_type')
        .eq('tmdb_id', media.id);

      if (!activo) return;
      const filas = (data || []).filter(
        (r: any) => !r.media_type || r.media_type === tipo
      );

      const viendoSet = new Set(
        filas.filter((r: any) => r.status === 'watching').map((r: any) => r.user_id)
      );
      setViendoAhoraCount(viendoSet.size);

      if (user?.id) {
        const propio = filas.find((r: any) => r.user_id === user.id);
        setEstadoEnBd(propio?.status || null);
      } else {
        setEstadoEnBd(null);
      }
    }

    async function cargarHistorialGeneral() {
      const { data } = await supabase
        .from('title_chat_messages')
        .select('id, user_id, tmdb_id, media_type, content, created_at')
        .eq('tmdb_id', media.id)
        .eq('media_type', tipo)
        .order('created_at', { ascending: false })
        .limit(LIMITE_MENSAJES_EN_VISTA);

      if (!activo || !data) return;

      const ordenados = [...data].reverse();
      const nombresMap = await resolverNombres(ordenados.map((m: any) => m.user_id));

      if (!activo) return;
      setMensajes(
        ordenados.map((m: any) => ({
          ...m,
          username: nombresMap[m.user_id] || 'usuario',
        }))
      );

      requestAnimationFrame(() => bajarAlFinal(false));
    }

    async function cargarHistorialPrivado() {
      if (!user?.id) {
        setMensajes([]);
        return;
      }

      let queryMensajes = supabase
        .from('title_friend_chat_messages')
        .select('id, user_id, tmdb_id, media_type, group_id, content, created_at')
        .eq('tmdb_id', media.id)
        .eq('media_type', tipo);

      if (grupoSeleccionadoId === 'amigos') {
        queryMensajes = queryMensajes.is('group_id', null);
      } else {
        queryMensajes = queryMensajes.eq('group_id', grupoSeleccionadoId);
      }

      const { data } = await queryMensajes
        .order('created_at', { ascending: false })
        .limit(LIMITE_MENSAJES_EN_VISTA);

      if (!activo || !data) return;

      const ordenados = [...data].reverse();
      const nombresMap = await resolverNombres(ordenados.map((m: any) => m.user_id));

      if (!activo) return;
      setMensajes(
        ordenados.map((m: any) => ({
          ...m,
          username: nombresMap[m.user_id] || 'usuario',
        }))
      );

      requestAnimationFrame(() => bajarAlFinal(false));
    }

    cargarEstadoYAsistentes();
    if (modoSala === 'general') {
      cargarHistorialGeneral();
    } else {
      cargarHistorialPrivado();
    }

    const presenceKey = user?.id
      ? `${user.id}-${Math.random().toString(36).slice(2, 7)}`
      : `guest-${Math.random().toString(36).slice(2, 8)}`;

    const alcanceCanal =
      modoSala === 'general' ? 'general' : `privado-${grupoSeleccionadoId}`;

    const canal = supabase.channel(`popup-chat-${tipo}-${media.id}-${alcanceCanal}`, {
      config: { presence: { key: presenceKey } },
    });

    const sincronizarPresencia = () => {
      if (!activo) return;
      const state = canal.presenceState();
      const totalConectados = Object.keys(state).length;
      setEnChatCount(totalConectados);
    };

    canal
      .on('presence', { event: 'sync' }, sincronizarPresencia)
      .on('presence', { event: 'join' }, sincronizarPresencia)
      .on('presence', { event: 'leave' }, sincronizarPresencia)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_series',
          filter: `tmdb_id=eq.${media.id}`,
        },
        (payload: any) => {
          const fila = payload.new || payload.old;
          if (fila?.media_type && fila.media_type !== tipo) return;
          cargarEstadoYAsistentes();
        }
      );

    if (modoSala === 'general') {
      canal
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'title_chat_messages',
            filter: `tmdb_id=eq.${media.id}`,
          },
          async (payload: any) => {
            const nuevo = payload.new;
            if (!nuevo || (nuevo.media_type && nuevo.media_type !== tipo)) return;

            let autor = 'usuario';
            if (nuevo.user_id === user?.id) {
              autor =
                user.user_metadata?.username || user.email?.split('@')[0] || 'tú';
            } else {
              const { data: prof } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', nuevo.user_id)
                .single();
              if (prof?.username) autor = prof.username;
            }

            if (!activo) return;
            setMensajes((prev) => {
              if (prev.some((m) => m.id === nuevo.id)) return prev;
              const siguiente = [...prev, { ...nuevo, username: autor }];
              return siguiente.slice(-LIMITE_MENSAJES_EN_VISTA);
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'title_chat_messages',
            filter: `tmdb_id=eq.${media.id}`,
          },
          (payload: any) => {
            if (!activo || !payload.old?.id) return;
            setMensajes((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        );
    } else {
      canal
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'title_friend_chat_messages',
            filter: `tmdb_id=eq.${media.id}`,
          },
          async (payload: any) => {
            const nuevo = payload.new;
            if (!nuevo || (nuevo.media_type && nuevo.media_type !== tipo)) return;

            if (grupoSeleccionadoId === 'amigos') {
              if (nuevo.group_id !== null && nuevo.group_id !== undefined) return;
            } else if (nuevo.group_id !== grupoSeleccionadoId) {
              return;
            }

            let autor = 'usuario';
            if (nuevo.user_id === user?.id) {
              autor =
                user.user_metadata?.username || user.email?.split('@')[0] || 'tú';
            } else {
              const { data: prof } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', nuevo.user_id)
                .single();
              if (prof?.username) autor = prof.username;
            }

            if (!activo) return;
            setMensajes((prev) => {
              if (prev.some((m) => m.id === nuevo.id)) return prev;
              const siguiente = [...prev, { ...nuevo, username: autor }];
              return siguiente.slice(-LIMITE_MENSAJES_EN_VISTA);
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'title_friend_chat_messages',
            filter: `tmdb_id=eq.${media.id}`,
          },
          (payload: any) => {
            if (!activo || !payload.old?.id) return;
            setMensajes((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        );
    }

    canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && activo) {
        if (modoSala === 'general') {
          await cargarHistorialGeneral();
        } else {
          await cargarHistorialPrivado();
        }
        await canal.track({
          user_id: user?.id || null,
          username:
            user?.user_metadata?.username ||
            user?.email?.split('@')[0] ||
            'visitante',
          online_at: new Date().toISOString(),
        });
        sincronizarPresencia();
      }
    });

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [media.id, tipo, user?.id, modoSala, grupoSeleccionadoId]);

  useEffect(() => {
    if (seguirAlFinalRef.current) {
      bajarAlFinal(true);
    }
  }, [mensajes.length]);

  async function activarViendoYEntrar() {
    if (!user) return onRequireAuth();
    setAvisoSpam(null);
    setEstadoEnBd('watching');

    if (onMarcarViendo) {
      onMarcarViendo(media);
      setTimeout(() => {
        supabase
          .from('user_series')
          .select('user_id, status, media_type')
          .eq('tmdb_id', media.id)
          .then(({ data }) => {
            const filas = (data || []).filter(
              (r: any) => !r.media_type || r.media_type === tipo
            );
            const viendoSet = new Set(
              filas
                .filter((r: any) => r.status === 'watching')
                .map((r: any) => r.user_id)
            );
            setViendoAhoraCount(viendoSet.size);
          });
      }, 350);
      return;
    }

    await supabase.from('user_series').upsert(
      {
        user_id: user.id,
        tmdb_id: media.id,
        media_type: tipo,
        status: 'watching',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,media_type' }
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (modoSala === 'general' && !estaViendo) {
      setAvisoSpam('Marca este título como "Viendo" para participar en el chat.');
      return;
    }

    const limpio = texto.trim().replace(/\s+/g, ' ');
    if (!limpio || enviando || segundosEspera > 0) return;

    const chequeoLenguaje = evaluarLenguaje(limpio);
    if (!chequeoLenguaje.permitido) {
      setAvisoSpam(
        chequeoLenguaje.motivo || 'Tu mensaje contiene lenguaje no permitido.'
      );
      return;
    }

    const ahora = Date.now();
    const ultimos = marcasEnvioRef.current.filter((ts) => ahora - ts < 60000);
    marcasEnvioRef.current = ultimos;

    if (ultimos.length >= MAX_MENSAJES_POR_MINUTO) {
      setAvisoSpam('Has alcanzado el límite temporal de mensajes. Espera unos segundos.');
      setSegundosEspera(10);
      return;
    }

    const ultimoTs = ultimos[ultimos.length - 1] || 0;
    if (ahora - ultimoTs < COOLDOWN_SEGUNDOS * 1000) {
      const faltan = Math.ceil(
        (COOLDOWN_SEGUNDOS * 1000 - (ahora - ultimoTs)) / 1000
      );
      setSegundosEspera(faltan);
      setAvisoSpam(`Espera ${faltan}s entre mensajes para evitar spam.`);
      return;
    }

    if (
      ultimoTextoRef.current.toLowerCase() === limpio.toLowerCase() &&
      ahora - ultimoTs < 20000
    ) {
      setAvisoSpam('No repitas exactamente el mismo mensaje tan seguido.');
      return;
    }

    setAvisoSpam(null);
    setEnviando(true);
    setTexto('');
    seguirAlFinalRef.current = true;

    const respuesta =
      modoSala === 'general'
        ? await supabase.from('title_chat_messages').insert({
            user_id: user.id,
            tmdb_id: media.id,
            media_type: tipo,
            content: limpio,
          })
        : await supabase.from('title_friend_chat_messages').insert({
            user_id: user.id,
            tmdb_id: media.id,
            media_type: tipo,
            group_id: grupoSeleccionadoId === 'amigos' ? null : grupoSeleccionadoId,
            content: limpio,
          });

    if (respuesta.error) {
      setTexto(limpio);
      if (respuesta.error.message?.includes('row-level security')) {
        setAvisoSpam(
          modoSala === 'general'
            ? 'Solo puedes escribir si tienes este título en "Viendo" y respetas las normas de la sala.'
            : 'Comprueba que perteneces al grupo seleccionado o que cumples las normas de la sala.'
        );
      } else {
        setAvisoSpam('No se pudo enviar el mensaje.');
      }
    } else {
      marcasEnvioRef.current = [...ultimos, ahora];
      ultimoTextoRef.current = limpio;
      setSegundosEspera(COOLDOWN_SEGUNDOS);
    }

    setEnviando(false);
    requestAnimationFrame(() => bajarAlFinal(true));
  }

  async function borrarMensaje(id: string) {
    if (!user || eliminandoId) return;
    setEliminandoId(id);

    const tabla =
      modoSala === 'general'
        ? 'title_chat_messages'
        : 'title_friend_chat_messages';

    const { error } = await supabase
      .from(tabla)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setMensajes((prev) => prev.filter((m) => m.id !== id));
    }
    setEliminandoId(null);
  }

  const nombreGrupoActivo =
    grupoSeleccionadoId === 'amigos'
      ? 'Mis amigos'
      : gruposUsuario.find((g) => g.id === grupoSeleccionadoId)?.name || 'Grupo';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-2 backdrop-blur-xs sm:items-center sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[78vh] max-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-indigo-500/40 bg-slate-950 shadow-2xl sm:h-[74vh]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 shrink-0 text-indigo-400" />
              <h3 className="truncate text-sm font-bold text-white">{media.name}</h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 font-bold text-indigo-300">
                <Eye className="h-3 w-3" />
                {viendoAhoraCount} viendo ahora
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">
                <Users className="h-3 w-3" />
                {enChatCount} {enChatCount === 1 ? 'en la sala' : 'en la sala'}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 font-bold text-slate-300">
                {mensajes.length} {mensajes.length === 1 ? 'mensaje' : 'mensajes'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar chat"
            className="shrink-0 rounded-full bg-slate-800/90 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-800/90 bg-slate-900/60 px-3.5 py-2">
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setModoSala('general')}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                modoSala === 'general'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) return onRequireAuth();
                setModoSala('privado');
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                modoSala === 'privado'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Amigos / Grupo
            </button>
          </div>

          {modoSala === 'privado' && user && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-400">
                Sala privada:
              </span>
              <select
                value={grupoSeleccionadoId}
                onChange={(e) => setGrupoSeleccionadoId(e.target.value)}
                className="max-w-[210px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
              >
                <option value="amigos">Todos mis amigos</option>
                {gruposUsuario.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                    Grupo: {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {modoSala === 'general' && !estaViendo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-950/90 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <Lock className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">
              Sala general reservada para quienes están viendo este título
            </h4>
            <p className="max-w-xs text-xs text-slate-400">
              {user
                ? 'Para entrar al chat general necesitas tener este título marcado como "Viendo", o puedes pasar a "Amigos / Grupo".'
                : 'Inicia sesión para chatear en vivo en esta sala.'}
            </p>
            <button
              type="button"
              onClick={activarViendoYEntrar}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500"
            >
              <Eye className="h-3.5 w-3.5" />
              {user ? 'Marcar como "Viendo" y entrar' : 'Iniciar sesión'}
            </button>
          </div>
        ) : modoSala === 'privado' && !user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-950/90 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Lock className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">
              Inicia sesión para ver chats de amigos o grupos
            </h4>
            <button
              type="button"
              onClick={onRequireAuth}
              className="mt-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <>
            <div
              ref={listaMensajesRef}
              onScroll={handleScrollLista}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-slate-950/90 p-3.5"
            >
              {mensajes.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-500">
                  {modoSala === 'general'
                    ? 'Aún no hay mensajes en esta sala. ¡Empieza tú la conversación!'
                    : `Aún no hay mensajes en "${nombreGrupoActivo}" sobre este título.`}
                </p>
              ) : (
                mensajes.map((msg) => {
                  const esMio = user?.id && msg.user_id === user.id;
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-2xl border px-3 py-2 text-xs ${
                        esMio
                          ? 'ml-6 border-indigo-500/35 bg-indigo-950/35 text-white'
                          : 'mr-6 border-slate-800 bg-slate-900/85 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-indigo-400">@{msg.username}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">
                            {new Date(msg.created_at).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {esMio && (
                            <button
                              type="button"
                              onClick={() => borrarMensaje(msg.id)}
                              disabled={eliminandoId === msg.id}
                              className="rounded-lg p-0.5 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-50"
                              title="Borrar mensaje"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 break-words text-xs">{msg.content}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="shrink-0 border-t border-slate-800 bg-slate-900/80 p-3">
              {avisoSpam && (
                <p className="mb-2 text-[11px] font-semibold text-amber-300">
                  {avisoSpam}
                </p>
              )}
              <form onSubmit={enviar} className="flex gap-2">
                <input
                  type="text"
                  maxLength={300}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={
                    segundosEspera > 0
                      ? `Espera ${segundosEspera}s para enviar otro mensaje...`
                      : modoSala === 'privado'
                      ? `Escribe en ${nombreGrupoActivo}...`
                      : 'Escribe un mensaje en vivo...'
                  }
                  disabled={!puedeEscribirEnModoActual || segundosEspera > 0}
                  className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={
                    !puedeEscribirEnModoActual ||
                    !texto.trim() ||
                    enviando ||
                    segundosEspera > 0
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {segundosEspera > 0 ? `${segundosEspera}s` : 'Enviar'}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}