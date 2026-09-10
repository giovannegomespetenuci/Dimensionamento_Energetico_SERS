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

document.getElementById('btn-exportar-csv').addEventListener('click', () => {
  const im = estado.imoveis.find(i => i.id === idImovelAtual);
  if (!im) return;
  const linhas = [['Imóvel', im.nome], ['Endereço', im.endereco], [], ['Equipamento', 'Categoria', 'Consumo (kWh/mês)']];
  im.equipamentos.forEach(e => linhas.push([e.nome, e.categoria, calcularConsumoEquipamento(e).toFixed(2)]));
  linhas.push([]);
  linhas.push(['Consumo total (kWh/mês)', calcularConsumoTotal(im).toFixed(2)]);
  if (im.tarifa) linhas.push(['Custo estimado', formatarMoeda(calcularCusto(calcularConsumoTotal(im), im.tarifa))]);
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_${im.nome.replace(/\s+/g, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
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

function localizarValorColuna(linhaObjeto, possiveisNomes) {
  const chaves = Object.keys(linhaObjeto);
  for (const nomeAlvo of possiveisNomes) {
    const chave = chaves.find(k => k.trim().toLowerCase() === nomeAlvo);
    if (chave !== undefined) return linhaObjeto[chave];
  }
  return undefined;
}

function validarEProcessarLinhas(linhasBrutas) {
  const validas = [];
  const invalidas = [];
  linhasBrutas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 cabeçalho, +1 base 1
    const nome = localizarValorColuna(linha, ['nome']);
    const categoria = localizarValorColuna(linha, ['categoria']);
    const potenciaBruta = localizarValorColuna(linha, ['potencia', 'potência', 'potencia (w)', 'potência (w)']);
    const motivos = [];
    if (!validarTexto(nome)) motivos.push('nome ausente');
    if (!validarTexto(categoria)) motivos.push('categoria ausente');
    if (!validarPotencia(potenciaBruta)) motivos.push('potência inválida (deve ser numérica e maior que zero)');
    if (motivos.length > 0) {
      invalidas.push({ numeroLinha, motivos });
    } else {
      validas.push({ nome: String(nome).trim(), categoria: String(categoria).trim(), potencia: Number(potenciaBruta) });
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
  };

  if (extensao === 'csv') {
    if (typeof Papa === 'undefined') { mostrarToast('Biblioteca de leitura de CSV indisponível (verifique a conexão).', 'erro'); return; }
    Papa.parse(arquivo, { header: true, skipEmptyLines: true, complete: (res) => processar(res.data) });
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
  const imA = estado.imoveis.find(i => i.id === idA);
  const imB = estado.imoveis.find(i => i.id === idB);
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
