/**
 * Pilates Pro Manager - Script Principal (Versão Final Corrigida)
 */

let currentUser = null;
let currentPage = "dashboard";
let currentEditId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

const API = {
  async fetchAPI(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error("Erro na comunicação com o servidor");
    return await response.json();
  },
  login: (email, password) =>
    API.fetchAPI("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  getDashboardData: (filters = {}) =>
    API.fetchAPI(`/api/dashboard?${new URLSearchParams(filters)}`),
  getAlunos: (filters = {}) =>
    API.fetchAPI(`/api/alunos?${new URLSearchParams(filters)}`),
  getAulas: (filters = {}) =>
    API.fetchAPI(`/api/aulas?${new URLSearchParams(filters)}`),
  getMensalidades: () => API.fetchAPI("/api/mensalidades"),
  getContas: () => API.fetchAPI("/api/contas"),
  getUsuarios: () => API.fetchAPI("/api/usuarios"),
  getPlanos: () => API.fetchAPI("/api/planos"),
  save: (endpoint, data) =>
    API.fetchAPI(`/api/${endpoint}`, {
      method: data.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  delete: (endpoint, id) =>
    API.fetchAPI(`/api/${endpoint}/${id}`, { method: "DELETE" }),
};

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  initNavigation();
  initModais();
  initCalendar();
  checkLoggedInUser();
});

function checkLoggedInUser() {
  const savedUser = localStorage.getItem("pilatesProUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateUserInterface(currentUser);
    transitionToApp();
  }
}

function updateUserInterface(user) {
  document.getElementById("userAvatar").textContent = user.nome
    .substring(0, 2)
    .toUpperCase();
  document.getElementById("userName").textContent = user.nome;
  document.getElementById("userRole").textContent = user.role;
  document.getElementById("dashboardUserName").textContent =
    user.nome.split(" ")[0];
}

function transitionToApp() {
  document.getElementById("loginContainer").style.display = "none";
  document.getElementById("appContainer").style.display = "flex";
  loadPageData(currentPage);
}

function initNavigation() {
  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.addEventListener("click", function () {
      navigateTo(this.getAttribute("data-page"));
    });
  });
  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem("pilatesProUser");
    location.reload();
  });
}

function navigateTo(pageId) {
  currentPage = pageId;
  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  document
    .querySelector(`.nav-item[data-page="${pageId}"]`)
    ?.classList.add("active");
  document
    .querySelectorAll(".page-content")
    .forEach((p) => (p.style.display = "none"));
  document.getElementById(`page-${pageId}`).style.display = "block";
  loadPageData(pageId);
}

async function loadPageData(pageId) {
  updateAllBadges();
  switch (pageId) {
    case "dashboard":
      await loadDashboard();
      break;
    case "alunos":
      await loadAlunos();
      break;
    case "agenda":
      await loadAgenda();
      break;
    case "mensalidades":
      await loadMensalidades();
      break;
    case "contas":
      await loadContas();
      break;
    case "usuarios":
      await loadUsuarios();
      break;
    case "planos":
      await loadPlanos();
      break;
    case "relatorios":
      await loadRelatorios();
      break;
  }
}

async function updateAllBadges() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [alunos, mensalidades, contas, aulasHoje] = await Promise.all([
      API.getAlunos(),
      API.getMensalidades(),
      API.getContas(),
      API.getAulas({ data: today }),
    ]);

    // Alunos: Total de alunos ativos
    document.getElementById("alunosBadge").textContent = alunos.filter(
      (a) => a.status === "ativo",
    ).length;

    // Agenda: Aulas do dia atual
    document.getElementById("agendaBadge").textContent = aulasHoje.length;

    // Mensalidades: Apenas as atrasadas
    document.getElementById("mensalidadesBadge").textContent =
      mensalidades.filter((m) => m.status === "Atrasado").length;

    // Contas: Apenas as atrasadas
    document.getElementById("contasBadge").textContent = contas.filter(
      (c) => c.status === "Atrasado",
    ).length;
  } catch (e) {
    console.error(e);
  }
}

