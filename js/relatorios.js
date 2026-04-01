// ============================================================
// CONFIGURAÇÃO SUPABASE
// ============================================================
const URL_SUPABASE = "https://mputdowrhzrvqslslubk.supabase.co";
const KEY_SUPABASE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(URL_SUPABASE, KEY_SUPABASE);

// ============================================================
// ESTADO GLOBAL
// ============================================================
const estado = {
  usuario: null,
  dados: {
    alunos: [],
    planos: [],
    aulas: [],
    mensalidades: [],
    parcelas: [],
    outrasReceitas: [],
    contasPagar: [],
    formasPagamento: [],
    categoriasReceitas: [],
    categoriasDespesas: [],
    eventos: [],
    metas: [],
  },
  periodo: {
    tipo: "esteMes",
    inicio: null,
    fim: null,
  },
  categoriaAtual: "dashboard",
  subcategoriaAtual: {
    dashboard: "principal",
    alunos: "geral",
    agenda: "ocupacao",
    financeiro: "receitas",
    performance: "crescimento",
  },
  graficos: {},
  cache: {
    dadosCarregados: false,
    categoriasDespesas: null,
  },
  favoritos: JSON.parse(localStorage.getItem("favoritos")) || [],
  benchmarkAtivo: false,
  cardsDashboardVisiveis: JSON.parse(
    localStorage.getItem("cardsDashboardVisiveis"),
  ) || ["totalAlunos", "aulasMes", "faturamento", "inadimplencia"],
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async function () {
  mostrarLoading();
  try {
    await verificarLogin();
    await carregarDadosBasicos();
    setPeriodo("esteMes", null);
    carregarInfoUsuario();
    atualizarEstrelaFavorito();
    atualizarListaFavoritos();
    verificarAlertas();
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  } finally {
    esconderLoading();
  }
});

// ============================================================
// FUNÇÕES DE UTILIDADE (MANTIDAS)
// ============================================================
function mostrarLoading() {
  document.getElementById("loadingOverlay").classList.add("show");
}

function esconderLoading() {
  document.getElementById("loadingOverlay").classList.remove("show");
}

function mostrarToast(mensagem, tipo = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  let icone = "fa-info-circle";
  if (tipo === "success") icone = "fa-check-circle";
  if (tipo === "error") icone = "fa-exclamation-circle";
  if (tipo === "warning") icone = "fa-exclamation-triangle";
  toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function fmtData(data) {
  if (!data) return "-";
  return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
}

function fmtValor(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

function fmtPercentual(valor) {
  return valor.toFixed(1) + "%";
}

function hoje() {
  return new Date().toISOString().split("T")[0];
}

function calcularDiasAtraso(vencimento) {
  const venc = new Date(vencimento + "T12:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.floor((hoje - venc) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function fazerLogout() {
  if (confirm("Deseja sair?")) {
    window.location.href = "index.html";
  }
}

// ============================================================
// AUTENTICAÇÃO (MANTIDA)
// ============================================================
async function verificarLogin() {
  try {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();
    if (error || !user) {
      const usuarioSalvo = localStorage.getItem("usuario");
      if (usuarioSalvo) {
        estado.usuario = JSON.parse(usuarioSalvo);
        return true;
      }
      window.location.href = "../index.html";
      return false;
    }
    const { data: usuarioData, error: usuarioError } = await supabaseClient
      .from("usuarios")
      .select("id, nome, email, role")
      .eq("id", user.id)
      .single();
    if (!usuarioError && usuarioData) {
      estado.usuario = usuarioData;
      localStorage.setItem("usuario", JSON.stringify(usuarioData));
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erro ao verificar login:", error);
    window.location.href = "../index.html";
    return false;
  }
}

function carregarInfoUsuario() {
  if (estado.usuario) {
    document.getElementById("userName").textContent =
      estado.usuario.nome || "Usuário";
    document.getElementById("userRole").textContent =
      estado.usuario.role === "admin"
        ? "Administrador"
        : estado.usuario.role === "financeiro"
          ? "Financeiro"
          : "Instrutor";
    const iniciais = (estado.usuario.nome || "U")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    document.getElementById("userAvatar").textContent = iniciais;
  }
}

// ============================================================
// CARREGAMENTO DE DADOS SOB DEMANDA (MANTIDO)
// ============================================================
async function carregarDadosBasicos() {
  try {
    const [alunos, aulas, parcelas, contas] = await Promise.all([
      supabaseClient.from("alunos").select("*").order("nome"),
      supabaseClient.from("aulas_agendadas").select("*"),
      supabaseClient.from("parcelas").select("*, mensalidades(alunos(*))"),
      supabaseClient.from("contas_pagar").select("*"),
    ]);
    if (!alunos.error) estado.dados.alunos = alunos.data || [];
    if (!aulas.error) estado.dados.aulas = aulas.data || [];
    if (!parcelas.error) estado.dados.parcelas = parcelas.data || [];
    if (!contas.error) estado.dados.contasPagar = contas.data || [];

    const { data: outras } = await supabaseClient
      .from("outras_receitas")
      .select("*");
    if (outras) estado.dados.outrasReceitas = outras;

    const { data: planos } = await supabaseClient
      .from("planos")
      .select("*")
      .eq("ativo", true);
    if (planos) estado.dados.planos = planos;

    await carregarCategoriasDespesas();
  } catch (error) {
    console.error("Erro ao carregar dados básicos:", error);
  }
}

async function carregarCategoriasDespesas() {
  try {
    const { data, error } = await supabaseClient
      .from("categorias_contas")
      .select("*")
      .eq("tipo", "despesa");
    if (!error && data && data.length > 0) {
      estado.dados.categoriasDespesas = data;
      estado.cache.categoriasDespesas = data;
    } else {
      estado.dados.categoriasDespesas = [];
      estado.cache.categoriasDespesas = [];
    }
  } catch (error) {
    estado.dados.categoriasDespesas = [];
  }
}

async function carregarMetas() {
  try {
    const { data, error } = await supabaseClient
      .from("metas")
      .select("*")
      .order("ano", { ascending: false })
      .order("mes", { ascending: false });
    if (!error && data) estado.dados.metas = data;
    else estado.dados.metas = [];
  } catch (error) {
    estado.dados.metas = [];
  }
}

// ============================================================
// FUNÇÃO DE PAGINAÇÃO (MANTIDA)
// ============================================================
window.mudarPagina = function (tableId, delta) {
  const container = document
    .querySelector(`[data-table-id="${tableId}"]`)
    .closest(".table-paginada");
  if (!container) return;
  let currentPage = parseInt(container.dataset.currentPage);
  const totalPages = parseInt(container.dataset.totalPages);
  const itemsPerPage = parseInt(container.dataset.itemsPerPage);
  const newPage = currentPage + delta;
  if (newPage < 1 || newPage > totalPages) return;

  if (!window._tabelasPaginadas) window._tabelasPaginadas = {};
  const dadosCompletos = window._tabelasPaginadas[tableId];
  if (!dadosCompletos) return;

  const start = (newPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageData = dadosCompletos.data.slice(start, end);

  const tbody = document.querySelector(`#${tableId} tbody`);
  if (tbody) {
    tbody.innerHTML = pageData
      .map((item) => dadosCompletos.rowRenderer(item))
      .join("");
  }

  container.dataset.currentPage = newPage;
  const infoSpan = container.querySelector(".pagination-info");
  if (infoSpan) {
    infoSpan.textContent = `Página ${newPage} de ${totalPages}`;
  }

  const prevBtn = container.querySelector(".pagination-btn:first-child");
  const nextBtn = container.querySelector(".pagination-btn:last-child");
  if (prevBtn) prevBtn.disabled = newPage === 1;
  if (nextBtn) nextBtn.disabled = newPage === totalPages;
};

function criarTabelaPaginada(data, headers, rowRenderer, itemsPerPage = 10) {
  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const tableId = "tabela_" + Math.random().toString(36).substring(2, 9);

  if (!window._tabelasPaginadas) window._tabelasPaginadas = {};
  window._tabelasPaginadas[tableId] = { data, rowRenderer };

  const html = `
          <div class="table-paginada" data-total-pages="${totalPages}" data-current-page="1" data-items-per-page="${itemsPerPage}" data-table-id="${tableId}">
              <div class="table-responsive">
                  <table id="${tableId}">
                      <thead>${headers
                        .map((h) => `<th>${h}</th>`)
                        .join("")}</thead>
                      <tbody>
                          ${data
                            .slice(0, itemsPerPage)
                            .map((item) => rowRenderer(item))
                            .join("")}
                      </tbody>
                   </table>
              </div>
              <div class="pagination-container">
                  <button class="pagination-btn" onclick="mudarPagina('${tableId}', -1)" ${
                    totalPages <= 1 ? "disabled" : ""
                  }>Anterior</button>
                  <span class="pagination-info">Página 1 de ${totalPages}</span>
                  <button class="pagination-btn" onclick="mudarPagina('${tableId}', 1)" ${
                    totalPages <= 1 ? "disabled" : ""
                  }>Próximo</button>
              </div>
          </div>
      `;
  return html;
}

// ============================================================
// PERÍODO (MANTIDO)
// ============================================================
function setPeriodo(tipo, botao) {
  if (botao) {
    document
      .querySelectorAll(".periodo-btn")
      .forEach((btn) => btn.classList.remove("active"));
    botao.classList.add("active");
  }

  const dateRange = document.getElementById("dateRange");
  const hoje = new Date();

  estado.periodo.tipo = tipo;

  if (tipo === "hoje") {
    estado.periodo.inicio = hoje.toISOString().split("T")[0];
    estado.periodo.fim = hoje.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "ontem") {
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    estado.periodo.inicio = ontem.toISOString().split("T")[0];
    estado.periodo.fim = ontem.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "ultimos7dias") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 7);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = hoje.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "ultimos30dias") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 30);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = hoje.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "esteMes") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "mesAnterior") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "esteAno") {
    const inicio = new Date(hoje.getFullYear(), 0, 1);
    const fim = new Date(hoje.getFullYear(), 11, 31);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
    dateRange.style.display = "none";
  } else if (tipo === "personalizado") {
    dateRange.style.display = "flex";
    document.getElementById("dataInicio").value = estado.periodo.inicio || "";
    document.getElementById("dataFim").value = estado.periodo.fim || "";
    return;
  }

  atualizarDisplayPeriodo();
  recarregarRelatorio();
}

function aplicarPeriodoPersonalizado() {
  const inicio = document.getElementById("dataInicio").value;
  const fim = document.getElementById("dataFim").value;
  if (!inicio || !fim) {
    mostrarToast("Selecione o período", "error");
    return;
  }
  if (inicio > fim) {
    mostrarToast("Data inicial não pode ser maior que a final", "error");
    return;
  }
  estado.periodo.inicio = inicio;
  estado.periodo.fim = fim;
  estado.periodo.tipo = "personalizado";
  atualizarDisplayPeriodo();
  recarregarRelatorio();
}

function atualizarDisplayPeriodo() {
  const display = document.getElementById("periodoDisplay");
  if (estado.periodo.inicio && estado.periodo.fim) {
    display.textContent = `Período: ${fmtData(
      estado.periodo.inicio,
    )} a ${fmtData(estado.periodo.fim)}`;
  }
}

// ============================================================
// NAVEGAÇÃO ENTRE CATEGORIAS (MANTIDO)
// ============================================================
function mudarCategoria(categoria) {
  estado.categoriaAtual = categoria;
  document
    .querySelectorAll(".tab-principal")
    .forEach((tab) => tab.classList.remove("active"));
  event.target.classList.add("active");
  if (window._tabelasPaginadas) window._tabelasPaginadas = {};
  recarregarRelatorio();
  atualizarEstrelaFavorito();
}

