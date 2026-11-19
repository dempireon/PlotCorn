'use client';

import { useState, useEffect } from 'react';
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
import SerieModal from '@/components/SerieModal';
import ComunidadFeed from '@/components/ComunidadFeed';
import UserProfileModal from '@/components/UserProfileModal';
import EstadisticasPanel from '@/components/EstadisticasPanel';
import { Coleccion } from '@/components/ColeccionesBar';
import ProximosEstrenosBar from '@/components/ProximosEstrenosBar';
import {
  Search, Star, Tv, Film, Check, Clock, Eye, Sparkles,
  User, LogOut, Bookmark, Users, Plus, Trash2, ChevronDown,
  Clapperboard, Flame, SlidersHorizontal, RotateCcw, FolderPlus,
  Calendar, BarChart3, Folder, Library, Globe, Lock
} from 'lucide-react';

type EstadoMedia = 'watching' | 'completed' | 'watchlist';
type TabBiblioteca = 'catalogo' | 'colecciones' | 'estrenos' | 'estadisticas';

interface ItemGuardado {
  tmdb_id: number;
  media_type: MediaType;
  status: EstadoMedia;
  rating: number;
  current_season: number;
  current_episode: number;
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
  const [vista, setVista] = useState<'explorar' | 'biblioteca' | 'comunidad'>('explorar');

  // Estados para crear nueva colección directamente en su bloque
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
  const [temporadasCache, setTemporadasCache] = useState<Record<number, Record<number, number>>>({});
  const [miLista, setMiLista] = useState<Record<string, ItemGuardado>>({});
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [cacheTitulos, setCacheTitulos] = useState<Record<string, { title: string; poster_path: string | null }>>({});

  useEffect(() => {
    cargarCatalogo('all', '', '');
    comprobarSesion();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        cargarDatosUsuario(session.user.id);
      } else {
        setUsername('');
        setMiLista({});
        setColecciones([]);
        setCargandoUsuario(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function comprobarSesion() {
    setCargandoUsuario(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await cargarDatosUsuario(session.user.id);
    }
    setCargandoUsuario(false);
  }

  async function cargarDatosUsuario(userId: string) {
    setCargandoUsuario(true);
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    if (profile) setUsername(profile.username);

    const { data: userSeries, error } = await supabase
      .from('user_series')
      .select('*')
      .eq('user_id', userId);

    const { data: colsData } = await supabase
      .from('user_collections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

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

    if (error) {
      console.error('Error cargando biblioteca:', error.message);
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
          title: infoCache?.title || 'Título guardado',
          poster_path: infoCache?.poster_path || null,
        };
      });
      setMiLista(mapa);
    } else {
      setMiLista({});
    }
    setCargandoUsuario(false);
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
      alert('Error creando colección: ' + error.message);
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
    }
  }

  async function asegurarTemporadas(tmdbId: number) {
    if (temporadasCache[tmdbId]) return;
    const mapa = await getSeasonBreakdown(tmdbId);
    setTemporadasCache((prev) => ({ ...prev, [tmdbId]: mapa }));
  }

  async function cargarCatalogo(
    cat: CategoriaFiltro = filtroTipo,
    plat: string = plataformaId,
    gen: string = generoId
  ) {
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

  async function guardarEnNube(
    item: MediaTMDB,
    status: EstadoMedia,
    rating: number,
    season?: number,
    episode?: number
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

    setMiLista((prev) => ({
      ...prev,
      [clave]: {
        tmdb_id: item.id,
        media_type: item.media_type,
        status,
        rating,
        current_season: nuevaTemporada,
        current_episode: nuevoEpisodio,
        title: item.name,
        poster_path: item.poster_path,
      },
    }));

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
      alert('Error guardando caché: ' + errorCache.message);
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tmdb_id,media_type' }
    );

    if (errorLista) {
      alert('Error guardando en biblioteca: ' + errorLista.message);
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

    await supabase
      .from('user_series')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type);
  }

