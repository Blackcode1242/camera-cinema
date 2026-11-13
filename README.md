# 🎬 Câmera Cinematográfica para Owlbear Rodeo

Extensão para o [Owlbear Rodeo](https://www.owlbear.rodeo/) que troca o movimento "seco" da câmera por um movimento fluido e cinematográfico: deslize com inércia, zoom suave, foco dramático em tokens, câmera que segue personagens e controle da câmera dos jogadores pelo mestre.

> **Status:** a lógica foi validada com uma simulação do Owlbear, mas o comportamento dentro do Owlbear real pode variar (veja [Limitações](#limitações-conhecidas)).

---

## Índice

1. [Recursos](#recursos)
2. [Instalação](#instalação)
3. [Como usar](#como-usar)
4. [Controles](#controles)
5. [Detalhe de cada função](#detalhe-de-cada-função)
6. [Guia rápido: mestre e jogadores](#guia-rápido-mestre-e-jogadores)
7. [Configuração](#configuração)
8. [Estrutura do projeto](#estrutura-do-projeto)
9. [Desenvolvimento local](#desenvolvimento-local)
10. [Solução de problemas](#solução-de-problemas)
11. [Limitações conhecidas](#limitações-conhecidas)

---

## Recursos

| Recurso | Resumo |
|---|---|
| Movimento com inércia | Aceleração suave ao apertar e deslize ao soltar |
| Zoom dinâmico | Zoom exponencial com aceleração e desaceleração |
| Modos rápido/lento | `Shift` e `Ctrl` funcionam como interruptores, com aviso na tela |
| Corte animado entre cenas | Tela preta que some + voo de câmera até enquadrar o mapa |
| Limites do mapa | Impede a câmera de se afastar demais da área do mapa |
| Foco dramático (dolly) | Zoom lento até o token ou área selecionada, com retorno |
| Seguir token | A câmera acompanha o token selecionado com suavização |
| Câmera do mestre | "Olhem isso" pontual e transmissão ao vivo para os jogadores |

---

## Instalação

### Usando a versão publicada

No Owlbear Rodeo, vá em **Perfil → Add Custom Extension** e cole:

```
https://blackcode1242.github.io/camera-cinema/manifest.json
```

Depois, dentro de uma sala, abra o menu de extensões e **ative** a "Câmera Cinematográfica". Recarregue a página com `Ctrl + F5`.

### Publicando a sua própria cópia (GitHub Pages)

1. Crie um repositório no GitHub e envie todos os arquivos para a branch `main` (inclusive a pasta oculta `.github`).
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.
3. Aguarde o workflow na aba **Actions** ficar verde (cerca de 1 minuto). Ele roda a cada push na `main`.
4. Confira se estas URLs abrem (trocando usuário e repositório):
   - `https://USUARIO.github.io/REPOSITORIO/manifest.json`
   - `https://USUARIO.github.io/REPOSITORIO/background.html` (abre em branco, é normal)
   - `https://USUARIO.github.io/REPOSITORIO/fade.html`
   - `https://USUARIO.github.io/REPOSITORIO/icon.svg`
5. Edite `public/manifest.json` e troque as URLs de `icon` e `background_url` pelas do seu site, o `author`, e o `ID` no começo de `src/background.js`.
6. Adicione a extensão no Owlbear com a URL do `manifest.json`.

> Ao atualizar a extensão, remova e adicione de novo no Owlbear para limpar o cache do manifest.

---

## Como usar

1. Abra uma cena com mapa.
2. Selecione a ferramenta **Câmera Cinema** na barra lateral (ou aperte `C`).
3. **Clique uma vez no mapa** para o teclado ficar ativo.
4. Use os controles abaixo.

As teclas só funcionam enquanto a ferramenta está ativa.

---

## Controles

| Tecla | Ação |
|---|---|
| `I` `J` `K` `L` (ou setas) | Mover a câmera: cima, esquerda, baixo, direita |
| `Z` / `X` | Zoom in / zoom out |
| `Shift` (um toque) | Liga/desliga a câmera **rápida** |
| `Ctrl` (um toque) | Liga/desliga a câmera **lenta** |
| `R` ou `Home` | Enquadrar o mapa inteiro |
| `G` | Seguir o token selecionado (de novo para parar) |
| `Y` | Foco dramático na seleção (de novo para voltar) |
| `B` | Liga/desliga os limites do mapa |
| `N` | Seguir o mestre (para jogadores) |
| `U` | Mestre: "olhem isso" |
| `O` | Mestre: liga/desliga a transmissão ao vivo |

Teclas que já têm atalho no Owlbear e devem ser **evitadas**: `W`, `S`, `D`, `F`, `H`, `M`, `Q`, `T`. Todas as teclas da tabela podem ser trocadas no bloco `KEYMAP` (veja [Configuração](#configuração)).

---

## Detalhe de cada função

### Movimento com inércia
Ao segurar uma direção, a câmera acelera até a velocidade máxima. Ao soltar, ela desliza e para aos poucos. Diagonais são normalizadas, então não ficam mais rápidas. A velocidade é medida em pixels de tela, o que dá a mesma sensação em qualquer zoom.

### Zoom
`Z` e `X` aplicam zoom exponencial ancorado no centro da tela, com aceleração e desaceleração suaves. O zoom fica limitado entre `minScale` e `maxScale`.

### Modos rápido e lento
`Shift` e `Ctrl` são **interruptores**: um toque liga, outro desliga, com um aviso na tela. Os dois modos não ficam ligados ao mesmo tempo, ligar um desliga o outro. Eles multiplicam a velocidade de movimento e de zoom (`fastMult` e `slowMult`).

> **Atenção com o `Ctrl`:** atalhos que usam `Ctrl` (como `Ctrl + Z`) também ligam ou desligam o modo lento, porque a extensão reage ao toque na tecla. Se isso incomodar, troque a tecla do modo lento no `KEYMAP`.

### Enquadrar o mapa (`R` / `Home`)
Faz um voo suave até enquadrar todos os itens da camada de mapa. Cancela seguir token e foco dramático. Se não houver mapa, volta para zoom 1 na origem.

### Corte animado entre cenas
Quando uma cena fica pronta (ao trocar de cena ou entrar numa sala), a extensão:
1. Mostra uma tela preta que vai clareando (janela flutuante com a página `fade.html`).
2. Posiciona a câmera mais próxima do centro do mapa.
3. Faz um voo suave até enquadrar o mapa inteiro.

Pode ser ajustado ou desligado em `CFG.intro`.

### Limites do mapa (`B`)
Mantém o centro da câmera dentro da área do mapa, com uma margem (`boundsMargin`, padrão 10% do tamanho do mapa). A área é calculada a partir dos itens da camada de mapa (ou de todos os itens, se não houver mapa) e é recalculada quando os itens da cena mudam. Ligado por padrão.

### Foco dramático (`Y`)
Com um token ou área selecionados, faz um zoom lento (cerca de 2,8 s) até enquadrar a seleção, guardando a câmera anterior. Apertar `Y` de novo faz o caminho de volta. Útil em revelações. Parâmetros: `dollyDuration`, `dollyMaxScale`, `dollyPadding`.

### Seguir token (`G`)
Com um token selecionado, a câmera passa a acompanhá-lo com suavização enquanto ele se move. Apertar `G` de novo para. Mover a câmera manualmente também cancela. Se o token for apagado, o seguir é desativado. Ajuste a suavidade em `followRate`.

### Câmera do mestre
- **`U` (mestre) — "Olhem isso":** envia a enquadramento atual do mestre uma única vez. Os jogadores que estiverem seguindo o mestre fazem um voo suave até lá.
- **`O` (mestre) — Ao vivo:** transmite a câmera do mestre continuamente (a cada 100 ms, apenas quando muda). Os jogadores seguindo acompanham com suavização.
- **`N` (jogadores) — Seguir o mestre:** liga/desliga o acompanhamento. Se o jogador mexer a câmera manualmente, ele para de seguir e é avisado.

Como as telas têm tamanhos diferentes, o mestre envia a **área do mundo visível** e cada jogador calcula o zoom para enxergar essa mesma área.

---

## Guia rápido: mestre e jogadores

**Mestre**
- Revelação pontual: posicione a câmera, aperte `U`.
- Cena guiada: aperte `O` para transmitir, mova a câmera, aperte `O` de novo para encerrar.
- Foco em um token: selecione e aperte `Y`.

**Jogadores**
- Todos precisam ter a extensão ativada na sala.
- Aperte `C` para abrir a ferramenta e `N` para seguir o mestre. Depois disso, o acompanhamento continua mesmo que troquem de ferramenta.
- Para sair do acompanhamento: `N` de novo, ou mexer a câmera.

---

## Configuração

Tudo fica no começo de `src/background.js`.

### Teclas (`KEYMAP`)
Cada ação recebe uma lista de teclas, usando o nome em `event.code` (`KeyA`…`KeyZ`, `Digit0`…`Digit9`, `ArrowUp`, `Home`, `Space`, etc.):

```js
const KEYMAP = {
  up:       ["KeyI", "ArrowUp"],
  zoomIn:   ["KeyZ"],
  follow:   ["KeyG"],
  // ...
};
```

### Parâmetros (`CFG`)

| Grupo | Parâmetro | Padrão | O que faz |
|---|---|---|---|
| Movimento | `panSpeed` | 900 | Velocidade máxima (px/s) |
| | `fastMult` / `slowMult` | 2.2 / 0.35 | Multiplicadores dos modos rápido/lento |
| | `accel` | 4.5 | Aceleração (maior = chega à velocidade mais rápido) |
| | `friction` | 3.2 | Atrito ao soltar (menor = desliza mais) |
| Zoom | `zoomSpeed` | 1.2 | Velocidade do zoom |
| | `zoomAccel` / `zoomFriction` | 5 / 4 | Aceleração e atrito do zoom |
| | `minScale` / `maxScale` | 0.05 / 8 | Limites de zoom |
| Seguir | `followRate` | 3 | Suavidade ao seguir token |
| | `gmFollowRate` | 6 | Suavidade ao seguir o mestre |
| Dolly | `dollyDuration` | 2800 | Duração em ms |
| | `dollyMaxScale` | 3 | Zoom máximo do foco |
| | `dollyPadding` | 2.4 | Folga em volta do alvo |
| Mestre | `lookDuration` | 2200 | Duração do "olhem isso" (ms) |
| | `liveMs` | 100 | Intervalo da transmissão ao vivo (ms) |
| Limites | `boundsDefault` | true | Começa ligado? |
| | `boundsMargin` | 0.1 | Quanto pode passar da borda |
| Corte de cena | `intro.enabled` | true | Liga o corte animado |
| | `intro.fade` | true | Usa a tela preta |
| | `intro.flyMs` | 2600 | Duração do voo (ms) |
| | `intro.fadeMs` | 1100 | Duração do clareamento (ms) |
| | `intro.startZoom` | 1.6 | Zoom inicial relativo ao enquadramento final |

---

## Estrutura do projeto

```
camera-cinema/
├── .github/workflows/deploy.yml   # build e deploy automáticos no GitHub Pages
├── public/
│   ├── manifest.json              # manifesto da extensão
│   └── icon.svg                   # ícone da ferramenta
├── src/
│   ├── background.js              # motor de câmera, teclas, mestre/jogador
│   └── fade.js                    # duração da tela preta do corte de cena
├── background.html                # página de fundo carregada pelo Owlbear
├── fade.html                      # tela preta do corte de cena
├── vite.config.js                 # build com duas páginas
└── package.json
```

**Como funciona:** o `background.js` roda em segundo plano e registra uma ferramenta com um modo de ferramenta, que recebe as teclas. Um único laço de câmera (a cada 16 ms) combina movimento manual, voos suaves, seguir token e seguir mestre. A tela preta do corte de cena é uma janela flutuante (popover) que carrega o `fade.html`, e o mestre fala com os jogadores por mensagens remotas (`OBR.broadcast`).

---

## Desenvolvimento local

```bash
npm install
npm run dev
```

Adicione `http://localhost:5173/manifest.local.json` como extensão no Owlbear. Esse manifesto aponta para o servidor local; não o use como manifesto publicado. Para gerar o build: `npm run build` (saída em `dist/`).

Em desenvolvimento, os caminhos do `manifest.json` precisam apontar para o servidor local, ou use caminhos relativos se o seu Owlbear os resolver.

---

## Solução de problemas

| Sintoma | O que verificar |
|---|---|
| Extensão não aparece | Está **ativada na sala**? Há uma **cena com mapa** aberta? Recarregou com `Ctrl + F5`? |
| URL do manifest "não encontrada" | Use `github.io` (não `github.com`) e confira o nome do repositório |
| 404 em `background.html` / `icon.svg` | **Settings → Pages → Source** deve ser **GitHub Actions**; veja a aba **Actions** |
| Mudanças não aparecem | Espere o workflow ficar verde, remova e adicione a extensão de novo, `Ctrl + F5` |
| Console não mostra `carregada v7` | Cache antigo ou deploy ainda não terminou |
| Teclas não respondem | Ferramenta ativa? Clicou no mapa? Veja o console (`F12`) por erros |
| Tecla dispara outra coisa | Conflito de atalho: troque no `KEYMAP` |
| Tela preta atrapalha | `intro.fade: false` |
| Jogadores não seguem o mestre | Têm a extensão ativada? Ligaram `N`? O mestre usou `U` ou `O`? |

---

## Limitações conhecidas

- **Foco do teclado:** as teclas só chegam à extensão com a ferramenta ativa e o mapa em foco. A tela preta do corte de cena é uma janela flutuante, e isso pode afetar o foco em alguns casos.
- **Tela preta:** depende do comportamento das janelas flutuantes do Owlbear (tamanho e transparência).
- **Segurança:** as mensagens de câmera do mestre não têm verificação de remetente; a extensão assume uma mesa de confiança.
- **Teste:** a lógica foi validada com uma simulação, não em salas reais com vários jogadores.
