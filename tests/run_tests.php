<?php
declare(strict_types=1);

/**
 * Testes do dimensionamento fotovoltaico (Sprint 2).
 * Executar:  php tests/run_tests.php
 * Sem dependências (não usa PHPUnit/Composer). Código de saída 0 = tudo passou.
 *
 * Os testes usam os datasets reais da pasta /dados (a mesma base do sistema). Os valores
 * esperados dos cenários vêm de fontes_e_premissas.md (seção 5).
 *
 * CASO DE REFERÊNCIA: o enunciado traz as fórmulas, mas não um caso numérico pronto. Por isso
 * os testes das fórmulas usam um caso de CONFERÊNCIA MANUAL da equipe (C_m=500 kWh, f=100%,
 * HSP=5,0, D=30, η=0,80, autonomia 12 h, constantes REF_*). Os testes com os datasets reais
 * usam São Paulo (HSP=4,671) e os dois cenários de fontes_e_premissas.md (seção 5).
 */

require_once __DIR__ . '/../fv_lib.php';

$GLOBALS['__ok'] = 0;
$GLOBALS['__falhas'] = [];
$GLOBALS['__secao'] = '';

function secao(string $s): void { $GLOBALS['__secao'] = $s; echo "\n== $s ==\n"; }
function teste(string $nome, callable $fn): void
{
    try {
        $fn();
        $GLOBALS['__ok']++;
        echo "  [OK]    $nome\n";
    } catch (Throwable $e) {
        $GLOBALS['__falhas'][] = $GLOBALS['__secao'] . ' :: ' . $nome . ' -> ' . $e->getMessage();
        echo "  [FALHA] $nome -> " . $e->getMessage() . "\n";
    }
}
function igual($obtido, $esperado, string $msg = ''): void
{
    if ($obtido !== $esperado) {
        throw new Exception(($msg ? "$msg: " : '') . 'esperado ' . var_export($esperado, true) . ' obtido ' . var_export($obtido, true));
    }
}
function proximo(float $obtido, float $esperado, float $tol = 0.001, string $msg = ''): void
{
    if (abs($obtido - $esperado) > $tol) {
        throw new Exception(($msg ? "$msg: " : '') . "esperado $esperado (±$tol) obtido $obtido");
    }
}
function verdadeiro($cond, string $msg = 'condição falsa'): void { if (!$cond) { throw new Exception($msg); } }
function deve_falhar(string $classe, callable $fn, string $contem = ''): void
{
    try { $fn(); } catch (Throwable $e) {
        if (!($e instanceof $classe)) { throw new Exception("lançou " . get_class($e) . " em vez de $classe: " . $e->getMessage()); }
        if ($contem !== '' && stripos($e->getMessage(), $contem) === false) { throw new Exception("mensagem '" . $e->getMessage() . "' não contém '$contem'"); }
        return;
    }
    throw new Exception("era esperado $classe, mas nada foi lançado");
}
function csv_temp(string $conteudo): string
{
    $p = tempnam(sys_get_temp_dir(), 'fvtest') . '.csv';
    file_put_contents($p, $conteudo);
    return $p;
}

// ---------- caso de conferência manual ----------
const REF_CM = 500.0;
const REF_F = 100.0;
const REF_HSP = 5.0;
const REF_D = 30.0;
const REF_ETA = 0.80;

$cfgTeste = fv_config();
$DS = fv_carregar_datasets($cfgTeste);
$imovelBase = ['cidade' => 'São Paulo', 'uf' => 'SP', 'consumo_manual_kwh' => REF_CM, 'consumo_estimado_kwh' => null];

/* ===================================================================== US18 */
secao('US18-T03/T04 — Consulta de HSP');
$hsp = fv_carregar_hsp(__DIR__ . '/../dados/hsp_cidades.csv');
teste('consulta por cidade (acento/caixa ignorados)', function () use ($hsp) {
    $r = fv_resolver_hsp('sao paulo', 'SP', null, $hsp);
    igual($r['origem'], 'cidade'); proximo($r['hsp'], 4.671);
});
teste('cidade sem UF informada ainda é encontrada', function () use ($hsp) {
    $r = fv_resolver_hsp('Fortaleza', null, null, $hsp);
    igual($r['origem'], 'cidade'); proximo($r['hsp'], 5.775);
});
teste('fallback por UF quando a cidade não está no dataset', function () use ($hsp) {
    $r = fv_resolver_hsp('Campinas', 'SP', null, $hsp);
    igual($r['origem'], 'uf'); proximo($r['hsp'], 4.671);
});
teste('HSP manual prevalece sobre cidade e UF', function () use ($hsp) {
    $r = fv_resolver_hsp('São Paulo', 'SP', 5.2, $hsp);
    igual($r['origem'], 'manual'); proximo($r['hsp'], 5.2);
});
teste('rejeita HSP inválido (zero, negativo, texto, acima do máximo)', function () use ($hsp) {
    foreach ([0, -1, 'abc', 15, 0.2] as $v) {
        deve_falhar(FvErro::class, function () use ($v, $hsp) { fv_resolver_hsp('São Paulo', 'SP', $v, $hsp); });
    }
});
teste('sem cidade, UF nem HSP manual: bloqueia o cálculo', function () use ($hsp) {
    deve_falhar(FvErro::class, function () use ($hsp) { fv_resolver_hsp(null, null, null, $hsp); }, 'HSP não definido');
});
teste('UF sem referência no dataset (DF) bloqueia', function () use ($hsp) {
    deve_falhar(FvErro::class, function () use ($hsp) { fv_resolver_hsp('Brasília', 'DF', null, $hsp); });
});

