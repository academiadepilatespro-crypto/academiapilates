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
  tipoVisualizacao: "diario",
  horizonteProjecao: 30,
  periodo: {
    inicio: null,
    fim: null,
  },
  dados: {
    parcelas: [],
    receitas: [],
    contas: [],
    alunos: [],
  },
  filtrosTipo: {
    mensalidades: true,
    outras: true,
    despesas: true,
  },
  periodosSalvos: [], // { nome, inicio, fim }
  limitesSaude: { baixo: 2, medio: 3 }, // meses
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
// CONFIGURAÇÕES
// ============================================================
function carregarConfiguracoes() {
  const baixo = localStorage.getItem("limiteSaudeBaixo");
  const medio = localStorage.getItem("limiteSaudeMedio");
  if (baixo) estado.limitesSaude.baixo = parseFloat(baixo);
  if (medio) estado.limitesSaude.medio = parseFloat(medio);
  document.getElementById("limiteBaixo").value = estado.limitesSaude.baixo;
  document.getElementById("limiteMedio").value = estado.limitesSaude.medio;
}

function abrirConfiguracoes() {
  carregarConfiguracoes();
  document.getElementById("modalConfiguracoes").classList.add("show");
}

function salvarConfiguracoes() {
  const baixo = parseFloat(document.getElementById("limiteBaixo").value);
  const medio = parseFloat(document.getElementById("limiteMedio").value);
  if (isNaN(baixo) || isNaN(medio) || baixo <= 0 || medio <= baixo) {
    mostrarToast(
      "Limites inválidos. O limite baixo deve ser positivo e menor que o médio.",
      "error",
    );
    return;
  }
  estado.limitesSaude.baixo = baixo;
  estado.limitesSaude.medio = medio;
  localStorage.setItem("limiteSaudeBaixo", baixo);
  localStorage.setItem("limiteSaudeMedio", medio);
  fecharModal("modalConfiguracoes");
  renderizarTudo();
  mostrarToast("Configurações salvas!", "success");
}

// ============================================================
// PERÍODOS SALVOS
// ============================================================
function carregarPeriodosSalvos() {
  const salvos = localStorage.getItem("periodosSalvos");
  if (salvos) {
    estado.periodosSalvos = JSON.parse(salvos);
  } else {
    estado.periodosSalvos = [];
  }
  atualizarSelectPeriodosSalvos();
}

function atualizarSelectPeriodosSalvos() {
  const select = document.getElementById("periodosSalvosSelect");
  if (!select) return;
  select.innerHTML = '<option value="">Períodos salvos</option>';
  estado.periodosSalvos.forEach((p, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.textContent = `${p.nome} (${fmtData(p.inicio)} a ${fmtData(p.fim)})`;
    select.appendChild(option);
  });
}

function salvarPeriodoAtual() {
  const nome = document.getElementById("nomePeriodoSalvo").value.trim();
  if (!nome) {
    mostrarToast("Digite um nome para o período", "error");
    return;
  }
  const novo = {
    nome,
    inicio: estado.periodo.inicio,
    fim: estado.periodo.fim,
  };
  estado.periodosSalvos.push(novo);
  localStorage.setItem("periodosSalvos", JSON.stringify(estado.periodosSalvos));
  atualizarSelectPeriodosSalvos();
  fecharModal("modalSalvarPeriodo");
  mostrarToast("Período salvo com sucesso!", "success");
}

function abrirSalvarPeriodo() {
  document.getElementById("nomePeriodoSalvo").value = "";
  document.getElementById("modalSalvarPeriodo").classList.add("show");
}

function carregarPeriodoSalvo(idx) {
  if (idx === "") return;
  const periodo = estado.periodosSalvos[parseInt(idx)];
  if (periodo) {
    estado.tipoVisualizacao = "personalizado";
    estado.periodo.inicio = periodo.inicio;
    estado.periodo.fim = periodo.fim;
    document
      .querySelectorAll(".periodo-tipo button")
      .forEach((btn) => btn.classList.remove("active"));
    atualizarPeriodoDisplay();
    renderizarTudo();
  }
}