// --- Dashboard ---
async function loadDashboard() {
  const periodo =
    document.getElementById("filterProximasAulas")?.value || "hoje";
  const data = await API.getDashboardData({ periodo });

  document.getElementById("totalAlunosCard").textContent = data.totalAlunos;
  document.getElementById("aulasHojeCard").textContent = data.aulasHoje;
  document.getElementById("faturamentoMesCard").textContent =
    `R$ ${data.faturamento.toLocaleString("pt-BR")}`;
  document.getElementById("pendenciasCard").textContent = data.pendencias;
  renderProximasAulas(data.proximasAulas);

  // Adicionar listener para o filtro se ainda não existir
  const filterSelect = document.getElementById("filterProximasAulas");
  if (filterSelect && !filterSelect.dataset.listenerAdded) {
    filterSelect.addEventListener("change", () => loadDashboard());
    filterSelect.dataset.listenerAdded = "true";
  }
}

function renderProximasAulas(aulas) {
  const tbody = document.querySelector("#proximasAulasTable tbody");
  tbody.innerHTML = aulas
    .map(
      (a) =>
        `<tr><td>${formatDateTime(a.horario)}</td><td>${a.alunoNome}</td><td>${
          a.instrutor
        }</td><td>${
          a.sala
        }</td><td><span class="status-badge status-${a.status.toLowerCase()}">${
          a.status
        }</span></td></tr>`,
    )
    .join("");
}

// --- Alunos ---
async function loadAlunos() {
  const alunos = await API.getAlunos();
  const tbody = document.querySelector("#alunosTable tbody");
  tbody.innerHTML = alunos
    .map(
      (a) =>
        `<tr><td>${a.nome}</td><td>${a.cpf}</td><td>${
          a.plano
        }</td><td>${formatDate(
          a.dataInicio,
        )}</td><td><span class="status-badge status-${a.status}">${
          a.status
        }</span></td><td><button class="action-btn edit" onclick="editAluno(${
          a.id
        })"><i class="fas fa-edit"></i></button></td></tr>`,
    )
    .join("");
}

window.editAluno = async (id) => {
  const alunos = await API.getAlunos();
  const a = alunos.find((x) => x.id === id);
  if (a) {
    document.getElementById("alunoId").value = a.id;
    document.getElementById("alunoNome").value = a.nome;
    document.getElementById("alunoCpf").value = a.cpf;
    document.getElementById("alunoEmail").value = a.email;
    document.getElementById("alunoPlano").value = a.plano;
    document.getElementById("alunoStatus").value = a.status;
    document.getElementById("alunoModalTitle").textContent = "Editar Aluno";
    openModal("alunoModal");
  }
};

// --- Agenda ---
async function loadAgenda() {
  updateCalendar();
  loadAulasDia();
}

async function loadAulasDia() {
  const date =
    document.getElementById("filterAulasDia").value ||
    new Date().toISOString().split("T")[0];
  const aulas = await API.getAulas({ data: date });

  // Ordenar por horário (garantindo que a comparação funcione com strings de data/hora)
  aulas.sort((a, b) => {
    const timeA = a.horario.includes("T")
      ? a.horario
      : a.horario.replace(" ", "T");
    const timeB = b.horario.includes("T")
      ? b.horario
      : b.horario.replace(" ", "T");
    return new Date(timeA) - new Date(timeB);
  });

  const tbody = document.querySelector("#aulasDiaTable tbody");
  tbody.innerHTML = aulas
    .map(
      (a) =>
        `<tr><td>${formatTime(a.horario)}</td><td>${a.alunoNome}</td><td>${
          a.instrutor
        }</td><td>${a.sala}</td><td>${
          a.duracao
        }</td><td><span class="status-badge status-${a.status.toLowerCase()}">${
          a.status
        }</span></td><td><button class="action-btn edit" onclick="editAula(${
          a.id
        })"><i class="fas fa-edit"></i></button></td></tr>`,
    )
    .join("");
}

