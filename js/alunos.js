// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================
const SUPABASE_URL = "https://mputdowrhzrvqslslubk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdXRkb3dyaHpydnFzbHNsdWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjY1NDEsImV4cCI6MjA4NDc0MjU0MX0.1TlAIzCd7896EBOeYIYy3B5Czt41l-XcWYboaspEizc";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// ============================================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================================
const CACHE_KEYS = {
  ALUNOS: "cache_alunos_completo",
  ENDERECOS: "cache_enderecos",
  SAUDE: "cache_saude",
  DOCUMENTOS: "cache_documentos",
  EVOLUCAO: "cache_evolucao",
  PLANOS: "cache_planos_alunos",
  MENSALIDADES: "cache_mensalidades_aluno",
  AULAS: "cache_aulas_aluno",
  LAST_UPDATE: "cache_alunos_last_update",
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// ============================================================
// ESTADO GLOBAL
// ============================================================
const estado = {
  usuario: null,
  dados: {
    alunos: { data: [], loading: false, error: null },
    enderecos: { data: {}, loading: false, error: null },
    saude: { data: {}, loading: false, error: null },
    documentos: { data: {}, loading: false, error: null },
    evolucao: { data: {}, loading: false, error: null },
    planos: { data: [], loading: false, error: null },
    mensalidades: { data: {}, loading: false, error: null },
    aulas: { data: {}, loading: false, error: null },
  },
  cache: { enabled: true, lastUpdate: null },
  filtros: {
    busca: "",
    status: "",
    alerta: null,
    plano: "",
    ultimaAula: "",
  },
  alunoAtual: null,
  paginacao: { pagina: 1, itensPorPagina: 10, totalItens: 0 },
  alertas: { atrasados: 0, vencimento: 0, inativos: 0 },
  fotoArquivo: null,
  graficos: {
    evolucao: null,
    financeiro: null,
  },
  alunosSelecionados: new Set(),
  timeoutBusca: null,
};

// ============================================================
// FUNÇÕES DE CACHE
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
    const cacheData = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(cacheData));
    estado.cache.lastUpdate = Date.now();
    localStorage.setItem(
      CACHE_KEYS.LAST_UPDATE,
      JSON.stringify({ timestamp: Date.now() }),
    );
  } catch (error) {
    console.warn("Erro ao salvar cache:", error);
  }
}