// ============================================================
// COMPARAÇÃO COM PERÍODO ANTERIOR
// ============================================================
function abrirCompararPeriodos() {
  const periodoAnterior = calcularPeriodoAnterior();
  const resumoAtual = calcularResumo();
  const resumoAnterior = calcularResumoPeriodo(
    periodoAnterior.inicio,
    periodoAnterior.fim,
  );
  const comparacao = {
    periodoAtual: {
      inicio: estado.periodo.inicio,
      fim: estado.periodo.fim,
      ...resumoAtual,
    },
    periodoAnterior: {
      inicio: periodoAnterior.inicio,
      fim: periodoAnterior.fim,
      ...resumoAnterior,
    },
  };
  const variacaoEntradas =
    comparacao.periodoAtual.entradas - comparacao.periodoAnterior.entradas;
  const variacaoSaidas =
    comparacao.periodoAtual.saidas - comparacao.periodoAnterior.saidas;
  const variacaoSaldo =
    comparacao.periodoAtual.saldoFinal - comparacao.periodoAnterior.saldoFinal;
  const pctEntradas =
    comparacao.periodoAnterior.entradas !== 0
      ? (variacaoEntradas / comparacao.periodoAnterior.entradas) * 100
      : 0;
  const pctSaidas =
    comparacao.periodoAnterior.saidas !== 0
      ? (variacaoSaidas / comparacao.periodoAnterior.saidas) * 100
      : 0;
  const pctSaldo =
    comparacao.periodoAnterior.saldoFinal !== 0
      ? (variacaoSaldo / Math.abs(comparacao.periodoAnterior.saldoFinal)) * 100
      : 0;

  const html = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div style="background: var(--off-white); padding: 1rem; border-radius: 12px;">
        <h4>Período Atual</h4>
        <p>${fmtData(comparacao.periodoAtual.inicio)} a ${fmtData(comparacao.periodoAtual.fim)}</p>
        <p>Entradas: ${fmtValor(comparacao.periodoAtual.entradas)}</p>
        <p>Saídas: ${fmtValor(comparacao.periodoAtual.saidas)}</p>
        <p>Saldo Final: ${fmtValor(comparacao.periodoAtual.saldoFinal)}</p>
      </div>
      <div style="background: var(--off-white); padding: 1rem; border-radius: 12px;">
        <h4>Período Anterior</h4>
        <p>${fmtData(comparacao.periodoAnterior.inicio)} a ${fmtData(comparacao.periodoAnterior.fim)}</p>
        <p>Entradas: ${fmtValor(comparacao.periodoAnterior.entradas)}</p>
        <p>Saídas: ${fmtValor(comparacao.periodoAnterior.saidas)}</p>
        <p>Saldo Final: ${fmtValor(comparacao.periodoAnterior.saldoFinal)}</p>
      </div>
    </div>
    <div style="margin-top: 1rem; padding: 1rem; background: var(--azul-suave); border-radius: 12px;">
      <h4>Variação</h4>
      <p>Entradas: ${variacaoEntradas >= 0 ? "+" : ""}${fmtValor(variacaoEntradas)} (${pctEntradas.toFixed(1)}%)</p>
      <p>Saídas: ${variacaoSaidas >= 0 ? "+" : ""}${fmtValor(variacaoSaidas)} (${pctSaidas.toFixed(1)}%)</p>
      <p>Saldo: ${variacaoSaldo >= 0 ? "+" : ""}${fmtValor(variacaoSaldo)} (${pctSaldo.toFixed(1)}%)</p>
    </div>
  `;
  document.getElementById("compararConteudo").innerHTML = html;
  document.getElementById("modalComparar").classList.add("show");
}

function calcularPeriodoAnterior() {
  const inicio = new Date(estado.periodo.inicio + "T12:00:00");
  const fim = new Date(estado.periodo.fim + "T12:00:00");
  const duracao = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));
  const novoFim = new Date(inicio);
  novoFim.setDate(inicio.getDate() - 1);
  const novoInicio = new Date(novoFim);
  novoInicio.setDate(novoFim.getDate() - duracao + 1);
  return {
    inicio: novoInicio.toISOString().split("T")[0],
    fim: novoFim.toISOString().split("T")[0],
  };
}

function calcularResumoPeriodo(inicio, fim) {
  let entradas = 0,
    saidas = 0;
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    )
      entradas += p.valor || 0;
  });
  estado.dados.receitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    )
      entradas += r.valor_recebido || r.valor || 0;
  });
  estado.dados.contas.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    )
      saidas += c.valor_pago || c.valor || 0;
  });
  const saldoInicial = calcularSaldoAte(inicio);
  const saldoFinal = saldoInicial + entradas - saidas;
  return { saldoInicial, entradas, saidas, saldoFinal };
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================
async function carregarDados() {
  try {
    const [parcelas, receitas, contas] = await Promise.all([
      supabaseClient.from("parcelas").select("*"),
      supabaseClient.from("outras_receitas").select("*"),
      supabaseClient.from("contas_pagar").select("*"),
    ]);

    if (parcelas.error) throw parcelas.error;
    if (receitas.error) throw receitas.error;
    if (contas.error) throw contas.error;

    estado.dados.parcelas = parcelas.data || [];
    estado.dados.receitas = receitas.data || [];
    estado.dados.contas = contas.data || [];

    const { data: alunos } = await supabaseClient
      .from("alunos")
      .select("id, nome");
    estado.dados.alunos = alunos || [];

    definirPeriodoPadrao();
    carregarPeriodosSalvos();
    carregarConfiguracoes();
    renderizarTudo();
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  }
}

// ============================================================
// FUNÇÕES DE PERÍODO
// ============================================================
function definirPeriodoPadrao() {
  const hoje = new Date();
  if (estado.tipoVisualizacao === "diario") {
    const fim = hoje;
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 29);
    estado.periodo.inicio = inicio.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
  } else if (estado.tipoVisualizacao === "semanal") {
    const fim = new Date(hoje);
    fim.setDate(hoje.getDate() + (28 - hoje.getDay()));
    estado.periodo.inicio = hoje.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
  } else if (estado.tipoVisualizacao === "mensal") {
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 11, 1);
    fim.setMonth(fim.getMonth() + 1);
    fim.setDate(0);
    estado.periodo.inicio = hoje.toISOString().split("T")[0];
    estado.periodo.fim = fim.toISOString().split("T")[0];
  }
  atualizarPeriodoDisplay();
}

function atualizarPeriodoDisplay() {
  document.getElementById("periodoAtual").textContent =
    `${fmtData(estado.periodo.inicio)} a ${fmtData(estado.periodo.fim)}`;
}

function setTipo(tipo) {
  estado.tipoVisualizacao = tipo;
  document
    .querySelectorAll(".periodo-tipo button")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .getElementById(`btn${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`)
    .classList.add("active");
  definirPeriodoPadrao();
  renderizarTudo();
}

function abrirSelecionarPeriodo() {
  document.getElementById("periodoInicio").value = estado.periodo.inicio;
  document.getElementById("periodoFim").value = estado.periodo.fim;
  document.getElementById("modalSelecionarPeriodo").classList.add("show");
}

function aplicarPeriodoPersonalizado() {
  const inicio = document.getElementById("periodoInicio").value;
  const fim = document.getElementById("periodoFim").value;
  if (!inicio || !fim) {
    mostrarToast("Selecione as datas de início e fim", "error");
    return;
  }
  estado.tipoVisualizacao = "personalizado";
  estado.periodo.inicio = inicio;
  estado.periodo.fim = fim;
  document
    .querySelectorAll(".periodo-tipo button")
    .forEach((btn) => btn.classList.remove("active"));
  atualizarPeriodoDisplay();
  fecharModal("modalSelecionarPeriodo");
  renderizarTudo();
}

function setHorizonte(dias) {
  estado.horizonteProjecao = dias;
  renderizarProjecao();
}

// ============================================================
// CÁLCULOS
// ============================================================
function calcularSaldoAte(data) {
  let saldo = 0;
  estado.dados.parcelas.forEach((p) => {
    if (p.status === "pago" && p.data_pagamento && p.data_pagamento < data)
      saldo += p.valor || 0;
  });
  estado.dados.receitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento < data
    )
      saldo += r.valor_recebido || r.valor || 0;
  });
  estado.dados.contas.forEach((c) => {
    if (c.status === "pago" && c.data_pagamento && c.data_pagamento < data)
      saldo -= c.valor_pago || c.valor || 0;
  });
  return saldo;
}

function calcularResumo() {
  const { inicio, fim } = estado.periodo;
  let entradas = 0,
    saidas = 0;

  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      entradas += p.valor || 0;
    }
  });
  estado.dados.receitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    ) {
      entradas += r.valor_recebido || r.valor || 0;
    }
  });
  estado.dados.contas.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      saidas += c.valor_pago || c.valor || 0;
    }
  });

  const saldoInicial = calcularSaldoAte(inicio);
  const saldoFinal = saldoInicial + entradas - saidas;

  return { saldoInicial, entradas, saidas, saldoFinal };
}

// Despesa média mensal (últimos 12 meses)
function calcularDespesaMediaMensal() {
  const hoje = new Date();
  let soma = 0;
  let count = 0;
  for (let i = 1; i <= 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
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
      .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);
    if (total > 0) {
      soma += total;
      count++;
    }
  }
  const media = count > 0 ? soma / count : 0;
  return { media, mesesUsados: count };
}

// Receita prevista vs recebida no período (taxa de conversão)
function calcularTaxaConversao() {
  const { inicio, fim } = estado.periodo;
  const previsto =
    estado.dados.parcelas
      .filter(
        (p) =>
          p.status !== "pago" &&
          p.vencimento &&
          p.vencimento >= inicio &&
          p.vencimento <= fim,
      )
      .reduce((acc, p) => acc + (p.valor || 0), 0) +
    estado.dados.receitas
      .filter(
        (r) =>
          r.status !== "recebido" &&
          r.data_vencimento &&
          r.data_vencimento >= inicio &&
          r.data_vencimento <= fim,
      )
      .reduce((acc, r) => acc + (r.valor || 0), 0);
  const recebido =
    estado.dados.parcelas
      .filter(
        (p) =>
          p.status === "pago" &&
          p.data_pagamento &&
          p.data_pagamento >= inicio &&
          p.data_pagamento <= fim,
      )
      .reduce((acc, p) => acc + (p.valor || 0), 0) +
    estado.dados.receitas
      .filter(
        (r) =>
          r.status === "recebido" &&
          r.data_recebimento &&
          r.data_recebimento >= inicio &&
          r.data_recebimento <= fim,
      )
      .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  const totalPrevisto = previsto + recebido; // inclui o que já foi recebido dentro do período
  const conversao = totalPrevisto > 0 ? (recebido / totalPrevisto) * 100 : 0;
  return { recebido, previsto: totalPrevisto, conversao };
}

// Projeção para horizonte especificado
function calcularProjecao(horizonte = 30) {
  const hoje = new Date();
  const projecao = [];
  let saldoAtual = calcularSaldoAte(hoje.toISOString().split("T")[0]);
  for (let i = 0; i < horizonte; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const dStr = d.toISOString().split("T")[0];
    let entradas = 0,
      saidas = 0;

    estado.dados.parcelas.forEach((p) => {
      if (p.status !== "pago" && p.vencimento === dStr)
        entradas += p.valor || 0;
    });
    estado.dados.receitas.forEach((r) => {
      if (r.status !== "recebido" && r.data_vencimento === dStr)
        entradas += r.valor || 0;
    });
    estado.dados.contas.forEach((c) => {
      if (c.status !== "pago" && c.data_vencimento === dStr)
        saidas += c.valor || 0;
    });

    saldoAtual += entradas - saidas;
    projecao.push({ data: dStr, saldo: saldoAtual, entradas, saidas });
  }
  return projecao;
}

// Top movimentos (maiores entradas e saídas)
function obterTopMovimentos(limite = 5) {
  const { inicio, fim } = estado.periodo;
  const movimentos = [];
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      const aluno = estado.dados.alunos.find((a) => a.id === p.aluno_id);
      movimentos.push({
        descricao: `Mensalidade - ${aluno?.nome || "Aluno"}`,
        valor: p.valor || 0,
        tipo: "entrada",
      });
    }
  });
  estado.dados.receitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    ) {
      movimentos.push({
        descricao: r.descricao,
        valor: r.valor_recebido || r.valor || 0,
        tipo: "entrada",
      });
    }
  });
  estado.dados.contas.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      movimentos.push({
        descricao: c.descricao,
        valor: c.valor_pago || c.valor || 0,
        tipo: "saida",
      });
    }
  });

  const entradas = movimentos
    .filter((m) => m.tipo === "entrada")
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
  const saidas = movimentos
    .filter((m) => m.tipo === "saida")
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
  return { entradas, saidas };
}

// Fluxo por categoria (para o período)
function obterFluxoCategoria() {
  const { inicio, fim } = estado.periodo;
  const categorias = {};
  estado.dados.parcelas.forEach((p) => {
    if (
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim
    ) {
      categorias["Mensalidades"] =
        (categorias["Mensalidades"] || 0) + (p.valor || 0);
    }
  });
  estado.dados.receitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento >= inicio &&
      r.data_recebimento <= fim
    ) {
      const cat = r.categoria || "Outras Receitas";
      categorias[cat] =
        (categorias[cat] || 0) + (r.valor_recebido || r.valor || 0);
    }
  });
  estado.dados.contas.forEach((c) => {
    if (
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim
    ) {
      const cat = c.categoria || "Outras Despesas";
      categorias[cat] = (categorias[cat] || 0) - (c.valor_pago || c.valor || 0);
    }
  });
  return categorias;
}

// Heatmap por dia da semana (entradas e saídas médias)
function calcularHeatmap() {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const fluxo = [0, 0, 0, 0, 0, 0, 0];
  const contagem = [0, 0, 0, 0, 0, 0, 0];
  const { inicio, fim } = estado.periodo;
  const inicioDate = new Date(inicio + "T12:00:00");
  const fimDate = new Date(fim + "T12:00:00");
  for (let d = new Date(inicioDate); d <= fimDate; d.setDate(d.getDate() + 1)) {
    const dStr = d.toISOString().split("T")[0];
    const diaSemana = d.getDay();
    let total = 0;
    estado.dados.parcelas.forEach((p) => {
      if (p.status === "pago" && p.data_pagamento === dStr)
        total += p.valor || 0;
    });
    estado.dados.receitas.forEach((r) => {
      if (r.status === "recebido" && r.data_recebimento === dStr)
        total += r.valor_recebido || r.valor || 0;
    });
    estado.dados.contas.forEach((c) => {
      if (c.status === "pago" && c.data_pagamento === dStr)
        total -= c.valor_pago || c.valor || 0;
    });
    fluxo[diaSemana] += total;
    contagem[diaSemana]++;
  }
  const medias = fluxo.map((soma, idx) =>
    contagem[idx] > 0 ? soma / contagem[idx] : 0,
  );
  return { dias, medias };
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderizarTudo() {
  mostrarLoading();
  try {
    renderizarResumo();
    renderizarIndicadores();
    renderizarAlertas();
    renderizarTopMovimentos();
    renderizarGraficos();
    renderizarHeatmap();
    renderizarProjecao();
    renderizarFluxoCategoria();
    renderizarTabela();
    renderizarDiagnostico();
  } catch (error) {
    console.error("Erro na renderização:", error);
    mostrarToast("Erro ao renderizar página", "error");
  } finally {
    esconderLoading();
  }
}

function renderizarResumo() {
  const { saldoInicial, entradas, saidas, saldoFinal } = calcularResumo();
  const container = document.getElementById("resumoContainer");
  container.innerHTML = `
    <div class="stat-card" title="Saldo no início do período (desconsidera movimentos do dia)">
      <div class="stat-icon"><i class="fas fa-coins"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(saldoInicial)}</div>
        <div class="stat-label">Saldo Inicial <i class="fas fa-question-circle" style="font-size:0.7rem;"></i></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(entradas)}</div>
        <div class="stat-label">Entradas</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(saidas)}</div>
        <div class="stat-label">Saídas</div>
      </div>
    </div>
    <div class="stat-card ${saldoFinal >= 0 ? "" : "critico"}">
      <div class="stat-icon"><i class="fas fa-balance-scale"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(saldoFinal)}</div>
        <div class="stat-label">Saldo Final</div>
      </div>
    </div>
  `;
}

function renderizarIndicadores() {
  const { media: despesaMedia, mesesUsados } = calcularDespesaMediaMensal();
  const capitalGiro = despesaMedia * 2;
  const { saldoFinal } = calcularResumo();
  const runway = despesaMedia > 0 ? saldoFinal / despesaMedia : 0;
  const { conversao } = calcularTaxaConversao();

  let semaforoClasse = "semaforo-verde";
  let semaforoTexto = "🟢 Saudável";
  if (runway < estado.limitesSaude.baixo) {
    semaforoClasse = "semaforo-vermelho";
    semaforoTexto = "🔴 Risco";
  } else if (runway < estado.limitesSaude.medio) {
    semaforoClasse = "semaforo-amarelo";
    semaforoTexto = "🟡 Atenção";
  }

  const container = document.getElementById("indicadoresContainer");
  container.innerHTML = `
    <div class="stat-card" title="Capital de giro recomendado para 2 meses de despesa média">
      <div class="stat-icon"><i class="fas fa-shield-alt"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(capitalGiro)}</div>
        <div class="stat-label">Capital de Giro (2 meses) <i class="fas fa-question-circle"></i></div>
      </div>
    </div>
    <div class="stat-card" title="Quantos meses de despesa o saldo atual consegue cobrir">
      <div class="stat-icon"><i class="fas fa-hourglass-half"></i></div>
      <div class="stat-info">
        <div class="stat-value">${runway.toFixed(1)} meses</div>
        <div class="stat-label">Autonomia (Runway) <i class="fas fa-question-circle"></i></div>
      </div>
    </div>
    <div class="stat-card" title="Percentual de receitas previstas que foram efetivamente recebidas no período">
      <div class="stat-icon"><i class="fas fa-percent"></i></div>
      <div class="stat-info">
        <div class="stat-value">${conversao.toFixed(1)}%</div>
        <div class="stat-label">Taxa de Recebimento <i class="fas fa-question-circle"></i></div>
      </div>
    </div>
    <div class="stat-card ${semaforoClasse}" title="Baseado na autonomia (runway)">
      <div class="stat-icon"><i class="fas fa-heartbeat"></i></div>
      <div class="stat-info">
        <div class="stat-value">${semaforoTexto}</div>
        <div class="stat-label">Saúde do Caixa <i class="fas fa-question-circle"></i></div>
      </div>
    </div>
  `;
  // Adiciona aviso se poucos meses de despesa
  if (mesesUsados < 12) {
    mostrarToast(
      `Despesa média calculada com apenas ${mesesUsados} meses de dados.`,
      "alerta",
    );
  }
}

function renderizarAlertas() {
  const proj30 = calcularProjecao(30);
  const saldoNegativo = proj30.find((p) => p.saldo < 0);
  const alertas = [];
  if (saldoNegativo) {
    alertas.push({
      tipo: "urgente",
      icone: "exclamation-triangle",
      mensagem: `Saldo negativo previsto em ${fmtData(saldoNegativo.data)} (${fmtValor(saldoNegativo.saldo)})`,
    });
  }
  const { media: despesaMedia } = calcularDespesaMediaMensal();
  const capitalMinimo = despesaMedia * 2;
  const { saldoFinal } = calcularResumo();
  if (saldoFinal < capitalMinimo) {
    alertas.push({
      tipo: "atencao",
      icone: "exclamation-circle",
      mensagem: `Caixa abaixo do mínimo recomendado (${fmtValor(saldoFinal)} < ${fmtValor(capitalMinimo)})`,
    });
  }
  const container = document.getElementById("alertasContainer");
  if (alertas.length === 0) {
    container.innerHTML = `<div class="alerta-card info" style="border-left-color:var(--azul-info);"><i class="fas fa-check-circle" style="color:var(--azul-info);"></i><div class="alerta-texto">Nenhum alerta no momento.</div></div>`;
    return;
  }
  container.innerHTML = alertas
    .map(
      (a) => `
    <div class="alerta-card ${a.tipo}">
      <i class="fas fa-${a.icone}"></i>
      <div class="alerta-texto">${a.mensagem}</div>
    </div>
  `,
    )
    .join("");
}

function renderizarTopMovimentos() {
  const { entradas, saidas } = obterTopMovimentos(5);
  const container = document.getElementById("topContainer");
  container.innerHTML = `
    <div class="top-card">
      <h4 style="margin-bottom:0.5rem;">💰 Maiores Entradas</h4>
      ${entradas
        .map(
          (e) =>
            `<div class="top-item"><span>${e.descricao}</span><span>${fmtValor(e.valor)}</span></div>`,
        )
        .join("")}
    </div>
    <div class="top-card">
      <h4 style="margin-bottom:0.5rem;">💸 Maiores Saídas</h4>
      ${saidas
        .map(
          (s) =>
            `<div class="top-item"><span>${s.descricao}</span><span>${fmtValor(s.valor)}</span></div>`,
        )
        .join("")}
    </div>
  `;
}

let graficoSaldo, graficoComposicao, graficoProjecao;

function destruirGraficos() {
  if (graficoSaldo) graficoSaldo.destroy();
  if (graficoComposicao) graficoComposicao.destroy();
  if (graficoProjecao) graficoProjecao.destroy();
}

function renderizarGraficos() {
  destruirGraficos();

  // Gráfico de saldo acumulado com agregação semanal se período > 60 dias
  const inicio = new Date(estado.periodo.inicio + "T12:00:00");
  const fim = new Date(estado.periodo.fim + "T12:00:00");
  const dias = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));
  const agregarSemanal = dias > 60;

  const ctxSaldo = document.getElementById("graficoSaldo")?.getContext("2d");
  if (ctxSaldo) {
    let labels = [];
    let saldoData = [];
    let saldoAcum = calcularSaldoAte(estado.periodo.inicio);
    if (agregarSemanal) {
      let semana = [];
      let semanaIndex = 0;
      for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split("T")[0];
        let entrada = 0,
          saida = 0;
        estado.dados.parcelas.forEach((p) => {
          if (p.status === "pago" && p.data_pagamento === dStr)
            entrada += p.valor || 0;
        });
        estado.dados.receitas.forEach((r) => {
          if (r.status === "recebido" && r.data_recebimento === dStr)
            entrada += r.valor_recebido || r.valor || 0;
        });
        estado.dados.contas.forEach((c) => {
          if (c.status === "pago" && c.data_pagamento === dStr)
            saida += c.valor_pago || c.valor || 0;
        });
        saldoAcum += entrada - saida;
        semana.push(saldoAcum);
        if (semana.length === 7 || d.getTime() === fim.getTime()) {
          const mediaSemana = semana.reduce((a, b) => a + b, 0) / semana.length;
          labels.push(`Sem ${++semanaIndex}`);
          saldoData.push(mediaSemana);
          semana = [];
        }
      }
    } else {
      for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        const dStr = d.toISOString().split("T")[0];
        labels.push(d.getDate() + "/" + (d.getMonth() + 1));
        let entrada = 0,
          saida = 0;
        estado.dados.parcelas.forEach((p) => {
          if (p.status === "pago" && p.data_pagamento === dStr)
            entrada += p.valor || 0;
        });
        estado.dados.receitas.forEach((r) => {
          if (r.status === "recebido" && r.data_recebimento === dStr)
            entrada += r.valor_recebido || r.valor || 0;
        });
        estado.dados.contas.forEach((c) => {
          if (c.status === "pago" && c.data_pagamento === dStr)
            saida += c.valor_pago || c.valor || 0;
        });
        saldoAcum += entrada - saida;
        saldoData.push(saldoAcum);
      }
    }

    graficoSaldo = new Chart(ctxSaldo, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Saldo Acumulado",
            data: saldoData,
            borderColor: "#3498DB",
            backgroundColor: "rgba(52,152,219,0.1)",
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

  const ctxComp = document
    .getElementById("graficoComposicao")
    ?.getContext("2d");
  if (ctxComp) {
    const totalEntradas =
      estado.dados.parcelas
        .filter(
          (p) =>
            p.status === "pago" &&
            p.data_pagamento >= estado.periodo.inicio &&
            p.data_pagamento <= estado.periodo.fim,
        )
        .reduce((acc, p) => acc + (p.valor || 0), 0) +
      estado.dados.receitas
        .filter(
          (r) =>
            r.status === "recebido" &&
            r.data_recebimento >= estado.periodo.inicio &&
            r.data_recebimento <= estado.periodo.fim,
        )
        .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
    const totalSaidas = estado.dados.contas
      .filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento >= estado.periodo.inicio &&
          c.data_pagamento <= estado.periodo.fim,
      )
      .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);

    graficoComposicao = new Chart(ctxComp, {
      type: "doughnut",
      data: {
        labels: ["Entradas", "Saídas"],
        datasets: [
          {
            data: [totalEntradas, totalSaidas],
            backgroundColor: ["#27AE60", "#E74C3C"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: { label: (c) => `${c.label}: ${fmtValor(c.raw)}` },
          },
        },
        cutout: "70%",
      },
    });
  }
}

function renderizarHeatmap() {
  const { dias, medias } = calcularHeatmap();
  const container = document.getElementById("heatmapContainer");
  container.innerHTML = `
    <h3 class="chart-title"><i class="fas fa-calendar-alt"></i> Fluxo Médio por Dia da Semana</h3>
    <div class="heatmap-grid">
      ${dias
        .map((dia, idx) => {
          const valor = medias[idx];
          const cor = valor >= 0 ? "#27AE60" : "#E74C3C";
          return `<div class="heatmap-dia" style="background:${cor}20;" onclick="filtrarPorDiaSemana(${idx})">
            <div class="dia-nome">${dia}</div>
            <div class="dia-valor" style="color:${cor};">${fmtValor(valor)}</div>
          </div>`;
        })
        .join("")}
    </div>
  `;
}

function filtrarPorDiaSemana(dia) {
  // Filtra a tabela mostrando apenas movimentos naquele dia da semana
  const movimentos = obterMovimentacoesFiltradas();
  const filtradas = movimentos.filter((m) => {
    const data = new Date(m.data + "T12:00:00");
    return data.getDay() === dia;
  });
  renderizarTabelaFiltrada(filtradas);
  mostrarToast(
    `Filtrando apenas ${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][dia]}`,
    "info",
  );
}

function renderizarTabelaFiltrada(mov) {
  const tbody = document.getElementById("tbodyMovimentacoes");
  if (mov.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center; padding:2rem;">Nenhuma movimentação no período</td></tr>';
    return;
  }
  tbody.innerHTML = mov
    .map(
      (m) => `
    <tr onclick="abrirDetalhesTransacao(${JSON.stringify(m).replace(/"/g, "&quot;")})">
      <td>${fmtData(m.data)}</td>
      <td>${m.descricao}</td>
      <td>${m.categoria}</td>
      <td>${fmtValor(m.valor)}</td>
      <td><span class="tipo-badge ${m.tipo}">${m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
    </tr>
  `,
    )
    .join("");
}

function abrirDetalhesTransacao(transacao) {
  const html = `
    <p><strong>Data:</strong> ${fmtData(transacao.data)}</p>
    <p><strong>Descrição:</strong> ${transacao.descricao}</p>
    <p><strong>Categoria:</strong> ${transacao.categoria}</p>
    <p><strong>Valor:</strong> ${fmtValor(transacao.valor)}</p>
    <p><strong>Tipo:</strong> ${transacao.tipo === "entrada" ? "Entrada" : "Saída"}</p>
  `;
  document.getElementById("detalhesConteudo").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

function renderizarProjecao() {
  const projecao = calcularProjecao(estado.horizonteProjecao);
  const ctx = document.getElementById("graficoProjecao")?.getContext("2d");
  if (!ctx) return;

  const labels = projecao.map((p) => fmtData(p.data));
  const saldos = projecao.map((p) => p.saldo);
  const entradas = projecao.map((p) => p.entradas);
  const saidas = projecao.map((p) => p.saidas);

  if (graficoProjecao) graficoProjecao.destroy();
  graficoProjecao = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Saldo Projetado",
          data: saldos,
          borderColor: "#3498DB",
          backgroundColor: "rgba(52,152,219,0.1)",
          tension: 0.4,
          fill: true,
          yAxisID: "y",
        },
        {
          label: "Entradas",
          data: entradas,
          borderColor: "#27AE60",
          borderDash: [5, 5],
          fill: false,
          yAxisID: "y1",
        },
        {
          label: "Saídas",
          data: saidas,
          borderColor: "#E74C3C",
          borderDash: [5, 5],
          fill: false,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtValor(ctx.raw)}`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "Saldo" },
          ticks: { callback: (v) => fmtValor(v) },
        },
        y1: {
          position: "right",
          title: { display: true, text: "Fluxo do dia" },
          ticks: { callback: (v) => fmtValor(v) },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  let menorSaldo = { valor: Infinity, data: null };
  let maiorSaida = { valor: -Infinity, data: null };
  projecao.forEach((p) => {
    if (p.saldo < menorSaldo.valor) {
      menorSaldo = { valor: p.saldo, data: p.data };
    }
    if (p.saidas > maiorSaida.valor) {
      maiorSaida = { valor: p.saidas, data: p.data };
    }
  });
  document.getElementById("menorSaldo").textContent = menorSaldo.data
    ? `${fmtData(menorSaldo.data)} (${fmtValor(menorSaldo.valor)})`
    : "-";
  document.getElementById("maiorSaida").textContent = maiorSaida.data
    ? `${fmtData(maiorSaida.data)} (${fmtValor(maiorSaida.valor)})`
    : "-";
}

function exportarProjecaoPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Projeção de Fluxo de Caixa", 14, 20);
  doc.setFontSize(10);
  doc.text(`Horizonte: ${estado.horizonteProjecao} dias`, 14, 28);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 34);
  const projecao = calcularProjecao(estado.horizonteProjecao);
  const body = projecao.map((p) => [
    fmtData(p.data),
    fmtValor(p.entradas),
    fmtValor(p.saidas),
    fmtValor(p.saldo),
  ]);
  doc.autoTable({
    startY: 40,
    head: [["Data", "Entradas", "Saídas", "Saldo"]],
    body,
    theme: "striped",
    styles: { fontSize: 8 },
  });
  doc.save(`projecao_${estado.horizonteProjecao}dias.pdf`);
  mostrarToast("Projeção exportada com sucesso!", "success");
}

function renderizarFluxoCategoria() {
  const categorias = obterFluxoCategoria();
  const container = document.getElementById("fluxoCategoria");
  const sorted = Object.entries(categorias).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted
    .map(
      ([cat, val]) => `
    <div class="compact-row">
      <span class="compact-label">${cat}</span>
      <span class="compact-value" style="color:${val >= 0 ? "var(--verde-sucesso)" : "var(--vermelho-urgente)"};">${fmtValor(val)}</span>
    </div>
  `,
    )
    .join("");
}

