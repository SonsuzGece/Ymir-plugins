'use strict';
var BASE = "https://www.hdfilmdiziizle.com";
var NAME = "HDFilmDiziIzle";

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
  var r = await httpGet(BASE + "/film/", BASE + "/");
  var items = genericCards(r.text, "movie");
  if (!items.length) { var r2 = await httpGet(BASE + "/", BASE + "/"); items = genericCards(r2.text, "movie"); }
  return { items: items.slice(0, 60) };
}
async function search(args) {
  var q = argQuery(args);
  if (!q) return { items: [] };
  try {
    var r = await httpGet(BASE + "/wp-json/wp/v2/search?search=" + encodeURIComponent(q) + "&per_page=20", BASE + "/", { Accept: "application/json" });
    var arr = JSON.parse(r.text || "[]");
    if (Array.isArray(arr) && arr.length) {
      return { items: arr.map(function (it) {
        return { id: absUrl(it.url), name: stripTags(it.title), poster: null, type: /\/dizi\//.test(it.url || "") ? "tv" : "movie", description: "" };
      }).filter(function (x) { return x.id && x.name; }) };
    }
  } catch (e) {}
  var r2 = await httpGet(BASE + "/?s=" + encodeURIComponent(q), BASE + "/");
  return { items: genericCards(r2.text, "movie").slice(0, 40) };
}
async function getMeta(args) {
  var url = argId(args);
  if (!url || url.indexOf("/dizi/") === -1) return { meta: { id: url, type: "movie", name: NAME, videos: [] } };
  var r = await httpGet(url, BASE + "/");
  var tm = r.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return { meta: { id: url, type: "tv", name: tm ? stripTags(tm[1]) : NAME, videos: genericEpisodes(r.text, url) } };
}

// Pure-JS AES-256-CBC decrypt (PKCS7) + xorFile for HDFilmDiziIzle
var __SBOX = [
  99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,
  183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,
  9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,
  208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,
  205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,
  224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,
  186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,
  225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22
];
var __ISBOX = new Array(256); for (var __i = 0; __i < 256; __i++) __ISBOX[__SBOX[__i]] = __i;
function __gm(a, b) { var p = 0; for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return p; }
function __aes256CbcDecrypt(ctBytes, keyStr, ivStr) {
  var key = [], iv = [];
  for (var i = 0; i < keyStr.length; i++) key.push(keyStr.charCodeAt(i) & 0xff);
  for (var j = 0; j < ivStr.length; j++) iv.push(ivStr.charCodeAt(j) & 0xff);
  var w = key.slice(), rcon = 1;
  while (w.length < 240) {
    var t = w.slice(w.length - 4);
    if (w.length % 32 === 0) { t = [__SBOX[t[1]] ^ rcon, __SBOX[t[2]], __SBOX[t[3]], __SBOX[t[0]]]; rcon = __gm(rcon, 2); }
    else if (w.length % 32 === 16) { t = [__SBOX[t[0]], __SBOX[t[1]], __SBOX[t[2]], __SBOX[t[3]]]; }
    for (var k = 0; k < 4; k++) w.push(w[w.length - 32] ^ t[k]);
  }
  var out = [], prev = iv.slice();
  for (var off = 0; off < ctBytes.length; off += 16) {
    var s = ctBytes.slice(off, off + 16), orig = s.slice();
    for (var a = 0; a < 16; a++) s[a] ^= w[224 + a];
    for (var rd = 13; rd >= 0; rd--) {
      // InvShiftRows
      var n = s.slice();
      n[1]=s[13]; n[5]=s[1]; n[9]=s[5]; n[13]=s[9];
      n[2]=s[10]; n[6]=s[14]; n[10]=s[2]; n[14]=s[6];
      n[3]=s[7]; n[7]=s[11]; n[11]=s[15]; n[15]=s[3];
      for (var b = 0; b < 16; b++) s[b] = __ISBOX[n[b]] ^ w[rd * 16 + b];
      if (rd > 0) {
        for (var c = 0; c < 4; c++) {
          var i0=c*4, s0=s[i0], s1=s[i0+1], s2=s[i0+2], s3=s[i0+3];
          s[i0]   = __gm(s0,14)^__gm(s1,11)^__gm(s2,13)^__gm(s3,9);
          s[i0+1] = __gm(s0,9)^__gm(s1,14)^__gm(s2,11)^__gm(s3,13);
          s[i0+2] = __gm(s0,13)^__gm(s1,9)^__gm(s2,14)^__gm(s3,11);
          s[i0+3] = __gm(s0,11)^__gm(s1,13)^__gm(s2,9)^__gm(s3,14);
        }
      }
    }
    for (var x = 0; x < 16; x++) out.push(s[x] ^ prev[x]);
    prev = orig;
  }
  var pad = out[out.length - 1];
  if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad);
  var str = ""; for (var z = 0; z < out.length; z++) str += String.fromCharCode(out[z]);
  return str;
}
function __decryptSource(b64) {
  var bin = atob(String(b64 || "").trim()), bytes = [];
  for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i) & 0xff);
  return __aes256CbcDecrypt(bytes, "0123456789abcdef0123456789abcdef", "abcdef9876543210");
}
function __xorFile(html) {
  var re = /\(function\(d,\s*k\)[\s\S]{0,300}?\}\)\(\[([\d,\s]+)\],\s*"([^"]+)"\)/g, m;
  while ((m = re.exec(html)) !== null) {
    var nums = m[1].split(","), key = m[2], out = "";
    for (var i = 0; i < nums.length; i++) {
      var v = parseInt(nums[i].trim(), 10);
      if (isNaN(v)) continue;
      out += String.fromCharCode(v ^ key.charCodeAt(i % key.length) ^ ((i * 17 + 13) & 255));
    }
    if (out.indexOf("http://") === 0 || out.indexOf("https://") === 0) return out;
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var page = streamUrlArg(tmdbId, url);
  if (!page) return [];
  var out = [], seen = {};
  var r = await httpGet(page, BASE + "/");
  try {
    var postIdM = r.text.match(/postid-(\d+)/) || r.text.match(/data-id="(\d+)"/);
    if (postIdM) {
      var btnRe = /playhd-btn[^>]*data-source="([^"]+)"/gi, bm, srcs = [];
      while ((bm = btnRe.exec(r.text)) !== null) {
        if (bm[1] !== "fragman_url" && srcs.indexOf(bm[1]) < 0) srcs.push(bm[1]);
      }
      for (var si = 0; si < srcs.length && si < 4; si++) {
        try {
          var ar = await httpPost(BASE + "/wp-admin/admin-ajax.php", "action=get_source_url&post_id=" + postIdM[1] + "&source=" + encodeURIComponent(srcs[si]), page, { "X-Requested-With": "XMLHttpRequest" });
          var enc = (ar.text || "").trim();
          if (!enc || enc === "0" || enc === "error") continue;
          if (enc.charAt(0) === "{") {
            try { var ej = JSON.parse(enc); enc = ej.data || ej.url || ej.src || enc; } catch (e) {}
          }
          enc = String(enc).replace(/^["']|["']$/g, "").trim();
          var dec = enc.indexOf("http") === 0 ? enc : __decryptSource(enc);
          var um = String(dec || "").replace(/\\\//g, "/").match(/https?:\/\/[^"'\s<>\\]+/);
          if (!um) continue;
          var target = absUrl(um[0]);
          if (/\.m3u8|\.mp4/i.test(target)) { pushDirectMedia(target, page, NAME, out, seen); continue; }
          var ir = await httpGet(target, page);
          var master = __xorFile(ir.text);
          if (master) {
            var baseM = ir.text.match(/<base\s+href="([^"]+)"/i);
            var ref = baseM ? baseM[1] : target;
            if (!seen[master]) { seen[master] = 1; out.push({ name: NAME + " · HLS", url: master, type: "hls", headers: { "User-Agent": UA, "Referer": ref } }); }
          }
          pushDirectMedia(ir.text, target, NAME, out, seen);
        } catch (e) {}
      }
    }
  } catch (e) {}
  if (!out.length) await extractGenericStreams(page, r.text, out, seen, false);
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") {
  globalThis.getCatalog = getCatalog; globalThis.search = search;
  globalThis.getMeta = getMeta; globalThis.getStreams = getStreams;
}
