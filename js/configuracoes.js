const URL_SUPABASE = "https://mputdowrhzrvqslslubk.supabase.co";
const KEY_SUPABASE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";
const supabaseClient = window.supabase.createClient(URL_SUPABASE, KEY_SUPABASE);

const estado = {
  usuario: null,
  abaAtiva: "estudio",
  dados: {
    config_estudio: null,
    planos: [],
    formas_pagamento: [],
    categorias_receitas: [],
    categorias_despesas: [],
    juros_multas: [],
    eventos: [],
    metas: [],
    usuarios: [],
    alunos: [],
  },
  // Paginação e filtros
  paginacao: {
    planos: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    formasPagamento: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    categoriasReceitas: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    categoriasDespesas: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    eventos: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    metas: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
    usuarios: { pagina: 1, itensPorPagina: 10, total: 0, filtro: "" },
  },
};

// Variáveis para controle do modal de confirmação
let acaoConfirmadaCallback = null;

// ======================== UTILITÁRIOS ========================
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
  let icone = "info-circle";
  if (tipo === "success") icone = "check-circle";
  if (tipo === "error") icone = "exclamation-circle";
  if (tipo === "warning") icone = "exclamation-triangle";
  toast.innerHTML = `<i class="fas fa-${icone}"></i> ${mensagem}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}
function formatarData(data) {
  if (!data) return "-";
  return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
}
function hoje() {
  return new Date().toISOString().split("T")[0];
}
function fecharModal(id) {
  document.getElementById(id).classList.remove("show");
}
// Fechar modal de confirmação
function fecharModalConfirmacao() {
  document.getElementById("modalConfirmacao").classList.remove("show");
  acaoConfirmadaCallback = null;
}
function executarAcaoConfirmada() {
  if (acaoConfirmadaCallback) {
    acaoConfirmadaCallback();
  }
  fecharModalConfirmacao();
}
// Confirmação genérica
function confirmarAcao(mensagem, callback, titulo = "Confirmar ação") {
  document.getElementById("confirmTitulo").textContent = titulo;
  document.getElementById("confirmMensagem").textContent = mensagem;
  acaoConfirmadaCallback = callback;
  document.getElementById("modalConfirmacao").classList.add("show");
}

// ======================== VALIDAÇÕES DE UNICIDADE ========================
async function verificarUnicidade(tabela, campo, valor, idIgnorar = null) {
  let query = supabaseClient.from(tabela).select("id").eq(campo, valor);
  if (idIgnorar) {
    query = query.neq("id", idIgnorar);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0;
}

// ======================== CRUD GENÉRICO ========================
async function criarRegistro(
  tabela,
  dados,
  listaEstado,
  mensagemSucesso = "Registro criado com sucesso!",
) {
  mostrarLoading();
  try {
    // Verificar unicidade se campo 'nome' existir
    if (dados.nome) {
      const existe = await verificarUnicidade(tabela, "nome", dados.nome);
      if (existe) {
        throw new Error(`Já existe um registro com o nome "${dados.nome}".`);
      }
    }
    const { data, error } = await supabaseClient
      .from(tabela)
      .insert([
        {
          ...dados,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        },
      ])
      .select()
      .single();
    if (error) throw error;
    listaEstado.push(data);
    atualizarListaPorAba();
    mostrarToast(mensagemSucesso, "success");
    return data;
  } catch (error) {
    console.error(`Erro ao criar em ${tabela}:`, error);
    mostrarToast(error.message, "error");
    return null;
  } finally {
    esconderLoading();
  }
}

async function atualizarRegistro(
  tabela,
  id,
  dados,
  listaEstado,
  mensagemSucesso = "Registro atualizado!",
) {
  mostrarLoading();
  try {
    // Verificar unicidade se campo 'nome' existir
    if (dados.nome) {
      const existe = await verificarUnicidade(tabela, "nome", dados.nome, id);
      if (existe) {
        throw new Error(`Já existe um registro com o nome "${dados.nome}".`);
      }
    }
    const { error } = await supabaseClient
      .from(tabela)
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    const index = listaEstado.findIndex((item) => item.id === id);
    if (index !== -1) {
      listaEstado[index] = { ...listaEstado[index], ...dados };
    }
    atualizarListaPorAba();
    mostrarToast(mensagemSucesso, "success");
  } catch (error) {
    console.error(`Erro ao atualizar em ${tabela}:`, error);
    mostrarToast(error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ======================== PAGINAÇÃO E FILTRO ========================
function getItensPaginados(lista, aba) {
  const config = estado.paginacao[aba];
  if (!config) return { itens: [], total: 0 };
  let filtrados = lista;
  if (config.filtro) {
    const termo = config.filtro.toLowerCase();
    filtrados = lista.filter((item) => {
      if (item.nome) return item.nome.toLowerCase().includes(termo);
      if (item.titulo) return item.titulo.toLowerCase().includes(termo);
      if (item.mes && item.ano)
        return `${item.mes}/${item.ano}`.includes(termo);
      return false;
    });
  }
  const total = filtrados.length;
  const start = (config.pagina - 1) * config.itensPorPagina;
  const itens = filtrados.slice(start, start + config.itensPorPagina);
  return { itens, total };
}

function atualizarPaginacao(aba, total) {
  const config = estado.paginacao[aba];
  config.total = total;
  const totalPages = Math.ceil(total / config.itensPorPagina);
  const container = document.getElementById(
    `paginacao${aba.charAt(0).toUpperCase() + aba.slice(1)}`,
  );
  if (!container) return;
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }
  let html = `<div class="pagination-container">`;
  if (config.pagina > 1) {
    html += `<button class="pagination-btn" onclick="mudarPagina('${aba}', -1)">Anterior</button>`;
  } else {
    html += `<button class="pagination-btn" disabled>Anterior</button>`;
  }
  html += `<span class="pagination-info">Página ${config.pagina} de ${totalPages}</span>`;
  if (config.pagina < totalPages) {
    html += `<button class="pagination-btn" onclick="mudarPagina('${aba}', 1)">Próximo</button>`;
  } else {
    html += `<button class="pagination-btn" disabled>Próximo</button>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

function mudarPagina(aba, delta) {
  const config = estado.paginacao[aba];
  const newPage = config.pagina + delta;
  const totalPages = Math.ceil(config.total / config.itensPorPagina);
  if (newPage >= 1 && newPage <= totalPages) {
    config.pagina = newPage;
    atualizarListaPorAba();
  }
}

function filtrarLista(aba, termo) {
  estado.paginacao[aba].filtro = termo;
  estado.paginacao[aba].pagina = 1;
  atualizarListaPorAba();
}

// ======================== AUTENTICAÇÃO E LOGIN ========================
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
      estado.usuario.role === "admin" ? "Administrador" : "Usuário";
    const iniciais = (estado.usuario.nome || "U")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    document.getElementById("userAvatar").textContent = iniciais;
  }
}

