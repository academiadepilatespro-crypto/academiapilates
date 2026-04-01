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
  periodo: {
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    inicio: null,
    fim: null,
  },
  dados: {
    parcelas: [],
    outrasReceitas: [],
    contasPagar: [],
    alunos: [],
    planosAlunos: [], // nova tabela para controle de matrículas/cancelamentos
    metas: [],
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

function diasAte(data) {
  if (!data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(data + "T12:00:00");
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
}

function fecharModal(id) {
  document.getElementById(id).style.display = "none";
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
    const [parcelas, receitas, contas, alunos, planosAlunos, metas] =
      await Promise.all([
        supabaseClient.from("parcelas").select("*"),
        supabaseClient.from("outras_receitas").select("*"),
        supabaseClient.from("contas_pagar").select("*"),
        supabaseClient.from("alunos").select("id, nome, ativo"),
        supabaseClient
          .from("planos_alunos")
          .select("*")
          .order("data_matricula", { ascending: false }),
        supabaseClient
          .from("metas")
          .select("*")
          .order("ano", { ascending: false })
          .order("mes", { ascending: false }),
      ]);

    if (parcelas.error) throw parcelas.error;
    if (receitas.error) throw receitas.error;
    if (contas.error) throw contas.error;
    if (alunos.error) throw alunos.error;
    if (planosAlunos.error) throw planosAlunos.error;
    if (metas.error) throw metas.error;

    estado.dados.parcelas = parcelas.data || [];
    estado.dados.outrasReceitas = receitas.data || [];
    estado.dados.contasPagar = contas.data || [];
    estado.dados.alunos = alunos.data || [];
    estado.dados.planosAlunos = planosAlunos.data || [];
    estado.dados.metas = metas.data || [];
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
    // Garante arrays vazios para não quebrar renderização
    estado.dados.parcelas = [];
    estado.dados.outrasReceitas = [];
    estado.dados.contasPagar = [];
    estado.dados.alunos = [];
    estado.dados.planosAlunos = [];
    estado.dados.metas = [];
  }
}

async function recarregarDados() {
  mostrarLoading();
  await carregarDados();
  await renderizarDashboard();
  esconderLoading();
  mostrarToast("Dados atualizados!", "success");
}

// ============================================================
// FUNÇÕES DE PERÍODO
// ============================================================
function atualizarPeriodo() {
  const primeiroDia = new Date(estado.periodo.ano, estado.periodo.mes - 1, 1);
  const ultimoDia = new Date(estado.periodo.ano, estado.periodo.mes, 0);
  estado.periodo.inicio = primeiroDia.toISOString().split("T")[0];
  estado.periodo.fim = ultimoDia.toISOString().split("T")[0];

  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  document.getElementById("periodoDisplay").textContent =
    `${meses[estado.periodo.mes - 1]} ${estado.periodo.ano}`;
}

function abrirSelecionarMes() {
  document.getElementById("mesSelecionado").value = estado.periodo.mes;
  document.getElementById("anoSelecionado").value = estado.periodo.ano;
  document.getElementById("modalSelecionarMes").style.display = "flex";
}

function aplicarMesSelecionado() {
  estado.periodo.mes = parseInt(
    document.getElementById("mesSelecionado").value,
  );
  estado.periodo.ano = parseInt(
    document.getElementById("anoSelecionado").value,
  );
  atualizarPeriodo();
  fecharModal("modalSelecionarMes");
  renderizarDashboard();
}

// ============================================================
// CÁLCULOS
// ============================================================
function calcularIndicadores() {
  const { inicio, fim } = estado.periodo;

  const dataInicioAnterior = new Date(inicio + "T12:00:00");
  dataInicioAnterior.setMonth(dataInicioAnterior.getMonth() - 1);
  const dataFimAnterior = new Date(fim + "T12:00:00");
  dataFimAnterior.setMonth(dataFimAnterior.getMonth() - 1);
  const inicioAnterior = dataInicioAnterior.toISOString().split("T")[0];
  const fimAnterior = dataFimAnterior.toISOString().split("T")[0];

  const receitasMensalidades = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const receitasOutras = estado.dados.outrasReceitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  const receitas = receitasMensalidades + receitasOutras;

  const receitasMensalidadesAnt = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicioAnterior &&
        p.data_pagamento <= fimAnterior,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const receitasOutrasAnt = estado.dados.outrasReceitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicioAnterior &&
        r.data_recebimento <= fimAnterior,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  const receitasAnt = receitasMensalidadesAnt + receitasOutrasAnt;

  const despesas = estado.dados.contasPagar
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim,
    )
    .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);
  const despesasAnt = estado.dados.contasPagar
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicioAnterior &&
        c.data_pagamento <= fimAnterior,
    )
    .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);

  const saldo = receitas - despesas;
  const saldoAnt = receitasAnt - despesasAnt;

  const parcelasVencidas = estado.dados.parcelas.filter(
    (p) =>
      p.vencimento &&
      p.vencimento >= inicio &&
      p.vencimento <= fim &&
      p.status !== "pago",
  ).length;
  const totalParcelasPeriodo = estado.dados.parcelas.filter(
    (p) => p.vencimento && p.vencimento >= inicio && p.vencimento <= fim,
  ).length;
  const inadimplencia =
    totalParcelasPeriodo > 0
      ? (parcelasVencidas / totalParcelasPeriodo) * 100
      : 0;

  const parcelasPagas = estado.dados.parcelas.filter(
    (p) =>
      p.status === "pago" &&
      p.data_pagamento &&
      p.data_pagamento >= inicio &&
      p.data_pagamento <= fim,
  );
  const ticketMedio =
    parcelasPagas.length > 0
      ? parcelasPagas.reduce((acc, p) => acc + p.valor, 0) /
        parcelasPagas.length
      : 0;

  let varReceitas = 0,
    varDespesas = 0,
    varSaldo = 0;
  if (receitasAnt !== 0)
    varReceitas = ((receitas - receitasAnt) / receitasAnt) * 100;
  else if (receitas !== 0) varReceitas = 100;
  if (despesasAnt !== 0)
    varDespesas = ((despesas - despesasAnt) / despesasAnt) * 100;
  if (saldoAnt !== 0)
    varSaldo = ((saldo - saldoAnt) / Math.abs(saldoAnt)) * 100;

  return {
    receitas,
    varReceitas,
    despesas,
    varDespesas,
    saldo,
    varSaldo,
    inadimplencia,
    ticketMedio,
  };
}

