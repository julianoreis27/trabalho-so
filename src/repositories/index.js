const { PostgresRepository } = require('./postgresRepository');

/**
 * Cria o repositório PostgreSQL a partir das variáveis de ambiente.
 *
 *   DATABASE_URL  - local:     postgres://estoque:estoque@localhost:5432/estoque
 *                   Cloud SQL: postgresql://USUARIO:SENHA@/BANCO?host=/cloudsql/PROJETO:REGIAO:INSTANCIA
 *   DATABASE_SSL  - "true" para conexões TCP com SSL (não é preciso no socket do Cloud SQL)
 */
function criarRepositorio(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL com o endereço do PostgreSQL (veja o .env.example).');
  }
  return new PostgresRepository({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true',
  });
}

module.exports = { criarRepositorio };
