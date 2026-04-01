const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const estado = {
  usuario: null,
  dados: {
    alunos: [],
    mensalidades: [],
    parcelas: [],
    planos: [],
  },
  filtros: {
    busca: "",
    status: "",
    vencimento: "",
  },
  ordenacao: {
    coluna: null,
    direcao: "asc",
  },
  expandedRows: {},
  importacao: {
    dados: null,
    mapeamento: null,
  },
};

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

function adicionarMeses(dataStr, n, diaFixo = null) {
  const d = new Date(dataStr + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  if (diaFixo) {
    let ano = d.getFullYear();
    let mes = d.getMonth();
    let ultimoDia = new Date(ano, mes + 1, 0).getDate();
    let dia = Math.min(diaFixo, ultimoDia);
    d.setDate(dia);
  }
  return d.toISOString().split("T")[0];
}

function fecharModal(id) {
  document.getElementById(id).classList.remove("show");
}

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

/**
 * Atualiza no banco o status das parcelas que estão vencidas e não pagas.
 * Retorna a lista de IDs que foram alterados.
 */
async function atualizarStatusParcelasAtrasadas() {
  const hojeStr = hoje();
  const parcelasParaAtualizar = estado.dados.parcelas.filter(
    (p) =>
      p.status !== "pago" && p.status !== "cancelada" && p.vencimento < hojeStr,
  );

  if (parcelasParaAtualizar.length === 0) return [];

  const ids = parcelasParaAtualizar.map((p) => p.id);
  const { error } = await supabaseClient
    .from("parcelas")
    .update({ status: "atrasado" })
    .in("id", ids);

  if (error) {
    console.error("Erro ao atualizar parcelas atrasadas:", error);
    mostrarToast("Erro ao atualizar status de atraso", "error");
    return [];
  }

  parcelasParaAtualizar.forEach((p) => (p.status = "atrasado"));
  return ids;
}

async function carregarDados() {
  try {
    const [alunos, mensalidades, parcelas, planos] = await Promise.all([
      supabaseClient.from("alunos").select("*").order("nome"),
      supabaseClient.from("mensalidades").select("*"),
      supabaseClient.from("parcelas").select("*"),
      supabaseClient.from("planos").select("*").eq("ativo", true).order("nome"),
    ]);

    if (alunos.error) throw alunos.error;
    if (mensalidades.error) throw mensalidades.error;
    if (parcelas.error) throw parcelas.error;
    if (planos.error) throw planos.error;

    estado.dados.alunos = alunos.data || [];
    estado.dados.mensalidades = mensalidades.data || [];
    estado.dados.parcelas = parcelas.data || [];
    estado.dados.planos = planos.data || [];

    await atualizarStatusParcelasAtrasadas();

    document.getElementById("totalMensalidades").textContent =
      `${estado.dados.mensalidades.length} mensalidades cadastradas`;

    popularSelectPlanos();
    atualizarDashboard();
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  }
}

function popularSelectPlanos() {
  const selectPlano = document.getElementById("mensalidadePlano");
  if (!selectPlano) return;
  selectPlano.innerHTML = '<option value="">Selecione um plano</option>';
  estado.dados.planos.forEach((plano) => {
    const option = document.createElement("option");
    option.value = plano.id;
    option.textContent = `${plano.nome} - ${fmtValor(plano.valor)}/mês`;
    option.dataset.valorMensal = plano.valor;
    option.dataset.nome = plano.nome;
    selectPlano.appendChild(option);
  });
}

function calcularResumo() {
  // Filtrar mensalidades ativas (não canceladas e com parcelas não pagas)
  const mensalidadesAtivas = estado.dados.mensalidades.filter((m) => {
    if (m.status === "cancelada") return false;
    const parcelas = estado.dados.parcelas.filter(
      (p) => p.mensalidade_id === m.id,
    );
    return parcelas.some((p) => p.status !== "pago");
  }).length;

  const valorAReceber = estado.dados.parcelas
    .filter((p) => p.status !== "pago" && p.status !== "cancelada")
    .reduce((acc, p) => acc + (p.valor || 0), 0);

  const parcelasAtrasadas = estado.dados.parcelas.filter(
    (p) => p.status === "atrasado",
  ).length;

  const parcelasEmAberto = estado.dados.parcelas.filter(
    (p) => p.status !== "pago" && p.status !== "cancelada",
  ).length;
  const inadimplencia =
    parcelasEmAberto > 0 ? (parcelasAtrasadas / parcelasEmAberto) * 100 : 0;

  let mrr = 0;
  estado.dados.mensalidades.forEach((m) => {
    if (m.status === "cancelada") return;
    const parcelas = estado.dados.parcelas.filter(
      (p) => p.mensalidade_id === m.id,
    );
    if (parcelas.some((p) => p.status !== "pago")) {
      const valorMensal = m.valor_total / m.numero_parcelas;
      mrr += valorMensal;
    }
  });

  const devedores = {};
  estado.dados.parcelas
    .filter((p) => p.status === "atrasado")
    .forEach((p) => {
      const mensalidade = estado.dados.mensalidades.find(
        (m) => m.id === p.mensalidade_id,
      );
      if (mensalidade && mensalidade.status !== "cancelada") {
        const aluno = estado.dados.alunos.find(
          (a) => a.id === mensalidade.aluno_id,
        );
        if (aluno) {
          devedores[aluno.id] = devedores[aluno.id] || {
            nome: aluno.nome,
            total: 0,
          };
          devedores[aluno.id].total += p.valor || 0;
        }
      }
    });
  const topDevedores = Object.values(devedores)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    mensalidadesAtivas,
    valorAReceber,
    parcelasAtrasadas,
    inadimplencia,
    mrr,
    topDevedores,
  };
}

