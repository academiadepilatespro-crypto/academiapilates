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
    receitas: [],
    categorias: [], // array de objetos { id, nome }
    categoriaMap: {}, // mapeamento id -> nome
  },
  filtros: {
    vencInicio: "",
    vencFim: "",
    recInicio: "",
    recFim: "",
    status: "",
    categoria_id: "",
    busca: "",
  },
  ordenacao: {
    coluna: "vencimento",
    direcao: "asc",
  },
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

// ============================================================
// VALIDAÇÃO CPF/CNPJ
// ============================================================
function validarCpfCnpj(valor) {
  if (!valor) return true; // campo opcional
  valor = valor.replace(/[^\d]/g, "");
  if (valor.length === 11) {
    // CPF
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
    // CNPJ
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
    const [receitas, categorias] = await Promise.all([
      supabaseClient
        .from("outras_receitas")
        .select("*")
        .order("data_vencimento", { ascending: true }),
      supabaseClient
        .from("categorias_financeiras")
        .select("*")
        .eq("tipo", "receita"),
    ]);

    if (receitas.error) throw receitas.error;
    if (categorias.error) throw categorias.error;

    estado.dados.receitas = receitas.data || [];
    estado.dados.categorias = categorias.data || [];
    // Build map for category names
    estado.dados.categoriaMap = {};
    estado.dados.categorias.forEach((cat) => {
      estado.dados.categoriaMap[cat.id] = cat.nome;
    });

    document.getElementById("totalReceitas").textContent =
      `${estado.dados.receitas.length} receitas cadastradas`;

    // Preencher selects de categoria (usando id como value)
    const filtroCat = document.getElementById("filtroCategoria");
    const modalCat = document.getElementById("receitaCategoria");
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
// FUNÇÕES DE RESUMO (com taxa de recebimento e previsão 30d)
// ============================================================
function calcularResumo() {
  const hojeStr = hoje();
  const mesAtual = hojeStr.substring(0, 7); // YYYY-MM

  const totalPendente = estado.dados.receitas
    .filter((r) => r.status === "pendente")
    .reduce((acc, r) => acc + (r.valor || 0), 0);

  const recebidoMes = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento.substring(0, 7) === mesAtual,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);

  const vencidas = estado.dados.receitas.filter(
    (r) => r.status === "pendente" && r.data_vencimento < hojeStr,
  ).length;

  // Taxa de recebimento (considerando todo o histórico)
  const totalEmitido = estado.dados.receitas.reduce(
    (acc, r) => acc + (r.valor || 0),
    0,
  );
  const totalRecebido = estado.dados.receitas
    .filter((r) => r.status === "recebido")
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  const taxaRecebimento =
    totalEmitido > 0 ? (totalRecebido / totalEmitido) * 100 : 0;

  // Previsão próximos 30 dias
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() + 30);
  const trintaDiasStr = trintaDias.toISOString().split("T")[0];
  const prev30 = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "pendente" &&
        r.data_vencimento >= hojeStr &&
        r.data_vencimento <= trintaDiasStr,
    )
    .reduce((acc, r) => acc + (r.valor || 0), 0);

  return {
    totalPendente,
    recebidoMes,
    vencidas,
    taxaRecebimento,
    prev30,
  };
}

function renderizarResumo() {
  const resumo = calcularResumo();
  const container = document.getElementById("resumoContainer");
  container.innerHTML = `
          <div class="stat-card" data-filtro="vencidas">
              <div class="stat-icon ${resumo.vencidas > 0 ? "danger" : ""}"><i class="fas fa-exclamation-triangle"></i></div>
              <div class="stat-info">
                  <div class="stat-value">${resumo.vencidas}</div>
                  <div class="stat-label">Receitas Vencidas</div>
              </div>
          </div>
          <div class="stat-card">
              <div class="stat-icon"><i class="fas fa-clock"></i></div>
              <div class="stat-info">
                  <div class="stat-value">${fmtValor(resumo.totalPendente)}</div>
                  <div class="stat-label">Total a Receber</div>
              </div>
          </div>
          <div class="stat-card">
              <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
              <div class="stat-info">
                  <div class="stat-value">${fmtValor(resumo.recebidoMes)}</div>
                  <div class="stat-label">Recebido no Mês</div>
              </div>
          </div>
          <div class="stat-card">
              <div class="stat-icon"><i class="fas fa-percent"></i></div>
              <div class="stat-info">
                  <div class="stat-value">${resumo.taxaRecebimento.toFixed(1)}%</div>
                  <div class="stat-label">Taxa de Recebimento</div>
                  <div style="font-size:0.7rem;">Prev 30d: ${fmtValor(resumo.prev30)}</div>
              </div>
          </div>
      `;
  // Adicionar evento de clique no card de vencidas
  const cardVencidas = container.querySelector(
    '.stat-card[data-filtro="vencidas"]',
  );
  if (cardVencidas) {
    cardVencidas.style.cursor = "pointer";
    cardVencidas.addEventListener("click", () => {
      document.getElementById("filtroStatus").value = "vencido";
      aplicarFiltros();
    });
  }
}

