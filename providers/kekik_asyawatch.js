'use strict';
// AsyaWatch — asyawatch.com (ported from bigbullapp-cs AsyaWatchProvider.kt, current domain)
// SSR HTML: cards a.pcard -> /dizi//film/; episodes from JSON-LD containsSeason.episode;
// streams from "src"/"master" JSON fields (pichive/hotlinger/playru/.m3u8/.mp4).

var BASE = "https://asyawatch.com";
var NAME = "AsyaWatch";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
function H(ref) { var h = { "User-Agent": UA }; if (ref) h["Referer"] = ref; return h; }
function get(url, ref) { return fetch(url, { method: "GET", headers: H(ref) }).then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); }); }
function fixUrl(u) { if (!u) return u; if (u.indexOf("//") === 0) return "https:" + u; if (u.charAt(0) === "/") return BASE + u; return u; }
function attr(tag, name) { var m = tag.match(new RegExp(name + '="([^"]*)"', "i")); return m ? m[1] : ""; }

function cards(html) {
  var out = [], seen = {};
  var re = /<a\b([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var open = m[1] + " " + m[3], href = m[2], inner = m[4];
    if (href.indexOf("/dizi/") < 0 && href.indexOf("/film/") < 0) continue;
    if (/\/sezon-|\/bolum-/.test(href)) continue;
    if (!/<img/i.test(inner)) continue;
    var full = fixUrl(href);
    if (seen[full]) continue;
    var imgTag = (inner.match(/<img[^>]*>/i) || [""])[0];
    var tm = inner.match(/<(?:b|h2|h3)[^>]*>([\s\S]*?)<\/(?:b|h2|h3)>/i);
    var title = (tm ? tm[1].replace(/<[^>]+>/g, "") : "");
    if (!title) { var al = attr(open, "aria-label"); title = al.replace(/^\d+\.\s*sıra(?:da)?\s*,?\s*/i, "").split(",")[0]; }
    if (!title) title = attr(imgTag, "alt");
    title = title.replace(/\s+/g, " ").trim();
    if (!title || title.length < 2) continue;
    seen[full] = 1;
    var poster = fixUrl(attr(imgTag, "data-src") || attr(imgTag, "src"));
    out.push({ id: full, name: title, poster: poster, type: href.indexOf("/dizi/") >= 0 ? "tv" : "movie", description: "" });
  }
  return out;
}

async function getCatalog(args) {
  var q = args && (args.query || args.search) ? String(args.query || args.search).trim() : "";
  if (q) return search(q);
  var items = [];
  var urls = [BASE + "/dizi-izle", BASE + "/", BASE + "/film-izle"];
  for (var i = 0; i < urls.length && items.length < 40; i++) {
    try { var r = await get(urls[i], BASE + "/"); items = items.concat(cards(r.text)); } catch (e) {}
  }
  var seen = {}, uniq = [];
  for (var j = 0; j < items.length; j++) { if (!seen[items[j].id]) { seen[items[j].id] = 1; uniq.push(items[j]); } }
  return { items: uniq.slice(0, 60) };
}
async function search(args) {
  var query = (typeof args === "object" && args) ? String(args.query || args.search || "") : String(args || "");
  var r = await get(BASE + "/ara?q=" + encodeURIComponent(query), BASE + "/");
  return { items: cards(r.text).slice(0, 40) };
}

function firstLd(html, typ) {
  var re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi, m;
  while ((m = re.exec(html)) !== null) {
    try { var j = JSON.parse(m[1].trim()); var t = j["@type"] || ""; if (!typ || (t.indexOf && t.indexOf(typ) >= 0)) return j; } catch (e) {}
  }
  return null;
}

async function getMeta(args) {
  var id = (typeof args === "object" && args) ? String(args.id || "") : String(args || "");
  var url = id;
  var r = await get(url, BASE + "/");
  var html = r.text;
  var ld = firstLd(html, "TVSeries") || firstLd(html, "Movie") || firstLd(html, "") || {};
  var title = ld.name || "";
  if (!title) { var tm = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); title = tm ? tm[1].replace(/<[^>]+>/g, "").trim() : ""; }
  var poster = ""; var pm = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i); if (pm) poster = pm[1];
  var videos = [], seen = {};
  if (url.indexOf("/dizi/") >= 0) {
    var cs = ld.containsSeason || {};
    var eps = cs.episode || (cs[0] && cs[0].episode) || [];
    if (!Array.isArray(eps)) eps = [];
    for (var i = 0; i < eps.length; i++) {
      var e = eps[i] || {}; var href = e.url;
      if (!href || href.indexOf("http") !== 0 || seen[href]) continue; seen[href] = 1;
      var nm = e.name || "Bölüm";
      var num = (nm.match(/(\d+)/) || [])[1];
      videos.push({ id: href, title: nm, season: 1, episode: num ? parseInt(num, 10) : (videos.length + 1) });
    }
  }
  if (!videos.length) {
    var bre = /<a[^>]+href=["']([^"']*\/(?:bolum-|sezon-)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, bm;
    while ((bm = bre.exec(html)) !== null) {
      var bh = fixUrl(bm[1]);
      if (seen[bh]) continue; seen[bh] = 1;
      var bn = (bh.match(/bolum-(\d+)/i) || [])[1];
      videos.push({ id: bh, title: bm[2].replace(/<[^>]+>/g, "").trim() || ("Bölüm " + (bn || (videos.length + 1))), season: 1, episode: bn ? parseInt(bn, 10) : (videos.length + 1) });
    }
  }
  if (!videos.length) videos.push({ id: url, title: title || "Film", season: 1, episode: 1 });
  return { meta: { id: id, name: title, poster: poster, type: videos.length > 1 ? "tv" : "movie", videos: videos } };
}


