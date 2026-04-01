const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const CAPACIDADE_PADRAO = 5;
const ALERTA_80 = 4;
const HORARIOS_FUNCIONAMENTO = [
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
const TOTAL_HORARIOS = HORARIOS_FUNCIONAMENTO.length;

const CACHE_KEYS = {
  ALUNOS: "cache_alunos_agenda",
  AULAS: "cache_aulas_agenda",
  DOCUMENTOS: "cache_documentos_agenda",
  NOTIFICACOES: "cache_notificacoes_agenda",
  LOTES: "cache_lotes_agenda",
  EVENTOS: "cache_eventos_agenda",
  EVOLUCOES: "cache_evolucoes_agenda",
  LISTA_ESPERA: "cache_lista_espera_agenda",
  PLANOS: "cache_planos_agenda",
};
const CACHE_DURATION = 5 * 60 * 1000;

const estado = {
  usuario: null,
  view: "dia",
  dataAtual: new Date(),
  dados: {
    alunos: [],
    aulas: [],
    aulasProcessadas: [],
    documentos: [],
    notificacoes: [],
    listaEspera: [],
    lotes: [],
    eventos: [],
    evolucoes: [],
    planos: [],
    feriados: {},
  },
  filtros: { aluno: "", status: "", horario: "", periodo: "" },
  aulaAtual: null,
  alunoSelecionado: null,
  loteAtual: null,
  aulaReagendamento: null,
  dossieAluno: null,
  ultimaAtualizacao: null,
  cache: { enabled: true, lastUpdate: null },
  agendamentoAtual: {
    id: null,
    tipo: null,
    aluno_id: null,
    duracao: 60,
    dias_semana: [],
    periodo_meses: 12,
    total_sessoes: 20,
    data_inicio: null,
    data_fim: null,
    pausa_inicio: null,
    pausa_fim: null,
    observacoes: "",
  },
  intervaloDisponibilidade: null, // para verificação em tempo real
};

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
    return null;
  }
}

function setInCache(key, data) {
  try {
    const cacheData = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {}
}

function clearCache() {
  Object.values(CACHE_KEYS).forEach((key) => localStorage.removeItem(key));
}

async function safeQuery(queryFn, fallback = [], errorMessage = "Erro") {
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

async function carregarAlunos(forceRefresh = false) {
  const key = CACHE_KEYS.ALUNOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.alunos = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () => supabaseClient.from("alunos").select("*").order("nome"),
    [],
    "Erro ao carregar alunos",
  );
  estado.dados.alunos = data;
  setInCache(key, data);
  return data;
}

async function carregarAulas(forceRefresh = false) {
  const key = CACHE_KEYS.AULAS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.aulas = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("aulas")
        .select(
          `id, aluno_id, data, horario, status, presenca, checkin, checkout, duracao, observacoes, plano_aluno_id, alunos ( id, nome, telefone, email )`,
        )
        .order("data", { ascending: true })
        .order("horario", { ascending: true }),
    [],
    "Erro ao carregar aulas",
  );
  const aulasProcessadas = (data || []).map((a) => ({
    id: a.id,
    aluno_id: a.aluno_id,
    alunoNome: a.alunos?.nome || "Aluno não encontrado",
    alunoTelefone: a.alunos?.telefone,
    alunoEmail: a.alunos?.email,
    data: a.data,
    horario: a.horario,
    status: a.status,
    presenca: a.presenca,
    checkin: a.checkin,
    checkout: a.checkout,
    duracao: a.duracao,
    observacoes: a.observacoes,
    plano_aluno_id: a.plano_aluno_id,
  }));
  estado.dados.aulas = aulasProcessadas;
  setInCache(key, aulasProcessadas);
  return aulasProcessadas;
}

async function carregarPlanos(forceRefresh = false) {
  const key = CACHE_KEYS.PLANOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.planos = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("planos_alunos")
        .select(
          `*, alunos ( id, nome ), planos_horarios ( id, dia_semana, horario )`,
        )
        .order("criado_em", { ascending: false }),
    [],
    "Erro ao carregar planos",
  );
  estado.dados.planos = data;
  setInCache(key, data);
  return data;
}

async function carregarPlanosComerciais() {
  const { data, error } = await supabaseClient
    .from("planos")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  if (error) return [];
  return data;
}

async function carregarDocumentos(forceRefresh = false) {
  const key = CACHE_KEYS.DOCUMENTOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.documentos = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () => supabaseClient.from("documentos").select("*"),
    [],
    "Erro ao carregar documentos",
  );
  estado.dados.documentos = data;
  setInCache(key, data);
  return data;
}

async function carregarNotificacoes(forceRefresh = false) {
  const key = CACHE_KEYS.NOTIFICACOES;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.notificacoes = cached;
      atualizarBadgeNotificacoes();
      return cached;
    }
  }
  const data = await safeQuery(
    () => supabaseClient.from("notificacoes").select("*").eq("lida", false),
    [],
    "Erro ao carregar notificações",
  );
  estado.dados.notificacoes = data;
  setInCache(key, data);
  atualizarBadgeNotificacoes();
  return data;
}

async function carregarLotes(forceRefresh = false) {
  const key = CACHE_KEYS.LOTES;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.lotes = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("lotes")
        .select("*")
        .order("criado_em", { ascending: false }),
    [],
    "Erro ao carregar lotes",
  );
  estado.dados.lotes = data;
  setInCache(key, data);
  return data;
}

async function carregarEventos(forceRefresh = false) {
  const key = CACHE_KEYS.EVENTOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.eventos = cached;
      atualizarMapaFeriados();
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("eventos")
        .select("*")
        .eq("ativo", true)
        .order("data", { ascending: true }),
    [],
    "Erro ao carregar eventos",
  );
  estado.dados.eventos = data;
  atualizarMapaFeriados();
  setInCache(key, data);
  return data;
}

function atualizarMapaFeriados() {
  estado.dados.feriados = {};
  (estado.dados.eventos || []).forEach((evento) => {
    if (evento.bloquear_agenda) {
      estado.dados.feriados[evento.data] = evento;
    }
  });
}

async function carregarEvolucoes(forceRefresh = false) {
  const key = CACHE_KEYS.EVOLUCOES;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.evolucoes = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("evolucao")
        .select("*")
        .order("data", { ascending: false }),
    [],
    "Erro ao carregar evoluções",
  );
  estado.dados.evolucoes = data;
  setInCache(key, data);
  return data;
}

async function carregarListaEspera(forceRefresh = false) {
  const key = CACHE_KEYS.LISTA_ESPERA;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(key);
    if (cached) {
      estado.dados.listaEspera = cached;
      atualizarListaEsperaUI();
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("lista_espera")
        .select("*, alunos(nome)")
        .order("dia_semana", { ascending: true })
        .order("horario", { ascending: true })
        .order("posicao", { ascending: true }),
    [],
    "Erro ao carregar lista de espera",
  );
  estado.dados.listaEspera = data;
  setInCache(key, data);
  atualizarListaEsperaUI();
  return data;
}

async function carregarTodosDados(forceRefresh = false) {
  mostrarLoading();
  try {
    if (forceRefresh) clearCache();
    await Promise.all([
      carregarAlunos(forceRefresh),
      carregarAulas(forceRefresh),
      carregarPlanos(forceRefresh),
      carregarDocumentos(forceRefresh),
      carregarNotificacoes(forceRefresh),
      carregarLotes(forceRefresh),
      carregarEventos(forceRefresh),
      carregarEvolucoes(forceRefresh),
      carregarListaEspera(forceRefresh),
    ]);
    estado.ultimaAtualizacao = new Date().toISOString();
    estado.cache.lastUpdate = estado.ultimaAtualizacao;
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao carregar dados", "error");
  } finally {
    esconderLoading();
  }
}

async function carregarDisponibilidade() {
  const data = document.getElementById("disponibilidadeData").value;
  if (!data) {
    document.getElementById("disponibilidadeGrid").innerHTML =
      '<div style="text-align: center; padding: 2rem; grid-column: 1/-1;">Selecione uma data para consultar.</div>';
    return;
  }

  const horarioFiltro = document.getElementById("disponibilidadeHorario").value;

  const { data: aulas, error } = await supabaseClient
    .from("aulas")
    .select("horario, status")
    .eq("data", data)
    .neq("status", "cancelada");

  if (error) {
    console.error(error);
    mostrarToast("Erro ao consultar disponibilidade", "error");
    return;
  }

  const ocupacaoPorHorario = {};
  aulas.forEach((aula) => {
    const horario = aula.horario.substring(0, 5);
    ocupacaoPorHorario[horario] = (ocupacaoPorHorario[horario] || 0) + 1;
  });

  const grid = document.getElementById("disponibilidadeGrid");
  let html = "";

  HORARIOS_FUNCIONAMENTO.forEach((horario) => {
    if (horarioFiltro && horario !== horarioFiltro) return;

    const qtd = ocupacaoPorHorario[horario] || 0;
    const vagas = CAPACIDADE_PADRAO - qtd;
    let statusClass = "livre",
      statusText = "Livre",
      badgeClass = "livre";
    if (qtd >= CAPACIDADE_PADRAO) {
      statusClass = "lotado";
      statusText = "Lotado";
      badgeClass = "lotado";
    } else if (qtd >= ALERTA_80) {
      statusClass = "alerta";
      statusText = "Alerta";
      badgeClass = "alerta";
    }

    html += `
    <div class="disponibilidade-card ${statusClass}">
      <div class="disponibilidade-horario">${horario}</div>
      <div class="disponibilidade-info">
        <span>Ocupação: ${qtd}/${CAPACIDADE_PADRAO}</span>
        <span class="disponibilidade-badge ${badgeClass}">${statusText}</span>
      </div>
      <div class="disponibilidade-ocupacao">
        <div class="ocupacao-bar-small">
          <div class="ocupacao-fill-small ${statusClass}" style="width: ${
            (qtd / CAPACIDADE_PADRAO) * 100
          }%"></div>
        </div>
        <span>${vagas} vaga(s) livre(s)</span>
      </div>
      ${
        qtd > 0
          ? `<div class="disponibilidade-alunos"><i class="fas fa-users"></i> ${qtd} aluno(s) agendado(s)</div>`
          : ""
      }
    </div>
  `;
  });

  if (html === "") {
    html =
      '<div style="text-align: center; padding: 2rem; grid-column: 1/-1;">Nenhum horário disponível para esta data</div>';
  }
  grid.innerHTML = html;
}

window.addEventListener("focus", async function () {
  await verificarAtualizacoes();
});

setInterval(async () => {
  if (document.visibilityState === "visible") {
    await verificarAtualizacoes();
  }
}, 30000);

async function verificarAtualizacoes() {
  try {
    const { data: ultimaAula, error: errorAula } = await supabaseClient
      .from("aulas")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ultimoPlano, error: errorPlano } = await supabaseClient
      .from("planos_alunos")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ultimoEvento, error: errorEvento } = await supabaseClient
      .from("eventos")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ultimaEspera, error: errorEspera } = await supabaseClient
      .from("lista_espera")
      .select("criado_em")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorAula || errorPlano || errorEvento || errorEspera) return;

    const ultimaAtualizacao = estado.ultimaAtualizacao || "2000-01-01";
    const precisaAtualizar =
      (ultimaAula && ultimaAula.atualizado_em > ultimaAtualizacao) ||
      (ultimoPlano && ultimoPlano.atualizado_em > ultimaAtualizacao) ||
      (ultimoEvento && ultimoEvento.atualizado_em > ultimaAtualizacao) ||
      (ultimaEspera && ultimaEspera.criado_em > ultimaAtualizacao);

    if (precisaAtualizar) {
      await carregarTodosDados(true);
      if (estado.view === "dia") renderizarTimeline();
      else if (estado.view === "semana") renderizarSemana();
      else if (estado.view === "mes") await renderizarMes();
      carregarRelatorios();
      carregarDisponibilidade();
      mostrarToast("Agenda atualizada com o banco!", "success");
    }
  } catch (error) {
    console.error("Erro ao verificar atualizações:", error);
  }
}

async function forcarRefresh() {
  mostrarLoading();
  try {
    await carregarTodosDados(true);
    if (estado.view === "dia") renderizarTimeline();
    else if (estado.view === "semana") renderizarSemana();
    else if (estado.view === "mes") await renderizarMes();
    carregarRelatorios();
    carregarDisponibilidade();
    mostrarToast("✅ Agenda atualizada com o banco!", "success");
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao atualizar dados", "error");
  } finally {
    esconderLoading();
  }
}

// Intervalo de verificação de disponibilidade em tempo real
function iniciarVerificacaoDisponibilidade() {
  if (estado.intervaloDisponibilidade)
    clearInterval(estado.intervaloDisponibilidade);
  estado.intervaloDisponibilidade = setInterval(() => {
    const modal = document.getElementById("modalNovaAula");
    if (!modal.classList.contains("show")) return;
    const data = document.getElementById("aulaData").value;
    const horario = document.getElementById("aulaHorario").value;
    if (data && horario) {
      verificarDisponibilidade();
    }
  }, 30000);
}

function pararVerificacaoDisponibilidade() {
  if (estado.intervaloDisponibilidade) {
    clearInterval(estado.intervaloDisponibilidade);
    estado.intervaloDisponibilidade = null;
  }
}

// Drag & drop para reagendamento
let dragSourceAulaId = null;

function dragStartHandler(event, element) {
  const match = element
    .getAttribute("onclick")
    .match(/abrirDetalhesAula\((\d+)\)/);
  if (match) {
    dragSourceAulaId = parseInt(match[1]);
    event.dataTransfer.setData("text/plain", dragSourceAulaId);
    event.dataTransfer.effectAllowed = "move";
  }
}

function dragEndHandler(event) {
  dragSourceAulaId = null;
}

