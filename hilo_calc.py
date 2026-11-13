#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
hilo_calc.py — Calculadora combinatória para o grafo de estados do Hi-Lo competitivo.

O módulo tem duas partes independentes, que só se encontram no modo de verificação:

  PARTE 1 — CONTAGEM POR FÓRMULA
      Recebe apenas as multiplicidades (C_1, ..., C_k) das cartas restantes e
      devolve |V|, |V_m|, |E|, β, terminais e folhas SEM construir o grafo.
      Funciona para o baralho completo (35 cartas após a referência inicial).

  PARTE 2 — ENUMERAÇÃO (FORÇA BRUTA)
      Constrói o grafo de estados camada a camada, usando as três previsões
      explícitas (menor/igual/maior) e a Tabela 1 do trabalho. Só é viável para
      finais pequenos (N até cerca de 8 ou 9).

  PARTE 3 — VERIFICAÇÃO
      Compara as duas rotas e testa cada enunciado da Seção 3 do trabalho.

Notação (a mesma do texto):
    N      número de cartas restantes na raiz
    k      número de valores distintos entre elas
    C_j    multiplicidade do j-ésimo valor
    m      camada = número de jogadas já realizadas
    a      vetor de consumo: a_i cartas do valor i já foram reveladas, |a| = m
    (c, r, d, t)  estado: cartas restantes, referência, diferença de pontos, vez

Toda a aritmética usa o tipo `int` do Python, que tem precisão arbitrária;
nenhum valor passa por ponto flutuante (exceto a aproximação impressa de L).

Uso rápido:
    python3 hilo_calc.py --cartas 6,7,7 --ref 6 --verificar
    python3 hilo_calc.py --mult 2,2,2,2
    python3 hilo_calc.py --baralho
    python3 hilo_calc.py --teste
