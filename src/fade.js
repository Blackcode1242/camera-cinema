// Tela preta mantida durante o carregamento da nova cena.
// Quando o background enviar "reveal", a cortina desaparece rapidamente.
// O zoom-out é iniciado separadamente pelo background, depois deste fade.
const durationFromHash = Number.parseInt(location.hash.slice(1), 10);
const channel = new BroadcastChannel("io.github.blackcode1242.camera-cinema/fade-control");
const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
let activeAnimation = null;

document.documentElement.style.background = "transparent";
document.body.style.background = "#000";
document.body.style.opacity = "1";

function reveal(durationFromMessage) {
  const duration = Number.isFinite(durationFromMessage)
    ? Math.max(0, durationFromMessage)
    : durationFromHash > 0 ? durationFromHash : 500;

  const computed = Number.parseFloat(getComputedStyle(document.body).opacity);
  const fromOpacity = Number.isFinite(computed) ? computed : 1;

  if (activeAnimation) {
    activeAnimation.cancel();
    activeAnimation = null;
  }

  if (typeof document.body.animate === "function") {
    const animation = document.body.animate(
      [{ opacity: fromOpacity }, { opacity: 0 }],
      { duration, easing, fill: "forwards" }
    );
    activeAnimation = animation;

    animation.onfinish = () => {
      document.body.style.opacity = "0";
      if (activeAnimation === animation) activeAnimation = null;
      animation.cancel();
      channel.postMessage({ type: "revealed" });
    };
    animation.oncancel = () => {
      if (activeAnimation === animation) activeAnimation = null;
    };
    return;
  }

  document.body.style.transition = `opacity ${duration}ms ${easing}`;
  requestAnimationFrame(() => { document.body.style.opacity = "0"; });
  window.setTimeout(() => channel.postMessage({ type: "revealed" }), duration + 40);
}

// Repete o handshake até o background confirmar que recebeu a mensagem.
const readyTimer = window.setInterval(() => {
  channel.postMessage({ type: "ready" });
}, 120);
channel.postMessage({ type: "ready" });

channel.addEventListener("message", (event) => {
  if (event.data?.type === "ready-ack") {
    window.clearInterval(readyTimer);
    return;
  }

  if (event.data?.type === "reveal") {
    reveal(event.data.duration);
  }
});