async function recarregarRelatorio() {
  destruirGraficos();
  switch (estado.categoriaAtual) {
    case "dashboard":
      break;
    case "alunos":
      break;
    case "agenda":
      break;
    case "financeiro":
      if (!estado.dados.outrasReceitas.length) await carregarOutrasReceitas();
      break;
    case "performance":
      await carregarMetas();
      break;
  }
  switch (estado.categoriaAtual) {
    case "dashboard":
      carregarDashboardExecutivo();
      break;
    case "alunos":
      carregarRelatorioAlunos();
      break;
    case "agenda":
      carregarRelatorioAgenda();
      break;
    case "financeiro":
      carregarRelatorioFinanceiro();
      break;
    case "performance":
      carregarRelatorioPerformance();
      break;
  }
  verificarAlertas();
}

async function carregarOutrasReceitas() {
  const { data } = await supabaseClient.from("outras_receitas").select("*");
  if (data) estado.dados.outrasReceitas = data;
}

function destruirGraficos() {
  Object.values(estado.graficos).forEach((g) => {
    if (g) g.destroy();
  });
  estado.graficos = {};
}

// ============================================================
// FAVORITOS (MANTIDO)
// ============================================================
function toggleFavorito() {
  const chave = `${estado.categoriaAtual}_${
    estado.subcategoriaAtual[estado.categoriaAtual]
  }`;
  const index = estado.favoritos.indexOf(chave);
  if (index === -1) {
    estado.favoritos.push(chave);
    mostrarToast("Relatório adicionado aos favoritos", "success");
  } else {
    estado.favoritos.splice(index, 1);
    mostrarToast("Relatório removido dos favoritos", "success");
  }
  localStorage.setItem("favoritos", JSON.stringify(estado.favoritos));
  atualizarEstrelaFavorito();
  atualizarListaFavoritos();
}

function atualizarEstrelaFavorito() {
  const chave = `${estado.categoriaAtual}_${
    estado.subcategoriaAtual[estado.categoriaAtual]
  }`;
  const estrela = document.getElementById("favoriteCurrent");
  if (estado.favoritos.includes(chave)) {
    estrela.classList.remove("far");
    estrela.classList.add("fas");
  } else {
    estrela.classList.remove("fas");
    estrela.classList.add("far");
  }
}

function atualizarListaFavoritos() {
  const dropdown = document.getElementById("favoritesDropdown");
  if (!dropdown) return;
  if (estado.favoritos.length === 0) {
    dropdown.innerHTML =
      '<div class="empty-favorites">Nenhum favorito ainda</div>';
    return;
  }
  const mapa = {
    dashboard_principal: "Dashboard Executivo",
    alunos_geral: "Alunos - Geral",
    alunos_aniversariantes: "Alunos - Aniversariantes",
    alunos_inativos: "Alunos - Inativos",
    alunos_indicacoes: "Alunos - Indicações",
    alunos_retencao: "Alunos - Retenção",
    alunos_antiguidade: "Alunos - Antiguidade",
    alunos_planos: "Alunos - Por Plano",
    agenda_ocupacao: "Agenda - Ocupação",
    agenda_presencas: "Agenda - Presenças",
    agenda_horarios: "Agenda - Horários Pico",
    agenda_horarios_lucrativos: "Agenda - Horários Mais Lucrativos",
    financeiro_receitas: "Financeiro - Receitas",
    financeiro_despesas: "Financeiro - Despesas",
    financeiro_inadimplencia: "Financeiro - Inadimplência",
    financeiro_fluxo: "Financeiro - Fluxo de Caixa",
    financeiro_fluxo_detalhado: "Financeiro - Fluxo de Caixa Detalhado",
    financeiro_comparacao_anual: "Financeiro - Comparação Ano a Ano",
    financeiro_dre: "Financeiro - DRE",
    performance_crescimento: "Performance - Crescimento",
    performance_metas: "Performance - Metas",
    performance_forecast: "Performance - Previsão",
    performance_retencao_cohort: "Performance - Retenção (Cohort)",
    performance_cancelamentos: "Performance - Cancelamentos",
    performance_previsao_renovacao: "Performance - Previsão de Renovação",
  };
  const html = estado.favoritos
    .map((chave) => {
      const nome = mapa[chave] || chave;
      return `<a href="#" onclick="navegarParaFavorito('${chave}'); return false;">${nome}</a>`;
    })
    .join("");
  dropdown.innerHTML = html;
}

function navegarParaFavorito(chave) {
  const [categoria, sub] = chave.split("_");
  document.querySelectorAll(".tab-principal").forEach((tab) => {
    if (tab.textContent.toLowerCase().includes(categoria)) {
      tab.click();
    }
  });
  setTimeout(() => {
    document.querySelectorAll(".sub-tab").forEach((tab) => {
      if (tab.textContent.toLowerCase().includes(sub)) {
        tab.click();
      }
    });
  }, 400);
}

// ============================================================
// ALERTAS INTELIGENTES (MANTIDO)
// ============================================================
function verificarAlertas() {
  const alertas = [];
  const inadimplencia = calcularInadimplencia();
  if (inadimplencia.total > 500) {
    alertas.push({
      titulo: "Inadimplência elevada",
      mensagem: `Total de ${fmtValor(inadimplencia.total)} com ${
        inadimplencia.alunos
      } alunos.`,
    });
  }
  const fatMes = calcularFaturamentoPeriodo(
    estado.periodo.inicio,
    estado.periodo.fim,
  );
  const meta = 15000;
  if (fatMes < meta * 0.8) {
    alertas.push({
      titulo: "Faturamento abaixo da meta",
      mensagem: `Faturamento atual: ${fmtValor(fatMes)} (meta: ${fmtValor(
        meta,
      )})`,
    });
  }
  if (alertas.length > 0) {
    const banner = document.getElementById("alertBanner");
    document.getElementById("alertTitle").textContent = alertas[0].titulo;
    document.getElementById("alertMessage").textContent = alertas[0].mensagem;
    banner.style.display = "flex";
  } else {
    document.getElementById("alertBanner").style.display = "none";
  }
}

function fecharAlerta() {
  document.getElementById("alertBanner").style.display = "none";
}

// ============================================================
// MODAL (MANTIDO)
// ============================================================
function abrirModal(titulo, conteudo, aluno = null) {
  let html = `<h2>${titulo}</h2>`;
  if (aluno && aluno.foto_url) {
    html += `<div style="text-align:center; margin:1rem 0;"><img src="${aluno.foto_url}" alt="foto" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--verde-principal);"></div>`;
  } else if (aluno) {
    html += `<div style="text-align:center; margin:1rem 0;"><div style="width:80px;height:80px;border-radius:50%;background:var(--verde-pastel);display:flex;align-items:center;justify-content:center;margin:0 auto;"><i class="fas fa-user fa-3x" style="color:var(--verde-principal);"></i></div></div>`;
  }
  html += `<div style="background:var(--off-white); padding:1rem; border-radius:8px;">${conteudo}</div>`;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

function fecharModal() {
  document.getElementById("modalDetalhes").classList.remove("show");
}

// ============================================================
// COMPARAÇÃO COM PERÍODO ANTERIOR (MANTIDO)
// ============================================================
function calcularVariacao(valorAtual, valorAnterior) {
  if (valorAnterior === 0) return { valor: 0, texto: "0%", classe: "" };
  const variacao = (
    ((valorAtual - valorAnterior) / valorAnterior) *
    100
  ).toFixed(1);
  return {
    valor: variacao,
    texto: `${Math.abs(variacao)}%`,
    classe: variacao >= 0 ? "trend-up" : "trend-down",
    icone: variacao >= 0 ? "fa-arrow-up" : "fa-arrow-down",
  };
}

function obterPeriodoAnterior(periodo) {
  const inicio = new Date(periodo.inicio + "T12:00:00");
  const fim = new Date(periodo.fim + "T12:00:00");
  const diff = fim - inicio;
  const anteriorInicio = new Date(inicio.getTime() - diff - 86400000);
  const anteriorFim = new Date(inicio.getTime() - 86400000);
  return {
    inicio: anteriorInicio.toISOString().split("T")[0],
    fim: anteriorFim.toISOString().split("T")[0],
  };
}

// ============================================================
// DASHBOARD EXECUTIVO (MANTIDO)
// ============================================================
function carregarDashboardExecutivo() {
  const cardsVisiveis = estado.cardsDashboardVisiveis;
  const indicadores = calcularIndicadoresPrincipais();
  const periodoAnterior = obterPeriodoAnterior(estado.periodo);
  const indicadoresAnteriores = calcularIndicadoresPeriodo(
    periodoAnterior.inicio,
    periodoAnterior.fim,
  );
  const variacaoAlunos = calcularVariacao(
    indicadores.totalAlunos,
    indicadoresAnteriores.totalAlunos,
  );
  const variacaoFaturamento = calcularVariacao(
    indicadores.faturamentoMes,
    indicadoresAnteriores.faturamentoMes,
  );

  let cardsHtml = "";
  if (cardsVisiveis.includes("totalAlunos")) {
    cardsHtml += `
      <div class="stat-card" data-tooltip="Total de alunos ativos no período">
        <div class="stat-icon"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <div class="stat-value">${indicadores.totalAlunos}</div>
          <div class="stat-label">Total de Alunos</div>
          <div class="stat-trend ${variacaoAlunos.classe}">
            <i class="fas ${variacaoAlunos.icone}"></i> ${
              variacaoAlunos.texto
            } vs período anterior
          </div>
        </div>
      </div>`;
  }
  if (cardsVisiveis.includes("aulasMes")) {
    cardsHtml += `
      <div class="stat-card" data-tooltip="Aulas realizadas no mês">
        <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
        <div class="stat-info">
          <div class="stat-value">${indicadores.aulasMes}</div>
          <div class="stat-label">Aulas no Mês</div>
          <div class="stat-trend">${indicadores.aulasHoje} hoje</div>
        </div>
      </div>`;
  }
  if (cardsVisiveis.includes("faturamento")) {
    cardsHtml += `
      <div class="stat-card" data-tooltip="Faturamento do período">
        <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
        <div class="stat-info">
          <div class="stat-value">${fmtValor(indicadores.faturamentoMes)}</div>
          <div class="stat-label">Faturamento do Período</div>
          <div class="stat-trend ${variacaoFaturamento.classe}">
            <i class="fas ${variacaoFaturamento.icone}"></i> ${
              variacaoFaturamento.texto
            } vs anterior
          </div>
        </div>
      </div>`;
  }
  if (cardsVisiveis.includes("inadimplencia")) {
    cardsHtml += `
      <div class="stat-card ${
        indicadores.inadimplencia > 1000 ? "red" : "orange"
      }" data-tooltip="Total em atraso">
        <div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-info">
          <div class="stat-value">${fmtValor(indicadores.inadimplencia)}</div>
          <div class="stat-label">Inadimplência</div>
          <div class="stat-trend">${indicadores.inadimplentes} alunos</div>
        </div>
      </div>`;
  }

  const html = `
          <div>
              <div class="stats-grid">${cardsHtml}</div>

              <div class="charts-grid">
                  <div class="chart-card">
                      <div class="chart-header">
                          <div class="chart-title"><i class="fas fa-chart-line" style="color:var(--verde-principal)"></i> Fluxo de Caixa (30 dias)</div>
                          <button class="btn-outline" style="padding:0.2rem 0.5rem;" onclick="exportarGraficoComoImagem('graficoFluxo')">Salvar imagem</button>
                      </div>
                      <div class="chart-container"><canvas id="graficoFluxo"></canvas></div>
                  </div>
                  
                  <div class="chart-card">
                      <div class="chart-header">
                          <div class="chart-title"><i class="fas fa-chart-pie" style="color:var(--verde-principal)"></i> Status dos Alunos</div>
                          <button class="btn-outline" style="padding:0.2rem 0.5rem;" onclick="exportarGraficoComoImagem('graficoStatusAlunos')">Salvar imagem</button>
                      </div>
                      <div class="chart-container"><canvas id="graficoStatusAlunos"></canvas></div>
                  </div>
              </div>

              <div class="report-container">
                  <div class="report-header">
                      <div class="report-title">📅 Aulas de Hoje</div>
                      <button class="btn-outline" onclick="mudarCategoria('agenda'); setTimeout(() => mostrarSubRelatorioAgenda('ocupacao', null), 100)">Ver todas <i class="fas fa-arrow-right"></i></button>
                  </div>
                  <div class="table-responsive">
                      <table>
                          <thead> <th>Horário</th><th>Aluno</th><th>Status</th> </thead>
                          <tbody>${gerarTabelaAulasHoje()}</tbody>
                      </table>
                  </div>
              </div>

              <div class="report-container">
                  <div class="report-header">
                      <div class="report-title">🎉 Aniversariantes do Mês</div>
                      <button class="btn-outline" onclick="mudarCategoria('alunos'); setTimeout(() => mostrarSubRelatorioAlunos('aniversariantes', null), 100)">Ver todos <i class="fas fa-arrow-right"></i></button>
                  </div>
                  <div class="table-responsive">
                      <table>
                          <thead> <th>Aluno</th><th>Data</th><th>Idade</th> </thead>
                          <tbody>${gerarTabelaAniversariantes()}</tbody>
                      </table>
                  </div>
              </div>
          </div>
      `;

  document.getElementById("conteudoRelatorios").innerHTML = html;
  setTimeout(() => {
    inicializarGraficosDashboard();
  }, 100);
}

function calcularIndicadoresPrincipais() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const hojeStr = hoje.toISOString().split("T")[0];
  const totalAlunos = estado.dados.alunos.length;
  const novosAlunos = estado.dados.alunos.filter((a) => {
    if (!a.data_inicio) return false;
    const [ano, mes] = a.data_inicio.split("-");
    return parseInt(mes) === mesAtual && parseInt(ano) === anoAtual;
  }).length;
  const aulasMes = estado.dados.aulas.filter((a) => {
    const [ano, mes] = a.data?.split("-") || [];
    return parseInt(mes) === mesAtual && parseInt(ano) === anoAtual;
  }).length;
  const aulasHoje = estado.dados.aulas.filter((a) => a.data === hojeStr).length;
  const faturamentoMes = calcularFaturamentoPeriodo(
    estado.periodo.inicio,
    estado.periodo.fim,
  );
  const ticketMedio = calcularTicketMedioPeriodo(
    estado.periodo.inicio,
    estado.periodo.fim,
  );
  const inadimplencia = calcularInadimplencia();
  return {
    totalAlunos,
    novosAlunos,
    aulasMes,
    aulasHoje,
    faturamentoMes,
    ticketMedio,
    inadimplencia: inadimplencia.total,
    inadimplentes: inadimplencia.alunos,
  };
}

