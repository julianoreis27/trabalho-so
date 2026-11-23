# Estoque do Supermercado

Aplicação web CRUD para gestão de estoque de um supermercado.
O back-end é **Node.js + Express** e grava em **DynamoDB** (DynamoDB Local) ou **PostgreSQL**, os dois rodando localmente pelo Docker; você escolhe o banco por variável de ambiente. O front-end é HTML/CSS/JS puro, servido pela própria aplicação.

Projeto reaproveitado da disciplina de Computação em Nuvem para o trabalho de Sistemas Operacionais.

![Tela principal](docs/tela-principal.png)

## Funcionalidades

- **Cadastrar, listar, consultar, editar e excluir** produtos (nome, categoria, código de barras, quantidade, unidade, estoque mínimo, preço, validade, fornecedor)
- **Entrada e saída de estoque**: operação atômica no banco que impede estoque negativo
- **Painel de resumo**: total de produtos, itens, valor em estoque, itens abaixo do mínimo e vencendo em até 7 dias
- **Busca** (ignora acentos) e **filtros** por categoria e situação (estoque baixo / vencendo)
- Validação no servidor com mensagens por campo exibidas no formulário

## Estrutura

```
src/
  server.js                     # inicialização
  app.js                        # rotas da API REST + arquivos estáticos
  validation.js                 # validação/normalização dos dados
  repositories/
    index.js                    # escolhe o banco (DB_CLIENT)
    dynamoRepository.js         # implementação DynamoDB
    postgresRepository.js       # implementação PostgreSQL
public/                         # front-end (index.html, styles.css, app.js)
scripts/seed.js                 # dados de exemplo
test/api.test.js                # testes de integração (DynamoDB e PostgreSQL)
docker-compose.yml              # DynamoDB Local e PostgreSQL
docs/                           # capturas de tela
```

## API REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/produtos?busca=&categoria=&status=baixo\|vencendo` | Lista produtos (com filtros) |
| GET | `/api/produtos/:id` | Consulta um produto |
| POST | `/api/produtos` | Cria um produto |
| PUT | `/api/produtos/:id` | Atualiza um produto |
| DELETE | `/api/produtos/:id` | Exclui um produto |
| POST | `/api/produtos/:id/movimentacoes` | `{ "tipo": "entrada"\|"saida", "quantidade": 5 }` |
| GET | `/api/health` | Status e banco em uso |

Exemplo de corpo para criar/atualizar:

```json
{
  "nome": "Arroz Branco Tipo 1 5kg",
  "categoria": "Mercearia",
  "codigoBarras": "7896006716112",
  "quantidade": 48,
  "unidade": "pct",
  "estoqueMinimo": 15,
  "precoUnitario": 27.9,
  "validade": "2027-07-16",
  "fornecedor": "Distribuidora Grão Bom"
}
```

## Executando localmente

Pré-requisitos: Node.js 18+ e Docker (para os bancos locais).

```bash
npm install
```

```bash
cp .env.example .env
```

### Com DynamoDB (padrão)

```bash
docker compose up -d dynamodb
```

```bash
npm run seed
```

```bash
npm start
```

Acesse http://localhost:3000.

### Com PostgreSQL

No `.env`, troque `DB_CLIENT=postgres` e descomente `DATABASE_URL`:

```bash
docker compose up -d postgres
```

```bash
npm run seed && npm start
```

A tabela `produtos` é criada automaticamente na inicialização.

## Testes

Os testes de integração exercitam todo o CRUD pela API HTTP. O DynamoDB é emulado em memória (`dynalite`), então não precisa de Docker:

```bash
npm test
```

Para testar também contra PostgreSQL:

```bash
TEST_DATABASE_URL=postgres://estoque:estoque@localhost:5432/estoque npm test
```

## Conceitos de Sistemas Operacionais

- **Concorrência e condição de corrida**: dois caixas podem dar saída no mesmo produto ao mesmo tempo. A entrada/saída de estoque é uma operação atômica no banco (`movimentar` em `src/repositories/`): a verificação do saldo e a gravação acontecem juntas, então uma venda não sobrescreve a outra e o estoque nunca fica negativo.
- **Sinais**: o servidor trata `SIGINT` (Ctrl+C) e `SIGTERM` para encerrar de forma graciosa, terminando as requisições em andamento e fechando a conexão com o banco (`src/server.js`).