function limparCache() {
  Object.values(CACHE_KEYS).forEach((key) => localStorage.removeItem(key));
  estado.cache.lastUpdate = null;
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

function mostrarToast(mensagem, tipo = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  let icone = "fa-info-circle";
  if (tipo === "success") icone = "fa-check-circle";
  if (tipo === "error") icone = "fa-exclamation-circle";
  toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatarData(data) {
  if (!data) return "-";
  try {
    return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function formatarBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return "R$ 0,00";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ============================================================
// MÁSCARAS
// ============================================================
function mascaraCPF(value) {
  if (!value) return "";
  return value
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .substring(0, 14);
}
function mascaraTelefone(value) {
  if (!value) return "";
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .substring(0, 15);
}
function mascaraCEP(value) {
  if (!value) return "";
  return value
    .replace(/\D/g, "")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .substring(0, 9);
}

// ============================================================
// VALIDAÇÕES
// ============================================================
function validarCPF(cpf) {
  if (!cpf) return true;
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let soma = 0,
    resto;
  for (let i = 1; i <= 9; i++)
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  soma = 0;
  for (let i = 1; i <= 10; i++)
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;
  return true;
}
function validarEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validarTelefone(tel) {
  if (!tel) return true;
  const nums = tel.replace(/\D/g, "");
  return nums.length >= 10 && nums.length <= 11;
}

// ============================================================
// CÁLCULOS AUTOMÁTICOS
// ============================================================
function calcularIdade(nascimento) {
  if (!nascimento) return null;
  const hoje = new Date();
  const nasc = new Date(nascimento + "T12:00:00");
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mes = hoje.getMonth() - nasc.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}
function atualizarIdade() {
  const nascimento = document.getElementById("alunoNascimento").value;
  const idadeInput = document.getElementById("alunoIdade");
  if (nascimento) {
    const idade = calcularIdade(nascimento);
    idadeInput.value = idade !== null ? idade + " anos" : "";
  } else idadeInput.value = "";
}

// ============================================================
// BUSCA DE CEP
// ============================================================
async function buscarCEP() {
  const cepInput = document.getElementById("alunoCep");
  let cep = cepInput.value.replace(/\D/g, "");
  if (cep.length !== 8) return;
  mostrarLoading();
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (!data.erro) {
      document.getElementById("alunoEndereco").value = data.logradouro;
      document.getElementById("alunoBairro").value = data.bairro;
      document.getElementById("alunoCidade").value = data.localidade;
      document.getElementById("alunoEstado").value = data.uf;
    } else mostrarToast("CEP não encontrado", "error");
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);
    mostrarToast("Erro ao buscar CEP", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÃO SEGURA PARA QUERIES
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
// VERIFICAÇÃO DE LOGIN E CARREGAMENTO DO USUÁRIO
// ============================================================
async function verificarLogin() {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      const usuarioSalvo = localStorage.getItem("usuario");
      if (usuarioSalvo) {
        estado.usuario = JSON.parse(usuarioSalvo);
        atualizarHeaderUsuario();
        return true;
      }
      return false;
    }
    const { data: usuarioData } = await supabaseClient
      .from("usuarios")
      .select("id, nome, email, role, foto_url")
      .eq("id", user.id)
      .single();
    if (usuarioData) {
      estado.usuario = usuarioData;
      localStorage.setItem("usuario", JSON.stringify(usuarioData));
      atualizarHeaderUsuario();
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erro ao verificar login:", error);
    return false;
  }
}

function atualizarHeaderUsuario() {
  if (!estado.usuario) return;
  document.getElementById("userName").textContent =
    estado.usuario.nome || "Usuário";
  document.getElementById("userRole").textContent =
    estado.usuario.role === "admin"
      ? "Administrador"
      : estado.usuario.role === "instrutor"
        ? "Instrutor"
        : "Financeiro";
  const avatar = document.getElementById("userAvatar");
  if (estado.usuario.foto_url) {
    avatar.innerHTML = `<img src="${estado.usuario.foto_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
  } else {
    const iniciais = (estado.usuario.nome || "U")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    avatar.textContent = iniciais;
  }
}

async function fazerLogout() {
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.error("Erro no logout:", error);
  } finally {
    estado.usuario = null;
    localStorage.removeItem("usuario");
    limparCache();
    window.location.href = "index.html";
  }
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================
async function carregarAlunos(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.ALUNOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.alunos.data = cached;
      return cached;
    }
  }
  estado.dados.alunos.loading = true;
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("alunos")
        .select("*")
        .order("nome", { ascending: true }),
    [],
    "Erro ao carregar alunos",
  );
  estado.dados.alunos.data = data;
  setInCache(cacheKey, data);
  return data;
}

async function carregarEnderecos(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.ENDERECOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.enderecos.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () => supabaseClient.from("enderecos").select("*"),
    [],
    "Erro ao carregar endereços",
  );
  const indexed = (data || []).reduce((acc, item) => {
    acc[String(item.aluno_id)] = item;
    return acc;
  }, {});
  estado.dados.enderecos.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

async function carregarSaude(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.SAUDE;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.saude.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () => supabaseClient.from("saude_alunos").select("*"),
    [],
    "Erro ao carregar dados de saúde",
  );
  const indexed = (data || []).reduce((acc, item) => {
    acc[String(item.aluno_id)] = item;
    return acc;
  }, {});
  estado.dados.saude.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

async function carregarDocumentos(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.DOCUMENTOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.documentos.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("documentos")
        .select("*")
        .order("criado_em", { ascending: false }),
    [],
    "Erro ao carregar documentos",
  );
  const indexed = (data || []).reduce((acc, item) => {
    if (!acc[String(item.aluno_id)]) acc[String(item.aluno_id)] = [];
    acc[String(item.aluno_id)].push(item);
    return acc;
  }, {});
  estado.dados.documentos.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

async function carregarEvolucao(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.EVOLUCAO;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.evolucao.data = cached;
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
  const indexed = (data || []).reduce((acc, item) => {
    if (!acc[String(item.aluno_id)]) acc[String(item.aluno_id)] = [];
    acc[String(item.aluno_id)].push(item);
    return acc;
  }, {});
  estado.dados.evolucao.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

async function carregarPlanos(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.PLANOS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.planos.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient.from("planos_alunos").select("*").eq("status", "ativo"),
    [],
    "Erro ao carregar planos",
  );
  estado.dados.planos.data = data;
  setInCache(cacheKey, data);
  return data;
}

async function carregarMensalidades(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.MENSALIDADES;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.mensalidades.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("mensalidades")
        .select("*")
        .order("data_contratacao", { ascending: false }),
    [],
    "Erro ao carregar mensalidades",
  );
  const indexed = (data || []).reduce((acc, item) => {
    if (!acc[String(item.aluno_id)]) acc[String(item.aluno_id)] = [];
    acc[String(item.aluno_id)].push(item);
    return acc;
  }, {});
  estado.dados.mensalidades.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

async function carregarAulas(forceRefresh = false) {
  const cacheKey = CACHE_KEYS.AULAS;
  if (!forceRefresh && estado.cache.enabled) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      estado.dados.aulas.data = cached;
      return cached;
    }
  }
  const data = await safeQuery(
    () =>
      supabaseClient
        .from("aulas")
        .select("*")
        .order("data", { ascending: false }),
    [],
    "Erro ao carregar aulas",
  );
  const indexed = (data || []).reduce((acc, item) => {
    if (!acc[String(item.aluno_id)]) acc[String(item.aluno_id)] = [];
    acc[String(item.aluno_id)].push(item);
    return acc;
  }, {});
  estado.dados.aulas.data = indexed;
  setInCache(cacheKey, indexed);
  return indexed;
}

// ============================================================
// FUNÇÕES PARA FOTO DE PERFIL
// ============================================================
function removerFoto() {
  estado.fotoArquivo = null;
  document.getElementById("fotoUrl").value = "";
  document.getElementById("fotoPreview").style.display = "none";
  document.getElementById("fotoPlaceholder").style.display = "flex";
  document.getElementById("btnRemoverFoto").style.display = "none";
  document.getElementById("fotoInput").value = "";
}

async function processarFoto(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    mostrarToast("A imagem não pode ter mais de 5MB", "error");
    return;
  }
  mostrarLoading();
  try {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };
    const compressedFile = await imageCompression(file, options);
    estado.fotoArquivo = compressedFile;
    const reader = new FileReader();
    reader.onload = function (e) {
      const preview = document.getElementById("fotoPreview");
      const placeholder = document.getElementById("fotoPlaceholder");
      preview.src = e.target.result;
      preview.style.display = "block";
      placeholder.style.display = "none";
      document.getElementById("btnRemoverFoto").style.display = "inline-flex";
    };
    reader.readAsDataURL(compressedFile);
    mostrarToast("Foto processada com sucesso", "success");
  } catch (error) {
    console.error("Erro ao processar imagem:", error);
    mostrarToast("Erro ao processar a imagem", "error");
  } finally {
    esconderLoading();
  }
}

async function uploadFoto(alunoId) {
  if (!estado.fotoArquivo) return null;
  try {
    const fileName = `fotos_perfil/${alunoId}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabaseClient.storage
      .from("documentos")
      .upload(fileName, estado.fotoArquivo, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const {
      data: { publicUrl },
    } = supabaseClient.storage.from("documentos").getPublicUrl(fileName);
    return publicUrl;
  } catch (error) {
    console.error("Erro ao fazer upload da foto:", error);
    mostrarToast("Erro ao salvar a foto", "error");
    return null;
  }
}

// ============================================================
// FUNÇÕES PARA FINANCEIRO, PLANOS E AULAS
// ============================================================
async function carregarStatusFinanceiro(alunoId) {
  try {
    const { data, error } = await supabaseClient
      .from("parcelas")
      .select("status, valor")
      .eq("aluno_id", alunoId);
    if (error) throw error;
    let temAtrasado = false,
      temPendente = false;
    (data || []).forEach((p) => {
      if (p.status === "atrasado") temAtrasado = true;
      else if (p.status === "pendente") temPendente = true;
    });
    if (temAtrasado) return "atrasado";
    if (temPendente) return "pendente";
    return "em-dia";
  } catch (error) {
    console.error("Erro ao carregar financeiro:", error);
    return "erro";
  }
}

async function carregarUltimaAula(alunoId) {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const { data, error } = await supabaseClient
      .from("aulas")
      .select("data")
      .eq("aluno_id", alunoId)
      .lt("data", hoje)
      .order("data", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0].data : null;
  } catch (error) {
    console.error("Erro ao carregar última aula:", error);
    return null;
  }
}

async function carregarProximaAula(alunoId) {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const { data, error } = await supabaseClient
      .from("aulas")
      .select("data")
      .eq("aluno_id", alunoId)
      .gte("data", hoje)
      .order("data", { ascending: true })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0].data : null;
  } catch (error) {
    console.error("Erro ao carregar próxima aula:", error);
    return null;
  }
}

// ============================================================
// FUNÇÃO PARA CONTAR PLANOS A VENCER (ESTE MÊS)
// ============================================================
function contarPlanosAVencer() {
  const hoje = new Date();
  const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  fimDoMes.setHours(23, 59, 59, 999);
  const planos = estado.dados.planos.data || [];
  return planos.filter((plano) => {
    if (plano.status !== "ativo") return false;
    const tipo = plano.tipo_plano;
    if (tipo === "sessoes") {
      const restantes =
        (plano.total_sessoes || 0) - (plano.sessoes_realizadas || 0);
      return restantes <= 4;
    }
    if (tipo === "periodo" && plano.data_fim) {
      const dataFim = new Date(plano.data_fim + "T12:00:00");
      return dataFim >= hoje && dataFim <= fimDoMes;
    }
    if (tipo === "continuo" && plano.data_proxima_renovacao) {
      const dataRenov = new Date(plano.data_proxima_renovacao + "T12:00:00");
      return dataRenov >= hoje && dataRenov <= fimDoMes;
    }
    return false;
  }).length;
}

// ============================================================
// EXIBIÇÃO DA TABELA COM PAGINAÇÃO E FILTROS AVANÇADOS
// ============================================================
async function exibirTabelaAlunos() {
  const alunos = estado.dados.alunos.data || [];
  const documentos = estado.dados.documentos.data || {};
  const planosAtivos = estado.dados.planos.data || [];

  // Identificar alunos com plano a vencer (para destacar visualmente)
  const idsPlanosAVencer = new Set();
  const hoje = new Date();
  const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  planosAtivos.forEach((p) => {
    if (p.status !== "ativo") return;
    let vence = false;
    if (
      p.tipo_plano === "sessoes" &&
      (p.total_sessoes || 0) - (p.sessoes_realizadas || 0) <= 4
    )
      vence = true;
    else if (
      p.tipo_plano === "periodo" &&
      p.data_fim &&
      new Date(p.data_fim) <= fimDoMes
    )
      vence = true;
    else if (
      p.tipo_plano === "continuo" &&
      p.data_proxima_renovacao &&
      new Date(p.data_proxima_renovacao) <= fimDoMes
    )
      vence = true;
    if (vence) idsPlanosAVencer.add(String(p.aluno_id));
  });

  let alunosFiltrados = alunos
    .filter((aluno) => {
      const busca = estado.filtros.busca.trim().toLowerCase();
      if (busca) {
        const nomeMatch =
          aluno.nome && aluno.nome.toLowerCase().includes(busca);
        const buscaNumerica = busca.replace(/\D/g, "");
        let cpfMatch = false,
          telMatch = false;
        if (buscaNumerica.length > 0) {
          const cpfLimpo = aluno.cpf ? aluno.cpf.replace(/\D/g, "") : "";
          const telLimpo = aluno.telefone
            ? aluno.telefone.replace(/\D/g, "")
            : "";
          cpfMatch = cpfLimpo.includes(buscaNumerica);
          telMatch = telLimpo.includes(buscaNumerica);
        }
        return nomeMatch || cpfMatch || telMatch;
      }
      return true;
    })
    .filter((aluno) => {
      if (!estado.filtros.status) return true;
      return estado.filtros.status === "ativo" ? aluno.ativo : !aluno.ativo;
    });

  // Filtro por plano (real)
  if (estado.filtros.plano) {
    const alunosComPlano = planosAtivos
      .filter((p) => p.plano === estado.filtros.plano && p.status === "ativo")
      .map((p) => String(p.aluno_id));
    alunosFiltrados = alunosFiltrados.filter((a) =>
      alunosComPlano.includes(String(a.id)),
    );
  }

  // Filtro por última aula (real)
  if (estado.filtros.ultimaAula) {
    const hojeStr = hoje.toISOString().split("T")[0];
    const limite7 = new Date();
    limite7.setDate(hoje.getDate() - 7);
    const limite30 = new Date();
    limite30.setDate(hoje.getDate() - 30);
    const alunosComUltimaAula = await Promise.all(
      alunosFiltrados.map(async (aluno) => {
        const ultimaAula = await carregarUltimaAula(aluno.id);
        if (!ultimaAula) return { aluno, incluir: false };
        const dataUltima = new Date(ultimaAula);
        if (estado.filtros.ultimaAula === "hoje") {
          return {
            aluno,
            incluir: dataUltima.toISOString().split("T")[0] === hojeStr,
          };
        } else if (estado.filtros.ultimaAula === "ultimos7") {
          return { aluno, incluir: dataUltima >= limite7 };
        } else if (estado.filtros.ultimaAula === "ultimos30") {
          return { aluno, incluir: dataUltima >= limite30 };
        } else if (estado.filtros.ultimaAula === "mais30") {
          return { aluno, incluir: dataUltima < limite30 };
        }
        return { aluno, incluir: true };
      }),
    );
    alunosFiltrados = alunosComUltimaAula
      .filter((r) => r.incluir)
      .map((r) => r.aluno);
  }

  // Aplicar filtro de alerta se existir
  if (estado.filtros.alerta) {
    if (
      typeof estado.filtros.alerta === "object" &&
      estado.filtros.alerta.tipo === "ids"
    ) {
      const idsSet = new Set(estado.filtros.alerta.ids.map((id) => String(id)));
      alunosFiltrados = alunosFiltrados.filter((aluno) =>
        idsSet.has(String(aluno.id)),
      );
    } else {
      const promessas = alunosFiltrados.map(async (aluno) => {
        const [statusFinanceiro, ultimaAula] = await Promise.all([
          carregarStatusFinanceiro(aluno.id),
          carregarUltimaAula(aluno.id),
        ]);
        let incluir = false;
        if (estado.filtros.alerta === "atrasado")
          incluir = statusFinanceiro === "atrasado";
        else if (estado.filtros.alerta === "inativos") {
          if (ultimaAula) {
            const dias = Math.ceil(
              (new Date() - new Date(ultimaAula)) / (1000 * 60 * 60 * 24),
            );
            incluir = dias >= 30;
          }
        } else if (estado.filtros.alerta === "proximo-vencimento") {
          incluir = idsPlanosAVencer.has(String(aluno.id));
        }
        return { aluno, incluir };
      });
      const resultados = await Promise.all(promessas);
      alunosFiltrados = resultados.filter((r) => r.incluir).map((r) => r.aluno);
    }
    estado.filtros.alerta = null;
  }

  estado.paginacao.totalItens = alunosFiltrados.length;
  const inicio =
    (estado.paginacao.pagina - 1) * estado.paginacao.itensPorPagina;
  const fim = inicio + estado.paginacao.itensPorPagina;
  const alunosPaginados = alunosFiltrados.slice(inicio, fim);

  const tbody = document.getElementById("tbodyAlunos");
  if (!tbody) return;

  if (alunosPaginados.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align:center; padding:2rem;">Nenhum aluno encontrado</td></tr>';
    document.getElementById("resultadosEncontrados").textContent =
      "0 resultados";
    renderizarPaginacao();
    return;
  }

  const linhas = await Promise.all(
    alunosPaginados.map(async (aluno) => {
      try {
        const [statusFinanceiro, ultimaAula, proximaAula] = await Promise.all([
          carregarStatusFinanceiro(aluno.id),
          carregarUltimaAula(aluno.id),
          carregarProximaAula(aluno.id),
        ]);
        let iconeFinanceiro =
          '<i class="fa-regular fa-circle-check" style="color: var(--verde-sucesso);" title="Em dia"></i>';
        if (statusFinanceiro === "pendente")
          iconeFinanceiro =
            '<i class="fa-regular fa-clock" style="color: var(--laranja-atencao);" title="Pendente"></i>';
        else if (statusFinanceiro === "atrasado")
          iconeFinanceiro =
            '<i class="fa-regular fa-circle-xmark" style="color: var(--vermelho-urgente);" title="Atrasado"></i>';

        const ultimaAulaStr = ultimaAula ? formatarData(ultimaAula) : "-";
        const proximaAulaStr = proximaAula ? formatarData(proximaAula) : "-";
        const docs = documentos[String(aluno.id)] || [];
        const qtdDocs = docs.length;

        let fotoHtml = "";
        if (aluno.foto_url) {
          fotoHtml = `<img src="${aluno.foto_url}" class="foto-mini" alt="foto" />`;
        } else {
          const iniciais = aluno.nome
            ? aluno.nome
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()
            : "?";
          fotoHtml = `<div class="foto-placeholder">${iniciais}</div>`;
        }

        const isAtrasado = statusFinanceiro === "atrasado";
        const isVencendo = idsPlanosAVencer.has(String(aluno.id));
        let rowClass = "";
        if (isAtrasado) rowClass = "linha-atrasada";
        else if (isVencendo) rowClass = "linha-vencendo";

        const checked = estado.alunosSelecionados.has(String(aluno.id))
          ? "checked"
          : "";

        return `
          <tr class="${rowClass}" data-id="${aluno.id}">
            <td><input type="checkbox" class="selecionar-aluno" data-id="${aluno.id}" ${checked} onchange="toggleSelecionarAluno('${aluno.id}')" /></td>
            <td>${fotoHtml}</td>
            <td><strong>${aluno.nome || "Sem nome"}</strong><br><small>${aluno.telefone ? mascaraTelefone(aluno.telefone) : "-"}</small></td>
            <td><span class="badge ${aluno.ativo ? "ativo" : "inativo"}">${aluno.ativo ? "Ativo" : "Inativo"}</span></td>
            <td><span class="status-indicator">${iconeFinanceiro}</span></td>
            <td>${qtdDocs} docs</td>
            <td>${ultimaAulaStr}</td>
            <td>${proximaAulaStr}</td>
            <td>
              <div class="action-buttons">
                <button class="action-btn visualizar" onclick="visualizarDossie('${aluno.id}')" title="Visualizar dossiê"><i class="fas fa-eye"></i></button>
                <button class="action-btn editar" onclick="abrirModalAluno('${aluno.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="action-btn avaliacao" onclick="abrirModalAvaliacao('${aluno.id}')" title="Avaliação Detalhada"><i class="fas fa-stethoscope"></i></button>
                <button class="action-btn agenda" onclick="abrirModalAgenda('${aluno.id}')" title="Agenda do Aluno"><i class="fas fa-calendar-alt"></i></button>
                <button class="action-btn financeiro" onclick="abrirModalFinanceiro('${aluno.id}')" title="Financeiro"><i class="fas fa-dollar-sign"></i></button>
                <button class="action-btn lembrete" onclick="enviarLembreteIndividual('${aluno.id}', '${aluno.nome.replace(/'/g, "\\'")}')" title="Enviar lembrete de pagamento"><i class="fas fa-bell"></i></button>
                ${aluno.ativo ? `<button class="action-btn desativar" onclick="toggleStatusAluno('${aluno.id}', ${aluno.ativo})" title="Desativar"><i class="fas fa-user-slash"></i></button>` : `<button class="action-btn ativar" onclick="toggleStatusAluno('${aluno.id}', ${aluno.ativo})" title="Reativar"><i class="fas fa-user-check"></i></button>`}
              </div>
            </td>
          </tr>
        `;
      } catch (e) {
        console.error("Erro ao gerar linha para aluno", aluno.id, e);
        return '<tr><td colspan="9">Erro ao carregar dados do aluno</td></tr>';
      }
    }),
  );

  tbody.innerHTML = linhas.join("");
  document.getElementById("resultadosEncontrados").textContent =
    `${alunosFiltrados.length} resultados`;
  document.getElementById("totalAlunos").textContent =
    `${alunos.length} alunos cadastrados`;
  renderizarPaginacao();
  await atualizarCardsAlerta();
}

// ============================================================
// CARDS DE ALERTA
// ============================================================
async function atualizarCardsAlerta() {
  const alunos = estado.dados.alunos.data || [];
  let atrasados = 0,
    inativos30 = 0;
  const promessas = alunos.map(async (aluno) => {
    const [statusFinanceiro, ultimaAula] = await Promise.all([
      carregarStatusFinanceiro(aluno.id),
      carregarUltimaAula(aluno.id),
    ]);
    if (statusFinanceiro === "atrasado") atrasados++;
    if (ultimaAula) {
      const dias = Math.ceil(
        (new Date() - new Date(ultimaAula)) / (1000 * 60 * 60 * 24),
      );
      if (dias >= 30) inativos30++;
    }
  });
  await Promise.all(promessas);
  document.getElementById("cardAtrasados").textContent = atrasados;
  const aVencer = contarPlanosAVencer();
  document.getElementById("cardVencimento").textContent = aVencer;
  document.getElementById("cardInativos").textContent = inativos30;
}

async function filtrarPorAlerta(tipo) {
  if (tipo === "proximo-vencimento") {
    const hoje = new Date();
    const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    fimDoMes.setHours(23, 59, 59, 999);
    const planos = estado.dados.planos.data || [];
    const alunosIds = new Set();
    planos.forEach((plano) => {
      if (plano.status !== "ativo") return;
      if (plano.tipo_plano === "sessoes") {
        const restantes =
          (plano.total_sessoes || 0) - (plano.sessoes_realizadas || 0);
        if (restantes <= 4) alunosIds.add(String(plano.aluno_id));
        return;
      }
      if (plano.tipo_plano === "periodo" && plano.data_fim) {
        const dataFim = new Date(plano.data_fim + "T12:00:00");
        if (dataFim >= hoje && dataFim <= fimDoMes)
          alunosIds.add(String(plano.aluno_id));
      }
      if (plano.tipo_plano === "continuo" && plano.data_proxima_renovacao) {
        const dataRenov = new Date(plano.data_proxima_renovacao + "T12:00:00");
        if (dataRenov >= hoje && dataRenov <= fimDoMes)
          alunosIds.add(String(plano.aluno_id));
      }
    });
    estado.filtros.alerta = { tipo: "ids", ids: Array.from(alunosIds) };
    estado.paginacao.pagina = 1;
    exibirTabelaAlunos();
    return;
  }
  estado.filtros.alerta = tipo;
  estado.paginacao.pagina = 1;
  exibirTabelaAlunos();
}

// ============================================================
// PAGINAÇÃO
// ============================================================
function renderizarPaginacao() {
  const totalPaginas = Math.ceil(
    estado.paginacao.totalItens / estado.paginacao.itensPorPagina,
  );
  const paginacaoDiv = document.getElementById("paginacao");
  if (totalPaginas <= 1) {
    paginacaoDiv.innerHTML = "";
    return;
  }
  let html =
    '<button onclick="mudarPagina(1)" ' +
    (estado.paginacao.pagina === 1 ? "disabled" : "") +
    '><i class="fas fa-angle-double-left"></i></button>';
  html +=
    '<button onclick="mudarPagina(' +
    (estado.paginacao.pagina - 1) +
    ')" ' +
    (estado.paginacao.pagina === 1 ? "disabled" : "") +
    '><i class="fas fa-angle-left"></i></button>';
  let inicio = Math.max(1, estado.paginacao.pagina - 2);
  let fim = Math.min(totalPaginas, estado.paginacao.pagina + 2);
  for (let i = inicio; i <= fim; i++) {
    html += `<button onclick="mudarPagina(${i})" class="${i === estado.paginacao.pagina ? "active" : ""}">${i}</button>`;
  }
  html +=
    '<button onclick="mudarPagina(' +
    (estado.paginacao.pagina + 1) +
    ')" ' +
    (estado.paginacao.pagina === totalPaginas ? "disabled" : "") +
    '><i class="fas fa-angle-right"></i></button>';
  html +=
    '<button onclick="mudarPagina(' +
    totalPaginas +
    ')" ' +
    (estado.paginacao.pagina === totalPaginas ? "disabled" : "") +
    '><i class="fas fa-angle-double-right"></i></button>';
  paginacaoDiv.innerHTML = html;
}

function mudarPagina(novaPagina) {
  const totalPaginas = Math.ceil(
    estado.paginacao.totalItens / estado.paginacao.itensPorPagina,
  );
  if (novaPagina < 1 || novaPagina > totalPaginas) return;
  estado.paginacao.pagina = novaPagina;
  exibirTabelaAlunos();
}

// ============================================================
// FILTROS
// ============================================================
function filtrarAlunos() {
  estado.filtros.busca = document.getElementById("searchInput").value;
  estado.filtros.status = document.getElementById("filtroStatus").value;
  estado.filtros.plano = document.getElementById("filtroPlano").value;
  estado.filtros.ultimaAula = document.getElementById("filtroUltimaAula").value;
  estado.paginacao.pagina = 1;
  exibirTabelaAlunos();
}

function limparFiltros() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filtroStatus").value = "";
  document.getElementById("filtroPlano").value = "";
  document.getElementById("filtroUltimaAula").value = "";
  estado.filtros = {
    busca: "",
    status: "",
    alerta: null,
    plano: "",
    ultimaAula: "",
  };
  estado.paginacao.pagina = 1;
  exibirTabelaAlunos();
}

function buscarAlunosDebounce() {
  if (estado.timeoutBusca) clearTimeout(estado.timeoutBusca);
  estado.timeoutBusca = setTimeout(() => {
    filtrarAlunos();
  }, 300);
}

// ============================================================
// SELEÇÃO EM MASSA
// ============================================================
function toggleSelecionarTodos() {
  const chk = document.getElementById("selecionarTodos");
  const checkboxes = document.querySelectorAll(".selecionar-aluno");
  checkboxes.forEach((cb) => {
    cb.checked = chk.checked;
    if (chk.checked) estado.alunosSelecionados.add(cb.dataset.id);
    else estado.alunosSelecionados.delete(cb.dataset.id);
  });
}

function toggleSelecionarAluno(id) {
  const cb = document.querySelector(`.selecionar-aluno[data-id="${id}"]`);
  if (cb.checked) estado.alunosSelecionados.add(id);
  else estado.alunosSelecionados.delete(id);
  document.getElementById("selecionarTodos").checked =
    document.querySelectorAll(".selecionar-aluno:checked").length ===
    document.querySelectorAll(".selecionar-aluno").length;
}

// ============================================================
// EXPORTAÇÃO (PDF e Excel)
// ============================================================
async function obterDadosFiltradosParaExportacao() {
  const alunos = estado.dados.alunos.data || [];
  const planosAtivos = estado.dados.planos.data || [];
  const planoMap = planosAtivos.reduce((acc, p) => {
    if (p.status === "ativo") acc[p.aluno_id] = p.plano;
    return acc;
  }, {});
  const filtrados = alunos
    .filter((a) => {
      const busca = estado.filtros.busca.toLowerCase();
      if (busca) {
        const nomeMatch = a.nome && a.nome.toLowerCase().includes(busca);
        const buscaNum = busca.replace(/\D/g, "");
        const cpfMatch = a.cpf && a.cpf.replace(/\D/g, "").includes(buscaNum);
        const telMatch =
          a.telefone && a.telefone.replace(/\D/g, "").includes(buscaNum);
        return nomeMatch || cpfMatch || telMatch;
      }
      return true;
    })
    .filter(
      (a) =>
        !estado.filtros.status ||
        (estado.filtros.status === "ativo" ? a.ativo : !a.ativo),
    );
  const res = await Promise.all(
    filtrados.map(async (a) => ({
      id: a.id,
      nome: a.nome,
      cpf: a.cpf,
      telefone: a.telefone,
      email: a.email,
      status: a.ativo ? "Ativo" : "Inativo",
      plano: planoMap[a.id] || "",
      ultimaAula: (await carregarUltimaAula(a.id)) || "",
      proximaAula: (await carregarProximaAula(a.id)) || "",
    })),
  );
  return res;
}

async function exportarListaPDF() {
  mostrarLoading();
  try {
    const dados = await obterDadosFiltradosParaExportacao();
    if (dados.length === 0) {
      mostrarToast("Nenhum dado para exportar", "error");
      esconderLoading();
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Título
    doc.setFontSize(18);
    doc.text("Relatório de Alunos", 14, 22);
    doc.setFontSize(10);
    const hoje = new Date();
    doc.text(`Gerado em: ${hoje.toLocaleString("pt-BR")}`, 14, 30);
    let filtrosTexto = "Filtros aplicados: ";
    if (estado.filtros.busca)
      filtrosTexto += `Busca: "${estado.filtros.busca}" `;
    if (estado.filtros.status)
      filtrosTexto += `Status: ${estado.filtros.status} `;
    if (estado.filtros.plano) filtrosTexto += `Plano: ${estado.filtros.plano} `;
    if (estado.filtros.ultimaAula)
      filtrosTexto += `Última aula: ${estado.filtros.ultimaAula}`;
    doc.text(filtrosTexto, 14, 36);

    // Corpo da tabela
    const headers = [
      [
        "ID",
        "Nome",
        "CPF",
        "Telefone",
        "E-mail",
        "Status",
        "Plano",
        "Última Aula",
        "Próxima Aula",
      ],
    ];
    const body = dados.map((d) => [
      d.id,
      d.nome,
      d.cpf || "",
      d.telefone || "",
      d.email || "",
      d.status,
      d.plano,
      d.ultimaAula,
      d.proximaAula,
    ]);

    doc.autoTable({
      startY: 42,
      head: headers,
      body: body,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [58, 107, 92], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 40 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 45 },
        5: { cellWidth: 20 },
        6: { cellWidth: 25 },
        7: { cellWidth: 25 },
        8: { cellWidth: 25 },
      },
      margin: { left: 10, right: 10 },
    });

    doc.save(`alunos_${new Date().toISOString().split("T")[0]}.pdf`);
    mostrarToast("PDF exportado com sucesso!", "success");
  } catch (e) {
    console.error(e);
    mostrarToast("Erro ao exportar PDF", "error");
  } finally {
    esconderLoading();
  }
}