function renderizarResumo() {
  const resumo = calcularResumo();
  const container = document.getElementById("resumoContainer");
  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-spinner"></i></div>
      <div class="stat-info">
        <div class="stat-value">${resumo.mensalidadesAtivas}</div>
        <div class="stat-label">Mensalidades Ativas</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon"><i class="fas fa-dollar-sign"></i></div>
      <div class="stat-info">
        <div class="stat-value">${fmtValor(resumo.valorAReceber)}</div>
        <div class="stat-label">Valor a Receber</div>
      </div>
    </div>
    <div class="stat-card ${resumo.parcelasAtrasadas > 0 ? "critico" : ""}">
      <div class="stat-icon ${resumo.parcelasAtrasadas > 0 ? "danger" : ""}"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="stat-info">
        <div class="stat-value">${resumo.parcelasAtrasadas}</div>
        <div class="stat-label">Parcelas Atrasadas</div>
      </div>
    </div>
    <div class="stat-card ${resumo.inadimplencia > 20 ? "critico" : resumo.inadimplencia > 10 ? "alerta" : ""}">
      <div class="stat-icon ${resumo.inadimplencia > 20 ? "danger" : resumo.inadimplencia > 10 ? "warning" : ""}"><i class="fas fa-percent"></i></div>
      <div class="stat-info">
        <div class="stat-value">${resumo.inadimplencia.toFixed(1)}%</div>
        <div class="stat-label">Inadimplência (geral)</div>
      </div>
    </div>
  `;

  const secContainer = document.getElementById("cardsSecundarios");
  secContainer.innerHTML = `
    <div class="compact-card">
      <div class="compact-title"><i class="fas fa-chart-line"></i> MRR</div>
      <div class="compact-row"><span class="compact-label">Receita recorrente mensal</span><span class="compact-value">${fmtValor(resumo.mrr)}</span></div>
    </div>
    <div class="compact-card">
      <div class="compact-title"><i class="fas fa-users"></i> Top devedores</div>
      ${
        resumo.topDevedores.length === 0
          ? '<p style="text-align:center;">Nenhum devedor</p>'
          : resumo.topDevedores
              .map(
                (d) => `
          <div class="compact-row">
            <span class="compact-label">${d.nome}</span>
            <span class="compact-value">${fmtValor(d.total)}</span>
          </div>
        `,
              )
              .join("")
      }
    </div>
  `;
}

function calcularStatusMensalidade(parcelas) {
  if (!parcelas || parcelas.length === 0) return "pendente";
  const pagas = parcelas.filter((p) => p.status === "pago").length;
  const atrasadas = parcelas.filter((p) => p.status === "atrasado").length;
  const canceladas = parcelas.filter((p) => p.status === "cancelada").length;
  if (pagas === parcelas.length) return "pago";
  if (atrasadas > 0) return "atrasado";
  if (pagas > 0 && pagas + canceladas === parcelas.length) return "parcial";
  if (canceladas === parcelas.length) return "cancelada";
  return "pendente";
}

function obterProximoVencimento(parcelas) {
  const hojeStr = hoje();
  const proximas = parcelas
    .filter((p) => p.status !== "pago" && p.status !== "cancelada")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return proximas.length > 0 ? proximas[0].vencimento : null;
}

function obterValorAReceber(parcelas) {
  return parcelas
    .filter((p) => p.status !== "pago" && p.status !== "cancelada")
    .reduce((acc, p) => acc + p.valor, 0);
}

function obterSaldoDevedor(parcelas) {
  return obterValorAReceber(parcelas);
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
    if (col === "aluno") {
      valA = a.alunoNome || "";
      valB = b.alunoNome || "";
    } else if (col === "plano") {
      valA = a.plano || "";
      valB = b.plano || "";
    } else if (col === "valor") {
      valA = a.valor_total || 0;
      valB = b.valor_total || 0;
    } else if (col === "proximoVenc") {
      valA = a.proximoVencimento || "9999-99-99";
      valB = b.proximoVencimento || "9999-99-99";
    } else if (col === "aReceber") {
      valA = a.valorAReceber || 0;
      valB = b.valorAReceber || 0;
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

function toggleParcelas(mensalidadeId) {
  estado.expandedRows[mensalidadeId] = !estado.expandedRows[mensalidadeId];
  renderizarTabela();
}

function calcularDiasAtraso(vencimento) {
  const hojeStr = hoje();
  const vencDate = new Date(vencimento + "T12:00:00");
  const hojeDate = new Date(hojeStr + "T12:00:00");
  if (vencDate >= hojeDate) return 0;
  const diffTime = hojeDate - vencDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function renderizarParcelasExpandidas(parcelas, mensalidadeId) {
  if (parcelas.length === 0)
    return '<div class="empty-state">Nenhuma parcela encontrada</div>';
  return `
    <table class="parcelas-subtabela">
      <thead>
        <tr>
          <th>Parcela</th>
          <th>Vencimento</th>
          <th>Dias atraso</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${parcelas
          .sort((a, b) => a.numero - b.numero)
          .map((p) => {
            const diasAtraso =
              p.status === "atrasado" ? calcularDiasAtraso(p.vencimento) : 0;
            const classeStatus = `parcela-${p.status}`;
            return `
                <tr class="${classeStatus}">
                  <td>${p.numero}</td>
                  <td>${fmtData(p.vencimento)}</td>
                  <td>${diasAtraso > 0 ? `${diasAtraso} dia(s)` : "-"}</td>
                  <td>${fmtValor(p.valor)}</td>
                  <td><span class="status-badge ${p.status}">${traduzirStatus(p.status)}</span></td>
                  <td>
                    <div class="action-buttons">
                      ${p.status !== "pago" && p.status !== "cancelada" ? `<button class="action-btn visualizar" onclick="abrirModalBaixa(${p.id}, ${p.valor})" title="Dar baixa"><i class="fas fa-check"></i></button>` : ""}
                      <button class="action-btn editar" onclick="abrirModalEditarParcela(${p.id})" title="Editar"><i class="fas fa-edit"></i></button>
                    </div>
                  </td>
                </tr>
              `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderizarTabela() {
  const tbody = document.getElementById("tabelaMensalidades");
  let listaMensalidades = estado.dados.mensalidades.map((m) => {
    const aluno = estado.dados.alunos.find((a) => a.id === m.aluno_id);
    const parcelas = estado.dados.parcelas.filter(
      (p) => p.mensalidade_id === m.id,
    );
    const status =
      m.status === "cancelada"
        ? "cancelada"
        : calcularStatusMensalidade(parcelas);
    const proximoVenc = obterProximoVencimento(parcelas);
    const valorAReceber = obterValorAReceber(parcelas);
    const saldoDevedor = obterSaldoDevedor(parcelas);
    return {
      ...m,
      alunoNome: aluno?.nome || "Aluno",
      status,
      proximoVencimento: proximoVenc,
      valorAReceber,
      saldoDevedor,
      parcelas,
    };
  });

  if (estado.filtros.busca) {
    const busca = estado.filtros.busca.toLowerCase();
    listaMensalidades = listaMensalidades.filter((m) =>
      m.alunoNome.toLowerCase().includes(busca),
    );
  }
  if (estado.filtros.status) {
    listaMensalidades = listaMensalidades.filter(
      (m) => m.status === estado.filtros.status,
    );
  }
  if (estado.filtros.vencimento) {
    const hojeStr = hoje();
    const hojeDate = new Date(hojeStr + "T12:00:00");
    const fimSemana = new Date(hojeDate);
    fimSemana.setDate(hojeDate.getDate() + 7);
    const fimMes = new Date(hojeDate.getFullYear(), hojeDate.getMonth() + 1, 0);
    const inicioProximoMes = new Date(
      hojeDate.getFullYear(),
      hojeDate.getMonth() + 1,
      1,
    );
    const fimProximoMes = new Date(
      hojeDate.getFullYear(),
      hojeDate.getMonth() + 2,
      0,
    );
    const dataLimiteVencidas30 = new Date(hojeDate);
    dataLimiteVencidas30.setDate(hojeDate.getDate() - 30);

    listaMensalidades = listaMensalidades.filter((m) => {
      if (!m.proximoVencimento) return false;
      const venc = new Date(m.proximoVencimento + "T12:00:00");
      if (estado.filtros.vencimento === "hoje")
        return venc.toDateString() === hojeDate.toDateString();
      if (estado.filtros.vencimento === "semana")
        return venc >= hojeDate && venc <= fimSemana;
      if (estado.filtros.vencimento === "mes")
        return venc >= hojeDate && venc <= fimMes;
      if (estado.filtros.vencimento === "proximo-mes")
        return venc >= inicioProximoMes && venc <= fimProximoMes;
      if (estado.filtros.vencimento === "vencidas-30") {
        return (
          venc < dataLimiteVencidas30 &&
          m.status !== "pago" &&
          m.status !== "cancelada"
        );
      }
      return true;
    });
  }

  listaMensalidades = aplicarOrdenacao(listaMensalidades);

  if (listaMensalidades.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" style="text-align:center; padding:2rem;">Nenhuma mensalidade encontrada</td></tr>';
    return;
  }

  tbody.innerHTML = listaMensalidades
    .map((m) => {
      const pagas = m.parcelas.filter((p) => p.status === "pago").length;
      const totalParcelas = m.numero_parcelas || m.parcelas.length;
      const percentual = totalParcelas > 0 ? (pagas / totalParcelas) * 100 : 0;
      const expanded = estado.expandedRows[m.id] || false;
      const temAtrasado = m.parcelas.some((p) => p.status === "atrasado");
      const linhaClasse = temAtrasado ? "linha-atrasada" : "";
      const isCancelada = m.status === "cancelada";

      return `
        <tr class="${linhaClasse}" data-mensalidade-id="${m.id}">
          <td>
            ${
              !isCancelada
                ? `<button class="expandir-btn" onclick="toggleParcelas(${m.id})" title="Ver parcelas">
              <i class="fas ${expanded ? "fa-chevron-down" : "fa-chevron-right"}"></i>
            </button>`
                : ""
            }
          </td>
          <td><strong>${m.alunoNome}</strong></td>
          <td>${m.plano}</td>
          <td>${fmtValor(m.valor_total)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span>${pagas}/${totalParcelas}</span>
              <div class="progress-bar" style="width:60px;"><div class="progress-fill" style="width:${percentual}%;"></div></div>
            </div>
          </td>
          <td>${m.proximoVencimento ? fmtData(m.proximoVencimento) : "-"}</td>
          <td>${fmtValor(m.valorAReceber)}</td>
          <td class="saldo-devedor">${fmtValor(m.saldoDevedor)}</td>
          <td><span class="status-badge ${m.status}">${traduzirStatus(m.status)}</span></td>
          <td>
            <div class="action-buttons">
              <button class="action-btn visualizar" onclick="verDetalhesMensalidade(${m.id})" data-tooltip="Ver detalhes">
                <i class="fas fa-eye"></i>
              </button>
              ${
                !isCancelada && !m.parcelas.some((p) => p.status === "pago")
                  ? `
                <button class="action-btn editar" onclick="editarMensalidade(${m.id})" data-tooltip="Editar">
                  <i class="fas fa-edit"></i>
                </button>
              `
                  : ""
              }
              ${
                !isCancelada
                  ? `
                <button class="action-btn excluir" onclick="confirmarExclusaoMensalidade(${m.id})" data-tooltip="Excluir">
                  <i class="fas fa-trash"></i>
                </button>
                <button class="action-btn cancelar" onclick="abrirModalCancelamento(${m.id})" data-tooltip="Cancelar">
                  <i class="fas fa-ban"></i>
                </button>
                <button class="action-btn renovar" onclick="renovarMensalidade(${m.id})" data-tooltip="Renovar plano">
                  <i class="fas fa-sync-alt"></i>
                </button>
              `
                  : ""
              }
            </div>
          </td>
        </tr>
        ${
          expanded && !isCancelada
            ? `
          <tr class="parcelas-expandidas">
            <td colspan="10">
              ${renderizarParcelasExpandidas(m.parcelas, m.id)}
            </td>
          </tr>
        `
            : ""
        }
      `;
    })
    .join("");
}

function traduzirStatus(status) {
  const map = {
    pago: "Pago",
    pendente: "Pendente",
    atrasado: "Atrasado",
    parcial: "Parcial",
    cancelada: "Cancelada",
  };
  return map[status] || status;
}

function filtrarMensalidades() {
  estado.filtros.busca = document.getElementById("searchInput")?.value || "";
  estado.filtros.status = document.getElementById("statusFilter")?.value || "";
  estado.filtros.vencimento =
    document.getElementById("vencimentoFilter")?.value || "";
  renderizarTabela();
  renderizarResumo();
  renderizarGraficoPrevisao();
}

function buscarAluno() {
  const termo = document
    .getElementById("buscaAlunoInput")
    .value.toLowerCase()
    .trim();
  const resultsDiv = document.getElementById("alunoSearchResults");
  if (termo.length < 2) {
    resultsDiv.classList.remove("show");
    return;
  }

  const alunosFiltrados = estado.dados.alunos.filter(
    (a) =>
      a.nome.toLowerCase().includes(termo) || (a.cpf && a.cpf.includes(termo)),
  );

  if (alunosFiltrados.length === 0) {
    resultsDiv.innerHTML =
      '<div class="aluno-search-item">Nenhum aluno encontrado</div>';
    resultsDiv.classList.add("show");
    return;
  }

  resultsDiv.innerHTML = alunosFiltrados
    .map(
      (a) => `
    <div class="aluno-search-item" onclick="selecionarAluno(${a.id})">
      ${
        a.foto_url
          ? `<img src="${a.foto_url}" alt="foto" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">`
          : `<div class="avatar-placeholder" style="width:30px;height:30px;"><i class="fas fa-user"></i></div>`
      }
      <div class="info">
        <strong>${a.nome}</strong><br>
        ${a.telefone ? `📞 ${a.telefone}` : ""} ${a.email ? `✉️ ${a.email}` : ""}
      </div>
    </div>
  `,
    )
    .join("");
  resultsDiv.classList.add("show");
}

function selecionarAluno(id) {
  const aluno = estado.dados.alunos.find((a) => a.id === id);
  if (!aluno) return;
  document.getElementById("buscaAlunoInput").value = aluno.nome;
  document.getElementById("mensalidadeAlunoId").value = aluno.id;
  document.getElementById("alunoSearchResults").classList.remove("show");
  const miniaturaDiv = document.getElementById("alunoMiniatura");
  const container = document.getElementById("alunoFotoContainer");
  if (container) {
    if (aluno.foto_url) {
      container.innerHTML = `<img src="${aluno.foto_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">`;
    } else {
      container.innerHTML = `<i class="fas fa-user"></i>`;
    }
  }
  document.getElementById("alunoNomeSelecionado").textContent = aluno.nome;
  miniaturaDiv.style.display = "flex";
}

function onPlanoChange() {
  const selectPlano = document.getElementById("mensalidadePlano");
  const selectedOption = selectPlano.options[selectPlano.selectedIndex];
  if (selectedOption && selectedOption.dataset.valorMensal) {
    const valorMensal = parseFloat(selectedOption.dataset.valorMensal);
    document.getElementById("mensalidadeValorParcela").value =
      valorMensal.toFixed(2);
    document.getElementById("mensalidadeValorTotal").value = "";
    calcularValoresMensalidade();
  } else {
    document.getElementById("mensalidadeValorParcela").value = "";
    document.getElementById("mensalidadeValorTotal").value = "";
    calcularValoresMensalidade();
  }
}

function calcularValoresMensalidade() {
  const numParcelas =
    parseInt(document.getElementById("mensalidadeParcelas").value) || 1;
  const desconto =
    parseFloat(document.getElementById("mensalidadeDesconto").value) || 0;
  const primeiroVenc = document.getElementById("mensalidadeVencimento").value;

  let valorParcela = parseFloat(
    document.getElementById("mensalidadeValorParcela").value,
  );
  let valorTotal = parseFloat(
    document.getElementById("mensalidadeValorTotal").value,
  );

  if (!isNaN(valorParcela) && valorParcela > 0) {
    valorTotal = valorParcela * numParcelas;
    document.getElementById("mensalidadeValorTotal").value =
      valorTotal.toFixed(2);
  } else if (!isNaN(valorTotal) && valorTotal > 0) {
    valorParcela = valorTotal / numParcelas;
    document.getElementById("mensalidadeValorParcela").value =
      valorParcela.toFixed(2);
  } else {
    document.getElementById("totalComDesconto").textContent = fmtValor(0);
    document.getElementById("parcelaComDesconto").textContent = fmtValor(0);
    document.getElementById("descontoDetalhes").innerHTML = "";
    document.getElementById("parcelasContainer").style.display = "none";
    return;
  }

  const fatorDesconto = 1 - desconto / 100;
  const totalComDesconto = valorTotal * fatorDesconto;
  const parcelaComDesconto = totalComDesconto / numParcelas;

  document.getElementById("totalComDesconto").textContent =
    fmtValor(totalComDesconto);
  document.getElementById("parcelaComDesconto").textContent =
    fmtValor(parcelaComDesconto);

  const economia = valorTotal - totalComDesconto;
  document.getElementById("descontoDetalhes").innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-top: 0.3rem; padding: 0.3rem 0; border-top: 1px dashed var(--verde-claro);">
      <span>Valor original:</span>
      <span>${fmtValor(valorTotal)}</span>
    </div>
    <div style="display: flex; justify-content: space-between;">
      <span>Desconto (${desconto}%):</span>
      <span style="color: var(--verde-sucesso);">- ${fmtValor(economia)}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-weight: 600; margin-top: 0.3rem;">
      <span>Valor final:</span>
      <span>${fmtValor(totalComDesconto)}</span>
    </div>
  `;

  if (!primeiroVenc) {
    document.getElementById("parcelasContainer").style.display = "none";
    return;
  }

  const diaFixo = document.getElementById("diaDemaisParcelas").value;
  let dia = diaFixo ? parseInt(diaFixo) : null;
  if (!dia) {
    dia = new Date(primeiroVenc + "T12:00:00").getDate();
  }

  let html = "";
  for (let i = 0; i < numParcelas; i++) {
    const dataVenc = adicionarMeses(primeiroVenc, i, dia);
    html += `
      <div class="parcela-item">
        <div class="parcela-info">
          <div class="parcela-numero">Parcela ${i + 1}/${numParcelas}</div>
          <div class="parcela-data">Venc: ${fmtData(dataVenc)}</div>
        </div>
        <div class="parcela-valor">${fmtValor(parcelaComDesconto)}</div>
        <span class="status-badge pendente">Pendente</span>
      </div>
    `;
  }
  document.getElementById("listaParcelas").innerHTML = html;
  document.getElementById("parcelasContainer").style.display = "block";
}

function abrirModalMensalidade() {
  document.getElementById("modalMensalidadeTitle").textContent =
    "Nova Mensalidade";
  document.getElementById("formMensalidade").reset();
  document.getElementById("mensalidadeId").value = "";
  document.getElementById("mensalidadeVencimento").value = hoje();
  document.getElementById("parcelasContainer").style.display = "none";
  document.getElementById("alunoMiniatura").style.display = "none";
  document.getElementById("alunoSearchResults").classList.remove("show");
  document.getElementById("mensalidadeAlunoId").value = "";
  document.getElementById("totalComDesconto").textContent = fmtValor(0);
  document.getElementById("parcelaComDesconto").textContent = fmtValor(0);
  document.getElementById("descontoDetalhes").innerHTML = "";
  document.getElementById("mensalidadeDescontoSalvo").value = "0";
  document.getElementById("buscaAlunoInput").removeAttribute("readonly");
  popularSelectPlanos();
  document.getElementById("modalMensalidade").classList.add("show");
}

function editarMensalidade(id) {
  const mensalidade = estado.dados.mensalidades.find((m) => m.id === id);
  if (!mensalidade) return;
  const aluno = estado.dados.alunos.find((a) => a.id === mensalidade.aluno_id);
  if (!aluno) return;

  document.getElementById("modalMensalidadeTitle").textContent =
    "Editar Mensalidade";
  document.getElementById("mensalidadeId").value = mensalidade.id;
  document.getElementById("buscaAlunoInput").value = aluno.nome;
  document
    .getElementById("buscaAlunoInput")
    .setAttribute("readonly", "readonly");
  document.getElementById("mensalidadeAlunoId").value = aluno.id;
  const container = document.getElementById("alunoFotoContainer");
  if (container) {
    if (aluno.foto_url) {
      container.innerHTML = `<img src="${aluno.foto_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">`;
    } else {
      container.innerHTML = `<i class="fas fa-user"></i>`;
    }
  }
  document.getElementById("alunoNomeSelecionado").textContent = aluno.nome;
  document.getElementById("alunoMiniatura").style.display = "flex";

  popularSelectPlanos();
  const selectPlano = document.getElementById("mensalidadePlano");
  if (mensalidade.plano_id) {
    for (let i = 0; i < selectPlano.options.length; i++) {
      if (parseInt(selectPlano.options[i].value) === mensalidade.plano_id) {
        selectPlano.selectedIndex = i;
        break;
      }
    }
  } else {
    for (let i = 0; i < selectPlano.options.length; i++) {
      if (selectPlano.options[i].textContent.startsWith(mensalidade.plano)) {
        selectPlano.selectedIndex = i;
        break;
      }
    }
  }

  document.getElementById("mensalidadeParcelas").value =
    mensalidade.numero_parcelas;
  const valorParcela = mensalidade.valor_total / mensalidade.numero_parcelas;
  document.getElementById("mensalidadeValorParcela").value =
    valorParcela.toFixed(2);
  document.getElementById("mensalidadeValorTotal").value =
    mensalidade.valor_total.toFixed(2);
  const descontoSalvo = mensalidade.desconto_aplicado || 0;
  document.getElementById("mensalidadeDesconto").value = descontoSalvo;
  document.getElementById("mensalidadeDescontoSalvo").value = descontoSalvo;
  document.getElementById("mensalidadeObs").value =
    mensalidade.observacoes || "";
  const parcelas = estado.dados.parcelas.filter((p) => p.mensalidade_id === id);
  if (parcelas.length > 0) {
    const primeiroVenc = parcelas.sort((a, b) =>
      a.vencimento.localeCompare(b.vencimento),
    )[0].vencimento;
    document.getElementById("mensalidadeVencimento").value = primeiroVenc;
    const dias = [
      ...new Set(
        parcelas.map((p) => new Date(p.vencimento + "T12:00:00").getDate()),
      ),
    ];
    if (
      dias.length === 1 &&
      dias[0] !== new Date(primeiroVenc + "T12:00:00").getDate()
    ) {
      document.getElementById("diaDemaisParcelas").value = dias[0];
    } else {
      document.getElementById("diaDemaisParcelas").value = "";
    }
  } else {
    document.getElementById("mensalidadeVencimento").value = hoje();
  }
  calcularValoresMensalidade();
  document.getElementById("modalMensalidade").classList.add("show");
}

function confirmarAcao(mensagem, callback) {
  document.getElementById("confirmarMensagem").textContent = mensagem;
  document.getElementById("confirmarBotao").onclick = () => {
    callback();
    fecharModal("modalConfirmar");
  };
  document.getElementById("modalConfirmar").classList.add("show");
}

async function salvarMensalidade() {
  const id = document.getElementById("mensalidadeId").value;
  const alunoId = parseInt(document.getElementById("mensalidadeAlunoId").value);
  const selectPlano = document.getElementById("mensalidadePlano");
  const selectedOption = selectPlano.options[selectPlano.selectedIndex];
  const planoId = selectedOption ? parseInt(selectedOption.value) : null;
  const planoNome = selectedOption ? selectedOption.dataset.nome : "";
  const numParcelas = parseInt(
    document.getElementById("mensalidadeParcelas").value,
  );
  const primeiroVenc = document.getElementById("mensalidadeVencimento").value;
  const observacoes = document.getElementById("mensalidadeObs").value;
  const desconto =
    parseFloat(document.getElementById("mensalidadeDesconto").value) || 0;

  const valorParcela = parseFloat(
    document.getElementById("mensalidadeValorParcela").value,
  );

  if (!alunoId || !planoId || !numParcelas || !primeiroVenc) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }

  if (isNaN(valorParcela) || valorParcela <= 0) {
    mostrarToast("Valor da parcela inválido", "error");
    return;
  }

  const hojeStr = hoje();
  if (primeiroVenc < hojeStr) {
    const confirmado = confirm(
      "A data de primeiro vencimento é retroativa. Deseja continuar?",
    );
    if (!confirmado) return;
  }

  const valorTotal = valorParcela * numParcelas;
  const fatorDesconto = 1 - desconto / 100;
  const totalComDesconto = valorTotal * fatorDesconto;

  const mensagem = id
    ? "Deseja realmente atualizar esta mensalidade? As parcelas serão recriadas."
    : "Deseja realmente criar esta mensalidade?";

  confirmarAcao(mensagem, async () => {
    mostrarLoading();

    try {
      if (id) {
        const { error: erroMensalidade } = await supabaseClient
          .from("mensalidades")
          .update({
            plano_id: planoId,
            plano: planoNome,
            valor_total: totalComDesconto,
            numero_parcelas: numParcelas,
            observacoes,
            desconto_aplicado: desconto,
          })
          .eq("id", id);
        if (erroMensalidade) throw erroMensalidade;

        await supabaseClient.from("parcelas").delete().eq("mensalidade_id", id);

        const diaFixo = document.getElementById("diaDemaisParcelas").value;
        let dia = diaFixo ? parseInt(diaFixo) : null;
        if (!dia) dia = new Date(primeiroVenc + "T12:00:00").getDate();

        const parcelas = [];
        const valorParcelaComDesconto = totalComDesconto / numParcelas;
        for (let i = 0; i < numParcelas; i++) {
          parcelas.push({
            mensalidade_id: parseInt(id),
            numero: i + 1,
            valor: valorParcelaComDesconto,
            vencimento: adicionarMeses(primeiroVenc, i, dia),
            status: "pendente",
          });
        }
        const { error: erroParcelas } = await supabaseClient
          .from("parcelas")
          .insert(parcelas);
        if (erroParcelas) throw erroParcelas;
        mostrarToast("Mensalidade atualizada com sucesso!", "success");
      } else {
        const { data: mensalidade, error: erroMensalidade } =
          await supabaseClient
            .from("mensalidades")
            .insert([
              {
                aluno_id: alunoId,
                plano_id: planoId,
                plano: planoNome,
                valor_total: totalComDesconto,
                numero_parcelas: numParcelas,
                data_contratacao: hoje(),
                observacoes,
                desconto_aplicado: desconto,
              },
            ])
            .select();
        if (erroMensalidade) throw erroMensalidade;

        const mensalidadeId = mensalidade[0].id;
        const diaFixo = document.getElementById("diaDemaisParcelas").value;
        let dia = diaFixo ? parseInt(diaFixo) : null;
        if (!dia) dia = new Date(primeiroVenc + "T12:00:00").getDate();

        const parcelas = [];
        const valorParcelaComDesconto = totalComDesconto / numParcelas;
        for (let i = 0; i < numParcelas; i++) {
          parcelas.push({
            mensalidade_id: mensalidadeId,
            numero: i + 1,
            valor: valorParcelaComDesconto,
            vencimento: adicionarMeses(primeiroVenc, i, dia),
            status: "pendente",
          });
        }

        const { error: erroParcelas } = await supabaseClient
          .from("parcelas")
          .insert(parcelas);
        if (erroParcelas) throw erroParcelas;
        mostrarToast("Mensalidade gerada com sucesso!", "success");
      }

      fecharModal("modalMensalidade");
      await carregarDados();
      renderizarTabela();
      renderizarResumo();
      renderizarGraficoPrevisao();
      atualizarDashboard();
    } catch (error) {
      console.error("Erro ao salvar mensalidade:", error);
      mostrarToast("Erro ao salvar: " + error.message, "error");
    } finally {
      esconderLoading();
    }
  });
}

async function verDetalhesMensalidade(id) {
  const mensalidade = estado.dados.mensalidades.find((m) => m.id === id);
  if (!mensalidade) return;

  const aluno = estado.dados.alunos.find((a) => a.id === mensalidade.aluno_id);
  const parcelas = estado.dados.parcelas
    .filter((p) => p.mensalidade_id === id)
    .sort((a, b) => a.numero - b.numero);

  const todasParcelasAluno = estado.dados.parcelas.filter((p) => {
    const m = estado.dados.mensalidades.find((m) => m.id === p.mensalidade_id);
    return m && m.aluno_id === aluno?.id;
  });
  const totalPago = todasParcelasAluno
    .filter((p) => p.status === "pago")
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const totalAtrasado = todasParcelasAluno
    .filter((p) => p.status === "atrasado")
    .reduce((acc, p) => acc + (p.valor || 0), 0);
  const mensalidadesAnteriores = estado.dados.mensalidades.filter(
    (m) => m.aluno_id === aluno?.id && m.id !== id,
  ).length;

  let html = `
    <div style="margin-bottom: 1.5rem;">
      <h3 style="color: var(--verde-principal);">${aluno?.nome || "Aluno"}</h3>
      <p>Plano: ${mensalidade.plano} — Valor Total: ${fmtValor(mensalidade.valor_total)}</p>
      ${mensalidade.observacoes ? `<p style="font-size: 0.8rem; color: var(--grafite-claro);">${mensalidade.observacoes}</p>` : ""}
      ${mensalidade.status === "cancelada" ? `<p style="color: var(--vermelho-urgente);"><i class="fas fa-ban"></i> Cancelada em ${fmtData(mensalidade.cancelado_em)}</p>` : ""}
    </div>
    <div class="compact-card" style="margin-bottom:1.5rem;">
      <div class="compact-title">Histórico financeiro do aluno</div>
      <div class="compact-row"><span class="compact-label">Total pago</span><span class="compact-value">${fmtValor(totalPago)}</span></div>
      <div class="compact-row"><span class="compact-label">Total atrasado</span><span class="compact-value ${totalAtrasado > 0 ? "down" : ""}">${fmtValor(totalAtrasado)}</span></div>
      <div class="compact-row"><span class="compact-label">Mensalidades anteriores</span><span class="compact-value">${mensalidadesAnteriores}</span></div>
    </div>
    <div class="parcelas-container">
      <div class="parcelas-title">
        <i class="fas fa-list-ol"></i> Parcelas
        ${
          !mensalidade.cancelada &&
          parcelas.some((p) => p.status !== "pago" && p.status !== "cancelada")
            ? `
          <button class="btn-outline" style="margin-left:auto; padding:0.2rem 0.8rem;" onclick="abrirModalBaixaLote(${id})">
            <i class="fas fa-check-double"></i> Pagar todas pendentes
          </button>
        `
            : ""
        }
      </div>
      ${parcelas
        .map((p) => {
          const podeBaixar = p.status !== "pago" && p.status !== "cancelada";
          const diasAtraso =
            p.status === "atrasado" ? calcularDiasAtraso(p.vencimento) : 0;
          return `
            <div class="parcela-item">
              <div class="parcela-info">
                <div class="parcela-numero">Parcela ${p.numero}/${mensalidade.numero_parcelas}</div>
                <div class="parcela-data">Venc: ${fmtData(p.vencimento)}</div>
                ${diasAtraso > 0 ? `<div class="parcela-data" style="color: var(--vermelho-urgente);">Atraso: ${diasAtraso} dia(s)</div>` : ""}
                ${p.status === "pago" ? `<div class="parcela-data">Pago: ${fmtData(p.data_pagamento)} (${p.forma || "-"})</div>` : ""}
                ${p.estornado ? `<div class="parcela-data" style="color: var(--roxo-celebracao);">Estornado</div>` : ""}
              </div>
              <div style="text-align: right;">
                <div class="parcela-valor">${fmtValor(p.valor)}</div>
                <span class="status-badge ${p.status}">${traduzirStatus(p.status)}</span>
                ${podeBaixar ? `<button class="btn-primary" style="margin-top: 0.3rem; padding:0.2rem 0.8rem; font-size:0.7rem;" onclick="abrirModalBaixa(${p.id}, ${p.valor})">Dar baixa</button>` : ""}
                <button class="btn-outline" style="margin-top: 0.3rem; padding:0.2rem 0.8rem; font-size:0.7rem;" onclick="abrirModalEditarParcela(${p.id})">Editar</button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  document.getElementById("detalhesMensalidadeBody").innerHTML = html;
  document.getElementById("modalDetalhesMensalidade").classList.add("show");
}

function abrirModalBaixa(parcelaId, valorParcela) {
  document.getElementById("baixaParcelaId").value = parcelaId;
  document.getElementById("baixaData").value = hoje();
  document.getElementById("baixaValor").value = valorParcela.toFixed(2);
  document.getElementById("baixaForma").value = "PIX";
  document.getElementById("baixaObs").value = "";
  document.getElementById("modalBaixaParcela").classList.add("show");
}

async function registrarBaixa() {
  const parcelaId = parseInt(document.getElementById("baixaParcelaId").value);
  const dataPagamento = document.getElementById("baixaData").value;
  const valor = parseFloat(document.getElementById("baixaValor").value);
  const forma = document.getElementById("baixaForma").value;
  const obs = document.getElementById("baixaObs").value;

  if (!dataPagamento || !forma || isNaN(valor) || valor <= 0) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }

  const hojeStr = hoje();
  if (dataPagamento > hojeStr) {
    mostrarToast("A data de pagamento não pode ser futura", "error");
    return;
  }

  confirmarAcao("Deseja realmente registrar este pagamento?", async () => {
    mostrarLoading();

    try {
      const { error } = await supabaseClient
        .from("parcelas")
        .update({
          status: "pago",
          data_pagamento: dataPagamento,
          forma: forma,
          observacoes: obs || null,
        })
        .eq("id", parcelaId);

      if (error) throw error;

      mostrarToast("Pagamento registrado com sucesso!", "success");
      fecharModal("modalBaixaParcela");
      fecharModal("modalDetalhesMensalidade");
      await carregarDados();
      renderizarTabela();
      renderizarResumo();
      renderizarGraficoPrevisao();
      atualizarDashboard();
    } catch (error) {
      console.error("Erro ao registrar baixa:", error);
      mostrarToast("Erro: " + error.message, "error");
    } finally {
      esconderLoading();
    }
  });
}

function abrirModalBaixaLote(mensalidadeId) {
  const parcelas = estado.dados.parcelas.filter(
    (p) =>
      p.mensalidade_id === mensalidadeId &&
      p.status !== "pago" &&
      p.status !== "cancelada",
  );
  const ids = parcelas.map((p) => p.id).join(",");
  document.getElementById("loteIds").value = ids;
  document.getElementById("loteData").value = hoje();
  document.getElementById("loteForma").value = "PIX";
  document.getElementById("loteObs").value = "";
  document.getElementById("modalBaixaLote").classList.add("show");
}

async function registrarBaixaLote() {
  const idsStr = document.getElementById("loteIds").value;
  if (!idsStr) return;
  const ids = idsStr.split(",").map((id) => parseInt(id));
  const data = document.getElementById("loteData").value;
  const forma = document.getElementById("loteForma").value;
  const obs = document.getElementById("loteObs").value;

  if (!data || !forma) {
    mostrarToast("Preencha data e forma de pagamento", "error");
    return;
  }

  const hojeStr = hoje();
  if (data > hojeStr) {
    mostrarToast("A data de pagamento não pode ser futura", "error");
    return;
  }

  confirmarAcao(
    `Deseja realmente pagar ${ids.length} parcela(s)?`,
    async () => {
      mostrarLoading();

      try {
        const { error } = await supabaseClient
          .from("parcelas")
          .update({
            status: "pago",
            data_pagamento: data,
            forma: forma,
            observacoes: obs || null,
          })
          .in("id", ids);

        if (error) throw error;

        mostrarToast(`${ids.length} parcelas pagas com sucesso!`, "success");
        fecharModal("modalBaixaLote");
        fecharModal("modalDetalhesMensalidade");
        await carregarDados();
        renderizarTabela();
        renderizarResumo();
        renderizarGraficoPrevisao();
        atualizarDashboard();
      } catch (error) {
        console.error("Erro ao registrar baixa em lote:", error);
        mostrarToast("Erro: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

function abrirModalEditarParcela(parcelaId) {
  const parcela = estado.dados.parcelas.find((p) => p.id === parcelaId);
  if (!parcela) return;

  document.getElementById("editarParcelaId").value = parcela.id;
  document.getElementById("editarParcelaValor").value = parcela.valor;
  document.getElementById("editarParcelaVencimento").value = parcela.vencimento;
  document.getElementById("editarParcelaStatus").value = parcela.status;
  document.getElementById("editarParcelaObs").value = parcela.observacoes || "";
  document.getElementById("editarParcelaDataPagamento").value =
    parcela.data_pagamento || "";
  document.getElementById("editarParcelaForma").value = parcela.forma || "PIX";

  const grupoData = document.getElementById("grupoDataPagamento");
  const grupoForma = document.getElementById("grupoForma");
  if (parcela.status === "pago") {
    grupoData.style.display = "block";
    grupoForma.style.display = "block";
  } else {
    grupoData.style.display = "none";
    grupoForma.style.display = "none";
  }

  document.getElementById("modalEditarParcela").classList.add("show");
}

async function salvarEdicaoParcela() {
  const parcelaId = parseInt(document.getElementById("editarParcelaId").value);
  const valor = parseFloat(document.getElementById("editarParcelaValor").value);
  const vencimento = document.getElementById("editarParcelaVencimento").value;
  const status = document.getElementById("editarParcelaStatus").value;
  const observacoes = document.getElementById("editarParcelaObs").value;
  const dataPagamento = document.getElementById(
    "editarParcelaDataPagamento",
  ).value;
  const forma = document.getElementById("editarParcelaForma").value;

  if (isNaN(valor) || valor <= 0) {
    mostrarToast("Valor inválido", "error");
    return;
  }
  if (!vencimento) {
    mostrarToast("Data de vencimento inválida", "error");
    return;
  }

  const updateData = {
    valor: valor,
    vencimento: vencimento,
    status: status,
    observacoes: observacoes || null,
  };
  if (status === "pago") {
    if (!dataPagamento) {
      mostrarToast("Data de pagamento obrigatória para status Pago", "error");
      return;
    }
    updateData.data_pagamento = dataPagamento;
    updateData.forma = forma;
  } else {
    updateData.data_pagamento = null;
    updateData.forma = null;
  }

  confirmarAcao("Deseja realmente alterar esta parcela?", async () => {
    mostrarLoading();
    try {
      const { error } = await supabaseClient
        .from("parcelas")
        .update(updateData)
        .eq("id", parcelaId);
      if (error) throw error;
      mostrarToast("Parcela atualizada com sucesso!", "success");
      fecharModal("modalEditarParcela");
      await carregarDados();
      renderizarTabela();
      renderizarResumo();
      renderizarGraficoPrevisao();
      atualizarDashboard();
    } catch (error) {
      console.error("Erro ao editar parcela:", error);
      mostrarToast("Erro: " + error.message, "error");
    } finally {
      esconderLoading();
    }
  });
}

function renovarMensalidade(id) {
  const mensalidade = estado.dados.mensalidades.find((m) => m.id === id);
  if (!mensalidade) return;

  confirmarAcao(
    "Deseja criar uma nova mensalidade baseada neste plano? A mensalidade atual continuará ativa.",
    () => {
      abrirModalMensalidade();
      setTimeout(() => {
        document.getElementById("mensalidadeAlunoId").value =
          mensalidade.aluno_id;
        const aluno = estado.dados.alunos.find(
          (a) => a.id === mensalidade.aluno_id,
        );
        if (aluno) {
          document.getElementById("buscaAlunoInput").value = aluno.nome;
          const container = document.getElementById("alunoFotoContainer");
          if (container) {
            if (aluno.foto_url) {
              container.innerHTML = `<img src="${aluno.foto_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">`;
            } else {
              container.innerHTML = `<i class="fas fa-user"></i>`;
            }
          }
          document.getElementById("alunoNomeSelecionado").textContent =
            aluno.nome;
          document.getElementById("alunoMiniatura").style.display = "flex";
        }
        const selectPlano = document.getElementById("mensalidadePlano");
        if (mensalidade.plano_id) {
          for (let i = 0; i < selectPlano.options.length; i++) {
            if (
              parseInt(selectPlano.options[i].value) === mensalidade.plano_id
            ) {
              selectPlano.selectedIndex = i;
              break;
            }
          }
        } else {
          for (let i = 0; i < selectPlano.options.length; i++) {
            if (
              selectPlano.options[i].textContent.startsWith(mensalidade.plano)
            ) {
              selectPlano.selectedIndex = i;
              break;
            }
          }
        }
        document.getElementById("mensalidadeParcelas").value =
          mensalidade.numero_parcelas;
        const valorParcela =
          mensalidade.valor_total / mensalidade.numero_parcelas;
        document.getElementById("mensalidadeValorParcela").value =
          valorParcela.toFixed(2);
        document.getElementById("mensalidadeValorTotal").value =
          mensalidade.valor_total.toFixed(2);
        document.getElementById("mensalidadeDesconto").value = 0;
        const parcelas = estado.dados.parcelas.filter(
          (p) => p.mensalidade_id === id,
        );
        if (parcelas.length > 0) {
          const ultima = parcelas
            .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
            .pop();
          const novaData = new Date(ultima.vencimento + "T12:00:00");
          novaData.setDate(novaData.getDate() + 1);
          document.getElementById("mensalidadeVencimento").value = novaData
            .toISOString()
            .split("T")[0];
        }
        calcularValoresMensalidade();
      }, 100);
    },
  );
}

function confirmarExclusaoMensalidade(id) {
  const mensalidade = estado.dados.mensalidades.find((m) => m.id === id);
  if (!mensalidade) return;

  const parcelasPagas = estado.dados.parcelas.filter(
    (p) => p.mensalidade_id === id && p.status === "pago",
  ).length;
  if (parcelasPagas > 0) {
    mostrarToast(
      "Não é possível excluir mensalidade com parcelas pagas.",
      "error",
    );
    return;
  }

  confirmarAcao(
    "Tem certeza que deseja excluir esta mensalidade? Esta ação não poderá ser desfeita.",
    () => excluirMensalidade(id),
  );
}

async function excluirMensalidade(id) {
  mostrarLoading();

  try {
    await supabaseClient.from("parcelas").delete().eq("mensalidade_id", id);
    await supabaseClient.from("mensalidades").delete().eq("id", id);

    mostrarToast("Mensalidade excluída!", "success");
    await carregarDados();
    renderizarTabela();
    renderizarResumo();
    renderizarGraficoPrevisao();
    atualizarDashboard();
  } catch (error) {
    console.error("Erro ao excluir mensalidade:", error);
    mostrarToast("Erro ao excluir: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

function obterDadosParaExportacao() {
  const dados = [];
  const linhas = document.querySelectorAll(
    "#tabelaMensalidades tr:not(.parcelas-expandidas)",
  );
  linhas.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 0) return;
    const linha = [
      tds[1]?.innerText || "",
      tds[2]?.innerText || "",
      tds[3]?.innerText || "",
      tds[4]?.innerText?.split(" ")[0] || "",
      tds[5]?.innerText || "",
      tds[6]?.innerText || "",
      tds[7]?.innerText || "",
      tds[8]?.innerText || "",
    ];
    dados.push(linha);
  });
  return dados;
}

function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Relatório de Mensalidades", 14, 22);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  doc.text(
    `Filtros: ${estado.filtros.busca ? "Busca: " + estado.filtros.busca : ""} ${estado.filtros.status ? "Status: " + estado.filtros.status : ""} ${estado.filtros.vencimento ? "Vencimento: " + estado.filtros.vencimento : ""}`,
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
        "Aluno",
        "Plano",
        "Valor Total",
        "Parcelas",
        "Próximo Venc.",
        "Valor a Receber",
        "Saldo Devedor",
        "Status",
      ],
    ],
    body: dados,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [58, 107, 92] },
  });

  doc.save(`mensalidades_${new Date().toISOString().split("T")[0]}.pdf`);
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
    ["Relatório de Mensalidades"],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [
      `Filtros: ${estado.filtros.busca ? "Busca: " + estado.filtros.busca : ""} ${estado.filtros.status ? "Status: " + estado.filtros.status : ""} ${estado.filtros.vencimento ? "Vencimento: " + estado.filtros.vencimento : ""}`,
    ],
    [],
    [
      "Aluno",
      "Plano",
      "Valor Total",
      "Parcelas",
      "Próximo Venc.",
      "Valor a Receber",
      "Saldo Devedor",
      "Status",
    ],
    ...dados,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Mensalidades");
  XLSX.writeFile(
    wb,
    `mensalidades_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  mostrarToast("Excel gerado com sucesso!", "success");
}

function calcularPrevisaoMensal() {
  const hoje = new Date();
  const meses = [];
  const valores = [];

  for (let i = 0; i < 6; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mes = data.getMonth() + 1;
    const ano = data.getFullYear();
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    meses.push(`${mes}/${ano}`);

    const total = estado.dados.parcelas
      .filter(
        (p) =>
          p.status !== "pago" &&
          p.status !== "cancelada" &&
          p.vencimento &&
          p.vencimento.startsWith(chave),
      )
      .reduce((acc, p) => acc + (p.valor || 0), 0);
    valores.push(total);
  }
  return { meses, valores };
}

let graficoPrevisao = null;
function renderizarGraficoPrevisao() {
  const ctx = document.getElementById("graficoPrevisao")?.getContext("2d");
  if (!ctx) return;

  const { meses, valores } = calcularPrevisaoMensal();

  if (graficoPrevisao instanceof Chart) {
    graficoPrevisao.data.labels = meses;
    graficoPrevisao.data.datasets[0].data = valores;
    graficoPrevisao.update();
  } else {
    graficoPrevisao = new Chart(ctx, {
      type: "bar",
      data: {
        labels: meses,
        datasets: [
          {
            label: "Previsão de Recebimento (R$)",
            data: valores,
            backgroundColor: "rgba(58, 107, 92, 0.7)",
            borderColor: "#3A6B5C",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => fmtValor(ctx.raw) } },
        },
        scales: {
          y: { ticks: { callback: (v) => fmtValor(v) } },
        },
      },
    });
  }
}

// ===================== DASHBOARD EXECUTIVO =====================
function toggleDashboard() {
  const content = document.getElementById("dashboardContent");
  const btn = document.getElementById("toggleDashboardBtn");
  if (content.style.display === "none") {
    content.style.display = "block";
    btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  } else {
    content.style.display = "none";
    btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
  }
}

function atualizarDashboard() {
  const resumo = calcularResumo();
  const dashboardCards = document.querySelector(
    "#dashboardContent .stats-grid",
  );
  if (dashboardCards) {
    dashboardCards.innerHTML = `
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-info"><div class="stat-value">${fmtValor(resumo.mrr)}</div><div class="stat-label">MRR</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-percent"></i></div><div class="stat-info"><div class="stat-value">${resumo.inadimplencia.toFixed(1)}%</div><div class="stat-label">Inadimplência</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-dollar-sign"></i></div><div class="stat-info"><div class="stat-value">${fmtValor(resumo.valorAReceber)}</div><div class="stat-label">A Receber</div></div></div>
      <div class="stat-card"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-info"><div class="stat-value">${resumo.parcelasAtrasadas}</div><div class="stat-label">Parcelas Atrasadas</div></div></div>
    `;
  }

  const hoje = new Date();
  const meses = [];
  const realizados = [];
  const projetados = [];

  for (let i = 0; i < 6; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    meses.push(`${mes}/${ano}`);

    const realizado = estado.dados.parcelas
      .filter(
        (p) =>
          p.status === "pago" &&
          p.data_pagamento &&
          p.data_pagamento.startsWith(chave),
      )
      .reduce((acc, p) => acc + p.valor, 0);
    realizados.push(realizado);

    const projetado = estado.dados.parcelas
      .filter(
        (p) =>
          p.status !== "pago" &&
          p.status !== "cancelada" &&
          p.vencimento &&
          p.vencimento.startsWith(chave),
      )
      .reduce((acc, p) => acc + p.valor, 0);
    projetados.push(projetado);
  }

  const ctxRP = document
    .getElementById("graficoRealizadoProjetado")
    ?.getContext("2d");
  if (ctxRP) {
    if (window.graficoRealizadoProjetado instanceof Chart) {
      window.graficoRealizadoProjetado.data.labels = meses;
      window.graficoRealizadoProjetado.data.datasets[0].data = realizados;
      window.graficoRealizadoProjetado.data.datasets[1].data = projetados;
      window.graficoRealizadoProjetado.update();
    } else {
      window.graficoRealizadoProjetado = new Chart(ctxRP, {
        type: "bar",
        data: {
          labels: meses,
          datasets: [
            {
              label: "Realizado",
              data: realizados,
              backgroundColor: "#27ae60",
            },
            {
              label: "Projetado",
              data: projetados,
              backgroundColor: "#f39c12",
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  }

  const mrrMeses = [];
  const mrrValores = [];
  for (let i = -5; i <= 0; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    mrrMeses.push(`${mes}/${ano}`);
    const totalMes = estado.dados.parcelas
      .filter((p) => p.vencimento && p.vencimento.startsWith(chave))
      .reduce((acc, p) => acc + p.valor, 0);
    mrrValores.push(totalMes);
  }

  const ctxMRR = document
    .getElementById("graficoEvolucaoMRR")
    ?.getContext("2d");
  if (ctxMRR) {
    if (window.graficoEvolucaoMRR instanceof Chart) {
      window.graficoEvolucaoMRR.data.labels = mrrMeses;
      window.graficoEvolucaoMRR.data.datasets[0].data = mrrValores;
      window.graficoEvolucaoMRR.update();
    } else {
      window.graficoEvolucaoMRR = new Chart(ctxMRR, {
        type: "line",
        data: {
          labels: mrrMeses,
          datasets: [
            { label: "MRR (R$)", data: mrrValores, borderColor: "#3a6b5c" },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  }

  const planosCount = {};
  estado.dados.mensalidades.forEach((m) => {
    const plano = m.plano;
    planosCount[plano] = (planosCount[plano] || 0) + 1;
  });
  const labelsPlanos = Object.keys(planosCount);
  const dadosPlanos = Object.values(planosCount);

  const ctxPlanos = document.getElementById("graficoPlanos")?.getContext("2d");
  if (ctxPlanos) {
    if (window.graficoPlanos instanceof Chart) {
      window.graficoPlanos.data.labels = labelsPlanos;
      window.graficoPlanos.data.datasets[0].data = dadosPlanos;
      window.graficoPlanos.update();
    } else {
      window.graficoPlanos = new Chart(ctxPlanos, {
        type: "pie",
        data: {
          labels: labelsPlanos,
          datasets: [
            {
              data: dadosPlanos,
              backgroundColor: ["#3a6b5c", "#8fc1b0", "#d4ede4", "#2c2c2c"],
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  }

  const devedores = {};
  estado.dados.parcelas
    .filter((p) => p.status === "atrasado")
    .forEach((p) => {
      const mensalidade = estado.dados.mensalidades.find(
        (m) => m.id === p.mensalidade_id,
      );
      if (!mensalidade || mensalidade.status === "cancelada") return;
      const aluno = estado.dados.alunos.find(
        (a) => a.id === mensalidade.aluno_id,
      );
      if (!aluno) return;
      if (!devedores[aluno.id])
        devedores[aluno.id] = { nome: aluno.nome, total: 0 };
      devedores[aluno.id].total += p.valor;
    });
  const top5 = Object.values(devedores)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const listaDiv = document.getElementById("topDevedoresList");
  if (listaDiv) {
    listaDiv.innerHTML = top5
      .map(
        (d) =>
          `<div class="compact-row"><span class="compact-label">${d.nome}</span><span class="compact-value">${fmtValor(d.total)}</span></div>`,
      )
      .join("");
    if (top5.length === 0)
      listaDiv.innerHTML = '<p style="text-align:center;">Nenhum devedor</p>';
  }
}

// ===================== RELATÓRIO DE INADIMPLÊNCIA =====================
function abrirRelatorioInadimplencia() {
  const hoje = new Date();
  const fim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
  const inicioStr = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("iniMes").value = inicioStr;
  document.getElementById("fimMes").value = fim;
  carregarRelatorioInadimplencia();
  document.getElementById("modalRelatorioInadimplencia").classList.add("show");
}

function carregarRelatorioInadimplencia() {
  const inicio = document.getElementById("iniMes").value;
  const fim = document.getElementById("fimMes").value;
  if (!inicio || !fim) return;

  const meses = [];
  const valoresPorMes = {};
  const parcelasAtrasadas = estado.dados.parcelas.filter(
    (p) => p.status === "atrasado",
  );

  let data = new Date(inicio + "-01");
  const dataFim = new Date(fim + "-01");
  while (data <= dataFim) {
    const anoMes = data.toISOString().slice(0, 7);
    meses.push(anoMes);
    valoresPorMes[anoMes] = 0;
    data.setMonth(data.getMonth() + 1);
  }

  parcelasAtrasadas.forEach((p) => {
    const vencMes = p.vencimento.slice(0, 7);
    if (valoresPorMes[vencMes] !== undefined) {
      valoresPorMes[vencMes] += p.valor;
    }
  });

  const labels = meses.map((m) => {
    const [ano, mes] = m.split("-");
    return `${mes}/${ano}`;
  });
  const dataGrafico = meses.map((m) => valoresPorMes[m]);

  const ctx = document.getElementById("graficoInadimplencia")?.getContext("2d");
  if (ctx) {
    if (window.graficoInadimplencia instanceof Chart) {
      window.graficoInadimplencia.data.labels = labels;
      window.graficoInadimplencia.data.datasets[0].data = dataGrafico;
      window.graficoInadimplencia.update();
    } else {
      window.graficoInadimplencia = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Valor em atraso (R$)",
              data: dataGrafico,
              borderColor: "#e74c3c",
              fill: false,
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  }

  const alunosDevedores = {};
  parcelasAtrasadas.forEach((p) => {
    const mensalidade = estado.dados.mensalidades.find(
      (m) => m.id === p.mensalidade_id,
    );
    if (!mensalidade || mensalidade.status === "cancelada") return;
    const aluno = estado.dados.alunos.find(
      (a) => a.id === mensalidade.aluno_id,
    );
    if (!aluno) return;
    const vencMes = p.vencimento.slice(0, 7);
    if (valoresPorMes[vencMes] !== undefined) {
      if (!alunosDevedores[aluno.id]) {
        alunosDevedores[aluno.id] = { nome: aluno.nome, total: 0, qtd: 0 };
      }
      alunosDevedores[aluno.id].total += p.valor;
      alunosDevedores[aluno.id].qtd++;
    }
  });

  const sorted = Object.values(alunosDevedores).sort(
    (a, b) => b.total - a.total,
  );
  const tbody = document.getElementById("tabelaInadimplenciaBody");
  if (tbody) {
    tbody.innerHTML = sorted
      .map(
        (d) => `
        <tr><td>${d.nome}</td><td>${fmtValor(d.total)}</td><td>${d.qtd}</td></tr>
    `,
      )
      .join("");
    if (sorted.length === 0)
      tbody.innerHTML =
        '<tr><td colspan="3">Nenhum débito no período</td></tr>';
  }
}

function exportarRelatorioInadimplenciaPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Relatório de Inadimplência", 14, 22);
  doc.setFontSize(10);
  doc.text(
    `Período: ${document.getElementById("iniMes").value} até ${document.getElementById("fimMes").value}`,
    14,
    30,
  );
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 36);

  const dados = [];
  const linhas = document.querySelectorAll("#tabelaInadimplenciaBody tr");
  linhas.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 3) {
      dados.push([tds[0].innerText, tds[1].innerText, tds[2].innerText]);
    }
  });

  if (dados.length === 0) {
    mostrarToast("Nenhum dado para exportar", "alerta");
    return;
  }

  doc.autoTable({
    startY: 45,
    head: [["Aluno", "Total em atraso", "Qtd. parcelas"]],
    body: dados,
    theme: "striped",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [231, 76, 60] },
  });

  doc.save(`inadimplencia_${new Date().toISOString().split("T")[0]}.pdf`);
  mostrarToast("PDF gerado com sucesso!", "success");
}

function exportarRelatorioInadimplenciaExcel() {
  const dados = [];
  const linhas = document.querySelectorAll("#tabelaInadimplenciaBody tr");
  linhas.forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 3) {
      dados.push([tds[0].innerText, tds[1].innerText, tds[2].innerText]);
    }
  });

  if (dados.length === 0) {
    mostrarToast("Nenhum dado para exportar", "alerta");
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Relatório de Inadimplência"],
    [
      `Período: ${document.getElementById("iniMes").value} até ${document.getElementById("fimMes").value}`,
    ],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [],
    ["Aluno", "Total em atraso", "Qtd. parcelas"],
    ...dados,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Inadimplência");
  XLSX.writeFile(
    wb,
    `inadimplencia_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  mostrarToast("Excel gerado com sucesso!", "success");
}

// ===================== IMPORTAÇÃO XLS/CSV =====================
let dadosImportados = null;

function abrirModalImportacao() {
  document.getElementById("arquivoImportacao").value = "";
  document.getElementById("previewImportacaoContainer").style.display = "none";
  document.getElementById("btnConfirmarImportacao").disabled = true;
  dadosImportados = null;
  estado.importacao.dados = null;
  estado.importacao.mapeamento = null;
  document.getElementById("modalImportacao").classList.add("show");
}

function processarArquivoImportacao(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      defval: "",
    });
    if (jsonData.length < 2) {
      mostrarToast("Arquivo vazio ou formato inválido", "error");
      return;
    }
    const headers = jsonData[0].map((h) => String(h || "").trim());
    const rows = jsonData
      .slice(1)
      .filter((row) =>
        row.some((cell) => cell && cell.toString().trim() !== ""),
      );
    dadosImportados = { headers, rows };
    exibirPreviaImportacao();
  };
  reader.readAsArrayBuffer(file);
}