function calcularMeta() {
  const metaAtual = estado.dados.metas.find(
    (m) => m.mes === estado.periodo.mes && m.ano === estado.periodo.ano,
  );
  const valorMeta = metaAtual ? metaAtual.valor_meta : 0;
  const { receitas } = calcularIndicadores();
  const percentual = valorMeta > 0 ? (receitas / valorMeta) * 100 : 0;
  return { valorMeta, receitas, percentual };
}

function calcularSaldoAtual() {
  const hojeStr = hoje();
  let saldo = 0;
  estado.dados.parcelas.forEach((p) => {
    if (p.status === "pago" && p.data_pagamento && p.data_pagamento <= hojeStr)
      saldo += p.valor || 0;
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (
      r.status === "recebido" &&
      r.data_recebimento &&
      r.data_recebimento <= hojeStr
    )
      saldo += r.valor_recebido || r.valor || 0;
  });
  estado.dados.contasPagar.forEach((c) => {
    if (c.status === "pago" && c.data_pagamento && c.data_pagamento <= hojeStr)
      saldo -= c.valor_pago || c.valor || 0;
  });

  const aReceber =
    estado.dados.parcelas
      .filter((p) => p.status !== "pago" && p.vencimento)
      .reduce((acc, p) => acc + (p.valor || 0), 0) +
    estado.dados.outrasReceitas
      .filter((r) => r.status !== "recebido" && r.data_vencimento)
      .reduce((acc, r) => acc + (r.valor || 0), 0);
  const aPagar = estado.dados.contasPagar
    .filter((c) => c.status !== "pago" && c.data_vencimento)
    .reduce((acc, c) => acc + (c.valor || 0), 0);
  const projetado = saldo + aReceber - aPagar;

  return { saldo, aReceber, aPagar, projetado };
}

function calcularReceitasRecorrentesExtras() {
  const { inicio, fim } = estado.periodo;
  const recorrente = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const extra = estado.dados.outrasReceitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  return { recorrente, extra };
}

function calcularSaudeFinanceira() {
  const { saldo, aReceber, aPagar } = calcularSaldoAtual();
  const projetado = saldo + aReceber - aPagar;
  const { inadimplencia } = calcularIndicadores();
  const { saldo: resultadoPeriodo } = calcularIndicadores();

  const caixaPositivo = projetado > 0;
  const inadimplenciaBaixa = inadimplencia < 10;
  const lucroPositivo = resultadoPeriodo > 0;

  if (caixaPositivo && inadimplenciaBaixa && lucroPositivo) {
    return { status: "Boa", classe: "status-boa", icone: "🟢" };
  } else if (!caixaPositivo || inadimplencia > 20 || resultadoPeriodo < 0) {
    return { status: "Crítica", classe: "status-critica", icone: "🔴" };
  } else {
    return { status: "Atenção", classe: "status-atencao", icone: "🟡" };
  }
}

