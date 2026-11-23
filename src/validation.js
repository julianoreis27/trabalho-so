const UNIDADES = ['un', 'kg', 'g', 'L', 'mL', 'cx', 'pct'];

const CATEGORIAS = [
  'Hortifruti',
  'Açougue',
  'Padaria',
  'Laticínios',
  'Mercearia',
  'Bebidas',
  'Congelados',
  'Limpeza',
  'Higiene',
  'Outros',
];

class ValidationError extends Error {
  constructor(erros) {
    super('Dados inválidos');
    this.status = 400;
    this.erros = erros;
  }
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function inteiro(valor) {
  if (valor === '' || valor === null || valor === undefined) return NaN;
  const n = Number(valor);
  return Number.isInteger(n) ? n : NaN;
}

function dataValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/**
 * Valida e normaliza os dados de um produto vindos do cliente.
 * Retorna apenas os campos conhecidos, já convertidos para os tipos corretos.
 */
function validarProduto(body) {
  const erros = {};
  const dados = body && typeof body === 'object' ? body : {};

  const nome = texto(dados.nome);
  if (nome.length < 2 || nome.length > 120) {
    erros.nome = 'Informe um nome entre 2 e 120 caracteres.';
  }

  const categoria = texto(dados.categoria);
  if (!CATEGORIAS.includes(categoria)) {
    erros.categoria = 'Selecione uma categoria válida.';
  }

  const codigoBarras = texto(dados.codigoBarras);
  if (codigoBarras && !/^\d{8,14}$/.test(codigoBarras)) {
    erros.codigoBarras = 'O código de barras deve ter de 8 a 14 dígitos.';
  }

  const unidade = texto(dados.unidade) || 'un';
  if (!UNIDADES.includes(unidade)) {
    erros.unidade = 'Unidade de medida inválida.';
  }

  const quantidade = inteiro(dados.quantidade);
  if (Number.isNaN(quantidade) || quantidade < 0) {
    erros.quantidade = 'A quantidade deve ser um número inteiro maior ou igual a zero.';
  }

  const estoqueMinimo = inteiro(dados.estoqueMinimo ?? 0);
  if (Number.isNaN(estoqueMinimo) || estoqueMinimo < 0) {
    erros.estoqueMinimo = 'O estoque mínimo deve ser um número inteiro maior ou igual a zero.';
  }

  const precoUnitario = Number(dados.precoUnitario);
  if (dados.precoUnitario === '' || !Number.isFinite(precoUnitario) || precoUnitario < 0) {
    erros.precoUnitario = 'Informe um preço válido (maior ou igual a zero).';
  }

  const validade = texto(dados.validade);
  if (validade && !dataValida(validade)) {
    erros.validade = 'Data de validade inválida (use AAAA-MM-DD).';
  }

  const fornecedor = texto(dados.fornecedor);
  if (fornecedor.length > 120) {
    erros.fornecedor = 'O fornecedor deve ter no máximo 120 caracteres.';
  }

  if (Object.keys(erros).length > 0) throw new ValidationError(erros);

  return {
    nome,
    categoria,
    codigoBarras: codigoBarras || null,
    unidade,
    quantidade,
    estoqueMinimo,
    precoUnitario: Math.round(precoUnitario * 100) / 100,
    validade: validade || null,
    fornecedor: fornecedor || null,
  };
}

function validarMovimentacao(body) {
  const dados = body && typeof body === 'object' ? body : {};
  const erros = {};
  if (!['entrada', 'saida'].includes(dados.tipo)) {
    erros.tipo = 'O tipo deve ser "entrada" ou "saida".';
  }
  const quantidade = inteiro(dados.quantidade);
  if (Number.isNaN(quantidade) || quantidade <= 0) {
    erros.quantidade = 'A quantidade deve ser um número inteiro maior que zero.';
  }
  if (Object.keys(erros).length > 0) throw new ValidationError(erros);
  return { tipo: dados.tipo, quantidade };
}

module.exports = { validarProduto, validarMovimentacao, ValidationError, CATEGORIAS, UNIDADES };