"""

from __future__ import annotations

import argparse
import sys
import time
from itertools import product
from math import comb, prod

# As três previsões permitidas pelas regras (Seção 2.1).
PREVISOES = ("menor", "igual", "maior")


# ============================================================================
# PARTE 1 — CONTAGEM POR FÓRMULA
# ============================================================================

def num_vertices(C: list[int]) -> int:
    """|V| pelo Teorema 3.3, fórmula (1):

        |V| = 1 + (N + 1) * sum_j  C_j * prod_{i != j} (C_i + 1).

    O termo j conta os vetores de consumo compatíveis com "a referência atual
    é v_j" (caixa B_j); o fator (N + 1) vem da bijeção a -> a' da demonstração.
    """
    N = sum(C)
    if N == 0:
        return 1  # só a raiz
    soma = sum(
        Cj * prod(Ci + 1 for i, Ci in enumerate(C) if i != j)
        for j, Cj in enumerate(C)
    )
    return 1 + (N + 1) * soma


def num_terminais(C: list[int]) -> int:
    """Número de estados terminais: 2Nk (Corolário 3.4). Se N = 0, a raiz é o
    único estado e ela própria é terminal."""
    N = sum(C)
    return 2 * N * len(C) if N else 1


def multinomial(C: list[int]) -> int:
    """N! / (C_1! ... C_k!), calculado como produto de binomiais

        binom(C_1, C_1) * binom(C_1 + C_2, C_2) * ...

    para nunca formar fatoriais grandes nem fazer divisões."""
    resultado, acumulado = 1, 0
    for c in C:
        acumulado += c
        resultado *= comb(acumulado, c)
    return resultado


def num_folhas(C: list[int]) -> int:
    """Folhas da árvore de históricos: L = 3^N * N!/(C_1!...C_k!)
    (Proposição 3.5, fórmula (3))."""
    return 3 ** sum(C) * multinomial(C)


def num_arestas(C: list[int]) -> int:
    """|E| em forma fechada (resultado que NÃO está no rascunho; ver README, §3.3).

    Pela Proposição 3.1(iii), um estado tem grau de saída 2q, com q o número de
    valores ainda disponíveis. Um estado do bloco do vetor de consumo a tem
    q(a) = #{i : a_i < C_i}, e o bloco contém 2|a| * #{j : a_j >= 1} estados.
    Logo, fora a raiz (que contribui 2k),

        |E| - 2k = sum_a 4|a| * #{j : a_j >= 1} * #{i : a_i < C_i}
                 = sum_{(j,i)} sum_{a em B_{j,i}} 4|a|,

    onde B_{j,i} é a caixa dos vetores com a_j >= 1 e a_i <= C_i - 1.
    A involução que reflete cada coordenada em seu intervalo leva |a| em N - |a|,
    de modo que a soma de |a| sobre B_{j,i} vale N * |B_{j,i}| / 2. Portanto

        |E| = 2k + 2N * [ sum_{j != i} C_j C_i prod_{l != i,j} (C_l + 1)
                          + sum_j (C_j - 1) prod_{l != j} (C_l + 1) ].
    """
    N, k = sum(C), len(C)
    if N == 0:
        return 0
    # Pares (j, i) com j != i: a_j em [1, C_j], a_i em [0, C_i - 1].
    misto = sum(
        C[j] * C[i] * prod(C[l] + 1 for l in range(k) if l not in (i, j))
        for j in range(k) for i in range(k) if i != j
    )
    # Pares (j, j): a_j em [1, C_j - 1] (caixa vazia quando C_j = 1).
    diagonal = sum(
        (C[j] - 1) * prod(C[l] + 1 for l in range(k) if l != j)
        for j in range(k)
    )
    return 2 * k + 2 * N * (misto + diagonal)


def num_elos(C: list[int]) -> int:
    """β = |E| - |V| + 1: arestas excedentes em relação a uma árvore geradora
    (Proposição 3.7)."""
    return num_arestas(C) - num_vertices(C) + 1


# ---------------------------------------------------------------------------
# Contagens por camada, via polinômios geradores.
#
# Em vez de percorrer os prod (C_i + 1) vetores de consumo, representamos cada
# coordenada pelo polinômio x^lo + ... + x^hi do intervalo em que ela varia.
# O coeficiente de x^m no produto é o número de vetores da caixa com |a| = m.
# ---------------------------------------------------------------------------

def _intervalo(lo: int, hi: int) -> list[int]:
    """Coeficientes de x^lo + x^(lo+1) + ... + x^hi (polinômio nulo se hi < lo)."""
    if hi < lo:
        return [0]
    return [0] * lo + [1] * (hi - lo + 1)


def _multiplicar(p: list[int], q: list[int]) -> list[int]:
    """Produto de dois polinômios dados por listas de coeficientes."""
    r = [0] * (len(p) + len(q) - 1)
    for i, pi in enumerate(p):
        if pi:
            for j, qj in enumerate(q):
                r[i + j] += pi * qj
    return r


def _contar_caixa(intervalos: list[tuple[int, int]], N: int) -> list[int]:
    """Para a caixa prod [lo_i, hi_i], devolve a lista cuja posição m é o número
    de vetores inteiros da caixa com soma m (0 <= m <= N)."""
    pol = [1]
    for lo, hi in intervalos:
        pol = _multiplicar(pol, _intervalo(lo, hi))
    pol += [0] * (N + 1 - len(pol))
    return pol[: N + 1]


def vertices_por_camada(C: list[int]) -> list[int]:
    """|V_m| para m = 0..N, pela fórmula (2) do Corolário 3.4:

        |V_m| = 2m * sum_{|a| = m} #{j : a_j > 0}.

    Trocando a ordem das somas, o termo j conta os vetores da caixa B_j
    (a_j >= 1) com soma m — exatamente um coeficiente de polinômio."""
    N, k = sum(C), len(C)
    camadas = [0] * (N + 1)
    camadas[0] = 1
    for j in range(k):
        caixa = [(1, C[i]) if i == j else (0, C[i]) for i in range(k)]
        cont = _contar_caixa(caixa, N)
        for m in range(1, N + 1):
            camadas[m] += 2 * m * cont[m]
    return camadas


def arestas_por_camada(C: list[int]) -> list[int]:
    """Número de arestas que SAEM de cada camada m = 0..N (a última é sempre 0).

    Mesma decomposição de `num_arestas`, mas guardando o coeficiente de cada
    grau em vez de somar tudo com a involução."""
    N, k = sum(C), len(C)
    saida = [0] * (N + 1)
    if N == 0:
        return saida
    saida[0] = 2 * k  # a raiz tem os k valores disponíveis
    for j in range(k):
        for i in range(k):
            caixa = [(0, C[l]) for l in range(k)]
            if i == j:
                caixa[j] = (1, C[j] - 1)
            else:
                caixa[j] = (1, C[j])
                caixa[i] = (0, C[i] - 1)
            cont = _contar_caixa(caixa, N)
            for m in range(1, N + 1):
                saida[m] += 4 * m * cont[m]
    return saida


def historicos_por_camada(C: list[int]) -> list[int]:
    """Número de vértices da ÁRVORE de históricos em cada profundidade m.

    Um histórico de comprimento m é uma sequência de m valores revelados
    (respeitando as multiplicidades) junto com m previsões: 3^m * S_m, onde
    S_m conta as sequências de valores. S_m é calculado valor a valor:
    ao acrescentar um valor com multiplicidade C, escolhemos em quais das m
    posições ele aparece (binom(m, a), com a <= C)."""
    N = sum(C)
    seq = [1] + [0] * N  # nenhuma categoria: só a sequência vazia
    for c in C:
        nova = [0] * (N + 1)
        for m in range(N + 1):
            nova[m] = sum(comb(m, a) * seq[m - a] for a in range(min(c, m) + 1))
        seq = nova
    return [3 ** m * seq[m] for m in range(N + 1)]


# ============================================================================
# PARTE 2 — ENUMERAÇÃO DO GRAFO DE ESTADOS
# ============================================================================
#
# Um estado é a tupla imutável (c, r, d, t) da Definição 2.5:
#     c  tupla de inteiros, alinhada com `valores`: c[i] cartas de valor valores[i]
#     r  referência atual
#     d  pontos do jogador 1 menos pontos do jogador 2
#     t  jogador da vez (1 ou 2)
# Por ser imutável, o estado serve de chave de dicionário: é isso que reúne
# históricos diferentes no mesmo vértice.

def acerta(previsao: str, r: int, j: int) -> bool:
    """A previsão está correta quando a carta revelada j se compara com a
    referência r da maneira prevista."""
    return (
        (previsao == "menor" and j < r)
        or (previsao == "igual" and j == r)
        or (previsao == "maior" and j > r)
    )


def transicao(valores: tuple[int, ...], estado: tuple, previsao: str, idx: int) -> tuple:
    """Função de transição δ(s, p, j): aplica a Tabela 1 do trabalho.

    `idx` é a posição, em `valores`, da carta revelada (exige c[idx] > 0)."""
    c, r, d, t = estado
    j = valores[idx]
    c2 = c[:idx] + (c[idx] - 1,) + c[idx + 1:]       # consome uma carta de valor j
    if acerta(previsao, r, j):
        return (c2, j, d + (1 if t == 1 else -1), t)  # ponto para quem jogou; mantém a vez
    return (c2, j, d, 3 - t)                          # ninguém pontua; troca a vez


class Grafo:
    """Grafo de estados enumerado.

    Atributos:
        valores     valores distintos das cartas, em ordem crescente
        raiz        estado inicial
        camadas     camadas[m] = lista dos estados alcançados após m jogadas
        arestas     dict (u, v) -> conjunto das previsões que levam de u a v
        historicos  dict estado -> número de históricos reunidos nesse estado
    """

    def __init__(self, valores, mult, ref):
        self.valores = tuple(valores)
        self.mult = tuple(mult)
        self.N = sum(mult)
        self.raiz = (tuple(mult), ref, 0, 1)
        self.camadas = [[self.raiz]]
        self.arestas: dict[tuple, set[str]] = {}
        self.historicos = {self.raiz: 1}
        self._construir()

    def _construir(self):
        """Busca em largura por camadas. Como toda jogada consome uma carta, os
        sucessores da camada m estão todos na camada m + 1 (Prop. 3.1(i)); basta
        um dicionário por camada para detectar estados repetidos."""
        for m in range(self.N):
            nova: dict[tuple, None] = {}  # dict preserva a ordem de descoberta
            for u in self.camadas[m]:
                for idx, qtd in enumerate(u[0]):
                    if qtd == 0:
                        continue
                    for p in PREVISOES:
                        v = transicao(self.valores, u, p, idx)
                        self.arestas.setdefault((u, v), set()).add(p)
                        nova[v] = None
                        # Cada par (previsão, carta) prolonga cada histórico de u.
                        self.historicos[v] = self.historicos.get(v, 0) + self.historicos[u]
            self.camadas.append(list(nova))

    @property
    def num_vertices(self) -> int:
        return sum(len(cam) for cam in self.camadas)

    @property
    def num_arestas(self) -> int:
        return len(self.arestas)


# ============================================================================
# PARTE 3 — VERIFICAÇÃO: fórmulas x enumeração, e os enunciados da Seção 3
# ============================================================================

def verificar(valores, mult, ref) -> list[tuple[str, bool, str]]:
    """Enumera o grafo e devolve uma lista de testes (nome, passou?, detalhe)."""
    C = list(mult)
    N, k = sum(C), len(C)
    g = Grafo(valores, mult, ref)
    testes: list[tuple[str, bool, str]] = []

    def registrar(nome, ok, detalhe=""):
        testes.append((nome, bool(ok), detalhe))

    # --- graus de entrada e de saída -------------------------------------
    sucessores: dict[tuple, list[tuple]] = {}
    grau_entrada: dict[tuple, int] = {}
    for (u, v) in g.arestas:
        sucessores.setdefault(u, []).append(v)
        grau_entrada[v] = grau_entrada.get(v, 0) + 1

    # --- Teorema 3.3 e Corolário 3.4 --------------------------------------
    registrar("Teo. 3.3: |V| = fórmula (1)", g.num_vertices == num_vertices(C),
              f"{g.num_vertices} x {num_vertices(C)}")
    tam = [len(cam) for cam in g.camadas]
    registrar("Cor. 3.4: |V_m| = fórmula (2)", tam == vertices_por_camada(C), str(tam))
    registrar("Cor. 3.4: terminais = 2Nk", tam[-1] == num_terminais(C), str(tam[-1]))

    # --- Proposição 3.1 ----------------------------------------------------
    ok_camada = all(sum(v[0]) == sum(u[0]) - 1 for (u, v) in g.arestas)
    registrar("Prop. 3.1(i): toda aresta avança uma camada (logo, bipartido)", ok_camada)

    ok_grau = True
    for cam in g.camadas:
        for u in cam:
            q = sum(1 for x in u[0] if x > 0)
            saidas = sucessores.get(u, [])
            n_prev = sum(len(g.arestas[(u, v)]) for v in saidas)
            tam_prev = sorted(len(g.arestas[(u, v)]) for v in saidas)
            # 2q sucessores; 3q pares (previsão, carta); por carta, 1 aresta de
            # acerto (uma previsão) e 1 de erro (duas previsões).
            if len(saidas) != 2 * q or n_prev != 3 * q or tam_prev != [1] * q + [2] * q:
                ok_grau = False
    registrar("Prop. 3.1(iii): grau de saída 2q, com 3q filhos na árvore", ok_grau)

    # --- Lema 3.2 ----------------------------------------------------------
    ok_lema = True
    for m, cam in enumerate(g.camadas):
        if m == 0:
            continue
        blocos: dict[tuple, set] = {}
        for (c, r, d, t) in cam:
            blocos.setdefault((c, r), set()).add((d, t))
        esperado = {(d, 1 if (m - d) % 2 == 0 else 2) for d in range(1 - m, m + 1)}
        if any(pares != esperado for pares in blocos.values()):
            ok_lema = False
    registrar("Lema 3.2: 2m pares (d, t) por bloco e t = 1 <=> m - d par", ok_lema)

    # --- Proposição 3.5 (árvore de históricos) -----------------------------
    hist = [sum(g.historicos[s] for s in cam) for cam in g.camadas]
    registrar("Árvore: vértices por profundidade", hist == historicos_por_camada(C), str(hist))
    registrar("Prop. 3.5: folhas = fórmula (3)", hist[-1] == num_folhas(C), str(hist[-1]))

    # --- arestas e Proposição 3.7 ------------------------------------------
    registrar("|E| = forma fechada (README §3.3)", g.num_arestas == num_arestas(C),
              f"{g.num_arestas} x {num_arestas(C)}")
    saindo = [sum(len(sucessores.get(u, [])) for u in cam) for cam in g.camadas]
    registrar("Arestas que saem de cada camada", saindo == arestas_por_camada(C), str(saindo))
    beta = g.num_arestas - g.num_vertices + 1
    excesso = sum(grau - 1 for grau in grau_entrada.values())
    registrar("Prop. 3.7: β = soma de (deg⁻ - 1)", beta == excesso, f"β = {beta}")

    # --- Teorema 3.6 --------------------------------------------------------
    # O grafo associado é conexo; é árvore se, e somente se, |E| = |V| - 1.
    registrar("Teo. 3.6: árvore <=> N <= 2", (beta == 0) == (N <= 2), f"N = {N}, β = {beta}")
    if N >= 3:
        registrar("Teo. 3.6: existe ciclo simples de comprimento 4",
                  encontrar_ciclo_quatro(g, sucessores) is not None)
    return testes


def encontrar_ciclo_quatro(g: Grafo, sucessores: dict) -> tuple | None:
    """Procura dois estados u, v da mesma camada com dois sucessores comuns a, b.

    Como toda aresta liga camadas consecutivas, u-a-v-b-u é então um ciclo
    simples de quatro arestas no grafo associado (configuração da Figura 1).
    Num grafo simples e bipartido não há ciclo menor, de modo que encontrar
    essa configuração prova que a cintura é exatamente 4."""
    for cam in g.camadas:
        for x in range(len(cam)):
            sx = set(sucessores.get(cam[x], []))
            for y in range(x + 1, len(cam)):
                comuns = [w for w in sucessores.get(cam[y], []) if w in sx]
                if len(comuns) >= 2:
                    return (cam[x], cam[y], comuns[0], comuns[1])
    return None


def bateria_de_testes(nmax: int = 8, kmax: int = 4, cmax: int = 4) -> bool:
    """Varre todas as composições com até `kmax` valores distintos,
    multiplicidades de 1 a `cmax` e no máximo `nmax` cartas. Os valores usados
    são 2, 3, ..., k+1 e a referência inicial varia entre o menor valor, o
    maior valor e 10 (um valor ausente das cartas restantes)."""
    inicio = time.time()
    grafos = falhas = 0
    for k in range(1, kmax + 1):
        valores = tuple(range(2, 2 + k))
        for mult in product(range(1, cmax + 1), repeat=k):
            if sum(mult) > nmax:
                continue
            for ref in sorted({valores[0], valores[-1], 10}):
                grafos += 1
                for nome, ok, detalhe in verificar(valores, mult, ref):
                    if not ok:
                        falhas += 1
                        print(f"FALHA  mult={mult} ref={ref}: {nome} {detalhe}")
    print(f"{grafos} grafos enumerados em {time.time() - inicio:.1f} s; "
          f"{falhas} falha(s).")
    return falhas == 0


# ============================================================================
# INTERFACE DE LINHA DE COMANDO
# ============================================================================

def fmt(n: int) -> str:
    """Inteiro com separador de milhar no padrão brasileiro."""
    return f"{n:,}".replace(",", ".")


def relatorio(C: list[int], titulo: str) -> None:
    """Imprime todas as contagens por fórmula para as multiplicidades C."""
    N, k = sum(C), len(C)
    L = num_folhas(C)
    print(f"\n{titulo}")
    print(f"multiplicidades C = {tuple(C)}   N = {N}   k = {k}\n")
    print(f"  |V|  vértices do grafo de estados ....... {fmt(num_vertices(C))}")
    print(f"  |E|  arestas ............................ {fmt(num_arestas(C))}")
    print(f"  β    arestas excedentes |E| - |V| + 1 ... {fmt(num_elos(C))}")
    print(f"       estados terminais (2Nk) ............ {fmt(num_terminais(C))}")
    print(f"  L    folhas da árvore de históricos ..... {fmt(L)}")
    if L >= 10 ** 15:
        expoente = len(str(L)) - 1
        mantissa = L / 10 ** expoente
        print(f"       (aproximadamente {mantissa:.2f} x 10^{expoente})".replace(".", ",", 1))

    arv, vert, ares = historicos_por_camada(C), vertices_por_camada(C), arestas_por_camada(C)
    w = max(20, len(fmt(sum(arv))) + 1)  # largura da coluna da árvore (números enormes)
    print(f"\n  {'m':>3} {'vértices da árvore':>{w}} {'vértices do grafo':>18} {'arestas que saem':>17}")
    for m in range(N + 1):
        print(f"  {m:>3} {fmt(arv[m]):>{w}} {fmt(vert[m]):>18} {fmt(ares[m]):>17}")
    print(f"  {'tot':>3} {fmt(sum(arv)):>{w}} {fmt(sum(vert)):>18} {fmt(sum(ares)):>17}")


def _inteiros(ap: argparse.ArgumentParser, texto: str, opcao: str, exemplo: str) -> list[int]:
    """Converte "6,7,7" em [6, 7, 7]; encerra com mensagem de uso se o texto
    estiver vazio ou tiver algo que não seja inteiro."""
    partes = [x.strip() for x in texto.split(",") if x.strip()]
    if not partes:
        ap.error(f"{opcao}: informe ao menos um valor (p. ex. {exemplo})")
    try:
        return [int(x) for x in partes]
    except ValueError:
        ap.error(f"{opcao}: valores devem ser inteiros separados por vírgula, recebido {texto!r}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Calculadora combinatória do grafo de estados do Hi-Lo competitivo.")
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--cartas", help="cartas restantes, p. ex. 6,7,7")
    grupo.add_argument("--mult", help="multiplicidades, p. ex. 2,2,2,2")
    grupo.add_argument("--baralho", action="store_true",
                       help="baralho de 36 cartas após a referência inicial")
    grupo.add_argument("--teste", action="store_true",
                       help="bateria de verificação em composições pequenas")
    ap.add_argument("--ref", type=int, help="referência inicial (padrão: menor valor)")
    ap.add_argument("--verificar", action="store_true",
                    help="enumera o grafo e compara com as fórmulas (N pequeno)")
    ap.add_argument("--nmax", type=int, default=8, help="N máximo em --teste (padrão 8)")
    args = ap.parse_args(argv)

    if args.teste:
        return 0 if bateria_de_testes(args.nmax) else 1

    if args.baralho:
        valores, mult = tuple(range(2, 11)), (3, 4, 4, 4, 4, 4, 4, 4, 4)
        titulo = "Baralho de 36 cartas, após revelar a referência inicial"
    elif args.cartas is not None:
        cartas = _inteiros(ap, args.cartas, "--cartas", "6,7,7")
        valores = tuple(sorted(set(cartas)))
        mult = tuple(cartas.count(v) for v in valores)
        titulo = f"Cartas restantes {sorted(cartas)}"
    else:
        mult = tuple(_inteiros(ap, args.mult, "--mult", "2,2,2,2"))
        if any(c < 1 for c in mult):
            ap.error("as multiplicidades devem ser positivas")
        valores = tuple(range(2, 2 + len(mult)))
        titulo = "Composição dada pelas multiplicidades"

    ref = args.ref if args.ref is not None else valores[0]
    relatorio(list(mult), titulo)

    if args.verificar:
        N = sum(mult)
        if N > 10:
            print(f"\n--verificar recusado: N = {N} é grande demais para enumerar.")
            return 2
        print(f"\nVerificação por enumeração (valores {valores}, referência {ref}):")
        tudo_ok = True
        for nome, ok, detalhe in verificar(valores, mult, ref):
            tudo_ok &= ok
            print(f"  [{'ok' if ok else 'FALHOU'}] {nome}" + (f"  — {detalhe}" if detalhe and not ok else ""))
        return 0 if tudo_ok else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
