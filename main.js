"use strict";

const PREVISOES = ["menor", "igual", "maior"];

function acerta(p, r, j) {
  return (
    (p === "menor" && j < r) ||
    (p === "igual" && j === r) ||
    (p === "maior" && j > r)
  );
}

/**
 * Chave textual de um estado s = (c, r, d, t). Dois históricos caem no mesmo
 * vértice do grafo exatamente quando produzem a mesma chave: é esta função
 * que realiza a "reunião de históricos" da Seção 2.8.
 */
function chave(s) {
  return s.c.join(",") + "|" + s.r + "|" + s.d + "|" + s.t;
}

function transicao(valores, s, p, i) {
  const c = s.c.slice();
  c[i] -= 1; // a carta revelada é consumida
  const j = valores[i]; // e passa a ser a referência
  if (acerta(p, s.r, j)) {
    return { c, r: j, d: s.d + (s.t === 1 ? 1 : -1), t: s.t }; // ponto; mantém a vez
  }
  return { c, r: j, d: s.d, t: 3 - s.t }; // sem ponto; troca a vez
}

// Constrói o grafo de estados por busca em largura, camada a camada.
function construirGrafo(valores, mult, ref, limite = Infinity) {
  const s0 = { c: mult.slice(), r: ref, d: 0, t: 1 };
  const k0 = chave(s0);
  const estados = new Map([
    [k0, { ...s0, key: k0, m: 0, ent: [], sai: [], hist: 1n }],
  ]);
  const camadas = [[k0]],
    arestas = [],
    indice = new Map();
  const N = mult.reduce((x, y) => x + y, 0);

  for (let m = 0; m < N; m++) {
    const nova = [];
    for (const ku of camadas[m]) {
      const u = estados.get(ku);
      for (let i = 0; i < valores.length; i++) {
        if (u.c[i] === 0) continue;
        for (const p of PREVISOES) {
          const s = transicao(valores, u, p, i),
            kv = chave(s);
          let v = estados.get(kv);
          if (!v) {
            // estado ainda não visto
            v = { ...s, key: kv, m: m + 1, ent: [], sai: [], hist: 0n };
            estados.set(kv, v);
            nova.push(kv);
            if (estados.size > limite) return null;
          }
          v.hist += u.hist; // cada jogada prolonga os históricos de u
          const ka = ku + ">" + kv;
          let ia = indice.get(ka);
          if (ia === undefined) {
            // aresta nova (grafo simples)
            ia = arestas.length;
            indice.set(ka, ia);
            arestas.push({
              de: ku,
              para: kv,
              res: acerta(p, u.r, valores[i]) ? "A" : "E",
              prevs: [],
              i,
            });
            u.sai.push(ia);
            v.ent.push(ia);
          }
          arestas[ia].prevs.push(p); // as duas previsões erradas compartilham a aresta
        }
      }
    }
    camadas.push(nova);
  }
  return { raiz: k0, estados, camadas, arestas, indice, N };
}

// Constrói a árvore de históricos (um nó por sequência de jogadas).
function construirArvore(valores, mult, ref) {
  const nos = [];
  (function gerar(s, pai, mov, m) {
    const no = {
      id: nos.length,
      pai,
      mov,
      estado: chave(s),
      m,
      filhos: [],
      mapa: new Map(),
    };
    nos.push(no);
    if (pai !== null) {
      nos[pai].filhos.push(no.id);
      nos[pai].mapa.set(mov.p + "|" + mov.i, no.id);
    }
    for (let i = 0; i < valores.length; i++) {
      if (s.c[i] === 0) continue;
      for (const p of PREVISOES) {
        gerar(
          transicao(valores, s, p, i),
          no.id,
          { p, i, res: acerta(p, s.r, valores[i]) ? "A" : "E" },
          m + 1,
        );
      }
    }
  })({ c: mult.slice(), r: ref, d: 0, t: 1 }, null, null, 0);
  return nos;
}

