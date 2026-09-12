# Dimensionamento Energético Residencial

## 1. Visão geral

O **Dimensionamento Energético Residencial** é uma aplicação web para cadastrar imóveis, registrar equipamentos elétricos, estimar o consumo mensal de energia e apoiar a análise de custos e oportunidades de redução de consumo.

Este documento funciona como um artefato de acompanhamento do projeto. Além de explicar como executar o sistema, ele registra o que foi planejado, o que já foi implementado, quais decisões técnicas foram tomadas, quais limitações ainda existem e quais atividades devem ser priorizadas.

> **Situação do documento:** atualizado em setembro de 2026.
> **Fonte principal de requisitos:** `UserStory&Tasks.docx`.
> **Backlog complementar:** `BackLog_SistemaDeDimensionamento_1CCPZ.xlsx`.
> As histórias consideradas no acompanhamento funcional principal são as histórias presentes no DOCX.

---

## 2. Identificação acadêmica

**Turma:** 1CCPZ

- Arthur Vettorazzo De Souza — RM 569445
- Brayan Barbosa Dos Santos — RM 573682
- Giovanne Gomes Petenuci — RM 574091
- Manoel Da Silva Ferreira — RM 572045

Quadro Kanban do projeto no Trello:

<https://trello.com/invite/b/6a9b5f592fcc9aa00eccb279/ATTI5c727c5e3ef0eee511acce10299e46d775A87E86/cp1-sers>

---

## 3. Objetivo do produto

O sistema deve permitir que uma pessoa:

1. crie uma conta e faça login;
2. cadastre imóveis e mantenha projetos salvos;
3. cadastre equipamentos vinculados a cada imóvel;
4. informe potência, quantidade e horas de uso;
5. considere perfis diferentes para dias úteis e fins de semana;
6. acompanhe o consumo mensal estimado;
7. estime o custo com base na tarifa de energia;
8. configure um limite mensal e receba sugestões de redução;
9. visualize relatório, tabela e gráfico por categoria;
10. exporte o relatório em CSV ou PDF;
11. importe equipamentos a partir de CSV/XLS/XLSX;
12. compare o consumo de dois imóveis/projetos.

---

## 4. Escopo e rastreabilidade das histórias

O documento de requisitos contém 17 histórias de usuário, identificadas no código pelos códigos US01 a US17 e no backlog por PB01, PB02 etc.

### 4.1 Status consolidado

| História | Funcionalidade | T01–T03 | Status atual |
|---|---|---:|---|
| PB01 / US01 | Cadastro de imóvel | Concluídas | Implementada |
| PB02 / US02 | Cadastro de equipamento | Concluídas | Implementada |
| PB04 / US03 | Quantidade e horas de uso | Concluídas | Implementada |
| PB05 / US04 | Cálculo mensal de consumo | Concluídas | Implementada |
| PB06 / US05 | Relatório final | Concluídas | Implementada |
| PB13 / US06 | Salvar e abrir projetos | Concluídas | Implementada |
| PB16 / US07 | Conta e autenticação | Concluídas | Implementada |
| PB11 / US08 | Tarifa e custo mensal | Concluídas | Implementada |
| PB12 / US09 | Exportação PDF/CSV | Concluídas | Implementada |
| PB15 / US10 | Alertas e sugestões de redução | Concluídas | Implementada |
| PB20 / US11 | Importação de planilha | Concluídas | Implementada |
| PB08 / US12 | Potências sugeridas | Concluídas | Implementada |
| PB09 / US13 | Gerenciamento de categorias | Concluídas | Implementada |
| PB10 / US14 | Gráfico por categoria | Concluídas | Implementada |
| PB14 / US15 | Comparação de cenários | Concluídas | Implementada |
| PB17 / US16 | Recuperação de senha | T01 e T03 concluídas; T02 pendente | Parcial |
| PB19 / US17 | Perfis semana/fim de semana | Concluídas | Implementada |

### 4.2 Pendência funcional conhecida

A única pendência funcional identificada nas histórias do DOCX é a **T02 da PB17/US16**:

- o sistema possui a tela “Esqueci minha senha”;
- gera um código temporário;
- grava o código e sua expiração no banco;
- permite informar o código e definir uma nova senha;
- porém ainda **não envia e-mail nem link de redefinição por um serviço de e-mail real**.

O fluxo atual apresenta o código de forma simulada na interface, adequado para demonstração local, mas não equivalente ao requisito de produção.

### 4.3 Tarefas T04