/* ===================================================================== Consumo */
secao('Consumo de referência — origens (manual × estimado)');
teste('somente estimado', function () { $r = fv_resolver_consumo(320.5, null); igual($r['origem'], 'estimado'); proximo($r['valor'], 320.5); });
teste('somente manual', function () { $r = fv_resolver_consumo(0, 410); igual($r['origem'], 'manual'); proximo($r['valor'], 410); });
teste('manual prevalece sobre estimado', function () { $r = fv_resolver_consumo(320.5, 410); igual($r['origem'], 'manual'); proximo($r['valor'], 410); });
teste('manual zero/inválido cai para o estimado', function () { $r = fv_resolver_consumo(320.5, 0); igual($r['origem'], 'estimado'); });
teste('sem nenhum valor válido: bloqueia o dimensionamento', function () {
    foreach ([[null, null], [0, 0], ['', 'abc'], [-5, -1]] as $par) {
        deve_falhar(FvErro::class, function () use ($par) { fv_resolver_consumo($par[0], $par[1]); });
    }
});

/* ===================================================================== US19/US20 */
secao('US19-T02 / US20-T02 — Parâmetros f, η, D');
teste('valores padrão documentados', function () {
    $p = fv_validar_parametros([]);
    proximo($p['f'], 100.0); proximo($p['eta'], 0.80); proximo($p['D'], 30.0);
});
teste('limites mínimo e máximo são aceitos', function () {
    $min = fv_validar_parametros(['f' => 1, 'eta' => 0.5, 'D' => 28]);
    $max = fv_validar_parametros(['f' => 100, 'eta' => 0.95, 'D' => 31]);
    proximo($min['f'], 1.0); proximo($max['eta'], 0.95); proximo($max['D'], 31.0);
});
teste('valores fora da faixa são rejeitados (→ HTTP 422)', function () {
    foreach ([['f' => 0], ['f' => 100.5], ['f' => -3], ['eta' => 0.49], ['eta' => 1.2], ['D' => 27], ['D' => 32], ['f' => 'abc']] as $in) {
        deve_falhar(FvErro::class, function () use ($in) { fv_validar_parametros($in); });
    }
});
teste('FvErro é InvalidArgumentException (o endpoint já devolve 422 para ela)', function () {
    verdadeiro(new FvErro('x') instanceof InvalidArgumentException);
});

/* ===================================================================== US19/US20 */
secao('US19-T03 / US20-T04 — Energia e potência FV');
teste('E_FV = C_m × f', function () { proximo(fv_energia_fv(500, 100), 500.0); proximo(fv_energia_fv(500, 60), 300.0); });
teste('P_FV = E_FV / (HSP × D × η) — caso de conferência', function () {
    proximo(fv_potencia_fv(500, 5.0, 30, 0.8), 4.1666667, 1e-6);
});
teste('atendimento parcial 60%: 300 kWh → 2,5 kWp', function () { proximo(fv_potencia_fv(fv_energia_fv(500, 60), 5.0, 30, 0.8), 2.5, 1e-9); });
teste('divisão por zero é barrada', function () {
    deve_falhar(FvErro::class, function () { fv_potencia_fv(500, 0, 30, 0.8); });
    deve_falhar(FvErro::class, function () { fv_potencia_fv(500, 5, 0, 0.8); });
    deve_falhar(FvErro::class, function () { fv_potencia_fv(500, 5, 30, 0.0); });
});
teste('dados ausentes: dimensionar() bloqueia sem consumo e sem HSP', function () use ($DS, $cfgTeste) {
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste) { fv_dimensionar(['cidade' => 'São Paulo', 'uf' => 'SP'], [], $DS, $cfgTeste); }, 'Consumo');
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste) { fv_dimensionar(['consumo_manual_kwh' => 500], [], $DS, $cfgTeste); }, 'HSP');
});