// Contagens por fórmula fechada, em BigInt (aritmética exata).
function formulas(mult) {
  const C = mult.map(BigInt),
    k = C.length;
  const N = C.reduce((x, y) => x + y, 0n);
  // produto de (C_l + 1) sobre os índices fora do conjunto `fora`
  const prodFora = (...fora) =>
    C.reduce((ac, c, l) => (fora.includes(l) ? ac : ac * (c + 1n)), 1n);

  let somaV = 0n,
    misto = 0n,
    diagonal = 0n;
  for (let j = 0; j < k; j++) {
    somaV += C[j] * prodFora(j);
    diagonal += (C[j] - 1n) * prodFora(j);
    for (let i = 0; i < k; i++)
      if (i !== j) misto += C[j] * C[i] * prodFora(i, j);
  }
  const V = 1n + (N + 1n) * somaV;
  const E = 2n * BigInt(k) + 2n * N * (misto + diagonal);

  // multinomial como produto de binomiais, sem divisões inexatas
  let multi = 1n,
    acumulado = 0n;
  for (const c of C) {
    for (let x = 1n; x <= c; x++) {
      acumulado += 1n;
      multi = (multi * acumulado) / x;
    }
  }
  return {
    V,
    E,
    beta: E - V + 1n,
    term: 2n * N * BigInt(k),
    folhas: 3n ** N * multi,
  };
}

/**
 * Árvore geradora da demonstração da Proposição 3.7: para cada vértice
 * diferente da raiz, mantém uma aresta de entrada (aqui, a primeira que o
 * descobriu). Devolve o conjunto dos índices das arestas mantidas; as demais
 * são as β arestas excedentes.
 */
function arvoreGeradora(grafo) {
  const mantidas = new Set();
  for (const v of grafo.estados.values())
    if (v.ent.length) mantidas.add(v.ent[0]);
  return mantidas;
}

/**
 * Procura a configuração da Figura 1: dois estados u, v da mesma camada com
 * dois sucessores comuns a, b. No grafo associado, u–a–v–b–u é um ciclo
 * simples de quatro arestas (o menor possível, pelo Teorema 3.6).
 * @returns {boolean} se a configuração existe
 */
function cicloQuatro(grafo) {
  const { estados, camadas, arestas } = grafo;
  const suc = (k) => estados.get(k).sai.map((ia) => arestas[ia].para);
  for (const cam of camadas) {
    for (let x = 0; x < cam.length; x++) {
      const sx = new Set(suc(cam[x]));
      for (let y = x + 1; y < cam.length; y++) {
        const comuns = suc(cam[y]).filter((w) => sx.has(w));
        if (comuns.length >= 2) return true;
      }
    }
  }
  return false;
}

/* Limites de tamanho (ver README, §4.5). */
const LIM_ENUM = 20000; // acima disso, nem enumeramos: só fórmulas
const LIM_DESENHO = 3000; // máximo de estados desenhados
const LIM_ARVORE = 3000; // máximo de nós da árvore desenhados

/* Geometria do grafo. */
const LARG = 44,
  ALT = 22,
  DX = 50,
  DY = 112,
  FOLGA = 16,
  MARGEM = 64;
/* Geometria da árvore. */
const FX = 11,
  FY = 78,
  RAIO = 3.6;

/**
 * Estado da aplicação. Tudo o que aparece na tela é função deste objeto;
 * cada interação altera um campo e chama render().
 */
const app = {
  valores: [],
  mult: [],
  ref: 6,
  grafo: null,
  arvore: null,
  geradora: null,
  ciclo: null,
  posGrafo: null,
  posArvore: null,
  caminho: [], // partida em andamento: lista de jogadas {p, i}
  sel: null, // chave do estado selecionado (ou null)
};

const $ = (id) => document.getElementById(id);
/** BigInt ou número com separador de milhar. */
const fmt = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const sinal = (d) => (d < 0 ? "−" + -d : String(d));

/** Lista das cartas restantes de um estado, p. ex. "6, 7, 7" (ou ∅). */
function cartasDe(s) {
  const lista = [];
  s.c.forEach((q, i) => {
    for (let x = 0; x < q; x++) lista.push(app.valores[i]);
  });
  return lista.length ? lista.join(", ") : "∅";
}

// ---------------------------------------------------------------------------
// Entrada e construção
// ---------------------------------------------------------------------------