As T04 de testes das histórias não são classificadas neste README como concluídas. Elas dependem da definição acadêmica de quais evidências serão aceitas como “teste realizado”:

- painel de testes manuais embutido na interface;
- testes unitários externos;
- testes de integração dos endpoints;
- testes de interface;
- ou uma combinação desses formatos.

Até essa definição, as T04 devem ser tratadas como **aguardando critério de aceite de evidência**, e não como uma pendência funcional já priorizada.

---

## 5. Arquitetura da solução

### 5.1 Camadas principais

```text
Interface HTML/PHP
        |
        v
script.js  <---- bibliotecas externas: Chart.js, jsPDF, PapaParse, SheetJS
        |
        v
dimensionamento_energetico_residencial.php
        |
        v
MySQL/MariaDB — banco dimensionamento_energetico
```

### 5.2 Responsabilidade dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `dimensionamento_energetico_residencial.php` | Renderização da página, sessão PHP, endpoints JSON, autenticação, validação de payload e persistência |
| `script.js` | Interações da interface, validações de formulário, navegação, cálculos auxiliares, gráficos, importação e exportação |
| `style.css` | Identidade visual, layout, responsividade e componentes de interface |
| `schema_dimensionamento_energetico.sql` | Criação do banco, tabelas, constraints, views, procedure e catálogo inicial |
| `UserStory&Tasks.docx` | Documento de requisitos, critérios de aceite e tarefas |
| `BackLog_SistemaDeDimensionamento_1CCPZ.xlsx` | Backlog complementar para acompanhamento |
| `DimensionamentoEnergeticoResidencial.py` | Protótipo inicial em linha de comando; não é o fluxo principal da aplicação web |
| `TrelloLink.txt` | Link do quadro de acompanhamento |

### 5.3 Decisão de separação do frontend

O JavaScript que originalmente estava embutido na página PHP foi separado para `script.js`. Isso facilita:

- manutenção;
- revisão de código;
- organização por responsabilidade;
- evolução para testes;
- reaproveitamento das funções de domínio.

O PHP mantém a estrutura da página e a camada de servidor, enquanto o JS controla o comportamento no navegador.

---

## 6. Banco de dados

O banco utilizado é `dimensionamento_energetico`, criado pelo arquivo `schema_dimensionamento_energetico.sql`.

### 6.1 Tabelas

#### `usuarios`

Armazena:

- e-mail único;
- hash da senha;
- token temporário de recuperação;
- data de expiração do token;
- datas de criação e atualização.

Senhas não são armazenadas em texto puro. O backend utiliza `password_hash` e valida com `password_verify`.

#### `categorias`

Armazena categorias por usuário. A constraint única `(usuario_id, nome)` impede duplicidade dentro do mesmo usuário, respeitando a collation case-insensitive.

#### `equipamentos_referencia`

Catálogo global de equipamentos e potências sugeridas. Registros com `usuario_id IS NULL` ficam disponíveis para todos os usuários.

#### `imoveis`

Armazena os projetos do usuário:

- nome;
- endereço;
- tarifa;
- limite mensal de consumo.

#### `equipamentos`

Armazena equipamentos vinculados a um imóvel e a uma categoria:

- nome;
- potência;
- quantidade;
- horas em dias úteis;
- horas em fins de semana.

As chaves estrangeiras implementam as regras de exclusão:

- excluir um imóvel exclui seus equipamentos;
- excluir uma categoria vinculada a equipamentos é impedido por `ON DELETE RESTRICT`.

### 6.2 Views utilizadas pela aplicação

#### `vw_consumo_equipamento`

Calcula o consumo mensal de cada equipamento usando os perfis de dias úteis e fins de semana:

```text
(potência × quantidade ×
 (horas_semana × 30 × 5/7 + horas_fds × 30 × 2/7)) / 1000
```

#### `vw_consumo_imovel`

Consolida por imóvel:

- consumo total em kWh;
- tarifa;
- custo estimado em reais;
- limite configurado.

O backend consulta essas views ao carregar o estado. O frontend utiliza os valores retornados para relatório e custo, mantendo o cálculo JavaScript como fallback para dados ainda não persistidos.

### 6.3 Procedure de categorias padrão

A procedure `sp_criar_categorias_padrao` é chamada após o cadastro do usuário e cria as categorias iniciais:

- Cozinha;
- Banheiro;
- Climatização;
- Sala;
- Escritório;
- Iluminação;
- Lavanderia;
- Limpeza;
- Eletrônicos;
- Área externa.

---