function calcularKpiAlunos() {
  const hojeStr = hoje();
  const mesAtual = hojeStr.substring(0, 7);

  // Alunos ativos: aqueles com plano ativo (sem data_cancelamento ou status 'ativo')
  // Para isso, consideramos planos_alunos com data_cancelamento IS NULL OU status = 'ativo'
  const ativos = estado.dados.planosAlunos.filter(
    (p) => p.status === "ativo" && !p.data_cancelamento,
  ).length;

  // Novos alunos no mês atual: planos_alunos com data_matricula no mês atual
  const novos = estado.dados.planosAlunos.filter(
    (p) => p.data_matricula && p.data_matricula.substring(0, 7) === mesAtual,
  ).length;

  // Cancelamentos no mês atual: planos_alunos com data_cancelamento no mês atual
  const cancelamentos = estado.dados.planosAlunos.filter(
    (p) =>
      p.data_cancelamento && p.data_cancelamento.substring(0, 7) === mesAtual,
  ).length;

  return { ativos, novos, cancelamentos };
}

// ============================================================
// LISTAS E RANKING
// ============================================================
function obterRankingDespesas(limite = 5) {
  const { inicio, fim } = estado.periodo;
  return estado.dados.contasPagar
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim,
    )
    .map((c) => ({
      descricao: c.descricao,
      valor: c.valor_pago || c.valor || 0,
      categoria: c.categoria,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

function obterAgendaSemana() {
  const hojeStr = hoje();
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hojeStr + "T12:00:00");
    d.setDate(d.getDate() + i);
    const dStr = d.toISOString().split("T")[0];
    const diaSemana = d.toLocaleDateString("pt-BR", { weekday: "short" });
    const receber =
      estado.dados.parcelas
        .filter((p) => p.status !== "pago" && p.vencimento === dStr)
        .reduce((acc, p) => acc + (p.valor || 0), 0) +
      estado.dados.outrasReceitas
        .filter((r) => r.status !== "recebido" && r.data_vencimento === dStr)
        .reduce((acc, r) => acc + (r.valor || 0), 0);
    const pagar = estado.dados.contasPagar
      .filter((c) => c.status !== "pago" && c.data_vencimento === dStr)
      .reduce((acc, c) => acc + (c.valor || 0), 0);
    dias.push({ data: dStr, diaSemana, receber, pagar });
  }
  return dias;
}

function obterProximosRecebimentos(limite = 5) {
  const recebimentos = [];
  estado.dados.parcelas.forEach((p) => {
    if (p.status !== "pago" && p.vencimento) {
      const aluno = estado.dados.alunos.find((a) => a.id === p.aluno_id);
      recebimentos.push({
        descricao: `Mensalidade - ${aluno?.nome || "Aluno"}`,
        valor: p.valor,
        data: p.vencimento,
        dias: diasAte(p.vencimento),
      });
    }
  });
  estado.dados.outrasReceitas.forEach((r) => {
    if (r.status !== "recebido" && r.data_vencimento) {
      recebimentos.push({
        descricao: r.descricao,
        valor: r.valor,
        data: r.data_vencimento,
        dias: diasAte(r.data_vencimento),
      });
    }
  });
  return recebimentos.sort((a, b) => a.dias - b.dias).slice(0, limite);
}

function obterProximasContas(limite = 5) {
  return estado.dados.contasPagar
    .filter((c) => c.status === "pendente" && c.data_vencimento)
    .map((c) => ({
      descricao: c.descricao,
      valor: c.valor,
      data: c.data_vencimento,
      dias: diasAte(c.data_vencimento),
    }))
    .sort((a, b) => a.dias - b.dias)
    .slice(0, limite);
}

// ============================================================
// ALERTAS
// ============================================================
function calcularRiscoCaixa() {
  const { saldo, aReceber, aPagar } = calcularSaldoAtual();
  const projetado = saldo + aReceber - aPagar;
  if (projetado < 0) {
    const hojeStr = hoje();
    const movimentos = [];
    estado.dados.parcelas
      .filter((p) => p.status !== "pago" && p.vencimento)
      .forEach((p) =>
        movimentos.push({
          data: p.vencimento,
          valor: p.valor || 0,
          tipo: "entrada",
        }),
      );
    estado.dados.outrasReceitas
      .filter((r) => r.status !== "recebido" && r.data_vencimento)
      .forEach((r) =>
        movimentos.push({
          data: r.data_vencimento,
          valor: r.valor || 0,
          tipo: "entrada",
        }),
      );
    estado.dados.contasPagar
      .filter((c) => c.status !== "pago" && c.data_vencimento)
      .forEach((c) =>
        movimentos.push({
          data: c.data_vencimento,
          valor: -(c.valor || 0),
          tipo: "saida",
        }),
      );
    movimentos.sort((a, b) => a.data.localeCompare(b.data));
    let saldoAtual = saldo;
    for (let mov of movimentos) {
      saldoAtual += mov.valor;
      if (saldoAtual < 0) {
        const dias = diasAte(mov.data);
        return { risco: true, dias: Math.abs(dias) };
      }
    }
  }
  return { risco: false };
}

function gerarAlertas() {
  const alertas = [];
  const hojeStr = hoje();

  const atrasadas = estado.dados.parcelas.filter(
    (p) => p.status === "atrasado",
  );
  if (atrasadas.length > 0) {
    const total = atrasadas.reduce((acc, p) => acc + (p.valor || 0), 0);
    alertas.push({
      tipo: "urgente",
      icone: "exclamation-triangle",
      titulo: `⚠️ ${atrasadas.length} parcela(s) atrasada(s)`,
      mensagem: `Total: ${fmtValor(total)}.`,
      acao: "Regularizar",
      link: "mensalidades.html",
    });
  }

  const contasVencidas = estado.dados.contasPagar.filter(
    (c) => c.status === "pendente" && c.data_vencimento < hojeStr,
  );
  if (contasVencidas.length > 0) {
    const total = contasVencidas.reduce((acc, c) => acc + (c.valor || 0), 0);
    alertas.push({
      tipo: "urgente",
      icone: "calendar-times",
      titulo: `🔴 ${contasVencidas.length} conta(s) vencida(s)`,
      mensagem: `Total: ${fmtValor(total)}.`,
      acao: "Pagar",
      link: "pagar.html",
    });
  }

  const contasHoje = estado.dados.contasPagar.filter(
    (c) => c.status === "pendente" && c.data_vencimento === hojeStr,
  );
  if (contasHoje.length > 0) {
    const total = contasHoje.reduce((acc, c) => acc + (c.valor || 0), 0);
    alertas.push({
      tipo: "atencao",
      icone: "calendar-day",
      titulo: `📅 ${contasHoje.length} conta(s) vence(m) hoje`,
      mensagem: `Total: ${fmtValor(total)}.`,
      acao: "Pagar agora",
      link: "pagar.html",
    });
  }

  const risco = calcularRiscoCaixa();
  if (risco.risco) {
    alertas.push({
      tipo: "atencao",
      icone: "chart-line",
      titulo: "⚠️ Risco de caixa",
      mensagem: `Seu caixa pode ficar negativo em ${risco.dias} dias.`,
      acao: "Analisar",
      link: "fluxocaixa.html",
    });
  }

  const meta = calcularMeta();
  if (meta.valorMeta > 0 && meta.percentual < 100) {
    alertas.push({
      tipo: "atencao",
      icone: "bullseye",
      titulo: `🎯 Meta não atingida`,
      mensagem: `Realizado ${fmtValor(meta.receitas)} de ${fmtValor(meta.valorMeta)} (${meta.percentual.toFixed(1)}%).`,
      acao: "Acompanhar",
      link: "dre.html",
    });
  }

  return alertas;
}

function renderizarAlertas() {
  const alertas = gerarAlertas();
  const container = document.getElementById("alertasContainer");
  if (alertas.length === 0) {
    container.innerHTML = `<div class="alerta-card info" style="border-left-color:var(--azul-info);"><i class="fas fa-check-circle" style="color:var(--azul-info);"></i><div class="alerta-texto">Tudo em dia! Nenhum alerta no momento.</div></div>`;
    return;
  }
  container.innerHTML = alertas
    .map(
      (a) => `
    <div class="alerta-card ${a.tipo}" onclick="window.location.href='${a.link}'">
      <i class="fas fa-${a.icone}"></i>
      <div class="alerta-texto"><strong>${a.titulo}</strong><br>${a.mensagem}</div>
      <span class="alerta-botao">${a.acao}</span>
    </div>
  `,
    )
    .join("");
}

// ============================================================
// RENDERIZAÇÃO DOS CARDS E LISTAS
// ============================================================
function renderizarCards() {
  const ind = calcularIndicadores();
  const statsContainer = document.getElementById("statsContainer");
  statsContainer.innerHTML = `
    <div class="stat-card" data-tooltip="Total de receitas realizadas no período (mensalidades + outras receitas)">
      <div class="stat-icon"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(ind.receitas)}</div>
        <div class="stat-label">Receitas</div>
        <div class="stat-trend ${ind.varReceitas >= 0 ? "up" : "down"}">
          <i class="fas fa-${ind.varReceitas >= 0 ? "arrow-up" : "arrow-down"}"></i>
          ${ind.varReceitas !== null ? Math.abs(ind.varReceitas).toFixed(1) + "% vs mês ant." : "N/A"}
        </div>
      </div>
    </div>
    <div class="stat-card" data-tooltip="Total de despesas pagas no período">
      <div class="stat-icon"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(ind.despesas)}</div>
        <div class="stat-label">Despesas</div>
        <div class="stat-trend ${ind.varDespesas <= 0 ? "up" : "down"}">
          <i class="fas fa-${ind.varDespesas <= 0 ? "arrow-down" : "arrow-up"}"></i>
          ${ind.varDespesas !== null ? Math.abs(ind.varDespesas).toFixed(1) + "% vs mês ant." : "N/A"}
        </div>
      </div>
    </div>
    <div class="stat-card ${ind.saldo >= 0 ? "" : "critico"}" data-tooltip="Resultado do período (receitas - despesas)">
      <div class="stat-icon"><i class="fas fa-balance-scale"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(ind.saldo)}</div>
        <div class="stat-label">Resultado</div>
        <div class="stat-trend ${ind.varSaldo >= 0 ? "up" : "down"}">
          <i class="fas fa-${ind.varSaldo >= 0 ? "arrow-up" : "arrow-down"}"></i>
          ${ind.varSaldo !== null ? Math.abs(ind.varSaldo).toFixed(1) + "% vs mês ant." : "N/A"}
        </div>
      </div>
    </div>
    <div class="stat-card ${ind.inadimplencia > 20 ? "critico" : ind.inadimplencia > 10 ? "alerta" : ""}" data-tooltip="Percentual de parcelas vencidas no período em relação ao total de parcelas com vencimento no período">
      <div class="stat-icon ${ind.inadimplencia > 20 ? "danger" : ind.inadimplencia > 10 ? "warning" : ""}">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <div class="stat-info">
        <div class="stat-value">${ind.inadimplencia.toFixed(1)}%</div>
        <div class="stat-label">Inadimplência</div>
        <div class="stat-trend down">Ticket: ${fmtValor(ind.ticketMedio)}</div>
      </div>
    </div>
  `;

  const saldo = calcularSaldoAtual();
  const meta = calcularMeta();
  const recExtra = calcularReceitasRecorrentesExtras();
  const saude = calcularSaudeFinanceira();
  const cardsCompactos = document.getElementById("cardsCompactos");
  cardsCompactos.innerHTML = `
    <div class="compact-card">
      <div class="compact-title"><i class="fas fa-coins"></i> Caixa</div>
      <div class="compact-row"><span class="compact-label">Saldo atual</span><span class="compact-value">${fmtValor(saldo.saldo)}</span></div>
      <div class="compact-row"><span class="compact-label">A receber</span><span class="compact-value">${fmtValor(saldo.aReceber)}</span></div>
      <div class="compact-row"><span class="compact-label">A pagar</span><span class="compact-value">${fmtValor(saldo.aPagar)}</span></div>
      <div class="compact-row"><span class="compact-label">Projetado</span><span class="compact-value ${saldo.projetado >= 0 ? "" : "down"}">${fmtValor(saldo.projetado)}</span></div>
    </div>
    <div class="compact-card">
      <div class="compact-title"><i class="fas fa-bullseye"></i> Meta</div>
      <div class="compact-row"><span class="compact-label">Meta</span><span class="compact-value">${fmtValor(meta.valorMeta)}</span></div>
      <div class="compact-row"><span class="compact-label">Realizado</span><span class="compact-value">${fmtValor(meta.receitas)}</span></div>
      <div class="compact-row"><span class="compact-label">%</span><span class="compact-value">${meta.percentual.toFixed(1)}%</span></div>
      <div class="progress-container" style="margin-top:0.5rem;">
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(meta.percentual, 100)}%"></div></div>
      </div>
    </div>
    <div class="compact-card">
      <div class="compact-title"><i class="fas fa-chart-pie"></i> Receitas</div>
      <div class="compact-row"><span class="compact-label">Recorrente</span><span class="compact-value">${fmtValor(recExtra.recorrente)}</span></div>
      <div class="compact-row"><span class="compact-label">Extra</span><span class="compact-value">${fmtValor(recExtra.extra)}</span></div>
      <div class="compact-row"><span class="compact-label">% Recorrente</span><span class="compact-value">${((recExtra.recorrente / (recExtra.recorrente + recExtra.extra || 1)) * 100).toFixed(1)}%</span></div>
    </div>
    <div class="compact-card" data-tooltip="Baseado em caixa projetado, inadimplência e resultado do período">
      <div class="compact-title"><i class="fas fa-heartbeat"></i> Saúde</div>
      <div class="compact-row">
        <span class="compact-label">Status</span>
        <span class="compact-value"><span class="status-indicator ${saude.classe}"></span>${saude.status}</span>
      </div>
      <div class="compact-row"><span class="compact-label">Caixa proj.</span><span class="compact-value">${fmtValor(saldo.projetado)}</span></div>
      <div class="compact-row"><span class="compact-label">Inadimplência</span><span class="compact-value">${ind.inadimplencia.toFixed(1)}%</span></div>
      <div class="compact-row"><span class="compact-label">Resultado</span><span class="compact-value">${fmtValor(ind.saldo)}</span></div>
    </div>
  `;

  const kpi = calcularKpiAlunos();
  const kpiDiv = document.getElementById("kpiAlunos");
  kpiDiv.innerHTML = `
    <div class="compact-title"><i class="fas fa-user-graduate"></i> Alunos</div>
    <div class="kpi-row">
      <div class="kpi-item"><div class="kpi-value">${kpi.ativos}</div><div class="kpi-label">Ativos</div></div>
      <div class="kpi-item"><div class="kpi-value">${kpi.novos}</div><div class="kpi-label">Novos</div></div>
      <div class="kpi-item"><div class="kpi-value">${kpi.cancelamentos}</div><div class="kpi-label">Cancelamentos</div></div>
    </div>
  `;
}

function renderizarListas() {
  const recebimentos = obterProximosRecebimentos(5);
  const contas = obterProximasContas(5);
  const container = document.getElementById("listasContainer");
  container.innerHTML = `
    <div class="lista-container">
      <div class="lista-titulo"><span><i class="fas fa-arrow-down" style="color:var(--verde-sucesso); margin-right:0.5rem;"></i>Próximos Recebimentos</span><a href="receber.html">Ver todos</a></div>
      ${
        recebimentos.length === 0
          ? '<p style="text-align:center; padding:1rem;">Nenhum recebimento previsto.</p>'
          : recebimentos
              .map((i) => {
                const badge =
                  i.dias < 0 ? "urgente" : i.dias <= 3 ? "atencao" : "";
                const texto =
                  i.dias < 0
                    ? `Vencido há ${Math.abs(i.dias)} dias`
                    : i.dias === 0
                      ? "Hoje"
                      : `Em ${i.dias} dias`;
                return `<div class="lista-item"><div class="lista-item-info"><div class="lista-item-descricao">${i.descricao}</div><div class="lista-item-meta"><span>${fmtData(i.data)}</span><span class="badge-dias ${badge}">${texto}</span></div></div><div class="lista-item-valor">${fmtValor(i.valor)}</div></div>`;
              })
              .join("")
      }
    </div>
    <div class="lista-container">
      <div class="lista-titulo"><span><i class="fas fa-arrow-up" style="color:var(--vermelho-urgente); margin-right:0.5rem;"></i>Próximas Contas a Pagar</span><a href="pagar.html">Ver todas</a></div>
      ${
        contas.length === 0
          ? '<p style="text-align:center; padding:1rem;">Nenhuma conta a pagar prevista.</p>'
          : contas
              .map((i) => {
                const badge =
                  i.dias < 0 ? "urgente" : i.dias <= 3 ? "atencao" : "";
                const texto =
                  i.dias < 0
                    ? `Vencido há ${Math.abs(i.dias)} dias`
                    : i.dias === 0
                      ? "Hoje"
                      : `Em ${i.dias} dias`;
                return `<div class="lista-item"><div class="lista-item-info"><div class="lista-item-descricao">${i.descricao}</div><div class="lista-item-meta"><span>${fmtData(i.data)}</span><span class="badge-dias ${badge}">${texto}</span></div></div><div class="lista-item-valor">${fmtValor(i.valor)}</div></div>`;
              })
              .join("")
      }
    </div>
  `;
}

function renderizarRanking() {
  const ranking = obterRankingDespesas(5);
  const container = document.getElementById("rankingDespesas");
  if (ranking.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; padding:1rem;">Nenhuma despesa paga no período.</p>';
    return;
  }
  container.innerHTML = ranking
    .map(
      (d, idx) => `
    <div class="lista-item">
      <div class="lista-item-info">
        <div class="lista-item-descricao">${idx + 1}. ${d.descricao} <small>(${d.categoria})</small></div>
      </div>
      <div class="lista-item-valor">${fmtValor(d.valor)}</div>
    </div>
  `,
    )
    .join("");
}

function renderizarAgenda() {
  const agenda = obterAgendaSemana();
  const container = document.getElementById("agendaSemana");
  if (agenda.length === 0) {
    container.innerHTML =
      '<p style="text-align:center; padding:1rem;">Nenhum evento na semana.</p>';
    return;
  }
  container.innerHTML = agenda
    .map(
      (d) => `
    <div class="lista-item" style="flex-wrap:wrap;">
      <div style="width:100px;"><strong>${d.diaSemana}</strong> ${fmtData(d.data)}</div>
      <div style="flex:1; display:flex; gap:1rem;">
        <span style="color:var(--verde-sucesso);"><i class="fas fa-arrow-down"></i> ${fmtValor(d.receber)}</span>
        <span style="color:var(--vermelho-urgente);"><i class="fas fa-arrow-up"></i> ${fmtValor(d.pagar)}</span>
      </div>
    </div>
  `,
    )
    .join("");
}

// ============================================================
// GRÁFICOS
// ============================================================
let graficoEvolucao, graficoReceitaTipo, graficoMargem;

function destruirGraficos() {
  if (graficoEvolucao) graficoEvolucao.destroy();
  if (graficoReceitaTipo) graficoReceitaTipo.destroy();
  if (graficoMargem) graficoMargem.destroy();
}

function gerarDadosEvolucao() {
  const labels = [];
  const receitas = [];
  const hoje = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
    const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
    labels.push(`${mes}/${ano}`);
    const rec =
      estado.dados.parcelas
        .filter(
          (p) =>
            p.status === "pago" &&
            p.data_pagamento &&
            p.data_pagamento >= inicio &&
            p.data_pagamento <= fim,
        )
        .reduce((acc, p) => acc + (p.valor || 0), 0) +
      estado.dados.outrasReceitas
        .filter(
          (r) =>
            r.status === "recebido" &&
            r.data_recebimento &&
            r.data_recebimento >= inicio &&
            r.data_recebimento <= fim,
        )
        .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
    receitas.push(rec);
  }
  return { labels, receitas };
}

