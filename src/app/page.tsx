'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  discoverMediaAvanzado,
  searchMedia,
  getPosterUrl,
  getSeasonBreakdown,
  MediaTMDB,
  MediaType,
  CategoriaFiltro,
  PLATAFORMAS_ES,
  GENEROS_ES,
} from '@/lib/tmdb';
import { supabase } from '@/lib/supabase';
import AuthModal from '@/components/AuthModal';
import SerieModal, { SeguimientoExtraModal } from '@/components/SerieModal';
import ComunidadFeed from '@/components/ComunidadFeed';
import UserProfileModal from '@/components/UserProfileModal';
import { Coleccion } from '@/components/ColeccionesBar';
import ProximosEstrenosBar from '@/components/ProximosEstrenosBar';
import RecomendacionesParaTi from '@/components/RecomendacionesParaTi';
import RuletaDecisionModal from '@/components/RuletaDecisionModal';
import {
  Search, Star, Tv, Film, Check, Clock, Eye, PauseCircle, Sparkles,
  User, LogOut, Bookmark, Users, Plus, Trash2, ChevronDown,
  Clapperboard, Flame, SlidersHorizontal, RotateCcw, FolderPlus,
  Calendar, Folder, Library, Globe, Lock, Compass, ArrowUpDown,
  Bell, Dices, LogIn, BookmarkCheck
} from 'lucide-react';

type EstadoMedia = 'watching' | 'completed' | 'watchlist' | 'dropped';
type TabBiblioteca = 'catalogo' | 'colecciones' | 'estrenos';
type OrdenBiblioteca = 'recientes' | 'nota' | 'alfabetico';
type VistaPrincipal = 'explorar' | 'biblioteca' | 'comunidad' | 'perfil';

interface ItemGuardado {
  tmdb_id: number;
  media_type: MediaType;
  status: EstadoMedia;
  rating: number;
  current_season: number;
  current_episode: number;
  started_at?: string | null;
  finished_at?: string | null;
  rewatch_count?: number;
  title?: string;
  poster_path?: string | null;
}