function calcularIndicadoresPeriodo(inicio, fim) {
  const totalAlunos = estado.dados.alunos.filter(
    (a) => a.data_inicio && a.data_inicio >= inicio && a.data_inicio <= fim,
  ).length;
  const faturamentoMes = calcularFaturamentoPeriodo(inicio, fim);
  return { totalAlunos, faturamentoMes };
}

function calcularFaturamentoPeriodo(inicio, fim) {
  let total = 0;
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    )
      total += p.valor;
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    )
      total += r.valor;
  });
  return total;
}

function calcularTicketMedioPeriodo(inicio, fim) {
  let total = 0,
    qtd = 0;
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      total += p.valor;
      qtd++;
    }
  });
  return qtd > 0 ? total / qtd : 0;
}

function calcularInadimplencia() {
  let total = 0;
  const alunosSet = new Set();
  estado.dados.parcelas.forEach((p) => {
    if (p.status === "atrasado") {
      total += p.valor;
      alunosSet.add(p.alunoId);
    }
  });
  return { total, alunos: alunosSet.size };
}

function gerarTabelaAulasHoje() {
  const hoje = new Date().toISOString().split("T")[0];
  const aulasHoje = estado.dados.aulas.filter((a) => a.data === hoje);
  if (aulasHoje.length === 0)
    return '<tr><td colspan="3" style="text-align:center; padding:2rem;">Nenhuma aula hoje</td></tr>';
  return aulasHoje
    .sort((a, b) => a.horario.localeCompare(b.horario))
    .map((a) => {
      const aluno = estado.dados.alunos.find((al) => al.id === a.alunoId);
      return `<tr onclick="abrirModal('Detalhes da Aula', '<p>Aluno: ${a.alunoNome}</p><p>Horário: ${a.horario}</p><p>Status: ${a.presenca || "Pendente"}</p>', aluno)">
                   <td>${a.horario}</td>
                   <td>${a.alunoNome}</td>
                   <td><span class="status-badge ${a.presenca || "pendente"}">${a.presenca || "Pendente"}</span></td>
               </tr>`;
    })
    .join("");
}

function gerarTabelaAniversariantes() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const aniversariantes = estado.dados.alunos
    .filter((a) => {
      if (!a.nascimento) return false;
      const mes = parseInt(a.nascimento.split("-")[1]);
      return mes === mesAtual;
    })
    .sort(
      (a, b) =>
        parseInt(a.nascimento.split("-")[2]) -
        parseInt(b.nascimento.split("-")[2]),
    )
    .slice(0, 5);
  if (aniversariantes.length === 0)
    return '<tr><td colspan="3" style="text-align:center; padding:2rem;">Nenhum aniversariante este mês</td></tr>';
  return aniversariantes
    .map((a) => {
      const idade =
        new Date().getFullYear() - new Date(a.nascimento).getFullYear();
      return `<tr class="destaque-aniversario" onclick="abrirModal('Detalhes do Aluno', '<p>Nome: ${a.nome}</p><p>Telefone: ${a.telefone}</p><p>Plano: ${a.plano}</p>', a)">
                   <td>${a.nome}</td>
                   <td>${fmtData(a.nascimento)}</td>
                   <td>${idade} anos</td>
               </tr>`;
    })
    .join("");
}