function exibirPreviaImportacao() {
  if (!dadosImportados) return;
  const { headers, rows } = dadosImportados;
  const previewHeader = document.getElementById("previewHeader");
  const previewBody = document.getElementById("previewBody");
  const mapeamentoDiv = document.getElementById("mapeamentoColunas");

  previewHeader.innerHTML =
    "<tr>" + headers.map((h) => `<th>${h}</th>`).join("") + "</tr>";
  previewBody.innerHTML = rows
    .slice(0, 10)
    .map(
      (row) =>
        "<tr>" + row.map((cell) => `<td>${cell || ""}</td>`).join("") + "</tr>",
    )
    .join("");

  const camposSistema = [
    { campo: "aluno_nome", label: "Nome do Aluno", obrigatorio: true },
    { campo: "plano_nome", label: "Nome do Plano", obrigatorio: true },
    { campo: "valor_total", label: "Valor Total", obrigatorio: false },
    { campo: "valor_parcela", label: "Valor Parcela", obrigatorio: false },
    { campo: "num_parcelas", label: "Nº Parcelas", obrigatorio: true },
    { campo: "primeiro_vencimento", label: "1º Vencimento", obrigatorio: true },
    { campo: "desconto", label: "Desconto (%)", obrigatorio: false },
    { campo: "observacoes", label: "Observações", obrigatorio: false },
  ];

  mapeamentoDiv.innerHTML = camposSistema
    .map(
      (cs) => `
    <div class="filter-group">
      <label class="filter-label">${cs.label} ${cs.obrigatorio ? "*" : ""}</label>
      <select class="filter-select" data-campo="${cs.campo}" data-obrigatorio="${cs.obrigatorio}">
        <option value="">-- Selecione --</option>
        ${headers.map((h) => `<option value="${h}">${h}</option>`).join("")}
      </select>
    </div>
  `,
    )
    .join("");

  document.getElementById("previewImportacaoContainer").style.display = "block";
  document.getElementById("btnConfirmarImportacao").disabled = false;
}