  const todosGuardados = Object.values(miLista);
  const totalBiblioteca = todosGuardados.length;

  const cumpleFiltroTipo = (mediaType: MediaType) => {
    if (filtroTipo === 'tv' || filtroTipo === 'reality') return mediaType === 'tv';
    if (filtroTipo === 'movie') return mediaType === 'movie';
    return true;
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
      items: todosGuardados
        .filter((i) => i.status === 'watching' && cumpleFiltroTipo(i.media_type))
        .map((info) => ({
          id: info.tmdb_id,
          media_type: info.media_type,
          name: info.title || 'Guardado',
          overview: '',
          poster_path: info.poster_path || null,
          backdrop_path: null,
          first_air_date: '',
          vote_average: info.rating || 0,
        })),
    },
    {
      key: 'watchlist',
      titulo: 'Pendientes',
      subtitulo: 'En tu lista para ver pronto',
      icono: <Clock className="h-4 w-4 text-amber-400" />,
      acentoBorder: 'border-amber-500/30',
      acentoBadge: 'bg-amber-500/20 text-amber-300',
      items: todosGuardados
        .filter((i) => i.status === 'watchlist' && cumpleFiltroTipo(i.media_type))
        .map((info) => ({
          id: info.tmdb_id,
          media_type: info.media_type,
          name: info.title || 'Guardado',
          overview: '',
          poster_path: info.poster_path || null,
          backdrop_path: null,
          first_air_date: '',
          vote_average: info.rating || 0,
        })),
    },
    {
      key: 'completed',
      titulo: 'Terminadas y Vistas',
      subtitulo: 'Completadas en tu historial',
      icono: <Check className="h-4 w-4 text-emerald-400" />,
      acentoBorder: 'border-emerald-500/30',
      acentoBadge: 'bg-emerald-500/20 text-emerald-300',
      items: todosGuardados
        .filter((i) => i.status === 'completed' && cumpleFiltroTipo(i.media_type))
        .map((info) => ({
          id: info.tmdb_id,
          media_type: info.media_type,
          name: info.title || 'Guardado',
          overview: '',
          poster_path: info.poster_path || null,
          backdrop_path: null,
          first_air_date: '',
          vote_average: info.rating || 0,
        })),
    },
  ];

  const tituloSeccion = () => {
    if (vista === 'biblioteca') {
      if (tabBiblioteca === 'estadisticas') return 'Mis Estadísticas';
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
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
                className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900 shadow-md transition duration-300 group-hover:border-indigo-500/60 group-hover:shadow-xl group-hover:shadow-indigo-950/30"
              >
                <img
                  src={getPosterUrl(item.poster_path)}
                  alt={item.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />

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
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-semibold text-amber-400 backdrop-blur-sm">
                    <Star className="h-3 w-3 fill-amber-400" />
                    {item.vote_average.toFixed(1)}
                  </div>
                )}
              </div>

              <div className="mt-2.5 px-0.5">
                <h3
                  onClick={() => setItemActivo(item)}
                  className="line-clamp-1 cursor-pointer text-sm font-semibold text-white transition hover:text-indigo-400"
                  title={item.name}
                >
                  {item.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {item.first_air_date ? item.first_air_date.slice(0, 4) : esPeli ? 'Película' : 'Serie'}
                </p>
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                className="relative mt-2"
              >
                <button
                  onClick={() => {
                    if (!user) return setShowAuth(true);
                    if (!abierto && !esPeli) asegurarTemporadas(item.id);
                    setMenuAbierto(abierto ? null : claveMenu);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    !infoUsuario
                      ? 'border-slate-800 bg-slate-900 text-slate-200 hover:border-indigo-500/50 hover:bg-slate-800'
                      : infoUsuario.status === 'watching'
                      ? 'border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30'
                      : infoUsuario.status === 'completed'
                      ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                      : 'border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {!infoUsuario && (
                      <>
                        <Plus className="h-3.5 w-3.5 text-indigo-400" />
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
                            } else if (mapaTemps[tempActual + 1]) {
                              guardarEnNube(item, 'watching', infoUsuario.rating, tempActual + 1, 1);
                            } else {
                              guardarEnNube(item, 'completed', infoUsuario.rating, tempActual, infoUsuario.current_episode);
                              setMenuAbierto(null);
                            }
                          }}
                          className="flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-500"
                        >
                          <Plus className="h-3 w-3" />
                          Siguiente episodio
                        </button>
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
                        {[1, 2, 3, 4, 5].map((estrella) => (
                          <button
                            key={estrella}
                            onClick={() => {
                              guardarEnNube(
                                item,
                                infoUsuario?.status || 'completed',
                                estrella
                              );
                              setMenuAbierto(null);
                            }}
                            className="p-0.5 text-slate-600 hover:text-amber-400"
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                (infoUsuario?.rating || 0) >= estrella
                                  ? 'fill-amber-400 text-amber-400'
                                  : ''
                              }`}
                            />
                          </button>
                        ))}
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
      className="min-h-screen bg-slate-950 text-slate-100"
    >
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between">
            <div
              onClick={() => {
                setVista('explorar');
                limpiarFiltros();
              }}
              className="flex cursor-pointer items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                <img src="/logoplotcorn.jpeg" alt="Logo" className="h-10 w-10 rounded-xl object-cover shadow-lg"
/>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">PlotCorn</h1>
                <p className="text-xs text-slate-400">Toda historia tiene un Twist</p>
              </div>
            </div>
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar series, pelis, realities..."
              className="w-full rounded-full border border-slate-800 bg-slate-900 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setVista('explorar')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                vista === 'explorar' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Explorar
            </button>

            <button
              onClick={() => setVista('comunidad')}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                vista === 'comunidad' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Comunidad
            </button>

            <button
              onClick={() => (user ? setVista('biblioteca') : setShowAuth(true))}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                vista === 'biblioteca' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Mi Biblioteca ({cargandoUsuario ? '...' : totalBiblioteca})
            </button>

            {user ? (
              <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
                <button
                  onClick={() => setPerfilActivoId(user.id)}
                  title="Ver y editar mi perfil"
                  className="text-xs font-medium text-indigo-400 hover:underline"
                >
                  @{username || 'usuario'}
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  title="Cerrar sesión"
                  className="rounded-lg bg-slate-900 p-2 text-slate-400 hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                <User className="h-3.5 w-3.5" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {vista === 'comunidad' ? (
          <ComunidadFeed
            user={user}
            onSelectSerie={(serie: any) =>
              setItemActivo({ ...serie, media_type: serie.media_type || 'tv' })
            }
            onSelectUser={(uid) => setPerfilActivoId(uid)}
            onRequireAuth={() => setShowAuth(true)}
          />
        ) : (
          <>
            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <h2 className="text-xl font-semibold">{tituloSeccion()}</h2>
              </div>

              {mostrarFiltrosTipo && (
                <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
                  <button
                    onClick={() => cambiarFiltroTipo('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filtroTipo === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todo
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('tv')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filtroTipo === 'tv' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Tv className="h-3.5 w-3.5" />
                    Series
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('movie')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filtroTipo === 'movie' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" />
                    Películas
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('documentary')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filtroTipo === 'documentary' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                    Documentales
                  </button>
                  <button
                    onClick={() => cambiarFiltroTipo('reality')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filtroTipo === 'reality' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    Realities
                  </button>
                </div>
              )}
            </div>

            {vista === 'explorar' && (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3">
                  <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-400">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Filtrar:</span>
                  </div>

                  <select
                    value={plataformaId}
                    onChange={(e) => cambiarPlataforma(e.target.value)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition focus:outline-none ${
                      plataformaId
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
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
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition focus:outline-none ${
                      generoId
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
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
                      className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Limpiar
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {[...Array(10)].map((_, i) => (
                      <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-slate-900" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                    <p className="text-slate-400">No hay resultados con esa combinación de filtros.</p>
                    <button
                      onClick={limpiarFiltros}
                      className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Restablecer filtros
                    </button>
                  </div>
                ) : (
                  renderGridTarjetas(items, 'exp-')
                )}
              </>
            )}

            {/* VISTA MI BIBLIOTECA */}
            {vista === 'biblioteca' && user && (
              <>
                <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                  <button
                    onClick={() => setTabBiblioteca('catalogo')}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      tabBiblioteca === 'catalogo'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Library className="h-3.5 w-3.5" />
                    Catálogo ({totalBiblioteca})
                  </button>

                  <button
                    onClick={() => setTabBiblioteca('colecciones')}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      tabBiblioteca === 'colecciones'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    Colecciones ({colecciones.length})
                  </button>

                  <button
                    onClick={() => setTabBiblioteca('estrenos')}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      tabBiblioteca === 'estrenos'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Próximos estrenos
                  </button>

                  <button
                    onClick={() => setTabBiblioteca('estadisticas')}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      tabBiblioteca === 'estadisticas'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Estadísticas
                  </button>
                </div>

                {tabBiblioteca === 'estadisticas' && (
                  <EstadisticasPanel userId={user.id} itemsBiblioteca={todosGuardados} />
                )}

                {tabBiblioteca === 'estrenos' && (
                  <ProximosEstrenosBar
                    seriesEnSeguimientoIds={todosGuardados
                      .filter((i) => i.media_type === 'tv' && (i.status === 'watching' || i.status === 'watchlist'))
                      .map((i) => i.tmdb_id)}
                    onSelectSerie={(media) => setItemActivo(media)}
                  />
                )}

                {/* BLOQUES APILADOS EN COLECCIONES */}
                {tabBiblioteca === 'colecciones' && (
                  <div className="space-y-8">
                    {/* Bloque superior para crear colección */}
                    <form
                      onSubmit={handleCrearColeccionSubmit}
                      className="flex flex-col gap-2.5 rounded-3xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center"
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
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      />

                      <input
                        type="text"
                        maxLength={90}
                        value={nuevaColDesc}
                        onChange={(e) => setNuevaColDesc(e.target.value)}
                        placeholder="Descripción opcional..."
                        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => setNuevaColPublica(!nuevaColPublica)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          nuevaColPublica
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 bg-slate-950 text-slate-400'
                        }`}
                      >
                        {nuevaColPublica ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        {nuevaColPublica ? 'Pública' : 'Privada'}
                      </button>

                      <button
                        type="submit"
                        disabled={creandoCol || !nuevaColNombre.trim()}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
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
                                  onClick={() => handleToggleVisibilidadColeccion(col.id, !col.is_public)}
                                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                                    col.is_public
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
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
                                  onClick={() => {
                                    if (confirm(`¿Eliminar la colección "${col.name}"?`)) {
                                      handleEliminarColeccion(col.id);
                                    }
                                  }}
                                  className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
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

                {/* BLOQUES APILADOS EN CATÁLOGO */}
                {tabBiblioteca === 'catalogo' && (
                  <>
                    {bloquesCatalogo.every((b) => b.items.length === 0) ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                        <p className="text-slate-400">No hay títulos guardados en esta categoría.</p>
                        <button
                          onClick={() => {
                            setVista('explorar');
                            setFiltroTipo('all');
                          }}
                          className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                        >
                          Explorar catálogo
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
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

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
          onUpdateEstado={(status, rating, season, episode) =>
            guardarEnNube(itemActivo, status, rating, season, episode)
          }
          onClose={() => setItemActivo(null)}
          onRequireAuth={() => setShowAuth(true)}
        />
      )}

      {perfilActivoId && (
        <UserProfileModal
          targetUserId={perfilActivoId}
          currentUser={user}
          onClose={() => setPerfilActivoId(null)}
          onSelectMedia={(media) => setItemActivo(media)}
          onRequireAuth={() => setShowAuth(true)}
        />
      )}
    </div>
  );
}