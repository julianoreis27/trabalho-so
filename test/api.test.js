// Testes de integração da API contra um PostgreSQL real.
//
// Usa TEST_DATABASE_URL ou, se não estiver definida, o banco do
// docker compose (postgres://estoque:estoque@localhost:5432/estoque).
// Os testes criam um banco temporário próprio e o apagam no final,
// então não mexem nos dados de desenvolvimento.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { criarApp } = require('../src/app');
const { PostgresRepository } = require('../src/repositories/postgresRepository');

const URL_BASE = process.env.TEST_DATABASE_URL || 'postgres://estoque:estoque@localhost:5432/estoque';
const BANCO_TESTE = `estoque_teste_${process.pid}`;

const arroz = {
  nome: 'Arroz Branco Tipo 1 5kg',
  categoria: 'Mercearia',
  codigoBarras: '7891234567890',
  quantidade: 40,
  unidade: 'pct',
  estoqueMinimo: 10,
  precoUnitario: 27.9,
  validade: '2027-03-15',
  fornecedor: 'Distribuidora Grão Bom',
};

describe('API de produtos (PostgreSQL)', () => {
  let admin;
  let server;
  let base;
  let repo;

  const api = async (caminho, opcoes = {}) => {
    const res = await fetch(base + caminho, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    });
    const texto = await res.text();
    return { status: res.status, body: texto ? JSON.parse(texto) : null };
  };

  before(async () => {
    admin = new Client({ connectionString: URL_BASE });
    try {
      await admin.connect();
    } catch (err) {
      throw new Error(
        `Não foi possível conectar ao PostgreSQL (${err.message}). `
        + 'Suba o banco com "docker compose up -d" ou defina TEST_DATABASE_URL.',
      );
    }
    await admin.query(`CREATE DATABASE ${BANCO_TESTE}`);

    const url = new URL(URL_BASE);
    url.pathname = `/${BANCO_TESTE}`;
    repo = new PostgresRepository({ connectionString: url.toString() });
    await repo.init({ criarTabela: true });

    server = criarApp(repo).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (repo) await repo.fechar();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${BANCO_TESTE}`).catch(() => {});
      await admin.end();
    }
  });

  let id;

  it('informa o banco em uso', async () => {
    const r = await api('/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.banco, 'PostgreSQL');
  });

  it('cria um produto (CREATE)', async () => {
    const r = await api('/produtos', { method: 'POST', body: arroz });
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    assert.equal(r.body.nome, arroz.nome);
    assert.equal(r.body.precoUnitario, 27.9);
    assert.equal(r.body.validade, '2027-03-15');
    id = r.body.id;
  });

  it('rejeita dados inválidos com mensagens por campo', async () => {
    const r = await api('/produtos', {
      method: 'POST',
      body: { nome: 'X', categoria: 'Nada', quantidade: -1, precoUnitario: 'abc', codigoBarras: '12' },
    });
    assert.equal(r.status, 400);
    for (const campo of ['nome', 'categoria', 'quantidade', 'precoUnitario', 'codigoBarras']) {
      assert.ok(r.body.erros[campo], `esperava erro em ${campo}`);
    }
  });

  it('lista e consulta produtos (READ)', async () => {
    await api('/produtos', {
      method: 'POST',
      body: { nome: 'Leite Integral 1L', categoria: 'Laticínios', quantidade: 3, estoqueMinimo: 12, precoUnitario: 5.49 },
    });
    const lista = await api('/produtos');
    assert.equal(lista.status, 200);
    assert.equal(lista.body.length, 2);

    const um = await api(`/produtos/${id}`);
    assert.equal(um.status, 200);
    assert.equal(um.body.codigoBarras, arroz.codigoBarras);
  });

  it('filtra por busca (sem acento), categoria e estoque baixo', async () => {
    assert.equal((await api('/produtos?busca=GRAO')).body.length, 1);
    assert.equal((await api('/produtos?categoria=Latic%C3%ADnios')).body.length, 1);
    const baixo = await api('/produtos?status=baixo');
    assert.deepEqual(baixo.body.map((p) => p.nome), ['Leite Integral 1L']);
  });

  it('atualiza um produto (UPDATE)', async () => {
    const r = await api(`/produtos/${id}`, {
      method: 'PUT',
      body: { ...arroz, precoUnitario: 25.5, quantidade: 35 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.precoUnitario, 25.5);
    assert.equal(r.body.quantidade, 35);
  });

  it('registra entrada e saída de estoque', async () => {
    let r = await api(`/produtos/${id}/movimentacoes`, { method: 'POST', body: { tipo: 'entrada', quantidade: 5 } });
    assert.equal(r.body.quantidade, 40);
    r = await api(`/produtos/${id}/movimentacoes`, { method: 'POST', body: { tipo: 'saida', quantidade: 15 } });
    assert.equal(r.body.quantidade, 25);
  });

  it('impede saída maior que o estoque', async () => {
    const r = await api(`/produtos/${id}/movimentacoes`, { method: 'POST', body: { tipo: 'saida', quantidade: 999 } });
    assert.equal(r.status, 409);
    assert.equal((await api(`/produtos/${id}`)).body.quantidade, 25);
  });

  it('saídas simultâneas nunca vendem mais do que o estoque (condição de corrida)', async () => {
    const criado = await api('/produtos', {
      method: 'POST',
      body: { nome: 'Feijão Carioca 1kg', categoria: 'Mercearia', quantidade: 30, precoUnitario: 8.49 },
    });
    // 100 caixas tentam vender 1 unidade ao mesmo tempo
    const respostas = await Promise.all(Array.from({ length: 100 }, () =>
      api(`/produtos/${criado.body.id}/movimentacoes`, { method: 'POST', body: { tipo: 'saida', quantidade: 1 } })));
    assert.equal(respostas.filter((r) => r.status === 200).length, 30);
    assert.equal(respostas.filter((r) => r.status === 409).length, 70);
    assert.equal((await api(`/produtos/${criado.body.id}`)).body.quantidade, 0);
  });

  it('exclui um produto (DELETE)', async () => {
    assert.equal((await api(`/produtos/${id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(`/produtos/${id}`)).status, 404);
    assert.equal((await api(`/produtos/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await api(`/produtos/${id}`, { method: 'PUT', body: arroz })).status, 404);
  });
});
