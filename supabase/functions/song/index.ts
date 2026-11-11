// Edge Function: song → Spotify (buscar y agregar a la playlist del evento)
// Secretos requeridos (Supabase → Edge Functions → Secrets):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN, SPOTIFY_PLAYLIST_ID
//
// Acciones (POST JSON):
//   { action: "info" }                    → { playlistUrl }
//   { action: "search", q }               → { tracks: [...] }
//   { action: "add", uri: "spotify:track:…" } → { ok, duplicate }
//   { action: "list" }                    → { name, owner, image, url, total, tracks: [...] }

import { clientIp, guard, json, rateLimit, readJson, str } from "../_shared/http.ts";

const API = "https://api.spotify.com/v1";
const TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/;

let cachedToken: { value: string; exp: number } | null = null;

function env() {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID")?.trim();
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET")?.trim();
  const refresh = Deno.env.get("SPOTIFY_REFRESH_TOKEN")?.trim();
  // Acepta el ID o el link completo de la playlist
  const playlist = Deno.env.get("SPOTIFY_PLAYLIST_ID")?.trim().replace(/^.*playlist[/:]/, "").replace(/\?.*$/, "");
  return id && secret && refresh && playlist ? { id, secret, refresh, playlist } : null;
}

async function accessToken(cfg: NonNullable<ReturnType<typeof env>>): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.value;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${cfg.id}:${cfg.secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`token:${r.status}:${d.error ?? "?"}:${d.error_description ?? ""}`);
  cachedToken = { value: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function sp(cfg: NonNullable<ReturnType<typeof env>>, path: string, init: RequestInit = {}) {
  const token = await accessToken(cfg);
  const r = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (r.status === 401) cachedToken = null;
  return r;
}

type SpImage = { url: string; width?: number };
type SpTrack = {
  uri: string;
  name: string;
  explicit?: boolean;
  duration_ms?: number;
  artists?: { name: string }[];
  album?: { name?: string; images?: SpImage[] };
};

function pickImage(images: SpImage[] = []): string {
  if (!images.length) return "";
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 60) ?? sorted[sorted.length - 1]).url;
}

async function alreadyInPlaylist(cfg: NonNullable<ReturnType<typeof env>>, uri: string): Promise<boolean> {
  let url: string | null = `/playlists/${encodeURIComponent(cfg.playlist)}/items?limit=50`;
  for (let page = 0; url && page < 10; page++) {
    const r = await sp(cfg, url);
    if (!r.ok) return false; // si no se puede leer, no bloqueamos el alta
    const d = await r.json();
    // Compatible con el formato nuevo (item) y el anterior (track)
    for (const it of d.items ?? []) {
      if ((it.item ?? it.track)?.uri === uri) return true;
    }
    url = d.next ?? null;
  }
  return false;
}

// ---- Lista de la playlist (para mostrarla en la invitación) ----
const LIST_MAX = 50;
let listCache: { at: number; data: unknown } | null = null;

async function playlistSnapshot(cfg: NonNullable<ReturnType<typeof env>>) {
  if (listCache && Date.now() - listCache.at < 8_000) return listCache.data;
  const id = encodeURIComponent(cfg.playlist);

  const metaRes = await sp(cfg, `/playlists/${id}?market=MX`);
  if (!metaRes.ok) throw new Error(`meta:${metaRes.status}`);
  const meta = await metaRes.json();
  const total: number = (meta.items ?? meta.tracks)?.total ?? 0;

  // Leemos las últimas LIST_MAX canciones (las más recientes)
  const offset = Math.max(0, total - LIST_MAX);
  const itemsRes = await sp(cfg, `/playlists/${id}/items?limit=${LIST_MAX}&offset=${offset}&market=MX`);
  if (!itemsRes.ok) throw new Error(`items:${itemsRes.status}`);
  const page = await itemsRes.json();

  const tracks = ((page.items ?? []) as { added_at?: string; item?: SpTrack; track?: SpTrack }[])
    .map((it) => ({ t: it.item ?? it.track, added: it.added_at ?? "" }))
    .filter((x) => x.t && x.t.uri && x.t.uri.startsWith("spotify:track:"))
    .map(({ t, added }) => ({
      uri: t!.uri,
      id: t!.uri.split(":").pop(),
      name: t!.name,
      artists: (t!.artists ?? []).map((a) => a.name).join(", "),
      image: pickImage(t!.album?.images),
      duration: t!.duration_ms ?? 0,
      explicit: !!t!.explicit,
      added,
    }))
    .reverse(); // más recientes primero

  const data = {
    name: meta.name ?? "Playlist",
    owner: meta.owner?.display_name ?? "",
    image: (meta.images ?? [])[0]?.url ?? "",
    url: `https://open.spotify.com/playlist/${id}`,
    total,
    tracks,
  };
  listCache = { at: Date.now(), data };
  return data;
}

