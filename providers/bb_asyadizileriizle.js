'use strict';
var BASE = "https://asyadizileriizle.com";
var NAME = "AsyaDizileriIzle";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function hdrs(ref, extra) {
  var h = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
  if (ref) h["Referer"] = ref;
  if (extra) { for (var k in extra) h[k] = extra[k]; }
  return h;
}

async function httpGet(url, ref, extra) {
  var r = await fetch(url, { method: "GET", headers: hdrs(ref, extra) });
  var t = await r.text();
  return { ok: r.ok, status: r.status, text: t, url: r.url || url };
}

async function httpPost(url, body, ref, extra) {
  var h = hdrs(ref, extra);
  if (!h["Content-Type"]) h["Content-Type"] = "application/x-www-form-urlencoded";
  var r = await fetch(url, { method: "POST", headers: h, body: body });
  var t = await r.text();
  return { ok: r.ok, status: r.status, text: t, url: r.url || url };
}

function absUrl(u, base) {
  if (!u) return "";
  u = String(u).trim();
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return (base || BASE) + u;
  return (base || BASE) + "/" + u;
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function attrOf(tag, name) {
  var m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', "i"));
  return m ? m[1] : "";
}

function argQuery(args) {
  if (typeof args === "string") return args.trim();
  if (args && typeof args === "object") return String(args.query || args.search || (args.extra && args.extra.search) || "").trim();
  return "";
}

function argId(args) {
  if (typeof args === "string") return args.trim();
  if (args && typeof args === "object") return String(args.id || "").trim();
  return "";
}

function streamUrlArg(tmdbId, url) {
  if (typeof url === "string" && url.indexOf("http") === 0) return url;
  if (typeof tmdbId === "string" && tmdbId.indexOf("http") === 0) return tmdbId;
  if (tmdbId && typeof tmdbId === "object" && typeof tmdbId.id === "string") return tmdbId.id;
  return "";
}

function pushDirectMedia(text, ref, label, out, seen) {
  var clean = String(text || "").replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/&amp;/g, "&");
  var re = /https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi, m;
  while ((m = re.exec(clean)) !== null) {
    var u = m[0];
    if (seen[u] || /cloudflare\.com\/static/i.test(u)) continue;
    seen[u] = 1;
    var isHls = /\.m3u8/i.test(u) && !/\.mp4(\?|$)/i.test(u);
    out.push({ name: label || NAME, url: u, type: isHls ? "hls" : "mp4", headers: { "User-Agent": UA, "Referer": ref || (BASE + "/") } });
  }
}

async function resolveOkRu(embed, label, out, seen) {
  var idm = embed.match(/videoembed\/(\d+)/) || embed.match(/video\/(\d+)/);
  if (!idm) return;
  try {
    var r = await httpPost("https://ok.ru/dk?cmd=videoPlayerMetadata&mid=" + idm[1], "", "https://ok.ru/");
    var j = JSON.parse(r.text);
    var vids = (j && j.videos) || [];
    for (var i = 0; i < vids.length; i++) {
      var u = vids[i].url;
      if (!u || u.indexOf("http") !== 0 || seen[u]) continue;
      seen[u] = 1;
      out.push({ name: (label || NAME) + " · OkRu " + (vids[i].name || ""), url: u, type: "mp4", headers: { "User-Agent": UA, "Referer": "https://ok.ru/" } });
    }
  } catch (e) {}
}

async function resolveTauVideo(embed, label, out, seen) {
  var km = embed.match(/\/embed\/([A-Za-z0-9_-]+)/) || embed.match(/\/video\/([A-Za-z0-9_-]+)/);
  if (!km) return;
  try {
    var r = await httpGet("https://tau-video.xyz/api/video/" + km[1], "https://tau-video.xyz/");
    var j = JSON.parse(r.text);
    var urls = (j && j.urls) || [];
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i].url;
      if (!u || u.indexOf("http") !== 0 || seen[u]) continue;
      seen[u] = 1;
      out.push({ name: (label || NAME) + " · " + (urls[i].label || "TauVideo"), url: u, type: /\.m3u8/.test(u) ? "hls" : "mp4", headers: { "User-Agent": UA } });
    }
  } catch (e) {}
}

async function resolveEmbedUrl(frame, ref, label, out, seen) {
  var u = absUrl(frame);
  if (!u || u.indexOf("http") !== 0 || /youtu\.?be|facebook\.com|twitter\.com|google|ads|vzaar/i.test(u)) return;
  if (/\.m3u8|\.mp4/i.test(u)) { pushDirectMedia(u, ref, label, out, seen); return; }
  if (/ok\.ru|odnoklassniki/i.test(u)) { await resolveOkRu(u, label, out, seen); return; }
  if (/tau-video\.xyz/i.test(u)) { await resolveTauVideo(u, label, out, seen); return; }
  try {
    var target = u.replace(/vidmoly\.(?:to|me|biz)/i, "vidmoly.net");
    var r = await httpGet(target, ref || (BASE + "/"));
    pushDirectMedia(r.text, target, label, out, seen);
    var jsRedir = r.text.match(/location\.replace\(\s*['"](https?:\/\/[^'"]+)['"]\s*\)/i);
    if (jsRedir) {
      var r2 = await httpGet(jsRedir[1], target);
      pushDirectMedia(r2.text, jsRedir[1], label, out, seen);
    }
  } catch (e) {}
}

