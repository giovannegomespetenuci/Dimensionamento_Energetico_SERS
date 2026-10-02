/* =========================================================================
    DIMENSIONAMENTO ENERGÉTICO RESIDENCIAL — aplicação web
   ========================================================================= */

/* ---------- constantes de domínio ---------- */
const API_URL = 'dimensionamento_energetico_residencial.php';
const DIAS_MES = 30;
const FRACAO_DIAS_SEMANA = 5 / 7;
const FRACAO_DIAS_FDS = 2 / 7;

const CATEGORIAS_SEED = [
  'Cozinha', 'Banheiro', 'Climatização', 'Sala', 'Escritório',
  'Iluminação', 'Lavanderia', 'Limpeza', 'Eletrônicos', 'Área externa'
];

const EQUIP_REFERENCIA_SEED = [
  { nome: 'Geladeira', categoria: 'Cozinha', potencia: 150 },
  { nome: 'Freezer', categoria: 'Cozinha', potencia: 200 },
  { nome: 'Micro-ondas', categoria: 'Cozinha', potencia: 1200 },
  { nome: 'Forno elétrico', categoria: 'Cozinha', potencia: 1500 },
  { nome: 'Cafeteira', categoria: 'Cozinha', potencia: 800 },
  { nome: 'Liquidificador', categoria: 'Cozinha', potencia: 400 },
  { nome: 'Chuveiro elétrico', categoria: 'Banheiro', potencia: 5500 },
  { nome: 'Secador de cabelo', categoria: 'Banheiro', potencia: 1200 },
  { nome: 'Ar-condicionado (split 9000 BTUs)', categoria: 'Climatização', potencia: 900 },
  { nome: 'Ventilador', categoria: 'Climatização', potencia: 100 },
  { nome: 'Aquecedor elétrico', categoria: 'Climatização', potencia: 1500 },
  { nome: 'TV LED 42 polegadas', categoria: 'Sala', potencia: 100 },
  { nome: 'Home theater', categoria: 'Sala', potencia: 100 },
  { nome: 'Videogame (console)', categoria: 'Sala', potencia: 150 },
  { nome: 'Notebook', categoria: 'Escritório', potencia: 65 },
  { nome: 'Computador desktop', categoria: 'Escritório', potencia: 200 },
  { nome: 'Roteador Wi-Fi', categoria: 'Escritório', potencia: 10 },
  { nome: 'Impressora', categoria: 'Escritório', potencia: 300 },
  { nome: 'Lâmpada LED', categoria: 'Iluminação', potencia: 9 },
  { nome: 'Lâmpada incandescente', categoria: 'Iluminação', potencia: 60 },
  { nome: 'Máquina de lavar roupas', categoria: 'Lavanderia', potencia: 500 },
  { nome: 'Secadora de roupas', categoria: 'Lavanderia', potencia: 2000 },
  { nome: 'Ferro de passar', categoria: 'Lavanderia', potencia: 1200 },
  { nome: 'Aspirador de pó', categoria: 'Limpeza', potencia: 1400 },
  { nome: 'Carregador de celular', categoria: 'Eletrônicos', potencia: 5 },
  { nome: 'Bomba d\u2019água', categoria: 'Área externa', potencia: 750 }
];

/* ---------- estado em memória ---------- */
let estado = null;         // carregado do banco pelo backend
let sessao = null;         // { email, convidado } — não persistido
let idImovelAtual = null;
let abaImovelAtual = 'dados';
let arquivoImportadoLinhas = null; // linhas válidas pendentes de confirmação
let graficoPizzaInstancia = null;

function gerarId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function carregarEstado() {
  const resposta = await apiRequest('carregar');
  return resposta.estado;
}

async function salvarEstado() {
  try {
    const idAtualAntesDoSalvamento = idImovelAtual;
    const resposta = await apiRequest('salvar', { estado });
    estado = resposta.estado;
    idImovelAtual = resposta.idsImoveis[String(idAtualAntesDoSalvamento)] || null;
    return true;
  } catch (erro) {
    mostrarToast(erro.message || 'Não foi possível salvar os dados agora. Tente novamente em instantes.', 'erro');
    return false;
  }
}

async function apiRequest(acao, dados = {}) {
  const resposta = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ acao, ...dados })
  });
  const resultado = await resposta.json();
  if (!resposta.ok || resultado.erro) throw new Error(resultado.erro || 'Falha na comunicação com o servidor.');
  return resultado;
}

/* =========================================================================
   FUNÇÕES PURAS — cálculo e validação (reaproveitadas pelo painel de testes)
   ========================================================================= */

function calcularConsumoEquipamento(equip) {
  if (equip.consumoMensalKwh !== undefined && equip.consumoMensalKwh !== null) {
    return Number(equip.consumoMensalKwh);
  }
  const diasSemana = DIAS_MES * FRACAO_DIAS_SEMANA;
  const diasFds = DIAS_MES * FRACAO_DIAS_FDS;
  const horasSemana = Number(equip.horasSemana) || 0;
  const horasFds = (equip.horasFimSemana === undefined || equip.horasFimSemana === null)
    ? horasSemana
    : Number(equip.horasFimSemana);
  const potencia = Number(equip.potencia) || 0;
  const quantidade = Number(equip.quantidade) || 0;
  const consumoWh = potencia * quantidade * (horasSemana * diasSemana + horasFds * diasFds);
  return consumoWh / 1000;
}

function calcularConsumoTotal(imovel) {
  if (imovel.consumoTotalKwh !== undefined && imovel.consumoTotalKwh !== null) {
    return Number(imovel.consumoTotalKwh);
  }
  return imovel.equipamentos.reduce((acc, e) => acc + calcularConsumoEquipamento(e), 0);
}

function calcularCusto(consumoTotalKwh, tarifa) {
  return consumoTotalKwh * (Number(tarifa) || 0);
}

function validarPotencia(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && !isNaN(n) && n > 0;
}

function validarHoras(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && !isNaN(n) && n >= 0 && n <= 24;
}

function validarQuantidade(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && Number.isInteger(n) && n > 0;
}

function validarTexto(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validarSenha(v) {
  return typeof v === 'string' && v.length >= 8;
}

function validarTarifa(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && !isNaN(n) && n > 0;
}

function validarEmailFormato(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function agruparConsumoPorCategoria(imovel) {
  const mapa = {};
  imovel.equipamentos.forEach(e => {
    const consumo = calcularConsumoEquipamento(e);
    mapa[e.categoria] = (mapa[e.categoria] || 0) + consumo;
  });
  return mapa;
}

function compararCenarios(imovelA, imovelB) {
  const totalA = calcularConsumoTotal(imovelA);
  const totalB = calcularConsumoTotal(imovelB);
  const diffKwh = totalB - totalA;
  const diffPercentual = totalA === 0 ? null : (diffKwh / totalA) * 100;
  return { totalA, totalB, diffKwh, diffPercentual };
}

function sugerirReducao(imovel, limite) {
  const total = calcularConsumoTotal(imovel);
  const limiteNum = Number(limite) || 0;
  if (!limiteNum || total <= limiteNum) {
    return { excedeu: false, total, sugestoes: [] };
  }
  const comConsumo = imovel.equipamentos
    .map(e => ({ ...e, consumo: calcularConsumoEquipamento(e) }))
    .sort((a, b) => b.consumo - a.consumo);
  const sugestoes = [];
  if (comConsumo[0]) {
    const top = comConsumo[0];
    sugestoes.push(`Reduza o tempo de uso de "${top.nome}", responsável por ${top.consumo.toFixed(1)} kWh/mês.`);
    sugestoes.push(`Avalie substituir "${top.nome}" por um modelo mais eficiente.`);
  }
  sugestoes.push('Concentre o uso de equipamentos de maior potência fora do horário de pico.');
  return { excedeu: true, total, sugestoes };
}

function categoriaEmUso(nomeCategoria) {
  return estado.imoveis.some(im => im.equipamentos.some(e => e.categoria === nomeCategoria));
}

function nomeCategoriaDuplicado(nome, ignorarId) {
  const alvo = nome.trim().toLowerCase();
  return estado.categorias.some(c => c.id !== ignorarId && c.nome.trim().toLowerCase() === alvo);
}

function formatarMoeda(v) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* =========================================================================
   TOASTS
   ========================================================================= */
function mostrarToast(mensagem, tipo) {
  const caixa = document.getElementById('caixa-toasts');
  const toast = document.createElement('div');
  toast.className = 'toast' + (tipo ? ' ' + tipo : '');
  toast.textContent = mensagem;
  caixa.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3800);
}

function mostrarErroCampo(idElemento, mensagem) {
  const el = document.getElementById(idElemento);
  if (!el) return;
  el.textContent = mensagem || '';
  el.style.display = mensagem ? 'block' : 'none';
}

/* =========================================================================
   AUTENTICAÇÃO (US07 / US16)
   ========================================================================= */

document.querySelectorAll('[data-aba-auth]').forEach(botao => {
  botao.addEventListener('click', () => {
    document.querySelectorAll('[data-aba-auth]').forEach(b => b.classList.remove('ativa'));
    botao.classList.add('ativa');
    document.getElementById('form-entrar').classList.add('hidden');
    document.getElementById('form-criar').classList.add('hidden');
    document.getElementById('painel-esqueci').classList.add('hidden');
    const alvo = botao.dataset.abaAuth;
    if (alvo === 'entrar') document.getElementById('form-entrar').classList.remove('hidden');
    if (alvo === 'criar') document.getElementById('form-criar').classList.remove('hidden');
    if (alvo === 'esqueci') document.getElementById('painel-esqueci').classList.remove('hidden');
  });
});

document.getElementById('form-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErroCampo('erro-entrar', '');
  const email = document.getElementById('entrar-email').value.trim().toLowerCase();
  const senha = document.getElementById('entrar-senha').value;
  try {
    const resposta = await apiRequest('entrar', { email, senha });
    estado = resposta.estado;
    sessao = { email: resposta.email, convidado: false };
    entrarNoApp();
  } catch (erro) {
    mostrarErroCampo('erro-entrar', erro.message);
  }
});

document.getElementById('btn-convidado').addEventListener('click', () => {
  mostrarToast('Entre com uma conta para salvar os dados no banco.', 'erro');
});

document.getElementById('form-criar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErroCampo('erro-criar-email', '');
  mostrarErroCampo('erro-criar-senha', '');
  const email = document.getElementById('criar-email').value.trim().toLowerCase();
  const senha = document.getElementById('criar-senha').value;
  let valido = true;
  if (!validarEmailFormato(email)) { mostrarErroCampo('erro-criar-email', 'Informe um e-mail válido.'); valido = false; }
  if (!validarSenha(senha)) { mostrarErroCampo('erro-criar-senha', 'A senha deve ter ao menos 8 caracteres.'); valido = false; }
  if (!valido) return;
  try {
    await apiRequest('registrar', { email, senha });
    mostrarToast('Conta criada com sucesso. Você já pode entrar.', 'sucesso');
    document.querySelector('[data-aba-auth="entrar"]').click();
    document.getElementById('entrar-email').value = email;
    document.getElementById('form-criar').reset();
  } catch (erro) {
    mostrarErroCampo('erro-criar-email', erro.message);
  }
});