Deno.serve(async (req) => {
  const blocked = guard(req);
  if (blocked) return blocked;

  const body = await readJson(req, 2_000);
  if (!body) return json(req, 400, { error: "Solicitud inválida." });

  const cfg = env();
  const action = str(body.action, 20);

  if (action === "info") {
    if (!cfg) return json(req, 200, { playlistUrl: null });
    return json(req, 200, { playlistUrl: `https://open.spotify.com/playlist/${encodeURIComponent(cfg.playlist)}` });
  }

  const ip = clientIp(req);
  const honeypot = str(body.website, 200) !== "";

  if (action === "list") {
    if (!rateLimit(`list:${ip}`, 30, 60_000)) return json(req, 429, { error: "Demasiadas consultas." });
    if (!cfg) return json(req, 500, { error: "Servicio no configurado." });
    try {
      return json(req, 200, await playlistSnapshot(cfg));
    } catch (e) {
      console.error("list error", e);
      return json(req, 502, { error: "Spotify no respondió." });
    }
  }

  if (action === "search") {
    if (!rateLimit(`search:${ip}`, 40, 60_000)) return json(req, 429, { error: "Demasiadas búsquedas." });
    const q = str(body.q, 100);
    if (q.length < 2) return json(req, 400, { error: "Escribe al menos 2 letras." });
    if (honeypot) return json(req, 200, { tracks: [] });
    if (!cfg) return json(req, 500, { error: "Servicio no configurado." });

    try {
      const params = new URLSearchParams({ q, type: "track", limit: "8", market: "MX" });
      const r = await sp(cfg, `/search?${params}`);
      if (!r.ok) {
        const t = await r.text();
        console.error("search", r.status, t);
        return json(req, 502, { error: "Spotify no respondió." });
      }
      const d = await r.json();
      const tracks = ((d.tracks?.items ?? []) as SpTrack[]).filter(Boolean).map((t) => ({
        uri: t.uri,
        name: t.name,
        artists: (t.artists ?? []).map((a) => a.name).join(", "),
        album: t.album?.name ?? "",
        image: pickImage(t.album?.images),
        explicit: !!t.explicit,
      }));
      return json(req, 200, { tracks });
    } catch (e) {
      console.error("search error", e);
      return json(req, 502, { error: "Spotify no respondió." });
    }
  }

  if (action === "add") {
    if (!rateLimit(`add:${ip}`, 10, 10 * 60_000)) return json(req, 429, { error: "Demasiadas canciones seguidas." });
    const uri = str(body.uri, 60);
    if (!TRACK_URI.test(uri)) return json(req, 400, { error: "Canción inválida." });
    if (honeypot) return json(req, 200, { ok: true, duplicate: false });
    if (!cfg) return json(req, 500, { error: "Servicio no configurado." });

    try {
      if (await alreadyInPlaylist(cfg, uri)) return json(req, 200, { ok: true, duplicate: true });
      const r = await sp(cfg, `/playlists/${encodeURIComponent(cfg.playlist)}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: [uri] }),
      });
      if (!r.ok) {
        console.error("add", r.status, await r.text());
        return json(req, 502, { error: "No se pudo agregar." });
      }
      listCache = null; // que la lista muestre la canción nueva de inmediato
      return json(req, 200, { ok: true, duplicate: false });
    } catch (e) {
      console.error("add error", e);
      return json(req, 502, { error: "No se pudo agregar." });
    }
  }

  return json(req, 400, { error: "Acción desconocida." });
});
