const { randomUUID } = require('node:crypto');
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { NotFoundError, EstoqueInsuficienteError } = require('./errors');

/**
 * Repositório de produtos usando Amazon DynamoDB.
 * Tabela: chave de partição "id" (String).
 */
class DynamoRepository {
  constructor({ tableName, region, endpoint } = {}) {
    this.tableName = tableName || 'Produtos';
    const client = new DynamoDBClient({
      region: region || 'us-east-1',
      // Use DYNAMODB_ENDPOINT para apontar para o DynamoDB Local em desenvolvimento.
      ...(endpoint ? { endpoint } : {}),
    });
    this.client = client;
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  get nome() {
    return 'DynamoDB';
  }

  async init({ criarTabela = false } = {}) {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: this.tableName }));
    } catch (err) {
      if (err.name !== 'ResourceNotFoundException' || !criarTabela) throw err;
      await this.client.send(
        new CreateTableCommand({
          TableName: this.tableName,
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          BillingMode: 'PAY_PER_REQUEST',
        }),
      );
      await waitUntilTableExists(
        { client: this.client, maxWaitTime: 60 },
        { TableName: this.tableName },
      );
    }
  }

  async listar() {
    const itens = [];
    let ExclusiveStartKey;
    do {
      const res = await this.doc.send(
        new ScanCommand({ TableName: this.tableName, ExclusiveStartKey }),
      );
      itens.push(...(res.Items || []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return itens;
  }

  async buscarPorId(id) {
    const res = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
    if (!res.Item) throw new NotFoundError();
    return res.Item;
  }

  async criar(dados) {
    const agora = new Date().toISOString();
    const produto = { id: randomUUID(), ...dados, criadoEm: agora, atualizadoEm: agora };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: produto,
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
    return produto;
  }

  async atualizar(id, dados) {
    const campos = { ...dados, atualizadoEm: new Date().toISOString() };
    const nomes = {};
    const valores = {};
    const sets = Object.keys(campos).map((campo, i) => {
      nomes[`#c${i}`] = campo;
      valores[`:v${i}`] = campos[campo];
      return `#c${i} = :v${i}`;
    });
    try {
      const res = await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeNames: nomes,
          ExpressionAttributeValues: valores,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes;
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') throw new NotFoundError();
      throw err;
    }
  }

  /** Entrada/saída atômica: a condição impede que o estoque fique negativo. */
  async movimentar(id, { tipo, quantidade }) {
    const delta = tipo === 'entrada' ? quantidade : -quantidade;
    const condicao =
      tipo === 'saida' ? 'attribute_exists(id) AND quantidade >= :q' : 'attribute_exists(id)';
    try {
      const res = await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          UpdateExpression: 'SET quantidade = quantidade + :delta, atualizadoEm = :agora',
          ConditionExpression: condicao,
          ExpressionAttributeValues: {
            ':delta': delta,
            ':agora': new Date().toISOString(),
            ...(tipo === 'saida' ? { ':q': quantidade } : {}),
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes;
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        await this.buscarPorId(id); // lança 404 se o produto não existir
        throw new EstoqueInsuficienteError();
      }
      throw err;
    }
  }

  async remover(id) {
    try {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { id },
          ConditionExpression: 'attribute_exists(id)',
        }),
      );
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') throw new NotFoundError();
      throw err;
    }
  }

  async fechar() {
    this.client.destroy();
  }
}

module.exports = { DynamoRepository };