document.getElementById('form-esqueci-email').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErroCampo('erro-esqueci-email', '');
  const email = document.getElementById('esqueci-email').value.trim().toLowerCase();
  try {
    const resposta = await apiRequest('solicitar_reset', { email });
    document.getElementById('form-esqueci-nova').classList.remove('hidden');
    mostrarToast('Código de redefinição (simulado): ' + resposta.codigo, 'sucesso');
  } catch (erro) {
    mostrarErroCampo('erro-esqueci-email', erro.message);
  }
});

document.getElementById('form-esqueci-nova').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErroCampo('erro-esqueci-nova', '');
  const email = document.getElementById('esqueci-email').value.trim().toLowerCase();
  const codigo = document.getElementById('esqueci-codigo').value.trim();
  const novaSenha = document.getElementById('esqueci-nova-senha').value;
  const confirmaSenha = document.getElementById('esqueci-confirma-senha').value;
  if (!validarSenha(novaSenha)) { mostrarErroCampo('erro-esqueci-nova', 'A nova senha deve ter ao menos 8 caracteres.'); return; }
  if (novaSenha !== confirmaSenha) { mostrarErroCampo('erro-esqueci-nova', 'As senhas não coincidem.'); return; }
  try {
    await apiRequest('resetar_senha', { email, codigo, senha: novaSenha });
    mostrarToast('Senha redefinida com sucesso. Você já pode entrar.', 'sucesso');
    document.getElementById('form-esqueci-nova').classList.add('hidden');
    document.getElementById('form-esqueci-nova').reset();
    document.getElementById('form-esqueci-email').reset();
    document.querySelector('[data-aba-auth="entrar"]').click();
  } catch (erro) {
    mostrarErroCampo('erro-esqueci-nova', erro.message);
  }
});

document.getElementById('btn-sair').addEventListener('click', async () => {
  try { await apiRequest('sair'); } catch (erro) { mostrarToast(erro.message, 'erro'); }
  sessao = null;
  estado = null;
  idImovelAtual = null;
  document.getElementById('tela-app').classList.add('hidden');
  document.getElementById('tela-auth').classList.remove('hidden');
});

function entrarNoApp() {
  document.getElementById('tela-auth').classList.add('hidden');
  document.getElementById('tela-app').classList.remove('hidden');
  document.getElementById('rotulo-usuario').textContent = sessao.email;
  mostrarVista('dashboard');
}

/* =========================================================================
   NAVEGAÇÃO PRINCIPAL
   ========================================================================= */

document.querySelectorAll('.item-nav').forEach(botao => {
  botao.addEventListener('click', () => mostrarVista(botao.dataset.vista));
});

function mostrarVista(nome) {
  document.querySelectorAll('.item-nav').forEach(b => b.classList.toggle('ativo', b.dataset.vista === nome));
  document.querySelectorAll('.vista').forEach(v => v.classList.add('hidden'));
  document.getElementById('vista-' + nome).classList.remove('hidden');
  if (nome === 'dashboard') renderizarDashboard();
  if (nome === 'categorias') renderizarCategorias();
  if (nome === 'comparar') renderizarComparar();
  if (nome === 'testes') { /* aguarda clique em executar */ }
}

/* =========================================================================
   DASHBOARD — MEUS IMÓVEIS (US06)
   ========================================================================= */

function renderizarDashboard() {
  const grade = document.getElementById('grade-imoveis');
  grade.innerHTML = '';
  estado.imoveis.forEach(im => {
    const total = calcularConsumoTotal(im);
    const cartao = document.createElement('div');
    cartao.className = 'cartao-imovel';
    cartao.innerHTML = `
      <h3>${escapeHtml(im.nome)}</h3>
      <div class="endereco">${escapeHtml(im.endereco)}</div>
      <div class="consumo-mini">${total.toFixed(1)} kWh/mês</div>
      <div class="acoes">
        <button class="btn btn-pequeno btn-abrir">Abrir</button>
        <button class="btn btn-pequeno btn-perigo btn-remover">Excluir</button>
      </div>`;
    cartao.querySelector('.btn-abrir').addEventListener('click', () => abrirImovel(im.id));
    cartao.querySelector('.btn-remover').addEventListener('click', () => confirmarExclusaoImovel(im.id));
    grade.appendChild(cartao);
  });
  const cartaoNovo = document.createElement('button');
  cartaoNovo.className = 'cartao-novo';
  cartaoNovo.textContent = '+ Novo imóvel';
  cartaoNovo.addEventListener('click', criarNovoImovel);
  grade.appendChild(cartaoNovo);
}

function confirmarExclusaoImovel(id) {
  const im = estado.imoveis.find(i => i.id === id);
  if (!im) return;
  if (!confirm(`Excluir o imóvel "${im.nome}"? Esta ação não pode ser desfeita.`)) return;
  estado.imoveis = estado.imoveis.filter(i => i.id !== id);
  salvarEstado();
  renderizarDashboard();
  mostrarToast('Imóvel excluído.', 'sucesso');
}

function criarNovoImovel() {
  idImovelAtual = null;
  limparSolar();
  document.getElementById('titulo-imovel').textContent = 'Novo imóvel';
  document.getElementById('input-nome-imovel').value = '';
  document.getElementById('input-endereco-imovel').value = '';
  mostrarErroCampo('erro-nome-imovel', '');
  mostrarErroCampo('erro-endereco-imovel', '');
  document.getElementById('btn-excluir-imovel').classList.add('hidden');
  document.querySelectorAll('[data-aba-imovel]').forEach(b => { if (b.dataset.abaImovel !== 'dados') b.disabled = true; });
  abrirAbaImovel('dados');
  mostrarVistaImovel();
}

function abrirImovel(id) {
  idImovelAtual = id;
  limparSolar();
  const im = estado.imoveis.find(i => i.id === id);
  document.getElementById('titulo-imovel').textContent = im.nome;
  document.getElementById('input-nome-imovel').value = im.nome;
  document.getElementById('input-endereco-imovel').value = im.endereco;
  document.getElementById('btn-excluir-imovel').classList.remove('hidden');
  document.querySelectorAll('[data-aba-imovel]').forEach(b => { b.disabled = false; });
  document.getElementById('input-tarifa').value = im.tarifa || '';
  document.getElementById('input-limite').value = im.limiteConsumo || '';
  abrirAbaImovel('dados');
  mostrarVistaImovel();
  renderizarEquipamentos();
}

function mostrarVistaImovel() {
  document.querySelectorAll('.vista').forEach(v => v.classList.add('hidden'));
  document.getElementById('vista-imovel').classList.remove('hidden');
  document.querySelectorAll('.item-nav').forEach(b => b.classList.remove('ativo'));
}

document.getElementById('btn-voltar-dashboard').addEventListener('click', () => mostrarVista('dashboard'));

/* ---------- abas dentro do imóvel ---------- */
document.querySelectorAll('[data-aba-imovel]').forEach(botao => {
  botao.addEventListener('click', () => { if (!botao.disabled) abrirAbaImovel(botao.dataset.abaImovel); });
});

function abrirAbaImovel(nome) {
  abaImovelAtual = nome;
  document.querySelectorAll('[data-aba-imovel]').forEach(b => b.classList.toggle('ativa', b.dataset.abaImovel === nome));
  document.querySelectorAll('.aba-imovel-conteudo').forEach(el => el.classList.add('hidden'));
  document.getElementById('aba-' + nome).classList.remove('hidden');
  if (nome === 'equipamentos') renderizarEquipamentos();
  if (nome === 'relatorio') renderizarRelatorio();
  if (nome === 'solar') renderizarSolar();
}

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

/* =========================================================================
   ABA "DADOS DO IMÓVEL" (US01)
   ========================================================================= */

document.getElementById('btn-salvar-imovel').addEventListener('click', async () => {
  const nome = document.getElementById('input-nome-imovel').value;
  const endereco = document.getElementById('input-endereco-imovel').value;
  let valido = true;
  if (!validarTexto(nome)) { mostrarErroCampo('erro-nome-imovel', 'Informe o nome do imóvel.'); valido = false; }
  else mostrarErroCampo('erro-nome-imovel', '');
  if (!validarTexto(endereco)) { mostrarErroCampo('erro-endereco-imovel', 'Informe o endereço.'); valido = false; }
  else mostrarErroCampo('erro-endereco-imovel', '');
  if (!valido) return;

  if (idImovelAtual) {
    const im = estado.imoveis.find(i => i.id === idImovelAtual);
    im.nome = nome.trim();
    im.endereco = endereco.trim();
  } else {
    const novo = {
      id: gerarId(),
      nome: nome.trim(),
      endereco: endereco.trim(),
      tarifa: null,
      limiteConsumo: null,
      cidade: null,
      uf: null,
      hspManual: null,
      consumoManualKwh: null,
      equipamentos: []
    };
    estado.imoveis.push(novo);
    idImovelAtual = novo.id;
  }
  await salvarEstado();
  mostrarToast('Imóvel salvo com sucesso.', 'sucesso');
  document.getElementById('titulo-imovel').textContent = nome.trim();
  document.getElementById('btn-excluir-imovel').classList.remove('hidden');
  document.querySelectorAll('[data-aba-imovel]').forEach(b => { b.disabled = false; });
});

document.getElementById('btn-excluir-imovel').addEventListener('click', () => {
  if (!idImovelAtual) return;
  confirmarExclusaoImovel(idImovelAtual);
  idImovelAtual = null;
  mostrarVista('dashboard');
});

/* =========================================================================
   ABA "EQUIPAMENTOS" (US02, US03, US12, US17)
   ========================================================================= */

function popularSelectCategorias(selectEl) {
  selectEl.innerHTML = '';
  if (estado.categorias.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Cadastre uma categoria primeiro';
    opt.disabled = true;
    opt.selected = true;
    selectEl.appendChild(opt);
    return;
  }
  estado.categorias.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    opt.textContent = c.nome;
    selectEl.appendChild(opt);
  });
}

function popularDatalistReferencia() {
  const dl = document.getElementById('lista-equip-referencia');
  dl.innerHTML = '';
  estado.equipReferencia.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.nome;
    dl.appendChild(opt);
  });
}

document.getElementById('equip-nome').addEventListener('change', (ev) => {
  const nomeDigitado = ev.target.value.trim().toLowerCase();
  const referencia = estado.equipReferencia.find(e => e.nome.toLowerCase() === nomeDigitado);
  if (referencia) {
    document.getElementById('equip-potencia').value = referencia.potencia;
    const selectCategoria = document.getElementById('equip-categoria');
    if ([...selectCategoria.options].some(o => o.value === referencia.categoria)) {
      selectCategoria.value = referencia.categoria;
    }
  }
});

