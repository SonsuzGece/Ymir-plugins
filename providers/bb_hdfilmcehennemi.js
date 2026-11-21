'use strict';
// HDFilmCehennemi — https://www.hdfilmcehennemi.land (ported from BTVault HDFilmCehennemi.kt)
// Uses article.item catalog, /?s= search, wp-admin/admin-ajax.php (get_video_url)
// + SPG.cerceve XOR decode + fastplay.mom X-Sp (FNV-1a) + generic iframe/m3u8 fallback.

var BASE = "https://www.hdfilmcehennemi.land";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function hdrs(ref) {
  var h = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
  if (ref) h["Referer"] = ref;
  return h;
}

async function fetchText(url, opts) {
  var o = opts || {};
  var h = hdrs(o.referer);
  if (o.headers) { for (var k in o.headers) h[k] = o.headers[k]; }
  var r = await fetch(url, { method: o.method || "GET", headers: h, body: o.body });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return await r.text();
}

function abs(u) {
  if (!u) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.charAt(0) === "/") return BASE + u;
  return u;
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCards(html) {
  var out = [], seen = {};
  var re = /<article[^>]*class="[^"]*\bitem\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var blk = m[1];
    var hm = blk.match(/<a[^>]*href="([^"]+)"/i);
    if (!hm) continue;
    var href = abs(hm[1]);
    if (seen[href]) continue;
    var tm = blk.match(/<h2[^>]*class="[^"]*flbaslik[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
          || blk.match(/title="([^"]+)"/i)
          || blk.match(/alt="([^"]+)"/i);
    var title = tm ? stripTags(tm[1]) : "";
    if (!title || title.length < 2) continue;
    var im = blk.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i);
    var poster = im ? abs(im[1]) : null;
    if (poster && /^data:/i.test(poster)) poster = null;
    seen[href] = 1;
    var isSeries = href.indexOf("/dizi/") !== -1;
    out.push({ id: href, name: title, poster: poster, type: isSeries ? "tv" : "movie", description: "" });
  }
  return out;
}

async function getCatalog(args) {
  var q = args && (args.query || args.search) ? String(args.query || args.search).trim() : "";
  if (q) return search(q);
  var html = await fetchText(BASE + "/film/", { referer: BASE + "/" });
  var items = parseCards(html);
  if (!items.length) {
    html = await fetchText(BASE + "/", { referer: BASE + "/" });
    items = parseCards(html);
  }
  return { items: items.slice(0, 40) };
}

async function search(args) {
  var q = (typeof args === "object" && args) ? String(args.query || args.search || "").trim() : String(args || "").trim();
  if (!q) return { items: [] };
  var html = await fetchText(BASE + "/?s=" + encodeURIComponent(q), { referer: BASE + "/" });
  var items = parseCards(html);
  if (!items.length) {
    var re = /<a[^>]+href="(https?:\/\/www\.hdfilmcehennemi\.land\/(?:film|dizi)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, m, seen = {};
    while ((m = re.exec(html)) !== null) {
      if (seen[m[1]]) continue; seen[m[1]] = 1;
      var t = stripTags(m[2]); if (t.length < 2) continue;
      items.push({ id: m[1], name: t, poster: null, type: m[1].indexOf("/dizi/") !== -1 ? "tv" : "movie", description: "" });
    }
  }
  return { items: items.slice(0, 40) };
}

async function getMeta(args) {
  var id = (typeof args === "object" && args) ? String(args.id || "") : String(args || "");
  if (!id || id.indexOf("http") !== 0) return { meta: { id: id, type: "movie", name: "HDFilmCehennemi", videos: [] } };
  var html = await fetchText(id, { referer: BASE + "/" });
  var tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var title = tm ? stripTags(tm[1]) : "HDFilmCehennemi";
  var videos = [];
  if (id.indexOf("/dizi/") !== -1) {
    var re = /<a[^>]*href="([^"]*(?:bolum|sezon)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, m, seen = {};
    while ((m = re.exec(html)) !== null) {
      var u = abs(m[1]);
      if (seen[u]) continue; seen[u] = 1;
      var sm = u.match(/(\d+)-sezon/i), em = u.match(/(\d+)-bolum/i);
      videos.push({
        id: u,
        title: stripTags(m[2]) || ("Bölüm " + (em ? em[1] : videos.length + 1)),
        season: sm ? parseInt(sm[1], 10) : 1,
        episode: em ? parseInt(em[1], 10) : (videos.length + 1)
      });
    }
  }
  return { meta: { id: id, type: videos.length ? "tv" : "movie", name: title, videos: videos } };
}

function fnv1a(input) {
  var hash = 2166136261 >>> 0;
  for (var i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash >>> 0);
}

