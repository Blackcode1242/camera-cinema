// Camada de transição: preta por padrão; pode começar transparente para
// que o zoom-in de saída e o escurecimento aconteçam ao mesmo tempo.
const durationFromHash = parseInt(location.hash.slice(1), 10);
const startTransparent = new URLSearchParams(location.search).get("start") === "transparent";
const channel = new BroadcastChannel("io.github.blackcode1242.camera-cinema/fade-control");
const easing = "cubic-bezier(0.65, 0, 0.35, 1)";

document.documentElement.style.background = "transparent";
document.body.style.background = "#000";
document.body.style.opacity = startTransparent ? "0" : "1";
document.body.style.transition = "none";

function transitionOpacity(opacity, requestedDuration) {
  const duration = Number.isFinite(requestedDuration)
    ? Math.max(0, requestedDuration)
    : durationFromHash > 0 ? durationFromHash : 3600;

  document.body.style.transition = `opacity ${duration}ms ${easing}`;

  // Garante que o estado inicial foi pintado antes de iniciar a transição.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.style.opacity = String(opacity);
    });
  });

  return duration;
}

channel.addEventListener("message", (event) => {
  if (event.data?.type === "cover") {
    transitionOpacity(1, event.data.duration);
    return;
  }

  if (event.data?.type === "reveal") {
    const duration = transitionOpacity(0, event.data.duration);
    window.setTimeout(() => channel.close(), duration + 500);
  }
});

// Handshake para o background esperar até a camada estar renderizada.
channel.postMessage({ type: "ready" });
