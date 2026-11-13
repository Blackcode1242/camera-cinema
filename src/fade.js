// A tela começa totalmente preta e só clareia quando a página de fundo
// recebe a confirmação de que a nova cena do Owlbear está pronta.
const durationFromHash = parseInt(location.hash.slice(1), 10);
const channel = new BroadcastChannel("io.github.blackcode1242.camera-cinema/fade-control");

document.documentElement.style.background = "#000";
document.body.style.background = "#000";
document.body.style.opacity = "1";

channel.addEventListener("message", (event) => {
  if (event.data?.type !== "reveal") return;

  const duration = Number.isFinite(event.data.duration)
    ? Math.max(0, event.data.duration)
    : durationFromHash > 0 ? durationFromHash : 1100;

  document.body.style.transition = `opacity ${duration}ms ease-out`;
  document.body.style.opacity = "0";

  window.setTimeout(() => channel.close(), duration + 500);
});

// Handshake: a página de fundo só envia o comando de clarear depois deste sinal.
channel.postMessage({ type: "ready" });
