'use strict';
var AES = (function () {
  var S = [], SI = [], RCON = [];
  (function () {
    // Build S-box via the standard affine-transform algorithm.
    var p = 1, q = 1;
    do {
      p = p ^ (p << 1) ^ ((p & 0x80) ? 0x11B : 0); p &= 0xFF;
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xFF; if (q & 0x80) q ^= 0x09;
      var xformed = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      xformed &= 0xFF;
      S[p] = (xformed ^ 0x63) & 0xFF;
    } while (p !== 1);
    S[0] = 0x63;
    for (var i = 0; i < 256; i++) SI[S[i]] = i;
    RCON.length = 0;
    var r = 1;
    for (var j = 0; j < 20; j++) { RCON[j] = r; r = (r << 1) ^ ((r & 0x80) ? 0x11b : 0); r &= 0xff; }
  })();

  function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x11b : 0)) & 0xff; }
  function mul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return p & 0xff;
  }

  function expandKey(key) {
    var Nk = key.length / 4, Nr = Nk + 6;
    var w = new Array(4 * (Nr + 1));
    for (var i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
    for (i = Nk; i < 4 * (Nr + 1); i++) {
      var t = w[i - 1].slice();
      if (i % Nk === 0) {
        t = [t[1], t[2], t[3], t[0]];
        t = [S[t[0]], S[t[1]], S[t[2]], S[t[3]]];
        t[0] ^= RCON[i / Nk - 1];
      } else if (Nk > 6 && i % Nk === 4) {
        t = [S[t[0]], S[t[1]], S[t[2]], S[t[3]]];
      }
      w[i] = [w[i - Nk][0] ^ t[0], w[i - Nk][1] ^ t[1], w[i - Nk][2] ^ t[2], w[i - Nk][3] ^ t[3]];
    }
    return { w: w, Nr: Nr };
  }

  function decryptBlock(inp, ks) {
    var Nr = ks.Nr, w = ks.w;
    var s = [[], [], [], []];
    for (var i = 0; i < 16; i++) s[i % 4][(i / 4) | 0] = inp[i];
    addRoundKey(s, w, Nr);
    for (var round = Nr - 1; round >= 1; round--) {
      invShiftRows(s); invSubBytes(s); addRoundKey(s, w, round); invMixColumns(s);
    }
    invShiftRows(s); invSubBytes(s); addRoundKey(s, w, 0);
    var out = new Array(16);
    for (i = 0; i < 16; i++) out[i] = s[i % 4][(i / 4) | 0];
    return out;
  }
  function addRoundKey(s, w, round) {
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) s[r][c] ^= w[round * 4 + c][r];
  }
  function invSubBytes(s) { for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) s[r][c] = SI[s[r][c]]; }
  function invShiftRows(s) {
    for (var r = 1; r < 4; r++) {
      var row = [s[r][0], s[r][1], s[r][2], s[r][3]];
      for (var c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
    }
  }
  function invMixColumns(s) {
    for (var c = 0; c < 4; c++) {
      var a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
      s[0][c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[1][c] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[2][c] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
      s[3][c] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
  }

  function strToBytes(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 0xff); return b; }

  function decryptCBC(cipherBytes, keyBytes, ivBytes) {
    var ks = expandKey(keyBytes);
    var out = [];
    var prev = ivBytes.slice();
    for (var off = 0; off < cipherBytes.length; off += 16) {
      var block = cipherBytes.slice(off, off + 16);
      var dec = decryptBlock(block, ks);
      for (var i = 0; i < 16; i++) out.push(dec[i] ^ prev[i]);
      prev = block;
    }
    // PKCS7 unpad
    var pad = out[out.length - 1];
    if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad);
    return out;
  }

  function bytesToStr(b) { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
  function bytesToUtf8(b) {
    // decode UTF-8
    try { return decodeURIComponent(escape(bytesToStr(b))); } catch (e) { return bytesToStr(b); }
  }

  return {
    decryptCBC: decryptCBC,
    strToBytes: strToBytes,
    bytesToStr: bytesToStr,
    bytesToUtf8: bytesToUtf8,
  };
})();
function b64ToBytes(b64) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  b64 = String(b64).replace(/[^A-Za-z0-9+/=]/g, '');
  var bytes = [];
  for (var i = 0; i < b64.length; i += 4) {
    var e1 = chars.indexOf(b64[i]), e2 = chars.indexOf(b64[i + 1]);
    var e3 = chars.indexOf(b64[i + 2]), e4 = chars.indexOf(b64[i + 3]);
    var c1 = (e1 << 2) | (e2 >> 4);
    var c2 = ((e2 & 15) << 4) | (e3 >> 2);
    var c3 = ((e3 & 3) << 6) | e4;
    bytes.push(c1 & 0xff);
    if (b64[i + 2] !== '=') bytes.push(c2 & 0xff);
    if (b64[i + 3] !== '=') bytes.push(c3 & 0xff);
  }
  return bytes;
}
/* ---- MD5 (pure JS) ---- */
function __md5bytes(bytes) {
  function rl(x, c) { return (x << c) | (x >>> (32 - c)); }
  function add(a, b) { return (a + b) & 0xffffffff; }
  var s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  var K = []; for (var i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) & 0xffffffff;
  var msg = bytes.slice(); var ol = msg.length * 8;
  msg.push(0x80); while (msg.length % 64 !== 56) msg.push(0);
  for (var i = 0; i < 8; i++) msg.push(i < 4 ? ((ol >>> (8 * i)) & 0xff) : 0);
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (var off = 0; off < msg.length; off += 64) {
    var M = []; for (var j = 0; j < 16; j++) M[j] = msg[off + j * 4] | (msg[off + j * 4 + 1] << 8) | (msg[off + j * 4 + 2] << 16) | (msg[off + j * 4 + 3] << 24);
    var A = a0, B = b0, C = c0, D = d0;
    for (var i = 0; i < 64; i++) {
      var F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = add(add(add(F, A), K[i]), M[g]); A = D; D = C; C = B; B = add(B, rl(F, s[i]));
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  function w(x) { return [x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff]; }
  return w(a0).concat(w(b0), w(c0), w(d0));
}
function __strBytes(s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 0xff); return b; }
function __hexBytes(h) { var b = []; for (var i = 0; i < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16)); return b; }
function __evpKDF(passB, saltB, total) {
  var d = [], prev = [];
  while (d.length < total) { prev = __md5bytes(prev.concat(passB).concat(saltB)); d = d.concat(prev); }
  return d.slice(0, total);
}
/* CryptoJS.AES.decrypt(dataJson {ct,s}, passphrase) -> plaintext */
function cryptoJSDecrypt(dataJson, passStr) {
  var o = (typeof dataJson === "string") ? JSON.parse(dataJson) : dataJson;
  var salt = __hexBytes(o.s), pass = __strBytes(passStr);
  var ki = __evpKDF(pass, salt, 48);
  var key = ki.slice(0, 32), iv = ki.slice(32, 48);
  return AES.bytesToUtf8(AES.decryptCBC(b64ToBytes(o.ct), key, iv));
}

