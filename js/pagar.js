// ============================================================
// CONFIGURAÇÃO SUPABASE
// ============================================================
const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// ============================================================
// ESTADO GLOBAL
// ============================================================
const estado = {
  usuario: null,
  dados: {
    contas: [],
    categorias: [],
    categoriaMap: {},
  },
  filtros: {
    inicio: "",
    fim: "",
    status: "",
    categoria_id: "",
    busca: "",
  },
  ordenacao: {
    coluna: "vencimento",
    direcao: "asc",
  },
  paginacao: {
    pagina: 1,
    itensPorPagina: 20,
  },
  notificacoes: [],
};

// ============================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================
function mostrarLoading() {
  document.getElementById("loadingOverlay").classList.add("show");
}
function esconderLoading() {
  document.getElementById("loadingOverlay").classList.remove("show");
}
function mostrarToast(msg, tipo = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  let icone = "fa-info-circle";
  if (tipo === "success") icone = "fa-check-circle";
  if (tipo === "error") icone = "fa-exclamation-circle";
  if (tipo === "alerta") icone = "fa-exclamation-triangle";
  toast.innerHTML = `<i class="fas ${icone}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
function fmtValor(v) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
}
function fmtData(d) {
  if (!d) return "-";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}
function hoje() {
  return new Date().toISOString().split("T")[0];
}
function fecharModal(id) {
  document.getElementById(id).classList.remove("show");
}
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function adicionarMeses(dataStr, meses) {
  const d = new Date(dataStr + "T12:00:00");
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().split("T")[0];
}

// ============================================================
// VALIDAÇÃO CPF/CNPJ
// ============================================================
function validarCpfCnpj(valor) {
  if (!valor) return true;
  valor = valor.replace(/[^\d]/g, "");
  if (valor.length === 11) {
    if (/^(\d)\1{10}$/.test(valor)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(valor.charAt(i)) * (10 - i);
    let resto = 11 - (soma % 11);
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(valor.charAt(9))) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(valor.charAt(i)) * (11 - i);
    resto = 11 - (soma % 11);
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(valor.charAt(10));
  } else if (valor.length === 14) {
    if (/^(\d)\1{13}$/.test(valor)) return false;
    let tamanho = valor.length - 2;
    let numeros = valor.substring(0, tamanho);
    let digitos = valor.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    tamanho = tamanho + 1;
    numeros = valor.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado === parseInt(digitos.charAt(1));
  }
  return false;
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
async function verificarLogin() {
  const usuarioSalvo = localStorage.getItem("usuario");
  if (usuarioSalvo) {
    estado.usuario = JSON.parse(usuarioSalvo);
    atualizarInterfaceUsuario();
    return true;
  } else {
    window.location.href = "../index.html";
    return false;
  }
}
function atualizarInterfaceUsuario() {
  if (!estado.usuario) return;
  document.getElementById("userName").textContent = estado.usuario.nome;
  document.getElementById("userRole").textContent =
    estado.usuario.role === "admin" ? "Administrador" : "Financeiro";
  const iniciais = estado.usuario.nome
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
  document.getElementById("userAvatar").textContent = iniciais;
}
async function fazerLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("usuario");
  window.location.href = "../index.html";
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================
async function carregarDados() {
  try {
    const [contas, categorias] = await Promise.all([
      supabaseClient
        .from("contas_pagar")
        .select("*")
        .order("data_vencimento", { ascending: true }),
      supabaseClient
        .from("categorias_financeiras")
        .select("*")
        .eq("tipo", "despesa"),
    ]);
    if (contas.error) throw contas.error;
    if (categorias.error) throw categorias.error;
    estado.dados.contas = contas.data || [];
    estado.dados.categorias = categorias.data || [];
    estado.dados.categoriaMap = {};
    estado.dados.categorias.forEach((cat) => {
      estado.dados.categoriaMap[cat.id] = cat.nome;
    });
    document.getElementById("totalContas").textContent =
      `${estado.dados.contas.length} despesas cadastradas`;
    const filtroCat = document.getElementById("filtroCategoria");
    const modalCat = document.getElementById("contaCategoria");
    const options = estado.dados.categorias
      .map((c) => `<option value="${c.id}">${c.nome}</option>`)
      .join("");
    filtroCat.innerHTML = '<option value="">Todas</option>' + options;
    modalCat.innerHTML = options;
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  }
}

// ============================================================
// FUNÇÕES DE RESUMO
// ============================================================
function calcularResumo() {
  const hojeStr = hoje();
  const totalPendente = estado.dados.contas
    .filter((c) => c.status === "pendente" || c.status === "parcial")
    .reduce((acc, c) => acc + (c.valor - (c.valor_pago || 0)), 0);
  const vencidas = estado.dados.contas.filter(
    (c) =>
      (c.status === "pendente" || c.status === "parcial") &&
      c.data_vencimento < hojeStr,
  );
  const totalVencidas = vencidas.reduce(
    (acc, c) => acc + (c.valor - (c.valor_pago || 0)),
    0,
  );
  const qtdeVencidas = vencidas.length;
  const seteDias = new Date();
  seteDias.setDate(seteDias.getDate() + 7);
  const seteDiasStr = seteDias.toISOString().split("T")[0];
  const totalProximas7 = estado.dados.contas
    .filter(
      (c) =>
        (c.status === "pendente" || c.status === "parcial") &&
        c.data_vencimento >= hojeStr &&
        c.data_vencimento <= seteDiasStr,
    )
    .reduce((acc, c) => acc + (c.valor - (c.valor_pago || 0)), 0);
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() + 30);
  const trintaDiasStr = trintaDias.toISOString().split("T")[0];
  const totalProximas30 = estado.dados.contas
    .filter(
      (c) =>
        (c.status === "pendente" || c.status === "parcial") &&
        c.data_vencimento >= hojeStr &&
        c.data_vencimento <= trintaDiasStr,
    )
    .reduce((acc, c) => acc + (c.valor - (c.valor_pago || 0)), 0);
  return {
    totalPendente,
    totalVencidas,
    qtdeVencidas,
    totalProximas7,
    totalProximas30,
  };
}
function renderizarResumo() {
  const resumo = calcularResumo();
  const container = document.getElementById("resumoContainer");
  container.innerHTML = `
    <div class="stat-card" data-filtro="vencidas">
      <div class="stat-icon ${resumo.qtdeVencidas > 0 ? "danger" : ""}"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="stat-info">
        <div class="stat-value">${resumo.qtdeVencidas}</div>
        <div class="stat-label">Contas Vencidas</div>
        <div style="font-size:0.7rem;">${fmtValor(resumo.totalVencidas)}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(resumo.totalPendente)}</div>
        <div class="stat-label">Total a Pagar</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-calendar-week"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(resumo.totalProximas7)}</div>
        <div class="stat-label">Próximos 7 dias</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-calendar-alt"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(resumo.totalProximas30)}</div>
        <div class="stat-label">Próximos 30 dias</div>
      </div>
    </div>
  `;
  container.querySelectorAll(".stat-card[data-filtro]").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      if (card.dataset.filtro === "vencidas") {
        document.getElementById("filtroStatus").value = "vencido";
        aplicarFiltros();
      }
    });
  });
}

// ============================================================
// AGENDA DA SEMANA (clicável)
// ============================================================
function renderizarAgenda() {
  const hojeObj = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let html =
    '<div class="compact-title"><i class="fas fa-calendar-alt"></i> Agenda da Semana (clique no dia)</div><div class="agenda-semana">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(hojeObj);
    d.setDate(hojeObj.getDate() + i);
    const dStr = d.toISOString().split("T")[0];
    const diaNome = diasSemana[d.getDay()];
    const contasDia = estado.dados.contas.filter(
      (c) =>
        (c.status === "pendente" || c.status === "parcial") &&
        c.data_vencimento === dStr,
    );
    const total = contasDia.reduce(
      (acc, c) => acc + (c.valor - (c.valor_pago || 0)),
      0,
    );
    const classeHoje = i === 0 ? "hoje" : "";
    const temVencido = contasDia.some((c) => c.data_vencimento < hoje());
    const classeVencido = temVencido
      ? "tem-vencido"
      : contasDia.length > 0
        ? "tem-vencimento"
        : "";
    html += `<div class="agenda-dia ${classeHoje} ${classeVencido}" data-data="${dStr}" onclick="filtrarPorData('${dStr}')">
                <div class="dia-nome">${diaNome}</div>
                <div class="dia-valor">${total > 0 ? fmtValor(total) : "-"}</div>
              </div>`;
  }
  html += "</div>";
  document.getElementById("agendaSemana").innerHTML = html;
}
function filtrarPorData(data) {
  document.getElementById("filtroInicio").value = data;
  document.getElementById("filtroFim").value = data;
  aplicarFiltros();
}

// ============================================================
// RANKING DE DESPESAS (com barras de progresso)
// ============================================================
function renderizarRanking() {
  const mesAtual = hoje().substring(0, 7);
  const despesasMes = estado.dados.contas.filter(
    (c) =>
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento.substring(0, 7) === mesAtual,
  );
  const categorias = {};
  despesasMes.forEach((c) => {
    const catNome = estado.dados.categoriaMap[c.categoria_id] || "Outros";
    categorias[catNome] =
      (categorias[catNome] || 0) + (c.valor_pago || c.valor);
  });
  const ranking = Object.entries(categorias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const total = ranking.reduce((acc, [, val]) => acc + val, 0);
  const container = document.getElementById("rankingDespesas");
  if (ranking.length === 0) {
    container.innerHTML =
      '<p style="text-align:center;">Nenhuma despesa paga no mês.</p>';
    return;
  }
  container.innerHTML = ranking
    .map(([cat, val]) => {
      const percent = total > 0 ? (val / total) * 100 : 0;
      return `
      <div class="compact-row">
        <span class="compact-label">${cat}</span>
        <div style="flex:1; margin:0 1rem;">
          <div class="progress-bar" style="background:#e9ecef; border-radius:10px; height:6px;">
            <div class="progress-fill" style="width:${percent}%; background:var(--verde-principal); height:6px; border-radius:10px;"></div>
          </div>
        </div>
        <span class="compact-value">${fmtValor(val)}</span>
      </div>
    `;
    })
    .join("");
}

// ============================================================
// GRÁFICOS (com tratamento de dados vazios)
// ============================================================
let graficoPizza,
  graficoLinha,
  graficoDiaSemana,
  graficoComparativo,
  graficoPrevisao;
function renderizarGraficos() {
  const mesAtual = hoje().substring(0, 7);
  const despesasMes = estado.dados.contas.filter(
    (c) =>
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento.substring(0, 7) === mesAtual,
  );
  const cats = {};
  despesasMes.forEach((c) => {
    const catNome = estado.dados.categoriaMap[c.categoria_id] || "Outros";
    cats[catNome] = (cats[catNome] || 0) + (c.valor_pago || c.valor);
  });
  const labels = Object.keys(cats);
  const dados = Object.values(cats);
  const hasData = labels.length > 0;
  const ctxPizza = document.getElementById("graficoPizza")?.getContext("2d");
  if (ctxPizza) {
    if (graficoPizza) graficoPizza.destroy();
    if (!hasData) {
      ctxPizza.clearRect(0, 0, ctxPizza.canvas.width, ctxPizza.canvas.height);
      ctxPizza.font = "14px Montserrat";
      ctxPizza.fillStyle = "#666";
      ctxPizza.textAlign = "center";
      ctxPizza.fillText(
        "Nenhuma despesa no período",
        ctxPizza.canvas.width / 2,
        ctxPizza.canvas.height / 2,
      );
      graficoPizza = null;
    } else {
      graficoPizza = new Chart(ctxPizza, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: dados,
              backgroundColor: [
                "#3498db",
                "#9b59b6",
                "#e67e22",
                "#2ecc71",
                "#e74c3c",
                "#1abc9c",
                "#f1c40f",
                "#34495e",
                "#d35400",
                "#27ae60",
              ],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          cutout: "70%",
        },
      });
    }
  }
  // Gráfico de linha evolução
  const labels6 = [],
    valores6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mes = d.getMonth() + 1,
      ano = d.getFullYear();
    labels6.push(`${mes.toString().padStart(2, "0")}/${ano}`);
    const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
    const total = estado.dados.contas
      .filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento &&
          c.data_pagamento >= inicio &&
          c.data_pagamento <= fim,
      )
      .reduce((acc, c) => acc + (c.valor_pago || c.valor), 0);
    valores6.push(total);
  }
  const ctxLinha = document.getElementById("graficoLinha")?.getContext("2d");
  if (ctxLinha) {
    if (graficoLinha) graficoLinha.destroy();
    graficoLinha = new Chart(ctxLinha, {
      type: "line",
      data: {
        labels: labels6,
        datasets: [
          {
            label: "Despesas",
            data: valores6,
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231,76,60,0.1)",
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => fmtValor(c.raw) } } },
        scales: { y: { ticks: { callback: (v) => fmtValor(v) } } },
      },
    });
  }
}

// ============================================================
// DASHBOARD EXECUTIVO
// ============================================================
function toggleDashboard() {
  const dash = document.getElementById("dashboardSection");
  if (dash.style.display === "none") {
    dash.style.display = "block";
    renderizarDashboard();
  } else {
    dash.style.display = "none";
  }
}
function renderizarDashboard() {
  // Despesas por dia da semana (últimos 12 meses)
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const valoresDia = [0, 0, 0, 0, 0, 0, 0];
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
  const dataInicio = umAnoAtras.toISOString().split("T")[0];
  const despesasPeriodo = estado.dados.contas.filter(
    (c) =>
      c.status === "pago" && c.data_pagamento && c.data_pagamento >= dataInicio,
  );
  despesasPeriodo.forEach((c) => {
    const data = new Date(c.data_pagamento);
    valoresDia[data.getDay()] += c.valor_pago || c.valor;
  });
  if (graficoDiaSemana) graficoDiaSemana.destroy();
  const ctxDia = document.getElementById("graficoDiaSemana")?.getContext("2d");
  if (ctxDia) {
    graficoDiaSemana = new Chart(ctxDia, {
      type: "bar",
      data: {
        labels: diasSemana,
        datasets: [
          {
            label: "Despesa (R$)",
            data: valoresDia,
            backgroundColor: "#3498db",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => fmtValor(c.raw) } } },
      },
    });
  }
  // Comparativo mês atual x anterior
  const hojeStr = hoje();
  const [anoAtual, mesAtual] = hojeStr.split("-");
  const mesAnterior = mesAtual == 1 ? 12 : mesAtual - 1;
  const anoAnterior = mesAtual == 1 ? anoAtual - 1 : anoAtual;
  const inicioMesAtual = `${anoAtual}-${mesAtual.padStart(2, "0")}-01`;
  const fimMesAtual = new Date(anoAtual, mesAtual, 0)
    .toISOString()
    .split("T")[0];
  const inicioMesAnterior = `${anoAnterior}-${mesAnterior.toString().padStart(2, "0")}-01`;
  const fimMesAnterior = new Date(anoAnterior, mesAnterior, 0)
    .toISOString()
    .split("T")[0];
  const valorMesAtual = estado.dados.contas
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento >= inicioMesAtual &&
        c.data_pagamento <= fimMesAtual,
    )
    .reduce((acc, c) => acc + (c.valor_pago || c.valor), 0);
  const valorMesAnterior = estado.dados.contas
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento >= inicioMesAnterior &&
        c.data_pagamento <= fimMesAnterior,
    )
    .reduce((acc, c) => acc + (c.valor_pago || c.valor), 0);
  if (graficoComparativo) graficoComparativo.destroy();
  const ctxComp = document
    .getElementById("graficoComparativo")
    ?.getContext("2d");
  if (ctxComp) {
    graficoComparativo = new Chart(ctxComp, {
      type: "bar",
      data: {
        labels: ["Mês Anterior", "Mês Atual"],
        datasets: [
          {
            label: "Despesa (R$)",
            data: [valorMesAnterior, valorMesAtual],
            backgroundColor: ["#95a5a6", "#e74c3c"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => fmtValor(c.raw) } } },
      },
    });
  }
  // Previsão próximos 30 dias (valores pendentes)
  const previsao = [],
    labelsPrev = [];
  for (let i = 0; i <= 30; i++) {
    const data = new Date();
    data.setDate(data.getDate() + i);
    const dataStr = data.toISOString().split("T")[0];
    labelsPrev.push(dataStr.substring(5));
    const totalDia = estado.dados.contas
      .filter(
        (c) =>
          (c.status === "pendente" || c.status === "parcial") &&
          c.data_vencimento === dataStr,
      )
      .reduce((acc, c) => acc + (c.valor - (c.valor_pago || 0)), 0);
    previsao.push(totalDia);
  }
  if (graficoPrevisao) graficoPrevisao.destroy();
  const ctxPrev = document.getElementById("graficoPrevisao")?.getContext("2d");
  if (ctxPrev) {
    graficoPrevisao = new Chart(ctxPrev, {
      type: "line",
      data: {
        labels: labelsPrev,
        datasets: [
          {
            label: "Previsão de Pagamentos",
            data: previsao,
            borderColor: "#f39c12",
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => fmtValor(c.raw) } } },
      },
    });
  }
}

// ============================================================
// FUNÇÕES DA TABELA (filtros, ordenação, paginação)
// ============================================================
function aplicarFiltros() {
  estado.filtros = {
    inicio: document.getElementById("filtroInicio")?.value || "",
    fim: document.getElementById("filtroFim")?.value || "",
    status: document.getElementById("filtroStatus")?.value || "",
    categoria_id: document.getElementById("filtroCategoria")?.value || "",
    busca: document.getElementById("searchInput")?.value || "",
  };
  estado.paginacao.pagina = 1;
  renderizarTabela();
}
function filtrarContas() {
  aplicarFiltros();
}
function limparFiltros() {
  document.getElementById("filtroInicio").value = "";
  document.getElementById("filtroFim").value = "";
  document.getElementById("filtroStatus").value = "";
  document.getElementById("filtroCategoria").value = "";
  document.getElementById("searchInput").value = "";
  aplicarFiltros();
}
function ordenarPor(coluna) {
  if (estado.ordenacao.coluna === coluna)
    estado.ordenacao.direcao =
      estado.ordenacao.direcao === "asc" ? "desc" : "asc";
  else {
    estado.ordenacao.coluna = coluna;
    estado.ordenacao.direcao = "asc";
  }
  document
    .querySelectorAll("th i")
    .forEach((i) => (i.className = "fas fa-sort"));
  const icone = document.getElementById(
    `sort${coluna.charAt(0).toUpperCase() + coluna.slice(1)}`,
  );
  if (icone)
    icone.className = `fas fa-sort-${estado.ordenacao.direcao === "asc" ? "up" : "down"}`;
  renderizarTabela();
}
function aplicarOrdenacao(lista) {
  if (!estado.ordenacao.coluna) return lista;
  const col = estado.ordenacao.coluna,
    dir = estado.ordenacao.direcao;
  return [...lista].sort((a, b) => {
    let valA, valB;
    if (col === "descricao") {
      valA = a.descricao || "";
      valB = b.descricao || "";
    } else if (col === "fornecedor") {
      valA = a.fornecedor || "";
      valB = b.fornecedor || "";
    } else if (col === "valor") {
      valA = a.valor || 0;
      valB = b.valor || 0;
    } else if (col === "vencimento") {
      valA = a.data_vencimento || "9999-99-99";
      valB = b.data_vencimento || "9999-99-99";
    } else if (col === "categoria") {
      valA = estado.dados.categoriaMap[a.categoria_id] || "";
      valB = estado.dados.categoriaMap[b.categoria_id] || "";
    }
    if (typeof valA === "string")
      return dir === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    else return dir === "asc" ? valA - valB : valB - valA;
  });
}
function getCorCategoria(catId) {
  if (!catId) return "cat-0";
  let hash = 0;
  const nome = estado.dados.categoriaMap[catId] || "";
  for (let i = 0; i < nome.length; i++)
    hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return `cat-${Math.abs(hash) % 10}`;
}
function renderizarTabela() {
  let lista = [...estado.dados.contas];
  const { inicio, fim, status, categoria_id, busca } = estado.filtros;
  if (inicio) lista = lista.filter((c) => c.data_vencimento >= inicio);
  if (fim) lista = lista.filter((c) => c.data_vencimento <= fim);
  if (status === "pendente")
    lista = lista.filter((c) => c.status === "pendente");
  else if (status === "pago") lista = lista.filter((c) => c.status === "pago");
  else if (status === "vencido") {
    const hojeStr = hoje();
    lista = lista.filter(
      (c) =>
        (c.status === "pendente" || c.status === "parcial") &&
        c.data_vencimento < hojeStr,
    );
  } else if (status === "parcial")
    lista = lista.filter((c) => c.status === "parcial");
  if (categoria_id) lista = lista.filter((c) => c.categoria_id == categoria_id);
  if (busca) {
    const bus = busca.toLowerCase();
    lista = lista.filter(
      (c) =>
        (c.descricao && c.descricao.toLowerCase().includes(bus)) ||
        (c.fornecedor && c.fornecedor.toLowerCase().includes(bus)),
    );
  }
  lista = aplicarOrdenacao(lista);
  const totalItens = lista.length;
  const { pagina, itensPorPagina } = estado.paginacao;
  const totalPaginas = Math.ceil(totalItens / itensPorPagina);
  const inicioPagina = (pagina - 1) * itensPorPagina;
  const paginaItens = lista.slice(inicioPagina, inicioPagina + itensPorPagina);
  const tbody = document.getElementById("tabelaContas");
  if (paginaItens.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center; padding:2rem;">Nenhuma despesa encontrada</td></tr>';
  } else {
    const hojeStr = hoje();
    tbody.innerHTML = paginaItens
      .map((c) => {
        const classeLinha =
          c.status === "pendente" && c.data_vencimento < hojeStr
            ? "vencida"
            : c.status === "pendente" && c.data_vencimento === hojeStr
              ? "hoje"
              : c.status === "parcial"
                ? "parcial"
                : "";
        const corCat = getCorCategoria(c.categoria_id);
        const valorExibido =
          c.status === "parcial"
            ? `Pago ${fmtValor(c.valor_pago)} / ${fmtValor(c.valor)}`
            : fmtValor(c.valor);
        return `
        <tr class="${classeLinha}" data-id="${c.id}">
          <td><strong>${escapeHtml(c.descricao)}</strong></td>
          <td><span style="cursor:pointer; color:var(--azul-info);" onclick="verRelatorioFornecedor('${escapeHtml(c.fornecedor)}')">${escapeHtml(c.fornecedor || "-")}</span></td>
          <td>${valorExibido}</td>
          <td>${fmtData(c.data_vencimento)}</td>
          <td><span class="status-badge ${c.status === "pago" ? "pago" : c.status === "parcial" ? "parcial" : "pendente"}">${c.status === "pago" ? "Pago" : c.status === "parcial" ? "Parcial" : "Pendente"}</span></td>
          <td><span class="categoria-badge ${corCat}">${escapeHtml(estado.dados.categoriaMap[c.categoria_id] || "-")}</span></td>
          <td><div class="action-buttons">
            <button class="action-btn visualizar" onclick="verDetalhes(${c.id})" title="Ver detalhes"><i class="fas fa-eye"></i></button>
            ${
              c.status === "pendente" || c.status === "parcial"
                ? `
              <button class="action-btn pagar" onclick="abrirModalBaixa(${c.id})" title="Registrar pagamento"><i class="fas fa-check"></i></button>
              <button class="action-btn editar" onclick="editarConta(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
              <button class="action-btn duplicar" onclick="duplicarConta(${c.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
              <button class="action-btn excluir" onclick="confirmarExclusao(${c.id})" title="Excluir"><i class="fas fa-trash"></i></button>
              <button class="action-btn anexo" onclick="abrirModalAnexo(${c.id})" title="Anexar comprovante"><i class="fas fa-paperclip"></i></button>
            `
                : c.status === "pago"
                  ? `
              <button class="action-btn anexo" onclick="abrirModalAnexo(${c.id})" title="Anexar comprovante"><i class="fas fa-paperclip"></i></button>
            `
                  : ""
            }
            ${c.grupo_id ? `<button class="action-btn visualizar" onclick="abrirModalGrupo('${c.grupo_id}')" title="Ver grupo recorrente"><i class="fas fa-layer-group"></i></button>` : ""}
          </div></td>
        </tr>
      `;
      })
      .join("");
  }
  // Paginação
  const pagDiv = document.getElementById("paginacao");
  if (totalPaginas <= 1) {
    pagDiv.innerHTML = "";
    return;
  }
  let pagHtml = `<button onclick="mudarPagina(1)" ${pagina === 1 ? "disabled" : ""}><i class="fas fa-angle-double-left"></i></button>
                 <button onclick="mudarPagina(${pagina - 1})" ${pagina === 1 ? "disabled" : ""}><i class="fas fa-angle-left"></i></button>`;
  for (
    let i = Math.max(1, pagina - 2);
    i <= Math.min(totalPaginas, pagina + 2);
    i++
  ) {
    pagHtml += `<button onclick="mudarPagina(${i})" class="${i === pagina ? "active" : ""}">${i}</button>`;
  }
  pagHtml += `<button onclick="mudarPagina(${pagina + 1})" ${pagina === totalPaginas ? "disabled" : ""}><i class="fas fa-angle-right"></i></button>
              <button onclick="mudarPagina(${totalPaginas})" ${pagina === totalPaginas ? "disabled" : ""}><i class="fas fa-angle-double-right"></i></button>`;
  pagDiv.innerHTML = pagHtml;
}
function mudarPagina(pagina) {
  estado.paginacao.pagina = pagina;
  renderizarTabela();
}

// ============================================================
// CRUD DE CONTAS
// ============================================================
function toggleRecorrente() {
  const isChecked = document.getElementById("contaRecorrente").checked;
  document.getElementById("recorrenteFields").style.display = isChecked
    ? "block"
    : "none";
}
function abrirModalConta() {
  document.getElementById("modalContaTitle").textContent = "Nova Despesa";
  document.getElementById("formConta").reset();
  document.getElementById("contaId").value = "";
  document.getElementById("contaGrupoId").value = "";
  document.getElementById("contaVencimento").value = hoje();
  document.getElementById("contaRecorrente").checked = false;
  document.getElementById("recorrenteFields").style.display = "none";
  document.getElementById("modalConta").classList.add("show");
}
function editarConta(id) {
  const conta = estado.dados.contas.find((c) => c.id === id);
  if (!conta) return;
  if (conta.status === "pago") {
    mostrarToast("Contas pagas não podem ser editadas", "alerta");
    return;
  }
  document.getElementById("modalContaTitle").textContent = "Editar Despesa";
  document.getElementById("contaId").value = conta.id;
  document.getElementById("contaGrupoId").value = conta.grupo_id || "";
  document.getElementById("contaDescricao").value = conta.descricao || "";
  document.getElementById("contaFornecedor").value = conta.fornecedor || "";
  document.getElementById("contaCpfCnpj").value = conta.cpf_cnpj || "";
  document.getElementById("contaValor").value = conta.valor;
  document.getElementById("contaVencimento").value = conta.data_vencimento;
  document.getElementById("contaCategoria").value = conta.categoria_id || "";
  document.getElementById("contaTipo").value = conta.tipo || "variavel";
  document.getElementById("contaObs").value = conta.observacoes || "";
  document.getElementById("contaRecorrente").checked =
    conta.recorrente || false;
  if (conta.recorrente) {
    document.getElementById("contaFrequencia").value =
      conta.frequencia || "mensal";
    document.getElementById("contaOcorrencias").value =
      conta.numero_ocorrencias || 12;
    document.getElementById("recorrenteFields").style.display = "block";
  } else {
    document.getElementById("recorrenteFields").style.display = "none";
  }
  document.getElementById("modalConta").classList.add("show");
}
function duplicarConta(id) {
  const original = estado.dados.contas.find((c) => c.id === id);
  if (!original) return;
  document.getElementById("modalContaTitle").textContent =
    "Nova Despesa (duplicada)";
  document.getElementById("contaId").value = "";
  document.getElementById("contaGrupoId").value = "";
  document.getElementById("contaDescricao").value =
    original.descricao + " (cópia)";
  document.getElementById("contaFornecedor").value = original.fornecedor || "";
  document.getElementById("contaCpfCnpj").value = original.cpf_cnpj || "";
  document.getElementById("contaValor").value = original.valor;
  document.getElementById("contaVencimento").value = original.data_vencimento;
  document.getElementById("contaCategoria").value = original.categoria_id || "";
  document.getElementById("contaTipo").value = original.tipo || "variavel";
  document.getElementById("contaObs").value = original.observacoes || "";
  document.getElementById("contaRecorrente").checked = false;
  document.getElementById("recorrenteFields").style.display = "none";
  document.getElementById("modalConta").classList.add("show");
}
async function salvarConta() {
  const id = document.getElementById("contaId").value;
  const grupoId = document.getElementById("contaGrupoId").value || null;
  const descricao = document.getElementById("contaDescricao").value.trim();
  const valor = parseFloat(document.getElementById("contaValor").value);
  const vencimento = document.getElementById("contaVencimento").value;
  const categoria_id = document.getElementById("contaCategoria").value;
  const tipo = document.getElementById("contaTipo").value;
  const fornecedor =
    document.getElementById("contaFornecedor").value.trim() || null;
  const cpfCnpj = document.getElementById("contaCpfCnpj").value.trim() || null;
  const observacoes = document.getElementById("contaObs").value.trim() || null;
  const recorrente = document.getElementById("contaRecorrente").checked;
  if (
    !descricao ||
    isNaN(valor) ||
    valor <= 0 ||
    !vencimento ||
    !categoria_id
  ) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }
  if (cpfCnpj && !validarCpfCnpj(cpfCnpj)) {
    mostrarToast("CPF/CNPJ inválido", "error");
    return;
  }
  let frequencia = null,
    ocorrencias = 1;
  if (recorrente) {
    frequencia = document.getElementById("contaFrequencia").value;
    ocorrencias =
      parseInt(document.getElementById("contaOcorrencias").value) || 1;
  }
  const contaData = {
    descricao,
    valor,
    data_vencimento: vencimento,
    categoria_id: parseInt(categoria_id),
    tipo,
    fornecedor,
    cpf_cnpj: cpfCnpj,
    observacoes,
    recorrente,
    status: "pendente",
  };
  if (recorrente) {
    contaData.frequencia = frequencia;
    contaData.numero_ocorrencias = ocorrencias;
    contaData.grupo_id = grupoId || crypto.randomUUID();
  }
  mostrarLoading();
  try {
    if (id) {
      const { error } = await supabaseClient
        .from("contas_pagar")
        .update(contaData)
        .eq("id", id);
      if (error) throw error;
      mostrarToast("Despesa atualizada!", "success");
    } else {
      const contasParaInserir = [];
      const dataBase = new Date(vencimento + "T12:00:00");
      const grupoUuid = recorrente ? crypto.randomUUID() : null;
      for (let i = 0; i < ocorrencias; i++) {
        const novaData = new Date(dataBase);
        if (i > 0) {
          if (frequencia === "mensal")
            novaData.setMonth(novaData.getMonth() + i);
          else if (frequencia === "trimestral")
            novaData.setMonth(novaData.getMonth() + i * 3);
          else if (frequencia === "anual")
            novaData.setFullYear(novaData.getFullYear() + i);
        }
        const dataStr = novaData.toISOString().split("T")[0];
        const conta = {
          ...contaData,
          data_vencimento: dataStr,
          recorrencia_ordem: i + 1,
          recorrencia_total: ocorrencias,
          grupo_id: grupoUuid,
        };
        contasParaInserir.push(conta);
      }
      const { error } = await supabaseClient
        .from("contas_pagar")
        .insert(contasParaInserir);
      if (error) throw error;
      mostrarToast("Despesa(s) gerada(s) com sucesso!", "success");
    }
    fecharModal("modalConta");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
    if (document.getElementById("dashboardSection").style.display !== "none")
      renderizarDashboard();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// BAIXA (pagamento) com suporte a parcial e saldo restante
// ============================================================
function abrirModalBaixa(id) {
  const conta = estado.dados.contas.find((c) => c.id === id);
  if (!conta) return;
  const valorRestante = conta.valor - (conta.valor_pago || 0);
  document.getElementById("baixaContaId").value = id;
  document.getElementById("baixaData").value = hoje();
  document.getElementById("baixaValor").value = valorRestante.toFixed(2);
  document.getElementById("baixaForma").value = "PIX";
  document.getElementById("baixaObs").value = "";
  document.getElementById("baixaPagamentoParcial").checked = false;
  document.getElementById("modalBaixa").classList.add("show");
}
function toggleParcial() {}
async function registrarBaixa() {
  const id = parseInt(document.getElementById("baixaContaId").value);
  const dataPagamento = document.getElementById("baixaData").value;
  let valor = parseFloat(document.getElementById("baixaValor").value);
  const forma = document.getElementById("baixaForma").value;
  const obs = document.getElementById("baixaObs").value.trim() || null;
  const parcial = document.getElementById("baixaPagamentoParcial").checked;
  if (!dataPagamento || isNaN(valor) || valor <= 0 || !forma) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }
  if (dataPagamento > hoje()) {
    mostrarToast(
      "Não é permitido registrar pagamento com data futura",
      "error",
    );
    return;
  }
  const conta = estado.dados.contas.find((c) => c.id === id);
  if (!conta) return;
  let novoStatus = "pago";
  let novoValorPago = (conta.valor_pago || 0) + valor;
  if (parcial && novoValorPago < conta.valor) novoStatus = "parcial";
  else if (novoValorPago > conta.valor) {
    mostrarToast("Valor pago excede o valor da conta", "error");
    return;
  }
  mostrarLoading();
  try {
    const updates = {
      status: novoStatus,
      data_pagamento: dataPagamento,
      valor_pago: novoValorPago,
      forma_pagamento: forma,
      observacoes_pagamento: obs,
    };
    if (novoStatus === "parcial")
      updates.saldo_restante = conta.valor - novoValorPago;
    const { error } = await supabaseClient
      .from("contas_pagar")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
    mostrarToast("Pagamento registrado!", "success");
    fecharModal("modalBaixa");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
    const linha = document.querySelector(`#tabelaContas tr[data-id="${id}"]`);
    if (linha) {
      linha.classList.add("highlight-row");
      setTimeout(() => linha.classList.remove("highlight-row"), 2000);
    }
  } catch (error) {
    console.error(error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// ANEXO (upload real para Supabase Storage)
// ============================================================
function abrirModalAnexo(id) {
  document.getElementById("anexoContaId").value = id;
  document.getElementById("anexoInfo").style.display = "none";
  document.getElementById("modalAnexo").classList.add("show");
}
async function uploadAnexo() {
  const file = document.getElementById("fileAnexo").files[0];
  if (!file) return;
  const contaId = document.getElementById("anexoContaId").value;
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}_${contaId}.${fileExt}`;
  const filePath = `comprovantes/${fileName}`;
  mostrarLoading();
  try {
    const { data, error } = await supabaseClient.storage
      .from("contas_pagar_anexos")
      .upload(filePath, file);
    if (error) throw error;
    const { data: publicUrl } = supabaseClient.storage
      .from("contas_pagar_anexos")
      .getPublicUrl(filePath);
    const { error: updateError } = await supabaseClient
      .from("contas_pagar")
      .update({ anexo_url: publicUrl.publicUrl })
      .eq("id", contaId);
    if (updateError) throw updateError;
    document.getElementById("anexoNome").textContent = file.name;
    document.getElementById("anexoInfo").style.display = "flex";
    mostrarToast("Arquivo anexado com sucesso!", "success");
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao anexar: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// DETALHES
// ============================================================
function verDetalhes(id) {
  const conta = estado.dados.contas.find((c) => c.id === id);
  if (!conta) return;
  const catNome = estado.dados.categoriaMap[conta.categoria_id] || "-";
  const html = `
    <div class="detalhes-conta">
      <h3 class="detalhes-titulo">${escapeHtml(conta.descricao)}</h3>
      <div class="detalhes-grid">
        <p><strong>Fornecedor:</strong> ${escapeHtml(conta.fornecedor || "-")}</p>
        <p><strong>CPF/CNPJ:</strong> ${escapeHtml(conta.cpf_cnpj || "-")}</p>
        <p><strong>Valor original:</strong> ${fmtValor(conta.valor)}</p>
        <p><strong>Vencimento:</strong> ${fmtData(conta.data_vencimento)}</p>
        <p><strong>Categoria:</strong> ${escapeHtml(catNome)} (${conta.tipo || "variável"})</p>
        <p><strong>Observações:</strong> ${escapeHtml(conta.observacoes || "-")}</p>
      </div>
      ${
        conta.status === "pago"
          ? `
        <hr class="detalhes-divider">
        <div class="detalhes-grid">
          <p><strong>Pago em:</strong> ${fmtData(conta.data_pagamento)}</p>
          <p><strong>Valor pago:</strong> ${fmtValor(conta.valor_pago || conta.valor)}</p>
          <p><strong>Forma:</strong> ${escapeHtml(conta.forma_pagamento || "-")}</p>
          <p><strong>Obs pagamento:</strong> ${escapeHtml(conta.observacoes_pagamento || "-")}</p>
        </div>
      `
          : conta.status === "parcial"
            ? `
        <hr class="detalhes-divider">
        <div class="detalhes-grid">
          <p><strong>Pago em:</strong> ${fmtData(conta.data_pagamento)}</p>
          <p><strong>Valor pago:</strong> ${fmtValor(conta.valor_pago)}</p>
          <p><strong>Saldo restante:</strong> ${fmtValor(conta.valor - conta.valor_pago)}</p>
          <p><strong>Forma:</strong> ${escapeHtml(conta.forma_pagamento || "-")}</p>
        </div>
      `
            : ""
      }
      ${
        conta.recorrente
          ? `
        <hr class="detalhes-divider">
        <p><strong>Conta recorrente</strong> (${conta.frequencia}) - ${conta.recorrencia_ordem || 1}/${conta.recorrencia_total || 1}</p>
        <p><strong>Grupo:</strong> ${conta.grupo_id || "—"}</p>
      `
          : ""
      }
      ${
        conta.anexo_url
          ? `
        <hr class="detalhes-divider">
        <div class="detalhes-anexo"><strong>Comprovante:</strong> <a href="${conta.anexo_url}" target="_blank">Visualizar</a></div>
      `
          : ""
      }
    </div>
  `;
  document.getElementById("detalhesBody").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

// ============================================================
// EXCLUSÃO
// ============================================================
function confirmarExclusao(id) {
  const conta = estado.dados.contas.find((c) => c.id === id);
  if (!conta) return;
  if (conta.status === "pago") {
    mostrarToast("Contas pagas não podem ser excluídas", "error");
    return;
  }
  document.getElementById("confirmarMensagem").textContent =
    `Tem certeza que deseja excluir a despesa "${conta.descricao}"?`;
  document.getElementById("confirmarBotao").onclick = () => excluirConta(id);
  document.getElementById("modalConfirmar").classList.add("show");
}
async function excluirConta(id) {
  mostrarLoading();
  fecharModal("modalConfirmar");
  try {
    const { error } = await supabaseClient
      .from("contas_pagar")
      .delete()
      .eq("id", id);
    if (error) throw error;
    mostrarToast("Despesa excluída!", "success");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
    if (document.getElementById("dashboardSection").style.display !== "none")
      renderizarDashboard();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// GERENCIAMENTO DE GRUPO RECORRENTE
// ============================================================
function abrirModalGrupo(grupoId) {
  const contasGrupo = estado.dados.contas.filter((c) => c.grupo_id === grupoId);
  if (contasGrupo.length === 0) return;
  const total = contasGrupo.reduce((acc, c) => acc + c.valor, 0);
  const pendentes = contasGrupo.filter((c) => c.status !== "pago").length;
  const html = `
    <div class="grupo-header">
      <strong>Grupo recorrente</strong><br>
      Total: ${fmtValor(total)} | Pendentes: ${pendentes} de ${contasGrupo.length}
      <div class="grupo-acoes">
        <button class="btn-outline" onclick="abrirModalEditarGrupo('${grupoId}')">Editar todas futuras</button>
        <button class="btn-outline" onclick="pagarTodasPendentesGrupo('${grupoId}')">Pagar todas pendentes</button>
        <button class="btn-danger" onclick="excluirTodasFuturasGrupo('${grupoId}')">Excluir futuras</button>
      </div>
    </div>
    <div class="grupo-lista">
      ${contasGrupo
        .map(
          (c) => `
        <div class="grupo-item">
          <div class="info">
            <strong>${escapeHtml(c.descricao)}</strong>
            <small>Venc: ${fmtData(c.data_vencimento)} | ${fmtValor(c.valor)} | Status: ${c.status}</small>
          </div>
          <div class="action-buttons">
            <button class="action-btn visualizar" onclick="verDetalhes(${c.id})"><i class="fas fa-eye"></i></button>
            ${c.status !== "pago" ? `<button class="action-btn pagar" onclick="abrirModalBaixa(${c.id})"><i class="fas fa-check"></i></button>` : ""}
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
  document.getElementById("grupoBody").innerHTML = html;
  document.getElementById("btnExcluirGrupo").style.display = "none";
  document.getElementById("modalGrupo").classList.add("show");
}
async function pagarTodasPendentesGrupo(grupoId) {
  if (!confirm("Marcar todas as contas pendentes deste grupo como pagas?"))
    return;
  mostrarLoading();
  try {
    const hojeStr = hoje();
    const { error } = await supabaseClient
      .from("contas_pagar")
      .update({ status: "pago", data_pagamento: hojeStr })
      .eq("grupo_id", grupoId)
      .neq("status", "pago");
    if (error) throw error;
    mostrarToast("Todas as contas pendentes do grupo foram pagas!", "success");
    fecharModal("modalGrupo");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}
async function excluirTodasFuturasGrupo(grupoId) {
  if (
    !confirm(
      "Excluir todas as contas FUTURAS (com vencimento maior que hoje) deste grupo?",
    )
  )
    return;
  mostrarLoading();
  try {
    const hojeStr = hoje();
    const { error } = await supabaseClient
      .from("contas_pagar")
      .delete()
      .eq("grupo_id", grupoId)
      .gt("data_vencimento", hojeStr);
    if (error) throw error;
    mostrarToast("Contas futuras excluídas!", "success");
    fecharModal("modalGrupo");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}
function abrirModalEditarGrupo(grupoId) {
  const contaExemplo = estado.dados.contas.find((c) => c.grupo_id === grupoId);
  if (!contaExemplo) return;
  document.getElementById("editarGrupoId").value = grupoId;
  document.getElementById("editarGrupoDescricao").value =
    contaExemplo.descricao || "";
  document.getElementById("editarGrupoFornecedor").value =
    contaExemplo.fornecedor || "";
  document.getElementById("editarGrupoValor").value = contaExemplo.valor;
  document.getElementById("editarGrupoCategoria").value =
    contaExemplo.categoria_id || "";
  document.getElementById("editarGrupoApenasFuturas").checked = true;
  const selectCat = document.getElementById("editarGrupoCategoria");
  selectCat.innerHTML =
    '<option value="">Manter atual</option>' +
    estado.dados.categorias
      .map((c) => `<option value="${c.id}">${c.nome}</option>`)
      .join("");
  document.getElementById("modalEditarGrupo").classList.add("show");
}
async function salvarEdicaoGrupo() {
  const grupoId = document.getElementById("editarGrupoId").value;
  if (!grupoId) return;
  const descricao = document
    .getElementById("editarGrupoDescricao")
    .value.trim();
  const fornecedor = document
    .getElementById("editarGrupoFornecedor")
    .value.trim();
  const valor = parseFloat(document.getElementById("editarGrupoValor").value);
  const categoria_id = document.getElementById("editarGrupoCategoria").value;
  const apenasFuturas = document.getElementById(
    "editarGrupoApenasFuturas",
  ).checked;
  if (!isNaN(valor) && valor <= 0) {
    mostrarToast("Valor deve ser maior que zero", "error");
    return;
  }
  const updates = {};
  if (descricao) updates.descricao = descricao;
  if (fornecedor) updates.fornecedor = fornecedor;
  if (!isNaN(valor) && valor > 0) updates.valor = valor;
  if (categoria_id) updates.categoria_id = parseInt(categoria_id);
  if (Object.keys(updates).length === 0) {
    mostrarToast("Nenhum campo preenchido para atualizar", "alerta");
    return;
  }
  mostrarLoading();
  try {
    let query = supabaseClient
      .from("contas_pagar")
      .update(updates)
      .eq("grupo_id", grupoId);
    if (apenasFuturas) query = query.gt("data_vencimento", hoje());
    else query = query.neq("status", "pago");
    const { error } = await query;
    if (error) throw error;
    mostrarToast("Grupo atualizado com sucesso!", "success");
    fecharModal("modalEditarGrupo");
    await carregarDados();
    renderizarResumo();
    renderizarAgenda();
    renderizarRanking();
    renderizarGraficos();
    renderizarTabela();
    if (document.getElementById("dashboardSection").style.display !== "none")
      renderizarDashboard();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao atualizar grupo: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// RELATÓRIO POR FORNECEDOR
// ============================================================
function verRelatorioFornecedor(fornecedor) {
  const contas = estado.dados.contas.filter((c) => c.fornecedor === fornecedor);
  if (contas.length === 0) return;
  let totalGeral = 0,
    totalPago = 0,
    totalPendente = 0;
  const linhas = contas
    .map((c) => {
      totalGeral += c.valor;
      if (c.status === "pago") totalPago += c.valor_pago || c.valor;
      else totalPendente += c.valor - (c.valor_pago || 0);
      return `
       <tr>
         <td>${escapeHtml(c.descricao)}</td>
         <td>${fmtValor(c.valor)}</td>
         <td>${fmtData(c.data_vencimento)}</td>
         <td>${c.status === "pago" ? fmtData(c.data_pagamento) : "-"}</td>
         <td><span class="status-badge ${c.status}">${c.status === "pago" ? "Pago" : c.status === "parcial" ? "Parcial" : "Pendente"}</span></td>
       </tr>
    `;
    })
    .join("");
  const html = `
    <div style="margin-bottom:1rem;">
      <p><strong>Total de despesas:</strong> ${contas.length}</p>
      <p><strong>Valor total:</strong> ${fmtValor(totalGeral)}</p>
      <p><strong>Total pago:</strong> ${fmtValor(totalPago)}</p>
      <p><strong>Total pendente:</strong> ${fmtValor(totalPendente)}</p>
    </div>
    <div class="table-responsive">
      <table class="minimal-table">
        <thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
  document.getElementById("relatorioFornecedorTitulo").textContent =
    `Relatório: ${fornecedor}`;
  document.getElementById("relatorioFornecedorBody").innerHTML = html;
  document.getElementById("modalRelatorioFornecedor").classList.add("show");
}
function exportarRelatorioFornecedor() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const titulo = document.getElementById("relatorioFornecedorTitulo").innerText;
  doc.setFontSize(16);
  doc.text(titulo, 14, 22);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  const tabela = document.querySelector(
    "#modalRelatorioFornecedor .minimal-table",
  );
  if (!tabela) return;
  const rows = tabela.querySelectorAll("tbody tr");
  const body = [];
  rows.forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    if (cells.length)
      body.push([
        cells[0].innerText,
        cells[1].innerText,
        cells[2].innerText,
        cells[3].innerText,
        cells[4].innerText,
      ]);
  });
  doc.autoTable({
    startY: 40,
    head: [["Descrição", "Valor", "Vencimento", "Pagamento", "Status"]],
    body,
    theme: "striped",
  });
  doc.save(`relatorio_fornecedor_${Date.now()}.pdf`);
  mostrarToast("PDF gerado", "success");
}

