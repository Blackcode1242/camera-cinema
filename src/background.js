import OBR from "@owlbear-rodeo/sdk";

const ID = "io.github.blackcode1242.camera-cinema";
const ICON = new URL("icon.svg", window.location.href).href;
const HUD_URL = new URL("hud.html", window.location.href).href;

const TOOL_ID = `${ID}/tool`;
const MODE_ID = `${ID}/mode`;
const HUD_ID = `${ID}/hud`;
const FADE_ID = `${ID}/fade`;
const CH_CAM = `${ID}/cam`;              // mestre -> jogadores
const CH_HUD = `${ID}/hud-state`;        // fundo -> indicador (local)
const CH_HUD_READY = `${ID}/hud-ready`;  // indicador -> fundo (local)

// ====== CONFIGURAÇÃO (ajuste ao gosto) ======
const CFG = {
  // movimento
  panSpeed: 900,    // px de tela por segundo (velocidade máx.)
  fastMult: 2.2,    // multiplicador do modo rápido (Shift)
  slowMult: 0.35,   // multiplicador do modo lento (Alt)
  accel: 4.5,       // maior = atinge a velocidade mais rápido
  friction: 3.2,    // menor = desliza mais ao soltar a tecla
  zoomSpeed: 1.2,   // fator exponencial de zoom por segundo
  zoomAccel: 5,
  zoomFriction: 4,
  minScale: 0.05,
  maxScale: 8,
  tickMs: 16,

  // seguir token / seguir mestre (maior = acompanha mais rápido)
  followRate: 3,
  gmFollowRate: 6,

  // foco dramático (dolly)
  dollyDuration: 2800,  // ms
  dollyMaxScale: 3,     // zoom máximo do dolly
  dollyPadding: 2.4,    // folga em volta do alvo (maior = mais afastado)

  // câmera do mestre
  lookDuration: 2200,   // ms do "olhem isso"
  liveMs: 100,          // intervalo de envio da transmissão ao vivo

  // limites do mapa
  boundsDefault: true,  // começa ligado?
  boundsMargin: 0.1,    // quanto pode passar da borda (fração do tamanho do mapa)

  // inércia do scroll (observa o zoom nativo e continua o movimento)
  wheelGlide: { enabled: true, pollMs: 60, minRate: 0.3, gain: 0.9 },

  // corte animado ao trocar de cena
  intro: { enabled: true, fade: true, fadeMs: 1100, flyMs: 2600, startZoom: 1.6, padding: 1.15, delay: 300 },

  // indicador na tela
  hud: { enabled: true, bottom: 24 },
};

// ====== MAPA DE TECLAS (troque aqui pelas teclas que preferir) ======
// Teclas que já têm atalho no Owlbear (evitar): W S D F M Q T
// Use o nome da tecla em "code": KeyA..KeyZ, Digit0..Digit9, ArrowUp, Home, Space, etc.
const KEYMAP = {
  up:       ["KeyI", "ArrowUp"],
  down:     ["KeyK", "ArrowDown"],
  left:     ["KeyJ", "ArrowLeft"],
  right:    ["KeyL", "ArrowRight"],
  zoomIn:   ["KeyZ"],
  zoomOut:  ["KeyX"],
  fast:     ["ShiftLeft", "ShiftRight"],  // liga/desliga
  slow:     ["AltLeft", "AltRight"],      // liga/desliga
  reset:    ["KeyR", "Home"],             // enquadra o mapa inteiro
  follow:   ["KeyG"],                     // seguir o token selecionado
  dolly:    ["KeyH"],                     // foco dramático / voltar
  bounds:   ["KeyB"],                     // liga/desliga limites do mapa
  followGM: ["KeyN"],                     // seguir o mestre (jogadores)
  look:     ["KeyU"],                     // mestre: "olhem isso"
  live:     ["KeyO"],                     // mestre: transmitir câmera ao vivo
};
const ONESHOT = new Set(["fast", "slow", "reset", "follow", "dolly", "bounds", "followGM", "look", "live"]);

const CODE_TO_ACTION = new Map();
for (const [action, codes] of Object.entries(KEYMAP)) {
  for (const c of codes) CODE_TO_ACTION.set(c, action);
}

