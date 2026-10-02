# Dimensionamento Energético Residencial

## 1. Visão geral

O **Dimensionamento Energético Residencial** é uma aplicação web para cadastrar imóveis, registrar equipamentos elétricos, estimar o consumo mensal de energia e apoiar a análise de custos e oportunidades de redução de consumo.

Na **CP2**, o sistema evoluiu para o **pré-dimensionamento de um sistema fotovoltaico residencial**: a partir do consumo do imóvel e do recurso solar (HSP) da cidade, calcula a potência necessária, escolhe módulos e inversor compatíveis, dimensiona baterias (opcional) e estima o orçamento (ver seção 15).

> **Quer só instalar e rodar? Resumo em 5 passos** (detalhes na **seção 10**):
>
> 1. **Baixe e instale o Laragon Full** (laragon.org) e clique em **Start All**.
> 2. **Copie o projeto** para a pasta raiz (`C:\laragon\www\Dimensionamento_Energetico_SERS`), com a pasta `dados` junto.
> 3. **Suba o banco:** no Laragon clique em **Database** (HeidiSQL), carregue o `schema_dimensionamento_energetico.sql` e execute com **F9**.
> 4. **Abra** `http://localhost/Dimensionamento_Energetico_SERS/dimensionamento_energetico_residencial.php`.
> 5. **Crie uma conta**, cadastre um imóvel e use a aba **Solar**.

Este documento funciona como um artefato de acompanhamento do projeto. Além de explicar como executar o sistema, ele registra o que foi planejado, o que já foi implementado, quais decisões técnicas foram tomadas, quais limitações ainda existem e quais atividades devem ser priorizadas.

> **Situação do documento:** atualizado em outubro de 2026 (CP1 + CP2 — dimensionamento fotovoltaico, ver seção 15).

---

## 2. Identificação acadêmica

**Turma:** 1CCPZ

- Arthur Vettorazzo De Souza — RM 569445
- Brayan Barbosa Dos Santos — RM 573682
- Giovanne Gomes Petenuci — RM 574091
- Manoel Da Silva Ferreira — RM 572045

Quadro Kanban do projeto no Trello:

<https://trello.com/b/5xq5RFDe/cp2-sers>

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
12. compare o consumo de dois imóveis/projetos;
13. (CP2) faça o pré-dimensionamento de um sistema fotovoltaico, com baterias opcionais e orçamento, e salve, abra e exporte a proposta.

---

## 4. Escopo e rastreabilidade das histórias

A CP1 contém 17 histórias de usuário (US01 a US17). A CP2 acrescenta as histórias US18 a US31 (seção 4.1.1).

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

### 4.1.1 Histórias da CP2 (dimensionamento fotovoltaico)

| História | Funcionalidade | Onde está no sistema | Status atual |
|---|---|---|---|
| PB21 / US18 | Localização do imóvel e HSP | Aba Solar (cidade, UF, HSP manual) e `dados/hsp_cidades.csv` | Implementada |
| PB22 / US19 | Percentual do consumo atendido (f) | Aba Solar, parâmetro f (1% a 100%) | Implementada |
| PB23 / US20 | Potência FV necessária (P_FV) | `fv_lib.php` e resultado na aba Solar | Implementada |
| PB24 / US21 | Base de módulos | `dados/modulos.csv` e catálogo | Implementada |
| PB25 / US22 | Seleção de módulo e quantidade (N) | Aba Solar | Implementada |
| PB26 / US23 | Base de inversores | `dados/inversores.csv` e catálogo | Implementada |
| PB27 / US24 | Inversor tecnicamente compatível | Aba Solar (só opções compatíveis) | Implementada |
| PB28 / US25 | Opção de baterias e autonomia | Aba Solar | Implementada |
| PB29 / US26 | Base de baterias | `dados/baterias.csv` e catálogo | Implementada |
| PB30 / US27 | Capacidade e seleção de baterias | Aba Solar | Implementada |
| PB31 / US28 | Compatibilidade módulos × inversor × baterias | Aba Solar (OK/FALHA com motivo) | Implementada |
| PB32 / US29 | Orçamento | Aba Solar (equipamentos e outros custos) | Implementada |
| PB33 / US30 | Resumo final da proposta | Aba Solar e exportação PDF/CSV | Implementada |
| PB34 / US31 | Datasets de equipamentos reais | `dados/*.csv` e `fontes_e_premissas.md` | Implementada |