/* ===================================================================== US21/23/26 */
secao('US21-T04 / US23-T04 / US26-T04 — Carregadores de dataset');
$cabP = 'id,fabricante,modelo,potencia_wp,voc_v,isc_a,vmp_v,imp_a,eficiencia_pct,preco_brl,fornecedor,data_coleta,url_fonte,coef_voc_pct_c,coef_pmax_pct_c,comprimento_mm,largura_mm,espessura_mm,peso_kg,url_especificacoes,observacoes';
$linhaP = 'PN-X,Marca,Mod,550,49.6,14,41.7,13.2,21.5,500,Loja,2026-10-01,https://loja.exemplo/p,-0.26,-0.34,2261,1134,35,27.8,https://fab.exemplo/ds,';
teste('módulos: arquivo real em /dados carrega', function () {
    $m = fv_carregar_modulos(__DIR__ . '/../dados/modulos.csv');
    verdadeiro(count($m) >= 1);
    foreach ($m as $x) { verdadeiro($x['potencia_wp'] > 0 && $x['preco_brl'] > 0 && strpos($x['url_fonte'], 'http') === 0); }
});
teste('módulos: arquivo válido', function () use ($cabP, $linhaP) {
    $m = fv_carregar_modulos(csv_temp("$cabP\n$linhaP\n"));
    igual(count($m), 1); proximo($m[0]['potencia_wp'], 550.0);
});
teste('módulos: coluna ausente é rejeitada', function () use ($linhaP) {
    $cab = 'id,fabricante,modelo,potencia_wp';
    deve_falhar(FvDatasetErro::class, function () use ($cab) { fv_carregar_modulos(csv_temp("$cab\nPN-X,M,Mo,550\n")); }, "coluna ausente");
});
teste('módulos: dado inválido informa a linha', function () use ($cabP, $linhaP) {
    $ruim = str_replace(',550,', ',-550,', $linhaP);
    deve_falhar(FvDatasetErro::class, function () use ($cabP, $linhaP, $ruim) { fv_carregar_modulos(csv_temp("$cabP\n$linhaP\n" . str_replace('PN-X', 'PN-Y', $ruim) . "\n")); }, 'linha 3');
});
teste('módulos: ID duplicado é rejeitado', function () use ($cabP, $linhaP) {
    deve_falhar(FvDatasetErro::class, function () use ($cabP, $linhaP) { fv_carregar_modulos(csv_temp("$cabP\n$linhaP\n$linhaP\n")); }, 'duplicado');
});
teste('módulos: preço ausente / URL não rastreável é rejeitado', function () use ($cabP, $linhaP) {
    deve_falhar(FvDatasetErro::class, function () use ($cabP, $linhaP) { fv_carregar_modulos(csv_temp("$cabP\n" . str_replace(',500,Loja', ',,Loja', $linhaP) . "\n")); }, 'preco_brl');
    deve_falhar(FvDatasetErro::class, function () use ($cabP, $linhaP) { fv_carregar_modulos(csv_temp("$cabP\n" . str_replace('https://loja.exemplo/p', 'sem-url', $linhaP) . "\n")); }, 'url_fonte');
});
$cabI = 'id,fabricante,modelo,tipo,potencia_nominal_w,potencia_max_fv_w,tensao_max_entrada_v,faixa_mppt_min_v,faixa_mppt_max_v,corrente_max_entrada_a,numero_mppt,compativel_bateria,preco_brl,fornecedor,data_coleta,url_fonte,strings_por_mppt,corrente_curto_mppt_a,fases,tensao_bat_min_v,tensao_bat_max_v,corrente_carga_max_a,corrente_descarga_max_a,observacoes';
$on = 'I1,M,On,on-grid,5000,7500,600,120,550,16,2,nao,3000,Loja,2026-10-01,https://l.ex/i,2,20,1,,,,,';
$hib = 'I2,M,Hib,hibrido,5000,7500,500,125,425,20,2,sim,7000,Loja,2026-10-01,https://l.ex/i2,2,30,1,40,60,100,100,';
teste('inversores: on-grid pode ter campos de bateria vazios', function () use ($cabI, $on) { igual(count(fv_carregar_inversores(csv_temp("$cabI\n$on\n"))), 1); });
teste('inversores: híbrido com campos de bateria vazios é rejeitado', function () use ($cabI) {
    $h = 'I2,M,Hib,hibrido,5000,7500,500,125,425,20,2,sim,7000,Loja,2026-10-01,https://l.ex/i2,2,30,1,,,,,';
    deve_falhar(FvDatasetErro::class, function () use ($cabI, $h) { fv_carregar_inversores(csv_temp("$cabI\n$h\n")); }, 'híbrido exige');
});
teste('inversores: híbrido completo, MPPT invertido e ID duplicado', function () use ($cabI, $hib, $on) {
    igual(count(fv_carregar_inversores(csv_temp("$cabI\n$hib\n$on\n"))), 2);
    deve_falhar(FvDatasetErro::class, function () use ($cabI, $on) { fv_carregar_inversores(csv_temp("$cabI\n" . str_replace(',120,550,', ',550,120,', $on) . "\n")); }, 'mppt_min_v');
    deve_falhar(FvDatasetErro::class, function () use ($cabI, $on) { fv_carregar_inversores(csv_temp("$cabI\n$on\n$on\n")); }, 'duplicado');
    deve_falhar(FvDatasetErro::class, function () use ($cabI, $on) { fv_carregar_inversores(csv_temp("$cabI\n" . str_replace(',on-grid,', ',offgrid,', $on) . "\n")); }, 'tipo');
});
$cabB = 'id,fabricante,modelo,tecnologia,tensao_nominal_v,capacidade_ah,capacidade_kwh,dod_pct,ciclos,preco_brl,fornecedor,data_coleta,url_fonte,corrente_carga_max_a,corrente_descarga_max_a,eficiencia_pct,url_especificacoes,observacoes';
$bt = 'B1,M,Bat,LiFePO4,51.2,100,5.12,90,6000,9000,Loja,2026-10-01,https://l.ex/b,100,100,95,https://f.ex/d,';
teste('baterias: válida, DoD/eficiência fora da faixa e duplicada', function () use ($cabB, $bt) {
    igual(count(fv_carregar_baterias(csv_temp("$cabB\n$bt\n"))), 1);
    deve_falhar(FvDatasetErro::class, function () use ($cabB, $bt) { fv_carregar_baterias(csv_temp("$cabB\n" . str_replace(',5.12,90,6000,', ',5.12,120,6000,', $bt) . "\n")); }, 'dod_pct');
    deve_falhar(FvDatasetErro::class, function () use ($cabB, $bt) { fv_carregar_baterias(csv_temp("$cabB\n" . str_replace(',100,100,95,', ',100,100,0,', $bt) . "\n")); }, 'eficiencia_pct');
    deve_falhar(FvDatasetErro::class, function () use ($cabB, $bt) { fv_carregar_baterias(csv_temp("$cabB\n$bt\n$bt\n")); }, 'duplicado');
});
teste('hsp_cidades.csv real: 26 capitais válidas e fonte rastreável', function () use ($hsp) {
    igual(count($hsp), 26);
    foreach ($hsp as $h) { verdadeiro(strpos($h['url_fonte'], 'http') === 0 && $h['hsp_kwh_m2_dia'] > 1); }
});
teste('mínimos do PB34 são detectados (diagnóstico, não falha o teste)', function () {
    $faltas = fv_conferir_minimos(fv_carregar_datasets());
    echo "          (info) faltas atuais no dataset real: " . json_encode($faltas) . "\n";
    verdadeiro(is_array($faltas));
});

