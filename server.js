const http = require("http");
require("dotenv").config();
const youtubeDlModule = require("youtube-dl-exec");
const youtubeDl = process.env.YT_DLP_PATH
  ? youtubeDlModule.create(process.env.YT_DLP_PATH)
  : youtubeDlModule;
const ytSearch = require("yt-search");

const host = process.env.RIO_SPOTIFY_HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.RIO_SPOTIFY_PORT || 3030);
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || "";
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

function normalizeVideo(video) {
  return {
    id: video.videoId,
    title: video.title || "Sem titulo",
    channel: video.author && video.author.name ? video.author.name : "YouTube",
    length: video.timestamp || "--:--",
  };
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function getSpotifyToken() {
  if (!spotifyClientId || !spotifyClientSecret) {
    return null;
  }

  if (spotifyToken && Date.now() < spotifyTokenExpiresAt - 60000) {
    return spotifyToken;
  }

  const credentials = Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Spotify token failed: ${response.status}`);
  }

  const data = await response.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return spotifyToken;
}

async function searchYoutubeId(query) {
  const result = await ytSearch(query);
  const video = (result.videos || []).find((item) => item.videoId);
  return video ? video.videoId : null;
}

async function searchSpotify(query) {
  const token = await getSpotifyToken();
  if (!token) {
    return null;
  }

  const response = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({
      q: query,
      type: "track",
      limit: "10",
      market: "BR",
    })}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify search failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const items = data.tracks && Array.isArray(data.tracks.items) ? data.tracks.items : [];
  const tracks = [];

  for (const track of items) {
    const artists = (track.artists || []).map((artist) => artist.name).filter(Boolean).join(", ");
    const title = track.name || "Sem titulo";


    tracks.push({
      id: `spotify:${track.id}`,
      title,
      channel: artists || "Spotify",
      length: formatDuration(track.duration_ms),
      spotifyId: track.id,
      spotifyUrl: track.external_urls && track.external_urls.spotify,
      previewUrl: track.preview_url,
      source: "spotify-youtube",
    });
  }

  return tracks.filter((track) => track.id);
}

async function handleSearch(req, res, url) {
  const query = (url.searchParams.get("name") || url.searchParams.get("q") || "").trim();
  if (query.length < 3 || query.length > 100) {
    sendJson(res, 400, []);
    return;
  }

  try {
    const spotifyTracks = await searchSpotify(query);
    if (spotifyTracks) {
      sendJson(res, 200, spotifyTracks);
      return;
    }
  } catch (error) {
    console.warn(`[rio_phone_spotify_api] Spotify indisponivel, usando YouTube. ${getErrorMessage(error)}`);
  }

  const result = await ytSearch(query);
  const tracks = (result.videos || [])
    .filter((video) => video.videoId)
    .slice(0, 20)
    .map(normalizeVideo);

  sendJson(res, 200, tracks);
}

async function handlePlay(req, res, url) {
  let id = (url.searchParams.get("id") || "").trim();
  if (/^spotify:[A-Za-z0-9]{22}$/.test(id)) {
    const token = await getSpotifyToken();
    if (!token) { sendText(res, 503, "spotify-unavailable"); return; }
    const response = await fetch("https://api.spotify.com/v1/tracks/" + id.slice(8), {
      headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { sendText(res, 502, "track-unavailable"); return; }
    const track = await response.json();
    id = await searchYoutubeId((track.artists || []).map(artist => artist.name).join(" ") + " " + track.name + " audio") || "";
  }
  if (!/^[\w-]{11}$/.test(id)) {
    sendText(res, 400, "invalid-id");
    return;
  }

  const output = await youtubeDl(`https://www.youtube.com/watch?v=${id}`, {
    getUrl: true,
    format: "bestaudio[ext=webm]/bestaudio[ext=mp3]",
    noWarnings: true,
    jsRuntimes: "node",
    socketTimeout: 15,
  }, { timeout: 30000 });

  const streamUrl = String(output || "")
    .split(/\r?\n/)
    .find((line) => /^https?:\/\//.test(line));

  if (!streamUrl) {
    sendText(res, 404, "audio-not-found");
    return;
  }

  if (url.pathname === "/resolve") { sendJson(res, 200, { url: streamUrl }); return; }

  res.writeHead(302, {
    Location: streamUrl,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET") { sendText(res, 405, "method-not-allowed"); return; }
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true, provider: "youtube", spotifyConfigured: Boolean(spotifyClientId && spotifyClientSecret) });
      return;
    }

    if (url.pathname === "/search") {
      await handleSearch(req, res, url);
      return;
    }

    if (url.pathname === "/play" || url.pathname === "/resolve") {
      await handlePlay(req, res, url);
      return;
    }

    sendText(res, 404, "not-found");
  } catch (error) {
    console.error(error);
    sendText(res, 500, "internal-error");
  }
});

server.listen(port, host, () => {
  console.log(`Rio Phone Spotify API rodando em http://${host}:${port}`);
});