### 4.2 Pendência funcional conhecida

A única pendência funcional identificada nas histórias é a **T02 da PB17/US16**:

- o sistema possui a tela “Esqueci minha senha”;
- gera um código temporário;
- grava o código e sua expiração no banco;
- permite informar o código e definir uma nova senha;
- porém ainda **não envia e-mail nem link de redefinição por um serviço de e-mail real**.

O fluxo atual apresenta o código de forma simulada na interface, adequado para demonstração local, mas não equivalente ao requisito de produção.

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
| `style.css` | Identidade visual, layout, responsividade e componentes de interface (inclui a aba Solar) |
| `fv_lib.php`, `config_fv.php`, `dados/*.csv`, `tests/run_tests.php`, `fontes_e_premissas.md` | CP2: cálculo fotovoltaico, premissas, datasets e testes (ver seção 15) |
| `schema_dimensionamento_energetico.sql` | Criação do banco, tabelas, constraints, views, procedure e catálogo inicial |

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

O banco utilizado é `dimensionamento_energetico`, criado pelo arquivo `schema_dimensionamento_energetico.sql`. As tabelas da CP2 (`hsp_cidades`, `fv_modulos`, `fv_inversores`, `fv_baterias`, `propostas_fv`) e as colunas novas de `imoveis` estão descritas na seção 15.4.

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
| `catalogos_fv`, `dimensionar_fv`, `salvar_proposta`, `listar_propostas`, `abrir_proposta`, `excluir_proposta` | CP2: dimensionamento fotovoltaico e propostas (ver seção 15.5) | Sim |

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

## 10. Como instalar e executar (passo a passo)

Este guia foi escrito para quem **nunca configurou nada disso**. Siga na ordem. Tempo estimado: 15 a 20 minutos.

### 10.1 O que você precisa

- Um computador com **Windows**.
- **Internet** (para baixar o Laragon e para o sistema carregar gráficos, PDF e importação de planilhas).
- O **Laragon (versão Full)**: programa gratuito que já traz tudo que o sistema usa (servidor Apache, PHP, banco MySQL e o HeidiSQL). Você não precisa instalar mais nada.
- A **pasta do projeto** (o arquivo ZIP que o grupo recebeu).

> Em Mac ou Linux o Laragon não funciona. Use XAMPP ou MAMP, com PHP 7.2 ou superior e MySQL/MariaDB, e adapte os caminhos.

### 10.2 Instalar o Laragon

1. Acesse **laragon.org**, vá em **Download** e baixe o **Laragon Full**.
2. Abra o instalador e clique em **Next** até o fim. **Deixe a pasta padrão** (`C:\laragon`).
3. Se o Windows perguntar sobre o Firewall, clique em **Permitir acesso**.
4. Abra o **Laragon** e clique em **Start All** (botão grande no centro da janela).
5. Confira: o Laragon deve mostrar **Apache** e **MySQL** como ligados (aparece "Apache" e "MySQL" na lista, sem mensagem de erro).

### 10.3 Colocar o projeto na pasta certa

1. No Laragon, clique em **Root** (ou abra o Windows Explorer em `C:\laragon\www`).
2. Dentro de `www`, crie uma pasta chamada exatamente **`Dimensionamento_Energetico_SERS`**.
3. **Extraia o ZIP** e copie o conteúdo para dentro dessa pasta. Atenção: os arquivos devem ficar **direto** dentro dela, não numa pasta dentro de outra pasta.
4. Confira. O caminho deve ficar assim:

```text
C:\laragon\www\Dimensionamento_Energetico_SERS\
├── dimensionamento_energetico_residencial.php
├── script.js
├── style.css
├── fv_lib.php
├── config_fv.php
├── schema_dimensionamento_energetico.sql
├── fontes_e_premissas.md
├── README.md
├── dados\
│   ├── modulos.csv
│   ├── inversores.csv
│   ├── baterias.csv
│   └── hsp_cidades.csv
└── tests\
    └── run_tests.php
```

Se `dimensionamento_energetico_residencial.php` e `fv_lib.php` estão lado a lado, está certo. **A pasta `dados` é obrigatória:** sem ela o sistema não calcula a parte solar.

### 10.4 Criar o banco de dados