/* ===================================================================== US22 */
secao('US22-T05 — Quantidade de módulos e potência instalada');
teste('N = ⌈P_FV×1000/P_módulo⌉ e P_instalada (caso de conferência)', function () {
    $pfv = fv_potencia_fv(500, 5.0, 30, 0.8);
    $a = fv_quantidade_modulos($pfv, 550); igual($a['n'], 8); proximo($a['p_instalada_kwp'], 4.4);
    $b = fv_quantidade_modulos($pfv, 620); igual($b['n'], 7); proximo($b['p_instalada_kwp'], 4.34);
});
teste('arredondamento sempre para cima, inclusive por 0,001 e exatos', function () {
    igual(fv_quantidade_modulos(4.4, 550)['n'], 8);      // exato: 8,0
    igual(fv_quantidade_modulos(4.4004, 550)['n'], 9);   // 8,0007 → 9
    igual(fv_quantidade_modulos(0.1, 550)['n'], 1);      // nunca zero
    igual(fv_quantidade_modulos(3.3, 550)['n'], 6);      // ruído de float
});
teste('ranking: menor custo do arranjo, alternativas mantidas, 1 recomendado', function () use ($DS) {
    $r = fv_ranking_modulos(fv_potencia_fv(500, 4.671, 30, 0.8), $DS['modulos']);
    igual(count($r), count($DS['modulos']));
    igual($r[0]['id'], 'PN-001'); igual($r[0]['n'], 9); proximo($r[0]['custo_arranjo'], 4929.93, 0.01); verdadeiro($r[0]['recomendado']);
    igual($r[1]['id'], 'PN-004'); proximo($r[1]['custo_arranjo'], 5440.0, 0.01); verdadeiro(!$r[1]['recomendado']);
});
teste('módulo sem preço não entra no ranking (PB24)', function () use ($DS) {
    $m = $DS['modulos'];
    $idRetirado = $m[0]['id'];
    $m[0]['preco_brl'] = null;
    $r = fv_ranking_modulos(4.0, $m);
    igual(count($r), count($DS['modulos']) - 1);
    verdadeiro(!in_array($idRetirado, array_column($r, 'id'), true));
});