async function fazerLogout() {
  confirmarAcao(
    "Deseja sair do sistema?",
    async () => {
      await supabaseClient.auth.signOut();
      localStorage.removeItem("usuario");
      window.location.href = "../index.html";
    },
    "Confirmar saída",
  );
}

// ======================== CARREGAMENTO DE DADOS ========================
async function carregarDados() {
  try {
    const { data: estudio, error: errorEstudio } = await supabaseClient
      .from("config_estudio")
      .select("*")
      .eq("id", 1)
      .single();
    if (!errorEstudio && estudio) estado.dados.config_estudio = estudio;
    else if (errorEstudio && errorEstudio.code === "PGRST116")
      await criarConfiguracaoPadrao();

    const { data: planos, error: errorPlanos } = await supabaseClient
      .from("planos")
      .select("*")
      .order("nome");
    if (!errorPlanos) estado.dados.planos = planos || [];

    const { data: formas, error: errorFormas } = await supabaseClient
      .from("formas_pagamento")
      .select("*")
      .order("nome");
    if (!errorFormas && formas) estado.dados.formas_pagamento = formas;

    const { data: catReceitas, error: errorCatReceitas } = await supabaseClient
      .from("categorias_receitas")
      .select("*")
      .order("nome");
    if (!errorCatReceitas && catReceitas)
      estado.dados.categorias_receitas = catReceitas;

    const { data: catDespesas, error: errorCatDespesas } = await supabaseClient
      .from("categorias_contas")
      .select("*")
      .order("nome");
    if (!errorCatDespesas && catDespesas)
      estado.dados.categorias_despesas = catDespesas;

    const { data: juros, error: errorJuros } = await supabaseClient
      .from("config_juros")
      .select("*")
      .order("dias_atraso");
    if (!errorJuros && juros) estado.dados.juros_multas = juros;
    if (estado.dados.juros_multas.length === 0) await criarFaixaJurosPadrao();

    const { data: eventos, error: errorEventos } = await supabaseClient
      .from("eventos")
      .select("*")
      .order("data", { ascending: false });
    if (!errorEventos && eventos) estado.dados.eventos = eventos;

    const { data: metas, error: errorMetas } = await supabaseClient
      .from("metas")
      .select("*")
      .order("ano", { ascending: false })
      .order("mes", { ascending: false });
    if (!errorMetas && metas) estado.dados.metas = metas;

    const { data: usuarios, error: errorUsuarios } = await supabaseClient
      .from("usuarios")
      .select("*")
      .order("nome");
    if (!errorUsuarios && usuarios) estado.dados.usuarios = usuarios;

    const { data: alunos, error: errorAlunos } = await supabaseClient
      .from("alunos")
      .select("id, nome, plano_id")
      .eq("status", "ativo");
    if (!errorAlunos) estado.dados.alunos = alunos || [];

    atualizarTotalConfiguracoes();
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar dados: " + error.message, "error");
  }
}

async function criarConfiguracaoPadrao() {
  const configPadrao = {
    id: 1,
    nome: "ESTÚDIO RAFAELA LISBOA",
    telefone: "",
    email: "",
    endereco: "",
    cnpj: "",
    capacidade_maxima: 5,
    duracao_padrao: 60,
    horario_abertura: "08:00",
    horario_fechamento: "20:00",
    dias_funcionamento: [1, 2, 3, 4, 5],
  };
  const { data, error } = await supabaseClient
    .from("config_estudio")
    .insert([configPadrao])
    .select()
    .single();
  if (!error && data) {
    estado.dados.config_estudio = data;
    mostrarToast("Configuração padrão criada", "success");
  }
}

async function criarFaixaJurosPadrao() {
  const faixaPadrao = {
    dias_atraso: 30,
    percentual_juros: 1.0,
    percentual_multa: 2.0,
    justificativa: null,
    ativo: true,
  };
  const { data, error } = await supabaseClient
    .from("config_juros")
    .insert([faixaPadrao])
    .select()
    .single();
  if (!error && data) {
    estado.dados.juros_multas.push(data);
    mostrarToast("Faixa de juros padrão criada", "success");
  }
}

function atualizarTotalConfiguracoes() {
  const total =
    (estado.dados.planos?.length || 0) +
    (estado.dados.formas_pagamento?.length || 0) +
    (estado.dados.categorias_receitas?.length || 0) +
    (estado.dados.categorias_despesas?.length || 0) +
    (estado.dados.juros_multas?.length || 0) +
    (estado.dados.eventos?.length || 0) +
    (estado.dados.metas?.length || 0) +
    (estado.dados.usuarios?.length || 0);
  document.getElementById("totalConfiguracoes").textContent =
    `${total} configurações ativas`;
}

// ======================== ABA E ATUALIZAÇÃO DE LISTAS ========================
function mudarAba(abaName) {
  estado.abaAtiva = abaName;
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => (el.style.display = "none"));
  document
    .querySelectorAll(".tab")
    .forEach((el) => el.classList.remove("active"));
  const abaId = `aba${abaName.charAt(0).toUpperCase() + abaName.slice(1)}`;
  const abaElement = document.getElementById(abaId);
  if (abaElement) abaElement.style.display = "block";
  event.currentTarget.classList.add("active");
  atualizarListaPorAba();
}

function atualizarListaPorAba() {
  switch (estado.abaAtiva) {
    case "planos":
      atualizarListaPlanos();
      break;
    case "formasPagamento":
      atualizarListaFormasPagamento();
      break;
    case "categoriasReceitas":
      atualizarListaCategoriasReceitas();
      break;
    case "categoriasDespesas":
      atualizarListaCategoriasDespesas();
      break;
    case "jurosMultas":
      atualizarListaJurosMultas();
      break;
    case "eventos":
      atualizarListaEventos();
      break;
    case "metas":
      atualizarListaMetas();
      break;
    case "usuarios":
      atualizarListaUsuarios();
      break;
  }
}

// ======================== FUNÇÕES DE TOGGLE STATUS COM VERIFICAÇÃO DE USO ========================
async function toggleStatus(
  tabela,
  id,
  ativo,
  estadoArray,
  nomeItem = "Registro",
) {
  // Verificar se há dependências antes de desativar
  if (!ativo && tabela === "planos") {
    const emUso = estado.dados.alunos.some((aluno) => aluno.plano_id === id);
    if (emUso) {
      mostrarToast(
        `Não é possível desativar o plano "${nomeItem}" pois há alunos ativos utilizando-o.`,
        "error",
      );
      return;
    }
  }
  const acao = ativo ? "ativar" : "desativar";
  confirmarAcao(
    `Tem certeza que deseja ${acao} ${nomeItem.toLowerCase()}?`,
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from(tabela)
          .update({ ativo, atualizado_em: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        const index = estadoArray.findIndex((item) => item.id === id);
        if (index !== -1) estadoArray[index].ativo = ativo;
        atualizarListaPorAba();
        mostrarToast(`${nomeItem} ${acao}do com sucesso!`, "success");
      } catch (error) {
        console.error(`Erro ao ${acao} ${nomeItem}:`, error);
        mostrarToast(`Erro ao ${acao}: ${error.message}`, "error");
      } finally {
        esconderLoading();
      }
    },
    `Confirmar ${acao}`,
  );
}

