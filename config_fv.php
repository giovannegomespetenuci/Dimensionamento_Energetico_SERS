<?php
declare(strict_types=1);

/**
 * US19, US20-T02, US24-T01, US25-T03 e US29-T02 — Configuração central do dimensionamento fotovoltaico.
 * Onde está "PREMISSA DA EQUIPE", o valor é decisão do grupo (não vem de norma nem datasheet);
 * todas as premissas estão documentadas em fontes_e_premissas.md (seção 2).
 */
function fv_config(): array
{
    return [
        'parametros' => [
            'f' => [
                'rotulo' => 'Percentual de atendimento (f)', 'unidade' => '%',
                'padrao' => 100.0, 'min' => 1.0, 'max' => 100.0,
                'origem' => 'Critério de aceite PB22/US19: percentual entre 1% e 100%.',
            ],
            'eta' => [
                'rotulo' => 'Fator global de desempenho (η)', 'unidade' => 'adimensional',
                'padrao' => 0.80, 'min' => 0.50, 'max' => 0.95,
                'origem' => 'PREMISSA DA EQUIPE: 0,80 é o valor usual de "performance ratio" em pré-dimensionamento residencial; faixa 0,50–0,95 para barrar erros de digitação.',
            ],
            'D' => [
                'rotulo' => 'Dias do mês considerados (D)', 'unidade' => 'dias',
                'padrao' => 30.0, 'min' => 28.0, 'max' => 31.0,
                'origem' => 'Mesma convenção de 30 dias/mês já usada no cálculo de consumo (vw_consumo_equipamento).',
            ],
            'tmin_c' => [
                'rotulo' => 'Temperatura mínima de projeto', 'unidade' => '°C',
                'padrao' => 5.0, 'min' => -30.0, 'max' => 25.0,
                'origem' => 'PREMISSA DA EQUIPE: usada para corrigir a Voc do módulo a frio (tensão máxima do inversor). Ajustar conforme a cidade do imóvel.',
            ],
        ],
        'hsp' => [
            'min' => 1.0, 'max' => 9.0,
            'origem' => 'Faixa de plausibilidade para HSP no Brasil (kWh/m².dia); fora dela é tratado como erro de digitação.',
        ],
        'compatibilidade' => [
            'razao_cc_ca_min' => 0.80,
            'razao_cc_ca_max' => 1.50,
            'origem' => 'PREMISSA DA EQUIPE: razão P_instalada(kWp) / P_CA(kW) aceita entre 0,80 e 1,50. Fora disso o inversor é descartado.',
        ],
        'baterias' => [
            'autonomia_min_h' => 0.0, 'autonomia_max_h' => 24.0,
            'origem' => 'US25-T03: autonomia obrigatória quando há baterias; a faixa de 0 a 24 h é premissa da equipe (para dimensionar, deve ser > 0).',
        ],
        // US29-T02 — modos: valor (R$ fixo) | percentual_equipamentos | por_kwp | por_modulo
        'outros_custos' => [
            'estrutura'  => ['rotulo' => 'Estrutura de fixação',         'modo' => 'valor', 'valor' => 0.0],
            'cabeamento' => ['rotulo' => 'Cabeamento e conectores',      'modo' => 'valor', 'valor' => 0.0],
            'protecoes'  => ['rotulo' => 'Proteções (DPS, disjuntores)', 'modo' => 'valor', 'valor' => 0.0],
            'instalacao' => ['rotulo' => 'Mão de obra / instalação',     'modo' => 'valor', 'valor' => 0.0],
            'origem' => 'Sem fonte validada ainda: padrão R$ 0,00. A proposta mostra aviso quando o total de outros custos é zero.',
        ],
        'datasets' => [
            'dir' => __DIR__ . '/dados',
            'permitir_sinteticos' => false,
            'minimos' => ['modulos' => 10, 'inversores' => 8, 'baterias' => 6], // mínimos da US "Construção da base de equipamentos fotovoltaicos"
        ],
        'aviso_limitacoes' => 'Resultado de PRÉ-DIMENSIONAMENTO ACADÊMICO. Não substitui projeto elétrico, '
            . 'visita técnica, nem a responsabilidade de profissional habilitado. Preços e especificações '
            . 'dependem da data de coleta registrada nos datasets.',
    ];
}
