/*
 * SetFilmIzle — ported from Kekik CloudStream (keyiflerolsun/SetFilmIzle).
 * HTML scraping + SetPlay/SetPrime/ExPlay extractors. Movies + series.
 */
'use strict';

var BASE = "https://www.setfilmizle.nl";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
var BOUNDARY = "---------------------------112453778312642376182726606734";

function get(url, referer) {
  var h = { "User-Agent": UA };
  if (referer) h["Referer"] = referer;
  return fetch(url, { headers: h }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.text();
  });
}
function dec(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); }).trim();
}
function fixUrl(u) { if (!u) return null; if (/^https?:/i.test(u)) return u; if (u.charAt(0) === "/") return BASE + u; return BASE + "/" + u; }

/* Parse <article> cards: title (h2), href (a), poster (img data-src). */
function parseCards(html) {
  var out = [], seen = {};
  var re = /<article[\s\S]*?<\/article>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var b = m[0];
    var t = (/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(b) || [])[1];
    var href = (/<a[^>]+href="([^"]+)"/i.exec(b) || [])[1];
    var poster = (/<img[^>]+data-src="([^"]+)"/i.exec(b) || /<img[^>]+src="([^"]+)"/i.exec(b) || [])[1];
    if (!t || !href) continue;
    t = dec(t.replace(/<[^>]*>/g, "").trim());
    href = fixUrl(href);
    if (seen[href]) continue; seen[href] = 1;
    var isTv = /\/dizi\//.test(href);
    out.push({ id: href, name: t, poster: poster ? fixUrl(poster) : null, type: isTv ? "tv" : "movie", description: null });
  }
  return out;
}

async function getCatalog(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (q) return search({ query: q });
  var cats = ["/tur/aksiyon/", "/tur/komedi/", "/tur/dram/", "/tur/korku/", "/dizi/"];
  var items = [], seen = {};
  for (var c = 0; c < cats.length; c++) {
    try {
      var html = await get(BASE + cats[c], BASE + "/");
      parseCards(html).forEach(function (it) { if (!seen[it.id]) { seen[it.id] = 1; items.push(it); } });
    } catch (e) {}
    if (items.length >= 60) break;
  }
  if (!items.length) throw new Error("SetFilmIzle katalog boş (" + BASE + ")");
  return { items: items };
}

async function search(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (!q) return { items: [] };
  var home = await get(BASE, BASE + "/");
  var nonce = (/nonce: '([^']*)'/.exec(home) || [])[1] || "";
  var body = "action=ajax_search&nonce=" + encodeURIComponent(nonce) + "&search=" + encodeURIComponent(q);
  var res = await fetch(BASE + "/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Referer": BASE + "/" },
    body: body
  });
  var txt = await res.text();
  var htmlPart = "";
  try { htmlPart = JSON.parse(txt).html || ""; } catch (e) { htmlPart = txt; }
  return { items: parseCards(htmlPart) };
}