function validarLinhaImportacao(linha, mapeamento) {
  const alunoNome = linha[mapeamento.aluno_nome]?.trim();
  const planoNome = linha[mapeamento.plano_nome]?.trim();
  const numParcelas = parseInt(linha[mapeamento.num_parcelas]);
  const primeiroVenc = linha[mapeamento.primeiro_vencimento];
  if (!alunoNome || !planoNome || isNaN(numParcelas) || !primeiroVenc)
    return false;
  return true;
}

async function confirmarImportacao() {
  if (!dadosImportados) return;
  const selects = document.querySelectorAll(
    "#mapeamentoColunas .filter-select",
  );
  const mapeamento = {};
  selects.forEach((select) => {
    const campo = select.dataset.campo;
    const valor = select.value;
    if (valor) mapeamento[campo] = valor;
  });
  if (
    !mapeamento.aluno_nome ||
    !mapeamento.plano_nome ||
    !mapeamento.num_parcelas ||
    !mapeamento.primeiro_vencimento
  ) {
    mostrarToast("Preencha todos os campos obrigatórios", "error");
    return;
  }

  const { headers, rows } = dadosImportados;
  const indiceAluno = headers.indexOf(mapeamento.aluno_nome);
  const indicePlano = headers.indexOf(mapeamento.plano_nome);
  const indiceValorTotal = mapeamento.valor_total
    ? headers.indexOf(mapeamento.valor_total)
    : -1;
  const indiceValorParcela = mapeamento.valor_parcela
    ? headers.indexOf(mapeamento.valor_parcela)
    : -1;
  const indiceNumParcelas = headers.indexOf(mapeamento.num_parcelas);
  const indicePrimeiroVenc = headers.indexOf(mapeamento.primeiro_vencimento);
  const indiceDesconto = mapeamento.desconto
    ? headers.indexOf(mapeamento.desconto)
    : -1;
  const indiceObs = mapeamento.observacoes
    ? headers.indexOf(mapeamento.observacoes)
    : -1;

  const dadosValidados = [];
  const erros = [];

  for (let i = 0; i < rows.length; i++) {
    const linha = rows[i];
    const alunoNome = linha[indiceAluno]?.trim();
    const planoNome = linha[indicePlano]?.trim();
    const numParcelas = parseInt(linha[indiceNumParcelas]);
    const primeiroVenc = linha[indicePrimeiroVenc];
    if (!alunoNome || !planoNome || isNaN(numParcelas) || !primeiroVenc) {
      erros.push(`Linha ${i + 2}: campos obrigatórios ausentes`);
      continue;
    }
    const aluno = estado.dados.alunos.find(
      (a) => a.nome.toLowerCase() === alunoNome.toLowerCase(),
    );
    if (!aluno) {
      erros.push(`Linha ${i + 2}: aluno "${alunoNome}" não encontrado`);
      continue;
    }
    const plano = estado.dados.planos.find(
      (p) => p.nome.toLowerCase() === planoNome.toLowerCase(),
    );
    if (!plano) {
      erros.push(`Linha ${i + 2}: plano "${planoNome}" não encontrado`);
      continue;
    }
    let valorTotal = null;
    let valorParcela = null;
    if (indiceValorTotal !== -1 && linha[indiceValorTotal]) {
      valorTotal = parseFloat(
        String(linha[indiceValorTotal]).replace(",", "."),
      );
      if (isNaN(valorTotal)) valorTotal = null;
    }
    if (indiceValorParcela !== -1 && linha[indiceValorParcela]) {
      valorParcela = parseFloat(
        String(linha[indiceValorParcela]).replace(",", "."),
      );
      if (isNaN(valorParcela)) valorParcela = null;
    }
    let desconto = 0;
    if (indiceDesconto !== -1 && linha[indiceDesconto]) {
      desconto = parseFloat(String(linha[indiceDesconto]).replace(",", "."));
      if (isNaN(desconto)) desconto = 0;
    }
    const observacoes = indiceObs !== -1 ? linha[indiceObs] : "";
    dadosValidados.push({
      aluno_id: aluno.id,
      plano_id: plano.id,
      plano_nome: plano.nome,
      num_parcelas: numParcelas,
      primeiro_vencimento: primeiroVenc,
      valor_total: valorTotal,
      valor_parcela: valorParcela,
      desconto: desconto,
      observacoes: observacoes,
    });
  }

  if (erros.length > 0) {
    mostrarToast(
      `Erros na validação:\n${erros.slice(0, 5).join("\n")}${erros.length > 5 ? `\n... e mais ${erros.length - 5} erros` : ""}`,
      "error",
    );
    return;
  }

  if (dadosValidados.length === 0) {
    mostrarToast("Nenhum dado válido para importar", "alerta");
    return;
  }

  confirmarAcao(
    `Deseja importar ${dadosValidados.length} mensalidade(s)?`,
    async () => {
      mostrarLoading();
      let sucessos = 0;
      let falhas = 0;
      for (const item of dadosValidados) {
        try {
          const valorParcela =
            item.valor_parcela || item.valor_total / item.num_parcelas;
          const valorTotal =
            item.valor_total || valorParcela * item.num_parcelas;
          const fatorDesconto = 1 - item.desconto / 100;
          const totalComDesconto = valorTotal * fatorDesconto;
          const valorParcelaComDesconto = totalComDesconto / item.num_parcelas;

          const { data: mensalidade, error: erroMensalidade } =
            await supabaseClient
              .from("mensalidades")
              .insert([
                {
                  aluno_id: item.aluno_id,
                  plano_id: item.plano_id,
                  plano: item.plano_nome,
                  valor_total: totalComDesconto,
                  numero_parcelas: item.num_parcelas,
                  data_contratacao: hoje(),
                  observacoes: item.observacoes,
                  desconto_aplicado: item.desconto,
                },
              ])
              .select();
          if (erroMensalidade) throw erroMensalidade;

          const mensalidadeId = mensalidade[0].id;
          const primeiroVenc = item.primeiro_vencimento;
          const dia = new Date(primeiroVenc + "T12:00:00").getDate();
          const parcelas = [];
          for (let i = 0; i < item.num_parcelas; i++) {
            parcelas.push({
              mensalidade_id: mensalidadeId,
              numero: i + 1,
              valor: valorParcelaComDesconto,
              vencimento: adicionarMeses(primeiroVenc, i, dia),
              status: "pendente",
            });
          }
          const { error: erroParcelas } = await supabaseClient
            .from("parcelas")
            .insert(parcelas);
          if (erroParcelas) throw erroParcelas;
          sucessos++;
        } catch (error) {
          console.error("Erro ao importar linha:", error);
          falhas++;
        }
      }
      mostrarToast(
        `${sucessos} mensalidades importadas com sucesso.${falhas > 0 ? ` ${falhas} falhas.` : ""}`,
        "success",
      );
      fecharModal("modalImportacao");
      await carregarDados();
      renderizarTabela();
      renderizarResumo();
      renderizarGraficoPrevisao();
      atualizarDashboard();
      esconderLoading();
    },
  );
}