// ====== UTILIDADES ======
const noop = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function notify(msg, variant = "DEFAULT") {
  try { Promise.resolve(OBR.notification.show(msg, variant)).catch(noop); } catch { /* ignore */ }
}

// ====== ESTADO ======
const held = new Set();       // direções/zoom segurados
const keyDown = new Map();    // teclas de um toque já apertadas (evita auto-repeat)
let speedMode = null;         // null | "fast" | "slow"
let modeActive = false;
let role = "PLAYER";

// câmera: centro em coordenadas do mundo + escala (a posição da tela é derivada)
const cam = { cx: 0, cy: 0, scale: 1, w: 0, h: 0 };
let lastSent = { x: 0, y: 0, scale: 1 };
let vx = 0, vy = 0, vz = 0;
let running = false, timer = null, startPromise = null, lastT = 0;

let anim = null;              // voo suave de câmera
let followIds = null;         // ids do token seguido
let followTarget = null;      // centro atual do token seguido
let followFetching = false, followFetchT = 0;
let dollyReturn = null;       // câmera anterior ao dolly
let followGM = false;         // jogador seguindo o mestre
let gmTarget = null;          // alvo recebido do mestre
let liveTimer = null, lastLive = null;

let mapBounds = null;
let boundsOn = CFG.boundsDefault;
let unsubItems = null, boundsDebounce = null;

let lastPointerWorld = null;  // para ancorar a inércia do scroll no cursor
let glideActive = false, glideAnchor = null, lastExtCheck = 0, extChecking = false;
const wheel = { lastScale: null, lastT: 0, vz: 0, moving: false };
let wheelTimer = null;

let hudOpen = false, hudTimer = null, lastHudJson = "";

// ====== TECLAS ======
function toAction(ev) {
  if (ev.code) return CODE_TO_ACTION.get(ev.code) ?? null;
  const k = ev.key || "";
  const code =
    k.length === 1 && /[a-z]/i.test(k) ? "Key" + k.toUpperCase() :
    k === "Shift" ? "ShiftLeft" :
    k === "Alt" ? "AltLeft" : k;
  return CODE_TO_ACTION.get(code) ?? null;
}

// ====== SINCRONIA COM O VIEWPORT ======
async function syncFromViewport() {
  const [pos, scale, w, h] = await Promise.all([
    OBR.viewport.getPosition(),
    OBR.viewport.getScale(),
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
  ]);
  cam.scale = scale;
  cam.w = w;
  cam.h = h;
  cam.cx = (w / 2 - pos.x) / scale;
  cam.cy = (h / 2 - pos.y) / scale;
  lastSent = { x: pos.x, y: pos.y, scale };
}

function push() {
  const x = cam.w / 2 - cam.cx * cam.scale;
  const y = cam.h / 2 - cam.cy * cam.scale;
  if (Math.abs(Math.log(cam.scale / lastSent.scale)) > 1e-6) {
    Promise.resolve(OBR.viewport.setScale(cam.scale)).catch(noop);
    lastSent.scale = cam.scale;
  }
  if (Math.abs(x - lastSent.x) > 0.01 || Math.abs(y - lastSent.y) > 0.01) {
    Promise.resolve(OBR.viewport.setPosition({ x, y })).catch(noop);
    lastSent.x = x;
    lastSent.y = y;
  }
}

function startLoop() {
  if (running) return startPromise ?? Promise.resolve();
  running = true;
  startPromise = (async () => {
    try { await syncFromViewport(); } catch { /* cena não pronta */ }
    lastT = performance.now();
    timer = setInterval(tick, CFG.tickMs);
  })();
  return startPromise;
}

function stopLoop() {
  clearInterval(timer);
  running = false;
  startPromise = null;
  vx = vy = vz = 0;
  glideActive = false;
  glideAnchor = null;
  wheel.lastScale = null;
  wheel.moving = false;
}

// ====== ZOOM ======
function zoomBy(dLn, anchor) {
  const s0 = cam.scale;
  const s1 = clamp(s0 * Math.exp(dLn), CFG.minScale, CFG.maxScale);
  if (anchor) {
    // mantém o ponto do mundo sob o cursor parado na tela
    const px = cam.cx + (anchor.x - cam.w / 2) / s0;
    const py = cam.cy + (anchor.y - cam.h / 2) / s0;
    cam.cx = px - (anchor.x - cam.w / 2) / s1;
    cam.cy = py - (anchor.y - cam.h / 2) / s1;
  }
  cam.scale = s1;
}