function inicializarGraficosDashboard() {
  const ctxFluxo = document.getElementById("graficoFluxo")?.getContext("2d");
  if (ctxFluxo) {
    const dados = gerarDadosFluxo30Dias();
    estado.graficos.fluxo = new Chart(ctxFluxo, {
      type: "line",
      data: {
        labels: dados.labels,
        datasets: [
          {
            label: "Receitas",
            data: dados.receitas,
            borderColor: "#27AE60",
            backgroundColor: "rgba(39,174,96,.1)",
            tension: 0.4,
            fill: true,
          },
          {
            label: "Despesas",
            data: dados.despesas,
            borderColor: "#E74C3C",
            backgroundColor: "rgba(231,76,60,.1)",
            tension: 0.4,
            fill: true,
          },
          ...(estado.benchmarkAtivo
            ? [
                {
                  label: "Média do setor (receitas)",
                  data: dados.receitas.map(() => 200),
                  borderColor: "#F39C12",
                  borderDash: [5, 5],
                  fill: false,
                  pointRadius: 0,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => fmtValor(ctx.raw) } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => fmtValor(v) },
          },
        },
      },
    });
  }
  const ctxStatus = document
    .getElementById("graficoStatusAlunos")
    ?.getContext("2d");
  if (ctxStatus) {
    const ativos = estado.dados.alunos.filter(
      (a) => a.status === "ativo",
    ).length;
    const inativos = estado.dados.alunos.filter(
      (a) => a.status === "inativo",
    ).length;
    estado.graficos.statusAlunos = new Chart(ctxStatus, {
      type: "doughnut",
      data: {
        labels: ["Ativos", "Inativos"],
        datasets: [
          {
            data: [ativos, inativos],
            backgroundColor: ["#27AE60", "#95A5A6"],
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

function gerarDadosFluxo30Dias() {
  const hoje = new Date();
  const labels = [],
    receitas = [],
    despesas = [];
  for (let i = 29; i >= 0; i--) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() - i);
    const dataStr = data.toISOString().split("T")[0];
    labels.push(`${data.getDate()}/${data.getMonth() + 1}`);
    let receita = 0,
      despesa = 0;
    estado.dados.parcelas.forEach((p) => {
      if (p.status === "pago" && p.data_pagamento === dataStr)
        receita += p.valor;
    });
    estado.dados.outrasReceitas.forEach((r) => {
      if (r.status === "recebido" && r.data_recebimento === dataStr)
        receita += r.valor;
    });
    estado.dados.contasPagar.forEach((c) => {
      if (c.status === "pago" && c.data_pagamento === dataStr)
        despesa += c.valor;
    });
    receitas.push(receita);
    despesas.push(despesa);
  }
  return { labels, receitas, despesas };
}

// ============================================================
// RELATÓRIO DE ALUNOS (MANTIDO)
// ============================================================
function carregarRelatorioAlunos() {
  const subTabs = gerarSubTabs("alunos", [
    { id: "geral", icone: "fa-list", label: "Geral" },
    {
      id: "aniversariantes",
      icone: "fa-birthday-cake",
      label: "Aniversariantes",
    },
    { id: "inativos", icone: "fa-user-slash", label: "Inativos" },
    { id: "indicacoes", icone: "fa-star", label: "Indicações" },
    { id: "retencao", icone: "fa-chart-line", label: "Retenção" },
    {
      id: "antiguidade",
      icone: "fa-hourglass-half",
      label: "Antiguidade",
    },
    { id: "planos", icone: "fa-box", label: "Por Plano" },
  ]);
  const html = `<div>${subTabs}<div id="subConteudoAlunos">${gerarRelatorioAlunosPorSub(
    estado.subcategoriaAtual.alunos,
  )}</div></div>`;
  document.getElementById("conteudoRelatorios").innerHTML = html;
}

function gerarSubTabs(categoria, itens) {
  return `<div class="sub-tabs">${itens
    .map(
      (item) =>
        `<button class="sub-tab ${
          estado.subcategoriaAtual[categoria] === item.id ? "active" : ""
        }" onclick="mostrarSubRelatorio('${categoria}', '${
          item.id
        }', this)"><i class="fas ${item.icone}"></i> ${item.label}</button>`,
    )
    .join("")}</div>`;
}

function mostrarSubRelatorio(categoria, subId, btn) {
  if (btn) {
    document
      .querySelectorAll(`#conteudoRelatorios .sub-tab`)
      .forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
  }
  estado.subcategoriaAtual[categoria] = subId;
  atualizarEstrelaFavorito();
  atualizarListaFavoritos();
  let conteudo = "";
  switch (categoria) {
    case "alunos":
      conteudo = gerarRelatorioAlunosPorSub(subId);
      break;
    case "agenda":
      conteudo = gerarRelatorioAgendaPorSub(subId);
      break;
    case "financeiro":
      conteudo = gerarRelatorioFinanceiroPorSub(subId);
      break;
    case "performance":
      conteudo = gerarRelatorioPerformancePorSub(subId);
      break;
  }
  document.getElementById(
    `subConteudo${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`,
  ).innerHTML = conteudo;
}

function gerarRelatorioAlunosPorSub(subId) {
  switch (subId) {
    case "geral":
      return gerarRelatorioAlunosGeral();
    case "aniversariantes":
      return gerarRelatorioAniversariantes();
    case "inativos":
      return gerarRelatorioAlunosInativos();
    case "indicacoes":
      return gerarRelatorioIndicacoes();
    case "retencao":
      return gerarRelatorioRetencao();
    case "antiguidade":
      return gerarRelatorioAntiguidade();
    case "planos":
      return gerarRelatorioAlunosPorPlano();
    default:
      return gerarRelatorioAlunosGeral();
  }
}

function gerarRelatorioAlunosGeral() {
  const alunos = estado.dados.alunos;
  const totalAtivos = alunos.filter((a) => a.status === "ativo").length;
  const totalInativos = alunos.filter((a) => a.status === "inativo").length;
  const planos = [...new Set(alunos.map((a) => a.plano).filter(Boolean))];
  const filtroPlano = `<select class="filter-select" onchange="filtrarAlunosPorPlano(this.value)"><option value="">Todos os planos</option>${planos
    .map((p) => `<option value="${p}">${p}</option>`)
    .join("")}</select>`;

  const headers = [
    "Foto",
    "Nome",
    "CPF",
    "Telefone",
    "Plano",
    "Início",
    "Status",
  ];
  const rowRenderer = (a) => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const isAniversariante =
      a.nascimento && parseInt(a.nascimento.split("-")[1]) === mesAtual;
    const classe = isAniversariante ? "destaque-aniversario" : "";
    return `<tr class="${classe}" onclick="abrirModal('Detalhes do Aluno', '<p>Nome: ${
      a.nome
    }</p><p>Email: ${a.email}</p><p>Plano: ${a.plano}</p>', a)">
                    <td><div class="foto-aluno"><img src="${
                      a.foto_url || "https://via.placeholder.com/32"
                    }" alt="foto" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div></td>
                    <td><strong>${a.nome}</strong></td>
                    <td>${a.cpf || "-"}</td>
                    <td>${a.telefone || "-"}</td>
                    <td>${a.plano}</td>
                    <td>${fmtData(a.data_inicio)}</td>
                    <td><span class="status-badge ${a.status}">${
                      a.status
                    }</span></td>
                </tr>`;
  };

  const tabelaHtml = alunos.length
    ? criarTabelaPaginada(alunos, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum aluno cadastrado.</p>';

  return `
          <div class="report-container">
              <div class="report-header">
                  <div class="report-title">📋 Relatório Geral de Alunos</div>
                  <div class="filter-group">${filtroPlano}</div>
                  <div class="report-actions"><button class="btn-outline" onclick="exportarTodosAlunos()"><i class="fas fa-file-csv"></i> Exportar todos</button></div>
              </div>
              <div class="report-summary">
                  <div class="summary-item"><div class="summary-value">${alunos.length}</div><div class="summary-label">Total</div></div>
                  <div class="summary-item"><div class="summary-value">${totalAtivos}</div><div class="summary-label">Ativos</div></div>
                  <div class="summary-item"><div class="summary-value">${totalInativos}</div><div class="summary-label">Inativos</div></div>
              </div>
              ${tabelaHtml}
          </div>
      `;
}

function filtrarAlunosPorPlano(plano) {
  const alunosFiltrados = plano
    ? estado.dados.alunos.filter((a) => a.plano === plano)
    : estado.dados.alunos;
  const container = document.querySelector(
    "#subConteudoAlunos .report-container",
  );
  if (container) {
    const headers = [
      "Foto",
      "Nome",
      "CPF",
      "Telefone",
      "Plano",
      "Início",
      "Status",
    ];
    const rowRenderer = (a) => {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const isAniversariante =
        a.nascimento && parseInt(a.nascimento.split("-")[1]) === mesAtual;
      const classe = isAniversariante ? "destaque-aniversario" : "";
      return `<tr class="${classe}" onclick="abrirModal('Detalhes do Aluno', '<p>Nome: ${
        a.nome
      }</p><p>Email: ${a.email}</p><p>Plano: ${a.plano}</p>', a)">
                         <td><div class="foto-aluno"><img src="${
                           a.foto_url || "https://via.placeholder.com/32"
                         }" alt="foto" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div></td>
                         <td><strong>${a.nome}</strong></td>
                         <td>${a.cpf || "-"}</td>
                         <td>${a.telefone || "-"}</td>
                         <td>${a.plano}</td>
                         <td>${fmtData(a.data_inicio)}</td>
                         <td><span class="status-badge ${a.status}">${
                           a.status
                         }</span></td>
                     </tr>`;
    };
    const novaTabela = alunosFiltrados.length
      ? criarTabelaPaginada(alunosFiltrados, headers, rowRenderer, 10)
      : '<p class="empty-state">Nenhum aluno encontrado.</p>';
    const summary = container.querySelector(".report-summary");
    summary.insertAdjacentHTML("afterend", novaTabela);
    const tabelaAntiga = container.querySelector(".table-paginada");
    if (tabelaAntiga) tabelaAntiga.remove();
  }
}

function exportarTodosAlunos() {
  const dados = {
    headers: ["Nome", "CPF", "Telefone", "Plano", "Início", "Status"],
    dados: estado.dados.alunos.map((a) => [
      a.nome,
      a.cpf || "-",
      a.telefone || "-",
      a.plano,
      fmtData(a.data_inicio),
      a.status,
    ]),
  };
  exportarCSV(dados, "alunos_geral_completo");
}

function gerarRelatorioAniversariantes() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const aniversariantes = estado.dados.alunos
    .filter((a) => {
      if (!a.nascimento) return false;
      const mes = parseInt(a.nascimento.split("-")[1]);
      return mes === mesAtual;
    })
    .sort(
      (a, b) =>
        parseInt(a.nascimento.split("-")[2]) -
        parseInt(b.nascimento.split("-")[2]),
    );

  const headers = ["Foto", "Nome", "Data", "Idade", "Telefone"];
  const rowRenderer = (a) => {
    const idade =
      new Date().getFullYear() - new Date(a.nascimento).getFullYear();
    return `<tr class="destaque-aniversario" onclick="abrirModal('Detalhes do Aluno', '<p>Nome: ${
      a.nome
    }</p><p>Telefone: ${a.telefone}</p><p>Plano: ${a.plano}</p>', a)">
                     <td><div class="foto-aluno"><img src="${
                       a.foto_url || "https://via.placeholder.com/32"
                     }" alt="foto" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div></td>
                     <td><strong>${a.nome}</strong></td>
                     <td>${fmtData(a.nascimento)}</td>
                     <td>${idade} anos</td>
                     <td>${a.telefone || "-"}</td>
                 </tr>`;
  };
  const tabelaHtml = aniversariantes.length
    ? criarTabelaPaginada(aniversariantes, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum aniversariante este mês.</p>';

  return `
          <div class="report-container">
              <div class="report-header"><div class="report-title">🎂 Aniversariantes do Mês</div></div>
              <div class="report-summary"><div class="summary-item"><div class="summary-value">${aniversariantes.length}</div><div class="summary-label">Aniversariantes</div></div></div>
              ${tabelaHtml}
          </div>
      `;
}

function gerarRelatorioAlunosInativos() {
  const diasInativo = 30;
  const hoje = new Date();
  const inativos = estado.dados.alunos.filter((a) => {
    if (a.status === "inativo") return true;
    const ultimaAula = estado.dados.aulas
      .filter((aula) => aula.alunoId === a.id)
      .sort((x, y) => new Date(y.data) - new Date(x.data))[0];
    if (!ultimaAula) return false;
    const dias = Math.floor(
      (hoje - new Date(ultimaAula.data)) / (1000 * 60 * 60 * 24),
    );
    return dias > diasInativo;
  });

  const headers = ["Foto", "Nome", "Última Aula", "Dias", "Telefone"];
  const rowRenderer = (a) => {
    const ultimaAula = estado.dados.aulas
      .filter((aula) => aula.alunoId === a.id)
      .sort((x, y) => new Date(y.data) - new Date(x.data))[0];
    const dias = ultimaAula
      ? Math.floor((hoje - new Date(ultimaAula.data)) / (1000 * 60 * 60 * 24))
      : "N/A";
    return `<tr class="destaque-atencao" onclick="abrirModal('Detalhes do Aluno', '<p>Nome: ${
      a.nome
    }</p><p>Telefone: ${a.telefone}</p><p>Última aula: ${
      ultimaAula ? fmtData(ultimaAula.data) : "Nunca"
    }</p>', a)">
                     <td><div class="foto-aluno"><img src="${
                       a.foto_url || "https://via.placeholder.com/32"
                     }" alt="foto" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></div></td>
                     <td><strong>${a.nome}</strong></td>
                     <td>${ultimaAula ? fmtData(ultimaAula.data) : "Nunca"}</td>
                     <td><span class="badge orange">${dias}</span></td>
                     <td>${a.telefone || "-"}</td>
                 </tr>`;
  };
  const tabelaHtml = inativos.length
    ? criarTabelaPaginada(inativos, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum aluno inativo.</p>';

  return `
          <div class="report-container">
              <div class="report-header"><div class="report-title">🚫 Alunos Inativos (mais de ${diasInativo} dias)</div></div>
              <div class="report-summary"><div class="summary-item"><div class="summary-value">${inativos.length}</div><div class="summary-label">Alunos inativos</div></div></div>
              ${tabelaHtml}
          </div>
      `;
}

function gerarRelatorioIndicacoes() {
  const indicacoes = {};
  estado.dados.alunos.forEach((a) => {
    const origem = a.indicacao || "Não informado";
    indicacoes[origem] = (indicacoes[origem] || 0) + 1;
  });
  const total = Object.values(indicacoes).reduce((a, b) => a + b, 0);
  setTimeout(() => {
    const ctx = document.getElementById("graficoIndicacoes")?.getContext("2d");
    if (ctx && Object.keys(indicacoes).length > 0) {
      estado.graficos.indicacoes = new Chart(ctx, {
        type: "pie",
        data: {
          labels: Object.keys(indicacoes),
          datasets: [
            {
              data: Object.values(indicacoes),
              backgroundColor: [
                "#3A6B5C",
                "#3498DB",
                "#9B59B6",
                "#F39C12",
                "#E74C3C",
              ],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }
  }, 100);
  return `<div class="report-container"><div class="report-header"><div class="report-title">📢 Como os alunos conhecem o estúdio</div></div><div class="charts-grid" style="grid-template-columns: 1fr 1fr;"><div class="chart-card"><div class="chart-header"><div class="chart-title">Distribuição por Origem</div></div><div class="chart-container"><canvas id="graficoIndicacoes"></canvas></div></div><div class="table-responsive"><table><thead><th>Origem</th><th>Quantidade</th><th>Percentual</th></thead><tbody>${Object.entries(
    indicacoes,
  )
    .map(([origem, qtd]) => {
      const perc = ((qtd / total) * 100).toFixed(1);
      return `<tr><td><strong>${origem}</strong></td><td>${qtd}</td><td>${perc}%</td></tr>`;
    })
    .join("")}</tbody></table></div></div></div>`;
}

function gerarRelatorioRetencao() {
  const hoje = new Date();
  const meses = 12;
  const dados = [];
  for (let i = 0; i < meses; i++) {
    const mes = hoje.getMonth() - i;
    const ano = hoje.getFullYear() - (mes < 0 ? 1 : 0);
    const mesAjustado = mes < 0 ? mes + 12 : mes;
    const alunosEntraram = estado.dados.alunos.filter((a) => {
      if (!a.data_inicio) return false;
      const [anoData, mesData] = a.data_inicio.split("-").map(Number);
      return mesData === mesAjustado + 1 && anoData === ano;
    }).length;
    dados.push({
      mes: `${mesAjustado + 1}/${ano}`,
      entradas: alunosEntraram,
    });
  }
  dados.reverse();
  return `<div class="report-container"><div class="report-header"><div class="report-title">📊 Novos Alunos por Mês</div></div><div class="table-responsive"><table><thead><th>Mês</th><th>Novos Alunos</th></thead><tbody>${dados
    .map(
      (d) =>
        `<tr><td><strong>${d.mes}</strong></td><td>${d.entradas}</td></tr>`,
    )
    .join("")}</tbody></table></div></div>`;
}

function gerarRelatorioAntiguidade() {
  const hoje = new Date();
  const categorias = {
    "< 3 meses": 0,
    "3-6 meses": 0,
    "6-12 meses": 0,
    "1-2 anos": 0,
    "> 2 anos": 0,
  };
  estado.dados.alunos.forEach((a) => {
    if (!a.data_inicio) return;
    const data = new Date(a.data_inicio);
    const meses =
      (hoje.getFullYear() - data.getFullYear()) * 12 +
      (hoje.getMonth() - data.getMonth());
    if (meses < 3) categorias["< 3 meses"]++;
    else if (meses < 6) categorias["3-6 meses"]++;
    else if (meses < 12) categorias["6-12 meses"]++;
    else if (meses < 24) categorias["1-2 anos"]++;
    else categorias["> 2 anos"]++;
  });
  setTimeout(() => {
    const ctx = document.getElementById("graficoAntiguidade")?.getContext("2d");
    if (ctx && estado.dados.alunos.length > 0) {
      estado.graficos.antiguidade = new Chart(ctx, {
        type: "bar",
        data: {
          labels: Object.keys(categorias),
          datasets: [
            {
              label: "Quantidade de Alunos",
              data: Object.values(categorias),
              backgroundColor: "#3A6B5C",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, stepSize: 1 } },
        },
      });
    }
  }, 100);
  return `<div class="report-container"><div class="report-header"><div class="report-title">⏳ Antiguidade dos Alunos</div></div><div class="charts-grid" style="grid-template-columns: 1fr 1fr;"><div class="chart-card"><div class="chart-header"><div class="chart-title">Distribuição por Tempo de Casa</div></div><div class="chart-container"><canvas id="graficoAntiguidade"></canvas></div></div><div class="table-responsive"><table><thead><th>Tempo</th><th>Quantidade</th><th>Percentual</th></thead><tbody>${Object.entries(
    categorias,
  )
    .map(([tempo, qtd]) => {
      const perc = estado.dados.alunos.length
        ? ((qtd / estado.dados.alunos.length) * 100).toFixed(1)
        : 0;
      return `<tr><td><strong>${tempo}</strong></td><td>${qtd}</td><td>${perc}%</td></tr>`;
    })
    .join("")}</tbody></table></div></div></div>`;
}

function gerarRelatorioAlunosPorPlano() {
  const planos = {};
  estado.dados.alunos.forEach((a) => {
    const plano = a.plano || "Não definido";
    planos[plano] = (planos[plano] || 0) + 1;
  });
  const total = estado.dados.alunos.length;
  setTimeout(() => {
    const ctx = document.getElementById("graficoPlanos")?.getContext("2d");
    if (ctx && Object.keys(planos).length > 0) {
      estado.graficos.planos = new Chart(ctx, {
        type: "pie",
        data: {
          labels: Object.keys(planos),
          datasets: [
            {
              data: Object.values(planos),
              backgroundColor: [
                "#3A6B5C",
                "#3498DB",
                "#9B59B6",
                "#F39C12",
                "#E74C3C",
              ],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
    }
  }, 100);
  return `<div class="report-container"><div class="report-header"><div class="report-title">📦 Alunos por Plano</div></div><div class="charts-grid" style="grid-template-columns: 1fr 1fr;"><div class="chart-card"><div class="chart-header"><div class="chart-title">Distribuição de Planos</div></div><div class="chart-container"><canvas id="graficoPlanos"></canvas></div></div><div class="table-responsive"><table><thead><th>Plano</th><th>Alunos</th><th>Percentual</th></thead><tbody>${Object.entries(
    planos,
  )
    .map(([plano, qtd]) => {
      const perc = total ? ((qtd / total) * 100).toFixed(1) : 0;
      return `<tr><td><strong>${plano}</strong></td><td>${qtd}</td><td>${perc}%</td></tr>`;
    })
    .join("")}</tbody></table></div></div></div>`;
}

// ============================================================
// RELATÓRIO DE AGENDA (COM NOVO SUBTAB: HORÁRIOS MAIS LUCRATIVOS)
// ============================================================
function carregarRelatorioAgenda() {
  const subTabs = gerarSubTabs("agenda", [
    { id: "ocupacao", icone: "fa-chart-bar", label: "Ocupação" },
    { id: "presencas", icone: "fa-check-circle", label: "Presenças" },
    { id: "horarios", icone: "fa-clock", label: "Horários Pico" },
    {
      id: "horarios_lucrativos",
      icone: "fa-dollar-sign",
      label: "Horários Mais Lucrativos",
    },
  ]);
  const html = `<div>${subTabs}<div id="subConteudoAgenda">${gerarRelatorioAgendaPorSub(
    estado.subcategoriaAtual.agenda,
  )}</div></div>`;
  document.getElementById("conteudoRelatorios").innerHTML = html;
}

function gerarRelatorioAgendaPorSub(subId) {
  switch (subId) {
    case "ocupacao":
      return gerarRelatorioOcupacao();
    case "presencas":
      return gerarRelatorioPresencas();
    case "horarios":
      return gerarRelatorioHorariosPico();
    case "horarios_lucrativos":
      return gerarRelatorioHorariosLucrativos();
    default:
      return gerarRelatorioOcupacao();
  }
}

function gerarRelatorioOcupacao() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  const aulasPeriodo = estado.dados.aulas.filter(
    (a) => a.data >= inicio && a.data <= fim,
  );
  const totalAulas = aulasPeriodo.length;
  const horarios = {};
  aulasPeriodo.forEach((a) => {
    horarios[a.horario] = (horarios[a.horario] || 0) + 1;
  });
  const horariosOrdenados = Object.entries(horarios).sort(
    (a, b) => b[1] - a[1],
  );
  const dados = horariosOrdenados.map(([horario, qtd]) => ({
    horario,
    qtd,
    perc: totalAulas ? ((qtd / totalAulas) * 100).toFixed(1) : 0,
  }));

  const headers = ["Horário", "Quantidade", "Ocupação"];
  const rowRenderer = (item) => {
    const classe = item.qtd > 5 ? "destaque-atencao" : "";
    return `<tr class="${classe}"><td><strong>${item.horario}</strong></td><td>${item.qtd} aulas</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><div class="progress-bar" style="width:100px;"><div class="progress-fill" style="width:${item.perc}%;"></div></div><span>${item.perc}%</span></div></td></tr>`;
  };
  const tabelaHtml = dados.length
    ? criarTabelaPaginada(dados, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhuma aula no período.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">📊 Ocupação da Agenda</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${totalAulas}</div><div class="summary-label">Total de Aulas</div></div></div>${tabelaHtml}</div>`;
}

function gerarRelatorioPresencas() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  const aulasPeriodo = estado.dados.aulas.filter(
    (a) => a.data >= inicio && a.data <= fim,
  );
  const presentes = aulasPeriodo.filter(
    (a) => a.presenca === "presente",
  ).length;
  const ausentes = aulasPeriodo.filter((a) => a.presenca === "ausente").length;
  const pendentes = aulasPeriodo.filter((a) => !a.presenca).length;
  setTimeout(() => {
    const ctx = document.getElementById("graficoPresencas")?.getContext("2d");
    if (ctx && aulasPeriodo.length > 0) {
      estado.graficos.presencas = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Presentes", "Ausentes", "Pendentes"],
          datasets: [
            {
              data: [presentes, ausentes, pendentes],
              backgroundColor: ["#27AE60", "#E74C3C", "#F39C12"],
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
  }, 100);
  return `<div class="report-container"><div class="report-header"><div class="report-title">✅ Presenças</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${presentes}</div><div class="summary-label">Presentes</div></div><div class="summary-item"><div class="summary-value">${ausentes}</div><div class="summary-label">Ausentes</div></div><div class="summary-item"><div class="summary-value">${pendentes}</div><div class="summary-label">Pendentes</div></div></div><div class="chart-card"><div class="chart-container"><canvas id="graficoPresencas"></canvas></div></div></div>`;
}

function gerarRelatorioHorariosPico() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  const aulasPeriodo = estado.dados.aulas.filter(
    (a) => a.data >= inicio && a.data <= fim,
  );
  const horarios = {};
  aulasPeriodo.forEach((a) => {
    horarios[a.horario] = (horarios[a.horario] || 0) + 1;
  });
  const horariosOrdenados = Object.entries(horarios).sort(
    (a, b) => b[1] - a[1],
  );
  const dados = horariosOrdenados.map(([horario, qtd]) => ({
    horario,
    qtd,
    perc: aulasPeriodo.length
      ? ((qtd / aulasPeriodo.length) * 100).toFixed(1)
      : 0,
  }));

  const headers = ["Horário", "Quantidade", "Percentual"];
  const rowRenderer = (item) => {
    const classe = item.qtd > 3 ? "destaque-atencao" : "";
    return `<tr class="${classe}"><td><strong>${item.horario}</strong></td><td>${item.qtd}</td><td>${item.perc}%</td></tr>`;
  };
  const tabelaHtml = dados.length
    ? criarTabelaPaginada(dados, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhuma aula no período.</p>';

  setTimeout(() => {
    const ctx = document
      .getElementById("graficoHorariosPico")
      ?.getContext("2d");
    if (ctx && dados.length > 0) {
      const topHorarios = dados.slice(0, 10);
      estado.graficos.horariosPico = new Chart(ctx, {
        type: "bar",
        data: {
          labels: topHorarios.map((h) => h.horario),
          datasets: [
            {
              label: "Quantidade de Aulas",
              data: topHorarios.map((h) => h.qtd),
              backgroundColor: "#3A6B5C",
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, stepSize: 1 } },
        },
      });
    }
  }, 100);

  return `<div class="report-container"><div class="report-header"><div class="report-title">⏰ Horários de Pico</div></div><div class="chart-card"><div class="chart-container"><canvas id="graficoHorariosPico"></canvas></div></div>${tabelaHtml}</div>`;
}

// NOVA FUNÇÃO: Relatório de Horários Mais Lucrativos
function gerarRelatorioHorariosLucrativos() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  // Filtra aulas no período
  const aulasPeriodo = estado.dados.aulas.filter(
    (a) => a.data >= inicio && a.data <= fim,
  );
  // Para cada aula, identifica o valor da mensalidade do aluno (pegar da parcela mais recente paga)
  const receitaPorHorario = {};
  aulasPeriodo.forEach((aula) => {
    // Encontrar parcelas pagas do aluno até a data da aula
    const parcelasAluno = estado.dados.parcelas.filter(
      (p) =>
        p.alunoId === aula.alunoId &&
        p.status === "pago" &&
        p.data_pagamento <= aula.data,
    );
    if (parcelasAluno.length === 0) return;
    // Ordenar por data da parcela e pegar a mais recente (assumindo que reflete o plano atual)
    const parcelaMaisRecente = parcelasAluno.sort(
      (a, b) => new Date(b.data_pagamento) - new Date(a.data_pagamento),
    )[0];
    const valorMensalidade = parcelaMaisRecente.valor;
    // Estimar valor por aula (considerando plano mensal com 4 aulas/semana? Vamos simplificar: valor por aula = valor mensalidade / 4)
    // Mas como não temos frequência exata, usaremos o valor da mensalidade dividido por 4 (aproximação)
    const valorPorAula = valorMensalidade / 4;
    if (receitaPorHorario[aula.horario]) {
      receitaPorHorario[aula.horario].receita += valorPorAula;
      receitaPorHorario[aula.horario].qtdAulas++;
    } else {
      receitaPorHorario[aula.horario] = { receita: valorPorAula, qtdAulas: 1 };
    }
  });
  const dados = Object.entries(receitaPorHorario)
    .map(([horario, dados]) => ({
      horario,
      receita: dados.receita,
      qtdAulas: dados.qtdAulas,
      ticketMedio: dados.receita / dados.qtdAulas,
    }))
    .sort((a, b) => b.receita - a.receita);

  const headers = ["Horário", "Receita Total", "Qtd Aulas", "Ticket Médio"];
  const rowRenderer = (item) =>
    `<tr><td><strong>${item.horario}</strong></td><td>${fmtValor(item.receita)}</td><td>${item.qtdAulas}</td><td>${fmtValor(item.ticketMedio)}</td></tr>`;
  const tabelaHtml = dados.length
    ? criarTabelaPaginada(dados, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum dado disponível.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">💰 Horários Mais Lucrativos</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${dados.length}</div><div class="summary-label">Horários com receita</div></div></div>${tabelaHtml}</div>`;
}

// ============================================================
// RELATÓRIO FINANCEIRO (COM NOVOS SUBTABS: FLUXO DETALHADO E COMPARAÇÃO ANO A ANO)
// ============================================================
function carregarRelatorioFinanceiro() {
  const subTabs = gerarSubTabs("financeiro", [
    { id: "receitas", icone: "fa-arrow-up", label: "Receitas" },
    { id: "despesas", icone: "fa-arrow-down", label: "Despesas" },
    {
      id: "inadimplencia",
      icone: "fa-exclamation-triangle",
      label: "Inadimplência",
    },
    { id: "fluxo", icone: "fa-chart-line", label: "Fluxo de Caixa" },
    { id: "fluxo_detalhado", icone: "fa-table", label: "Fluxo Detalhado" },
    {
      id: "comparacao_anual",
      icone: "fa-chart-simple",
      label: "Comparação Ano a Ano",
    },
    { id: "dre", icone: "fa-list-alt", label: "DRE" },
  ]);
  const html = `<div>${subTabs}<div id="subConteudoFinanceiro">${gerarRelatorioFinanceiroPorSub(
    estado.subcategoriaAtual.financeiro,
  )}</div></div>`;
  document.getElementById("conteudoRelatorios").innerHTML = html;
}

function gerarRelatorioFinanceiroPorSub(subId) {
  switch (subId) {
    case "receitas":
      return gerarRelatorioReceitas();
    case "despesas":
      return gerarRelatorioDespesas();
    case "inadimplencia":
      return gerarRelatorioInadimplencia();
    case "fluxo":
      return gerarRelatorioFluxoCaixa();
    case "fluxo_detalhado":
      return gerarRelatorioFluxoCaixaDetalhado();
    case "comparacao_anual":
      return gerarRelatorioComparacaoAnual();
    case "dre":
      return gerarRelatorioDRE();
    default:
      return gerarRelatorioReceitas();
  }
}

function gerarRelatorioReceitas() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  let total = 0;
  const receitas = [];
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      receitas.push({
        data: p.data_pagamento,
        descricao: `Mensalidade - ${p.alunoNome}`,
        valor: p.valor,
        categoria: "Mensalidade",
      });
      total += p.valor;
    }
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    ) {
      receitas.push({
        data: r.data_recebimento,
        descricao: r.descricao,
        valor: r.valor,
        categoria: r.categoria || "Outras",
      });
      total += r.valor;
    }
  });
  receitas.sort((a, b) => a.data.localeCompare(b.data));

  const headers = ["Data", "Descrição", "Categoria", "Valor"];
  const rowRenderer = (r) =>
    `<tr onclick="abrirModal('Detalhe da Receita', '<p>${r.descricao}</p><p>Valor: ${fmtValor(r.valor)}</p>')"><td>${fmtData(r.data)}</td><td>${r.descricao}</td><td>${r.categoria}</td><td>${fmtValor(r.valor)}</td></tr>`;
  const tabelaHtml = receitas.length
    ? criarTabelaPaginada(receitas, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhuma receita no período.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">💰 Receitas do Período</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${fmtValor(total)}</div><div class="summary-label">Total</div></div><div class="summary-item"><div class="summary-value">${receitas.length}</div><div class="summary-label">Transações</div></div></div>${tabelaHtml}</div>`;
}

function gerarRelatorioDespesas() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  let total = 0;
  const despesas = [];
  estado.dados.contasPagar.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      despesas.push({
        data: c.data_pagamento,
        descricao: c.descricao,
        valor: c.valor,
        categoria: c.categoria || "Outras",
        status: c.status,
      });
      total += c.valor;
    }
  });
  despesas.sort((a, b) => a.data.localeCompare(b.data));

  const headers = ["Data", "Descrição", "Categoria", "Valor"];
  const rowRenderer = (d) =>
    `<tr onclick="abrirModal('Detalhe da Despesa', '<p>${d.descricao}</p><p>Valor: ${fmtValor(d.valor)}</p>')"><td>${fmtData(d.data)}</td><td>${d.descricao}</td><td>${d.categoria}</td><td>${fmtValor(d.valor)}</td></tr>`;
  const tabelaHtml = despesas.length
    ? criarTabelaPaginada(despesas, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhuma despesa no período.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">📉 Despesas do Período</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${fmtValor(total)}</div><div class="summary-label">Total</div></div><div class="summary-item"><div class="summary-value">${despesas.length}</div><div class="summary-label">Transações</div></div></div>${tabelaHtml}</div>`;
}

function gerarRelatorioInadimplencia() {
  const inadimplentes = [];
  let total = 0;
  estado.dados.parcelas.forEach((p) => {
    if (p.status === "atrasado") {
      const dias = calcularDiasAtraso(p.vencimento);
      inadimplentes.push({
        aluno: p.alunoNome,
        valor: p.valor,
        vencimento: p.vencimento,
        dias,
      });
      total += p.valor;
    }
  });

  const headers = ["Aluno", "Vencimento", "Dias", "Valor"];
  const rowRenderer = (i) =>
    `<tr class="destaque-vencido" onclick="abrirModal('Detalhe da Inadimplência', '<p>Aluno: ${i.aluno}</p><p>Vencimento: ${fmtData(i.vencimento)}</p><p>Valor: ${fmtValor(i.valor)}</p>')"><td><strong>${i.aluno}</strong></td><td>${fmtData(i.vencimento)}</td><td><span class="badge red">${i.dias} dias</span></td><td>${fmtValor(i.valor)}</td></tr>`;
  const tabelaHtml = inadimplentes.length
    ? criarTabelaPaginada(
        inadimplentes.sort((a, b) => b.dias - a.dias),
        headers,
        rowRenderer,
        10,
      )
    : '<p class="empty-state">Nenhuma parcela em atraso.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">⚠️ Inadimplência</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${fmtValor(total)}</div><div class="summary-label">Total</div></div><div class="summary-item"><div class="summary-value">${inadimplentes.length}</div><div class="summary-label">Parcelas</div></div></div>${tabelaHtml}</div>`;
}

function gerarRelatorioFluxoCaixa() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  let receitas = 0,
    despesas = 0;
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    )
      receitas += p.valor;
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    )
      receitas += r.valor;
  });
  estado.dados.contasPagar.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    )
      despesas += c.valor;
  });
  const saldo = receitas - despesas;
  return `<div class="report-container"><div class="report-header"><div class="report-title">📊 Fluxo de Caixa</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${fmtValor(receitas)}</div><div class="summary-label">Entradas</div></div><div class="summary-item"><div class="summary-value">${fmtValor(despesas)}</div><div class="summary-label">Saídas</div></div><div class="summary-item"><div class="summary-value ${saldo >= 0 ? "trend-up" : "trend-down"}">${fmtValor(saldo)}</div><div class="summary-label">Saldo</div></div></div></div>`;
}

