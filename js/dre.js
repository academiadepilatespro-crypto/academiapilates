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
    tipo: "mes",
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    inicio: null,
    fim: null,
  },
  comparar: false,
  comparacaoTipo: "mes_anterior",
  dados: {
    parcelas: [],
    receitas: [],
    contas: [],
    alunos: [],
    categorias: [],
  },
  dre: {
    receitaMensalidades: 0,
    receitaOutras: 0,
    receitaBruta: 0,
    custosDiretos: 0,
    despesasOperacionais: 0,
    ebitda: 0,
    resultadoOperacional: 0,
    resultadoLiquido: 0,
    despesasPorCategoria: {},
    despesasPorCategoriaComTipo: {},
  },
  dreComparacao: {
    receitaMensalidades: 0,
    receitaOutras: 0,
    custosDiretos: 0,
    despesasOperacionais: 0,
    ebitda: 0,
    resultadoLiquido: 0,
  },
  metas: {
    receita: 0,
    lucro: 0,
    margem: 0,
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
// FUNÇÕES DE PERÍODO
// ============================================================
function atualizarPeriodo() {
  if (estado.periodo.tipo === "mes") {
    const primeiroDia = new Date(estado.periodo.ano, estado.periodo.mes - 1, 1);
    const ultimoDia = new Date(estado.periodo.ano, estado.periodo.mes, 0);
    estado.periodo.inicio = primeiroDia.toISOString().split("T")[0];
    estado.periodo.fim = ultimoDia.toISOString().split("T")[0];
  }
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
  if (estado.periodo.tipo === "mes") {
    document.getElementById("periodoAtual").textContent =
      `${meses[estado.periodo.mes - 1]} ${estado.periodo.ano}`;
  } else {
    document.getElementById("periodoAtual").textContent =
      `${fmtData(estado.periodo.inicio)} a ${fmtData(estado.periodo.fim)}`;
  }

  if (estado.comparar) {
    let comparacaoTexto = "";
    if (estado.comparacaoTipo === "mes_anterior") {
      const inicioAnt = new Date(estado.periodo.inicio + "T12:00:00");
      inicioAnt.setMonth(inicioAnt.getMonth() - 1);
      const fimAnt = new Date(estado.periodo.fim + "T12:00:00");
      fimAnt.setMonth(fimAnt.getMonth() - 1);
      comparacaoTexto = `comparado a ${fmtData(inicioAnt.toISOString().split("T")[0])} - ${fmtData(fimAnt.toISOString().split("T")[0])}`;
    } else if (estado.comparacaoTipo === "ano_passado") {
      const inicioAnt = new Date(estado.periodo.inicio + "T12:00:00");
      inicioAnt.setFullYear(inicioAnt.getFullYear() - 1);
      const fimAnt = new Date(estado.periodo.fim + "T12:00:00");
      fimAnt.setFullYear(fimAnt.getFullYear() - 1);
      comparacaoTexto = `comparado a ${fmtData(inicioAnt.toISOString().split("T")[0])} - ${fmtData(fimAnt.toISOString().split("T")[0])}`;
    } else if (estado.comparacaoTipo === "media_12") {
      comparacaoTexto = `comparado à média dos últimos 12 meses`;
    }
    document.getElementById("periodoAnterior").textContent = comparacaoTexto;
    document.getElementById("thComparacao").style.display = "table-cell";
    document.getElementById("thVariacao").style.display = "table-cell";
    if (estado.metas.receita > 0) {
      document.getElementById("thMeta").style.display = "table-cell";
      document.getElementById("thAtingimento").style.display = "table-cell";
    }
  } else {
    document.getElementById("periodoAnterior").textContent = "";
    document.getElementById("thComparacao").style.display = "none";
    document.getElementById("thVariacao").style.display = "none";
    document.getElementById("thMeta").style.display = "none";
    document.getElementById("thAtingimento").style.display = "none";
  }
}

function abrirSelecionarMes() {
  document.getElementById("mesSelecionado").value = estado.periodo.mes;
  document.getElementById("anoSelecionado").value = estado.periodo.ano;
  document.getElementById("modalSelecionarMes").classList.add("show");
}
function abrirSelecionarPeriodo() {
  document.getElementById("periodoInicio").value = estado.periodo.inicio;
  document.getElementById("periodoFim").value = estado.periodo.fim;
  document.getElementById("modalSelecionarPeriodo").classList.add("show");
}
function aplicarMes() {
  estado.periodo.tipo = "mes";
  estado.periodo.mes = parseInt(
    document.getElementById("mesSelecionado").value,
  );
  estado.periodo.ano = parseInt(
    document.getElementById("anoSelecionado").value,
  );
  fecharModal("modalSelecionarMes");
  carregarDados();
}
function aplicarPeriodo() {
  const inicio = document.getElementById("periodoInicio").value;
  const fim = document.getElementById("periodoFim").value;
  if (!inicio || !fim) {
    mostrarToast("Selecione as datas de início e fim", "error");
    return;
  }
  estado.periodo.tipo = "periodo";
  estado.periodo.inicio = inicio;
  estado.periodo.fim = fim;
  fecharModal("modalSelecionarPeriodo");
  carregarDados();
}
function aplicarAcumuladoAno() {
  const anoAtual = new Date().getFullYear();
  estado.periodo.tipo = "periodo";
  estado.periodo.inicio = `${anoAtual}-01-01`;
  estado.periodo.fim = hoje();
  carregarDados();
}
function alternarComparacao() {
  estado.comparar = !estado.comparar;
  const btn = document.getElementById("btnComparacao");
  btn.classList.toggle("btn-primary", estado.comparar);
  btn.classList.toggle("btn-outline", !estado.comparar);
  if (estado.comparar) {
    btn.innerHTML = '<i class="fas fa-chart-line"></i> Comparando';
  } else {
    btn.innerHTML = '<i class="fas fa-chart-line"></i> Comparar';
  }
  atualizarPeriodo();
  carregarDados();
}
function mudarComparacao() {
  estado.comparacaoTipo = document.getElementById("comparacaoTipo").value;
  if (estado.comparar) {
    atualizarPeriodo();
    carregarDados();
  }
}

// ============================================================
// METAS
// ============================================================
async function carregarMetas() {
  if (!estado.usuario) return;
  const { data, error } = await supabaseClient
    .from("metas")
    .select("*")
    .eq("usuario_id", estado.usuario.id)
    .eq("tipo", "dre")
    .maybeSingle();
  if (error) console.error(error);
  if (data) {
    estado.metas = {
      receita: data.receita || 0,
      lucro: data.lucro || 0,
      margem: data.margem || 0,
    };
  }
}
async function salvarMetas() {
  const receita = parseFloat(document.getElementById("metaReceita").value) || 0;
  const lucro = parseFloat(document.getElementById("metaLucro").value) || 0;
  const margem = parseFloat(document.getElementById("metaMargem").value) || 0;
  if (!estado.usuario) return;
  const { error } = await supabaseClient.from("metas").upsert({
    usuario_id: estado.usuario.id,
    tipo: "dre",
    receita,
    lucro,
    margem,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    mostrarToast("Erro ao salvar metas", "error");
    console.error(error);
  } else {
    estado.metas = { receita, lucro, margem };
    mostrarToast("Metas salvas com sucesso!", "success");
    fecharModal("modalMetas");
    renderizarDRE(); // recarrega tabela com metas
  }
}
function abrirModalMetas() {
  document.getElementById("metaReceita").value = estado.metas.receita;
  document.getElementById("metaLucro").value = estado.metas.lucro;
  document.getElementById("metaMargem").value = estado.metas.margem;
  document.getElementById("modalMetas").classList.add("show");
}

// ============================================================
// CARREGAMENTO DE DADOS (inclui categorias com tipo_custo)
// ============================================================
async function carregarDados() {
  mostrarLoading();
  try {
    const [parcelas, receitas, contas, alunos, categorias] = await Promise.all([
      supabaseClient.from("parcelas").select("*"),
      supabaseClient.from("outras_receitas").select("*"),
      supabaseClient.from("contas_pagar").select("*"),
      supabaseClient.from("alunos").select("id, nome, ativo"),
      supabaseClient
        .from("categorias_financeiras")
        .select("*")
        .eq("tipo", "despesa"),
    ]);

    if (parcelas.error) throw parcelas.error;
    if (receitas.error) throw receitas.error;
    if (contas.error) throw contas.error;
    if (alunos.error) throw alunos.error;
    if (categorias.error) throw categorias.error;

    estado.dados.parcelas = parcelas.data || [];
    estado.dados.receitas = receitas.data || [];
    estado.dados.contas = contas.data || [];
    estado.dados.alunos = alunos.data || [];
    estado.dados.categorias = categorias.data || [];

    await carregarMetas();
    await calcularDRE();
    if (estado.comparar) await calcularDREComparacao();
    renderizarResumo();
    renderizarIndicadores();
    renderizarIndicadoresSaude();
    renderizarBreakEven();
    renderizarDRE();
    renderizarGraficos();
    renderizarRankingDespesas();
    renderizarDiagnostico();
    await verificarAlertas(); // notificações
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// CÁLCULOS DO DRE (com categorização dinâmica por tipo_custo)
// ============================================================
function getTipoCusto(categoriaNome) {
  const cat = estado.dados.categorias.find((c) => c.nome === categoriaNome);
  if (cat && cat.tipo_custo) return cat.tipo_custo;
  // fallback: algumas categorias conhecidas como diretas
  const diretas = ["Professor", "Comissão", "Material", "Instrutor"];
  if (diretas.includes(categoriaNome)) return "direto";
  return "operacional";
}

async function calcularDRE() {
  const { inicio, fim } = estado.periodo;

  const receitaMensalidades = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);

  const receitaOutras = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);

  const receitaBruta = receitaMensalidades + receitaOutras;

  const despesas = estado.dados.contas.filter(
    (c) =>
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicio &&
      c.data_pagamento <= fim,
  );

  let custosDiretos = 0;
  let despesasOperacionais = 0;
  const despesasPorCategoria = {};
  const despesasPorCategoriaComTipo = { direto: {}, operacional: {} };

  despesas.forEach((d) => {
    const cat = d.categoria || "Outros";
    const valor = d.valor_pago || d.valor || 0;
    const tipo = getTipoCusto(cat);
    if (tipo === "direto") {
      custosDiretos += valor;
      despesasPorCategoriaComTipo.direto[cat] =
        (despesasPorCategoriaComTipo.direto[cat] || 0) + valor;
    } else {
      despesasOperacionais += valor;
      despesasPorCategoriaComTipo.operacional[cat] =
        (despesasPorCategoriaComTipo.operacional[cat] || 0) + valor;
    }
    despesasPorCategoria[cat] = (despesasPorCategoria[cat] || 0) + valor;
  });

  const ebitda = receitaBruta - custosDiretos;
  const resultadoOperacional = ebitda - despesasOperacionais;
  const resultadoLiquido = resultadoOperacional;

  estado.dre = {
    receitaMensalidades,
    receitaOutras,
    receitaBruta,
    custosDiretos,
    despesasOperacionais,
    ebitda,
    resultadoOperacional,
    resultadoLiquido,
    despesasPorCategoria,
    despesasPorCategoriaComTipo,
  };
}

async function calcularDREComparacao() {
  let inicioAnt, fimAnt;
  if (estado.comparacaoTipo === "mes_anterior") {
    const i = new Date(estado.periodo.inicio + "T12:00:00");
    i.setMonth(i.getMonth() - 1);
    inicioAnt = i.toISOString().split("T")[0];
    const f = new Date(estado.periodo.fim + "T12:00:00");
    f.setMonth(f.getMonth() - 1);
    fimAnt = f.toISOString().split("T")[0];
  } else if (estado.comparacaoTipo === "ano_passado") {
    const i = new Date(estado.periodo.inicio + "T12:00:00");
    i.setFullYear(i.getFullYear() - 1);
    inicioAnt = i.toISOString().split("T")[0];
    const f = new Date(estado.periodo.fim + "T12:00:00");
    f.setFullYear(f.getFullYear() - 1);
    fimAnt = f.toISOString().split("T")[0];
  } else if (estado.comparacaoTipo === "media_12") {
    let somaReceitas = 0,
      somaCustos = 0,
      somaDespOp = 0;
    let count = 0;
    const hojeObj = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hojeObj.getFullYear(), hojeObj.getMonth() - i, 1);
      const mes = d.getMonth() + 1;
      const ano = d.getFullYear();
      const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
      const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
      const recMens = estado.dados.parcelas
        .filter(
          (p) =>
            p.status === "pago" &&
            p.data_pagamento &&
            p.data_pagamento >= inicio &&
            p.data_pagamento <= fim,
        )
        .reduce((acc, p) => acc + (p.valor || 0), 0);
      const recOut = estado.dados.receitas
        .filter(
          (r) =>
            r.status === "recebido" &&
            r.data_recebimento &&
            r.data_recebimento >= inicio &&
            r.data_recebimento <= fim,
        )
        .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
      const recTotal = recMens + recOut;
      const despesas = estado.dados.contas.filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento &&
          c.data_pagamento >= inicio &&
          c.data_pagamento <= fim,
      );
      let custos = 0,
        despOp = 0;
      despesas.forEach((d) => {
        const cat = d.categoria || "Outros";
        const valor = d.valor_pago || d.valor || 0;
        const tipo = getTipoCusto(cat);
        if (tipo === "direto") custos += valor;
        else despOp += valor;
      });
      somaReceitas += recTotal;
      somaCustos += custos;
      somaDespOp += despOp;
      count++;
    }
    if (count > 0) {
      estado.dreComparacao = {
        receitaMensalidades: somaReceitas / count,
        receitaOutras: 0,
        custosDiretos: somaCustos / count,
        despesasOperacionais: somaDespOp / count,
        ebitda: (somaReceitas - somaCustos) / count,
        resultadoLiquido: (somaReceitas - somaCustos - somaDespOp) / count,
      };
      return;
    }
  }

  const recMens = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicioAnt &&
        p.data_pagamento <= fimAnt,
    )
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const recOut = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicioAnt &&
        r.data_recebimento <= fimAnt,
    )
    .reduce((acc, r) => acc + (r.valor_recebido || r.valor || 0), 0);
  const receitaTotal = recMens + recOut;
  const despesas = estado.dados.contas.filter(
    (c) =>
      c.status === "pago" &&
      c.data_pagamento &&
      c.data_pagamento >= inicioAnt &&
      c.data_pagamento <= fimAnt,
  );
  let custos = 0,
    despOp = 0;
  despesas.forEach((d) => {
    const cat = d.categoria || "Outros";
    const valor = d.valor_pago || d.valor || 0;
    const tipo = getTipoCusto(cat);
    if (tipo === "direto") custos += valor;
    else despOp += valor;
  });
  const ebitda = receitaTotal - custos;
  const resultadoLiquido = ebitda - despOp;

  estado.dreComparacao = {
    receitaMensalidades: recMens,
    receitaOutras: recOut,
    custosDiretos: custos,
    despesasOperacionais: despOp,
    ebitda,
    resultadoLiquido,
  };
}

