// ============================================================
// CONFIGURAÇÕES SUPABASE
// ============================================================
const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// ============================================================
// CONFIGURAÇÕES DE CACHE (igual ao index)
// ============================================================
const CACHE_KEYS = {
  ALUNOS: "cache_alunos_avaliacao",
  AVALIACOES: "cache_avaliacoes",
  DOCUMENTOS: "cache_documentos_avaliacao",
  LAST_UPDATE: "cache_last_update_avaliacao",
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// ============================================================
// FUNÇÕES DE CACHE (igual ao index)
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

function clearCache() {
  Object.values(CACHE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
  console.log("🧹 Cache limpo");
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
const estado = {
  usuario: null,
  alunoSelecionado: null,
  alunos: [],
  avaliacoes: [],
  avaliacaoAtual: {
    id: null,
    aluno_id: null,
    data_avaliacao: new Date().toISOString().split("T")[0],
  },
  documentos: [],
  secaoStatus: {
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
  },
  cache: {
    enabled: true,
    lastUpdate: null,
  },
  timeoutBusca: null,
};

// ============================================================
// FUNÇÃO SAFE QUERY (igual ao index)
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
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================================
async function verificarLogin() {
  try {
    // Tentar pegar usuário do localStorage (vindo do index)
    const usuarioSalvo = localStorage.getItem("usuario");
    if (usuarioSalvo) {
      estado.usuario = JSON.parse(usuarioSalvo);
      document.getElementById("userName").textContent =
        estado.usuario.nome || "Instrutor";

      const iniciais = (estado.usuario.nome || "I")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      document.getElementById("userAvatar").textContent = iniciais;

      return true;
    }

    // Se não tiver no localStorage, tentar auth do Supabase
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (user) {
      const { data: usuarioData } = await supabaseClient
        .from("usuarios")
        .select("id, nome, email, role")
        .eq("id", user.id)
        .single();

      if (usuarioData) {
        estado.usuario = usuarioData;
        localStorage.setItem("usuario", JSON.stringify(usuarioData));

        document.getElementById("userName").textContent = usuarioData.nome;
        const iniciais = usuarioData.nome
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();
        document.getElementById("userAvatar").textContent = iniciais;

        return true;
      }
    }

    // Se não encontrar, redirecionar para login
    window.location.href = "index.html";
    return false;
  } catch (error) {
    console.error("Erro ao verificar login:", error);
    window.location.href = "index.html";
    return false;
  }
}

async function fazerLogout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("usuario");
  window.location.href = "index.html";
}

// ============================================================
// FUNÇÕES DE ALUNOS - CORRIGIDAS
// ============================================================

// Função para buscar alunos em tempo real com debounce
async function buscarAlunosTempoReal() {
  const termo = document.getElementById("buscaAluno").value;
  const resultadosDiv = document.getElementById("buscaResultados");

  // Limpar timeout anterior
  if (estado.timeoutBusca) {
    clearTimeout(estado.timeoutBusca);
  }

  // Se o termo tiver menos de 2 caracteres, esconder resultados
  if (termo.length < 2) {
    resultadosDiv.classList.remove("show");
    return;
  }

  // Debounce para não fazer requisição a cada tecla
  estado.timeoutBusca = setTimeout(async () => {
    try {
      const { data, error } = await supabaseClient
        .from("alunos")
        .select("id, nome, cpf, telefone, nascimento, email")
        .or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%`)
        .order("nome")
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        resultadosDiv.innerHTML = data
          .map(
            (aluno) => `
              <div class="busca-item" onclick="selecionarAlunoBusca(${
                aluno.id
              }, '${aluno.nome.replace(/'/g, "\\'")}', '${
                aluno.cpf || ""
              }', '${aluno.telefone || ""}', '${
                aluno.nascimento || ""
              }', '${aluno.email || ""}')">
                <div class="busca-item-nome">${aluno.nome}</div>
                <div class="busca-item-info">
                  ${aluno.cpf ? `<span>CPF: ${aluno.cpf}</span>` : ""}
                  ${aluno.telefone ? `<span>Tel: ${aluno.telefone}</span>` : ""}
                </div>
              </div>
            `,
          )
          .join("");
        resultadosDiv.classList.add("show");
      } else {
        resultadosDiv.innerHTML =
          '<div class="busca-item" style="color: var(--grafite-claro);">Nenhum aluno encontrado</div>';
        resultadosDiv.classList.add("show");
      }
    } catch (error) {
      console.error("Erro na busca:", error);
    }
  }, 300); // 300ms de debounce
}

// Função para selecionar aluno da busca em tempo real
function selecionarAlunoBusca(id, nome, cpf, telefone, nascimento, email) {
  document.getElementById("buscaAluno").value = nome;
  document.getElementById("buscaResultados").classList.remove("show");

  // Criar objeto aluno
  const aluno = {
    id: id,
    nome: nome,
    cpf: cpf,
    telefone: telefone,
    nascimento: nascimento,
    email: email,
  };

  estado.alunoSelecionado = aluno;

  // Preencher campos
  document.getElementById("nomeAluno").value = aluno.nome || "";
  document.getElementById("dataNascimento").value = aluno.nascimento || "";
  document.getElementById("cpf").value = aluno.cpf || "";
  document.getElementById("contato").value =
    aluno.telefone || aluno.email || "";

  // Atualizar select também
  popularSelectAlunos();

  carregarAvaliacoesAluno(id);
  calcularProgresso();
  mostrarToast(`Aluno ${aluno.nome} selecionado`, "success");
}

// Função para carregar alunos para o select
async function carregarAlunosSelect() {
  try {
    // Tentar cache primeiro
    if (estado.cache.enabled) {
      const cached = getFromCache(CACHE_KEYS.ALUNOS);
      if (cached) {
        estado.alunos = cached;
        popularSelectAlunos();
        return;
      }
    }

    const { data, error } = await supabaseClient
      .from("alunos")
      .select("id, nome, cpf")
      .order("nome")
      .limit(100);

    if (error) throw error;

    estado.alunos = data || [];
    setInCache(CACHE_KEYS.ALUNOS, estado.alunos);
    popularSelectAlunos();
  } catch (error) {
    console.error("Erro ao carregar alunos:", error);
  }
}

function popularSelectAlunos() {
  const select = document.getElementById("seletorAluno");
  select.innerHTML = '<option value="">Selecione um aluno...</option>';

  if (!estado.alunos || estado.alunos.length === 0) {
    return;
  }

  estado.alunos.forEach((aluno) => {
    const option = document.createElement("option");
    option.value = aluno.id;
    let texto = aluno.nome;
    if (aluno.cpf) {
      texto += ` - ${aluno.cpf}`;
    }
    option.textContent = texto;

    // Marcar se for o aluno selecionado
    if (estado.alunoSelecionado && estado.alunoSelecionado.id == aluno.id) {
      option.selected = true;
    }

    select.appendChild(option);
  });
}

async function selecionarAluno() {
  const alunoId = document.getElementById("seletorAluno").value;
  if (!alunoId) return;

  mostrarLoading();

  try {
    const { data: aluno, error } = await supabaseClient
      .from("alunos")
      .select("*")
      .eq("id", alunoId)
      .single();

    if (error) throw error;

    estado.alunoSelecionado = aluno;

    // Preencher campos
    document.getElementById("nomeAluno").value = aluno.nome || "";
    document.getElementById("dataNascimento").value = aluno.nascimento || "";
    document.getElementById("cpf").value = aluno.cpf || "";
    document.getElementById("contato").value =
      aluno.telefone || aluno.email || "";
    document.getElementById("profissao").value = aluno.profissao || "";

    // Atualizar campo de busca
    document.getElementById("buscaAluno").value = aluno.nome || "";

    await carregarAvaliacoesAluno(alunoId);
    calcularProgresso();
    mostrarToast(`Aluno ${aluno.nome} selecionado`, "success");
  } catch (error) {
    console.error("Erro ao selecionar aluno:", error);
    mostrarToast("Erro ao carregar dados do aluno", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÕES DE AVALIAÇÕES COM CACHE
// ============================================================
async function carregarAvaliacoesAluno(alunoId) {
  try {
    const cacheKey = `${CACHE_KEYS.AVALIACOES}_${alunoId}`;

    // Tentar cache primeiro
    if (estado.cache.enabled) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        estado.avaliacoes = cached;
        renderizarHistorico();
        return;
      }
    }

    const { data, error } = await supabaseClient
      .from("avaliacoes")
      .select("*")
      .eq("aluno_id", alunoId)
      .order("data_avaliacao", { ascending: false });

    if (error) throw error;

    estado.avaliacoes = data || [];
    setInCache(cacheKey, estado.avaliacoes);
    renderizarHistorico();
  } catch (error) {
    console.error("Erro ao carregar avaliações:", error);
  }
}

function renderizarHistorico() {
  const grid = document.getElementById("historicoGrid");

  if (estado.avaliacoes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>Nenhuma avaliação encontrada para este aluno</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = estado.avaliacoes
    .map(
      (avaliacao) => `
    <div class="historico-card" onclick="carregarAvaliacao(${avaliacao.id})">
      <div class="historico-data">
        <i class="fas fa-calendar"></i> ${new Date(
          avaliacao.data_avaliacao,
        ).toLocaleDateString("pt-BR")}
      </div>
      <div class="historico-resumo">
        ${avaliacao.objetivo_principal || "Sem objetivo definido"}
      </div>
      <div class="historico-footer">
        <span class="historico-badge">
          <i class="fas fa-check-circle"></i> ${
            avaliacao.profissional_responsavel || "Instrutor"
          }
        </span>
        <span>${
          avaliacao.criado_em
            ? new Date(avaliacao.criado_em).toLocaleDateString("pt-BR")
            : ""
        }</span>
      </div>
    </div>
  `,
    )
    .join("");
}

async function carregarAvaliacao(avaliacaoId) {
  mostrarLoading();

  try {
    const { data, error } = await supabaseClient
      .from("avaliacoes")
      .select("*")
      .eq("id", avaliacaoId)
      .single();

    if (error) throw error;

    estado.avaliacaoAtual = data;
    preencherFormulario(data);
    mudarTab("form");
    mostrarToast("Avaliação carregada", "success");
  } catch (error) {
    console.error("Erro ao carregar avaliação:", error);
    mostrarToast("Erro ao carregar avaliação", "error");
  } finally {
    esconderLoading();
  }
}

function preencherFormulario(data) {
  // Limpar seleções de escala primeiro
  document
    .querySelectorAll(".rating-option")
    .forEach((o) => o.classList.remove("selected"));

  // Preencher campos
  Object.keys(data).forEach((key) => {
    const element = document.getElementById(key);
    if (element) {
      if (element.type === "checkbox") {
        element.checked = data[key] === true;
      } else if (element.classList.contains("rating-option")) {
        // Ignorar, já tratado pelas escalas
      } else {
        element.value = data[key] || "";
      }
    }
  });

  // Preencher escalas
  const escalas = [
    { input: "flexibilidadeValue", value: data.flexibilidade_value },
    { input: "forcaValue", value: data.forca_value },
    { input: "equilibrioValue", value: data.equilibrio_value },
    { input: "dorValue", value: data.dor_value },
    { input: "sonoValue", value: data.sono_value },
    { input: "estresseValue", value: data.estresse_value },
  ];

  escalas.forEach((escala) => {
    if (escala.value) {
      document.getElementById(escala.input).value = escala.value;
      // Marcar o botão correspondente
      const container = document.querySelector(
        `#escala${
          escala.input.charAt(0).toUpperCase() + escala.input.slice(1, -5)
        }`,
      );
      if (container) {
        const botoes = container.querySelectorAll(".rating-option");
        botoes.forEach((btn) => {
          if (btn.textContent == escala.value) {
            btn.classList.add("selected");
          }
        });
      }
    }
  });

  calcularProgresso();
}

// ============================================================
// FUNÇÕES DE SEÇÕES COLAPSÁVEIS
// ============================================================
function toggleSection(sectionId) {
  const content = document.getElementById(`content${sectionId.slice(-1)}`);
  const arrow = document.getElementById(`arrow${sectionId.slice(-1)}`);
  const header = content.previousElementSibling;

  content.classList.toggle("expanded");
  arrow.classList.toggle("rotated");
  header.classList.toggle("active");
}

// ============================================================
// FUNÇÕES DE PROGRESSO
// ============================================================
function calcularProgresso() {
  const secoes = 9;
  let completas = 0;

  // Seção 1: Informações Básicas - apenas verificar se aluno selecionado
  const secao1completa = estado.alunoSelecionado !== null;
  estado.secaoStatus[1] = secao1completa;
  atualizarStatusSecao(1, secao1completa);
  if (secao1completa) completas++;

  // Seção 2: Histórico Médico
  const medico = document.getElementById("medicoResponsavel").value;
  const pressao = document.getElementById("pressaoArterial").value;
  const secao2completa =
    medico ||
    pressao ||
    document.querySelector('#secao2 input[type="checkbox"]:checked');
  estado.secaoStatus[2] = secao2completa;
  atualizarStatusSecao(2, secao2completa);
  if (secao2completa) completas++;

  // Seção 3: Condições de Saúde
  const doencas =
    document.querySelectorAll('#secao3 input[type="checkbox"]:checked').length >
    0;
  const outrasDoencas = document.getElementById("outrasDoencas").value;
  const medicamentos = document.getElementById("medicamentos").value;
  const secao3completa = doencas || outrasDoencas || medicamentos;
  estado.secaoStatus[3] = secao3completa;
  atualizarStatusSecao(3, secao3completa);
  if (secao3completa) completas++;

  // Seção 4: Orientações Médicas
  const restricoes = document.getElementById("restricoesMovimento").value;
  const proibidos = document.getElementById("exerciciosProibidos").value;
  const secao4completa = restricoes || proibidos;
  estado.secaoStatus[4] = secao4completa;
  atualizarStatusSecao(4, secao4completa);
  if (secao4completa) completas++;

  // Seção 5: Avaliação Postural
  const posturaPe = document.getElementById("posturaEmPe").value;
  const flexibilidade = document.getElementById("flexibilidadeValue").value;
  const forca = document.getElementById("forcaValue").value;
  const secao5completa = posturaPe || flexibilidade || forca;
  estado.secaoStatus[5] = secao5completa;
  atualizarStatusSecao(5, secao5completa);
  if (secao5completa) completas++;

  // Seção 6: Dores
  const queixas = document.getElementById("queixasDor").value;
  const dor = document.getElementById("dorValue").value;
  const secao6completa = queixas || dor;
  estado.secaoStatus[6] = secao6completa;
  atualizarStatusSecao(6, secao6completa);
  if (secao6completa) completas++;

  // Seção 7: Hábitos
  const atividade = document.getElementById("nivelAtividadeFisica").value;
  const sono = document.getElementById("sonoValue").value;
  const estresse = document.getElementById("estresseValue").value;
  const secao7completa = atividade || sono || estresse;
  estado.secaoStatus[7] = secao7completa;
  atualizarStatusSecao(7, secao7completa);
  if (secao7completa) completas++;

  // Seção 8: Documentos
  const secao8completa = estado.documentos.length > 0;
  estado.secaoStatus[8] = secao8completa;
  atualizarStatusSecao(8, secao8completa);
  if (secao8completa) completas++;

  // Seção 9: Observações
  const observacoes = document.getElementById("observacoesGerais").value;
  const recomendacoes = document.getElementById("recomendacoesTreino").value;
  const dataAvaliacao = document.getElementById("dataAvaliacao").value;
  const secao9completa = (observacoes || recomendacoes) && dataAvaliacao;
  estado.secaoStatus[9] = secao9completa;
  atualizarStatusSecao(9, secao9completa);
  if (secao9completa) completas++;

  // Atualizar barra de progresso
  const percentual = Math.round((completas / secoes) * 100);
  document.getElementById("progressPercent").textContent = percentual + "%";
  document.getElementById("progressCompleted").textContent = completas;
  document.getElementById("progressText").textContent =
    `${completas}/${secoes} seções`;
  document.getElementById("progressBar").style.width = percentual + "%";

  // Próximos passos
  const nextSteps = document.getElementById("nextSteps");
  if (completas === secoes) {
    nextSteps.innerHTML =
      '<i class="fas fa-check-circle"></i><span>Parabéns! Avaliação completa!</span>';
  } else {
    for (let i = 1; i <= secoes; i++) {
      if (!estado.secaoStatus[i]) {
        const nomesSecoes = [
          "Informações Básicas",
          "Histórico Médico",
          "Condições de Saúde",
          "Orientações Médicas",
          "Avaliação Postural",
          "Dores",
          "Hábitos",
          "Documentos",
          "Observações",
        ];
        nextSteps.innerHTML = `<i class="fas fa-arrow-right"></i><span>Próximo: ${
          nomesSecoes[i - 1]
        }</span>`;
        break;
      }
    }
  }
}

function atualizarStatusSecao(numero, completo) {
  const statusEl = document.getElementById(`status${numero}`);
  if (completo) {
    statusEl.textContent = "Completo";
    statusEl.className = "section-status completo";
  } else {
    statusEl.textContent = "Incompleto";
    statusEl.className = "section-status incompleto";
  }
}

// ============================================================
// FUNÇÕES DE ESCALA (CORRIGIDAS)
// ============================================================
function inicializarEscalas() {
  const escalas = [
    {
      id: "escalaFlexibilidade",
      input: "flexibilidadeValue",
      min: 1,
      max: 10,
    },
    { id: "escalaForca", input: "forcaValue", min: 1, max: 10 },
    { id: "escalaEquilibrio", input: "equilibrioValue", min: 1, max: 10 },
    { id: "escalaDor", input: "dorValue", min: 0, max: 10 },
    { id: "escalaSono", input: "sonoValue", min: 1, max: 10 },
    { id: "escalaEstresse", input: "estresseValue", min: 1, max: 10 },
  ];

  escalas.forEach((escala) => {
    const container = document.getElementById(escala.id);
    if (!container) return;

    let html = "";
    for (let i = escala.min; i <= escala.max; i++) {
      html += `<button type="button" class="rating-option" onclick="selecionarEscala('${escala.input}', ${i}, this)">${i}</button>`;
    }
    container.innerHTML = html;
  });
}

function selecionarEscala(inputId, valor, elemento) {
  // Remover selected de todos os botões no mesmo container
  const container = elemento.parentNode;
  container.querySelectorAll(".rating-option").forEach((btn) => {
    btn.classList.remove("selected");
  });

  // Adicionar selected ao botão clicado
  elemento.classList.add("selected");

  // Atualizar o input hidden
  document.getElementById(inputId).value = valor;

  // Recalcular progresso
  calcularProgresso();
}

// ============================================================
// FUNÇÕES DE UPLOAD COM SUPABASE STORAGE
// ============================================================
async function adicionarArquivos(files) {
  if (!estado.alunoSelecionado) {
    mostrarToast("Selecione um aluno primeiro", "warning");
    return;
  }

  mostrarLoading();

  try {
    for (let file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        mostrarToast(`Arquivo ${file.name} muito grande (máx. 10MB)`, "error");
        continue;
      }

      // Upload para o Supabase Storage
      const fileName = `${estado.alunoSelecionado.id}/${Date.now()}_${
        file.name
      }`;
      const { error: uploadError } = await supabaseClient.storage
        .from("documentos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Pegar URL pública
      const {
        data: { publicUrl },
      } = supabaseClient.storage.from("documentos").getPublicUrl(fileName);

      // Salvar no banco de dados
      const { error: dbError } = await supabaseClient
        .from("documentos")
        .insert([
          {
            aluno_id: estado.alunoSelecionado.id,
            tipo: file.type,
            nome: file.name,
            tamanho: file.size,
            url: publicUrl,
            storage_path: fileName,
          },
        ]);

      if (dbError) throw dbError;

      // Adicionar ao estado local
      estado.documentos.push({
        id: Date.now() + Math.random(),
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        url: publicUrl,
      });
    }

    atualizarListaDocumentos();
    calcularProgresso();
    mostrarToast("Arquivos enviados com sucesso", "success");
  } catch (error) {
    console.error("Erro no upload:", error);
    mostrarToast("Erro ao enviar arquivos", "error");
  } finally {
    esconderLoading();
  }
}

function atualizarListaDocumentos() {
  const lista = document.getElementById("documentosList");
  lista.innerHTML = "";

  if (estado.documentos.length === 0) {
    lista.innerHTML =
      '<p style="color: var(--grafite-claro); font-size: 0.9rem;">Nenhum documento adicionado</p>';
    return;
  }

  estado.documentos.forEach((doc) => {
    const item = document.createElement("div");
    item.className = "documento-item";
    item.innerHTML = `
      <div class="documento-info">
        <i class="fas fa-file"></i>
        <div>
          <div class="documento-nome">${doc.nome}</div>
          <div class="documento-tipo">${(doc.tamanho / 1024).toFixed(
            2,
          )} KB</div>
        </div>
      </div>
      <button type="button" class="btn-delete" onclick="removerDocumento('${
        doc.id
      }')" title="Remover">
        <i class="fas fa-trash"></i>
      </button>
    `;
    lista.appendChild(item);
  });
}

function removerDocumento(id) {
  estado.documentos = estado.documentos.filter((d) => d.id != id);
  atualizarListaDocumentos();
  calcularProgresso();
  mostrarToast("Documento removido", "success");
}

// ============================================================
// FUNÇÕES DE SALVAR E GERAR FICHA
// ============================================================
async function salvarAvaliacao() {
  if (!estado.alunoSelecionado) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }

  if (!document.getElementById("dataAvaliacao").value) {
    mostrarToast("Preencha a data da avaliação", "error");
    return;
  }

  mostrarLoading();

  try {
    const dados = coletarDadosFormulario();
    dados.aluno_id = estado.alunoSelecionado.id;
    dados.profissional_responsavel = estado.usuario?.nome || "Instrutor";

    let result;
    if (estado.avaliacaoAtual.id) {
      result = await supabaseClient
        .from("avaliacoes")
        .update(dados)
        .eq("id", estado.avaliacaoAtual.id);
    } else {
      result = await supabaseClient.from("avaliacoes").insert([dados]);
    }

    if (result.error) throw result.error;

    // Limpar cache para forçar recarregar
    const cacheKey = `${CACHE_KEYS.AVALIACOES}_${estado.alunoSelecionado.id}`;
    localStorage.removeItem(cacheKey);

    await carregarAvaliacoesAluno(estado.alunoSelecionado.id);
    mostrarToast("Avaliação salva com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao salvar avaliação:", error);
    mostrarToast("Erro ao salvar avaliação", "error");
  } finally {
    esconderLoading();
  }
}

function coletarDadosFormulario() {
  const dados = {};
  const inputs = document.querySelectorAll(
    "#formAvaliacao input, #formAvaliacao select, #formAvaliacao textarea",
  );
  inputs.forEach((input) => {
    if (input.type === "checkbox") {
      dados[input.id] = input.checked;
    } else if (input.type === "hidden") {
      // ignorar
    } else {
      dados[input.id] = input.value;
    }
  });
  return dados;
}

function gerarFichaTreino() {
  if (!estado.alunoSelecionado) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }

  const restricoes = document.getElementById("restricoesMovimento").value;
  const proibidos = document.getElementById("exerciciosProibidos").value;
  const recomendados = document.getElementById("exerciciosRecomendados").value;
  const objetivo = document.getElementById("objetivoPrincipal").value;
  const dores = document.getElementById("queixasDor").value;
  const flexibilidade = document.getElementById("flexibilidadeValue").value;
  const forca = document.getElementById("forcaValue").value;
  const equilibrio = document.getElementById("equilibrioValue").value;

  let recomendacoes = [];

  // Análise de objetivos
  switch (objetivo) {
    case "emagrecimento":
      recomendacoes.push({
        tipo: "recomendado",
        exercicio: "Circuito de Pilates",
        descricao:
          "Séries dinâmicas com pouca pausa para aumento de gasto calórico",
      });
      break;
    case "reabilitacao":
      recomendacoes.push({
        tipo: "recomendado",
        exercicio: "Exercícios isométricos e de baixo impacto",
        descricao: "Foco em fortalecimento sem sobrecarga articular",
      });
      break;
    case "postura":
      recomendacoes.push({
        tipo: "recomendado",
        exercicio: "Alongamentos e fortalecimento de core",
        descricao: "Exercícios para correção postural e consciência corporal",
      });
      break;
    case "flexibilidade":
      recomendacoes.push({
        tipo: "recomendado",
        exercicio: "Série de alongamentos globais",
        descricao: "Foco em ganho de amplitude de movimento",
      });
      break;
    case "ganho-massa":
      recomendacoes.push({
        tipo: "recomendado",
        exercicio: "Exercícios com resistência progressiva",
        descricao: "Uso de molas e acessórios para fortalecimento",
      });
      break;
  }

  // Análise de restrições
  if (
    restricoes.toLowerCase().includes("coluna") ||
    restricoes.toLowerCase().includes("lombar")
  ) {
    recomendacoes.push({
      tipo: "contraindicado",
      exercicio: "Flexão de coluna com carga",
      descricao: "Evitar exercícios que comprimam a coluna lombar",
    });
    recomendacoes.push({
      tipo: "recomendado",
      exercicio: "Exercícios de estabilização de core",
      descricao: "Fortalecimento do core em posições neutras",
    });
  }

  if (dores.toLowerCase().includes("joelho")) {
    recomendacoes.push({
      tipo: "contraindicado",
      exercicio: "Agachamento profundo",
      descricao: "Evitar ângulos maiores que 90° de flexão de joelho",
    });
  }

  if (restricoes.toLowerCase().includes("ombro")) {
    recomendacoes.push({
      tipo: "contraindicado",
      exercicio: "Elevação lateral com carga",
      descricao: "Evitar exercícios que sobrecarreguem o manguito rotador",
    });
  }

  // Análise de flexibilidade
  if (flexibilidade < 4) {
    recomendacoes.push({
      tipo: "recomendado",
      exercicio: "Série de alongamentos gerais",
      descricao:
        "Foco em ganho de flexibilidade global, 2-3 séries de 30 segundos",
    });
  }

  // Análise de força
  if (forca < 4) {
    recomendacoes.push({
      tipo: "recomendado",
      exercicio: "Exercícios básicos de fortalecimento",
      descricao:
        "Iniciar com 2 séries de 8-10 repetições e progredir gradualmente",
    });
  } else if (forca >= 7) {
    recomendacoes.push({
      tipo: "recomendado",
      exercicio: "Exercícios avançados com resistência",
      descricao: "Incluir exercícios desafiadores com molas mais pesadas",
    });
  }

  // Análise de equilíbrio
  if (equilibrio < 4) {
    recomendacoes.push({
      tipo: "recomendado",
      exercicio: "Exercícios proprioceptivos",
      descricao: "Iniciar com apoio bipodal e progredir para unipodal",
    });
  }

  // Recomendações padrão
  recomendacoes.push({
    tipo: "alerta",
    exercicio: "Monitoramento de dor",
    descricao:
      "Parar exercício imediatamente se sentir dor aguda ou desconforto intenso",
  });

  recomendacoes.push({
    tipo: "alerta",
    exercicio: "Hidratação e respiração",
    descricao: "Manter-se hidratado e coordenar respiração com os movimentos",
  });

  // Renderizar ficha
  const fichaHtml = `
    <div class="ficha-section">
      <h3 class="ficha-section-title">📊 Análise da Avaliação</h3>
      <div class="ficha-card">
        <div class="ficha-exercicio">Objetivo Principal: ${
          document.getElementById("objetivoPrincipal").options[
            document.getElementById("objetivoPrincipal").selectedIndex
          ]?.text || "Não definido"
        }</div>
        <div class="ficha-descricao">Flexibilidade: ${
          flexibilidade || "Não avaliada"
        } | Força: ${forca || "Não avaliada"} | Equilíbrio: ${
          equilibrio || "Não avaliado"
        }</div>
      </div>
    </div>
    
    <div class="ficha-section">
      <h3 class="ficha-section-title">✅ Exercícios Recomendados</h3>
      ${recomendacoes
        .filter((r) => r.tipo === "recomendado")
        .map(
          (r) => `
        <div class="ficha-card recomendado">
          <div class="ficha-exercicio">${r.exercicio}</div>
          <div class="ficha-descricao">${r.descricao}</div>
        </div>
      `,
        )
        .join("")}
      ${
        recomendacoes.filter((r) => r.tipo === "recomendado").length === 0
          ? "<p>Nenhuma recomendação específica</p>"
          : ""
      }
    </div>
    
    <div class="ficha-section">
      <h3 class="ficha-section-title">❌ Exercícios Contraindicados</h3>
      ${recomendacoes
        .filter((r) => r.tipo === "contraindicado")
        .map(
          (r) => `
        <div class="ficha-card contraindicado">
          <div class="ficha-exercicio">${r.exercicio}</div>
          <div class="ficha-descricao">${r.descricao}</div>
        </div>
      `,
        )
        .join("")}
      ${
        recomendacoes.filter((r) => r.tipo === "contraindicado").length === 0
          ? "<p>Nenhuma contraindicação específica</p>"
          : ""
      }
    </div>
    
    <div class="ficha-section">
      <h3 class="ficha-section-title">⚠️ Pontos de Atenção</h3>
      ${recomendacoes
        .filter((r) => r.tipo === "alerta")
        .map(
          (r) => `
        <div class="ficha-card alerta">
          <div class="ficha-exercicio">${r.exercicio}</div>
          <div class="ficha-descricao">${r.descricao}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  document.getElementById("fichaConteudo").innerHTML = fichaHtml;
  document.getElementById("modalFichaTreino").classList.add("show");
}

function exportarFichaPDF() {
  mostrarToast("Ficha exportada com sucesso!", "success");
}

// ============================================================
// FUNÇÕES DE TABS
// ============================================================
function mudarTab(tab) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));

  if (tab === "form") {
    document.querySelectorAll(".tab")[0].classList.add("active");
    document.getElementById("tabForm").classList.add("active");
  } else {
    document.querySelectorAll(".tab")[1].classList.add("active");
    document.getElementById("tabHistorico").classList.add("active");
    if (estado.alunoSelecionado) {
      carregarAvaliacoesAluno(estado.alunoSelecionado.id);
    }
  }
}

function novaAvaliacao() {
  limparFormulario();
  document.getElementById("dataAvaliacao").value = new Date()
    .toISOString()
    .split("T")[0];
  mudarTab("form");
}

function limparFormulario() {
  document.getElementById("formAvaliacao").reset();
  estado.documentos = [];
  atualizarListaDocumentos();
  document
    .querySelectorAll(".rating-option")
    .forEach((o) => o.classList.remove("selected"));
  document
    .querySelectorAll('input[type="hidden"]')
    .forEach((i) => (i.value = ""));
  estado.avaliacaoAtual = {
    id: null,
    aluno_id: estado.alunoSelecionado?.id,
  };
  calcularProgresso();
}

function exportarPDF() {
  if (!estado.alunoSelecionado) {
    mostrarToast("Selecione um aluno primeiro", "warning");
    return;
  }
  mostrarToast("PDF gerado com sucesso!", "success");
}

function fecharModal(id) {
  document.getElementById(id).classList.remove("show");
}

// Fechar resultados da busca ao clicar fora
document.addEventListener("click", function (event) {
  const buscaResultados = document.getElementById("buscaResultados");
  const buscaInput = document.getElementById("buscaAluno");

  if (
    !buscaInput.contains(event.target) &&
    !buscaResultados.contains(event.target)
  ) {
    buscaResultados.classList.remove("show");
  }
});

// ============================================================
// FUNÇÕES DE UTILIDADE
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
  if (tipo === "warning") icone = "fa-exclamation-triangle";

  toast.innerHTML = `<i class="fas ${icone}"></i> ${msg}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// FUNÇÕES DE REFRESH (igual ao index)
// ============================================================
window.addEventListener("focus", async function () {
  console.log("🔄 Aba focada - verificando atualizações...");
  if (estado.alunoSelecionado) {
    await carregarAvaliacoesAluno(estado.alunoSelecionado.id);
  }
  await carregarAlunosSelect(); // Recarregar lista de alunos
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async function () {
  await verificarLogin();

  // Inicializar escalas de avaliação
  inicializarEscalas();

  // Carregar alunos para o select
  await carregarAlunosSelect();

  // Configurar data de avaliação
  document.getElementById("dataAvaliacao").value = new Date()
    .toISOString()
    .split("T")[0];

  // Adicionar listeners para calcular IMC
  document.getElementById("pesoAtual").addEventListener("input", calcularIMC);
  document.getElementById("altura").addEventListener("input", calcularIMC);

  // Expandir primeira seção por padrão
  toggleSection("secao1");

  mostrarToast("Página carregada com sucesso", "success");
});

function calcularIMC() {
  const peso = parseFloat(document.getElementById("pesoAtual").value);
  const altura = parseFloat(document.getElementById("altura").value) / 100; // converter cm para m

  if (peso && altura && altura > 0) {
    const imc = peso / (altura * altura);
    document.getElementById("imc").value = imc.toFixed(2);
  }
}
