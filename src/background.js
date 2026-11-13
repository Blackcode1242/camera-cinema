import OBR from "@owlbear-rodeo/sdk";

const ID = "io.github.blackcode1242.camera-cinema";
const ICON = new URL("icon.svg", window.location.href).href;
const FADE_URL = new URL("fade.html", window.location.href).href;

const TOOL_ID = `${ID}/tool`;
const MODE_ID = `${ID}/mode`;
const FADE_ID = `${ID}/fade`;
const FADE_CHANNEL = `${ID}/fade-control`;
const CH_CAM = `${ID}/cam`;              // mestre -> jogadores

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

  // corte animado ao trocar de cena
  intro: { enabled: true, fade: true, fadeMs: 3600, flyMs: 3600, startZoom: 1.7, padding: 1.15, delay: 250, departureFadeMs: 900, departureFlyMs: 1100, departureZoom: 1.45 },

};

// ====== MAPA DE TECLAS (troque aqui pelas teclas que preferir) ======
// Teclas que já têm atalho no Owlbear (evitar): W S D F H M Q T
// Use o nome da tecla em "code": KeyA..KeyZ, Digit0..Digit9, ArrowUp, Home, Space, etc.
const KEYMAP = {
  up:       ["KeyI", "ArrowUp"],
  down:     ["KeyK", "ArrowDown"],
  left:     ["KeyJ", "ArrowLeft"],
  right:    ["KeyL", "ArrowRight"],
  zoomIn:   ["KeyZ"],
  zoomOut:  ["KeyX"],
  fast:     ["ShiftLeft", "ShiftRight"],  // liga/desliga
  slow:     ["ControlLeft", "ControlRight"], // liga/desliga
  reset:    ["KeyR", "Home"],             // enquadra o mapa inteiro
  follow:   ["KeyG"],                     // seguir o token selecionado
  dolly:    ["KeyY"],                     // foco dramático / voltar
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

// Controle da camada preta entre a página de fundo e o iframe do popover.
let fadeChannel = null;
let fadeFrameReady = false;
let fadePendingReveal = false;
let fadeReadyResolve = null;
let fadeOpened = false;
let fadeOpening = null;
let fadePendingCoverDuration = null;
let fadeCoverTask = null;
let departureTask = null;
let hasActiveScene = false;
let sceneGeneration = 0;
let lastSceneReady = null;
let sceneReadyEventReceived = false;


// ====== TECLAS ======
function toAction(ev) {
  if (ev.code) return CODE_TO_ACTION.get(ev.code) ?? null;
  const k = ev.key || "";
  const code =
    k.length === 1 && /[a-z]/i.test(k) ? "Key" + k.toUpperCase() :
    k === "Shift" ? "ShiftLeft" :
    k === "Control" ? "ControlLeft" : k;
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
}

// ====== ZOOM ======
function zoomBy(dLn) {
  cam.scale = clamp(cam.scale * Math.exp(dLn), CFG.minScale, CFG.maxScale);
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
  } catch (error) {
    mapBounds = null;
    console.warn("[Camera Cinema] Falha ao calcular os limites do mapa", error);
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
}

function cancelAuto() {
  anim = null;
  gmTarget = null;
  if (followIds) { followIds = null; followTarget = null; notify("🎯 Seguir token: desativado"); }
  if (followGM) { followGM = false; notify("👁 Você parou de seguir o mestre (N para voltar)"); }
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
    } else {
      if (Math.abs(vz) > 0.0001) zoomBy(vz * dt);
      cam.cx += (vx * dt) / cam.scale;
      cam.cy += (vy * dt) / cam.scale;
      busy = true;
    }
  }

  applyBounds();
  push();

  if (!busy && !manual) {
    stopLoop();
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
  } finally {
    followFetching = false;
  }
}