// ============================================================
// RENDERIZAÇÃO (cards, indicadores, etc.)
// ============================================================
function renderizarResumo() {
  const {
    receitaMensalidades,
    receitaOutras,
    custosDiretos,
    despesasOperacionais,
    ebitda,
    resultadoLiquido,
  } = estado.dre;
  const receitaTotal = receitaMensalidades + receitaOutras;
  const despesasTotal = custosDiretos + despesasOperacionais;
  const margemLiquida =
    receitaTotal > 0 ? (resultadoLiquido / receitaTotal) * 100 : 0;

  const container = document.getElementById("resumoContainer");
  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-arrow-down"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(receitaTotal)}</div>
        <div class="stat-label">Receita Total</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(despesasTotal)}</div>
        <div class="stat-label">Despesas Totais</div>
      </div>
    </div>
    <div class="stat-card ${ebitda >= 0 ? "" : "critico"}">
      <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(ebitda)}</div>
        <div class="stat-label">EBITDA</div>
      </div>
    </div>
    <div class="stat-card ${resultadoLiquido >= 0 ? "" : "critico"}">
      <div class="stat-icon"><i class="fas fa-balance-scale"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(resultadoLiquido)}</div>
        <div class="stat-label">Resultado Líquido</div>
      </div>
    </div>
    <div class="stat-card ${margemLiquida >= 20 ? "" : margemLiquida >= 10 ? "alerta" : "critico"}">
      <div class="stat-icon"><i class="fas fa-percent"></i></div>
      <div class="stat-info">
        <div class="stat-value">${margemLiquida.toFixed(1)}%</div>
        <div class="stat-label">Margem Líquida</div>
      </div>
    </div>
  `;
}

function renderizarIndicadores() {
  const {
    receitaMensalidades,
    receitaOutras,
    resultadoLiquido,
    custosDiretos,
    despesasOperacionais,
  } = estado.dre;
  const receitaTotal = receitaMensalidades + receitaOutras;
  const despesasTotal = custosDiretos + despesasOperacionais;
  const numAlunosAtivos = estado.dados.alunos.filter(
    (a) => a.ativo === true,
  ).length;
  const numTransacoes =
    estado.dados.parcelas.filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= estado.periodo.inicio &&
        p.data_pagamento <= estado.periodo.fim,
    ).length +
    estado.dados.receitas.filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= estado.periodo.inicio &&
        r.data_recebimento <= estado.periodo.fim,
    ).length;
  const ticketMedio = numTransacoes > 0 ? receitaTotal / numTransacoes : 0;
  const receitaPorAluno =
    numAlunosAtivos > 0 ? receitaMensalidades / numAlunosAtivos : 0;
  const dependenciaMensalidades =
    receitaTotal > 0 ? (receitaMensalidades / receitaTotal) * 100 : 0;
  const custoOperacional =
    receitaTotal > 0 ? (despesasTotal / receitaTotal) * 100 : 0;

  const container = document.getElementById("indicadoresContainer");
  container.innerHTML = `
    <div class="indicador-card" data-tooltip="Receita total de mensalidades dividida pelo número de alunos ativos no período">
      <div class="indicador-valor">${fmtValor(receitaPorAluno)}</div>
      <div class="indicador-label">Receita por Aluno</div>
    </div>
    <div class="indicador-card" data-tooltip="Valor médio por transação (mensalidades + outras receitas)">
      <div class="indicador-valor">${fmtValor(ticketMedio)}</div>
      <div class="indicador-label">Ticket Médio</div>
    </div>
    <div class="indicador-card" data-tooltip="Percentual da receita total que vem de mensalidades. Quanto menor, mais diversificada a receita.">
      <div class="indicador-valor">${dependenciaMensalidades.toFixed(1)}%</div>
      <div class="indicador-label">Dependência de Mensalidades</div>
    </div>
    <div class="indicador-card" data-tooltip="Total de despesas dividido pela receita total. Mostra a eficiência operacional.">
      <div class="indicador-valor">${custoOperacional.toFixed(1)}%</div>
      <div class="indicador-label">Custo Operacional</div>
    </div>
  `;
}

function renderizarIndicadoresSaude() {
  const { receitaBruta, ebitda, resultadoLiquido } = estado.dre;
  const margemEbitda = receitaBruta > 0 ? (ebitda / receitaBruta) * 100 : 0;
  const margemLiquida =
    receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0;
  const saudavel = resultadoLiquido >= 0 && margemLiquida >= 15;

  const container = document.getElementById("indicadoresSaudeContainer");
  container.innerHTML = `
    <div class="saude-card">
      <h4>Margem EBITDA</h4>
      <div class="saude-valor">${margemEbitda.toFixed(1)}%</div>
      <div class="saude-status ${margemEbitda >= 20 ? "positivo" : margemEbitda >= 10 ? "" : "negativo"}">
        <i class="fas fa-${margemEbitda >= 20 ? "arrow-up" : margemEbitda >= 10 ? "minus" : "arrow-down"}"></i>
        ${margemEbitda >= 20 ? "Excelente" : margemEbitda >= 10 ? "Regular" : "Atenção"}
      </div>
    </div>
    <div class="saude-card">
      <h4>Margem Líquida</h4>
      <div class="saude-valor">${margemLiquida.toFixed(1)}%</div>
      <div class="saude-status ${margemLiquida >= 15 ? "positivo" : margemLiquida >= 5 ? "" : "negativo"}">
        <i class="fas fa-${margemLiquida >= 15 ? "arrow-up" : margemLiquida >= 5 ? "minus" : "arrow-down"}"></i>
        ${margemLiquida >= 15 ? "Ótima" : margemLiquida >= 5 ? "Aceitável" : "Crítica"}
      </div>
    </div>
    <div class="saude-card">
      <h4>Eficiência Operacional</h4>
      <div class="saude-valor">${((estado.dre.despesasOperacionais / (estado.dre.receitaBruta || 1)) * 100).toFixed(1)}%</div>
      <div class="saude-status ${estado.dre.despesasOperacionais / (estado.dre.receitaBruta || 1) <= 0.5 ? "positivo" : "negativo"}">
        <i class="fas fa-${estado.dre.despesasOperacionais / (estado.dre.receitaBruta || 1) <= 0.5 ? "check-circle" : "exclamation-triangle"}"></i>
        ${estado.dre.despesasOperacionais / (estado.dre.receitaBruta || 1) <= 0.5 ? "Controle efetivo" : "Despesas elevadas"}
      </div>
    </div>
    <div class="saude-card">
      <h4>Saúde Geral</h4>
      <div class="saude-valor">${saudavel ? "Boa" : "Atenção"}</div>
      <div class="saude-status ${saudavel ? "positivo" : "negativo"}">
        <i class="fas fa-${saudavel ? "heartbeat" : "exclamation-triangle"}"></i>
        ${saudavel ? "Financeiro saudável" : "Necessita ajustes"}
      </div>
    </div>
  `;
}

function renderizarBreakEven() {
  const { receitaBruta, custosDiretos, despesasOperacionais } = estado.dre;
  const margemContribuicao =
    receitaBruta > 0 ? (receitaBruta - custosDiretos) / receitaBruta : 0;
  const pontoEquilibrio =
    margemContribuicao > 0 ? despesasOperacionais / margemContribuicao : 0;
  const atual = receitaBruta;
  const distancia = atual - pontoEquilibrio;
  const distanciaPercent = (distancia / (pontoEquilibrio || 1)) * 100;

  const container = document.getElementById("breakEvenContainer");
  container.innerHTML = `
    <div class="break-even-info">
      <h3><i class="fas fa-chart-line"></i> Ponto de Equilíbrio</h3>
      <div class="break-even-valor">${fmtValor(pontoEquilibrio)}</div>
      <div class="break-even-desc">Receita necessária para cobrir todos os custos e despesas</div>
    </div>
    <div class="break-even-info">
      <div>Receita atual: <strong>${fmtValor(atual)}</strong></div>
      <div class="${distancia >= 0 ? "positivo" : "negativo"}">
        ${distancia >= 0 ? "Acima do ponto de equilíbrio" : "Abaixo do ponto de equilíbrio"}
        (${distanciaPercent > 0 ? "+" : ""}${distanciaPercent.toFixed(1)}%)
      </div>
    </div>
  `;
}

function renderizarRankingDespesas() {
  const despesas = Object.entries(estado.dre.despesasPorCategoria)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const container = document.getElementById("rankingDespesas");
  if (despesas.length === 0) {
    container.innerHTML = "<p>Nenhuma despesa no período.</p>";
    return;
  }
  container.innerHTML = despesas
    .map(
      ([cat, valor]) => `
    <div class="ranking-item" onclick="mostrarDetalhesPorCategoria('${cat.replace(/'/g, "\\'")}')">
      <span>${cat}</span>
      <span><strong>${fmtValor(valor)}</strong></span>
    </div>
  `,
    )
    .join("");
}

function mostrarDetalhesPorCategoria(categoria) {
  const { inicio, fim } = estado.periodo;
  const transacoes = estado.dados.contas
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim &&
        c.categoria === categoria,
    )
    .map((c) => ({
      descricao: c.descricao,
      data: c.data_pagamento,
      valor: c.valor_pago || c.valor,
      categoria: c.categoria,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  let html = `<h4 style="margin-bottom:1rem;">Despesas da categoria "${categoria}" no período</h4>`;
  if (transacoes.length === 0) {
    html += "<p>Nenhuma despesa encontrada.</p>";
  } else {
    html += transacoes
      .map(
        (t) => `
      <div class="transacao-item">
        <div class="transacao-info">
          <div class="transacao-descricao">${escapeHtml(t.descricao)}</div>
          <div class="transacao-meta">${fmtData(t.data)}</div>
        </div>
        <div class="transacao-valor">${fmtValor(t.valor)}</div>
      </div>
    `,
      )
      .join("");
  }
  document.getElementById("detalhesTitulo").textContent =
    `Detalhes - ${categoria}`;
  document.getElementById("detalhesBody").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

function renderizarDiagnostico() {
  const {
    receitaMensalidades,
    receitaOutras,
    resultadoLiquido,
    receitaBruta,
    custosDiretos,
    despesasOperacionais,
  } = estado.dre;
  const receitaTotal = receitaBruta;
  const diagnostico = [];

  if (
    estado.comparar &&
    estado.dreComparacao.receitaMensalidades !== undefined
  ) {
    const recComp =
      estado.dreComparacao.receitaMensalidades +
      estado.dreComparacao.receitaOutras;
    const varReceita =
      receitaTotal > 0 ? ((receitaTotal - recComp) / recComp) * 100 : 0;
    const despComp =
      estado.dreComparacao.custosDiretos +
      estado.dreComparacao.despesasOperacionais;
    const varDespesas =
      despComp > 0
        ? ((custosDiretos + despesasOperacionais - despComp) / despComp) * 100
        : 0;
    const varLucro =
      estado.dreComparacao.resultadoLiquido !== 0
        ? ((resultadoLiquido - estado.dreComparacao.resultadoLiquido) /
            Math.abs(estado.dreComparacao.resultadoLiquido)) *
          100
        : 0;

    if (Math.abs(varReceita) > 10) {
      const msg =
        varReceita > 0
          ? `Receita aumentou ${varReceita.toFixed(1)}% em relação ao período comparado.`
          : `Receita caiu ${Math.abs(varReceita).toFixed(1)}% em relação ao período comparado.`;
      diagnostico.push(
        `<span class="diagnostico-item ${varReceita > 0 ? "positive" : "negative"}"><i class="fas fa-${varReceita > 0 ? "arrow-up" : "arrow-down"}"></i> ${msg}</span>`,
      );
    }
    if (Math.abs(varDespesas) > 10) {
      const msg =
        varDespesas > 0
          ? `Despesas aumentaram ${varDespesas.toFixed(1)}%`
          : `Despesas caíram ${Math.abs(varDespesas).toFixed(1)}%`;
      diagnostico.push(
        `<span class="diagnostico-item ${varDespesas > 0 ? "negative" : "positive"}"><i class="fas fa-${varDespesas > 0 ? "arrow-up" : "arrow-down"}"></i> ${msg}</span>`,
      );
    }
    if (Math.abs(varLucro) > 15) {
      const msg =
        varLucro > 0
          ? `Lucro aumentou ${varLucro.toFixed(1)}%`
          : `Lucro diminuiu ${Math.abs(varLucro).toFixed(1)}%`;
      diagnostico.push(
        `<span class="diagnostico-item ${varLucro > 0 ? "positive" : "negative"}"><i class="fas fa-${varLucro > 0 ? "arrow-up" : "arrow-down"}"></i> ${msg}</span>`,
      );
    }
  }

  const dependencia = (receitaMensalidades / (receitaTotal || 1)) * 100;
  if (dependencia > 90) {
    diagnostico.push(
      `<span class="diagnostico-item negative"><i class="fas fa-exclamation-triangle"></i> Alta dependência de mensalidades (${dependencia.toFixed(1)}%). Considere diversificar fontes de receita.</span>`,
    );
  } else if (dependencia < 60) {
    diagnostico.push(
      `<span class="diagnostico-item positive"><i class="fas fa-check-circle"></i> Receita diversificada (mensalidades: ${dependencia.toFixed(1)}%). Continue assim!</span>`,
    );
  }

  const margem = (resultadoLiquido / (receitaTotal || 1)) * 100;
  if (margem < 10) {
    diagnostico.push(
      `<span class="diagnostico-item negative"><i class="fas fa-exclamation-triangle"></i> Margem líquida baixa (${margem.toFixed(1)}%). Revise custos e despesas.</span>`,
    );
  } else if (margem > 25) {
    diagnostico.push(
      `<span class="diagnostico-item positive"><i class="fas fa-check-circle"></i> Margem líquida excelente (${margem.toFixed(1)}%). Parabéns!</span>`,
    );
  }

  if (diagnostico.length === 0) {
    diagnostico.push(
      `<span class="diagnostico-item"><i class="fas fa-chart-simple"></i> Tudo dentro do esperado. Monitore os indicadores.</span>`,
    );
  }

  document.getElementById("diagnosticoContainer").innerHTML =
    diagnostico.join("");
}

function renderizarDRE() {
  const {
    receitaMensalidades,
    receitaOutras,
    receitaBruta,
    custosDiretos,
    despesasOperacionais,
    ebitda,
    resultadoOperacional,
    resultadoLiquido,
  } = estado.dre;
  const metaReceita = estado.metas.receita;
  const metaLucro = estado.metas.lucro;
  const metaMargem = estado.metas.margem;
  const showMeta = estado.comparar && metaReceita > 0;

  let html = `
    <tr><td class="categoria">RECEITAS</td><td></td>${estado.comparar ? "<td></td><td></td>" : ""}${showMeta ? "<td></td><td></td>" : ""}</tr>
    <tr><td class="subcategoria clickable" data-tipo="mensalidades">Mensalidades</td><td class="clickable" data-tipo="mensalidades">${fmtValor(receitaMensalidades)}</td>${estado.comparar ? `<td class="clickable" data-tipo="mensalidades">${fmtValor(estado.dreComparacao.receitaMensalidades || 0)}</td><td class="variacao ${receitaMensalidades >= (estado.dreComparacao.receitaMensalidades || 0) ? "positiva" : "negativa"}">${(((receitaMensalidades - (estado.dreComparacao.receitaMensalidades || 0)) / (estado.dreComparacao.receitaMensalidades || 1)) * 100).toFixed(1)}%</td>` : ""}${showMeta ? `<td>${fmtValor(metaReceita)}</td><td class="variacao ${receitaMensalidades + receitaOutras >= metaReceita ? "positiva" : "negativa"}">${(((receitaMensalidades + receitaOutras) / metaReceita) * 100).toFixed(1)}%</td>` : ""}</tr>
    <tr><td class="subcategoria clickable" data-tipo="outras">Outras Receitas</td><td class="clickable" data-tipo="outras">${fmtValor(receitaOutras)}</td>${estado.comparar ? `<td class="clickable" data-tipo="outras">${fmtValor(estado.dreComparacao.receitaOutras || 0)}</td><td class="variacao ${receitaOutras >= (estado.dreComparacao.receitaOutras || 0) ? "positiva" : "negativa"}">${(((receitaOutras - (estado.dreComparacao.receitaOutras || 0)) / (estado.dreComparacao.receitaOutras || 1)) * 100).toFixed(1)}%</td>` : ""}${showMeta ? `<td></td><td></td>` : ""}</tr>
    <tr class="total"><td class="subcategoria"><strong>RECEITA BRUTA</strong></td><td><strong>${fmtValor(receitaBruta)}</strong></td>${estado.comparar ? `<td><strong>${fmtValor((estado.dreComparacao.receitaMensalidades || 0) + (estado.dreComparacao.receitaOutras || 0))}</strong></td><td class="variacao ${receitaBruta >= (estado.dreComparacao.receitaMensalidades || 0) + (estado.dreComparacao.receitaOutras || 0) ? "positiva" : "negativa"}"><strong>${(((receitaBruta - ((estado.dreComparacao.receitaMensalidades || 0) + (estado.dreComparacao.receitaOutras || 0))) / ((estado.dreComparacao.receitaMensalidades || 0) + (estado.dreComparacao.receitaOutras || 0) || 1)) * 100).toFixed(1)}%</strong></td>` : ""}${showMeta ? `<td><strong>${fmtValor(metaReceita)}</strong></td><td class="variacao ${receitaBruta >= metaReceita ? "positiva" : "negativa"}"><strong>${((receitaBruta / metaReceita) * 100).toFixed(1)}%</strong></td>` : ""}</tr>

    <tr><td class="categoria">CUSTOS DIRETOS</td><td></td>${estado.comparar ? "<td></td><td></td>" : ""}${showMeta ? "<td></td><td></td>" : ""}</tr>
    <tr><td class="subcategoria clickable" data-tipo="custos_diretos">Custos Diretos</td><td class="clickable" data-tipo="custos_diretos">${fmtValor(custosDiretos)}</td>${estado.comparar ? `<td class="clickable" data-tipo="custos_diretos">${fmtValor(estado.dreComparacao.custosDiretos || 0)}</td><td class="variacao ${custosDiretos <= (estado.dreComparacao.custosDiretos || 0) ? "positiva" : "negativa"}">${(((custosDiretos - (estado.dreComparacao.custosDiretos || 0)) / (estado.dreComparacao.custosDiretos || 1)) * 100).toFixed(1)}%</td>` : ""}${showMeta ? `<td></td><td></td>` : ""}</tr>

    <tr class="total"><td class="subcategoria"><strong>EBITDA</strong></td><td><strong>${fmtValor(ebitda)}</strong></td>${estado.comparar ? `<td><strong>${fmtValor(estado.dreComparacao.ebitda || 0)}</strong></td><td class="variacao ${ebitda >= (estado.dreComparacao.ebitda || 0) ? "positiva" : "negativa"}"><strong>${(((ebitda - (estado.dreComparacao.ebitda || 0)) / Math.abs(estado.dreComparacao.ebitda || 1)) * 100).toFixed(1)}%</strong></td>` : ""}${showMeta ? `<td><strong>${fmtValor(metaLucro)}</strong></td><td class="variacao ${ebitda >= metaLucro ? "positiva" : "negativa"}"><strong>${((ebitda / metaLucro) * 100).toFixed(1)}%</strong></td>` : ""}</tr>

    <tr><td class="categoria">DESPESAS OPERACIONAIS</td><td></td>${estado.comparar ? "<td></td><td></td>" : ""}${showMeta ? "<td></td><td></td>" : ""}</tr>
    <tr><td class="subcategoria clickable" data-tipo="despesas_operacionais">Despesas Operacionais</td><td class="clickable" data-tipo="despesas_operacionais">${fmtValor(despesasOperacionais)}</td>${estado.comparar ? `<td class="clickable" data-tipo="despesas_operacionais">${fmtValor(estado.dreComparacao.despesasOperacionais || 0)}</td><td class="variacao ${despesasOperacionais <= (estado.dreComparacao.despesasOperacionais || 0) ? "positiva" : "negativa"}">${(((despesasOperacionais - (estado.dreComparacao.despesasOperacionais || 0)) / (estado.dreComparacao.despesasOperacionais || 1)) * 100).toFixed(1)}%</td>` : ""}${showMeta ? `<td></td><td></td>` : ""}</tr>

    <tr class="total"><td class="subcategoria"><strong>RESULTADO OPERACIONAL</strong></td><td><strong>${fmtValor(resultadoOperacional)}</strong></td>${estado.comparar ? `<td><strong>${fmtValor(estado.dreComparacao.resultadoLiquido || 0)}</strong></td><td class="variacao ${resultadoOperacional >= (estado.dreComparacao.resultadoLiquido || 0) ? "positiva" : "negativa"}"><strong>${(((resultadoOperacional - (estado.dreComparacao.resultadoLiquido || 0)) / Math.abs(estado.dreComparacao.resultadoLiquido || 1)) * 100).toFixed(1)}%</strong></td>` : ""}${showMeta ? `<td><strong>${fmtValor(metaLucro)}</strong></td><td class="variacao ${resultadoOperacional >= metaLucro ? "positiva" : "negativa"}"><strong>${((resultadoOperacional / metaLucro) * 100).toFixed(1)}%</strong></td>` : ""}</tr>

    <tr><td class="categoria">RESULTADO LÍQUIDO</td><td></td>${estado.comparar ? "<td></td><td></td>" : ""}${showMeta ? "<td></td><td></td>" : ""}</tr>
    <tr class="total"><td class="subcategoria"><strong>RESULTADO LÍQUIDO</strong></td><td class="resultado ${resultadoLiquido >= 0 ? "positivo" : "negativo"}"><strong>${fmtValor(resultadoLiquido)}</strong></td>${estado.comparar ? `<td class="resultado ${(estado.dreComparacao.resultadoLiquido || 0) >= 0 ? "positivo" : "negativo"}"><strong>${fmtValor(estado.dreComparacao.resultadoLiquido || 0)}</strong></td><td class="variacao ${resultadoLiquido >= (estado.dreComparacao.resultadoLiquido || 0) ? "positiva" : "negativa"}"><strong>${(((resultadoLiquido - (estado.dreComparacao.resultadoLiquido || 0)) / Math.abs(estado.dreComparacao.resultadoLiquido || 1)) * 100).toFixed(1)}%</strong></td>` : ""}${showMeta ? `<td><strong>${fmtValor(metaLucro)}</strong></td><td class="variacao ${resultadoLiquido >= metaLucro ? "positiva" : "negativa"}"><strong>${((resultadoLiquido / metaLucro) * 100).toFixed(1)}%</strong></td>` : ""}</tr>
  `;
  document.getElementById("dreBody").innerHTML = html;

  // Adicionar eventos de clique
  document.querySelectorAll("#dreBody .clickable").forEach((el) => {
    el.addEventListener("click", (e) => {
      const tipo = el.dataset.tipo;
      if (tipo === "mensalidades") mostrarDetalhesMensalidades();
      else if (tipo === "outras") mostrarDetalhesOutras();
      else if (tipo === "custos_diretos") mostrarDetalhesCustosDiretos();
      else if (tipo === "despesas_operacionais")
        mostrarDetalhesDespesasOperacionais();
      e.stopPropagation();
    });
  });
}

// Drill-down separados
function mostrarDetalhesMensalidades() {
  const { inicio, fim } = estado.periodo;
  const transacoes = estado.dados.parcelas
    .filter(
      (p) =>
        p.status === "pago" &&
        p.data_pagamento &&
        p.data_pagamento >= inicio &&
        p.data_pagamento <= fim,
    )
    .map((p) => {
      const aluno = estado.dados.alunos.find((a) => a.id === p.aluno_id);
      return {
        descricao: `Mensalidade - ${aluno?.nome || "Aluno"}`,
        data: p.data_pagamento,
        valor: p.valor,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
  mostrarDetalhesGenerico("Mensalidades recebidas", transacoes);
}
function mostrarDetalhesOutras() {
  const { inicio, fim } = estado.periodo;
  const transacoes = estado.dados.receitas
    .filter(
      (r) =>
        r.status === "recebido" &&
        r.data_recebimento &&
        r.data_recebimento >= inicio &&
        r.data_recebimento <= fim,
    )
    .map((r) => ({
      descricao: r.descricao,
      data: r.data_recebimento,
      valor: r.valor_recebido || r.valor,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
  mostrarDetalhesGenerico("Outras receitas", transacoes);
}
function mostrarDetalhesCustosDiretos() {
  const { inicio, fim } = estado.periodo;
  const transacoes = estado.dados.contas
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim &&
        getTipoCusto(c.categoria) === "direto",
    )
    .map((c) => ({
      descricao: `${c.descricao} (${c.categoria})`,
      data: c.data_pagamento,
      valor: c.valor_pago || c.valor,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
  mostrarDetalhesGenerico("Custos Diretos", transacoes);
}
function mostrarDetalhesDespesasOperacionais() {
  const { inicio, fim } = estado.periodo;
  const transacoes = estado.dados.contas
    .filter(
      (c) =>
        c.status === "pago" &&
        c.data_pagamento &&
        c.data_pagamento >= inicio &&
        c.data_pagamento <= fim &&
        getTipoCusto(c.categoria) !== "direto",
    )
    .map((c) => ({
      descricao: `${c.descricao} (${c.categoria})`,
      data: c.data_pagamento,
      valor: c.valor_pago || c.valor,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
  mostrarDetalhesGenerico("Despesas Operacionais", transacoes);
}
function mostrarDetalhesGenerico(titulo, transacoes) {
  let html = `<h4 style="margin-bottom:1rem;">${titulo} no período</h4>`;
  if (transacoes.length === 0) {
    html += "<p>Nenhum registro encontrado.</p>";
  } else {
    html += transacoes
      .map(
        (t) => `
      <div class="transacao-item">
        <div class="transacao-info">
          <div class="transacao-descricao">${escapeHtml(t.descricao)}</div>
          <div class="transacao-meta">${fmtData(t.data)}</div>
        </div>
        <div class="transacao-valor">${fmtValor(t.valor)}</div>
      </div>
    `,
      )
      .join("");
  }
  document.getElementById("detalhesTitulo").textContent = titulo;
  document.getElementById("detalhesBody").innerHTML = html;
  document.getElementById("modalDetalhes").classList.add("show");
}

// ============================================================
// GRÁFICOS
// ============================================================
let graficoEvolucao, graficoComposicao;

function destruirGraficos() {
  if (graficoEvolucao) graficoEvolucao.destroy();
  if (graficoComposicao) graficoComposicao.destroy();
}
function renderizarGraficos() {
  destruirGraficos();

  const ctxEvol = document.getElementById("graficoEvolucao")?.getContext("2d");
  if (ctxEvol) {
    const labels = [],
      receitasData = [],
      despesasData = [],
      lucroData = [];
    const hojeObj = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hojeObj.getFullYear(), hojeObj.getMonth() - i, 1);
      const mes = d.getMonth() + 1;
      const ano = d.getFullYear();
      const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
      const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
      labels.push(`${mes}/${ano}`);

      const receita =
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
      const despesa = estado.dados.contas
        .filter(
          (c) =>
            c.status === "pago" &&
            c.data_pagamento &&
            c.data_pagamento >= inicio &&
            c.data_pagamento <= fim,
        )
        .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);
      receitasData.push(receita);
      despesasData.push(despesa);
      lucroData.push(receita - despesa);
    }
    graficoEvolucao = new Chart(ctxEvol, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Receitas",
            data: receitasData,
            borderColor: "#27AE60",
            backgroundColor: "rgba(39,174,96,0.1)",
            tension: 0.4,
            fill: false,
          },
          {
            label: "Despesas",
            data: despesasData,
            borderColor: "#E74C3C",
            backgroundColor: "rgba(231,76,60,0.1)",
            tension: 0.4,
            fill: false,
          },
          {
            label: "Lucro",
            data: lucroData,
            borderColor: "#3498DB",
            backgroundColor: "rgba(52,152,219,0.1)",
            tension: 0.4,
            fill: false,
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
    const { receitaMensalidades, receitaOutras } = estado.dre;
    const total = receitaMensalidades + receitaOutras;
    if (total === 0) {
      ctxComp.clearRect(0, 0, ctxComp.canvas.width, ctxComp.canvas.height);
      ctxComp.font = "14px Montserrat";
      ctxComp.fillStyle = "#666";
      ctxComp.textAlign = "center";
      ctxComp.fillText(
        "Sem receitas no período",
        ctxComp.canvas.width / 2,
        ctxComp.canvas.height / 2,
      );
      graficoComposicao = null;
    } else {
      graficoComposicao = new Chart(ctxComp, {
        type: "doughnut",
        data: {
          labels: ["Mensalidades", "Outras Receitas"],
          datasets: [
            {
              data: [receitaMensalidades, receitaOutras],
              backgroundColor: ["#27AE60", "#3498DB"],
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
}

// ============================================================
// PROJEÇÃO (FORECAST)
// ============================================================
function calcularProjecao() {
  const considerarRecorrentes = document.getElementById(
    "considerarRecorrentes",
  ).checked;
  const considerarMensalidadesAtivas = document.getElementById(
    "considerarMensalidadesAtivas",
  ).checked;
  const hojeObj = new Date();
  const meses = [];
  const receitasProj = [];
  const despesasProj = [];

  for (let i = 1; i <= 12; i++) {
    const data = new Date(hojeObj.getFullYear(), hojeObj.getMonth() + i, 1);
    const mes = data.getMonth() + 1;
    const ano = data.getFullYear();
    meses.push(`${mes.toString().padStart(2, "0")}/${ano}`);
    const inicioMes = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fimMes = new Date(ano, mes, 0).toISOString().split("T")[0];

    let receita = 0;
    if (considerarMensalidadesAtivas) {
      // Alunos ativos com parcelas pendentes (supondo que cada aluno tem uma mensalidade mensal)
      const alunosAtivos = estado.dados.alunos.filter((a) => a.ativo === true);
      // Para simplificar, soma as mensalidades dos alunos (preço da mensalidade) para cada mês futuro
      // Mas precisamos de uma tabela de planos ou preço por aluno. Vamos usar as parcelas do último mês como base.
      // Alternativa: calcular média das mensalidades recebidas nos últimos meses
      const ultimasMensalidades = estado.dados.parcelas
        .filter(
          (p) =>
            p.status === "pago" &&
            p.data_pagamento &&
            p.data_pagamento >= adicionarMeses(hoje(), -3),
        )
        .map((p) => p.valor);
      const mediaMensalidade = ultimasMensalidades.length
        ? ultimasMensalidades.reduce((a, b) => a + b, 0) /
          ultimasMensalidades.length
        : 0;
      receita += alunosAtivos.length * mediaMensalidade;
    }

    // Outras receitas recorrentes? Considerar média das outras receitas dos últimos meses
    const outrasReceitas = estado.dados.receitas
      .filter(
        (r) =>
          r.status === "recebido" &&
          r.data_recebimento &&
          r.data_recebimento >= adicionarMeses(hoje(), -6),
      )
      .map((r) => r.valor_recebido || r.valor);
    const mediaOutras = outrasReceitas.length
      ? outrasReceitas.reduce((a, b) => a + b, 0) / outrasReceitas.length
      : 0;
    receita += mediaOutras;
    receitasProj.push(receita);

    let despesa = 0;
    if (considerarRecorrentes) {
      // Contas recorrentes (fixas) que se repetem mensalmente
      const contasRecorrentes = estado.dados.contas.filter(
        (c) => c.recorrente === true && c.status !== "pago",
      );
      const fixas = contasRecorrentes.reduce(
        (acc, c) => acc + (c.valor || 0),
        0,
      );
      despesa += fixas;
    }
    // Média das despesas variáveis dos últimos meses
    const despesasVariaveis = estado.dados.contas
      .filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento &&
          c.data_pagamento >= adicionarMeses(hoje(), -6) &&
          c.recorrente !== true,
      )
      .map((c) => c.valor_pago || c.valor);
    const mediaVariavel = despesasVariaveis.length
      ? despesasVariaveis.reduce((a, b) => a + b, 0) / despesasVariaveis.length
      : 0;
    despesa += mediaVariavel;
    despesasProj.push(despesa);
  }

  // Renderizar tabela
  const tbody = document.getElementById("projecaoBody");
  let totalReceita = 0,
    totalDespesa = 0,
    totalLucro = 0;
  const rows = meses
    .map((mes, idx) => {
      const receita = receitasProj[idx];
      const despesa = despesasProj[idx];
      const lucro = receita - despesa;
      const margem = receita > 0 ? (lucro / receita) * 100 : 0;
      totalReceita += receita;
      totalDespesa += despesa;
      totalLucro += lucro;
      return `
      <tr>
        <td>${mes}</td>
        <td>${fmtValor(receita)}</td>
        <td>${fmtValor(despesa)}</td>
        <td class="${lucro >= 0 ? "positivo" : "negativo"}">${fmtValor(lucro)}</td>
        <td>${margem.toFixed(1)}%</td>
      </tr>
    `;
    })
    .join("");
  tbody.innerHTML = rows;
  document.getElementById("projecaoResumo").innerHTML = `
    <div>Total Projetado 12 meses:</div>
    <div>Receita: ${fmtValor(totalReceita)}</div>
    <div>Despesa: ${fmtValor(totalDespesa)}</div>
    <div>Lucro: ${fmtValor(totalLucro)}</div>
    <div>Margem média: ${(totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0).toFixed(1)}%</div>
  `;
}

// ============================================================
// HISTÓRICO MENSAL (últimos 12 meses)
// ============================================================
async function calcularHistorico() {
  const hojeObj = new Date();
  const meses = [];
  const receitas = [];
  const despesas = [];
  const lucros = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(hojeObj.getFullYear(), hojeObj.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const ano = d.getFullYear();
    meses.push(`${mes.toString().padStart(2, "0")}/${ano}`);
    const inicio = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
    const fim = new Date(ano, mes, 0).toISOString().split("T")[0];

    const receita =
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
    const despesa = estado.dados.contas
      .filter(
        (c) =>
          c.status === "pago" &&
          c.data_pagamento &&
          c.data_pagamento >= inicio &&
          c.data_pagamento <= fim,
      )
      .reduce((acc, c) => acc + (c.valor_pago || c.valor || 0), 0);
    const lucro = receita - despesa;
    receitas.push(receita);
    despesas.push(despesa);
    lucros.push(lucro);
  }

  // Construir tabela (linhas: Receita, Despesa, Lucro; colunas: meses)
  const header = `<th>Item</th>${meses.map((m) => `<th>${m}</th>`).join("")}`;
  document.getElementById("historicoHeader").innerHTML = header;
  const body = `
    <tr><td>Receita Total</td>${receitas.map((r) => `<td>${fmtValor(r)}</td>`).join("")}</tr>
    <tr><td>Despesa Total</td>${despesas.map((d) => `<td>${fmtValor(d)}</td>`).join("")}</tr>
    <tr><td>Resultado</td>${lucros.map((l) => `<td class="${l >= 0 ? "positivo" : "negativo"}">${fmtValor(l)}</td>`).join("")}</tr>
  `;
  document.getElementById("historicoBody").innerHTML = body;
}

// ============================================================
// NOTIFICAÇÕES (alertas)
// ============================================================
async function verificarAlertas() {
  const { resultadoLiquido, receitaBruta } = estado.dre;
  const margem = receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0;
  const hojeStr = hoje();
  const alertas = [];
  if (resultadoLiquido < 0) {
    alertas.push(
      `Resultado líquido negativo: ${fmtValor(resultadoLiquido)}. Verifique custos e receitas.`,
    );
  }
  if (margem < 10 && margem >= 0) {
    alertas.push(
      `Margem líquida baixa (${margem.toFixed(1)}%). Considere ações para melhorar a rentabilidade.`,
    );
  } else if (margem < 0) {
    alertas.push(
      `Margem líquida negativa (${margem.toFixed(1)}%). Situação crítica!`,
    );
  }

  // Verificar se já existem notificações para evitar duplicatas
  const { data: existentes } = await supabaseClient
    .from("notificacoes")
    .select("mensagem")
    .eq("usuario_id", estado.usuario.id)
    .gte("created_at", new Date(hojeStr + "T00:00:00").toISOString());

  const mensagensExistentes = (existentes || []).map((e) => e.mensagem);
  const novas = [];
  for (const msg of alertas) {
    if (!mensagensExistentes.includes(msg)) {
      novas.push({
        usuario_id: estado.usuario.id,
        tipo: "alerta",
        mensagem: msg,
        link: "#",
      });
    }
  }
  if (novas.length) {
    await supabaseClient.from("notificacoes").insert(novas);
    await carregarNotificacoes();
  }
}

// ============================================================
// NOTIFICAÇÕES (listagem)
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
// ABAS
// ============================================================
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".tab-content")
        .forEach((content) => content.classList.remove("active"));
      if (tabId === "principal")
        document.getElementById("tabPrincipal").classList.add("active");
      else if (tabId === "projecao") {
        document.getElementById("tabProjecao").classList.add("active");
        calcularProjecao();
      } else if (tabId === "historico") {
        document.getElementById("tabHistorico").classList.add("active");
        calcularHistorico();
      }
    });
  });
}

// ============================================================
// EXPORTAÇÃO (PDF e Excel)
// ============================================================
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Demonstrativo de Resultados", 14, 22);
  doc.setFontSize(10);
  doc.text(
    `Período: ${document.getElementById("periodoAtual").textContent}`,
    14,
    30,
  );
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 36);
  const body = [];
  const linhas = document.querySelectorAll("#dreBody tr");
  linhas.forEach((tr) => {
    const linha = [];
    tr.querySelectorAll("td").forEach((td) => linha.push(td.innerText));
    body.push(linha);
  });
  doc.autoTable({
    startY: 45,
    head: [
      [
        "Descrição",
        "Valor",
        ...(estado.comparar ? ["Comparação", "Variação"] : []),
        ...(estado.metas.receita > 0 ? ["Meta", "Atingimento"] : []),
      ],
    ],
    body,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [58, 107, 92] },
  });
  doc.save(`dre_${new Date().toISOString().split("T")[0]}.pdf`);
  mostrarToast("PDF gerado!", "success");
}
function exportarExcel() {
  const wb = XLSX.utils.book_new();
  const dados = [
    ["Demonstrativo de Resultados"],
    [`Período: ${document.getElementById("periodoAtual").textContent}`],
    [],
  ];
  const cabecalho = ["Descrição", "Valor"];
  if (estado.comparar) cabecalho.push("Comparação", "Variação");
  if (estado.metas.receita > 0) cabecalho.push("Meta", "Atingimento");
  dados.push(cabecalho);
  const linhas = document.querySelectorAll("#dreBody tr");
  linhas.forEach((tr) => {
    const linha = [];
    tr.querySelectorAll("td").forEach((td) => linha.push(td.innerText));
    dados.push(linha);
  });
  const ws = XLSX.utils.aoa_to_sheet(dados);
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  XLSX.writeFile(wb, `dre_${new Date().toISOString().split("T")[0]}.xlsx`);
  mostrarToast("Excel gerado!", "success");
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
  initTabs();
  await carregarDados();
});