## 7. Persistência e sincronização

O frontend mantém um estado de trabalho em memória durante a sessão, mas a fonte persistente é o banco de dados.

### 7.1 Estratégia atual

O endpoint `salvar` recebe o estado do usuário e realiza uma sincronização incremental dentro de uma transação:

- registros com ID existente são atualizados;
- registros sem ID são inseridos;
- registros removidos da interface são removidos do banco;
- somente os registros pertencentes ao usuário atual podem ser alterados;
- IDs de outro usuário são rejeitados;
- entidades inválidas são rejeitadas antes da gravação;
- em caso de erro, a transação é revertida.

Isso substitui a estratégia anterior de apagar todas as tabelas do usuário e recriar tudo. A mudança reduz risco de:

- perda de IDs;
- quebra de referências;
- dificuldade de auditoria;
- conflitos com relacionamentos;
- alterações desnecessárias no banco.

### 7.2 Validação no backend

O backend não confia apenas na validação do navegador. Antes de iniciar a transação, valida:

- estrutura do payload;
- nomes e limites de tamanho;
- categorias duplicadas;
- categorias existentes;
- imóveis pertencentes ao usuário;
- equipamentos pertencentes ao imóvel;
- potência positiva;
- quantidade inteira maior que zero;
- horas entre 0 e 24;
- tarifa positiva;
- limite positivo;
- associação válida entre equipamento e categoria.

Payload inválido gera resposta HTTP `422` com mensagem de erro. O registro inválido não é ignorado silenciosamente e a transação não é concluída.

---

## 8. Endpoints disponíveis

Todos os endpoints são atendidos pelo próprio `dimensionamento_energetico_residencial.php` por requisições `POST` com JSON.

| Ação | Finalidade | Autenticação |
|---|---|---|
| `registrar` | Criar usuário e categorias padrão | Não |
| `entrar` | Validar credenciais e criar sessão | Não |
| `sair` | Encerrar sessão | Sim |
| `carregar` | Carregar categorias, referências, imóveis e equipamentos | Sim |
| `salvar` | Validar e sincronizar o estado do usuário | Sim |
| `solicitar_reset` | Gerar token temporário de recuperação | Não |
| `resetar_senha` | Validar token e salvar nova senha | Não |

A sessão PHP utiliza `usuario_id` e `email` para garantir que cada usuário carregue e altere apenas os próprios dados.

---

## 9. Funcionalidades implementadas

### Cadastro e autenticação

- criação de conta com e-mail válido;
- senha mínima de 8 caracteres;
- hash seguro no backend;
- login;
- logout;
- proteção dos endpoints que exigem usuário;
- categorias padrão criadas automaticamente.

### Imóveis e projetos

- criação de imóvel;
- validação de nome e endereço;
- edição de dados do imóvel;
- exclusão do imóvel;
- listagem de projetos salvos;
- abertura de projeto existente;
- persistência vinculada ao usuário.

### Equipamentos

- cadastro de nome, categoria e potência;
- validação de potência positiva;
- quantidade inteira maior que zero;
- horas de uso entre 0 e 24;
- separação entre dias úteis e fins de semana;
- remoção de equipamentos;
- vínculo com imóvel e categoria.

### Cálculo e análise

- consumo mensal por equipamento;
- consumo total do imóvel;
- custo estimado;
- limite mensal;
- alerta de ultrapassagem;
- sugestões de redução;
- agrupamento por categoria;
- gráfico de pizza com percentual no tooltip;
- comparação de dois imóveis por kWh e percentual.

### Importação e exportação

- importação de CSV;
- importação de XLS/XLSX;
- validação de nome, categoria e potência;
- indicação das linhas inválidas;
- confirmação antes da gravação;
- exportação CSV;
- exportação PDF.

---

## 10. Como executar localmente

### Pré-requisitos

- Laragon;
- Apache ou servidor PHP equivalente;
- PHP com extensão `mysqli`;
- MySQL/MariaDB;
- navegador com JavaScript habilitado;
- conexão com a internet para carregar as bibliotecas CDN, caso não sejam disponibilizadas localmente.

### Passo 1 — iniciar o ambiente

1. Abra o Laragon.
2. Inicie Apache e MySQL/MariaDB.
3. Confirme que o projeto está em:

```text
C:\laragon\www\Dimensionamento_Energetico_SERS
```

### Passo 2 — criar o banco

Execute o arquivo `schema_dimensionamento_energetico.sql` no HeidiSQL ou em outro cliente MySQL/MariaDB.

