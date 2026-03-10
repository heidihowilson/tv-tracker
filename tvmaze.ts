/**
 * TVMaze API Client
 * Fetches show metadata, seasons, and episodes
 */

const BASE_URL = "https://api.tvmaze.com";

// Rate limiting - TVMaze allows 20 calls per 10 seconds
let lastCall = 0;
const MIN_INTERVAL = 500; // 500ms between calls to be safe

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall = Date.now();
  return fetch(url);
}

export interface TvMazeShow {
  id: number;
  name: string;
  premiered: string | null;
  ended: string | null;
  status: string;
  runtime: number | null;
  network: { name: string; country: { code: string } | null } | null;
  webChannel: { name: string } | null;
  summary: string | null;
  image: { medium: string; original: string } | null;
}

export interface TvMazeSeason {
  id: number;
  number: number;
  episodeOrder: number | null;
  premiereDate: string | null;
  endDate: string | null;
}

export interface TvMazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  airdate: string | null;
  runtime: number | null;
  summary: string | null;
}

export interface SearchResult {
  score: number;
  show: TvMazeShow;
}

/**
 * Search for shows by name
 */
export async function searchShows(query: string): Promise<SearchResult[]> {
  const response = await rateLimitedFetch(`${BASE_URL}/search/shows?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`TVMaze search failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get show by TVMaze ID
 */
export async function getShow(id: number): Promise<TvMazeShow> {
  const response = await rateLimitedFetch(`${BASE_URL}/shows/${id}`);
  if (!response.ok) {
    throw new Error(`TVMaze show fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get all seasons for a show
 */
export async function getSeasons(showId: number): Promise<TvMazeSeason[]> {
  const response = await rateLimitedFetch(`${BASE_URL}/shows/${showId}/seasons`);
  if (!response.ok) {
    throw new Error(`TVMaze seasons fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get all episodes for a show
 */
export async function getEpisodes(showId: number): Promise<TvMazeEpisode[]> {
  const response = await rateLimitedFetch(`${BASE_URL}/shows/${showId}/episodes`);
  if (!response.ok) {
    throw new Error(`TVMaze episodes fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get episodes for a specific season
 */
export async function getSeasonEpisodes(seasonId: number): Promise<TvMazeEpisode[]> {
  const response = await rateLimitedFetch(`${BASE_URL}/seasons/${seasonId}/episodes`);
  if (!response.ok) {
    throw new Error(`TVMaze season episodes fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Lookup show by external ID (IMDB, TVDB, etc)
 */
export async function lookupShow(source: "imdb" | "thetvdb" | "tvrage", id: string): Promise<TvMazeShow> {
  const response = await rateLimitedFetch(`${BASE_URL}/lookup/shows?${source}=${id}`);
  if (!response.ok) {
    throw new Error(`TVMaze lookup failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get schedule for a specific date and country
 */
export async function getSchedule(date?: string, country: string = "US"): Promise<TvMazeEpisode[]> {
  const dateParam = date ? `&date=${date}` : "";
  const response = await rateLimitedFetch(`${BASE_URL}/schedule?country=${country}${dateParam}`);
  if (!response.ok) {
    throw new Error(`TVMaze schedule fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get streaming schedule (web shows)
 */
export async function getStreamingSchedule(date?: string): Promise<TvMazeEpisode[]> {
  const dateParam = date ? `?date=${date}` : "";
  const response = await rateLimitedFetch(`${BASE_URL}/schedule/web${dateParam}`);
  if (!response.ok) {
    throw new Error(`TVMaze streaming schedule fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Get the streaming service name from show data
 */
export function getService(show: TvMazeShow): string | null {
  if (show.webChannel?.name) return show.webChannel.name;
  if (show.network?.name) return show.network.name;
  return null;
}

/**
 * Single search - returns best match or null
 */
export async function findShow(query: string): Promise<SearchResult | null> {
  const results = await searchShows(query);
  return results.length > 0 ? results[0] : null;
}
