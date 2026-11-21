// @provider {"id": "filmmodu", "name": "FilmModu", "types": ["movie"], "domain": "filmmodu.icu", "formats": ["m3u8"], "sample": "tt0133093:movie:1:1", "description": "FilmModu Türkçe dublaj/altyazılı film arşivi (pilavyerplay HLS + altyazı).", "version": "1.1.5", "verified": true}
/**
 * filmmodu — Nuvio provider (bb-nuvio).
 * Flow: Cinemeta title -> /ara?q= -> strict card match -> film page -> data-pv slug ->
 *       pilavyerplay s.php -> window.__PLAYER__ {stream, audios, subs} -> HLS master + VTT.
 */

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
var BASE = "https://filmmodu.icu";
var PLAYER_FALLBACK = "https://play2.pilavyerplay.top";

function text(url, opts) {
  var o = opts || {};
  var headers = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9" };
  if (o.referer) headers.Referer = o.referer;
  if (o.headers) for (var k in o.headers) headers[k] = o.headers[k];
  return fetch(url, { method: o.method || "GET", headers: headers, body: o.body })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
      return r.text();
    });
}

function first(pattern, body) {
  var m = pattern.exec(String(body || ""));
  return m ? m[1] : null;
}

function abs(base, href) {
  if (!href) return null;
  if (/^https?:/i.test(href)) return href;
  var origin = /^(https?:\/\/[^/]+)/.exec(base);
  if (String(href).charAt(0) === "/") return origin ? origin[1] + href : href;
  return base.replace(/[^/]*$/, "") + href;
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u0131]/g, "i")
    .replace(/[\u015f]/g, "s")
    .replace(/[\u011f]/g, "g")
    .replace(/[\u00fc]/g, "u")
    .replace(/[\u00f6]/g, "o")
    .replace(/[\u00e7]/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

function spaced(value) {
  return String(value || "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\b(?:izle|film|full|hd|turkce|türkçe|dublaj|altyazili|altyazılı)\b/gi, " ")
    .split(/[\s:\-]+/)
    .map(norm)
    .filter(Boolean)
    .join(" ")
    .replace(/^(?:the|an|a) /, "");
}

function pick(cards, wanted, year) {
  var w = spaced(wanted);
  if (!w) return null;
  var exact = null;
  var prefix = null;
  for (var i = 0; i < cards.length; i++) {
    var n = spaced(cards[i].title);
    if (!n) continue;
    if (n === w) {
      if (year && cards[i].year === year) return cards[i];
      if (!exact) exact = cards[i];
    } else if (n.indexOf(w + " ") === 0) {
      if (year && cards[i].year === year && !prefix) prefix = cards[i];
      else if (!prefix) prefix = cards[i];
    }
  }
  return exact || prefix;
}

function metaOf(id, mediaType) {
  if (/^__alt__:/.test(String(id))) return Promise.resolve({ name: decodeURIComponent(String(id).slice(8)), year: "" });
  var kind = mediaType === "tv" ? "series" : "movie";
  return text("https://v3-cinemeta.strem.io/meta/" + kind + "/" + id + ".json")
    .then(function (body) {
      var meta = JSON.parse(body).meta || {};
      return { name: String(meta.name || "").trim(), year: String(meta.year || "").slice(0, 4) };
    })
    .catch(function () {
      return { name: "", year: "" };
    });
}

function qualityOf(masterUrl, referer) {
  return text(masterUrl, { referer: referer })
    .then(function (playlist) {
      var re = /RESOLUTION=\d+x(\d+)/g;
      var m;
      var best = 0;
      while ((m = re.exec(playlist)) !== null) best = Math.max(best, parseInt(m[1], 10) || 0);
      return best > 0 ? best + "p" : "auto";
    })
    .catch(function () {
      return "auto";
    });
}

function findFilm(title, year) {
  return text(BASE + "/ara?q=" + encodeURIComponent(title))
    .then(function (page) {
      var cards = [];
      var re = /<a\b[^>]*href="([^"]*\/film\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      var m;
      while ((m = re.exec(page)) !== null) {
        var h3 = first(/<h3[^>]*>([\s\S]*?)<\/h3>/, m[2]);
        if (!h3) continue;
        var cardYear = first(/<p[^>]*>\s*(\d{4})\s*<\/p>/, m[2]) || "";
        cards.push({ url: abs(BASE, m[1]), title: h3.replace(/<[^>]+>/g, "").trim(), year: cardYear });
      }
      var hit = pick(cards, title, year);
      return hit ? hit.url : null;
    })
    .catch(function () {
      return null;
    });
}

/** Nuvio yalnız progressive indirir; HLS'yi işaretle ki sahte dosya inmesin (fragment HTTP'de gönderilmez). */
function hlsNoDownload(url) {
  var u = String(url || "");
  if (/\.m3u8(\?|$)/i.test(u) || u.indexOf("#") !== -1) return u;
  return u + "#.m3u8";
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === "tv") return Promise.resolve([]);
  var pageUrl = null;

  return metaOf(tmdbId, mediaType)
    .then(function (meta) {
      if (!meta.name) return null;
      return findFilm(meta.name, meta.year);
    })
    .then(function (url) {
      if (!url) return [];
      pageUrl = url;
      return text(url);
    })
    .then(function (page) {
      if (!page) return [];
      var core = first(/<script[^>]+src="([^"]*\/assets\/js\/core\.js[^"]*)"/, page);
      var playerBase = core && /^https?:/i.test(core) ? core.replace(/\/assets\/js\/core\.js.*$/, "") : PLAYER_FALLBACK;

      var slugs = [];
      var re = /data-pv="([^"]+)"/g;
      var m;
      while ((m = re.exec(page)) !== null) {
        if (m[1] && slugs.indexOf(m[1]) < 0) slugs.push(m[1].trim());
      }
      if (!slugs.length) return [];

      return Promise.all(slugs.map(function (slug) {
        var shell = playerBase + "/assets/js/s.php?s=" + encodeURIComponent(slug);
        return text(shell, { referer: pageUrl })
          .then(function (html) {
            var json = first(/window\.__PLAYER__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/, html);
            if (!json) return [];
            var player = JSON.parse(json);
            var stream = String(player.stream || "").trim();
            if (!/^https?:/i.test(stream)) return [];
            var audios = [];
            (player.audios || []).forEach(function (a) {
              var lbl = String((a && a.label) || "").trim();
              if (lbl) audios.push(lbl);
            });
            var subs = [];
            (player.subs || []).forEach(function (sub) {
              if (!sub || !/^https?:/i.test(String(sub.src || ""))) return;
              var lang = String(sub.lang || "tr").toLowerCase();
              subs.push({ url: sub.src, language: lang, name: String(sub.label || lang).trim() + " [FilmModu]" });
            });
            return qualityOf(stream, shell).then(function (q) {
              return [{
                name: "FilmModu",
                title: "FilmModu - " + (audios.length ? audios.join(" / ") : "HLS"),
                url: hlsNoDownload(stream),
                quality: q,
                headers: { Referer: shell, "User-Agent": UA },
                subtitles: subs.slice(0, 6)
              }];
            });
          })
          .catch(function () {
            return [];
          });
      }));
    })
    .then(function (lists) {
      var out = [];
      var seen = {};
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (item) {
          if (!item || !item.url || seen[item.url]) return;
          seen[item.url] = 1;
          out.push(item);
        });
      });
      return out;
    })
    .catch(function (e) {
      console.log("[bb-nuvio][filmmodu] " + (e && e.message));
      return [];
    });
}

