const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export type MediaType = 'tv' | 'movie';

export interface MediaTMDB {
  id: number;
  media_type: MediaType;
  name: string; // Título unificado para serie o película
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string; // Fecha de estreno unificada
  vote_average: number;
}

export interface MediaDetalle extends MediaTMDB {
  number_of_seasons?: number;
  number_of_episodes?: number;
  runtime?: number; // Duración en minutos para películas
  genres: { id: number; name: string }[];
  status: string;
}

// Obtener tendencias (series, películas o todo)
export async function getTrendingMedia(tipo: 'all' | MediaType = 'all'): Promise<MediaTMDB[]> {
  const res = await fetch(
    `${BASE_URL}/trending/${tipo}/week?api_key=${TMDB_API_KEY}&language=es-ES`
  );
  if (!res.ok) throw new Error('Error al cargar tendencias');
  const data = await res.json();

  return (data.results || [])
    .filter((item: any) => (tipo !== 'all' ? true : item.media_type === 'tv' || item.media_type === 'movie'))
    .map((item: any) => ({
      id: item.id,
      media_type: (item.media_type || tipo) as MediaType,
      name: item.name || item.title || 'Sin título',
      overview: item.overview || '',
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      first_air_date: item.first_air_date || item.release_date || '',
      vote_average: item.vote_average || 0,
    }));
}

// Buscar series y películas a la vez
export async function searchMedia(query: string, tipo: 'all' | MediaType = 'all'): Promise<MediaTMDB[]> {
  if (!query.trim()) return [];
  const endpoint = tipo === 'all' ? 'search/multi' : `search/${tipo}`;
  const res = await fetch(
    `${BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}`
  );
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || [])
    .filter((item: any) => (tipo !== 'all' ? true : item.media_type === 'tv' || item.media_type === 'movie'))
    .map((item: any) => ({
      id: item.id,
      media_type: (item.media_type || tipo) as MediaType,
      name: item.name || item.title || 'Sin título',
      overview: item.overview || '',
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      first_air_date: item.first_air_date || item.release_date || '',
      vote_average: item.vote_average || 0,
    }));
}

// Obtener ficha completa (serie o película)
export async function getMediaDetails(id: number, tipo: MediaType): Promise<MediaDetalle | null> {
  const res = await fetch(
    `${BASE_URL}/${tipo}/${id}?api_key=${TMDB_API_KEY}&language=es-ES`
  );
  if (!res.ok) return null;
  const item = await res.json();
  return {
    id: item.id,
    media_type: tipo,
    name: item.name || item.title || 'Sin título',
    overview: item.overview || '',
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    first_air_date: item.first_air_date || item.release_date || '',
    vote_average: item.vote_average || 0,
    number_of_seasons: item.number_of_seasons,
    number_of_episodes: item.number_of_episodes,
    runtime: item.runtime,
    genres: item.genres || [],
    status: item.status || '',
  };
}

