const { DynamoRepository } = require('./dynamoRepository');
const { PostgresRepository } = require('./postgresRepository');

/**
 * Cria o repositório conforme a variável DB_CLIENT:
 *   - "dynamodb" (padrão): Amazon DynamoDB
 *   - "postgres":          Amazon RDS for PostgreSQL
 */
function criarRepositorio(env = process.env) {
  const tipo = (env.DB_CLIENT || 'dynamodb').toLowerCase();

  if (tipo === 'dynamodb') {
    return new DynamoRepository({
      tableName: env.DYNAMODB_TABLE,
      region: env.AWS_REGION,
      endpoint: env.DYNAMODB_ENDPOINT,
    });
  }

  if (tipo === 'postgres' || tipo === 'rds') {
    if (!env.DATABASE_URL) throw new Error('Defina DATABASE_URL para usar o PostgreSQL/RDS.');
    return new PostgresRepository({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL === 'true',
    });
  }

  throw new Error(`DB_CLIENT inválido: "${tipo}". Use "dynamodb" ou "postgres".`);
}

module.exports = { criarRepositorio };