Configuração esperada no ambiente padrão do Laragon:

```text
Host: 127.0.0.1
Porta: 3306
Usuário: root
Senha: em branco
Banco: dimensionamento_energetico
```

Se o ambiente utilizar credenciais diferentes, atualize a função de conexão em `dimensionamento_energetico_residencial.php` antes de executar.

### Passo 3 — abrir a aplicação

Abra no navegador:

```text
http://localhost/Dimensionamento_Energetico_SERS/dimensionamento_energetico_residencial.php
```

Não abra o PHP como arquivo `file://`, pois as requisições `fetch`, a sessão e a conexão com o banco dependem de um servidor PHP.

---

## 11. Bibliotecas externas

A interface usa bibliotecas carregadas por CDN:

- Chart.js — gráfico de pizza;
- jsPDF — exportação PDF;
- PapaParse — leitura de CSV;
- SheetJS/XLSX — leitura de planilhas XLS/XLSX.

Sem acesso à internet, as funcionalidades dependentes dessas bibliotecas podem não funcionar. Essa é uma limitação operacional relevante para demonstrações em laboratórios ou ambientes sem rede.

---

## 12. Validação técnica já realizada

As seguintes validações foram executadas durante o desenvolvimento:

- verificação de sintaxe PHP com o PHP 7.2 disponibilizado pelo Laragon;
- verificação de sintaxe JavaScript com Node.js 12;
- abertura da página PHP por servidor local;
- smoke test do endpoint JSON;
- cadastro de usuário em banco de teste;
- validação de login e sessão;
- rejeição de estado inválido com HTTP `422`;
- verificação de que a sincronização não ignora registros inválidos;
- verificação de que as views SQL são consultadas no carregamento;
- verificação de que a transação é revertida em caso de falha.

O painel “Testes automatizados” da interface também contém casos manuais para:

- fórmulas de consumo;
- perfis de uso;
- custo;
- potência;
- horas;
- quantidade;
- campos obrigatórios;
- senha;
- tarifa;
- e-mail;
- agrupamento por categoria;
- comparação;
- limite de consumo;
- duplicidade de categoria.

Esses casos são uma evidência auxiliar de desenvolvimento, mas a classificação final das T04 ainda depende da decisão sobre o formato oficial de testes do projeto.

---

## 13. Limitações conhecidas

### Recuperação de senha

O envio real de e-mail/link ainda não foi implementado. O código temporário é exibido de forma simulada para permitir demonstração local.

### Dependência de CDN

Gráfico, PDF e importação dependem de bibliotecas externas carregadas pela internet.

### Edição de equipamentos

Atualmente é possível cadastrar e remover equipamentos. Não há uma tela específica para editar diretamente uma linha já cadastrada; para alterar seus dados, o fluxo atual exige ajustar a origem do estado ou remover e cadastrar novamente.

### Atualização por alteração

O relatório é atualizado quando as ações de salvar, alterar tarifa, alterar limite, adicionar ou remover equipamento são executadas. Não há edição inline dos campos de um equipamento existente.

### Configuração de produção

As credenciais do banco estão configuradas para o padrão local do Laragon. Antes de publicar o sistema, devem ser movidas para configuração segura fora do código.

### Segurança adicional para produção

Para um ambiente real, ainda devem ser avaliados:

- HTTPS;
- proteção CSRF;
- política de sessão e cookies seguros;
- controle de tentativas de login;
- serviço de e-mail;
- gerenciamento de segredos;
- logs de auditoria;
- mensagens de erro sem exposição de detalhes internos.

---

## 14. Próximos passos priorizados

### Prioridade alta

1. Implementar o envio real de e-mail com link temporário para recuperação de senha.
2. Definir o formato oficial de evidência das T04.
3. Executar o schema em um ambiente limpo e registrar a versão efetiva do MySQL/MariaDB.
4. Validar todos os fluxos principais manualmente com uma conta de teste.

### Prioridade média

1. Criar edição de equipamentos já cadastrados.
2. Tornar as mensagens de erro de unicidade de e-mail mais específicas.
3. Adicionar testes externos de integração para os endpoints PHP.
4. Testar importação com arquivos reais contendo linhas válidas e inválidas.
5. Validar conteúdo dos arquivos PDF e CSV exportados.

### Prioridade de preparação para entrega

1. Definir se as bibliotecas CDN serão mantidas ou empacotadas localmente.
2. Revisar configuração de banco para não depender de credenciais fixas no código.
3. Registrar evidências de execução das histórias no Trello.
