require('dotenv').config();
const { criarApp } = require('./app');
const { criarRepositorio } = require('./repositories');

async function main() {
  const repo = criarRepositorio();
  await repo.init({ criarTabela: process.env.AUTO_CREATE_TABLE !== 'false' });

  const port = Number(process.env.PORT) || 3000;
  const server = criarApp(repo).listen(port, () => {
    console.log(`Estoque do supermercado rodando em http://localhost:${port} (banco: ${repo.nome})`);
  });

  const encerrar = () => {
    server.close(async () => {
      await repo.fechar();
      process.exit(0);
    });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err) => {
  console.error('Falha ao iniciar a aplicação:', err.message);
  process.exit(1);
});
