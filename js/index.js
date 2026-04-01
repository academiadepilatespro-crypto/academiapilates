// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

// Inicializar cliente Supabase
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// ============================================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================================

const CACHE_KEYS = {
  ALUNOS: "cache_alunos",
  AULAS: "cache_aulas",
  PARCELAS: "cache_parcelas",
  CONTAS: "cache_contas",
  LAST_UPDATE: "cache_last_update",
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos em milissegundos

// ============================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================================

const estado = {
  usuario: null,
  dados: {
    alunos: { data: [], loading: false, error: null },
    aulas: { data: [], loading: false, error: null },
    parcelas: { data: [], loading: false, error: null },
    contas: { data: [], loading: false, error: null },
  },
  cache: {
    enabled: true,
    lastUpdate: null,
  },
};

// ============================================================
// FUNÇÕES DE CACHE (localStorage)
// ============================================================

function getFromCache(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (error) {
    console.warn("Erro ao ler cache:", error);
    return null;
  }
}

function setInCache(key, data) {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn("Erro ao salvar cache:", error);
  }
}

// ============================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================

function mostrarLoading() {
  document.getElementById("loadingOverlay").classList.add("show");
}

function esconderLoading() {
  document.getElementById("loadingOverlay").classList.remove("show");
}

function mostrarErro(mensagem, detalhes = "") {
  const errorMsg = detalhes ? `${mensagem}\n\n${detalhes}` : mensagem;
  document.getElementById("errorMessage").textContent = errorMsg;
  document.getElementById("errorPage").classList.add("show");
  document.getElementById("loginPage").classList.add("hidden");
  esconderLoading();
}

function mostrarToast(mensagem, tipo = "info") {
  const container = document.getElementById("globalToastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;

  let icone = "fa-info-circle";
  if (tipo === "success") icone = "fa-check-circle";
  if (tipo === "error") icone = "fa-exclamation-circle";

  toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

window.mostrarToast = mostrarToast;

function formatarData(data) {
  if (!data) return "-";
  try {
    return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function formatarValor(valor) {
  const num = Number(valor) || 0;
  return "R$ " + num.toFixed(2).replace(".", ",");
}

// ============================================================
// FUNÇÃO SEGURA PARA QUERIES (tratamento de erros)
// ============================================================

async function safeQuery(
  queryFn,
  fallback = [],
  errorMessage = "Erro na operação",
) {
  try {
    const result = await queryFn();
    if (result.error) throw result.error;
    return result.data || fallback;
  } catch (error) {
    console.error(errorMessage, error);
    mostrarToast(`${errorMessage}: ${error.message}`, "error");
    return fallback;
  }
}

// ============================================================
// FUNÇÕES DE CARREGAMENTO DE DADOS (CORRIGIDAS)
// ============================================================

async function carregarAlunos(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.ALUNOS;

  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.alunos = { data: cached, loading: false, error: null };
      return cached;
    }
  }

  estado.dados.alunos.loading = true;

  const data = await safeQuery(
    () => supabaseClient.from("alunos").select("*").order("nome"),
    [],
    "Erro ao carregar alunos",
  );

  estado.dados.alunos = { data, loading: false, error: null };
  setInCache(cacheKey, data);

  return data;
}

async function carregarAulas(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.AULAS;

  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.aulas = { data: cached, loading: false, error: null };
      return cached;
    }
  }

  estado.dados.aulas.loading = true;

  // Query corrigida com os campos exatos do banco
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("aulas")
        .select(
          `
              id,
              aluno_id,
              data,
              horario,
              status,
              presenca,
              alunos!inner (
                id,
                nome
              )
            `,
        )
        .order("data", { ascending: true }),
    [],
    "Erro ao carregar aulas",
  );

  // Processar dados para formato amigável
  const aulasProcessadas = (data || []).map((a) => ({
    id: a.id,
    aluno_id: a.aluno_id,
    alunoNome: a.alunos?.nome || "Aluno não encontrado",
    data: a.data,
    horario: a.horario,
    presenca: a.presenca,
    status: a.status,
  }));

  estado.dados.aulas = {
    data: aulasProcessadas,
    loading: false,
    error: null,
  };
  setInCache(cacheKey, aulasProcessadas);

  return aulasProcessadas;
}