function gerarDadosReceitaTipo() {
  const { inicio, fim } = estado.periodo;
  const mensalidades = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const categorias = {};
  estado.dados.outrasReceitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim,
    )
    .forEach((r) => {
      const cat = r.categoria || "Outros";
      categorias[cat] =
        (categorias[cat] || 0) + (r.valor_recebido || r.valor || 0);
    });
  const labels = ["Mensalidades", ...Object.keys(categorias)];
  const dados = [mensalidades, ...Object.values(categorias)];
  return { labels, dados };
}

function gerarDadosMargem() {
  const labels = [];
  const receitasData = [];
  const despesasData = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
    const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
    labels.push(`${mes}/${ano}`);
    const rec =
      estado.dados.parcelas
        .filter(
          (p) =>
            p.status === "pago" &&
            p.data_pagamento &&
            p.data_pagamento >= inicio &&
            p.data_pagamento <= fim,
        )
        .reduce((acc, p) => acc + (p.valor || 0), 0) +
      estado.dados.outrasReceitas
        .filter(
          (r) =>
            r.status === "recebido" &&
            r.data_recebimento &&
            r.data_recebimento >= inicio &&
            r.data_recebimento <= fim,
        )
        .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
    const desp = estado.dados.contasPagar
      .filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento &&
          c.data_pagamento >= inicio &&
          c.data_pagamento <= fim,
      )
      .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);
    receitasData.push(rec);
    despesasData.push(desp);
  }
  return { labels, receitasData, despesasData };
}