document.getElementById('equip-mesmo-fds').addEventListener('change', (ev) => {
  document.getElementById('equip-horas-fds').disabled = ev.target.checked;
  if (ev.target.checked) {
    document.getElementById('equip-horas-fds').value = document.getElementById('equip-horas-semana').value;
  }
});
document.getElementById('equip-mesmo-fds').dispatchEvent(new Event('change'));

document.getElementById('equip-horas-semana').addEventListener('input', (ev) => {
  if (document.getElementById('equip-mesmo-fds').checked) {
    document.getElementById('equip-horas-fds').value = ev.target.value;
  }
});

document.getElementById('btn-add-equipamento').addEventListener('click', async () => {
  const nome = document.getElementById('equip-nome').value;
  const categoria = document.getElementById('equip-categoria').value;
  const potencia = document.getElementById('equip-potencia').value;
  const quantidade = document.getElementById('equip-quantidade').value;
  const horasSemana = document.getElementById('equip-horas-semana').value;
  const mesmoFds = document.getElementById('equip-mesmo-fds').checked;
  const horasFds = mesmoFds ? horasSemana : document.getElementById('equip-horas-fds').value;

  let erro = '';
  if (!validarTexto(nome)) erro = 'Informe o nome do equipamento.';
  else if (!categoria || estado.categorias.length === 0) erro = 'Selecione uma categoria (cadastre uma em "Categorias" se necessário).';
  else if (!validarPotencia(potencia)) erro = 'A potência deve ser um número maior que zero.';
  else if (!validarQuantidade(quantidade)) erro = 'A quantidade deve ser um número inteiro maior que zero.';
  else if (!validarHoras(horasSemana)) erro = 'As horas de uso (semana) devem estar entre 0 e 24.';
  else if (!validarHoras(horasFds)) erro = 'As horas de uso (fim de semana) devem estar entre 0 e 24.';

  if (erro) { mostrarErroCampo('erro-equipamento', erro); return; }
  mostrarErroCampo('erro-equipamento', '');

  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  im.equipamentos.push({
    id: gerarId(),
    nome: nome.trim(),
    categoria,
    potencia: Number(potencia),
    quantidade: Number(quantidade),
    horasSemana: Number(horasSemana),
    horasFimSemana: Number(horasFds)
  });
  await salvarEstado();
  document.getElementById('equip-nome').value = '';
  document.getElementById('equip-potencia').value = '';
  document.getElementById('equip-quantidade').value = 1;
  document.getElementById('equip-horas-semana').value = 0;
  document.getElementById('equip-horas-fds').value = 0;
  renderizarEquipamentos();
  mostrarToast('Equipamento adicionado.', 'sucesso');
});

function renderizarEquipamentos() {
  if (!idImovelAtual) return;
  popularSelectCategorias(document.getElementById('equip-categoria'));
  popularDatalistReferencia();
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  const corpo = document.getElementById('corpo-tabela-equipamentos');
  corpo.innerHTML = '';
  im.equipamentos.forEach(e => {
    const consumo = calcularConsumoEquipamento(e);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.nome)}</td>
      <td>${escapeHtml(e.categoria)}</td>
      <td class="num">${e.potencia}</td>
      <td class="num">${e.quantidade}</td>
      <td class="num">${e.horasSemana}</td>
      <td class="num">${e.horasFimSemana}</td>
      <td class="num">${consumo.toFixed(2)}</td>
      <td><button class="btn btn-pequeno btn-perigo">Remover</button></td>`;
    tr.querySelector('button').addEventListener('click', async () => {
      im.equipamentos = im.equipamentos.filter(x => x.id !== e.id);
      await salvarEstado();
      renderizarEquipamentos();
    });
    corpo.appendChild(tr);
  });
  document.getElementById('vazio-equipamentos').classList.toggle('hidden', im.equipamentos.length > 0);
}

/* =========================================================================
   ABA "RELATÓRIO" (US04, US05, US08, US09, US10, US14)
   ========================================================================= */

document.getElementById('input-tarifa').addEventListener('change', async (ev) => {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  const valor = ev.target.value;
  mostrarErroCampo('erro-tarifa', '');
  if (valor !== '' && !validarTarifa(valor)) {
    mostrarErroCampo('erro-tarifa', 'A tarifa deve ser um número maior que zero.');
    return;
  }
  im.tarifa = valor === '' ? null : Number(valor);
  await salvarEstado();
  renderizarRelatorio();
});

document.getElementById('input-limite').addEventListener('change', async (ev) => {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  im.limiteConsumo = ev.target.value === '' ? null : Number(ev.target.value);
  await salvarEstado();
  renderizarRelatorio();
});

function renderizarRelatorio() {
  if (!idImovelAtual) return;
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  const total = calcularConsumoTotal(im);

  document.getElementById('relatorio-nome-endereco').textContent = `${im.nome} — ${im.endereco}`;
  document.getElementById('relatorio-consumo-total').innerHTML = total.toFixed(1) + '<span>kWh/mês</span>';

  const custo = im.custoEstimadoReais !== undefined
    ? Number(im.custoEstimadoReais)
    : calcularCusto(total, im.tarifa || 0);
  document.getElementById('relatorio-custo').textContent = formatarMoeda(custo);

  const selo = document.getElementById('relatorio-status-limite');
  const listaSugestoes = document.getElementById('relatorio-sugestoes');
  if (im.limiteConsumo) {
    const resultado = sugerirReducao(im, im.limiteConsumo);
    selo.classList.remove('hidden');
    if (resultado.excedeu) {
      selo.textContent = 'Acima do limite definido';
      selo.className = 'status-limite excedido';
      listaSugestoes.innerHTML = resultado.sugestoes.map(s => `<li>${escapeHtml(s)}</li>`).join('');
      listaSugestoes.classList.remove('hidden');
    } else {
      selo.textContent = 'Dentro do limite definido';
      selo.className = 'status-limite ok';
      listaSugestoes.classList.add('hidden');
    }
  } else {
    selo.classList.add('hidden');
    listaSugestoes.classList.add('hidden');
  }

  const corpo = document.getElementById('corpo-tabela-relatorio');
  corpo.innerHTML = '';
  im.equipamentos.forEach(e => {
    const consumo = calcularConsumoEquipamento(e);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(e.nome)}</td><td>${escapeHtml(e.categoria)}</td><td class="num">${consumo.toFixed(2)}</td>`;
    corpo.appendChild(tr);
  });

  renderizarGraficoPizza(im);
}