// ============================================================
// IMPORTAÇÃO CSV
// ============================================================
function abrirModalImportarCSV() {
  document.getElementById("modalImportarCSV").classList.add("show");
  document.getElementById("csvFile").value = "";
  document.getElementById("csvPreview").innerHTML = "";
}
async function importarCSV() {
  const file = document.getElementById("csvFile").files[0];
  if (!file) {
    mostrarToast("Selecione um arquivo CSV", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = async function (e) {
    const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) {
      mostrarToast("Arquivo vazio", "error");
      return;
    }
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes("descricao") || firstLine.includes("descrição"))
      startIndex = 1;
    const contas = [],
      errors = [];
    for (let i = startIndex; i < lines.length; i++) {
      const row = lines[i].split(",").map((cell) => cell.trim());
      if (row.length < 6) {
        errors.push(`Linha ${i + 1}: número de colunas insuficiente`);
        continue;
      }
      const [
        descricao,
        fornecedor,
        cpf_cnpj,
        valor,
        data_vencimento,
        categoria_id,
        tipo,
        observacoes,
      ] = row;
      if (!descricao || !valor || !data_vencimento || !categoria_id) {
        errors.push(`Linha ${i + 1}: campos obrigatórios faltando`);
        continue;
      }
      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        errors.push(`Linha ${i + 1}: valor inválido`);
        continue;
      }
      const catExiste = estado.dados.categorias.some(
        (c) => c.id == categoria_id,
      );
      if (!catExiste) {
        errors.push(
          `Linha ${i + 1}: categoria_id ${categoria_id} não encontrada`,
        );
        continue;
      }
      contas.push({
        descricao,
        fornecedor: fornecedor || null,
        cpf_cnpj: cpf_cnpj || null,
        valor: valorNum,
        data_vencimento,
        categoria_id: parseInt(categoria_id),
        tipo: tipo || "variavel",
        observacoes: observacoes || null,
        status: "pendente",
      });
    }
    if (errors.length) {
      mostrarToast(`Erros no CSV: ${errors.slice(0, 3).join(", ")}`, "error");
      return;
    }
    if (!contas.length) {
      mostrarToast("Nenhuma receita válida", "error");
      return;
    }
    if (confirm(`Importar ${contas.length} despesas?`)) {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("contas_pagar")
          .insert(contas);
        if (error) throw error;
        mostrarToast(`${contas.length} despesas importadas!`, "success");
        fecharModal("modalImportarCSV");
        await carregarDados();
        renderizarResumo();
        renderizarAgenda();
        renderizarRanking();
        renderizarGraficos();
        renderizarTabela();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    }
  };
  reader.readAsText(file, "UTF-8");
}

