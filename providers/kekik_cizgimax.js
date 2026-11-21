'use strict';
// ÇizgiMax — cizgimax.online  (ported from bigbullapp-cs CizgimaxProvider.kt, current domain)
// Catalog: plain HTML `div.film-item` cards. Players hidden in base64 blob:
//   var servers = JSON.parse(atob("...")) -> [{streamUrl|src|resolveUrl|ytId,...}]
//   streamUrl = site proxy HLS/MP4 (needs episode page as Referer).
//   resolveUrl = dzen -> tau-video key -> tau-video api.

var BASE = "https://cizgimax.online";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
function H(ref) { var h = { "User-Agent": UA, "Accept": "text/html,application/json" }; if (ref) h["Referer"] = ref; return h; }

function get(url, ref) {
  return fetch(url, { method: "GET", headers: H(ref) }).then(function (r) {
    return r.text().then(function (t) { return { status: r.status, text: t }; });
  });
}
function abs(u) { if (!u) return u; if (u.indexOf("//") === 0) return "https:" + u; if (u.charAt(0) === "/") return BASE + u; return u; }

// --- parse `div.film-item` cards: title+url (a.film-name -> /diziler/) and first img ---
function parseCards(html) {
  var out = [], seen = {};
  var chunks = html.split("film-item");
  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i];
    var a = c.match(/<a[^>]*class="[^"]*film-name[^"]*"[^>]*href="([^"]*\/diziler\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
         || c.match(/<a[^>]*href="([^"]*\/diziler\/[^"]*)"[^>]*class="[^"]*film-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    var url = abs(a[1]);
    if (seen[url]) continue; seen[url] = 1;
    var name = a[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    var img = c.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i);
    var poster = img ? abs(img[1]) : "";
    out.push({ id: url, name: name, poster: poster, type: "tv", description: "" });
  }
  return out;
}

async function getCatalog(args) {
  var q = args && (args.query || args.search) ? String(args.query || args.search).trim() : "";
  if (q) return search(q);
  var r = await get(BASE + "/", BASE + "/");
  var items = parseCards(r.text);
  if (!items.length) { // fallback to the series archive
    var r2 = await get(BASE + "/diziler/", BASE + "/");
    items = parseCards(r2.text);
  }
  return { items: items.slice(0, 60) };
}

async function search(args) {
  var query = (typeof args === "object" && args) ? String(args.query || args.search || "") : String(args || "");
  var r = await get(BASE + "/ara/?q=" + encodeURIComponent(query) + "&page=1", BASE + "/");
  return { items: parseCards(r.text).slice(0, 40) };
}

async function getMeta(args) {
  var id = (typeof args === "object" && args) ? String(args.id || "") : String(args || "");
  var url = id;
  var r = await get(url, BASE + "/");
  var html = r.text;
  var title = "";
  var tm = html.match(/<h1[^>]*>\s*<a[^>]*class="[^"]*anime-title-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
        || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (tm) title = tm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  var videos = [], seen = {};
  // a.ep-num-btn[href] with span.ep-num-label
  var re = /<a[^>]*class="[^"]*ep-num-btn[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var href = abs(m[1]);
    if (seen[href]) continue; seen[href] = 1;
    var sm = href.match(/-(\d+)-sezon-\d+-bolum-izle/);
    var season = sm ? parseInt(sm[1], 10) : 1;
    var lm = m[2].match(/class="[^"]*ep-num-label[^"]*"[^>]*>\s*(\d+)/i);
    var ep = lm ? parseInt(lm[1], 10) : (videos.length + 1);
    videos.push({ id: href, title: "S" + season + " B" + ep, season: season, episode: ep });
  }
  if (!videos.length) videos.push({ id: url, title: title || "Bölüm 1", season: 1, episode: 1 });
  return { meta: { id: id, name: title, type: "tv", videos: videos } };
}

function decodeBlob(v) {
  var clean = v.replace(/\\/g, "");
  while (clean.length % 4) clean += "=";
  return atob(clean);
}

async function tauVideo(resolveUrl, ref, out) {
  try {
    var ru = resolveUrl.indexOf("http") === 0 ? resolveUrl : (BASE + resolveUrl);
    var r = await get(ru, ref);
    var key = (JSON.parse(r.text) || {}).id;
    if (!key) return;
    var r2 = await fetch("https://tau-video.xyz/api/video/" + key, { headers: { "User-Agent": UA, "Referer": "https://tau-video.xyz/" } });
    var j = await r2.json();
    var urls = (j && j.urls) || [];
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i].url;
      if (u && u.indexOf("http") === 0) out.push({ name: "ÇizgiMax · " + (urls[i].label || "TauVideo"), url: u, type: "mp4", headers: { "User-Agent": UA } });
    }
  } catch (e) {}
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var page = (typeof url === "string" && url.indexOf("http") === 0) ? url : (typeof tmdbId === "string" ? tmdbId : (tmdbId && tmdbId.id ? String(tmdbId.id) : ""));
  if (!page || page.indexOf("http") !== 0) return [];
  var out = [];
  var r = await get(page, BASE + "/");
  var sm = r.text.match(/var servers\s*=\s*JSON\.parse\(atob\("([^"]+)"\)\)/);
  if (!sm) return out;
  var servers;
  try { servers = JSON.parse(decodeBlob(sm[1])); } catch (e) { return out; }
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i] || {};
    var label = s.label || s.type || ("Kaynak " + (i + 1));
    try {
      if (s.streamUrl) {
        var isMp4 = s.type === "mailru" || /mp4=1/.test(s.streamUrl);
        out.push({ name: "ÇizgiMax · " + label, url: abs(s.streamUrl), type: isMp4 ? "mp4" : "hls", headers: { "User-Agent": UA, "Referer": page } });
      } else if (s.resolveUrl) {
        await tauVideo(s.resolveUrl, page, out);
      } else if (s.ytId) {
        out.push({ name: "ÇizgiMax · YouTube", url: "https://www.youtube.com/watch?v=" + s.ytId, type: "mp4", headers: { "User-Agent": UA } });
      } else if (s.src && (s.src.indexOf("http") === 0 || s.src.indexOf("//") === 0)) {
        out.push({ name: "ÇizgiMax · " + label, url: abs(s.src), type: "mp4", headers: { "User-Agent": UA, "Referer": page } });
      }
    } catch (e) {}
  }
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") { globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; }