window.editAula = async (id) => {
  const aulas = await API.getAulas();
  const a = aulas.find((x) => x.id == id);
  if (a) {
    openModal("aulaModal");
    await loadAlunosSelect("aulaAluno");
    document.getElementById("aulaId").value = a.id;
    document.getElementById("aulaAluno").value = a.alunoId;
    document.getElementById("aulaHorario").value = a.horario.replace(" ", "T");
    document.getElementById("aulaInstrutor").value = a.instrutor;
    document.getElementById("aulaObservacoes").value = a.observacoes || "";
    document.getElementById("aulaModalTitle").textContent = "Editar Aula";
  }
};

// --- Financeiro ---
async function loadMensalidades() {
  const dados = await API.getMensalidades();
  const tbody = document.querySelector("#mensalidadesTable tbody");
  tbody.innerHTML = dados
    .map(
      (m) =>
        `<tr><td>${m.alunoNome}</td><td>R$ ${m.valor.toFixed(
          2,
        )}</td><td>${formatDate(m.vencimento)}</td><td>${
          m.dataPagamento ? formatDate(m.dataPagamento) : "-"
        }</td><td>${
          m.formaPagamento || "-"
        }</td><td><span class="status-badge status-${m.status.toLowerCase()}">${
          m.status
        }</span></td><td><button class="action-btn edit" onclick="editMensalidade(${
          m.id
        })"><i class="fas fa-edit"></i></button></td></tr>`,
    )
    .join("");
}

window.editMensalidade = async (id) => {
  const dados = await API.getMensalidades();
  const m = dados.find((x) => x.id == id);
  if (m) {
    // Primeiro abrimos o modal, que já chama o loadAlunosSelect internamente
    openModal("mensalidadeModal");

    // Aguardamos o preenchimento do select (que é assíncrono no openModal)
    await loadAlunosSelect("mensalidadeAluno");

    document.getElementById("mensalidadeId").value = m.id;
    document.getElementById("mensalidadeAluno").value = m.alunoId;
    document.getElementById("mensalidadeValor").value = m.valor;
    document.getElementById("mensalidadeData").value = m.dataPagamento || "";
    document.getElementById("mensalidadeForma").value =
      m.formaPagamento || "Pix";
    document.getElementById("mensalidadeModalTitle").textContent =
      "Editar Pagamento";
  }
};

async function loadContas() {
  const dados = await API.getContas();
  const tbody = document.querySelector("#contasTable tbody");
  tbody.innerHTML = dados
    .map(
      (c) =>
        `<tr><td>${c.descricao}</td><td>${c.categoria}</td><td>${formatDate(
          c.vencimento,
        )}</td><td>R$ ${c.valor.toFixed(2)}</td><td>${
          c.tipo
        }</td><td><span class="status-badge status-${c.status.toLowerCase()}">${
          c.status
        }</span></td><td><button class="action-btn edit" onclick="editConta(${
          c.id
        })"><i class="fas fa-edit"></i></button></td></tr>`,
    )
    .join("");
}

window.editConta = async (id) => {
  const dados = await API.getContas();
  const c = dados.find((x) => x.id === id);
  if (c) {
    document.getElementById("contaId").value = c.id;
    document.getElementById("contaDescricao").value = c.descricao;
    document.getElementById("contaValor").value = c.valor;
    document.getElementById("contaVencimento").value = c.vencimento;
    document.getElementById("contaStatus").value = c.status;
    document.getElementById("contaModalTitle").textContent = "Editar Conta";
    openModal("contaModal");
  }
};

// --- Relatórios ---
async function loadRelatorios() {
  const data = await API.getDashboardData();
  const ctxFin = document.getElementById("financeiroChart").getContext("2d");
  new Chart(ctxFin, {
    type: "line",
    data: {
      labels: [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ],
      datasets: [
        {
          label: "Receita",
          data: [
            4000, 4500, 5000, 4800, 6000, 7500, 8000, 8500, 9000, 9500, 10000,
            12000,
          ],
          borderColor: "#1abc9c",
        },
      ],
    },
  });
}

// --- Usuários ---
async function loadUsuarios() {
  const dados = await API.getUsuarios();
  const tbody = document.querySelector("#usuariosTable tbody");
  tbody.innerHTML = dados
    .map(
      (u) =>
        `<tr><td>${u.nome}</td><td>${u.email}</td><td>${u.role}</td><td>${
          u.ultimoAcesso || "-"
        }</td><td><span class="status-badge status-${u.status}">${
          u.status
        }</span></td><td><button class="action-btn edit" onclick="editUsuario(${
          u.id
        })"><i class="fas fa-edit"></i></button></td></tr>`,
    )
    .join("");
}

