# Fontes, premissas e reprodução dos cenários — CP2 (Dimensionamento Fotovoltaico)

Turma 1CCPZ — FIAP. Dados coletados em **2026-10-01**.

> **Aviso:** resultado de **pré-dimensionamento acadêmico** e estimativa de custos. Não substitui projeto elétrico executivo, responsabilidade técnica nem análise de instalação por profissional habilitado.

---

## 1. Fórmulas usadas (do enunciado da atividade)

| Grandeza | Fórmula |
|---|---|
| Energia a gerar | `E_FV = C_m × f` (f em fração; na tela, em %) |
| Potência FV | `P_FV = E_FV / (HSP × D × η)` (kWp) |
| Módulos | `N = ⌈P_FV × 1000 / P_módulo⌉` |
| Potência instalada | `P_inst = N × P_módulo / 1000` (kWp) |
| Energia diária | `E_d = C_m / 30` |
| Energia na autonomia | `E_aut = E_d × A / 24` |
| Capacidade nominal necessária | `C_bat = E_aut / (DoD × η_bat)` |
| Baterias | `N_bat = ⌈C_bat / C_nominal⌉` |
| Geração estimada | `Geração = P_inst × HSP × D × η` |
| Cobertura do consumo | `Cobertura = Geração / C_m` |
| Orçamento | `C_total = C_módulos + C_inversor + C_baterias + C_outros` |

---

## 2. Premissas do grupo

Não vêm de norma nem de datasheet: são decisões do grupo, usadas para o pré-dimensionamento. Ficam em `config_fv.php`.

| Premissa | Valor adotado | Faixa aceita | Justificativa |
|---|---|---|---|
| Fator global de desempenho (η) | **0,80** | 0,50 a 0,95 | Valor usual de "performance ratio" em pré-dimensionamento residencial; a faixa barra erros de digitação. |
| Dias do mês (D) | **30** | 28 a 31 | Mesma convenção de 30 dias/mês já usada no consumo da CP1. |
| Percentual atendido (f) | **100 %** | 1 % a 100 % | Critério de aceite do requisito (PB22/US19). |
| Temperatura mínima de projeto | **5 °C** | −30 a 25 °C | Usada para corrigir a Voc do módulo a frio e conferir a tensão máxima do inversor. Deve ser ajustada à cidade. |
| Razão CC/CA aceita | **0,80 a 1,50** | — | Razão `P_instalada (kWp) / P_CA (kW)`. Fora dessa faixa o inversor é descartado. |
| Aplicação do DoD | **uma única vez**, em C_bat | — | `N_bat` divide C_bat pela capacidade **nominal**; dividir pela útil aplicaria o DoD duas vezes. |
| E_d | **C_m / 30** | — | O enunciado fixa 30 dias nesta fórmula; o parâmetro D vale só para P_FV. |
| Autonomia | maior que 0 e até 24 h | — | US25-T03: autonomia obrigatória quando há baterias. A faixa de 0 a 24 h é premissa da equipe. |
| Outros custos | **R$ 0,00** por padrão | — | Estrutura, cabeamento, proteções e instalação não têm fonte validada ainda. A proposta mostra aviso quando o total de outros custos é zero. O usuário pode informar os valores. |
| Banco de baterias | baterias em **paralelo** (tensão = nominal; correntes somam) | — | Simplificação do pré-dimensionamento. |
| Eficiência das baterias Deye SE-F5 e Dyness DL5.0C | **95 %** | — | **Premissa**: nenhum dos dois fabricantes publica a eficiência de ida e volta. |
| Corrente da Pylontech US5000 | **80 A** | — | É a corrente **recomendada** do manual (máxima contínua: 100 A). Mantida por prudência. |
| Corrente da Deye SE-F5 | 100 A de carga e descarga | — | Vem da página da loja. A Deye vende várias versões (Pro, Plus, -E, -L) e o datasheet da versão exata não foi conferido. |

---

## 3. Recurso solar (HSP)

