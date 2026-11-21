'use strict';
var CFG = {
  id: "rectv",
  name: "RecTV",
  base: "https://a.psrectv80.xyz",
  altBase: "https://m.prectv72.lol",
  ua: "app okhttp/4.12.0",
  clientId: "rectv-android",
  appVersion: "22.0.6",
  hmacKey: "3508611138826751fdf77beaa6f93eb93fd27e6a5acb910e7aad22665513dd6e",
  k1: "4F5A9C3D9A86FA54EACEDDD635185",
  k2: "c3c5bd17-e37b-4b94-a944-8a3688a30452",
  f5: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  maxScanPages: 4
};

function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}
function b2hex(b) {
  var h = "", t, i;
  for (i = 0; i < b.length; i++) {
    t = b[i].toString(16);
    h += (t.length < 2 ? "0" : "") + t;
  }
  return h;
}
var K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
function sha256b(bytes) {
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var m = bytes.slice(), i, off, t1, t2, s0, s1;
  var ml = m.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  for (i = 0; i < 8; i++) m.push(0);
  m[m.length - 1] = ml & 0xff;
  m[m.length - 2] = (ml >>> 8) & 0xff;
  m[m.length - 3] = (ml >>> 16) & 0xff;
  m[m.length - 4] = (ml >>> 24) & 0xff;
  var w = new Array(64);
  for (off = 0; off < m.length; off += 64) {
    for (i = 0; i < 16; i++) {
      w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
    }
    for (i = 16; i < 64; i++) {
      s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      t1 = (hh + s1 + ch + K256[i] + w[i]) | 0;
      s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & bb) ^ (a & c) ^ (bb & c);
      t2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  var out = [];
  for (i = 0; i < 8; i++) {
    out.push((h[i] >>> 24) & 0xff, (h[i] >>> 16) & 0xff, (h[i] >>> 8) & 0xff, h[i] & 0xff);
  }
  return out;
}
function hmacSha256Hex(keyStr, msg) {
  var k = utf8Bytes(keyStr), ip = [], op = [], i;
  if (k.length > 64) k = sha256b(k);
  while (k.length < 64) k.push(0);
  for (i = 0; i < 64; i++) {
    ip.push(k[i] ^ 0x36);
    op.push(k[i] ^ 0x5c);
  }
  var inner = sha256b(ip.concat(utf8Bytes(msg)));
  return b2hex(sha256b(op.concat(inner)));
}

function httpJson(url, headers) {
  var req = { method: "GET", headers: headers || { "user-agent": CFG.ua } };
  return fetch(url, req).then(function (r) {
    return r.text().then(function (t) { return { status: r.status, text: t }; });
  });
}

function nonceGet(base) {
  return httpJson(base + "/api/attest/nonce").then(function (r) {
    try {
      return JSON.parse(r.text).nonce || null;
    } catch (e) {
      return null;
    }
  });
}

function signedGet(base, path) {
  var attempt = function (nonce) {
    var ts = String(Math.floor(new Date().getTime() / 1000));
    var msg = "GET\n" + path + "\n" + ts + "\n" + nonce + "\n" + CFG.f5;
    var sig = hmacSha256Hex(CFG.hmacKey, msg);
    var h = {
      "user-agent": CFG.ua,
      "X-Signature": sig,
      "X-Timestamp": ts,
      "X-Nonce": nonce,
      "X-Client-Id": CFG.clientId,
      "X-App-Version": CFG.appVersion
    };
    return httpJson(base + path, h);
  };
  return nonceGet(base).then(function (n) {
    if (!n) return { status: 0, text: "[]", nonce: null };
    return attempt(n).then(function (r) {
      if (r.text.indexOf("nonce_replay") === -1) return r;
      return nonceGet(base).then(function (n2) {
        return n2 ? attempt(n2) : r;
      });
    });
  });
}

function signedJson(path) {
  var tryBase = function (base) {
    return signedGet(base, path).then(function (r) {
      if (r.status === 200) {
        try { return JSON.parse(r.text); } catch (e) { return null; }
      }
      return null;
    }).catch(function () { return null; });
  };
  return tryBase(CFG.base).then(function (res) {
    return res !== null ? res : tryBase(CFG.altBase);
  });
}


/* ===== RecTV (bb-nuvio güncel config + imza) ===== */
function recMapItem(item) {
  var isSerie = (item.type === "serie");
  if (isSerie) return { id: JSON.stringify({ k: "serie", i: item.id, n: item.title }), name: item.title || "", poster: item.image || null, type: "tv", description: item.description || null };
  var srcs = []; (item.sources || []).forEach(function (s) { if (s && s.url) srcs.push({ u: s.url, t: s.type || "", q: s.quality || "" }); });
  return { id: JSON.stringify({ k: "play", s: srcs, n: item.title }), name: item.title || "", poster: item.image || null, type: "movie", description: item.description || null };
}
async function getCatalog(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (q) return search({ query: q });
  var paths = [
    "/api/channel/by/filtres/0/0/0/" + CFG.k1 + "/" + CFG.k2 + "/",
    "/api/movie/by/filtres/0/created/0/" + CFG.k1 + "/" + CFG.k2 + "/",
    "/api/serie/by/filtres/0/created/0/" + CFG.k1 + "/" + CFG.k2 + "/"
  ];
  var items = [];
  for (var i = 0; i < paths.length; i++) {
    var rows = await signedJson(paths[i]);
    if (Array.isArray(rows)) rows.forEach(function (it) { if (it && it.title) items.push(recMapItem(it)); });
  }
  if (!items.length) throw new Error("RecTV API boş/erişilemez (" + CFG.base + ")");
  return { items: items };
}
async function search(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (!q) return { items: [] };
  var rows = await signedJson("/api/search/" + encodeURIComponent(q) + "/" + CFG.k1 + "/" + CFG.k2 + "/");
  var items = [];
  var push = function (a) { (a || []).forEach(function (it) { if (it && it.title) items.push(recMapItem(it)); }); };
  if (rows && (rows.channels || rows.posters)) { push(rows.channels); push(rows.posters); }
  else if (Array.isArray(rows)) push(rows);
  return { items: items };
}
function recNum(s) { var m = /\d+/.exec(String(s || "")); return m ? parseInt(m[0], 10) : null; }
async function getMeta(args) {
  var raw = String((args && args.id) || "");
  var node; try { node = JSON.parse(raw); } catch (e) { node = null; }
  if (!node || node.k !== "serie") return { meta: null };
  var seasons = await signedJson("/api/season/by/serie/" + node.i + "/" + CFG.k1 + "/" + CFG.k2 + "/");
  var videos = [];
  if (Array.isArray(seasons)) for (var s = 0; s < seasons.length; s++) {
    var sNum = recNum(seasons[s].title) || (s + 1), eps = seasons[s].episodes || [];
    for (var e = 0; e < eps.length; e++) {
      var ep = eps[e], srcs = [];
      (ep.sources || []).forEach(function (x) { if (x && x.url) srcs.push({ u: x.url, t: x.type || "" }); });
      videos.push({ id: JSON.stringify({ k: "play", s: srcs }), title: ep.title || (sNum + ". Sezon " + (e + 1) + ". Bölüm"), season: sNum, episode: recNum(ep.title) || (e + 1) });
    }
  }
  return { meta: { id: raw, type: "series", name: node.n || "RecTV", videos: videos } };
}
function recStream(src) {
  var isHls = src.t !== "mp4" && !/\.mp4(\?|$)/i.test(src.u) || /\.m3u8(\?|$)/i.test(src.u);
  return { name: "RecTV", title: "RecTV" + (src.t ? " - " + src.t : ""), url: src.u, streamUrl: src.u, type: isHls ? "hls" : "mp4", headers: { "User-Agent": CFG.ua, "Referer": CFG.base + "/" } };
}
async function getStreams(tmdbId, mediaType, season, episode, url) {
  var raw = String(url || tmdbId || "");
  var node; try { node = JSON.parse(raw); } catch (e) { node = null; }
  if (!node) return [];
  if (node.k === "play") return (node.s || []).map(recStream);
  if (node.k === "serie") { var m = await getMeta({ id: raw }); var v = m.meta && m.meta.videos && m.meta.videos[0]; if (v) return getStreams(v.id, mediaType, season, episode, v.id); }
  return [];
}
if (typeof module !== 'undefined' && module.exports) module.exports = { getCatalog: getCatalog, getMeta: getMeta, getStreams: getStreams, search: search };
if (typeof globalThis !== 'undefined') { globalThis.getCatalog = getCatalog; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; globalThis.search = search; }