/* ===================================================================== US24 */
secao('US24-T05 — Compatibilidade módulo × inversor');
$ranking = fv_ranking_modulos(fv_potencia_fv(500, 4.671, 30, 0.8), $DS['modulos']);
$mod1 = $ranking[0]; // 9 × PN-001 (550 Wp)
$inv = [];
foreach ($DS['inversores'] as $i) { $inv[$i['id']] = $i; }
$falhas_de = function (array $r) { return array_column(array_filter($r['verificacoes'], function ($v) { return !$v['ok']; }), 'id'); };
teste('combinação válida: Growatt MIN 5000TL-X2 com 9 módulos de 550 Wp', function () use ($mod1, $inv) {
    $r = fv_verificar_inversor($mod1, $mod1['n'], $inv['INV-006'], 5.0, false);
    verdadeiro($r['compativel'], json_encode($r['verificacoes']));
    verdadeiro($r['alocacao'] !== null);
    $tot = 0; foreach ($r['alocacao'] as $a) { $tot += $a['strings'] * $a['modulos_por_string']; }
    igual($tot, 9, 'todos os módulos alocados');
});
teste('Voc a frio: 49,6 V com −0,26 %/°C a 5 °C = 52,18 V', function () { proximo(fv_voc_a_frio(49.6, -0.26, 5.0), 52.1792, 0.001); });
teste('inválida por potência: razão CC/CA acima do limite (inversor de 3 kW)', function () use ($mod1, $inv, $falhas_de) {
    $r = fv_verificar_inversor($mod1, $mod1['n'], $inv['INV-005'], 5.0, false);
    verdadeiro(!$r['compativel']);
    verdadeiro(in_array('razao_cc_ca', $falhas_de($r), true), implode(',', $falhas_de($r)));
});
teste('inválida por potência: razão CC/CA abaixo do limite (inversor de 7,5 kW)', function () use ($mod1, $inv, $falhas_de) {
    $r = fv_verificar_inversor($mod1, $mod1['n'], $inv['INV-001'], 5.0, false);
    verdadeiro(!$r['compativel']);
    verdadeiro(in_array('razao_cc_ca', $falhas_de($r), true), implode(',', $falhas_de($r)));
});
teste('inválida por corrente: Deye 5K (limite de 13 A por MPPT) com módulo de 13,2 A', function () use ($mod1, $inv, $falhas_de) {
    $r = fv_verificar_inversor($mod1, $mod1['n'], $inv['INV-002'], 5.0, false);
    verdadeiro(!$r['compativel']);
    verdadeiro(in_array('corrente_mppt', $falhas_de($r), true), implode(',', $falhas_de($r)));
});
teste('inválida por tensão: módulo cuja Voc a frio estoura o inversor', function () use ($mod1, $inv, $falhas_de) {
    $i = $inv['INV-006']; $i['tensao_cc_max_v'] = 50.0; $i['mppt_max_v'] = 49.0; $i['mppt_min_v'] = 20.0;
    $r = fv_verificar_inversor($mod1, $mod1['n'], $i, 5.0, false);
    verdadeiro(!$r['compativel']);
    verdadeiro(in_array('tensao_voc', $falhas_de($r), true), implode(',', $falhas_de($r)));
});
teste('inválida por corrente: Imp×strings acima do limite por MPPT', function () use ($mod1, $inv, $falhas_de) {
    $i = $inv['INV-006']; $i['corrente_max_mppt_a'] = 10.0;
    $r = fv_verificar_inversor($mod1, $mod1['n'], $i, 5.0, false);
    verdadeiro(!$r['compativel']);
    verdadeiro(in_array('corrente_mppt', $falhas_de($r), true), implode(',', $falhas_de($r)));
});
teste('inválida por potência CC máxima do inversor', function () use ($mod1, $inv) {
    $i = $inv['INV-006']; $i['potencia_cc_max_kw'] = 4.0;
    verdadeiro(!fv_verificar_inversor($mod1, $mod1['n'], $i, 5.0, false)['compativel']);
});
teste('alocação em 2 MPPTs quando uma string não comporta todos os módulos', function () {
    $a = fv_alocar_strings(14, 2, [['strings' => 1, 'por_string' => 9], ['strings' => 1, 'por_string' => 8], ['strings' => 1, 'por_string' => 7], ['strings' => 1, 'por_string' => 6]]);
    verdadeiro($a !== null); igual(count($a), 2);
    igual($a[0]['strings'] * $a[0]['modulos_por_string'] + $a[1]['strings'] * $a[1]['modulos_por_string'], 14);
    igual(fv_alocar_strings(30, 2, [['strings' => 1, 'por_string' => 9]]), null);
});
teste('filtro: só válidos são oferecidos (menor preço primeiro), descartados trazem motivo', function () use ($mod1, $DS) {
    $f = fv_filtrar_inversores($mod1, $mod1['n'], $DS['inversores'], 5.0, false);
    igual(array_column($f['validos'], 'id'), ['INV-006', 'INV-007', 'INV-003', 'INV-004'], 'ordenados por menor preço');
    igual(count($f['descartados']), 4);
    foreach ($f['descartados'] as $d) { verdadeiro(count(array_filter($d['verificacoes'], function ($v) { return !$v['ok']; })) > 0); }
});