// NOVA FUNÇÃO: Relatório de Fluxo de Caixa Detalhado
function gerarRelatorioFluxoCaixaDetalhado() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  // Gerar todas as movimentações ordenadas por data
  const movimentacoes = [];
  // Parcelas
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      movimentacoes.push({
        data: p.data_pagamento,
        tipo: "Receita",
        descricao: `Mensalidade - ${p.alunoNome}`,
        valor: p.valor,
        categoria: "Mensalidade",
      });
    }
  });
  // Outras receitas
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    ) {
      movimentacoes.push({
        data: r.data_recebimento,
        tipo: "Receita",
        descricao: r.descricao,
        valor: r.valor,
        categoria: r.categoria || "Outras",
      });
    }
  });
  // Despesas
  estado.dados.contasPagar.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      movimentacoes.push({
        data: c.data_pagamento,
        tipo: "Despesa",
        descricao: c.descricao,
        valor: c.valor,
        categoria: c.categoria || "Outras",
      });
    }
  });
  movimentacoes.sort((a, b) => a.data.localeCompare(b.data));

  // Calcular saldo acumulado
  let saldoAcumulado = 0;
  const dadosComSaldo = movimentacoes.map((m) => {
    const valorLiquido = m.tipo === "Receita" ? m.valor : -m.valor;
    saldoAcumulado += valorLiquido;
    return { ...m, saldo: saldoAcumulado };
  });

  const headers = [
    "Data",
    "Tipo",
    "Descrição",
    "Categoria",
    "Valor",
    "Saldo Acumulado",
  ];
  const rowRenderer = (m) =>
    `<tr><td>${fmtData(m.data)}</td><td><span class="badge ${m.tipo === "Receita" ? "verde" : "red"}">${m.tipo}</span></td><td>${m.descricao}</td><td>${m.categoria}</td><td>${fmtValor(m.valor)}</td><td class="${m.saldo >= 0 ? "trend-up" : "trend-down"}">${fmtValor(m.saldo)}</td></tr>`;
  const tabelaHtml = dadosComSaldo.length
    ? criarTabelaPaginada(dadosComSaldo, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhuma movimentação no período.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">📋 Fluxo de Caixa Detalhado</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${movimentacoes.length}</div><div class="summary-label">Movimentações</div></div></div>${tabelaHtml}</div>`;
}

