class NotFoundError extends Error {
  constructor(mensagem = 'Produto não encontrado.') {
    super(mensagem);
    this.status = 404;
  }
}

class EstoqueInsuficienteError extends Error {
  constructor(mensagem = 'Estoque insuficiente para esta saída.') {
    super(mensagem);
    this.status = 409;
  }
}

module.exports = { NotFoundError, EstoqueInsuficienteError };