/* ===================================================================== US25/US27 */
secao('US25 / US27-T05 — Baterias: com e sem armazenamento, 12 h de autonomia');
teste('sem armazenamento: não há baterias nem custo de bateria', function () use ($DS, $cfgTeste, $imovelBase) {
    $r = fv_dimensionar($imovelBase, ['armazenamento' => false], $DS, $cfgTeste);
    igual($r['baterias']['escolhida'], null); igual($r['baterias']['opcoes'], []);
    foreach ($r['orcamento']['linhas'] as $l) { verdadeiro(strpos($l['descricao'], '(bateria)') === false); }
});
teste('autonomia obrigatória e dentro de 0–24 h quando habilitado', function () {
    deve_falhar(FvErro::class, function () { fv_validar_autonomia(null, true); }, 'autonomia');
    deve_falhar(FvErro::class, function () { fv_validar_autonomia(25, true); });
    deve_falhar(FvErro::class, function () { fv_validar_autonomia(-1, true); });
    deve_falhar(FvErro::class, function () { fv_validar_autonomia(0, true); }, 'maior que zero');
    igual(fv_validar_autonomia(12, true), 12.0);
    igual(fv_validar_autonomia(null, false), null);
});
teste('E_d, E_autonomia e C_bat (12 h): 16,667 / 8,333 / 9,747 kWh', function () {
    $ed = fv_energia_diaria(500); proximo($ed, 16.6666667, 1e-6);
    $ea = fv_energia_autonomia($ed, 12); proximo($ea, 8.3333333, 1e-6);
    proximo(fv_capacidade_bateria($ea, 90, 95), 9.7465887, 1e-6);
});
teste('DoD aplicado uma única vez (N=2 com a bateria de 5,12 kWh, não 3)', function () {
    $c = fv_capacidade_bateria(fv_energia_autonomia(fv_energia_diaria(500), 12), 90, 95);
    igual(fv_quantidade_baterias($c, 5.12), 2);
    igual(fv_quantidade_baterias($c / 0.90, 5.12), 3, 'se o DoD fosse aplicado de novo daria 3 (erro evitado)');
});