function obterMovimentacoesFiltradas() {
  const { inicio, fim } = estado.periodo;
  const mov = [];

  if (estado.filtrosTipo.mensalidades) {
    estado.dados.parcelas.forEach((p) => {
      if (
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim
      ) {
        const aluno = estado.dados.alunos.find((a) => a.id === p.aluno_id);
        mov.push({
          data: p.data_pagamento,
          descricao: `Mensalidade - ${aluno?.nome || "Aluno"}`,
          categoria: "Mensalidade",
          valor: p.valor || 0,
          tipo: "entrada",
        });
      }
    });
  }

  if (estado.filtrosTipo.outras) {
    estado.dados.receitas.forEach((r) => {
      if (
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim
      ) {
        mov.push({
          data: r.data_recebimento,
          descricao: r.descricao,
          categoria: r.categoria || "Outras",
          valor: r.valor_recebido || r.valor || 0,
          tipo: "entrada",
        });
      }
    });
  }

  if (estado.filtrosTipo.despesas) {
    estado.dados.contas.forEach((c) => {
      if (
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim
      ) {
        mov.push({
          data: c.data_pagamento,
          descricao: c.descricao,
          categoria: c.categoria || "Despesas",
          valor: c.valor_pago || c.valor || 0,
          tipo: "saida",
        });
      }
    });
  }

  mov.sort((a, b) => a.data.localeCompare(b.data));
  return mov;
}