// ===================== CANCELAMENTO COM ESTORNO =====================
async function abrirModalCancelamento(mensalidadeId) {
  const mensalidade = estado.dados.mensalidades.find(
    (m) => m.id === mensalidadeId,
  );
  if (!mensalidade) return;
  if (mensalidade.status === "cancelada") {
    mostrarToast("Esta mensalidade já está cancelada", "alerta");
    return;
  }
  const parcelasPagas = estado.dados.parcelas.filter(
    (p) => p.mensalidade_id === mensalidadeId && p.status === "pago",
  );
  const totalPago = parcelasPagas.reduce((acc, p) => acc + p.valor, 0);
  document.getElementById("cancelamentoMensalidadeId").value = mensalidadeId;
  document.getElementById("valorEstorno").value = fmtValor(totalPago);
  document.getElementById("cancelamentoData").value = hoje();
  document.getElementById("cancelamentoMotivo").value = "";
  document.getElementById("cancelamentoObs").value = "";
  const radioSemEstorno = document.querySelector(
    'input[name="tipoCancelamento"][value="sem_estorno"]',
  );
  const radioComEstorno = document.querySelector(
    'input[name="tipoCancelamento"][value="com_estorno"]',
  );
  radioSemEstorno.checked = true;
  document.getElementById("grupoValorEstorno").style.display = "none";
  radioSemEstorno.onchange = () => {
    document.getElementById("grupoValorEstorno").style.display = "none";
  };
  radioComEstorno.onchange = () => {
    document.getElementById("grupoValorEstorno").style.display = "block";
  };
  document.getElementById("modalCancelamento").classList.add("show");
}