secao('US27 / US28-T04 — Seleção de bateria e compatibilidade com o inversor híbrido');
$entBat = ['armazenamento' => true, 'autonomia_h' => 12];
teste('com baterias: só inversor híbrido, bateria mais barata compatível, N_bat correto', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $r = fv_dimensionar($imovelBase, $entBat, $DS, $cfgTeste);
    verdadeiro($r['completa'], json_encode($r['bloqueios']));
    igual(array_column($r['inversores']['opcoes'], 'id'), ['INV-003', 'INV-004']);
    igual($r['baterias']['escolhida'], 'BAT-002');
    $b = $r['baterias']['opcoes'][0];
    igual($b['n_bat'], 2); proximo($b['capacidade_util_total_kwh'], 9.216);
});
teste('comparação de custo entre alternativas que atendem à capacidade', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $r = fv_dimensionar($imovelBase, $entBat, $DS, $cfgTeste);
    $custos = []; foreach ($r['baterias']['opcoes'] as $o) { $custos[$o['id']] = $o['custo_banco']; }
    $esperado = ['BAT-002' => 11070.00, 'BAT-001' => 14398.50, 'BAT-003' => 15960.00, 'BAT-005' => 16915.50, 'BAT-004' => 17574.21, 'BAT-006' => 17980.00];
    foreach ($esperado as $id => $valor) { verdadeiro(isset($custos[$id]), "falta $id"); proximo($custos[$id], $valor, 0.01, $id); }
});
teste('falha com inversor on-grid + armazenamento (mensagem clara)', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
        fv_dimensionar($imovelBase, $entBat + ['inversor_id' => 'INV-006'], $DS, $cfgTeste);
    }, 'híbrido');
});
teste('sem inversor híbrido compatível: bloqueia e não finaliza', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $ds = $DS; $ds['inversores'] = array_values(array_filter($DS['inversores'], function ($i) { return $i['tipo'] === 'on-grid'; }));
    $r = fv_dimensionar($imovelBase, $entBat, $ds, $cfgTeste);
    verdadeiro(!$r['completa']); verdadeiro(count($r['bloqueios']) === 1 && stripos($r['bloqueios'][0], 'HÍBRIDO') !== false);
});
$bateriasPorId = []; foreach ($DS['baterias'] as $b) { $bateriasPorId[$b['id']] = $b; }
teste('banco por corrente: Dyness (75 A de carga) não atende o GoodWe (120 A) com 1 unidade, mas atende com 2', function () use ($bateriasPorId, $inv) {
    verdadeiro(!fv_verificar_banco($bateriasPorId['BAT-003'], 1, $inv['INV-003'])['compativel']);
    verdadeiro(fv_verificar_banco($bateriasPorId['BAT-003'], 2, $inv['INV-003'])['compativel']);
});
teste('banco incompatível por tensão: baterias de 51,2 V com inversor de alta tensão (160–600 V)', function () use ($bateriasPorId, $inv) {
    $i = $inv['INV-003']; $i['tensao_bat_min_v'] = 160.0; $i['tensao_bat_max_v'] = 600.0;
    $r = fv_verificar_banco($bateriasPorId['BAT-002'], 2, $i);
    verdadeiro(!$r['compativel']);
    igual($r['verificacoes'][0]['ok'], false);
});
teste('banco válido: Deye SE-F5 × 2 com o GoodWe (tensão dentro da faixa e correntes suficientes)', function () use ($bateriasPorId, $inv) {
    verdadeiro(fv_verificar_banco($bateriasPorId['BAT-002'], 2, $inv['INV-003'])['compativel']);
});

/* ===================================================================== US29 */
secao('US29-T05 — Orçamento com e sem baterias');
teste('sem baterias: equipamentos = 9×547,77 + 2049 = 6978,93; outros = 0; total = 6978,93', function () use ($DS, $cfgTeste, $imovelBase) {
    $r = fv_dimensionar($imovelBase, ['armazenamento' => false], $DS, $cfgTeste);
    proximo($r['orcamento']['custo_equipamentos'], 6978.93, 0.01); proximo($r['orcamento']['custo_outros'], 0.0); proximo($r['orcamento']['custo_total'], 6978.93, 0.01);
    verdadeiro($r['orcamento']['aviso_outros_zerados']);
});
teste('com baterias: equipamentos = 4929,93 + 6500 + 11070 = 22499,93', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $r = fv_dimensionar($imovelBase, $entBat, $DS, $cfgTeste);
    proximo($r['orcamento']['custo_equipamentos'], 22499.93, 0.01); proximo($r['orcamento']['custo_total'], 22499.93, 0.01);
});
teste('outros custos informados são somados à parte: 22499,93 + 3000 = 25499,93', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $r = fv_dimensionar($imovelBase, $entBat + ['outros_custos' => ['estrutura' => 1000, 'instalacao' => 2000]], $DS, $cfgTeste);
    proximo($r['orcamento']['custo_equipamentos'], 22499.93, 0.01); proximo($r['orcamento']['custo_outros'], 3000.0); proximo($r['orcamento']['custo_total'], 25499.93, 0.01);
    proximo($r['orcamento']['custo_por_categoria']['equipamentos'], 22499.93, 0.01);
    verdadeiro(!$r['orcamento']['aviso_outros_zerados']);
});
teste('estrutura de saída: cada linha tem id, quantidade, preço unitário e subtotal', function () use ($DS, $cfgTeste, $imovelBase) {
    $r = fv_dimensionar($imovelBase, [], $DS, $cfgTeste);
    foreach ($r['orcamento']['linhas'] as $l) { foreach (['item_id', 'quantidade', 'preco_unitario', 'subtotal', 'categoria'] as $k) { verdadeiro(array_key_exists($k, $l), "falta $k"); } }
});
teste('outro custo negativo ou texto é rejeitado', function () use ($DS, $cfgTeste, $imovelBase) {
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste, $imovelBase) { fv_dimensionar($imovelBase, ['outros_custos' => ['estrutura' => -5]], $DS, $cfgTeste); });
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste, $imovelBase) { fv_dimensionar($imovelBase, ['outros_custos' => ['instalacao' => 'abc']], $DS, $cfgTeste); });
});
teste('modos de cálculo configuráveis: percentual, por kWp e por módulo', function () {
    $cfg = fv_config();
    $cfg['outros_custos']['estrutura'] = ['rotulo' => 'Estrutura', 'modo' => 'por_modulo', 'valor' => 100.0];
    $cfg['outros_custos']['cabeamento'] = ['rotulo' => 'Cabeamento', 'modo' => 'por_kwp', 'valor' => 50.0];
    $cfg['outros_custos']['protecoes'] = ['rotulo' => 'Proteções', 'modo' => 'percentual_equipamentos', 'valor' => 10.0];
    $m = ['id' => 'M', 'fabricante' => 'F', 'modelo' => 'X', 'n' => 8, 'preco_unitario' => 500.0, 'p_instalada_kwp' => 4.4];
    $i = ['id' => 'I', 'fabricante' => 'F', 'modelo' => 'Y', 'preco_unitario' => 3000.0];
    $o = fv_orcamento($m, $i, null, [], $cfg);
    proximo($o['custo_outros'], 800.0 + 220.0 + 700.0);   // 8×100 + 4,4×50 + 10% de 7000
});