function generateXSp(sp, spT) {
  var r = Math.floor(2176782336 * Math.random()).toString(36);
  var hash = fnv1a(sp + "|" + spT + "|" + r);
  return spT + "." + r + "." + hash;
}

function spgDecode(payloadB64, keyB64) {
  var enc = atob(payloadB64);
  var key = atob(keyB64);
  if (!enc.length || !key.length) return "";
  var out = "";
  for (var i = 0; i < enc.length; i++) {
    out += String.fromCharCode(enc.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var pageUrl = (typeof url === "string" && url.indexOf("http") === 0) ? url
              : (typeof tmdbId === "string" && tmdbId.indexOf("http") === 0) ? tmdbId : "";
  if (!pageUrl) return [];
  var out = [], seen = {};
  function pushStream(u, label, ref, extraHdrs) {
    if (!u || u.indexOf("http") !== 0 || seen[u]) return;
    seen[u] = 1;
    var h = { "User-Agent": UA, "Referer": ref || pageUrl };
    if (extraHdrs) { for (var k in extraHdrs) h[k] = extraHdrs[k]; }
    var isHls = /\.m3u8|master\.txt|playlist/i.test(u) && !/\.mp4(\?|$)/i.test(u);
    out.push({ name: "HDFilmCehennemi · " + label, url: u, type: isHls ? "hls" : "mp4", headers: h });
  }
  try {
    var html = await fetchText(pageUrl, { referer: BASE + "/" });
    // 1. BTVault SetPlay / FastPlay AJAX flow
    var nonceM = html.match(/window\.videoAjax\s*=\s*\{[^}]*nonce:\s*'([^']+)'/) || html.match(/nonce:\s*'([^']+)'/);
    var postIdM = html.match(/data-post-id="(\d+)"/) || html.match(/post_id['"]?\s*[:=]\s*['"]?(\d+)/);
    var playerM = html.match(/data-player-name="([^"]+)"/);
    if (nonceM && postIdM) {
      var body = "action=get_video_url&nonce=" + encodeURIComponent(nonceM[1])
               + "&post_id=" + encodeURIComponent(postIdM[1])
               + "&player_name=" + encodeURIComponent(playerM ? playerM[1] : "SetPlay")
               + "&part_key=";
      try {
        var ajaxTxt = await fetchText(BASE + "/wp-admin/admin-ajax.php", {
          method: "POST",
          referer: pageUrl,
          headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
          body: body
        });
        var um = ajaxTxt.match(/"url"\s*:\s*"([^"]+)"/) || ajaxTxt.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (um) {
          var iframeUrl = um[1].replace(/\\\//g, "/");
          var iframeHtml = await fetchText(iframeUrl, { referer: pageUrl });
          var cer = iframeHtml.match(/SPG\.cerceve\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/);
          if (cer) {
            var fpUrl = spgDecode(cer[1], cer[2]);
            if (fpUrl && fpUrl.indexOf("http") === 0) {
              var fpHtml = await fetchText(fpUrl, { referer: iframeUrl, headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36" } });
              var sm = fpHtml.match(/stream:\s*"([^"]+)"/);
              var spM = fpHtml.match(/"sp"\s*:\s*"([^"]+)"/);
              var spTM = fpHtml.match(/"spT"\s*:\s*(\d+)/);
              if (sm && spM && spTM) {
                var xSp = generateXSp(spM[1], spTM[1]);
                var originM = fpUrl.match(/^(https?:\/\/[^/]+)/);
                var host = originM ? originM[1] : "https://fastplay.mom";
                pushStream(host + sm[1], "FastPlay 1080p", fpUrl, { "X-Sp": xSp });
              }
              var directFp = fpHtml.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi) || [];
              for (var k = 0; k < directFp.length; k++) pushStream(directFp[k], "FastPlay", fpUrl);
            }
          }
        }
      } catch (e) {}
    }
    // 2. Fallback: direct m3u8/mp4 and iframes
    var clean = html.replace(/\\\//g, "/");
    var dm = clean.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi) || [];
    for (var i = 0; i < dm.length; i++) pushStream(dm[i], "Direct", pageUrl);
    if (!out.length) {
      var ifr = /<iframe[^>]+(?:data-src|src)="([^"]+)"/gi, fm, tried = 0;
      while ((fm = ifr.exec(html)) !== null && tried < 3) {
        var fUrl = abs(fm[1]);
        if (!fUrl || /google|facebook|twitter|ads/i.test(fUrl)) continue;
        tried++;
        try {
          var fHtml = (await fetchText(fUrl, { referer: pageUrl })).replace(/\\\//g, "/");
          var fMedia = fHtml.match(/https?:\/\/[^"'\s<>\\]+\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi) || [];
          for (var j = 0; j < fMedia.length; j++) pushStream(fMedia[j], "Embed", fUrl);
        } catch (e) {}
      }
    }
  } catch (e) {}
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") { globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; }