function renderizarTabela() {
  const mov = obterMovimentacoesFiltradas();
  const busca =
    document.getElementById("buscaTabela")?.value.toLowerCase() || "";
  const filtrados = mov.filter(
    (m) =>
      m.descricao.toLowerCase().includes(busca) ||
      m.categoria.toLowerCase().includes(busca),
  );
  renderizarTabelaFiltrada(filtrados);
}

function filtrarTabela() {
  estado.filtrosTipo.mensalidades =
    document.getElementById("filtroMensalidades").checked;
  estado.filtrosTipo.outras = document.getElementById("filtroOutras").checked;
  estado.filtrosTipo.despesas =
    document.getElementById("filtroDespesas").checked;
  renderizarTabela();
}

function renderizarDiagnostico() {
  const { saldoFinal } = calcularResumo();
  const { media: despesaMedia, mesesUsados } = calcularDespesaMediaMensal();
  const runway = despesaMedia > 0 ? saldoFinal / despesaMedia : 0;
  const { conversao } = calcularTaxaConversao();
  const { entradas, saidas } = calcularResumo();
  const diagnostico = [];

  if (runway < estado.limitesSaude.baixo) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-exclamation-triangle"></i> Autonomia baixa (${runway.toFixed(1)} meses).</span>`,
    );
  } else if (runway > 6) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-check-circle"></i> Autonomia excelente (${runway.toFixed(1)} meses).</span>`,
    );
  }

  if (entradas > saidas * 1.2) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-arrow-up"></i> Receitas superando despesas em ${(((entradas - saidas) / saidas) * 100).toFixed(1)}%.</span>`,
    );
  } else if (saidas > entradas) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-arrow-down"></i> Despesas superam receitas. Déficit de ${fmtValor(saidas - entradas)}.</span>`,
    );
  }

  if (conversao < 70) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-exclamation-triangle"></i> Taxa de recebimento baixa (${conversao.toFixed(1)}%).</span>`,
    );
  }

  if (mesesUsados < 12) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-info-circle"></i> Despesa média baseada em apenas ${mesesUsados} meses.</span>`,
    );
  }

  if (diagnostico.length === 0) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-check-circle"></i> Tudo dentro do esperado.</span>`,
    );
  }

  document.getElementById("diagnosticoContainer").innerHTML =
    diagnostico.join("");
}

