import OBR from "@owlbear-rodeo/sdk";

const ID = "io.github.blackcode1242.camera-cinema";
// URL absoluta do ícone (funciona em subpasta do GitHub Pages)
const ICON = new URL("icon.svg", window.location.href).href;

// ====== CONFIGURAÇÃO (ajuste ao gosto) ======
const CFG = {
  panSpeed: 900,   // px de tela por segundo (velocidade máx.)
  fastMult: 2.2,   // multiplicador com Shift
  slowMult: 0.35,  // multiplicador com Alt
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
// Ações lógicas seguradas no momento (não teclas brutas)
const held = new Set();
let vx = 0, vy = 0, vz = 0;
let pos = { x: 0, y: 0 };
let scale = 1;
let width = 0, height = 0;
let running = false;
let timer = null;
let lastT = 0;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));


// Converte o evento de teclado em uma ação lógica.
// Usa event.code (independe de Shift/layout) e cai para event.key se não existir.
function toAction(ev) {
  const c = ev.code;
  if (c) {
    if (c.startsWith("Arrow")) return c;
    if (c === "KeyE" || c === "Equal" || c === "NumpadAdd") return "zoomIn";
    if (c === "KeyQ" || c === "Minus" || c === "NumpadSubtract") return "zoomOut";
    if (c === "ShiftLeft" || c === "ShiftRight") return "fast";
    if (c === "AltLeft" || c === "AltRight") return "slow";
    if (c === "KeyR" || c === "Home") return "reset";
    return null;
  }
  const k = ev.key;
  if (k && k.startsWith("Arrow")) return k;
  switch ((k || "").toLowerCase()) {
    case "e": case "+": case "=": return "zoomIn";
    case "q": case "-": case "_": return "zoomOut";
    case "shift": return "fast";
    case "alt": return "slow";
    case "r": case "home": return "reset";
    default: return null;
  }
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

  const dirX = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0);
  const dirY = (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0);
  const dirZ = (held.has("zoomIn") ? 1 : 0) - (held.has("zoomOut") ? 1 : 0);

  const mult = held.has("fast") ? CFG.fastMult : held.has("slow") ? CFG.slowMult : 1;

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
  console.log("[Camera Cinema] carregada v2");
  window.addEventListener("blur", () => held.clear());

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
      held.add(a);
      startLoop();
    },
    onKeyUp: (_ctx, event) => {
      const a = toAction(event);
      if (!a) return;
      held.delete(a);
    },
    onDeactivate: () => { held.clear(); },
  });
});