function dragOverHandler(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

async function dropHandler(event, horario, dataStr) {
  event.preventDefault();
  const aulaId = dragSourceAulaId;
  if (!aulaId) return;

  abrirModalConfirmar(
    `Reagendar aula para ${new Date(dataStr).toLocaleDateString("pt-BR")} às ${horario}?`,
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("aulas")
          .update({
            data: dataStr,
            horario: horario + ":00",
            status: "reagendada",
            observacoes: `Reagendada para ${dataStr} às ${horario}`,
          })
          .eq("id", aulaId);
        if (error) throw error;

        const { data: aulaData } = await supabaseClient
          .from("aulas")
          .select("aluno_id")
          .eq("id", aulaId)
          .single();

        await supabaseClient.from("notificacoes").insert({
          aluno_id: aulaData.aluno_id,
          tipo: "reagendamento",
          titulo: "📅 Aula Reagendada",
          mensagem: `Sua aula foi reagendada para ${new Date(dataStr).toLocaleDateString("pt-BR")} às ${horario}.`,
        });

        mostrarToast("Aula reagendada com sucesso!", "success");
        await carregarTodosDados(true);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarRelatorios();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao reagendar: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

async function abrirModalNovoAgendamento() {
  limparFormularioAgendamento();
  const planos = await carregarPlanosComerciais();
  const selectPlano = document.getElementById("agendamentoPlanoId");
  selectPlano.innerHTML = '<option value="">Selecione um plano...</option>';
  planos.forEach((p) => {
    selectPlano.innerHTML += `<option value="${p.id}" data-nome="${p.nome}">${p.nome}</option>`;
  });
  document.getElementById("modalNovoAgendamento").classList.add("show");
  setTimeout(() => document.getElementById("alunoSearchInput").focus(), 100);
}

function limparFormularioAgendamento() {
  document.getElementById("alunoSearchInput").value = "";
  document.getElementById("alunoInfoContainer").style.display = "none";
  document.getElementById("agendamentoAlunoId").value = "";
  document.getElementById("agendamentoObservacoes").value = "";
  document.getElementById("agendamentoDuracao").value = "60";
  document.getElementById("agendamentoPeriodoMeses").value = "12";
  document.getElementById("agendamentoTotalSessoes").value = "20";
  document.getElementById("agendamentoDataInicioSessoes").value = "";
  document.getElementById("agendamentoDataInicioPeriodo").value = "";
  document.getElementById("agendamentoDataFimPeriodo").value = "";
  document.getElementById("agendamentoDataInicioContinuo").value = "";
  document.getElementById("agendamentoPausaInicio").value = "";
  document.getElementById("agendamentoPausaFim").value = "";

  document
    .querySelectorAll('#diasSemanaHorariosContainer input[type="checkbox"]')
    .forEach((cb) => {
      cb.checked = false;
      const horarioInput = document.getElementById(`horario${cb.value}`);
      if (horarioInput) {
        horarioInput.disabled = true;
        horarioInput.classList.remove("visible");
      }
    });

  document.getElementById("camposContinuo").style.display = "none";
  document.getElementById("camposSessoes").style.display = "none";
  document.getElementById("camposPeriodo").style.display = "none";

  document.getElementById("previsaoAgendamento").innerHTML =
    "Selecione os dados para ver a prévia.";

  estado.agendamentoAtual = {
    id: null,
    tipo: null,
    aluno_id: null,
    duracao: 60,
    dias_semana: [],
    periodo_meses: 12,
    total_sessoes: 20,
    data_inicio: null,
    data_fim: null,
    pausa_inicio: null,
    pausa_fim: null,
    observacoes: "",
    renovacao: false,
  };

  document.getElementById("alunoSearchResults").classList.remove("show");
}

function filtrarAlunos() {
  const termo = document
    .getElementById("alunoSearchInput")
    .value.toLowerCase()
    .trim();
  const resultsContainer = document.getElementById("alunoSearchResults");

  if (termo.length < 2) {
    resultsContainer.classList.remove("show");
    return;
  }

  const alunosFiltrados = estado.dados.alunos.filter(
    (aluno) =>
      aluno.nome.toLowerCase().includes(termo) ||
      (aluno.cpf && aluno.cpf.includes(termo)),
  );

  if (alunosFiltrados.length === 0) {
    resultsContainer.innerHTML =
      '<div class="aluno-search-result-item">Nenhum aluno encontrado</div>';
    resultsContainer.classList.add("show");
    return;
  }

  resultsContainer.innerHTML = alunosFiltrados
    .map(
      (aluno) => `
      <div class="aluno-search-result-item" onclick="selecionarAluno(${aluno.id})">
        <span class="nome">${aluno.nome}</span>
        ${aluno.cpf ? `<span class="cpf">${aluno.cpf}</span>` : ""}
      </div>
    `,
    )
    .join("");
  resultsContainer.classList.add("show");
}

function selecionarAluno(alunoId) {
  const aluno = estado.dados.alunos.find((a) => a.id == alunoId);
  if (!aluno) return;

  document.getElementById("alunoSearchInput").value = aluno.nome;
  document.getElementById("agendamentoAlunoId").value = aluno.id;
  document.getElementById("alunoNomeAgendamento").textContent = aluno.nome;
  document.getElementById("alunoTelefoneAgendamento").textContent =
    aluno.telefone || "-";
  document.getElementById("alunoEmailAgendamento").textContent =
    aluno.email || "-";

  const fotoContainer = document.getElementById("alunoFoto");
  if (aluno.foto_url) {
    fotoContainer.innerHTML = `<img src="${aluno.foto_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    fotoContainer.innerHTML = '<i class="fas fa-user"></i>';
  }

  document.getElementById("alunoInfoContainer").style.display = "flex";
  document.getElementById("alunoSearchResults").classList.remove("show");

  estado.agendamentoAtual.aluno_id = aluno.id;
}

function selecionarTipoAgendamento(tipo) {
  estado.agendamentoAtual.tipo = tipo;

  document
    .querySelectorAll(".plano-tipo-option")
    .forEach((opt) => opt.classList.remove("selected"));
  document
    .getElementById(`tipo${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`)
    .classList.add("selected");

  document.getElementById("camposContinuo").style.display = "none";
  document.getElementById("camposSessoes").style.display = "none";
  document.getElementById("camposPeriodo").style.display = "none";

  if (tipo === "continuo") {
    document.getElementById("camposContinuo").style.display = "block";
    document.getElementById("agendamentoPeriodoMeses").value =
      estado.agendamentoAtual.periodo_meses || "12";
    if (!document.getElementById("agendamentoDataInicioContinuo").value) {
      document.getElementById("agendamentoDataInicioContinuo").value =
        getDataLocalString(new Date());
    }
  } else if (tipo === "sessoes") {
    document.getElementById("camposSessoes").style.display = "block";
    document.getElementById("agendamentoTotalSessoes").value =
      estado.agendamentoAtual.total_sessoes || 20;
    if (!document.getElementById("agendamentoDataInicioSessoes").value) {
      document.getElementById("agendamentoDataInicioSessoes").value =
        getDataLocalString(new Date());
    }
  } else if (tipo === "periodo") {
    document.getElementById("camposPeriodo").style.display = "block";
    if (!document.getElementById("agendamentoDataInicioPeriodo").value) {
      document.getElementById("agendamentoDataInicioPeriodo").value =
        getDataLocalString(new Date());
    }
    if (!document.getElementById("agendamentoDataFimPeriodo").value) {
      const fim = new Date();
      fim.setMonth(fim.getMonth() + 12);
      document.getElementById("agendamentoDataFimPeriodo").value =
        getDataLocalString(fim);
    }
  }

  calcularPrevisaoAgendamento();
}

function toggleHorarioDia(checkbox) {
  const dia = checkbox.value;
  const horarioInput = document.getElementById(`horario${dia}`);
  if (checkbox.checked) {
    horarioInput.disabled = false;
    horarioInput.classList.add("visible");
  } else {
    horarioInput.disabled = true;
    horarioInput.classList.remove("visible");
  }
  calcularPrevisaoAgendamento();
}

function getDiasHorariosSelecionados() {
  const dias = [];
  document
    .querySelectorAll(
      '#diasSemanaHorariosContainer input[type="checkbox"]:checked',
    )
    .forEach((cb) => {
      const dia = parseInt(cb.value);
      const horario = document.getElementById(`horario${dia}`).value;
      dias.push({ dia, horario });
    });
  return dias;
}

function calcularPrevisaoAgendamento() {
  const alunoId = estado.agendamentoAtual.aluno_id;
  if (!alunoId) {
    document.getElementById("previsaoAgendamento").innerHTML =
      "Selecione um aluno.";
    return;
  }

  const diasHorarios = getDiasHorariosSelecionados();
  if (diasHorarios.length === 0) {
    document.getElementById("previsaoAgendamento").innerHTML =
      "Selecione pelo menos um dia da semana.";
    return;
  }

  const tipo = estado.agendamentoAtual.tipo;
  if (!tipo) {
    document.getElementById("previsaoAgendamento").innerHTML =
      "Selecione o tipo de agendamento.";
    return;
  }

  let dataInicio, dataFim, totalSessoes;
  const pausaInicio = document.getElementById("agendamentoPausaInicio").value;
  const pausaFim = document.getElementById("agendamentoPausaFim").value;

  if (tipo === "continuo") {
    dataInicio = new Date(
      document.getElementById("agendamentoDataInicioContinuo").value +
        "T12:00:00",
    );
    const meses = parseInt(
      document.getElementById("agendamentoPeriodoMeses").value,
    );
    if (meses > 0) {
      dataFim = new Date(dataInicio);
      dataFim.setMonth(dataFim.getMonth() + meses);
    } else if (meses === 0) {
      // Até o fim do ano
      dataFim = new Date(dataInicio.getFullYear(), 11, 31);
    }
    if (!dataInicio || isNaN(dataInicio)) {
      document.getElementById("previsaoAgendamento").innerHTML =
        "Data de início inválida.";
      return;
    }
  } else if (tipo === "sessoes") {
    dataInicio = new Date(
      document.getElementById("agendamentoDataInicioSessoes").value +
        "T12:00:00",
    );
    totalSessoes = parseInt(
      document.getElementById("agendamentoTotalSessoes").value,
    );
    if (!dataInicio || isNaN(dataInicio)) {
      document.getElementById("previsaoAgendamento").innerHTML =
        "Data de início inválida.";
      return;
    }
  } else if (tipo === "periodo") {
    dataInicio = new Date(
      document.getElementById("agendamentoDataInicioPeriodo").value +
        "T12:00:00",
    );
    dataFim = new Date(
      document.getElementById("agendamentoDataFimPeriodo").value + "T12:00:00",
    );
    if (!dataInicio || !dataFim || isNaN(dataInicio) || isNaN(dataFim)) {
      document.getElementById("previsaoAgendamento").innerHTML =
        "Datas de início e fim inválidas.";
      return;
    }
    if (dataFim < dataInicio) {
      document.getElementById("previsaoAgendamento").innerHTML =
        "Data de término deve ser posterior à data de início.";
      return;
    }
  }

  let datasGeradas = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (tipo === "continuo" || tipo === "periodo") {
    let current = new Date(dataInicio);
    while (current <= dataFim) {
      const diaSemana = current.getDay();
      const diaMap = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
      const nossoDia = diaMap[diaSemana];
      const encontrado = diasHorarios.find((d) => d.dia === nossoDia);
      if (encontrado) {
        const dataStr = getDataLocalString(current);
        if (
          pausaInicio &&
          pausaFim &&
          dataStr >= pausaInicio &&
          dataStr <= pausaFim
        ) {
          // pausa, não gera
        } else {
          datasGeradas.push({
            data: new Date(current),
            horario: encontrado.horario,
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (tipo === "sessoes") {
    let current = new Date(dataInicio);
    let count = 0;
    while (count < totalSessoes) {
      const diaSemana = current.getDay();
      const diaMap = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
      const nossoDia = diaMap[diaSemana];
      const encontrado = diasHorarios.find((d) => d.dia === nossoDia);
      if (encontrado) {
        const dataStr = getDataLocalString(current);
        if (
          pausaInicio &&
          pausaFim &&
          dataStr >= pausaInicio &&
          dataStr <= pausaFim
        ) {
          // pausa
        } else {
          datasGeradas.push({
            data: new Date(current),
            horario: encontrado.horario,
          });
          count++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
  }

  datasGeradas.sort((a, b) => a.data - b.data);

  const previsaoDiv = document.getElementById("previsaoAgendamento");
  if (datasGeradas.length === 0) {
    previsaoDiv.innerHTML = "Nenhuma aula gerada com os critérios atuais.";
    return;
  }

  let html = `<strong>Total de aulas: ${datasGeradas.length}</strong><br><br>`;
  const diasSemanaNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  datasGeradas.slice(0, 30).forEach((item) => {
    const data = item.data;
    const diaSemana = diasSemanaNomes[data.getDay()];
    html += `<div class="previa-item-plano"><span class="data">${data.toLocaleDateString(
      "pt-BR",
    )}</span> <span class="dia">${diaSemana} ${item.horario}</span></div>`;
  });
  if (datasGeradas.length > 30) {
    html += `<div>... e mais ${datasGeradas.length - 30} aulas</div>`;
  }
  previsaoDiv.innerHTML = html;

  estado.agendamentoAtual.dias_semana = diasHorarios;
  estado.agendamentoAtual.data_inicio = dataInicio
    ? getDataLocalString(dataInicio)
    : null;
  estado.agendamentoAtual.data_fim = dataFim
    ? getDataLocalString(dataFim)
    : null;
  estado.agendamentoAtual.total_sessoes = totalSessoes;
  estado.agendamentoAtual.pausa_inicio = pausaInicio || null;
  estado.agendamentoAtual.pausa_fim = pausaFim || null;
  estado.agendamentoAtual.duracao = parseInt(
    document.getElementById("agendamentoDuracao").value,
  );
  estado.agendamentoAtual.observacoes = document.getElementById(
    "agendamentoObservacoes",
  ).value;
}

async function salvarAgendamento() {
  if (!estado.agendamentoAtual.aluno_id) {
    return mostrarToast("Selecione um aluno.", "error");
  }
  if (!estado.agendamentoAtual.tipo) {
    return mostrarToast("Selecione o tipo de agendamento.", "error");
  }
  if (getDiasHorariosSelecionados().length === 0) {
    return mostrarToast("Selecione pelo menos um dia da semana.", "error");
  }
  const planoSelect = document.getElementById("agendamentoPlanoId");
  const planoOption = planoSelect.options[planoSelect.selectedIndex];
  const planoNome = planoOption ? planoOption.getAttribute("data-nome") : "";
  if (!planoNome) {
    return mostrarToast("Selecione um plano.", "error");
  }

  abrirModalConfirmar("Deseja realmente gerar este agendamento?", async () => {
    calcularPrevisaoAgendamento();
    const alunoId = estado.agendamentoAtual.aluno_id;
    const tipo = estado.agendamentoAtual.tipo;
    const diasHorarios = getDiasHorariosSelecionados();
    const planoData = {
      aluno_id: parseInt(alunoId),
      plano: planoNome,
      tipo_plano: tipo,
      duracao: estado.agendamentoAtual.duracao,
      observacoes: estado.agendamentoAtual.observacoes,
      pausa_inicio: estado.agendamentoAtual.pausa_inicio,
      pausa_fim: estado.agendamentoAtual.pausa_fim,
      status: "ativo",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    if (tipo === "continuo") {
      planoData.periodo_meses = estado.agendamentoAtual.periodo_meses;
      const dataInicio = new Date(
        estado.agendamentoAtual.data_inicio + "T12:00:00",
      );
      let dataFim;
      if (estado.agendamentoAtual.periodo_meses > 0) {
        dataFim = new Date(dataInicio);
        dataFim.setMonth(
          dataFim.getMonth() + estado.agendamentoAtual.periodo_meses,
        );
      } else {
        dataFim = new Date(dataInicio.getFullYear(), 11, 31);
      }
      planoData.data_inicio = getDataLocalString(dataInicio);
      planoData.data_fim = getDataLocalString(dataFim);
      planoData.renovacao_automatica = true;
    } else if (tipo === "sessoes") {
      planoData.total_sessoes = estado.agendamentoAtual.total_sessoes;
      planoData.data_inicio = estado.agendamentoAtual.data_inicio;
      planoData.sessoes_realizadas = 0;
    } else if (tipo === "periodo") {
      planoData.data_inicio = estado.agendamentoAtual.data_inicio;
      planoData.data_fim = estado.agendamentoAtual.data_fim;
    }

    mostrarLoading();
    try {
      const { data: planoInserido, error: erroPlano } = await supabaseClient
        .from("planos_alunos")
        .insert(planoData)
        .select()
        .single();
      if (erroPlano) throw erroPlano;

      const horariosParaInserir = diasHorarios.map((dh) => ({
        plano_aluno_id: planoInserido.id,
        dia_semana: dh.dia,
        horario: dh.horario + ":00",
      }));
      const { error: erroHorarios } = await supabaseClient
        .from("planos_horarios")
        .insert(horariosParaInserir);
      if (erroHorarios) throw erroHorarios;

      const aulasParaInserir = [];
      const pausaInicio = estado.agendamentoAtual.pausa_inicio;
      const pausaFim = estado.agendamentoAtual.pausa_fim;

      let dataInicio, dataFim, totalSessoes;
      if (tipo === "continuo") {
        dataInicio = new Date(planoData.data_inicio + "T12:00:00");
        dataFim = new Date(planoData.data_fim + "T12:00:00");
      } else if (tipo === "sessoes") {
        dataInicio = new Date(planoData.data_inicio + "T12:00:00");
        totalSessoes = planoData.total_sessoes;
      } else if (tipo === "periodo") {
        dataInicio = new Date(planoData.data_inicio + "T12:00:00");
        dataFim = new Date(planoData.data_fim + "T12:00:00");
      }

      let current = new Date(dataInicio);
      let count = 0;
      const diasMap = diasHorarios.reduce((acc, d) => {
        acc[d.dia] = d.horario;
        return acc;
      }, {});

      while (true) {
        if (tipo === "sessoes" && count >= totalSessoes) break;
        if ((tipo === "continuo" || tipo === "periodo") && current > dataFim)
          break;

        const diaSemana = current.getDay();
        const diaMap = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
        const nossoDia = diaMap[diaSemana];
        const horario = diasMap[nossoDia];

        if (horario) {
          const dataStr = getDataLocalString(current);
          if (
            pausaInicio &&
            pausaFim &&
            dataStr >= pausaInicio &&
            dataStr <= pausaFim
          ) {
            // pausa
          } else {
            // Verificar conflito de horário com outras aulas do mesmo aluno
            const { data: conflitos, error: conflitoError } =
              await supabaseClient
                .from("aulas")
                .select("horario, duracao")
                .eq("aluno_id", parseInt(alunoId))
                .eq("data", dataStr)
                .neq("status", "cancelada");
            if (conflitoError) throw conflitoError;
            const novoInicio = horario.split(":").map(Number);
            const novoFim = new Date();
            novoFim.setHours(
              novoInicio[0],
              novoInicio[1] + estado.agendamentoAtual.duracao / 60,
              0,
            );
            let conflito = false;
            for (const a of conflitos) {
              const existingInicio = a.horario.split(":").map(Number);
              const existingFim = new Date();
              existingFim.setHours(
                existingInicio[0],
                existingInicio[1] + a.duracao / 60,
                0,
              );
              if (
                novoInicio[0] * 60 + novoInicio[1] <
                  existingFim.getHours() * 60 + existingFim.getMinutes() &&
                existingInicio[0] * 60 + existingInicio[1] <
                  novoFim.getHours() * 60 + novoFim.getMinutes()
              ) {
                conflito = true;
                break;
              }
            }
            if (conflito) {
              console.warn(
                `Conflito de horário para o aluno ${alunoId} em ${dataStr} ${horario}. Aula não gerada.`,
              );
              continue;
            }
            aulasParaInserir.push({
              aluno_id: parseInt(alunoId),
              plano_aluno_id: planoInserido.id,
              data: dataStr,
              horario: horario + ":00",
              duracao: estado.agendamentoAtual.duracao,
              status: "confirmada",
              observacoes: estado.agendamentoAtual.observacoes,
            });
            count++;
          }
        }

        current.setDate(current.getDate() + 1);
        if (tipo === "sessoes" && count >= totalSessoes) break;
      }

      if (aulasParaInserir.length > 0) {
        const { error: erroAulas } = await supabaseClient
          .from("aulas")
          .insert(aulasParaInserir);
        if (erroAulas) throw erroAulas;
      }

      mostrarToast(
        `Plano criado com ${aulasParaInserir.length} aulas!`,
        "success",
      );
      fecharModal("modalNovoAgendamento");
      await carregarTodosDados(true);
      if (estado.view === "dia") renderizarTimeline();
      else if (estado.view === "semana") renderizarSemana();
      else if (estado.view === "mes") await renderizarMes();
      carregarRelatorios();
      carregarDisponibilidade();
    } catch (error) {
      console.error(error);
      mostrarToast("Erro ao salvar agendamento: " + error.message, "error");
    } finally {
      esconderLoading();
    }
  });
}

function abrirModalNovaEspera() {
  document.getElementById("esperaId").value = "";
  document.getElementById("modalEsperaTitulo").innerHTML =
    '<i class="fas fa-clock"></i> Adicionar à Lista de Espera';

  const select = document.getElementById("esperaAlunoId");
  select.innerHTML = '<option value="">Selecione um aluno...</option>';
  estado.dados.alunos.forEach((a) => {
    select.innerHTML += `<option value="${a.id}">${a.nome}</option>`;
  });

  document.getElementById("esperaDiaSemana").value = "2";
  document.getElementById("esperaHorario").value = "08:00";

  document.getElementById("modalNovaEspera").classList.add("show");
}

function abrirModalEditarEspera(item) {
  document.getElementById("esperaId").value = item.id;
  document.getElementById("modalEsperaTitulo").innerHTML =
    '<i class="fas fa-edit"></i> Editar Lista de Espera';

  const select = document.getElementById("esperaAlunoId");
  select.innerHTML = '<option value="">Selecione um aluno...</option>';
  estado.dados.alunos.forEach((a) => {
    select.innerHTML += `<option value="${a.id}" ${
      a.id === item.aluno_id ? "selected" : ""
    }>${a.nome}</option>`;
  });

  document.getElementById("esperaDiaSemana").value = item.dia_semana;
  const horarioSemSegundos = item.horario ? item.horario.substring(0, 5) : "";
  document.getElementById("esperaHorario").value = horarioSemSegundos;

  document.getElementById("modalNovaEspera").classList.add("show");
}

async function salvarNovaEspera() {
  const esperaId = document.getElementById("esperaId").value;
  const alunoId = document.getElementById("esperaAlunoId").value;
  const diaSemana = document.getElementById("esperaDiaSemana").value;
  const horario = document.getElementById("esperaHorario").value;

  if (!alunoId || !diaSemana || !horario) {
    return mostrarToast("Preencha todos os campos obrigatórios", "error");
  }

  abrirModalConfirmar(
    esperaId
      ? "Deseja realmente editar este item?"
      : "Deseja realmente adicionar à lista de espera?",
    async () => {
      if (esperaId) {
        try {
          await supabaseClient.from("lista_espera").delete().eq("id", esperaId);
        } catch (error) {
          mostrarToast("Erro ao editar: " + error.message, "error");
          return;
        }
      }

      const { count, error: countError } = await supabaseClient
        .from("lista_espera")
        .select("*", { count: "exact", head: true })
        .eq("dia_semana", diaSemana)
        .eq("horario", horario + ":00");

      if (countError) throw countError;

      const posicao = (count || 0) + 1;

      mostrarLoading();
      try {
        const { error } = await supabaseClient.from("lista_espera").insert({
          aluno_id: parseInt(alunoId),
          dia_semana: parseInt(diaSemana),
          horario: horario + ":00",
          posicao,
        });
        if (error) throw error;
        await carregarListaEspera(true);
        fecharModal("modalNovaEspera");
        mostrarToast(
          esperaId
            ? "Registro atualizado com sucesso!"
            : `Aluno adicionado à lista de espera (posição ${posicao})`,
          "success",
        );
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao salvar: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

async function excluirEspera(id) {
  abrirModalConfirmar(
    "Tem certeza que deseja excluir este aluno da lista de espera?",
    async () => {
      mostrarLoading();
      try {
        const { data: item, error: fetchError } = await supabaseClient
          .from("lista_espera")
          .select("dia_semana, horario, posicao")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;

        const { error: deleteError } = await supabaseClient
          .from("lista_espera")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        // Reordenar posições em lote usando função RPC
        const { error: updateError } = await supabaseClient.rpc(
          "decrementar_posicoes_espera",
          {
            p_dia_semana: item.dia_semana,
            p_horario: item.horario,
            p_posicao: item.posicao,
          },
        );

        if (updateError) throw updateError;

        await carregarListaEspera(true);
        mostrarToast(
          "Aluno removido da lista de espera com sucesso!",
          "success",
        );
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao excluir: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

function atualizarListaEsperaUI() {
  const count = document.getElementById("esperaCount");
  const grid = document.getElementById("esperaGrid");
  if (!count || !grid) return;
  const listaEspera = estado.dados.listaEspera || [];

  const itensValidos = listaEspera.filter((item) => {
    if (!item.horario || item.horario.trim() === "") {
      return false;
    }
    return true;
  });

  const grupos = {};
  itensValidos.forEach((item) => {
    const key = `${item.dia_semana}_${item.horario}`;
    if (!grupos[key]) {
      grupos[key] = {
        dia_semana: item.dia_semana,
        horario: item.horario,
        alunos: [],
      };
    }
    grupos[key].alunos.push(item);
  });

  const gruposArray = Object.values(grupos).sort((a, b) => {
    if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
    return a.horario.localeCompare(b.horario);
  });

  count.textContent = itensValidos.length;

  if (gruposArray.length === 0) {
    grid.innerHTML =
      '<div style="text-align: center; padding: 2rem;">Nenhum aluno na lista de espera</div>';
    return;
  }

  const diasSemanaNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let html = "";

  gruposArray.forEach((grupo) => {
    const diaNome = diasSemanaNomes[grupo.dia_semana - 1] || "?";
    const horarioFormatado = grupo.horario.substring(0, 5);
    html += `<div class="espera-grupo" style="margin-bottom: 1rem;">`;
    html += `<h4 style="margin: 0 0 0.5rem; color: var(--verde-principal);"><i class="far fa-calendar-alt"></i> ${diaNome} às ${horarioFormatado}</h4>`;
    grupo.alunos
      .sort((a, b) => a.posicao - b.posicao)
      .forEach((item) => {
        const nomeAluno = item.alunos?.nome || "Aluno não encontrado";
        html += `
        <div class="espera-card">
          <div class="espera-posicao">${item.posicao}</div>
          <div class="espera-info">
            <div class="espera-nome">${nomeAluno}</div>
          </div>
          <div class="espera-actions">
            <button class="espera-btn edit" onclick='abrirModalEditarEspera(${JSON.stringify(
              item,
            ).replace(
              /'/g,
              "\\'",
            )})' title="Editar"><i class="fas fa-edit"></i></button>
            <button class="espera-btn delete" onclick="excluirEspera(${
              item.id
            })" title="Excluir"><i class="fas fa-trash-alt"></i></button>
            <button class="espera-btn" onclick="notificarVaga(${
              item.id
            }, ${item.aluno_id})" title="Notificar aluno sobre vaga disponível"><i class="fas fa-bell"></i></button>
          </div>
        </div>
      `;
      });
    html += `</div>`;
  });

  grid.innerHTML = html;
}

function renderizarTimeline() {
  const dataStr = getDataLocalString(estado.dataAtual);

  let aulas = estado.dados.aulas.filter(
    (a) => a.data === dataStr && a.status !== "cancelada",
  );
  aulas = filtrarAulas(aulas);
  aulas.sort((a, b) => a.horario.localeCompare(b.horario));

  document.getElementById("timelineDate").innerHTML =
    estado.dataAtual.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const timeline = document.getElementById("timelineHorizontal");

  const feriado = estado.dados.feriados[dataStr];
  if (feriado) {
    const timelineHeader = document.querySelector(".timeline-header");
    const alertaExistente = document.getElementById("alertaFeriadoHeader");
    if (!alertaExistente) {
      const alertaHTML = `
      <div id="alertaFeriadoHeader" class="alerta-feriado" style="margin-bottom: 1rem; padding: 0.8rem; background: var(--roxo-suave); border-left: 4px solid var(--roxo-celebracao); border-radius: 8px;">
        <i class="fas fa-umbrella-beach"></i> <strong>${feriado.titulo}</strong> - Hoje é feriado/evento. A agenda pode estar bloqueada.
      </div>
    `;
      timelineHeader.insertAdjacentHTML("afterend", alertaHTML);
    }
  }

  if (aulas.length === 0) {
    timeline.innerHTML =
      '<div style="text-align: center; padding: 2rem; width: 100%;">Nenhuma aula agendada para este dia</div>';
    return;
  }

  const aulasPorHorario = {};
  aulas.forEach((a) => {
    const horarioKey = a.horario.substring(0, 5);
    if (!aulasPorHorario[horarioKey]) aulasPorHorario[horarioKey] = [];
    aulasPorHorario[horarioKey].push(a);
  });

  timeline.innerHTML = Object.keys(aulasPorHorario)
    .sort()
    .map((horario) => {
      const aulasDoHorario = aulasPorHorario[horario];
      const qtd = aulasDoHorario.length;

      let grupoClass = "timeline-time-group",
        badgeClass = "time-group-badge",
        fillClass = "ocupacao-fill-small";
      if (qtd >= CAPACIDADE_PADRAO) {
        grupoClass += " lotado";
        badgeClass += " lotado";
        fillClass += " lotado";
      } else if (qtd >= ALERTA_80) {
        grupoClass += " alerta-80";
        badgeClass += " alerta-80";
        fillClass += " alerta-80";
      } else {
        badgeClass += " normal";
        fillClass += " normal";
      }

      const percentual = (qtd / CAPACIDADE_PADRAO) * 100;

      const cards = [];

      aulasDoHorario.forEach((a) => {
        const docsAluno = estado.dados.documentos.filter(
          (d) => d.aluno_id === a.aluno_id,
        ).length;

        let cardClass = "mini-card";
        if (qtd >= CAPACIDADE_PADRAO) cardClass += " lotado";
        else if (qtd >= ALERTA_80) cardClass += " alerta-80";
        if (a.presenca === "presente") cardClass += " presente";
        else if (a.presenca === "ausente") cardClass += " ausente";
        else if (a.status === "reagendada") cardClass += " reagendada";

        const planoInfo = a.plano_aluno_id ? "📋" : "";
        const ocupacaoHorario = `${qtd}/${CAPACIDADE_PADRAO}`;

        cards.push(`
        <div class="${cardClass}" draggable="true" ondragstart="dragStartHandler(event, this)" ondragend="dragEndHandler(event)" onclick="abrirDetalhesAula(${a.id})" title="${a.alunoNome} - ${
          a.observacoes || "Aula de Pilates"
        } | Ocupação: ${ocupacaoHorario}">
          <div class="mini-card-header">
            <span class="mini-card-aluno" title="${a.alunoNome}">${planoInfo} ${a.alunoNome}</span>
            <span class="mini-card-status">${a.presenca || a.status || "Conf"}</span>
          </div>
          <div class="mini-card-foco" title="${
            a.observacoes || "Aula de Pilates"
          }">${a.observacoes || "Aula de Pilates"}</div>
          <div class="mini-card-footer">
            <span class="mini-card-docs"><i class="fas fa-paperclip"></i> ${docsAluno}</span>
            <span class="mini-card-check ${a.presenca || ""}">
              ${
                a.checkin
                  ? `<i class="fas fa-sign-in-alt" title="Check-in: ${a.checkin.substring(
                      0,
                      5,
                    )}"></i>`
                  : ""
              }
              ${
                a.checkout
                  ? `<i class="fas fa-sign-out-alt" title="Check-out: ${a.checkout.substring(
                      0,
                      5,
                    )}"></i>`
                  : ""
              }
            </span>
          </div>
        </div>
      `);
      });

      for (let i = cards.length; i < CAPACIDADE_PADRAO; i++) {
        cards.push(`
        <div class="mini-card vazio" ondragover="dragOverHandler(event)" ondrop="dropHandler(event, '${horario}', '${dataStr}')" title="Horário vago">
          <div class="mini-card-header"><span class="mini-card-aluno">— Vago —</span></div>
          <div class="mini-card-foco">Aguardando aluno</div>
        </div>
      `);
      }

      return `
      <div class="${grupoClass}" ondragover="dragOverHandler(event)" ondrop="dropHandler(event, '${horario}', '${dataStr}')">
        <div class="time-group-header">
          <span class="time-group-horario">${horario}</span>
          <span class="${badgeClass}" title="${
            qtd >= CAPACIDADE_PADRAO
              ? "Lotado"
              : qtd >= ALERTA_80
                ? "Quase lotado"
                : "Normal"
          }">${qtd}/${CAPACIDADE_PADRAO}</span>
        </div>
        <div class="time-group-ocupacao">
          <div class="ocupacao-bar-small"><div class="${fillClass}" style="width: ${percentual}%"></div></div>
          <span class="ocupacao-texto">${qtd}/${CAPACIDADE_PADRAO}</span>
        </div>
        <div class="time-group-cards">${cards.join("")}</div>
      </div>
    `;
    })
    .join("");
}

function renderizarSemana() {
  const dataInicio = new Date(estado.dataAtual);
  dataInicio.setDate(estado.dataAtual.getDate() - estado.dataAtual.getDay());
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(dataInicio);
    dia.setDate(dataInicio.getDate() + i);
    dias.push(dia);
  }
  const horarios = HORARIOS_FUNCIONAMENTO;
  let html = '<table class="week-table"><thead>麋<th>Horário</th>';
  dias.forEach((dia) => {
    html += `<th>${dia.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    })}</th>`;
  });
  html += "</thead><tbody>";

  horarios.forEach((horario) => {
    html += `<tr><td class="week-time-cell">${horario}</td>`;
    dias.forEach((dia) => {
      const dataStr = getDataLocalString(dia);
      const feriado = estado.dados.feriados[dataStr];
      let cellClass = "week-day-cell";
      if (feriado) cellClass += " feriado";
      html += `<td class="${cellClass}" title="${
        feriado ? feriado.titulo : ""
      }">`;
      if (feriado) {
        html += `<div class="alerta-feriado" style="margin-bottom:0.5rem;"><i class="fas fa-umbrella-beach"></i> ${feriado.titulo}</div>`;
      }
      let aulasDia = estado.dados.aulas.filter(
        (a) =>
          a.data === dataStr &&
          a.horario.substring(0, 5) === horario &&
          a.status !== "cancelada",
      );
      aulasDia = filtrarAulas(aulasDia);
      if (aulasDia.length > 0) {
        aulasDia.forEach((a) => {
          let cardClass = "week-card";
          const mesmoHorario = estado.dados.aulas.filter(
            (au) =>
              au.data === dataStr && au.horario.substring(0, 5) === horario,
          ).length;
          if (mesmoHorario >= CAPACIDADE_PADRAO) cardClass += " lotado";
          else if (mesmoHorario >= ALERTA_80) cardClass += " alerta-80";
          if (a.presenca === "presente") cardClass += " presente";
          else if (a.presenca === "ausente") cardClass += " ausente";
          else if (a.status === "reagendada") cardClass += " reagendada";

          const planoInfo = a.plano_aluno_id ? "📋 " : "";
          html += `<div class="${cardClass}" onclick="abrirDetalhesAula(${a.id})" title="${
            a.alunoNome
          } - Ocupação: ${mesmoHorario}/${CAPACIDADE_PADRAO}">
          <div class="week-card-aluno">${planoInfo}${a.alunoNome}</div>
          <div class="week-card-foco">${a.observacoes || "Pilates"}</div>
          <div class="week-card-status">${
            a.presenca === "presente"
              ? "✅"
              : a.presenca === "ausente"
                ? "❌"
                : "⏳"
          }</div>
        </div>`;
        });
      } else if (!feriado) {
        html +=
          '<div style="color: var(--grafite-claro); font-size:0.7rem; text-align: center;">—</div>';
      }
      html += `</td>`;
    });
    html += `</tr>`;
  });
  html += "</tbody></table>";
  document.getElementById("weekTableContainer").innerHTML = html;
}