/* ===================================================================== US30 */
secao('US30-T04 — Geração, cobertura e proposta');
teste('geração = P_inst × HSP × D × η = 4,95×4,671×30×0,8 = 554,9 kWh/mês; cobertura 111,0%', function () use ($DS, $cfgTeste, $imovelBase) {
    $r = fv_dimensionar($imovelBase, [], $DS, $cfgTeste);
    proximo($r['geracao']['geracao_mensal_kwh'], 554.9, 0.05); proximo($r['geracao']['cobertura_consumo_pct'], 111.0, 0.1);
});
teste('proposta traz todos os campos obrigatórios (consumo, f, E_FV, HSP, potências, equipamentos, custo)', function () use ($DS, $cfgTeste, $imovelBase, $entBat) {
    $r = fv_dimensionar($imovelBase, $entBat, $DS, $cfgTeste);
    foreach (['consumo', 'parametros', 'hsp', 'e_fv_kwh_mes', 'p_fv_kwp', 'sistema', 'orcamento', 'geracao', 'aviso_limitacoes'] as $k) { verdadeiro(isset($r[$k]), "falta $k"); }
    verdadeiro(stripos($r['aviso_limitacoes'], 'PRÉ-DIMENSIONAMENTO ACADÊMICO') !== false);
    verdadeiro($r['sistema']['bateria'] !== null && $r['sistema']['inversor'] !== '' && $r['sistema']['n_modulos'] === 9);
});
teste('seleção do usuário de outro módulo recalcula N e potência', function () use ($DS, $cfgTeste, $imovelBase) {
    $r = fv_dimensionar($imovelBase, ['modulo_id' => 'PN-002'], $DS, $cfgTeste);
    igual($r['sistema']['n_modulos'], 8); proximo($r['sistema']['p_instalada_kwp'], 4.96);
});
teste('módulo inexistente no dataset é rejeitado', function () use ($DS, $cfgTeste, $imovelBase) {
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste, $imovelBase) { fv_dimensionar($imovelBase, ['modulo_id' => 'NAO-EXISTE'], $DS, $cfgTeste); }, 'não está entre');
});
teste('inversor incompatível escolhido manualmente é recusado com o motivo', function () use ($DS, $cfgTeste, $imovelBase) {
    deve_falhar(FvErro::class, function () use ($DS, $cfgTeste, $imovelBase) { fv_dimensionar($imovelBase, ['inversor_id' => 'INV-005'], $DS, $cfgTeste); }, 'Razão CC/CA');
});

/* ===================================================================== resumo */
echo "\n----------------------------------------\n";
echo $GLOBALS['__ok'] . " testes aprovados, " . count($GLOBALS['__falhas']) . " falha(s)\n";
foreach ($GLOBALS['__falhas'] as $f) { echo " - $f\n"; }
exit(count($GLOBALS['__falhas']) === 0 ? 0 : 1);