function construir() {
  $("erro").textContent = "";
  const texto = $("cartas")
    .value.split(/[\s,;]+/)
    .filter(Boolean);
  const cartas = texto.map(Number);
  if (
    !cartas.length ||
    cartas.some((x) => !Number.isInteger(x) || x < 2 || x > 10)
  ) {
    $("erro").textContent =
      "Informe ao menos uma carta; os valores devem ser inteiros de 2 a 10.";
    return;
  }
  app.valores = [...new Set(cartas)].sort((a, b) => a - b);
  app.mult = app.valores.map((v) => cartas.filter((x) => x === v).length);
  app.ref = Number($("ref").value);
  app.caminho = [];
  app.sel = null;

  app.grafo = construirGrafo(app.valores, app.mult, app.ref, LIM_ENUM);
  app.arvore = app.posGrafo = app.posArvore = app.geradora = app.ciclo = null;
  if (app.grafo) {
    app.geradora = arvoreGeradora(app.grafo);
    app.ciclo = cicloQuatro(app.grafo);
    if (app.grafo.estados.size <= LIM_DESENHO)
      app.posGrafo = disporGrafo(app.grafo);
    // O tamanho da árvore é conhecido sem construí-la: soma dos históricos por estado.
    let total = 0n;
    for (const s of app.grafo.estados.values()) total += s.hist;
    if (total <= BigInt(LIM_ARVORE)) {
      app.arvore = construirArvore(app.valores, app.mult, app.ref);
      app.posArvore = disporArvore(app.arvore);
    }
  }
  render();
}

// ---------------------------------------------------------------------------
// Disposição (layout)
// ---------------------------------------------------------------------------

/**
 * Disposição do grafo em camadas: a coordenada vertical é m. Dentro de cada
 * camada, os estados são agrupados em blocos com as mesmas cartas restantes e
 * a mesma referência — os blocos de 2m estados da demonstração do Teorema 3.3
 * — e ordenados por d decrescente dentro do bloco.
 */
function disporGrafo(g) {
  const linhas = g.camadas.map((cam, m) => {
    const grupos = new Map();
    for (const k of cam) {
      const s = g.estados.get(k),
        kb = s.c.join(",") + "|" + s.r;
      if (!grupos.has(kb)) grupos.set(kb, []);
      grupos.get(kb).push(s);
    }
    const blocos = [...grupos.values()].sort((A, B) => {
      for (let i = 0; i < A[0].c.length; i++)
        if (A[0].c[i] !== B[0].c[i]) return A[0].c[i] - B[0].c[i];
      return A[0].r - B[0].r;
    });
    blocos.forEach((b) => b.sort((x, y) => y.d - x.d));
    const larguras = blocos.map((b) => Math.max(b.length * DX, 96));
    const total =
      larguras.reduce((x, y) => x + y, 0) + FOLGA * (blocos.length - 1);
    return { m, blocos, larguras, total };
  });
  const largura = Math.max(...linhas.map((l) => l.total));
  const pos = new Map(),
    caixas = [];
  for (const l of linhas) {
    let x = MARGEM + (largura - l.total) / 2; // centraliza a camada
    const y = 44 + l.m * DY;
    l.blocos.forEach((b, ib) => {
      const w = l.larguras[ib],
        s0 = b[0];
      caixas.push({
        x,
        y: y - ALT / 2 - 18,
        w,
        h: ALT + 24,
        rot:
          l.m === 0
            ? "raiz · r = " + s0.r
            : "r = " + s0.r + " · restam " + cartasDe(s0),
      });
      const inicio = x + (w - b.length * DX) / 2 + DX / 2;
      b.forEach((s, j) => pos.set(s.key, { x: inicio + j * DX, y }));
      x += w + FOLGA;
    });
  }
  return {
    pos,
    caixas,
    largura: largura + MARGEM + 16,
    altura: 44 + g.N * DY + 34,
  };
}

/**
 * Disposição da árvore: as folhas ficam igualmente espaçadas, na ordem de uma
 * busca em profundidade, e cada nó interno fica centrado sobre seus filhos.
 */
