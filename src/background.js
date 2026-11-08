import OBR from "@owlbear-rodeo/sdk";

const ID = "io.github.blackcode1242.camera-cinema";
const ICON = new URL("icon.svg", window.location.href).href;

// ====== CONFIGURAÇÃO (ajuste ao gosto) ======
const CFG = {
  panSpeed: 900,   // px de tela por segundo (velocidade máx.)
  fastMult: 2.2,   // multiplicador do modo rápido (Shift)
  slowMult: 0.35,  // multiplicador do modo lento (Alt)
  accel: 4.5,      // maior = atinge a velocidade mais rápido
  friction: 3.2,   // menor = desliza mais ao soltar a tecla
  zoomSpeed: 1.2,  // fator exponencial de zoom por segundo
  zoomAccel: 5,
  zoomFriction: 4,
  minScale: 0.1,
  maxScale: 8,
  tickMs: 16,
};

// ====== ESTADO ======
const held = new Set();      // direções/zoom segurados: up, down, left, right, zoomIn, zoomOut
const modDown = new Map();   // modificadores fisicamente apertados (evita alternar com auto-repeat)
let speedMode = null;        // null | "fast" | "slow" (interruptor)
let vx = 0, vy = 0, vz = 0;
let pos = { x: 0, y: 0 };
let scale = 1;
let width = 0, height = 0;
let running = false;
let timer = null;
let lastT = 0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

// ====== MAPA DE TECLAS (troque aqui pelas teclas que preferir) ======
// Teclas que já têm atalho no Owlbear (evitar): W S D F M Q T
// Use o nome da tecla em "code": KeyA..KeyZ, Digit0..Digit9, ArrowUp, Home, Space, etc.
const KEYMAP = {
  up:      ["KeyI", "ArrowUp"],
  down:    ["KeyK", "ArrowDown"],
  left:    ["KeyJ", "ArrowLeft"],
  right:   ["KeyL", "ArrowRight"],
  zoomIn:  ["KeyZ"],
  zoomOut: ["KeyX"],
  fast:    ["ShiftLeft", "ShiftRight"],
  slow:    ["AltLeft", "AltRight"],
  reset:   ["KeyR", "Home"],
};

const CODE_TO_ACTION = new Map();
for (const [action, codes] of Object.entries(KEYMAP)) {
  for (const c of codes) CODE_TO_ACTION.set(c, action);
}

// Converte o evento de teclado em uma ação lógica (usa event.code, com fallback em event.key)
function toAction(ev) {
  if (ev.code) return CODE_TO_ACTION.get(ev.code) ?? null;
  const k = ev.key || "";
  const code =
    k.length === 1 && /[a-z]/i.test(k) ? "Key" + k.toUpperCase() :
    k === "Shift" ? "ShiftLeft" :
    k === "Alt" ? "AltLeft" : k;
  return CODE_TO_ACTION.get(code) ?? null;
}

function toggleSpeed(mode) {
  speedMode = speedMode === mode ? null : mode;
  const msg =
    speedMode === "fast" ? "⚡ Câmera rápida: ATIVADA" :
    speedMode === "slow" ? "🐢 Câmera lenta: ATIVADA" :
    "Velocidade normal";
  OBR.notification.show(msg, speedMode ? "SUCCESS" : "DEFAULT");
}

async function syncFromViewport() {
  [pos, scale, width, height] = await Promise.all([
    OBR.viewport.getPosition(),
    OBR.viewport.getScale(),
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
  ]);
}

async function startLoop() {
  if (running) return;
  running = true;
  await syncFromViewport();
  lastT = performance.now();
  timer = setInterval(tick, CFG.tickMs);
}

function stopLoop() {
  clearInterval(timer);
  running = false;
  vx = vy = vz = 0;
}

function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  const dirX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const dirY = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
  const dirZ = (held.has("zoomIn") ? 1 : 0) - (held.has("zoomOut") ? 1 : 0);

  const mult = speedMode === "fast" ? CFG.fastMult : speedMode === "slow" ? CFG.slowMult : 1;

  const len = Math.hypot(dirX, dirY) || 1;
  const targetVx = (dirX / len) * CFG.panSpeed * mult;
  const targetVy = (dirY / len) * CFG.panSpeed * mult;
  const targetVz = dirZ * CFG.zoomSpeed * mult;

  vx = approach(vx, targetVx, dirX || dirY ? CFG.accel : CFG.friction, dt);
  vy = approach(vy, targetVy, dirX || dirY ? CFG.accel : CFG.friction, dt);
  vz = approach(vz, targetVz, dirZ ? CFG.zoomAccel : CFG.zoomFriction, dt);

  if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5 && Math.abs(vz) < 0.001 && !dirX && !dirY && !dirZ) {
    stopLoop();
    return;
  }

  // Zoom exponencial ancorado no centro da tela
  if (Math.abs(vz) > 0.0001) {
    const cx = (width / 2 - pos.x) / scale;
    const cy = (height / 2 - pos.y) / scale;
    scale = clamp(scale * Math.exp(vz * dt), CFG.minScale, CFG.maxScale);
    pos = { x: width / 2 - cx * scale, y: height / 2 - cy * scale };
  }

  pos = { x: pos.x - vx * dt, y: pos.y - vy * dt };

  OBR.viewport.setScale(scale);
  OBR.viewport.setPosition(pos);
}

async function resetView() {
  await syncFromViewport();
  OBR.viewport.animateTo({ position: { x: width / 2, y: height / 2 }, scale: 1 });
}

const TOOL_ID = `${ID}/tool`;
const MODE_ID = `${ID}/mode`;

OBR.onReady(() => {
  console.log("[Camera Cinema] carregada v5");
  window.addEventListener("blur", () => { held.clear(); modDown.clear(); });

  OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema" }],
    defaultMode: MODE_ID,
  });

  OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: ICON, label: "Câmera Cinema", filter: { activeTools: [TOOL_ID] } }],
    shortcut: "C",
    onKeyDown: (_ctx, event) => {
      const a = toAction(event);
      if (!a) return;
      event.preventDefault?.();

      if (a === "reset") { resetView(); return; }

      // Shift e Alt: interruptores (um toque liga, outro desliga)
      if (a === "fast" || a === "slow") {
        const t = performance.now();
        const last = modDown.get(a);
        // ignora auto-repeat enquanto a tecla está segurada (com tolerância caso o keyup se perca)
        if (last !== undefined && t - last < 2000) return;
        modDown.set(a, t);
        toggleSpeed(a);
        return;
      }

      held.add(a);
      startLoop();
    },
    onKeyUp: (_ctx, event) => {
      const a = toAction(event);
      if (!a) return;
      if (a === "fast" || a === "slow") { modDown.delete(a); return; }
      held.delete(a);
    },
    onDeactivate: () => { held.clear(); modDown.clear(); },
  });
});