async function renderizarMes() {
  const primeiroDia = new Date(
    estado.dataAtual.getFullYear(),
    estado.dataAtual.getMonth(),
    1,
  );
  const ultimoDia = new Date(
    estado.dataAtual.getFullYear(),
    estado.dataAtual.getMonth() + 1,
    0,
  );
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let html = "";
  diasSemana.forEach(
    (dia) => (html += `<div class="month-weekday">${dia}</div>`),
  );
  const primeiroDiaSemana = primeiroDia.getDay();
  for (let i = 0; i < primeiroDiaSemana; i++)
    html += '<div class="month-day" style="opacity:0.3;"></div>';

  const hoje = new Date();
  const hojeStr = getDataLocalString(hoje);

  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const dataStr = `${estado.dataAtual.getFullYear()}-${String(
      estado.dataAtual.getMonth() + 1,
    ).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const isHoje = dataStr === hojeStr;
    const feriado = estado.dados.feriados[dataStr];
    let aulasDia = estado.dados.aulas.filter(
      (a) => a.data === dataStr && a.status !== "cancelada",
    );
    aulasDia = filtrarAulas(aulasDia);
    aulasDia.sort((a, b) => a.horario.localeCompare(b.horario));
    let dayClass = "month-day";
    if (isHoje) dayClass += " today";
    if (feriado) dayClass += " feriado";
    html += `<div class="${dayClass}" onclick="selecionarDiaMes('${dataStr}')" title="${
      feriado ? feriado.titulo : ""
    }">`;
    html += `<div class="month-day-number">${dia}</div>`;
    if (feriado) {
      html += `<div class="month-card bloqueado" title="${feriado.titulo}"><i class="fas fa-umbrella-beach"></i> ${feriado.titulo}</div>`;
    } else {
      aulasDia.slice(0, 3).forEach((a) => {
        const horario = a.horario.substring(0, 5);
        let cardClass = "month-card";
        const mesmoHorario = aulasDia.filter(
          (au) => au.horario.substring(0, 5) === horario,
        ).length;
        if (mesmoHorario >= CAPACIDADE_PADRAO) cardClass += " lotado";
        else if (mesmoHorario >= ALERTA_80) cardClass += " alerta-80";
        else if (a.status === "reagendada") cardClass += " reagendada";
        const planoInfo = a.plano_aluno_id ? "📋 " : "";
        html += `<div class="${cardClass}" onclick="event.stopPropagation(); abrirDetalhesAula(${a.id})" title="${
          a.alunoNome
        } - ${horario} (${mesmoHorario}/${CAPACIDADE_PADRAO})">
        <span class="month-card-time">${horario}</span> ${planoInfo}${
          a.alunoNome.split(" ")[0]
        }
      </div>`;
      });
      if (aulasDia.length > 3)
        html += `<div style="font-size:0.6rem; color:var(--verde-principal); text-align:right;">+${
          aulasDia.length - 3
        }</div>`;
    }
    html += `</div>`;
  }
  document.getElementById("monthGrid").innerHTML = html;
  document.getElementById("monthTitle").innerHTML =
    estado.dataAtual.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
}