- **Fonte:** Altoé e Ribeiro (2020), *Revista de Engenharia e Tecnologia*, v.12 n.4, Tabelas 1 a 5 — irradiação diária média no **plano inclinado** (inclinação ≈ latitude), a partir do Atlas Brasileiro de Energia Solar (INPE, 2017) via Neosolar (abril/2020). Link de cada linha em `dados/hsp_cidades.csv` (coluna `url_fonte`). Data da consulta: 2026-10-01.
- **Ordem de precedência no sistema:** HSP manual do usuário → cidade encontrada no catálogo → capital da mesma UF (alternativa, avisada na tela) → bloqueio, se não houver nada.
- **Limites:** o catálogo tem 26 capitais; **Brasília (DF) não está nele** e exige HSP manual. O valor aceito vai de 1,0 a 9,0 kWh/m².dia.

| Cidade | UF | HSP (kWh/m².dia) | | Cidade | UF | HSP (kWh/m².dia) |
|---|---|---:|---|---|---|---:|
| Rio Branco | AC | 4,605 | | Salvador | BA | 5,396 |
| Manaus | AM | 4,327 | | Cuiabá | MT | 5,243 |
| Porto Velho | RO | 4,521 | | Campo Grande | MS | 5,235 |
| Boa Vista | RR | 4,898 | | Goiânia | GO | 5,436 |
| Belém | PA | 4,865 | | Belo Horizonte | MG | 5,350 |
| Macapá | AP | 4,944 | | Vitória | ES | 5,132 |
| Palmas | TO | 5,294 | | Rio de Janeiro | RJ | 4,934 |
| São Luís | MA | 5,208 | | **São Paulo** | **SP** | **4,671** |
| Teresina | PI | 5,582 | | Curitiba | PR | 4,410 |
| Fortaleza | CE | 5,775 | | Florianópolis | SC | 4,486 |
| Natal | RN | 5,676 | | Porto Alegre | RS | 4,674 |
| João Pessoa | PB | 5,531 | | | | |
| Maceió | AL | 5,530 | | | | |
| Recife | PE | 5,448 | | | | |
| Aracaju | SE | 5,509 | | | | |

---

## 4. Datasets de equipamentos

Todos os produtos são reais, vendidos no Brasil, com `fornecedor`, `data_coleta` e URL rastreável. Especificações técnicas vêm preferencialmente do datasheet do fabricante (`url_especificacoes`); preços vêm da página indicada em `url_fonte`/`url_preco`.

**Como ler a coluna "Força do preço":**
- **Loja** = preço de uma loja que vende o produto no Brasil.
- **Referência** = preço de blog, estudo de mercado, faixa de preço, preço médio de distribuidor ou PDF de datasheet (que não traz preço). Serve como referência, **não é cotação de loja**.

### 4.1 Módulos (`dados/modulos.csv`, 10 itens)

| ID | Produto | Wp | Preço (R$) | Fornecedor / origem do preço | Força do preço |
|---|---|---:|---:|---|---|
| PN-001 | Canadian Solar CS6W-550MS | 550 | 547,77 | Minha Casa Solar | Loja |
| PN-002 | Canadian Solar CS6.2-66TB-620 (bifacial) | 620 | 809,10 | Minha Casa Solar (PIX) | Loja |
| PN-003 | BYD MLK-36 550W | 550 | 800,00 | BYD Campinas / distribuição (estudo de mercado) | Referência |
| PN-004 | BYD HRP72S 580W | 580 | 680,00 | PHB Solar / distribuição (a fonte é o PDF de 575 Wp) | Referência |
| PN-005 | BYD TUI66T 620W | 620 | 780,00 | PHB Solar / distribuição (a fonte é o PDF de 600 W) | Referência |
| PN-006 | Osda ODA550-36-MH | 550 | 869,99 | Pichau (PIX; a página aparecia como "sem estoque" na coleta) | Loja |
| PN-007 | Jinko Tiger Neo JKM555N-72HL4 | 555 | 900,00 | Aldo Solar / BelEnergy (preço médio) | Referência |
| PN-008 | Trina Vertex S+ TSM-555NEG19R | 555 | 900,00 | BelEnergy / Fotus (preço médio) | Referência |
| PN-009 | Astronergy CHSM72M-HC 550W | 550 | 840,00 | BelEnergy / Fotus (artigo de ranking) | Referência |
| PN-010 | Canadian Solar TOPHiKu6 CS6W-555T | 555 | 850,00 | Aldo Solar / NeoSolar (preço médio) | Referência |