async function getMeta(args) {
  var url = String((args && args.id) || "");
  if (!url) return { meta: null };
  var html = await get(url, BASE + "/");
  var name = dec((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || "").replace(/\s*izle.*$/i, "").trim();
  var videos = [];
  // episodes: <li> ... <h4 class="episodiotitle"><a href="EP">S. Sezon E. Bölüm ...
  var liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi, m;
  var epsBlock = (/<div id="episodes"[\s\S]*?<\/div>\s*<\/div>/i.exec(html) || [])[0] || html;
  while ((m = liRe.exec(epsBlock)) !== null) {
    var b = m[0];
    var ea = /<h4[^>]*episodiotitle[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    if (!ea) continue;
    var epHref = fixUrl(ea[1]);
    var label = dec(ea[2].replace(/<[^>]*>/g, "").trim());
    var sNum = parseInt((/(\d+)\.\s*Sezon/i.exec(label) || [])[1], 10) || 1;
    var eNum = parseInt((/Sezon\s*(\d+)/i.exec(label) || /(\d+)\.\s*Bölüm/i.exec(label) || [])[1], 10) || (videos.length + 1);
    videos.push({ id: epHref, title: label || (sNum + ". Sezon " + eNum + ". Bölüm"), season: sNum, episode: eNum });
  }
  return { meta: { id: url, type: "series", name: name || "SetFilmIzle", videos: videos } };
}

/* --- extractors (setplay.cfd / setplay.site / explay.store) --- */
async function resolveExPlayLike(iframe, host) {
  // SetPlay (setplay.cfd) & ExPlay (explay.store): GET -> videoUrl + videoServer
  var src = await get(iframe, BASE + "/");
  var vu = (/videoUrl":"([^",]+)/.exec(src) || [])[1];
  var vs = (/videoServer":"([^",]+)/.exec(src) || [])[1];
  if (!vu || !vs) return null;
  return host + vu.replace(/\\/g, "") + "?s=" + vs;
}
async function resolveSetPrime(iframe) {
  // SetPrime (setplay.site): POST embed/get -> Links
  var u = iframe.replace("embed?i=", "embed/get?i=");
  var res = await fetch(u, { method: "POST", headers: { "User-Agent": UA, "Referer": iframe } });
  var src = await res.text();
  var links = (/Links":\["([^"\]]+)/.exec(src) || [])[1];
  if (!links || links.charAt(0) !== "/") return null;
  return "https://setplay.site" + links;
}
async function resolveIframe(iframe) {
  var clean = iframe.split("?partKey=")[0];
  try {
    if (/explay\.store/.test(iframe)) { var e = await resolveExPlayLike(clean, "https://explay.store"); if (e) return e; }
    if (/setplay\.site/.test(iframe)) { var p = await resolveSetPrime(clean); if (p) return p; }
    if (/setplay\.cfd/.test(iframe)) { var s = await resolveExPlayLike(clean, "https://setplay.cfd"); if (s) return s; }
  } catch (e) {}
  return null;
}

function multipart(fields) {
  var b = "";
  for (var k in fields) {
    b += "--" + BOUNDARY + "\r\n";
    b += 'Content-Disposition: form-data; name="' + k + '"\r\n\r\n';
    b += fields[k] + "\r\n";
  }
  b += "--" + BOUNDARY + "--\r\n";
  return b;
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var pageUrl = String(url || tmdbId || "");
  if (!pageUrl) return [];
  var html = await get(pageUrl, BASE + "/");
  var nonce = (/nonce: '([^']*)'/.exec(html) || [])[1] || "";
  var streams = [];
  var re = /<a[^>]+class="[^"]*"[^>]*data-post-id="([^"]*)"[^>]*data-player-name="([^"]*)"[^>]*data-part-key="([^"]*)"[^>]*>/gi;
  // also try generic nav.player a with any attr order
  var players = [];
  var aRe = /<a\b[^>]*>/gi, am;
  while ((am = aRe.exec(html)) !== null) {
    var tag = am[0];
    var pid = (/data-post-id="([^"]*)"/.exec(tag) || [])[1];
    var pname = (/data-player-name="([^"]*)"/.exec(tag) || [])[1];
    var pkey = (/data-part-key="([^"]*)"/.exec(tag) || [])[1];
    if (pid && pname != null && pkey != null && !/event/.test(pid)) players.push({ pid: pid, name: pname, key: pkey });
  }
  for (var i = 0; i < players.length && i < 6; i++) {
    var p = players[i];
    if (!p.key || !p.pid) continue;
    try {
      var res = await fetch(BASE + "/wp-admin/admin-ajax.php", {
        method: "POST",
        headers: { "User-Agent": UA, "Referer": pageUrl, "Content-Type": "multipart/form-data; boundary=" + BOUNDARY },
        body: multipart({ action: "get_video_url", nonce: nonce, post_id: p.pid, player_name: p.name, part_key: p.key })
      });
      var sb = await res.text();
      var iframe = null;
      try { var jo = JSON.parse(sb); iframe = jo && jo.data && jo.data.url; } catch (e) {}
      if (!iframe) continue;
      if (/explay\.store|setplay\.site/.test(iframe)) iframe = iframe + "?partKey=" + p.key;
      var m3u8 = await resolveIframe(iframe);
      if (m3u8) streams.push({
        name: "SetFilmIzle", title: "SetFilmIzle - " + (p.name || "oynatıcı"),
        url: m3u8, streamUrl: m3u8, type: "hls",
        headers: { "User-Agent": UA, "Referer": BASE + "/" }
      });
    } catch (e) {}
  }
  return streams;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCatalog: getCatalog, getMeta: getMeta, getStreams: getStreams, search: search };
}
if (typeof globalThis !== 'undefined') {
  globalThis.getCatalog = getCatalog; globalThis.getMeta = getMeta;
  globalThis.getStreams = getStreams; globalThis.search = search;
}
