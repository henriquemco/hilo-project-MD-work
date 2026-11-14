# Hi-Lo competitivo: visualizador interativo

Uma implementação computacional que acompanham o trabalho _Árvores e grafos de estados em uma
variante competitiva de Hi-Lo_ (Matemática Discreta).

O objetivo desse implementação é ajudar a visualizar como a arvore de histórico e o grafo de estados se comportam mediante a alterações nas castas no baralho.

## 1. Estrutura

**Estado.** A tupla $s = (c, r, d, t)$ da Definição 2.5: $c$ é o vetor de cartas restantes
(alinhado com a lista dos valores distintos), $r$ a referência, $d$ a diferença de pontos e
$t$ o jogador da vez. A camada não é armazenada como dado independente, pois
$m = N - n(s)$.

**Transição.** A função $\delta(s, p, j)$ recebe uma previsão $p$ e o valor $j$ da carta
revelada e aplica a Tabela 1: decrementa $c_j$, faz $r \leftarrow j$ e, conforme a previsão
acerte ou erre, altera $d$ ou troca $t$.

**Reunião de históricos.** A função `chave` converte o estado em texto, que serve de chave de
um `Map`. Dois históricos que produzem a mesma chave caem no mesmo vértice. É só isso que distingue a construção do grafo da construção da árvore.

**Enumeração por camadas.** Como toda jogada consome uma carta, os sucessores da camada $m$
estão todos na camada $m+1$ (Proposição 3.1(i)). A construção é uma busca em largura que
gera a camada $m+1$ aplicando $\delta$ a cada estado da camada $m$, para cada valor
disponível e cada uma das **três previsões explícitas**. A abstração A/E não é usada na
construção; ela é uma consequência que o código observa (duas previsões erradas chegam ao
mesmo sucessor e ficam anotadas na mesma aresta).

Durante a mesma passagem, cada estado acumula o número de históricos que reúne:
$h(v) = \sum_{(u,p,j)\,:\,\delta(u,p,j)=v} h(u)$, com $h(\text{raiz}) = 1$. Assim
$\sum_{s \in V_m} h(s)$ é o número de vértices da árvore na profundidade $m$, obtido sem
construir a árvore.

## 2. Visualizador interativo (`index.html`)

| Arquivo      | Conteúdo                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` | estrutura da página: controles, painéis e legenda                                                                                                        |
| `style.css`  | aparência, com cores definidas como variáveis (tema claro e escuro)                                                                                      |
| `main.js`    | modelo (`transicao`, `construirGrafo`, `construirArvore`, `formulas` em `BigInt`, `arvoreGeradora`, `cicloQuatro`), disposição, desenho em SVG e eventos |

A interface segue um único princípio: o objeto `app` guarda todo o estado da aplicação
(composição, grafo, árvore, partida em andamento, estado selecionado), e `render()`
redesenha tudo a partir dele. Cada interação altera um campo de `app` e chama `render()`.
Não há estado escondido nos elementos da página.

### 2.1 A projeção árvore → grafo

Cada nó da árvore guarda a chave do seu estado, isto é, a imagem pela aplicação
$\pi : \{\text{históricos}\} \to \{\text{estados}\}$. Essa aplicação preserva camadas e leva
arestas em arestas. As interações existem para torná-la visível nos dois sentidos:

- **clique em um estado do grafo**: destaca na árvore a fibra $\pi^{-1}(s)$, todos os
  históricos reunidos naquele estado, e mostra $(c, r, d, t)$, a camada, os graus e os
  predecessores com as previsões de cada aresta;
- **clique em um nó da árvore**: carrega aquele histórico como partida e destaca o caminho
  correspondente no grafo.

### 2.2 Disposição

**Grafo** (`disporGrafo`). A coordenada vertical é a camada $m$, o que torna a Proposição
3.1(i) visível: toda aresta desce exatamente um nível. Dentro da camada, os estados são
agrupados em blocos com as mesmas cartas restantes e a mesma referência, com $d$ decrescente.
Esses blocos são os conjuntos de $2m$ estados da demonstração do Teorema 3.3, e o desenho
mostra que todos têm o mesmo tamanho dentro de uma camada. Arestas de acerto são contínuas;
arestas de erro, tracejadas.

**Árvore** (`disporArvore`). As folhas ficam igualmente espaçadas na ordem de uma busca em
profundidade e cada nó interno fica centrado sobre os filhos.

### 2.3 Funções da página

- **Contagens**: fórmula ao lado do valor enumerado para $\lvert V\rvert$, $\lvert E\rvert$,
  $\beta$, terminais e folhas, com marca de concordância, e a tabela por camada (o mesmo
  formato da Tabela 2).
- **Partida**: escolhe-se a carta revelada e a previsão; o caminho se acende no grafo e na
  árvore. O usuário escolhe também a carta porque o objetivo é percorrer o grafo de todas as
  jogadas possíveis, não simular o sorteio.
- **β enumerado**: `arvoreGeradora` aplica a construção da Proposição 3.7 (uma aresta de
  entrada mantida por vértice; aqui, a primeira que o descobriu), e o $\beta$ "enumerado" do
  painel é o número de arestas fora dessa árvore.
- **Menor ciclo**: `cicloQuatro` procura a configuração $u, v, a, b$ da Figura 1. Se ela
  existe, o painel informa que o menor ciclo simples tem 4 arestas; para $N \le 2$, que o grafo
  associado é uma árvore.