Observações: no PN-001 o peso da loja (24,3 kg) difere do datasheet (27,6 kg); foi adotado o datasheet. Os PN-004 e PN-005 têm datasheet de classes de potência vizinhas (575 Wp e 600 W).

### 4.2 Inversores (`dados/inversores.csv`, 8 itens)

| ID | Produto | Tipo | kW | Preço (R$) | Fornecedor / origem do preço | Força do preço |
|---|---|---|---:|---:|---|---|
| INV-001 | Hoymiles HYS 7.5LV-USG1 | híbrido | 7,5 | 10.712,72 | Casa do Micro Inversor (PIX, em kit) | Loja (datasheet é do modelo 7.6) |
| INV-002 | Deye SUN-5K-SG05LP1-EU-SM2-P | híbrido | 5,0 | 6.110,00 | Ensolar Energia | Loja |
| INV-003 | GoodWe GW5000-ES-20 | híbrido | 5,0 | 6.500,00 | Distribuição BR / ShopEnergia (faixa de R$ 6.500 a 9.000) | **Referência** |
| INV-004 | Growatt SPH5000 BL-UP | híbrido | 5,0 | 7.200,00 | Distribuição BR (página de categoria) | **Referência** |
| INV-005 | Growatt MIN 3000TL-X | on-grid | 3,0 | 3.306,45 | MeuGerador (PIX) | Loja |
| INV-006 | Growatt MIN 5000TL-X2 | on-grid | 5,0 | 2.049,00 | Mundial Energy (PIX) | Loja |
| INV-007 | Solis S6-GR1P5K-S | on-grid | 5,0 | 2.800,00 | Distribuição BR (média entre R$ 2.600 e 3.200) | **Referência** |
| INV-008 | Fronius Primo 3.0-1 | on-grid | 3,0 | 5.898,53 | Anápolis Energia Solar (à vista) | Loja |

### 4.3 Baterias (`dados/baterias.csv`, 6 itens)

| ID | Produto | kWh | DoD | η (%) | Carga/descarga (A) | Preço (R$) | Fornecedor | Força do preço |
|---|---|---:|---:|---:|---|---:|---|---|
| BAT-001 | Baterias Moura 48MSL100 | 4,80 | 80 % | 95 | 100 / 100 | 4.799,50 | Direta Energia Solar (PIX) | Loja |
| BAT-002 | Deye SE-F5 | 5,12 | 90 % | 95* | 100 / 100 | 5.535,00 | Ensolar Energia (PIX) | Loja |
| BAT-003 | Dyness DL5.0C | 5,12 | 90 % | 95* | 75 / 100 | 7.980,00 | MercadoLivre | Loja |
| BAT-004 | Unipower UPLFP48-100 3U | 4,80 | 80 % | 98 | 100 / 100 | 5.858,07 | NeoSolar (PIX) | Loja |
| BAT-005 | Unipower UPLFP48INWALL 100Ah | 4,80 | 80 % | 95 | 100 / 100 | 5.638,50 | Minha Casa Solar (PIX) | Loja |
| BAT-006 | Pylontech US5000 | 4,80 | 95 % | 95 | 80 / 80** | 8.990,00 | Solarbex / MercadoLivre | Loja |

\* Eficiência de 95 %: premissa do grupo (o fabricante não publica). \*\* Corrente recomendada do manual (máxima contínua: 100 A).

### 4.4 Pontos fracos conhecidos (aceitos pelo grupo)

- Os preços dos módulos PN-003, 004, 005, 007, 008, 009 e 010 e dos inversores INV-003, 004 e 007 são **de referência** (blog, estudo de mercado, faixa de preço ou PDF de datasheet), não cotação de loja.
- **O inversor INV-003 (GoodWe), usado no cenário com baterias, tem preço de referência** (o piso de uma faixa de R$ 6.500 a 9.000). O custo total do cenário 2 pode ficar maior com o preço real de loja.
- O PN-006 (Osda) aparecia como "sem estoque" na página da Pichau na coleta.
- A Elgin foi retirada: só vende B2B e não tem preço de varejo.
- Preços variam com o tempo; por isso cada linha traz a data de coleta (2026-10-01).

---

## 5. Reprodução manual dos 2 cenários

