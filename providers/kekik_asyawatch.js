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
  var ld = firstLd(html, "") || {};
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
  if (!videos.length) videos.push({ id: url, title: title || "Film", season: 1, episode: 1 });
  return { meta: { id: id, name: title, poster: poster, type: videos.length > 1 ? "tv" : "movie", videos: videos } };
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
      // pichive/hotlinger embed: fetch and pull inner m3u8/mp4
      try { var inner = (await get(u, BASE + "/")).text.replace(/\\\//g, "/"); var im; var ir = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>\\]*)?/gi; while ((im = ir.exec(inner)) !== null) { if (seen[im[0]]) continue; seen[im[0]] = 1; out.push({ name: NAME, url: im[0], type: /\.m3u8/.test(im[0]) ? "hls" : "mp4", headers: { "User-Agent": UA, "Referer": u } }); } } catch (e) {}
    }
  }
  return out;
}

var __api = { getCatalog: getCatalog, search: search, getMeta: getMeta, getStreams: getStreams };
if (typeof module !== "undefined" && module.exports) module.exports = __api;
if (typeof globalThis !== "undefined") { globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getMeta = getMeta; globalThis.getStreams = getStreams; }