async function confirmarCancelamento() {
  const mensalidadeId = parseInt(
    document.getElementById("cancelamentoMensalidadeId").value,
  );
  const mensalidade = estado.dados.mensalidades.find(
    (m) => m.id === mensalidadeId,
  );
  if (!mensalidade) return;
  const tipo = document.querySelector(
    'input[name="tipoCancelamento"]:checked',
  ).value;
  const dataCancelamento = document.getElementById("cancelamentoData").value;
  const motivo = document.getElementById("cancelamentoMotivo").value;
  const observacoes = document.getElementById("cancelamentoObs").value;

  if (!dataCancelamento) {
    mostrarToast("Informe a data de cancelamento", "error");
    return;
  }

  let valorEstornado = 0;
  if (tipo === "com_estorno") {
    const parcelasPagas = estado.dados.parcelas.filter(
      (p) => p.mensalidade_id === mensalidadeId && p.status === "pago",
    );
    valorEstornado = parcelasPagas.reduce((acc, p) => acc + p.valor, 0);
    if (valorEstornado === 0) {
      mostrarToast(
        "Não há valor a estornar. Deseja cancelar sem estorno?",
        "alerta",
      );
      return;
    }
  }

  confirmarAcao(
    `Deseja realmente cancelar esta mensalidade${tipo === "com_estorno" ? ` e estornar ${fmtValor(valorEstornado)}?` : "?"}`,
    async () => {
      mostrarLoading();
      try {
        // Atualizar mensalidade
        const { error: errMens } = await supabaseClient
          .from("mensalidades")
          .update({
            status: "cancelada",
            cancelado_em: dataCancelamento,
            motivo_cancelamento: motivo,
            valor_estornado: tipo === "com_estorno" ? valorEstornado : null,
            observacoes: mensalidade.observacoes
              ? `${mensalidade.observacoes}\nCancelamento: ${motivo}`
              : `Cancelamento: ${motivo}`,
          })
          .eq("id", mensalidadeId);
        if (errMens) throw errMens;

        // Atualizar parcelas
        const parcelas = estado.dados.parcelas.filter(
          (p) => p.mensalidade_id === mensalidadeId,
        );
        for (const parcela of parcelas) {
          if (parcela.status === "pago" && tipo === "com_estorno") {
            await supabaseClient
              .from("parcelas")
              .update({
                estornado: true,
                observacoes: `${parcela.observacoes || ""} Estornado em ${dataCancelamento}`,
              })
              .eq("id", parcela.id);
          } else if (parcela.status !== "pago") {
            await supabaseClient
              .from("parcelas")
              .update({ status: "cancelada" })
              .eq("id", parcela.id);
          }
        }

        mostrarToast(
          `Mensalidade cancelada com sucesso${tipo === "com_estorno" ? ` e estorno de ${fmtValor(valorEstornado)} registrado.` : "."}`,
          "success",
        );
        fecharModal("modalCancelamento");
        await carregarDados();
        renderizarTabela();
        renderizarResumo();
        renderizarGraficoPrevisao();
        atualizarDashboard();
      } catch (error) {
        console.error("Erro ao cancelar mensalidade:", error);
        mostrarToast("Erro ao cancelar: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
  );
}

// ===================== INICIALIZAÇÃO =====================
document.addEventListener("DOMContentLoaded", async () => {
  await verificarLogin();
  mostrarLoading();
  await carregarDados();
  renderizarResumo();
  renderizarTabela();
  renderizarGraficoPrevisao();
  atualizarDashboard();

  const selectPlano = document.getElementById("mensalidadePlano");
  if (selectPlano) {
    selectPlano.addEventListener("change", onPlanoChange);
  }

  const statusSelect = document.getElementById("editarParcelaStatus");
  if (statusSelect) {
    statusSelect.addEventListener("change", function () {
      const grupoData = document.getElementById("grupoDataPagamento");
      const grupoForma = document.getElementById("grupoForma");
      if (this.value === "pago") {
        grupoData.style.display = "block";
        grupoForma.style.display = "block";
      } else {
        grupoData.style.display = "none";
        grupoForma.style.display = "none";
      }
    });
  }

  esconderLoading();
});