module.exports = { getStreams };

/* NuvioMobile always calls getStreams with args.tmdbId (JsBindings.kt); the
   value is a numeric TMDB id after TmdbService.ensureTmdbId. Resolve it to
   IMDb so the existing Cinemeta/title flow keeps working. */
var __origGetStreams = module.exports.getStreams;
module.exports.getStreams = function (id, mediaType, season, episode) {
  var raw = String(id || "");
  if (!/^\d+$/.test(raw)) return __origGetStreams(raw, mediaType, season, episode);
  var tv = mediaType !== "movie";
  var headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Accept": "application/json" };
  var key = typeof TMDB_API_KEY !== "undefined" ? TMDB_API_KEY : "";
  var api = "https://www.wikidata.org/w/api.php?format=json";
  var prop = tv ? "P4983" : "P4947";
  function fromTmdb() {
    if (!key) return Promise.resolve("");
    return fetch("https://api.themoviedb.org/3/" + (tv ? "tv" : "movie") + "/" + raw + "/external_ids?api_key=" + encodeURIComponent(key), { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) { return String((json && json.imdb_id) || ""); })
      .catch(function () { return ""; });
  }
  function fromWikidata() {
    return fetch(api + "&action=query&list=search&srlimit=1&srsearch=" + encodeURIComponent("haswbstatement:" + prop + "=" + raw), { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        var hits = (json && json.query && json.query.search) || [];
        if (!hits.length) return "";
        return fetch(api + "&action=wbgetentities&props=claims&ids=" + hits[0].title, { headers: headers });
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (json) {
        var entities = (json && json.entities) || {};
        for (var entity in entities) {
          var rows = ((entities[entity] || {}).claims || {}).P345 || [];
          for (var i = 0; i < rows.length; i++) {
            var value = rows[i] && rows[i].mainsnak && rows[i].mainsnak.datavalue && rows[i].mainsnak.datavalue.value;
            if (/^tt\d+$/.test(String(value || ""))) return value;
          }
        }
        return "";
      })
      .catch(function () { return ""; });
  }
  return fromTmdb().then(function (imdb) { return imdb || fromWikidata(); }).then(function (imdb) {
    return __origGetStreams(imdb || raw, mediaType, season, episode);
  }).catch(function () { return []; });
};

/* Cinemeta basligi yerellestirir ("Gibi" -> "As If"); sonuc bossa Wikidata TR/EN basliklariyla yeniden dene. */
function __altTitles(raw, mediaType) {
  var h = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Accept": "application/json" };
  var api = "https://www.wikidata.org/w/api.php?format=json";
  var stmt = /^tt\d+$/.test(raw) ? "P345=" + raw : (mediaType === "movie" ? "P4947=" : "P4983=") + raw;
  var wd = fetch(api + "&action=query&list=search&srlimit=1&srsearch=" + encodeURIComponent("haswbstatement:" + stmt), { headers: h })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var hits = (j && j.query && j.query.search) || [];
      if (!hits.length) return null;
      return fetch(api + "&action=wbgetentities&props=labels|aliases&languages=tr|en&ids=" + hits[0].title, { headers: h }).then(function (r) { return r.ok ? r.json() : null; });
    })
    .then(function (j) {
      var res = [], ents = (j && j.entities) || {}, k, l, a, i;
      for (k in ents) {
        l = ents[k].labels || {}; a = ents[k].aliases || {};
        if (l.tr && l.tr.value) res.push(l.tr.value);
        if (l.en && l.en.value) res.push(l.en.value);
        for (i = 0; i < (a.tr || []).length && i < 2; i++) res.push(a.tr[i].value);
      }
      return res;
    }).catch(function () { return []; });
  var imdb = /^tt\d+$/.test(raw)
    ? fetch("https://v3.sg.media-imdb.com/suggestion/t/" + raw + ".json", { headers: h })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.d && j.d[0] && j.d[0].l) ? [j.d[0].l] : []; })
        .catch(function () { return []; })
    : Promise.resolve([]);
  var tvm = /^tt\d+$/.test(raw) && mediaType !== "movie"
    ? fetch("https://api.tvmaze.com/lookup/shows?imdb=" + raw, { headers: h })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.name) ? [j.name] : []; })
        .catch(function () { return []; })
    : Promise.resolve([]);
  return Promise.all([wd, imdb, tvm]).then(function (lists) {
    var out = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      for (var j = 0; j < lists[i].length; j++) {
        var v = String(lists[i][j] || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; out.push(v); }
      }
    }
    return out;
  });
}
var __cinemetaGetStreams = module.exports.getStreams;
module.exports.getStreams = function (id, mediaType, season, episode) {
  var raw = String(id || "");
  return __cinemetaGetStreams(raw, mediaType, season, episode).then(function (streams) {
    if ((streams && streams.length) || /^__alt__:/.test(raw)) return streams || [];
    return __altTitles(raw, mediaType).then(function (titles) {
      var chain = Promise.resolve([]);
      titles.forEach(function (t) {
        chain = chain.then(function (out) {
          return out.length ? out : __cinemetaGetStreams("__alt__:" + encodeURIComponent(t), mediaType, season, episode);
        });
      });
      return chain;
    });
  }).catch(function () { return []; });
};