/* ---- common fetch ---- */
var TK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
function tkGet(url, referer) {
  var h = { "User-Agent": TK_UA };
  if (referer) h["Referer"] = referer;
  return fetch(url, { headers: h }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return r.text(); });
}
function tkStream(name, url, headers) {
  var isHls = /\.m3u8(\?|$)/i.test(url) || !/\.mp4(\?|$)/i.test(url);
  return { name: name, title: name, url: url, streamUrl: url, type: isHls ? "hls" : "mp4", headers: headers || { "User-Agent": TK_UA } };
}

/* ---- host extractors (return stream url or null) ---- */
// bePlayer (cizgiduo, hdmomplayer, cizgipass...): bePlayer('pass','{json}') -> AES -> video_location
async function extBePlayer(iframe, referer) {
  var src = await tkGet(iframe, referer);
  var m = /bePlayer\('([^']+)',\s*'(\{[^}]+\})'\)/.exec(src);
  if (m) {
    try {
      var dec = cryptoJSDecrypt(m[2], m[1]).replace(/\\/g, "");
      var vl = /video_location":"([^"]+)/.exec(dec);
      if (vl) return vl[1];
    } catch (e) {}
  }
  var f = /file:"([^"]+)/.exec(src);        // fallback plain
  if (f) return f[1];
  return null;
}
// sibnet
async function extSibnet(iframe, referer) {
  var src = await tkGet(iframe, referer);
  var m = /player\.src\(\[\{src:\s*"([^"]+)/.exec(src);
  if (!m) return null;
  var u = m[1];
  return /^https?:/i.test(u) ? u : ("https://video.sibnet.ru" + u);
}
// google drive
async function extDrive(iframe) {
  var id = /file\/d\/([^/]+)\/preview/.exec(iframe);
  if (!id) return null;
  var info = await tkGet("https://drive.google.com/get_video_info?docid=" + id[1] + "&drive_originator_app=303");
  var sm = /fmt_stream_map=([^&]+)/.exec(info);
  if (!sm) return null;
  var decoded = decodeURIComponent(sm[1]);
  var last = decoded.split(",").pop();
  return last ? last.split("|").pop() : null;
}
/* route an iframe URL to the right extractor by host */
async function resolveHost(iframe, referer) {
  try {
    if (/sibnet\.ru/.test(iframe)) return await extSibnet(iframe, referer);
    if (/drive\.google\.com/.test(iframe)) return await extDrive(iframe);
    // default: bePlayer-style (cizgiduo, cizgipass, hdmomplayer, hdplayersystem...)
    return await extBePlayer(iframe, referer);
  } catch (e) { return null; }
}

/* ===================== CizgiMax (Kekik portu) ===================== */
var CM_BASE = "https://cizgimax.online";
function cmFix(u) { if (!u) return null; if (/^https?:/i.test(u)) return u; if (u.charAt(0) === "/") return CM_BASE + u; return CM_BASE + "/" + u; }
function cmDec(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); }).replace(/\s+/g, " ").trim();
}