async function carregarParcelas(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.PARCELAS;

  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.parcelas = {
        data: cached,
        loading: false,
        error: null,
      };
      return cached;
    }
  }

  estado.dados.parcelas.loading = true;

  // Query otimizada que já traz o nome do aluno
  const data = await safeQuery(
    () =>
      supabaseClient.from("parcelas").select(`
              *,
              mensalidades!inner (
                aluno_id,
                alunos!inner (
                  nome
                )
              )
            `),
    [],
    "Erro ao carregar parcelas",
  );

  // Processar dados para formato amigável
  const parcelasProcessadas = (data || []).map((p) => ({
    id: p.id,
    mensalidade_id: p.mensalidade_id,
    aluno_id: p.mensalidades?.aluno_id,
    alunoNome: p.mensalidades?.alunos?.nome || "Aluno não encontrado",
    valor: p.valor,
    vencimento: p.vencimento,
    data_pagamento: p.data_pagamento,
    status: p.status,
    numero: p.numero,
  }));

  estado.dados.parcelas = {
    data: parcelasProcessadas,
    loading: false,
    error: null,
  };
  setInCache(cacheKey, parcelasProcessadas);

  return parcelasProcessadas;
}

async function carregarContas(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.CONTAS;

  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.contas = { data: cached, loading: false, error: null };
      return cached;
    }
  }

  estado.dados.contas.loading = true;

  // Query corrigida com o campo correto data_vencimento
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("contas_pagar")
        .select("*")
        .order("data_vencimento", { ascending: true }),
    [],
    "Erro ao carregar contas",
  );

  const contasProcessadas = (data || []).map((c) => ({
    id: c.id,
    descricao: c.descricao,
    valor: c.valor,
    data_vencimento: c.data_vencimento,
    data_pagamento: c.data_pagamento,
    status: c.status,
    categoria: c.categoria,
  }));

  estado.dados.contas = {
    data: contasProcessadas,
    loading: false,
    error: null,
  };
  setInCache(cacheKey, contasProcessadas);

  return contasProcessadas;
}