function selecionarDiaMes(dataStr) {
  const partes = dataStr.split("-");
  estado.dataAtual = new Date(
    parseInt(partes[0]),
    parseInt(partes[1]) - 1,
    parseInt(partes[2]),
  );
  mudarView("dia");
  carregarDisponibilidade();
}

async function verificarFeriado(data) {
  const dataStr = data;
  const eventos = estado.dados.eventos.filter(
    (e) => e.data === dataStr && e.bloquear_agenda === true,
  );
  if (eventos.length > 0)
    return {
      bloqueado: true,
      titulo: eventos[0].titulo,
      tipo: eventos[0].tipo,
    };
  const diaMes = dataStr.substring(5);
  const eventosRecorrentes = estado.dados.eventos.filter(
    (e) =>
      e.recorrente === true &&
      e.data.substring(5) === diaMes &&
      e.bloquear_agenda === true,
  );
  if (eventosRecorrentes.length > 0)
    return {
      bloqueado: true,
      titulo: eventosRecorrentes[0].titulo,
      tipo: eventosRecorrentes[0].tipo,
    };
  return { bloqueado: false };
}

function mudarView(view) {
  estado.view = view;
  document
    .querySelectorAll(".view-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");
  document.getElementById("timelineSection").style.display =
    view === "dia" ? "block" : "none";
  document.getElementById("weekSection").style.display =
    view === "semana" ? "block" : "none";
  document.getElementById("monthSection").style.display =
    view === "mes" ? "block" : "none";
  if (view === "dia") renderizarTimeline();
  else if (view === "semana") renderizarSemana();
  else if (view === "mes") renderizarMes();
}

function navegarDia(direcao) {
  if (direcao === "anterior")
    estado.dataAtual.setDate(estado.dataAtual.getDate() - 1);
  else estado.dataAtual.setDate(estado.dataAtual.getDate() + 1);
  renderizarTimeline();
  carregarDisponibilidade();
}

function navegarSemana(direcao) {
  if (direcao === "anterior")
    estado.dataAtual.setDate(estado.dataAtual.getDate() - 7);
  else estado.dataAtual.setDate(estado.dataAtual.getDate() + 7);
  renderizarSemana();
}

function navegarMes(direcao) {
  if (direcao === "anterior")
    estado.dataAtual.setMonth(estado.dataAtual.getMonth() - 1);
  else estado.dataAtual.setMonth(estado.dataAtual.getMonth() + 1);
  renderizarMes();
}

function irParaHoje() {
  estado.dataAtual = new Date();
  if (estado.view === "dia") renderizarTimeline();
  else if (estado.view === "semana") renderizarSemana();
  else if (estado.view === "mes") renderizarMes();
  carregarDisponibilidade();
}

function aplicarFiltros() {
  estado.filtros.aluno = document.getElementById("filtroAluno").value;
  estado.filtros.status = document.getElementById("filtroStatus").value;
  estado.filtros.horario = document.getElementById("filtroHorario").value;
  estado.filtros.periodo = document.getElementById("filtroPeriodo").value;
  if (estado.view === "dia") renderizarTimeline();
  else if (estado.view === "semana") renderizarSemana();
  else if (estado.view === "mes") renderizarMes();
}

function limparFiltros() {
  document.getElementById("filtroAluno").value = "";
  document.getElementById("filtroStatus").value = "";
  document.getElementById("filtroHorario").value = "";
  document.getElementById("filtroPeriodo").value = "";
  estado.filtros = { aluno: "", status: "", horario: "", periodo: "" };
  aplicarFiltros();
}

function filtrarAulas(aulas) {
  return aulas.filter((a) => {
    if (estado.filtros.aluno && a.aluno_id != estado.filtros.aluno)
      return false;
    if (estado.filtros.status) {
      if (estado.filtros.status === "presente" && a.presenca !== "presente")
        return false;
      if (estado.filtros.status === "ausente" && a.presenca !== "ausente")
        return false;
      if (
        estado.filtros.status === "justificada" &&
        a.presenca !== "justificada"
      )
        return false;
      if (estado.filtros.status === "reagendada" && a.status !== "reagendada")
        return false;
      if (estado.filtros.status === "cancelada" && a.status !== "cancelada")
        return false;
      if (estado.filtros.status === "confirmada") {
        if (a.status !== "confirmada" || a.presenca) return false;
      }
    }
    if (
      estado.filtros.horario &&
      a.horario.substring(0, 5) !== estado.filtros.horario
    )
      return false;
    if (estado.filtros.periodo) {
      const hora = parseInt(a.horario.split(":")[0]),
        minuto = parseInt(a.horario.split(":")[1]),
        horaMinuto = hora + minuto / 60;
      if (
        estado.filtros.periodo === "manha" &&
        (horaMinuto < 8 || horaMinuto >= 12)
      )
        return false;
      if (
        estado.filtros.periodo === "tarde" &&
        (horaMinuto < 13.5 || horaMinuto >= 20.5)
      )
        return false;
    }
    return true;
  });
}

function popularSelects() {
  const selectAluno = document.getElementById("filtroAluno");
  selectAluno.innerHTML =
    '<option value="">Todos os alunos</option>' +
    estado.dados.alunos
      .map((a) => `<option value="${a.id}">${a.nome}</option>`)
      .join("");
  const selectHorario = document.getElementById("filtroHorario");
  selectHorario.innerHTML =
    '<option value="">Todos os horários</option>' +
    HORARIOS_FUNCIONAMENTO.map(
      (h) => `<option value="${h}">${h}</option>`,
    ).join("");
}

function popularSelectsAlunos() {
  const selectAluno = document.getElementById("aulaAluno");
  selectAluno.innerHTML =
    '<option value="">Selecione um aluno...</option>' +
    estado.dados.alunos
      .map((a) => `<option value="${a.id}">${a.nome}</option>`)
      .join("");
}

function atualizarDiasSemanaLote() {
  const vezes = parseInt(document.getElementById("loteVezesSemana").value);
  const container = document.getElementById("diasSemanaContainerLote");
  const dias = [
    { valor: 1, nome: "Seg" },
    { valor: 2, nome: "Ter" },
    { valor: 3, nome: "Qua" },
    { valor: 4, nome: "Qui" },
    { valor: 5, nome: "Sex" },
    { valor: 6, nome: "Sáb" },
    { valor: 0, nome: "Dom" },
  ];
  let html = "";
  dias.forEach((dia) => {
    const checked = dia.valor >= 1 && dia.valor <= vezes ? "checked" : "";
    html += `<label class="dia-checkbox"><input type="checkbox" value="${dia.valor}" ${checked} onchange="calcularPrevisaoLote()"> ${dia.nome}</label>`;
  });
  container.innerHTML = html;
  calcularPrevisaoLote();
}

function calcularPrevisaoLote() {
  const totalAulas = parseInt(document.getElementById("loteTotal").value) || 20;
  const dataInicio = document.getElementById("loteDataInicio").value;
  const horario = document.getElementById("loteHorario").value;
  if (!dataInicio || !horario) {
    document.getElementById("previsaoLote").innerHTML =
      "Selecione a data de início e horário.";
    return;
  }
  const diasSelecionados = [];
  document
    .querySelectorAll("#diasSemanaContainerLote input:checked")
    .forEach((cb) => diasSelecionados.push(parseInt(cb.value)));
  if (diasSelecionados.length === 0) {
    document.getElementById("previsaoLote").innerHTML =
      "Selecione pelo menos um dia da semana.";
    return;
  }
  const pausaInicio = document.getElementById("lotePausaInicio").value;
  const pausaFim = document.getElementById("lotePausaFim").value;
  const dataBase = new Date(dataInicio + "T12:00:00");
  const datas = [];
  let dataAtual = new Date(dataBase);
  let semanas = 0;

  while (datas.length < totalAulas && semanas < 52) {
    const diaSemana = dataAtual.getDay();
    const dataStr = getDataLocalString(dataAtual);
    if (pausaInicio && pausaFim) {
      if (dataStr >= pausaInicio && dataStr <= pausaFim) {
        dataAtual.setDate(dataAtual.getDate() + 1);
        continue;
      }
    }
    if (diasSelecionados.includes(diaSemana)) {
      datas.push(new Date(dataAtual));
    }
    dataAtual.setDate(dataAtual.getDate() + 1);
    if (dataAtual.getDay() === dataBase.getDay()) semanas++;
  }

  const aulasPrevistas = datas.slice(0, totalAulas);
  if (aulasPrevistas.length === 0) {
    document.getElementById("previsaoLote").innerHTML =
      "Não foi possível gerar aulas com os critérios selecionados.";
    return;
  }
  const dataTermino = aulasPrevistas[aulasPrevistas.length - 1];
  const diasSemana = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  let html = `<strong>Total: ${aulasPrevistas.length} aulas</strong><br><small>Horário: ${horario}</small><br><small>Previsão de término: ${dataTermino.toLocaleDateString(
    "pt-BR",
  )}</small><br><br><strong>Todas as aulas:</strong>`;
  aulasPrevistas.forEach((data) => {
    html += `<div class="previa-item"><span class="data">${data.toLocaleDateString(
      "pt-BR",
    )}</span> <span class="dia">${diasSemana[data.getDay()]}</span></div>`;
  });
  document.getElementById("previsaoLote").innerHTML = html;
}