function renderizarGraficos() {
  destruirGraficos();

  const ctxEvol = document.getElementById("graficoEvolucao")?.getContext("2d");
  if (ctxEvol) {
    const { labels, receitas } = gerarDadosEvolucao();
    graficoEvolucao = new Chart(ctxEvol, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Receitas",
            data: receitas,
            borderColor: "#27AE60",
            backgroundColor: "rgba(39,174,96,0.1)",
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

  const ctxTipo = document
    .getElementById("graficoReceitaTipo")
    ?.getContext("2d");
  if (ctxTipo) {
    const { labels, dados } = gerarDadosReceitaTipo();
    const cores = ["#27AE60", "#3498DB", "#F39C12", "#9B59B6", "#E74C3C"];
    graficoReceitaTipo = new Chart(ctxTipo, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: dados,
            backgroundColor: cores.slice(0, labels.length),
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

  const ctxMargem = document.getElementById("graficoMargem")?.getContext("2d");
  if (ctxMargem) {
    const { labels, receitasData, despesasData } = gerarDadosMargem();
    graficoMargem = new Chart(ctxMargem, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Receitas", data: receitasData, backgroundColor: "#27AE60" },
          { label: "Despesas", data: despesasData, backgroundColor: "#E74C3C" },
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
// EXPORTAÇÃO
// ============================================================
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Dashboard Financeiro - Estúdio Rafaela Lisboa", 14, 22);
  doc.setFontSize(10);
  doc.text(
    `Período: ${document.getElementById("periodoDisplay").textContent}`,
    14,
    30,
  );
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 36);

  const ind = calcularIndicadores();
  const saldo = calcularSaldoAtual();
  const meta = calcularMeta();

  doc.autoTable({
    startY: 45,
    head: [["Indicador", "Valor"]],
    body: [
      ["Receitas", fmtValor(ind.receitas)],
      ["Despesas", fmtValor(ind.despesas)],
      ["Resultado", fmtValor(ind.saldo)],
      ["Inadimplência", ind.inadimplencia.toFixed(1) + "%"],
      ["Ticket Médio", fmtValor(ind.ticketMedio)],
      ["Saldo Atual", fmtValor(saldo.saldo)],
      ["Projetado", fmtValor(saldo.projetado)],
      ["Meta", fmtValor(meta.valorMeta)],
      ["% Meta", meta.percentual.toFixed(1) + "%"],
    ],
    theme: "striped",
    styles: { fontSize: 8 },
  });

  const recebimentos = obterProximosRecebimentos(10);
  if (recebimentos.length > 0) {
    doc.addPage();
    doc.text("Próximos Recebimentos", 14, 20);
    doc.autoTable({
      startY: 25,
      head: [["Data", "Descrição", "Valor"]],
      body: recebimentos.map((r) => [
        fmtData(r.data),
        r.descricao,
        fmtValor(r.valor),
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
    });
  }

  const contas = obterProximasContas(10);
  if (contas.length > 0) {
    doc.addPage();
    doc.text("Próximas Contas a Pagar", 14, 20);
    doc.autoTable({
      startY: 25,
      head: [["Data", "Descrição", "Valor"]],
      body: contas.map((c) => [
        fmtData(c.data),
        c.descricao,
        fmtValor(c.valor),
      ]),
      theme: "striped",
      styles: { fontSize: 8 },
    });
  }

  doc.save(
    `dashboard_financeiro_${new Date().toISOString().split("T")[0]}.pdf`,
  );
  mostrarToast("PDF gerado!", "success");
}

function exportarExcel() {
  const wb = XLSX.utils.book_new();

  const ind = calcularIndicadores();
  const saldo = calcularSaldoAtual();
  const meta = calcularMeta();
  const indicadores = [
    ["Indicador", "Valor"],
    ["Receitas", fmtValor(ind.receitas)],
    ["Despesas", fmtValor(ind.despesas)],
    ["Resultado", fmtValor(ind.saldo)],
    ["Inadimplência", ind.inadimplencia.toFixed(1) + "%"],
    ["Ticket Médio", fmtValor(ind.ticketMedio)],
    ["Saldo Atual", fmtValor(saldo.saldo)],
    ["A Receber", fmtValor(saldo.aReceber)],
    ["A Pagar", fmtValor(saldo.aPagar)],
    ["Projetado", fmtValor(saldo.projetado)],
    ["Meta", fmtValor(meta.valorMeta)],
    ["% Meta", meta.percentual.toFixed(1) + "%"],
  ];
  const wsInd = XLSX.utils.aoa_to_sheet(indicadores);
  XLSX.utils.book_append_sheet(wb, wsInd, "Indicadores");

  const recebimentos = obterProximosRecebimentos(100);
  const dadosReceb = [["Data", "Descrição", "Valor"]];
  recebimentos.forEach((r) =>
    dadosReceb.push([fmtData(r.data), r.descricao, fmtValor(r.valor)]),
  );
  const wsReceb = XLSX.utils.aoa_to_sheet(dadosReceb);
  XLSX.utils.book_append_sheet(wb, wsReceb, "Recebimentos");

  const contas = obterProximasContas(100);
  const dadosContas = [["Data", "Descrição", "Valor"]];
  contas.forEach((c) =>
    dadosContas.push([fmtData(c.data), c.descricao, fmtValor(c.valor)]),
  );
  const wsContas = XLSX.utils.aoa_to_sheet(dadosContas);
  XLSX.utils.book_append_sheet(wb, wsContas, "Contas a Pagar");

  XLSX.writeFile(
    wb,
    `dashboard_financeiro_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  mostrarToast("Excel gerado!", "success");
}

// ============================================================
// RENDERIZAÇÃO COMPLETA
// ============================================================
async function renderizarDashboard() {
  mostrarLoading();
  renderizarCards();
  renderizarListas();
  renderizarAlertas();
  renderizarRanking();
  renderizarAgenda();
  renderizarGraficos();
  esconderLoading();
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await verificarLogin();
  const anoSelect = document.getElementById("anoSelecionado");
  const anoAtual = new Date().getFullYear();
  for (let a = anoAtual - 2; a <= anoAtual + 2; a++) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === anoAtual) opt.selected = true;
    anoSelect.appendChild(opt);
  }
  atualizarPeriodo();
  mostrarLoading();
  await carregarDados();
  await renderizarDashboard();
  esconderLoading();
});