async function extractGenericStreams(pageUrl, html, out, seen, followParts) {
  pushDirectMedia(html, pageUrl, NAME, out, seen);
  var clean = html.replace(/\\\//g, "/").replace(/\\"/g, '"');
  var embeds = [];
  var er = /"(?:embedUrl|contentUrl|embed_url|player_url)"\s*:\s*"([^"]+)"/gi, em;
  while ((em = er.exec(clean)) !== null) embeds.push(em[1]);
  var fr = /<iframe[^>]+(?:data-src|data-lazy-src|vdo-src|src)=["']([^"']+)["']/gi, fm;
  while ((fm = fr.exec(html)) !== null) embeds.push(fm[1]);
  var tried = {};
  for (var i = 0; i < embeds.length && i < 6; i++) {
    var eUrl = absUrl(embeds[i]);
    if (!eUrl || tried[eUrl]) continue;
    tried[eUrl] = 1;
    await resolveEmbedUrl(eUrl, pageUrl, NAME, out, seen);
  }
  if (followParts && !out.length) {
    var basePage = pageUrl.replace(/\/+$/, "");
    var pre = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi, pm, parts = [];
    while ((pm = pre.exec(html)) !== null) {
      var pu = absUrl(pm[1]).replace(/\/+$/, "");
      if (pu.indexOf(basePage + "/") === 0 && /\/\d+$/.test(pu) && parts.indexOf(pu) < 0) parts.push(pu);
    }
    for (var p = 0; p < parts.length && p < 3; p++) {
      try {
        var pr = await httpGet(parts[p], pageUrl);
        await extractGenericStreams(parts[p], pr.text, out, seen, false);
      } catch (e) {}
    }
  }
}

function genericCards(html, defaultType) {
  var out = [], seen = {};
  var re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var open = m[1] + " " + m[3], href = m[2], inner = m[4];
    if (!/<img/i.test(inner)) continue;
    var full = absUrl(href);
    if (full.indexOf(BASE) !== 0) continue;
    var path = full.slice(BASE.length).split("?")[0];
    if (!path || path === "/" || /\/(category|kategori|tur|tag|etiket|page|sayfa|oyuncu|yil|wp-|login|giris|uye-ol)\b/i.test(path)) continue;
    if (seen[full]) continue;
    var imgTag = (inner.match(/<img[^>]*>/i) || [""])[0];
    var title = stripTags(attrOf(open, "title") || attrOf(imgTag, "alt") || attrOf(imgTag, "title") || inner);
    if (!title || title.length < 2 || title.toLowerCase() === "poster") continue;
    var poster = absUrl(attrOf(imgTag, "data-src") || attrOf(imgTag, "data-lazy-src") || attrOf(imgTag, "src"));
    if (poster && /^data:/i.test(poster)) poster = null;
    seen[full] = 1;
    var type = defaultType || (/\/(dizi|seri|anime|series)\b/i.test(path) ? "tv" : "movie");
    out.push({ id: full, name: title, poster: poster || null, type: type, description: "" });
  }
  return out;
}

function genericEpisodes(html, pageUrl) {
  var videos = [], seen = {};
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var full = absUrl(m[1]);
    if (full.indexOf(BASE) !== 0 || /share|facebook|twitter|whatsapp|pinterest/i.test(full)) continue;
    var path = full.slice(BASE.length).split("?")[0];
    if (!/(bolum|episode|sezon|season)/i.test(path)) continue;
    if (seen[full]) continue; seen[full] = 1;
    var em = path.match(/(\d+)[-_]?(?:bolum|episode)/i) || path.match(/(?:bolum|episode)[-_/]?(\d+)/i);
    var sm = path.match(/(\d+)[-_]?(?:sezon|season)/i) || path.match(/(?:sezon|season)[-_/]?(\d+)/i);
    var ep = em ? parseInt(em[1], 10) : (videos.length + 1);
    var sn = sm ? parseInt(sm[1], 10) : 1;
    var lbl = stripTags(m[2]) || ("S" + sn + " B" + ep);
    videos.push({ id: full, title: lbl, season: sn, episode: ep });
  }
  videos.sort(function (a, b) { return (a.season - b.season) || (a.episode - b.episode); });
  if (!videos.length) videos.push({ id: pageUrl, title: "İzle", season: 1, episode: 1 });
  return videos;
}

async function getCatalog(args) {
  var q = argQuery(args);
  if (q) return search(q);
  var r = await httpGet(BASE + "/dizi-arsivi/", BASE + "/");
  var items = genericCards(r.text, "tv");
  if (!items.length && "/dizi-arsivi/" !== "/") {
    var r2 = await httpGet(BASE + "/", BASE + "/");
    items = genericCards(r2.text, "tv");
  }
  return { items: items.slice(0, 60) };
}
async function search(args) {
  var q = argQuery(args);
  if (!q) return { items: [] };
  var r = await httpGet(BASE + "/?s={Q}".replace("{Q}", encodeURIComponent(q)), BASE + "/");
  return { items: genericCards(r.text, "tv").slice(0, 40) };
}
async function getMeta(args) {
  var url = argId(args);
  if (!url || url.indexOf("http") !== 0) return { meta: { id: url, type: "tv", name: NAME, videos: [] } };
  var r = await httpGet(url, BASE + "/");
  var tm = r.text.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || r.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var title = tm ? stripTags(tm[1]).replace(/\s*\|.*$/, "") : NAME;
  var videos = genericEpisodes(r.text, url);
  return { meta: { id: url, type: videos.length > 1 ? "tv" : "movie", name: title, videos: videos } };
}
async function getStreams(tmdbId, mediaType, season, episode, url) {
  var page = streamUrlArg(tmdbId, url);
  if (!page) return [];
  var out = [], seen = {};
  var r = await httpGet(page, BASE + "/");
  await extractGenericStreams(page, r.text, out, seen, true);
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") {
  globalThis.getCatalog = getCatalog; globalThis.search = search;
  globalThis.getMeta = getMeta; globalThis.getStreams = getStreams;
}
