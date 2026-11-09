// Lê a duração do clareamento do hash da URL (ex.: fade.html#1100)
const ms = parseInt(location.hash.slice(1), 10);
if (ms > 0) document.body.style.setProperty("--fade-ms", `${ms}ms`);