export default function Home() {
  const [items, setItems] = useState<MediaTMDB[]>([]);
  const [query, setQuery] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<CategoriaFiltro>('all');
  const [plataformaId, setPlataformaId] = useState<string>('');
  const [generoId, setGeneroId] = useState<string>('');
  const [tabBiblioteca, setTabBiblioteca] = useState<TabBiblioteca>('catalogo');
  const [loading, setLoading] = useState(true);
  const [cargandoUsuario, setCargandoUsuario] = useState(true);
  const [vista, setVista] = useState<VistaPrincipal>('explorar');
  const peticionEpRef = useRef<Record<string, number>>({});

  const [busquedaBiblio, setBusquedaBiblio] = useState('');
  const [ordenBiblio, setOrdenBiblio] = useState<OrdenBiblioteca>('recientes');

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [mostrarRuleta, setMostrarRuleta] = useState(false);
  const [notificacionesCount, setNotificacionesCount] = useState(0);

  const [nuevaColNombre, setNuevaColNombre] = useState('');
  const [nuevaColDesc, setNuevaColDesc] = useState('');
  const [nuevaColPublica, setNuevaColPublica] = useState(true);
  const [creandoCol, setCreandoCol] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string>('');
  const [showAuth, setShowAuth] = useState(false);
  const [itemActivo, setItemActivo] = useState<MediaTMDB | null>(null);
  const [perfilActivoId, setPerfilActivoId] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [notasEpisodiosMap, setNotasEpisodiosMap] = useState<Record<string, number>>({});
  const [temporadasCache, setTemporadasCache] = useState<Record<number, Record<number, number>>>({});
  const [miLista, setMiLista] = useState<Record<string, ItemGuardado>>({});
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [cacheTitulos, setCacheTitulos] = useState<Record<string, { title: string; poster_path: string | null }>>({});

  const mostrarToast = useCallback((texto: string) => {
    setToastMsg(texto);
    setTimeout(() => {
      setToastMsg((prev) => (prev === texto ? null : prev));
    }, 2800);
  }, []);

  const abrirPerfil = useCallback((uid: string) => {
    if (!uid) return;
    setPerfilActivoId(uid);
    setVista('perfil');
  }, []);

  const cargarDatosUsuario = useCallback(async (userId: string) => {
    setCargandoUsuario(true);

    const [
      { data: profile },
      { data: episodiosData },
      { data: userSeries, error: errorSeries },
      { data: colsData },
    ] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', userId).single(),
      supabase
        .from('watched_episodes')
        .select('tmdb_id, season_number, episode_number, rating')
        .eq('user_id', userId),
      supabase
        .from('user_series')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);

    if (profile?.username) setUsername(profile.username);

    const notasMap: Record<string, number> = {};
    (episodiosData || []).forEach((ep: any) => {
      if (ep.rating > 0) {
        notasMap[`${ep.tmdb_id}-${ep.season_number}-${ep.episode_number}`] = ep.rating;
      }
    });
    setNotasEpisodiosMap(notasMap);

    let colItemsData: any[] = [];
    if (colsData && colsData.length > 0) {
      const colIds = colsData.map((c) => c.id);
      const { data: cItems } = await supabase
        .from('collection_items')
        .select('*')
        .in('collection_id', colIds);
      colItemsData = cItems || [];
    }

    const colsFormateadas: Coleccion[] = (colsData || []).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      description: c.description || '',
      is_public: c.is_public,
      itemsKeys: colItemsData
        .filter((ci) => ci.collection_id === c.id)
        .map((ci) => `${ci.media_type || 'tv'}-${ci.tmdb_id}`),
    }));
    setColecciones(colsFormateadas);

    if (errorSeries) {
      console.error('Error cargando biblioteca:', errorSeries.message);
      setCargandoUsuario(false);
      return;
    }

    const todosIds = Array.from(
      new Set([
        ...(userSeries || []).map((u) => u.tmdb_id),
        ...colItemsData.map((ci) => ci.tmdb_id),
      ])
    );

    const cacheMap: Record<string, { title: string; poster_path: string | null }> = {};
    if (todosIds.length > 0) {
      const { data: cacheData } = await supabase
        .from('series_cache')
        .select('*')
        .in('tmdb_id', todosIds);

      (cacheData || []).forEach((c: any) => {
        cacheMap[`${c.media_type || 'tv'}-${c.tmdb_id}`] = {
          title: c.title,
          poster_path: c.poster_path,
        };
      });
    }
    setCacheTitulos(cacheMap);

    if (userSeries && userSeries.length > 0) {
      const mapa: Record<string, ItemGuardado> = {};
      userSeries.forEach((item: any) => {
        const tipo = (item.media_type || 'tv') as MediaType;
        const clave = `${tipo}-${item.tmdb_id}`;
        const infoCache = cacheMap[clave];
        mapa[clave] = {
          tmdb_id: item.tmdb_id,
          media_type: tipo,
          status: item.status,
          rating: item.rating || 0,
          current_season: item.current_season || 1,
          current_episode: item.current_episode || 1,
          started_at: item.started_at ?? null,
          finished_at: item.finished_at ?? null,
          rewatch_count: Number(item.rewatch_count ?? 0),
          title: infoCache?.title || 'Título guardado',
          poster_path: infoCache?.poster_path || null,
        };
      });
      setMiLista(mapa);
    } else {
      setMiLista({});
    }

    setCargandoUsuario(false);
  }, []);

  const comprobarSesion = useCallback(async () => {
    setCargandoUsuario(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      setPerfilActivoId((prev) => prev || session.user.id);
      await cargarDatosUsuario(session.user.id);
    } else {
      setUser(null);
      setCargandoUsuario(false);
    }
  }, [cargarDatosUsuario]);

  const cargarCatalogo = useCallback(
    async (
      cat: CategoriaFiltro = filtroTipo,
      plat: string = plataformaId,
      gen: string = generoId
    ) => {
      setLoading(true);
      try {
        const data = await discoverMediaAvanzado({
          categoria: cat,
          plataformaId: plat,
          generoId: gen,
        });
        setItems(data);
      } catch (error) {
        console.error(error);
      }
      setLoading(false);
    },
    [filtroTipo, plataformaId, generoId]
  );

  useEffect(() => {
    cargarCatalogo('all', '', '');
    comprobarSesion();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        setPerfilActivoId((prev) => prev || nextUser.id);
        cargarDatosUsuario(nextUser.id);
      } else {
        setUsername('');
        setMiLista({});
        setColecciones([]);
        setVista((prev) => (prev === 'biblioteca' || prev === 'perfil' ? 'explorar' : prev));
        setCargandoUsuario(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [cargarCatalogo, comprobarSesion, cargarDatosUsuario]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mediaParam = params.get('media');
    const userParam = params.get('user');

    if (userParam) {
      setPerfilActivoId(userParam);
      setVista('perfil');
    } else if (mediaParam) {
      const [tipoRaw, idRaw] = mediaParam.split('-');
      const idNum = Number(idRaw);
      if (idNum) {
        const tipo = tipoRaw === 'movie' ? 'movie' : 'tv';
        fetch(
          `https://api.themoviedb.org/3/${tipo}/${idNum}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`
        )
          .then((r) => r.json())
          .then((d) => {
            if (d?.id) {
              setItemActivo({
                id: d.id,
                media_type: tipo,
                name: d.title || d.name,
                overview: d.overview || '',
                poster_path: d.poster_path,
                backdrop_path: d.backdrop_path,
                first_air_date: d.release_date || d.first_air_date || '',
                vote_average: d.vote_average || 0,
              });
            }
          });
      }
    }
  }, []);

  const cargarNotificacionesSociales = useCallback(async () => {
    if (!user) return;
    const [{ count: solCount }, { count: msgCount }] = await Promise.all([
      supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('read', false),
    ]);
    setNotificacionesCount((solCount || 0) + (msgCount || 0));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotificacionesCount(0);
      return;
    }
    cargarNotificacionesSociales();
    const timer = setInterval(cargarNotificacionesSociales, 15000);
    return () => clearInterval(timer);
  }, [user?.id, vista, cargarNotificacionesSociales, user]);

  async function cargarNotasSerie(tmdbId: number) {
    if (!user) return;
    const { data } = await supabase
      .from('watched_episodes')
      .select('season_number, episode_number, rating')
      .eq('user_id', user.id)
      .eq('tmdb_id', tmdbId);

    if (!data) return;
    setNotasEpisodiosMap((prev) => {
      const copia = { ...prev };
      data.forEach((ep: any) => {
        copia[`${tmdbId}-${ep.season_number}-${ep.episode_number}`] = ep.rating || 0;
      });
      return copia;
    });
  }

  async function handleCrearColeccionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !nuevaColNombre.trim()) return;
    setCreandoCol(true);
    const { data, error } = await supabase
      .from('user_collections')
      .insert({
        user_id: user.id,
        name: nuevaColNombre.trim(),
        description: nuevaColDesc.trim(),
        is_public: nuevaColPublica,
      })
      .select()
      .single();

    if (error) {
      mostrarToast('No se pudo crear la colección');
      setCreandoCol(false);
      return;
    }

    if (data) {
      setColecciones((prev) => [
        ...prev,
        {
          id: data.id,
          user_id: data.user_id,
          name: data.name,
          description: data.description || '',
          is_public: data.is_public,
          itemsKeys: [],
        },
      ]);
      mostrarToast(`Colección "${data.name}" creada`);
      setNuevaColNombre('');
      setNuevaColDesc('');
      setNuevaColPublica(true);
    }
    setCreandoCol(false);
  }

  async function handleEliminarColeccion(id: string) {
    if (!user) return;
    setColecciones((prev) => prev.filter((c) => c.id !== id));
    await supabase.from('user_collections').delete().eq('id', id);
    mostrarToast('Colección eliminada');
  }

  async function handleToggleVisibilidadColeccion(id: string, nuevoEstadoPublico: boolean) {
    if (!user) return;
    setColecciones((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_public: nuevoEstadoPublico } : c))
    );
    await supabase
      .from('user_collections')
      .update({ is_public: nuevoEstadoPublico })
      .eq('id', id)
      .eq('user_id', user.id);
    mostrarToast(nuevoEstadoPublico ? 'Colección ahora es pública' : 'Colección ahora es privada');
  }

  async function toggleItemEnColeccion(colId: string, item: MediaTMDB) {
    if (!user) return setShowAuth(true);
    const clave = `${item.media_type}-${item.id}`;
    const col = colecciones.find((c) => c.id === colId);
    if (!col) return;

    const yaEsta = col.itemsKeys.includes(clave);

    setColecciones((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        return {
          ...c,
          itemsKeys: yaEsta
            ? c.itemsKeys.filter((k) => k !== clave)
            : [...c.itemsKeys, clave],
        };
      })
    );

    if (yaEsta) {
      await supabase
        .from('collection_items')
        .delete()
        .eq('collection_id', colId)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type);
      mostrarToast(`Quitado de "${col.name}"`);
    } else {
      await supabase.from('series_cache').upsert(
        {
          tmdb_id: item.id,
          media_type: item.media_type,
          title: item.name,
          poster_path: item.poster_path,
        },
        { onConflict: 'tmdb_id,media_type' }
      );

      setCacheTitulos((prev) => ({
        ...prev,
        [clave]: { title: item.name, poster_path: item.poster_path },
      }));

      await supabase.from('collection_items').insert({
        collection_id: colId,
        tmdb_id: item.id,
        media_type: item.media_type,
      });
      mostrarToast(`Añadido a "${col.name}"`);
    }
  }

  async function asegurarTemporadas(tmdbId: number) {
    if (temporadasCache[tmdbId]) return;
    const mapa = await getSeasonBreakdown(tmdbId);
    setTemporadasCache((prev) => ({ ...prev, [tmdbId]: mapa }));
  }

  async function cambiarFiltroTipo(nuevoTipo: CategoriaFiltro) {
    setFiltroTipo(nuevoTipo);
    if (vista === 'explorar') {
      if (query.trim()) {
        setLoading(true);
        const tipoBusqueda = nuevoTipo === 'tv' || nuevoTipo === 'movie' ? nuevoTipo : 'all';
        const resultados = await searchMedia(query, tipoBusqueda);
        setItems(resultados);
        setLoading(false);
      } else {
        cargarCatalogo(nuevoTipo, plataformaId, generoId);
      }
    }
  }

  function cambiarPlataforma(nuevaPlat: string) {
    setPlataformaId(nuevaPlat);
    setQuery('');
    cargarCatalogo(filtroTipo, nuevaPlat, generoId);
  }

  function cambiarGenero(nuevoGen: string) {
    setGeneroId(nuevoGen);
    setQuery('');
    cargarCatalogo(filtroTipo, plataformaId, nuevoGen);
  }

  function limpiarFiltros() {
    setFiltroTipo('all');
    setPlataformaId('');
    setGeneroId('');
    setQuery('');
    cargarCatalogo('all', '', '');
  }

  async function handleSearch(texto: string) {
    setQuery(texto);
    setVista('explorar');
    if (!texto.trim()) {
      cargarCatalogo(filtroTipo, plataformaId, generoId);
      return;
    }
    setLoading(true);
    const tipoBusqueda = filtroTipo === 'tv' || filtroTipo === 'movie' ? filtroTipo : 'all';
    const resultados = await searchMedia(texto, tipoBusqueda);
    setItems(resultados);
    setLoading(false);
  }

  async function registrarEpisodioVisto(
    item: MediaTMDB,
    season: number,
    episode: number,
    rating?: number
  ) {
    if (!user) return;
    const clave = `${item.id}-${season}-${episode}`;
    const notaFinal =
      typeof rating === 'number' ? rating : notasEpisodiosMap[clave] || 0;

    if (typeof rating === 'number') {
      setNotasEpisodiosMap((prev) => ({
        ...prev,
        [clave]: rating,
      }));
    }

    const turno = (peticionEpRef.current[clave] || 0) + 1;
    peticionEpRef.current[clave] = turno;

    const { error } = await supabase.from('watched_episodes').upsert(
      {
        user_id: user.id,
        tmdb_id: item.id,
        season_number: season,
        episode_number: episode,
        rating: notaFinal,
        watched_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,season_number,episode_number' }
    );

    if (error) {
      console.error('Error guardando nota de episodio:', error.message);
      return;
    }

    if (peticionEpRef.current[clave] === turno && typeof rating === 'number') {
      setNotasEpisodiosMap((prev) => ({
        ...prev,
        [clave]: notaFinal,
      }));
    }
  }

  async function guardarEnNube(
    item: MediaTMDB,
    status: EstadoMedia,
    rating: number,
    season?: number,
    episode?: number,
    extra?: SeguimientoExtraModal
  ) {
    if (!user) {
      setShowAuth(true);
      return;
    }

    if (item.media_type === 'tv') {
      asegurarTemporadas(item.id);
    }

    const clave = `${item.media_type}-${item.id}`;
    const previo = miLista[clave];
    const nuevaTemporada = season ?? previo?.current_season ?? 1;
    const nuevoEpisodio = episode ?? previo?.current_episode ?? 1;
    const hoyISO = new Date().toISOString().slice(0, 10);

    const startedAtFinal =
      extra?.started_at !== undefined
        ? extra.started_at
        : previo?.started_at ??
          (status === 'watching' || status === 'completed' ? hoyISO : null);

    const finishedAtFinal =
      extra?.finished_at !== undefined
        ? extra.finished_at
        : previo?.finished_at ?? (status === 'completed' ? hoyISO : null);

    const rewatchFinal =
      extra?.rewatch_count !== undefined
        ? Math.max(0, extra.rewatch_count)
        : status === 'completed'
        ? Math.max(1, Number(previo?.rewatch_count || 0))
        : Number(previo?.rewatch_count || 0);

    setMiLista((prev) => ({
      ...prev,
      [clave]: {
        tmdb_id: item.id,
        media_type: item.media_type,
        status,
        rating,
        current_season: nuevaTemporada,
        current_episode: nuevoEpisodio,
        started_at: startedAtFinal,
        finished_at: finishedAtFinal,
        rewatch_count: rewatchFinal,
        title: item.name,
        poster_path: item.poster_path,
      },
    }));

    const etiquetaEstado =
      status === 'watching'
        ? item.media_type === 'tv'
          ? `Viendo (T${nuevaTemporada} E${nuevoEpisodio})`
          : 'Viendo'
        : status === 'completed'
        ? 'Completado'
        : status === 'dropped'
        ? 'Abandonada'
        : 'Pendiente';
    mostrarToast(`${item.name} · ${etiquetaEstado}${rating > 0 ? ` · ★${rating}` : ''}`);

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        username: username || user.email?.split('@')[0] || 'usuario',
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    const { error: errorCache } = await supabase.from('series_cache').upsert(
      {
        tmdb_id: item.id,
        media_type: item.media_type,
        title: item.name,
        poster_path: item.poster_path,
      },
      { onConflict: 'tmdb_id,media_type' }
    );

    if (errorCache) {
      mostrarToast('No se pudo actualizar la caché del título');
      return;
    }

    const { error: errorLista } = await supabase.from('user_series').upsert(
      {
        user_id: user.id,
        tmdb_id: item.id,
        media_type: item.media_type,
        status,
        rating,
        current_season: nuevaTemporada,
        current_episode: nuevoEpisodio,
        started_at: startedAtFinal,
        finished_at: finishedAtFinal,
        rewatch_count: rewatchFinal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,media_type' }
    );

    if (errorLista) {
      mostrarToast('No se pudo guardar en tu biblioteca');
    }
  }

  async function eliminarDeLista(item: MediaTMDB) {
    if (!user) return;
    const clave = `${item.media_type}-${item.id}`;

    setMiLista((prev) => {
      const copia = { ...prev };
      delete copia[clave];
      return copia;
    });
    setMenuAbierto(null);
    mostrarToast(`"${item.name}" eliminado de tu lista`);

    await supabase
      .from('user_series')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type);
  }

  const todosGuardados = Object.values(miLista);
  const totalBiblioteca = todosGuardados.length;
  const viendoAhoraLista = todosGuardados.filter((i) => i.status === 'watching');

  const cumpleFiltroTipo = (mediaType: MediaType) => {
    if (filtroTipo === 'tv' || filtroTipo === 'reality') return mediaType === 'tv';
    if (filtroTipo === 'movie') return mediaType === 'movie';
    return true;
  };

  const filtrarYOrdenarBiblio = (lista: ItemGuardado[]): MediaTMDB[] => {
    const filtrada = lista.filter((i) => {
      if (!cumpleFiltroTipo(i.media_type)) return false;
      if (busquedaBiblio.trim()) {
        return (i.title || '').toLowerCase().includes(busquedaBiblio.trim().toLowerCase());
      }
      return true;
    });

    const ordenada = [...filtrada];
    if (ordenBiblio === 'nota') {
      ordenada.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (ordenBiblio === 'alfabetico') {
      ordenada.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'es'));
    }

    return ordenada.map((info) => ({
      id: info.tmdb_id,
      media_type: info.media_type,
      name: info.title || 'Guardado',
      overview: '',
      poster_path: info.poster_path || null,
      backdrop_path: null,
      first_air_date: '',
      vote_average: info.rating || 0,
    }));
  };

  const bloquesCatalogo: {
    key: EstadoMedia;
    titulo: string;
    subtitulo: string;
    icono: React.ReactNode;
    acentoBorder: string;
    acentoBadge: string;
    items: MediaTMDB[];
  }[] = [
    {
      key: 'watching',
      titulo: 'Viendo ahora',
      subtitulo: 'En progreso actualmente',
      icono: <Eye className="h-4 w-4 text-indigo-400" />,
      acentoBorder: 'border-indigo-500/30',
      acentoBadge: 'bg-indigo-500/20 text-indigo-300',
      items: filtrarYOrdenarBiblio(todosGuardados.filter((i) => i.status === 'watching')),
    },
    {
      key: 'watchlist',
      titulo: 'Pendientes',
      subtitulo: 'En tu lista para ver pronto',
      icono: <Clock className="h-4 w-4 text-amber-400" />,
      acentoBorder: 'border-amber-500/30',
      acentoBadge: 'bg-amber-500/20 text-amber-300',
      items: filtrarYOrdenarBiblio(todosGuardados.filter((i) => i.status === 'watchlist')),
    },
    {
      key: 'completed',
      titulo: 'Terminadas y Vistas',
      subtitulo: 'Completadas en tu historial',
      icono: <Check className="h-4 w-4 text-emerald-400" />,
      acentoBorder: 'border-emerald-500/30',
      acentoBadge: 'bg-emerald-500/20 text-emerald-300',
      items: filtrarYOrdenarBiblio(todosGuardados.filter((i) => i.status === 'completed')),
    },
    {
      key: 'dropped',
      titulo: 'Abandonadas / En pausa',
      subtitulo: 'Dejadas a medias por ahora',
      icono: <PauseCircle className="h-4 w-4 text-rose-400" />,
      acentoBorder: 'border-rose-500/30',
      acentoBadge: 'bg-rose-500/20 text-rose-300',
      items: filtrarYOrdenarBiblio(todosGuardados.filter((i) => i.status === 'dropped')),
    },
  ];

  const tituloSeccion = () => {
    if (vista === 'perfil') return 'Perfil';
    if (vista === 'biblioteca') {
      if (tabBiblioteca === 'estrenos') return 'Próximos Estrenos';
      if (tabBiblioteca === 'colecciones') return 'Mis Colecciones';
      return 'Mi Biblioteca';
    }
    if (query) return `Resultados para "${query}"`;

    const nombrePlat = PLATAFORMAS_ES.find((p) => p.id === plataformaId)?.nombre;
    const nombreGen = GENEROS_ES.find((g) => g.id === generoId)?.nombre;

    if (plataformaId || generoId) {
      const partes = [
        filtroTipo === 'tv'
          ? 'Series'
          : filtroTipo === 'movie'
          ? 'Películas'
          : filtroTipo === 'documentary'
          ? 'Documentales'
          : filtroTipo === 'reality'
          ? 'Realities'
          : 'Catálogo',
        generoId ? `de ${nombreGen}` : '',
        plataformaId ? `en ${nombrePlat}` : '',
      ].filter(Boolean);
      return partes.join(' ');
    }

    if (filtroTipo === 'documentary') return 'Documentales destacados';
    if (filtroTipo === 'reality') return 'Realities populares';
    if (filtroTipo === 'tv') return 'Series en tendencia';
    if (filtroTipo === 'movie') return 'Películas en tendencia';
    return 'Tendencias de la semana';
  };

  const hayFiltrosActivos = filtroTipo !== 'all' || plataformaId !== '' || generoId !== '';
  const mostrarFiltrosTipo =
    vista === 'explorar' ||
    (vista === 'biblioteca' && (tabBiblioteca === 'catalogo' || tabBiblioteca === 'colecciones'));

  function renderGridTarjetas(lista: MediaTMDB[], prefijoKey: string = '') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
        {lista.map((item) => {
          const clave = `${item.media_type}-${item.id}`;
          const claveMenu = `${prefijoKey}${clave}`;
          const infoUsuario = miLista[clave];
          const esPeli = item.media_type === 'movie';
          const abierto = menuAbierto === claveMenu;

          const mapaTemps = temporadasCache[item.id] || { 1: 24 };
          const listaTemporadas = Object.keys(mapaTemps).map(Number);
          const tempActual = infoUsuario?.current_season || 1;
          const maxEpisodiosTemp = mapaTemps[tempActual] || 24;

          return (
            <div key={claveMenu} className="group flex flex-col">
              <div
                onClick={() => setItemActivo(item)}
                className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900 shadow-lg transition duration-300 group-hover:-translate-y-1 group-hover:border-indigo-500/60 group-hover:shadow-2xl group-hover:shadow-indigo-950/40"
              >
                <img
                  src={getPosterUrl(item.poster_path)}
                  alt={item.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-950/65 to-transparent" />

                <div
                  className={`absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase backdrop-blur-md ${
                    esPeli
                      ? 'bg-rose-950/85 text-rose-300'
                      : 'bg-slate-950/80 text-slate-300'
                  }`}
                >
                  {esPeli ? <Film className="h-3 w-3" /> : <Tv className="h-3 w-3" />}
                  {esPeli ? 'Peli' : 'Serie'}
                </div>

                {item.vote_average > 0 && (
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-slate-950/85 px-2 py-0.5 text-xs font-semibold text-amber-400 backdrop-blur-sm">
                    <Star className="h-3 w-3 fill-amber-400" />
                    {item.vote_average.toFixed(1)}
                  </div>
                )}
              </div>

              <div className="mt-2.5 px-0.5">
                <h3
                  onClick={() => setItemActivo(item)}
                  className="line-clamp-1 cursor-pointer text-sm font-semibold text-white transition group-hover:text-indigo-400"
                  title={item.name}
                >
                  {item.name}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {item.first_air_date ? item.first_air_date.slice(0, 4) : esPeli ? 'Película' : 'Serie'}
                </p>
              </div>

              <div onClick={(e) => e.stopPropagation()} className="relative mt-2">
                <button
                  onClick={() => {
                    if (!user) return setShowAuth(true);
                    if (!abierto && !esPeli) {
                      asegurarTemporadas(item.id);
                      cargarNotasSerie(item.id);
                    }
                    setMenuAbierto(abierto ? null : claveMenu);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold shadow-sm transition active:scale-[0.98] ${
                    !infoUsuario
                      ? 'border-indigo-500/40 bg-indigo-600/20 text-indigo-200 hover:border-indigo-400 hover:bg-indigo-600 hover:text-white hover:shadow-md hover:shadow-indigo-600/25'
                      : infoUsuario.status === 'watching'
                      ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-500'
                      : infoUsuario.status === 'completed'
                      ? 'border-emerald-400/60 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500'
                      : infoUsuario.status === 'dropped'
                      ? 'border-rose-400/60 bg-rose-600 text-white shadow-md shadow-rose-600/25 hover:bg-rose-500'
                      : 'border-amber-400/60 bg-amber-600 text-white shadow-md shadow-amber-600/25 hover:bg-amber-500'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {!infoUsuario && (
                      <>
                        <Plus className="h-3.5 w-3.5 shrink-0" />
                        Añadir a mi lista
                      </>
                    )}
                    {infoUsuario?.status === 'watching' && (
                      <>
                        <Eye className="h-3.5 w-3.5 shrink-0" />
                        {esPeli
                          ? 'Viendo'
                          : `Viendo · T${infoUsuario.current_season} E${infoUsuario.current_episode}`}
                      </>
                    )}
                    {infoUsuario?.status === 'completed' && (
                      <>
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        {infoUsuario.rating > 0
                          ? `Vista · ★ ${infoUsuario.rating}`
                          : 'Vista'}
                      </>
                    )}
                    {infoUsuario?.status === 'watchlist' && (
                      <>
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        Pendiente
                      </>
                    )}
                    {infoUsuario?.status === 'dropped' && (
                      <>
                        <PauseCircle className="h-3.5 w-3.5 shrink-0" />
                        Abandonada
                      </>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                      abierto ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {abierto && (
                  <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                    <button
                      onClick={() => {
                        guardarEnNube(item, 'watching', infoUsuario?.rating || 0);
                        if (esPeli) setMenuAbierto(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                        infoUsuario?.status === 'watching'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Viendo
                    </button>

                    <button
                      onClick={() => {
                        guardarEnNube(item, 'completed', infoUsuario?.rating || 0);
                        setMenuAbierto(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                        infoUsuario?.status === 'completed'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {esPeli ? 'Vista' : 'Terminada'}
                    </button>

                    <button
                      onClick={() => {
                        guardarEnNube(item, 'watchlist', infoUsuario?.rating || 0);
                        setMenuAbierto(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                        infoUsuario?.status === 'watchlist'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Pendiente
                    </button>

                    <button
                      onClick={() => {
                        guardarEnNube(item, 'dropped', infoUsuario?.rating || 0);
                        setMenuAbierto(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                        infoUsuario?.status === 'dropped'
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                      Abandonada
                    </button>

                    {!esPeli && infoUsuario?.status === 'watching' && (
                      <div className="my-1.5 space-y-1.5 rounded-xl bg-slate-950 p-2 text-xs">
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            value={tempActual}
                            onChange={(e) =>
                              guardarEnNube(
                                item,
                                'watching',
                                infoUsuario.rating,
                                Number(e.target.value),
                                1
                              )
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-white focus:border-indigo-500 focus:outline-none"
                          >
                            {listaTemporadas.map((t) => (
                              <option key={t} value={t}>
                                Temp {t}
                              </option>
                            ))}
                          </select>

                          <select
                            value={infoUsuario.current_episode}
                            onChange={(e) =>
                              guardarEnNube(
                                item,
                                'watching',
                                infoUsuario.rating,
                                tempActual,
                                Number(e.target.value)
                              )
                            }
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                          >
                            {[...Array(maxEpisodiosTemp)].map((_, idx) => (
                              <option key={idx + 1} value={idx + 1}>
                                Ep {idx + 1}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => {
                            const siguienteEp = infoUsuario.current_episode + 1;
                            if (siguienteEp <= maxEpisodiosTemp) {
                              guardarEnNube(item, 'watching', infoUsuario.rating, tempActual, siguienteEp);
                              registrarEpisodioVisto(item, tempActual, siguienteEp);
                            } else if (mapaTemps[tempActual + 1]) {
                              guardarEnNube(item, 'watching', infoUsuario.rating, tempActual + 1, 1);
                              registrarEpisodioVisto(item, tempActual + 1, 1);
                            } else {
                              registrarEpisodioVisto(item, tempActual, infoUsuario.current_episode);
                              guardarEnNube(item, 'completed', infoUsuario.rating, tempActual, infoUsuario.current_episode);
                              setMenuAbierto(null);
                            }
                          }}
                          className="flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-500"
                        >
                          <Plus className="h-3 w-3" />
                          Siguiente episodio
                        </button>

                        <div className="flex items-center justify-between border-t border-slate-800/90 pt-1.5">
                          <span className="text-[10px] font-medium text-slate-400">
                            Nota Ep {infoUsuario.current_episode}:
                          </span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((estrellaEp) => {
                              const claveEp = `${item.id}-${tempActual}-${infoUsuario.current_episode}`;
                              const notaActualEp = Number(notasEpisodiosMap[claveEp] ?? 0);
                              const nuevaNotaEp = notaActualEp === estrellaEp ? 0 : estrellaEp;
                              return (
                                <button
                                  key={estrellaEp}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotasEpisodiosMap((prev) => ({
                                      ...prev,
                                      [claveEp]: nuevaNotaEp,
                                    }));
                                    registrarEpisodioVisto(
                                      item,
                                      tempActual,
                                      infoUsuario.current_episode,
                                      nuevaNotaEp
                                    );
                                    mostrarToast(
                                      nuevaNotaEp === 0
                                        ? `${item.name} · T${tempActual} E${infoUsuario.current_episode} · Nota borrada`
                                        : `${item.name} · T${tempActual} E${infoUsuario.current_episode} ★${nuevaNotaEp}`
                                    );
                                  }}
                                  className="p-0.5 text-slate-600 transition hover:scale-110 hover:text-amber-400"
                                  title={
                                    nuevaNotaEp === 0
                                      ? 'Quitar puntuación del episodio'
                                      : `Puntuar episodio con ${estrellaEp}`
                                  }
                                >
                                  <Star
                                    className={`h-3.5 w-3.5 ${
                                      notaActualEp >= estrellaEp
                                        ? 'fill-amber-400 text-amber-400'
                                        : ''
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {colecciones.length > 0 && (
                      <div className="mt-1 border-t border-slate-800 pt-1.5 pb-1">
                        <p className="flex items-center gap-1 px-2.5 pb-1 text-[10px] font-bold uppercase text-slate-500">
                          <FolderPlus className="h-3 w-3" /> Colecciones:
                        </p>
                        <div className="max-h-28 space-y-0.5 overflow-y-auto px-1">
                          {colecciones.map((col) => {
                            const enCol = col.itemsKeys.includes(clave);
                            return (
                              <button
                                key={col.id}
                                onClick={() => toggleItemEnColeccion(col.id, item)}
                                className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] transition ${
                                  enCol
                                    ? 'bg-indigo-600/20 font-semibold text-indigo-300'
                                    : 'text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <span className="truncate">{col.name}</span>
                                {enCol && <Check className="h-3 w-3 shrink-0 text-indigo-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-1 flex items-center justify-between border-t border-slate-800 px-2.5 pt-2 pb-1">
                      <span className="text-[11px] text-slate-400">Nota:</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((estrella) => {
                          const notaActual = Number(infoUsuario?.rating ?? 0);
                          const nuevaNota = notaActual === estrella ? 0 : estrella;
                          return (
                            <button
                              key={estrella}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                guardarEnNube(
                                  item,
                                  infoUsuario?.status || 'completed',
                                  nuevaNota
                                );
                                setMenuAbierto(null);
                              }}
                              className="p-0.5 text-slate-600 transition hover:scale-110 hover:text-amber-400"
                              title={nuevaNota === 0 ? 'Quitar puntuación' : `Puntuar con ${estrella}`}
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  notaActual >= estrella
                                    ? 'fill-amber-400 text-amber-400'
                                    : ''
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {infoUsuario && (
                      <button
                        onClick={() => eliminarDeLista(item)}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-medium text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar de mi lista
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      onClick={() => menuAbierto && setMenuAbierto(null)}
      className="min-h-screen bg-slate-950 pb-20 text-slate-100 md:pb-8"
    >
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between">
            <div
              onClick={() => {
                setVista('explorar');
                limpiarFiltros();
              }}
              className="flex cursor-pointer items-center gap-3"
            >
              <img
                src="/logoplotverse.jpeg"
                alt="Logo"
                className="h-10 w-10 rounded-xl border border-indigo-500/40 object-cover shadow-lg shadow-indigo-950/40"
              />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">PlotVerse</h1>
                <p className="text-xs text-slate-400">Toda historia tiene un Twist</p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              {user ? (
                <>
                  <button
                    onClick={() => setVista('comunidad')}
                    title="Solicitudes y mensajes"
                    className="relative rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-200 shadow-sm transition hover:border-indigo-400 hover:text-indigo-300"
                  >
                    <Bell className="h-4 w-4" />
                    {notificacionesCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                        {notificacionesCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => abrirPerfil(user.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm transition ${
                      vista === 'perfil' && perfilActivoId === user.id
                        ? 'border-indigo-400 bg-indigo-600 text-white'
                        : 'border-indigo-400/50 bg-indigo-600/25 text-indigo-200 hover:bg-indigo-600 hover:text-white'
                    }`}
                  >
                    @{username || 'usuario'}
                  </button>
                  <button
                    onClick={() => supabase.auth.signOut()}
                    className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-300"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="flex items-center gap-1.5 rounded-full border border-indigo-400/50 bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-600/35 transition hover:bg-indigo-500"
                >
                  <User className="h-3.5 w-3.5" />
                  Entrar
                </button>
              )}
            </div>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar series, pelis, realities..."
              className="w-full rounded-full border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 shadow-inner transition focus:border-indigo-400 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() => setVista('explorar')}
              className={`rounded-full border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                vista === 'explorar'
                  ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
              }`}
            >
              Explorar
            </button>

            <button
              onClick={() => setVista('comunidad')}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                vista === 'comunidad'
                  ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Comunidad
            </button>

            <button
              onClick={() => (user ? setVista('biblioteca') : setShowAuth(true))}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                vista === 'biblioteca'
                  ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Mi Biblioteca ({cargandoUsuario ? '...' : totalBiblioteca})
            </button>

            {user ? (
              <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
                <button
                  onClick={() => abrirPerfil(user.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                    vista === 'perfil'
                      ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <User className="h-3.5 w-3.5" />
                  @{username || 'perfil'}
                </button>

                <button
                  onClick={() => setVista('comunidad')}
                  title="Solicitudes y mensajes"
                  className="relative rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-200 shadow-sm transition hover:border-indigo-400 hover:text-indigo-300"
                >
                  <Bell className="h-4 w-4" />
                  {notificacionesCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                      {notificacionesCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => supabase.auth.signOut()}
                  title="Cerrar sesión"
                  className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-300"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 rounded-full border border-indigo-400/50 bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/35 transition hover:bg-indigo-500"
              >
                <User className="h-3.5 w-3.5" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {vista === 'perfil' && perfilActivoId ? (
          <UserProfileModal
            targetUserId={perfilActivoId}
            currentUser={user}
            onClose={() => setVista('explorar')}
            onSelectMedia={(media) => setItemActivo(media)}
            onRequireAuth={() => setShowAuth(true)}
            onNotify={mostrarToast}
          />
        ) : vista === 'comunidad' ? (
          <ComunidadFeed
            user={user}
            onSelectSerie={(serie: any) =>
              setItemActivo({ ...serie, media_type: serie.media_type || 'tv' })
            }
            onSelectUser={(uid) => abrirPerfil(uid)}
            onRequireAuth={() => setShowAuth(true)}
          />
        ) : (
          <>
            {/* Portada adaptable: Visitante sin sesión vs Usuario con sesión */}
            {vista === 'explorar' && !query.trim() && (
              <section className="mb-6 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/35 p-4 shadow-xl sm:p-6">
                {!user ? (
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="max-w-2xl space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold text-indigo-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>PlotVerse · Series, películas, documentales y realities</span>
                      </div>
                      <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                        Explora libremente y comenta en vivo con quienes ven lo mismo
                      </h1>
                      <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
                        Filtra por plataforma o género, decide qué empezar con la ruleta y crea tu cuenta cuando quieras guardar progreso, fechas y revisionados o entrar al chat en vivo del título.
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setMostrarRuleta(true)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-bold text-slate-100 transition hover:border-indigo-500 hover:text-white"
                      >
                        <Dices className="h-4 w-4 text-indigo-400" />
                        <span>¿Qué veo hoy?</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowAuth(true)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500"
                      >
                        <LogIn className="h-4 w-4" />
                        <span>Crear cuenta / Entrar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                          Bienvenido a PlotVerse
                        </p>
                        <h1 className="text-lg font-extrabold text-white sm:text-xl">
                          Hola, @{username || user.user_metadata?.username || user.email?.split('@')[0]}
                        </h1>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMostrarRuleta(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-indigo-500 hover:text-white"
                        >
                          <Dices className="h-3.5 w-3.5 text-indigo-400" />
                          <span>¿Qué veo hoy?</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setVista('biblioteca')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-500"
                        >
                          <BookmarkCheck className="h-3.5 w-3.5" />
                          <span>Mi Biblioteca ({totalBiblioteca})</span>
                        </button>
                      </div>
                    </div>

                    {viendoAhoraLista.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800/90 bg-slate-950/70 px-4 py-3 text-xs text-slate-400">
                        No tienes ningún título marcado como <strong className="text-indigo-300">Viendo</strong> ahora mismo. Abre cualquier ficha o explora abajo para empezar y entrar a su chat en vivo.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold uppercase tracking-wider text-slate-400">
                            Viendo ahora ({viendoAhoraLista.length})
                          </span>
                          <span className="text-slate-500">Toca un título para abrir ficha o chat</span>
                        </div>

                        <div className="flex gap-2.5 overflow-x-auto pb-1">
                          {viendoAhoraLista.slice(0, 8).map((item) => (
                            <button
                              key={`${item.media_type}-${item.tmdb_id}`}
                              type="button"
                              onClick={() =>
                                setItemActivo({
                                  id: item.tmdb_id,
                                  media_type: item.media_type || 'tv',
                                  name: item.title || 'Título guardado',
                                  overview: '',
                                  poster_path: item.poster_path || null,
                                  backdrop_path: null,
                                  first_air_date: '',
                                  vote_average: item.rating || 0,
                                })
                              }
                              className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/85 p-2 text-left transition hover:border-indigo-500/60"
                            >
                              <img
                                src={getPosterUrl(item.poster_path || null)}
                                alt={item.title || 'Título guardado'}
                                className="h-12 w-8 rounded-lg object-cover"
                              />
                              <div className="min-w-0 max-w-[150px]">
                                <p className="truncate text-xs font-bold text-white">
                                  {item.title || 'Título guardado'}
                                </p>
                                <p className="text-[10px] font-semibold text-indigo-300">
                                  {item.media_type === 'movie'
                                    ? 'En progreso'
                                    : `T${item.current_season || 1} · E${item.current_episode || 1}`}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                  <Sparkles className="h-4 w-4" />
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white">{tituloSeccion()}</h2>
              </div>

              {mostrarFiltrosTipo && (
                <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-700 bg-slate-900 p-1.5 shadow-md">
                  <button
                    onClick={() => cambiarFiltroTipo('all')}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                      filtroTipo === 'all'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/35'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    Todo
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('tv')}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                      filtroTipo === 'tv'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/35'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Tv className="h-3.5 w-3.5" />
                    Series
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('movie')}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                      filtroTipo === 'movie'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/35'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Películas
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('documentary')}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                      filtroTipo === 'documentary'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/35'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    Documentales
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('reality')}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition active:scale-[0.98] ${
                      filtroTipo === 'reality'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/35'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    Realities
                  </button>
                </div>
              )}
            </div>

            {vista === 'explorar' && (
              <div className="space-y-8">
                <div>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/75 p-3 shadow-md">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-slate-300">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Filtrar:</span>
                      </div>

                      <select
                        value={plataformaId}
                        onChange={(e) => cambiarPlataforma(e.target.value)}
                        className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm transition focus:outline-none ${
                          plataformaId
                            ? 'border-indigo-400 bg-indigo-600 text-white shadow-indigo-600/25'
                            : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-indigo-500/60 hover:bg-slate-800'
                        }`}
                      >
                        {PLATAFORMAS_ES.map((p) => (
                          <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                            {p.nombre}
                          </option>
                        ))}
                      </select>

                      <select
                        value={generoId}
                        onChange={(e) => cambiarGenero(e.target.value)}
                        className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm transition focus:outline-none ${
                          generoId
                            ? 'border-indigo-400 bg-indigo-600 text-white shadow-indigo-600/25'
                            : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-indigo-500/60 hover:bg-slate-800'
                        }`}
                      >
                        {GENEROS_ES.map((g) => (
                          <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                            {g.nombre}
                          </option>
                        ))}
                      </select>

                      {hayFiltrosActivos && (
                        <button
                          onClick={limpiarFiltros}
                          className="flex items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-600 hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Limpiar
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setMostrarRuleta(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/35 transition hover:bg-indigo-500 active:scale-[0.98]"
                    >
                      <Dices className="h-4 w-4" />
                      ¿Qué veo hoy?
                    </button>
                  </div>

                  {loading ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
                      {[...Array(10)].map((_, i) => (
                        <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-slate-900" />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                      <p className="text-slate-400">No hay resultados con esa combinación de filtros.</p>
                      <button
                        onClick={limpiarFiltros}
                        className="mt-4 rounded-xl border border-indigo-400/50 bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
                      >
                        Restablecer filtros
                      </button>
                    </div>
                  ) : (
                    renderGridTarjetas(items, 'exp-')
                  )}
                </div>

                {user && !query.trim() && todosGuardados.length > 0 && (
                  <RecomendacionesParaTi
                    bibliotecaUsuario={todosGuardados}
                    onSelectMedia={(media) => setItemActivo(media)}
                    onQuickAdd={(media) => guardarEnNube(media, 'watchlist', 0)}
                  />
                )}
              </div>
            )}

            {vista === 'biblioteca' && user && (
              <>
                <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                  <button
                    onClick={() => setTabBiblioteca('catalogo')}
                    className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                      tabBiblioteca === 'catalogo'
                        ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Library className="h-3.5 w-3.5" />
                    Catálogo ({totalBiblioteca})
                  </button>

                  <button
                    onClick={() => setTabBiblioteca('colecciones')}
                    className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                      tabBiblioteca === 'colecciones'
                        ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    Colecciones ({colecciones.length})
                  </button>

                  <button
                    onClick={() => setTabBiblioteca('estrenos')}
                    className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition active:scale-[0.98] ${
                      tabBiblioteca === 'estrenos'
                        ? 'border-indigo-400/60 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Próximos estrenos
                  </button>
                </div>

                {tabBiblioteca === 'estrenos' && (
                  <ProximosEstrenosBar
                    seriesEnSeguimientoIds={todosGuardados
                      .filter(
                        (i) =>
                          i.media_type === 'tv' &&
                          (i.status === 'watching' || i.status === 'watchlist')
                      )
                      .map((i) => i.tmdb_id)}
                    onSelectSerie={(media) => setItemActivo(media)}
                  />
                )}

                {tabBiblioteca === 'colecciones' && (
                  <div className="space-y-8">
                    <form
                      onSubmit={handleCrearColeccionSubmit}
                      className="flex flex-col gap-2.5 rounded-3xl border border-slate-800 bg-slate-900/65 p-4 shadow-md sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-indigo-400">
                        <FolderPlus className="h-4 w-4" />
                        <span>Nueva:</span>
                      </div>

                      <input
                        type="text"
                        required
                        maxLength={40}
                        value={nuevaColNombre}
                        onChange={(e) => setNuevaColNombre(e.target.value)}
                        placeholder="Nombre (ej. Maratón de finde)"
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      />

                      <input
                        type="text"
                        maxLength={90}
                        value={nuevaColDesc}
                        onChange={(e) => setNuevaColDesc(e.target.value)}
                        placeholder="Descripción opcional..."
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => setNuevaColPublica(!nuevaColPublica)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                          nuevaColPublica
                            ? 'border-emerald-400/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                            : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {nuevaColPublica ? (
                          <Globe className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                        {nuevaColPublica ? 'Pública' : 'Privada'}
                      </button>

                      <button
                        type="submit"
                        disabled={creandoCol || !nuevaColNombre.trim()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Crear colección
                      </button>
                    </form>

                    {colecciones.length === 0 ? (
                      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                        <p className="text-slate-400">
                          Aún no has creado ninguna colección. Crea una arriba y añade títulos desde cualquier tarjeta.
                        </p>
                      </div>
                    ) : (
                      colecciones.map((col) => {
                        const itemsDeEstaCol: MediaTMDB[] = col.itemsKeys
                          .map((clave) => {
                            const [tipoStr, idStr] = clave.split('-');
                            const tipo = (tipoStr || 'tv') as MediaType;
                            const idNum = Number(idStr);
                            const enBiblio = miLista[clave];
                            const enCache = cacheTitulos[clave];
                            return {
                              id: idNum,
                              media_type: tipo,
                              name: enBiblio?.title || enCache?.title || 'Título',
                              overview: '',
                              poster_path: enBiblio?.poster_path || enCache?.poster_path || null,
                              backdrop_path: null,
                              first_air_date: '',
                              vote_average: enBiblio?.rating || 0,
                            };
                          })
                          .filter((item) => cumpleFiltroTipo(item.media_type));

                        return (
                          <section
                            key={col.id}
                            className="rounded-3xl border border-indigo-500/30 bg-slate-900/45 p-5 shadow-lg"
                          >
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
                                  <Folder className="h-4 w-4 text-indigo-400" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-white">{col.name}</h3>
                                    <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
                                      {itemsDeEstaCol.length}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-400">
                                    {col.description || 'Colección personalizada'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleVisibilidadColeccion(col.id, !col.is_public)
                                  }
                                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                                    col.is_public
                                      ? 'border-emerald-400/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                                      : 'border-amber-400/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                                  }`}
                                  title="Cambiar privacidad"
                                >
                                  {col.is_public ? (
                                    <>
                                      <Globe className="h-3.5 w-3.5" /> Pública
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3.5 w-3.5" /> Privada
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleEliminarColeccion(col.id)}
                                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-300 transition hover:border-red-500 hover:bg-red-600 hover:text-white"
                                  title="Eliminar colección"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {itemsDeEstaCol.length === 0 ? (
                              <p className="py-6 text-center text-xs text-slate-500">
                                Esta colección aún está vacía. Añade títulos desde el desplegable de cualquier tarjeta.
                              </p>
                            ) : (
                              renderGridTarjetas(itemsDeEstaCol, `col-${col.id}-`)
                            )}
                          </section>
                        );
                      })
                    )}
                  </div>
                )}

                {tabBiblioteca === 'catalogo' && (
                  <div className="space-y-8">
                    {totalBiblioteca > 0 && (
                      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative flex-1 sm:max-w-xs">
                          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
                          <input
                            type="text"
                            value={busquedaBiblio}
                            onChange={(e) => setBusquedaBiblio(e.target.value)}
                            placeholder="Filtrar en mi biblioteca..."
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-xs font-semibold text-slate-300">
                            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
                            Ordenar:
                          </span>
                          <select
                            value={ordenBiblio}
                            onChange={(e) => setOrdenBiblio(e.target.value as OrdenBiblioteca)}
                            className="cursor-pointer rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-indigo-500/60 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="recientes">Últimos actualizados</option>
                            <option value="nota">Mayor puntuación (★)</option>
                            <option value="alfabetico">Alfabético (A–Z)</option>
                          </select>

                          <button
                            onClick={() => setMostrarRuleta(true)}
                            className="flex items-center gap-1.5 rounded-xl border border-indigo-400/50 bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-600/35 transition hover:bg-indigo-500 active:scale-[0.98]"
                          >
                            <Dices className="h-3.5 w-3.5" />
                            ¿Qué veo hoy?
                          </button>
                        </div>
                      </div>
                    )}

                    {bloquesCatalogo.every((b) => b.items.length === 0) ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                        <p className="text-slate-400">
                          {busquedaBiblio
                            ? `No hay coincidencias para "${busquedaBiblio}" en tu biblioteca.`
                            : 'No hay títulos guardados en esta categoría.'}
                        </p>
                        <button
                          onClick={() => {
                            if (busquedaBiblio) {
                              setBusquedaBiblio('');
                            } else {
                              setVista('explorar');
                              setFiltroTipo('all');
                            }
                          }}
                          className="mt-4 rounded-xl border border-indigo-400/50 bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500"
                        >
                          {busquedaBiblio ? 'Limpiar búsqueda' : 'Explorar catálogo'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {bloquesCatalogo
                          .filter((bloque) => bloque.items.length > 0)
                          .map((bloque) => (
                            <section
                              key={bloque.key}
                              className={`rounded-3xl border ${bloque.acentoBorder} bg-slate-900/45 p-5 shadow-lg`}
                            >
                              <div className="mb-5 flex items-center justify-between border-b border-slate-800/80 pb-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950">
                                    {bloque.icono}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="text-base font-bold text-white">
                                        {bloque.titulo}
                                      </h3>
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${bloque.acentoBadge}`}
                                      >
                                        {bloque.items.length}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-400">{bloque.subtitulo}</p>
                                  </div>
                                </div>
                              </div>

                              {renderGridTarjetas(bloque.items, `${bloque.key}-`)}
                            </section>
                          ))}
                      </div>
                    )}

                    {totalBiblioteca > 0 && (
                      <RecomendacionesParaTi
                        bibliotecaUsuario={todosGuardados}
                        onSelectMedia={(media) => setItemActivo(media)}
                        onQuickAdd={(media) => guardarEnNube(media, 'watchlist', 0)}
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-800 bg-slate-950/95 px-2 py-2 backdrop-blur-xl md:z-40 md:hidden">
        <button
          onClick={() => setVista('explorar')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition ${
            vista === 'explorar'
              ? 'bg-indigo-600/20 text-indigo-300 shadow-inner'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="h-5 w-5" />
          <span>Explorar</span>
        </button>

        <button
          onClick={() => setVista('comunidad')}
          className={`flex flex-col items-center gap-1 rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition ${
            vista === 'comunidad'
              ? 'bg-indigo-600/20 text-indigo-300 shadow-inner'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="h-5 w-5" />
          <span>Comunidad</span>
        </button>

        <button
          onClick={() => (user ? setVista('biblioteca') : setShowAuth(true))}
          className={`flex flex-col items-center gap-1 rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition ${
            vista === 'biblioteca'
              ? 'bg-indigo-600/20 text-indigo-300 shadow-inner'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Bookmark className="h-5 w-5" />
          <span>Biblioteca</span>
        </button>

        <button
          onClick={() => (user ? abrirPerfil(user.id) : setShowAuth(true))}
          className={`flex flex-col items-center gap-1 rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition ${
            vista === 'perfil'
              ? 'bg-indigo-600/20 text-indigo-300 shadow-inner'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <User className="h-5 w-5" />
          <span>{user ? 'Perfil' : 'Entrar'}</span>
        </button>
      </nav>

      {toastMsg && (
        <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-2xl border border-indigo-500/40 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md md:bottom-6">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {mostrarRuleta && (
        <RuletaDecisionModal
          itemsBiblioteca={todosGuardados}
          onClose={() => setMostrarRuleta(false)}
          onSelectMedia={(media) => setItemActivo(media)}
          onMarcarViendo={(media) => guardarEnNube(media, 'watching', 0)}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => comprobarSesion()}
        />
      )}

      {itemActivo && (
        <SerieModal
          serie={itemActivo}
          user={user}
          estadoActual={miLista[`${itemActivo.media_type}-${itemActivo.id}`]}
          onUpdateEstado={(status, rating, season, episode, extra) =>
            guardarEnNube(itemActivo, status, rating, season, episode, extra)
          }
          onUpdateSeguimiento={(extra) => {
            const actual = miLista[`${itemActivo.media_type}-${itemActivo.id}`];
            guardarEnNube(
              itemActivo,
              actual?.status || 'completed',
              actual?.rating || 0,
              actual?.current_season || 1,
              actual?.current_episode || 1,
              extra
            );
          }}
          onEliminarEstado={() => eliminarDeLista(itemActivo)}
          onClose={() => setItemActivo(null)}
          onRequireAuth={() => setShowAuth(true)}
        />
      )}
    </div>
  );
}