window.editUsuario = async (id) => {
  const dados = await API.getUsuarios();
  const u = dados.find((x) => x.id === id);
  if (u) {
    document.getElementById("usuarioId").value = u.id;
    document.getElementById("usuarioNome").value = u.nome;
    document.getElementById("usuarioEmail").value = u.email;
    document.getElementById("usuarioRole").value = u.role;
    document.getElementById("usuarioModalTitle").textContent = "Editar Usuário";
    openModal("usuarioModal");
  }
};

// --- Planos ---
async function loadPlanos() {
  const dados = await API.getPlanos();
  const grid = document.getElementById("planosGrid");
  grid.innerHTML = dados
    .map(
      (p) =>
        `<div class="dashboard-card"><h3>${
          p.nome
        }</h3><p>R$ ${p.valorMensal.toFixed(
          2,
        )}</p><button class="btn btn-secondary" onclick="editPlano(${
          p.id
        })">Editar</button></div>`,
    )
    .join("");
}

window.editPlano = async (id) => {
  const dados = await API.getPlanos();
  const p = dados.find((x) => x.id === id);
  if (p) {
    document.getElementById("planoId").value = p.id;
    document.getElementById("planoNome").value = p.nome;
    document.getElementById("planoValor").value = p.valorMensal;
    document.getElementById("planoModalTitle").textContent = "Editar Plano";
    openModal("planoModal");
  }
};

// --- Utilitários ---
async function loadAlunosSelect(selectId) {
  const alunos = await API.getAlunos();
  const select = document.getElementById(selectId);
  select.innerHTML =
    '<option value="">Selecione um aluno</option>' +
    alunos.map((a) => `<option value="${a.id}">${a.nome}</option>`).join("");
}

function openModal(id) {
  document.getElementById(id).style.display = "flex";
  // Limpar campos se for um novo registro (sem ID)
  if (
    id === "mensalidadeModal" &&
    !document.getElementById("mensalidadeId").value
  ) {
    document.getElementById("mensalidadeForm").reset();
    document.getElementById("mensalidadeId").value = "";
    document.getElementById("mensalidadeModalTitle").textContent =
      "Registrar Pagamento";
    loadAlunosSelect("mensalidadeAluno");
  }
  if (id === "aulaModal" && !document.getElementById("aulaId").value) {
    document.getElementById("aulaForm").reset();
    document.getElementById("aulaId").value = "";
    document.getElementById("aulaModalTitle").textContent = "Agendar Aula";
    loadAlunosSelect("aulaAluno");
  }
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
  document.querySelector(`#${id} form`)?.reset();
  const title = document.getElementById(`${id}Title`);
  if (title) title.textContent = title.textContent.replace("Editar", "Novo");
}

function formatDateTime(dt) {
  return new Date(dt).toLocaleString("pt-BR");
}
function formatDate(d) {
  return new Date(d).toLocaleDateString("pt-BR");
}
function formatTime(dt) {
  return new Date(dt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function initLogin() {
  document
    .getElementById("loginForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const user = await API.login(
          document.getElementById("email").value,
          document.getElementById("password").value,
        );
        localStorage.setItem("pilatesProUser", JSON.stringify(user));
        currentUser = user;
        updateUserInterface(user);
        transitionToApp();
      } catch (e) {
        alert("Login inválido");
      }
    });
}

