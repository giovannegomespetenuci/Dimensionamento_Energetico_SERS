# Product Backlog — CP3 (Sprint 3)

Entrega: **23/10/2026, 23h59**. Meta: finalizar o sistema com interface web, relatório e persistência, e preparar a Sprint Review (vídeo de 3 a 5 min).

| História | Título | Épico | Prioridade | Tasks |
|---|---|---|---|---:|
| US32 | Interface web final da aba Solar | E1 - Interface web final | Must | 5 |
| US33 | Relatório de orçamento fotovoltaico | E2 - Relatório da proposta | Must | 5 |
| US34 | Histórico e persistência de propostas | E3 - Persistência e segurança | Must | 4 |
| US35 | Recuperação de senha com e-mail real | E3 - Persistência e segurança | Should | 4 |
| US36 | Ampliar catálogos e HSP | E1 - Interface web final | Could | 3 |
| US37 | Segurança básica da aplicação | E3 - Persistência e segurança | Should | 4 |
| US38 | Testes e validação final | E4 - Qualidade e entrega | Must | 4 |
| US39 | Documentação e Sprint Review | E4 - Qualidade e entrega | Must | 5 |

> Backlog elaborado pelo grupo a partir da seção 14 do README; confira com o Product Backlog oficial do professor e ajuste.

## US32 — Interface web final da aba Solar
Épico: E1 - Interface web final · Prioridade: Must · Dependências: US18–US31

- US32-T01: Revisar o fluxo imóvel → Solar → proposta para que seja concluído sem recarregar a página nem sair da tela
- US32-T02: Padronizar mensagens de erro e validação nos formulários da aba Solar
- US32-T03: Tornar a interface responsiva (celular/tablet) e revisar contraste e rótulos
- US32-T04: Embutir localmente as bibliotecas de gráfico/PDF (Chart.js, jsPDF) para funcionar sem internet
- US32-T05: Testar manualmente o fluxo completo em um navegador e registrar evidências (prints)

## US33 — Relatório de orçamento fotovoltaico
Épico: E2 - Relatório da proposta · Prioridade: Must · Dependências: US20–US31

- US33-T01: Definir o layout do relatório: dados do imóvel, consumo, HSP, módulos, inversor, baterias e orçamento
- US33-T02: Incluir no relatório o resumo financeiro (custo total, custo por kWp, retorno simples estimado)
- US33-T03: Gerar o relatório em PDF com cabeçalho, data, aviso de pré-dimensionamento e identificação do grupo
- US33-T04: Adicionar gráfico de geração estimada mensal x consumo ao relatório
- US33-T05: Validar o conteúdo dos arquivos PDF e CSV exportados contra o cálculo da tela

## US34 — Histórico e persistência de propostas
Épico: E3 - Persistência e segurança · Prioridade: Must · Dependências: US31

- US34-T01: Permitir renomear e duplicar uma proposta salva
- US34-T02: Listar propostas por imóvel com data, potência e valor total, com filtro e ordenação
- US34-T03: Comparar duas propostas salvas lado a lado
- US34-T04: Confirmar que excluir imóvel remove propostas e que nenhuma proposta fica órfã (teste no banco)

## US35 — Recuperação de senha com e-mail real
Épico: E3 - Persistência e segurança · Prioridade: Should · Dependências: US16

- US35-T01: Escolher o serviço de envio (SMTP/PHPMailer) e mover credenciais para arquivo de configuração fora do código
- US35-T02: Gerar token temporário com expiração e uso único
- US35-T03: Enviar o e-mail com o link e criar a tela de redefinição
- US35-T04: Testar token expirado, token reutilizado e e-mail inexistente

## US36 — Ampliar catálogos e HSP
Épico: E1 - Interface web final · Prioridade: Could · Dependências: US18, US21, US23

- US36-T01: Incluir Brasília e demais cidades no hsp_cidades.csv com fonte e data
- US36-T02: Atualizar preços e ampliar módulos, inversores e baterias, registrando fornecedor e data de coleta
- US36-T03: Rodar a validação dos datasets e os testes após a atualização

## US37 — Segurança básica da aplicação
Épico: E3 - Persistência e segurança · Prioridade: Should · Dependências: US07

- US37-T01: Mover credenciais do banco para configuração fora do código
- US37-T02: Adicionar proteção CSRF nos endpoints que alteram dados
- US37-T03: Limitar tentativas de login e configurar cookies de sessão seguros
- US37-T04: Evitar exibir detalhes internos nas mensagens de erro

## US38 — Testes e validação final
Épico: E4 - Qualidade e entrega · Prioridade: Must · Dependências: US32–US37

- US38-T01: Executar tests/run_tests.php em ambiente limpo e registrar a versão do MySQL/MariaDB
- US38-T02: Executar o schema em banco novo e em banco da CP2 (idempotência)
- US38-T03: Testar a importação com arquivos reais contendo linhas válidas e inválidas
- US38-T04: Conferir manualmente os cenários 1 e 2 de fontes_e_premissas.md pela tela

## US39 — Documentação e Sprint Review
Épico: E4 - Qualidade e entrega · Prioridade: Must · Dependências: US32–US38

- US39-T01: Atualizar o README com a CP3 (situação, instalação, limitações)
- US39-T02: Finalizar o quadro do Trello (todos os cartões na coluna correta) e salvar o link em docs/CP 3/TrelloLink.txt
- US39-T03: Escrever o roteiro do vídeo pitch de 3 a 5 minutos
- US39-T04: Gravar, revisar e enviar o vídeo
- US39-T05: Conferir o repositório final no GitHub antes do prazo (23/10/2026, 23h59)