async function getCatalog(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (q) return search({ query: q });
  var html = await tkGet(CM_BASE + "/diziler/page/1?orderby=date&order=DESC", CM_BASE + "/");
  var items = [], seen = {};
  var liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi, m;
  while ((m = liRe.exec(html)) !== null) {
    var b = m[0];
    var t = (/<h2[^>]*truncate[^>]*>([\s\S]*?)<\/h2>/i.exec(b) || [])[1];
    var href = (/poster-subject[\s\S]*?<a[^>]+href="([^"]+)"/i.exec(b) || /<a[^>]+href="([^"]+)"/i.exec(b) || [])[1];
    var poster = (/poster-media[\s\S]*?<img[^>]+data-src="([^"]+)"/i.exec(b) || /<img[^>]+data-src="([^"]+)"/i.exec(b) || [])[1];
    if (!t || !href) continue;
    t = cmDec(t); href = cmFix(href);
    if (seen[href]) continue; seen[href] = 1;
    items.push({ id: href, name: t, poster: poster ? cmFix(poster) : null, type: "tv", description: null });
    if (items.length >= 60) break;
  }
  if (!items.length) throw new Error("CizgiMax katalog boş (" + CM_BASE + ")");
  return { items: items };
}

async function search(args) {
  var q = args && args.query ? String(args.query).trim() : "";
  if (!q) return { items: [] };
  var txt = await tkGet(CM_BASE + "/ajaxservice/index.php?qr=" + encodeURIComponent(q), CM_BASE + "/");
  var data; try { data = JSON.parse(txt); } catch (e) { return { items: [] }; }
  var arr = (data && data.data && data.data.result) || [];
  var items = [];
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    var n = r.sName || "";
    if (/\.Bölüm|\.Sezon|-Sezon|-izle/i.test(n)) continue;
    items.push({ id: cmFix(r.sLink), name: cmDec(n), poster: r.sImage ? cmFix(r.sImage) : null, type: "tv", description: null });
  }
  return { items: items };
}

async function getMeta(args) {
  var url = String((args && args.id) || "");
  if (!url) return { meta: null };
  var html = await tkGet(url, CM_BASE + "/");
  var name = cmDec((/<h1[^>]*page-title[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || "");
  var videos = [];
  var postRe = /<div[^>]*ajax_post[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi, m;
  // tolerant: iterate anchor blocks containing episode-names
  var blkRe = /ajax_post[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?episode-names[^>]*>([^<]+)[\s\S]*?(?:season-name[^>]*>([^<]+))?/gi;
  while ((m = blkRe.exec(html)) !== null) {
    var href = cmFix(m[1]);
    var epName = cmDec(m[2]);
    var eNum = parseInt((/(\d+)\.Bölüm/i.exec(epName) || [])[1], 10) || (videos.length + 1);
    var sNum = parseInt((/(\d+)\.Sezon/i.exec(m[3] || "") || [])[1], 10) || 1;
    videos.push({ id: href, title: epName, season: sNum, episode: eNum });
  }
  return { meta: { id: url, type: "series", name: name || "CizgiMax", videos: videos } };
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  var pageUrl = String(url || tmdbId || "");
  if (!pageUrl) return [];
  var html = await tkGet(pageUrl, CM_BASE + "/");
  var iframes = [], ire = /<li[^>]*>[\s\S]*?<a[^>]+data-frame="([^"]+)"/gi, m;
  while ((m = ire.exec(html)) !== null) iframes.push(cmFix(m[1]));
  var streams = [];
  for (var i = 0; i < iframes.length && i < 6; i++) {
    var s = await resolveHost(iframes[i], CM_BASE + "/");
    if (s) streams.push(tkStream("CizgiMax", s, { "User-Agent": TK_UA, "Referer": CM_BASE + "/" }));
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