1. No Laragon, clique no botão **Database**. Ele abre o **HeidiSQL** já conectado. Se pedir uma conexão, use: **Host** `127.0.0.1`, **Usuário** `root`, **Senha** em branco, **Porta** `3306`.
2. No HeidiSQL, vá em **Arquivo > Carregar arquivo SQL...** e escolha o `schema_dimensionamento_energetico.sql` da pasta do projeto.
3. Aperte **F9** (ou o botão ▶ azul). **Só abrir o arquivo não basta: é preciso executar.**
4. Espere terminar. Não deve aparecer nenhuma mensagem em vermelho.
5. Na coluna da esquerda, clique com o botão direito e escolha **Atualizar** (ou **F5**). Deve aparecer o banco **`dimensionamento_energetico`** com estas tabelas: `categorias`, `equipamentos`, `equipamentos_referencia`, `fv_baterias`, `fv_inversores`, `fv_modulos`, `hsp_cidades`, `imoveis`, `propostas_fv` e `usuarios` (mais as views `vw_consumo_*`).

O script é **seguro para executar mais de uma vez**: serve para banco novo e para quem já tinha o banco da CP1, sem apagar usuários, imóveis, equipamentos ou categorias.

### 10.5 Abrir o sistema

No navegador (Chrome, Edge ou Firefox), abra:

```text
http://localhost/Dimensionamento_Energetico_SERS/dimensionamento_energetico_residencial.php
```

Se a tela aparecer sem formatação ou antiga, aperte **Ctrl + F5**.

> **Nunca** dê duplo clique no arquivo `.php` (endereço começando com `file://`). Sem o servidor, o login, o banco e o cálculo não funcionam.

### 10.6 Primeiro uso (teste rápido do sistema)

1. Na aba **Criar conta**, informe um e-mail e uma senha com **pelo menos 8 caracteres**. Depois volte para **Entrar** e faça login.
2. Clique em **+ Novo imóvel**, preencha nome e endereço e clique em **Salvar imóvel**. (As abas Equipamentos, Relatório, Solar e Importar só são liberadas depois que o imóvel é salvo.)
3. *(Opcional)* Na aba **Equipamentos**, cadastre os aparelhos da casa. Isso gera o consumo mensal estimado.
4. Abra a aba **Solar**. Informe a **cidade** (ex.: São Paulo) e a **UF** (SP). Se não cadastrou equipamentos, digite o **consumo mensal manual** (ex.: 500 kWh).
5. Clique em **Dimensionar**. O sistema mostra a potência necessária, os módulos, o inversor e o orçamento.
6. Para incluir baterias, marque **Incluir baterias na solução**, informe a **autonomia** (ex.: 12 horas) e clique em **Dimensionar** de novo.
7. Clique em **Salvar proposta**. Depois você pode abri-la, excluí-la ou exportar em **PDF** e **CSV**.

Para conferir se tudo está certo, repita o cenário da seção 15.9: São Paulo, consumo 500 kWh, sem baterias dá **R$ 6.978,93**; com baterias (12 h) dá **R$ 22.499,93**.

### 10.7 Rodar os testes automáticos (opcional)

1. No Laragon, clique em **Terminal** (abre uma janela preta).
2. Entre na pasta do projeto:

```text
cd C:\laragon\www\Dimensionamento_Energetico_SERS
```

3. Rode:

```text
php tests\run_tests.php
```

Os testes usam os mesmos CSVs da pasta `dados` e conferem os dois cenários da seção 15.9. No final deve aparecer que **todos os testes foram aprovados**. Se vocês mudarem algum preço em `dados/`, atualize o valor esperado do teste correspondente.

