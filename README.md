# Estoque do Supermercado

Aplicação web CRUD para gestão de estoque de um supermercado.
O back-end é **Node.js + Express** com banco **PostgreSQL**. O front-end é HTML/CSS/JS puro, servido pela própria aplicação. A aplicação está preparada para ser hospedada no **Google Cloud Run** com o banco no **Cloud SQL**.

Projeto reaproveitado da disciplina de Computação em Nuvem para o trabalho de Sistemas Operacionais. O relatório técnico está em [`docs/relatorio/relatorio.pdf`](docs/relatorio/relatorio.pdf) (fonte LaTeX em [`docs/relatorio/relatorio.tex`](docs/relatorio/relatorio.tex)).

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
  server.js                     # inicialização e encerramento gracioso (sinais)
  app.js                        # rotas da API REST + arquivos estáticos
  validation.js                 # validação/normalização dos dados
  repositories/
    index.js                    # cria o repositório a partir do DATABASE_URL
    postgresRepository.js       # acesso ao PostgreSQL
public/                         # front-end (index.html, styles.css, app.js)
scripts/seed.js                 # dados de exemplo
test/api.test.js                # testes de integração
Dockerfile                      # imagem usada no Cloud Run
docker-compose.yml              # PostgreSQL para desenvolvimento
docs/                           # capturas de tela e relatório (LaTeX)
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