// Pure-JS SHA-256 for four.pichive.online NP_CONFIG proof-of-work gate
function __sha256Words(str) {
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var bytes = [];
  for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff);
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (var j = 7; j >= 0; j--) bytes.push((j < 4 ? (bitLen >>> (j * 8)) : 0) & 0xff);
  var W = new Array(64);
  for (var off = 0; off < bytes.length; off += 64) {
    for (var t = 0; t < 16; t++) {
      W[t] = ((bytes[off+t*4]<<24)|(bytes[off+t*4+1]<<16)|(bytes[off+t*4+2]<<8)|bytes[off+t*4+3]) >>> 0;
    }
    for (var t2 = 16; t2 < 64; t2++) {
      var s0 = ((W[t2-15]>>>7)|(W[t2-15]<<25)) ^ ((W[t2-15]>>>18)|(W[t2-15]<<14)) ^ (W[t2-15]>>>3);
      var s1 = ((W[t2-2]>>>17)|(W[t2-2]<<15)) ^ ((W[t2-2]>>>19)|(W[t2-2]<<13)) ^ (W[t2-2]>>>10);
      W[t2] = (W[t2-16] + s0 + W[t2-7] + s1) >>> 0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (var r = 0; r < 64; r++) {
      var S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
      var ch = (e & f) ^ ((~e) & g);
      var t1 = (h + S1 + ch + K[r] + W[r]) >>> 0;
      var S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2v = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2v)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  return H;
}
function __solvePichiveGate(n) {
  var SALT = "oDesGxmweI";
  for (var i = 0; i < 120000; i++) {
    var nonce = i.toString(36);
    var H = __sha256Words(n + SALT + nonce + SALT);
    if ((H[6] >>> 20) === 0) return nonce;
  }
  return "0";
}
async function __resolvePichive(iframeUrl, out, seen) {
  try {
    var om = iframeUrl.match(/^(https?:\/\/[^/]+)/);
    var orig = om ? om[1] : "https://four.pichive.online";
    var r = await get(iframeUrl, BASE + "/");
    var html = r.text || "";
    var s = html.indexOf("window.NP_CONFIG");
    if (s >= 0) {
      var b0 = html.indexOf("{", s);
      var e0 = html.indexOf("window.localStorage2", b0);
      if (e0 < 0) e0 = html.indexOf("</script>", b0);
      if (b0 >= 0 && e0 > b0) {
        var raw = html.slice(b0, e0).trim().replace(/;$/, "").trim();
        var lb = raw.lastIndexOf("}");
        if (lb >= 0) raw = raw.slice(0, lb + 1);
        var cfg = JSON.parse(raw);
        var gateN = cfg && cfg.gate && cfg.gate.n ? String(cfg.gate.n) : "";
        var suffix = gateN ? ("&p=" + __solvePichiveGate(gateN)) : "";
        var srcs = (cfg && cfg.sources) || [];
        for (var i = 0; i < srcs.length; i++) {
          var su = srcs[i] && (srcs[i].file || srcs[i].src || srcs[i].url);
          if (!su) continue;
          if (su.indexOf("http") !== 0) su = orig + (su.charAt(0) === "/" ? su : "/" + su);
          if (suffix && su.indexOf("&p=") === -1 && su.indexOf("?p=") === -1) {
            su += (su.indexOf("?") >= 0 ? suffix : ("?" + suffix.slice(1)));
          }
          if (seen[su]) continue; seen[su] = 1;
          out.push({ name: NAME + " · Pichive", url: su, type: /\.mp4(\?|$)/i.test(su) ? "mp4" : "hls", headers: { "User-Agent": UA, "Referer": orig + "/" } });
        }
      }
    }
  } catch (e) {}
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var data = (typeof url === "string" && url.indexOf("http") === 0) ? url : (typeof tmdbId === "string" ? tmdbId : (tmdbId && tmdbId.id ? String(tmdbId.id) : ""));
  if (!data || data.indexOf("http") !== 0) return [];
  var out = [], seen = {};
  var r = await get(data, BASE + "/");
  var text = r.text.replace(/\\"/g, '"').replace(/\\\//g, "/");
  var re = /"(?:src|master|file)"\s*:\s*"(https?:\/\/[^"]+)"/gi, m;
  var cands = [];
  while ((m = re.exec(text)) !== null) cands.push(m[1]);
  // also bare media urls
  var mr = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi, mm;
  while ((mm = mr.exec(text)) !== null) cands.push(mm[0]);
  for (var i = 0; i < cands.length; i++) {
    var u = cands[i];
    var keep = /pichive|hotlinger|playru/.test(u) || /\.m3u8/.test(u) || /\.mp4/.test(u);
    if (!keep || seen[u]) continue; seen[u] = 1;
    if (/\.m3u8/.test(u)) out.push({ name: NAME, url: u, type: "hls", headers: { "User-Agent": UA, "Referer": BASE + "/" } });
    else if (/\.mp4/.test(u)) out.push({ name: NAME, url: u, type: "mp4", headers: { "User-Agent": UA, "Referer": BASE + "/" } });
    else {
      if (/pichive|iframe\.php\?v=/i.test(u)) { await __resolvePichive(u, out, seen); continue; }
      // pichive/hotlinger embed: fetch and pull inner m3u8/mp4
      try { var inner = (await get(u, BASE + "/")).text.replace(/\\\//g, "/"); var im; var ir = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi; while ((im = ir.exec(inner)) !== null) { if (seen[im[0]]) continue; seen[im[0]] = 1; out.push({ name: NAME, url: im[0], type: /\.m3u8/.test(im[0]) ? "hls" : "mp4", headers: { "User-Agent": UA, "Referer": u } }); } } catch (e) {}
    }
  }
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") { globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; }