async function toggleFollow() {
  if (followIds) {
    followIds = null;
    followTarget = null;
    notify("🎯 Seguir token: desativado");
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
  if (!ids || !ids.length) { notify("Selecione um token ou área para o foco (Y)", "WARNING"); return; }
  let b;
  try { b = await OBR.scene.items.getItemBounds(ids); } catch { return; }
  followIds = null;
  dollyReturn = { cx: cam.cx, cy: cam.cy, scale: cam.scale };
  const fit = Math.min(cam.w / (Math.max(b.width, 1) * CFG.dollyPadding), cam.h / (Math.max(b.height, 1) * CFG.dollyPadding));
  const target = clamp(Math.min(fit, CFG.dollyMaxScale), CFG.minScale, CFG.maxScale);
  notify("🎬 Foco dramático (Y para voltar)");
  await flyTo({ cx: b.center.x, cy: b.center.y, scale: target }, CFG.dollyDuration, easeInOutCubic);
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
}

function toggleSpeed(mode) {
  speedMode = speedMode === mode ? null : mode;
  const msg =
    speedMode === "fast" ? "⚡ Câmera rápida: ATIVADA" :
    speedMode === "slow" ? "🐢 Câmera lenta: ATIVADA" :
    "Velocidade normal";
  notify(msg, speedMode ? "SUCCESS" : "DEFAULT");
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
    return;
  }
  liveTimer = setInterval(liveTick, CFG.liveMs);
  lastLive = null;
  notify("📡 Transmissão ao vivo: LIGADA", "SUCCESS");
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

// ====== CORTE ANIMADO AO TROCAR DE CENA ======
function initFadeChannel() {
  if (fadeChannel) return;
  try {
    fadeChannel = new BroadcastChannel(FADE_CHANNEL);
    fadeChannel.addEventListener("message", (event) => {
      if (event.data?.type !== "ready") return;
      fadeFrameReady = true;
      fadeReadyResolve?.();
      fadeReadyResolve = null;
      if (fadePendingCoverDuration !== null) {
        const duration = fadePendingCoverDuration;
        fadePendingCoverDuration = null;
        fadeChannel.postMessage({ type: "cover", duration });
      }
      if (fadePendingReveal) {
        fadePendingReveal = false;
        fadeChannel.postMessage({ type: "reveal", duration: CFG.intro.fadeMs });
      }
    });
  } catch (error) {
    console.warn("[Camera Cinema] Não foi possível iniciar o canal do fade", error);
  }
}

async function openFade({ transparentStart = false } = {}) {
  if (fadeOpened) return true;
  if (fadeOpening) return fadeOpening;

  fadeOpening = (async () => {
    try {
      initFadeChannel();
      fadeFrameReady = false;
      const readySignal = new Promise((resolve) => { fadeReadyResolve = resolve; });
      const startMode = transparentStart ? "?start=transparent" : "";

      await OBR.modal.open({
        id: FADE_ID,
        url: `${FADE_URL}${startMode}#${CFG.intro.fadeMs}`,
        fullScreen: true,
        hideBackdrop: true,
        hidePaper: true,
        disablePointerEvents: true,
      });

      fadeOpened = true;
      await Promise.race([readySignal, sleep(1500)]);
      return true;
    } catch (error) {
      console.error("[Camera Cinema] Falha ao abrir a camada de transição", error);
      notify("Câmera Cinema: não foi possível abrir a tela de transição.", "WARNING");
      return false;
    } finally {
      fadeOpening = null;
    }
  })();

  return fadeOpening;
}

function coverFade(duration = CFG.intro.departureFadeMs) {
  if (!fadeOpened) return Promise.resolve();

  if (fadeFrameReady) {
    fadeChannel?.postMessage({ type: "cover", duration });
  } else {
    fadePendingCoverDuration = duration;
  }

  const task = sleep(duration + 120).finally(() => {
    if (fadeCoverTask === task) fadeCoverTask = null;
  });
  fadeCoverTask = task;
  return task;
}

async function revealFade(duration = CFG.intro.fadeMs) {
  if (fadeOpening) await fadeOpening;
  if (!fadeOpened) return;

  if (fadeFrameReady) {
    fadeChannel?.postMessage({ type: "reveal", duration });
  } else {
    fadePendingReveal = true;
  }

  await sleep(duration + 220);
  try { await OBR.modal.close(FADE_ID); } catch (error) {
    console.warn("[Camera Cinema] Não foi possível fechar a camada de transição", error);
  }
  fadeOpened = false;
  fadeFrameReady = false;
  fadePendingReveal = false;
  fadePendingCoverDuration = null;
  fadeReadyResolve = null;
  fadeCoverTask = null;
  try { fadeChannel?.close(); } catch { /* ignore */ }
  fadeChannel = null;
}

function viewportPositionFor(center, scale, width, height) {
  return {
    x: width / 2 - center.x * scale,
    y: height / 2 - center.y * scale,
  };
}

async function animateViewportTransform(target, duration, generation, ease = easeInOutCubic) {
  const [startPosition, startScale, width, height] = await Promise.all([
    OBR.viewport.getPosition(),
    OBR.viewport.getScale(),
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
  ]);

  if (!width || !height || !Number.isFinite(startScale) || !target?.position || !Number.isFinite(target.scale)) {
    throw new Error("O Owlbear não retornou uma transformação de câmera válida.");
  }

  const startedAt = performance.now();
  const totalDuration = Math.max(1, duration);
  let progress = 0;

  // Envia transformações reais ao Owlbear em passos regulares. animateTo()
  // não oferece controle de duração; esta interpolação permite o timing cinematográfico.
  while (progress < 1) {
    if (generation !== sceneGeneration) return false;

    progress = clamp((performance.now() - startedAt) / totalDuration, 0, 1);
    const eased = ease(progress);
    const scale = Math.exp(
      Math.log(startScale) + (Math.log(target.scale) - Math.log(startScale)) * eased
    );
    const position = {
      x: startPosition.x + (target.position.x - startPosition.x) * eased,
      y: startPosition.y + (target.position.y - startPosition.y) * eased,
    };

    await Promise.all([
      OBR.viewport.setScale(scale),
      OBR.viewport.setPosition(position),
    ]);

    if (progress < 1) await sleep(33);
  }

  if (generation === sceneGeneration) {
    await Promise.all([
      OBR.viewport.setScale(target.scale),
      OBR.viewport.setPosition(target.position),
    ]);
    try { await syncFromViewport(); } catch { /* cena pode ter começado a trocar */ }
    return true;
  }

  return false;
}

async function departureCut(generation, previousBounds) {
  if (!CFG.intro.enabled) return;

  try {
    stopLoop();
    anim = null;
    held.clear();

    const opened = CFG.intro.fade
      ? await openFade({ transparentStart: true })
      : true;

    if (opened && CFG.intro.fade) {
      // Enquanto a câmera aproxima, a camada preta fecha gradualmente.
      // Assim o corte não esconde instantaneamente o movimento de saída.
      fadeCoverTask = coverFade(CFG.intro.departureFadeMs);
    }

    const [position, scale, width, height] = await Promise.all([
      OBR.viewport.getPosition(),
      OBR.viewport.getScale(),
      OBR.viewport.getWidth(),
      OBR.viewport.getHeight(),
    ]);

    const currentCenter = {
      x: (width / 2 - position.x) / scale,
      y: (height / 2 - position.y) / scale,
    };
    const focus = previousBounds?.center ?? currentCenter;
    const targetScale = clamp(scale * CFG.intro.departureZoom, CFG.minScale, CFG.maxScale);
    const target = {
      scale: targetScale,
      position: viewportPositionFor(focus, targetScale, width, height),
    };

    const zoomTask = animateViewportTransform(
      target,
      CFG.intro.departureFlyMs,
      generation,
      easeInOutCubic
    ).catch((error) => {
      console.warn("[Camera Cinema] O zoom de saída não pôde terminar antes da troca", error);
      return false;
    });

    await Promise.all([
      zoomTask,
      fadeCoverTask ?? Promise.resolve(),
    ]);
  } catch (error) {
    console.warn("[Camera Cinema] Não foi possível animar a saída da cena", error);
    // Mesmo se a câmera já tiver sido descarregada, preserva o corte preto.
    if (CFG.intro.fade) {
      const opened = await openFade();
      if (opened) await coverFade(CFG.intro.departureFadeMs);
    }
  }
}

async function introCut(generation, previousDeparture = null) {
  if (!CFG.intro.enabled) return;

  try {
    if (previousDeparture) await previousDeparture;
    await sleep(CFG.intro.delay);
    if (generation !== sceneGeneration) return;

    await refreshBounds();

    // No primeiro carregamento abre preto; ao trocar de cena reutiliza a
    // cobertura que foi fechada durante o zoom-in da cena anterior.
    const faded = CFG.intro.fade ? await openFade() : false;
    if (fadeCoverTask) await fadeCoverTask;
    if (generation !== sceneGeneration) return;

    const [width, height] = await Promise.all([
      OBR.viewport.getWidth(),
      OBR.viewport.getHeight(),
    ]);
    if (!width || !height) throw new Error("Não foi possível ler o tamanho da câmera.");

    const center = mapBounds?.center ?? { x: 0, y: 0 };
    const fitScale = mapBounds
      ? clamp(
          Math.min(
            width / (Math.max(mapBounds.width, 1) * CFG.intro.padding),
            height / (Math.max(mapBounds.height, 1) * CFG.intro.padding)
          ),
          CFG.minScale,
          CFG.maxScale
        )
      : 1;

    const target = {
      scale: fitScale,
      position: viewportPositionFor(center, fitScale, width, height),
    };
    const startScale = clamp(fitScale * CFG.intro.startZoom, CFG.minScale, CFG.maxScale);
    const startPosition = viewportPositionFor(center, startScale, width, height);

    // A câmera começa aproximada, por trás da tela preta, e se afasta
    // enquanto o preto se dissolve. Não existe reset instantâneo aqui.
    await Promise.all([
      OBR.viewport.setScale(startScale),
      OBR.viewport.setPosition(startPosition),
    ]);
    if (generation !== sceneGeneration) return;

    const revealTask = faded ? revealFade(CFG.intro.fadeMs) : Promise.resolve();
    const zoomTask = animateViewportTransform(
      target,
      CFG.intro.flyMs,
      generation,
      easeInOutCubic
    );

    await Promise.all([zoomTask, revealTask]);
  } catch (error) {
    console.error("[Camera Cinema] Falha na introdução da cena", error);
    notify(`Câmera Cinema: falha ao enquadrar a cena. ${error?.message ?? "Verifique o console."}`, "WARNING");

    if (generation === sceneGeneration && fadeOpened) await revealFade();
  }
}

function handleSceneReady(ready) {
  if (lastSceneReady === ready) return;
  lastSceneReady = ready;

  const generation = ++sceneGeneration;
  console.log("[Camera Cinema] Estado da cena:", ready ? "pronta" : "carregando");

  if (ready) {
    hasActiveScene = true;
    subscribeItems();
    const previousDeparture = departureTask;
    departureTask = null;
    introCut(generation, previousDeparture);
  } else {
    const previousBounds = mapBounds;
    hasActiveScene = false;
    mapBounds = null;
    unsubscribeItems();

    // O SDK avisa quando a cena deixa de estar pronta, mas não oferece um
    // evento separado antes do clique nativo. Tentamos aproximar durante a
    // janela de saída e fechamos a tela antes de revelar a próxima cena.
    if (CFG.intro.enabled && hasActiveScene !== false) {
      departureTask = departureCut(generation, previousBounds);
    } else if (CFG.intro.enabled && previousBounds) {
      // previousBounds também é um sinal de que havia uma cena em uso.
      departureTask = departureCut(generation, previousBounds);
    }
  }
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
  console.log("[Camera Cinema] carregada v7");
  window.addEventListener("blur", () => { held.clear(); keyDown.clear(); });

  // papel do jogador (mestre ou jogador)
  Promise.resolve(OBR.player.getRole()).then((r) => { role = r; }).catch(noop);
  try { OBR.player.onChange((p) => { role = p.role; }); } catch { /* ignore */ }

  // mensagens do mestre e pedidos do indicador
  try {
    OBR.broadcast.onMessage(CH_CAM, (e) => onGmMessage(e.data));
  } catch { /* ignore */ }

  // cena pronta: uma única transição por mudança real de estado
  try {
    OBR.scene.onReadyChange((ready) => {
      sceneReadyEventReceived = true;
      handleSceneReady(ready);
    });
    Promise.resolve(OBR.scene.isReady())
      .then((ready) => {
        // A live event always wins over the potentially stale initial snapshot.
        if (!sceneReadyEventReceived) handleSceneReady(ready);
      })
      .catch((error) => {
        console.error("[Camera Cinema] Não foi possível consultar o estado da cena", error);
        notify("Câmera Cinema: não foi possível detectar quando a cena ficou pronta.", "WARNING");
      });
  } catch (error) {
    console.error("[Camera Cinema] Falha ao registrar mudanças de cena", error);
    notify("Câmera Cinema: falha ao acompanhar as trocas de cena.", "WARNING");
  }

  OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema" }],
    defaultMode: MODE_ID,
  });

  OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema", filter: { activeTools: [TOOL_ID] } }],
    shortcut: "C",
    onDeactivate: () => {
      held.clear();
      keyDown.clear();
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