// ============================================================
// EXPORTAÇÃO
// ============================================================
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Fluxo de Caixa", 14, 22);
  doc.setFontSize(10);
  doc.text(
    `Período: ${document.getElementById("periodoAtual").textContent}`,
    14,
    30,
  );
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 36);

  const body = [];
  document.querySelectorAll("#tbodyMovimentacoes tr").forEach((tr) => {
    const linha = [];
    tr.querySelectorAll("td").forEach((td) => linha.push(td.innerText));
    body.push(linha);
  });

  doc.autoTable({
    startY: 45,
    head: [["Data", "Descrição", "Categoria", "Valor", "Tipo"]],
    body,
    theme: "striped",
    styles: { fontSize: 8 },
  });

  doc.save(`fluxo_caixa_${new Date().toISOString().split("T")[0]}.pdf`);
  mostrarToast("PDF gerado!", "success");
}

function exportarExcel() {
  const wb = XLSX.utils.book_new();
  const dados = [["Fluxo de Caixa"]];
  dados.push(["Período:", document.getElementById("periodoAtual").textContent]);
  dados.push([]);
  dados.push(["Data", "Descrição", "Categoria", "Valor", "Tipo"]);

  document.querySelectorAll("#tbodyMovimentacoes tr").forEach((tr) => {
    const linha = [];
    tr.querySelectorAll("td").forEach((td) => linha.push(td.innerText));
    dados.push(linha);
  });

  const ws = XLSX.utils.aoa_to_sheet(dados);
  XLSX.utils.book_append_sheet(wb, ws, "Fluxo de Caixa");
  XLSX.writeFile(
    wb,
    `fluxo_caixa_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  mostrarToast("Excel gerado!", "success");
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await verificarLogin();
  mostrarLoading();
  await carregarDados();
  esconderLoading();
});