// ============================================================
// RANKINGS (Categorias e Clientes) com barras de progresso
// ============================================================
function renderizarRankings() {
  const recebidas = estado.dados.receitas.filter(
    (r) => r.status === "recebido",
  );
  const mesAtual = hoje().substring(0, 7);

  // Categorias (considerando recebidas no mês atual)
  const cats = {};
  recebidas.forEach((r) => {
    if (r.data_recebimento && r.data_recebimento.substring(0, 7) === mesAtual) {
      const catId = r.categoria_id;
      const catNome = estado.dados.categoriaMap[catId] || "Outros";
      cats[catNome] = (cats[catNome] || 0) + (r.valor_recebido || r.valor || 0);
    }
  });
  const rankingCat = Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const totalCat = rankingCat.reduce((acc, [, val]) => acc + val, 0);

  const catDiv = document.getElementById("rankingCategorias");
  if (rankingCat.length === 0) {
    catDiv.innerHTML =
      '<p style="text-align:center;">Nenhuma receita no mês</p>';
  } else {
    catDiv.innerHTML = rankingCat
      .map(([cat, val]) => {
        const percent = totalCat > 0 ? (val / totalCat) * 100 : 0;
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

  // Clientes (considerando recebidas no mês atual, com cliente preenchido)
  const clientes = {};
  recebidas.forEach((r) => {
    if (
      r.cliente &&
      r.data_recebimento &&
      r.data_recebimento.substring(0, 7) === mesAtual
    ) {
      const cli = r.cliente;
      clientes[cli] = (clientes[cli] || 0) + (r.valor_recebido || r.valor || 0);
    }
  });
  const rankingCli = Object.entries(clientes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const totalCli = rankingCli.reduce((acc, [, val]) => acc + val, 0);

  const cliDiv = document.getElementById("rankingClientes");
  if (rankingCli.length === 0) {
    cliDiv.innerHTML =
      '<p style="text-align:center;">Nenhum cliente com receita no mês</p>';
  } else {
    cliDiv.innerHTML = rankingCli
      .map(([cli, val]) => {
        const percent = totalCli > 0 ? (val / totalCli) * 100 : 0;
        return `
          <div class="compact-row">
            <span class="compact-label" style="cursor:pointer;" onclick="verRelatorioCliente('${cli.replace(/'/g, "\\'")}')">${cli}</span>
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
}

// ============================================================
// GRÁFICOS
// ============================================================
let graficoPizza,
  graficoLinha,
  graficoDiaSemana,
  graficoComparativo,
  graficoPrevisao;
function renderizarGraficos() {
  // Gráfico de pizza: receita por categoria (mês atual)
  const mesAtual = hoje().substring(0, 7);
  const recebidasMes = estado.dados.receitas.filter(
    (r) =>
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento.substring(0, 7) === mesAtual,
  );
  const cats = {};
  recebidasMes.forEach((r) => {
    const catId = r.categoria_id;
    const catNome = estado.dados.categoriaMap[catId] || "Outros";
    cats[catNome] = (cats[catNome] || 0) + (r.valor_recebido || r.valor || 0);
  });
  const labels = Object.keys(cats);
  const dados = Object.values(cats);
  const hasData = labels.length > 0;

  if (graficoPizza) graficoPizza.destroy();
  const ctxPizza = document.getElementById("graficoPizza")?.getContext("2d");
  if (ctxPizza) {
    if (!hasData) {
      // Exibir mensagem de dados insuficientes
      ctxPizza.clearRect(0, 0, ctxPizza.canvas.width, ctxPizza.canvas.height);
      ctxPizza.font = "14px Montserrat";
      ctxPizza.fillStyle = "#666";
      ctxPizza.textAlign = "center";
      ctxPizza.fillText(
        "Nenhuma receita no período",
        ctxPizza.canvas.width / 2,
        ctxPizza.canvas.height / 2,
      );
      graficoPizza = null;
    } else {
      graficoPizza = new Chart(ctxPizza, {
        type: "doughnut",
        data: {
          labels: labels,
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

  // Gráfico de linha: evolução de receitas extras (últimos 6 meses)
  const labels6 = [];
  const valores6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
    const mesAno = `${mes.toString().padStart(2, "0")}/${ano}`;
    labels6.push(mesAno);
    const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
    const total = estado.dados.receitas
      .filter(
        (r) =>
          r.status === "recebido" &&
          r.data_recebimento &&
          r.data_recebimento >= inicio &&
          r.data_recebimento <= fim,
      )
      .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
    valores6.push(total);
  }
  if (graficoLinha) graficoLinha.destroy();
  const ctxLinha = document.getElementById("graficoLinha")?.getContext("2d");
  if (ctxLinha) {
    graficoLinha = new Chart(ctxLinha, {
      type: "line",
      data: {
        labels: labels6,
        datasets: [
          {
            label: "Receitas Extras",
            data: valores6,
            borderColor: "#27ae60",
            backgroundColor: "rgba(39,174,96,0.1)",
            tension: 0.4,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: (c) => fmtValor(c.raw) } },
        },
        scales: { y: { ticks: { callback: (v) => fmtValor(v) } } },
      },
    });
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function toggleDashboard() {
  const dashboard = document.getElementById("dashboardSection");
  if (dashboard.style.display === "none") {
    dashboard.style.display = "block";
    renderizarDashboard();
  } else {
    dashboard.style.display = "none";
  }
}

function renderizarDashboard() {
  // Receitas por dia da semana (últimos 12 meses)
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const valoresDia = [0, 0, 0, 0, 0, 0, 0];
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
  const dataInicio = umAnoAtras.toISOString().split("T")[0];
  const receitasPeriodo = estado.dados.receitas.filter(
    (r) =>
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= dataInicio,
  );
  receitasPeriodo.forEach((r) => {
    const data = new Date(r.data_recebimento);
    const dia = data.getDay(); // 0=domingo
    valoresDia[dia] += r.valor_recebido || r.valor;
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
            label: "Recebido (R$)",
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

  // Comparativo mês atual x mês anterior
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
  const valorMesAtual = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento >= inicioMesAtual &&
        r.data_recebimento <= fimMesAtual,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor), 0);
  const valorMesAnterior = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento >= inicioMesAnterior &&
        r.data_recebimento <= fimMesAnterior,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor), 0);
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
            label: "Recebido (R$)",
            data: [valorMesAnterior, valorMesAtual],
            backgroundColor: ["#95a5a6", "#27ae60"],
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
  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() + 30);
  const trintaDiasStr = trintaDias.toISOString().split("T")[0];
  const previsao = [];
  const labelsPrev = [];
  for (let i = 0; i <= 30; i++) {
    const data = new Date();
    data.setDate(data.getDate() + i);
    const dataStr = data.toISOString().split("T")[0];
    labelsPrev.push(dataStr.substring(5)); // MM-DD
    const totalDia = estado.dados.receitas
      .filter((r) => r.status === "pendente" && r.data_vencimento === dataStr)
      .reduce((acc, r) => acc + r.valor, 0);
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
            label: "Previsão de Recebimento",
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
// FUNÇÕES DA TABELA
// ============================================================
function aplicarFiltros() {
  estado.filtros = {
    vencInicio: document.getElementById("filtroVencInicio")?.value || "",
    vencFim: document.getElementById("filtroVencFim")?.value || "",
    recInicio: document.getElementById("filtroRecInicio")?.value || "",
    recFim: document.getElementById("filtroRecFim")?.value || "",
    status: document.getElementById("filtroStatus")?.value || "",
    categoria_id: document.getElementById("filtroCategoria")?.value || "",
    busca: document.getElementById("searchInput")?.value || "",
  };
  renderizarTabela();
}

function filtrarReceitas() {
  aplicarFiltros();
}

function limparFiltros() {
  document.getElementById("filtroVencInicio").value = "";
  document.getElementById("filtroVencFim").value = "";
  document.getElementById("filtroRecInicio").value = "";
  document.getElementById("filtroRecFim").value = "";
  document.getElementById("filtroStatus").value = "";
  document.getElementById("filtroCategoria").value = "";
  document.getElementById("searchInput").value = "";
  aplicarFiltros();
}

function ordenarPor(coluna) {
  if (estado.ordenacao.coluna === coluna) {
    estado.ordenacao.direcao =
      estado.ordenacao.direcao === "asc" ? "desc" : "asc";
  } else {
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
  const col = estado.ordenacao.coluna;
  const dir = estado.ordenacao.direcao;
  return [...lista].sort((a, b) => {
    let valA, valB;
    if (col === "descricao") {
      valA = a.descricao || "";
      valB = b.descricao || "";
    } else if (col === "cliente") {
      valA = a.cliente || "";
      valB = b.cliente || "";
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
    if (typeof valA === "string") {
      return dir === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    } else {
      return dir === "asc" ? valA - valB : valB - valA;
    }
  });
}

function renderizarTabela() {
  let lista = [...estado.dados.receitas];
  const {
    vencInicio,
    vencFim,
    recInicio,
    recFim,
    status,
    categoria_id,
    busca,
  } = estado.filtros;
  if (vencInicio) lista = lista.filter((r) => r.data_vencimento >= vencInicio);
  if (vencFim) lista = lista.filter((r) => r.data_vencimento <= vencFim);
  if (recInicio) lista = lista.filter((r) => r.data_recebimento >= recInicio);
  if (recFim) lista = lista.filter((r) => r.data_recebimento <= recFim);
  if (status === "pendente")
    lista = lista.filter((r) => r.status === "pendente");
  else if (status === "recebido")
    lista = lista.filter((r) => r.status === "recebido");
  else if (status === "vencido") {
    const hojeStr = hoje();
    lista = lista.filter(
      (r) => r.status === "pendente" && r.data_vencimento < hojeStr,
    );
  }
  if (categoria_id) lista = lista.filter((r) => r.categoria_id == categoria_id);
  if (busca) {
    const bus = busca.toLowerCase();
    lista = lista.filter(
      (r) =>
        (r.descricao && r.descricao.toLowerCase().includes(bus)) ||
        (r.cliente && r.cliente.toLowerCase().includes(bus)),
    );
  }
  lista = aplicarOrdenacao(lista);

  const tbody = document.getElementById("tabelaReceitas");
  if (lista.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center; padding:2rem;">Nenhuma receita encontrada</td></tr>';
    return;
  }

  const hojeStr = hoje();
  tbody.innerHTML = lista
    .map((r) => {
      const categoriaNome =
        estado.dados.categoriaMap[r.categoria_id] || "Sem categoria";
      const classeLinha =
        r.status === "pendente" && r.data_vencimento < hojeStr
          ? "vencida"
          : r.status === "pendente" && r.data_vencimento === hojeStr
            ? "hoje"
            : "";
      return `
              <tr class="${classeLinha}" data-id="${r.id}">
                    <td><strong>${escapeHtml(r.descricao)}</strong></td>
                    <td>${escapeHtml(r.cliente || "-")}</td>
                    <td>${fmtValor(r.valor)}</td>
                    <td>${fmtData(r.data_vencimento)}</td>
                    <td>${r.data_recebimento ? fmtData(r.data_recebimento) : "-"}</td>
                    <td><span class="status-badge ${r.status === "recebido" ? "recebido" : "pendente"}">${r.status === "recebido" ? "Recebido" : "Pendente"}</span></td>
                    <td>${escapeHtml(categoriaNome)}</td>
                    <td>
                      <div class="action-buttons">
                          <a class="action-btn visualizar" href="javascript:void(0)" onclick="verDetalhes(${r.id})" title="Ver detalhes">
                              <i class="fas fa-eye"></i>
                          </a>
                          ${
                            r.status === "pendente"
                              ? `
                              <a class="action-btn receber" href="javascript:void(0)" onclick="abrirModalRecebimento(${r.id}, ${r.valor})" title="Registrar recebimento">
                                  <i class="fas fa-check"></i>
                              </a>
                              <a class="action-btn editar" href="javascript:void(0)" onclick="editarReceita(${r.id})" title="Editar">
                                  <i class="fas fa-edit"></i>
                              </a>
                              <a class="action-btn duplicar" href="javascript:void(0)" onclick="duplicarReceita(${r.id})" title="Duplicar">
                                  <i class="fas fa-copy"></i>
                              </a>
                              <a class="action-btn excluir" href="javascript:void(0)" onclick="confirmarExclusao(${r.id})" title="Excluir">
                                  <i class="fas fa-trash"></i>
                              </a>
                          `
                              : ""
                          }
                      </div>
                    </td>
                </tr>
          `;
    })
    .join("");
}

// Função auxiliar para escapar HTML
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// FUNÇÕES DO MODAL DE RECEITA (CADASTRO/EDIÇÃO)
// ============================================================
function toggleRecebido() {
  const checked = document.getElementById("receitaJaRecebido").checked;
  const group = document.getElementById("receitaRecebimentoGroup");
  group.style.display = checked ? "grid" : "none";
  if (checked) {
    document.getElementById("receitaDataRecebimento").value = hoje();
    document.getElementById("receitaValorRecebido").value =
      document.getElementById("receitaValor").value;
  } else {
    document.getElementById("receitaDataRecebimento").value = "";
    document.getElementById("receitaValorRecebido").value = "";
  }
}

function abrirModalReceita() {
  document.getElementById("modalReceitaTitle").textContent = "Nova Receita";
  document.getElementById("formReceita").reset();
  document.getElementById("receitaId").value = "";
  document.getElementById("receitaEmissao").value = hoje();
  document.getElementById("receitaVencimento").value = hoje();
  document.getElementById("receitaJaRecebido").checked = false;
  document.getElementById("receitaRecebimentoGroup").style.display = "none";
  document.getElementById("modalReceita").classList.add("show");
}

function editarReceita(id) {
  const rec = estado.dados.receitas.find((r) => r.id === id);
  if (!rec) return;
  if (rec.status === "recebido") {
    mostrarToast("Receitas já recebidas não podem ser editadas", "alerta");
    return;
  }

  document.getElementById("modalReceitaTitle").textContent = "Editar Receita";
  document.getElementById("receitaId").value = rec.id;
  document.getElementById("receitaDescricao").value = rec.descricao || "";
  document.getElementById("receitaCliente").value = rec.cliente || "";
  document.getElementById("receitaCpfCnpj").value = rec.cpf_cnpj || "";
  document.getElementById("receitaValor").value = rec.valor;
  document.getElementById("receitaEmissao").value = rec.data_emissao || hoje();
  document.getElementById("receitaVencimento").value = rec.data_vencimento;
  const categoriaSelect = document.getElementById("receitaCategoria");
  if (categoriaSelect) categoriaSelect.value = rec.categoria_id || "";
  document.getElementById("receitaObs").value = rec.observacoes || "";
  document.getElementById("receitaJaRecebido").checked = false;
  document.getElementById("receitaRecebimentoGroup").style.display = "none";

  document.getElementById("modalReceita").classList.add("show");
}

function duplicarReceita(id) {
  const original = estado.dados.receitas.find((r) => r.id === id);
  if (!original) return;

  document.getElementById("modalReceitaTitle").textContent =
    "Nova Receita (duplicada)";
  document.getElementById("receitaId").value = "";
  document.getElementById("receitaDescricao").value =
    original.descricao + " (cópia)";
  document.getElementById("receitaCliente").value = original.cliente || "";
  document.getElementById("receitaCpfCnpj").value = original.cpf_cnpj || "";
  document.getElementById("receitaValor").value = original.valor;
  document.getElementById("receitaEmissao").value = hoje();
  document.getElementById("receitaVencimento").value = original.data_vencimento;
  const categoriaSelect = document.getElementById("receitaCategoria");
  if (categoriaSelect) categoriaSelect.value = original.categoria_id || "";
  document.getElementById("receitaObs").value = original.observacoes || "";
  document.getElementById("receitaJaRecebido").checked = false;
  document.getElementById("receitaRecebimentoGroup").style.display = "none";

  document.getElementById("modalReceita").classList.add("show");
}

async function salvarReceita() {
  const id = document.getElementById("receitaId").value;
  const descricao = document.getElementById("receitaDescricao").value.trim();
  const valor = parseFloat(document.getElementById("receitaValor").value);
  const vencimento = document.getElementById("receitaVencimento").value;
  const categoria_id = document.getElementById("receitaCategoria").value;
  const emissao = document.getElementById("receitaEmissao").value || hoje();
  const cliente =
    document.getElementById("receitaCliente").value.trim() || null;
  const cpfCnpj =
    document.getElementById("receitaCpfCnpj").value.trim() || null;
  const observacoes =
    document.getElementById("receitaObs").value.trim() || null;
  const jaRecebido = document.getElementById("receitaJaRecebido").checked;

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

  let dataRecebimento = null;
  let forma = null;
  let valorRecebido = null;
  let status = "pendente";

  if (jaRecebido) {
    dataRecebimento =
      document.getElementById("receitaDataRecebimento").value || hoje();
    forma = document.getElementById("receitaForma").value;
    valorRecebido =
      parseFloat(document.getElementById("receitaValorRecebido").value) ||
      valor;
    if (!forma) {
      mostrarToast("Selecione a forma de recebimento", "error");
      return;
    }
    status = "recebido";
  }

  const receitaData = {
    descricao,
    cliente,
    cpf_cnpj: cpfCnpj,
    valor,
    data_emissao: emissao,
    data_vencimento: vencimento,
    categoria_id: parseInt(categoria_id),
    observacoes,
    status,
  };
  if (jaRecebido) {
    receitaData.data_recebimento = dataRecebimento;
    receitaData.forma = forma;
    receitaData.valor_recebido = valorRecebido;
  }

  mostrarLoading();

  try {
    if (id) {
      const { error } = await supabaseClient
        .from("outras_receitas")
        .update(receitaData)
        .eq("id", id);
      if (error) throw error;
      mostrarToast("Receita atualizada!", "success");
    } else {
      const { error } = await supabaseClient
        .from("outras_receitas")
        .insert([receitaData]);
      if (error) throw error;
      mostrarToast("Receita cadastrada!", "success");
    }

    fecharModal("modalReceita");
    await carregarDados();
    renderizarResumo();
    renderizarRankings();
    renderizarGraficos();
    renderizarTabela();
  } catch (error) {
    console.error("Erro ao salvar receita:", error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÕES DE RECEBIMENTO (BAIXA)
// ============================================================
function abrirModalRecebimento(id, valor) {
  document.getElementById("recebimentoReceitaId").value = id;
  document.getElementById("recebimentoData").value = hoje();
  document.getElementById("recebimentoValor").value = valor.toFixed(2);
  document.getElementById("recebimentoForma").value = "PIX";
  document.getElementById("recebimentoObs").value = "";
  document.getElementById("modalRecebimento").classList.add("show");
}

async function registrarRecebimento() {
  const id = parseInt(document.getElementById("recebimentoReceitaId").value);
  const data = document.getElementById("recebimentoData").value;
  const valor = parseFloat(document.getElementById("recebimentoValor").value);
  const forma = document.getElementById("recebimentoForma").value;
  const obs = document.getElementById("recebimentoObs").value.trim() || null;

  if (!data || isNaN(valor) || valor <= 0 || !forma) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }

  const hojeStr = hoje();
  if (data > hojeStr) {
    mostrarToast(
      "Não é permitido registrar recebimento com data futura",
      "error",
    );
    return;
  }

  mostrarLoading();

  try {
    const { error } = await supabaseClient
      .from("outras_receitas")
      .update({
        status: "recebido",
        data_recebimento: data,
        forma: forma,
        valor_recebido: valor,
        observacoes_recebimento: obs,
      })
      .eq("id", id);

    if (error) throw error;

    mostrarToast("Recebimento registrado!", "success");
    fecharModal("modalRecebimento");
    await carregarDados();
    renderizarResumo();
    renderizarRankings();
    renderizarGraficos();
    renderizarTabela();

    const linha = document.querySelector(`#tabelaReceitas tr[data-id="${id}"]`);
    if (linha) {
      linha.classList.add("highlight-row");
      setTimeout(() => {
        linha.classList.remove("highlight-row");
      }, 2000);
    }
  } catch (error) {
    console.error("Erro ao registrar recebimento:", error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÕES DE DETALHES
// ============================================================
function verDetalhes(id) {
  const rec = estado.dados.receitas.find((r) => r.id === id);
  if (!rec) return;

  const categoriaNome =
    estado.dados.categoriaMap[rec.categoria_id] || "Sem categoria";

  const html = `
          <div class="detalhes-receita">
              <h3 class="detalhes-titulo">${escapeHtml(rec.descricao)}</h3>
              <div class="detalhes-grid">
                  <p><strong>Cliente:</strong> ${escapeHtml(rec.cliente || "-")}</p>
                  <p><strong>CPF/CNPJ:</strong> ${escapeHtml(rec.cpf_cnpj || "-")}</p>
                  <p><strong>Valor:</strong> ${fmtValor(rec.valor)}</p>
                  <p><strong>Emissão:</strong> ${fmtData(rec.data_emissao)}</p>
                  <p><strong>Vencimento:</strong> ${fmtData(rec.data_vencimento)}</p>
                  <p><strong>Categoria:</strong> ${escapeHtml(categoriaNome)}</p>
                  <p><strong>Observações:</strong> ${escapeHtml(rec.observacoes || "-")}</p>
              </div>
              ${
                rec.status === "recebido"
                  ? `
                  <hr class="detalhes-divider">
                  <div class="detalhes-grid">
                      <p><strong>Recebido em:</strong> ${fmtData(rec.data_recebimento)}</p>
                      <p><strong>Valor recebido:</strong> ${fmtValor(rec.valor_recebido || rec.valor)}</p>
                      <p><strong>Forma:</strong> ${escapeHtml(rec.forma || "-")}</p>
                      <p><strong>Observações recebimento:</strong> ${escapeHtml(rec.observacoes_recebimento || "-")}</p>
                  </div>
                  `
                  : ""
              }
          </div>
      `;
  document.getElementById("detalhesBody").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

// ============================================================
// FUNÇÕES DE EXCLUSÃO
// ============================================================
function confirmarExclusao(id) {
  const rec = estado.dados.receitas.find((r) => r.id === id);
  if (!rec) return;
  if (rec.status === "recebido") {
    mostrarToast("Receitas já recebidas não podem ser excluídas", "error");
    return;
  }
  document.getElementById("confirmarMensagem").textContent =
    `Tem certeza que deseja excluir a receita "${rec.descricao}"?`;
  document.getElementById("confirmarBotao").onclick = () => excluirReceita(id);
  document.getElementById("modalConfirmar").classList.add("show");
}

async function excluirReceita(id) {
  mostrarLoading();
  fecharModal("modalConfirmar");

  try {
    const { error } = await supabaseClient
      .from("outras_receitas")
      .delete()
      .eq("id", id);
    if (error) throw error;

    mostrarToast("Receita excluída!", "success");
    await carregarDados();
    renderizarResumo();
    renderizarRankings();
    renderizarGraficos();
    renderizarTabela();
  } catch (error) {
    console.error("Erro ao excluir receita:", error);
    mostrarToast("Erro: " + error.message, "error");
  } finally {
    esconderLoading();
  }
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
  const fileInput = document.getElementById("csvFile");
  const file = fileInput.files[0];
  if (!file) {
    mostrarToast("Selecione um arquivo CSV", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = async function (e) {
    const content = e.target.result;
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
      mostrarToast("Arquivo vazio", "error");
      return;
    }

    // Detecta cabeçalho (primeira linha contém "descrição" ou "descricao")
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes("descricao") || firstLine.includes("descrição")) {
      startIndex = 1;
    }

    const receitas = [];
    const errors = [];

    for (let i = startIndex; i < lines.length; i++) {
      const row = lines[i].split(",").map((cell) => cell.trim());
      if (row.length < 7) {
        errors.push(`Linha ${i + 1}: número de colunas insuficiente`);
        continue;
      }

      const [
        descricao,
        cliente,
        cpf_cnpj,
        valor,
        data_emissao,
        data_vencimento,
        categoria_id,
        observacoes,
      ] = row;

      if (!descricao || !valor || !data_vencimento || !categoria_id) {
        errors.push(
          `Linha ${i + 1}: campos obrigatórios faltando (descrição, valor, vencimento, categoria)`,
        );
        continue;
      }

      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        errors.push(`Linha ${i + 1}: valor inválido`);
        continue;
      }

      const categoriaExiste = estado.dados.categorias.some(
        (c) => c.id == categoria_id,
      );
      if (!categoriaExiste) {
        errors.push(
          `Linha ${i + 1}: categoria_id ${categoria_id} não encontrada`,
        );
        continue;
      }

      receitas.push({
        descricao,
        cliente: cliente || null,
        cpf_cnpj: cpf_cnpj || null,
        valor: valorNum,
        data_emissao: data_emissao || hoje(),
        data_vencimento,
        categoria_id: parseInt(categoria_id),
        observacoes: observacoes || null,
        status: "pendente",
      });
    }

    if (errors.length > 0) {
      mostrarToast(
        `Erros no CSV: ${errors.slice(0, 3).join(", ")}${errors.length > 3 ? "..." : ""}`,
        "error",
      );
      return;
    }

    if (receitas.length === 0) {
      mostrarToast("Nenhuma receita válida encontrada", "error");
      return;
    }

    if (confirm(`Deseja importar ${receitas.length} receitas?`)) {
      mostrarLoading();
      try {
        const { data, error } = await supabaseClient
          .from("outras_receitas")
          .insert(receitas);
        if (error) throw error;
        mostrarToast(
          `${receitas.length} receitas importadas com sucesso!`,
          "success",
        );
        fecharModal("modalImportarCSV");
        await carregarDados();
        renderizarResumo();
        renderizarRankings();
        renderizarGraficos();
        renderizarTabela();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao importar: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    }
  };
  reader.readAsText(file, "UTF-8");
}

// ============================================================
// RELATÓRIO POR CLIENTE
// ============================================================
function verRelatorioCliente(clienteNome) {
  const receitasCliente = estado.dados.receitas.filter(
    (r) => r.cliente === clienteNome,
  );
  if (receitasCliente.length === 0) return;

  let totalGeral = 0;
  let totalRecebido = 0;
  let totalPendente = 0;
  const linhas = receitasCliente
    .map((r) => {
      const valor = r.valor;
      totalGeral += valor;
      if (r.status === "recebido") totalRecebido += r.valor_recebido || valor;
      else totalPendente += valor;
      return `
      <tr>
        <td>${escapeHtml(r.descricao)}</td>
        <td>${fmtValor(valor)}</td>
        <td>${fmtData(r.data_vencimento)}</td>
        <td>${r.status === "recebido" ? fmtData(r.data_recebimento) : "-"}</td>
        <td><span class="status-badge ${r.status}">${r.status === "recebido" ? "Recebido" : "Pendente"}</span></td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <div style="margin-bottom: 1rem;">
      <p><strong>Total de receitas:</strong> ${receitasCliente.length}</p>
      <p><strong>Valor total:</strong> ${fmtValor(totalGeral)}</p>
      <p><strong>Total recebido:</strong> ${fmtValor(totalRecebido)}</p>
      <p><strong>Total pendente:</strong> ${fmtValor(totalPendente)}</p>
    </div>
    <div class="table-responsive">
      <table class="minimal-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Recebimento</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
  document.getElementById("relatorioClienteTitulo").textContent =
    `Relatório: ${clienteNome}`;
  document.getElementById("relatorioClienteBody").innerHTML = html;
  document.getElementById("modalRelatorioCliente").classList.add("show");
}

function exportarRelatorioCliente() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const titulo = document.getElementById("relatorioClienteTitulo").innerText;
  doc.setFontSize(16);
  doc.text(titulo, 14, 22);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  const tabela = document.querySelector(
    "#modalRelatorioCliente .minimal-table",
  );
  if (!tabela) return;
  const rows = tabela.querySelectorAll("tbody tr");
  const body = [];
  rows.forEach((tr) => {
    const cells = tr.querySelectorAll("td");
    if (cells.length) {
      body.push([
        cells[0].innerText,
        cells[1].innerText,
        cells[2].innerText,
        cells[3].innerText,
        cells[4].innerText,
      ]);
    }
  });
  doc.autoTable({
    startY: 40,
    head: [["Descrição", "Valor", "Vencimento", "Recebimento", "Status"]],
    body: body,
    theme: "striped",
  });
  doc.save(`relatorio_cliente_${Date.now()}.pdf`);
  mostrarToast("PDF gerado", "success");
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
let notificacoes = [];

async function carregarNotificacoes() {
  if (!estado.usuario) return;
  const { data, error } = await supabaseClient
    .from("notificacoes")
    .select("*")
    .eq("usuario_id", estado.usuario.id)
    .eq("lida", false)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  notificacoes = data || [];
  atualizarBadgeNotificacoes();
}

function atualizarBadgeNotificacoes() {
  let badge = document.getElementById("notificationBadge");
  if (!badge) {
    const userArea = document.querySelector(".user-area");
    const btn = document.createElement("button");
    btn.className = "btn-icon";
    btn.innerHTML =
      '<i class="fas fa-bell"></i><span id="notificationBadge" class="badge"></span>';
    btn.onclick = () => abrirListaNotificacoes();
    userArea.insertBefore(btn, userArea.querySelector(".btn-icon"));
    badge = document.getElementById("notificationBadge");
  }
  const count = notificacoes.length;
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent = count > 9 ? "9+" : count;
}

async function verificarVencidas() {
  const hojeStr = hoje();
  const vencidas = estado.dados.receitas.filter(
    (r) => r.status === "pendente" && r.data_vencimento < hojeStr,
  );
  if (vencidas.length === 0) return;

  const { data: existentes } = await supabaseClient
    .from("notificacoes")
    .select("mensagem")
    .eq("usuario_id", estado.usuario.id)
    .like("mensagem", "%vencida%");
  const mensagensExistentes = (existentes || []).map((e) => e.mensagem);

  const novas = [];
  for (const rec of vencidas) {
    const msg = `Receita "${rec.descricao}" (${fmtValor(rec.valor)}) está vencida desde ${fmtData(rec.data_vencimento)}.`;
    if (!mensagensExistentes.includes(msg)) {
      novas.push({
        usuario_id: estado.usuario.id,
        tipo: "alerta",
        mensagem: msg,
        link: `javascript:verDetalhes(${rec.id})`,
      });
    }
  }
  if (novas.length) {
    const { error } = await supabaseClient.from("notificacoes").insert(novas);
    if (!error) {
      notificacoes.push(...novas);
      atualizarBadgeNotificacoes();
    }
  }
}

function abrirListaNotificacoes() {
  const modal = document.createElement("div");
  modal.className = "modal show";
  modal.innerHTML = `
    <div class="modal-content small">
      <div class="modal-header">
        <h2 class="modal-title">Notificações</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
      </div>
      <div class="modal-body" id="listaNotificacoesBody">
        ${
          notificacoes.length
            ? notificacoes
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
                .join("")
            : "<p>Nenhuma notificação</p>"
        }
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal').remove()">Fechar</button>
        <button class="btn-primary" onclick="marcarTodasComoLidas()">Marcar todas como lidas</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function marcarComoLida(id, btn) {
  const { error } = await supabaseClient
    .from("notificacoes")
    .update({ lida: true })
    .eq("id", id);
  if (!error) {
    notificacoes = notificacoes.filter((n) => n.id !== id);
    const item = btn.closest(".notificacao-item");
    if (item) item.remove();
    if (notificacoes.length === 0) {
      document.getElementById("listaNotificacoesBody").innerHTML =
        "<p>Nenhuma notificação</p>";
    }
    atualizarBadgeNotificacoes();
  }
}

async function marcarTodasComoLidas() {
  const ids = notificacoes.map((n) => n.id);
  if (!ids.length) return;
  const { error } = await supabaseClient
    .from("notificacoes")
    .update({ lida: true })
    .in("id", ids);
  if (!error) {
    notificacoes = [];
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
  const linhas = document.querySelectorAll("#tabelaReceitas tr");
  linhas.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 0) return;
    const linha = [
      tds[0]?.innerText || "",
      tds[1]?.innerText || "",
      tds[2]?.innerText || "",
      tds[3]?.innerText || "",
      tds[4]?.innerText || "",
      tds[5]?.innerText || "",
      tds[6]?.innerText || "",
    ];
    dados.push(linha);
  });
  return dados;
}

function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Relatório de Receitas", 14, 22);
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
      [
        "Descrição",
        "Cliente",
        "Valor",
        "Vencimento",
        "Recebimento",
        "Status",
        "Categoria",
      ],
    ],
    body: dados,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [58, 107, 92] },
  });
  doc.save(`receitas_${new Date().toISOString().split("T")[0]}.pdf`);
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
    ["Relatório de Receitas"],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [
      `Filtros: ${estado.filtros.busca ? "Busca: " + estado.filtros.busca : ""} ${estado.filtros.status ? "Status: " + estado.filtros.status : ""} ${estado.filtros.categoria_id ? "Categoria: " + (estado.dados.categoriaMap[estado.filtros.categoria_id] || "") : ""}`,
    ],
    [],
    [
      "Descrição",
      "Cliente",
      "Valor",
      "Vencimento",
      "Recebimento",
      "Status",
      "Categoria",
    ],
    ...dados,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Receitas");
  XLSX.writeFile(wb, `receitas_${new Date().toISOString().split("T")[0]}.xlsx`);
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
  renderizarRankings();
  renderizarGraficos();
  renderizarTabela();
  await carregarNotificacoes();
  await verificarVencidas();
  esconderLoading();
});