// ====== LIMITES DO MAPA ======
function applyBounds() {
  if (!boundsOn || !mapBounds) return;
  const m = CFG.boundsMargin * Math.max(mapBounds.width, mapBounds.height);
  const minX = mapBounds.min.x - m, maxX = mapBounds.max.x + m;
  const minY = mapBounds.min.y - m, maxY = mapBounds.max.y + m;
  if (cam.cx < minX) { cam.cx = minX; vx = Math.max(vx, 0); }
  if (cam.cx > maxX) { cam.cx = maxX; vx = Math.min(vx, 0); }
  if (cam.cy < minY) { cam.cy = minY; vy = Math.max(vy, 0); }
  if (cam.cy > maxY) { cam.cy = maxY; vy = Math.min(vy, 0); }
}

async function refreshBounds() {
  try {
    let items = await OBR.scene.items.getItems((i) => i.layer === "MAP");
    if (!items.length) items = await OBR.scene.items.getItems();
    if (!items.length) { mapBounds = null; return; }
    mapBounds = await OBR.scene.items.getItemBounds(items.map((i) => i.id));
  } catch {
    mapBounds = null;
  }
}

function fitScaleFor(b, padding) {
  return clamp(Math.min(cam.w / (b.width * padding), cam.h / (b.height * padding)), CFG.minScale, CFG.maxScale);
}

function subscribeItems() {
  if (unsubItems) return;
  try {
    unsubItems = OBR.scene.items.onChange(() => {
      if (!boundsOn) return;
      clearTimeout(boundsDebounce);
      boundsDebounce = setTimeout(refreshBounds, 1500);
    });
  } catch { unsubItems = null; }
}

function unsubscribeItems() {
  try { unsubItems?.(); } catch { /* ignore */ }
  unsubItems = null;
  clearTimeout(boundsDebounce);
}

// ====== VOO SUAVE ======
async function flyTo(t, duration, ease = easeInOutCubic) {
  await startLoop();
  anim = {
    c0x: cam.cx, c0y: cam.cy, s0: cam.scale,
    c1x: t.cx, c1y: t.cy, s1: clamp(t.scale, CFG.minScale, CFG.maxScale),
    t0: performance.now(), dur: Math.max(1, duration), ease,
  };
  vx = vy = vz = 0;
  glideActive = false;
}

function cancelAuto() {
  anim = null;
  gmTarget = null;
  if (followIds) { followIds = null; followTarget = null; notify("🎯 Seguir token: desativado"); }
  if (followGM) { followGM = false; notify("👁 Você parou de seguir o mestre (N para voltar)"); }
  updateHudVisibility();
}

