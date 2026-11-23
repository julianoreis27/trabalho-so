// Testes de integração da API contra bancos reais:
//  - DynamoDB: emulado em memória com o "dynalite" (sempre executado)
//  - PostgreSQL: executado apenas se TEST_DATABASE_URL estiver definida
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const dynalite = require('dynalite');
const { criarApp } = require('../src/app');
const { DynamoRepository } = require('../src/repositories/dynamoRepository');
const { PostgresRepository } = require('../src/repositories/postgresRepository');

process.env.AWS_ACCESS_KEY_ID ||= 'teste';
process.env.AWS_SECRET_ACCESS_KEY ||= 'teste';

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

function suite(nomeBanco, criarRepo, encerrar) {
  describe(`API de produtos (${nomeBanco})`, () => {
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
      repo = await criarRepo();
      server = criarApp(repo).listen(0);
      await new Promise((r) => server.once('listening', r));
      base = `http://127.0.0.1:${server.address().port}/api`;
    });

    after(async () => {
      await new Promise((r) => server.close(r));
      await repo.fechar();
      if (encerrar) await encerrar();
    });

    let id;

    it('informa o banco em uso', async () => {
      const r = await api('/health');
      assert.equal(r.status, 200);
      assert.equal(r.body.banco, repo.nome);
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

    it('exclui um produto (DELETE)', async () => {
      assert.equal((await api(`/produtos/${id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await api(`/produtos/${id}`)).status, 404);
      assert.equal((await api(`/produtos/${id}`, { method: 'DELETE' })).status, 404);
      assert.equal((await api(`/produtos/${id}`, { method: 'PUT', body: arroz })).status, 404);
    });
  });
}

// DynamoDB (via dynalite)
let dyn;
suite(
  'DynamoDB',
  async () => {
    dyn = dynalite({ createTableMs: 0, deleteTableMs: 0 });
    await new Promise((r) => dyn.listen(0, r));
    const repo = new DynamoRepository({
      tableName: 'ProdutosTeste',
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${dyn.address().port}`,
    });
    await repo.init({ criarTabela: true });
    return repo;
  },
  () => new Promise((r) => dyn.close(r)),
);

// PostgreSQL / RDS (opcional)
if (process.env.TEST_DATABASE_URL) {
  suite('PostgreSQL', async () => {
    const repo = new PostgresRepository({ connectionString: process.env.TEST_DATABASE_URL });
    await repo.init({ criarTabela: true });
    await repo.pool.query('TRUNCATE produtos');
    return repo;
  });
}