### 10.8 Se algo der errado

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| "Não foi possível concluir a operação no banco de dados" (ao entrar ou salvar) | MySQL desligado, ou o SQL ainda não foi **executado** | Clique em **Start All** no Laragon e refaça o passo 10.4 (F9) |
| Mesmo erro, com MySQL ligado e SQL executado | O `root` do MySQL tem senha | Ajuste a função `banco()` no `dimensionamento_energetico_residencial.php` com a senha correta |
| Página em branco, código PHP na tela ou erro 404 | Endereço errado, pasta no lugar errado ou Apache desligado | Confira o endereço (10.5), a pasta (10.3) e o **Start All** |
| Tela sem estilo ou desatualizada | Navegador guardou a versão antiga | **Ctrl + F5** |
| Gráfico, PDF ou importação de planilha não funcionam | Sem internet (bibliotecas carregadas da web) | Conecte-se à internet e recarregue |
| "Os arquivos de equipamentos (dados/*.csv) estão inválidos" | Algum CSV de `dados` tem linha com problema | A mensagem lista arquivo e linha: corrija essa linha |
| Aba Solar pede HSP para Brasília | O catálogo tem só 26 capitais e não inclui o DF | Digite o **HSP manual** (entre 1,0 e 9,0) |
| Não consegue salvar a proposta ("incompleta") | Consumo baixo demais: nenhum inversor compatível | Aumente o consumo ou o percentual (ver 15.6) |
| "Sessão expirada. Entre novamente." | A sessão do navegador acabou | Faça login de novo |
| `php` não é reconhecido | O comando foi digitado no terminal do Windows | Use o **Terminal do Laragon** (10.7) |
| O Apache não liga (porta 80 ocupada) | Outro programa usa a porta | No Laragon: **Menu > Preferências**, troque a porta do Apache (ex.: 8080) e abra `http://localhost:8080/Dimensionamento_Energetico_SERS/...` |
| HeidiSQL não conecta | MySQL desligado | **Start All** no Laragon |

### 10.9 Atualizar o sistema depois

1. Substitua os arquivos da pasta pelos novos (mantendo a pasta `dados`).
2. Execute o `schema_dimensionamento_energetico.sql` de novo (F9).
3. Abra o sistema e aperte **Ctrl + F5**.

Para trocar preços ou equipamentos, edite os arquivos de `dados/` (veja `fontes_e_premissas.md`). O sistema relê os CSVs a cada uso.

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

**CP2:**

- `tests/run_tests.php` (testes de cálculo, compatibilidade, orçamento e validação dos datasets) foi executado pelo grupo no Laragon e **todos os testes foram aprovados**;
- os dois cenários da seção 15.9 foram refeitos à mão, passo a passo, em `fontes_e_premissas.md`;
- a conferência pela tela (cenários 1 e 2, salvar/abrir/excluir proposta, exportar PDF e CSV, erro proposital) está listada na seção 15.10.

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
2. Executar o schema em um ambiente limpo e registrar a versão efetiva do MySQL/MariaDB.
3. Validar todos os fluxos principais manualmente com uma conta de teste.

### Prioridade média

1. Criar edição de equipamentos já cadastrados.
2. Tornar as mensagens de erro de unicidade de e-mail mais específicas.
3. Adicionar testes externos de integração para os endpoints PHP.
4. Testar importação com arquivos reais contendo linhas válidas e inválidas.
5. Validar conteúdo dos arquivos PDF e CSV exportados.

### CP2 — evolução futura

1. Ampliar o catálogo de HSP além das 26 capitais (incluindo Brasília).
2. Atualizar periodicamente os preços e ampliar os catálogos de módulos, inversores e baterias.

---

## 15. CP2 — Evolução para dimensionamento fotovoltaico

### 15.1 O que foi acrescentado

A CP2 evolui o sistema da CP1 sem criar um programa isolado. O fluxo é:

```text
Imóvel → consumo (CP1) → HSP da cidade → dimensionamento FV → módulos
→ inversor compatível → baterias (opcional) → orçamento → proposta
```

Na tela, tudo fica na aba **Solar**, dentro de cada imóvel. A proposta pode ser salva, aberta, excluída e exportada em PDF e CSV.

> **Aviso:** o resultado é um **pré-dimensionamento acadêmico** e uma estimativa de custos. Não substitui projeto elétrico, visita técnica nem a responsabilidade de profissional habilitado. A tela e os arquivos exportados trazem esse aviso.

### 15.2 Ordem de instalação (resumo)

O passo a passo completo, com solução dos problemas mais comuns, está na **seção 10**. Em resumo:

1. Abra o Laragon e clique em **Start All**.
2. Copie o projeto para `C:\laragon\www\Dimensionamento_Energetico_SERS`, **incluindo a pasta `dados/`** (os 4 CSVs) e os arquivos `fv_lib.php` e `config_fv.php`.
3. No HeidiSQL, abra o `schema_dimensionamento_energetico.sql` e **execute com F9**. Só abrir o arquivo não basta: sem executar, o login falha com "Não foi possível concluir a operação no banco de dados", porque o PHP procura colunas que ainda não existem.
4. Abra `http://localhost/Dimensionamento_Energetico_SERS/dimensionamento_energetico_residencial.php` (Ctrl+F5 se a tela estiver antiga).

