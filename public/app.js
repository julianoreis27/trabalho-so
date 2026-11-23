const API = '/api';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR');

const el = (id) => document.getElementById(id);
const modalProduto = el('modal-produto');
const formProduto = el('form-produto');
const modalMov = el('modal-mov');
const formMov = el('form-mov');

let produtos = [];
let editandoId = null;
let movimentandoId = null;

// ---------- utilidades ----------
function escapar(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function hojeISO(diasAFrente = 0) {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

let toastTimer;
function toast(msg, erro = false) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.toggle('erro-toast', erro);
  t.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visivel'), 3000);
}

async function requisicao(caminho, opcoes = {}) {
  const res = await fetch(API + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  if (res.status === 204) return null;
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(corpo.mensagem || `Erro ${res.status}`);
    err.erros = corpo.erros;
    throw err;
  }
  return corpo;
}

// ---------- situação do produto ----------
function situacao(p) {
  const hoje = hojeISO();
  if (p.validade && p.validade < hoje) return { classe: 'tag-baixo', texto: 'Vencido' };
  if (p.quantidade === 0) return { classe: 'tag-baixo', texto: 'Sem estoque' };
  if (p.quantidade <= p.estoqueMinimo) return { classe: 'tag-baixo', texto: 'Estoque baixo' };
  if (p.validade && p.validade <= hojeISO(7)) return { classe: 'tag-aviso', texto: 'Vence em breve' };
  return { classe: 'tag-ok', texto: 'OK' };
}

// ---------- renderização ----------
function renderizarResumo(lista) {
  const limite = hojeISO(7);
  el('kpi-produtos').textContent = inteiro.format(lista.length);
  el('kpi-itens').textContent = inteiro.format(lista.reduce((s, p) => s + p.quantidade, 0));
  el('kpi-valor').textContent = moeda.format(
    lista.reduce((s, p) => s + p.quantidade * p.precoUnitario, 0),
  );
  el('kpi-baixo').textContent = inteiro.format(
    lista.filter((p) => p.quantidade <= p.estoqueMinimo).length,
  );
  el('kpi-vencendo').textContent = inteiro.format(
    lista.filter((p) => p.validade && p.validade <= limite).length,
  );
}

function renderizarTabela(lista) {
  el('vazio').hidden = lista.length > 0;
  el('lista').innerHTML = lista.map((p) => {
    const s = situacao(p);
    const meta = [p.codigoBarras, p.fornecedor].filter(Boolean).map(escapar).join(' · ');
    return `
      <tr>
        <td>
          <div class="produto-nome">${escapar(p.nome)}</div>
          ${meta ? `<div class="produto-meta">${meta}</div>` : ''}
        </td>
        <td>${escapar(p.categoria)}</td>
        <td class="num">${inteiro.format(p.quantidade)} ${escapar(p.unidade)}
          <div class="produto-meta">mín. ${inteiro.format(p.estoqueMinimo)}</div></td>
        <td class="num">${moeda.format(p.precoUnitario)}</td>
        <td class="num">${moeda.format(p.precoUnitario * p.quantidade)}</td>
        <td>${formatarData(p.validade)}</td>
        <td><span class="tag ${s.classe}">${s.texto}</span></td>
        <td>
          <div class="acoes">
            <button class="btn btn-sm" data-acao="mov" data-id="${p.id}" title="Entrada / saída">± Estoque</button>
            <button class="btn btn-sm" data-acao="editar" data-id="${p.id}">Editar</button>
            <button class="btn btn-sm btn-perigo" data-acao="excluir" data-id="${p.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ---------- carregamento ----------
async function carregar() {
  const params = new URLSearchParams();
  const busca = el('busca').value.trim();
  const categoria = el('filtro-categoria').value;
  const status = el('filtro-status').value;
  if (busca) params.set('busca', busca);
  if (categoria) params.set('categoria', categoria);
  if (status) params.set('status', status);

  try {
    const [todos, filtrados] = await Promise.all([
      requisicao('/produtos'),
      params.toString() ? requisicao(`/produtos?${params}`) : null,
    ]);
    produtos = todos;
    renderizarResumo(todos);
    renderizarTabela(filtrados ?? todos);
  } catch (err) {
    toast(`Não foi possível carregar os produtos: ${err.message}`, true);
  }
}

async function iniciar() {
  try {
    const [saude, opcoes] = await Promise.all([requisicao('/health'), requisicao('/opcoes')]);
    el('banco').textContent = `Banco: ${saude.banco}`;

    const optsCategoria = opcoes.categorias
      .map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
    el('filtro-categoria').insertAdjacentHTML('beforeend', optsCategoria);
    formProduto.categoria.innerHTML = `<option value="">Selecione…</option>${optsCategoria}`;
    formProduto.unidade.innerHTML = opcoes.unidades
      .map((u) => `<option value="${escapar(u)}">${escapar(u)}</option>`).join('');
  } catch (err) {
    el('banco').textContent = 'Banco indisponível';
    toast(`Falha ao conectar à API: ${err.message}`, true);
  }
  await carregar();
}

// ---------- formulário de produto ----------
function limparErros(form) {
  form.querySelectorAll('.erro').forEach((e) => { e.textContent = ''; });
  form.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
}

function mostrarErros(form, erros = {}) {
  Object.entries(erros).forEach(([campo, msg]) => {
    const alvo = form.querySelector(`[data-erro="${campo}"]`);
    if (alvo) alvo.textContent = msg;
    if (form[campo]) form[campo].classList.add('invalido');
  });
}

function abrirFormulario(produto = null) {
  editandoId = produto?.id ?? null;
  formProduto.reset();
  limparErros(formProduto);
  el('modal-titulo').textContent = produto ? 'Editar produto' : 'Novo produto';
  if (produto) {
    ['nome', 'categoria', 'codigoBarras', 'quantidade', 'unidade', 'estoqueMinimo',
      'precoUnitario', 'validade', 'fornecedor'].forEach((campo) => {
      formProduto[campo].value = produto[campo] ?? '';
    });
  }
  modalProduto.showModal();
  formProduto.nome.focus();
}

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErros(formProduto);
  const dados = Object.fromEntries(new FormData(formProduto));
  try {
    if (editandoId) {
      await requisicao(`/produtos/${editandoId}`, { method: 'PUT', body: JSON.stringify(dados) });
      toast('Produto atualizado.');
    } else {
      await requisicao('/produtos', { method: 'POST', body: JSON.stringify(dados) });
      toast('Produto cadastrado.');
    }
    modalProduto.close();
    await carregar();
  } catch (err) {
    if (err.erros) mostrarErros(formProduto, err.erros);
    else toast(err.message, true);
  }
});

// ---------- movimentação ----------
function abrirMovimentacao(produto) {
  movimentandoId = produto.id;
  formMov.reset();
  limparErros(formMov);
  el('mov-produto').textContent =
    `${produto.nome} — estoque atual: ${inteiro.format(produto.quantidade)} ${produto.unidade}`;
  modalMov.showModal();
  formMov.quantidade.focus();
}

formMov.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErros(formMov);
  const dados = Object.fromEntries(new FormData(formMov));
  try {
    const p = await requisicao(`/produtos/${movimentandoId}/movimentacoes`, {
      method: 'POST',
      body: JSON.stringify(dados),
    });
    modalMov.close();
    toast(`${dados.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada. Novo estoque: ${p.quantidade} ${p.unidade}.`);
    await carregar();
  } catch (err) {
    if (err.erros) mostrarErros(formMov, err.erros);
    else toast(err.message, true);
  }
});

// ---------- exclusão ----------
async function excluir(produto) {
  if (!confirm(`Excluir "${produto.nome}" do estoque?`)) return;
  try {
    await requisicao(`/produtos/${produto.id}`, { method: 'DELETE' });
    toast('Produto excluído.');
    await carregar();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- eventos ----------
el('btn-novo').addEventListener('click', () => abrirFormulario());

el('lista').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const produto = produtos.find((p) => p.id === btn.dataset.id);
  if (!produto) return;
  if (btn.dataset.acao === 'editar') abrirFormulario(produto);
  if (btn.dataset.acao === 'mov') abrirMovimentacao(produto);
  if (btn.dataset.acao === 'excluir') excluir(produto);
});

document.querySelectorAll('[data-fechar]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

let buscaTimer;
el('busca').addEventListener('input', () => {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(carregar, 250);
});
el('filtro-categoria').addEventListener('change', carregar);
el('filtro-status').addEventListener('change', carregar);

iniciar();
