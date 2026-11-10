# HelpDesk Pro

Sistema full stack para organizar o suporte de TI. Solicitantes abrem chamados e acompanham o atendimento. Técnicos assumem ocorrências, conversam com o solicitante e registram a solução. A administração gerencia contas, distribui chamados e acompanha os indicadores.

**Stack** · Next.js 16 · React 19 · NestJS 11 · TypeScript · PostgreSQL 17 · Prisma ORM 7 · Docker Compose

[Executar localmente](#executar-no-windows-com-docker-desktop) · [Roteiro da demonstração](#roteiro-para-apresentar-o-projeto) · [Arquitetura e API](docs/architecture.md) · [Testes](#verificações)

## Decisões de engenharia

- **Autorização no backend.** As consultas filtram os chamados conforme o perfil da sessão. O teste de integração verifica que um solicitante recebe HTTP 404 ao tentar consultar o chamado de outro usuário.
- **Atualizações concorrentes.** Atribuição, prioridade e status usam controle de versão. A mudança e seu registro de auditoria são gravados na mesma transação.
- **SLA por prioridade.** O prazo usa a data de abertura e horas corridas. O painel conta apenas chamados pendentes com prazo vencido dentro do escopo do perfil.

## O que a aplicação faz

| Área | Recursos |
| --- | --- |
| Portal do solicitante | Abertura de chamados, consulta dos próprios registros, comentários, confirmação ou reabertura após a solução |
| Fila técnica | Busca, filtros por status, categoria e prioridade, paginação, atribuição e registro da solução |
| Administração | Cadastro, busca, ativação e desativação de contas, atribuição de responsáveis e gestão de prioridades |
| Indicadores | Totais por status e prioridade e chamados pendentes com prazo vencido, respeitando a visibilidade de cada perfil |
| Rastreabilidade | Comentários com autor e horário e histórico de criação, atribuição, prioridade e status |
| Infraestrutura | Migrations SQL, seed idempotente, Swagger no ambiente de desenvolvimento, health check e GitHub Actions |

## Executar no Windows com Docker Desktop

Instale o Docker Desktop, abra o aplicativo e extraia este projeto. No PowerShell, execute os comandos na pasta que contém `package.json`.

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
```

Abra `apps/api/.env` e substitua `CHANGE_THIS_STRONG_PASSWORD` por uma senha nova de pelo menos 12 caracteres e no máximo 72 bytes. Mantenha o e-mail e as outras configurações de exemplo para a primeira execução.

```powershell
docker compose -f docker-compose.yml -f compose.app.yml up --build -d
docker compose -f docker-compose.yml -f compose.app.yml logs -f api web
```

A API aplica as migrations e cria os dados na inicialização. Abra o [HelpDesk Pro](http://localhost:3000). Para verificar se a API responde através do frontend, abra o [health check](http://localhost:3000/api/health). Use `Ctrl+C` para sair da visualização dos logs. Os serviços continuam rodando.

No macOS ou Linux, use `cp` no lugar de `Copy-Item`. Para parar os serviços e preservar os dados:

```bash
docker compose -f docker-compose.yml -f compose.app.yml down
```

## Contas para a demonstração

Com `SEED_DEMO_DATA=true`, a primeira inicialização cria estas três contas com a senha que você definiu em `SEED_ADMIN_PASSWORD`.

| Perfil | E-mail padrão |
| --- | --- |
| Administrador | `admin@demo.local` |
| Técnico | `tecnico@demo.local` |
| Solicitante | `solicitante@demo.local` |

O seed preserva as senhas existentes em execuções seguintes. Use uma base descartável para a demonstração. Para iniciar apenas com o administrador e as categorias, defina `SEED_DEMO_DATA=false` antes do primeiro seed.

### Roteiro para apresentar o projeto

1. Como **solicitante**, abra um chamado sobre uma impressora offline. Preencha título, descrição, categoria e prioridade.
2. Como **técnico**, encontre o chamado na fila, assuma o atendimento e mude o status para **Em atendimento**. Registre um comentário e depois a solução.
3. Volte ao perfil de **solicitante**, confira a solução e clique em **Confirmar e fechar**. Você também pode reabrir o chamado para testar o outro caminho.
4. Como **administrador**, confira o histórico, os indicadores por status e o chamado fictício com SLA vencido. Na tela **Usuários**, crie uma conta de teste e desative seu acesso.

## Desenvolvimento com Node.js

Use Node.js 24.15+ da linha 24, ou 22.22.3+ da linha 22. Para rodar frontend e API fora do Docker, inicie apenas o PostgreSQL. Copie também a configuração do frontend com `Copy-Item apps/web/.env.example apps/web/.env.local` no PowerShell, ou o equivalente com `cp`.

```bash
docker compose up -d --wait postgres
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend em [localhost:3000](http://localhost:3000) e API em [localhost:4000](http://localhost:4000/api/health). Em desenvolvimento, o [Swagger](http://localhost:3000/api/docs/) fica disponível no mesmo endereço do frontend. Faça login na interface antes de testar chamadas autenticadas pelo Swagger.

Se alterar o usuário, a senha, a porta ou o nome do banco, ajuste `DATABASE_URL` em `apps/api/.env` para o modo local. Na configuração Docker completa, o Compose monta a URL usando os valores do `.env` da raiz. Use credenciais locais compatíveis com URL ou configure a URL completa com os valores codificados. Alterar o `.env` preserva as credenciais já gravadas em um volume PostgreSQL inicializado.

## Verificações

```bash
npm test
npm run typecheck
npm run build
```

Os testes unitários cobrem visibilidade por perfil, atribuição, transições, reabertura de registros antigos e prazos de SLA. O GitHub Actions configura PostgreSQL, instala dependências, executa o build, aplica migrations e percorre o atendimento via HTTP usando a API real através do proxy do Next.js.

Para rodar o teste de integração localmente com os serviços já iniciados, use um **banco de teste descartável**, pois o teste cria usuários, chamados e sessões.

```powershell
$env:TEST_ADMIN_PASSWORD = 'A senha do seed do seu banco de teste'
$env:TEST_API_URL = 'http://localhost:3000/api'
npm run test:integration
Remove-Item Env:TEST_ADMIN_PASSWORD
```

Se personalizar o e-mail do administrador, informe também `TEST_ADMIN_EMAIL`. O teste espera `http://localhost:3000` como Origin por padrão, configurável por `TEST_WEB_ORIGIN`.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `apps/web/src/app` | Interface responsiva, rotas, formulários e painel |
| `apps/api/src` | API REST, autorização, validação, regras e persistência |
| `apps/api/prisma` | Modelo relacional, migrations e dados de demonstração |
| `apps/api/test` | Testes de regras e fluxo HTTP |
| `.github/workflows/ci.yml` | Verificações automatizadas |
| `docs/architecture.md` | Regras, diagrama, decisões e contrato da API |

## Clonar o projeto

```bash
git clone https://github.com/Gui571/Helpdesk-pro.git
cd Helpdesk-pro
```

Depois, siga as instruções da seção [Executar no Windows com Docker Desktop](#executar-no-windows-com-docker-desktop) ou de [desenvolvimento com Node.js](#desenvolvimento-com-nodejs).

## Licença

[MIT](LICENSE).