// Obtener plataformas donde verla en España
export async function getWatchProviders(id: number, tipo: MediaType) {
  const res = await fetch(
    `${BASE_URL}/${tipo}/${id}/watch/providers?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results?.ES?.flatrate || [];
}

export function getPosterUrl(path: string | null, size: 'w342' | 'w500' | 'original' = 'w500') {
  if (!path) return 'https://via.placeholder.com/500x750?text=Sin+Poster';
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

// Obtener número exacto de episodios por temporada de una serie
export async function getSeasonBreakdown(id: number): Promise<Record<number, number>> {
  const res = await fetch(
    `${BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=es-ES`
  );
  if (!res.ok) return { 1: 24 };
  const data = await res.json();
  const mapa: Record<number, number> = {};

  (data.seasons || []).forEach((s: any) => {
    if (s.season_number > 0) {
      mapa[s.season_number] = s.episode_count || 10;
    }
  });

  return Object.keys(mapa).length > 0 ? mapa : { 1: 24 };
}

export interface EpisodioTMDB {
  id: number;
  episode_number: number;
  name: string;
  air_date: string;
  overview: string;
}

// Obtener lista de episodios de una temporada concreta
export async function getSeasonEpisodes(tvId: number, seasonNumber: number): Promise<EpisodioTMDB[]> {
  const res = await fetch(
    `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=es-ES`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.episodes || [];
}

export type CategoriaFiltro = 'all' | 'tv' | 'movie' | 'documentary' | 'reality';

// Obtener documentales (cine y series) o realities populares
export async function getMediaByCategory(categoria: CategoriaFiltro): Promise<MediaTMDB[]> {
  if (categoria === 'all' || categoria === 'tv' || categoria === 'movie') {
    return getTrendingMedia(categoria);
  }

  if (categoria === 'reality') {
    // Género 10764 = Reality en TMDB
    const res = await fetch(
      `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&with_genres=10764`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((item: any) => ({
      id: item.id,
      media_type: 'tv' as MediaType,
      name: item.name || 'Sin título',
      overview: item.overview || '',
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      first_air_date: item.first_air_date || '',
      vote_average: item.vote_average || 0,
    }));
  }

  // Documentales: combinamos series documentales y películas documentales (Género 99)
  const [resTv, resMovie] = await Promise.all([
    fetch(`${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&with_genres=99`),
    fetch(`${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc&with_genres=99`),
  ]);

  const dataTv = resTv.ok ? await resTv.json() : { results: [] };
  const dataMovie = resMovie.ok ? await resMovie.json() : { results: [] };

  const tvDocs = (dataTv.results || []).slice(0, 10).map((item: any) => ({
    id: item.id,
    media_type: 'tv' as MediaType,
    name: item.name || 'Sin título',
    overview: item.overview || '',
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    first_air_date: item.first_air_date || '',
    vote_average: item.vote_average || 0,
  }));

  const movieDocs = (dataMovie.results || []).slice(0, 10).map((item: any) => ({
    id: item.id,
    media_type: 'movie' as MediaType,
    name: item.title || 'Sin título',
    overview: item.overview || '',
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    first_air_date: item.release_date || '',
    vote_average: item.vote_average || 0,
  }));

  return [...tvDocs, ...movieDocs];
}

export interface FiltroAvanzado {
  categoria: CategoriaFiltro;
  plataformaId: string; // '' = todas, '8' = Netflix, '119' = Prime, etc.
  generoId: string;     // '' = todos, '18' = Drama, '10765' = Sci-Fi/Fantasy, etc.
}

//Filtros avanzados por Plataforma//
export const PLATAFORMAS_ES = [
  { id: '', nombre: 'Todas las plataformas' },
  { id: '8', nombre: 'Netflix' },
  { id: '119', nombre: 'Prime Video' },
  { id: '1899', nombre: 'Max' },
  { id: '337', nombre: 'Disney+' },
  { id: '149', nombre: 'Movistar Plus+' },
  { id: '350', nombre: 'Apple TV+' },
  { id: '1773', nombre: 'SkyShowtime' },
];

export const GENEROS_ES = [
  { id: '', nombre: 'Todos los géneros' },
  { id: '10759', nombre: 'Acción y Aventura', movieId: '28' },
  { id: '16', nombre: 'Animación', movieId: '16' },
  { id: '35', nombre: 'Comedia', movieId: '35' },
  { id: '80', nombre: 'Crimen', movieId: '80' },
  { id: '18', nombre: 'Drama', movieId: '18' },
  { id: '10765', nombre: 'Ciencia Ficción y Fantasía', movieId: '878' },
  { id: '9648', nombre: 'Misterio / Thriller', movieId: '53' },
];

export async function discoverMediaAvanzado(filtros: FiltroAvanzado): Promise<MediaTMDB[]> {
  const { categoria, plataformaId, generoId } = filtros;

  // Si no hay plataforma ni género seleccionado, usamos la lógica rápida existente
  if (!plataformaId && !generoId) {
    return getMediaByCategory(categoria);
  }

  // Construir géneros para TV y Movie
  const genObj = GENEROS_ES.find((g) => g.id === generoId);
  const tvGenres: string[] = [];
  const movieGenres: string[] = [];

  if (categoria === 'documentary') {
    tvGenres.push('99');
    movieGenres.push('99');
  } else if (categoria === 'reality') {
    tvGenres.push('10764');
  }

  if (genObj && genObj.id) {
    tvGenres.push(genObj.id);
    movieGenres.push(genObj.movieId || genObj.id);
  }

  const providerParam = plataformaId ? `&with_watch_providers=${plataformaId}&watch_region=ES` : '';
  const tvGenreParam = tvGenres.length > 0 ? `&with_genres=${tvGenres.join(',')}` : '';
  const movieGenreParam = movieGenres.length > 0 ? `&with_genres=${movieGenres.join(',')}` : '';

  const necesitaTv = categoria === 'all' || categoria === 'tv' || categoria === 'documentary' || categoria === 'reality';
  const necesitaMovie = categoria === 'all' || categoria === 'movie' || categoria === 'documentary';

  const peticiones: Promise<MediaTMDB[]>[] = [];

  if (necesitaTv) {
    peticiones.push(
      fetch(
        `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc${providerParam}${tvGenreParam}`
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) =>
          (data.results || []).map((item: any) => ({
            id: item.id,
            media_type: 'tv' as MediaType,
            name: item.name || 'Sin título',
            overview: item.overview || '',
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            first_air_date: item.first_air_date || '',
            vote_average: item.vote_average || 0,
            popularity: item.popularity || 0,
          }))
        )
    );
  }

  if (necesitaMovie) {
    peticiones.push(
      fetch(
        `${BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=es-ES&sort_by=popularity.desc${providerParam}${movieGenreParam}`
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) =>
          (data.results || []).map((item: any) => ({
            id: item.id,
            media_type: 'movie' as MediaType,
            name: item.title || 'Sin título',
            overview: item.overview || '',
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            first_air_date: item.release_date || '',
            vote_average: item.vote_average || 0,
            popularity: item.popularity || 0,
          }))
        )
    );
  }

  const resultadosArrays = await Promise.all(peticiones);
  const combinados = resultadosArrays.flat();

  // Ordenar por popularidad si hemos mezclado series y películas
  return combinados.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0));
}
//CALENDARIO PROXIMOS ESTRENOS//
export interface ProximoEstreno {
  tmdb_id: number;
  serie_name: string;
  poster_path: string | null;
  season_number: number;
  episode_number: number;
  episode_name: string;
  air_date: string; // YYYY-MM-DD
}

export async function getProximosEstrenosUsuario(
  seriesIds: number[]
): Promise<ProximoEstreno[]> {
  if (!seriesIds || seriesIds.length === 0) return [];

  const peticiones = seriesIds.map((id) =>
    fetch(`${BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=es-ES`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );

  const resultados = await Promise.all(peticiones);
  const hoyStr = new Date().toISOString().split('T')[0];
  const estrenos: ProximoEstreno[] = [];

  resultados.forEach((serie) => {
    if (serie && serie.next_episode_to_air && serie.next_episode_to_air.air_date) {
      if (serie.next_episode_to_air.air_date >= hoyStr) {
        estrenos.push({
          tmdb_id: serie.id,
          serie_name: serie.name || 'Serie',
          poster_path: serie.poster_path || null,
          season_number: serie.next_episode_to_air.season_number,
          episode_number: serie.next_episode_to_air.episode_number,
          episode_name: serie.next_episode_to_air.name || 'Próximo episodio',
          air_date: serie.next_episode_to_air.air_date,
        });
      }
    }
  });

  // Ordenar del estreno más cercano al más lejano
  return estrenos.sort((a, b) => a.air_date.localeCompare(b.air_date));
}