// ====== LOOP PRINCIPAL ======
function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  const dirX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const dirY = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
  const dirZ = (held.has("zoomIn") ? 1 : 0) - (held.has("zoomOut") ? 1 : 0);
  const manual = dirX || dirY || dirZ;

  if (manual && (anim || gmTarget || followIds || followGM)) cancelAuto();

  let busy = false;

  if (!manual && anim) {
    // voo suave (dolly, corte de cena, "olhem isso", reset)
    const p = clamp((now - anim.t0) / anim.dur, 0, 1);
    const e = anim.ease(p);
    cam.cx = anim.c0x + (anim.c1x - anim.c0x) * e;
    cam.cy = anim.c0y + (anim.c1y - anim.c0y) * e;
    cam.scale = Math.exp(Math.log(anim.s0) + (Math.log(anim.s1) - Math.log(anim.s0)) * e);
    vx = vy = vz = 0;
    busy = true;
    if (p >= 1) anim = null;
  } else if (!manual && followIds) {
    // seguir token com suavização
    if (!followFetching && now - followFetchT > 80) fetchFollow();
    if (followTarget) {
      const k = 1 - Math.exp(-CFG.followRate * dt);
      cam.cx += (followTarget.x - cam.cx) * k;
      cam.cy += (followTarget.y - cam.cy) * k;
    }
    vx = vy = vz = 0;
    busy = true;
  } else if (!manual && gmTarget) {
    // seguir o mestre com suavização
    const k = 1 - Math.exp(-CFG.gmFollowRate * dt);
    cam.cx += (gmTarget.cx - cam.cx) * k;
    cam.cy += (gmTarget.cy - cam.cy) * k;
    cam.scale = Math.exp(Math.log(cam.scale) + (Math.log(gmTarget.scale) - Math.log(cam.scale)) * k);
    vx = vy = vz = 0;
    busy = true;
    const closePx = Math.hypot(gmTarget.cx - cam.cx, gmTarget.cy - cam.cy) * cam.scale;
    if (closePx < 0.5 && Math.abs(Math.log(gmTarget.scale / cam.scale)) < 0.002) gmTarget = null;
  } else {
    // movimento manual com inércia
    const mult = speedMode === "fast" ? CFG.fastMult : speedMode === "slow" ? CFG.slowMult : 1;
    const len = Math.hypot(dirX, dirY) || 1;
    const moving = dirX || dirY;
    vx = approach(vx, (dirX / len) * CFG.panSpeed * mult, moving ? CFG.accel : CFG.friction, dt);
    vy = approach(vy, (dirY / len) * CFG.panSpeed * mult, moving ? CFG.accel : CFG.friction, dt);
    vz = approach(vz, dirZ * CFG.zoomSpeed * mult, dirZ ? CFG.zoomAccel : CFG.zoomFriction, dt);

    const quiet = Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5 && Math.abs(vz) < 0.001;
    if (quiet && !manual) {
      vx = vy = vz = 0;
      glideActive = false;
      glideAnchor = null;
    } else {
      if (Math.abs(vz) > 0.0001) zoomBy(vz * dt, !dirZ && glideAnchor ? glideAnchor : null);
      cam.cx += (vx * dt) / cam.scale;
      cam.cy += (vy * dt) / cam.scale;
      busy = true;
      if (glideActive && !dirZ && now - lastExtCheck > 150) checkExternalZoom();
    }
  }

  applyBounds();
  push();

  if (!busy && !manual) {
    stopLoop();
    pushHud();
  }
}

// ====== SEGUIR TOKEN ======
async function fetchFollow() {
  followFetching = true;
  followFetchT = performance.now();
  try {
    const b = await OBR.scene.items.getItemBounds(followIds);
    followTarget = { x: b.center.x, y: b.center.y };
  } catch {
    followIds = null;
    followTarget = null;
    notify("🎯 O token seguido não existe mais", "WARNING");
    updateHudVisibility();
  } finally {
    followFetching = false;
  }
}

async function toggleFollow() {
  if (followIds) {
    followIds = null;
    followTarget = null;
    notify("🎯 Seguir token: desativado");
    updateHudVisibility();
    return;
  }
  let ids = [];
  try { ids = await OBR.player.getSelection(); } catch { /* ignore */ }
  if (!ids || !ids.length) { notify("Selecione um token para seguir (G)", "WARNING"); return; }
  anim = null;
  gmTarget = null;
  followIds = ids;
  followTarget = null;
  await startLoop();
  await fetchFollow();
  if (followIds) notify("🎯 Seguindo o token selecionado (G para parar)", "SUCCESS");
  updateHudVisibility();
}

// ====== FOCO DRAMÁTICO (DOLLY) ======
async function dolly() {
  await startLoop();
  if (dollyReturn) {
    const back = dollyReturn;
    dollyReturn = null;
    followIds = null;
    notify("🎬 Voltando");
    await flyTo(back, CFG.dollyDuration, easeInOutCubic);
    return;
  }
  let ids = [];
  try { ids = await OBR.player.getSelection(); } catch { /* ignore */ }
  if (!ids || !ids.length) { notify("Selecione um token ou área para o foco (H)", "WARNING"); return; }
  let b;
  try { b = await OBR.scene.items.getItemBounds(ids); } catch { return; }
  followIds = null;
  dollyReturn = { cx: cam.cx, cy: cam.cy, scale: cam.scale };
  const fit = Math.min(cam.w / (Math.max(b.width, 1) * CFG.dollyPadding), cam.h / (Math.max(b.height, 1) * CFG.dollyPadding));
  const target = clamp(Math.min(fit, CFG.dollyMaxScale), CFG.minScale, CFG.maxScale);
  notify("🎬 Foco dramático (H para voltar)");
  await flyTo({ cx: b.center.x, cy: b.center.y, scale: target }, CFG.dollyDuration, easeInOutCubic);
  updateHudVisibility();
}

