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

  // Encerramento gracioso: o Cloud Run envia SIGTERM antes de desligar uma
  // instância (e SIGKILL 10 s depois); no terminal, Ctrl+C envia SIGINT.
  let encerrando = false;
  const encerrar = (sinal) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`${sinal} recebido: finalizando as requisições em andamento...`);
    server.close(async () => {
      await repo.fechar();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

main().catch((err) => {
  console.error('Falha ao iniciar a aplicação:', err.message);
  process.exit(1);
});
