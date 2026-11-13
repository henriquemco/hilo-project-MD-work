# Hi-Lo competitivo: calculadora combinatória e visualizador interativo

Implementações computacionais que acompanham o trabalho *Árvores e grafos de estados em uma
variante competitiva de Hi-Lo* (Matemática Discreta). As referências a seções, teoremas e
tabelas são às do rascunho de 24 de outubro de 2026.

| Arquivo | Linguagem | Função |
|---|---|---|
| `hilo_calc.py` | Python 3 (só biblioteca padrão) | Calculadora: contagens exatas por fórmula, enumeração de finais pequenos e verificação dos enunciados |
| `visualizador.html` | HTML + JavaScript (arquivo único, sem dependências) | Visualizador: desenha a árvore de históricos e o grafo de estados e permite explorá-los |

As duas ferramentas implementam o mesmo modelo de forma independente. Isso é proposital: a
concordância entre elas (e com as tabelas do trabalho) é um teste cruzado.

## 1. Como executar

```bash
# Final da Seção 4.1, com verificação por enumeração
python3 hilo_calc.py --cartas 6,7,7 --ref 6 --verificar

# Só as multiplicidades (linha (2,2,2,2) da Tabela 3)
python3 hilo_calc.py --mult 2,2,2,2

# Baralho de 36 cartas após a referência inicial (Seção 4.3)
python3 hilo_calc.py --baralho

# Bateria de verificação em todas as composições pequenas
python3 hilo_calc.py --teste            # opcional: --nmax 8
```

O visualizador não precisa de instalação nem de servidor: abra `visualizador.html` em um
navegador.

## 2. O modelo comum

**Estado.** A tupla $s = (c, r, d, t)$ da Definição 2.5: $c$ é o vetor de cartas restantes
(alinhado com a lista dos valores distintos), $r$ a referência, $d$ a diferença de pontos e
$t$ o jogador da vez. A camada não é armazenada como dado independente, pois
$m = N - n(s)$.

**Transição.** A função $\delta(s, p, j)$ recebe uma previsão $p$ e o valor $j$ da carta
revelada e aplica a Tabela 1: decrementa $c_j$, faz $r \leftarrow j$ e, conforme a previsão
acerte ou erre, altera $d$ ou troca $t$. Em Python é `transicao`; em JavaScript, `transicao`.

**Reunião de históricos.** O estado é imutável e serve de chave de dicionário (em JavaScript,
a função `chave` o converte em texto). Dois históricos que produzem a mesma chave caem no
mesmo vértice. É só isso que distingue a construção do grafo da construção da árvore.

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

## 3. Calculadora combinatória (`hilo_calc.py`)

O arquivo tem três partes.

### 3.1 Parte 1: contagem por fórmula

Recebe apenas as multiplicidades $C = (C_1, \dots, C_k)$ e não constrói nenhum grafo.

| Função | Resultado | Origem |
|---|---|---|
| `num_vertices` | $\lvert V\rvert$ | Teorema 3.3, fórmula (1) |
| `num_terminais` | $2Nk$ | Corolário 3.4 |
| `num_folhas` | $L = 3^N N!/\prod C_i!$ | Proposição 3.5, fórmula (3) |
| `num_arestas` | $\lvert E\rvert$ | forma fechada da §3.3 abaixo |
| `num_elos` | $\beta = \lvert E\rvert - \lvert V\rvert + 1$ | Proposição 3.7 |
| `vertices_por_camada` | $\lvert V_m\rvert$ | Corolário 3.4, fórmula (2) |
| `arestas_por_camada` | arestas que saem da camada $m$ | §3.3 |
| `historicos_por_camada` | vértices da árvore na profundidade $m$ | §3.4 |

**Aritmética.** Tudo é feito com o `int` do Python, de precisão arbitrária. O multinomial é
calculado como produto de binomiais, $\binom{C_1}{C_1}\binom{C_1+C_2}{C_2}\cdots$, sem
fatoriais nem divisões. Ponto flutuante só aparece na aproximação impressa de $L$.