Pré-requisitos: Node.js 22+ e Docker (para o PostgreSQL).

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run seed
```

```bash
npm start
```

Acesse http://localhost:3000. A tabela `produtos` é criada automaticamente na inicialização.

## Testes

Os testes de integração exercitam todo o CRUD pela API HTTP, inclusive 100 saídas simultâneas do mesmo produto. Eles usam o PostgreSQL do `docker compose` (ou o da variável `TEST_DATABASE_URL`) e criam um banco temporário, que é apagado no final:

```bash
npm test
```

## Hospedagem no Google Cloud

Arquitetura: **Cloud Run** executa o contêiner da aplicação (gerado a partir do `Dockerfile`), o banco fica no **Cloud SQL para PostgreSQL** e o endereço do banco, que contém a senha, fica guardado no **Secret Manager**. O Cloud Run conecta ao Cloud SQL por um socket Unix montado em `/cloudsql/PROJETO:REGIAO:INSTANCIA`.

Os comandos abaixo podem ser executados no **Cloud Shell** (botão `>_` no console do Google Cloud), dentro da pasta do projeto:

```bash
git clone https://github.com/julianoreis27/trabalho-so.git && cd trabalho-so
```

### 1. Variáveis

Troque `SEU-PROJETO` pelo ID do seu projeto. Use na senha apenas letras e números, porque ela vai dentro de uma URL.

```bash
PROJETO=SEU-PROJETO
REGIAO=southamerica-east1
INSTANCIA=estoque-db
SENHA_DB=TroqueEstaSenha123
gcloud config set project $PROJETO
```

### 2. Ativar as APIs

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

### 3. Criar o banco no Cloud SQL

A criação da instância leva alguns minutos.

```bash
gcloud sql instances create $INSTANCIA --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro --region=$REGIAO
```

```bash
gcloud sql databases create estoque --instance=$INSTANCIA
```

```bash
gcloud sql users create estoque --instance=$INSTANCIA --password=$SENHA_DB
```

### 4. Guardar o endereço do banco no Secret Manager

```bash
CONEXAO=$(gcloud sql instances describe $INSTANCIA --format='value(connectionName)')
printf 'postgresql://estoque:%s@/estoque?host=/cloudsql/%s' "$SENHA_DB" "$CONEXAO" | gcloud secrets create estoque-database-url --data-file=-
```

### 5. Dar permissões à conta de serviço do Cloud Run

O Cloud Run usa a conta de serviço padrão do Compute Engine. Ela precisa compilar a imagem, conectar ao Cloud SQL e ler o segredo:

```bash
CONTA=$(gcloud projects describe $PROJETO --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for PAPEL in roles/run.builder roles/cloudsql.client; do gcloud projects add-iam-policy-binding $PROJETO --member=serviceAccount:$CONTA --role=$PAPEL --condition=None; done
gcloud secrets add-iam-policy-binding estoque-database-url --member=serviceAccount:$CONTA --role=roles/secretmanager.secretAccessor
```

As permissões levam cerca de 2 minutos para valer; espere um pouco antes do próximo passo.

### 6. Publicar no Cloud Run

O `--source .` envia o código, gera a imagem pelo `Dockerfile` no Cloud Build e publica o serviço. Na primeira vez, o `gcloud` pergunta se pode criar o repositório de imagens: responda `Y`.

```bash
gcloud run deploy estoque --source . --region $REGIAO --allow-unauthenticated --add-cloudsql-instances $CONEXAO --set-secrets DATABASE_URL=estoque-database-url:latest --max-instances 2
```

No final, o comando mostra o endereço público (`Service URL`), algo como `https://estoque-xxxxxxxx.southamerica-east1.run.app`.

O `--max-instances 2` limita o número de contêineres: cada um abre até 10 conexões com o banco, e a menor instância do Cloud SQL aceita 25.

### 7. Inserir os produtos de exemplo (opcional, uma única vez)

Cria um job do Cloud Run com a mesma imagem e executa o `scripts/seed.js`:

```bash
IMAGEM=$(gcloud run services describe estoque --region $REGIAO --format='value(spec.template.spec.containers[0].image)')
gcloud run jobs deploy estoque-seed --image $IMAGEM --region $REGIAO --set-cloudsql-instances $CONEXAO --set-secrets DATABASE_URL=estoque-database-url:latest --command node --args scripts/seed.js
gcloud run jobs execute estoque-seed --region $REGIAO --wait
```

### Atualizar depois de mudar o código

Repita o passo 6 (se abrir um novo Cloud Shell, defina de novo as variáveis do passo 1 e o `CONEXAO` do passo 4).

### Ver os logs

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="estoque"' --limit 20 --format='value(textPayload)'
```

Quando o Cloud Run desliga um contêiner, aparece no log a mensagem `SIGTERM recebido: finalizando as requisições em andamento...`.

### Custos

O Cloud Run cobra por uso e fica sem contêineres ativos quando não há acessos, então um projeto pequeno costuma ficar dentro da cota gratuita. Já a instância do Cloud SQL é cobrada por hora enquanto estiver ligada, mesmo sem acessos. Contas novas do Google Cloud recebem créditos de avaliação. Depois de testar, pare a instância:

```bash
gcloud sql instances patch $INSTANCIA --activation-policy=NEVER
```

Para ligá-la de novo antes da apresentação, use `--activation-policy=ALWAYS`. Para apagar tudo ao final do semestre:

```bash
gcloud run services delete estoque --region $REGIAO
gcloud run jobs delete estoque-seed --region $REGIAO
gcloud sql instances delete $INSTANCIA
gcloud secrets delete estoque-database-url
```

## Conceitos de Sistemas Operacionais

Detalhados no relatório técnico:

- **Concorrência e condição de corrida**: dois caixas podem dar saída no mesmo produto ao mesmo tempo. A entrada/saída de estoque é um único `UPDATE` condicional no banco (`movimentar` em `src/repositories/postgresRepository.js`): o PostgreSQL bloqueia a linha do produto, então as saídas simultâneas são aplicadas uma de cada vez, uma venda não sobrescreve a outra e o estoque nunca fica negativo.
- **Sinais**: o servidor trata `SIGINT` (Ctrl+C) e `SIGTERM` para encerrar de forma graciosa (`src/server.js`). No Cloud Run, o contêiner recebe `SIGTERM` antes de ser desligado e `SIGKILL` 10 segundos depois.
- **Comunicação entre processos**: no Cloud Run, a aplicação conversa com o banco por um socket Unix (`/cloudsql/...`).
- **Processos e contêineres**: o `Dockerfile` executa o Node.js como processo principal (PID 1) do contêiner, com um usuário sem privilégios.
