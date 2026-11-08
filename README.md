# Câmera Cinematográfica

Extensão traz um dinamismo para a câmera do Owlbear, com um movimento fluido e cinematográfico: deslize com inércia, zoom suave, foco dramático em tokens, câmera que segue personagens e controle da câmera dos jogadores pelo mestre.

## Índice

1. [Recursos](#recursos)
2. [Como usar](#como-usar)
3. [Controles](#controles)
4. [Detalhe de cada função](#detalhe-de-cada-função)
5. [Guia rápido: mestre e jogadores](#guia-rápido-mestre-e-jogadores)
6. [Solução de problemas](#solução-de-problemas)

---

## 1, Recursos

| Recurso | Resumo |
|---|---|
| Movimento com inércia | Aceleração suave ao apertar e deslize ao soltar |
| Zoom dinâmico | Zoom exponencial com aceleração e desaceleração |
| Modos rápido/lento | `Shift` e `Alt` funcionam como interruptores, com aviso na tela |
| Corte animado entre cenas | Tela preta que some + voo de câmera até enquadrar o mapa |
| Indicador na tela | Mostra zoom atual e estados ativos |
| Limites do mapa | Impede a câmera de se afastar demais da área do mapa |
| Inércia do scroll | Continua o zoom da roda do mouse depois que você para |
| Foco dramático (dolly) | Zoom lento até o token ou área selecionada, com retorno |
| Seguir token | A câmera acompanha o token selecionado com suavização |
| Câmera do mestre | "Olhem isso" pontual e transmissão ao vivo para os jogadores |

---

## 2. Como usar

1. Abra uma cena com mapa.
2. Selecione a ferramenta **Câmera Cinema** na barra lateral (ou aperte `C`).
3. **Clique uma vez no mapa** para o teclado ficar ativo.
4. Use os controles abaixo.

As teclas só funcionam enquanto a ferramenta está ativa.

---

## 3. Controles

| Tecla | Ação |
|---|---|
| `I` `J` `K` `L` | Mover a câmera: cima, esquerda, baixo, direita |
| `Z` / `X` | Zoom in / zoom out |
| `Shift` (um toque) | Liga/desliga a câmera **rápida** |
| `Alt` (um toque) | Liga/desliga a câmera **lenta** |
| `R` ou `Home` | Enquadrar o mapa inteiro |
| `G` | Seguir o token selecionado (de novo para parar) |
| `H` | Foco dramático na seleção (de novo para voltar) |
| `B` | Liga/desliga os limites do mapa |
| `N` | Seguir o mestre (para jogadores) |
| `U` | Mestre: "olhem isso" |
| `O` | Mestre: liga/desliga a transmissão ao vivo |

Teclas que já têm atalho no Owlbear e devem ser **evitadas**: `W`, `S`, `D`, `F`, `M`, `Q`, `T`. Todas as teclas da tabela podem ser trocadas no bloco `KEYMAP` (veja [Configuração](#configuração)).

---

## 4. Detalhe de cada função

### Movimento com inércia
Ao segurar uma direção, a câmera acelera até a velocidade máxima. Ao soltar, ela desliza e para aos poucos. Diagonais são normalizadas, então não ficam mais rápidas. A velocidade é medida em pixels de tela, o que dá a mesma sensação em qualquer zoom.

### Zoom
`Z` e `X` aplicam zoom exponencial ancorado no centro da tela, com aceleração e desaceleração suaves. O zoom fica limitado entre `minScale` e `maxScale`.

### Modos rápido e lento
`Shift` e `Alt` são **interruptores**: um toque liga, outro desliga, com um aviso na tela. Os dois modos não ficam ligados ao mesmo tempo, ligar um desliga o outro. Eles multiplicam a velocidade de movimento e de zoom (`fastMult` e `slowMult`).

### Enquadrar o mapa (`R` / `Home`)
Faz um voo suave até enquadrar todos os itens da camada de mapa. Cancela seguir token e foco dramático. Se não houver mapa, volta para zoom 1 na origem.

### Corte animado entre cenas
Quando uma cena fica pronta (ao trocar de cena ou entrar numa sala), a extensão:
1. Mostra uma tela preta que vai clareando.
2. Posiciona a câmera mais próxima do centro do mapa.
3. Faz um voo suave até enquadrar o mapa inteiro.

Pode ser ajustado ou desligado em `CFG.intro`.

### Indicador na tela (HUD)
Uma barra no centro inferior, visível enquanto a ferramenta está ativa (e também enquanto seguir token, seguir mestre ou transmissão ao vivo estiverem ligados). Mostra:

- 🔎 zoom atual em porcentagem
- ⚡ Rápido / 🐢 Lento
- 🎯 Seguindo token
- 🎬 Foco ativo (`H` volta)
- 👁 Seguindo mestre
- 📡 Ao vivo (transmissão do mestre)
- 🔒 Limites do mapa ativos

### Limites do mapa (`B`)
Mantém o centro da câmera dentro da área do mapa, com uma margem (`boundsMargin`, padrão 10% do tamanho do mapa). A área é calculada a partir dos itens da camada de mapa (ou de todos os itens, se não houver mapa) e é recalculada quando os itens da cena mudam. Ligado por padrão.

### Inércia do scroll
O Owlbear não repassa o evento da roda do mouse para extensões. Por isso, a extensão **observa** o zoom nativo: quando você para de girar a roda, ela continua o movimento com a mesma inércia, ancorado no cursor. Só funciona com a ferramenta ativa. Se você voltar a girar a roda durante a inércia, a extensão cancela a dela.

### Foco dramático (`H`)
Com um token ou área selecionados, faz um zoom lento (cerca de 2,8 s) até enquadrar a seleção, guardando a câmera anterior. Apertar `H` de novo faz o caminho de volta. Útil em revelações. Parâmetros: `dollyDuration`, `dollyMaxScale`, `dollyPadding`.

### Seguir token (`G`)
Com um token selecionado, a câmera passa a acompanhá-lo com suavização enquanto ele se move. Apertar `G` de novo para. Mover a câmera manualmente também cancela. Se o token for apagado, o seguir é desativado. Ajuste a suavidade em `followRate`.

### Câmera do mestre
- **`U` (mestre) — "Olhem isso":** envia a enquadramento atual do mestre uma única vez. Os jogadores que estiverem seguindo o mestre fazem um voo suave até lá.
- **`O` (mestre) — Ao vivo:** transmite a câmera do mestre continuamente (a cada 100 ms, apenas quando muda). Os jogadores seguindo acompanham com suavização.
- **`N` (jogadores) — Seguir o mestre:** liga/desliga o acompanhamento. Se o jogador mexer a câmera manualmente, ele para de seguir e é avisado.

Como as telas têm tamanhos diferentes, o mestre envia a **área do mundo visível** e cada jogador calcula o zoom para enxergar essa mesma área.

---

## 5. Guia rápido: mestre e jogadores

**Mestre**
- Revelação pontual: posicione a câmera, aperte `U`.
- Cena guiada: aperte `O` para transmitir, mova a câmera, aperte `O` de novo para encerrar.
- Foco em um token: selecione e aperte `H`.

**Jogadores**
- Todos precisam ter a extensão ativada na sala.
- Aperte `C` para abrir a ferramenta e `N` para seguir o mestre. Depois disso, o acompanhamento continua mesmo que troquem de ferramenta.
- Para sair do acompanhamento: `N` de novo, ou mexer a câmera.

---

## 6. Solução de problemas

| Sintoma | O que verificar |
|---|---|
| Extensão não aparece | Está **ativada na sala**? Há uma **cena com mapa** aberta? Recarregou com `Ctrl + F5`? |
| URL do manifest "não encontrada" | Use `github.io` (não `github.com`) e confira o nome do repositório |
| 404 em `background.html` / `icon.svg` | **Settings → Pages → Source** deve ser **GitHub Actions**; veja a aba **Actions** |
| Mudanças não aparecem | Espere o workflow ficar verde, remova e adicione a extensão de novo, `Ctrl + F5` |
| Console não mostra `carregada v6` | Cache antigo ou deploy ainda não terminou |
| Teclas não respondem | Ferramenta ativa? Clicou no mapa? Veja o console (`F12`) por erros |
| Tecla dispara outra coisa | Conflito de atalho: troque no `KEYMAP` |
| Tela preta atrapalha | `intro.fade: false` |
| Indicador atrapalha | `hud.enabled: false` |
| Inércia do scroll estranha | `wheelGlide.enabled: false` |
| Jogadores não seguem o mestre | Têm a extensão ativada? Ligaram `N`? O mestre usou `U` ou `O`? |

---
