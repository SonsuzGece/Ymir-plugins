'use strict';
// AsyaDizi — asyadizi.com (ported from bigbullapp-cs AsyaDiziProvider.kt, current domain)
// Generic HTML scraper: cards from a[href]+img; streams via m3u8/mp4 regex, iframes, OkRu.

var BASE = "https://asyadizi.com";
var NAME = "AsyaDizi";
var ROWS = [
  ["Son Eklenenler", "/"],
  ["Kore Dizileri", "/kore-dizileri-izle/"],
  ["Çin Dizileri", "/cin-dizisi-izle/"],
  ["BL Dizileri", "/bl-dizileri-izle/"],
  ["Japon Dizileri", "/japon-dizileri-izle/"]
];
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function H(ref) { var h = { "User-Agent": UA }; if (ref) h["Referer"] = ref; return h; }
function get(url, ref) { return fetch(url, { method: "GET", headers: H(ref) }).then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t, ok: r.ok }; }); }); }
function fixUrl(u) { if (!u) return u; if (u.indexOf("//") === 0) return "https:" + u; if (u.charAt(0) === "/") return BASE + u; return u; }
function attr(tag, name) { var m = tag.match(new RegExp(name + '="([^"]*)"', "i")); return m ? m[1] : ""; }

function cards(html, query) {
  var out = [], seen = {};
  var re = /<a\b([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var open = m[1] + " " + m[3];
    var href = m[2];
    var inner = m[4];
    if (!/<img/i.test(inner)) continue;
    var path = href.replace(BASE, "").split("?")[0];
    if (path.charAt(0) !== "/") continue;
    if (/login|uye-ol|\/giris|\/kategori\/?$|\/etiket/i.test(path)) continue;
    var full = fixUrl(href);
    if (seen[full]) continue;
    var imgTag = inner.match(/<img[^>]*>/i); imgTag = imgTag ? imgTag[0] : "";
    var title = (attr(open, "title") || attr(imgTag, "title") || attr(imgTag, "alt") ||
      inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!title || title.toLowerCase() === "poster" || title.length < 2) continue;
    if (query && title.toLowerCase().indexOf(query.toLowerCase()) < 0 && full.toLowerCase().indexOf(query.toLowerCase()) < 0) continue;
    seen[full] = 1;
    var poster = fixUrl(attr(imgTag, "data-src") || attr(imgTag, "src"));
    var low = full.toLowerCase();
    var type = (/\/dizi\/|\/seri\/|\/anime\/|\/series\//.test(low)) ? "tv" : "movie";
    out.push({ id: full, name: title, poster: poster, type: type, description: "" });
  }
  return out;
}

async function getCatalog() {
  var r = await get(BASE + "/", BASE + "/");
  var items = cards(r.text);
  return { items: items.slice(0, 60) };
}
async function search(query) {
  var r = await get(BASE + "/?s=" + encodeURIComponent(query), BASE + "/");
  return { items: cards(r.text, query).slice(0, 40) };
}

async function getMeta(id) {
  var url = id;
  var r = await get(url, BASE + "/");
  var html = r.text;
  var title = (attr(html, "og:title\"[^>]*content") || "");
  var tm = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  title = tm ? tm[1].replace(/<[^>]+>/g, "").replace(/\s*\|.*$/, "").replace(/\s+/g, " ").trim() : "";
  var basePath = url.replace(BASE, "").split("?")[0].replace(/\/+$/, "");
  var slug = basePath.split("/").filter(Boolean).pop() || "";
  var slugBase = slug.replace(/-izle$/, "").replace(/-film-izle$/, "");
  var videos = [], seen = {};
  var re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var href = m[1];
    if (/share|facebook\.com|twitter\.com|whatsapp\.com|pinterest/i.test(href)) continue;
    var full = fixUrl(href);
    if (full.indexOf(BASE) !== 0) continue;
    var path = full.replace(BASE, "").split("?")[0];
    if (basePath && path.indexOf(basePath) !== 0 && path.indexOf(slug) < 0 && (!slugBase || path.indexOf(slugBase) < 0)) continue;
    if (!/(bolum|episode|sezon|season)/i.test(path)) continue;
    if (seen[full]) continue; seen[full] = 1;
    // Turkish slugs put the number BEFORE the word: "1-sezon-2-bolum" = s1e2.
    var num = null, sm;
    if ((sm = path.match(/(\d+)[-_]?(?:bolum|episode)/i))) num = parseInt(sm[1], 10);
    else if ((sm = path.match(/(?:bolum|episode)[-_/]?(\d+)/i))) num = parseInt(sm[1], 10);
    var sz = path.match(/(\d+)[-_]?(?:sezon|season)/i) || path.match(/(?:sezon|season)[-_/]?(\d+)/i);
    var season = sz ? parseInt(sz[1], 10) : 1;
    var label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || ("Bölüm " + num);
    videos.push({ id: full, title: label, season: season, episode: num || (videos.length + 1) });
  }
  videos.sort(function (a, b) { return (a.season - b.season) || (a.episode - b.episode); });
  if (!videos.length) videos.push({ id: url, title: title || "Film", season: 1, episode: 1 });
  return { meta: { id: id, name: title, type: videos.length > 1 ? "tv" : "movie", videos: videos } };
}

async function loadOkRu(embed, out, seen) {
  var idm = embed.match(/videoembed\/(\d+)/) || embed.match(/video\/(\d+)/);
  if (!idm) return;
  try {
    var r = await fetch("https://ok.ru/dk?cmd=videoPlayerMetadata&mid=" + idm[1], { method: "POST", headers: { "User-Agent": UA, "Referer": "https://ok.ru/" } });
    var j = JSON.parse(await r.text());
    var vids = (j && j.videos) || [];
    for (var i = 0; i < vids.length; i++) {
      var u = vids[i].url; if (!u || u.indexOf("http") !== 0 || seen[u]) continue; seen[u] = 1;
      out.push({ name: NAME + " · OkRu " + (vids[i].name || ""), url: u, type: "mp4", headers: { "User-Agent": UA, "Referer": "https://ok.ru/" } });
    }
  } catch (e) {}
}

function pushMedia(text, ref, out, seen) {
  var re = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi, m;
  while ((m = re.exec(text)) !== null) {
    var u = m[0]; if (seen[u]) continue; seen[u] = 1;
    out.push({ name: NAME, url: u, type: /\.m3u8/.test(u) ? "hls" : "mp4", headers: { "User-Agent": UA, "Referer": ref } });
  }
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var data = url || tmdbId;
  var out = [], seen = {};
  var first = await get(data, BASE + "/");
  var baseData = data.replace(/\/+$/, "");
  var partUrls = [data];
  var pre = new RegExp("<a\\b[^>]*href=\"(" + baseData.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\/\\d+)\"", "gi"), pm;
  while ((pm = pre.exec(first.text)) !== null) { if (partUrls.indexOf(pm[1]) < 0) partUrls.push(pm[1]); }
  partUrls = partUrls.slice(0, 6);

  for (var p = 0; p < partUrls.length; p++) {
    var resp = (partUrls[p] === data) ? first : await get(partUrls[p], data).catch(function () { return null; });
    if (!resp) continue;
    var text = resp.text.replace(/\\\//g, "/").replace(/\\"/g, '"');
    pushMedia(text, partUrls[p], out, seen);
    // embed/content urls
    var er = /"(?:embedUrl|contentUrl|embed_url|player_url)"\s*:\s*"([^"]+)"/gi, em;
    var embeds = [];
    while ((em = er.exec(text)) !== null) embeds.push(em[1]);
    // iframes
    var fr = /<iframe[^>]+(?:data-src|vdo-src|src)="([^"]+)"/gi, fm;
    while ((fm = fr.exec(resp.text)) !== null) embeds.push(fm[1]);
    for (var i = 0; i < embeds.length; i++) {
      var frame = fixUrl(embeds[i].replace(/\\\//g, "/"));
      if (!frame || frame.indexOf("http") !== 0 || /youtu|vzaar\.com/.test(frame)) continue;
      if (/\.m3u8|\.mp4/.test(frame)) { pushMedia(frame, partUrls[p], out, seen); continue; }
      if (/ok\.ru|odnoklassniki/.test(frame)) { await loadOkRu(frame, out, seen); continue; }
      try {
        var inner = (await get(frame, partUrls[p])).text.replace(/\\\//g, "/");
        pushMedia(inner, frame, out, seen);
      } catch (e) {}
    }
  }
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") { globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; }