// ====== LIMITES / VELOCIDADE / RESET ======
async function toggleBounds() {
  boundsOn = !boundsOn;
  if (boundsOn) {
    await refreshBounds();
    notify(mapBounds ? "🔒 Limites do mapa: ATIVADOS" : "🔒 Limites ativados, mas não achei o mapa", mapBounds ? "SUCCESS" : "WARNING");
  } else {
    notify("🔓 Limites do mapa: desativados");
  }
  pushHud();
}

function toggleSpeed(mode) {
  speedMode = speedMode === mode ? null : mode;
  const msg =
    speedMode === "fast" ? "⚡ Câmera rápida: ATIVADA" :
    speedMode === "slow" ? "🐢 Câmera lenta: ATIVADA" :
    "Velocidade normal";
  notify(msg, speedMode ? "SUCCESS" : "DEFAULT");
  pushHud();
}

async function resetView() {
  await startLoop();
  followIds = null;
  gmTarget = null;
  dollyReturn = null;
  await refreshBounds();
  if (mapBounds) {
    await flyTo({ cx: mapBounds.center.x, cy: mapBounds.center.y, scale: fitScaleFor(mapBounds, 1.1) }, 1400, easeInOutCubic);
  } else {
    await flyTo({ cx: 0, cy: 0, scale: 1 }, 1400, easeInOutCubic);
  }
  updateHudVisibility();
}

// ====== INÉRCIA DO SCROLL ======
// O Owlbear não repassa o evento da roda do mouse para extensões. Então observamos o
// zoom nativo e, quando o scroll para, continuamos o movimento com a mesma inércia.
async function wheelWatch() {
  if (!CFG.wheelGlide.enabled || !modeActive || running) return;
  let s;
  try { s = await OBR.viewport.getScale(); } catch { return; }
  const t = performance.now();
  if (wheel.lastScale == null) { wheel.lastScale = s; wheel.lastT = t; return; }
  const dtw = (t - wheel.lastT) / 1000;
  const rate = dtw > 0 ? Math.log(s / wheel.lastScale) / dtw : 0;
  wheel.lastScale = s;
  wheel.lastT = t;
  if (Math.abs(rate) > CFG.wheelGlide.minRate) {
    wheel.vz = wheel.vz * 0.5 + rate * 0.5;
    wheel.moving = true;
  } else if (wheel.moving) {
    wheel.moving = false;
    const v = wheel.vz * CFG.wheelGlide.gain;
    wheel.vz = 0;
    glideStart(v);
  }
}

async function glideStart(v) {
  if (running || Math.abs(v) < 0.05) return;
  await startLoop();
  vz = clamp(v, -3, 3);
  glideActive = true;
  glideAnchor = lastPointerWorld
    ? {
        x: (lastPointerWorld.x - cam.cx) * cam.scale + cam.w / 2,
        y: (lastPointerWorld.y - cam.cy) * cam.scale + cam.h / 2,
      }
    : null;
  lastExtCheck = performance.now();
}

// se o usuário voltar a girar a roda durante a inércia, cancela a nossa
async function checkExternalZoom() {
  if (extChecking) return;
  extChecking = true;
  lastExtCheck = performance.now();
  try {
    const s = await OBR.viewport.getScale();
    if (Math.abs(Math.log(s / cam.scale)) > 0.02) {
      vz = 0;
      glideActive = false;
      glideAnchor = null;
      await syncFromViewport();
    }
  } catch { /* ignore */ }
  extChecking = false;
}

// ====== CÂMERA DO MESTRE ======
function sendCam(type) {
  const payload = { type, cx: cam.cx, cy: cam.cy, W: cam.w / cam.scale, H: cam.h / cam.scale };
  Promise.resolve(OBR.broadcast.sendMessage(CH_CAM, payload, { destination: "REMOTE" })).catch(noop);
}

