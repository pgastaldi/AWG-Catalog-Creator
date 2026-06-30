import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS = {
  ES: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  EN: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  PT: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
};
const LABELS = {
  ES: { catalog:"CATÁLOGO DE VIDEOJUEGOS", featured:"Destacados", top:"Más Jugados", all:"Juegos", nuevos:"Novedades", single:"1 Jugador", multi:"Multi", online:"Online", note:"Juegos sujetos a cambios sin previo aviso", play:"Jugar ahora", search:"Buscar juego, publisher, género...", genre:"Género", license:"LICENCIA", device:"DISPOSITIVO", control:"CONTROL", players:"JUGADORES", singlePlayer:"Un jugador", multiplayer:"Multijugador", clearFilters:"Borrar filtros", noResults:"Sin resultados", noResultsSub:"Probá otro término o eliminá algunos filtros", newBadge:"NUEVO", freeBadge:"Gratis", jugadores:"Jugadores", dispositivos:"Dispositivos", controles:"Controles", keyboard:"Teclado", results:"Resultados", games:"juegos", pegi:"PEGI", free:"Gratuito", mobile:"Móvil", maintenance:"EN MANTENIMIENTO" },
  EN: { catalog:"VIDEO GAME CATALOG", featured:"Featured", top:"Most Played", all:"All Games", nuevos:"New", single:"Single", multi:"Multi", online:"Online", note:"Games subject to change without notice", play:"Play now", search:"Search game, publisher, genre...", genre:"Genre", license:"LICENSE", device:"DEVICE", control:"CONTROL", players:"PLAYERS", singlePlayer:"Single player", multiplayer:"Multiplayer", clearFilters:"Clear filters", noResults:"No results", noResultsSub:"Try another term or remove some filters", newBadge:"NEW", freeBadge:"Free", jugadores:"Players", dispositivos:"Devices", controles:"Controls", keyboard:"Keyboard", results:"Results", games:"games", pegi:"PEGI", free:"Free", mobile:"Mobile", maintenance:"UNDER MAINTENANCE" },
  PT: { catalog:"CATÁLOGO DE JOGOS", featured:"Destaques", top:"Mais Jogados", all:"Jogos", nuevos:"Novidades", single:"1 Jogador", multi:"Multi", online:"Online", note:"Jogos sujeitos a alterações sem aviso prévio", play:"Jogar agora", search:"Buscar jogo, publisher, gênero...", genre:"Gênero", license:"LICENÇA", device:"DISPOSITIVO", control:"CONTROLE", players:"JOGADORES", singlePlayer:"Um jogador", multiplayer:"Multijogador", clearFilters:"Limpar filtros", noResults:"Sem resultados", noResultsSub:"Tente outro termo ou remova alguns filtros", newBadge:"NOVO", freeBadge:"Grátis", jugadores:"Jogadores", dispositivos:"Dispositivos", controles:"Controles", keyboard:"Teclado", results:"Resultados", games:"jogos", pegi:"PEGI", free:"Gratuito", mobile:"Móvel", maintenance:"EM MANUTENÇÃO" },
};

// Etiquetas de género por idioma (clave = género canónico en español).
// Sirve para MOSTRAR el género traducido; el orden de las categorías es
// alfabético por la etiqueta mostrada.
const GENRE_I18N = {
  EN: { "Acción":"Action","Aventura":"Adventure","Carreras":"Racing","Casual":"Casual","Deportes":"Sports","Lucha":"Fighting","Platforma":"Platformer","Puzzle":"Puzzle","RPG":"RPG","Simulador":"Simulation","Otros":"Other" },
  PT: { "Acción":"Ação","Aventura":"Aventura","Carreras":"Corridas","Casual":"Casual","Deportes":"Esportes","Lucha":"Luta","Platforma":"Plataforma","Puzzle":"Quebra-cabeça","RPG":"RPG","Simulador":"Simulador","Otros":"Outros" },
};

const COMMANDS = [
  ["Crear catálogo [Servicio] [Idioma]",     "Genera el catálogo en PDF descargable — ES / EN / PT"],
  ["Actualizar catálogo [Servicio] [Idioma]","Genera la web y la sube al repositorio GitHub"],
  ["Listar servicios",                        "Ver todos los servicios cargados"],
  ["Nuevo servicio",                          "Agregar un nuevo servicio con logo y branding"],
  ["Editar servicio [Nombre]",               "Editar un servicio existente"],
  ["Eliminar servicio [Nombre]",             "Eliminar un servicio del sistema"],
  ["Configurar planilla",                     "Configurar la URL del Google Sheet con los juegos"],
  ["Modificar juegos",                        "Abrir la planilla de Google Sheets para editar los juegos"],
  ["Configurar repositorio",                  "Configurar el repositorio de GitHub para el deploy"],
  ["Ayuda",                                   "Mostrar este menú"],
];

// ─── STORAGE / GAS ────────────────────────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbwC-lTs30d-VNiwIU1x6BK2lrSRVqM1DkyFPVT4Hb8mg5NyKk2zTdj2Opwf1pOlEieYyA/exec";

async function stGet(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function stSet(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} }

async function stGetRemote() {
  try {
    const res = await fetch(`${GAS_URL}?action=getAll`);
    const text = await res.text();
    if (text.trim().startsWith("<")) { console.error("GAS devolvió HTML:", text.slice(0,300)); return null; }
    return JSON.parse(text);
  } catch (e) { console.error("GAS GET error:", e.message); return null; }
}
async function stSetRemote(action, data) {
  try {
    await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data }),
    });
    return true;
  } catch (e) { console.error("GAS POST error:", e.message); return false; }
}

// ─── CSV / SHEET PARSER ───────────────────────────────────────────────────────
function parseCSVRow(line) {
  const cols = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ""; }
    else cur += ch;
  }
  cols.push(cur); return cols;
}
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  return lines.slice(1).map(line => {
    const cols = parseCSVRow(line); const o = {};
    headers.forEach((h, i) => { o[h] = (cols[i] || "").trim(); });
    return o;
  }).filter(r => r.juego && r.juego.length > 0);
}
function mapRow(o) {
  const jug = (o.jugadores || "").toLowerCase();
  const dev = (o.dispositivos || "").toLowerCase();
  const ctrl = (o.controles || "").toLowerCase();
  const est = (o.estado || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return {
    titulo: o.juego || "", publisher: o.publisher || "", genero: o.genero || "",
    pegi: o.pegi || "3", descripcion: o.descripcion || "", licencia: o.licencia || "", portada: o.portada || "",
    singleplayer: jug.includes("un jugador"), multiplayer: jug.includes("multijugador") && !jug.includes("online"), multiOnline: jug.includes("online"),
    pc: dev.includes("pc"), mobile: dev.includes("mobile"), tv: dev.includes("tv"),
    gamepad: ctrl.includes("gamepad"), teclado: ctrl.includes("teclado"), touchscreen: ctrl.includes("touchscreen"),
    nuevo: est === "nuevo", destacado: est === "destacado", masJugado: est.includes("mas jugado"),
    mantenimiento: est.includes("mantenimiento"),
    servicio: o.servicio || "",
  };
}

// ── Filtro por servicio ───────────────────────────────────────────────────────
// Devuelve true si el juego pertenece al servicio dado (según la columna "servicio"
// del sheet). Un juego puede listar varios servicios separados por , ; o /.
// Si la columna está vacía, el juego se muestra en todos los servicios.
function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
function gameInService(game, svc) {
  const raw = norm(game.servicio);
  if (!raw) return true; // sin servicio asignado → visible en todos
  const tokens = raw.split(/[,;/]+/).map(t => t.trim()).filter(Boolean);
  const aliases = [norm(svc.name), ...(svc.alias || []).map(norm)].filter(Boolean);
  return tokens.some(tok => aliases.some(a => tok.includes(a) || a.includes(tok)));
}

// ─── DEFAULT SERVICES ─────────────────────────────────────────────────────────
const DEFAULT_SERVICES = {
  xbox:    { name:"Xbox Cloud Gaming", alias:["xbox","xcloud","xbox cloud"],  lang:"ES", brandColor:"#107C10", bgColor:"#0a0f0a", secondaryColor:"#ffffff", logoImg:"", coverImg:"", backImg:"", link:"https://www.xbox.com/play" },
  geforce: { name:"GeForce Now",       alias:["geforce","geforce now","nvidia"], lang:"ES", brandColor:"#76B900", bgColor:"#0a0a0f", secondaryColor:"#000000", logoImg:"", coverImg:"", backImg:"", link:"https://www.nvidia.com/geforce-now" },
};

// ─── COMMAND PARSER ───────────────────────────────────────────────────────────
function parseCmd(txt) {
  const t = txt.trim().toLowerCase();
  if (/^(ayuda|help|\?)/.test(t))                                                      return { type: "help" };
  if (/^(listar servicios|listar|list)/.test(t))                                       return { type: "list" };
  if (/^(nuevo servicio|agregar servicio|add new service|add service)/.test(t))        return { type: "add" };
  if (/^(configurar planilla|config sheet|configurar sheet)/.test(t))                  return { type: "config_sheet" };
  if (/^(modificar juegos|editar juegos)/.test(t))                                     return { type: "modify_games" };
  if (/^(configurar repositorio|configurar repo|config repo|config github)/.test(t))   return { type: "config_repo" };
  const em = t.match(/^(editar servicio|edit service)\s+(.+)/);
  if (em) return { type: "edit", svc: em[2].trim() };
  const dm = t.match(/^(eliminar servicio|delete service|borrar servicio)\s+(.+)/);
  if (dm) return { type: "delete", svc: dm[2].trim() };
  // Actualizar catálogo → web a GitHub
  const um = txt.trim().match(/^(actualizar cat[aá]logo|update catalog)\s+(.+?)(?:\s+(ES|EN|PT))?$/i);
  if (um) return { type: "update", svc: um[2].trim(), lang: um[3] ? um[3].toUpperCase() : null };
  // Crear catálogo → PDF descargable
  const cm = txt.trim().match(/^(crear cat[aá]logo|create catalog)\s+(.+?)(?:\s+(ES|EN|PT))?$/i);
  if (cm) return { type: "create", svc: cm[2].trim(), lang: cm[3] ? cm[3].toUpperCase() : null };
  return { type: "unknown" };
}

// ─── SHEET FETCH ──────────────────────────────────────────────────────────────
async function fetchSheetGames(url) {
  if (!url) return null;
  const id = url.match(/\/d\/([\w-]+)/)?.[1] || url.trim();
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
    if (!res.ok) return null;
    const text = await res.text();
    return parseCSV(text).map(mapRow).filter(g => g.titulo);
  } catch { return null; }
}

