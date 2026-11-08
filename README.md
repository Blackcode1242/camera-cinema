# Câmera Cinematográfica (Owlbear Rodeo)

Extensão que move a câmera com setas de forma fluida (inércia e aceleração) e com zoom suave.

## Controles
Ative a ferramenta "Câmera Cinema" na barra lateral (ou aperte `C`).

| Tecla | Ação |
|---|---|
| Setas | Mover a câmera |
| `Q` / `E` ou `-` / `+` | Zoom out / zoom in |
| `Shift` | Mais rápido |
| `Alt` | Mais lento e preciso |
| `R` ou `Home` | Resetar a vista |

Os valores de velocidade, inércia e fricção ficam em `CFG` no começo de `src/background.js`.

## Publicar no GitHub Pages
1. Crie um repositório no GitHub e envie estes arquivos para a branch `main`.
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
3. Aguarde o workflow na aba **Actions** terminar (cerca de 1 minuto).
4. No Owlbear Rodeo, vá em **Perfil → Add Custom Extension** e cole:

   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/manifest.json`

## Desenvolvimento local
```
npm install
npm run dev
```
Use `http://localhost:5173/manifest.json` na extensão.