function disporArvore(nos) {
  const pos = new Array(nos.length);
  let proxima = 0,
    fundo = 0;
  (function colocar(id) {
    const no = nos[id];
    fundo = Math.max(fundo, no.m);
    if (!no.filhos.length) {
      pos[id] = { x: 14 + FX * proxima++, y: 16 + FY * no.m };
      return;
    }
    no.filhos.forEach(colocar);
    const a = pos[no.filhos[0]].x,
      b = pos[no.filhos[no.filhos.length - 1]].x;
    pos[id] = { x: (a + b) / 2, y: 16 + FY * no.m };
  })(0);
  return {
    pos,
    largura: 28 + FX * Math.max(proxima - 1, 0),
    altura: 32 + FY * fundo,
  };
}

// ---------------------------------------------------------------------------
// Partida em andamento
// ---------------------------------------------------------------------------

/**
 * Percorre a partida atual (app.caminho) nas duas representações.
 * @returns {{estados:string[], arestas:Set<number>, nosArvore:number[], passos:object[]}}
 */
function percorrer() {
  const g = app.grafo;
  let s = g.estados.get(g.raiz),
    no = app.arvore ? 0 : null;
  const estados = [s.key],
    arestas = new Set(),
    nosArvore = no === null ? [] : [0],
    passos = [];
  for (const mov of app.caminho) {
    const v = g.estados.get(chave(transicao(app.valores, s, mov.p, mov.i)));
    const ia = g.indice.get(s.key + ">" + v.key);
    arestas.add(ia);
    passos.push({
      jogador: s.t,
      p: mov.p,
      carta: app.valores[mov.i],
      res: g.arestas[ia].res,
    });
    if (no !== null) {
      no = app.arvore[no].mapa.get(mov.p + "|" + mov.i);
      nosArvore.push(no);
    }
    estados.push(v.key);
    s = v;
  }
  return { estados, arestas, nosArvore, passos, atual: s };
}