O schema é **idempotente**: pode ser executado várias vezes e serve tanto para banco novo quanto para o banco da CP1, sem apagar usuários, imóveis, equipamentos ou categorias.

### 15.3 Arquivos novos ou alterados na CP2

| Arquivo | Papel |
|---|---|
| `config_fv.php` | Parâmetros e premissas do dimensionamento (η, D, Tmin, razão CC/CA, faixas, outros custos) |
| `fv_lib.php` | Toda a lógica de cálculo, validação dos CSVs, compatibilidade e orçamento (PHP 7.2) |
| `dados/modulos.csv`, `inversores.csv`, `baterias.csv`, `hsp_cidades.csv` | Datasets reais com fonte, fornecedor e data de coleta (2026-10-01) |
| `tests/run_tests.php` | Testes de cálculo, compatibilidade, orçamento e datasets, sobre os dados reais (sem PHPUnit) |
| `dimensionamento_energetico_residencial.php` | Ganhou os endpoints do FV e os campos solares do imóvel |
| `script.js` / `style.css` | Ganharam a aba Solar, a tela da proposta e a exportação |
| `schema_dimensionamento_energetico.sql` | Ganhou colunas e tabelas da CP2 (idempotente) |
| `fontes_e_premissas.md` | Origem dos dados, premissas e reprodução manual de 2 cenários |

### 15.4 Banco de dados (CP2)

- **`imoveis`** ganhou 4 colunas: `cidade`, `uf`, `hsp_manual` e `consumo_manual_kwh`.
- **`hsp_cidades`**, **`fv_modulos`**, **`fv_inversores`** e **`fv_baterias`** são um **espelho** dos CSVs. A fonte de verdade dos catálogos são os arquivos `dados/*.csv`, validados linha a linha pelo PHP; o espelho é atualizado toda vez que o catálogo é aberto na aba Solar. As tabelas recusam, por CHECK, preço zero.
- **`propostas_fv`** guarda a proposta como uma "foto" (dados enviados e resultado completo em JSON, mais colunas-resumo). Se um preço do catálogo mudar depois, a proposta antiga continua mostrando os valores da época. Excluir o imóvel exclui suas propostas.

### 15.5 Endpoints novos

Todos exigem login (HTTP 401 sem sessão) e respondem HTTP 422 para erro de validação.

| Ação | Finalidade |
|---|---|
| `catalogos_fv` | Devolve cidades/HSP, parâmetros, faixas, avisos e catálogos; atualiza o espelho no banco |
| `dimensionar_fv` | Calcula a proposta de um imóvel (módulos, inversor, baterias opcionais, orçamento) |
| `salvar_proposta` | **Refaz o cálculo no servidor** e só salva se a proposta estiver completa |
| `listar_propostas` | Lista as propostas do usuário (opcionalmente de um imóvel) |
| `abrir_proposta` | Devolve a proposta salva exatamente como foi calculada |
| `excluir_proposta` | Exclui uma proposta do usuário |

O navegador nunca é a fonte do resultado: o servidor lê o imóvel no banco, refaz todo o cálculo e um usuário não enxerga nem altera propostas de outro.

Se algum CSV estiver inválido, o servidor responde HTTP 500 listando cada problema com arquivo e linha.

### 15.6 Como a aba Solar funciona

1. Dados solares do imóvel: cidade, UF, HSP manual (opcional) e consumo mensal manual (opcional). São salvos junto com o imóvel.
2. Parâmetros: percentual atendido (f), η, D e temperatura mínima. Campo em branco usa o padrão.
3. Armazenamento opcional: caixa de seleção e autonomia em horas (0 a 24).
4. Outros custos: estrutura, cabeamento, proteções e instalação (padrão R$ 0,00; a tela avisa quando estão zerados).
5. **Dimensionar**. A tela mostra: consumo de referência e origem, f, E_FV, HSP e fonte, P_FV calculada e instalada, módulos, inversor, armazenamento (capacidade calculada e instalada), geração e cobertura, custo dos equipamentos, outros custos e custo total.
6. Compatibilidade: cada verificação aparece como OK ou FALHA. Em "Alternativas consideradas" ficam os módulos comparados e os inversores e baterias descartados, cada um com o motivo.
7. É possível trocar módulo, inversor ou bateria nas listas (só aparecem opções compatíveis); trocar o módulo volta inversor e bateria para o automático.
8. Salvar proposta, abrir, excluir, exportar PDF e CSV.