// ============================================================
// NOTIFICAÇÕES (vencidas e próximas)
// ============================================================
async function carregarNotificacoes() {
  if (!estado.usuario) return;
  const { data, error } = await supabaseClient
    .from("notificacoes")
    .select("*")
    .eq("usuario_id", estado.usuario.id)
    .eq("lida", false)
    .order("created_at", { ascending: false });
  if (error) console.error(error);
  estado.notificacoes = data || [];
  atualizarBadgeNotificacoes();
}
function atualizarBadgeNotificacoes() {
  const badge = document.getElementById("notificationBadge");
  if (badge) {
    const count = estado.notificacoes.length;
    badge.style.display = count > 0 ? "flex" : "none";
    badge.textContent = count > 9 ? "9+" : count;
  }
}
async function verificarVencidas() {
  const hojeStr = hoje();
  const tresDiasAhead = new Date();
  tresDiasAhead.setDate(tresDiasAhead.getDate() + 3);
  const tresDiasStr = tresDiasAhead.toISOString().split("T")[0];
  const vencidas = estado.dados.contas.filter(
    (c) =>
      (c.status === "pendente" || c.status === "parcial") &&
      c.data_vencimento < hojeStr,
  );
  const proximas = estado.dados.contas.filter(
    (c) =>
      (c.status === "pendente" || c.status === "parcial") &&
      c.data_vencimento >= hojeStr &&
      c.data_vencimento <= tresDiasStr,
  );
  const { data: existentes } = await supabaseClient
    .from("notificacoes")
    .select("mensagem")
    .eq("usuario_id", estado.usuario.id)
    .like("mensagem", "%vencida%")
    .or("mensagem.ilike.%próximos dias%");
  const mensagensExistentes = (existentes || []).map((e) => e.mensagem);
  const novas = [];
  for (const c of vencidas) {
    const msg = `Despesa "${c.descricao}" (${fmtValor(c.valor)}) está vencida desde ${fmtData(c.data_vencimento)}.`;
    if (!mensagensExistentes.includes(msg))
      novas.push({
        usuario_id: estado.usuario.id,
        tipo: "alerta",
        mensagem: msg,
        link: `javascript:verDetalhes(${c.id})`,
      });
  }
  for (const c of proximas) {
    const dias = Math.ceil(
      (new Date(c.data_vencimento) - new Date(hojeStr)) / (1000 * 60 * 60 * 24),
    );
    const msg = `Despesa "${c.descricao}" (${fmtValor(c.valor)}) vence em ${dias} dia(s) (${fmtData(c.data_vencimento)}).`;
    if (!mensagensExistentes.includes(msg))
      novas.push({
        usuario_id: estado.usuario.id,
        tipo: "alerta",
        mensagem: msg,
        link: `javascript:verDetalhes(${c.id})`,
      });
  }
  if (novas.length) {
    const { error } = await supabaseClient.from("notificacoes").insert(novas);
    if (!error) {
      estado.notificacoes.push(...novas);
      atualizarBadgeNotificacoes();
    }
  }
}
function abrirListaNotificacoes() {
  const modal = document.getElementById("modalNotificacoes");
  const body = document.getElementById("listaNotificacoesBody");
  if (estado.notificacoes.length === 0)
    body.innerHTML = "<p>Nenhuma notificação</p>";
  else {
    body.innerHTML = estado.notificacoes
      .map(
        (n) => `
      <div class="notificacao-item" data-id="${n.id}">
        <div>${escapeHtml(n.mensagem)}</div>
        <div class="notificacao-actions">
          <button onclick="marcarComoLida(${n.id}, this)">Marcar como lida</button>
          ${n.link ? `<button onclick="window.location.href='${n.link}'">Visualizar</button>` : ""}
        </div>
      </div>
    `,
      )
      .join("");
  }
  modal.classList.add("show");
}
function fecharModalNotificacoes() {
  document.getElementById("modalNotificacoes").classList.remove("show");
}
async function marcarComoLida(id, btn) {
  const { error } = await supabaseClient
    .from("notificacoes")
    .update({ lida: true })
    .eq("id", id);
  if (!error) {
    estado.notificacoes = estado.notificacoes.filter((n) => n.id !== id);
    const item = btn.closest(".notificacao-item");
    if (item) item.remove();
    if (estado.notificacoes.length === 0)
      document.getElementById("listaNotificacoesBody").innerHTML =
        "<p>Nenhuma notificação</p>";
    atualizarBadgeNotificacoes();
  }
}
async function marcarTodasComoLidas() {
  const ids = estado.notificacoes.map((n) => n.id);
  if (!ids.length) return;
  const { error } = await supabaseClient
    .from("notificacoes")
    .update({ lida: true })
    .in("id", ids);
  if (!error) {
    estado.notificacoes = [];
    document.getElementById("listaNotificacoesBody").innerHTML =
      "<p>Nenhuma notificação</p>";
    atualizarBadgeNotificacoes();
  }
}

