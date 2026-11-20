/*
 * RecTV — ported from Kekik CloudStream (keyiflerolsun/RecTV).
 * JSON API with an embedded key. Live TV + movies + series.
 * NOTE: the host (b.prectvNN.sbs) rotates; update BASE if it 404s.
 */
'use strict';

var BASE = "https://b.prectv38.sbs";
var KEY = "4F5A9C3D9A86FA54EACEDDD635185/c3c5bd17-e37b-4b94-a944-8a3688a30452";
var UA_API = "okhttp/4.12.0";
var UA_PLAY = "googleusercontent";
var REFERER = "https://twitter.com/";

function api(path) {
  return fetch(BASE + path, { headers: { "User-Agent": UA_API, "Accept": "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " " + path); return r.text(); })
    .then(function (t) { return JSON.parse(t); });
}

function srcList(sources) {
  var out = [];
  (sources || []).forEach(function (s) { if (s && s.url) out.push({ u: s.url, t: s.type || "" }); });
  return out;
}
function playId(sources) { return JSON.stringify({ k: "play", s: srcList(sources) }); }

function mapItem(item) {
  var isLive = (item.label === "CANLI" || item.label === "Canlı" || item.type === "channel");
  var isSerie = (item.type === "serie");
  var id, type;
  if (isSerie) { id = JSON.stringify({ k: "serie", i: item.id, n: item.title }); type = "tv"; }
  else { id = playId(item.sources); type = "movie"; }  // movie or live channel → direct play
  return { id: id, name: item.title || "", poster: item.image || null, type: type, description: item.description || null };
}

async function getCatalog(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (q) return search({ query: q });

  var page = (args && args.pageToken) ? (parseInt(args.pageToken, 10) || 1) - 1 : 0;
  var jobs = [
    "/api/channel/by/filtres/0/0/" + page + "/" + KEY + "/",
    "/api/movie/by/filtres/0/created/" + page + "/" + KEY + "/",
    "/api/serie/by/filtres/0/created/" + page + "/" + KEY + "/"
  ];
  var items = [];
  for (var j = 0; j < jobs.length; j++) {
    try {
      var arr = await api(jobs[j]);
      if (Array.isArray(arr)) for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].title) items.push(mapItem(arr[i]));
      }
    } catch (e) { /* skip */ }
  }
  if (!items.length) throw new Error("RecTV API boş/erişilemez (" + BASE + ") — domain değişmiş olabilir");
  return { items: items };
}

async function search(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (!q) return { items: [] };
  var data = await api("/api/search/" + encodeURIComponent(q) + "/" + KEY + "/");
  var items = [];
  var push = function (arr) { (arr || []).forEach(function (it) { if (it && it.title) items.push(mapItem(it)); }); };
  push(data && data.channels);
  push(data && data.posters);
  return { items: items };
}

function numOf(s) { var m = /\d+/.exec(String(s || "")); return m ? parseInt(m[0], 10) : null; }

async function getMeta(args) {
  var raw = String((args && args.id) || "");
  var node; try { node = JSON.parse(raw); } catch (e) { node = null; }
  if (!node || node.k !== "serie") return { meta: null };
  var seasons = await api("/api/season/by/serie/" + node.i + "/" + KEY + "/");
  var videos = [];
  if (Array.isArray(seasons)) {
    for (var s = 0; s < seasons.length; s++) {
      var sTitle = seasons[s].title || "";
      var sNum = numOf(sTitle) || (s + 1);
      var eps = seasons[s].episodes || [];
      for (var e = 0; e < eps.length; e++) {
        var ep = eps[e];
        videos.push({
          id: playId(ep.sources),
          title: ep.title || (sNum + ". Sezon " + (e + 1) + ". Bölüm"),
          season: sNum,
          episode: numOf(ep.title) || (e + 1)
        });
      }
    }
  }
  return { meta: { id: raw, type: "series", name: node.n || "RecTV", videos: videos } };
}

function mkStream(src) {
  var isHls = src.t !== "mp4" && !/\.mp4(\?|$)/i.test(src.u) ? true : /\.m3u8(\?|$)/i.test(src.u);
  return {
    name: "RecTV",
    title: "RecTV" + (src.t ? " - " + src.t : ""),
    url: src.u,
    streamUrl: src.u,
    type: isHls ? "hls" : "mp4",
    headers: { "User-Agent": UA_PLAY, "Referer": REFERER }
  };
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var raw = String(url || tmdbId || "");
  var node; try { node = JSON.parse(raw); } catch (e) { node = null; }
  if (!node) return [];
  if (node.k === "play") {
    return (node.s || []).map(mkStream);
  }
  if (node.k === "serie") {
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
  globalThis.getCatalog = getCatalog; globalThis.getMeta = getMeta;
  globalThis.getStreams = getStreams; globalThis.search = search;
}