function renderizarGraficoPizza(im) {
  const canvas = document.getElementById('grafico-pizza');
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Não foi possível carregar a biblioteca de gráficos (verifique a conexão com a internet).</p>';
    return;
  }
  const agrupado = agruparConsumoPorCategoria(im);
  const categorias = Object.keys(agrupado);
  const valores = Object.values(agrupado);
  if (graficoPizzaInstancia) { graficoPizzaInstancia.destroy(); }
  if (categorias.length === 0) return;
  const paleta = ['#f5a623', '#4e9f6e', '#5b8def', '#e1523d', '#9b6bd6', '#3fb5c9', '#d9a441', '#7a8fa6', '#c9576a', '#6cbf6c'];
  graficoPizzaInstancia = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: categorias,
      datasets: [{ data: valores, backgroundColor: categorias.map((_, i) => paleta[i % paleta.length]) }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#edeff2' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const totalValores = valores.reduce((a, b) => a + b, 0);
              const pct = totalValores ? (ctx.parsed / totalValores * 100).toFixed(1) : '0';
              return `${ctx.label}: ${ctx.parsed.toFixed(1)} kWh (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ajudante compartilhado de exportação CSV (relatório da CP1 e proposta fotovoltaica da CP2) */
function baixarCsv(linhas, nomeArquivo) {
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.getElementById('btn-exportar-csv').addEventListener('click', () => {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  const linhas = [['Imóvel', im.nome], ['Endereço', im.endereco], [], ['Equipamento', 'Categoria', 'Consumo (kWh/mês)']];
  im.equipamentos.forEach(e => linhas.push([e.nome, e.categoria, calcularConsumoEquipamento(e).toFixed(2)]));
  linhas.push([]);
  linhas.push(['Consumo total (kWh/mês)', calcularConsumoTotal(im).toFixed(2)]);
  if (im.tarifa) linhas.push(['Custo estimado', formatarMoeda(calcularCusto(calcularConsumoTotal(im), im.tarifa))]);
  baixarCsv(linhas, `relatorio_${im.nome.replace(/\s+/g, '_')}.csv`);
});

document.getElementById('btn-exportar-pdf').addEventListener('click', () => {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  if (typeof window.jspdf === 'undefined') {
    mostrarToast('Não foi possível carregar a biblioteca de PDF (verifique a conexão com a internet).', 'erro');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(16); doc.text('Relatório de consumo energético', 14, y); y += 10;
  doc.setFontSize(11);
  doc.text(`Imóvel: ${im.nome}`, 14, y); y += 7;
  doc.text(`Endereço: ${im.endereco}`, 14, y); y += 10;
  doc.setFontSize(12); doc.text('Equipamentos:', 14, y); y += 7;
  doc.setFontSize(10);
  im.equipamentos.forEach(e => {
    const consumo = calcularConsumoEquipamento(e).toFixed(2);
    doc.text(`${e.nome} (${e.categoria}) — ${consumo} kWh/mês`, 16, y);
    y += 6;
    if (y > 275) { doc.addPage(); y = 18; }
  });
  y += 6;
  const total = calcularConsumoTotal(im);
  doc.setFontSize(12);
  doc.text(`Consumo total: ${total.toFixed(2)} kWh/mês`, 14, y); y += 7;
  if (im.tarifa) { doc.text(`Custo estimado: ${formatarMoeda(calcularCusto(total, im.tarifa))}`, 14, y); y += 7; }
  doc.save(`relatorio_${im.nome.replace(/\s+/g, '_')}.pdf`);
});

/* =========================================================================
   ABA "IMPORTAR PLANILHA" (US11)
   ========================================================================= */

function normalizarChave(k) {
  return String(k == null ? '' : k)
    .replace(/^\uFEFF/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["']/g, '')
    .trim().toLowerCase();
}

// Aceita variações de cabeçalho: "Nome", "nome do equipamento", "Potência (W)", "potencia_w"...
// e até cabeçalhos com acento corrompido (CSV salvo em ANSI): basta começar com "pot", "categ" ou "nome".
const PREFIXOS_COLUNA = {
  nome: ['nome', 'equipamento', 'descricao'],
  categoria: ['categ'],
  potencia: ['pot', 'watt']
};

function localizarValorColuna(linhaObjeto, coluna) {
  const prefixos = PREFIXOS_COLUNA[coluna] || [coluna];
  const chave = Object.keys(linhaObjeto).find(k => {
    const n = normalizarChave(k);
    return prefixos.some(p => n.startsWith(p));
  });
  return chave === undefined ? undefined : linhaObjeto[chave];
}

// "1500", "1.500", "1500,5", "1.500,5", "1500 W" -> número (ou NaN)
function converterPotencia(bruta) {
  if (typeof bruta === 'number') return bruta;
  if (bruta === undefined || bruta === null) return NaN;
  let t = String(bruta).trim().replace(/\s*w(atts?)?$/i, '').replace(/\s/g, '');
  if (t === '') return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t);
}

function validarEProcessarLinhas(linhasBrutas) {
  const validas = [];
  const invalidas = [];
  linhasBrutas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 cabeçalho, +1 base 1
    const nome = localizarValorColuna(linha, 'nome');
    const categoria = localizarValorColuna(linha, 'categoria');
    const potencia = converterPotencia(localizarValorColuna(linha, 'potencia'));
    const motivos = [];
    if (!validarTexto(nome)) motivos.push('nome ausente');
    if (!validarTexto(categoria)) motivos.push('categoria ausente');
    if (!validarPotencia(potencia)) motivos.push('potência inválida (deve ser numérica e maior que zero)');
    if (motivos.length > 0) {
      invalidas.push({ numeroLinha, motivos });
    } else {
      validas.push({ nome: String(nome).trim(), categoria: String(categoria).trim(), potencia });
    }
  });
  return { validas, invalidas };
}

document.getElementById('input-arquivo-planilha').addEventListener('change', (ev) => {
  const arquivo = ev.target.files[0];
  arquivoImportadoLinhas = null;
  document.getElementById('btn-confirmar-importacao').classList.add('hidden');
  document.getElementById('resultado-importacao').innerHTML = '';
  if (!arquivo) return;
  const extensao = arquivo.name.split('.').pop().toLowerCase();

  const processar = (linhasObjeto) => {
    const { validas, invalidas } = validarEProcessarLinhas(linhasObjeto);
    arquivoImportadoLinhas = validas;
    exibirResultadoImportacao(validas, invalidas);
    // diagnóstico: se nenhuma coluna foi reconhecida, mostra o que o sistema leu no cabeçalho
    if (linhasObjeto.length > 0 && validas.length === 0) {
      const colunas = Object.keys(linhasObjeto[0]);
      const reconhecidas = ['nome', 'categoria', 'potencia'].filter(c => colunas.some(k => PREFIXOS_COLUNA[c].some(p => normalizarChave(k).startsWith(p))));
      if (reconhecidas.length < 3) {
        document.getElementById('resultado-importacao').insertAdjacentHTML('afterbegin',
          `<p class="linha-invalida"><strong>Cabeçalho não reconhecido.</strong> A 1ª linha do arquivo precisa ter as colunas nome, categoria e potencia. Colunas lidas: ${colunas.map(c => '"' + escapeHtml(c) + '"').join(', ')}.</p>`);
      }
    }
  };

  if (extensao === 'csv') {
    if (typeof Papa === 'undefined') { mostrarToast('Biblioteca de leitura de CSV indisponível (verifique a conexão).', 'erro'); return; }
    Papa.parse(arquivo, { header: true, skipEmptyLines: true, delimitersToGuess: [',', ';', '\t', '|'], complete: (res) => processar(res.data) });
  } else if (extensao === 'xlsx' || extensao === 'xls') {
    if (typeof XLSX === 'undefined') { mostrarToast('Biblioteca de leitura de planilhas indisponível (verifique a conexão).', 'erro'); return; }
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const workbook = XLSX.read(e.target.result, { type: 'array' });
      const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
      const linhasObjeto = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });
      processar(linhasObjeto);
    };
    leitor.readAsArrayBuffer(arquivo);
  } else {
    mostrarToast('Formato não suportado. Envie um arquivo CSV ou XLSX.', 'erro');
  }
});

function exibirResultadoImportacao(validas, invalidas) {
  const container = document.getElementById('resultado-importacao');
  let html = `<p class="linha-valida">${validas.length} linha(s) válida(s) pronta(s) para importação.</p>`;
  if (invalidas.length > 0) {
    html += `<p class="linha-invalida">${invalidas.length} linha(s) inválida(s):</p><ul>`;
    invalidas.forEach(i => { html += `<li class="linha-invalida">Linha ${i.numeroLinha}: ${i.motivos.join(', ')}.</li>`; });
    html += '</ul>';
  }
  container.innerHTML = html;
  document.getElementById('btn-confirmar-importacao').classList.toggle('hidden', validas.length === 0);
}

document.getElementById('btn-confirmar-importacao').addEventListener('click', async () => {
  if (!arquivoImportadoLinhas || !idImovelAtual) return;
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  const categoriasExistentes = new Set(estado.categorias.map(c => c.nome.toLowerCase()));
  arquivoImportadoLinhas.forEach(linha => {
    if (!categoriasExistentes.has(linha.categoria.toLowerCase())) {
      estado.categorias.push({ id: gerarId(), nome: linha.categoria });
      categoriasExistentes.add(linha.categoria.toLowerCase());
    }
    im.equipamentos.push({
      id: gerarId(), nome: linha.nome, categoria: linha.categoria, potencia: linha.potencia,
      quantidade: 1, horasSemana: 0, horasFimSemana: 0
    });
  });
  await salvarEstado();
  mostrarToast(`${arquivoImportadoLinhas.length} equipamento(s) importado(s).`, 'sucesso');
  arquivoImportadoLinhas = null;
  document.getElementById('resultado-importacao').innerHTML = '';
  document.getElementById('btn-confirmar-importacao').classList.add('hidden');
  document.getElementById('input-arquivo-planilha').value = '';
  abrirAbaImovel('equipamentos');
});

/* =========================================================================
   CATEGORIAS (US13)
   ========================================================================= */

document.getElementById('btn-add-categoria').addEventListener('click', async () => {
  const input = document.getElementById('input-nova-categoria');
  const nome = input.value.trim();
  mostrarErroCampo('erro-categoria', '');
  if (!validarTexto(nome)) { mostrarErroCampo('erro-categoria', 'Informe um nome para a categoria.'); return; }
  if (nomeCategoriaDuplicado(nome)) { mostrarErroCampo('erro-categoria', 'Já existe uma categoria com esse nome.'); return; }
  estado.categorias.push({ id: gerarId(), nome });
  await salvarEstado();
  input.value = '';
  renderizarCategorias();
  mostrarToast('Categoria adicionada.', 'sucesso');
});

function renderizarCategorias() {
  const corpo = document.getElementById('corpo-tabela-categorias');
  corpo.innerHTML = '';
  estado.categorias.forEach(c => {
    const tr = document.createElement('tr');
    const emUso = categoriaEmUso(c.nome);
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(c.nome)}" class="input-renomear" style="background:transparent;border:1px solid transparent;color:inherit;padding:4px;width:100%;"></td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn btn-pequeno btn-salvar-nome">Salvar</button>
        <button class="btn btn-pequeno btn-perigo btn-excluir-categoria" ${emUso ? 'disabled title="Categoria em uso por equipamentos"' : ''}>Excluir</button>
      </td>`;
    const inputRenomear = tr.querySelector('.input-renomear');
    tr.querySelector('.btn-salvar-nome').addEventListener('click', async () => {
      const novoNome = inputRenomear.value.trim();
      if (!validarTexto(novoNome)) { mostrarToast('Informe um nome válido.', 'erro'); return; }
      if (nomeCategoriaDuplicado(novoNome, c.id)) { mostrarToast('Já existe uma categoria com esse nome.', 'erro'); return; }
      const nomeAntigo = c.nome;
      c.nome = novoNome;
      estado.imoveis.forEach(im => im.equipamentos.forEach(e => { if (e.categoria === nomeAntigo) e.categoria = novoNome; }));
      await salvarEstado();
      renderizarCategorias();
      mostrarToast('Categoria atualizada.', 'sucesso');
    });
    const botaoExcluir = tr.querySelector('.btn-excluir-categoria');
    if (!emUso) {
      botaoExcluir.addEventListener('click', async () => {
        if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
        estado.categorias = estado.categorias.filter(x => x.id !== c.id);
        await salvarEstado();
        renderizarCategorias();
        mostrarToast('Categoria excluída.', 'sucesso');
      });
    }
    corpo.appendChild(tr);
  });
}

/* =========================================================================
   COMPARAR CENÁRIOS (US15)
   ========================================================================= */

function renderizarComparar() {
  const vazio = document.getElementById('comparar-vazio');
  const conteudo = document.getElementById('comparar-conteudo');
  if (estado.imoveis.length < 2) {
    vazio.classList.remove('hidden');
    conteudo.classList.add('hidden');
    return;
  }
  vazio.classList.add('hidden');
  conteudo.classList.remove('hidden');
  const selectA = document.getElementById('select-cenario-a');
  const selectB = document.getElementById('select-cenario-b');
  [selectA, selectB].forEach(sel => { sel.innerHTML = estado.imoveis.map(im => `<option value="${im.id}">${escapeHtml(im.nome)}</option>`).join(''); });
  if (estado.imoveis.length > 1) selectB.selectedIndex = 1;
  document.getElementById('resultado-comparacao').innerHTML = '';
}

document.getElementById('btn-comparar').addEventListener('click', () => {
  const idA = document.getElementById('select-cenario-a').value;
  const idB = document.getElementById('select-cenario-b').value;
  if (idA === idB) { mostrarToast('Selecione dois imóveis diferentes.', 'erro'); return; }
  // o <select> devolve texto e o id vindo do banco é número: compara como texto
  const imA = estado.imoveis.find(i => String(i.id) === idA);
  const imB = estado.imoveis.find(i => String(i.id) === idB);
  if (!imA || !imB) { mostrarToast('Não foi possível localizar os imóveis selecionados.', 'erro'); return; }
  const r = compararCenarios(imA, imB);
  const diffClasse = r.diffKwh > 0 ? 'pos' : (r.diffKwh < 0 ? 'neg' : '');
  const sinal = r.diffKwh > 0 ? '+' : '';
  const pctTexto = r.diffPercentual === null ? 'n/d' : `${sinal}${r.diffPercentual.toFixed(1)}%`;
  document.getElementById('resultado-comparacao').innerHTML = `
    <div class="painel">
      <div class="placar">
        <div><div class="ajuda">${escapeHtml(imA.nome)}</div><div class="num">${r.totalA.toFixed(1)} kWh</div></div>
        <div><div class="ajuda">${escapeHtml(imB.nome)}</div><div class="num">${r.totalB.toFixed(1)} kWh</div></div>
        <div><div class="ajuda">Diferença (B − A)</div><div class="num diff ${diffClasse}">${sinal}${r.diffKwh.toFixed(1)} kWh (${pctTexto})</div></div>
      </div>
    </div>`;
});

/* =========================================================================
   ABA "SOLAR" — pré-dimensionamento fotovoltaico (CP2: US18 a US32)
   O navegador só coleta os dados e mostra o resultado: o cálculo é refeito
   pelo servidor (endpoints dimensionar_fv / salvar_proposta).
   ========================================================================= */

const UFS_BR = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