/** Jogadas que levam da raiz ao nó `id` da árvore de históricos. */
function jogadasAte(id) {
  const lista = [];
  for (let no = app.arvore[id]; no.pai !== null; no = app.arvore[no.pai])
    lista.unshift({ p: no.mov.p, i: no.mov.i });
  return lista;
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function render() {
  renderContagens();
  if (!app.grafo) {
    $("partida").innerHTML = $("estado").innerHTML = "";
    $("grafo").innerHTML = $("arvore").innerHTML =
      '<p class="nota">Composição grande demais para enumerar (mais de ' +
      fmt(LIM_ENUM) +
      " estados). As contagens ao lado vêm das fórmulas.</p>";
    return;
  }
  const trilha = percorrer();
  renderPartida(trilha);
  renderEstado();
  renderGrafo(trilha);
  renderArvore(trilha);
}

/** Painel de contagens: fórmula ao lado do valor medido no grafo enumerado. */
function renderContagens() {
  const f = formulas(app.mult),
    g = app.grafo;
  let h =
    '<p class="situacao">C = (' +
    app.mult.join(", ") +
    "), N = " +
    app.mult.reduce((x, y) => x + y, 0) +
    ", k = " +
    app.mult.length +
    "</p>";
  const linhas = [
    ["|V|", f.V],
    // ["|E|", f.E],
    // ["β", f.beta],
    ["terminais", f.term],
    ["folhas L", f.folhas],
  ];
  let medidos = null;
  if (g) {
    const V = BigInt(g.estados.size),
      E = BigInt(g.arestas.length);
    let folhas = 0n;
    for (const k of g.camadas[g.N]) folhas += g.estados.get(k).hist;
    medidos = [
      V,
      // E,
      // BigInt(g.arestas.length - app.geradora.size),
      BigInt(g.camadas[g.N].length),
      folhas,
    ];
  }
  h += "<table><tr><th></th><th>fórmula</th><th>enumerado</th><th></th></tr>";
  linhas.forEach(([nome, valor], i) => {
    const med = medidos ? medidos[i] : null;
    const marca =
      med === null
        ? ""
        : med === valor
          ? '<span class="ok">✓</span>'
          : '<span class="ruim">≠</span>';
    h +=
      "<tr><td>" +
      nome +
      "</td><td>" +
      fmt(valor) +
      "</td><td>" +
      (med === null ? "—" : fmt(med)) +
      "</td><td>" +
      marca +
      "</td></tr>";
  });
  h += "</table>";
  if (g) {
    h +=
      '<table style="margin-top:12px"><tr><th>m</th><th>árvore</th><th>grafo</th><th>arestas que saem</th></tr>';
    g.camadas.forEach((cam, m) => {
      let hist = 0n,
        sai = 0;
      for (const k of cam) {
        const s = g.estados.get(k);
        hist += s.hist;
        sai += s.sai.length;
      }
      h +=
        "<tr><td>" +
        m +
        "</td><td>" +
        fmt(hist) +
        "</td><td>" +
        cam.length +
        "</td><td>" +
        sai +
        "</td></tr>";
    });
    h += "</table>";
    h +=
      '<p class="nota">β enumerado = arestas fora da árvore geradora. ' +
      (app.ciclo
        ? "Menor ciclo simples: 4 arestas."
        : "O grafo associado é uma árvore (N ≤ 2).") +
      "</p>";
  }
  $("contagens").innerHTML = h;
}

/** Painel da partida: situação atual, jogadas possíveis e histórico. */
function renderPartida(trilha) {
  const s = trilha.atual;
  let h =
    '<p class="situacao">Referência <b>' +
    s.r +
    "</b> · d = <b>" +
    sinal(s.d) +
    "</b> · vez do jogador <b>" +
    s.t +
    "</b><br>Restam: " +
    cartasDe(s) +
    "</p>";
  if (s.c.every((q) => q === 0)) {
    h +=
      "<p><b>" +
      (s.d > 0
        ? "Fim: vence o jogador 1."
        : s.d < 0
          ? "Fim: vence o jogador 2."
          : "Fim: empate.") +
      "</b></p>";
  } else {
    s.c.forEach((q, i) => {
      if (!q) return;
      h += '<div class="jogada"><span>Sai o ' + app.valores[i] + ":</span>";
      for (const p of PREVISOES) {
        const res = acerta(p, s.r, app.valores[i]) ? "acerto" : "erro";
        h +=
          '<button data-p="' +
          p +
          '" data-i="' +
          i +
          '" title="' +
          res +
          '">' +
          p +
          "</button>";
      }
      h += "</div>";
    });
    h +=
      '<p class="nota">Você escolhe a previsão e também a carta revelada: o objetivo é percorrer o grafo, não simular o sorteio.</p>';
  }
  h +=
    '<div class="jogada"><button id="desfazer"' +
    (app.caminho.length ? "" : " disabled") +
    '>Desfazer</button><button id="reiniciar"' +
    (app.caminho.length ? "" : " disabled") +
    ">Reiniciar</button></div>";
  if (trilha.passos.length) {
    h +=
      '<ol class="hist">' +
      trilha.passos
        .map(
          (q) =>
            "<li>J" +
            q.jogador +
            " previu <i>" +
            q.p +
            "</i>, saiu " +
            q.carta +
            " → " +
            (q.res === "A" ? "acerto" : "erro") +
            "</li>",
        )
        .join("") +
      "</ol>";
  }
  $("partida").innerHTML = h;
}

/** Painel do estado selecionado (clique em um vértice do grafo). */
function renderEstado() {
  const g = app.grafo;
  if (!app.sel) {
    $("estado").innerHTML =
      '<p class="nota">Clique em um estado do grafo para ver suas informações e os históricos que ele reúne.</p>';
    return;
  }
  const s = g.estados.get(app.sel);
  const pais = s.ent
    .map((ia) => {
      const a = g.arestas[ia],
        u = g.estados.get(a.de);
      return (
        "<li>(" +
        sinal(u.d) +
        ", " +
        u.t +
        ") com r = " +
        u.r +
        ", por " +
        a.res +
        " (" +
        a.prevs.join(" ou ") +
        ")</li>"
      );
    })
    .join("");
  $("estado").innerHTML =
    "<table>" +
    "<tr><td>cartas restantes</td><td>" +
    cartasDe(s) +
    "</td></tr>" +
    "<tr><td>referência r</td><td>" +
    s.r +
    "</td></tr>" +
    "<tr><td>diferença d</td><td>" +
    sinal(s.d) +
    "</td></tr>" +
    "<tr><td>jogador da vez t</td><td>" +
    s.t +
    "</td></tr>" +
    "<tr><td>camada m</td><td>" +
    s.m +
    "</td></tr>" +
    "<tr><td>grau de entrada</td><td>" +
    s.ent.length +
    "</td></tr>" +
    "<tr><td>grau de saída</td><td>" +
    s.sai.length +
    "</td></tr>" +
    "<tr><td>históricos reunidos</td><td>" +
    fmt(s.hist) +
    "</td></tr>" +
    "</table>" +
    (pais
      ? '<p class="nota" style="margin-bottom:2px">Predecessores:</p><ul style="margin:0;padding-left:18px">' +
        pais +
        "</ul>"
      : "") +
    (app.arvore
      ? '<p class="nota">Os históricos correspondentes estão destacados na árvore.</p>'
      : "");
}

/** Desenha o grafo de estados em SVG. */
function renderGrafo(trilha) {
  const g = app.grafo,
    L = app.posGrafo;
  if (!L) {
    $("grafo").innerHTML =
      '<p class="nota">O grafo tem ' +
      fmt(g.estados.size) +
      " estados; só é desenhado até " +
      LIM_DESENHO +
      ". As contagens ao lado continuam sendo enumeradas.</p>";
    return;
  }
  const noCaminho = new Set(trilha.estados);

  let h =
    '<svg width="' +
    L.largura +
    '" height="' +
    L.altura +
    '" role="img" aria-label="Grafo de estados">';
  for (let m = 0; m <= g.N; m++)
    h +=
      '<text class="rot-camada" x="6" y="' +
      (48 + m * DY) +
      '">m = ' +
      m +
      "</text>";
  for (const b of L.caixas) {
    h +=
      '<rect class="bloco" x="' +
      b.x +
      '" y="' +
      b.y +
      '" width="' +
      b.w +
      '" height="' +
      b.h +
      '" rx="7"/>';
  }
  // Arestas: as destacadas são desenhadas por último, para ficarem por cima.
  const comuns = [],
    destaque = [];
  g.arestas.forEach((a, ia) => {
    const p = L.pos.get(a.de),
      q = L.pos.get(a.para);
    let cls = "ar " + a.res,
      forte = false;
    if (app.sel && (a.de === app.sel || a.para === app.sel)) {
      cls += " viz";
      forte = true;
    }
    if (trilha.arestas.has(ia)) {
      cls += " cam";
      forte = true;
    }
    (forte ? destaque : comuns).push(
      '<line class="' +
        cls +
        '" x1="' +
        p.x +
        '" y1="' +
        (p.y + ALT / 2) +
        '" x2="' +
        q.x +
        '" y2="' +
        (q.y - ALT / 2) +
        '"><title>' +
        (a.res === "A" ? "acerto" : "erro") +
        " (" +
        a.prevs.join(" ou ") +
        "), sai o " +
        app.valores[a.i] +
        "</title></line>",
    );
  });
  h += comuns.join("") + destaque.join("");
  // Rótulos dos blocos por cima das arestas, para continuarem legíveis.
  for (const b of L.caixas) {
    h +=
      '<text class="rot-bloco" text-anchor="middle" x="' +
      (b.x + b.w / 2) +
      '" y="' +
      (b.y + 11) +
      '">' +
      b.rot +
      "</text>";
  }
  for (const [k, p] of L.pos) {
    const s = g.estados.get(k);
    let cls = "est";
    if (noCaminho.has(k)) cls += " cam";
    if (k === app.sel) cls += " sel";
    else if (k === trilha.atual.key) cls += " atual";
    h +=
      '<g class="' +
      cls +
      '" data-k="' +
      k +
      '"><rect x="' +
      (p.x - LARG / 2) +
      '" y="' +
      (p.y - ALT / 2) +
      '" width="' +
      LARG +
      '" height="' +
      ALT +
      '" rx="6"/><text text-anchor="middle" x="' +
      p.x +
      '" y="' +
      (p.y + 4) +
      '">' +
      sinal(s.d) +
      ", " +
      s.t +
      "</text><title>restam " +
      cartasDe(s) +
      "; r = " +
      s.r +
      "; d = " +
      sinal(s.d) +
      "; vez do jogador " +
      s.t +
      "; " +
      fmt(s.hist) +
      " histórico(s)</title></g>";
  }
  $("grafo").innerHTML = h + "</svg>";
}

/** Desenha a árvore de históricos em SVG. */
function renderArvore(trilha) {
  const nos = app.arvore,
    L = app.posArvore;
  if (!nos) {
    let total = 0n;
    for (const s of app.grafo.estados.values()) total += s.hist;
    $("arvore").innerHTML =
      '<p class="nota">A árvore tem ' +
      fmt(total) +
      " vértices; só é desenhada até " +
      LIM_ARVORE +
      ". Selecione um estado do grafo para ver quantos históricos ele reúne.</p>";
    return;
  }
  const noCaminho = new Set(trilha.nosArvore);
  let ramos = "",
    fortes = "",
    pontos = "";
  for (const no of nos) {
    const p = L.pos[no.id];
    if (no.pai !== null) {
      const q = L.pos[no.pai],
        forte = noCaminho.has(no.id);
      const linha =
        '<line class="ramo' +
        (forte ? " cam" : "") +
        '" x1="' +
        q.x +
        '" y1="' +
        q.y +
        '" x2="' +
        p.x +
        '" y2="' +
        p.y +
        '"/>';
      if (forte) fortes += linha;
      else ramos += linha;
    }
    let cls = "no";
    if (no.estado === app.sel) cls += " fib";
    if (noCaminho.has(no.id)) cls += " cam";
    const s = app.grafo.estados.get(no.estado);
    pontos +=
      '<circle class="' +
      cls +
      '" data-n="' +
      no.id +
      '" cx="' +
      p.x +
      '" cy="' +
      p.y +
      '" r="' +
      (cls === "no" ? RAIO : RAIO + 1.4) +
      '"><title>' +
      (no.pai === null
        ? "raiz"
        : "última jogada: " +
          no.mov.p +
          ", saiu " +
          app.valores[no.mov.i] +
          " (" +
          no.mov.res +
          ")") +
      "; estado (" +
      sinal(s.d) +
      ", " +
      s.t +
      "), r = " +
      s.r +
      "</title></circle>";
  }
  $("arvore").innerHTML =
    '<p class="nota" style="margin:0 0 6px">' +
    fmt(nos.length) +
    " vértices. Clique em um vértice para carregar esse histórico como partida.</p>" +
    '<svg width="' +
    L.largura +
    '" height="' +
    L.altura +
    '" role="img" aria-label="Árvore de históricos">' +
    ramos +
    fortes +
    pontos +
    "</svg>";
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

$("construir").addEventListener("click", construir);
$("cartas").addEventListener("keydown", (e) => {
  if (e.key === "Enter") construir();
});
$("ref").addEventListener("change", construir);
// Botões de exemplo: preenchem as cartas restantes e reconstroem.
$("exemplos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ex]");
  if (!b) return;
  $("cartas").value = b.dataset.ex;
  construir();
});

// Clique em um estado do grafo: seleciona (ou desmarca) o estado.
$("grafo").addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-k]");
  if (!alvo) return;
  app.sel = app.sel === alvo.dataset.k ? null : alvo.dataset.k;
  render();
});
// Clique em um nó da árvore: carrega o histórico correspondente como partida.
$("arvore").addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-n]");
  if (!alvo) return;
  app.caminho = jogadasAte(Number(alvo.dataset.n));
  render();
});
// Botões da partida.
$("partida").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "desfazer") app.caminho.pop();
  else if (b.id === "reiniciar") app.caminho = [];
  else app.caminho.push({ p: b.dataset.p, i: Number(b.dataset.i) });
  render();
});

// Inicialização: opções de referência (2 a 10) e exemplo da Seção 4.1.
for (let v = 2; v <= 10; v++)
  $("ref").add(new Option(String(v), String(v), v === 6, v === 6));
construir();
