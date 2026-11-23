const path = require('node:path');
const express = require('express');
const {
  validarProduto,
  validarMovimentacao,
  CATEGORIAS,
  UNIDADES,
} = require('./validation');

function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function criarApp(repo) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const api = express.Router();

  api.get('/health', (req, res) => {
    res.json({ status: 'ok', banco: repo.nome });
  });

  api.get('/opcoes', (req, res) => {
    res.json({ categorias: CATEGORIAS, unidades: UNIDADES });
  });

  // READ (lista) — filtros opcionais: ?busca=&categoria=&status=baixo|vencendo
  api.get('/produtos', async (req, res) => {
    const { busca, categoria, status } = req.query;
    let produtos = await repo.listar();

    if (busca) {
      const termo = normalizar(busca);
      produtos = produtos.filter(
        (p) =>
          normalizar(p.nome).includes(termo) ||
          normalizar(p.fornecedor).includes(termo) ||
          (p.codigoBarras || '').includes(termo),
      );
    }
    if (categoria) produtos = produtos.filter((p) => p.categoria === categoria);
    if (status === 'baixo') produtos = produtos.filter((p) => p.quantidade <= p.estoqueMinimo);
    if (status === 'vencendo') {
      const limite = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      produtos = produtos.filter((p) => p.validade && p.validade <= limite);
    }

    produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json(produtos);
  });

  // READ (um)
  api.get('/produtos/:id', async (req, res) => {
    res.json(await repo.buscarPorId(req.params.id));
  });

  // CREATE
  api.post('/produtos', async (req, res) => {
    const produto = await repo.criar(validarProduto(req.body));
    res.status(201).json(produto);
  });

  // UPDATE
  api.put('/produtos/:id', async (req, res) => {
    res.json(await repo.atualizar(req.params.id, validarProduto(req.body)));
  });

  // Entrada / saída de estoque
  api.post('/produtos/:id/movimentacoes', async (req, res) => {
    res.json(await repo.movimentar(req.params.id, validarMovimentacao(req.body)));
  });

  // DELETE
  api.delete('/produtos/:id', async (req, res) => {
    await repo.remover(req.params.id);
    res.status(204).end();
  });

  app.use('/api', api);

  app.use('/api', (req, res) => {
    res.status(404).json({ mensagem: 'Rota não encontrada.' });
  });

  // Tratamento centralizado de erros (Express 5 propaga erros de handlers async)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ mensagem: 'JSON inválido.' });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ mensagem: err.message, erros: err.erros });
    }
    console.error(err);
    res.status(500).json({ mensagem: 'Erro interno ao acessar o banco de dados.' });
  });

  return app;
}

module.exports = { criarApp };
