# Câmera Cinematográfica (Owlbear Rodeo)

Movimento fluido de câmera com inércia, foco dramático, seguir token, câmera do mestre e mais.
Ative a ferramenta **Câmera Cinema** na barra lateral (ou aperte `C`) e clique uma vez no mapa.

## Controles
| Tecla | Ação |
|---|---|
| `I` `J` `K` `L` (ou setas) | Mover a câmera |
| `Z` / `X` | Zoom in / zoom out |
| `Shift` (um toque) | Liga/desliga câmera rápida |
| `Alt` (um toque) | Liga/desliga câmera lenta |
| `R` ou `Home` | Enquadrar o mapa inteiro |
| `G` | Seguir o token selecionado (de novo para parar) |
| `H` | Foco dramático no token/área selecionada (de novo para voltar) |
| `B` | Liga/desliga limites do mapa |
| `N` | Seguir o mestre (jogadores) |
| `U` | Mestre: "olhem isso" (envia a câmera atual aos jogadores que seguem) |
| `O` | Mestre: liga/desliga transmissão da câmera ao vivo |

Teclas com atalho nativo no Owlbear (evitar): W S D F M Q T. Todas podem ser trocadas no bloco
`KEYMAP` de `src/background.js`. Velocidades, durações e liga/desliga de recursos ficam em `CFG`.

## Recursos
- **Corte animado ao trocar de cena:** tela preta que some + voo de câmera até enquadrar o mapa.
- **Indicador na tela:** zoom atual, modo rápido/lento e estados ativos.
- **Limites do mapa:** a câmera não se afasta muito da área do mapa.
- **Inércia do scroll:** observa o zoom da roda do mouse e continua o movimento (só com a ferramenta ativa).
- **Foco dramático (dolly):** zoom lento até a seleção; aperte de novo para voltar.
- **Seguir token:** a câmera acompanha o token selecionado com suavização.
- **Câmera do mestre:** `U` envia um "olhem isso" e `O` transmite ao vivo; os jogadores precisam ter
  a extensão e ligar `N`. Mexer a câmera manualmente faz o jogador parar de seguir.

## Publicar no GitHub Pages
1. Envie estes arquivos para a branch `main`.
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. No Owlbear: **Perfil → Add Custom Extension** com
   `https://blackcode1242.github.io/camera-cinema/manifest.json`

## Desenvolvimento local
```
npm install
npm run dev
```
