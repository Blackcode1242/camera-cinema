// Camada de transição cinematográfica. A opacidade pode ser revertida em
// qualquer ponto, sem esperar a cobertura preta terminar antes de revelar.
const durationFromHash = Number.parseInt(location.hash.slice(1), 10);
const startTransparent = new URLSearchParams(location.search).get("start") === "transparent";
const channel = new BroadcastChannel("io.github.blackcode1242.camera-cinema/fade-control");
const easing = "cubic-bezier(0.42, 0, 0.58, 1)";
let activeAnimation = null;

document.documentElement.style.background = "transparent";
document.body.style.background = "#000";
document.body.style.opacity = startTransparent ? "0" : "1";

function animateOpacity(targetOpacity, requestedDuration, acknowledgement) {
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(0, requestedDuration)
    : durationFromHash > 0 ? durationFromHash : 2200;

  const currentOpacity = Number.parseFloat(getComputedStyle(document.body).opacity);
  const fromOpacity = Number.isFinite(currentOpacity)
    ? currentOpacity
    : (startTransparent ? 0 : 1);

  // Caso a cena fique pronta no meio do fade-in para preto, cancela essa
  // animação no frame atual e inverte de onde ela realmente estiver.
  if (activeAnimation) {
    activeAnimation.cancel();
    activeAnimation = null;
  }

  if (typeof document.body.animate === "function") {
    const animation = document.body.animate(
      [{ opacity: fromOpacity }, { opacity: targetOpacity }],
      {
        duration,
        easing,
        fill: "forwards",
      }
    );
    activeAnimation = animation;

    animation.onfinish = () => {
      document.body.style.opacity = String(targetOpacity);
      if (activeAnimation === animation) activeAnimation = null;
      animation.cancel();
      channel.postMessage({ type: acknowledgement });
    };
    animation.oncancel = () => {
      if (activeAnimation === animation) activeAnimation = null;
    };
    return;
  }

  // Fallback para engines sem Web Animations API.
  document.body.style.opacity = String(targetOpacity);
  window.setTimeout(() => channel.postMessage({ type: acknowledgement }), duration);
}

// Reenvia "ready" até o background confirmar que recebeu o handshake.
// Assim a primeira mensagem não se perde durante a criação do modal.
const readyTimer = window.setInterval(() => {
  channel.postMessage({ type: "ready" });
}, 120);
channel.postMessage({ type: "ready" });

channel.addEventListener("message", (event) => {
  const type = event.data?.type;

  if (type === "ready-ack") {
    window.clearInterval(readyTimer);
    return;
  }

  if (type === "cover") {
    animateOpacity(1, event.data.duration, "covered");
    return;
  }

  if (type === "reveal") {
    animateOpacity(0, event.data.duration, "revealed");
  }
});