### 3.2 Contagens por camada: polinômios em vez de vetores

A fórmula (2) soma sobre vetores de consumo $a$ com $|a| = m$. Trocando a ordem das somas,

$$|V_m| = 2m \sum_{j=1}^{k} \#\{a \in B_j : |a| = m\},$$

onde $B_j$ é a caixa $1 \le a_j \le C_j$, $0 \le a_i \le C_i$. O número de vetores de uma
caixa com soma $m$ é o coeficiente de $x^m$ no produto dos polinômios
$x^{lo_i} + \dots + x^{hi_i}$ de cada coordenada. A função `_contar_caixa` faz esse produto.
O custo é polinomial em $N$ e $k$, em vez de proporcional aos $\prod (C_i+1)$ vetores
(1.562.500 no baralho completo).

### 3.3 Número de arestas em forma fechada

**Este resultado não está no rascunho.** A Tabela 3 obteve $\lvert E\rvert$ construindo os
estados; aqui ele é deduzido. O argumento abaixo é um esboço: se o grupo quiser incluí-lo no
texto, convém redigir a demonstração completa.

Pela Proposição 3.1(iii), $\deg^+(s) = 2q$, com $q$ o número de valores ainda disponíveis.
Para um estado do bloco do vetor de consumo $a$, $q(a) = \#\{i : a_i < C_i\}$, que não
depende de $r$ nem de $(d,t)$. O bloco tem $2|a| \cdot \#\{j : a_j \ge 1\}$ estados (Lema
3.2 e prova do Teorema 3.3). A raiz contribui com $2k$. Logo

$$|E| = 2k + \sum_{a \ne 0} 4|a| \cdot \#\{j : a_j \ge 1\} \cdot \#\{i : a_i < C_i\}
      = 2k + \sum_{(j,i)} \sum_{a \in B_{j,i}} 4|a|,$$