// ======================== ESTÚDIO ========================
function atualizarInterface() {
  if (!estado.dados.config_estudio) return;
  const e = estado.dados.config_estudio;
  document.getElementById("estudioNome").value = e.nome || "";
  document.getElementById("estudioEmail").value = e.email || "";
  document.getElementById("estudioTelefone").value = e.telefone || "";
  document.getElementById("estudioCnpj").value = e.cnpj || "";
  document.getElementById("estudioEndereco").value = e.endereco || "";
  document.getElementById("horaAbertura").value = e.horario_abertura || "08:00";
  document.getElementById("horaFechamento").value =
    e.horario_fechamento || "20:00";
  document.getElementById("capacidadeMaxima").value = e.capacidade_maxima || 5;
  document.getElementById("duracaoPadrao").value = e.duracao_padrao || 60;
  const dias = e.dias_funcionamento || [1, 2, 3, 4, 5];
  document.querySelectorAll(".dia-toggle").forEach((btn) => {
    const dia = parseInt(btn.dataset.dia);
    if (dias.includes(dia)) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  atualizarListaPlanos();
  atualizarListaFormasPagamento();
  atualizarListaCategoriasReceitas();
  atualizarListaCategoriasDespesas();
  atualizarListaJurosMultas();
  atualizarListaEventos();
  atualizarListaMetas();
  atualizarListaUsuarios();
}

async function salvarEstudio() {
  mostrarLoading();
  const estudioData = {
    nome: document.getElementById("estudioNome").value,
    email: document.getElementById("estudioEmail").value,
    telefone: document.getElementById("estudioTelefone").value,
    endereco: document.getElementById("estudioEndereco").value,
    cnpj: document.getElementById("estudioCnpj").value,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const { error } = await supabaseClient
      .from("config_estudio")
      .update(estudioData)
      .eq("id", 1);
    if (error) throw error;
    estado.dados.config_estudio = {
      ...estado.dados.config_estudio,
      ...estudioData,
    };
    mostrarToast("Dados do estúdio salvos com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao salvar estúdio:", error);
    mostrarToast("Erro ao salvar: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

async function salvarHorarios() {
  const abertura = document.getElementById("horaAbertura").value;
  const fechamento = document.getElementById("horaFechamento").value;
  if (abertura >= fechamento) {
    mostrarToast(
      "A hora de abertura deve ser menor que a de fechamento.",
      "error",
    );
    return;
  }
  mostrarLoading();
  const diasFuncionamento = [];
  document.querySelectorAll(".dia-toggle.active").forEach((btn) => {
    diasFuncionamento.push(parseInt(btn.dataset.dia));
  });
  if (diasFuncionamento.length === 0) {
    mostrarToast("Selecione pelo menos um dia de funcionamento", "error");
    esconderLoading();
    return;
  }
  const horariosData = {
    horario_abertura: abertura,
    horario_fechamento: fechamento,
    dias_funcionamento: diasFuncionamento,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const { error } = await supabaseClient
      .from("config_estudio")
      .update(horariosData)
      .eq("id", 1);
    if (error) throw error;
    estado.dados.config_estudio = {
      ...estado.dados.config_estudio,
      ...horariosData,
    };
    mostrarToast("Horários salvos com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao salvar horários:", error);
    mostrarToast("Erro ao salvar: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

async function salvarCapacidade() {
  const capacidade = parseInt(
    document.getElementById("capacidadeMaxima").value,
  );
  const duracao = parseInt(document.getElementById("duracaoPadrao").value);
  if (!capacidade || capacidade < 1) {
    mostrarToast("Capacidade deve ser maior que 0", "error");
    return;
  }
  if (!duracao || duracao < 15) {
    mostrarToast("Duração deve ser no mínimo 15 minutos", "error");
    return;
  }
  mostrarLoading();
  const configData = {
    capacidade_maxima: capacidade,
    duracao_padrao: duracao,
    atualizado_em: new Date().toISOString(),
  };
  try {
    const { error } = await supabaseClient
      .from("config_estudio")
      .update(configData)
      .eq("id", 1);
    if (error) throw error;
    estado.dados.config_estudio = {
      ...estado.dados.config_estudio,
      ...configData,
    };
    mostrarToast("Configurações salvas com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    mostrarToast("Erro ao salvar: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

// ======================== PLANOS ========================
async function adicionarPlano() {
  const nome = document.getElementById("planoNome").value;
  const valor = parseFloat(document.getElementById("planoValor").value);
  const duracao = parseInt(document.getElementById("planoDuracao").value);
  const aulas_por_semana = document.getElementById("planoAulasSemana").value
    ? parseInt(document.getElementById("planoAulasSemana").value)
    : null;
  const descricao = document.getElementById("planoDescricao").value || null;
  const ativo = document.getElementById("planoAtivo").checked;
  if (!nome || !valor || !duracao) {
    mostrarToast("Preencha nome, valor e duração", "error");
    return;
  }
  await criarRegistro(
    "planos",
    { nome, valor, duracao, aulas_por_semana, descricao, ativo },
    estado.dados.planos,
    "Plano adicionado!",
  );
  // Limpar campos
  document.getElementById("planoNome").value = "";
  document.getElementById("planoValor").value = "";
  document.getElementById("planoDuracao").value = "";
  document.getElementById("planoAulasSemana").value = "";
  document.getElementById("planoDescricao").value = "";
  document.getElementById("planoAtivo").checked = true;
}

function atualizarListaPlanos() {
  const lista = document.getElementById("listaPlanos");
  const { itens, total } = getItensPaginados(estado.dados.planos, "planos");
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-tag"></i><p>Nenhum plano cadastrado.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((p) => {
        const classeInativo = !p.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">${p.nome} ${p.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
            <div class="list-item-sub">Valor: ${formatarMoeda(p.valor)} | Duração: ${p.duracao} dias | Aulas/semana: ${p.aulas_por_semana || "-"}</div>
            ${p.descricao ? `<div style="font-size:0.75rem; color:var(--grafite-claro); margin-top:0.2rem">${p.descricao}</div>` : ""}
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarPlano(${p.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn duplicar" onclick="duplicarPlano(${p.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
            ${p.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('planos', ${p.id}, false, estado.dados.planos, 'Plano')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('planos', ${p.id}, true, estado.dados.planos, 'Plano')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("planos", total);
}

function abrirEditarPlano(id) {
  const plano = estado.dados.planos.find((p) => p.id === id);
  if (!plano) return;
  document.getElementById("editPlanoId").value = plano.id;
  document.getElementById("editPlanoNome").value = plano.nome;
  document.getElementById("editPlanoValor").value = plano.valor;
  document.getElementById("editPlanoDuracao").value = plano.duracao;
  document.getElementById("editPlanoAulasSemana").value =
    plano.aulas_por_semana || "";
  document.getElementById("editPlanoDescricao").value = plano.descricao || "";
  document.getElementById("editPlanoAtivo").checked = plano.ativo;
  document.getElementById("modalEditarPlano").classList.add("show");
}

async function atualizarPlano() {
  const id = parseInt(document.getElementById("editPlanoId").value);
  const nome = document.getElementById("editPlanoNome").value;
  const valor = parseFloat(document.getElementById("editPlanoValor").value);
  const duracao = parseInt(document.getElementById("editPlanoDuracao").value);
  const aulas_por_semana = document.getElementById("editPlanoAulasSemana").value
    ? parseInt(document.getElementById("editPlanoAulasSemana").value)
    : null;
  const descricao = document.getElementById("editPlanoDescricao").value || null;
  const ativo = document.getElementById("editPlanoAtivo").checked;
  if (!nome || !valor || !duracao) {
    mostrarToast("Preencha nome, valor e duração", "error");
    return;
  }
  await atualizarRegistro(
    "planos",
    id,
    { nome, valor, duracao, aulas_por_semana, descricao, ativo },
    estado.dados.planos,
    "Plano atualizado!",
  );
  fecharModal("modalEditarPlano");
}

async function duplicarPlano(id) {
  const original = estado.dados.planos.find((p) => p.id === id);
  if (!original) return;
  const novoNome = `${original.nome} (cópia)`;
  await criarRegistro(
    "planos",
    {
      nome: novoNome,
      valor: original.valor,
      duracao: original.duracao,
      aulas_por_semana: original.aulas_por_semana,
      descricao: original.descricao,
      ativo: true,
    },
    estado.dados.planos,
    "Plano duplicado!",
  );
}

// ======================== FORMAS DE PAGAMENTO ========================
async function adicionarFormaPagamento() {
  const nome = document.getElementById("formaNome").value;
  const taxa = parseFloat(document.getElementById("formaTaxa").value) || 0;
  const descricao = document.getElementById("formaDescricao").value;
  if (!nome) {
    mostrarToast("Digite o nome da forma de pagamento", "error");
    return;
  }
  await criarRegistro(
    "formas_pagamento",
    { nome, taxa, descricao: descricao || null, ativo: true },
    estado.dados.formas_pagamento,
    "Forma de pagamento adicionada!",
  );
  document.getElementById("formaNome").value = "";
  document.getElementById("formaTaxa").value = "";
  document.getElementById("formaDescricao").value = "";
}

function atualizarListaFormasPagamento() {
  const lista = document.getElementById("listaFormasPagamento");
  const { itens, total } = getItensPaginados(
    estado.dados.formas_pagamento,
    "formasPagamento",
  );
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-credit-card"></i><p>Nenhuma forma de pagamento cadastrada.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((f) => {
        const classeInativo = !f.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">${f.nome} ${f.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
            <div class="list-item-sub">Taxa: ${f.taxa}% • ${f.descricao || "Sem descrição"}</div>
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarFormaPagamento(${f.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn duplicar" onclick="duplicarFormaPagamento(${f.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
            ${f.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('formas_pagamento', ${f.id}, false, estado.dados.formas_pagamento, 'Forma de pagamento')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('formas_pagamento', ${f.id}, true, estado.dados.formas_pagamento, 'Forma de pagamento')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("formasPagamento", total);
}

function abrirEditarFormaPagamento(id) {
  const forma = estado.dados.formas_pagamento.find((f) => f.id === id);
  if (!forma) return;
  document.getElementById("editFormaId").value = forma.id;
  document.getElementById("editFormaNome").value = forma.nome;
  document.getElementById("editFormaTaxa").value = forma.taxa;
  document.getElementById("editFormaDescricao").value = forma.descricao || "";
  document.getElementById("editFormaAtivo").checked = forma.ativo;
  document.getElementById("modalEditarForma").classList.add("show");
}

async function atualizarFormaPagamento() {
  const id = parseInt(document.getElementById("editFormaId").value);
  const nome = document.getElementById("editFormaNome").value;
  const taxa = parseFloat(document.getElementById("editFormaTaxa").value) || 0;
  const descricao = document.getElementById("editFormaDescricao").value;
  const ativo = document.getElementById("editFormaAtivo").checked;
  if (!nome) {
    mostrarToast("Digite o nome da forma de pagamento", "error");
    return;
  }
  await atualizarRegistro(
    "formas_pagamento",
    id,
    { nome, taxa, descricao: descricao || null, ativo },
    estado.dados.formas_pagamento,
    "Forma de pagamento atualizada!",
  );
  fecharModal("modalEditarForma");
}

async function duplicarFormaPagamento(id) {
  const original = estado.dados.formas_pagamento.find((f) => f.id === id);
  if (!original) return;
  const novoNome = `${original.nome} (cópia)`;
  await criarRegistro(
    "formas_pagamento",
    {
      nome: novoNome,
      taxa: original.taxa,
      descricao: original.descricao,
      ativo: true,
    },
    estado.dados.formas_pagamento,
    "Forma de pagamento duplicada!",
  );
}

// ======================== CATEGORIAS RECEITAS ========================
async function adicionarCategoriaReceita() {
  const nome = document.getElementById("categoriaReceitaNome").value;
  if (!nome) {
    mostrarToast("Digite o nome da categoria", "error");
    return;
  }
  await criarRegistro(
    "categorias_receitas",
    { nome, ativo: true },
    estado.dados.categorias_receitas,
    "Categoria adicionada!",
  );
  document.getElementById("categoriaReceitaNome").value = "";
}

function atualizarListaCategoriasReceitas() {
  const lista = document.getElementById("listaCategoriasReceitas");
  const { itens, total } = getItensPaginados(
    estado.dados.categorias_receitas,
    "categoriasReceitas",
  );
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-arrow-up"></i><p>Nenhuma categoria de receita cadastrada.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((c) => {
        const classeInativo = !c.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">${c.nome} ${c.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarCategoriaReceita(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn duplicar" onclick="duplicarCategoriaReceita(${c.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
            ${c.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('categorias_receitas', ${c.id}, false, estado.dados.categorias_receitas, 'Categoria')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('categorias_receitas', ${c.id}, true, estado.dados.categorias_receitas, 'Categoria')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("categoriasReceitas", total);
}

function abrirEditarCategoriaReceita(id) {
  const cat = estado.dados.categorias_receitas.find((c) => c.id === id);
  if (!cat) return;
  document.getElementById("editCatReceitaId").value = cat.id;
  document.getElementById("editCatReceitaNome").value = cat.nome;
  document.getElementById("editCatReceitaAtivo").checked = cat.ativo;
  document.getElementById("modalEditarCategoriaReceita").classList.add("show");
}

async function atualizarCategoriaReceita() {
  const id = parseInt(document.getElementById("editCatReceitaId").value);
  const nome = document.getElementById("editCatReceitaNome").value;
  const ativo = document.getElementById("editCatReceitaAtivo").checked;
  if (!nome) {
    mostrarToast("Digite o nome da categoria", "error");
    return;
  }
  await atualizarRegistro(
    "categorias_receitas",
    id,
    { nome, ativo },
    estado.dados.categorias_receitas,
    "Categoria atualizada!",
  );
  fecharModal("modalEditarCategoriaReceita");
}

async function duplicarCategoriaReceita(id) {
  const original = estado.dados.categorias_receitas.find((c) => c.id === id);
  if (!original) return;
  const novoNome = `${original.nome} (cópia)`;
  await criarRegistro(
    "categorias_receitas",
    { nome: novoNome, ativo: true },
    estado.dados.categorias_receitas,
    "Categoria duplicada!",
  );
}

// ======================== CATEGORIAS DESPESAS ========================
async function adicionarCategoriaDespesa() {
  const nome = document.getElementById("categoriaDespesaNome").value;
  const tipo = document.getElementById("categoriaDespesaTipo").value;
  if (!nome) {
    mostrarToast("Digite o nome da categoria", "error");
    return;
  }
  await criarRegistro(
    "categorias_contas",
    { nome, tipo, ativo: true },
    estado.dados.categorias_despesas,
    "Categoria adicionada!",
  );
  document.getElementById("categoriaDespesaNome").value = "";
  document.getElementById("categoriaDespesaTipo").value = "fixa";
}

function atualizarListaCategoriasDespesas() {
  const lista = document.getElementById("listaCategoriasDespesas");
  const { itens, total } = getItensPaginados(
    estado.dados.categorias_despesas,
    "categoriasDespesas",
  );
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-arrow-down"></i><p>Nenhuma categoria de despesa cadastrada.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((c) => {
        const tipoTexto =
          c.tipo === "fixa"
            ? "Fixa"
            : c.tipo === "variavel"
              ? "Variável"
              : "Eventual";
        const classeInativo = !c.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">${c.nome} ${c.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
            <div class="list-item-sub">Tipo: ${tipoTexto}</div>
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarCategoriaDespesa(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn duplicar" onclick="duplicarCategoriaDespesa(${c.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
            ${c.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('categorias_contas', ${c.id}, false, estado.dados.categorias_despesas, 'Categoria')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('categorias_contas', ${c.id}, true, estado.dados.categorias_despesas, 'Categoria')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("categoriasDespesas", total);
}

function abrirEditarCategoriaDespesa(id) {
  const cat = estado.dados.categorias_despesas.find((c) => c.id === id);
  if (!cat) return;
  document.getElementById("editCatDespesaId").value = cat.id;
  document.getElementById("editCatDespesaNome").value = cat.nome;
  document.getElementById("editCatDespesaTipo").value = cat.tipo;
  document.getElementById("editCatDespesaAtivo").checked = cat.ativo;
  document.getElementById("modalEditarCategoriaDespesa").classList.add("show");
}

async function atualizarCategoriaDespesa() {
  const id = parseInt(document.getElementById("editCatDespesaId").value);
  const nome = document.getElementById("editCatDespesaNome").value;
  const tipo = document.getElementById("editCatDespesaTipo").value;
  const ativo = document.getElementById("editCatDespesaAtivo").checked;
  if (!nome) {
    mostrarToast("Digite o nome da categoria", "error");
    return;
  }
  await atualizarRegistro(
    "categorias_contas",
    id,
    { nome, tipo, ativo },
    estado.dados.categorias_despesas,
    "Categoria atualizada!",
  );
  fecharModal("modalEditarCategoriaDespesa");
}

async function duplicarCategoriaDespesa(id) {
  const original = estado.dados.categorias_despesas.find((c) => c.id === id);
  if (!original) return;
  const novoNome = `${original.nome} (cópia)`;
  await criarRegistro(
    "categorias_contas",
    { nome: novoNome, tipo: original.tipo, ativo: true },
    estado.dados.categorias_despesas,
    "Categoria duplicada!",
  );
}

// ======================== JUROS E MULTAS ========================
async function adicionarJurosMulta() {
  const dias = parseInt(document.getElementById("jurosDias").value);
  const juros = parseFloat(document.getElementById("jurosPercent").value);
  const multa = parseFloat(document.getElementById("multaPercent").value);
  const justificativa =
    document.getElementById("jurosJustificativa").value || null;
  if (!dias || dias <= 0) {
    mostrarToast("Dias deve ser maior que zero", "error");
    return;
  }
  if (juros < 0 || multa < 0) {
    mostrarToast("Juros e multa não podem ser negativos", "error");
    return;
  }
  await criarRegistro(
    "config_juros",
    {
      dias_atraso: dias,
      percentual_juros: juros,
      percentual_multa: multa,
      justificativa,
      ativo: true,
    },
    estado.dados.juros_multas,
    "Faixa de juros/multa adicionada!",
  );
  document.getElementById("jurosDias").value = "";
  document.getElementById("jurosPercent").value = "";
  document.getElementById("multaPercent").value = "";
  document.getElementById("jurosJustificativa").value = "";
  estado.dados.juros_multas.sort((a, b) => a.dias_atraso - b.dias_atraso);
}

function atualizarListaJurosMultas() {
  const lista = document.getElementById("listaJurosMultas");
  const juros = estado.dados.juros_multas || [];
  if (juros.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-percent"></i><p>Nenhuma faixa de juros/multa cadastrada.</p></div>';
    return;
  }
  lista.innerHTML = juros
    .map((j) => {
      const isencao =
        j.percentual_juros == 0 && j.percentual_multa == 0 ? "Isento" : "";
      const justificativa = j.justificativa
        ? ` • Just: ${j.justificativa}`
        : "";
      const classeInativo = !j.ativo ? "inativo" : "";
      return `<div class="list-item ${classeInativo}">
        <div class="list-item-info">
          <div class="list-item-title">Até ${j.dias_atraso} dias ${j.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
          <div class="list-item-sub">Juros: ${j.percentual_juros}% • Multa: ${j.percentual_multa}% ${isencao} ${justificativa}</div>
        </div>
        <div class="list-actions">
          <button class="action-btn editar" onclick="abrirEditarJurosMulta(${j.id})" title="Editar"><i class="fas fa-edit"></i></button>
          ${j.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('config_juros', ${j.id}, false, estado.dados.juros_multas, 'Faixa de juros')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('config_juros', ${j.id}, true, estado.dados.juros_multas, 'Faixa de juros')" title="Ativar"><i class="fas fa-check"></i></button>`}
        </div>
      </div>`;
    })
    .join("");
}

function abrirEditarJurosMulta(id) {
  const juros = estado.dados.juros_multas.find((j) => j.id === id);
  if (!juros) return;
  document.getElementById("editJurosId").value = juros.id;
  document.getElementById("editJurosDias").value = juros.dias_atraso;
  document.getElementById("editJurosPercent").value = juros.percentual_juros;
  document.getElementById("editMultaPercent").value = juros.percentual_multa;
  document.getElementById("editJurosJustificativa").value =
    juros.justificativa || "";
  document.getElementById("editJurosAtivo").checked = juros.ativo;
  document.getElementById("modalEditarJuros").classList.add("show");
}

async function atualizarJurosMulta() {
  const id = parseInt(document.getElementById("editJurosId").value);
  const dias = parseInt(document.getElementById("editJurosDias").value);
  const juros = parseFloat(document.getElementById("editJurosPercent").value);
  const multa = parseFloat(document.getElementById("editMultaPercent").value);
  const justificativa =
    document.getElementById("editJurosJustificativa").value || null;
  const ativo = document.getElementById("editJurosAtivo").checked;
  if (!dias || dias <= 0) {
    mostrarToast("Dias deve ser maior que zero", "error");
    return;
  }
  if (juros < 0 || multa < 0) {
    mostrarToast("Juros e multa não podem ser negativos", "error");
    return;
  }
  await atualizarRegistro(
    "config_juros",
    id,
    {
      dias_atraso: dias,
      percentual_juros: juros,
      percentual_multa: multa,
      justificativa,
      ativo,
    },
    estado.dados.juros_multas,
    "Faixa de juros/multa atualizada!",
  );
  estado.dados.juros_multas.sort((a, b) => a.dias_atraso - b.dias_atraso);
  fecharModal("modalEditarJuros");
}

// ======================== EVENTOS ========================
function setupEventoIconPicker(
  containerId,
  inputId,
  activeIconClass = "fa-calendar",
) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const options = container.querySelectorAll(".icon-option");
  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      options.forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      const iconClass = opt.dataset.icon;
      document.getElementById(inputId).value = iconClass;
    });
    if (opt.dataset.icon === activeIconClass) {
      opt.classList.add("active");
      document.getElementById(inputId).value = activeIconClass;
    }
  });
}

async function adicionarEvento() {
  const titulo = document.getElementById("eventoTitulo").value;
  const data = document.getElementById("eventoData").value;
  const tipo = document.getElementById("eventoTipo").value;
  const recorrente =
    document.getElementById("eventoRecorrente").value === "true";
  const bloquearAgenda = document.getElementById(
    "eventoBloquearAgenda",
  ).checked;
  const destaque = document.getElementById("eventoDestaque").checked;
  const descricao = document.getElementById("eventoDescricao").value;
  const cor = document.getElementById("eventoCor").value;
  const icone = document.getElementById("eventoIcone").value;
  if (!titulo || !data || !tipo) {
    mostrarToast("Preencha os campos obrigatórios", "error");
    return;
  }
  await criarRegistro(
    "eventos",
    {
      titulo,
      data,
      tipo,
      recorrente,
      bloquear_agenda: bloquearAgenda,
      destaque,
      descricao: descricao || null,
      cor,
      icone,
      ativo: true,
    },
    estado.dados.eventos,
    "Evento adicionado!",
  );
  document.getElementById("eventoTitulo").value = "";
  document.getElementById("eventoData").value = "";
  document.getElementById("eventoTipo").value = "evento";
  document.getElementById("eventoRecorrente").value = "false";
  document.getElementById("eventoBloquearAgenda").checked = false;
  document.getElementById("eventoDestaque").checked = false;
  document.getElementById("eventoDescricao").value = "";
  document.getElementById("eventoCor").value = "#3a6b5c";
  document.getElementById("eventoIcone").value = "fa-calendar";
  document
    .querySelectorAll("#iconPickerEvento .icon-option")
    .forEach((opt) => opt.classList.remove("active"));
  document
    .querySelector("#iconPickerEvento .icon-option[data-icon='fa-calendar']")
    .classList.add("active");
}

function atualizarListaEventos() {
  const lista = document.getElementById("listaEventos");
  const { itens, total } = getItensPaginados(estado.dados.eventos, "eventos");
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-star"></i><p>Nenhum evento cadastrado.</p></div>';
  } else {
    const hojeStr = hoje();
    const tipoIcone = {
      evento: "fa-calendar",
      feriado: "fa-umbrella-beach",
      marco: "fa-flag",
      aniversario: "fa-birthday-cake",
    };
    const tipoTexto = {
      evento: "Evento",
      feriado: "Feriado",
      marco: "Marco",
      aniversario: "Aniversário",
    };
    lista.innerHTML = itens
      .map((e) => {
        const isPassado = e.data < hojeStr;
        const classeInativo = !e.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">
              <i class="fas ${e.icone || tipoIcone[e.tipo] || "fa-calendar"}" style="color:${e.cor || "#3a6b5c"}"></i>
              ${e.titulo}
              ${e.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}
              ${isPassado ? '<span class="list-item-badge badge-info">Passado</span>' : ""}
              ${e.destaque ? '<span class="list-item-badge" style="background:gold;color:var(--grafite);">Destaque</span>' : ""}
              ${e.bloquear_agenda ? '<span class="list-item-badge badge-warning">Bloqueia</span>' : ""}
            </div>
            <div class="list-item-sub">${formatarData(e.data)} • ${tipoTexto[e.tipo] || e.tipo} ${e.recorrente ? " • Recorrente anualmente" : ""}</div>
            ${e.descricao ? `<div style="font-size:0.75rem; color:var(--grafite-claro); margin-top:0.2rem">${e.descricao}</div>` : ""}
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarEvento(${e.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn duplicar" onclick="duplicarEvento(${e.id})" title="Duplicar"><i class="fas fa-copy"></i></button>
            ${e.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('eventos', ${e.id}, false, estado.dados.eventos, 'Evento')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('eventos', ${e.id}, true, estado.dados.eventos, 'Evento')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("eventos", total);
}

function abrirEditarEvento(id) {
  const evento = estado.dados.eventos.find((e) => e.id === id);
  if (!evento) return;
  document.getElementById("editEventoId").value = evento.id;
  document.getElementById("editEventoTitulo").value = evento.titulo;
  document.getElementById("editEventoData").value = evento.data;
  document.getElementById("editEventoTipo").value = evento.tipo;
  document.getElementById("editEventoRecorrente").value = evento.recorrente
    ? "true"
    : "false";
  document.getElementById("editEventoBloquearAgenda").checked =
    evento.bloquear_agenda;
  document.getElementById("editEventoDestaque").checked = evento.destaque;
  document.getElementById("editEventoDescricao").value = evento.descricao || "";
  document.getElementById("editEventoCor").value = evento.cor || "#3a6b5c";
  document.getElementById("editEventoIcone").value =
    evento.icone || "fa-calendar";
  // Atualizar preview da cor
  const preview = document.getElementById("editEventoCorPreview");
  if (preview) preview.style.backgroundColor = evento.cor || "#3a6b5c";
  // Atualizar ícones
  const icons = document.querySelectorAll("#editIconPickerEvento .icon-option");
  icons.forEach((opt) => {
    opt.classList.remove("active");
    if (opt.dataset.icon === (evento.icone || "fa-calendar")) {
      opt.classList.add("active");
    }
  });
  document.getElementById("modalEditarEvento").classList.add("show");
}

async function atualizarEvento() {
  const id = parseInt(document.getElementById("editEventoId").value);
  const titulo = document.getElementById("editEventoTitulo").value;
  const data = document.getElementById("editEventoData").value;
  const tipo = document.getElementById("editEventoTipo").value;
  const recorrente =
    document.getElementById("editEventoRecorrente").value === "true";
  const bloquearAgenda = document.getElementById(
    "editEventoBloquearAgenda",
  ).checked;
  const destaque = document.getElementById("editEventoDestaque").checked;
  const descricao = document.getElementById("editEventoDescricao").value;
  const cor = document.getElementById("editEventoCor").value;
  const icone = document.getElementById("editEventoIcone").value;
  if (!titulo || !data || !tipo) {
    mostrarToast("Preencha os campos obrigatórios", "error");
    return;
  }
  await atualizarRegistro(
    "eventos",
    id,
    {
      titulo,
      data,
      tipo,
      recorrente,
      bloquear_agenda: bloquearAgenda,
      destaque,
      descricao: descricao || null,
      cor,
      icone,
    },
    estado.dados.eventos,
    "Evento atualizado!",
  );
  fecharModal("modalEditarEvento");
}

async function duplicarEvento(id) {
  const original = estado.dados.eventos.find((e) => e.id === id);
  if (!original) return;
  const novoTitulo = `${original.titulo} (cópia)`;
  await criarRegistro(
    "eventos",
    {
      titulo: novoTitulo,
      data: original.data,
      tipo: original.tipo,
      recorrente: original.recorrente,
      bloquear_agenda: original.bloquear_agenda,
      destaque: original.destaque,
      descricao: original.descricao,
      cor: original.cor,
      icone: original.icone,
      ativo: true,
    },
    estado.dados.eventos,
    "Evento duplicado!",
  );
}

// ======================== METAS ========================
async function adicionarMeta() {
  const mes = parseInt(document.getElementById("metaMes").value);
  const ano = parseInt(document.getElementById("metaAno").value);
  const valor = parseFloat(document.getElementById("metaValor").value);
  if (!mes || !ano || !valor || valor <= 0) {
    mostrarToast("Preencha todos os campos corretamente", "error");
    return;
  }
  await criarRegistro(
    "metas",
    { mes, ano, valor_meta: valor },
    estado.dados.metas,
    "Meta adicionada!",
  );
  document.getElementById("metaMes").value = "1";
  document.getElementById("metaAno").value = new Date().getFullYear();
  document.getElementById("metaValor").value = "";
}

function atualizarListaMetas() {
  const lista = document.getElementById("listaMetas");
  const { itens, total } = getItensPaginados(estado.dados.metas, "metas");
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
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-bullseye"></i><p>Nenhuma meta cadastrada.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((m) => {
        const mesNome = meses[m.mes - 1] || m.mes;
        const realizado = m.valor_realizado
          ? formatarMoeda(m.valor_realizado)
          : "-";
        const atingida = m.atingida ? "✅ Sim" : "❌ Não";
        return `<div class="list-item">
          <div class="list-item-info">
            <div class="list-item-title">${mesNome}/${m.ano}</div>
            <div class="list-item-sub">Meta: ${formatarMoeda(m.valor_meta)} | Realizado: ${realizado} | Atingida: ${atingida}</div>
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarMeta(${m.id})" title="Editar"><i class="fas fa-edit"></i></button>
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("metas", total);
}

function abrirEditarMeta(id) {
  const meta = estado.dados.metas.find((m) => m.id === id);
  if (!meta) return;
  document.getElementById("editMetaId").value = meta.id;
  document.getElementById("editMetaMes").value = meta.mes;
  document.getElementById("editMetaAno").value = meta.ano;
  document.getElementById("editMetaValor").value = meta.valor_meta;
  document.getElementById("modalEditarMeta").classList.add("show");
}

async function atualizarMeta() {
  const id = parseInt(document.getElementById("editMetaId").value);
  const mes = parseInt(document.getElementById("editMetaMes").value);
  const ano = parseInt(document.getElementById("editMetaAno").value);
  const valor = parseFloat(document.getElementById("editMetaValor").value);
  if (!mes || !ano || !valor || valor <= 0) {
    mostrarToast("Preencha todos os campos corretamente", "error");
    return;
  }
  await atualizarRegistro(
    "metas",
    id,
    { mes, ano, valor_meta: valor },
    estado.dados.metas,
    "Meta atualizada!",
  );
  fecharModal("modalEditarMeta");
}

// ======================== USUÁRIOS ========================
async function adicionarUsuario() {
  const nome = document.getElementById("usuarioNome").value;
  const email = document.getElementById("usuarioEmail").value;
  const telefone = document.getElementById("usuarioTelefone").value || null;
  const cargo = document.getElementById("usuarioCargo").value || null;
  const role = document.getElementById("usuarioRole").value;
  const ativo = document.getElementById("usuarioAtivo").checked;
  if (!nome || !email) {
    mostrarToast("Preencha nome e email", "error");
    return;
  }
  await criarRegistro(
    "usuarios",
    { nome, email, telefone, cargo, role, ativo },
    estado.dados.usuarios,
    "Usuário adicionado!",
  );
  document.getElementById("usuarioNome").value = "";
  document.getElementById("usuarioEmail").value = "";
  document.getElementById("usuarioTelefone").value = "";
  document.getElementById("usuarioCargo").value = "";
  document.getElementById("usuarioRole").value = "admin";
  document.getElementById("usuarioAtivo").checked = true;
}

function atualizarListaUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  const { itens, total } = getItensPaginados(estado.dados.usuarios, "usuarios");
  if (itens.length === 0) {
    lista.innerHTML =
      '<div class="empty-state"><i class="fas fa-users-cog"></i><p>Nenhum usuário cadastrado.</p></div>';
  } else {
    lista.innerHTML = itens
      .map((u) => {
        const classeInativo = !u.ativo ? "inativo" : "";
        return `<div class="list-item ${classeInativo}">
          <div class="list-item-info">
            <div class="list-item-title">${u.nome} (${u.email}) ${u.ativo ? '<span class="list-item-badge badge-success">Ativo</span>' : '<span class="list-item-badge badge-warning">Inativo</span>'}</div>
            <div class="list-item-sub">${u.cargo ? `Cargo: ${u.cargo} | ` : ""}Role: ${u.role} | Último acesso: ${u.ultimo_acesso ? formatarData(u.ultimo_acesso) : "-"}</div>
          </div>
          <div class="list-actions">
            <button class="action-btn editar" onclick="abrirEditarUsuario('${u.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            ${u.ativo ? `<button class="action-btn desativar" onclick="toggleStatus('usuarios', '${u.id}', false, estado.dados.usuarios, 'Usuário')" title="Desativar"><i class="fas fa-ban"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatus('usuarios', '${u.id}', true, estado.dados.usuarios, 'Usuário')" title="Ativar"><i class="fas fa-check"></i></button>`}
          </div>
        </div>`;
      })
      .join("");
  }
  atualizarPaginacao("usuarios", total);
}

function abrirEditarUsuario(id) {
  const usuario = estado.dados.usuarios.find((u) => u.id === id);
  if (!usuario) return;
  document.getElementById("editUsuarioId").value = usuario.id;
  document.getElementById("editUsuarioNome").value = usuario.nome;
  document.getElementById("editUsuarioEmail").value = usuario.email;
  document.getElementById("editUsuarioTelefone").value = usuario.telefone || "";
  document.getElementById("editUsuarioCargo").value = usuario.cargo || "";
  document.getElementById("editUsuarioRole").value = usuario.role || "admin";
  document.getElementById("editUsuarioAtivo").checked = usuario.ativo;
  document.getElementById("modalEditarUsuario").classList.add("show");
}

async function atualizarUsuario() {
  const id = document.getElementById("editUsuarioId").value;
  const nome = document.getElementById("editUsuarioNome").value;
  const email = document.getElementById("editUsuarioEmail").value;
  const telefone = document.getElementById("editUsuarioTelefone").value || null;
  const cargo = document.getElementById("editUsuarioCargo").value || null;
  const role = document.getElementById("editUsuarioRole").value;
  const ativo = document.getElementById("editUsuarioAtivo").checked;
  if (!nome || !email) {
    mostrarToast("Preencha nome e email", "error");
    return;
  }
  await atualizarRegistro(
    "usuarios",
    id,
    { nome, email, telefone, cargo, role, ativo },
    estado.dados.usuarios,
    "Usuário atualizado!",
  );
  fecharModal("modalEditarUsuario");
}

// ======================== BACKUP ========================
function exportarBackup() {
  const backup = {
    version: "1.0",
    data: new Date().toISOString(),
    config_estudio: estado.dados.config_estudio,
    planos: estado.dados.planos,
    formas_pagamento: estado.dados.formas_pagamento,
    categorias_receitas: estado.dados.categorias_receitas,
    categorias_despesas: estado.dados.categorias_despesas,
    juros_multas: estado.dados.juros_multas,
    eventos: estado.dados.eventos,
    metas: estado.dados.metas,
    usuarios: estado.dados.usuarios,
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pilates-config-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  mostrarToast("Backup exportado com sucesso!", "success");
}
function abrirModalImportar() {
  document.getElementById("modalImportar").classList.add("show");
}
async function importarBackup() {
  const arquivo = document.getElementById("arquivoBackup").files[0];
  if (!arquivo) {
    mostrarToast("Selecione um arquivo!", "error");
    return;
  }
  mostrarLoading();
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.version || !backup.config_estudio)
        throw new Error("Arquivo de backup inválido");
      // Usar upsert em vez de delete
      await supabaseClient
        .from("config_estudio")
        .upsert({ ...backup.config_estudio, id: 1 });
      if (backup.planos?.length) {
        await supabaseClient
          .from("planos")
          .upsert(backup.planos, { onConflict: "id" });
      }
      if (backup.formas_pagamento?.length) {
        await supabaseClient
          .from("formas_pagamento")
          .upsert(backup.formas_pagamento, { onConflict: "id" });
      }
      if (backup.categorias_receitas?.length) {
        await supabaseClient
          .from("categorias_receitas")
          .upsert(backup.categorias_receitas, { onConflict: "id" });
      }
      if (backup.categorias_despesas?.length) {
        await supabaseClient
          .from("categorias_contas")
          .upsert(backup.categorias_despesas, { onConflict: "id" });
      }
      if (backup.juros_multas?.length) {
        await supabaseClient
          .from("config_juros")
          .upsert(backup.juros_multas, { onConflict: "id" });
      }
      if (backup.eventos?.length) {
        await supabaseClient
          .from("eventos")
          .upsert(backup.eventos, { onConflict: "id" });
      }
      if (backup.metas?.length) {
        await supabaseClient
          .from("metas")
          .upsert(backup.metas, { onConflict: "id" });
      }
      if (backup.usuarios?.length) {
        await supabaseClient
          .from("usuarios")
          .upsert(backup.usuarios, { onConflict: "id" });
      }
      fecharModal("modalImportar");
      await carregarDados();
      atualizarInterface();
      mostrarToast("Backup importado com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao importar:", err);
      mostrarToast("Erro ao importar arquivo: " + err.message, "error");
    } finally {
      esconderLoading();
    }
  };
  reader.readAsText(arquivo);
}

// ======================== INICIALIZAÇÃO ========================
document.addEventListener("DOMContentLoaded", async function () {
  mostrarLoading();
  try {
    await verificarLogin();
    await carregarDados();
    atualizarInterface();
    carregarInfoUsuario();
    // Setup event listeners for days toggle
    document.querySelectorAll(".dia-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
      });
    });
    // Setup icon pickers
    setupEventoIconPicker("iconPickerEvento", "eventoIcone", "fa-calendar");
    setupEventoIconPicker(
      "editIconPickerEvento",
      "editEventoIcone",
      "fa-calendar",
    );
    // Color preview for edit modal
    const editCorInput = document.getElementById("editEventoCor");
    const editCorPreview = document.getElementById("editEventoCorPreview");
    if (editCorInput && editCorPreview) {
      editCorInput.addEventListener("input", () => {
        editCorPreview.style.backgroundColor = editCorInput.value;
      });
    }
    // Inicializar paginação
    for (let aba in estado.paginacao) {
      estado.paginacao[aba].pagina = 1;
      estado.paginacao[aba].filtro = "";
    }
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarToast("Erro ao carregar configurações: " + error.message, "error");
  } finally {
    esconderLoading();
  }
});
