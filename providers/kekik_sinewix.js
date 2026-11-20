/*
 * SineWix — ported from Kekik CloudStream (keyiflerolsun/SineWix).
 * Clean JSON API at ythls.kekikakademi.org/sinewix — no HTML scraping.
 * Anthology/Ymir format: getCatalog / getMeta / getStreams / search.
 */
'use strict';

var BASE = "https://ythls.kekikakademi.org";
var REFERER = "https://twitter.com/";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function apiGet(path) {
  return fetch(BASE + path, { headers: { "User-Agent": UA, "Accept": "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " " + path); return r.text(); })
    .then(function (t) { return JSON.parse(t); });
}

function fixPoster(p) {
  if (!p) return null;
  if (/^https?:/i.test(p)) return p;
  if (p.charAt(0) === "/") return "https://image.tmdb.org/t/p/w500" + p;
  return p;
}

/* id encoding: "<type>|<id>" for catalog items; "play|<link>" for resolved episodes. */
function enc(type, id) { return type + "|" + id; }

async function getCatalog(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (q) return search({ query: q });

  var page = (args && args.pageToken) ? parseInt(args.pageToken, 10) || 1 : 1;
  var items = [];
  // Combine movies + series + animes so the one source browses everything.
  var jobs = [
    { path: "/sinewix/movies/" + page, type: "movie", listType: "movie" },
    { path: "/sinewix/series/" + page, type: "serie", listType: "tv" },
    { path: "/sinewix/animes/" + page, type: "anime", listType: "tv" }
  ];
  for (var j = 0; j < jobs.length; j++) {
    try {
      var data = await apiGet(jobs[j].path);
      var arr = (data && data.data) || [];
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        var name = it.title || it.name || "";
        if (!name) continue;
        items.push({
          id: enc(jobs[j].type, it.id),
          name: name,
          poster: fixPoster(it.poster_path),
          type: jobs[j].listType,
          description: null
        });
      }
    } catch (e) { /* skip this list on error */ }
  }
  if (!items.length) throw new Error("SineWix API boş döndü (" + BASE + ")");
  return { items: items };
}

async function search(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (!q) return { items: [] };
  var data = await apiGet("/sinewix/search/" + encodeURIComponent(q));
  var arr = (data && data.search) || [];
  var items = [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    var type = it.type === "movie" ? "movie" : (it.type || "serie");
    items.push({
      id: enc(type, it.id),
      name: it.name || it.title || "",
      poster: fixPoster(it.poster_path),
      type: type === "movie" ? "movie" : "tv",
      description: null
    });
  }
  return { items: items };
}

async function getMeta(args) {
  var raw = String((args && args.id) || "");
  var parts = raw.split("|");
  var type = parts[0], id = parts[1];
  if (!id) return { meta: null };
  var detailType = (type === "movie") ? "movie" : type; // serie/anime
  var media = await apiGet("/sinewix/" + detailType + "/" + id);
  var videos = [];
  var seasons = (media && media.seasons) || [];
  for (var s = 0; s < seasons.length; s++) {
    var eps = seasons[s].episodes || [];
    for (var e = 0; e < eps.length; e++) {
      var ep = eps[e];
      var link = (ep.videos && ep.videos[0] && ep.videos[0].link) || "";
      videos.push({
        id: "play|" + link,
        title: ep.name || ((seasons[s].season_number || 1) + ". Sezon " + (ep.episode_number || e + 1) + ". Bölüm"),
        season: seasons[s].season_number || 1,
        episode: ep.episode_number || (e + 1),
        thumbnail: fixPoster(ep.still_path) || null
      });
    }
  }
  return {
    meta: {
      id: raw,
      type: "series",
      name: media.name || media.title || "SineWix",
      poster: fixPoster(media.poster_path),
      description: media.overview || "",
      videos: videos
    }
  };
}

function mkStream(link) {
  var isHls = /\.m3u8(\?|$)/i.test(link);
  return {
    name: "SineWix",
    title: "SineWix" + (isHls ? " [HLS]" : ""),
    url: link,
    streamUrl: link,
    type: isHls ? "hls" : "mp4",
    headers: { "User-Agent": UA, "Referer": REFERER }
  };
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var raw = String(url || tmdbId || "");
  var parts = raw.split("|");

  // Resolved episode: carries the direct link.
  if (parts[0] === "play") {
    var link = raw.slice(5);
    if (!link) return [];
    if (/mediafire\.com/i.test(link)) return [];   // needs an extractor we don't have
    return [mkStream(link)];
  }

  // Movie: fetch detail, return all video links.
  if (parts[0] === "movie") {
    var media = await apiGet("/sinewix/movie/" + parts[1]);
    var vids = (media && media.videos) || [];
    var out = [];
    for (var i = 0; i < vids.length; i++) {
      var l = vids[i].link;
      if (!l || /mediafire\.com/i.test(l)) continue;
      out.push(mkStream(l));
    }
    return out;
  }

  // A series id reached getStreams directly — resolve first episode.
  if (parts[0] === "serie" || parts[0] === "anime") {
    var meta = await getMeta({ id: raw });
    var v = meta.meta && meta.meta.videos && meta.meta.videos[0];
    if (v) return getStreams(v.id, mediaType, season, episode, v.id);
  }
  return [];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCatalog: getCatalog, getMeta: getMeta, getStreams: getStreams, search: search };
}
if (typeof globalThis !== 'undefined') {
  globalThis.getCatalog = getCatalog;
  globalThis.getMeta = getMeta;
  globalThis.getStreams = getStreams;
  globalThis.search = search;
}
