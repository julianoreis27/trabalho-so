const { Pool } = require('pg');
const { NotFoundError, EstoqueInsuficienteError } = require('./errors');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS produtos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(120)  NOT NULL,
  categoria       VARCHAR(40)   NOT NULL,
  codigo_barras   VARCHAR(14),
  unidade         VARCHAR(5)    NOT NULL DEFAULT 'un',
  quantidade      INTEGER       NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  estoque_minimo  INTEGER       NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  preco_unitario  NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  validade        DATE,
  fornecedor      VARCHAR(120),
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT now()
);`;

// Mapeamento camelCase (API) <-> snake_case (SQL)
const COLUNAS = {
  nome: 'nome',
  categoria: 'categoria',
  codigoBarras: 'codigo_barras',
  unidade: 'unidade',
  quantidade: 'quantidade',
  estoqueMinimo: 'estoque_minimo',
  precoUnitario: 'preco_unitario',
  validade: 'validade',
  fornecedor: 'fornecedor',
};

const SELECT = `
  SELECT id, nome, categoria, codigo_barras, unidade, quantidade, estoque_minimo,
         preco_unitario, to_char(validade, 'YYYY-MM-DD') AS validade, fornecedor,
         criado_em, atualizado_em
  FROM produtos`;

function paraProduto(row) {
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    codigoBarras: row.codigo_barras,
    unidade: row.unidade,
    quantidade: row.quantidade,
    estoqueMinimo: row.estoque_minimo,
    precoUnitario: Number(row.preco_unitario),
    validade: row.validade,
    fornecedor: row.fornecedor,
    criadoEm: new Date(row.criado_em).toISOString(),
    atualizadoEm: new Date(row.atualizado_em).toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function garantirUuid(id) {
  if (!UUID_RE.test(id)) throw new NotFoundError();
}

/**
 * Repositório de produtos usando PostgreSQL (Amazon RDS / Aurora PostgreSQL).
 */
class PostgresRepository {
  constructor({ connectionString, ssl } = {}) {
    this.pool = new Pool({
      connectionString,
      // No RDS, habilite SSL com DATABASE_SSL=true.
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }

  get nome() {
    return 'RDS (PostgreSQL)';
  }

  async init({ criarTabela = true } = {}) {
    if (criarTabela) await this.pool.query(CREATE_TABLE);
    else await this.pool.query('SELECT 1');
  }

  async listar() {
    const { rows } = await this.pool.query(`${SELECT} ORDER BY nome`);
    return rows.map(paraProduto);
  }

  async buscarPorId(id) {
    garantirUuid(id);
    const { rows } = await this.pool.query(`${SELECT} WHERE id = $1`, [id]);
    if (rows.length === 0) throw new NotFoundError();
    return paraProduto(rows[0]);
  }

  async criar(dados) {
    const campos = Object.keys(COLUNAS);
    const colunas = campos.map((c) => COLUNAS[c]).join(', ');
    const params = campos.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await this.pool.query(
      `INSERT INTO produtos (${colunas}) VALUES (${params}) RETURNING id`,
      campos.map((c) => dados[c]),
    );
    return this.buscarPorId(rows[0].id);
  }

  async atualizar(id, dados) {
    garantirUuid(id);
    const campos = Object.keys(COLUNAS);
    const sets = campos.map((c, i) => `${COLUNAS[c]} = $${i + 2}`).join(', ');
    const { rowCount } = await this.pool.query(
      `UPDATE produtos SET ${sets}, atualizado_em = now() WHERE id = $1`,
      [id, ...campos.map((c) => dados[c])],
    );
    if (rowCount === 0) throw new NotFoundError();
    return this.buscarPorId(id);
  }

  /** Entrada/saída atômica: o WHERE impede que o estoque fique negativo. */
  async movimentar(id, { tipo, quantidade }) {
    garantirUuid(id);
    const delta = tipo === 'entrada' ? quantidade : -quantidade;
    const { rowCount } = await this.pool.query(
      `UPDATE produtos
          SET quantidade = quantidade + $2, atualizado_em = now()
        WHERE id = $1 AND quantidade + $2 >= 0`,
      [id, delta],
    );
    if (rowCount === 0) {
      await this.buscarPorId(id); // lança 404 se o produto não existir
      throw new EstoqueInsuficienteError();
    }
    return this.buscarPorId(id);
  }

  async remover(id) {
    garantirUuid(id);
    const { rowCount } = await this.pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    if (rowCount === 0) throw new NotFoundError();
  }

  async fechar() {
    await this.pool.end();
  }
}

module.exports = { PostgresRepository };
