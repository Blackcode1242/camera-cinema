import OBR from "@owlbear-rodeo/sdk";

const ID = "io.github.blackcode1242.camera-cinema";
const CH_HUD = `${ID}/hud-state`;
const CH_HUD_READY = `${ID}/hud-ready`;

const fade = location.hash.match(/^#fade(?:=(\d+))?/);

if (fade) {
  // tela preta que some devagar (corte de cena)
  document.body.classList.add("fade");
  if (fade[1]) document.body.style.setProperty("--fade-ms", `${fade[1]}ms`);
  document.getElementById("hud").style.display = "none";
} else {
  const root = document.getElementById("hud");

  const pill = (text, cls = "") => {
    const el = document.createElement("div");
    el.className = `pill ${cls}`.trim();
    el.textContent = text;
    return el;
  };

  const render = (s) => {
    root.replaceChildren();
    root.append(pill(`🔎 ${s.zoom}%`));
    if (s.speed === "fast") root.append(pill("⚡ Rápido", "on"));
    if (s.speed === "slow") root.append(pill("🐢 Lento", "on"));
    if (s.follow) root.append(pill("🎯 Seguindo token", "on"));
    if (s.dolly) root.append(pill("🎬 Foco (H volta)", "on"));
    if (s.gm) root.append(pill("👁 Seguindo mestre", "on"));
    if (s.live) root.append(pill("📡 Ao vivo", "warn"));
    if (s.bounds) root.append(pill("🔒 Limites"));
  };

  OBR.onReady(() => {
    OBR.broadcast.onMessage(CH_HUD, (e) => render(e.data));
    OBR.broadcast.sendMessage(CH_HUD_READY, {}, { destination: "LOCAL" });
  });
}