/* Dil etiketi (AGENTS.md): Nuvio karti "quality \u2022 ..." satirini gosterir; dil etiketi kalitenin yanina yazilir. */
var __subOnly = false;
var __langLabeled = module.exports.getStreams;
module.exports.getStreams = function (id, mediaType, season, episode) {
  return __langLabeled.apply(this, arguments).then(function (streams) {
    return (streams || []).map(function (s) {
      if (!s) return s;
      var hay = String(s.title || "") + " " + String(s.name || "");
      var tags = [];
      if (/dublaj/i.test(hay)) tags.push("TR Dublaj");
      if (/altyaz/i.test(hay) || (s.subtitles && s.subtitles.length) || (!tags.length && __subOnly)) tags.push("Altyaz\u0131l\u0131");
      if (!tags.length) return s;
      var q = String(s.quality || "").replace(/\s*\u2022.*$/, "") || "auto";
      s.quality = q + " \u2022 " + tags.join(" \u2022 ");
      return s;
    });
  });
};


/* ===================================================================
 *  Ymir adapter (fixed): flexible /film/ card parser + filmmodu.one fallback
 * =================================================================== */
;(function () {
  var __bbGetStreams = module.exports.getStreams;
  var __UA = (typeof UA !== "undefined" && UA) ? UA : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  function __parse(html, origin) {
    var out = [], seen = {};
    var re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(html)) !== null) {
      var open = m[1] + " " + m[3], href = m[2], inner = m[4];
      if (!/<img/i.test(inner)) continue;
      if (href.indexOf("/film/") === -1 && !/\/[a-z0-9-]+-film-izle/i.test(href)) continue;
      var full = href.indexOf("http") === 0 ? href : (origin + (href.charAt(0) === "/" ? href : "/" + href));
      if (seen[full]) continue;
      var img = (inner.match(/<img[^>]*>/i) || [""])[0];
      var tm = open.match(/title=["']([^"']+)["']/i) || img.match(/alt=["']([^"']+)["']/i);
      var title = String(tm ? tm[1] : inner).replace(/<[^>]+>/g, " ").replace(/\s+Film\s+[İi]zle$/i, "").replace(/\s+/g, " ").trim();
      if (!title || title.length < 2) continue;
      var pm = img.match(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
      var poster = pm ? pm[1] : null;
      if (poster && poster.charAt(0) === "/") poster = origin + poster;
      if (poster && /^data:/i.test(poster)) poster = null;
      seen[full] = 1;
      out.push({ id: "__alt__:" + encodeURIComponent(title), name: title, poster: poster, type: "movie" });
      if (out.length >= 40) break;
    }
    return out;
  }
  async function getCatalog(args) {
    var q = args && (args.query || args.search) ? String(args.query || args.search).trim() : "";
    if (q) return { items: [{ id: "__alt__:" + encodeURIComponent(q), name: q, poster: null, type: "movie" }] };
    var urls = ["https://filmmodu.icu/filmler", "https://www.filmmodu.one/filmler", "https://filmmodu.icu/", "https://www.filmmodu.one/"];
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { headers: { "User-Agent": __UA, "Accept-Language": "tr-TR,tr;q=0.9" } });
        if (!r.ok) continue;
        var orig = (urls[i].match(/^https?:\/\/[^/]+/) || ["https://filmmodu.icu"])[0];
        var items = __parse(await r.text(), orig);
        if (items.length) return { items: items };
      } catch (e) {}
    }
    throw new Error("FilmModu katalog boş");
  }
  async function search(args) { return getCatalog(typeof args === "string" ? { query: args } : args); }
  async function getStreams(tmdbId, mediaType, season, episode, url) {
    return __bbGetStreams(url || tmdbId, "movie", season, episode);
  }
  module.exports = { getCatalog: getCatalog, search: search, getStreams: getStreams };
  if (typeof globalThis !== "undefined") {
    globalThis.getCatalog = getCatalog; globalThis.search = search; globalThis.getStreams = getStreams;
  }
})();