function initModais() {
  window.onclick = (e) => {
    if (e.target.classList.contains("modal")) e.target.style.display = "none";
  };
  document
    .getElementById("saveAlunoBtn")
    ?.addEventListener("click", async () => {
      const data = {
        id: document.getElementById("alunoId").value,
        nome: document.getElementById("alunoNome").value,
        cpf: document.getElementById("alunoCpf").value,
        email: document.getElementById("alunoEmail").value,
        plano: document.getElementById("alunoPlano").value,
        status: document.getElementById("alunoStatus").value,
      };
      await API.save("alunos", data);
      closeModal("alunoModal");
      loadAlunos();
    });
  document
    .getElementById("saveAulaBtn")
    ?.addEventListener("click", async () => {
      const data = {
        id: document.getElementById("aulaId").value,
        alunoId: document.getElementById("aulaAluno").value,
        horario: document.getElementById("aulaHorario").value,
        instrutor: document.getElementById("aulaInstrutor").value,
        observacoes: document.getElementById("aulaObservacoes").value,
      };
      await API.save("aulas", data);
      closeModal("aulaModal");
      loadPageData(currentPage);
    });
  document
    .getElementById("saveMensalidadeBtn")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("mensalidadeId").value;
      let status = "Pago";

      if (id) {
        const dados = await API.getMensalidades();
        const m = dados.find((x) => x.id == id);
        if (m) status = m.status;
      }

      const data = {
        id: id,
        alunoId: document.getElementById("mensalidadeAluno").value,
        valor: document.getElementById("mensalidadeValor").value,
        dataPagamento: document.getElementById("mensalidadeData").value,
        formaPagamento: document.getElementById("mensalidadeForma").value,
        status: status,
      };
      await API.save("mensalidades", data);
      closeModal("mensalidadeModal");
      loadMensalidades();
    });
  document
    .getElementById("saveContaBtn")
    ?.addEventListener("click", async () => {
      const data = {
        id: document.getElementById("contaId").value,
        descricao: document.getElementById("contaDescricao").value,
        valor: document.getElementById("contaValor").value,
        vencimento: document.getElementById("contaVencimento").value,
        status: document.getElementById("contaStatus").value,
        tipo: "despesa",
      };
      await API.save("contas", data);
      closeModal("contaModal");
      loadContas();
    });
  document
    .getElementById("saveUsuarioBtn")
    ?.addEventListener("click", async () => {
      const data = {
        id: document.getElementById("usuarioId").value,
        nome: document.getElementById("usuarioNome").value,
        email: document.getElementById("usuarioEmail").value,
        senha: document.getElementById("usuarioSenha").value,
        role: document.getElementById("usuarioRole").value,
        status: "ativo",
      };
      await API.save("usuarios", data);
      closeModal("usuarioModal");
      loadUsuarios();
    });
  document
    .getElementById("savePlanoBtn")
    ?.addEventListener("click", async () => {
      const data = {
        id: document.getElementById("planoId").value,
        nome: document.getElementById("planoNome").value,
        valorMensal: document.getElementById("planoValor").value,
      };
      await API.save("planos", data);
      closeModal("planoModal");
      loadPlanos();
    });
}

function initCalendar() {
  const updateCalendar = () => {
    const monthYear = document.getElementById("calendarMonthYear");
    if (!monthYear) return;

    monthYear.textContent = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(new Date(calendarYear, calendarMonth));

    const grid = document.getElementById("calendarGrid");
    if (!grid) return;

    // Limpar dias anteriores (mantendo os cabeçalhos)
    const heads = grid.querySelectorAll(".calendar-day-head");
    grid.innerHTML = "";
    heads.forEach((h) => grid.appendChild(h));

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    // Espaços vazios
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      grid.appendChild(empty);
    }

    // Dias do mês
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement("div");
      dayEl.className = "calendar-day";
      if (
        d === today.getDate() &&
        calendarMonth === today.getMonth() &&
        calendarYear === today.getFullYear()
      ) {
        dayEl.classList.add("today");
      }
      dayEl.textContent = d;
      dayEl.onclick = () => {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(
          2,
          "0",
        )}-${String(d).padStart(2, "0")}`;
        document.getElementById("filterAulasDia").value = dateStr;
        loadAulasDia();
      };
      grid.appendChild(dayEl);
    }
  };

  document.getElementById("prevMonth")?.addEventListener("click", () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    updateCalendar();
  });

  document.getElementById("nextMonth")?.addEventListener("click", () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    updateCalendar();
  });

  document.getElementById("todayBtn")?.addEventListener("click", () => {
    const now = new Date();
    calendarMonth = now.getMonth();
    calendarYear = now.getFullYear();
    updateCalendar();
  });

  window.updateCalendar = updateCalendar;
}