async function lookAtThis() {
  if (role !== "GM") { notify("Só o mestre pode enviar a câmera", "WARNING"); return; }
  if (!running) { try { await syncFromViewport(); } catch { return; } }
  sendCam("look");
  notify("📡 Câmera enviada aos jogadores", "SUCCESS");
}

async function toggleLive() {
  if (role !== "GM") { notify("Só o mestre pode transmitir a câmera", "WARNING"); return; }
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
    lastLive = null;
    notify("📡 Transmissão ao vivo: desligada");
    updateHudVisibility();
    return;
  }
  liveTimer = setInterval(liveTick, CFG.liveMs);
  lastLive = null;
  notify("📡 Transmissão ao vivo: LIGADA", "SUCCESS");
  updateHudVisibility();
}

async function liveTick() {
  try {
    if (!running) await syncFromViewport();
  } catch { return; }
  const sig = `${cam.cx.toFixed(1)}|${cam.cy.toFixed(1)}|${cam.scale.toFixed(4)}`;
  if (sig === lastLive) return;
  lastLive = sig;
  sendCam("live");
}

function toggleFollowGM() {
  followGM = !followGM;
  if (!followGM) gmTarget = null;
  notify(followGM ? "👁 Seguindo o mestre (N para parar)" : "👁 Parou de seguir o mestre", followGM ? "SUCCESS" : "DEFAULT");
  updateHudVisibility();
  pushHud();
}

async function onGmMessage(data) {
  if (!followGM || !data || typeof data.cx !== "number") return;
  await startLoop();
  const scale = clamp(Math.min(cam.w / data.W, cam.h / data.H), CFG.minScale, CFG.maxScale);
  if (data.type === "look") {
    gmTarget = null;
    followIds = null;
    await flyTo({ cx: data.cx, cy: data.cy, scale }, CFG.lookDuration, easeInOutCubic);
  } else if (!anim) {
    gmTarget = { cx: data.cx, cy: data.cy, scale };
  }
}

// ====== INDICADOR NA TELA (HUD) ======
async function openHud() {
  if (!CFG.hud.enabled || hudOpen) return;
  hudOpen = true;
  try {
    const w = await OBR.viewport.getWidth();
    const h = await OBR.viewport.getHeight();
    await OBR.popover.open({
      id: HUD_ID,
      url: HUD_URL,
      width: 380,
      height: 44,
      anchorReference: "POSITION",
      anchorPosition: { left: w / 2, top: h - CFG.hud.bottom },
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      hidePaper: true,
      disableClickAway: true,
      marginThickness: 0,
    });
  } catch (e) {
    hudOpen = false;
    console.warn("[Camera Cinema] não consegui abrir o indicador", e);
    return;
  }
  lastHudJson = "";
  hudTimer = setInterval(pushHud, 250);
}

function closeHud() {
  if (!hudOpen) return;
  hudOpen = false;
  clearInterval(hudTimer);
  hudTimer = null;
  lastHudJson = "";
  Promise.resolve(OBR.popover.close(HUD_ID)).catch(noop);
}

function updateHudVisibility() {
  const want = CFG.hud.enabled && (modeActive || !!followIds || followGM || !!liveTimer);
  if (want) openHud(); else closeHud();
}

async function pushHud() {
  if (!hudOpen) return;
  if (!running) {
    try { cam.scale = await OBR.viewport.getScale(); } catch { /* ignore */ }
  }
  const state = {
    zoom: Math.round(cam.scale * 100),
    speed: speedMode,
    follow: !!followIds,
    dolly: !!dollyReturn,
    gm: followGM,
    live: !!liveTimer,
    bounds: boundsOn && !!mapBounds,
    role,
  };
  const json = JSON.stringify(state);
  if (json === lastHudJson) return;
  lastHudJson = json;
  Promise.resolve(OBR.broadcast.sendMessage(CH_HUD, state, { destination: "LOCAL" })).catch(noop);
}

// ====== CORTE ANIMADO AO TROCAR DE CENA ======
async function openFade() {
  try {
    const w = await OBR.viewport.getWidth();
    const h = await OBR.viewport.getHeight();
    await OBR.popover.open({
      id: FADE_ID,
      url: `${HUD_URL}#fade=${CFG.intro.fadeMs}`,
      width: w,
      height: h,
      anchorReference: "POSITION",
      anchorPosition: { left: 0, top: 0 },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
      marginThickness: 0,
    });
    await sleep(250); // dá tempo da tela preta carregar antes de mexer na câmera
    return true;
  } catch {
    return false;
  }
}

