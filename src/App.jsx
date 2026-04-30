import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS = {
  ES: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  EN: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  PT: ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"],
};
const LABELS = {
  ES: { catalog:"CATÁLOGO DE VIDEOJUEGOS", featured:"Destacados", top:"Más Jugados", all:"Juegos", nuevos:"Novedades", single:"1 Jugador", multi:"Multi", online:"Online", note:"Juegos sujetos a cambios sin previo aviso", play:"Jugar ahora" },
  EN: { catalog:"VIDEO GAME CATALOG", featured:"Featured", top:"Most Played", all:"All Games", nuevos:"New", single:"Single", multi:"Multi", online:"Online", note:"Games subject to change without notice", play:"Play now" },
  PT: { catalog:"CATÁLOGO DE JOGOS", featured:"Destaques", top:"Mais Jogados", all:"Jogos", nuevos:"Novidades", single:"1 Jogador", multi:"Multi", online:"Online", note:"Jogos sujeitos a alterações", play:"Jogar agora" },
};

const COMMANDS = [
  ["Crear catálogo [Servicio] [Idioma]", "Genera la web y la sube al repositorio — ES / EN / PT"],
  ["Listar servicios",                   "Ver todos los servicios cargados"],
  ["Nuevo servicio",                     "Agregar un nuevo servicio con logo y branding"],
  ["Editar servicio [Nombre]",           "Editar un servicio existente"],
  ["Eliminar servicio [Nombre]",         "Eliminar un servicio del sistema"],
  ["Configurar planilla",                "Configurar la URL del Google Sheet con los juegos"],
  ["Configurar repositorio",             "Configurar el repositorio de GitHub para el deploy"],
  ["Ayuda",                              "Mostrar este menú"],
];

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbxjplCKK1gokN5IrnOqtJ1qExElP0k6cWGMZB-NmVuHSTbEgk7dJf3t_RycfKL_u2f6bg/exec";

async function stGet(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function stSet(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} }

async function stGetRemote() {
  try {
    const res = await fetch(`${GAS_URL}?action=getAll`);
    return await res.json();
  } catch (e) {
    console.error("Error cargando datos remotos", e);
    return null;
  }
}