async function salvarLote() {
  const alunoId = document.getElementById("aulaAluno").value;
  const totalAulas = parseInt(document.getElementById("loteTotal").value);
  const dataInicio = document.getElementById("loteDataInicio").value;
  const horario = document.getElementById("loteHorario").value;
  const pausaInicio = document.getElementById("lotePausaInicio").value;
  const pausaFim = document.getElementById("lotePausaFim").value;
  const diasSelecionados = [];
  document
    .querySelectorAll("#diasSemanaContainerLote input:checked")
    .forEach((cb) => diasSelecionados.push(parseInt(cb.value)));
  if (!alunoId || !dataInicio || !horario || diasSelecionados.length === 0) {
    return mostrarToast("Preencha todos os campos obrigatórios", "error");
  }

  abrirModalConfirmar(
    "Deseja realmente gerar este lote de aulas?",
    async () => {
      mostrarLoading();
      try {
        const { data: lote, error: erroLote } = await supabaseClient
          .from("lotes")
          .insert({
            aluno_id: parseInt(alunoId),
            total_aulas: totalAulas,
            data_inicio: dataInicio,
            horario: horario + ":00",
            dias_semana: diasSelecionados,
            pausa_inicio: pausaInicio || null,
            pausa_fim: pausaFim || null,
          })
          .select()
          .single();
        if (erroLote) throw erroLote;

        const aulas = [];
        let dataAtual = new Date(dataInicio + "T12:00:00");
        let aulasGeradas = 0;
        while (aulasGeradas < totalAulas) {
          const diaSemana = dataAtual.getDay();
          const dataStr = getDataLocalString(dataAtual);
          if (pausaInicio && pausaFim) {
            if (dataStr >= pausaInicio && dataStr <= pausaFim) {
              dataAtual.setDate(dataAtual.getDate() + 1);
              continue;
            }
          }
          if (diasSelecionados.includes(diaSemana)) {
            // Verificar conflito de horário
            const { data: conflitos, error: conflitoError } =
              await supabaseClient
                .from("aulas")
                .select("horario, duracao")
                .eq("aluno_id", parseInt(alunoId))
                .eq("data", dataStr)
                .neq("status", "cancelada");
            if (conflitoError) throw conflitoError;
            const novoInicio = horario.split(":").map(Number);
            const novoFim = new Date();
            novoFim.setHours(novoInicio[0], novoInicio[1] + 60, 0);
            let conflito = false;
            for (const a of conflitos) {
              const existingInicio = a.horario.split(":").map(Number);
              const existingFim = new Date();
              existingFim.setHours(
                existingInicio[0],
                existingInicio[1] + a.duracao / 60,
                0,
              );
              if (
                novoInicio[0] * 60 + novoInicio[1] <
                  existingFim.getHours() * 60 + existingFim.getMinutes() &&
                existingInicio[0] * 60 + existingInicio[1] <
                  novoFim.getHours() * 60 + novoFim.getMinutes()
              ) {
                conflito = true;
                break;
              }
            }
            if (conflito) {
              console.warn(
                `Conflito de horário para o aluno ${alunoId} em ${dataStr} ${horario}. Aula não gerada.`,
              );
              dataAtual.setDate(dataAtual.getDate() + 1);
              continue;
            }
            aulas.push({
              aluno_id: parseInt(alunoId),
              lote_id: lote.id,
              data: getDataLocalString(dataAtual),
              horario: horario + ":00",
              duracao: 60,
              status: "confirmada",
            });
            aulasGeradas++;
          }
          dataAtual.setDate(dataAtual.getDate() + 1);
        }

        if (aulas.length > 0) {
          const { error: erroAulas } = await supabaseClient
            .from("aulas")
            .insert(aulas);
          if (erroAulas) throw erroAulas;
        }

        mostrarToast(`Lote criado com ${aulas.length} aulas!`, "success");
        fecharModal("modalNovaAula");
        await carregarTodosDados(true);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao criar lote: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

function mudarTab(nome, event) {
  const modal = event.target.closest(".modal");
  if (!modal) return;
  modal
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  modal.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  const tabId = "tab" + nome.charAt(0).toUpperCase() + nome.slice(1);
  const tabElement = document.getElementById(tabId);
  if (tabElement) tabElement.classList.add("active");
  event.target.classList.add("active");
  const btnSalvarLote = document.getElementById("btnSalvarLote");
  if (btnSalvarLote)
    btnSalvarLote.style.display = nome === "lote" ? "inline-flex" : "none";
  const btnSalvarAula = document.getElementById("btnSalvarAula");
  if (btnSalvarAula)
    btnSalvarAula.style.display = nome === "lote" ? "none" : "inline-flex";
}

function mudarTabDossie(nome, event) {
  const modal = document.getElementById("modalDossieCompleto");
  modal
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  modal.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  const tabId = "tabDossie" + nome.charAt(0).toUpperCase() + nome.slice(1);
  const tabElement = document.getElementById(tabId);
  if (tabElement) tabElement.classList.add("active");
  event.target.classList.add("active");
}

function abrirModalNovaAula() {
  limparFormulario();
  document.getElementById("aulaData").value = getDataLocalString(
    estado.dataAtual,
  );
  document.getElementById("loteDataInicio").value = getDataLocalString(
    estado.dataAtual,
  );
  document.getElementById("loteHorario").value = "09:00";
  document.getElementById("modalNovaAula").classList.add("show");
  pararVerificacaoDisponibilidade();
  iniciarVerificacaoDisponibilidade();
}

function limparFormulario() {
  document.getElementById("formNovaAula").reset();
  document.getElementById("aulaId").value = "";
  document.getElementById("loteId").value = "";
  document.getElementById("aulaOriginalId").value = "";
  document.getElementById("reagendamentoInfo").style.display = "none";
  document.getElementById("disponibilidadeHorario").style.display = "none";
  estado.alunoSelecionado = null;
  estado.aulaAtual = null;
  estado.loteAtual = null;
  estado.aulaReagendamento = null;
  const firstTab = document.querySelector(".tab");
  if (firstTab) {
    const event = { target: firstTab };
    mudarTab("dados", event);
  }
  document.getElementById("ocupacaoHorario").style.display = "none";
  document.getElementById("btnSalvarLote").style.display = "none";
  document.getElementById("btnSalvarAula").style.display = "inline-flex";
}

function carregarDadosAluno() {
  const alunoId = document.getElementById("aulaAluno").value;
  if (!alunoId) return;
  const aluno = estado.dados.alunos.find((a) => a.id == alunoId);
  if (!aluno) return;
  estado.alunoSelecionado = aluno;

  document.getElementById("aulaAlunoNome").value = aluno.nome;
  document.getElementById("alunoNome").textContent = aluno.nome;
  document.getElementById("alunoStatusBadge").textContent = aluno.ativo
    ? "Ativo"
    : "Inativo";
  document.getElementById("alunoStatusBadge").className = `status-badge ${
    aluno.ativo ? "presente" : "ausente"
  }`;
  document.getElementById("alunoTelefone").textContent = aluno.telefone || "-";
  document.getElementById("alunoEmail").textContent = aluno.email || "-";
  document.getElementById("alunoPlano").textContent = aluno.plano || "-";
  document.getElementById("alunoNascimento").value = aluno.nascimento || "";
  document.getElementById("alunoCPF").value = aluno.cpf || "";
  document.getElementById("alunoProfissao").value = aluno.profissao || "";
  document.getElementById("alunoContatoEmergencia").value =
    aluno.contato_emergencia || "";
  document.getElementById("alunoObservacoesSaude").value =
    aluno.observacoes_saude || "";

  const docsAluno = estado.dados.documentos.filter(
    (d) => d.aluno_id == alunoId,
  );
  const docsContainer = document.getElementById("documentosLista");
  if (docsAluno.length > 0) {
    docsContainer.innerHTML = docsAluno
      .map((doc) => {
        const iconType = doc.tipo?.includes("pdf")
          ? "fa-file-pdf"
          : doc.tipo?.includes("image")
            ? "fa-file-image"
            : "fa-file";
        return `<div class="documento-card"><div class="documento-icon"><i class="fas ${iconType}"></i></div><div class="documento-info"><div class="documento-nome">${
          doc.nome
        }</div><div class="documento-data">${new Date(
          doc.criado_em,
        ).toLocaleDateString(
          "pt-BR",
        )}</div></div><button class="documento-btn" onclick="window.open('${
          doc.url
        }', '_blank')"><i class="fas fa-eye"></i></button></div>`;
      })
      .join("");
  } else {
    docsContainer.innerHTML =
      '<p style="text-align: center; color: var(--grafite-claro);">Nenhum documento encontrado</p>';
  }
  carregarEvolucaoAluno(alunoId);
}

function carregarEvolucaoAluno(alunoId) {
  const evolucoes = estado.dados.evolucoes
    .filter((e) => e.aluno_id == alunoId)
    .sort((a, b) => new Date(b.data) - new Date(a.data));
  const timeline = document.getElementById("evolucaoTimeline");
  if (evolucoes.length === 0) {
    timeline.innerHTML =
      '<p style="text-align: center; color: var(--grafite-claro);">Nenhuma evolução registrada</p>';
    return;
  }
  timeline.innerHTML = evolucoes
    .map(
      (ev) => `
      <div class="evolucao-item">
        <div class="evolucao-data">${new Date(
          ev.data + "T12:00:00",
        ).toLocaleDateString("pt-BR")}</div>
        <div class="evolucao-card">
          <div class="evolucao-resumo">${ev.titulo}</div>
          <div class="evolucao-detalhes">${ev.descricao || ""}</div>
          ${
            ev.destaque
              ? '<div class="evolucao-destaque">⭐ Marco importante</div>'
              : ""
          }
        </div>
      </div>
    `,
    )
    .join("");
}

async function verificarDisponibilidade() {
  const data = document.getElementById("aulaData").value;
  const horario = document.getElementById("aulaHorario").value;
  if (!data || !horario) {
    document.getElementById("disponibilidadeHorario").style.display = "none";
    return;
  }
  const feriado = await verificarFeriado(data);
  if (feriado.bloqueado) {
    document.getElementById("disponibilidadeHorario").style.display = "block";
    document.getElementById("disponibilidadeBadge").textContent = "FERIADO";
    document.getElementById("disponibilidadeBadge").className =
      "disponibilidade-badge ocupado";
    document.getElementById("disponibilidadeInfo").innerHTML =
      `<i class="fas fa-umbrella-beach"></i> ${feriado.titulo} - Agenda bloqueada para este dia.`;
    document.getElementById("barraOcupacao").style.width = "100%";
    document.getElementById("barraOcupacao").className = "ocupacao-fill lotado";
    return;
  }
  const aulasMesmoHorario = estado.dados.aulas.filter(
    (a) =>
      a.data === data &&
      a.horario.substring(0, 5) === horario &&
      a.status !== "cancelada",
  );
  const qtd = aulasMesmoHorario.length;
  const percentual = (qtd / CAPACIDADE_PADRAO) * 100;

  document.getElementById("disponibilidadeHorario").style.display = "block";
  document.getElementById("barraOcupacao").style.width = percentual + "%";

  let badgeText = "",
    badgeClass = "",
    infoText = "";
  if (qtd >= CAPACIDADE_PADRAO) {
    badgeText = "LOTADO";
    badgeClass = "ocupado";
    infoText = `Horário completamente lotado (${qtd}/${CAPACIDADE_PADRAO} alunos)`;
    document.getElementById("barraOcupacao").className = "ocupacao-fill lotado";
  } else if (qtd >= ALERTA_80) {
    badgeText = "ALERTA";
    badgeClass = "alerta";
    infoText = `Horário com alta ocupação (${qtd}/${CAPACIDADE_PADRAO} alunos)`;
    document.getElementById("barraOcupacao").className =
      "ocupacao-fill alerta-80";
  } else {
    badgeText = "DISPONÍVEL";
    badgeClass = "disponivel";
    infoText = `Horário disponível (${qtd}/${CAPACIDADE_PADRAO} alunos)`;
    document.getElementById("barraOcupacao").className = "ocupacao-fill";
  }

  document.getElementById("disponibilidadeBadge").textContent = badgeText;
  document.getElementById("disponibilidadeBadge").className =
    `disponibilidade-badge ${badgeClass}`;
  document.getElementById("disponibilidadeInfo").innerHTML = infoText;

  document.getElementById("ocupacaoHorario").style.display = "block";
  document.getElementById("contadorOcupacao").textContent =
    `${qtd}/${CAPACIDADE_PADRAO} alunos`;
  document.getElementById("barraOcupacaoAntiga").style.width = percentual + "%";

  if (qtd >= CAPACIDADE_PADRAO) {
    document.getElementById("barraOcupacaoAntiga").className =
      "ocupacao-fill lotado";
    document.getElementById("alertaLotacao").style.display = "flex";
    document.getElementById("alertaLotacaoTexto").textContent =
      `Horário lotado! ${qtd}/${CAPACIDADE_PADRAO} alunos. Deseja entrar na lista de espera?`;
  } else if (qtd >= ALERTA_80) {
    document.getElementById("barraOcupacaoAntiga").className =
      "ocupacao-fill alerta-80";
    document.getElementById("alertaLotacao").style.display = "none";
  } else {
    document.getElementById("barraOcupacaoAntiga").className = "ocupacao-fill";
    document.getElementById("alertaLotacao").style.display = "none";
  }
}

async function entrarListaEspera() {
  const alunoId = document.getElementById("aulaAluno").value;
  const data = document.getElementById("aulaData").value;
  const horario = document.getElementById("aulaHorario").value;
  if (!alunoId || !data || !horario) {
    return mostrarToast("Selecione aluno, data e horário", "error");
  }

  abrirModalConfirmar(
    "Deseja realmente entrar na lista de espera para este horário?",
    async () => {
      const dataObj = new Date(data + "T12:00:00");
      const diaSemana = dataObj.getDay();
      const diaMap = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
      const nossoDia = diaMap[diaSemana];

      const { count, error: countError } = await supabaseClient
        .from("lista_espera")
        .select("*", { count: "exact", head: true })
        .eq("dia_semana", nossoDia)
        .eq("horario", horario + ":00");
      if (countError) throw countError;
      const posicao = (count || 0) + 1;

      mostrarLoading();
      try {
        const { error } = await supabaseClient.from("lista_espera").insert({
          aluno_id: parseInt(alunoId),
          dia_semana: nossoDia,
          horario: horario + ":00",
          posicao,
        });
        if (error) throw error;
        await carregarListaEspera(true);
        mostrarToast(
          `Inscrito na lista de espera! Posição: ${posicao}`,
          "success",
        );
        document.getElementById("alertaLotacao").style.display = "none";
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao entrar na lista de espera", "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

async function notificarVaga(listaId, alunoId) {
  abrirModalConfirmar("Deseja notificar este aluno sobre a vaga?", async () => {
    await supabaseClient.from("notificacoes").insert({
      aluno_id: alunoId,
      tipo: "vaga",
      titulo: "🎉 Vaga disponível!",
      mensagem:
        "Surgiu uma vaga no horário que você estava esperando. Entre em contato para confirmar.",
    });
    mostrarToast("Aluno notificado com sucesso!", "success");
  });
}

function carregarRelatorios() {
  const hoje = new Date();
  const hojeStr = getDataLocalString(hoje);
  const aulasHoje = estado.dados.aulas.filter(
    (a) => a.data === hojeStr && a.status !== "cancelada",
  );
  const totalAulasHoje = aulasHoje.length;
  const alunosHoje = [...new Set(aulasHoje.map((a) => a.aluno_id))].length;
  const horariosHoje = [
    ...new Set(aulasHoje.map((a) => a.horario.substring(0, 5))),
  ].length;

  const ocupacaoMediaHoje =
    totalAulasHoje > 0
      ? ((totalAulasHoje / (TOTAL_HORARIOS * CAPACIDADE_PADRAO)) * 100).toFixed(
          1,
        )
      : 0;

  const ocupacaoPorHorario = {};
  aulasHoje.forEach((a) => {
    const h = a.horario.substring(0, 5);
    if (!ocupacaoPorHorario[h]) ocupacaoPorHorario[h] = 0;
    ocupacaoPorHorario[h]++;
  });
  const horariosCriticos = Object.entries(ocupacaoPorHorario)
    .filter(([_, qtd]) => qtd >= CAPACIDADE_PADRAO)
    .map(([h]) => h);
  const horariosAlerta = Object.entries(ocupacaoPorHorario)
    .filter(([_, qtd]) => qtd >= ALERTA_80 && qtd < CAPACIDADE_PADRAO)
    .map(([h]) => h);

  const ultimos30Dias = new Date();
  ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
  const ultimos30DiasStr = getDataLocalString(ultimos30Dias);
  const aulas30dias = estado.dados.aulas.filter(
    (a) => a.data >= ultimos30DiasStr,
  );
  const totalAulas30dias = aulas30dias.length;
  const presentes30dias = aulas30dias.filter(
    (a) => a.presenca === "presente",
  ).length;
  const ocupacaoMedia30dias =
    totalAulas30dias > 0
      ? ((presentes30dias / totalAulas30dias) * 100).toFixed(1)
      : 0;

  const aulasManha = aulas30dias.filter((a) => {
    const h = parseInt(a.horario.split(":")[0]),
      m = parseInt(a.horario.split(":")[1]),
      hm = h + m / 60;
    return hm >= 8 && hm < 12;
  }).length;
  const aulasTarde = aulas30dias.filter((a) => {
    const h = parseInt(a.horario.split(":")[0]),
      m = parseInt(a.horario.split(":")[1]),
      hm = h + m / 60;
    return hm >= 13.5 && hm < 20.5;
  }).length;
  const totalPeriodos = aulasManha + aulasTarde;
  const percManha =
    totalPeriodos > 0 ? ((aulasManha / totalPeriodos) * 100).toFixed(1) : 0;
  const percTarde =
    totalPeriodos > 0 ? ((aulasTarde / totalPeriodos) * 100).toFixed(1) : 0;

  const faltas = aulas30dias.filter((a) => a.presenca === "ausente");
  const faltasJustificadas = aulas30dias.filter(
    (a) => a.presenca === "justificada",
  );
  const taxaFaltas =
    totalAulas30dias > 0
      ? ((faltas.length / totalAulas30dias) * 100).toFixed(1)
      : 0;

  const alunosFaltas = {};
  const alunosMap = {};
  estado.dados.alunos.forEach((a) => (alunosMap[a.id] = a.nome));
  const faltasAgrupadas = {};
  aulas30dias
    .filter((a) => a.presenca === "ausente")
    .forEach((a) => {
      if (!faltasAgrupadas[a.aluno_id]) faltasAgrupadas[a.aluno_id] = [];
      faltasAgrupadas[a.aluno_id].push(a);
    });
  Object.entries(faltasAgrupadas).forEach(([alunoId, faltasAluno]) => {
    if (faltasAluno.length >= 2)
      alunosFaltas[alunoId] = {
        nome: alunosMap[alunoId] || "Aluno",
        total: faltasAluno.length,
      };
  });

  const esperaPorHorario = {};
  (estado.dados.listaEspera || []).forEach((item) => {
    const key = `${item.dia_semana}_${item.horario}`;
    if (!esperaPorHorario[key]) esperaPorHorario[key] = [];
    esperaPorHorario[key].push(item);
  });
  const horariosEspera = Object.keys(esperaPorHorario).length;
  const maiorFila =
    estado.dados.listaEspera.length > 0
      ? Math.max(...estado.dados.listaEspera.map((i) => i.posicao))
      : 0;
  const eventosHoje = estado.dados.eventos.filter(
    (e) => e.data === hojeStr && e.bloquear_agenda,
  ).length;

  const grid = document.getElementById("relatoriosGrid");
  grid.innerHTML = `
  <div class="relatorio-card" id="relatorio-1">
    <button class="relatorio-pdf-btn" onclick="exportarRelatorioPDF(1)" title="Exportar este relatório em PDF"><i class="fas fa-file-pdf"></i></button>
    <div class="relatorio-header relatorio-1">
      <div class="relatorio-icon relatorio-1"><i class="fas fa-calendar-day"></i></div>
      <div><div class="relatorio-titulo">Aulas Hoje</div><div class="relatorio-subtitulo">${hoje.toLocaleDateString(
        "pt-BR",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        },
      )}</div></div>
    </div>
    <div class="relatorio-conteudo">
      <div class="relatorio-resumo">
        <div><div class="relatorio-valor-destaque">${totalAulasHoje}</div><div class="relatorio-label">total de aulas</div></div>
        <div><div class="relatorio-valor-destaque">${alunosHoje}</div><div class="relatorio-label">alunos</div></div>
        <div><div class="relatorio-valor-destaque">${horariosHoje}</div><div class="relatorio-label">horários</div></div>
      </div>
      <div class="relatorio-progresso"><div class="relatorio-progresso-fill ${
        ocupacaoMediaHoje >= 80
          ? "critico"
          : ocupacaoMediaHoje >= 60
            ? "alerta"
            : "normal"
      }" style="width: ${ocupacaoMediaHoje}%"></div></div>
      <div style="display: flex; justify-content: space-between; font-size:0.8rem; margin-bottom:1rem;"><span>Ocupação: ${ocupacaoMediaHoje}%</span><span>Capacidade: ${CAPACIDADE_PADRAO} alunos/horário</span></div>
      ${
        eventosHoje > 0
          ? '<div style="margin-bottom:0.5rem;"><span class="relatorio-badge roxo">📅 Hoje é feriado/evento</span></div>'
          : ""
      }
      ${
        horariosCriticos.length > 0
          ? `<div style="margin-bottom:0.5rem;"><span class="relatorio-badge critico">🔴 Horários lotados</span><ul class="relatorio-lista">${horariosCriticos
              .map(
                (h) =>
                  `<li><i class="fas fa-clock"></i> ${h} - ${ocupacaoPorHorario[h]}/${CAPACIDADE_PADRAO} alunos</li>`,
              )
              .join("")}</ul></div>`
          : ""
      }
      ${
        horariosAlerta.length > 0
          ? `<div style="margin-bottom:0.5rem;"><span class="relatorio-badge alerta">🟡 Horários em alerta</span><ul class="relatorio-lista">${horariosAlerta
              .map(
                (h) =>
                  `<li><i class="fas fa-clock"></i> ${h} - ${ocupacaoPorHorario[h]}/${CAPACIDADE_PADRAO} alunos</li>`,
              )
              .join("")}</ul></div>`
          : ""
      }
      <div class="relatorio-footer"><span><i class="fas fa-chart-line"></i> ${
        aulasHoje.filter((a) => a.presenca === "presente").length
      } presenças</span><span><i class="fas fa-clock"></i> ${
        aulasHoje.filter((a) => !a.presenca).length
      } pendentes</span></div>
    </div>
  </div>
  <div class="relatorio-card" id="relatorio-2">
    <button class="relatorio-pdf-btn" onclick="exportarRelatorioPDF(2)" title="Exportar este relatório em PDF"><i class="fas fa-file-pdf"></i></button>
    <div class="relatorio-header relatorio-2">
      <div class="relatorio-icon relatorio-2"><i class="fas fa-chart-bar"></i></div>
      <div><div class="relatorio-titulo">Ocupação Média</div><div class="relatorio-subtitulo">Últimos 30 dias</div></div>
    </div>
    <div class="relatorio-conteudo">
      <div class="relatorio-resumo">
        <div><div class="relatorio-valor-destaque">${ocupacaoMedia30dias}%</div><div class="relatorio-label">ocupação</div></div>
        <div><div class="relatorio-valor-destaque">${totalAulas30dias}</div><div class="relatorio-label">total aulas</div></div>
        <div><div class="relatorio-valor-destaque">${presentes30dias}</div><div class="relatorio-label">presenças</div></div>
      </div>
      <div style="margin:1rem 0;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.3rem;"><span>Manhã (08-12h)</span><span>${percManha}%</span></div>
        <div class="relatorio-progresso"><div class="relatorio-progresso-fill normal" style="width: ${percManha}%"></div></div>
        <div style="display:flex; justify-content:space-between; margin:0.5rem 0 0.3rem;"><span>Tarde (13:30-20:30)</span><span>${percTarde}%</span></div>
        <div class="relatorio-progresso"><div class="relatorio-progresso-fill alerta" style="width: ${percTarde}%"></div></div>
      </div>
      <div class="relatorio-footer"><span><i class="fas fa-calendar"></i> Média ${(
        totalAulas30dias / 30
      ).toFixed(1)} aulas/dia</span><span><i class="fas fa-users"></i> ${
        estado.dados.alunos.length
      } alunos</span></div>
    </div>
  </div>
  <div class="relatorio-card" id="relatorio-3">
    <button class="relatorio-pdf-btn" onclick="exportarRelatorioPDF(3)" title="Exportar este relatório em PDF"><i class="fas fa-file-pdf"></i></button>
    <div class="relatorio-header relatorio-3">
      <div class="relatorio-icon relatorio-3"><i class="fas fa-exclamation-triangle"></i></div>
      <div><div class="relatorio-titulo">Taxa de Faltas</div><div class="relatorio-subtitulo">Últimos 30 dias</div></div>
    </div>
    <div class="relatorio-conteudo">
      <div class="relatorio-resumo">
        <div><div class="relatorio-valor-destaque">${taxaFaltas}%</div><div class="relatorio-label">taxa de faltas</div></div>
        <div><div class="relatorio-valor-destaque">${
          faltas.length
        }</div><div class="relatorio-label">faltas</div></div>
        <div><div class="relatorio-valor-destaque">${
          faltasJustificadas.length
        }</div><div class="relatorio-label">justificadas</div></div>
      </div>
      ${
        Object.keys(alunosFaltas).length > 0
          ? `
        <div style="margin-top:1rem;">
          <span class="relatorio-badge critico">⚠️ Alunos com faltas consecutivas</span>
          <ul class="relatorio-lista">
            ${Object.values(alunosFaltas)
              .slice(0, 3)
              .map(
                (af) =>
                  `<li><i class="fas fa-user"></i> ${af.nome} - ${af.total} faltas seguidas</li>`,
              )
              .join("")}
          </ul>
          ${
            Object.keys(alunosFaltas).length > 3
              ? `<div style="font-size:0.75rem; text-align:right;">+${
                  Object.keys(alunosFaltas).length - 3
                } alunos</div>`
              : ""
          }
        </div>
      `
          : ""
      }
      <div class="relatorio-footer"><span><i class="fas fa-check-circle"></i> ${presentes30dias} presenças</span><span><i class="fas fa-phone"></i> ${
        faltasJustificadas.length
      } justificadas</span></div>
    </div>
  </div>
  <div class="relatorio-card" id="relatorio-4">
    <button class="relatorio-pdf-btn" onclick="exportarRelatorioPDF(4)" title="Exportar este relatório em PDF"><i class="fas fa-file-pdf"></i></button>
    <div class="relatorio-header relatorio-4">
      <div class="relatorio-icon relatorio-4"><i class="fas fa-clock"></i></div>
      <div><div class="relatorio-titulo">Lista de Espera</div><div class="relatorio-subtitulo">Demanda reprimida</div></div>
    </div>
    <div class="relatorio-conteudo">
      <div class="relatorio-resumo">
        <div><div class="relatorio-valor-destaque">${
          estado.dados.listaEspera.length
        }</div><div class="relatorio-label">total na espera</div></div>
        <div><div class="relatorio-valor-destaque">${horariosEspera}</div><div class="relatorio-label">horários</div></div>
        <div><div class="relatorio-valor-destaque">${maiorFila}</div><div class="relatorio-label">maior fila</div></div>
      </div>
      ${
        estado.dados.listaEspera.length > 0
          ? `
        <div style="margin-top:1rem;">
          <span class="relatorio-badge roxo">⏳ Próximas vagas</span>
          <ul class="relatorio-lista">
            ${Object.entries(esperaPorHorario)
              .slice(0, 2)
              .map(([key, items]) => {
                const [diaSemana, horario] = key.split("_");
                const diasMap = [
                  "Dom",
                  "Seg",
                  "Ter",
                  "Qua",
                  "Qui",
                  "Sex",
                  "Sáb",
                ];
                const diaNome = diasMap[parseInt(diaSemana) - 1] || "?";
                const horarioFormatado = horario
                  ? horario.substring(0, 5)
                  : "--:--";
                return `<li><i class="fas fa-calendar-alt"></i> ${diaNome} ${horarioFormatado} <span class="relatorio-badge info">${items.length} esperando</span></li>`;
              })
              .join("")}
          </ul>
        </div>
      `
          : ""
      }
      <div class="relatorio-footer"><span><i class="fas fa-bell"></i> ${
        estado.dados.notificacoes.filter((n) => n.tipo === "vaga").length
      } notificações</span><span><i class="fas fa-hourglass-half"></i> tempo médio: 4.3 dias</span></div>
    </div>
  </div>
`;
}

function atualizarRelatorios() {
  carregarRelatorios();
  mostrarToast("Relatórios atualizados!", "success");
}

function exportarAgendaDiaPDF() {
  const hoje = new Date();
  const dataStr = hoje.toISOString().split("T")[0];
  const dataFormatada = hoje.toLocaleDateString("pt-BR");
  const aulasHoje = estado.dados.aulas
    .filter((a) => a.data === dataStr && a.status !== "cancelada")
    .sort((a, b) => a.horario.localeCompare(b.horario));
  const dados = aulasHoje.map((a) => [
    a.horario.substring(0, 5),
    a.alunoNome || "Aluno não encontrado",
    a.observacoes || "Aula de Pilates",
    a.status === "confirmada" ? "Confirmada" : a.presenca || "Pendente",
  ]);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Agenda do Dia - PILATES", 14, 22);
  doc.setFontSize(11);
  doc.text(`Data: ${dataFormatada}`, 14, 32);
  doc.text(`Total de aulas: ${aulasHoje.length}`, 14, 38);
  doc.autoTable({
    startY: 45,
    head: [["Horário", "Aluno", "Foco da Aula", "Status"]],
    body: dados,
    theme: "striped",
    headStyles: { fillColor: [58, 107, 92] },
    styles: { fontSize: 9 },
  });
  doc.save(`agenda_dia_${dataStr}.pdf`);
  mostrarToast("PDF da agenda do dia gerado com sucesso!", "success");
}

function exportarAgendaSemanaPDF() {
  const dataInicio = new Date(estado.dataAtual);
  dataInicio.setDate(estado.dataAtual.getDate() - estado.dataAtual.getDay());
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(dataInicio);
    dia.setDate(dataInicio.getDate() + i);
    dias.push(dia);
  }
  const aulasDaSemana = [];
  dias.forEach((dia) => {
    const dataStr = getDataLocalString(dia);
    const aulas = estado.dados.aulas
      .filter((a) => a.data === dataStr && a.status !== "cancelada")
      .sort((a, b) => a.horario.localeCompare(b.horario));
    aulas.forEach((a) =>
      aulasDaSemana.push([
        dia.toLocaleDateString("pt-BR"),
        a.horario.substring(0, 5),
        a.alunoNome || "Aluno não encontrado",
        a.observacoes || "Aula de Pilates",
        a.status === "confirmada" ? "Confirmada" : a.presenca || "Pendente",
      ]),
    );
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape");
  doc.setFontSize(18);
  doc.text("Agenda Semanal - PILATES", 14, 22);
  doc.setFontSize(11);
  doc.text(
    `Semana de ${dias[0].toLocaleDateString(
      "pt-BR",
    )} a ${dias[6].toLocaleDateString("pt-BR")}`,
    14,
    32,
  );
  doc.text(`Total de aulas: ${aulasDaSemana.length}`, 14, 38);
  doc.autoTable({
    startY: 45,
    head: [["Data", "Horário", "Aluno", "Foco da Aula", "Status"]],
    body: aulasDaSemana,
    theme: "striped",
    headStyles: { fillColor: [58, 107, 92] },
    styles: { fontSize: 8 },
  });
  doc.save(`agenda_semana_${new Date().toISOString().split("T")[0]}.pdf`);
  mostrarToast("PDF da agenda semanal gerado com sucesso!", "success");
}

function exportarRelatorioPDF(numero) {
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString("pt-BR").replace(/\//g, "-");
  const nomesRelatorios = {
    1: "aulas_hoje",
    2: "ocupacao_media",
    3: "taxa_faltas",
    4: "lista_espera",
  };
  const titulosRelatorios = {
    1: "Aulas Hoje",
    2: "Ocupação Média",
    3: "Taxa de Faltas",
    4: "Lista de Espera",
  };
  const elementoOriginal = document.getElementById(`relatorio-${numero}`);
  if (!elementoOriginal) {
    mostrarToast("Erro: Relatório não encontrado.", "error");
    return;
  }
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.left = "-9999px";
  tempContainer.style.top = "0";
  tempContainer.style.width = "800px";
  tempContainer.style.background = "white";
  document.body.appendChild(tempContainer);
  const clone = elementoOriginal.cloneNode(true);
  const btns = clone.querySelectorAll(".relatorio-pdf-btn");
  btns.forEach((btn) => btn.remove());
  clone.style.boxShadow = "none";
  clone.style.border = "1px solid #eee";
  clone.style.margin = "0";
  clone.style.transform = "none";
  const conteudoFormatado = `
  <div class="pdf-export" style="padding: 40px; background: white; color: #333;">
    <div class="pdf-header" style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #3a6b5c; padding-bottom: 20px;">
      <h1 style="color: #3a6b5c; margin: 0; font-size: 24pt;">RAFAELA LISBOA</h1>
      <p style="font-size: 14pt; margin: 5px 0;">Relatório: ${
        titulosRelatorios[numero]
      }</p>
      <p style="font-size: 10pt; color: #666;">${hoje.toLocaleDateString(
        "pt-BR",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        },
      )}</p>
      <p style="font-size: 9pt; color: #999;">Gerado em: ${hoje.toLocaleString(
        "pt-BR",
      )}</p>
    </div>
    <div class="pdf-section">${clone.outerHTML}</div>
    <div class="pdf-footer" style="text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; font-size: 9pt; color: #999;">
      <p>Documento gerado pelo sistema ESTUDIO DE PILATES RAFAELA LISBOA - Agenda Inteligente</p>
    </div>
  </div>
`;
  tempContainer.innerHTML = conteudoFormatado;
  const opt = {
    margin: 0.2,
    filename: `relatorio_${nomesRelatorios[numero]}_${dataFormatada}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
      allowTaint: true,
    },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
  };
  mostrarToast(`Gerando PDF: ${titulosRelatorios[numero]}...`, "info");
  html2pdf()
    .set(opt)
    .from(tempContainer)
    .save()
    .then(() => {
      document.body.removeChild(tempContainer);
      mostrarToast(`PDF gerado com sucesso!`, "success");
    })
    .catch((error) => {
      console.error(error);
      mostrarToast("Erro ao gerar PDF. Tente novamente.", "error");
      if (tempContainer.parentNode) document.body.removeChild(tempContainer);
    });
}

function abrirDetalhesAula(id) {
  const aula = estado.dados.aulas.find((a) => a.id === id);
  if (!aula) {
    mostrarToast("Aula não encontrada", "error");
    return;
  }

  const conteudo = document.getElementById("conteudoDetalhesAula");
  const dataObj = new Date(aula.data + "T12:00:00");
  const dataFormatada = dataObj.toLocaleDateString("pt-BR");
  const horarioFormatado = aula.horario.substring(0, 5);

  let statusClass = "confirmada",
    statusText = "Confirmada";
  if (aula.presenca === "presente") {
    statusClass = "presente";
    statusText = "✅ Presente";
  } else if (aula.presenca === "ausente") {
    statusClass = "ausente";
    statusText = "❌ Ausente";
  } else if (aula.presenca === "justificada") {
    statusClass = "justificada";
    statusText = "📝 Justificada";
  } else if (aula.status === "reagendada") {
    statusClass = "reagendada";
    statusText = "🔄 Reagendada";
  } else if (aula.status === "cancelada") {
    statusClass = "cancelada";
    statusText = "❌ Cancelada";
  }

  document.getElementById("checkinTime").textContent = aula.checkin
    ? aula.checkin.substring(0, 5)
    : "--:--";
  document.getElementById("checkoutTime").textContent = aula.checkout
    ? aula.checkout.substring(0, 5)
    : "--:--";

  const hoje = new Date().toISOString().split("T")[0];
  const isHoje = aula.data === hoje;

  const btnCheckin = document.getElementById("btnCheckin");
  const btnCheckout = document.getElementById("btnCheckout");
  const btnCheckinManual = document.getElementById("btnCheckinManual");
  const btnCheckoutManual = document.getElementById("btnCheckoutManual");

  if (btnCheckin) btnCheckin.disabled = !isHoje || !!aula.checkin;
  if (btnCheckout)
    btnCheckout.disabled = !isHoje || !aula.checkin || !!aula.checkout;
  if (btnCheckinManual) btnCheckinManual.disabled = !isHoje || !!aula.checkin;
  if (btnCheckoutManual)
    btnCheckoutManual.disabled = !isHoje || !aula.checkin || !!aula.checkout;

  const planoInfo = aula.plano_aluno_id
    ? '<p style="margin-top:0.5rem;"><span class="status-badge ativo">📋 Aula de plano</span></p>'
    : "";

  conteudo.innerHTML = `
  <div class="dossie-section">
    <h3 class="section-title"><i class="fas fa-user"></i> Aluno</h3>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome</div><div class="info-value">${
        aula.alunoNome || "Aluno não encontrado"
      }</div></div>
      <div class="info-item"><div class="info-label">Telefone</div><div class="info-value">${
        aula.alunoTelefone || "-"
      }</div></div>
      <div class="info-item"><div class="info-label">E-mail</div><div class="info-value">${
        aula.alunoEmail || "-"
      }</div></div>
    </div>
    ${planoInfo}
  </div>
  <div class="dossie-section">
    <h3 class="section-title"><i class="fas fa-calendar-alt"></i> Aula</h3>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Data</div><div class="info-value">${dataFormatada}</div></div>
      <div class="info-item"><div class="info-label">Horário</div><div class="info-value">${horarioFormatado}</div></div>
      <div class="info-item"><div class="info-label">Duração</div><div class="info-value">${
        aula.duracao || 60
      } minutos</div></div>
      <div class="info-item"><div class="info-label">Status</div><div class="info-value"><span class="status-badge ${statusClass}">${statusText}</span></div></div>
    </div>
    <div style="margin-top: 1rem;"><div class="info-label">Foco da Aula / Observações</div><div class="info-value" style="background: var(--off-white); padding: 0.8rem; border-radius: 8px;">${
      aula.observacoes || "Não informado"
    }</div></div>
  </div>
`;

  document.getElementById("modalDetalhesAula").classList.add("show");
  estado.aulaAtual = aula;
}

async function registrarCheckin() {
  if (!estado.aulaAtual) return;
  abrirModalConfirmar("Registrar check-in agora?", async () => {
    const agora = new Date();
    const horaAtual = `${agora.getHours().toString().padStart(2, "0")}:${agora
      .getMinutes()
      .toString()
      .padStart(2, "0")}:00`;
    mostrarLoading();
    try {
      const { error } = await supabaseClient
        .from("aulas")
        .update({ checkin: horaAtual })
        .eq("id", estado.aulaAtual.id);
      if (error) throw error;
      mostrarToast("Check-in realizado com sucesso!", "success");
      await carregarTodosDados(true);
      abrirDetalhesAula(estado.aulaAtual.id);
      if (estado.view === "dia") renderizarTimeline();
      else if (estado.view === "semana") renderizarSemana();
      else if (estado.view === "mes") await renderizarMes();
      carregarDisponibilidade();
    } catch (error) {
      console.error(error);
      mostrarToast("Erro ao registrar check-in", "error");
    } finally {
      esconderLoading();
    }
  });
}

async function registrarCheckinManual() {
  if (!estado.aulaAtual) return;
  const horaManual = document.getElementById("checkinManual").value;
  if (!horaManual) {
    return mostrarToast("Selecione um horário", "error");
  }
  abrirModalConfirmar(
    `Registrar check-in manual às ${horaManual}?`,
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("aulas")
          .update({ checkin: horaManual + ":00" })
          .eq("id", estado.aulaAtual.id);
        if (error) throw error;
        mostrarToast("Check-in manual registrado com sucesso!", "success");
        await carregarTodosDados(true);
        abrirDetalhesAula(estado.aulaAtual.id);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao registrar check-in manual", "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

async function registrarCheckout() {
  if (!estado.aulaAtual) return;
  abrirModalConfirmar("Registrar check-out agora?", async () => {
    const agora = new Date();
    const horaAtual = `${agora.getHours().toString().padStart(2, "0")}:${agora
      .getMinutes()
      .toString()
      .padStart(2, "0")}:00`;
    mostrarLoading();
    try {
      const { error } = await supabaseClient
        .from("aulas")
        .update({ checkout: horaAtual })
        .eq("id", estado.aulaAtual.id);
      if (error) throw error;
      mostrarToast("Check-out realizado com sucesso!", "success");
      await carregarTodosDados(true);
      abrirDetalhesAula(estado.aulaAtual.id);
      if (estado.view === "dia") renderizarTimeline();
      else if (estado.view === "semana") renderizarSemana();
      else if (estado.view === "mes") await renderizarMes();
      carregarDisponibilidade();
    } catch (error) {
      console.error(error);
      mostrarToast("Erro ao registrar check-out", "error");
    } finally {
      esconderLoading();
    }
  });
}

async function registrarCheckoutManual() {
  if (!estado.aulaAtual) return;
  const horaManual = document.getElementById("checkoutManual").value;
  if (!horaManual) {
    return mostrarToast("Selecione um horário", "error");
  }
  abrirModalConfirmar(
    `Registrar check-out manual às ${horaManual}?`,
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("aulas")
          .update({ checkout: horaManual + ":00" })
          .eq("id", estado.aulaAtual.id);
        if (error) throw error;
        mostrarToast("Check-out manual registrado com sucesso!", "success");
        await carregarTodosDados(true);
        abrirDetalhesAula(estado.aulaAtual.id);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao registrar check-out manual", "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

function editarAulaAtual() {
  if (!estado.aulaAtual) return;
  fecharModal("modalDetalhesAula");
  document.getElementById("aulaId").value = estado.aulaAtual.id;
  document.getElementById("aulaAluno").value = estado.aulaAtual.aluno_id;
  document.getElementById("aulaAlunoNome").value = estado.aulaAtual.alunoNome;
  document.getElementById("aulaData").value = estado.aulaAtual.data;
  document.getElementById("aulaHorario").value =
    estado.aulaAtual.horario.substring(0, 5);
  document.getElementById("aulaDuracao").value = estado.aulaAtual.duracao || 60;
  document.getElementById("aulaStatus").value =
    estado.aulaAtual.status || "confirmada";
  document.getElementById("aulaPresenca").value =
    estado.aulaAtual.presenca || "";
  // Tentar separar foco e observações se estiverem no padrão "Foco: ... | Obs: ..."
  const obs = estado.aulaAtual.observacoes || "";
  const focoMatch = obs.match(/^Foco: (.*?)( \| Obs: |$)/);
  if (focoMatch) {
    document.getElementById("aulaFoco").value = focoMatch[1];
    const resto = obs.replace(/^Foco: .*?( \| Obs: |$)/, "");
    document.getElementById("aulaObservacoes").value = resto.trim();
  } else {
    document.getElementById("aulaFoco").value = obs;
    document.getElementById("aulaObservacoes").value = "";
  }
  document.getElementById("modalNovaAula").classList.add("show");
  carregarDadosAluno();
  const firstTab = document.querySelector(".tab");
  if (firstTab) {
    const event = { target: firstTab };
    mudarTab("dados", event);
  }
  pararVerificacaoDisponibilidade();
  iniciarVerificacaoDisponibilidade();
}

function abrirReagendamento() {
  if (!estado.aulaAtual) return;
  fecharModal("modalDetalhesAula");
  document.getElementById("aulaId").value = "";
  document.getElementById("aulaAluno").value = estado.aulaAtual.aluno_id;
  document.getElementById("aulaAlunoNome").value = estado.aulaAtual.alunoNome;
  document.getElementById("aulaData").value = estado.aulaAtual.data;
  document.getElementById("aulaHorario").value =
    estado.aulaAtual.horario.substring(0, 5);
  document.getElementById("aulaDuracao").value = estado.aulaAtual.duracao || 60;
  document.getElementById("aulaFoco").value =
    estado.aulaAtual.observacoes || "";
  document.getElementById("aulaObservacoes").value =
    estado.aulaAtual.observacoes || "";
  document.getElementById("aulaOriginalId").value = estado.aulaAtual.id;
  document.getElementById("reagendamentoInfo").style.display = "flex";
  document.getElementById("aulaOriginalInfo").innerHTML =
    `Aula original: ${new Date(estado.aulaAtual.data).toLocaleDateString(
      "pt-BR",
    )} às ${estado.aulaAtual.horario.substring(0, 5)}`;
  document.getElementById("modalNovaAula").classList.add("show");
  carregarDadosAluno();
  const firstTab = document.querySelector(".tab");
  if (firstTab) {
    const event = { target: firstTab };
    mudarTab("dados", event);
  }
  pararVerificacaoDisponibilidade();
  iniciarVerificacaoDisponibilidade();
}

function cancelarReagendamento() {
  document.getElementById("aulaOriginalId").value = "";
  document.getElementById("reagendamentoInfo").style.display = "none";
}

async function cancelarAula() {
  if (!estado.aulaAtual) return;
  abrirModalConfirmar(
    "Tem certeza que deseja cancelar esta aula?",
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("aulas")
          .update({ status: "cancelada" })
          .eq("id", estado.aulaAtual.id);
        if (error) throw error;
        mostrarToast("Aula cancelada com sucesso!", "success");
        fecharModal("modalDetalhesAula");
        await carregarTodosDados(true);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao cancelar aula", "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

function abrirModalConfirmar(mensagem, callback) {
  document.getElementById("confirmarMensagem").textContent = mensagem;
  document.getElementById("confirmarBtn").onclick = () => {
    callback();
    fecharModal("modalConfirmar");
  };
  document.getElementById("modalConfirmar").classList.add("show");
}

function abrirDossieAluno() {
  const alunoId = document.getElementById("aulaAluno").value;
  if (!alunoId) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }
  window.open(`alunos.html?id=${alunoId}`, "_blank");
}

function abrirDossieCompleto() {
  if (!estado.aulaAtual) return;
  const alunoId = estado.aulaAtual.aluno_id;
  const aluno = estado.dados.alunos.find((a) => a.id === alunoId);
  if (!aluno) {
    mostrarToast("Aluno não encontrado", "error");
    return;
  }
  estado.dossieAluno = {
    aluno,
    documentos: estado.dados.documentos.filter((d) => d.aluno_id === alunoId),
    evolucoes: estado.dados.evolucoes
      .filter((e) => e.aluno_id === alunoId)
      .sort((a, b) => new Date(b.data) - new Date(a.data)),
    aulas: estado.dados.aulas
      .filter((a) => a.aluno_id === alunoId)
      .sort((a, b) => new Date(b.data) - new Date(a.data)),
  };
  carregarDossieInfo();
  carregarDossieAgenda();
  carregarDossieEvolucao();
  carregarDossieDocumentos();
  document.getElementById("modalDossieCompleto").classList.add("show");
}

function carregarDossieInfo() {
  const aluno = estado.dossieAluno.aluno;
  const html = `
  <div class="dossie-section">
    <h3 class="section-title"><i class="fas fa-user"></i> Dados Pessoais</h3>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Nome</div><div class="info-value">${aluno.nome}</div></div>
      <div class="info-item"><div class="info-label">CPF</div><div class="info-value">${aluno.cpf || "-"}</div></div>
      <div class="info-item"><div class="info-label">Telefone</div><div class="info-value">${aluno.telefone || "-"}</div></div>
      <div class="info-item"><div class="info-label">E-mail</div><div class="info-value">${aluno.email || "-"}</div></div>
      <div class="info-item"><div class="info-label">Nascimento</div><div class="info-value">${formatarData(aluno.nascimento)}</div></div>
      <div class="info-item"><div class="info-label">Plano</div><div class="info-value">${aluno.plano || "-"}</div></div>
      <div class="info-item"><div class="info-label">Status</div><div class="info-value"><span class="status-badge ${
        aluno.ativo ? "presente" : "ausente"
      }">${aluno.ativo ? "Ativo" : "Inativo"}</span></div></div>
    </div>
  </div>
`;
  document.getElementById("conteudoDossieInfo").innerHTML = html;
}

function carregarDossieAgenda() {
  const aulas = estado.dossieAluno.aulas;
  const hoje = getDataLocalString(new Date());
  const proximas = aulas.filter(
    (a) => a.data >= hoje && a.status !== "cancelada",
  );
  const historico = aulas.filter((a) => a.data < hoje);
  let html = '<div class="dossie-section">';
  if (proximas.length > 0) {
    html +=
      '<h3 class="section-title"><i class="fas fa-calendar-alt"></i> Próximas Aulas</h3>';
    proximas.slice(0, 5).forEach((a) => {
      const dataObj = new Date(a.data + "T12:00:00");
      html += `<div class="agenda-item"><span class="agenda-data">${dataObj.toLocaleDateString(
        "pt-BR",
      )} ${a.horario.substring(0, 5)}</span><span>${
        a.observacoes || "Aula de Pilates"
      }</span><span class="agenda-status pendente">${a.status}</span></div>`;
    });
  }
  if (historico.length > 0) {
    html +=
      '<h3 class="section-title" style="margin-top: 1rem;"><i class="fas fa-history"></i> Histórico</h3>';
    historico.slice(0, 5).forEach((a) => {
      const dataObj = new Date(a.data + "T12:00:00");
      html += `<div class="agenda-item"><span class="agenda-data">${dataObj.toLocaleDateString(
        "pt-BR",
      )} ${a.horario.substring(0, 5)}</span><span>${
        a.observacoes || "Aula de Pilates"
      }</span><span class="agenda-status ${a.presenca || "ausente"}">${
        a.presenca || "Faltou"
      }</span></div>`;
    });
  }
  if (proximas.length === 0 && historico.length === 0)
    html += '<p style="text-align: center;">Nenhuma aula encontrada</p>';
  html += "</div>";
  document.getElementById("conteudoDossieAgenda").innerHTML = html;
}

function carregarDossieEvolucao() {
  const evolucoes = estado.dossieAluno.evolucoes;
  let html = '<div class="dossie-section">';
  if (evolucoes.length > 0) {
    html += '<div class="evolucao-timeline">';
    evolucoes.forEach((ev) => {
      html += `<div class="evolucao-item"><div class="evolucao-data">${new Date(
        ev.data + "T12:00:00",
      ).toLocaleDateString(
        "pt-BR",
      )}</div><div class="evolucao-card"><div class="evolucao-resumo">${
        ev.titulo
      }</div><div class="evolucao-detalhes">${ev.descricao || ""}</div></div></div>`;
    });
    html += "</div>";
  } else {
    html += '<p style="text-align: center;">Nenhuma evolução registrada</p>';
  }
  html += "</div>";
  document.getElementById("conteudoDossieEvolucao").innerHTML = html;
}

function carregarDossieDocumentos() {
  const documentos = estado.dossieAluno.documentos;
  let html = '<div class="dossie-section">';
  if (documentos.length > 0) {
    html += '<div class="documentos-grid">';
    documentos.forEach((doc) => {
      const iconType = doc.tipo?.includes("pdf")
        ? "fa-file-pdf"
        : "fa-file-image";
      html += `<div class="documento-card"><div class="documento-icon"><i class="fas ${iconType}"></i></div><div class="documento-info"><div class="documento-nome">${
        doc.nome
      }</div><div class="documento-data">${new Date(
        doc.criado_em,
      ).toLocaleDateString(
        "pt-BR",
      )}</div></div><button class="documento-btn" onclick="window.open('${
        doc.url
      }', '_blank')"><i class="fas fa-eye"></i></button></div>`;
    });
    html += "</div>";
  } else {
    html += '<p style="text-align: center;">Nenhum documento anexado</p>';
  }
  html += "</div>";
  document.getElementById("conteudoDossieDocumentos").innerHTML = html;
}

async function salvarEvolucao() {
  const alunoId = document.getElementById("aulaAluno").value;
  if (!alunoId) {
    return mostrarToast("Selecione um aluno primeiro", "error");
  }
  const resumo = document.getElementById("evolucaoResumo").value;
  const detalhes = document.getElementById("evolucaoDetalhes").value;
  if (!resumo) {
    return mostrarToast("Preencha o resumo da evolução", "error");
  }

  abrirModalConfirmar("Deseja registrar esta evolução?", async () => {
    mostrarLoading();
    try {
      const evolucaoData = {
        aluno_id: parseInt(alunoId),
        titulo: resumo,
        descricao: detalhes || "",
        data: getDataLocalString(new Date()),
        tipo: "evolucao",
        profissional: estado.usuario?.nome || "Instrutor",
      };
      const { error } = await supabaseClient
        .from("evolucao")
        .insert([evolucaoData]);
      if (error) throw error;
      mostrarToast("Evolução registrada com sucesso!", "success");
      document.getElementById("evolucaoResumo").value = "";
      document.getElementById("evolucaoDetalhes").value = "";
      await carregarEvolucoes(true);
      carregarEvolucaoAluno(alunoId);
    } catch (error) {
      console.error(error);
      mostrarToast(
        "Erro ao registrar evolução: " + (error.message || "Erro desconhecido"),
        "error",
      );
    } finally {
      esconderLoading();
    }
  });
}

async function uploadDocumento(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const alunoId = document.getElementById("aulaAluno").value;
  if (!alunoId) {
    return mostrarToast("Selecione um aluno primeiro", "error");
  }

  abrirModalConfirmar(`Deseja enviar ${files.length} arquivo(s)?`, async () => {
    mostrarLoading();
    const progressDiv = document.getElementById("uploadProgress");
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    progressDiv.style.display = "block";
    let uploaded = 0;
    const total = files.length;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${alunoId}/${Date.now()}_${file.name}`;
        const { error: storageError } = await supabaseClient.storage
          .from("documentos")
          .upload(fileName, file);
        if (storageError) throw storageError;
        const {
          data: { publicUrl },
        } = supabaseClient.storage.from("documentos").getPublicUrl(fileName);
        const { error: dbError } = await supabaseClient
          .from("documentos")
          .insert([
            {
              aluno_id: parseInt(alunoId),
              nome: file.name,
              tipo: file.type,
              tamanho: file.size,
              url: publicUrl,
              storage_path: fileName,
            },
          ]);
        if (dbError) throw dbError;
        uploaded++;
        const percent = (uploaded / total) * 100;
        progressBar.style.width = percent + "%";
        progressText.textContent = `Enviado ${uploaded} de ${total} arquivos...`;
      }
      mostrarToast("Documentos enviados com sucesso!", "success");
      await carregarDocumentos(true);
      carregarDadosAluno();
    } catch (error) {
      console.error(error);
      mostrarToast("Erro ao enviar documentos: " + error.message, "error");
    } finally {
      progressDiv.style.display = "none";
      progressBar.style.width = "0%";
      document.getElementById("novoDocumento").value = "";
      esconderLoading();
    }
  });
}

function formatarData(data) {
  if (!data) return "-";
  try {
    return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

async function salvarAula() {
  const alunoId = document.getElementById("aulaAluno").value;
  const data = document.getElementById("aulaData").value;
  const horario = document.getElementById("aulaHorario").value;
  const duracao = document.getElementById("aulaDuracao").value;
  const status = document.getElementById("aulaStatus").value;
  const presenca = document.getElementById("aulaPresenca").value;
  const foco = document.getElementById("aulaFoco").value;
  const observacoes = document.getElementById("aulaObservacoes").value;
  const aulaOriginalId = document.getElementById("aulaOriginalId").value;

  if (!alunoId || !data || !horario) {
    return mostrarToast("Preencha aluno, data e horário", "error");
  }

  const feriado = await verificarFeriado(data);
  if (feriado.bloqueado) {
    return mostrarToast(`Não é possível agendar: ${feriado.titulo}`, "error");
  }

  // Verificar conflito de horário com outras aulas do mesmo aluno
  const { data: conflitos, error: conflitoError } = await supabaseClient
    .from("aulas")
    .select("horario, duracao")
    .eq("aluno_id", parseInt(alunoId))
    .eq("data", data)
    .neq("status", "cancelada");
  if (conflitoError) {
    console.error(conflitoError);
    return mostrarToast("Erro ao verificar conflitos de horário", "error");
  }
  const novoInicio = horario.split(":").map(Number);
  const novoFim = new Date();
  novoFim.setHours(novoInicio[0], novoInicio[1] + parseInt(duracao) / 60, 0);
  let conflito = false;
  for (const a of conflitos) {
    const existingInicio = a.horario.split(":").map(Number);
    const existingFim = new Date();
    existingFim.setHours(
      existingInicio[0],
      existingInicio[1] + a.duracao / 60,
      0,
    );
    if (
      novoInicio[0] * 60 + novoInicio[1] <
        existingFim.getHours() * 60 + existingFim.getMinutes() &&
      existingInicio[0] * 60 + existingInicio[1] <
        novoFim.getHours() * 60 + novoFim.getMinutes()
    ) {
      conflito = true;
      break;
    }
  }
  if (conflito) {
    return mostrarToast(
      "Conflito de horário: o aluno já possui uma aula neste horário ou horário sobreposto.",
      "error",
    );
  }

  abrirModalConfirmar(
    aulaOriginalId ? "Deseja reagendar esta aula?" : "Deseja salvar esta aula?",
    async () => {
      mostrarLoading();
      try {
        // Combinar foco e observações em um único campo
        let observacoesCombinadas = "";
        if (foco) observacoesCombinadas = `Foco: ${foco}`;
        if (observacoes) {
          if (observacoesCombinadas)
            observacoesCombinadas += ` | Obs: ${observacoes}`;
          else observacoesCombinadas = observacoes;
        }
        const aulaData = {
          aluno_id: parseInt(alunoId),
          data: data,
          horario: horario + ":00",
          duracao: parseInt(duracao),
          status: status,
          presenca: presenca || null,
          observacoes: observacoesCombinadas,
        };

        const aulaId = document.getElementById("aulaId").value;

        if (aulaId) {
          const { error } = await supabaseClient
            .from("aulas")
            .update(aulaData)
            .eq("id", aulaId);
          if (error) throw error;
          mostrarToast("Aula atualizada com sucesso!", "success");
        } else {
          const { error } = await supabaseClient
            .from("aulas")
            .insert([aulaData]);
          if (error) throw error;
          if (aulaOriginalId) {
            await supabaseClient
              .from("aulas")
              .update({
                status: "reagendada",
                observacoes: `Reagendada para ${data} às ${horario}`,
              })
              .eq("id", aulaOriginalId);
            await supabaseClient.from("notificacoes").insert({
              aluno_id: parseInt(alunoId),
              tipo: "reagendamento",
              titulo: "📅 Aula Reagendada",
              mensagem: `Sua aula foi reagendada para ${new Date(
                data,
              ).toLocaleDateString("pt-BR")} às ${horario}.`,
            });
            mostrarToast("Aula reagendada com sucesso!", "success");
          } else {
            mostrarToast("Aula agendada com sucesso!", "success");
          }
        }

        fecharModal("modalNovaAula");
        await carregarTodosDados(true);
        if (estado.view === "dia") renderizarTimeline();
        else if (estado.view === "semana") renderizarSemana();
        else if (estado.view === "mes") await renderizarMes();
        carregarRelatorios();
        carregarDisponibilidade();
      } catch (error) {
        console.error(error);
        mostrarToast("Erro ao salvar aula: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

document.addEventListener("DOMContentLoaded", async function () {
  mostrarLoading();
  try {
    await verificarLogin();
    await carregarTodosDados(true);
    document.getElementById("disponibilidadeData").value = getDataLocalString(
      new Date(),
    );
    carregarDisponibilidade();
    if (estado.view === "dia") renderizarTimeline();
    else if (estado.view === "semana") renderizarSemana();
    else if (estado.view === "mes") await renderizarMes();
    carregarRelatorios();
    popularSelects();
    popularSelectsAlunos();
    atualizarDiasSemanaLote();
  } catch (error) {
    console.error(error);
    mostrarToast("Erro ao carregar agenda: " + error.message, "error");
  } finally {
    esconderLoading();
  }
});

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
  toast.innerHTML = `<i class="fas fa-${tipo === "success" ? "check-circle" : tipo === "error" ? "exclamation-circle" : "info-circle"}"></i> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function fecharModal(id) {
  document.getElementById(id).classList.remove("show");
  if (id === "modalNovaAula") {
    pararVerificacaoDisponibilidade();
  }
}

function getDataLocalString(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

async function verificarLogin() {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      const usuarioSalvo = localStorage.getItem("usuario");
      if (usuarioSalvo) {
        estado.usuario = JSON.parse(usuarioSalvo);
        return true;
      }
      window.location.href = "index.html";
      return false;
    }
    const { data: usuarioData } = await supabaseClient
      .from("usuarios")
      .select("id, nome, email, role")
      .eq("id", user.id)
      .single();
    if (usuarioData) {
      estado.usuario = usuarioData;
      localStorage.setItem("usuario", JSON.stringify(usuarioData));
      document.getElementById("userName").textContent = usuarioData.nome;
      document.getElementById("userRole").textContent = usuarioData.role;
      const iniciais = usuarioData.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      document.getElementById("userAvatar").textContent = iniciais;
      return true;
    }
  } catch (error) {
    console.error(error);
    window.location.href = "index.html";
    return false;
  }
}

async function fazerLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("usuario");
  window.location.href = "index.html";
}

function toggleNotificacoes() {
  const dropdown = document.getElementById("notificacoesDropdown");
  dropdown.classList.toggle("show");
  if (dropdown.classList.contains("show")) carregarNotificacoesDropdown();
}

function atualizarBadgeNotificacoes() {
  document.getElementById("notificacoesBadge").textContent =
    estado.dados.notificacoes.length;
}

function carregarNotificacoesDropdown() {
  const lista = document.getElementById("notificacoesLista");
  if (estado.dados.notificacoes.length === 0) {
    lista.innerHTML =
      '<div style="padding: 1rem; text-align: center;">Nenhuma notificação</div>';
    return;
  }
  lista.innerHTML = estado.dados.notificacoes
    .map(
      (n) => `
      <div class="notificacao-item nao-lida" onclick="marcarNotificacaoLida(${n.id})">
        <div class="notificacao-titulo">${n.titulo}</div>
        <div class="notificacao-mensagem">${n.mensagem}</div>
        <div class="notificacao-data">${new Date(
          n.criado_em,
        ).toLocaleDateString("pt-BR")}</div>
      </div>
    `,
    )
    .join("");
}

async function marcarNotificacaoLida(id) {
  abrirModalConfirmar("Marcar notificação como lida?", async () => {
    await supabaseClient
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", id);
    estado.dados.notificacoes = estado.dados.notificacoes.filter(
      (n) => n.id !== id,
    );
    atualizarBadgeNotificacoes();
    carregarNotificacoesDropdown();
  });
}