// NOVA FUNÇÃO: Relatório de Comparação Ano a Ano
function gerarRelatorioComparacaoAnual() {
  // Permitir selecionar dois anos/meses via inputs simples ou usar dois períodos fixos
  // Por simplicidade, vamos comparar o mesmo mês do ano atual e ano anterior
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const anoAnterior = anoAtual - 1;

  const inicioAtual = new Date(anoAtual, mesAtual - 1, 1)
    .toISOString()
    .split("T")[0];
  const fimAtual = new Date(anoAtual, mesAtual, 0).toISOString().split("T")[0];
  const inicioAnterior = new Date(anoAnterior, mesAtual - 1, 1)
    .toISOString()
    .split("T")[0];
  const fimAnterior = new Date(anoAnterior, mesAtual, 0)
    .toISOString()
    .split("T")[0];

  const faturamentoAtual = calcularFaturamentoPeriodo(inicioAtual, fimAtual);
  const faturamentoAnterior = calcularFaturamentoPeriodo(
    inicioAnterior,
    fimAnterior,
  );
  const variacaoFaturamento = calcularVariacao(
    faturamentoAtual,
    faturamentoAnterior,
  );

  const alunosAtual = estado.dados.alunos.filter(
    (a) =>
      a.data_inicio &&
      a.data_inicio >= inicioAtual &&
      a.data_inicio <= fimAtual,
  ).length;
  const alunosAnterior = estado.dados.alunos.filter(
    (a) =>
      a.data_inicio &&
      a.data_inicio >= inicioAnterior &&
      a.data_inicio <= fimAnterior,
  ).length;
  const variacaoAlunos = calcularVariacao(alunosAtual, alunosAnterior);

  return `<div class="report-container">
    <div class="report-header"><div class="report-title">📅 Comparação ${mesAtual}/${anoAtual} vs ${mesAtual}/${anoAnterior}</div></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
      <div class="stat-card"><div class="stat-info"><div class="stat-value">${fmtValor(faturamentoAtual)}</div><div class="stat-label">Faturamento ${mesAtual}/${anoAtual}</div><div class="stat-trend ${variacaoFaturamento.classe}"><i class="fas ${variacaoFaturamento.icone}"></i> ${variacaoFaturamento.texto} vs ano anterior</div></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-value">${fmtValor(faturamentoAnterior)}</div><div class="stat-label">Faturamento ${mesAtual}/${anoAnterior}</div></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-value">${alunosAtual}</div><div class="stat-label">Novos alunos ${mesAtual}/${anoAtual}</div><div class="stat-trend ${variacaoAlunos.classe}"><i class="fas ${variacaoAlunos.icone}"></i> ${variacaoAlunos.texto} vs ano anterior</div></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-value">${alunosAnterior}</div><div class="stat-label">Novos alunos ${mesAtual}/${anoAnterior}</div></div></div>
    </div>
  </div>`;
}