**Entradas comuns:** cidade São Paulo/SP; consumo de referência `C_m = 500 kWh/mês` (informado manualmente); `f = 100 %`; `η = 0,80`; `D = 30`; `Tmin = 5 °C`; HSP = **4,671** kWh/m².dia (catálogo, São Paulo); outros custos = R$ 0,00.

### 5.1 Geração (igual nos dois cenários)

1. `E_FV = 500 × 1,00 = 500 kWh/mês`
2. `P_FV = 500 / (4,671 × 30 × 0,80) = 500 / 112,104 = 4,460 kWp`
3. **Módulo escolhido: o de menor custo do arranjo (N × preço).**

| Módulo | N = ⌈4.460 / P_módulo⌉ | Custo do arranjo |
|---|---:|---:|
| **PN-001 Canadian CS6W-550MS (550 Wp)** | ⌈8,11⌉ = **9** | **R$ 4.929,93** |
| PN-004 BYD HRP72S (580 Wp) | 8 | R$ 5.440,00 |
| PN-005 BYD TUI66T (620 Wp) | 8 | R$ 6.240,00 |
| PN-002 Canadian CS6.2-66TB-620 | 8 | R$ 6.472,80 |
| demais (PN-003, 009, 010, 006, 007, 008) | 9 | de R$ 7.200,00 a R$ 8.100,00 |

4. `P_inst = 9 × 550 / 1000 = 4,950 kWp`
5. `Geração = 4,950 × 4,671 × 30 × 0,80 = 554,9 kWh/mês` e `Cobertura = 554,9 / 500 = 111,0 %`
6. Custo dos módulos: `9 × R$ 547,77 = R$ 4.929,93`

### 5.2 Cenário 1 — sem baterias

**Compatibilidade (módulo × inversor).** Voc a frio do módulo: `49,6 × (1 + (−0,27/100) × (5 − 25)) = 52,28 V`.

Inversores aprovados, do mais barato ao mais caro: **INV-006 Growatt MIN 5000TL-X2 (R$ 2.049,00)**, INV-007 Solis (R$ 2.800,00), INV-003 GoodWe (R$ 6.500,00) e INV-004 Growatt SPH5000 (R$ 7.200,00). Foram descartados: INV-001 (razão CC/CA 0,66), INV-002 (corrente por MPPT: Imp 13,20 A contra limite de 13,00 A), INV-005 e INV-008 (razão CC/CA 1,65).

Verificações do **Growatt MIN 5000TL-X2** (potência CA 5 kW):

| Verificação | Cálculo | Resultado |
|---|---|---|
| Razão CC/CA | 4,95 / 5,00 = **0,99** (aceita 0,80 a 1,50) | OK |
| Potência CC máxima | 4,95 kWp ≤ 7,00 kW | OK |
| Tensão máxima | 52,28 V ≤ 550 V | OK |
| Corrente por MPPT | Imp 13,20 A (Isc 14,00 A) ≤ 13,50 A | OK |
| Strings | cabem 9 módulos em 1 string (2 a 10 módulos por string; faixa MPPT 80 a 550 V) | OK, 1 MPPT |

**Orçamento**

| Item | Qtd. | Preço unit. | Subtotal |
|---|---:|---:|---:|
| Canadian Solar CS6W-550MS | 9 | R$ 547,77 | R$ 4.929,93 |
| Growatt MIN 5000TL-X2 | 1 | R$ 2.049,00 | R$ 2.049,00 |
| Outros custos (4 itens) | — | R$ 0,00 | R$ 0,00 |
| **Custo total estimado** | | | **R$ 6.978,93** |

### 5.3 Cenário 2 — com baterias (autonomia de 12 h)

1. `E_d = 500 / 30 = 16,667 kWh/dia`
2. `E_aut = 16,667 × 12 / 24 = 8,333 kWh`
3. **Inversor híbrido obrigatório.** Dos aprovados no cenário 1, só os híbridos seguem: **INV-003 GoodWe GW5000-ES-20 (R$ 6.500,00)** e INV-004 Growatt SPH5000 (R$ 7.200,00). Escolhido: o mais barato, o GoodWe.
   - Razão CC/CA 4,95 / 5,00 = 0,99; potência CC máxima 4,95 ≤ 7,50 kW; Voc a frio 52,28 V ≤ 580 V; Imp 13,20 A ≤ 16,00 A; 9 módulos em 1 MPPT (faixa 60 a 550 V). Todas OK.
