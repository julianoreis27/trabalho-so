// Popula o banco configurado no .env com produtos de exemplo.
// Uso: npm run seed
require('dotenv').config();
const { criarRepositorio } = require('../src/repositories');
const { validarProduto } = require('../src/validation');

function emDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const exemplos = [
  { nome: 'Arroz Branco Tipo 1 5kg', categoria: 'Mercearia', codigoBarras: '7896006716112', quantidade: 48, unidade: 'pct', estoqueMinimo: 15, precoUnitario: 27.9, validade: emDias(240), fornecedor: 'Distribuidora Grão Bom' },
  { nome: 'Feijão Carioca 1kg', categoria: 'Mercearia', codigoBarras: '7896006744115', quantidade: 9, unidade: 'pct', estoqueMinimo: 20, precoUnitario: 8.49, validade: emDias(180), fornecedor: 'Distribuidora Grão Bom' },
  { nome: 'Leite Integral UHT 1L', categoria: 'Laticínios', codigoBarras: '7891025100013', quantidade: 120, unidade: 'un', estoqueMinimo: 60, precoUnitario: 5.29, validade: emDias(5), fornecedor: 'Laticínios Serra Verde' },
  { nome: 'Queijo Mussarela', categoria: 'Laticínios', quantidade: 14, unidade: 'kg', estoqueMinimo: 5, precoUnitario: 44.9, validade: emDias(20), fornecedor: 'Laticínios Serra Verde' },
  { nome: 'Pão Francês', categoria: 'Padaria', quantidade: 30, unidade: 'kg', estoqueMinimo: 10, precoUnitario: 16.9, validade: emDias(1), fornecedor: 'Produção própria' },
  { nome: 'Banana Prata', categoria: 'Hortifruti', quantidade: 55, unidade: 'kg', estoqueMinimo: 20, precoUnitario: 6.99, validade: emDias(6), fornecedor: 'Ceasa' },
  { nome: 'Tomate Italiano', categoria: 'Hortifruti', quantidade: 0, unidade: 'kg', estoqueMinimo: 15, precoUnitario: 9.49, fornecedor: 'Ceasa' },
  { nome: 'Patinho Bovino', categoria: 'Açougue', quantidade: 22, unidade: 'kg', estoqueMinimo: 8, precoUnitario: 49.9, validade: emDias(4), fornecedor: 'Frigorífico Boi Forte' },
  { nome: 'Refrigerante Cola 2L', categoria: 'Bebidas', codigoBarras: '7894900011517', quantidade: 96, unidade: 'un', estoqueMinimo: 36, precoUnitario: 10.99, validade: emDias(150), fornecedor: 'Bebidas Brasil' },
  { nome: 'Água Mineral 500mL', categoria: 'Bebidas', codigoBarras: '7896065880014', quantidade: 200, unidade: 'un', estoqueMinimo: 48, precoUnitario: 2.19, validade: emDias(365), fornecedor: 'Fonte Clara' },
  { nome: 'Pizza Congelada Calabresa', categoria: 'Congelados', quantidade: 18, unidade: 'un', estoqueMinimo: 10, precoUnitario: 21.9, validade: emDias(90), fornecedor: 'Sabor Gelado' },
  { nome: 'Detergente Neutro 500mL', categoria: 'Limpeza', codigoBarras: '7891022100150', quantidade: 70, unidade: 'un', estoqueMinimo: 24, precoUnitario: 2.79, fornecedor: 'Limpa Tudo' },
  { nome: 'Papel Higiênico Folha Dupla (12 rolos)', categoria: 'Higiene', quantidade: 6, unidade: 'pct', estoqueMinimo: 12, precoUnitario: 22.9, fornecedor: 'Higiene & Cia' },
];

(async () => {
  const repo = criarRepositorio();
  await repo.init({ criarTabela: true });
  for (const p of exemplos) await repo.criar(validarProduto(p));
  console.log(`${exemplos.length} produtos de exemplo inseridos em ${repo.nome}.`);
  await repo.fechar();
})().catch((err) => {
  console.error('Falha ao popular o banco:', err.message);
  process.exit(1);
});