onde $B_{j,i}$ é a caixa dos vetores com $a_j \ge 1$ e $a_i \le C_i - 1$. Refletir cada
coordenada dentro do seu intervalo é uma involução de $B_{j,i}$ que leva $|a|$ em $N - |a|$
(a mesma ideia da bijeção $a \mapsto a'$ do Teorema 3.3). Portanto
$\sum_{a \in B_{j,i}} |a| = N\,|B_{j,i}|/2$ e

$$|E| = 2k + 2N\Big[\sum_{j \ne i} C_j C_i \prod_{l \ne i,j}(C_l+1) \;+\; \sum_{j}(C_j-1)\prod_{l \ne j}(C_l+1)\Big].$$

Conferência com a Tabela 3: $(3) \mapsto 14$, $(1,2) \mapsto 40$, $(2,2) \mapsto 116$,
$(2,2,2,2) \mapsto 8.648$. A versão por camada (`arestas_por_camada`) usa a mesma
decomposição com os polinômios da §3.2 e reproduz a última coluna da Tabela 2: $4, 12, 24, 0$.

### 3.4 Vértices da árvore por profundidade

Um histórico de comprimento $m$ é uma sequência de $m$ valores revelados, compatível com as
multiplicidades, e $m$ previsões: $3^m S_m$. O número $S_m$ de sequências de valores é
calculado acrescentando um valor por vez: se o novo valor tem multiplicidade $C$,
$S'_m = \sum_{a=0}^{\min(C,m)} \binom{m}{a} S_{m-a}$ (escolhem-se as posições que ele ocupa).

### 3.5 Parte 2: enumeração

A classe `Grafo` constrói o grafo como descrito na §2 e guarda `camadas`, `arestas`
(dicionário $(u,v) \mapsto$ conjunto de previsões) e `historicos`. Só é viável para finais
pequenos; `--verificar` recusa $N > 10$.

### 3.6 Parte 3: verificação

`verificar` enumera o grafo e testa, um a um, os enunciados da Seção 3:

| Teste | Enunciado |
|---|---|
| $\lvert V\rvert$, $\lvert V_m\rvert$ e terminais coincidem com as fórmulas | Teorema 3.3, Corolário 3.4 |
| toda aresta liga a camada $m$ à $m+1$ (o que dá a bipartição) | Proposição 3.1(i), Teorema 3.6 |
| grau de saída $2q$; $3q$ pares (previsão, carta); por carta, uma aresta com 1 previsão e uma com 2 | Proposição 3.1(iii) |
| em cada bloco (mesmas cartas e referência) os pares $(d,t)$ são exatamente os $2m$ previstos, com $t=1 \iff m-d$ par | Lema 3.2 |
| vértices da árvore por profundidade e folhas | Proposição 3.5 |
| $\lvert E\rvert$ e arestas por camada coincidem com a §3.3 | (resultado novo) |
| $\beta = \sum_{v \ne o}(\deg^-(v) - 1)$ | Proposição 3.7 |
| $\beta = 0 \iff N \le 2$; para $N \ge 3$ existe a configuração $u, v, a, b$ da Figura 1 | Teorema 3.6 |

Sobre o último teste: o grafo associado é conexo, logo é árvore se e somente se
$\lvert E\rvert = \lvert V\rvert - 1$. E, num grafo simples e bipartido, encontrar dois
estados da mesma camada com dois sucessores comuns basta para concluir que o menor ciclo
simples tem comprimento 4.

`--teste` aplica `verificar` a todas as composições com 1 a 4 valores distintos,
multiplicidades de 1 a 4 e no máximo 8 cartas, com três referências iniciais (menor valor,
maior valor e um valor ausente). São **386 grafos, sem nenhuma falha** (cerca de 3 s). O
critério de varredura não é o mesmo dos 519 grafos citados na Seção 4.2, por isso o número
difere.

### 3.7 Resultados reproduzidos

| Multiplicidades | $N$ | $\lvert V\rvert$ | $\lvert E\rvert$ | $\beta$ | terminais | folhas |
|---|---|---|---|---|---|---|
| (3) | 3 | 13 | 14 | 2 | 6 | 27 |
| (1, 2) | 3 | 29 | 40 | 12 | 12 | 81 |
| (2, 2) | 4 | 61 | 116 | 56 | 16 | 486 |
| (2, 2, 2, 2) | 8 | 1.945 | 8.648 | 6.704 | 64 | 16.533.720 |
| (3, 4, 4, 4, 4, 4, 4, 4, 4) | 35 | 402.187.501 | 5.549.687.518 | 5.147.500.018 | 630 | ≈ 7,83 · 10⁴⁴ |

As quatro primeiras linhas coincidem com a Tabela 3 e foram confirmadas por enumeração. Na
última, $\lvert V\rvert$, os terminais e $L$ coincidem com a Seção 4.3; $\lvert E\rvert$ e
$\beta$ do baralho completo são valores novos, obtidos pela fórmula da §3.3 (não é possível
conferi-los por enumeração).

## 4. Visualizador interativo (`visualizador.html`)

### 4.1 Arquitetura

O arquivo tem dois blocos de script.

- **`nucleo`**: o modelo matemático, sem acesso à página. Contém `acerta`, `chave`,
  `transicao`, `construirGrafo`, `construirArvore`, `formulas` (em `BigInt`),
  `arvoreGeradora` e `cicloQuatro`.
- **`interface`**: disposição, desenho em SVG e eventos.

A interface segue um único princípio: o objeto `app` guarda todo o estado da aplicação
(composição, grafo, árvore, partida em andamento, estado selecionado, opções), e `render()`
redesenha tudo a partir dele. Cada interação altera um campo de `app` e chama `render()`.
Não há estado escondido nos elementos da página.

### 4.2 A projeção árvore → grafo

Cada nó da árvore guarda a chave do seu estado, isto é, a imagem pela aplicação
$\pi : \{\text{históricos}\} \to \{\text{estados}\}$. Essa aplicação preserva camadas e leva
arestas em arestas. As interações existem para torná-la visível nos dois sentidos:

- **clique em um estado do grafo**: destaca na árvore a fibra $\pi^{-1}(s)$, todos os
  históricos reunidos naquele estado, e mostra $(c, r, d, t)$, a camada, os graus e os
  predecessores com as previsões de cada aresta;
- **clique em um nó da árvore**: carrega aquele histórico como partida e destaca o caminho
  correspondente no grafo.

### 4.3 Disposição

**Grafo** (`disporGrafo`). A coordenada vertical é a camada $m$, o que torna a Proposição
3.1(i) visível: toda aresta desce exatamente um nível. Dentro da camada, os estados são
agrupados em blocos com as mesmas cartas restantes e a mesma referência, com $d$ decrescente.
Esses blocos são os conjuntos de $2m$ estados da demonstração do Teorema 3.3, e o desenho
mostra que todos têm o mesmo tamanho dentro de uma camada. Arestas de acerto são contínuas;
arestas de erro, tracejadas.

**Árvore** (`disporArvore`). As folhas ficam igualmente espaçadas na ordem de uma busca em
profundidade e cada nó interno fica centrado sobre os filhos.

### 4.4 Funções da página

- **Contagens**: fórmula ao lado do valor enumerado para $\lvert V\rvert$, $\lvert E\rvert$,
  $\beta$, terminais e folhas, com marca de concordância, e a tabela por camada (o mesmo
  formato da Tabela 2).
- **Partida**: escolhe-se a carta revelada e a previsão; o caminho se acende no grafo e na
  árvore. O usuário escolhe também a carta porque o objetivo é percorrer o grafo de todas as
  jogadas possíveis, não simular o sorteio.
- **Árvore geradora**: aplica a construção da Proposição 3.7 (uma aresta de entrada mantida
  por vértice; aqui, a primeira que o descobriu) e pinta de vermelho as arestas removidas. O
  $\beta$ "enumerado" do painel é a contagem dessas arestas.
- **Menor ciclo**: destaca a configuração $u, v, a, b$ da Figura 1, encontrada por
  `cicloQuatro`. Para $N \le 2$ a página informa que o grafo associado é uma árvore.

### 4.5 Limites de tamanho

| Constante | Valor | Efeito |
|---|---|---|
| `LIM_ARVORE` | 800 nós | acima disso a árvore não é desenhada (só o seu tamanho é mostrado) |
| `LIM_DESENHO` | 700 estados | acima disso o grafo não é desenhado, mas continua enumerado |
| `LIM_ENUM` | 20.000 estados | acima disso só as fórmulas são mostradas |

Exemplos: `[6,7,7]` e `[6,6,7,7]` desenham as duas representações (115 e 691 nós na árvore);
`(2,2,2,2)` é enumerado, mas não desenhado. A árvore cresce como
$3^N N!/\prod C_i!$, de modo que deixa de ser desenhável já com cinco cartas na maioria das
composições. Isso ilustra a comparação de crescimento da Seção 3.3.

## 5. Testes realizados

1. `hilo_calc.py --teste`: 386 grafos, todos os testes da §3.6 aprovados.
2. O núcleo JavaScript foi executado isoladamente e comparado com a Tabela 3 e com as
   fórmulas para (3), (1,2), (2,2), (2,2,2,2) e (1,1).
3. A página foi aberta em navegador automatizado: construção dos exemplos, partida, seleção
   de estado, clique na árvore, árvore geradora e menor ciclo, sem erros no console.

## 6. Limitações

- A enumeração é exponencial em $N$; para o baralho completo só as fórmulas se aplicam.
- A fórmula de $\lvert E\rvert$ (§3.3) está verificada por enumeração em 386 grafos, mas sua
  demonstração aqui é um esboço.
- A ordem horizontal dos estados no desenho é fixa (por bloco e por $d$) e não minimiza
  cruzamentos de arestas.
- Nenhuma das ferramentas calcula estratégias ou probabilidades, que estão fora do objetivo
  do trabalho.