async function exportarListaExcel() {
  mostrarLoading();
  try {
    const dados = await obterDadosFiltradosParaExportacao();
    const cabecalho = [
      "ID",
      "Nome",
      "CPF",
      "Telefone",
      "Email",
      "Status",
      "Plano",
      "Última Aula",
      "Próxima Aula",
    ];
    const wsData = [
      cabecalho,
      ...dados.map((d) => [
        d.id,
        d.nome,
        d.cpf,
        d.telefone,
        d.email,
        d.status,
        d.plano,
        d.ultimaAula,
        d.proximaAula,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alunos");
    XLSX.writeFile(wb, `alunos_${new Date().toISOString().split("T")[0]}.xlsx`);
    mostrarToast("Excel exportado com sucesso!", "success");
  } catch (e) {
    console.error(e);
    mostrarToast("Erro ao exportar Excel", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// ENVIO DE LEMBRETES
// ============================================================
async function enviarLembreteIndividual(alunoId, alunoNome) {
  await enviarLembreteParaAlunos([alunoId]);
}

async function enviarLembreteSelecionados() {
  const ids = Array.from(estado.alunosSelecionados);
  if (ids.length === 0) {
    mostrarToast("Selecione pelo menos um aluno", "error");
    return;
  }
  await enviarLembreteParaAlunos(ids);
}

async function enviarLembreteParaAlunos(alunosIds) {
  mostrarLoading();
  try {
    for (const id of alunosIds) {
      await supabaseClient.from("notificacoes").insert({
        aluno_id: parseInt(id),
        tipo: "lembrete",
        titulo: "📢 Lembrete de Pagamento",
        mensagem: "Sua mensalidade está pendente. Regularize sua situação.",
        lida: false,
      });
    }
    mostrarToast(
      `Lembrete enviado para ${alunosIds.length} aluno(s)!`,
      "success",
    );
  } catch (error) {
    console.error("Erro ao enviar lembretes:", error);
    mostrarToast("Erro ao enviar lembretes", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// FUNÇÕES DO MODAL/CRUD (com campos bloqueados)
// ============================================================
async function verificarCpfExistente(cpf, idIgnorar = null) {
  if (!cpf) return false;
  let query = supabaseClient.from("alunos").select("id").eq("cpf", cpf);
  if (idIgnorar) query = query.neq("id", idIgnorar);
  const { data, error } = await query;
  if (error) {
    console.error("Erro ao verificar CPF:", error);
    return false;
  }
  return data && data.length > 0;
}

function liberarEdicaoDadosPessoais() {
  document.getElementById("alunoNome").removeAttribute("readonly");
  document.getElementById("alunoCpf").removeAttribute("readonly");
  document.getElementById("alunoNascimento").removeAttribute("readonly");
  document.getElementById("btnEscolherFoto").disabled = false;
  document
    .querySelectorAll(".readonly-indicator")
    .forEach((el) => (el.style.display = "none"));
  mostrarToast("Edição de dados pessoais liberada temporariamente", "info");
}

function abrirModalAluno(id = null) {
  document.getElementById("formAluno").reset();
  document.getElementById("alunoId").value = "";
  document.getElementById("fotoUrl").value = "";
  removerFoto();
  estado.alunoAtual = id ? String(id) : null;
  estado.fotoArquivo = null;
  const firstTab = document.querySelector(".tab");
  if (firstTab) mudarTab("dados", { target: firstTab });
  const listaDocs = document.getElementById("listaDocumentos");
  const listaEvos = document.getElementById("listaEvolucoesTimeline");
  if (listaDocs) listaDocs.innerHTML = "";
  if (listaEvos) listaEvos.innerHTML = "";

  document.getElementById("quickAccessBar").style.display = "none";
  document
    .querySelectorAll(".readonly-indicator")
    .forEach((el) => (el.style.display = "none"));
  document.getElementById("alunoNome").removeAttribute("readonly");
  document.getElementById("alunoCpf").removeAttribute("readonly");
  document.getElementById("alunoNascimento").removeAttribute("readonly");
  document.getElementById("btnEscolherFoto").disabled = false;
  document.getElementById("btnLiberarEdicao").style.display = "none";

  if (id) {
    const alunoIdStr = String(id);
    const aluno = estado.dados.alunos.data.find(
      (a) => String(a.id) === alunoIdStr,
    );
    if (aluno) {
      document.getElementById("alunoId").value = aluno.id;
      document.getElementById("alunoNome").value = aluno.nome || "";
      document.getElementById("alunoCpf").value = aluno.cpf || "";
      document.getElementById("alunoRg").value = aluno.rg || "";
      document.getElementById("alunoOrgaoEmissor").value =
        aluno.orgao_emissor || "";
      document.getElementById("alunoDataExpedicao").value =
        aluno.data_expedicao || "";
      document.getElementById("alunoNascimento").value = aluno.nascimento || "";
      atualizarIdade();
      document.getElementById("alunoSexo").value = aluno.sexo || "F";
      document.getElementById("alunoEstadoCivil").value =
        aluno.estado_civil || "";
      document.getElementById("alunoProfissao").value = aluno.profissao || "";
      document.getElementById("alunoTelefone").value = aluno.telefone || "";
      document.getElementById("alunoTelefone2").value = aluno.telefone2 || "";
      document.getElementById("alunoEmail").value = aluno.email || "";
      document.getElementById("fotoUrl").value = aluno.foto_url || "";
      if (aluno.foto_url) {
        document.getElementById("fotoPreview").src = aluno.foto_url;
        document.getElementById("fotoPreview").style.display = "block";
        document.getElementById("fotoPlaceholder").style.display = "none";
        document.getElementById("btnRemoverFoto").style.display = "inline-flex";
      }

      const end = estado.dados.enderecos.data[alunoIdStr];
      if (end) {
        document.getElementById("alunoCep").value = end.cep || "";
        document.getElementById("alunoEndereco").value = end.endereco || "";
        document.getElementById("alunoNumero").value = end.numero || "";
        document.getElementById("alunoComplemento").value =
          end.complemento || "";
        document.getElementById("alunoBairro").value = end.bairro || "";
        document.getElementById("alunoCidade").value = end.cidade || "";
        document.getElementById("alunoEstado").value = end.estado || "";
      }

      const sau = estado.dados.saude.data[alunoIdStr];
      if (sau) {
        document.getElementById("alunoTipoSanguineo").value =
          sau.tipo_sanguineo || "";
        document.getElementById("alunoPlanoSaude").value =
          sau.plano_saude || "";
        document.getElementById("alunoNumeroCarteirinha").value =
          sau.numero_carteirinha || "";
        document.getElementById("alunoAlergias").value = sau.alergias || "";
        document.getElementById("alunoMedicamentos").value =
          sau.medicamentos || "";
        document.getElementById("alunoCirurgias").value = sau.cirurgias || "";
        document.getElementById("alunoCondicoesCronicas").value =
          sau.condicoes_cronicas || "";
        document.getElementById("alunoMedicoResponsavel").value =
          sau.medico_responsavel || "";
        document.getElementById("alunoContatoEmergencia").value =
          sau.contato_emergencia || "";
      }

      atualizarListaDocumentos(alunoIdStr);
      atualizarListaEvolucoesTimeline(alunoIdStr);
      atualizarGraficoEvolucao(alunoIdStr);

      document.getElementById("alunoNome").setAttribute("readonly", true);
      document.getElementById("alunoCpf").setAttribute("readonly", true);
      document.getElementById("alunoNascimento").setAttribute("readonly", true);
      document.getElementById("btnEscolherFoto").disabled = true;
      document
        .querySelectorAll(".readonly-indicator")
        .forEach((el) => (el.style.display = "inline-flex"));

      document.getElementById("quickAccessBar").style.display = "flex";
      document.getElementById("btnLiberarEdicao").style.display =
        "inline-block";
    }
    document.getElementById("modalAlunoTitle").textContent =
      "Editar Dossiê do Aluno";
  } else {
    document.getElementById("modalAlunoTitle").textContent =
      "Novo Aluno - Dossiê Completo";
    const hoje = new Date().toISOString().split("T")[0];
    document.getElementById("evolucaoData").value = hoje;
  }
  document.getElementById("modalAluno").classList.add("show");
}

async function salvarAluno() {
  const nome = document.getElementById("alunoNome").value.trim();
  const telefone = document.getElementById("alunoTelefone").value.trim();
  const nascimento = document.getElementById("alunoNascimento").value;
  if (!nome) {
    mostrarToast("Nome é obrigatório", "error");
    document.getElementById("alunoNome").focus();
    return;
  }
  if (!telefone) {
    mostrarToast("Telefone é obrigatório", "error");
    document.getElementById("alunoTelefone").focus();
    return;
  }
  if (!validarTelefone(telefone)) {
    mostrarToast("Telefone inválido", "error");
    document.getElementById("alunoTelefone").focus();
    return;
  }
  if (!nascimento) {
    mostrarToast("Data de nascimento é obrigatória", "error");
    document.getElementById("alunoNascimento").focus();
    return;
  }
  const cpf = document.getElementById("alunoCpf").value;
  if (cpf && !validarCPF(cpf)) {
    mostrarToast("CPF inválido", "error");
    document.getElementById("alunoCpf").focus();
    return;
  }
  const email = document.getElementById("alunoEmail").value;
  if (email && !validarEmail(email)) {
    mostrarToast("E-mail inválido", "error");
    document.getElementById("alunoEmail").focus();
    return;
  }
  const id = document.getElementById("alunoId").value;
  if (cpf) {
    const cpfExistente = await verificarCpfExistente(cpf, id || null);
    if (cpfExistente) {
      mostrarToast("CPF já cadastrado para outro aluno", "error");
      document.getElementById("alunoCpf").focus();
      return;
    }
  }
  mostrarLoading();
  try {
    let fotoUrl = document.getElementById("fotoUrl").value;
    if (estado.fotoArquivo) {
      const novaFotoUrl = await uploadFoto(id || "temp");
      if (novaFotoUrl) fotoUrl = novaFotoUrl;
    }
    const alunoData = {
      nome,
      cpf: cpf || null,
      rg: document.getElementById("alunoRg").value || null,
      orgao_emissor: document.getElementById("alunoOrgaoEmissor").value || null,
      data_expedicao:
        document.getElementById("alunoDataExpedicao").value || null,
      nascimento,
      sexo: document.getElementById("alunoSexo").value,
      estado_civil: document.getElementById("alunoEstadoCivil").value || null,
      profissao: document.getElementById("alunoProfissao").value || null,
      telefone,
      telefone2: document.getElementById("alunoTelefone2").value || null,
      email: document.getElementById("alunoEmail").value || null,
      foto_url: fotoUrl || null,
      ativo: true,
    };
    let alunoId = id;
    if (id) {
      const { error } = await supabaseClient
        .from("alunos")
        .update(alunoData)
        .eq("id", id);
      if (error) {
        if (error.code === "23505") mostrarToast("CPF já cadastrado", "error");
        else throw error;
        return;
      }
    } else {
      const { data, error } = await supabaseClient
        .from("alunos")
        .insert([alunoData])
        .select();
      if (error) {
        if (error.code === "23505") mostrarToast("CPF já cadastrado", "error");
        else throw error;
        return;
      }
      alunoId = data[0].id;
      document.getElementById("alunoId").value = alunoId;
      if (estado.fotoArquivo && !fotoUrl) {
        const novaFotoUrl = await uploadFoto(alunoId);
        if (novaFotoUrl)
          await supabaseClient
            .from("alunos")
            .update({ foto_url: novaFotoUrl })
            .eq("id", alunoId);
      }
    }
    const endData = {
      aluno_id: alunoId,
      cep: document.getElementById("alunoCep").value || null,
      endereco: document.getElementById("alunoEndereco").value || null,
      numero: document.getElementById("alunoNumero").value || null,
      complemento: document.getElementById("alunoComplemento").value || null,
      bairro: document.getElementById("alunoBairro").value || null,
      cidade: document.getElementById("alunoCidade").value || null,
      estado: document.getElementById("alunoEstado").value || null,
    };
    const endExistente = estado.dados.enderecos.data[String(alunoId)];
    if (endExistente)
      await supabaseClient
        .from("enderecos")
        .update(endData)
        .eq("aluno_id", alunoId);
    else await supabaseClient.from("enderecos").insert([endData]);

    const sauData = {
      aluno_id: alunoId,
      tipo_sanguineo:
        document.getElementById("alunoTipoSanguineo").value || null,
      plano_saude: document.getElementById("alunoPlanoSaude").value || null,
      numero_carteirinha:
        document.getElementById("alunoNumeroCarteirinha").value || null,
      alergias: document.getElementById("alunoAlergias").value || null,
      medicamentos: document.getElementById("alunoMedicamentos").value || null,
      cirurgias: document.getElementById("alunoCirurgias").value || null,
      condicoes_cronicas:
        document.getElementById("alunoCondicoesCronicas").value || null,
      medico_responsavel:
        document.getElementById("alunoMedicoResponsavel").value || null,
      contato_emergencia:
        document.getElementById("alunoContatoEmergencia").value || null,
    };
    const sauExistente = estado.dados.saude.data[String(alunoId)];
    if (sauExistente)
      await supabaseClient
        .from("saude_alunos")
        .update(sauData)
        .eq("aluno_id", alunoId);
    else await supabaseClient.from("saude_alunos").insert([sauData]);

    mostrarToast("Dossiê salvo com sucesso!", "success");
    await carregarTodosDados(true);
    if (id) fecharModal("modalAluno");
    else {
      estado.alunoAtual = String(alunoId);
      await carregarDocumentos(true);
      await carregarEvolucao(true);
      atualizarListaDocumentos(String(alunoId));
      atualizarListaEvolucoesTimeline(String(alunoId));
      atualizarGraficoEvolucao(String(alunoId));
      mostrarToast(
        "Agora você pode anexar documentos e registrar evoluções",
        "info",
      );
      document.getElementById("alunoNome").setAttribute("readonly", true);
      document.getElementById("alunoCpf").setAttribute("readonly", true);
      document.getElementById("alunoNascimento").setAttribute("readonly", true);
      document.getElementById("btnEscolherFoto").disabled = true;
      document
        .querySelectorAll(".readonly-indicator")
        .forEach((el) => (el.style.display = "inline-flex"));
      document.getElementById("quickAccessBar").style.display = "flex";
      document.getElementById("btnLiberarEdicao").style.display =
        "inline-block";
    }
  } catch (error) {
    console.error("Erro ao salvar:", error);
    mostrarToast(
      "Erro ao salvar: " + (error.message || "erro desconhecido"),
      "error",
    );
  } finally {
    esconderLoading();
  }
}

// ============================================================
// CONFIRMAÇÃO
// ============================================================
let acaoConfirmarCallback = null;
function confirmarAcao(mensagem, callback, titulo = "Confirmar Ação") {
  document.getElementById("modalConfirmarTitulo").textContent = titulo;
  document.getElementById("modalConfirmarMensagem").textContent = mensagem;
  acaoConfirmarCallback = callback;
  const btnAcao = document.getElementById("modalConfirmarBtnAcao");
  btnAcao.onclick = function () {
    if (acaoConfirmarCallback) acaoConfirmarCallback();
    fecharModal("modalConfirmar");
  };
  document.getElementById("modalConfirmar").classList.add("show");
}

async function toggleStatusAluno(id, statusAtual) {
  const acao = statusAtual ? "desativar" : "reativar";
  const mensagem = `Tem certeza que deseja ${acao} este aluno?`;
  const titulo = acao === "desativar" ? "Desativar Aluno" : "Reativar Aluno";
  confirmarAcao(
    mensagem,
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("alunos")
          .update({ ativo: !statusAtual })
          .eq("id", id);
        if (error) throw error;
        mostrarToast(`Aluno ${acao}do com sucesso!`, "success");
        await carregarTodosDados(true);
      } catch (error) {
        console.error(`Erro ao ${acao} aluno:`, error);
        mostrarToast(`Erro ao ${acao} aluno: ` + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
    titulo,
  );
}

// ============================================================
// VISUALIZAR DOSSIÊ
// ============================================================
async function visualizarDossie(id) {
  const alunoIdStr = String(id);
  const aluno = estado.dados.alunos.data.find(
    (a) => String(a.id) === alunoIdStr,
  );
  if (!aluno) {
    mostrarToast("Aluno não encontrado", "error");
    return;
  }
  mostrarLoading();
  try {
    const end = estado.dados.enderecos.data[alunoIdStr];
    const sau = estado.dados.saude.data[alunoIdStr];
    const docs = estado.dados.documentos.data[alunoIdStr] || [];
    const evos = estado.dados.evolucao.data[alunoIdStr] || [];
    const [statusFinanceiro, ultimaAula, proximaAula] = await Promise.all([
      carregarStatusFinanceiro(aluno.id),
      carregarUltimaAula(aluno.id),
      carregarProximaAula(aluno.id),
    ]);
    const idade = calcularIdade(aluno.nascimento);
    let fotoHtml = "";
    if (aluno.foto_url)
      fotoHtml = `<img src="${aluno.foto_url}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--verde-pastel); margin-bottom:1rem;" />`;
    const conteudo = `
      <div style="display:flex; flex-direction:column; align-items:center;">${fotoHtml}</div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-user"></i> ${aluno.nome || "Sem nome"} ${idade ? `(${idade} anos)` : ""}</h3><div class="info-grid"><div class="info-item"><div class="info-label">CPF</div><div class="info-value">${aluno.cpf ? mascaraCPF(aluno.cpf) : "-"}</div></div><div class="info-item"><div class="info-label">Telefone</div><div class="info-value">${aluno.telefone ? mascaraTelefone(aluno.telefone) : "-"}</div></div><div class="info-item"><div class="info-label">E-mail</div><div class="info-value">${aluno.email || "-"}</div></div><div class="info-item"><div class="info-label">Nascimento</div><div class="info-value">${formatarData(aluno.nascimento)}</div></div><div class="info-item"><div class="info-label">Sexo</div><div class="info-value">${aluno.sexo === "F" ? "Feminino" : aluno.sexo === "M" ? "Masculino" : "Outro"}</div></div></div></div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-map-marker-alt"></i> Endereço</h3><div class="info-value">${end ? `${end.endereco || ""}, ${end.numero || ""}${end.complemento ? " - " + end.complemento : ""}<br>${end.bairro || ""}, ${end.cidade || ""} - ${end.estado || ""}<br>CEP: ${end.cep || ""}` : "Não informado"}</div></div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-heartbeat"></i> Saúde</h3><div class="info-grid"><div class="info-item"><div class="info-label">Tipo Sanguíneo</div><div class="info-value">${sau ? sau.tipo_sanguineo || "-" : "-"}</div></div><div class="info-item"><div class="info-label">Contato Emergência</div><div class="info-value">${sau ? sau.contato_emergencia || "-" : "-"}</div></div><div class="info-item full-width"><div class="info-label">Alergias</div><div class="info-value">${sau ? sau.alergias || "Nenhuma" : "-"}</div></div></div></div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-dollar-sign"></i> Financeiro</h3><div class="info-item"><div class="info-label">Status</div><div class="info-value">${statusFinanceiro === "em-dia" ? "Em dia" : statusFinanceiro === "pendente" ? "Pendente" : "Atrasado"}</div></div></div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-calendar-check"></i> Agenda</h3><div class="info-item"><div class="info-label">Última Aula</div><div class="info-value">${ultimaAula ? formatarData(ultimaAula) : "-"}</div></div><div class="info-item"><div class="info-label">Próxima Aula</div><div class="info-value">${proximaAula ? formatarData(proximaAula) : "-"}</div></div></div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-file"></i> Documentos (${docs.length})</h3>${docs.length > 0 ? docs.map((doc) => `<div style="display:flex; align-items:center; justify-content:space-between; padding:0.5rem; background:var(--off-white); margin-bottom:0.5rem; border-radius:4px;"><div style="display:flex; align-items:center; gap:0.5rem;"><i class="fas ${doc.tipo?.includes("pdf") ? "fa-file-pdf" : doc.tipo?.includes("image") ? "fa-file-image" : "fa-file"}"></i><span>${doc.nome || "Documento"}</span></div><span style="font-size:0.8rem; color:var(--grafite-claro);">${doc.observacao || ""}</span><button class="btn-download" onclick="window.open('${doc.url}', '_blank')" style="width:32px; height:32px;"><i class="fas fa-download"></i></button></div>`).join("") : "<p>Nenhum documento anexado.</p>"}</div>
      <div class="dossie-section"><h3 class="section-title"><i class="fas fa-chart-line"></i> Evoluções (${evos.length})</h3>${evos.length > 0 ? evos.map((evo) => `<div style="padding:0.8rem; background:var(--off-white); margin-bottom:0.5rem; border-radius:4px; border-left:4px solid var(--verde-principal);"><strong>${formatarData(evo.data)}:</strong> ${evo.titulo || "Evolução"}<p style="margin-top:0.3rem; font-size:0.8rem;">${evo.descricao || ""}</p></div>`).join("") : "<p>Nenhuma evolução registrada.</p>"}</div>
    `;
    document.getElementById("conteudoDossie").innerHTML = conteudo;
    document.getElementById("modalDossie").classList.add("show");
  } catch (error) {
    console.error("Erro ao carregar dossiê:", error);
    mostrarToast("Erro ao carregar dossiê", "error");
  } finally {
    esconderLoading();
  }
}

function exportarDossiePDF() {
  mostrarToast("Funcionalidade em desenvolvimento", "info");
}

// ============================================================
// FUNÇÕES DOS MODAIS DE ACESSO RÁPIDO
// ============================================================
function abrirModalAvaliacao(alunoId = null) {
  const id = alunoId || estado.alunoAtual;
  if (!id) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }
  window.open(`avaliacao.html?id=${id}`, "_blank");
}

function abrirModalAgenda(alunoId = null) {
  const id = alunoId || estado.alunoAtual;
  if (!id) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }
  carregarAulasAlunoModal(id);
  document.getElementById("modalAgenda").classList.add("show");
}

async function carregarAulasAlunoModal(alunoId) {
  const listaDiv = document.getElementById("listaAulasAgenda");
  listaDiv.innerHTML = '<p class="empty-state">Carregando aulas...</p>';
  try {
    const { data, error } = await supabaseClient
      .from("aulas")
      .select("data, horario, status, presenca")
      .eq("aluno_id", alunoId)
      .order("data", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      listaDiv.innerHTML =
        '<p class="empty-state">Nenhuma aula encontrada.</p>';
      return;
    }
    let html = '<ul style="list-style: none;">';
    data.forEach((aula) => {
      const statusIcon =
        aula.status === "confirmada"
          ? "✅"
          : aula.status === "cancelada"
            ? "❌"
            : "⏳";
      html += `<li style="padding: 0.5rem; border-bottom: 1px solid #eee;">${formatarData(
        aula.data,
      )} às ${aula.horario} - ${statusIcon} ${aula.status}</li>`;
    });
    html += "</ul>";
    listaDiv.innerHTML = html;
  } catch (error) {
    console.error("Erro ao carregar aulas:", error);
    listaDiv.innerHTML = '<p class="empty-state">Erro ao carregar aulas.</p>';
  }
}

function navegarAgenda(direcao) {
  mostrarToast("Navegação em desenvolvimento", "info");
}

function abrirModalFinanceiro(alunoId = null) {
  const id = alunoId || estado.alunoAtual;
  if (!id) {
    mostrarToast("Selecione um aluno primeiro", "error");
    return;
  }
  carregarFinanceiroAlunoModal(id);
  document.getElementById("modalFinanceiro").classList.add("show");
}

async function carregarFinanceiroAlunoModal(alunoId) {
  try {
    const { data, error } = await supabaseClient
      .from("parcelas")
      .select("id, valor, status, vencimento, data_pagamento")
      .eq("aluno_id", alunoId);
    if (error) throw error;

    let totalPago = 0,
      totalAberto = 0,
      totalAtrasado = 0;
    let parcelasList = [];
    let pagamentosPorMes = {};
    (data || []).forEach((p) => {
      if (p.status === "pago") {
        totalPago += p.valor;
        const mesAno = p.data_pagamento
          ? p.data_pagamento.substring(0, 7)
          : null;
        if (mesAno) {
          pagamentosPorMes[mesAno] = (pagamentosPorMes[mesAno] || 0) + p.valor;
        }
      } else if (p.status === "pendente") totalAberto += p.valor;
      else if (p.status === "atrasado") totalAtrasado += p.valor;
      parcelasList.push(p);
    });

    document.getElementById("financeiroTotalPago").textContent =
      formatarMoeda(totalPago);
    document.getElementById("financeiroEmAberto").textContent =
      formatarMoeda(totalAberto);
    document.getElementById("financeiroAtrasado").textContent =
      formatarMoeda(totalAtrasado);

    const listaDiv = document.getElementById("listaParcelasFinanceiro");
    if (parcelasList.length === 0) {
      listaDiv.innerHTML =
        '<p class="empty-state">Nenhuma parcela encontrada.</p>';
    } else {
      parcelasList.sort(
        (a, b) => new Date(b.vencimento) - new Date(a.vencimento),
      );
      listaDiv.innerHTML = parcelasList
        .map(
          (p) => `
          <div style="display: flex; justify-content: space-between; padding: 0.5rem; border-bottom: 1px solid #eee;">
            <span>Venc: ${formatarData(p.vencimento)}</span>
            <span>${formatarMoeda(p.valor)}</span>
            <span class="badge ${p.status === "pago" ? "ativo" : p.status === "pendente" ? "amarelo" : "vermelho"}">${p.status}</span>
          </div>
        `,
        )
        .join("");
    }

    const meses = Object.keys(pagamentosPorMes).sort();
    const valores = meses.map((m) => pagamentosPorMes[m]);
    const ctx = document.getElementById("graficoFinanceiro").getContext("2d");
    if (estado.graficos.financeiro) estado.graficos.financeiro.destroy();
    estado.graficos.financeiro = new Chart(ctx, {
      type: "line",
      data: {
        labels: meses.map((m) => m.substring(5) + "/" + m.substring(0, 4)),
        datasets: [
          {
            label: "Pagamentos",
            data: valores,
            borderColor: "var(--verde-principal)",
            backgroundColor: "rgba(58,107,92,0.1)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar financeiro:", error);
    mostrarToast("Erro ao carregar dados financeiros", "error");
  }
}

function exportarDadosAluno() {
  const id = estado.alunoAtual;
  if (!id) {
    mostrarToast("Selecione um aluno", "error");
    return;
  }
  mostrarToast("Exportação em desenvolvimento", "info");
}

function irParaAvaliacao() {
  const id = estado.alunoAtual;
  if (id) {
    window.open(`avaliacao.html?id=${id}`, "_blank");
    fecharModal("modalAvaliacao");
  }
}

// ============================================================
// UI
// ============================================================
function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("show");
    if (id === "modalVisualizarDocumento") {
      const iframe = document.getElementById("documentoIframe");
      if (iframe) iframe.src = "";
    }
  }
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
}

// ============================================================
// FUNÇÕES DE UPLOAD E DOCUMENTOS
// ============================================================
async function uploadDocumentos(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const alunoId = document.getElementById("alunoId").value;
  if (!alunoId) {
    mostrarToast("Salve o aluno primeiro antes de anexar documentos", "error");
    return;
  }
  if (isNaN(parseInt(alunoId))) {
    mostrarToast("ID do aluno inválido", "error");
    return;
  }
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
      const hoje = new Date().toISOString().split("T")[0];
      const agora = new Date().toISOString();
      const documentData = {
        aluno_id: parseInt(alunoId),
        nome: file.name || "documento",
        tipo: "outro",
        tamanho: file.size || 0,
        url: publicUrl,
        storage_path: fileName,
        observacao: "",
        data: hoje,
        criado_em: agora,
      };
      const { error: dbError } = await supabaseClient
        .from("documentos")
        .insert([documentData]);
      if (dbError) throw dbError;
      uploaded++;
      const percent = (uploaded / total) * 100;
      progressBar.style.width = percent + "%";
      progressText.textContent = `Enviado ${uploaded} de ${total} arquivos...`;
    }
    mostrarToast("Documentos enviados com sucesso!", "success");
    await carregarDocumentos(true);
    atualizarListaDocumentos(alunoId);
  } catch (error) {
    console.error("Erro no upload:", error);
    let detalhe = error.message || "erro desconhecido";
    if (error.details) detalhe += " - " + error.details;
    if (error.hint) detalhe += " - " + error.hint;
    if (error.code) detalhe += " (código " + error.code + ")";
    mostrarToast("Erro ao enviar documentos: " + detalhe, "error");
  } finally {
    progressDiv.style.display = "none";
    progressBar.style.width = "0%";
    document.getElementById("fileUpload").value = "";
    esconderLoading();
  }
}

async function salvarObservacaoDocumento(documentoId, observacao) {
  if (!documentoId) return;
  try {
    const { error } = await supabaseClient
      .from("documentos")
      .update({ observacao })
      .eq("id", documentoId);
    if (error) throw error;
    mostrarToast("Observação salva", "success");
    const alunoId = document.getElementById("alunoId").value;
    if (alunoId) {
      await carregarDocumentos(true);
      atualizarListaDocumentos(alunoId);
    }
  } catch (error) {
    console.error("Erro ao salvar observação:", error);
    mostrarToast("Erro ao salvar observação", "error");
  }
}

function atualizarListaDocumentos(alunoId) {
  const listaDiv = document.getElementById("listaDocumentos");
  const alunoIdStr = String(alunoId);
  const docs = estado.dados.documentos.data[alunoIdStr] || [];
  if (docs.length === 0) {
    listaDiv.innerHTML =
      '<p style="font-size:0.8rem; color: var(--grafite-claro); padding: 1rem;">Nenhum documento anexado.</p>';
    return;
  }
  listaDiv.innerHTML = docs
    .map((doc) => {
      const iconType = doc.tipo?.includes("pdf")
        ? "file-pdf"
        : doc.tipo?.includes("image")
          ? "file-image"
          : "file";
      return `
        <div class="documento-item">
          <div class="documento-info">
            <i class="fas fa-${iconType}"></i>
            <div>
              <div class="documento-nome">${doc.nome || "Documento"}</div>
              <div class="documento-tipo">${formatarBytes(
                doc.tamanho || 0,
              )}</div>
            </div>
          </div>
          <input type="text" class="documento-observacao" id="obs-${doc.id}" value="${doc.observacao || ""}" placeholder="Observação" />
          <div class="documento-actions">
            <button class="btn-save" onclick="salvarObservacaoDocumento('${doc.id}', document.getElementById('obs-${doc.id}').value)" title="Salvar observação"><i class="fas fa-save"></i></button>
            <button class="btn-download" onclick="window.open('${doc.url}', '_blank')" title="Download"><i class="fas fa-download"></i></button>
            <button class="btn-delete" onclick="excluirDocumento('${doc.id}', '${doc.storage_path}')" title="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function excluirDocumento(documentoId, storagePath) {
  confirmarAcao(
    "Tem certeza que deseja excluir este documento?",
    async () => {
      mostrarLoading();
      try {
        if (storagePath) {
          const { error: storageError } = await supabaseClient.storage
            .from("documentos")
            .remove([storagePath]);
          if (storageError) throw storageError;
        }
        const { error: dbError } = await supabaseClient
          .from("documentos")
          .delete()
          .eq("id", documentoId);
        if (dbError) throw dbError;
        mostrarToast("Documento excluído com sucesso!", "success");
        await carregarDocumentos(true);
        if (estado.alunoAtual) atualizarListaDocumentos(estado.alunoAtual);
      } catch (error) {
        console.error("Erro ao excluir documento:", error);
        mostrarToast("Erro ao excluir documento: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
    "Excluir Documento",
  );
}

// ============================================================
// FUNÇÕES DE EVOLUÇÃO
// ============================================================
async function salvarEvolucao() {
  const alunoId = document.getElementById("alunoId").value;
  if (!alunoId) {
    mostrarToast(
      "Salve o aluno primeiro antes de registrar evoluções",
      "error",
    );
    return;
  }
  const titulo = document.getElementById("evolucaoTitulo").value.trim();
  const descricao = document.getElementById("evolucaoDescricao").value.trim();
  let data = document.getElementById("evolucaoData").value;
  if (!titulo) {
    mostrarToast("Título da evolução é obrigatório", "error");
    return;
  }
  if (!data) data = new Date().toISOString().split("T")[0];
  mostrarLoading();
  try {
    const { error } = await supabaseClient
      .from("evolucao")
      .insert([{ aluno_id: alunoId, titulo, descricao, data }]);
    if (error) throw error;
    mostrarToast("Evolução registrada com sucesso!", "success");
    document.getElementById("evolucaoTitulo").value = "";
    document.getElementById("evolucaoDescricao").value = "";
    document.getElementById("evolucaoData").value = "";
    await carregarEvolucao(true);
    atualizarListaEvolucoesTimeline(alunoId);
    atualizarGraficoEvolucao(alunoId);
  } catch (error) {
    console.error("Erro ao salvar evolução:", error);
    mostrarToast("Erro ao registrar evolução: " + error.message, "error");
  } finally {
    esconderLoading();
  }
}

function atualizarListaEvolucoesTimeline(alunoId) {
  const listaDiv = document.getElementById("listaEvolucoesTimeline");
  const alunoIdStr = String(alunoId);
  const evos = estado.dados.evolucao.data[alunoIdStr] || [];
  if (evos.length === 0) {
    listaDiv.innerHTML =
      '<p style="font-size:0.8rem; color: var(--grafite-claro); padding: 1rem;">Nenhuma evolução registrada.</p>';
    return;
  }
  listaDiv.innerHTML = evos
    .map(
      (evo) => `
        <div class="timeline-item">
          <div class="timeline-date">${formatarData(evo.data)}</div>
          <div class="timeline-title">${evo.titulo || "Evolução"}</div>
          <div class="timeline-content">${evo.descricao || ""}</div>
        </div>
      `,
    )
    .join("");
}

async function excluirEvolucao(evolucaoId) {
  confirmarAcao(
    "Tem certeza que deseja excluir esta evolução?",
    async () => {
      mostrarLoading();
      try {
        const { error } = await supabaseClient
          .from("evolucao")
          .delete()
          .eq("id", evolucaoId);
        if (error) throw error;
        mostrarToast("Evolução excluída com sucesso!", "success");
        await carregarEvolucao(true);
        if (estado.alunoAtual) {
          atualizarListaEvolucoesTimeline(estado.alunoAtual);
          atualizarGraficoEvolucao(estado.alunoAtual);
        }
      } catch (error) {
        console.error("Erro ao excluir evolução:", error);
        mostrarToast("Erro ao excluir evolução: " + error.message, "error");
      } finally {
        esconderLoading();
      }
    },
    "Excluir Evolução",
  );
}

// ============================================================
// GRÁFICO DE EVOLUÇÃO REAL
// ============================================================
async function atualizarGraficoEvolucao(alunoId) {
  try {
    const { data, error } = await supabaseClient
      .from("avaliacoes")
      .select(
        "data_avaliacao, flexibilidade_value, forca_value, equilibrio_value",
      )
      .eq("aluno_id", alunoId)
      .order("data_avaliacao", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      if (estado.graficos.evolucao) estado.graficos.evolucao.destroy();
      return;
    }

    const labels = data.map((a) => formatarData(a.data_avaliacao));
    const flex = data.map((a) => a.flexibilidade_value || 0);
    const forca = data.map((a) => a.forca_value || 0);
    const equil = data.map((a) => a.equilibrio_value || 0);

    const ctx = document.getElementById("graficoEvolucao").getContext("2d");
    if (estado.graficos.evolucao) estado.graficos.evolucao.destroy();
    estado.graficos.evolucao = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Flexibilidade",
            data: flex,
            borderColor: "#3498db",
            fill: false,
          },
          {
            label: "Força",
            data: forca,
            borderColor: "#e74c3c",
            fill: false,
          },
          {
            label: "Equilíbrio",
            data: equil,
            borderColor: "#f39c12",
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar gráfico de evolução:", error);
  }
}

// ============================================================
// CARREGAMENTO INICIAL
// ============================================================
async function carregarTodosDados(forceRefresh = false) {
  mostrarLoading();
  try {
    await Promise.all([
      carregarAlunos(forceRefresh),
      carregarEnderecos(forceRefresh),
      carregarSaude(forceRefresh),
      carregarDocumentos(forceRefresh),
      carregarEvolucao(forceRefresh),
      carregarPlanos(forceRefresh),
      carregarMensalidades(forceRefresh),
      carregarAulas(forceRefresh),
    ]);
    await exibirTabelaAlunos();
    // Popular select de planos
    const planosSelect = document.getElementById("filtroPlano");
    const planosUnicos = [
      ...new Set(estado.dados.planos.data.map((p) => p.plano)),
    ];
    planosUnicos.forEach((plano) => {
      const option = document.createElement("option");
      option.value = plano;
      option.textContent = plano;
      planosSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    mostrarToast("Erro ao carregar alguns dados", "error");
  } finally {
    esconderLoading();
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", async function () {
  mostrarLoading();
  try {
    const logado = await verificarLogin();
    if (logado) {
      document.getElementById("alunosContent").style.display = "block";
      document.getElementById("loginMessage").style.display = "none";
      await carregarTodosDados();
    } else {
      document.getElementById("alunosContent").style.display = "none";
      document.getElementById("loginMessage").style.display = "block";
    }
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarToast("Erro ao inicializar o sistema", "error");
  } finally {
    esconderLoading();
  }
});