// ─── TRADUCCIÓN AUTOMÁTICA (Google Translate, endpoint público sin key) ───────
const _trCache = {};
const TR_LANG = { ES:"es", EN:"en", PT:"pt" };
// fetch con timeout para que una request colgada nunca frene toda la exportación
async function fetchTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
function trUrl(q, tl) {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(q)}`;
}
// Traduce un solo texto (con cache). Si falla, devuelve el original — nunca tira error.
async function translateText(text, targetLang) {
  const t = (text || "").trim();
  if (!t) return text;
  const tl = TR_LANG[targetLang] || targetLang.toLowerCase();
  const key = tl + "|" + t;
  if (_trCache[key] !== undefined) return _trCache[key];
  try {
    const res = await fetchTimeout(trUrl(t, tl));
    if (!res.ok) { _trCache[key] = t; return t; }
    const data = await res.json();
    const out = (data[0] || []).map(seg => seg[0]).join("") || t;
    _trCache[key] = out;
    return out;
  } catch { _trCache[key] = t; return t; }
}
// Traduce un lote de textos en UNA sola request, uniéndolos por saltos de línea.
// Devuelve null si la respuesta no se alinea 1:1 (para que el caller use fallback).
async function translateBatch(texts, tl) {
  const joined = texts.join("\n");
  const res = await fetchTimeout(trUrl(joined, tl));
  if (!res.ok) return null;
  const data = await res.json();
  const out = (data[0] || []).map(seg => seg[0]).join("");
  const parts = out.split("\n");
  return parts.length === texts.length ? parts : null;
}
// Traduce los textos del sheet de cada juego al idioma destino.
// Deduplica strings repetidos y traduce en lotes (pocas requests → sin rate-limit).
// CLAVE: nunca descarta juegos — si una traducción falla, deja el texto original.
async function translateGames(games, targetLang) {
  if (!games || !games.length) return games;
  const tl = TR_LANG[targetLang] || targetLang.toLowerCase();
  // Campos que se traducen y se sobreescriben in-place.
  // OJO: el TÍTULO del juego NO se traduce (es nombre propio); se mantiene tal cual.
  // El "genero" tampoco se sobreescribe — se mantiene el original en español para
  // que el PDF agrupe/ordene por género canónico; la traducción va a "generoTr".
  const fields = ["descripcion", "licencia"];
  // strings únicos, en una sola línea (sin saltos internos que rompan el batch)
  const clean = s => (s || "").replace(/\s*\n\s*/g, " ").trim();
  const unique = [...new Set(
    games.flatMap(g => [...fields.map(f => clean(g[f])), clean(g.genero)]).filter(Boolean)
  )];
  const map = {};
  const BATCH = 20; // textos por request
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    let parts = null;
    try { parts = await translateBatch(batch, tl); } catch { parts = null; }
    if (parts) {
      batch.forEach((s, j) => { map[s] = parts[j] || s; });
    } else {
      // fallback seguro: uno por uno (cada uno cae al original si falla)
      const one = await Promise.all(batch.map(s => translateText(s, targetLang)));
      batch.forEach((s, j) => { map[s] = one[j]; });
    }
  }
  return games.map(g => {
    const out = { ...g };
    fields.forEach(f => {
      const k = clean(g[f]);
      if (k && map[k]) out[f] = map[k];
    });
    // género traducido aparte (para la web); el original queda intacto
    const gk = clean(g.genero);
    out.generoTr = (gk && map[gk]) || g.genero;
    return out;
  });
}

// ─── GITHUB API ───────────────────────────────────────────────────────────────
async function githubGetFileSha(token, owner, repo, path) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    if (!res.ok) return null;
    return (await res.json()).sha || null;
  } catch { return null; }
}
async function githubPutFile(token, owner, repo, path, content, message, sha) {
  const body = { message, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.message || "GitHub error"); }
  return await res.json();
}

// ─── LUMINANCE AUTO-DETECT ────────────────────────────────────────────────────
function getTextColor(hexBg) {
  try {
    const hex = hexBg.replace("#","");
    const r = parseInt(hex.substring(0,2),16)/255;
    const g = parseInt(hex.substring(2,4),16)/255;
    const b = parseInt(hex.substring(4,6),16)/255;
    const toLinear = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
    const L = 0.2126*toLinear(r) + 0.7152*toLinear(g) + 0.0722*toLinear(b);
    return L > 0.35 ? { tx:"#0a0a0f", mu:"#444466" } : { tx:"#f0f0f8", mu:"#8080a0" };
  } catch { return { tx:"#f0f0f8", mu:"#8080a0" }; }
}

// ─── PDF CATALOG GENERATOR — formato 16:9 landscape ──────────────────────────
function generatePDFHTML(svc, games, lang) {
  const L     = LABELS[lang] || LABELS.ES;
  const color = svc.brandColor || "#E52222";   // color principal — íconos, barra, badges
  const secondary = svc.secondaryColor || "#111111"; // color secundario — fondo de headers
  const bg    = svc.bgColor   || "#1a1a1a";
  const month = (MONTHS[lang] || MONTHS.ES)[new Date().getMonth()];
  const dateStr = `${month.toUpperCase()} ${new Date().getFullYear()}`;

  const nuevos     = games.filter(g => g.nuevo);
  const destacados = games.filter(g => g.destacado);
  const masJugados = games.filter(g => g.masJugado);
  const resto      = games.filter(g => !g.nuevo && !g.destacado && !g.masJugado);

  // ── Aliases de género (normalizan variantes/idiomas al canónico en español)
  const GENRE_ALIASES = {
    "accion":"Acción","acción":"Acción","action":"Acción",
    "aventura":"Aventura","adventure":"Aventura",
    "carreras":"Carreras","racing":"Carreras",
    "casual":"Casual",
    "deportes":"Deportes","sports":"Deportes",
    "lucha":"Lucha","fighting":"Lucha",
    "plataforma":"Platforma","platforma":"Platforma","platform":"Platforma","platformer":"Platforma",
    "puzzle":"Puzzle",
    "rpg":"RPG","rol":"RPG",
    "simulador":"Simulador","simulacion":"Simulador","simulación":"Simulador","simulation":"Simulador",
  };
  function resolveGenre(raw) {
    const first = raw.split(",")[0].trim();
    const key = first.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    return GENRE_ALIASES[key] || first;
  }
  // Etiqueta a mostrar: traduce el g\u00e9nero can\u00f3nico al idioma del cat\u00e1logo,
  // sin afectar la agrupaci\u00f3n/orden (que sigue siendo por can\u00f3nico en espa\u00f1ol).
  const genreLabel = raw => {
    const canon = resolveGenre(raw || "");
    return (GENRE_I18N[lang] && GENRE_I18N[lang][canon]) || canon;
  };
  const byGenre = {};
  resto.forEach(g => {
    const gen = resolveGenre(g.genero || "Otros");
    if (!byGenre[gen]) byGenre[gen] = [];
    byGenre[gen].push(g);
  });
  // Orden alfabético por la categoría tal como se muestra (según el idioma)
  const sortedGenres = Object.keys(byGenre).sort((a, b) =>
    genreLabel(a).localeCompare(genreLabel(b), undefined, { sensitivity: "base" })
  );

  // ── SVG íconos en color del servicio ──────────────────────────────────────
  function ico(path, size=28) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }
  function icoSm(path) { return ico(path, 20); } // versión 20px para slideTop3
  const ICO = {
    pc:      `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>`,
    mobile:  `<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1"/>`,
    tv:      `<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/>`,
    gamepad: `<rect x="2" y="7" width="20" height="12" rx="5"/><path d="M7 11v4M5 13h4M16 12h2"/>`,
    teclado: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>`,
    touch:   `<path d="M9 11V6a2 2 0 0 1 4 0v5M13 11V9a2 2 0 0 1 4 0v3l1 5H9l1-5H9a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2"/>`,
    single:  `<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>`,
    multi:   `<circle cx="9" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 9-5.2M15 14a6 6 0 0 1 6 6v2"/>`,
    online:  `<circle cx="12" cy="12" r="9"/><path d="M12 3C9 7 9 17 12 21M12 3c3 4 3 14 0 18M3 12h18"/>`,
  };

  // Badge de íconos con label — versión grande (slides individuales)
  function icoBlock(show, path, label) {
    if (!show) return "";
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      ${ico(path, 32)}
      <span style="font-size:10px;font-weight:700;color:${color};letter-spacing:1px;text-transform:uppercase">${label}</span>
    </div>`;
  }

  // Badge de íconos pequeños — versión compacta (cards género)
  function icoSmall(show, path) {
    if (!show) return "";
    return ico(path, 12);
  }

  // ── SLIDE individual — Nuevos / Destacados (1 juego por slide) ────────────
  function slideGame(g, badge) {
    const imgCol = `
      <div style="width:420px;flex-shrink:0;position:relative;background:#000;overflow:hidden">
        ${g.portada
          ? `<img src="${g.portada}" style="width:100%;height:100%;object-fit:cover;display:block;opacity:.9"/>`
          : `<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;font-size:80px;font-weight:900;color:${color};font-family:Arial;opacity:.3">${g.titulo[0]}</div>`
        }
        <!-- PEGI badge -->
        <div style="position:absolute;top:14px;left:14px;background:#fff;border-radius:4px;padding:3px 6px;font-size:11px;font-weight:900;color:#222;line-height:1">${g.pegi}</div>
        ${badge ? `<div style="position:absolute;top:14px;right:14px;background:${color};color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:4px;letter-spacing:1px">${badge}</div>` : ""}
      </div>`;

    const devices = `
      <div style="display:flex;gap:18px;flex-wrap:wrap;padding-bottom:14px;border-bottom:2px solid ${color};margin-bottom:14px">
        ${icoBlock(g.pc,     ICO.pc,     "PC")}
        ${icoBlock(g.mobile, ICO.mobile, "Mobile")}
        ${icoBlock(g.tv,     ICO.tv,     "TV")}
        ${icoBlock(g.gamepad,   ICO.gamepad,   "Gamepad")}
        ${icoBlock(g.teclado,   ICO.teclado,   "Keyboard")}
        ${icoBlock(g.touchscreen,ICO.touch,    "Touch")}
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap">
        ${icoBlock(g.singleplayer,ICO.single,"Single Player")}
        ${icoBlock(g.multiplayer, ICO.multi, "Multiplayer")}
        ${icoBlock(g.multiOnline, ICO.online,"Online")}
      </div>`;

    const infoCol = `
      <div style="flex:1;padding:32px 44px;display:flex;flex-direction:column;background:#f2f2f2;overflow:hidden">
        <div style="font-size:12px;color:#888;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">${g.publisher}</div>
        <div style="font-size:11px;color:#666;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:20px">${L.genre.toUpperCase()}: ${genreLabel(g.genero)}</div>
        ${devices}
        <div style="flex:1;font-size:17px;color:#222;line-height:1.75;margin-top:24px;overflow:hidden">${g.descripcion || ""}</div>
        <div style="font-size:12px;font-weight:700;color:#444;letter-spacing:.5px;text-transform:uppercase;margin-top:16px;padding-top:12px;border-top:1px solid #ddd;flex-shrink:0">${g.licencia}</div>
      </div>`;

    return `
    <div class="slide" style="display:flex;flex-direction:column;background:${bg}">
      <div style="background:${secondary};padding:14px 36px;display:flex;align-items:center;gap:16px;flex-shrink:0">
        ${svc.logoImg ? `<img src="${svc.logoImg}" style="height:28px;object-fit:contain"/>` : ""}
        <div style="font-family:'Barlow Condensed',Arial;font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;text-transform:uppercase">${g.titulo}</div>
      </div>
      <div style="width:100px;height:4px;background:${color};margin-left:36px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;overflow:hidden">
        ${imgCol}
        ${infoCol}
      </div>
    </div>`;
  }

  // ── SLIDE Más Jugados — 3 por slide ───────────────────────────────────────
  function slideTop3(group) {
    const cards = group.map(g => {
      const desc = g.descripcion && g.descripcion.length > 120
        ? g.descripcion.slice(0, 120).trimEnd() + "…"
        : (g.descripcion || "");
      return `
      <div style="flex:1;background:#f2f2f2;border-radius:8px;overflow:hidden;display:flex;flex-direction:column">
        <!-- imagen con ratio 3:4 fijo sin corte -->
        <div style="position:relative;width:100%;padding-top:100%;flex-shrink:0;overflow:hidden;background:#ddd">
          ${g.portada
            ? `<img src="${g.portada}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block"/>`
            : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:900;color:${color};opacity:.3">${g.titulo[0]}</div>`
          }
          <div style="position:absolute;top:8px;left:8px;background:#fff;border-radius:3px;padding:2px 5px;font-size:10px;font-weight:900;color:#222">${g.pegi}</div>
        </div>
        <div style="padding:10px 14px;flex:1;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden">
          <div>
            <div style="font-family:'Barlow Condensed',Arial;font-size:18px;font-weight:900;color:#111;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.titulo}</div>
            <div style="font-size:10px;color:#888;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.publisher}</div>
            <!-- íconos compactos en una sola fila -->
            <div style="display:flex;gap:6px;flex-wrap:wrap;padding-bottom:7px;border-bottom:2px solid ${color};margin-bottom:6px">
              ${g.pc      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.pc)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">PC</span></div>` : ""}
              ${g.mobile  ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.mobile)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Mobile</span></div>` : ""}
              ${g.tv      ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.tv)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">TV</span></div>` : ""}
              ${g.gamepad ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.gamepad)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Gamepad</span></div>` : ""}
              ${g.teclado ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.teclado)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Keyboard</span></div>` : ""}
              ${g.touchscreen ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.touch)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Touch</span></div>` : ""}
              ${g.singleplayer ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.single)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">1P</span></div>` : ""}
              ${g.multiplayer  ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.multi)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Multi</span></div>` : ""}
              ${g.multiOnline  ? `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${icoSm(ICO.online)}<span style="font-size:8px;font-weight:700;color:${color};letter-spacing:.5px">Online</span></div>` : ""}
            </div>
            <div style="font-size:11px;color:#444;line-height:1.5;overflow:hidden">${desc}</div>
          </div>
          <div style="font-size:9px;font-weight:700;color:#888;text-transform:uppercase;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.licencia}</div>
        </div>
      </div>`; }).join("");

    return `
    <div class="slide" style="display:flex;flex-direction:column;background:${bg}">
      <div style="background:${secondary};padding:14px 36px;display:flex;align-items:center;gap:16px;flex-shrink:0">
        ${svc.logoImg ? `<img src="${svc.logoImg}" style="height:28px;object-fit:contain"/>` : ""}
        <div style="font-family:'Barlow Condensed',Arial;font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;text-transform:uppercase">${L.top}</div>
      </div>
      <div style="width:100px;height:4px;background:${color};margin-left:36px;flex-shrink:0"></div>
      <div style="flex:1;display:flex;gap:16px;padding:20px 36px;overflow:hidden">
        ${cards}
      </div>
    </div>`;
  }

  // ── SLIDE Género — 6 juegos por slide (3×2) ───────────────────────────────
  function slideGenre(genre, gs, isFirst) {
    const cards = gs.slice(0, 6).map(g => {
      const desc = g.descripcion; //&& g.descripcion.length > 160
        //? g.descripcion.slice(0, 160).trimEnd() + "…"
        //: (g.descripcion || "");
      const maintBanner = g.mantenimiento ? `
        <!-- tarjeta de mantenimiento por encima de la card -->
        <div style="position:absolute;inset:0;z-index:5;background:rgba(10,10,10,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:6px">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z"/></svg>
          <div style="font-family:'Barlow Condensed',Arial;font-size:18px;font-weight:900;color:#fff;letter-spacing:1.5px;text-transform:uppercase;text-align:center;padding:0 10px">${L.maintenance}</div>
          <div style="width:40px;height:3px;background:${color}"></div>
        </div>` : "";
      return `
      <div style="position:relative;background:#f2f2f2;border-radius:6px;overflow:hidden;display:flex;align-items:stretch">
        ${maintBanner}
        <!-- imagen izquierda — altura completa de la card -->
        <div style="flex-shrink:0;position:relative;overflow:hidden;background:#ddd;display:flex;align-items:stretch">
          ${g.portada
            ? `<img src="${g.portada}" style="display:block;width:auto;height:100%;max-width:256px;object-fit:cover"/>`
            : `<div style="width:100px;height:100%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:${color};opacity:.3">${g.titulo[0]}</div>`
          }
          <div style="position:absolute;top:5px;left:5px;background:#fff;border-radius:2px;padding:1px 5px;font-size:8px;font-weight:900;color:#222;z-index:1">${g.pegi}</div>
        </div>
        <!-- info derecha: header oscuro arriba + cuerpo claro abajo -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0">
          <!-- título en header oscuro -->
          <div style="background:${secondary};padding:10px 14px 9px">
            <div style="font-family:'Barlow Condensed',Arial;font-size:14px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.titulo}</div>
          </div>
          <!-- cuerpo -->
          <div style="flex:1;padding:9px 14px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;background:#f2f2f2">
            <div>
              <div style="font-size:10px;font-weight:700;color:#333;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.publisher}</div>
              <div style="font-size:10px;color:#444;line-height:1.45;overflow:hidden">${desc}</div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:6px">
              <div style="font-size:6px;color:#888;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${g.licencia}</div>
              <div style="display:flex;gap:2px;flex-shrink:0">
                ${icoSmall(g.pc,          ICO.pc)}
                ${icoSmall(g.mobile,      ICO.mobile)}
                ${icoSmall(g.tv,          ICO.tv)}
                ${icoSmall(g.singleplayer,ICO.single)}
                ${icoSmall(g.multiplayer, ICO.multi)}
                ${icoSmall(g.multiOnline, ICO.online)}
                ${icoSmall(g.gamepad,     ICO.gamepad)}
                ${icoSmall(g.teclado,     ICO.teclado)}
                ${icoSmall(g.touchscreen, ICO.touch)}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }).join("");

    return `
    <div class="slide" style="display:flex;flex-direction:column;background:${bg}">
      <div style="background:${secondary};padding:14px 36px;display:flex;align-items:center;gap:16px;flex-shrink:0">
        ${svc.logoImg ? `<img src="${svc.logoImg}" style="height:28px;object-fit:contain"/>` : ""}
        <div style="font-family:'Barlow Condensed',Arial;font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;text-transform:uppercase">${genreLabel(genre)}</div>
        <div style="font-size:13px;color:#888;margin-left:8px">${isFirst ? `${gs.length} ${L.games}` : ""}</div>
      </div>
      <div style="width:100px;height:4px;background:${color};margin-left:36px;flex-shrink:0"></div>
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:12px;padding:16px 36px;overflow:hidden">
        ${cards}
      </div>
    </div>`;
  }

  // ── Portada y Contraportada ───────────────────────────────────────────────
  const coverBg = svc.coverImg
    ? `<img src="${svc.coverImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>`
    : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,${color}dd 0%,${color}44 50%,#000 100%)"></div>`;
  const backBg = svc.backImg
    ? `<img src="${svc.backImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>`
    : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#000 0%,${color}44 50%,${color}dd 100%)"></div>`;
  const darkOverlay = `<div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.8) 0%,rgba(0,0,0,.3) 60%,rgba(0,0,0,.1) 100%)"></div>`;
  const logoHtml = svc.logoImg
    ? `<img src="${svc.logoImg}" style="height:52px;max-width:220px;object-fit:contain;margin-bottom:20px;display:block"/>`
    : "";

  const cover = `
  <div class="slide" style="background:${color}">
    ${coverBg}
    ${darkOverlay}
    <div style="position:relative;z-index:2;height:100%;padding:56px 64px;display:flex;flex-direction:column;justify-content:space-between;color:#fff">
      <div>${logoHtml}</div>
      <div>
        <div style="font-family:'Barlow Condensed',Arial;font-size:15px;font-weight:700;letter-spacing:5px;opacity:.7;text-transform:uppercase;margin-bottom:10px">${L.catalog}</div>
        <div style="font-family:'Barlow Condensed',Arial;font-size:64px;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:2px">${svc.name}</div>
        <div style="width:80px;height:4px;background:${color};margin:18px 0"></div>
        <div style="font-size:16px;font-weight:600;letter-spacing:4px;opacity:.6;text-transform:uppercase">${dateStr}</div>
      </div>
      <div style="font-size:10px;opacity:.3">* ${L.note}</div>
    </div>
  </div>`;

  const backcover = `
  <div class="slide" style="background:${color}">
    ${backBg}
    ${darkOverlay}
    <div style="position:relative;z-index:2;height:100%;padding:56px 64px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff">
      <div>${logoHtml}</div>
      <div style="font-family:'Barlow Condensed',Arial;font-size:52px;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px">${svc.name}</div>
      <div style="width:80px;height:4px;background:${color};margin-bottom:16px"></div>
      <div style="font-size:14px;opacity:.5;letter-spacing:3px;text-transform:uppercase">${dateStr}</div>
      ${svc.link ? `<div style="font-size:13px;opacity:.45;margin-top:12px">${svc.link}</div>` : ""}
    </div>
  </div>`;

  // ── Slides de Más Jugados (grupos de 3) ──────────────────────────────────
  const topSlides = [];
  for (let i = 0; i < masJugados.length; i += 3) {
    topSlides.push(slideTop3(masJugados.slice(i, i + 3)));
  }

  // ── Slides de géneros (grupos de 6 por slide) ────────────────────────────
  const genreSlides = sortedGenres.flatMap(genre => {
    const gs = byGenre[genre];
    const slides = [];
    for (let i = 0; i < gs.length; i += 6) {
      slides.push(slideGenre(genre, gs.slice(i, i + 6), i === 0));
    }
    return slides;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
  html,body{width:100%;background:#222;font-family:'Barlow',Arial,sans-serif}
  .slide{
    width:1280px;
    height:720px;
    position:relative;
    overflow:hidden;
    page-break-after:always;
    page-break-inside:avoid;
    break-after:page;
  }
  @media print{
    html,body{width:1280px;height:720px;background:#fff}
    .slide{margin:0;display:block}
    @page{margin:0;size:1280px 720px}
  }
</style>
<script>
function scale(){
  var vw = window.innerWidth;
  var ratio = vw / 1280;
  document.querySelectorAll('.slide').forEach(function(s){
    s.style.transformOrigin = 'top left';
    s.style.transform = 'scale('+ratio+')';
    s.style.marginBottom = ((720*ratio)-720)+'px';
  });
}
window.addEventListener('load', scale);
window.addEventListener('resize', scale);
</script>
</head>
<body>

${cover}
${nuevos.map(g => slideGame(g, L.newBadge || "¡NUEVO!")).join("\n")}
${destacados.map(g => slideGame(g, null)).join("\n")}
${topSlides.join("\n")}
${genreSlides.join("\n")}
${backcover}

</body>
</html>`;
}

// ─── WEB HTML GENERATOR ───────────────────────────────────────────────────────
function generateWebHTML(svc, games, lang) {
  const L = LABELS[lang] || LABELS.ES;
  const color = svc.brandColor || "#7c3aed";
  const bgColor = svc.bgColor || "#0a0a0f";
  const bg = bgColor;
  const textColors = getTextColor(bgColor);
  const txColor = svc.textColor || textColors.tx;
  const muColor = svc.textColor
    ? (svc.textColor.startsWith("#") ? svc.textColor + "99" : svc.textColor)
    : textColors.mu;

  function plt(l) {
    const x = l.toLowerCase();
    if (x.includes("steam")) return "Steam";
    if (x.includes("epic")) return "Epic Games";
    if (x.includes("battle.net")) return "Battle.net";
    if (x.includes("incluido")) return "Incluido";
    return "Otro";
  }

  const gamesJSON = JSON.stringify(games.map(g => ({
    t: g.titulo, p: g.publisher, g: g.generoTr || g.genero, pe: g.pegi,
    l: g.licencia, lt: plt(g.licencia), free: g.licencia.toLowerCase().includes("gratuito"),
    i: g.portada, d: g.descripcion,
    sp: g.singleplayer, mp: g.multiplayer, mo: g.multiOnline,
    pc: g.pc, mob: g.mobile, tv: g.tv,
    gp: g.gamepad, tk: g.teclado, ts: g.touchscreen,
    nv: g.nuevo, de: g.destacado, mj: g.masJugado,
  })));

  return `<!DOCTYPE html>
<html lang="${lang.toLowerCase()}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${svc.name} — ${L.catalog}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet"/>
<style>
:root{--br:${color};--bg:${bg};--hdr-bg:color-mix(in srgb,${bg} 80%,#fff 3%);--fb-bg:color-mix(in srgb,${bg} 92%,#000 8%);--main-bg:color-mix(in srgb,${bg} 100%,#000 0%);--s1:color-mix(in srgb,${bg} 88%,#fff 5%);--s2:color-mix(in srgb,${bg} 80%,#fff 3%);--s3:color-mix(in srgb,${bg} 70%,#000 5%);--bd:${svc.borderColor||'rgba(255,255,255,.07)'};--bd2:${svc.borderColor ? svc.borderColor+'cc' : 'rgba(255,255,255,.14)'};--tx:${txColor};--mu:${muColor}}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--main-bg);color:var(--tx);font-family:'Barlow',sans-serif;font-size:13px;height:100vh;display:flex;flex-direction:column;overflow:hidden}
#hdr{background:var(--hdr-bg);backdrop-filter:blur(20px);border-bottom:1px solid var(--bd);padding:0 20px;flex-shrink:0;z-index:100}
#hi{display:flex;align-items:center;gap:14px;height:62px}
#logo{display:flex;align-items:center;gap:10px;flex-shrink:0}
#ln{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;letter-spacing:.5px;color:var(--br);line-height:1.1}
#ls{font-size:9px;color:var(--mu);letter-spacing:2.5px;text-transform:uppercase;margin-top:2px}
#sw{flex:1;position:relative;max-width:400px}
#si{width:100%;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:9px 13px 9px 36px;color:var(--tx);font-family:'Barlow',sans-serif;font-size:13px;outline:none;transition:border-color .2s}
#si:focus{border-color:var(--br)}#si::placeholder{color:var(--mu)}
.sic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mu);pointer-events:none}
#gc{margin-left:auto;font-size:12px;color:var(--mu);flex-shrink:0;white-space:nowrap}
#fb{background:var(--fb-bg);border-bottom:1px solid var(--bd);flex-shrink:0;z-index:50;position:relative}
#fi{display:flex;align-items:center;gap:6px;padding:0 20px;height:52px;overflow-x:auto;overflow-y:visible;scrollbar-width:none;-webkit-overflow-scrolling:touch}
#fi::-webkit-scrollbar{display:none}
.fg{display:flex;align-items:center;gap:5px;flex-shrink:0}
.fl{font-size:10px;color:var(--mu);letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;padding-right:2px}
.sp{width:1px;height:18px;background:var(--bd2);flex-shrink:0;margin:0 5px}
.chip{background:var(--s2);border:1px solid var(--bd2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--mu);cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;flex-shrink:0}
.chip:hover{border-color:var(--br);color:var(--tx)}.chip.on{background:var(--br);border-color:var(--br);color:#fff}
#clr{display:none;align-items:center;gap:4px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--br);cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:4px;transition:all .15s}
#clr.show{display:flex}
.dd{position:relative;flex-shrink:0}
.ddbtn{background:var(--s2);border:1px solid var(--bd2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--mu);cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;user-select:none;transition:all .15s}
.ddbtn.has{border-color:var(--br);color:var(--br)}.arr{transition:transform .2s}.ddbtn.open .arr{transform:rotate(180deg)}
#genre-portal{position:fixed;z-index:9999;display:none}#genre-portal.open{display:block}
#gp{background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:340px;box-shadow:0 16px 48px rgba(0,0,0,.8)}
#scroll{flex:1;overflow-y:auto;overflow-x:hidden;background:var(--main-bg)}
#main{max-width:1200px;margin:0 auto;padding:24px 20px 48px}
.sec{margin-bottom:40px}.sh{display:flex;align-items:baseline;gap:7px;margin-bottom:14px}
.dot{color:var(--br);font-size:14px}.tit{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900;text-transform:uppercase}.cnt{font-size:11px;color:var(--mu);margin-left:4px}
.glg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
.gmd{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.gsm{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:10px;overflow:hidden;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}
.card:hover{transform:translateY(-3px);border-color:var(--bd2);box-shadow:0 10px 28px rgba(0,0,0,.55)}
.ciw{position:relative;width:100%;padding-top:133.33%;overflow:hidden;background:var(--s3)}
.ci{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .28s}
.card:hover .ci{transform:scale(1.04)}
.cph{position:absolute;inset:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:900;color:var(--br);font-size:48px;opacity:.3}
.cov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,transparent 50%);z-index:1}
.cnv{position:absolute;top:7px;left:7px;background:var(--br);color:#fff;font-size:8px;font-weight:700;padding:3px 6px;border-radius:4px;letter-spacing:1.5px;z-index:2}
.cpe{position:absolute;bottom:7px;right:7px;background:rgba(0,0,0,.75);color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.12);z-index:2}
.cb{padding:10px 11px 11px}
.ct{font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;line-height:1.2;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp{font-size:11px;color:var(--mu);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ctgs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
.ctg{background:var(--s3);border:1px solid var(--bd);border-radius:4px;font-size:9px;color:var(--mu);padding:2px 6px;white-space:nowrap}
.ctg.g{background:color-mix(in srgb,var(--br) 15%,transparent);border-color:color-mix(in srgb,var(--br) 40%,transparent);color:var(--br)}
.ctg.f{border-color:rgba(50,200,100,.3);color:rgba(50,200,100,.9)}
.cic{display:flex;flex-wrap:wrap;gap:5px}.ib{display:flex;flex-direction:column;align-items:center;gap:2px}.ib svg{opacity:.6}.ib span{font-size:7px;color:var(--mu)}
#pov{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9990;display:none;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(10px)}
#pov.open{display:flex}
#pop{background:var(--s1);border:1px solid var(--bd2);border-radius:16px;max-width:760px;width:100%;overflow:hidden;animation:pi .18s ease;position:relative;display:flex;flex-direction:column;max-height:92vh}
@keyframes pi{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
#pt{display:flex;flex-shrink:0;min-height:0}#pcol{width:220px;flex-shrink:0;position:relative}
#pim{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
#pph{width:100%;aspect-ratio:3/4;background:var(--s3);display:none;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:72px;font-weight:900;color:var(--br);opacity:.2}
#pnvb{position:absolute;top:10px;left:10px;background:var(--br);color:#fff;font-size:9px;font-weight:700;padding:3px 9px;border-radius:4px;letter-spacing:1.5px;display:none}
#pmeta{flex:1;padding:20px 22px 16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-width:0}
#ptit{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;line-height:1.05}#ppub{font-size:13px;color:var(--mu);margin-top:2px}
#ptgs{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.ptag{border-radius:6px;font-size:12px;font-weight:600;padding:5px 13px;border:1px solid var(--bd2);background:var(--s3);color:var(--tx);white-space:nowrap}
.ptag.genre{background:color-mix(in srgb,var(--br) 15%,transparent);border-color:color-mix(in srgb,var(--br) 45%,transparent);color:var(--br)}
.ptag.pegi{font-weight:700;font-size:13px}.ptag.lic{color:var(--mu);font-size:11px;font-weight:400}.ptag.free{border-color:rgba(50,205,100,.4);color:rgba(50,205,100,.95);background:rgba(50,205,100,.08)}
.psec{display:flex;flex-direction:column;gap:8px}.plbl{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu)}.prow{display:flex;flex-wrap:wrap;gap:14px}
.pico{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:44px}.pico svg{opacity:.8;width:22px;height:22px}.pico span{font-size:11px;color:var(--mu);text-align:center;line-height:1.2;white-space:nowrap}
#pbot{border-top:1px solid var(--bd);padding:14px 22px;display:flex;align-items:flex-end;gap:14px;flex-shrink:0}
#pdsc{flex:1;font-size:13px;color:var(--mu);line-height:1.65;max-height:76px;overflow-y:auto}
#pcta{flex-shrink:0;background:var(--br);color:#fff;border:none;border-radius:8px;padding:11px 22px;font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;cursor:pointer;white-space:nowrap;transition:opacity .15s;letter-spacing:.3px}
#pcta:hover{opacity:.85}
#pcls{position:absolute;top:10px;right:10px;width:30px;height:30px;background:rgba(0,0,0,.6);border:1px solid var(--bd2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mu);font-size:14px;z-index:10;transition:all .15s;backdrop-filter:blur(4px)}
#pcls:hover{color:var(--tx)}
#emp{display:none;text-align:center;padding:48px 20px;color:var(--mu)}
#emp p{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;color:var(--tx);margin-bottom:5px}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--s3);border-radius:2px}
@media(max-width:600px){
  #hdr{padding:0 12px}#hi{height:50px;gap:8px}#sw{max-width:none;flex:1}#gc{display:none}
  #fi{height:46px;padding:0 12px}#main{padding:14px 12px 40px}
  .glg{grid-template-columns:repeat(2,1fr);gap:10px}.gmd{grid-template-columns:repeat(2,1fr);gap:10px}.gsm{grid-template-columns:repeat(2,1fr);gap:8px}.tit{font-size:20px}
  #pov{padding:0;align-items:flex-end}#pop{border-radius:16px 16px 0 0;max-height:95vh;max-width:100%}
  #pt{flex-direction:column}#pcol{width:100%}#pim{aspect-ratio:16/9;object-fit:cover}#pph{aspect-ratio:16/9}
  #pmeta{padding:14px 16px 10px;gap:10px}#ptit{font-size:22px}#pbot{padding:12px 16px;flex-wrap:wrap;gap:10px}
  #pdsc{max-height:60px;font-size:12px}#pcta{width:100%;justify-content:center;text-align:center}
}
</style>
</head>
<body>
<div id="hdr"><div id="hi">
  <div id="logo">
    ${svc.logoImg
      ? `<img src="${svc.logoImg}" style="height:32px;max-width:120px;object-fit:contain" alt="${svc.name}"/>
         <div><div id="ls">${L.catalog}</div></div>`
      : `<div><div id="ln">${svc.name}</div><div id="ls">${L.catalog}</div></div>`
    }
  </div>
  <div id="sw">
    <svg class="sic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
    <input id="si" placeholder="${L.search}" oninput="run()"/>
  </div>
  <span id="gc"></span>
</div></div>
<div id="fb"><div id="fi">
  <div class="dd" id="gdd"><div class="ddbtn" id="gbtn" onclick="tdd(event)"><span id="gbl">${L.genre}</span><svg class="arr" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></div></div>
  <div class="sp"></div>
  <div class="fg"><span class="fl">${L.license}</span><div id="lcc" style="display:flex;gap:4px;flex-shrink:0"></div></div>
  <div class="sp"></div>
  <div class="fg"><span class="fl">${L.device}</span>
    <div class="chip" data-f="dev" data-v="pc" onclick="tc(this)">PC</div>
    <div class="chip" data-f="dev" data-v="mobile" onclick="tc(this)">Mobile</div>
    <div class="chip" data-f="dev" data-v="tv" onclick="tc(this)">TV</div>
  </div>
  <div class="sp"></div>
  <div class="fg"><span class="fl">${L.control}</span>
    <div class="chip" data-f="ctrl" data-v="gamepad" onclick="tc(this)">Gamepad</div>
    <div class="chip" data-f="ctrl" data-v="teclado" onclick="tc(this)">${L.keyboard}</div>
    <div class="chip" data-f="ctrl" data-v="touch" onclick="tc(this)">Touch</div>
  </div>
  <div class="sp"></div>
  <div class="fg"><span class="fl">${L.players}</span>
    <div class="chip" data-f="pl" data-v="single" onclick="tc(this)">${L.singlePlayer}</div>
    <div class="chip" data-f="pl" data-v="multi" onclick="tc(this)">${L.multiplayer}</div>
    <div class="chip" data-f="pl" data-v="online" onclick="tc(this)">Online</div>
  </div>
  <button id="clr" onclick="clearAll()"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg> ${L.clearFilters}</button>
</div></div>
<div id="genre-portal"><div id="gp"></div></div>
<div id="scroll"><div id="main">
  <div class="sec" id="snv"><div class="sh"><span class="dot">✦</span><span class="tit">${L.nuevos}</span><span class="cnt" id="cnv"></span></div><div class="glg" id="gnv"></div></div>
  <div class="sec" id="sde"><div class="sh"><span class="dot">✦</span><span class="tit">${L.featured}</span><span class="cnt" id="cde"></span></div><div class="glg" id="gde"></div></div>
  <div class="sec" id="stp"><div class="sh"><span class="dot">✦</span><span class="tit">${L.top}</span><span class="cnt" id="ctp"></span></div><div class="gmd" id="gtp"></div></div>
  <div class="sec" id="sal"><div class="sh"><span class="dot">✦</span><span class="tit" id="atit">${L.all}</span><span class="cnt" id="cal"></span></div><div class="gsm" id="gal"></div></div>
  <div id="emp"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".15" style="margin-bottom:12px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p>${L.noResults}</p><span>${L.noResultsSub}</span></div>
</div></div>
<div id="pov" onclick="if(event.target===this)cp()">
  <div id="pop">
    <button id="pcls" onclick="cp()">✕</button>
    <div id="pt">
      <div id="pcol"><img id="pim" src=""/><div id="pph"></div><div id="pnvb">${L.newBadge}</div></div>
      <div id="pmeta">
        <div><div id="ptit"></div><div id="ppub"></div></div>
        <div id="ptgs"></div>
        <div class="psec" id="sjug"><div class="plbl">${L.jugadores}</div><div class="prow" id="rjug"></div></div>
        <div class="psec" id="sdev"><div class="plbl">${L.dispositivos}</div><div class="prow" id="rdev"></div></div>
        <div class="psec" id="sctrl"><div class="plbl">${L.controles}</div><div class="prow" id="rctrl"></div></div>
      </div>
    </div>
    <div id="pbot"><div id="pdsc"></div><button id="pcta">${L.play} →</button></div>
  </div>
</div>
<script>
const SVC_LINK="${svc.link||'#'}";
const G=${gamesJSON};
const T=${JSON.stringify({genre:L.genre,clearFilters:L.clearFilters,results:L.results,all:L.all,games:L.games,singlePlayer:L.singlePlayer,multiplayer:L.multiplayer,online:L.online,newBadge:L.newBadge,freeBadge:L.freeBadge,pegi:L.pegi,free:L.free,keyboard:L.keyboard,mobile:L.mobile,jugadores:L.jugadores,dispositivos:L.dispositivos,controles:L.controles})};
function mksvg(d,s){return\`<svg width="\${s||22}" height="\${s||22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">\${d}</svg>\`;}
const D={single:'<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>',multi:'<circle cx="9" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 9-5.2M15 14a6 6 0 0 1 6 6v2"/>',online:'<circle cx="12" cy="12" r="9"/><path d="M12 3C9 7 9 17 12 21M12 3c3 4 3 14 0 18M3 12h18"/>',pc:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1"/>',tv:'<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/>',gamepad:'<rect x="2" y="7" width="20" height="12" rx="5"/><path d="M7 11v4M5 13h4M16 12h2"/>',teclado:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',touch:'<path d="M9 11V6a2 2 0 0 1 4 0v5M13 11V9a2 2 0 0 1 4 0v3l1 5H9l1-5H9a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2"/>'};
const lts=[...new Set(G.map(g=>g.lt))].sort();const lcc=document.getElementById("lcc");
lts.forEach(lt=>{const d=document.createElement("div");d.className="chip";d.textContent=lt;d.dataset.f="lic";d.dataset.v=lt;d.onclick=()=>tc(d);lcc.appendChild(d);});
const gens=[...new Set(G.map(g=>g.g))].sort();const gp=document.getElementById("gp");
gens.forEach(ge=>{const d=document.createElement("div");d.className="chip";d.textContent=ge;d.dataset.f="genre";d.dataset.v=ge.toLowerCase();d.onclick=()=>{tc(d);ugb();};gp.appendChild(d);});
let ddOpen=false;
function tdd(e){e.stopPropagation();ddOpen=!ddOpen;const btn=document.getElementById("gbtn"),portal=document.getElementById("genre-portal");btn.classList.toggle("open",ddOpen);if(ddOpen){const r=btn.getBoundingClientRect();portal.style.top=(r.bottom+4)+"px";portal.style.left=r.left+"px";portal.classList.add("open");}else portal.classList.remove("open");}
document.addEventListener("click",e=>{if(!document.getElementById("gdd").contains(e.target)&&!document.getElementById("genre-portal").contains(e.target)){ddOpen=false;document.getElementById("gbtn").classList.remove("open");document.getElementById("genre-portal").classList.remove("open");}});
function ugb(){const a=[...gp.querySelectorAll(".chip.on")];const btn=document.getElementById("gbtn"),lbl=document.getElementById("gbl");if(!a.length){lbl.textContent=T.genre;btn.classList.remove("has");}else{lbl.textContent=a.length===1?a[0].textContent:\`\${T.genre} (\${a.length})\`;btn.classList.add("has");}}
let AF={genre:[],lic:[],dev:[],ctrl:[],pl:[]};
function tc(el){const f=el.dataset.f,v=el.dataset.v,a=AF[f],i=a.indexOf(v);if(i>=0){a.splice(i,1);el.classList.remove("on");}else{a.push(v);el.classList.add("on");}ucl();run();}
function ucl(){const h=document.getElementById("si").value||Object.values(AF).some(a=>a.length);document.getElementById("clr").classList.toggle("show",!!h);}
function clearAll(){document.getElementById("si").value="";Object.keys(AF).forEach(k=>AF[k]=[]);document.querySelectorAll(".chip.on").forEach(c=>c.classList.remove("on"));document.getElementById("gbtn").classList.remove("has");document.getElementById("gbl").textContent=T.genre;ucl();run();}
function match(g){const q=document.getElementById("si").value.toLowerCase();if(q&&!g.t.toLowerCase().includes(q)&&!g.p.toLowerCase().includes(q)&&!g.g.toLowerCase().includes(q))return false;if(AF.genre.length&&!AF.genre.includes(g.g.toLowerCase()))return false;if(AF.lic.length&&!AF.lic.includes(g.lt))return false;if(AF.dev.length&&!AF.dev.every(d=>(d==="pc"&&g.pc)||(d==="mobile"&&g.mob)||(d==="tv"&&g.tv)))return false;if(AF.ctrl.length&&!AF.ctrl.every(c=>(c==="gamepad"&&g.gp)||(c==="teclado"&&g.tk)||(c==="touch"&&g.ts)))return false;if(AF.pl.length&&!AF.pl.every(p=>(p==="single"&&g.sp)||(p==="multi"&&g.mp)||(p==="online"&&g.mo)))return false;return true;}
function ib(show,svg,lbl){if(!show)return"";return\`<div class="ib">\${svg}<span>\${lbl}</span></div>\`;}
function mkcard(g){const d=document.createElement("div");d.className="card";const img=g.i?\`<img class="ci" src="\${g.i}" loading="lazy" onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='flex')"/><div class="cph" style="display:none">\${g.t[0]}</div>\`:\`<div class="cph">\${g.t[0]}</div>\`;d.innerHTML=\`<div class="ciw">\${img}<div class="cov"></div>\${g.nv?\`<div class="cnv">\${T.newBadge}</div>\`:""}<div class="cpe">\${g.pe}+</div></div><div class="cb"><div class="ct">\${g.t}</div><div class="cp">\${g.p}</div><div class="ctgs"><span class="ctg g">\${g.g}</span>\${g.free?\`<span class="ctg f">\${T.freeBadge}</span>\`:""}<span class="ctg">\${g.lt}</span></div><div class="cic">\${ib(g.sp,mksvg(D.single,13),"1P")}\${ib(g.mp,mksvg(D.multi,13),T.multiplayer)}\${ib(g.mo,mksvg(D.online,13),T.online)}\${ib(g.pc,mksvg(D.pc,13),"PC")}\${ib(g.mob,mksvg(D.mobile,13),T.mobile)}\${ib(g.tv,mksvg(D.tv,13),"TV")}\${ib(g.gp,mksvg(D.gamepad,13),"Pad")}\${ib(g.ts,mksvg(D.touch,13),"Touch")}</div></div>\`;d.onclick=()=>op(g);return d;}
function rend(gid,sid,games,cid){const gr=document.getElementById(gid),sec=document.getElementById(sid);gr.innerHTML="";sec.style.display=games.length?"block":"none";document.getElementById(cid).textContent=games.length?\`\${games.length} \${T.games}\`:"";games.forEach(g=>gr.appendChild(mkcard(g)));}
function run(){ucl();const filt=G.filter(match);const isF=document.getElementById("si").value||Object.values(AF).some(a=>a.length);rend("gnv","snv",isF?[]:filt.filter(g=>g.nv),"cnv");rend("gde","sde",isF?[]:filt.filter(g=>g.de),"cde");rend("gtp","stp",isF?[]:filt.filter(g=>g.mj),"ctp");rend("gal","sal",filt,"cal");document.getElementById("atit").textContent=isF?T.results:T.all;document.getElementById("gc").textContent=\`\${filt.length} \${T.games}\`;document.getElementById("emp").style.display=filt.length===0?"block":"none";}
function picoRow(rowId,secId,items){const html=items.filter(x=>x.show).map(x=>\`<div class="pico">\${mksvg(D[x.key])}<span>\${x.label}</span></div>\`).join("");document.getElementById(rowId).innerHTML=html;document.getElementById(secId).style.display=html?"flex":"none";}
function op(g){const im=document.getElementById("pim"),ph=document.getElementById("pph");if(g.i){im.src=g.i;im.style.display="block";ph.style.display="none";}else{im.style.display="none";ph.style.display="flex";ph.textContent=g.t[0];}document.getElementById("pnvb").style.display=g.nv?"block":"none";document.getElementById("ptit").textContent=g.t;document.getElementById("ppub").textContent=g.p;document.getElementById("ptgs").innerHTML=\`<span class="ptag genre">\${g.g}</span><span class="ptag pegi">\${T.pegi} \${g.pe}+</span><span class="ptag lic">\${g.l}</span>\${g.free?\`<span class="ptag free">\${T.free}</span>\`:""}\`;picoRow("rjug","sjug",[{show:g.sp,key:"single",label:T.singlePlayer},{show:g.mp,key:"multi",label:T.multiplayer},{show:g.mo,key:"online",label:T.online}]);picoRow("rdev","sdev",[{show:g.pc,key:"pc",label:"PC"},{show:g.mob,key:"mobile",label:T.mobile},{show:g.tv,key:"tv",label:"TV"}]);picoRow("rctrl","sctrl",[{show:g.gp,key:"gamepad",label:"Gamepad"},{show:g.tk,key:"teclado",label:T.keyboard},{show:g.ts,key:"touch",label:"Touch"}]);document.getElementById("pdsc").textContent=g.d;document.getElementById("pcta").onclick=()=>window.open(SVC_LINK,"_blank");document.getElementById("pov").classList.add("open");}
function cp(){document.getElementById("pov").classList.remove("open");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")cp();});
run();
<\/script>
</body>
</html>`;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CatalogAgent() {
  const [messages, setMessages]       = useState([{ role:"agent", type:"help" }]);
  const [input, setInput]             = useState("");
  const [services, setServices]       = useState(DEFAULT_SERVICES);
  const [loading, setLoading]         = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [gasConnected, setGasConnected] = useState(null);
  const [isMobile, setIsMobile]       = useState(window.innerWidth < 600);

  const [sheetUrl, setSheetUrl]       = useState("");
  const [repoOwner, setRepoOwner]     = useState("");
  const [repoName, setRepoName]       = useState("");
  const [repoToken, setRepoToken]     = useState("");

  const [showForm, setShowForm]       = useState(null);
  const [editKey, setEditKey]         = useState(null);
  const [form, setForm]               = useState({ name:"", alias:"", lang:"ES", brandColor:"#7c3aed", bgColor:"#0a0a0f", borderColor:"#333355", textColor:"", secondaryColor:"#ffffff", logoImg:"", coverImg:"", backImg:"", link:"" });
  const [sheetForm, setSheetForm]     = useState("");
  const [repoForm, setRepoForm]       = useState({ owner:"", repo:"", token:"" });

  const [lastDeployUrl, setLastDeployUrl] = useState(null);
  const [pdfHTML, setPdfHTML]         = useState(null);

  const bottomRef = useRef(null);
  const C = "#1800ef";

  useEffect(() => {
    (async () => {
      const remoteData = await stGetRemote();
      if (remoteData) {
        setGasConnected(true);
        if (remoteData.services) setServices(remoteData.services);
        const cfg = remoteData.config || {};
        if (cfg.sheetUrl)  setSheetUrl(cfg.sheetUrl);
        if (cfg.repoOwner) setRepoOwner(cfg.repoOwner);
        if (cfg.repoName)  setRepoName(cfg.repoName);
        if (cfg.repoToken) setRepoToken(cfg.repoToken);
      } else {
        setGasConnected(false);
      }
      setServicesLoading(false);
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, showForm, lastDeployUrl, pdfHTML]);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function saveServices(s) { setServices(s); await stSet("svcs9", s); }
  function findSvc(q) { const t = q.toLowerCase(); return Object.entries(services).find(([,s]) => s.alias.some(a => t.includes(a))) || null; }

  // ── SEND ────────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!input.trim() || loading) return;
    const txt = input.trim();
    setInput(""); setLoading(true);
    setMessages(m => [...m, { role:"user", text:txt }]);
    const cmd = parseCmd(txt);
    await new Promise(r => setTimeout(r, 280));

    if (cmd.type === "help") {
      setMessages(m => [...m, { role:"agent", type:"help" }]);
    } else if (cmd.type === "list") {
      setMessages(m => [...m, { role:"agent", type:"list", data:services }]);
    } else if (cmd.type === "add") {
      setForm({ name:"", alias:"", lang:"ES", brandColor:"#7c3aed", bgColor:"#0a0a0f", borderColor:"#333355", textColor:"", secondaryColor:"#ffffff", logoImg:"", coverImg:"", backImg:"", link:"" });
      setEditKey(null); setShowForm("service");
      setMessages(m => [...m, { role:"agent", type:"form_open" }]);
    } else if (cmd.type === "modify_games") {
      if (!sheetUrl) {
        setMessages(m => [...m, { role:"agent", type:"no_sheet" }]);
      } else {
        const sheetId = sheetUrl.match(/\/d\/([\w-]+)/)?.[1];
        const editUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : sheetUrl;
        setMessages(m => [...m, { role:"agent", type:"sheet_link", data:editUrl }]);
      }
    } else if (cmd.type === "config_sheet") {
      setSheetForm(sheetUrl); setShowForm("sheet");
      setMessages(m => [...m, { role:"agent", type:"sheet_form" }]);
    } else if (cmd.type === "config_repo") {
      setRepoForm({ owner:repoOwner, repo:repoName, token:repoToken }); setShowForm("repo");
      setMessages(m => [...m, { role:"agent", type:"repo_form" }]);
    } else if (cmd.type === "edit") {
      const e = findSvc(cmd.svc || "");
      if (e) { setForm({ bgColor:"#0a0a0f", borderColor:"#333355", textColor:"", ...e[1], alias:e[1].alias.join(", ") }); setEditKey(e[0]); setShowForm("service"); setMessages(m => [...m, { role:"agent", type:"form_edit", data:e[1].name }]); }
      else setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]);
    } else if (cmd.type === "delete") {
      const e = Object.entries(services).find(([,s]) => s.alias.some(a => (cmd.svc || "").toLowerCase().includes(a)));
      if (e) { const n = {...services}; delete n[e[0]]; await saveServices(n); setMessages(m => [...m, { role:"agent", type:"deleted", data:e[1].name }]); }
      else setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]);

    // ── CREAR CATÁLOGO → PDF ─────────────────────────────────────────────────
    } else if (cmd.type === "create") {
      const e = findSvc(cmd.svc);
      if (!e) { setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]); }
      else if (!sheetUrl) { setMessages(m => [...m, { role:"agent", type:"no_sheet" }]); }
      else {
        const lang = cmd.lang || e[1].lang || "ES";
        setPdfHTML(null);
        setMessages(m => [...m, { role:"agent", type:"generating_pdf", data:e[1].name }]);
        setMessages(m => [...m, { role:"agent", type:"step", data:"Leyendo datos del Google Sheet..." }]);
        let games = await fetchSheetGames(sheetUrl);
        const totalRead = games ? games.length : 0;
        if (games) games = games.filter(g => gameInService(g, e[1]));
        if (!games || games.length === 0) {
          setMessages(m => [...m, { role:"agent", type:"error", data:`No hay juegos asignados a ${e[1].name} en el Sheet (columna "servicio"). Leídos: ${totalRead}.` }]);
        } else {
          setMessages(m => [...m, { role:"agent", type:"step", data:`Leídos del Sheet: ${totalRead} · asignados a ${e[1].name}: ${games.length}` }]);
          if (lang === "PT") {
            setMessages(m => [...m, { role:"agent", type:"step", data:"Traduciendo textos del sheet al portugués..." }]);
            games = await translateGames(games, "PT");
          }
          setMessages(m => [...m, { role:"agent", type:"step", data:`Generando PDF para ${e[1].name} — ${games.length} juegos...` }]);
          const html = generatePDFHTML(e[1], games, lang);
          setPdfHTML({ html, name: e[1].name, lang, n: games.length });
          setMessages(m => [...m, { role:"agent", type:"pdf_ready", data:{ svc:e[1].name, lang, n:games.length } }]);
        }
      }

    // ── ACTUALIZAR CATÁLOGO → WEB GITHUB ────────────────────────────────────
    } else if (cmd.type === "update") {
      const e = findSvc(cmd.svc);
      if (!e) { setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]); }
      else if (!sheetUrl) { setMessages(m => [...m, { role:"agent", type:"no_sheet" }]); }
      else if (!repoOwner || !repoName || !repoToken) { setMessages(m => [...m, { role:"agent", type:"no_repo" }]); }
      else {
        setLastDeployUrl(null);
        setMessages(m => [...m, { role:"agent", type:"generating", data:e[1].name }]);
        await doDeploy(e[1], cmd.lang || e[1].lang || "ES");
      }
    } else {
      setMessages(m => [...m, { role:"agent", type:"unknown" }]);
    }
    setLoading(false);
  }

  // ── DEPLOY WEB ──────────────────────────────────────────────────────────────
  async function doDeploy(svc, lang) {
    try {
      setMessages(m => [...m, { role:"agent", type:"step", data:"Leyendo datos del Google Sheet..." }]);
      let games = await fetchSheetGames(sheetUrl);
      if (games) games = games.filter(g => gameInService(g, svc));
      if (!games || games.length === 0) {
        setMessages(m => [...m, { role:"agent", type:"error", data:`No hay juegos asignados a ${svc.name} en el Sheet (columna "servicio"). Verificá la URL y que el Sheet sea público.` }]);
        return;
      }
      if (lang === "PT") {
        setMessages(m => [...m, { role:"agent", type:"step", data:"Traduciendo textos del sheet al portugués..." }]);
        games = await translateGames(games, "PT");
      }
      setMessages(m => [...m, { role:"agent", type:"step", data:`Generando web para ${svc.name} — ${games.length} juegos...` }]);
      const html = generateWebHTML(svc, games, lang);
      const folderKey = svc.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const filePath  = `${folderKey}/index.html`;
      setMessages(m => [...m, { role:"agent", type:"step", data:`Subiendo a GitHub: ${repoOwner}/${repoName}/${filePath}...` }]);
      const sha = await githubGetFileSha(repoToken, repoOwner, repoName, filePath);
      await githubPutFile(repoToken, repoOwner, repoName, filePath, html, `Update ${svc.name} catalog — ${lang} — ${new Date().toISOString().slice(0,10)}`, sha);
      const pageUrl = `https://${repoOwner}.github.io/${repoName}/${folderKey}/`;
      setLastDeployUrl(pageUrl);
      setMessages(m => [...m, { role:"agent", type:"deployed", data:{ svc:svc.name, lang, n:games.length, url:pageUrl } }]);
    } catch (err) {
      setMessages(m => [...m, { role:"agent", type:"error", data:`Error al subir: ${err.message}` }]);
    }
  }

  // ── PDF DOWNLOAD ────────────────────────────────────────────────────────────
  function downloadPDF() {
    if (!pdfHTML) return;
    const blob = new Blob([pdfHTML.html], { type:"text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `catalogo-${pdfHTML.name.toLowerCase().replace(/\s+/g,"-")}.html`;
    a.click(); URL.revokeObjectURL(url);
  }

  function printPDF() {
    if (!pdfHTML) return;
    const win = window.open("", "_blank");
    win.document.write(pdfHTML.html);
    win.document.close();
    setTimeout(() => { win.print(); }, 1000);
  }

  // ── SAVE FORMS ──────────────────────────────────────────────────────────────
  async function saveService() {
    if (!form.name.trim()) return;
    const key = editKey || form.name.toLowerCase().replace(/\s+/g, "_");
    const aliases = form.alias ? form.alias.split(",").map(a => a.trim().toLowerCase()).filter(Boolean) : [form.name.toLowerCase()];
    const updatedServices = { ...services, [key]: { ...form, alias:aliases, bgColor:form.bgColor||"#0a0a0f", borderColor:form.borderColor||"#333355" } };
    setServices(updatedServices);
    await stSet("svcs9", updatedServices);
    const ok = await stSetRemote("saveServices", updatedServices);
    if (!ok) setGasConnected(false); else setGasConnected(true);
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type: ok ? "saved" : "saved_local", data:form.name }]);
  }

  async function saveSheetConfig() {
    const url = sheetForm.trim();
    setSheetUrl(url); await stSet("sheetUrl", url);
    const ok = await stSetRemote("saveConfig", { sheetUrl:url, repoOwner, repoName, repoToken });
    if (!ok) setGasConnected(false); else setGasConnected(true);
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type: ok ? "sheet_saved" : "sheet_saved_local", data:url }]);
  }

  async function saveRepoConfig() {
    const { owner, repo, token } = repoForm;
    setRepoOwner(owner); setRepoName(repo); setRepoToken(token);
    await stSet("repoOwner", owner); await stSet("repoName", repo); await stSet("repoToken", token);
    const ok = await stSetRemote("saveConfig", { sheetUrl, repoOwner:owner, repoName:repo, repoToken:token });
    if (!ok) setGasConnected(false); else setGasConnected(true);
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type: ok ? "repo_saved" : "repo_saved_local", data:`${owner}/${repo}` }]);
  }

  function handleImgUpload(field, e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, [field]: ev.target.result }));
    reader.readAsDataURL(file);
  }

  // ── STYLES ──────────────────────────────────────────────────────────────────
  const btnP  = { background:C, color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:600, cursor:"pointer" };
  const btnS  = { background:"#f0f0f0", color:"#555", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, cursor:"pointer" };
  const fldSt = { width:"100%", padding:"8px 10px", border:"1px solid #ddd", borderRadius:6, fontSize:13, outline:"none", fontFamily:"inherit" };
  const lblSt = { fontSize:11, color:"#666", display:"block", marginBottom:4, marginTop:10 };
  const secLbl= { fontSize:10, fontWeight:700, letterSpacing:"1.5px", color:C, textTransform:"uppercase", margin:"16px 0 6px", borderBottom:"1px solid #ece8ff", paddingBottom:4, display:"block" };

  function pill(txt) { return <span key={txt} style={{ background:C, color:"#fff", borderRadius:4, padding:"1px 8px", fontSize:11, fontFamily:"monospace", whiteSpace:"nowrap" }}>{txt}</span>; }

  function AgBubble({ children }) {
    return (
      <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", background:C, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700, flexShrink:0 }}>A</div>
        <div style={{ background:"#f4f0ff", borderRadius:"4px 16px 16px 16px", padding:"12px 15px", maxWidth: isMobile ? "92%" : "86%", fontSize:13, color:"#1a1a2e", lineHeight:1.65 }}>{children}</div>
      </div>
    );
  }

  // ── RENDER MESSAGES ─────────────────────────────────────────────────────────
  function renderMsg(msg, i) {
    if (msg.role === "user") return (
      <div key={i} style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <div style={{ background:C, color:"#fff", borderRadius:"16px 16px 4px 16px", padding:"10px 15px", maxWidth: isMobile ? "85%" : "70%", fontSize:13, lineHeight:1.5 }}>{msg.text}</div>
      </div>
    );
    const { type, data } = msg;

    if (type === "help") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>AWG Catalog Maker</div>
        {COMMANDS.map(([cmd, desc]) => (
          <div key={cmd} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:6, flexWrap:"wrap" }}>
            {pill(cmd)}<span style={{ color:"#555", fontSize:12, paddingTop:2 }}>{desc}</span>
          </div>
        ))}
        <div style={{ marginTop:10, fontSize:11, background:"#f0ebff", padding:"8px 10px", borderRadius:6, color:C }}>
          <strong>Crear catálogo</strong> → genera PDF descargable · <strong>Actualizar catálogo</strong> → sube la web a GitHub Pages
        </div>
      </AgBubble>
    );

    if (type === "list") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Servicios ({Object.keys(data).length})</div>
        {Object.entries(data).map(([k,s]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:s.brandColor, flexShrink:0 }}/>
            {s.logoImg ? <img src={s.logoImg} style={{ height:16, maxWidth:40, objectFit:"contain" }}/> : <span style={{ fontWeight:600 }}>{s.name}</span>}
            <span style={{ fontSize:11, color:"#888" }}>{s.alias.join(", ")}</span>
            <span style={{ fontSize:10, background:"#f0f0f0", padding:"1px 6px", borderRadius:3, marginLeft:"auto" }}>{s.lang}</span>
          </div>
        ))}
      </AgBubble>
    );

    if (type === "form_open")   return <AgBubble key={i}>Abriendo formulario de nuevo servicio...</AgBubble>;
    if (type === "form_edit")   return <AgBubble key={i}>Editando <strong>{data}</strong>...</AgBubble>;
    if (type === "sheet_form")  return <AgBubble key={i}>Abriendo configuración del Google Sheet...</AgBubble>;
    if (type === "repo_form")   return <AgBubble key={i}>Abriendo configuración del repositorio de GitHub...</AgBubble>;
    if (type === "saved")       return <AgBubble key={i}>Servicio <strong>{data}</strong> guardado en Google Sheets.</AgBubble>;
    if (type === "saved_local") return <AgBubble key={i}><span style={{color:"#c00"}}>⚠️ Guardado solo localmente — error al conectar con Google Sheets.</span></AgBubble>;
    if (type === "deleted")     return <AgBubble key={i}>Servicio <strong>{data}</strong> eliminado.</AgBubble>;
    if (type === "sheet_link")  return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, marginBottom:6 }}>Planilla de juegos</div>
        <a href={data} target="_blank" rel="noopener noreferrer" style={{ color:C, fontSize:12, wordBreak:"break-all" }}>{data}</a>
      </AgBubble>
    );
    if (type === "sheet_saved")  return <AgBubble key={i}><div>✅ Planilla configurada.</div><div style={{ fontSize:11, color:"#888", marginTop:4, wordBreak:"break-all" }}>{data}</div></AgBubble>;
    if (type === "sheet_saved_local") return <AgBubble key={i}><span style={{color:"#c00"}}>⚠️ Planilla guardada solo localmente.</span></AgBubble>;
    if (type === "repo_saved")   return <AgBubble key={i}><div>✅ Repositorio configurado: <strong>{data}</strong></div></AgBubble>;
    if (type === "repo_saved_local") return <AgBubble key={i}><span style={{color:"#c00"}}>⚠️ Repositorio guardado solo localmente.</span></AgBubble>;

    if (type === "generating_pdf") return <AgBubble key={i}>Generando catálogo PDF de <strong>{data}</strong>...</AgBubble>;
    if (type === "generating")  return <AgBubble key={i}>Subiendo web de <strong>{data}</strong> a GitHub...</AgBubble>;
    if (type === "step")        return <AgBubble key={i}><span style={{ color:"#888" }}>→ {data}</span></AgBubble>;

    if (type === "pdf_ready") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, marginBottom:4 }}>📄 PDF listo</div>
        <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>{data.svc} · {data.lang} · {data.n} juegos</div>
        <div style={{ fontSize:11, color:"#888" }}>Usá los botones de abajo para descargar el HTML o abrirlo directamente para imprimir como PDF (Ctrl+P → Guardar como PDF).</div>
      </AgBubble>
    );

    if (type === "deployed") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, marginBottom:6 }}>✅ Web publicada</div>
        <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>{data.svc} · {data.lang} · {data.n} juegos</div>
        <div style={{ fontSize:11, color:"#888", marginBottom:6, wordBreak:"break-all" }}>URL: <a href={data.url} target="_blank" style={{ color:C }}>{data.url}</a></div>
        <div style={{ fontSize:11, color:"#aaa" }}>GitHub Pages puede tardar 1–2 min en reflejar los cambios.</div>
      </AgBubble>
    );

    if (type === "no_sheet") return <AgBubble key={i}>No hay planilla configurada. Usá {pill("Configurar planilla")} primero.</AgBubble>;
    if (type === "no_repo")  return <AgBubble key={i}>No hay repositorio configurado. Usá {pill("Configurar repositorio")} primero.</AgBubble>;
    if (type === "error")    return <AgBubble key={i}><span style={{ color:"#c00" }}>❌ {data}</span></AgBubble>;
    if (type === "not_found") return <AgBubble key={i}>No encontré <strong>"{data}"</strong>. Usá {pill("Listar servicios")} para ver los disponibles.</AgBubble>;
    if (type === "unknown")  return <AgBubble key={i}>No entendí ese comando. Escribí <strong>Ayuda</strong> para ver los disponibles.</AgBubble>;
    return null;
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#f9f7ff", fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>

      {/* Header */}
      <div style={{ background:C, color:"#fff", padding: isMobile ? "10px 14px" : "11px 18px", display:"flex", alignItems:"center", gap:12, flexShrink:0, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>🎮</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>AWG Catalog Maker</div>
            <div style={{ fontSize:11, opacity:.7 }}>Cloud Gaming · PDF + GitHub Deploy</div>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap" }}>
          {[
            { label:"Sheet", ok:!!sheetUrl },
            { label:"GitHub", ok:!!(repoOwner && repoName && repoToken) },
            { label:"GAS", ok:gasConnected === true, warn: gasConnected === false },
          ].map(({ label, ok, warn }) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px", background: ok ? "rgba(134,239,172,.2)" : warn ? "rgba(252,165,165,.15)" : "rgba(255,255,255,.1)", border:`1px solid ${ok ? "rgba(134,239,172,.3)" : warn ? "rgba(252,165,165,.25)" : "rgba(255,255,255,.2)"}`, borderRadius:100, fontSize:11, color: ok ? "#86efac" : warn ? "#fca5a5" : "rgba(255,255,255,.5)", whiteSpace:"nowrap" }}>
              {ok ? "✓" : warn ? "✗" : "○"} {label}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "12px 14px" : "16px 20px" }}>
        {servicesLoading && (
          <div style={{ textAlign:"center", padding:"20px", color:"#888", fontSize:13 }}>Cargando configuración...</div>
        )}

        {messages.map((m, i) => renderMsg(m, i))}

        {loading && (
          <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700 }}>A</div>
            <div style={{ background:"#f4f0ff", borderRadius:"4px 16px 16px 16px", padding:"12px 15px", fontSize:18, letterSpacing:5, color:C }}>•••</div>
          </div>
        )}

        {/* PDF Preview + Download buttons */}
        {pdfHTML && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontWeight:600, fontSize:13, color:"#333" }}>Vista previa del catálogo PDF</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={printPDF} style={{ ...btnP, display:"flex", alignItems:"center", gap:6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Imprimir / Guardar PDF
                </button>
                <button onClick={downloadPDF} style={{ ...btnS, display:"flex", alignItems:"center", gap:6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar HTML
                </button>
                <button onClick={() => setPdfHTML(null)} style={btnS}>Cerrar</button>
              </div>
            </div>
            <div style={{ fontSize:11, color:"#888", marginBottom:8 }}>
              Para PDF: hacé clic en "Imprimir / Guardar PDF" → en el diálogo elegí "Guardar como PDF" → desactivá encabezados y pies de página.
            </div>
            <iframe srcDoc={pdfHTML.html} style={{ width:"100%", height:560, border:"1px solid #ddd", borderRadius:8 }} title="PDF Preview"/>
          </div>
        )}

        {/* Web deploy URL button */}
        {lastDeployUrl && (
          <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
            <a href={lastDeployUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnP, textDecoration:"none", display:"flex", alignItems:"center", gap:8, padding:"10px 24px", fontSize:14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Ver catálogo en línea
            </a>
          </div>
        )}

        {/* Formulario Servicio */}
        {showForm === "service" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16, maxHeight:"70vh", overflowY:"auto" }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>{editKey ? "Editar servicio" : "Nuevo servicio"}</div>
            <span style={secLbl}>Identidad</span>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"0 14px" }}>
              <div><label style={lblSt}>Nombre *</label><input style={fldSt} value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} placeholder="Xbox Cloud Gaming"/></div>
              <div><label style={lblSt}>Alias (coma)</label><input style={fldSt} value={form.alias} onChange={e => setForm(f => ({...f, alias:e.target.value}))} placeholder="xbox, xcloud"/></div>
              <div>
                <label style={lblSt}>Idioma</label>
                <select style={fldSt} value={form.lang} onChange={e => setForm(f => ({...f, lang:e.target.value}))}>
                  <option value="ES">Español</option><option value="EN">English</option><option value="PT">Português</option>
                </select>
              </div>
              <div><label style={lblSt}>Link "Jugar ahora" (URL del servicio)</label><input style={fldSt} type="url" value={form.link} onChange={e => setForm(f => ({...f, link:e.target.value}))} placeholder="https://www.xbox.com/play"/></div>
            </div>
            <span style={secLbl}>Branding</span>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"0 14px" }}>
              {[
                ["Color principal (accent, botones, badges)", "brandColor",  "#7c3aed"],
                ["Color de fondo de la web",                  "bgColor",     "#0a0a0f"],
                ["Color terciario (bordes de cards y líneas)","borderColor", "#333355"],
                ["Color secundario (portada/contraportada PDF)", "secondaryColor","#ffffff"],
              ].map(([lbl, fld, def]) => (
                <div key={fld}><label style={lblSt}>{lbl}</label>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input type="color" value={form[fld] || def} onChange={e => setForm(f => ({...f, [fld]:e.target.value}))} style={{ width:36, height:36, border:"1px solid #ddd", borderRadius:6, cursor:"pointer", padding:2 }}/>
                    <span style={{ fontSize:12, color:"#666", fontFamily:"monospace" }}>{form[fld] || def}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10 }}>
              <label style={lblSt}>Color de tipografía (opcional — se auto-detecta según el fondo)</label>
              <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:4 }}>
                <input type="color" value={form.textColor || "#f0f0f8"} onChange={e => setForm(f => ({...f, textColor:e.target.value}))} style={{ width:36, height:36, border:"1px solid #ddd", borderRadius:6, cursor:"pointer", padding:2 }}/>
                <span style={{ fontSize:12, color:"#666", fontFamily:"monospace" }}>{form.textColor || "auto"}</span>
                {form.textColor && (
                  <button onClick={() => setForm(f => ({...f, textColor:""}))} style={{ fontSize:11, color:"#888", background:"#f0f0f0", border:"none", borderRadius:5, padding:"3px 8px", cursor:"pointer" }}>
                    Restablecer auto
                  </button>
                )}
              </div>
              <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>Dejalo en "auto" para que se calcule automáticamente según la luminancia del fondo.</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"0 14px" }}>
              {[["Logo del servicio (web) — PNG transparente","logoImg"],["Portada del PDF","coverImg"]].map(([lbl,fld]) => (
                <div key={fld}><label style={lblSt}>{lbl}</label>
                  <input type="file" accept="image/*" onChange={e => handleImgUpload(fld, e)} style={{ fontSize:12, width:"100%" }}/>
                  {form[fld] && <img src={form[fld]} style={{ width:80, height:50, objectFit:"contain", borderRadius:4, marginTop:5, border:"1px solid #eee", background:"#f5f5f5", padding:2 }}/>}
                </div>
              ))}
            </div>
            <div style={{ maxWidth: isMobile ? "100%" : "50%", paddingRight: isMobile ? 0 : 7 }}>
              <label style={lblSt}>Contraportada del PDF</label>
              <input type="file" accept="image/*" onChange={e => handleImgUpload("backImg", e)} style={{ fontSize:12, width:"100%" }}/>
              {form.backImg && <img src={form.backImg} style={{ width:80, height:50, objectFit:"cover", borderRadius:4, marginTop:5, border:"1px solid #eee" }}/>}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              <button onClick={saveService} style={btnP} disabled={!form.name.trim()}>Guardar servicio</button>
              <button onClick={() => setShowForm(null)} style={btnS}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulario Planilla */}
        {showForm === "sheet" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>Configurar Google Sheet</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              El Sheet debe ser <strong>público</strong> (Compartir → Cualquier persona con el enlace → Lector).<br/>
              Columnas: <code>Juego, Publisher, Genero, PEGI, Jugadores, Dispositivos, Controles, Licencia, Portada, Descripción, Estado</code>
            </div>
            <label style={lblSt}>URL del Google Sheet</label>
            <input style={fldSt} type="url" value={sheetForm} onChange={e => setSheetForm(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit"/>
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={saveSheetConfig} style={btnP} disabled={!sheetForm.trim()}>Guardar planilla</button>
              <button onClick={() => setShowForm(null)} style={btnS}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulario Repositorio */}
        {showForm === "repo" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>Configurar repositorio GitHub</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              El repo debe tener <strong>GitHub Pages activado</strong> (Settings → Pages → Branch: main).<br/>
              El token necesita permisos de <strong>Contents: Read &amp; Write</strong>.
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"0 14px" }}>
              <div><label style={lblSt}>Usuario u organización de GitHub</label><input style={fldSt} value={repoForm.owner} onChange={e => setRepoForm(f => ({...f, owner:e.target.value}))} placeholder="mi-usuario"/></div>
              <div><label style={lblSt}>Nombre del repositorio</label><input style={fldSt} value={repoForm.repo} onChange={e => setRepoForm(f => ({...f, repo:e.target.value}))} placeholder="catalogos-gaming"/></div>
            </div>
            <label style={lblSt}>Personal Access Token (GitHub)</label>
            <input style={fldSt} type="password" value={repoForm.token} onChange={e => setRepoForm(f => ({...f, token:e.target.value}))} placeholder="github_pat_..."/>
            {repoForm.owner && repoForm.repo && (
              <div style={{ marginTop:10, fontSize:11, color:"#666", background:"#f9f9f9", padding:"8px 10px", borderRadius:6 }}>
                URL: <code>https://{repoForm.owner}.github.io/{repoForm.repo}/[servicio]/</code>
              </div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={saveRepoConfig} style={btnP} disabled={!repoForm.owner.trim() || !repoForm.repo.trim() || !repoForm.token.trim()}>Guardar repositorio</button>
              <button onClick={() => setShowForm(null)} style={btnS}>Cancelar</button>
            </div>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{ padding: isMobile ? "8px 12px 12px" : "10px 18px 14px", background:"#fff", borderTop:"1px solid #ece8ff", flexShrink:0 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={'"Crear catálogo [Servicio]" · "Actualizar catálogo [Servicio] " · "Ayuda"'}
            style={{ flex:1, padding:"10px 14px", border:"1.5px solid #ddd", borderRadius:10, fontSize:13, outline:"none", fontFamily:"inherit" }}
          />
          <button onClick={handleSend} disabled={loading} style={{ ...btnP, padding:"0 18px", fontSize:16, opacity:loading ? .5 : 1 }}>→</button>
        </div>
      </div>
    </div>
  );
}