function gerarRelatorioDRE() {
  const inicio = estado.periodo.inicio;
  const fim = estado.periodo.fim;
  let receitasMensalidades = 0,
    receitasOutras = 0;
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    )
      receitasMensalidades += p.valor;
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    )
      receitasOutras += r.valor;
  });

  let despesasFixas = 0,
    despesasVariaveis = 0;
  estado.dados.contasPagar.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      const cat = c.categoria;
      const tipo = obterTipoDespesa(cat);
      if (tipo === "fixa") despesasFixas += c.valor;
      else despesasVariaveis += c.valor;
    }
  });

  const totalReceitas = receitasMensalidades + receitasOutras;
  const totalDespesas = despesasFixas + despesasVariaveis;
  const resultado = totalReceitas - totalDespesas;
  const margem =
    totalReceitas > 0 ? ((resultado / totalReceitas) * 100).toFixed(1) : 0;
  return `<div class="report-container"><div class="report-header"><div class="report-title">📋 DRE - Demonstrativo de Resultados</div></div><div style="padding:1rem;"><div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--verde-pastel);"><span><strong>RECEITAS</strong></span><span><strong>${fmtValor(totalReceitas)}</strong></span></div><div style="display:flex; justify-content:space-between; padding:0.5rem 0 0.5rem 2rem;"><span>Mensalidades</span><span>${fmtValor(receitasMensalidades)}</span></div><div style="display:flex; justify-content:space-between; padding:0.5rem 0 0.5rem 2rem;"><span>Outras Receitas</span><span>${fmtValor(receitasOutras)}</span></div><div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--verde-pastel); margin-top:1rem;"><span><strong>DESPESAS</strong></span><span><strong>${fmtValor(totalDespesas)}</strong></span></div><div style="display:flex; justify-content:space-between; padding:0.5rem 0 0.5rem 2rem;"><span>Despesas Fixas</span><span>${fmtValor(despesasFixas)}</span></div><div style="display:flex; justify-content:space-between; padding:0.5rem 0 0.5rem 2rem;"><span>Despesas Variáveis</span><span>${fmtValor(despesasVariaveis)}</span></div><div style="display:flex; justify-content:space-between; padding:1rem 0; border-top:2px solid var(--verde-pastel); margin-top:1rem; font-size:1.2rem;"><span><strong>RESULTADO LÍQUIDO</strong></span><span class="${resultado >= 0 ? "trend-up" : "trend-down"}"><strong>${fmtValor(resultado)}</strong></span></div><div style="text-align:center; padding:0.5rem; background:var(--off-white); border-radius:8px;"><strong>Margem de Lucro: ${margem}%</strong></div></div></div>`;
}

function obterTipoDespesa(categoria) {
  const catInfo = estado.dados.categoriasDespesas?.find(
    (c) => c.nome === categoria,
  );
  if (catInfo) return catInfo.tipo_despesa === "fixa" ? "fixa" : "variavel";
  const fixas = [
    "Aluguel",
    "Salário",
    "Internet",
    "Energia",
    "Água",
    "Aluguel",
    "Seguro",
  ];
  return fixas.includes(categoria) ? "fixa" : "variavel";
}

// ============================================================
// RELATÓRIO DE PERFORMANCE (COM NOVOS SUBTABS: RETENÇÃO COHORT, CANCELAMENTOS, PREVISÃO DE RENOVAÇÃO)
// ============================================================
function carregarRelatorioPerformance() {
  const subTabs = gerarSubTabs("performance", [
    { id: "crescimento", icone: "fa-chart-line", label: "Crescimento" },
    { id: "metas", icone: "fa-bullseye", label: "Metas" },
    { id: "forecast", icone: "fa-chart-simple", label: "Previsão" },
    { id: "retencao_cohort", icone: "fa-users", label: "Retenção (Cohort)" },
    { id: "cancelamentos", icone: "fa-ban", label: "Cancelamentos" },
    {
      id: "previsao_renovacao",
      icone: "fa-calendar-check",
      label: "Previsão de Renovação",
    },
  ]);
  const html = `<div>${subTabs}<div id="subConteudoPerformance">${gerarRelatorioPerformancePorSub(
    estado.subcategoriaAtual.performance,
  )}</div></div>`;
  document.getElementById("conteudoRelatorios").innerHTML = html;
}

function gerarRelatorioPerformancePorSub(subId) {
  switch (subId) {
    case "crescimento":
      return gerarRelatorioCrescimento();
    case "metas":
      return gerarRelatorioMetas();
    case "forecast":
      return gerarRelatorioForecast();
    case "retencao_cohort":
      return gerarRelatorioRetencaoCohort();
    case "cancelamentos":
      return gerarRelatorioCancelamentos();
    case "previsao_renovacao":
      return gerarRelatorioPrevisaoRenovacao();
    default:
      return gerarRelatorioCrescimento();
  }
}

function gerarRelatorioCrescimento() {
  const hoje = new Date();
  const meses = [];
  for (let i = 11; i >= 0; i--) {
    const mes = hoje.getMonth() - i;
    const ano = hoje.getFullYear() - (mes < 0 ? 1 : 0);
    const mesAjustado = mes < 0 ? mes + 12 : mes;
    const novosAlunos = estado.dados.alunos.filter((a) => {
      if (!a.data_inicio) return false;
      const [anoData, mesData] = a.data_inicio.split("-").map(Number);
      return mesData === mesAjustado + 1 && anoData === ano;
    }).length;
    meses.push({ mes: `${mesAjustado + 1}/${ano}`, novosAlunos });
  }
  return `<div class="report-container"><div class="report-header"><div class="report-title">📈 Crescimento - Novos Alunos (12 meses)</div></div><div class="table-responsive"><table><thead><th>Mês</th><th>Novos Alunos</th></thead><tbody>${meses
    .map(
      (m) =>
        `<tr><td><strong>${m.mes}</strong></td><td>${m.novosAlunos}</td></tr>`,
    )
    .join("")}</tbody></table></div></div>`;
}

function gerarRelatorioMetas() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const faturamentoMes = calcularFaturamentoPeriodo(
    new Date(anoAtual, mesAtual - 1, 1).toISOString().split("T")[0],
    new Date(anoAtual, mesAtual, 0).toISOString().split("T")[0],
  );

  const metaObjetivo = estado.dados.metas?.find(
    (m) => m.mes === mesAtual && m.ano === anoAtual,
  );

  if (!metaObjetivo) {
    return `
      <div class="report-container">
        <div class="report-header">
          <div class="report-title">🎯 Metas do Mês</div>
        </div>
        <div style="padding: 1rem; text-align: center; color: var(--grafite-claro);">
          <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
          <p>Nenhuma meta cadastrada para ${mesAtual}/${anoAtual}.</p>
          <p>Cadastre uma meta para acompanhar o desempenho.</p>
        </div>
      </div>
    `;
  }

  const metaFaturamento = metaObjetivo.valor_meta;
  const percFaturamento = ((faturamentoMes / metaFaturamento) * 100).toFixed(1);

  return `
    <div class="report-container">
      <div class="report-header">
        <div class="report-title">🎯 Metas do Mês</div>
      </div>
      <div style="padding:1rem;">
        <div style="margin-bottom:2rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
            <span><strong>💰 Faturamento</strong></span>
            <span>${fmtValor(faturamentoMes)} / ${fmtValor(metaFaturamento)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.min(percFaturamento, 100)}%;"></div>
          </div>
          <div style="text-align:right; margin-top:0.3rem;">
            <span class="${percFaturamento >= 100 ? "trend-up" : ""}">${percFaturamento}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function gerarRelatorioForecast() {
  const hoje = new Date();
  const meses = [];
  for (let i = 1; i <= 3; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const fat = calcularFaturamentoPeriodo(
      new Date(data.getFullYear(), data.getMonth(), 1)
        .toISOString()
        .split("T")[0],
      new Date(data.getFullYear(), data.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0],
    );
    meses.push(fat);
  }
  const media = meses.reduce((a, b) => a + b, 0) / meses.length;
  return `<div class="report-container"><div class="report-header"><div class="report-title">🔮 Previsão de Faturamento</div></div><p>Previsão para o próximo mês: <strong>${fmtValor(media)}</strong> (baseado na média dos últimos 3 meses)</p><p><small>Método: Média móvel simples</small></p></div>`;
}

// NOVA FUNÇÃO: Relatório de Retenção de Alunos (Cohort Analysis)
function gerarRelatorioRetencaoCohort() {
  // Determinar meses de entrada (cohorts) até 12 meses atrás
  const hoje = new Date();
  const cohorts = [];
  for (let i = 0; i < 12; i++) {
    const mes = hoje.getMonth() - i;
    const ano = hoje.getFullYear() - (mes < 0 ? 1 : 0);
    const mesAjustado = mes < 0 ? mes + 12 : mes;
    const dataInicioCohort = new Date(ano, mesAjustado, 1);
    const dataFimCohort = new Date(ano, mesAjustado + 1, 0);
    const alunosCohort = estado.dados.alunos.filter((a) => {
      if (!a.data_inicio) return false;
      const [anoData, mesData] = a.data_inicio.split("-").map(Number);
      return mesData === mesAjustado + 1 && anoData === ano;
    });
    if (alunosCohort.length === 0) continue;
    // Calcular retenção para 1, 3, 6, 12 meses após entrada
    const retencao = { m1: 0, m3: 0, m6: 0, m12: 0 };
    alunosCohort.forEach((aluno) => {
      const dataInicioAluno = new Date(aluno.data_inicio);
      // Verificar se ainda está ativo ou se teve aula após X meses
      // Simplificação: verificar se tem alguma aula após a data de início + X meses
      const aulasAluno = estado.dados.aulas.filter(
        (a) => a.alunoId === aluno.id,
      );
      const meses = (mes, data) => {
        const limite = new Date(dataInicioAluno);
        limite.setMonth(limite.getMonth() + mes);
        return aulasAluno.some((a) => new Date(a.data) >= limite);
      };
      if (meses(1, aluno)) retencao.m1++;
      if (meses(3, aluno)) retencao.m3++;
      if (meses(6, aluno)) retencao.m6++;
      if (meses(12, aluno)) retencao.m12++;
    });
    cohorts.push({
      label: `${mesAjustado + 1}/${ano}`,
      total: alunosCohort.length,
      m1: retencao.m1,
      m3: retencao.m3,
      m6: retencao.m6,
      m12: retencao.m12,
      perc1: alunosCohort.length
        ? ((retencao.m1 / alunosCohort.length) * 100).toFixed(1)
        : 0,
      perc3: alunosCohort.length
        ? ((retencao.m3 / alunosCohort.length) * 100).toFixed(1)
        : 0,
      perc6: alunosCohort.length
        ? ((retencao.m6 / alunosCohort.length) * 100).toFixed(1)
        : 0,
      perc12: alunosCohort.length
        ? ((retencao.m12 / alunosCohort.length) * 100).toFixed(1)
        : 0,
    });
  }
  cohorts.sort((a, b) => b.label.localeCompare(a.label));
  const headers = [
    "Cohort (Entrada)",
    "Total",
    "1 mês",
    "3 meses",
    "6 meses",
    "12 meses",
  ];
  const rowRenderer = (c) =>
    `<tr><td><strong>${c.label}</strong></td><td>${c.total}</td><td>${c.m1} (${c.perc1}%)</td><td>${c.m3} (${c.perc3}%)</td><td>${c.m6} (${c.perc6}%)</td><td>${c.m12} (${c.perc12}%)</td></tr>`;
  const tabelaHtml = cohorts.length
    ? criarTabelaPaginada(cohorts, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum dado de retenção disponível.</p>';
  return `<div class="report-container"><div class="report-header"><div class="report-title">📊 Análise de Retenção (Cohort)</div></div>${tabelaHtml}</div>`;
}

// NOVA FUNÇÃO: Relatório de Cancelamentos
function gerarRelatorioCancelamentos() {
  // Verificar se há campo motivo_cancelamento ou data_cancelamento nos alunos
  // Para fins de demonstração, assumimos que alunos com status "inativo" e que têm data_cancelamento preenchida
  const cancelamentos = estado.dados.alunos.filter(
    (a) => a.status === "inativo" && a.data_cancelamento,
  );
  const porMotivo = {};
  cancelamentos.forEach((a) => {
    const motivo = a.motivo_cancelamento || "Não informado";
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
  });
  const porMes = {};
  cancelamentos.forEach((a) => {
    const [ano, mes] = a.data_cancelamento.split("-");
    const key = `${mes}/${ano}`;
    porMes[key] = (porMes[key] || 0) + 1;
  });

  const headersMotivos = ["Motivo", "Quantidade"];
  const rowRendererMotivo = (motivo, qtd) =>
    `<tr><td><strong>${motivo}</strong></td><td>${qtd}</td></tr>`;
  const tabelaMotivos = Object.entries(porMotivo).length
    ? criarTabelaPaginada(
        Object.entries(porMotivo).map(([motivo, qtd]) => ({ motivo, qtd })),
        headersMotivos,
        (item) => rowRendererMotivo(item.motivo, item.qtd),
        10,
      )
    : '<p class="empty-state">Nenhum motivo registrado.</p>';

  const headersMeses = ["Mês", "Cancelamentos"];
  const rowRendererMes = (mes, qtd) =>
    `<tr><td><strong>${mes}</strong></td><td>${qtd}</td></tr>`;
  const tabelaMeses = Object.entries(porMes).length
    ? criarTabelaPaginada(
        Object.entries(porMes).map(([mes, qtd]) => ({ mes, qtd })),
        headersMeses,
        (item) => rowRendererMes(item.mes, item.qtd),
        10,
      )
    : '<p class="empty-state">Nenhum cancelamento registrado.</p>';

  return `<div class="report-container"><div class="report-header"><div class="report-title">🚫 Cancelamentos</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${cancelamentos.length}</div><div class="summary-label">Total Cancelamentos</div></div></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;"><div><div class="report-header"><div class="report-title">Por Motivo</div></div>${tabelaMotivos}</div><div><div class="report-header"><div class="report-title">Por Mês</div></div>${tabelaMeses}</div></div></div>`;
}