async function stSetRemote(action, data) {
  try {
    await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data })
    });
  } catch (e) {
    console.error("Error guardando datos", e);
  }

  
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
  cols.push(cur);
  return cols;
}
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = parseCSVRow(lines[0]).map(h =>
    h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  return lines.slice(1).map(line => {
    const cols = parseCSVRow(line);
    const o = {};
    headers.forEach((h, i) => { o[h] = (cols[i] || "").trim(); });
    return o;
  }).filter(r => r.juego && r.juego.length > 0);
}
function mapRow(o) {
  const jug  = (o.jugadores || "").toLowerCase();
  const dev  = (o.dispositivos || "").toLowerCase();
  const ctrl = (o.controles || "").toLowerCase();
  const est  = (o.estado || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return {
    titulo:       o.juego || "",
    publisher:    o.publisher || "",
    genero:       o.genero || "",
    pegi:         o.pegi || "3",
    descripcion:  o.descripcion || "",
    licencia:     o.licencia || "",
    portada:      o.portada || "",
    singleplayer: jug.includes("un jugador"),
    multiplayer:  jug.includes("multijugador") && !jug.includes("online"),
    multiOnline:  jug.includes("online"),
    pc:           dev.includes("pc"),
    mobile:       dev.includes("mobile"),
    tv:           dev.includes("tv"),
    gamepad:      ctrl.includes("gamepad"),
    teclado:      ctrl.includes("teclado"),
    touchscreen:  ctrl.includes("touchscreen"),
    nuevo:        est === "nuevo",
    destacado:    est === "destacado",
    masJugado:    est.includes("mas jugado"),
  };
}

// ─── DEFAULT SERVICES ─────────────────────────────────────────────────────────
const DEFAULT_SERVICES = {
  xbox:    { name:"Xbox Cloud Gaming", alias:["xbox","xcloud","xbox cloud"],  lang:"ES", brandColor:"#107C10", bgColor:"#0a0f0a", secondaryColor:"#ffffff", logoImg:"", coverImg:"", backImg:"", link:"https://www.xbox.com/play" },
  geforce: { name:"GeForce Now",       alias:["geforce","geforce now","nvidia"], lang:"ES", brandColor:"#76B900", bgColor:"#0a0a0f", secondaryColor:"#000000", logoImg:"", coverImg:"", backImg:"", link:"https://www.nvidia.com/geforce-now" },
};

// ─── COMMAND PARSER ───────────────────────────────────────────────────────────
function parseCmd(txt) {
  const t = txt.trim().toLowerCase();
  if (/^(ayuda|help|\?)/.test(t))                                                     return { type: "help" };
  if (/^(listar servicios|listar|list)/.test(t))                                      return { type: "list" };
  if (/^(nuevo servicio|agregar servicio|add new service|add service)/.test(t))       return { type: "add" };
  if (/^(configurar planilla|config sheet|configurar sheet)/.test(t))                 return { type: "config_sheet" };
  if (/^(configurar repositorio|configurar repo|config repo|config github)/.test(t))  return { type: "config_repo" };
  const em = t.match(/^(editar servicio|edit service)\s+(.+)/);
  if (em) return { type: "edit", svc: em[2].trim() };
  const dm = t.match(/^(eliminar servicio|delete service|borrar servicio)\s+(.+)/);
  if (dm) return { type: "delete", svc: dm[2].trim() };
  const cm = txt.trim().match(/^(crear cat[aá]logo|create catalog)\s+(.+?)(?:\s+(ES|EN|PT))?$/i);
  if (cm) return { type: "create", svc: cm[2].trim(), lang: (cm[3] || "ES").toUpperCase() };
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

// ─── GITHUB API ───────────────────────────────────────────────────────────────
async function githubGetFileSha(token, owner, repo, path) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha || null;
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

async function githubEnsureFolder(token, owner, repo, folderPath) {
  // GitHub doesn't have real folders — just check if a .gitkeep exists or skip
  const keepPath = `${folderPath}/.gitkeep`;
  const sha = await githubGetFileSha(token, owner, repo, keepPath);
  if (!sha) {
    try {
      await githubPutFile(token, owner, repo, keepPath, "", `Create ${folderPath} folder`, null);
    } catch { /* folder might already exist */ }
  }
}

// ─── WEB HTML GENERATOR ───────────────────────────────────────────────────────
// Calcula luminancia relativa de un color hex → decide si el texto debe ser claro u oscuro
function getTextColor(hexBg, customOverride) {
  if (customOverride) return customOverride;
  try {
    const hex = hexBg.replace("#","");
    const r = parseInt(hex.substring(0,2),16)/255;
    const g = parseInt(hex.substring(2,4),16)/255;
    const b = parseInt(hex.substring(4,6),16)/255;
    const toLinear = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
    const L = 0.2126*toLinear(r) + 0.7152*toLinear(g) + 0.0722*toLinear(b);
    // Si luminancia > 0.35 → fondo claro → texto oscuro; si no → texto claro
    if (L > 0.35) return { tx:"#0a0a0f", mu:"#444466" };
    if (L > 0.15) return { tx:"#f0f0f8", mu:"#8080a0" };
    return { tx:"#f0f0f8", mu:"#8080a0" };
  } catch { return { tx:"#f0f0f8", mu:"#8080a0" }; }
}

function generateWebHTML(svc, games, lang) {
  const L = LABELS[lang] || LABELS.ES;
  const color = svc.brandColor || "#7c3aed";
  const bgColor = svc.bgColor || "#0a0a0f";
  const bg = bgColor;
  const textColors = getTextColor(bgColor, null);
  const txColor  = svc.textColor || textColors.tx;
  const muColor  = svc.textColor
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
    t: g.titulo, p: g.publisher, g: g.genero, pe: g.pegi,
    l: g.licencia, lt: plt(g.licencia), free: g.licencia.toLowerCase().includes("gratuito"),
    i: g.portada, d: g.descripcion,
    sp: g.singleplayer, mp: g.multiplayer, mo: g.multiOnline,
    pc: g.pc, mob: g.mobile, tv: g.tv,
    gp: g.gamepad, tk: g.teclado, ts: g.touchscreen,
    nv: g.nuevo, de: g.destacado, mj: g.masJugado,
  })));

  const logoHTML = svc.logoImg
    ? `<img src="${svc.logoImg}" style="height:28px;max-width:100px;object-fit:contain" alt="${svc.name}"/>`
    : `<span id="ln">${svc.name}</span>`;

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
#si:focus{border-color:var(--br)}
#si::placeholder{color:var(--mu)}
.sic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mu);pointer-events:none}
#gc{margin-left:auto;font-size:12px;color:var(--mu);flex-shrink:0;white-space:nowrap}
#fb{background:var(--fb-bg);border-bottom:1px solid var(--bd);flex-shrink:0;z-index:50;position:relative}
#fi{display:flex;align-items:center;gap:6px;padding:0 20px;height:52px;overflow-x:auto;overflow-y:visible;scrollbar-width:none;-webkit-overflow-scrolling:touch}
#fi::-webkit-scrollbar{display:none}
.fg{display:flex;align-items:center;gap:5px;flex-shrink:0}
.fl{font-size:10px;color:var(--mu);letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;padding-right:2px}
.sp{width:1px;height:18px;background:var(--bd2);flex-shrink:0;margin:0 5px}
.chip{background:var(--s2);border:1px solid var(--bd2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--mu);cursor:pointer;white-space:nowrap;transition:all .15s;user-select:none;flex-shrink:0}
.chip:hover{border-color:var(--br);color:var(--tx)}
.chip.on{background:var(--br);border-color:var(--br);color:#fff}
#clr{display:none;align-items:center;gap:4px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--br);cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:4px;transition:all .15s}
#clr.show{display:flex}
.dd{position:relative;flex-shrink:0}
.ddbtn{background:var(--s2);border:1px solid var(--bd2);border-radius:100px;padding:5px 13px;font-size:12px;color:var(--mu);cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;user-select:none;transition:all .15s}
.ddbtn.has{border-color:var(--br);color:var(--br)}
.arr{transition:transform .2s}
.ddbtn.open .arr{transform:rotate(180deg)}
#genre-portal{position:fixed;z-index:9999;display:none}
#genre-portal.open{display:block}
#gp{background:var(--s2);border:1px solid var(--bd2);border-radius:10px;padding:10px;display:flex;flex-wrap:wrap;gap:5px;max-width:340px;box-shadow:0 16px 48px rgba(0,0,0,.8)}
#scroll{flex:1;overflow-y:auto;overflow-x:hidden;background:var(--main-bg)}
#main{max-width:1200px;margin:0 auto;padding:24px 20px 48px}
.sec{margin-bottom:40px}
.sh{display:flex;align-items:baseline;gap:7px;margin-bottom:14px}
.dot{color:var(--br);font-size:14px}
.tit{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900;text-transform:uppercase}
.cnt{font-size:11px;color:var(--mu);margin-left:4px}
/* Grids — imagen 3:4 por aspect-ratio, sin altura fija */
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
/* Categoría usa color del servicio */
.ctg{background:var(--s3);border:1px solid var(--bd);border-radius:4px;font-size:9px;color:var(--mu);padding:2px 6px;white-space:nowrap}
.ctg.g{background:color-mix(in srgb,var(--br) 15%,transparent);border-color:color-mix(in srgb,var(--br) 40%,transparent);color:var(--br)}
.ctg.f{border-color:rgba(50,200,100,.3);color:rgba(50,200,100,.9)}
.cic{display:flex;flex-wrap:wrap;gap:5px}
.ib{display:flex;flex-direction:column;align-items:center;gap:2px}
.ib svg{opacity:.6}
.ib span{font-size:7px;color:var(--mu)}
/* POPUP */
#pov{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9990;display:none;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(10px)}
#pov.open{display:flex}
#pop{background:var(--s1);border:1px solid var(--bd2);border-radius:16px;max-width:760px;width:100%;overflow:hidden;animation:pi .18s ease;position:relative;display:flex;flex-direction:column;max-height:92vh}
@keyframes pi{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
#pt{display:flex;flex-shrink:0;min-height:0}
#pcol{width:220px;flex-shrink:0;position:relative}
#pim{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
#pph{width:100%;aspect-ratio:3/4;background:var(--s3);display:none;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:72px;font-weight:900;color:var(--br);opacity:.2}
#pnvb{position:absolute;top:10px;left:10px;background:var(--br);color:#fff;font-size:9px;font-weight:700;padding:3px 9px;border-radius:4px;letter-spacing:1.5px;display:none}
#pmeta{flex:1;padding:20px 22px 16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-width:0}
#ptit{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;line-height:1.05}
#ppub{font-size:13px;color:var(--mu);margin-top:2px}
#ptgs{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.ptag{border-radius:6px;font-size:12px;font-weight:600;padding:5px 13px;border:1px solid var(--bd2);background:var(--s3);color:var(--tx);white-space:nowrap}
.ptag.genre{background:color-mix(in srgb,var(--br) 15%,transparent);border-color:color-mix(in srgb,var(--br) 45%,transparent);color:var(--br)}
.ptag.pegi{font-weight:700;font-size:13px}
.ptag.lic{color:var(--mu);font-size:11px;font-weight:400}
.ptag.free{border-color:rgba(50,205,100,.4);color:rgba(50,205,100,.95);background:rgba(50,205,100,.08)}
.psec{display:flex;flex-direction:column;gap:8px}
.plbl{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu)}
.prow{display:flex;flex-wrap:wrap;gap:14px}
.pico{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:44px}
.pico svg{opacity:.8;width:22px;height:22px}
.pico span{font-size:11px;color:var(--mu);text-align:center;line-height:1.2;white-space:nowrap}
#pbot{border-top:1px solid var(--bd);padding:14px 22px;display:flex;align-items:flex-end;gap:14px;flex-shrink:0}
#pdsc{flex:1;font-size:13px;color:var(--mu);line-height:1.65;max-height:76px;overflow-y:auto}
#pcta{flex-shrink:0;background:var(--br);color:#fff;border:none;border-radius:8px;padding:11px 22px;font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;cursor:pointer;white-space:nowrap;transition:opacity .15s;letter-spacing:.3px}
#pcta:hover{opacity:.85}
#pcls{position:absolute;top:10px;right:10px;width:30px;height:30px;background:rgba(0,0,0,.6);border:1px solid var(--bd2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mu);font-size:14px;z-index:10;transition:all .15s;backdrop-filter:blur(4px)}
#pcls:hover{color:var(--tx)}
#emp{display:none;text-align:center;padding:48px 20px;color:var(--mu)}
#emp p{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;color:var(--tx);margin-bottom:5px}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--s3);border-radius:2px}
/* ── RESPONSIVE MOBILE ── */
@media(max-width:600px){
  body{font-size:14px}
  #hdr{padding:0 12px}
  #hi{height:50px;gap:8px}
  #sw{max-width:none;flex:1}
  #gc{display:none}
  #fi{height:46px;padding:0 12px}
  #main{padding:14px 12px 40px}
  .glg{grid-template-columns:repeat(2,1fr);gap:10px}
  .gmd{grid-template-columns:repeat(2,1fr);gap:10px}
  .gsm{grid-template-columns:repeat(2,1fr);gap:8px}
  .tit{font-size:20px}
  /* Popup full-screen en mobile */
  #pov{padding:0;align-items:flex-end}
  #pop{border-radius:16px 16px 0 0;max-height:95vh;max-width:100%}
  #pt{flex-direction:column}
  #pcol{width:100%}
  #pim{aspect-ratio:16/9;object-fit:cover}
  #pph{aspect-ratio:16/9}
  #pmeta{padding:14px 16px 10px;gap:10px}
  #ptit{font-size:22px}
  #pbot{padding:12px 16px;flex-wrap:wrap;gap:10px}
  #pdsc{max-height:60px;font-size:12px}
  #pcta{width:100%;justify-content:center;text-align:center}
}
</style>
</head>
<body>
<div id="hdr"><div id="hi">
  <div id="logo">
    ${svc.logoImg
      ? `<img src="${svc.logoImg}" style="height:32px;max-width:120px;object-fit:contain" alt="${svc.name}"/>
         <div><div id="ls">${L.catalog}</div></div>`
      : `<div>
           <div id="ln">${svc.name}</div>
           <div id="ls">${L.catalog}</div>
         </div>`
    }
  </div>
  <div id="sw">
    <svg class="sic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
    <input id="si" placeholder="${lang === 'EN' ? 'Search game, publisher, genre...' : lang === 'PT' ? 'Buscar jogo, publisher, gênero...' : 'Buscar juego, publisher, género...'}" oninput="run()"/>
  </div>
  <span id="gc"></span>
</div></div>
<div id="fb"><div id="fi">
  <div class="dd" id="gdd">
    <div class="ddbtn" id="gbtn" onclick="tdd(event)">
      <span id="gbl">${lang === 'EN' ? 'Genre' : lang === 'PT' ? 'Gênero' : 'Género'}</span>
      <svg class="arr" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
    </div>
  </div>
  <div class="sp"></div>
  <div class="fg"><span class="fl">${lang === 'EN' ? 'LICENSE' : lang === 'PT' ? 'LICENÇA' : 'LICENCIA'}</span><div id="lcc" style="display:flex;gap:4px;flex-shrink:0"></div></div>
  <div class="sp"></div>
  <div class="fg">
    <span class="fl">${lang === 'EN' ? 'DEVICE' : lang === 'PT' ? 'DISPOSITIVO' : 'DISPOSITIVO'}</span>
    <div class="chip" data-f="dev" data-v="pc" onclick="tc(this)">PC</div>
    <div class="chip" data-f="dev" data-v="mobile" onclick="tc(this)">Mobile</div>
    <div class="chip" data-f="dev" data-v="tv" onclick="tc(this)">TV</div>
  </div>
  <div class="sp"></div>
  <div class="fg">
    <span class="fl">${lang === 'EN' ? 'CONTROL' : 'CONTROL'}</span>
    <div class="chip" data-f="ctrl" data-v="gamepad" onclick="tc(this)">Gamepad</div>
    <div class="chip" data-f="ctrl" data-v="teclado" onclick="tc(this)">${lang === 'EN' ? 'Keyboard' : 'Teclado'}</div>
    <div class="chip" data-f="ctrl" data-v="touch" onclick="tc(this)">Touch</div>
  </div>
  <div class="sp"></div>
  <div class="fg">
    <span class="fl">${lang === 'EN' ? 'PLAYERS' : lang === 'PT' ? 'JOGADORES' : 'JUGADORES'}</span>
    <div class="chip" data-f="pl" data-v="single" onclick="tc(this)">${lang === 'EN' ? 'Single player' : lang === 'PT' ? 'Um jogador' : 'Un jugador'}</div>
    <div class="chip" data-f="pl" data-v="multi" onclick="tc(this)">${lang === 'EN' ? 'Multiplayer' : 'Multijugador'}</div>
    <div class="chip" data-f="pl" data-v="online" onclick="tc(this)">Online</div>
  </div>
  <button id="clr" onclick="clearAll()">
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
    ${lang === 'EN' ? 'Clear filters' : lang === 'PT' ? 'Limpar filtros' : 'Borrar filtros'}
  </button>
</div></div>
<div id="genre-portal"><div id="gp"></div></div>
<div id="scroll"><div id="main">
  <div class="sec" id="snv"><div class="sh"><span class="dot">✦</span><span class="tit">${LABELS[lang]?.nuevos || 'Novedades'}</span><span class="cnt" id="cnv"></span></div><div class="glg" id="gnv"></div></div>
  <div class="sec" id="sde"><div class="sh"><span class="dot">✦</span><span class="tit">${LABELS[lang]?.featured || 'Destacados'}</span><span class="cnt" id="cde"></span></div><div class="glg" id="gde"></div></div>
  <div class="sec" id="stp"><div class="sh"><span class="dot">✦</span><span class="tit">${LABELS[lang]?.top || 'Más Jugados'}</span><span class="cnt" id="ctp"></span></div><div class="gmd" id="gtp"></div></div>
  <div class="sec" id="sal"><div class="sh"><span class="dot">✦</span><span class="tit" id="atit">${LABELS[lang]?.all || 'Juegos'}</span><span class="cnt" id="cal"></span></div><div class="gsm" id="gal"></div></div>
  <div id="emp"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".15" style="margin-bottom:12px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><p>${lang === 'EN' ? 'No results' : 'Sin resultados'}</p><span>${lang === 'EN' ? 'Try another term or remove some filters' : 'Probá otro término o eliminá algunos filtros'}</span></div>
</div></div>
<div id="pov" onclick="if(event.target===this)cp()">
  <div id="pop">
    <button id="pcls" onclick="cp()">✕</button>
    <div id="pt">
      <div id="pcol"><img id="pim" src=""/><div id="pph"></div><div id="pnvb">${lang === 'EN' ? 'NEW' : lang === 'PT' ? 'NOVO' : 'NUEVO'}</div></div>
      <div id="pmeta">
        <div><div id="ptit"></div><div id="ppub"></div></div>
        <div id="ptgs"></div>
        <div class="psec" id="sjug"><div class="plbl">${lang === 'EN' ? 'Players' : lang === 'PT' ? 'Jogadores' : 'Jugadores'}</div><div class="prow" id="rjug"></div></div>
        <div class="psec" id="sdev"><div class="plbl">${lang === 'EN' ? 'Devices' : lang === 'PT' ? 'Dispositivos' : 'Dispositivos'}</div><div class="prow" id="rdev"></div></div>
        <div class="psec" id="sctrl"><div class="plbl">${lang === 'EN' ? 'Controls' : 'Controles'}</div><div class="prow" id="rctrl"></div></div>
      </div>
    </div>
    <div id="pbot"><div id="pdsc"></div><button id="pcta">${L.play} →</button></div>
  </div>
</div>
<script>
const SVC_LINK="${svc.link || '#'}";
const G=${gamesJSON};
function mksvg(d,s){return\`<svg width="\${s||22}" height="\${s||22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">\${d}</svg>\`;}
const D={single:'<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>',multi:'<circle cx="9" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 9-5.2M15 14a6 6 0 0 1 6 6v2"/>',online:'<circle cx="12" cy="12" r="9"/><path d="M12 3C9 7 9 17 12 21M12 3c3 4 3 14 0 18M3 12h18"/>',pc:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',mobile:'<rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="1"/>',tv:'<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8M12 18v2"/>',gamepad:'<rect x="2" y="7" width="20" height="12" rx="5"/><path d="M7 11v4M5 13h4M16 12h2"/>',teclado:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',touch:'<path d="M9 11V6a2 2 0 0 1 4 0v5M13 11V9a2 2 0 0 1 4 0v3l1 5H9l1-5H9a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2"/>'};
const lts=[...new Set(G.map(g=>g.lt))].sort();
const lcc=document.getElementById("lcc");
lts.forEach(lt=>{const d=document.createElement("div");d.className="chip";d.textContent=lt;d.dataset.f="lic";d.dataset.v=lt;d.onclick=()=>tc(d);lcc.appendChild(d);});
const gens=[...new Set(G.map(g=>g.g))].sort();
const gp=document.getElementById("gp");
gens.forEach(ge=>{const d=document.createElement("div");d.className="chip";d.textContent=ge;d.dataset.f="genre";d.dataset.v=ge.toLowerCase();d.onclick=()=>{tc(d);ugb();};gp.appendChild(d);});
let ddOpen=false;
function tdd(e){e.stopPropagation();ddOpen=!ddOpen;const btn=document.getElementById("gbtn"),portal=document.getElementById("genre-portal");btn.classList.toggle("open",ddOpen);if(ddOpen){const r=btn.getBoundingClientRect();portal.style.top=(r.bottom+4)+"px";portal.style.left=r.left+"px";portal.classList.add("open");}else portal.classList.remove("open");}
document.addEventListener("click",e=>{if(!document.getElementById("gdd").contains(e.target)&&!document.getElementById("genre-portal").contains(e.target)){ddOpen=false;document.getElementById("gbtn").classList.remove("open");document.getElementById("genre-portal").classList.remove("open");}});
function ugb(){const a=[...gp.querySelectorAll(".chip.on")];const btn=document.getElementById("gbtn"),lbl=document.getElementById("gbl");if(!a.length){lbl.textContent="${lang === 'EN' ? 'Genre' : 'Género'}";btn.classList.remove("has");}else{lbl.textContent=a.length===1?a[0].textContent:\`Género (\${a.length})\`;btn.classList.add("has");}}
let AF={genre:[],lic:[],dev:[],ctrl:[],pl:[]};
function tc(el){const f=el.dataset.f,v=el.dataset.v,a=AF[f],i=a.indexOf(v);if(i>=0){a.splice(i,1);el.classList.remove("on");}else{a.push(v);el.classList.add("on");}ucl();run();}
function ucl(){const h=document.getElementById("si").value||Object.values(AF).some(a=>a.length);document.getElementById("clr").classList.toggle("show",!!h);}
function clearAll(){document.getElementById("si").value="";Object.keys(AF).forEach(k=>AF[k]=[]);document.querySelectorAll(".chip.on").forEach(c=>c.classList.remove("on"));document.getElementById("gbtn").classList.remove("has");document.getElementById("gbl").textContent="${lang === 'EN' ? 'Genre' : 'Género'}";ucl();run();}
function match(g){const q=document.getElementById("si").value.toLowerCase();if(q&&!g.t.toLowerCase().includes(q)&&!g.p.toLowerCase().includes(q)&&!g.g.toLowerCase().includes(q))return false;if(AF.genre.length&&!AF.genre.includes(g.g.toLowerCase()))return false;if(AF.lic.length&&!AF.lic.includes(g.lt))return false;if(AF.dev.length&&!AF.dev.every(d=>(d==="pc"&&g.pc)||(d==="mobile"&&g.mob)||(d==="tv"&&g.tv)))return false;if(AF.ctrl.length&&!AF.ctrl.every(c=>(c==="gamepad"&&g.gp)||(c==="teclado"&&g.tk)||(c==="touch"&&g.ts)))return false;if(AF.pl.length&&!AF.pl.every(p=>(p==="single"&&g.sp)||(p==="multi"&&g.mp)||(p==="online"&&g.mo)))return false;return true;}
function ib(show,svg,lbl){if(!show)return"";return\`<div class="ib">\${svg}<span>\${lbl}</span></div>\`;}
function mkcard(g){const d=document.createElement("div");d.className="card";const img=g.i?\`<img class="ci" src="\${g.i}" loading="lazy" onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='flex')"/><div class="cph" style="display:none">\${g.t[0]}</div>\`:\`<div class="cph">\${g.t[0]}</div>\`;d.innerHTML=\`<div class="ciw">\${img}<div class="cov"></div>\${g.nv?'<div class="cnv">NUEVO</div>':""}<div class="cpe">\${g.pe}+</div></div><div class="cb"><div class="ct">\${g.t}</div><div class="cp">\${g.p}</div><div class="ctgs"><span class="ctg g">\${g.g}</span>\${g.free?'<span class="ctg f">Gratis</span>':""}<span class="ctg">\${g.lt}</span></div><div class="cic">\${ib(g.sp,mksvg(D.single,13),"1P")}\${ib(g.mp,mksvg(D.multi,13),"Multi")}\${ib(g.mo,mksvg(D.online,13),"Online")}\${ib(g.pc,mksvg(D.pc,13),"PC")}\${ib(g.mob,mksvg(D.mobile,13),"Móvil")}\${ib(g.tv,mksvg(D.tv,13),"TV")}\${ib(g.gp,mksvg(D.gamepad,13),"Pad")}\${ib(g.ts,mksvg(D.touch,13),"Touch")}</div></div>\`;d.onclick=()=>op(g);return d;}
function rend(gid,sid,games,_h,cid){const gr=document.getElementById(gid),sec=document.getElementById(sid);gr.innerHTML="";sec.style.display=games.length?"block":"none";document.getElementById(cid).textContent=games.length?\`\${games.length} juegos\`:"";games.forEach(g=>gr.appendChild(mkcard(g)));}
function run(){ucl();const filt=G.filter(match);const isF=document.getElementById("si").value||Object.values(AF).some(a=>a.length);rend("gnv","snv",isF?[]:filt.filter(g=>g.nv),182,"cnv");rend("gde","sde",isF?[]:filt.filter(g=>g.de),182,"cde");rend("gtp","stp",isF?[]:filt.filter(g=>g.mj),158,"ctp");rend("gal","sal",filt,142,"cal");document.getElementById("atit").textContent=isF?"Resultados":"${LABELS[lang]?.all || 'Juegos'}";document.getElementById("gc").textContent=\`\${filt.length} juegos\`;document.getElementById("emp").style.display=filt.length===0?"block":"none";}
function picoRow(rowId,secId,items){const html=items.filter(x=>x.show).map(x=>\`<div class="pico">\${mksvg(D[x.key])}<span>\${x.label}</span></div>\`).join("");document.getElementById(rowId).innerHTML=html;document.getElementById(secId).style.display=html?"flex":"none";}
function op(g){const im=document.getElementById("pim"),ph=document.getElementById("pph");if(g.i){im.src=g.i;im.style.display="block";ph.style.display="none";}else{im.style.display="none";ph.style.display="flex";ph.textContent=g.t[0];}document.getElementById("pnvb").style.display=g.nv?"block":"none";document.getElementById("ptit").textContent=g.t;document.getElementById("ppub").textContent=g.p;document.getElementById("ptgs").innerHTML=\`<span class="ptag genre">\${g.g}</span><span class="ptag pegi">PEGI \${g.pe}+</span><span class="ptag lic">\${g.l}</span>\${g.free?'<span class="ptag free">Gratuito</span>':""}\`;picoRow("rjug","sjug",[{show:g.sp,key:"single",label:"${lang === 'EN' ? 'Single player' : 'Un jugador'}"},{show:g.mp,key:"multi",label:"${lang === 'EN' ? 'Multiplayer' : 'Multijugador'}"},{show:g.mo,key:"online",label:"Online"}]);picoRow("rdev","sdev",[{show:g.pc,key:"pc",label:"PC"},{show:g.mob,key:"mobile",label:"Mobile"},{show:g.tv,key:"tv",label:"TV"}]);picoRow("rctrl","sctrl",[{show:g.gp,key:"gamepad",label:"Gamepad"},{show:g.tk,key:"teclado",label:"${lang === 'EN' ? 'Keyboard' : 'Teclado'}"},{show:g.ts,key:"touch",label:"Touch"}]);document.getElementById("pdsc").textContent=g.d;document.getElementById("pcta").onclick=()=>window.open(SVC_LINK,"_blank");document.getElementById("pov").classList.add("open");}
function cp(){document.getElementById("pov").classList.remove("open");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")cp();});
run();
<\/script>
</body>
</html>`;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CatalogAgent() {
  const [messages, setMessages] = useState([{ role:"agent", type:"help" }]);
  const [input, setInput]       = useState("");
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [loading, setLoading]   = useState(false);
  const [services_loading, setServicesLoading] = useState(true);

  // Config state
  const [sheetUrl, setSheetUrl]     = useState("");
  const [repoOwner, setRepoOwner]   = useState("");
  const [repoName, setRepoName]     = useState("");
  const [repoToken, setRepoToken]   = useState("");

  // Form state
  const [showForm, setShowForm]       = useState(null); // null | "service" | "sheet" | "repo"
  const [editKey, setEditKey]         = useState(null);
  const [form, setForm]               = useState({ name:"", alias:"", lang:"ES", brandColor:"#7c3aed", bgColor:"#0a0a0f", borderColor:"#333355", textColor:"", secondaryColor:"#ffffff", logoImg:"", coverImg:"", backImg:"", link:"" });
  const [sheetForm, setSheetForm]     = useState("");
  const [repoForm, setRepoForm]       = useState({ owner:"", repo:"", token:"" });

  // Last deploy
  const [lastDeployUrl, setLastDeployUrl] = useState(null);

  const bottomRef = useRef(null);
  const C = "#7c3aed";

  useEffect(() => {
  (async () => {
    const remoteData = await stGetRemote();
    if (remoteData) {
      if (remoteData.services) setServices(remoteData.services);
      if (remoteData.config.sheetUrl) setSheetUrl(remoteData.config.sheetUrl);
      if (remoteData.config.repoOwner) setRepoOwner(remoteData.config.repoOwner);
      if (remoteData.config.repoName) setRepoName(remoteData.config.repoName);
      if (remoteData.config.repoToken) setRepoToken(remoteData.config.repoToken);
    }
    setServicesLoading(false);
  })();
}, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, showForm, lastDeployUrl]);

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
    } else if (cmd.type === "config_sheet") {
      setSheetForm(sheetUrl);
      setShowForm("sheet");
      setMessages(m => [...m, { role:"agent", type:"sheet_form" }]);
    } else if (cmd.type === "config_repo") {
      setRepoForm({ owner:repoOwner, repo:repoName, token:repoToken });
      setShowForm("repo");
      setMessages(m => [...m, { role:"agent", type:"repo_form" }]);
    } else if (cmd.type === "edit") {
      const e = findSvc(cmd.svc || "");
      if (e) { setForm({ bgColor:"#0a0a0f", borderColor:"#333355", textColor:"", ...e[1], alias:e[1].alias.join(", ") }); setEditKey(e[0]); setShowForm("service"); setMessages(m => [...m, { role:"agent", type:"form_edit", data:e[1].name }]); }
      else setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]);
    } else if (cmd.type === "delete") {
      const e = Object.entries(services).find(([,s]) => s.alias.some(a => (cmd.svc || "").toLowerCase().includes(a)));
      if (e) { const n = {...services}; delete n[e[0]]; await saveServices(n); setMessages(m => [...m, { role:"agent", type:"deleted", data:e[1].name }]); }
      else setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]);
    } else if (cmd.type === "create") {
      const e = findSvc(cmd.svc);
      if (!e) { setMessages(m => [...m, { role:"agent", type:"not_found", data:cmd.svc }]); }
      else if (!sheetUrl) { setMessages(m => [...m, { role:"agent", type:"no_sheet" }]); }
      else if (!repoOwner || !repoName || !repoToken) { setMessages(m => [...m, { role:"agent", type:"no_repo" }]); }
      else {
        setLastDeployUrl(null);
        setMessages(m => [...m, { role:"agent", type:"generating", data:e[1].name }]);
        await doDeploy(e[1], cmd.lang);
      }
    } else {
      setMessages(m => [...m, { role:"agent", type:"unknown" }]);
    }
    setLoading(false);
  }

  // ── DEPLOY ──────────────────────────────────────────────────────────────────
  async function doDeploy(svc, lang) {
    try {
      // 1. Fetch sheet data
      setMessages(m => [...m, { role:"agent", type:"step", data:"Leyendo datos del Google Sheet..." }]);
      const games = await fetchSheetGames(sheetUrl);
      if (!games || games.length === 0) {
        setMessages(m => [...m, { role:"agent", type:"error", data:"No se pudieron leer los juegos del Sheet. Verificá que la URL sea correcta y el Sheet sea público." }]);
        return;
      }

      // 2. Generate web HTML
      setMessages(m => [...m, { role:"agent", type:"step", data:`Generando web para ${svc.name} — ${games.length} juegos...` }]);
      const html = generateWebHTML(svc, games, lang);

      // 3. Upload to GitHub
      const folderKey = svc.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const filePath  = `${folderKey}/index.html`;
      setMessages(m => [...m, { role:"agent", type:"step", data:`Subiendo a GitHub: ${repoOwner}/${repoName}/${filePath}...` }]);

      // Get existing SHA if file exists (needed for update)
      const sha = await githubGetFileSha(repoToken, repoOwner, repoName, filePath);

      await githubPutFile(
        repoToken, repoOwner, repoName, filePath, html,
        `Update ${svc.name} catalog — ${lang} — ${new Date().toISOString().slice(0,10)}`,
        sha
      );

      // 4. Build public URL
      const pageUrl = `https://${repoOwner}.github.io/${repoName}/${folderKey}/`;
      setLastDeployUrl(pageUrl);
      setMessages(m => [...m, { role:"agent", type:"deployed", data:{ svc:svc.name, lang, n:games.length, url:pageUrl } }]);

    } catch (err) {
      setMessages(m => [...m, { role:"agent", type:"error", data:`Error al subir: ${err.message}` }]);
    }
  }

  // ── SAVE FORMS ──────────────────────────────────────────────────────────────
  async function saveService() {
    if (!form.name.trim()) return;
    const key = editKey || form.name.toLowerCase().replace(/\s+/g, "_");
    const aliases = form.alias ? form.alias.split(",").map(a => a.trim().toLowerCase()).filter(Boolean) : [form.name.toLowerCase()];
    
    const updatedServices = { 
      ...services, 
      [key]: { 
        ...form, 
        alias: aliases, 
        bgColor: form.bgColor || "#0a0a0f", 
        borderColor: form.borderColor || "#333355" 
      } 
    };

    setServices(updatedServices);
    await stSet("svcs9", updatedServices); // Mantenemos local por backup
    await stSetRemote("saveServices", updatedServices); // <--- ENVÍO A SHEETS
    
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type:"saved", data:form.name }]);
  }

  async function saveSheetConfig() {
    const url = sheetForm.trim();
    setSheetUrl(url);
    await stSet("sheetUrl", url);
    
    // Actualizamos la config global en Sheets
    await stSetRemote("saveConfig", { 
      sheetUrl: url, repoOwner, repoName, repoToken 
    });
    
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type:"sheet_saved", data:url }]);
  }

  async function saveRepoConfig() {
    const { owner, repo, token } = repoForm;
    setRepoOwner(owner); setRepoName(repo); setRepoToken(token);
    
    await stSet("repoOwner", owner);
    await stSet("repoName", repo);
    await stSet("repoToken", token);
    
    // Actualizamos la config global en Sheets
    await stSetRemote("saveConfig", { 
      sheetUrl, repoOwner: owner, repoName: repo, repoToken: token 
    });
    
    setShowForm(null);
    setMessages(m => [...m, { role:"agent", type:"repo_saved", data:`${owner}/${repo}` }]);
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
  const btnG  = { background:"#24292f", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:8 };
  const fldSt = { width:"100%", padding:"8px 10px", border:"1px solid #ddd", borderRadius:6, fontSize:13, outline:"none", fontFamily:"inherit" };
  const lblSt = { fontSize:11, color:"#666", display:"block", marginBottom:4, marginTop:10 };
  const secLbl= { fontSize:10, fontWeight:700, letterSpacing:"1.5px", color:C, textTransform:"uppercase", margin:"16px 0 6px", borderBottom:"1px solid #ece8ff", paddingBottom:4, display:"block" };

  function pill(txt) { return <span key={txt} style={{ background:C, color:"#fff", borderRadius:4, padding:"1px 8px", fontSize:11, fontFamily:"monospace", whiteSpace:"nowrap" }}>{txt}</span>; }

  function AgBubble({ children }) {
    return (
      <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
        <div style={{ width:32, height:32, borderRadius:"50%", background:C, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700, flexShrink:0 }}>A</div>
        <div style={{ background:"#f4f0ff", borderRadius:"4px 16px 16px 16px", padding:"12px 15px", maxWidth:"86%", fontSize:13, color:"#1a1a2e", lineHeight:1.65 }}>{children}</div>
      </div>
    );
  }

  // ── RENDER MESSAGES ─────────────────────────────────────────────────────────
  function renderMsg(msg, i) {
    if (msg.role === "user") return (
      <div key={i} style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <div style={{ background:C, color:"#fff", borderRadius:"16px 16px 4px 16px", padding:"10px 15px", maxWidth:"70%", fontSize:13, lineHeight:1.5 }}>{msg.text}</div>
      </div>
    );
    const { type, data } = msg;

    if (type === "help") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>Agente de Catálogos Cloud Gaming v5</div>
        {COMMANDS.map(([cmd, desc]) => (
          <div key={cmd} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:6, flexWrap:"wrap" }}>
            {pill(cmd)}<span style={{ color:"#555", fontSize:12, paddingTop:2 }}>{desc}</span>
          </div>
        ))}
        <div style={{ marginTop:12, fontSize:11, background:"#f0ebff", padding:"8px 10px", borderRadius:6, color:C }}>
          <strong>v5:</strong> Deploy automático a GitHub Pages · Google Sheets en vivo · Web pública por servicio
        </div>
        <div style={{ marginTop:8, fontSize:11, color:"#888" }}>
          Configurá {pill("Configurar planilla")} y {pill("Configurar repositorio")} antes de crear el primer catálogo.
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

    if (type === "form_open")  return <AgBubble key={i}>Abriendo formulario de nuevo servicio...</AgBubble>;
    if (type === "form_edit")  return <AgBubble key={i}>Editando <strong>{data}</strong>...</AgBubble>;
    if (type === "sheet_form") return <AgBubble key={i}>Abriendo configuración del Google Sheet...</AgBubble>;
    if (type === "repo_form")  return <AgBubble key={i}>Abriendo configuración del repositorio de GitHub...</AgBubble>;
    if (type === "saved")      return <AgBubble key={i}>Servicio <strong>{data}</strong> guardado.</AgBubble>;
    if (type === "deleted")    return <AgBubble key={i}>Servicio <strong>{data}</strong> eliminado.</AgBubble>;

    if (type === "sheet_saved") return (
      <AgBubble key={i}>
        <div>✅ Planilla configurada.</div>
        <div style={{ fontSize:11, color:"#888", marginTop:4, wordBreak:"break-all" }}>{data}</div>
      </AgBubble>
    );
    if (type === "repo_saved") return (
      <AgBubble key={i}>
        <div>✅ Repositorio configurado: <strong>{data}</strong></div>
        <div style={{ fontSize:11, color:"#888", marginTop:4 }}>Las webs se publicarán en <code>https://{data.split("/")[0]}.github.io/{data.split("/")[1]}/[servicio]/</code></div>
      </AgBubble>
    );

    if (type === "generating") return <AgBubble key={i}>Iniciando deploy de <strong>{data}</strong>...</AgBubble>;
    if (type === "step")       return <AgBubble key={i}><span style={{ color:"#888" }}>→ {data}</span></AgBubble>;

    if (type === "deployed") return (
      <AgBubble key={i}>
        <div style={{ fontWeight:700, marginBottom:6 }}>✅ Catálogo publicado</div>
        <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>{data.svc} · {data.lang} · {data.n} juegos</div>
        <div style={{ fontSize:11, color:"#888", marginBottom:10, wordBreak:"break-all" }}>
          URL: <a href={data.url} target="_blank" style={{ color:C }}>{data.url}</a>
        </div>
        <div style={{ fontSize:11, color:"#888" }}>GitHub Pages puede tardar 1–2 minutos en reflejar los cambios.</div>
      </AgBubble>
    );

    if (type === "no_sheet") return (
      <AgBubble key={i}>
        No hay una planilla configurada. Usá {pill("Configurar planilla")} primero.
      </AgBubble>
    );
    if (type === "no_repo") return (
      <AgBubble key={i}>
        No hay un repositorio configurado. Usá {pill("Configurar repositorio")} primero.
      </AgBubble>
    );
    if (type === "error") return (
      <AgBubble key={i}>
        <span style={{ color:"#c00" }}>❌ {data}</span>
      </AgBubble>
    );
    if (type === "not_found") return (
      <AgBubble key={i}>No encontré <strong>"{data}"</strong>. Usá {pill("Listar servicios")} o {pill("Nuevo servicio")}.</AgBubble>
    );
    if (type === "unknown") return (
      <AgBubble key={i}>No entendí ese comando. Escribí <strong>Ayuda</strong> para ver los disponibles.</AgBubble>
    );
    return null;
  }

  // ── STATUS PILLS ────────────────────────────────────────────────────────────
  function StatusPill({ label, value, ok }) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background: ok ? "#f0fdf4" : "#fef2f2", border:`1px solid ${ok ? "#86efac" : "#fca5a5"}`, borderRadius:100, fontSize:11, color: ok ? "#166534" : "#991b1b", flexShrink:0 }}>
        <span>{ok ? "✓" : "✗"}</span>
        <span>{label}</span>
        {value && <span style={{ opacity:.7 }}>— {value}</span>}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#f9f7ff", fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>

      {/* Header */}
      <div style={{ background:C, color:"#fff", padding:"11px 18px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>🎮</div>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>Agente de Catálogos v5</div>
          <div style={{ fontSize:11, opacity:.7 }}>Cloud Gaming · GitHub Deploy</div>
        </div>
        {/* Status pills */}
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <StatusPill label="Sheet" value={sheetUrl ? "configurada" : null} ok={!!sheetUrl}/>
          <StatusPill label="GitHub" value={repoOwner && repoName ? `${repoOwner}/${repoName}` : null} ok={!!(repoOwner && repoName && repoToken)}/>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        {messages.map((m, i) => renderMsg(m, i))}

        {loading && (
          <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:C, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:700 }}>A</div>
            <div style={{ background:"#f4f0ff", borderRadius:"4px 16px 16px 16px", padding:"12px 15px", fontSize:18, letterSpacing:5, color:C }}>•••</div>
          </div>
        )}

        {/* Last deploy URL button */}
        {lastDeployUrl && (
          <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
            <a href={lastDeployUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnP, textDecoration:"none", display:"flex", alignItems:"center", gap:8, padding:"10px 24px", fontSize:14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Ver catálogo en línea
            </a>
          </div>
        )}

        {/* ── FORMULARIO SERVICIO ── */}
        {showForm === "service" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16, maxHeight:"70vh", overflowY:"auto" }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>{editKey ? "Editar servicio" : "Nuevo servicio"}</div>
            <span style={secLbl}>Identidad</span>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
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
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
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
            {/* Color de tipografía — opcional, auto-detectado si está vacío */}
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
              <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>
                Dejalo en "auto" para que se calcule automáticamente según la luminancia del fondo.
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
              {[["Logo del servicio (web) — PNG transparente","logoImg"],["Portada del PDF","coverImg"]].map(([lbl,fld]) => (
                <div key={fld}><label style={lblSt}>{lbl}</label>
                  <input type="file" accept="image/*" onChange={e => handleImgUpload(fld, e)} style={{ fontSize:12, width:"100%" }}/>
                  {form[fld] && <img src={form[fld]} style={{ width:80, height:50, objectFit:"contain", borderRadius:4, marginTop:5, border:"1px solid #eee", background:"#f5f5f5", padding:2 }}/>}
                </div>
              ))}
            </div>
            <div style={{ maxWidth:"50%", paddingRight:7 }}>
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

        {/* ── FORMULARIO PLANILLA ── */}
        {showForm === "sheet" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>Configurar Google Sheet</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              El Sheet debe ser <strong>público</strong> (Compartir → Cualquier persona con el enlace → Lector).<br/>
              Columnas requeridas: <code>Juego, Publisher, Genero, PEGI, Jugadores, Dispositivos, Controles, Licencia, Portada, Descripción, Estado</code>
            </div>
            <label style={lblSt}>URL del Google Sheet</label>
            <input style={fldSt} type="url" value={sheetForm} onChange={e => setSheetForm(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit"/>
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={saveSheetConfig} style={btnP} disabled={!sheetForm.trim()}>Guardar planilla</button>
              <button onClick={() => setShowForm(null)} style={btnS}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ── FORMULARIO REPOSITORIO ── */}
        {showForm === "repo" && (
          <div style={{ background:"#fff", border:"1.5px solid #e0d7ff", borderRadius:12, padding:20, marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C }}>Configurar repositorio GitHub</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              El repo debe tener <strong>GitHub Pages activado</strong> (Settings → Pages → Branch: main).<br/>
              El token necesita permisos de <strong>Contents: Read & Write</strong>.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
              <div><label style={lblSt}>Usuario u organización de GitHub</label><input style={fldSt} value={repoForm.owner} onChange={e => setRepoForm(f => ({...f, owner:e.target.value}))} placeholder="mi-usuario"/></div>
              <div><label style={lblSt}>Nombre del repositorio</label><input style={fldSt} value={repoForm.repo} onChange={e => setRepoForm(f => ({...f, repo:e.target.value}))} placeholder="catalogos-gaming"/></div>
            </div>
            <label style={lblSt}>Personal Access Token (GitHub) — se guarda localmente en tu navegador</label>
            <input style={fldSt} type="password" value={repoForm.token} onChange={e => setRepoForm(f => ({...f, token:e.target.value}))} placeholder="github_pat_..."/>
            <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
              Generá el token en: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → New token → Repository permissions → Contents: Read & Write
            </div>
            {repoForm.owner && repoForm.repo && (
              <div style={{ marginTop:10, fontSize:11, color:"#666", background:"#f9f9f9", padding:"8px 10px", borderRadius:6 }}>
                URL resultante: <code>https://{repoForm.owner}.github.io/{repoForm.repo}/[nombre-servicio]/</code>
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
      <div style={{ padding:"10px 18px 14px", background:"#fff", borderTop:"1px solid #ece8ff", flexShrink:0 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder='"Crear catálogo Xbox ES" · "Configurar planilla" · "Configurar repositorio" · "Ayuda"'
            style={{ flex:1, padding:"10px 14px", border:"1.5px solid #ddd", borderRadius:10, fontSize:13, outline:"none", fontFamily:"inherit" }}
          />
          <button onClick={handleSend} disabled={loading} style={{ ...btnP, padding:"0 18px", fontSize:16, opacity:loading ? .5 : 1 }}>→</button>
        </div>
      </div>
    </div>
  );
}