let catalogoFv = null;      // catálogo vindo do servidor (cidades, parâmetros, avisos)
let propostaFvAtual = null; // { resultado, entrada, imovelNome, salva: null | { id, titulo, criadoEm } }
let entradaFvAtual = null;  // dados exatos enviados ao servidor no último cálculo
let selecaoFv = { modulo: '', inversor: '', bateria: '' }; // '' = automático
let solarPreenchido = false;

function porId(id) { return document.getElementById(id); }

function fmtFv(valor, casas) {
  const n = Number(valor);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function escapeAttr(texto) {
  return escapeHtml(texto).replace(/"/g, '&quot;');
}

function linkSeguro(url, rotulo) {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return escapeHtml(rotulo || u);
  return `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(rotulo || u)}</a>`;
}

function formatarDataHora(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texto || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : String(texto || '');
}

function textoOrigemHsp(h) {
  if (h.origem === 'manual') return 'informado manualmente pelo usuário';
  const local = h.cidade ? `${h.cidade}/${h.uf}` : '';
  if (h.origem === 'cidade') return `cidade ${local} do catálogo de HSP`;
  return `capital da UF (${local}), porque a cidade não está no catálogo`;
}

function limparSolar() {
  propostaFvAtual = null;
  entradaFvAtual = null;
  selecaoFv = { modulo: '', inversor: '', bateria: '' };
  solarPreenchido = false;
  if (porId('solar-resultado')) porId('solar-resultado').innerHTML = '';
  mostrarErroCampo('erro-solar', '');
}

/* ---------- catálogo e campos do formulário ---------- */

async function garantirCatalogoFv() {
  if (catalogoFv) return true;
  try {
    const resposta = await apiRequest('catalogos_fv');
    catalogoFv = resposta.catalogo;
    montarCamposCatalogoFv();
    return true;
  } catch (erro) {
    mostrarToast(erro.message || 'Não foi possível carregar os catálogos solares.', 'erro');
    return false;
  }
}

function montarCamposCatalogoFv() {
  porId('lista-cidades-fv').innerHTML = catalogoFv.cidades
    .map(c => `<option value="${escapeAttr(c.cidade)}">${escapeHtml(c.uf)}</option>`).join('');
  [['f', 'solar-f', 'solar-ajuda-f'], ['eta', 'solar-eta', 'solar-ajuda-eta'],
    ['D', 'solar-d', 'solar-ajuda-d'], ['tmin_c', 'solar-tmin', 'solar-ajuda-tmin']].forEach(([chave, idCampo, idAjuda]) => {
    const def = catalogoFv.parametros[chave];
    porId(idCampo).placeholder = String(def.padrao);
    porId(idAjuda).textContent = `Padrão ${fmtFv(def.padrao, 2)}; aceito de ${fmtFv(def.min, 2)} a ${fmtFv(def.max, 2)} ${def.unidade}.`;
  });
  const unidadeModo = { valor: 'R$', por_kwp: 'R$/kWp', por_modulo: 'R$/módulo', percentual_equipamentos: '% dos equipamentos' };
  porId('solar-outros-custos').innerHTML = catalogoFv.outros_custos.map(c => `
    <div class="campo">
      <label for="solar-custo-${escapeAttr(c.id)}">${escapeHtml(c.rotulo)} (${escapeHtml(unidadeModo[c.modo] || 'R$')})</label>
      <input type="number" id="solar-custo-${escapeAttr(c.id)}" data-custo="${escapeAttr(c.id)}" min="0" step="0.01" placeholder="${escapeAttr(c.valor)}">
    </div>`).join('');
  porId('solar-autonomia').max = catalogoFv.autonomia_max_h;
}

function popularUfSolar() {
  porId('solar-uf').innerHTML = '<option value="">—</option>' + UFS_BR.map(u => `<option value="${u}">${u}</option>`).join('');
}

function preencherCamposSolar(im) {
  porId('solar-cidade').value = im.cidade || '';
  porId('solar-uf').value = im.uf || '';
  porId('solar-hsp-manual').value = (im.hspManual === null || im.hspManual === undefined) ? '' : im.hspManual;
  porId('solar-consumo-manual').value = (im.consumoManualKwh === null || im.consumoManualKwh === undefined) ? '' : im.consumoManualKwh;
}

function atualizarAjudaConsumo(im) {
  porId('solar-ajuda-consumo').textContent =
    `Estimado pelos equipamentos: ${fmtFv(calcularConsumoTotal(im), 1)} kWh/mês. Se preencher aqui, este valor vale mais.`;
}

async function renderizarSolar() {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  await garantirCatalogoFv();
  if (!solarPreenchido) {
    preencherCamposSolar(im);
    solarPreenchido = true;
  }
  atualizarAjudaConsumo(im);
  carregarPropostasFv();
}

function lerNumeroOpcional(idCampo) {
  const bruto = porId(idCampo).value.trim();
  return bruto === '' ? null : Number(bruto);
}

function lerCamposSolar() {
  const cidade = porId('solar-cidade').value.trim();
  const uf = porId('solar-uf').value;
  const hsp = lerNumeroOpcional('solar-hsp-manual');
  const consumo = lerNumeroOpcional('solar-consumo-manual');
  if (cidade.length > 100) return { erro: 'A cidade deve ter no máximo 100 caracteres.' };
  if (hsp !== null && !(hsp >= 1 && hsp <= 9)) return { erro: 'O HSP manual deve estar entre 1 e 9 kWh/m².dia.' };
  if (consumo !== null && !(consumo > 0)) return { erro: 'O consumo manual deve ser maior que zero.' };

  const entrada = {};
  [['f', 'solar-f'], ['eta', 'solar-eta'], ['D', 'solar-d'], ['tmin_c', 'solar-tmin']].forEach(([chave, idCampo]) => {
    const v = lerNumeroOpcional(idCampo);
    if (v !== null) entrada[chave] = v;
  });
  const armazenamento = porId('solar-armazenamento').checked;
  entrada.armazenamento = armazenamento;
  if (armazenamento) {
    const autonomia = lerNumeroOpcional('solar-autonomia');
    if (autonomia === null || !(autonomia > 0)) return { erro: 'Informe a autonomia desejada (horas), maior que zero.' };
    entrada.autonomia_h = autonomia;
  }
  const outros = {};
  document.querySelectorAll('[data-custo]').forEach(campo => {
    const v = campo.value.trim();
    if (v !== '') outros[campo.dataset.custo] = Number(v);
  });
  entrada.outros_custos = outros;
  if (selecaoFv.modulo) entrada.modulo_id = selecaoFv.modulo;
  if (selecaoFv.inversor) entrada.inversor_id = selecaoFv.inversor;
  if (armazenamento && selecaoFv.bateria) entrada.bateria_id = selecaoFv.bateria;

  return {
    erro: '',
    dadosImovel: { cidade: cidade || null, uf: uf || null, hspManual: hsp, consumoManualKwh: consumo },
    entrada
  };
}

/* ---------- cálculo ---------- */

async function dimensionarSolar() {
  if (!idImovelAtual) return;
  const leitura = lerCamposSolar();
  if (leitura.erro) { mostrarErroCampo('erro-solar', leitura.erro); return; }
  mostrarErroCampo('erro-solar', '');
  const botao = porId('btn-solar-dimensionar');
  botao.disabled = true;
  try {
    const im = estado.imoveis.find(i => i.id === idImovelAtual);
    const mudou = ['cidade', 'uf', 'hspManual', 'consumoManualKwh'].some(k => {
      const atual = (im[k] === undefined) ? null : im[k];
      return atual !== leitura.dadosImovel[k];
    });
    if (mudou) {
      Object.assign(im, leitura.dadosImovel);
      if (!(await salvarEstado()) || !idImovelAtual) return; // salvarEstado já avisa o erro
    }
    const resposta = await apiRequest('dimensionar_fv', Object.assign({ imovel_id: idImovelAtual }, leitura.entrada));
    entradaFvAtual = leitura.entrada;
    propostaFvAtual = { resultado: resposta.resultado, entrada: resposta.entrada, imovelNome: resposta.imovel.nome, salva: null };
    renderizarPropostaFv();
  } catch (erro) {
    mostrarErroCampo('erro-solar', erro.message);
    mostrarToast(erro.message, 'erro');
  } finally {
    botao.disabled = false;
  }
}

function popularSelecoesFv(r) {
  const preencher = (idSelect, opcoes, escolhido, textoAuto, habilitado) => {
    const sel = porId(idSelect);
    sel.innerHTML = `<option value="">${escapeHtml(textoAuto)}</option>` +
      opcoes.map(o => `<option value="${escapeAttr(o.id)}">${escapeHtml(o.texto)}</option>`).join('');
    sel.value = escolhido || '';
    if (sel.value !== (escolhido || '')) sel.value = '';
    sel.disabled = !habilitado;
  };
  preencher('solar-sel-modulo', r.modulos.opcoes.map(m => ({
    id: m.id,
    texto: `${m.fabricante} ${m.modelo} - ${fmtFv(m.potencia_wp, 0)} Wp x ${m.n} = ${formatarMoeda(m.custo_arranjo)}${m.recomendado ? ' (menor custo)' : ''}`
  })), selecaoFv.modulo, 'Automático (menor custo)', true);
  preencher('solar-sel-inversor', r.inversores.opcoes.map(i => ({
    id: i.id,
    texto: `${i.fabricante} ${i.modelo} - ${fmtFv(i.potencia_ca_kw, 1)} kW - ${formatarMoeda(i.preco_unitario)}`
  })), selecaoFv.inversor, 'Automático (menor preço compatível)', true);
  preencher('solar-sel-bateria', r.baterias.opcoes.map(b => ({
    id: b.id,
    texto: `${b.fabricante} ${b.modelo} - ${b.n_bat} un. - ${formatarMoeda(b.custo_banco)}`
  })), selecaoFv.bateria, 'Automático (menor custo compatível)', !!r.armazenamento.habilitado);
}

/* ---------- tela da proposta ---------- */

function verificacoesHtml(titulo, lista) {
  if (!lista || !lista.length) return '';
  return `<h4 class="titulo-bloco">${escapeHtml(titulo)}</h4><ul class="lista-verificacoes">` +
    lista.map(v => `<li class="${v.ok ? 'ok' : 'falha'}"><span class="marca-ver">${v.ok ? 'OK' : 'FALHA'}</span> ${escapeHtml(v.mensagem)}</li>`).join('') + '</ul>';
}

function motivosFalha(lista) {
  return (lista || []).filter(v => !v.ok).map(v => v.mensagem).join(' ');
}

function renderizarPropostaFv() {
  const caixa = porId('solar-resultado');
  const p = propostaFvAtual;
  if (!p) { caixa.innerHTML = ''; return; }
  const r = p.resultado;
  popularSelecoesFv(r);

  const completa = !!r.completa;
  const par = r.parametros;
  const orc = r.orcamento;
  const ger = r.geracao;
  const bat = r.sistema.bateria;
  const modEsc = r.modulos.opcoes.find(m => m.id === r.modulos.escolhido) || null;
  const invEsc = r.inversores.opcoes.find(i => i.id === r.inversores.escolhido) || null;

  const cartao = (rotulo, valor, detalhe) => `
    <div class="cartao-metrica"><div class="rotulo-metrica">${escapeHtml(rotulo)}</div>
      <div class="valor-metrica">${valor}</div>${detalhe ? `<div class="detalhe-metrica">${escapeHtml(detalhe)}</div>` : ''}</div>`;
  const dl = (pares) => `<dl class="lista-detalhes">${pares.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;

  let h = '<div class="painel proposta-fv">';
  h += '<div class="cabecalho-proposta"><h3>Proposta preliminar de sistema fotovoltaico</h3><div class="acoes-proposta">';
  if (completa && !p.salva) h += '<button class="btn btn-principal btn-pequeno" id="btn-solar-salvar">Salvar proposta</button>';
  if (completa) h += '<button class="btn btn-pequeno" id="btn-solar-csv">Exportar CSV</button><button class="btn btn-pequeno" id="btn-solar-pdf">Exportar PDF</button>';
  h += '</div></div>';

  if (p.salva) {
    h += `<div class="aviso-snapshot">Proposta salva: <strong>${escapeHtml(p.salva.titulo)}</strong>${p.salva.criadoEm ? ' em ' + escapeHtml(formatarDataHora(p.salva.criadoEm)) : ''}. Valores e preços são os da época do cálculo.</div>`;
  }
  h += `<div class="aviso-academico">${escapeHtml(r.aviso_limitacoes)}</div>`;
  if (r.dados_sinteticos) h += '<div class="bloqueio-solar">ATENÇÃO: esta proposta usa dados SINTÉTICOS (somente para teste).</div>';
  if (r.bloqueios.length) {
    h += `<div class="bloqueio-solar"><strong>Não foi possível concluir o dimensionamento:</strong><ul>${r.bloqueios.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>`;
  }

  h += '<div class="grade-metricas">';
  h += cartao('Consumo de referência', `${fmtFv(r.consumo.valor_kwh_mes, 1)}<span>kWh/mês</span>`, r.consumo.origem === 'manual' ? 'informado manualmente' : 'estimado pelos equipamentos');
  h += cartao('Percentual atendido (f)', `${fmtFv(par.f, 1)}<span>%</span>`);
  h += cartao('Energia a gerar (E_FV)', `${fmtFv(r.e_fv_kwh_mes, 1)}<span>kWh/mês</span>`);
  h += cartao('Potência FV calculada', `${fmtFv(r.p_fv_kwp, 3)}<span>kWp</span>`);
  if (r.sistema.n_modulos > 0) h += cartao('Potência instalada', `${fmtFv(r.sistema.p_instalada_kwp, 3)}<span>kWp</span>`, `${r.sistema.n_modulos} módulos`);
  if (ger) {
    h += cartao('Geração estimada', `${fmtFv(ger.geracao_mensal_kwh, 1)}<span>kWh/mês</span>`);
    h += cartao('Cobertura do consumo', `${fmtFv(ger.cobertura_consumo_pct, 1)}<span>%</span>`);
  }
  if (orc) {
    h += cartao('Custo dos equipamentos', formatarMoeda(orc.custo_equipamentos));
    h += cartao('Outros custos', formatarMoeda(orc.custo_outros));
    h += cartao('Custo total estimado', formatarMoeda(orc.custo_total));
  }
  h += '</div>';
  if (orc && orc.aviso_outros_zerados) {
    h += '<div class="aviso-academico">Atenção: os outros custos (estrutura, cabeamento, proteções e instalação) estão em R$ 0,00. O custo total mostra somente os equipamentos; informe esses custos no formulário para uma estimativa mais completa.</div>';
  }

  const pares = [];
  pares.push(['HSP utilizado', `${fmtFv(r.hsp.hsp, 3)} kWh/m².dia — ${escapeHtml(textoOrigemHsp(r.hsp))}` +
    (r.hsp.origem !== 'manual' ? `<br><span class="ajuda">Fonte: ${escapeHtml(r.hsp.fonte)}. ${linkSeguro(r.hsp.url_fonte, 'abrir fonte')}</span>` : '')]);
  pares.push(['Parâmetros', `η = ${fmtFv(par.eta, 2)}; D = ${fmtFv(par.D, 0)} dias; temperatura mínima = ${fmtFv(par.tmin_c, 0)} °C`]);
  pares.push(['Módulos', r.sistema.n_modulos > 0
    ? `${r.sistema.n_modulos} × ${escapeHtml(r.sistema.modulo)}${modEsc ? ` (${fmtFv(modEsc.potencia_wp, 0)} Wp, eficiência ${fmtFv(modEsc.eficiencia_pct, 1)}%)` : ''}` : '—']);
  pares.push(['Inversor', r.sistema.inversor
    ? `${escapeHtml(r.sistema.inversor)}${invEsc ? ` (${fmtFv(invEsc.potencia_ca_kw, 1)} kW, ${escapeHtml(invEsc.tipo)})` : ''}` : '—']);
  const a = r.armazenamento;
  if (!a.habilitado) {
    pares.push(['Armazenamento', 'Não (solução sem baterias)']);
  } else {
    let texto = `Sim — autonomia de ${fmtFv(a.autonomia_h, 1)} h`;
    if (a.e_autonomia_kwh === null || a.e_autonomia_kwh === undefined) {
      texto += ' (as baterias ainda não foram dimensionadas, porque não há inversor compatível)';
    } else {
      texto += `; energia na autonomia ${fmtFv(a.e_autonomia_kwh, 2)} kWh`;
      if (a.c_bat_kwh !== null && a.c_bat_kwh !== undefined) texto += `; capacidade nominal necessária ${fmtFv(a.c_bat_kwh, 2)} kWh`;
      if (bat) texto += `; instalado: ${bat.n_bat} × ${escapeHtml(bat.descricao)} = ${fmtFv(bat.capacidade_nominal_total_kwh, 2)} kWh nominais (${fmtFv(bat.capacidade_util_total_kwh, 2)} kWh úteis)`;
      else texto += ' (nenhuma bateria compatível com este inversor)';
    }
    pares.push(['Armazenamento', texto]);
  }
  h += dl(pares);

  if (orc) {
    h += '<h4 class="titulo-bloco">Orçamento</h4><div class="tabela-scroll"><table><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Preço unit.</th><th class="num">Subtotal</th><th>Tipo</th></tr></thead><tbody>';
    orc.linhas.forEach(l => {
      h += `<tr><td>${escapeHtml(l.descricao)}</td><td class="num">${fmtFv(l.quantidade, 0)}</td><td class="num">${formatarMoeda(l.preco_unitario)}</td><td class="num">${formatarMoeda(l.subtotal)}</td><td>${l.categoria === 'equipamentos' ? 'Equipamento' : 'Outro custo'}</td></tr>`;
    });
    h += `<tr class="linha-total"><td colspan="3">Custo dos equipamentos</td><td class="num">${formatarMoeda(orc.custo_equipamentos)}</td><td></td></tr>`;
    h += `<tr class="linha-total"><td colspan="3">Outros custos</td><td class="num">${formatarMoeda(orc.custo_outros)}</td><td></td></tr>`;
    h += `<tr class="linha-total"><td colspan="3"><strong>Custo total estimado</strong></td><td class="num"><strong>${formatarMoeda(orc.custo_total)}</strong></td><td></td></tr>`;
    h += '</tbody></table></div>';
  }

  h += verificacoesHtml('Compatibilidade módulo × inversor', invEsc ? invEsc.verificacoes : null);
  h += verificacoesHtml('Compatibilidade bateria × inversor', bat ? bat.verificacoes : null);

  // alternativas consideradas
  h += '<details class="alternativas"><summary>Alternativas consideradas</summary>';
  h += '<h4 class="titulo-bloco">Módulos (menor custo do arranjo primeiro)</h4><div class="tabela-scroll"><table><thead><tr><th>Módulo</th><th class="num">Potência (Wp)</th><th class="num">Qtd.</th><th class="num">Instalada (kWp)</th><th class="num">Custo do arranjo</th><th></th></tr></thead><tbody>';
  r.modulos.opcoes.forEach(m => {
    h += `<tr><td>${escapeHtml(m.fabricante)} ${escapeHtml(m.modelo)}</td><td class="num">${fmtFv(m.potencia_wp, 0)}</td><td class="num">${m.n}</td><td class="num">${fmtFv(m.p_instalada_kwp, 2)}</td><td class="num">${formatarMoeda(m.custo_arranjo)}</td><td>${m.id === r.modulos.escolhido ? '<span class="selo-uso">em uso</span>' : ''}${m.recomendado ? ' <span class="selo-uso">menor custo</span>' : ''}</td></tr>`;
  });
  h += '</tbody></table></div>';

  h += '<h4 class="titulo-bloco">Inversores compatíveis</h4>';
  if (r.inversores.opcoes.length) {
    h += '<div class="tabela-scroll"><table><thead><tr><th>Inversor</th><th>Tipo</th><th class="num">Potência CA (kW)</th><th class="num">Preço</th><th></th></tr></thead><tbody>';
    r.inversores.opcoes.forEach(i => {
      h += `<tr><td>${escapeHtml(i.fabricante)} ${escapeHtml(i.modelo)}</td><td>${escapeHtml(i.tipo)}</td><td class="num">${fmtFv(i.potencia_ca_kw, 1)}</td><td class="num">${formatarMoeda(i.preco_unitario)}</td><td>${i.id === r.inversores.escolhido ? '<span class="selo-uso">em uso</span>' : ''}</td></tr>`;
    });
    h += '</tbody></table></div>';
  } else {
    h += '<p class="ajuda">Nenhum inversor compatível com este arranjo.</p>';
  }
  if (r.inversores.descartados.length) {
    h += '<h4 class="titulo-bloco">Inversores descartados (e por quê)</h4><div class="tabela-scroll"><table><thead><tr><th>Inversor</th><th>Motivo</th></tr></thead><tbody>';
    r.inversores.descartados.forEach(i => {
      h += `<tr><td>${escapeHtml(i.fabricante)} ${escapeHtml(i.modelo)}</td><td>${escapeHtml(motivosFalha(i.verificacoes))}</td></tr>`;
    });
    h += '</tbody></table></div>';
  }

  if (a.habilitado) {
    h += '<h4 class="titulo-bloco">Baterias compatíveis com o inversor</h4>';
    if (r.baterias.opcoes.length) {
      h += '<div class="tabela-scroll"><table><thead><tr><th>Bateria</th><th class="num">Qtd.</th><th class="num">Nominal total (kWh)</th><th class="num">Útil total (kWh)</th><th class="num">Custo do banco</th><th></th></tr></thead><tbody>';
      r.baterias.opcoes.forEach(b => {
        h += `<tr><td>${escapeHtml(b.fabricante)} ${escapeHtml(b.modelo)}</td><td class="num">${b.n_bat}</td><td class="num">${fmtFv(b.capacidade_nominal_total_kwh, 2)}</td><td class="num">${fmtFv(b.capacidade_util_total_kwh, 2)}</td><td class="num">${formatarMoeda(b.custo_banco)}</td><td>${b.id === r.baterias.escolhida ? '<span class="selo-uso">em uso</span>' : ''}</td></tr>`;
      });
      h += '</tbody></table></div>';
    } else {
      h += '<p class="ajuda">Nenhuma bateria compatível com este inversor.</p>';
    }
    if (r.baterias.descartadas.length) {
      h += '<h4 class="titulo-bloco">Baterias descartadas (e por quê)</h4><div class="tabela-scroll"><table><thead><tr><th>Bateria</th><th>Motivo</th></tr></thead><tbody>';
      r.baterias.descartadas.forEach(b => {
        h += `<tr><td>${escapeHtml(b.fabricante)} ${escapeHtml(b.modelo)}</td><td>${escapeHtml(motivosFalha(b.verificacoes))}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
  }
  h += '</details></div>';

  caixa.innerHTML = h;
  const bSalvar = porId('btn-solar-salvar');
  if (bSalvar) bSalvar.addEventListener('click', salvarPropostaFv);
  const bCsv = porId('btn-solar-csv');
  if (bCsv) bCsv.addEventListener('click', exportarPropostaCsv);
  const bPdf = porId('btn-solar-pdf');
  if (bPdf) bPdf.addEventListener('click', exportarPropostaPdf);
}

/* ---------- propostas salvas (US32) ---------- */

async function carregarPropostasFv() {
  const caixa = porId('solar-lista-propostas');
  try {
    const resposta = await apiRequest('listar_propostas', { imovel_id: idImovelAtual });
    renderizarListaPropostasFv(resposta.propostas);
  } catch (erro) {
    caixa.innerHTML = '<p class="ajuda">Não foi possível carregar as propostas salvas.</p>';
  }
}

function renderizarListaPropostasFv(lista) {
  const caixa = porId('solar-lista-propostas');
  if (!lista.length) {
    caixa.innerHTML = '<p class="ajuda">Nenhuma proposta salva para este imóvel.</p>';
    return;
  }
  caixa.innerHTML = '<div class="tabela-scroll"><table><thead><tr><th>Proposta</th><th>Data</th><th class="num">Instalada (kWp)</th><th>Baterias</th><th class="num">Custo total</th><th></th></tr></thead><tbody>' +
    lista.map(p => `<tr>
      <td>${escapeHtml(p.titulo)}</td>
      <td>${escapeHtml(formatarDataHora(p.criado_em))}</td>
      <td class="num">${fmtFv(p.p_instalada_kwp, 2)}</td>
      <td>${p.com_bateria ? 'Sim' : 'Não'}</td>
      <td class="num">${formatarMoeda(p.custo_total)}</td>
      <td style="white-space:nowrap;"><button class="btn btn-pequeno" data-acao="abrir" data-id="${p.id}">Abrir</button>
        <button class="btn btn-pequeno btn-perigo" data-acao="excluir" data-id="${p.id}" data-titulo="${escapeAttr(p.titulo)}">Excluir</button></td>
    </tr>`).join('') + '</tbody></table></div>';
  caixa.querySelectorAll('button[data-acao]').forEach(botao => {
    botao.addEventListener('click', () => {
      const id = Number(botao.dataset.id);
      if (botao.dataset.acao === 'abrir') abrirPropostaFv(id, lista.find(x => x.id === id));
      else excluirPropostaFv(id, botao.dataset.titulo);
    });
  });
}

async function salvarPropostaFv() {
  if (!propostaFvAtual || propostaFvAtual.salva || !propostaFvAtual.resultado.completa) return;
  const padrao = `Proposta ${propostaFvAtual.imovelNome} - ${new Date().toLocaleDateString('pt-BR')}`;
  const titulo = window.prompt('Nome da proposta:', padrao);
  if (titulo === null) return;
  try {
    const resposta = await apiRequest('salvar_proposta', Object.assign({ imovel_id: idImovelAtual, titulo: titulo.trim() }, entradaFvAtual));
    propostaFvAtual.salva = { id: resposta.id, titulo: resposta.titulo, criadoEm: '' };
    renderizarPropostaFv();
    carregarPropostasFv();
    mostrarToast('Proposta salva.', 'sucesso');
  } catch (erro) {
    mostrarErroCampo('erro-solar', erro.message);
    mostrarToast(erro.message, 'erro');
  }
}

function aplicarEntradaNoFormularioFv(entrada) {
  [['f', 'solar-f'], ['eta', 'solar-eta'], ['D', 'solar-d'], ['tmin_c', 'solar-tmin']].forEach(([chave, idCampo]) => {
    porId(idCampo).value = entrada[chave] !== undefined ? entrada[chave] : '';
  });
  const armazenamento = !!entrada.armazenamento;
  porId('solar-armazenamento').checked = armazenamento;
  porId('solar-autonomia').disabled = !armazenamento;
  porId('solar-autonomia').value = (armazenamento && entrada.autonomia_h !== undefined) ? entrada.autonomia_h : '';
  const outros = (entrada.outros_custos && !Array.isArray(entrada.outros_custos)) ? entrada.outros_custos : {};
  document.querySelectorAll('[data-custo]').forEach(campo => {
    campo.value = outros[campo.dataset.custo] !== undefined ? outros[campo.dataset.custo] : '';
  });
  selecaoFv = { modulo: entrada.modulo_id || '', inversor: entrada.inversor_id || '', bateria: entrada.bateria_id || '' };
}

async function abrirPropostaFv(id, resumo) {
  try {
    const resposta = await apiRequest('abrir_proposta', { id });
    const enviados = (resposta.entrada && resposta.entrada.parametros_enviados) || {};
    aplicarEntradaNoFormularioFv(enviados);
    entradaFvAtual = enviados;
    propostaFvAtual = {
      resultado: resposta.resultado,
      entrada: enviados,
      imovelNome: resposta.proposta.imovel_nome,
      salva: { id: resposta.proposta.id, titulo: resposta.proposta.titulo, criadoEm: resposta.proposta.criado_em }
    };
    mostrarErroCampo('erro-solar', '');
    renderizarPropostaFv();
    porId('solar-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

async function excluirPropostaFv(id, titulo) {
  if (!confirm(`Excluir a proposta "${titulo}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await apiRequest('excluir_proposta', { id });
    if (propostaFvAtual && propostaFvAtual.salva && propostaFvAtual.salva.id === id) {
      propostaFvAtual = null;
      renderizarPropostaFv();
    }
    carregarPropostasFv();
    mostrarToast('Proposta excluída.', 'sucesso');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

/* ---------- exportação da proposta (mesmo padrão da exportação da CP1) ---------- */

function linhasResumoProposta(p) {
  const r = p.resultado;
  const par = r.parametros;
  const orc = r.orcamento;
  const ger = r.geracao;
  const a = r.armazenamento;
  const bat = r.sistema.bateria;
  const modEsc = r.modulos.opcoes.find(m => m.id === r.modulos.escolhido) || null;
  const invEsc = r.inversores.opcoes.find(i => i.id === r.inversores.escolhido) || null;
  const linhas = [
    ['Consumo de referência', `${fmtFv(r.consumo.valor_kwh_mes, 2)} kWh/mês (${r.consumo.origem === 'manual' ? 'informado manualmente' : 'estimado pelos equipamentos'})`],
    ['Percentual de atendimento (f)', `${fmtFv(par.f, 1)} %`],
    ['Energia mensal a gerar (E_FV)', `${fmtFv(r.e_fv_kwh_mes, 2)} kWh/mês`],
    ['HSP utilizado', `${fmtFv(r.hsp.hsp, 3)} kWh/m².dia - ${textoOrigemHsp(r.hsp)}`],
    ['Fonte do HSP', r.hsp.origem === 'manual' ? 'Informado manualmente pelo usuário' : `${r.hsp.fonte} (${r.hsp.url_fonte})`],
    ['Fator global de desempenho (eta)', fmtFv(par.eta, 2)],
    ['Dias do mês (D)', fmtFv(par.D, 0)],
    ['Temperatura mínima de projeto', `${fmtFv(par.tmin_c, 0)} °C`],
    ['Potência FV calculada (P_FV)', `${fmtFv(r.p_fv_kwp, 3)} kWp`],
    ['Potência instalada', `${fmtFv(r.sistema.p_instalada_kwp, 3)} kWp`],
    ['Módulos', `${r.sistema.n_modulos} x ${r.sistema.modulo}${modEsc ? ` (${fmtFv(modEsc.potencia_wp, 0)} Wp)` : ''}`],
    ['Inversor', `${r.sistema.inversor}${invEsc ? ` (${fmtFv(invEsc.potencia_ca_kw, 1)} kW, ${invEsc.tipo})` : ''}`]
  ];
  if (!a.habilitado) {
    linhas.push(['Armazenamento', 'Não (solução sem baterias)']);
  } else {
    linhas.push(['Armazenamento', `Sim - autonomia de ${fmtFv(a.autonomia_h, 1)} h`]);
    linhas.push(['Capacidade de armazenamento calculada (nominal)', `${fmtFv(a.c_bat_kwh, 2)} kWh`]);
    if (bat) {
      linhas.push(['Capacidade de armazenamento instalada', `${bat.n_bat} x ${bat.descricao} = ${fmtFv(bat.capacidade_nominal_total_kwh, 2)} kWh nominais (${fmtFv(bat.capacidade_util_total_kwh, 2)} kWh úteis)`]);
    }
  }
  if (ger) {
    linhas.push(['Geração estimada', `${fmtFv(ger.geracao_mensal_kwh, 2)} kWh/mês`]);
    linhas.push(['Cobertura do consumo', `${fmtFv(ger.cobertura_consumo_pct, 1)} %`]);
  }
  linhas.push(['Custo dos equipamentos', formatarMoeda(orc.custo_equipamentos)]);
  linhas.push(['Outros custos', formatarMoeda(orc.custo_outros)]);
  linhas.push(['Custo total estimado', formatarMoeda(orc.custo_total)]);
  return linhas;
}

function exportarPropostaCsv() {
  const p = propostaFvAtual;
  if (!p || !p.resultado.completa) return;
  const r = p.resultado;
  const linhas = [['Proposta preliminar de sistema fotovoltaico'], ['Imóvel', p.imovelNome], ['Aviso', r.aviso_limitacoes], [], ['Item', 'Valor']];
  linhasResumoProposta(p).forEach(l => linhas.push(l));
  linhas.push([]);
  linhas.push(['Orçamento']);
  linhas.push(['Descrição', 'Quantidade', 'Preço unitário', 'Subtotal', 'Tipo']);
  r.orcamento.linhas.forEach(l => linhas.push([l.descricao, fmtFv(l.quantidade, 0), formatarMoeda(l.preco_unitario), formatarMoeda(l.subtotal), l.categoria === 'equipamentos' ? 'Equipamento' : 'Outro custo']));
  baixarCsv(linhas, `proposta_fv_${p.imovelNome.replace(/\s+/g, '_')}.csv`);
}

function exportarPropostaPdf() {
  const p = propostaFvAtual;
  if (!p || !p.resultado.completa) return;
  if (typeof window.jspdf === 'undefined') {
    mostrarToast('Não foi possível carregar a biblioteca de PDF (verifique a conexão com a internet).', 'erro');
    return;
  }
  const r = p.resultado;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margem = 14;
  let y = 18;
  const avancar = (h) => { y += h; if (y > 280) { doc.addPage(); y = 18; } };
  const paragrafo = (texto, largura) => {
    doc.splitTextToSize(String(texto), largura || 182).forEach(linha => { doc.text(linha, margem, y); avancar(5.2); });
  };
  const secao = (titulo) => {
    avancar(3);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(titulo, margem, y); doc.setFont('helvetica', 'normal');
    avancar(7); doc.setFontSize(10);
  };

  doc.setFontSize(16); doc.text('Proposta preliminar de sistema fotovoltaico', margem, y); avancar(9);
  doc.setFontSize(11); doc.text(`Imóvel: ${p.imovelNome}`, margem, y); avancar(8);
  doc.setFontSize(9); paragrafo(`AVISO: ${r.aviso_limitacoes}`); doc.setFontSize(10);

  secao('Dimensionamento');
  linhasResumoProposta(p).forEach(l => paragrafo(`${l[0]}: ${l[1]}`));

  secao('Orçamento');
  doc.setFont('helvetica', 'bold');
  doc.text('Item', margem, y); doc.text('Qtd.', 125, y, { align: 'right' }); doc.text('Preço unit.', 158, y, { align: 'right' }); doc.text('Subtotal', 196, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); avancar(6);
  r.orcamento.linhas.forEach(l => {
    const partes = doc.splitTextToSize(l.descricao, 100);
    doc.text(partes[0], margem, y);
    doc.text(fmtFv(l.quantidade, 0), 125, y, { align: 'right' });
    doc.text(formatarMoeda(l.preco_unitario), 158, y, { align: 'right' });
    doc.text(formatarMoeda(l.subtotal), 196, y, { align: 'right' });
    avancar(5.2);
    partes.slice(1).forEach(resto => { doc.text(resto, margem, y); avancar(5.2); });
  });
  avancar(2);
  doc.text('Custo dos equipamentos', margem, y); doc.text(formatarMoeda(r.orcamento.custo_equipamentos), 196, y, { align: 'right' }); avancar(5.5);
  doc.text('Outros custos', margem, y); doc.text(formatarMoeda(r.orcamento.custo_outros), 196, y, { align: 'right' }); avancar(5.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Custo total estimado', margem, y); doc.text(formatarMoeda(r.orcamento.custo_total), 196, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); avancar(8);
  if (r.orcamento.aviso_outros_zerados) {
    doc.setFontSize(9); paragrafo('Atenção: os outros custos (estrutura, cabeamento, proteções e instalação) estão em R$ 0,00; o total mostra somente os equipamentos.'); doc.setFontSize(10);
  }
  doc.save(`proposta_fv_${p.imovelNome.replace(/\s+/g, '_')}.pdf`);
}

/* ---------- eventos da aba Solar ---------- */

popularUfSolar();

porId('btn-solar-dimensionar').addEventListener('click', () => {
  selecaoFv.inversor = '';
  selecaoFv.bateria = '';
  dimensionarSolar();
});

porId('solar-armazenamento').addEventListener('change', (ev) => {
  porId('solar-autonomia').disabled = !ev.target.checked;
  selecaoFv.inversor = '';
  selecaoFv.bateria = '';
});

porId('solar-cidade').addEventListener('change', () => {
  if (!catalogoFv) return;
  const nome = porId('solar-cidade').value.trim().toLowerCase();
  const achada = catalogoFv.cidades.find(c => c.cidade.toLowerCase() === nome);
  if (achada) porId('solar-uf').value = achada.uf;
});

porId('solar-sel-modulo').addEventListener('change', (ev) => {
  selecaoFv.modulo = ev.target.value;
  selecaoFv.inversor = '';
  selecaoFv.bateria = '';
  dimensionarSolar();
});
porId('solar-sel-inversor').addEventListener('change', (ev) => {
  selecaoFv.inversor = ev.target.value;
  selecaoFv.bateria = '';
  dimensionarSolar();
});
porId('solar-sel-bateria').addEventListener('change', (ev) => {
  selecaoFv.bateria = ev.target.value;
  dimensionarSolar();
});

/* =========================================================================
   TESTES AUTOMATIZADOS (T04 de cada user story)
   ========================================================================= */

function afirmarIgual(valorObtido, valorEsperado, tolerancia) {
  if (tolerancia !== undefined) return Math.abs(valorObtido - valorEsperado) <= tolerancia;
  return valorObtido === valorEsperado;
}

function obterCasosDeTeste() {
  const equipBase = { potencia: 100, quantidade: 2, horasSemana: 5, horasFimSemana: 5 };
  const consumoBase = calcularConsumoEquipamento(equipBase); // 100*2*5*30/1000 = 30
  const equipPerfis = { potencia: 100, quantidade: 1, horasSemana: 10, horasFimSemana: 2 };
  const esperadoPerfis = 23.142857142857142; // (100W × 1 × (10h×21.43 dias + 2h×8.57 dias)) / 1000

  const imovelTeste = {
    equipamentos: [
      { nome: 'A', categoria: 'Cozinha', potencia: 1000, quantidade: 1, horasSemana: 1, horasFimSemana: 1 },
      { nome: 'B', categoria: 'Sala', potencia: 100, quantidade: 1, horasSemana: 1, horasFimSemana: 1 }
    ]
  };
  const agrupado = agruparConsumoPorCategoria(imovelTeste);

  const imA = { equipamentos: [{ potencia: 1000, quantidade: 1, horasSemana: 2, horasFimSemana: 2 }] };
  const imB = { equipamentos: [{ potencia: 2000, quantidade: 1, horasSemana: 2, horasFimSemana: 2 }] };
  const comparacao = compararCenarios(imA, imB);

  const imLimite = { equipamentos: [{ nome: 'Chuveiro', potencia: 5000, quantidade: 1, horasSemana: 2, horasFimSemana: 2 }] };
  const totalImLimite = calcularConsumoTotal(imLimite);
  const abaixoLimite = sugerirReducao(imLimite, totalImLimite + 100);
  const acimaLimite = sugerirReducao(imLimite, 1);

  return [
    { descricao: 'Cálculo de consumo mensal — fórmula (P×Q×H×30)/1000', passou: afirmarIgual(consumoBase, 30, 0.001) },
    { descricao: 'Cálculo de consumo com perfis distintos (semana/fim de semana)', passou: afirmarIgual(calcularConsumoEquipamento(equipPerfis), esperadoPerfis, 0.001) },
    { descricao: 'Cálculo de custo mensal (consumo × tarifa)', passou: afirmarIgual(calcularCusto(100, 0.75), 75, 0.001) },
    { descricao: 'Validação de potência — rejeita zero', passou: validarPotencia(0) === false },
    { descricao: 'Validação de potência — rejeita negativo', passou: validarPotencia(-10) === false },
    { descricao: 'Validação de potência — aceita valor positivo', passou: validarPotencia(150) === true },
    { descricao: 'Validação de horas de uso — rejeita acima de 24h', passou: validarHoras(25) === false },
    { descricao: 'Validação de horas de uso — rejeita negativo', passou: validarHoras(-1) === false },
    { descricao: 'Validação de horas de uso — aceita intervalo 0–24h', passou: validarHoras(24) === true && validarHoras(0) === true },
    { descricao: 'Validação de quantidade — rejeita zero ou negativo', passou: validarQuantidade(0) === false && validarQuantidade(-3) === false },
    { descricao: 'Validação de quantidade — rejeita valor não inteiro', passou: validarQuantidade(2.5) === false },
    { descricao: 'Validação de nome/endereço obrigatórios', passou: validarTexto('') === false && validarTexto('  ') === false && validarTexto('Rua A') === true },
    { descricao: 'Validação de senha — exige mínimo de 8 caracteres', passou: validarSenha('1234567') === false && validarSenha('12345678') === true },
    { descricao: 'Validação de tarifa — rejeita zero ou negativa', passou: validarTarifa(0) === false && validarTarifa(-1) === false && validarTarifa(0.5) === true },
    { descricao: 'Validação de formato de e-mail', passou: validarEmailFormato('teste@dominio.com') === true && validarEmailFormato('invalido') === false },
    { descricao: 'Agrupamento de consumo por categoria — soma correta', passou: afirmarIgual(agrupado['Cozinha'], calcularConsumoEquipamento(imovelTeste.equipamentos[0]), 0.001) },
    { descricao: 'Comparação de cenários — diferença em kWh e percentual', passou: afirmarIgual(comparacao.diffKwh, calcularConsumoTotal(imB) - calcularConsumoTotal(imA), 0.001) && afirmarIgual(comparacao.diffPercentual, 100, 0.01) },
    { descricao: 'Sugestão de redução — não aciona alerta dentro do limite', passou: abaixoLimite.excedeu === false },
    { descricao: 'Sugestão de redução — aciona alerta e sugere ação acima do limite', passou: acimaLimite.excedeu === true && acimaLimite.sugestoes.length > 0 },
    { descricao: 'Detecção de nome de categoria duplicado (case-insensitive)', passou: (() => {
        const backup = estado.categorias;
        estado.categorias = [{ id: 'x', nome: 'Cozinha' }];
        const r = nomeCategoriaDuplicado('cozinha');
        estado.categorias = backup;
        return r === true;
      })() }
  ];
}

document.getElementById('btn-rodar-testes').addEventListener('click', () => {
  const casos = obterCasosDeTeste();
  const passaram = casos.filter(c => c.passou).length;
  document.getElementById('resumo-testes').textContent = `${passaram} / ${casos.length} testes aprovados`;
  document.getElementById('resumo-testes').style.color = passaram === casos.length ? 'var(--green)' : 'var(--red)';
  document.getElementById('lista-testes').innerHTML = casos.map(c => `
    <div class="linha-teste">
      <span>${escapeHtml(c.descricao)}</span>
      <span class="selo ${c.passou ? 'passou' : 'falhou'}">${c.passou ? 'PASSOU' : 'FALHOU'}</span>
    </div>`).join('');
});

/* =========================================================================
   INICIALIZAÇÃO
   ========================================================================= */

async function iniciar() {
  // anima o número de exemplo na tela de login (efeito único, não repetitivo)
  const heroValor = document.getElementById('hero-valor');
  let n = 0;
  const alvo = 247.5;
  const passo = setInterval(() => {
    n += alvo / 20;
    if (n >= alvo) { n = alvo; clearInterval(passo); }
    heroValor.innerHTML = n.toFixed(1) + '<span>kWh/mês</span>';
  }, 40);
}

iniciar();