async function carregarTodosDados(forceRefresh = false) {
  mostrarLoading();

  try {
    await Promise.all([
      carregarAlunos(forceRefresh),
      carregarAulas(forceRefresh),
      carregarParcelas(forceRefresh),
      carregarContas(forceRefresh),
    ]);

    await renderizarDashboard();
    mostrarToast("Dados atualizados com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar alguns dados", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÕES DE CÁLCULO (CORRIGIDAS)
// ============================================================

function calcularDiasConta(dataVencimento) {
  if (!dataVencimento)
    return {
      dias: 0,
      status: "normal",
      texto: "Vencimento não informado",
    };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const venc = new Date(dataVencimento + "T12:00:00");
  venc.setHours(0, 0, 0, 0);

  const diffTime = venc - hoje;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = "normal";
  let texto = "";

  if (diffDays < 0) {
    status = "vencida";
    texto = `${Math.abs(diffDays)} dias atrasada`;
  } else if (diffDays === 0) {
    status = "hoje";
    texto = "Vence hoje";
  } else if (diffDays <= 3) {
    status = "urgente";
    texto = `${diffDays} dias`;
  } else if (diffDays <= 7) {
    status = "proxima";
    texto = `${diffDays} dias`;
  } else {
    texto = `${diffDays} dias`;
  }

  return { dias: diffDays, status, texto };
}

function calcularStats() {
  const alunos = estado.dados.alunos.data || [];
  const aulas = estado.dados.aulas.data || [];
  const parcelas = estado.dados.parcelas.data || [];
  const contas = estado.dados.contas.data || [];

  // Total de alunos
  const totalAlunos = alunos.length;

  // Alunos ativos (campo 'ativo' boolean)
  const alunosAtivos = alunos.filter((a) => a.ativo === true).length;

  // Aulas de hoje
  const hojeStr = new Date().toISOString().split("T")[0];
  const aulasHoje = aulas.filter((a) => a.data === hojeStr);
  const aulasHojeCount = aulasHoje.length;

  // Mensalidades pendentes (status = 'pendente' ou 'atrasado')
  const mensalidadesPendentes = parcelas.filter(
    (p) => p.status === "pendente" || p.status === "atrasado",
  );
  const valorPendente = mensalidadesPendentes.reduce(
    (acc, p) => acc + (Number(p.valor) || 0),
    0,
  );

  // Contas a pagar pendentes
  const contasPendentes = contas.filter((c) => c.status === "pendente");
  const valorContas = contasPendentes.reduce(
    (acc, c) => acc + (Number(c.valor) || 0),
    0,
  );

  // Aniversariantes do mês (ordenados por dia)
  const mesAtual = new Date().getMonth() + 1;
  const aniversariantes = alunos
    .filter((a) => {
      if (!a.nascimento) return false;
      const mes = parseInt(a.nascimento.split("-")[1]);
      return mes === mesAtual;
    })
    .sort((a, b) => {
      const diaA = parseInt(a.nascimento.split("-")[2]);
      const diaB = parseInt(b.nascimento.split("-")[2]);
      return diaA - diaB;
    });

  return {
    totalAlunos,
    alunosAtivos,
    aulasHojeCount,
    valorPendente,
    mensalidadesPendentes: mensalidadesPendentes.length,
    valorContas,
    contasPendentes: contasPendentes.length,
    aniversariantes,
  };
}

// ============================================================
// TEMPLATES DO DASHBOARD
// ============================================================

const Templates = {
  statsCards: (stats) => `
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon"><i class="fas fa-users"></i></div>
              <div class="stat-info">
                <div class="stat-value">${stats.totalAlunos}</div>
                <div class="stat-label">Total de Alunos</div>
                <div class="stat-trend up"><i class="fas fa-arrow-up"></i> ${
                  stats.alunosAtivos
                } ativos</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
              <div class="stat-info">
                <div class="stat-value">${stats.aulasHojeCount}</div>
                <div class="stat-label">Aulas Hoje</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon ${
                stats.valorPendente > 0 ? "warning" : ""
              }">
                <i class="fas fa-dollar-sign"></i>
              </div>
              <div class="stat-info">
                <div class="stat-value">${formatarValor(
                  stats.valorPendente,
                )}</div>
                <div class="stat-label">Mensalidades Pendentes</div>
                <div class="stat-trend down"><i class="fas fa-clock"></i> ${
                  stats.mensalidadesPendentes
                } pendências</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon ${stats.valorContas > 0 ? "danger" : ""}">
                <i class="fas fa-file-invoice"></i>
              </div>
              <div class="stat-info">
                <div class="stat-value">${formatarValor(
                  stats.valorContas,
                )}</div>
                <div class="stat-label">Contas a Pagar</div>
                <div class="stat-trend down"><i class="fas fa-exclamation-triangle"></i> ${
                  stats.contasPendentes
                } contas</div>
              </div>
            </div>
          </div>
        `,

  graficos: () => `
          <div class="charts-grid">
            <div class="chart-card">
              <div class="card-header"><h3 class="card-title">Aulas por Horário</h3></div>
              <div class="chart-container"><canvas id="graficoHorarios"></canvas></div>
            </div>
            <div class="chart-card">
              <div class="card-header"><h3 class="card-title">Status Financeiro</h3></div>
              <div class="chart-container"><canvas id="graficoFinanceiro"></canvas></div>
            </div>
          </div>
        `,

  aulasHoje: (aulas) => {
    if (aulas.length === 0) {
      return `
              <div class="dashboard-card">
                <div class="card-header">
                  <h3 class="card-title">Aulas de Hoje</h3>
                  <a href="#" class="card-link" onclick="abrirModulo('agenda'); return false;">Ver agenda <i class="fas fa-arrow-right"></i></a>
                </div>
                <div class="empty-state-text">
                  <i class="fas fa-calendar-check empty-state-icon"></i>
                  Nenhuma aula hoje
                </div>
              </div>
            `;
    }

    return `
            <div class="dashboard-card">
              <div class="card-header">
                <h3 class="card-title">Aulas de Hoje</h3>
                <a href="#" class="card-link" onclick="abrirModulo('agenda'); return false;">Ver todas <i class="fas fa-arrow-right"></i></a>
              </div>
              <div>
                ${aulas
                  .sort((a, b) =>
                    (a.horario || "").localeCompare(b.horario || ""),
                  )
                  .map((aula) => {
                    let statusIcone = "";
                    let statusClass = "";
                    let statusTexto = "";

                    if (aula.presenca === "presente") {
                      statusIcone = "✅";
                      statusClass = "presente";
                      statusTexto = "Presente";
                    } else if (aula.presenca === "ausente") {
                      statusIcone = "❌";
                      statusClass = "ausente";
                      statusTexto = "Ausente";
                    } else if (aula.status === "cancelada") {
                      statusIcone = "🚫";
                      statusClass = "cancelada";
                      statusTexto = "Cancelada";
                    } else {
                      statusIcone = "⏳";
                      statusClass = "pendente";
                      statusTexto = "Pendente";
                    }

                    const horarioFormatado = aula.horario
                      ? aula.horario.substring(0, 5)
                      : "--:--";

                    return `
                      <div class="aula-item">
                        <div class="aula-horario">${horarioFormatado}</div>
                        <div class="aula-info">
                          <div class="aula-nome">${
                            aula.alunoNome || "Aluno"
                          }</div>
                          <div class="aula-status ${statusClass}">
                            ${statusIcone} ${statusTexto}
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `;
  },

  aniversariantes: (aniversariantes) => {
    if (aniversariantes.length === 0) {
      return `
              <div class="dashboard-card">
                <div class="card-header">
                  <h3 class="card-title">Aniversariantes do Mês</h3>
                  <a href="#" class="card-link" onclick="abrirModulo('alunos'); return false;">Ver todos <i class="fas fa-arrow-right"></i></a>
                </div>
                <div class="empty-state-text">
                  <i class="fas fa-birthday-cake empty-state-icon"></i>
                  Nenhum aniversariante este mês
                </div>
              </div>
            `;
    }

    const hoje = new Date();
    const diaHoje = hoje.getDate();

    return `
            <div class="dashboard-card">
              <div class="card-header">
                <h3 class="card-title">Aniversariantes do Mês</h3>
                <a href="#" class="card-link" onclick="abrirModulo('alunos'); return false;">Ver todos <i class="fas fa-arrow-right"></i></a>
              </div>
              <div>
                ${aniversariantes
                  .map((a) => {
                    const dia = parseInt(a.nascimento.split("-")[2]);
                    const isHoje = dia === diaHoje;
                    const idade =
                      new Date().getFullYear() -
                      new Date(a.nascimento).getFullYear();

                    return `
                    <div class="aniversariante-item ${isHoje ? "hoje" : ""}">
                      <div class="aniversariante-avatar">${(
                        a.nome || "A"
                      ).charAt(0)}</div>
                      <div class="aniversariante-info">
                        <div class="aniversariante-nome">${a.nome}</div>
                        <div class="aniversariante-data">
                          <span class="aniversariante-dia">${dia
                            .toString()
                            .padStart(2, "0")}</span>
                          ${formatarData(a.nascimento)} • ${idade} anos
                          ${isHoje ? "🎉 Hoje!" : ""}
                        </div>
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `;
  },

  contasProximas: (contas) => {
    if (contas.length === 0) {
      return "";
    }

    return `
            <div class="dashboard-card card-margin-bottom">
              <div class="card-header">
                <h3 class="card-title">Contas a Pagar - Próximos 7 dias</h3>
                <a href="#" class="card-link" onclick="abrirModulo('financeiro'); return false;">Ver todas <i class="fas fa-arrow-right"></i></a>
              </div>
              <div>
                ${contas
                  .map((conta) => {
                    const diasInfo = calcularDiasConta(conta.data_vencimento);
                    let badgeClass = "badge-info";

                    if (diasInfo.status === "vencida")
                      badgeClass = "badge-danger";
                    else if (
                      diasInfo.status === "hoje" ||
                      diasInfo.status === "urgente"
                    )
                      badgeClass = "badge-warning";

                    return `
                    <div class="conta-item">
                      <div class="conta-info">
                        <div class="conta-descricao">${
                          conta.descricao || "Sem descrição"
                        }</div>
                        <div class="conta-vencimento">Vence ${formatarData(
                          conta.data_vencimento,
                        )}</div>
                      </div>
                      <div class="conta-valor">
                        ${formatarValor(conta.valor)}
                        <span class="conta-badge ${badgeClass}">${
                          diasInfo.texto
                        }</span>
                      </div>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `;
  },

  acessoRapido: (stats) => `
          <div class="dashboard-card">
            <div class="card-header"><h3 class="card-title">Acesso Rápido</h3></div>
            <div class="modulos-grid">
              <a href="#" class="modulo-card" onclick="abrirModulo('alunos'); return false;">
                <div class="modulo-icon"><i class="fas fa-users"></i></div>
                <div class="modulo-nome">Alunos</div>
                <div class="modulo-count">${stats.totalAlunos} cadastrados</div>
              </a>
              <a href="#" class="modulo-card" onclick="abrirModulo('agenda'); return false;">
                <div class="modulo-icon"><i class="fas fa-calendar-alt"></i></div>
                <div class="modulo-nome">Agenda</div>
                <div class="modulo-count">${stats.aulasHojeCount} hoje</div>
              </a>
              <a href="#" class="modulo-card" onclick="abrirModulo('financeiro'); return false;">
                <div class="modulo-icon"><i class="fas fa-credit-card"></i></div>
                <div class="modulo-nome">Financeiro</div>
                <div class="modulo-count">${stats.mensalidadesPendentes} pendências</div>
              </a>
              <a href="#" class="modulo-card" onclick="abrirModulo('relatorios'); return false;">
                <div class="modulo-icon"><i class="fas fa-chart-bar"></i></div>
                <div class="modulo-nome">Relatórios</div>
                <div class="modulo-count">Análises</div>
              </a>
            </div>
          </div>
        `,
};

// ============================================================
// RENDERIZAÇÃO DO DASHBOARD
// ============================================================

async function renderizarDashboard() {
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  document.getElementById("dataAtual").textContent =
    dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);

  const stats = calcularStats();

  const hojeStr = hoje.toISOString().split("T")[0];
  const aulasHoje = (estado.dados.aulas.data || []).filter(
    (a) => a.data === hojeStr,
  );

  const contasProximas = (estado.dados.contas.data || [])
    .filter((c) => c.status === "pendente")
    .filter((c) => {
      const diasInfo = calcularDiasConta(c.data_vencimento);
      return diasInfo.dias <= 7;
    })
    .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento))
    .slice(0, 5);

  const html = `
          ${Templates.statsCards(stats)}
          ${Templates.graficos()}
          <div class="dashboard-grid">
            ${Templates.aulasHoje(aulasHoje)}
            ${Templates.aniversariantes(stats.aniversariantes)}
          </div>
          ${Templates.contasProximas(contasProximas)}
          ${Templates.acessoRapido(stats)}
        `;

  document.getElementById("dashboardContent").innerHTML = html;
  document.getElementById("statsLoading").style.display = "none";

  setTimeout(() => inicializarGraficos(), 100);
}

function inicializarGraficos() {
  const parcelas = estado.dados.parcelas.data || [];
  const aulas = estado.dados.aulas.data || [];

  // Gráfico de horários
  const ctxHorarios = document
    .getElementById("graficoHorarios")
    ?.getContext("2d");
  if (ctxHorarios) {
    const horarios = [
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "13:30",
      "14:30",
      "15:30",
      "16:30",
      "17:30",
      "18:30",
      "19:30",
      "20:30",
    ];
    const contagens = horarios.map(
      (h) =>
        aulas.filter((a) => a.horario && a.horario.substring(0, 5) === h)
          .length,
    );

    new Chart(ctxHorarios, {
      type: "bar",
      data: {
        labels: horarios,
        datasets: [
          {
            label: "Quantidade de Aulas",
            data: contagens,
            backgroundColor: "rgba(58, 107, 92, 0.7)",
            borderColor: "#3A6B5C",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, stepSize: 1 } },
        plugins: { legend: { display: false } },
      },
    });
  }

  // Gráfico financeiro
  const ctxFinanceiro = document
    .getElementById("graficoFinanceiro")
    ?.getContext("2d");
  if (ctxFinanceiro) {
    const totalPago = parcelas
      .filter((p) => p.status === "pago")
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const totalPendente = parcelas
      .filter((p) => p.status === "pendente" || p.status === "atrasado")
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);

    new Chart(ctxFinanceiro, {
      type: "doughnut",
      data: {
        labels: ["Recebido", "Pendente"],
        datasets: [
          {
            data: [totalPago, totalPendente],
            backgroundColor: ["#27AE60", "#F39C12"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, padding: 10 },
          },
        },
        cutout: "70%",
      },
    });
  }
}

// ============================================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================================

async function fazerLogin() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("password").value;
  const loginBtn = document.getElementById("loginButton");

  if (!email || !senha) {
    mostrarToast("Preencha e-mail e senha", "error");
    return;
  }

  mostrarLoading();
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: senha,
    });

    if (error) throw error;
    if (!data.user) throw new Error("Usuário não encontrado");

    const { data: usuarioData, error: usuarioError } = await supabaseClient
      .from("usuarios")
      .select("id, nome, email, role")
      .eq("id", data.user.id)
      .single();

    if (usuarioError) throw usuarioError;

    estado.usuario = usuarioData;
    localStorage.setItem("usuario", JSON.stringify(usuarioData));

    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("mainSystem").classList.add("show");

    document.getElementById("sidebarUserName").textContent = usuarioData.nome;
    document.getElementById("sidebarUserRole").textContent =
      usuarioData.role === "admin"
        ? "Administrador"
        : usuarioData.role === "instrutor"
          ? "Instrutor"
          : "Financeiro";

    const iniciais = usuarioData.nome
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    document.getElementById("sidebarUserAvatar").textContent = iniciais;

    await carregarTodosDados();
    mostrarToast(`Bem-vindo(a), ${usuarioData.nome}!`, "success");
  } catch (error) {
    console.error("Erro no login:", error);
    mostrarToast(error.message, "error");
  } finally {
    esconderLoading();
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
  }
}

function fazerLogout() {
  estado.usuario = null;
  localStorage.removeItem("usuario");
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("mainSystem").classList.remove("show");
  mostrarToast("Logout realizado!", "info");
}

// ============================================================
// FUNÇÕES DE NAVEGAÇÃO (ATUALIZADA COM AVALIAÇÃO)
// ============================================================

function abrirModulo(modulo) {
  const urls = {
    alunos: "html/alunos.html",
    agenda: "html/agenda.html",
    financeiro: "html/financeiro.html",
    relatorios: "html/relatorios.html",
    configuracoes: "html/configuracoes.html",
    avaliacao: "html/avaliacao.html",
    ajuda: "html/central_ajuda.html", // NOVA OPÇÃO
  };

  if (urls[modulo]) {
    window.location.href = urls[modulo];
  } else {
    mostrarToast("Módulo em desenvolvimento", "info");
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.onload = async function () {
  const usuarioSalvo = localStorage.getItem("usuario");
  if (usuarioSalvo) {
    try {
      estado.usuario = JSON.parse(usuarioSalvo);

      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (user) {
        document.getElementById("loginPage").classList.add("hidden");
        document.getElementById("mainSystem").classList.add("show");

        document.getElementById("sidebarUserName").textContent =
          estado.usuario.nome;
        document.getElementById("sidebarUserRole").textContent =
          estado.usuario.role === "admin"
            ? "Administrador"
            : estado.usuario.role === "instrutor"
              ? "Instrutor"
              : "Financeiro";

        const iniciais = estado.usuario.nome
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();
        document.getElementById("sidebarUserAvatar").textContent = iniciais;

        await carregarTodosDados();
      } else {
        localStorage.removeItem("usuario");
      }
    } catch (e) {
      localStorage.removeItem("usuario");
    }
  }

  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  document.getElementById("dataAtual").textContent =
    dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);

  // Fechar sidebar ao clicar fora (mobile)
  document.addEventListener("click", function (event) {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");

    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  });
};