async function introCut() {
  if (!CFG.intro.enabled) return;
  await sleep(CFG.intro.delay);
  await refreshBounds();
  if (!mapBounds) return;
  const faded = CFG.intro.fade ? await openFade() : false;
  await startLoop();
  const fit = fitScaleFor(mapBounds, CFG.intro.padding);
  anim = null;
  followIds = null;
  dollyReturn = null;
  cam.cx = mapBounds.center.x;
  cam.cy = mapBounds.center.y;
  cam.scale = clamp(fit * CFG.intro.startZoom, CFG.minScale, CFG.maxScale);
  push();
  await flyTo({ cx: mapBounds.center.x, cy: mapBounds.center.y, scale: fit }, CFG.intro.flyMs, easeOutCubic);
  if (faded) setTimeout(() => Promise.resolve(OBR.popover.close(FADE_ID)).catch(noop), CFG.intro.fadeMs + 400);
}

// ====== AÇÕES DE UM TOQUE ======
const ACTIONS = {
  fast: () => toggleSpeed("fast"),
  slow: () => toggleSpeed("slow"),
  reset: resetView,
  follow: toggleFollow,
  dolly,
  bounds: toggleBounds,
  followGM: toggleFollowGM,
  look: lookAtThis,
  live: toggleLive,
};

// ====== INICIALIZAÇÃO ======
OBR.onReady(() => {
  console.log("[Camera Cinema] carregada v6");
  window.addEventListener("blur", () => { held.clear(); keyDown.clear(); });

  // papel do jogador (mestre ou jogador)
  Promise.resolve(OBR.player.getRole()).then((r) => { role = r; }).catch(noop);
  try { OBR.player.onChange((p) => { role = p.role; }); } catch { /* ignore */ }

  // mensagens do mestre e pedidos do indicador
  try {
    OBR.broadcast.onMessage(CH_CAM, (e) => onGmMessage(e.data));
    OBR.broadcast.onMessage(CH_HUD_READY, () => { lastHudJson = ""; pushHud(); });
  } catch { /* ignore */ }

  // cena pronta: limites do mapa e corte animado
  try {
    OBR.scene.onReadyChange((ready) => {
      if (ready) { subscribeItems(); introCut(); }
      else { mapBounds = null; unsubscribeItems(); }
    });
    Promise.resolve(OBR.scene.isReady()).then(async (ready) => {
      if (ready) { subscribeItems(); await refreshBounds(); }
    }).catch(noop);
  } catch { /* ignore */ }

  OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema" }],
    defaultMode: MODE_ID,
  });

  OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema", filter: { activeTools: [TOOL_ID] } }],
    shortcut: "C",
    onActivate: () => {
      modeActive = true;
      updateHudVisibility();
      clearInterval(wheelTimer);
      wheelTimer = setInterval(wheelWatch, CFG.wheelGlide.pollMs);
    },
    onDeactivate: () => {
      modeActive = false;
      held.clear();
      keyDown.clear();
      clearInterval(wheelTimer);
      wheelTimer = null;
      updateHudVisibility();
    },
    onToolMove: (_ctx, event) => {
      if (event && event.pointerPosition) lastPointerWorld = event.pointerPosition;
    },
    onKeyDown: (_ctx, event) => {
      const a = toAction(event);
      if (!a) return;
      event.preventDefault?.();

      if (ONESHOT.has(a)) {
        const t = performance.now();
        const last = keyDown.get(a);
        // ignora auto-repeat enquanto a tecla está segurada (tolerância caso o keyup se perca)
        if (last !== undefined && t - last < 2000) return;
        keyDown.set(a, t);
        ACTIONS[a]();
        return;
      }

      held.add(a);
      startLoop();
    },
    onKeyUp: (_ctx, event) => {
      const a = toAction(event);
      if (!a) return;
      if (ONESHOT.has(a)) { keyDown.delete(a); return; }
      held.delete(a);
    },
  });
});