// NOVA FUNÇÃO: Relatório de Previsão de Renovação
function gerarRelatorioPrevisaoRenovacao() {
  // Listar alunos com planos próximos do vencimento (últimas sessões ou data fim)
  // Assumindo que temos planos_alunos com data_fim ou sessões restantes
  // Para simplificar, usaremos alunos que têm data_inicio e planos, e consideramos renovação após 11 meses
  const hoje = new Date();
  const previsao = [];
  estado.dados.alunos.forEach((aluno) => {
    if (!aluno.data_inicio) return;
    const dataInicio = new Date(aluno.data_inicio);
    const mesesAtivo =
      (hoje.getFullYear() - dataInicio.getFullYear()) * 12 +
      (hoje.getMonth() - dataInicio.getMonth());
    // Se o aluno tem menos de 12 meses ativo, pode estar próximo de renovação
    if (mesesAtivo >= 11 && mesesAtivo <= 12) {
      const ultimaAula = estado.dados.aulas
        .filter((a) => a.alunoId === aluno.id)
        .sort((a, b) => new Date(b.data) - new Date(a.data))[0];
      const diasUltimaAula = ultimaAula
        ? Math.floor((hoje - new Date(ultimaAula.data)) / (1000 * 60 * 60 * 24))
        : null;
      previsao.push({
        aluno: aluno.nome,
        telefone: aluno.telefone,
        plano: aluno.plano,
        mesesAtivo,
        ultimaAula: ultimaAula ? fmtData(ultimaAula.data) : "Nunca",
        diasSemAula: diasUltimaAula,
      });
    }
  });
  previsao.sort((a, b) => (b.diasSemAula || 0) - (a.diasSemAula || 0));
  const headers = [
    "Aluno",
    "Telefone",
    "Plano",
    "Meses Ativo",
    "Última Aula",
    "Dias sem Aula",
  ];
  const rowRenderer = (p) =>
    `<tr><td><strong>${p.aluno}</strong></td><td>${p.telefone || "-"}</td><td>${p.plano}</td><td>${p.mesesAtivo}</td><td>${p.ultimaAula}</td><td><span class="badge orange">${p.diasSemAula || "N/A"}</span></td></tr>`;
  const tabelaHtml = previsao.length
    ? criarTabelaPaginada(previsao, headers, rowRenderer, 10)
    : '<p class="empty-state">Nenhum aluno próximo da renovação.</p>';
  return `<div class="report-container"><div class="report-header"><div class="report-title">🔄 Previsão de Renovação</div></div><div class="report-summary"><div class="summary-item"><div class="summary-value">${previsao.length}</div><div class="summary-label">Alunos para acompanhar</div></div></div>${tabelaHtml}</div>`;
}

// ============================================================
// EXPORTAÇÕES (MANTIDO)
// ============================================================
function exportarRelatorioAtual(formato) {
  const titulo =
    document.querySelector(".report-title")?.textContent || "Relatório";
  const tabela = document.querySelector("table");
  if (!tabela) {
    mostrarToast("Nenhuma tabela para exportar", "warning");
    return;
  }
  const dados = extrairDadosTabela(tabela);
  const nomeArquivo = `${titulo.toLowerCase().replace(/\s+/g, "_")}_${hoje()}`;
  if (formato === "pdf") exportarPDF(titulo, dados, nomeArquivo);
  else if (formato === "csv") exportarCSV(dados, nomeArquivo);
  else if (formato === "excel") exportarExcel(dados, nomeArquivo);
}

function extrairDadosTabela(tabela) {
  const headers = [];
  const dados = [];
  tabela
    .querySelectorAll("thead th")
    .forEach((th) => headers.push(th.textContent.trim()));
  tabela.querySelectorAll("tbody tr").forEach((tr) => {
    const linha = [];
    tr.querySelectorAll("td").forEach((td) =>
      linha.push(td.textContent.replace(/\s+/g, " ").trim()),
    );
    if (linha.length > 0) dados.push(linha);
  });
  return { headers, dados };
}

function exportarPDF(titulo, dados, nomeArquivo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(titulo, 14, 20);
  doc.setFontSize(10);
  doc.text(
    `Período: ${fmtData(estado.periodo.inicio)} a ${fmtData(estado.periodo.fim)}`,
    14,
    28,
  );
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 34);
  doc.autoTable({
    startY: 40,
    head: [dados.headers],
    body: dados.dados,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [58, 107, 92] },
  });
  doc.save(`${nomeArquivo}.pdf`);
  mostrarToast("PDF gerado com sucesso!", "success");
}

function exportarCSV(dados, nomeArquivo) {
  const linhas = [
    dados.headers.join(";"),
    ...dados.dados.map((linha) => linha.join(";")),
  ];
  const csv = linhas.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}.csv`;
  a.click();
  mostrarToast("CSV gerado com sucesso!", "success");
}

function exportarExcel(dados, nomeArquivo) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      `Período: ${fmtData(estado.periodo.inicio)} a ${fmtData(estado.periodo.fim)}`,
    ],
    [],
    dados.headers,
    ...dados.dados,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
  mostrarToast("Excel gerado com sucesso!", "success");
}

// ============================================================
// NOVAS FUNCIONALIDADES ADICIONAIS
// ============================================================
function exportarGraficoComoImagem(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    mostrarToast("Gráfico não encontrado", "warning");
    return;
  }
  const link = document.createElement("a");
  link.download = `grafico_${canvasId}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  mostrarToast("Imagem salva!", "success");
}

function exportarGraficoAtualComoImagem() {
  const canvas = document.querySelector(".chart-container canvas");
  if (canvas) {
    const link = document.createElement("a");
    link.download = `grafico_${new Date().toISOString()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    mostrarToast("Imagem salva!", "success");
  } else {
    mostrarToast("Nenhum gráfico encontrado para exportar", "warning");
  }
}

function abrirModalAgendamento() {
  document.getElementById("modalAgendamento").classList.add("show");
}

function fecharModalAgendamento() {
  document.getElementById("modalAgendamento").classList.remove("show");
}

function salvarAgendamento() {
  const relatorio = document.getElementById("relatorioAgendado").value;
  const periodicidade = document.getElementById("periodicidade").value;
  const email = document.getElementById("emailAgendamento").value;
  if (!email) {
    mostrarToast("Informe um e-mail válido", "error");
    return;
  }
  const agendamentos = JSON.parse(localStorage.getItem("agendamentos")) || [];
  agendamentos.push({
    relatorio,
    periodicidade,
    email,
    criadoEm: new Date().toISOString(),
  });
  localStorage.setItem("agendamentos", JSON.stringify(agendamentos));
  mostrarToast(
    `Agendamento salvo! Relatório será enviado para ${email}`,
    "success",
  );
  fecharModalAgendamento();
}

function toggleBenchmark() {
  estado.benchmarkAtivo = document.getElementById("benchmarkToggle").checked;
  recarregarRelatorio();
}

function personalizarCardsDashboard() {
  const container = document.getElementById("cardsChecklist");
  const opcoes = [
    { id: "totalAlunos", label: "Total de Alunos" },
    { id: "aulasMes", label: "Aulas no Mês" },
    { id: "faturamento", label: "Faturamento" },
    { id: "inadimplencia", label: "Inadimplência" },
  ];
  container.innerHTML = opcoes
    .map(
      (opt) => `
    <label style="display: block; margin-bottom: 0.5rem;">
      <input type="checkbox" value="${opt.id}" ${estado.cardsDashboardVisiveis.includes(opt.id) ? "checked" : ""}>
      ${opt.label}
    </label>
  `,
    )
    .join("");
  document.getElementById("modalCustomizarCards").classList.add("show");
}

function fecharModalCustomizarCards() {
  document.getElementById("modalCustomizarCards").classList.remove("show");
}

function salvarPersonalizacaoCards() {
  const checkboxes = document.querySelectorAll(
    "#cardsChecklist input[type='checkbox']",
  );
  const selecionados = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  estado.cardsDashboardVisiveis = selecionados;
  localStorage.setItem("cardsDashboardVisiveis", JSON.stringify(selecionados));
  fecharModalCustomizarCards();
  if (estado.categoriaAtual === "dashboard") recarregarRelatorio();
  mostrarToast("Personalização salva!", "success");
}