4. **Baterias** (com DoD e η de cada modelo). Para a **Deye SE-F5** (DoD 90 %, η 95 %, 5,12 kWh):
   - `C_bat = 8,333 / (0,90 × 0,95) = 9,747 kWh`
   - `N_bat = ⌈9,747 / 5,12⌉ = ⌈1,90⌉ = 2`
   - Capacidade instalada: 2 × 5,12 = **10,24 kWh nominais**; útil: 10,24 × 0,90 = **9,22 kWh**
5. **Compatibilidade do banco com o inversor GoodWe (bateria 40 a 60 V; 120 A):**

| Verificação | Cálculo | Resultado |
|---|---|---|
| Tensão do banco | 51,2 V dentro de 40 a 60 V | OK |
| Corrente de carga | 2 × 100 A = 200 A ≥ 120 A | OK |
| Corrente de descarga | 2 × 100 A = 200 A ≥ 120 A | OK |

6. **Comparação entre baterias compatíveis (menor custo do banco):**

| Bateria | N | Custo do banco |
|---|---:|---:|
| **BAT-002 Deye SE-F5** | 2 | **R$ 11.070,00** |
| BAT-001 Moura 48MSL100 | 3 | R$ 14.398,50 |
| BAT-003 Dyness DL5.0C | 2 | R$ 15.960,00 |
| BAT-005 Unipower INWALL | 3 | R$ 16.915,50 |
| BAT-004 Unipower 3U | 3 | R$ 17.574,21 |
| BAT-006 Pylontech US5000 | 2 | R$ 17.980,00 |

**Orçamento**

| Item | Qtd. | Preço unit. | Subtotal |
|---|---:|---:|---:|
| Canadian Solar CS6W-550MS | 9 | R$ 547,77 | R$ 4.929,93 |
| GoodWe GW5000-ES-20 | 1 | R$ 6.500,00 | R$ 6.500,00 |
| Deye SE-F5 | 2 | R$ 5.535,00 | R$ 11.070,00 |
| Outros custos (4 itens) | — | R$ 0,00 | R$ 0,00 |
| **Custo total estimado** | | | **R$ 22.499,93** |

---

## 6. Como reproduzir no sistema

1. Siga a ordem de instalação do `README.md` (seção 15.2).
2. Entre, crie um imóvel e abra a aba **Solar**.
3. Cidade **São Paulo**; consumo mensal manual **500**; deixe os demais campos em branco (os padrões são os valores da seção 2).
4. **Cenário 1:** deixe as baterias desmarcadas e clique em **Dimensionar**.
5. **Cenário 2:** marque **Incluir baterias na solução**, autonomia **12**, e clique em **Dimensionar**.
6. Compare com as tabelas da seção 5. Salve cada proposta e exporte em PDF e CSV.

Alternativa sem a tela, usando o código (na pasta do projeto):

```php
<?php
require 'fv_lib.php';
$ds = fv_carregar_datasets();
$imovel = ['cidade' => 'São Paulo', 'uf' => 'SP', 'consumo_manual_kwh' => 500];
$sem = fv_dimensionar($imovel, [], $ds);
$com = fv_dimensionar($imovel, ['armazenamento' => true, 'autonomia_h' => 12], $ds);
echo $sem['orcamento']['custo_total'], "\n";   // 6978.93
echo $com['orcamento']['custo_total'], "\n";   // 22499.93
```

Testes automáticos (usam os CSVs de `dados/` e conferem estes dois cenários): `php tests\run_tests.php`.


---

## 7. Limitações

- Pré-dimensionamento acadêmico: não considera área disponível, orientação, inclinação, sombreamento, strings detalhadas, proteções, aterramento, normas técnicas e requisitos da distribuidora.
- HSP médio do plano inclinado das capitais; cidades fora do catálogo usam a capital da UF (avisado na tela); DF exige HSP manual.
- Preços de referência na data de coleta; parte vem de blog, faixa de mercado ou preço médio.
- Outros custos (estrutura, cabeamento, proteções, instalação) ficam em R$ 0,00 até o usuário informar valores; o custo total da tela deve ser lido junto com esse aviso.
- Banco de baterias sempre em paralelo e sem considerar degradação, temperatura ou perfil horário de carga e descarga.