Se nenhum inversor serve (por exemplo, consumo muito baixo gera poucos módulos e a razão CC/CA fica abaixo de 0,80), o sistema não finaliza nem permite salvar: mostra o bloqueio e a lista de descartados com os motivos. Com HSP de São Paulo e parâmetros padrão, uma proposta completa exige cerca de 250 kWh/mês sem baterias e cerca de 395 kWh/mês com baterias.

### 15.7 Regras de cálculo (resumo)

```text
E_FV   = C_m × f/100                       P_FV   = E_FV / (HSP × D × η)
N      = ⌈P_FV × 1000 / P_módulo⌉          P_inst = N × P_módulo / 1000
E_d    = C_m / 30                          E_aut  = E_d × A / 24
C_bat  = E_aut / (DoD × η_bat)             N_bat  = ⌈C_bat / C_nominal⌉
Geração = P_inst × HSP × D × η             Cobertura = Geração / C_m
```

O DoD é aplicado **uma única vez** (em C_bat); N_bat divide pela capacidade **nominal**. Todas as premissas (η = 0,80; D = 30; Tmin = 5 °C; razão CC/CA entre 0,80 e 1,50; outros custos em R$ 0 por padrão) e as fontes dos dados estão em `fontes_e_premissas.md`.

Critérios de escolha automática: módulo de **menor custo do arranjo** (N × preço); inversor compatível de **menor preço**; bateria compatível de **menor custo do banco**. As alternativas ficam visíveis.

### 15.8 Datasets

- `modulos.csv` (10), `inversores.csv` (8), `baterias.csv` (6) e `hsp_cidades.csv` (26 capitais) contêm **somente dados reais**, com fonte, fornecedor e data de coleta.
- A origem de cada dado (datasheet do fabricante, loja ou referência de mercado), o fornecedor e a data de coleta estão registrados em cada linha dos CSVs e em `fontes_e_premissas.md`.
- Brasília (DF) não está no catálogo de HSP (são 26 capitais): para o DF, informe o HSP manual.

### 15.9 Cenários para conferir (resultados reais do sistema)

Em ambos: cidade São Paulo, consumo mensal manual 500 kWh, e demais campos em branco (padrões f = 100 %, η = 0,80, D = 30, Tmin = 5 °C, outros custos zerados).

| | Cenário 1 — sem baterias | Cenário 2 — com baterias (12 h) |
|---|---|---|
| Módulos | 9 × Canadian Solar CS6W-550MS | 9 × Canadian Solar CS6W-550MS |
| Potência calculada / instalada | 4,460 / 4,950 kWp | 4,460 / 4,950 kWp |
| Inversor | Growatt MIN 5000TL-X2 (on-grid) | GoodWe GW5000-ES-20 (híbrido) |
| Baterias | — | 2 × Deye SE-F5 (10,24 kWh nominais; 9,22 kWh úteis) |
| Geração / cobertura | 554,9 kWh/mês / 111,0 % | 554,9 kWh/mês / 111,0 % |
| **Custo total estimado** | **R$ 6.978,93** | **R$ 22.499,93** |

A conta passo a passo está em `fontes_e_premissas.md`.

### 15.10 Testes

- **Automáticos (PHP):** `php tests\run_tests.php`, na pasta do projeto, usando os CSVs de `dados/`. Sem dependências (não usa PHPUnit nem Composer). O código de saída é 0 quando tudo passa. Na última execução registrada pelo grupo no Laragon, todos os testes foram aprovados.
- **Manuais (tela):** os dois cenários acima, salvar/abrir/excluir proposta, exportar PDF e CSV, e um erro proposital (por exemplo f = 0 ou D fora de 28 a 31).
- O painel "Testes automatizados" da interface continua cobrindo as regras da CP1.

### 15.11 Escopo e premissas da CP2

- O resultado é um pré-dimensionamento: não considera área disponível, orientação, inclinação, sombreamento, configuração detalhada de strings, proteções, aterramento, normas e requisitos da distribuidora.
- Os preços são os da data de coleta (2026-10-01).
- A eficiência de 95 % das baterias Deye SE-F5 e Dyness DL5.0C é uma premissa adotada pelo grupo.
- Os parâmetros f, η, D e Tmin ficam dentro de cada proposta salva.
- A recuperação de senha por e-mail real está descrita na seção 4.2.
- Gráfico, PDF e importação usam bibliotecas carregadas por CDN (precisa de internet).