// ============================================================
// EXPORTAÇÃO (PDF e Excel)
// ============================================================
function obterDadosParaExportacao() {
  const dados = [];
  const linhas = document.querySelectorAll("#tabelaContas tr");
  linhas.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 0) return;
    dados.push([
      tds[0]?.innerText || "",
      tds[1]?.innerText || "",
      tds[2]?.innerText || "",
      tds[3]?.innerText || "",
      tds[4]?.innerText || "",
      tds[5]?.innerText || "",
    ]);
  });
  return dados;
}
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Relatório de Despesas", 14, 22);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  doc.text(
    `Filtros: ${estado.filtros.busca ? "Busca: " + estado.filtros.busca : ""} ${estado.filtros.status ? "Status: " + estado.filtros.status : ""} ${estado.filtros.categoria_id ? "Categoria: " + (estado.dados.categoriaMap[estado.filtros.categoria_id] || "") : ""}`,
    14,
    36,
  );
  const dados = obterDadosParaExportacao();
  if (dados.length === 0) {
    mostrarToast("Nenhum dado para exportar", "alerta");
    return;
  }
  doc.autoTable({
    startY: 45,
    head: [
      ["Descrição", "Fornecedor", "Valor", "Vencimento", "Status", "Categoria"],
    ],
    body: dados,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [58, 107, 92] },
  });
  doc.save(`despesas_${new Date().toISOString().split("T")[0]}.pdf`);
  mostrarToast("PDF gerado com sucesso!", "success");
}
function exportarExcel() {
  const dados = obterDadosParaExportacao();
  if (dados.length === 0) {
    mostrarToast("Nenhum dado para exportar", "alerta");
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Relatório de Despesas"],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [
      `Filtros: ${estado.filtros.busca ? "Busca: " + estado.filtros.busca : ""} ${estado.filtros.status ? "Status: " + estado.filtros.status : ""} ${estado.filtros.categoria_id ? "Categoria: " + (estado.dados.categoriaMap[estado.filtros.categoria_id] || "") : ""}`,
    ],
    [],
    ["Descrição", "Fornecedor", "Valor", "Vencimento", "Status", "Categoria"],
    ...dados,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Despesas");
  XLSX.writeFile(wb, `despesas_${new Date().toISOString().split("T")[0]}.xlsx`);
  mostrarToast("Excel gerado com sucesso!", "success");
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await verificarLogin();
  mostrarLoading();
  await carregarDados();
  renderizarResumo();
  renderizarAgenda();
  renderizarRanking();
  renderizarGraficos();
  renderizarDashboard(); // renderiza dashboard por padrão (já visível)
  renderizarTabela();
  await carregarNotificacoes();
  await verificarVencidas();
  esconderLoading();
});
