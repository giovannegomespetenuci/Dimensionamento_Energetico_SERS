<?php
declare(strict_types=1);

/**
 * Biblioteca do dimensionamento fotovoltaico (Sprint 2 / CP2). Compatível com PHP 7.2.
 *
 *   E_FV   = C_m × f/100                      P_FV  = E_FV / (HSP × D × η)
 *   N      = ⌈P_FV×1000 / P_módulo⌉           P_inst = N × P_módulo / 1000
 *   E_d    = C_m / 30    E_aut = E_d × h/24   C_bat = E_aut / (DoD × η_bat)   N_bat = ⌈C_bat / cap_nominal⌉
 *   Geração = P_inst × HSP × D × η            Cobertura = Geração / C_m
 *
 * DECISÃO SOBRE O DoD (US27-T02 e T03): aplicado UMA ÚNICA VEZ, em C_bat (capacidade NOMINAL necessária).
 * N_bat divide C_bat pela capacidade NOMINAL; dividir pela útil aplicaria o DoD duas vezes.
 */

require_once __DIR__ . '/config_fv.php';

const FV_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const FV_FORNECEDOR_SINTETICO = 'SINTETICO-TESTE';

/** Erro de regra de negócio/validação. Estende InvalidArgumentException → endpoint responde HTTP 422. */
class FvErro extends InvalidArgumentException
{
}

/** Dataset (CSV) inválido. $problemas lista cada problema com arquivo e linha. */
class FvDatasetErro extends RuntimeException
{
    public $problemas = [];

    public function __construct(array $problemas)
    {
        $this->problemas = $problemas;
        parent::__construct(implode(' | ', $problemas));
    }
}

function fv_fmt(float $v, int $casas = 2): string
{
    return number_format($v, $casas, ',', '.');
}

function fv_norm(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    return strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'ê' => 'e', 'è' => 'e', 'í' => 'i', 'ì' => 'i',
        'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ò' => 'o', 'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'ç' => 'c']);
}

/* ============================ US18 — HSP ============================ */

function fv_validar_hsp($valor, ?array $cfg = null): float
{
    $cfg = $cfg ?? fv_config();
    if (!is_numeric($valor)) {
        throw new FvErro('HSP inválido: informe um número (kWh/m².dia).');
    }
    $v = (float) $valor;
    if ($v < $cfg['hsp']['min'] || $v > $cfg['hsp']['max']) {
        throw new FvErro('HSP fora da faixa plausível (' . fv_fmt($cfg['hsp']['min'], 1) . ' a ' . fv_fmt($cfg['hsp']['max'], 1) . ' kWh/m².dia).');
    }
    return $v;
}

/** Precedência: HSP manual > cidade no dataset > capital da UF (fallback) > bloqueio. */
function fv_resolver_hsp($cidade, $uf, $manual, array $hsp, ?array $cfg = null): array
{
    if ($manual !== null && $manual !== '') {
        return ['hsp' => fv_validar_hsp($manual, $cfg), 'origem' => 'manual', 'cidade' => null, 'uf' => null, 'fonte' => 'Informado manualmente pelo usuário', 'url_fonte' => null, 'data_consulta' => null];
    }
    $cidade = trim((string) $cidade);
    $uf = strtoupper(trim((string) $uf));
    if ($cidade !== '') {
        foreach ($hsp as $h) {
            if (fv_norm($h['cidade']) === fv_norm($cidade) && ($uf === '' || $h['uf'] === $uf)) {
                return ['hsp' => (float) $h['hsp_kwh_m2_dia'], 'origem' => 'cidade', 'cidade' => $h['cidade'], 'uf' => $h['uf'], 'fonte' => $h['fonte'], 'url_fonte' => $h['url_fonte'], 'data_consulta' => $h['data_consulta']];
            }
        }
    }
    if ($uf !== '') {
        foreach ($hsp as $h) {
            if ($h['uf'] === $uf) {
                return ['hsp' => (float) $h['hsp_kwh_m2_dia'], 'origem' => 'uf', 'cidade' => $h['cidade'], 'uf' => $h['uf'], 'fonte' => $h['fonte'], 'url_fonte' => $h['url_fonte'], 'data_consulta' => $h['data_consulta']];
            }
        }
        throw new FvErro("Não há HSP de referência para a UF $uf no dataset. Informe o HSP manualmente.");
    }
    throw new FvErro('HSP não definido: informe cidade/UF do imóvel ou o HSP manualmente antes de dimensionar.');
}

/* ============================ Consumo de referência (CP1 US04 + consumo manual) ============================ */

function fv_resolver_consumo($estimado, $manual): array
{
    if (is_numeric($manual) && (float) $manual > 0) {
        return ['origem' => 'manual', 'valor' => (float) $manual];
    }
    if (is_numeric($estimado) && (float) $estimado > 0) {
        return ['origem' => 'estimado', 'valor' => (float) $estimado];
    }
    throw new FvErro('Consumo mensal não definido: cadastre equipamentos no imóvel ou informe o consumo mensal manualmente.');
}

/* ============================ US19-T02 / US20-T02 — Parâmetros (f, η, D, Tmin) ============================ */

function fv_validar_parametros(array $in, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $out = [];
    foreach (['f', 'eta', 'D', 'tmin_c'] as $k) {
        $p = $cfg['parametros'][$k];
        $v = $in[$k] ?? null;
        if ($v === null || $v === '') {
            $v = $p['padrao'];
        }
        if (!is_numeric($v)) {
            throw new FvErro($p['rotulo'] . ' deve ser numérico.');
        }
        $v = (float) $v;
        if ($v < $p['min'] || $v > $p['max']) {
            throw new FvErro($p['rotulo'] . ' deve estar entre ' . fv_fmt((float) $p['min'], 2) . ' e ' . fv_fmt((float) $p['max'], 2) . ' ' . $p['unidade'] . '.');
        }
        $out[$k] = $v;
    }
    return $out;
}

/* ============================ US19-T03 / US20-T01 — E_FV e P_FV ============================ */

function fv_energia_fv(float $consumoMensal, float $f): float
{
    return $consumoMensal * $f / 100.0;
}

function fv_potencia_fv(float $efv, float $hsp, float $d, float $eta): float
{
    if ($hsp <= 0 || $d <= 0 || $eta <= 0) {
        throw new FvErro('HSP, D e η devem ser maiores que zero para calcular a potência FV.');
    }
    return $efv / ($hsp * $d * $eta);
}

/* ============================ US21 / US23 / US26 / US31 — Datasets (módulos, inversores, baterias) e HSP (US18-T02) ============================ */

function fv_ler_csv(string $path, array $obrigatorias, string $nome): array
{
    if (!is_file($path)) {
        throw new FvDatasetErro(["$nome: arquivo não encontrado ($path)."]);
    }
    $h = fopen($path, 'r');
    $cab = fgetcsv($h, 0, ',', '"', '\\');
    if (!$cab) {
        fclose($h);
        throw new FvDatasetErro(["$nome: arquivo vazio."]);
    }
    $cab[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $cab[0]);
    $cab = array_map('trim', $cab);
    $falta = array_values(array_diff($obrigatorias, $cab));
    if ($falta) {
        fclose($h);
        throw new FvDatasetErro(["$nome: coluna ausente: " . implode(', ', $falta) . '.']);
    }
    $linhas = [];
    $n = 1;
    while (($r = fgetcsv($h, 0, ',', '"', '\\')) !== false) {
        $n++;
        if (count($r) === 1 && ($r[0] === null || trim((string) $r[0]) === '')) {
            continue;
        }
        $r = array_pad($r, count($cab), '');
        $linha = array_combine($cab, array_slice($r, 0, count($cab)));
        $linha['_linha'] = $n;
        $linhas[] = $linha;
    }
    fclose($h);
    return $linhas;
}

function fv_num($v): ?float
{
    if ($v === null) {
        return null;
    }
    $s = trim((string) $v);
    if ($s === '') {
        return null;
    }
    $s = str_replace(',', '.', $s);
    return is_numeric($s) ? (float) $s : null;
}

/** $regras: campo => [min, max, obrigatorio, exclusivoMin] */
function fv_checar_numeros(array &$r, array $regras, array &$p, string $pref): void
{
    foreach ($regras as $campo => $rg) {
        $v = fv_num($r[$campo] ?? null);
        if ($v === null) {
            if ($rg[2]) {
                $p[] = "$pref: $campo ausente ou não numérico.";
            }
            $r[$campo] = null;
            continue;
        }
        $min = $rg[0];
        $max = $rg[1];
        $excl = $rg[3] ?? false;
        if (($min !== null && ($excl ? $v <= $min : $v < $min)) || ($max !== null && $v > $max)) {
            $p[] = "$pref: $campo inválido ($v).";
        }
        $r[$campo] = $v;
    }
}

/** Rastreabilidade (PB34): preço, fornecedor, data de coleta e URLs. */
function fv_checar_rastreio(array &$r, bool $permitirSinteticos, array &$p, string $pref): void
{
    $sint = trim((string) ($r['fornecedor'] ?? '')) === FV_FORNECEDOR_SINTETICO;
    if ($sint && !$permitirSinteticos) {
        $p[] = "$pref: dado sintético não é aceito no dataset real (PB34: sem dados fictícios).";
    }
    foreach (['id', 'fabricante', 'modelo', 'fornecedor'] as $c) {
        if (trim((string) ($r[$c] ?? '')) === '') {
            $p[] = "$pref: $c obrigatório.";
        }
    }
    $preco = fv_num($r['preco_brl'] ?? null);
    if ($preco === null || $preco <= 0) {
        $p[] = "$pref: preco_brl ausente ou inválido (deve ser > 0).";
    }
    $r['preco_brl'] = $preco;
    if (!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', (string) ($r['data_coleta'] ?? ''))) {
        $p[] = "$pref: data_coleta deve estar no formato AAAA-MM-DD.";
    }
    if (!($sint && $permitirSinteticos) && !preg_match('#^https?://#i', (string) ($r['url_fonte'] ?? ''))) {
        $p[] = "$pref: url_fonte deve ser uma URL http(s) rastreável.";
    }
}

function fv_finalizar_dataset(array $linhas, array $problemas, string $nome): array
{
    $ids = [];
    foreach ($linhas as $l) {
        $id = (string) ($l['id'] ?? '');
        if ($id !== '' && isset($ids[$id])) {
            $problemas[] = "$nome linha {$l['_linha']}: id duplicado '$id'.";
        }
        $ids[$id] = true;
    }
    if ($problemas) {
        throw new FvDatasetErro($problemas);
    }
    return $linhas;
}

function fv_carregar_modulos(string $path, bool $permitirSinteticos = false): array
{
    // Campos mínimos da US31 + coeficientes de temperatura (usados no cálculo da Voc a frio).
    $obrig = ['id', 'fabricante', 'modelo', 'potencia_wp', 'voc_v', 'isc_a', 'vmp_v', 'imp_a', 'eficiencia_pct', 'preco_brl',
        'fornecedor', 'data_coleta', 'url_fonte', 'coef_voc_pct_c', 'coef_pmax_pct_c'];
    $linhas = fv_ler_csv($path, $obrig, 'modulos.csv');
    $p = [];
    foreach ($linhas as &$r) {
        $pref = "modulos.csv linha {$r['_linha']}";
        fv_checar_rastreio($r, $permitirSinteticos, $p, $pref);
        fv_checar_numeros($r, [
            'potencia_wp' => [0, null, true, true], 'eficiencia_pct' => [0, 100, true, true],
            'voc_v' => [0, null, true, true], 'vmp_v' => [0, null, true, true], 'isc_a' => [0, null, true, true], 'imp_a' => [0, null, true, true],
            'coef_voc_pct_c' => [-5, 5, true], 'coef_pmax_pct_c' => [-5, 5, true],
            'comprimento_mm' => [0, null, false], 'largura_mm' => [0, null, false], 'espessura_mm' => [0, null, false], 'peso_kg' => [0, null, false],
        ], $p, $pref);
        $r['observacoes'] = $r['observacoes'] ?? '';
    }
    unset($r);
    return fv_finalizar_dataset($linhas, $p, 'modulos.csv');
}

function fv_carregar_inversores(string $path, bool $permitirSinteticos = false): array
{
    // Nomes e unidades do enunciado (potências em W). Internamente o cálculo usa kW: ver aliases no fim do laço.
    $obrig = ['id', 'fabricante', 'modelo', 'tipo', 'potencia_nominal_w', 'potencia_max_fv_w', 'tensao_max_entrada_v', 'faixa_mppt_min_v',
        'faixa_mppt_max_v', 'corrente_max_entrada_a', 'numero_mppt', 'compativel_bateria', 'preco_brl', 'fornecedor', 'data_coleta', 'url_fonte',
        'strings_por_mppt'];
    $linhas = fv_ler_csv($path, $obrig, 'inversores.csv');
    $p = [];
    foreach ($linhas as &$r) {
        $pref = "inversores.csv linha {$r['_linha']}";
        fv_checar_rastreio($r, $permitirSinteticos, $p, $pref);
        if (!in_array($r['tipo'], ['on-grid', 'hibrido'], true)) {
            $p[] = "$pref: tipo deve ser 'on-grid' ou 'hibrido'.";
        }
        $cb = strtolower(trim((string) $r['compativel_bateria']));
        $cb = ($cb === 'não') ? 'nao' : $cb;
        if (!in_array($cb, ['sim', 'nao'], true)) {
            $p[] = "$pref: compativel_bateria deve ser 'sim' ou 'nao'.";
        } elseif ($r['tipo'] === 'hibrido' && $cb !== 'sim') {
            $p[] = "$pref: inversor híbrido deve ter compativel_bateria = sim.";
        } elseif ($r['tipo'] === 'on-grid' && $cb !== 'nao') {
            $p[] = "$pref: inversor on-grid deve ter compativel_bateria = nao.";
        }
        $r['compativel_bateria'] = $cb;
        fv_checar_numeros($r, [
            'potencia_nominal_w' => [0, null, true, true], 'potencia_max_fv_w' => [0, null, true, true], 'tensao_max_entrada_v' => [0, null, true, true],
            'faixa_mppt_min_v' => [0, null, true, true], 'faixa_mppt_max_v' => [0, null, true, true], 'numero_mppt' => [1, null, true], 'strings_por_mppt' => [1, null, true],
            'corrente_max_entrada_a' => [0, null, true, true], 'corrente_curto_mppt_a' => [0, null, false, true], 'fases' => [1, 3, false],
            'tensao_bat_min_v' => [0, null, false, true], 'tensao_bat_max_v' => [0, null, false, true],
            'corrente_carga_max_a' => [0, null, false, true], 'corrente_descarga_max_a' => [0, null, false, true],
        ], $p, $pref);
        if ($r['faixa_mppt_min_v'] !== null && $r['faixa_mppt_max_v'] !== null && $r['faixa_mppt_min_v'] >= $r['faixa_mppt_max_v']) {
            $p[] = "$pref: faixa_mppt_min_v deve ser menor que faixa_mppt_max_v.";
        }
        if ($r['tipo'] === 'hibrido') {
            foreach (['tensao_bat_min_v', 'tensao_bat_max_v', 'corrente_carga_max_a', 'corrente_descarga_max_a'] as $c) {
                if ($r[$c] === null) {
                    $p[] = "$pref: tipo híbrido exige campos de bateria ($c ausente).";
                }
            }
            if ($r['tensao_bat_min_v'] !== null && $r['tensao_bat_max_v'] !== null && $r['tensao_bat_min_v'] >= $r['tensao_bat_max_v']) {
                $p[] = "$pref: tensao_bat_min_v deve ser menor que tensao_bat_max_v.";
            }
        }
        // Aliases internos usados pelo cálculo (kW em vez de W).
        $r['potencia_ca_kw'] = $r['potencia_nominal_w'] === null ? null : $r['potencia_nominal_w'] / 1000.0;
        $r['potencia_cc_max_kw'] = $r['potencia_max_fv_w'] === null ? null : $r['potencia_max_fv_w'] / 1000.0;
        $r['tensao_cc_max_v'] = $r['tensao_max_entrada_v'];
        $r['mppt_min_v'] = $r['faixa_mppt_min_v'];
        $r['mppt_max_v'] = $r['faixa_mppt_max_v'];
        $r['num_mppt'] = $r['numero_mppt'];
        $r['corrente_max_mppt_a'] = $r['corrente_max_entrada_a'];
        $r['observacoes'] = $r['observacoes'] ?? '';
    }
    unset($r);
    return fv_finalizar_dataset($linhas, $p, 'inversores.csv');
}

function fv_carregar_baterias(string $path, bool $permitirSinteticos = false): array
{
    $obrig = ['id', 'fabricante', 'modelo', 'tecnologia', 'tensao_nominal_v', 'capacidade_ah', 'capacidade_kwh', 'dod_pct', 'ciclos', 'preco_brl',
        'fornecedor', 'data_coleta', 'url_fonte', 'corrente_carga_max_a', 'corrente_descarga_max_a', 'eficiencia_pct'];
    $linhas = fv_ler_csv($path, $obrig, 'baterias.csv');
    $p = [];
    foreach ($linhas as &$r) {
        $pref = "baterias.csv linha {$r['_linha']}";
        fv_checar_rastreio($r, $permitirSinteticos, $p, $pref);
        fv_checar_numeros($r, [
            'capacidade_kwh' => [0, null, true, true], 'capacidade_ah' => [0, null, true, true], 'ciclos' => [0, null, true, true],
            'dod_pct' => [0, 100, true, true], 'tensao_nominal_v' => [0, null, true, true],
            'corrente_carga_max_a' => [0, null, true, true], 'corrente_descarga_max_a' => [0, null, true, true], 'eficiencia_pct' => [0, 100, true, true],
        ], $p, $pref);
        if ($r['capacidade_kwh'] !== null && $r['capacidade_ah'] !== null && $r['tensao_nominal_v'] !== null) {
            $kwhCalc = $r['capacidade_ah'] * $r['tensao_nominal_v'] / 1000.0;
            if (abs($kwhCalc - $r['capacidade_kwh']) > 0.05 * $r['capacidade_kwh']) {
                $p[] = "$pref: capacidade_kwh ({$r['capacidade_kwh']}) não confere com capacidade_ah × tensao_nominal_v (≈ " . round($kwhCalc, 2) . ' kWh).';
            }
        }
        $r['capacidade_nominal_kwh'] = $r['capacidade_kwh']; // alias interno
        $r['observacoes'] = $r['observacoes'] ?? '';
    }
    unset($r);
    return fv_finalizar_dataset($linhas, $p, 'baterias.csv');
}

function fv_carregar_hsp(string $path, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $obrig = ['cidade', 'uf', 'latitude', 'longitude', 'hsp_kwh_m2_dia', 'tipo', 'fonte', 'url_fonte', 'data_consulta'];
    $linhas = fv_ler_csv($path, $obrig, 'hsp_cidades.csv');
    $p = [];
    foreach ($linhas as &$r) {
        $pref = "hsp_cidades.csv linha {$r['_linha']}";
        if (trim($r['cidade']) === '') {
            $p[] = "$pref: cidade obrigatória.";
        }
        if (!in_array($r['uf'], FV_UFS, true)) {
            $p[] = "$pref: uf inválida.";
        }
        fv_checar_numeros($r, ['latitude' => [-90, 90, true], 'longitude' => [-180, 180, true],
            'hsp_kwh_m2_dia' => [$cfg['hsp']['min'], $cfg['hsp']['max'], true]], $p, $pref);
        if (trim($r['fonte']) === '' || !preg_match('#^https?://#i', $r['url_fonte'])) {
            $p[] = "$pref: fonte e url_fonte são obrigatórias (rastreabilidade).";
        }
    }
    unset($r);
    if ($p) {
        throw new FvDatasetErro($p);
    }
    return $linhas;
}

function fv_carregar_datasets(?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $dir = rtrim($cfg['datasets']['dir'], '/\\');
    $perm = (bool) $cfg['datasets']['permitir_sinteticos'];
    $out = [];
    $problemas = [];
    $loaders = [
        'modulos' => function () use ($dir, $perm) { return fv_carregar_modulos("$dir/modulos.csv", $perm); },
        'inversores' => function () use ($dir, $perm) { return fv_carregar_inversores("$dir/inversores.csv", $perm); },
        'baterias' => function () use ($dir, $perm) { return fv_carregar_baterias("$dir/baterias.csv", $perm); },
        'hsp' => function () use ($dir, $cfg) { return fv_carregar_hsp("$dir/hsp_cidades.csv", $cfg); },
    ];
    foreach ($loaders as $nome => $fn) {
        try {
            $out[$nome] = $fn();
        } catch (FvDatasetErro $e) {
            $problemas = array_merge($problemas, $e->problemas);
        }
    }
    if ($problemas) {
        throw new FvDatasetErro($problemas);
    }
    $sint = false;
    foreach (['modulos', 'inversores', 'baterias'] as $k) {
        foreach ($out[$k] as $l) {
            if ($l['fornecedor'] === FV_FORNECEDOR_SINTETICO) {
                $sint = true;
            }
        }
    }
    $out['sinteticos'] = $sint;
    return $out;
}

/** Só o que está abaixo do mínimo exigido (vazio = atendido). */
function fv_conferir_minimos(array $d, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $faltas = [];
    foreach ($cfg['datasets']['minimos'] as $k => $min) {
        $tem = count($d[$k] ?? []);
        if ($tem < $min) {
            $faltas[$k] = ['tem' => $tem, 'exigido' => $min, 'faltam' => $min - $tem];
        }
    }
    return $faltas;
}

/* ============================ US22 — Módulos (quantidade e escolha) ============================ */

function fv_quantidade_modulos(float $pfvKwp, float $potenciaModuloWp): array
{
    if ($potenciaModuloWp <= 0) {
        throw new FvErro('A potência do módulo deve ser maior que zero.');
    }
    // round(…, 9) remove ruído de ponto flutuante
    $n = (int) max(1, ceil(round($pfvKwp * 1000 / $potenciaModuloWp, 9)));
    return ['n' => $n, 'p_instalada_kwp' => $n * $potenciaModuloWp / 1000];
}

/** Critério de recomendação: MENOR CUSTO TOTAL DO ARRANJO (N × preço). Alternativas mantidas. */
function fv_ranking_modulos(float $pfvKwp, array $modulos): array
{
    $r = [];
    foreach ($modulos as $m) {
        if (!isset($m['potencia_wp'], $m['preco_brl']) || !is_numeric($m['potencia_wp']) || !is_numeric($m['preco_brl'])
            || (float) $m['potencia_wp'] <= 0 || (float) $m['preco_brl'] <= 0) {
            continue;
        }
        $q = fv_quantidade_modulos($pfvKwp, (float) $m['potencia_wp']);
        $r[] = array_merge($m, [
            'n' => $q['n'], 'p_instalada_kwp' => $q['p_instalada_kwp'],
            'preco_unitario' => (float) $m['preco_brl'], 'custo_arranjo' => $q['n'] * (float) $m['preco_brl'], 'recomendado' => false,
        ]);
    }
    usort($r, function ($a, $b) {
        return [$a['custo_arranjo'], $a['n'], $a['id']] <=> [$b['custo_arranjo'], $b['n'], $b['id']];
    });
    if ($r) {
        $r[0]['recomendado'] = true;
    }
    return $r;
}

/* ============================ US24 — Compatibilidade módulo × inversor ============================ */

function fv_voc_a_frio(float $voc, float $coefVocPctC, float $tminC): float
{
    return $voc * (1 + $coefVocPctC / 100.0 * ($tminC - 25.0));
}

function fv_piso(float $x): int
{
    return (int) floor(round($x, 9));
}

function fv_alocar_rec(int $resto, int $m, array $opcoes): ?array
{
    if ($m === 0) {
        return $resto === 0 ? [] : null;
    }
    foreach ($opcoes as $o) {
        $q = $o['strings'] * $o['por_string'];
        if ($q > $resto) {
            continue;
        }
        $sub = fv_alocar_rec($resto - $q, $m - 1, $opcoes);
        if ($sub !== null) {
            array_unshift($sub, $o);
            return $sub;
        }
    }
    return null;
}

/** Distribui $n módulos em até $numMppt entradas usando o menor nº de MPPTs possível. */
function fv_alocar_strings(int $n, int $numMppt, array $opcoes): ?array
{
    usort($opcoes, function ($a, $b) { return ($b['strings'] * $b['por_string']) <=> ($a['strings'] * $a['por_string']); });
    for ($m = 1; $m <= $numMppt; $m++) {
        $r = fv_alocar_rec($n, $m, $opcoes);
        if ($r !== null) {
            $saida = [];
            foreach ($r as $i => $o) {
                $saida[] = ['mppt' => $i + 1, 'strings' => $o['strings'], 'modulos_por_string' => $o['por_string']];
            }
            return $saida;
        }
    }
    return null;
}

function fv_verificar_inversor(array $mod, int $n, array $inv, float $tminC, bool $comBateria, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $v = [];
    $add = function (string $id, bool $ok, string $msg) use (&$v) { $v[] = ['id' => $id, 'ok' => $ok, 'mensagem' => $msg]; };

    $pInst = (float) $mod['p_instalada_kwp'];
    $voc = fv_voc_a_frio((float) $mod['voc_v'], (float) $mod['coef_voc_pct_c'], $tminC);
    $vmp = (float) $mod['vmp_v'];
    $imp = (float) $mod['imp_a'];
    $isc = (float) $mod['isc_a'];

    if ($comBateria) {
        $hib = $inv['tipo'] === 'hibrido';
        $add('tipo_hibrido', $hib, $hib ? 'Inversor híbrido: aceita armazenamento por baterias.'
            : 'Soluções com armazenamento exigem inversor híbrido; este modelo é on-grid.');
    }
    $rz = $pInst / (float) $inv['potencia_ca_kw'];
    $rmin = $cfg['compatibilidade']['razao_cc_ca_min'];
    $rmax = $cfg['compatibilidade']['razao_cc_ca_max'];
    $add('razao_cc_ca', $rz >= $rmin && $rz <= $rmax, 'Razão CC/CA = ' . fv_fmt($rz, 2) . ' (aceita entre ' . fv_fmt($rmin, 2) . ' e ' . fv_fmt($rmax, 2) . ').');
    $add('potencia_cc_max', $pInst <= (float) $inv['potencia_cc_max_kw'] + 1e-9,
        'Potência instalada ' . fv_fmt($pInst, 2) . ' kWp x limite CC do inversor ' . fv_fmt((float) $inv['potencia_cc_max_kw'], 2) . ' kW.');
    $add('tensao_voc', $voc <= (float) $inv['tensao_cc_max_v'],
        'Voc a ' . fv_fmt($tminC, 0) . ' °C = ' . fv_fmt($voc, 2) . ' V x tensão CC máxima do inversor ' . fv_fmt((float) $inv['tensao_cc_max_v'], 0) . ' V.');
    $icOk = $imp <= (float) $inv['corrente_max_mppt_a'] && ($inv['corrente_curto_mppt_a'] === null || $isc <= (float) $inv['corrente_curto_mppt_a']);
    $add('corrente_mppt', $icOk, 'Imp ' . fv_fmt($imp, 2) . ' A (Isc ' . fv_fmt($isc, 2) . ' A) x limite por MPPT ' . fv_fmt((float) $inv['corrente_max_mppt_a'], 2) . ' A.');

    $kmax = min(fv_piso((float) $inv['tensao_cc_max_v'] / $voc), fv_piso((float) $inv['mppt_max_v'] / $vmp));
    $kmin = max(1, (int) ceil(round((float) $inv['mppt_min_v'] / $vmp, 9)));
    $smax = min((int) $inv['strings_por_mppt'], fv_piso((float) $inv['corrente_max_mppt_a'] / $imp));
    if ($inv['corrente_curto_mppt_a'] !== null) {
        $smax = min($smax, fv_piso((float) $inv['corrente_curto_mppt_a'] / $isc));
    }
    $opcoes = [];
    for ($s = 1; $s <= $smax; $s++) {
        for ($k = $kmin; $k <= $kmax; $k++) {
            $opcoes[] = ['strings' => $s, 'por_string' => $k];
        }
    }
    $aloc = $opcoes ? fv_alocar_strings($n, (int) $inv['num_mppt'], $opcoes) : null;
    $add('strings_mppt', $aloc !== null, $aloc !== null
        ? "$n módulos distribuídos em " . count($aloc) . ' MPPT(s) (faixa MPPT ' . fv_fmt((float) $inv['mppt_min_v'], 0) . '–' . fv_fmt((float) $inv['mppt_max_v'], 0) . ' V).'
        : "Não é possível distribuir $n módulos nas " . (int) $inv['num_mppt'] . ' entradas MPPT respeitando tensão (' . $kmin . '–' . max($kmax, 0) . ' módulos/string) e corrente (' . max($smax, 0) . ' string(s)/MPPT).');

    $ok = true;
    foreach ($v as $x) {
        $ok = $ok && $x['ok'];
    }
    return ['compativel' => $ok, 'verificacoes' => $v, 'alocacao' => $ok ? $aloc : null, 'voc_frio_v' => $voc];
}

function fv_filtrar_inversores(array $mod, int $n, array $inversores, float $tminC, bool $comBateria, ?array $cfg = null): array
{
    $validos = [];
    $descartados = [];
    foreach ($inversores as $inv) {
        $r = fv_verificar_inversor($mod, $n, $inv, $tminC, $comBateria, $cfg);
        $item = ['id' => $inv['id'], 'fabricante' => $inv['fabricante'], 'modelo' => $inv['modelo'], 'tipo' => $inv['tipo'],
            'potencia_ca_kw' => $inv['potencia_ca_kw'], 'preco_unitario' => $inv['preco_brl'],
            'compativel' => $r['compativel'], 'verificacoes' => $r['verificacoes'], 'alocacao' => $r['alocacao']];
        if ($r['compativel']) {
            $validos[] = $item;
        } else {
            $descartados[] = $item;
        }
    }
    usort($validos, function ($a, $b) { return [$a['preco_unitario'], $a['id']] <=> [$b['preco_unitario'], $b['id']]; });
    return ['validos' => $validos, 'descartados' => $descartados];
}

/* ============================ US25 / US27 / US28 — Baterias ============================ */

function fv_validar_autonomia($v, bool $habilitado, ?array $cfg = null): ?float
{
    if (!$habilitado) {
        return null;
    }
    $cfg = $cfg ?? fv_config();
    if ($v === null || $v === '') {
        throw new FvErro('Informe a autonomia desejada (horas) quando o armazenamento estiver habilitado.');
    }
    if (!is_numeric($v)) {
        throw new FvErro('A autonomia deve ser numérica.');
    }
    $h = (float) $v;
    if ($h <= 0) {
        throw new FvErro('A autonomia deve ser maior que zero.');
    }
    if ($h > $cfg['baterias']['autonomia_max_h']) {
        throw new FvErro('A autonomia deve estar entre 0 e ' . fv_fmt((float) $cfg['baterias']['autonomia_max_h'], 0) . ' horas.');
    }
    return $h;
}

/** E_d = C_m / 30 (o enunciado fixa 30 dias nesta fórmula; o parâmetro D vale só para P_FV). */
function fv_energia_diaria(float $consumoMensal): float
{
    return $consumoMensal / 30.0;
}

function fv_energia_autonomia(float $ed, float $horas): float
{
    return $ed * $horas / 24.0;
}

/** Capacidade NOMINAL necessária: E_aut / (DoD × η_bat). DoD aplicado aqui, uma única vez. */
function fv_capacidade_bateria(float $eAutonomia, float $dodPct, float $etaBatPct): float
{
    return $eAutonomia / (($dodPct / 100.0) * ($etaBatPct / 100.0));
}

function fv_quantidade_baterias(float $cBatKwh, float $capNominalKwh): int
{
    if ($capNominalKwh <= 0) {
        throw new FvErro('A capacidade da bateria deve ser maior que zero.');
    }
    return (int) max(1, ceil(round($cBatKwh / $capNominalKwh, 9)));
}

/** Banco de $n baterias em paralelo (tensão = nominal; correntes somam). */
function fv_verificar_banco(array $bat, int $n, array $inv): array
{
    $v = [];
    $add = function (string $id, bool $ok, string $msg) use (&$v) { $v[] = ['id' => $id, 'ok' => $ok, 'mensagem' => $msg]; };
    if ($inv['tensao_bat_min_v'] === null) {
        $add('tensao_banco', false, 'O inversor não possui entrada de bateria.');
    } else {
        $t = (float) $bat['tensao_nominal_v'];
        $add('tensao_banco', $t >= (float) $inv['tensao_bat_min_v'] && $t <= (float) $inv['tensao_bat_max_v'],
            'Tensão do banco ' . fv_fmt($t, 1) . ' V x faixa do inversor ' . fv_fmt((float) $inv['tensao_bat_min_v'], 0) . '–' . fv_fmt((float) $inv['tensao_bat_max_v'], 0) . ' V.');
        foreach ([['corrente_carga', 'corrente_carga_max_a', 'carga'], ['corrente_descarga', 'corrente_descarga_max_a', 'descarga']] as $c) {
            $banco = $n * (float) $bat[$c[1]];
            $need = (float) $inv[$c[1]];
            $nmin = (int) ceil(round($need / (float) $bat[$c[1]], 9));
            $ok = $banco + 1e-9 >= $need;
            $add($c[0], $ok, $ok ? "Corrente de {$c[2]} do banco " . fv_fmt($banco, 0) . ' A atende o inversor (' . fv_fmt($need, 0) . ' A).'
                : "Corrente de {$c[2]} insuficiente: banco de $n bateria(s) = " . fv_fmt($banco, 0) . ' A, inversor exige ' . fv_fmt($need, 0) . " A (mínimo de $nmin baterias deste modelo).");
        }
    }
    $ok = true;
    foreach ($v as $x) {
        $ok = $ok && $x['ok'];
    }
    return ['compativel' => $ok, 'verificacoes' => $v];
}

function fv_opcoes_baterias(float $cBatKwh, array $baterias, array $inv): array
{
    $opcoes = [];
    $descartadas = [];
    foreach ($baterias as $b) {
        $n = fv_quantidade_baterias($cBatKwh, (float) $b['capacidade_nominal_kwh']);
        $ver = fv_verificar_banco($b, $n, $inv);
        $item = ['id' => $b['id'], 'fabricante' => $b['fabricante'], 'modelo' => $b['modelo'], 'tecnologia' => $b['tecnologia'],
            'n_bat' => $n, 'preco_unitario' => (float) $b['preco_brl'],
            'capacidade_nominal_total_kwh' => $n * (float) $b['capacidade_nominal_kwh'],
            'capacidade_util_total_kwh' => $n * (float) $b['capacidade_nominal_kwh'] * (float) $b['dod_pct'] / 100.0,
            'custo_banco' => $n * (float) $b['preco_brl'], 'compativel' => $ver['compativel'], 'verificacoes' => $ver['verificacoes']];
        if ($ver['compativel']) {
            $opcoes[] = $item;
        } else {
            $descartadas[] = $item;
        }
    }
    usort($opcoes, function ($a, $b) { return [$a['custo_banco'], $a['n_bat'], $a['id']] <=> [$b['custo_banco'], $b['n_bat'], $b['id']]; });
    return ['opcoes' => $opcoes, 'descartadas' => $descartadas];
}

/* ============================ US29 — Orçamento ============================ */

function fv_validar_outros_custos($in, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    if ($in === null || $in === '') {
        return [];
    }
    if (!is_array($in)) {
        throw new FvErro('Os outros custos devem ser enviados como lista de valores.');
    }
    $out = [];
    foreach ($in as $k => $v) {
        if (!isset($cfg['outros_custos'][$k]) || !is_array($cfg['outros_custos'][$k])) {
            throw new FvErro("Item de custo desconhecido: $k.");
        }
        if ($v === null || $v === '') {
            continue;
        }
        if (!is_numeric($v) || (float) $v < 0) {
            throw new FvErro('O custo "' . $cfg['outros_custos'][$k]['rotulo'] . '" deve ser um número maior ou igual a zero.');
        }
        $out[$k] = (float) $v;
    }
    return $out;
}

function fv_orcamento(array $mod, array $inv, ?array $banco, array $outros, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $linhas = [];
    $linha = function (string $id, string $desc, float $q, float $pu, string $cat) use (&$linhas) {
        $linhas[] = ['item_id' => $id, 'descricao' => $desc, 'quantidade' => $q, 'preco_unitario' => $pu, 'subtotal' => $q * $pu, 'categoria' => $cat];
    };
    $linha((string) $mod['id'], $mod['fabricante'] . ' ' . $mod['modelo'] . ' (módulo)', (float) $mod['n'], (float) $mod['preco_unitario'], 'equipamentos');
    $linha((string) $inv['id'], $inv['fabricante'] . ' ' . $inv['modelo'] . ' (inversor)', 1.0, (float) $inv['preco_unitario'], 'equipamentos');
    if ($banco !== null) {
        $linha((string) $banco['id'], $banco['fabricante'] . ' ' . $banco['modelo'] . ' (bateria)', (float) $banco['n_bat'], (float) $banco['preco_unitario'], 'equipamentos');
    }
    $eq = 0.0;
    foreach ($linhas as $l) {
        $eq += $l['subtotal'];
    }
    $out = 0.0;
    foreach ($cfg['outros_custos'] as $k => $def) {
        if (!is_array($def)) {
            continue;
        }
        $val = $outros[$k] ?? (float) $def['valor'];
        switch ($def['modo']) {
            case 'percentual_equipamentos': $sub = $eq * $val / 100.0; break;
            case 'por_kwp': $sub = $val * (float) $mod['p_instalada_kwp']; break;
            case 'por_modulo': $sub = $val * (float) $mod['n']; break;
            default: $sub = $val;
        }
        $linha($k, $def['rotulo'], 1.0, $sub, 'outros');
        $out += $sub;
    }
    return [
        'linhas' => $linhas, 'custo_equipamentos' => $eq, 'custo_outros' => $out, 'custo_total' => $eq + $out,
        'custo_por_categoria' => ['equipamentos' => $eq, 'outros' => $out],
        'aviso_outros_zerados' => $out <= 0.0,
    ];
}

/* ============================ US30 — Dimensionamento completo e proposta ============================ */

function fv_item_modulo(array $m): array
{
    return ['id' => $m['id'], 'fabricante' => $m['fabricante'], 'modelo' => $m['modelo'], 'potencia_wp' => $m['potencia_wp'], 'eficiencia_pct' => $m['eficiencia_pct'],
        'n' => $m['n'], 'p_instalada_kwp' => $m['p_instalada_kwp'], 'preco_unitario' => $m['preco_unitario'], 'custo_arranjo' => $m['custo_arranjo'], 'recomendado' => $m['recomendado']];
}

function fv_falhas_texto(array $verificacoes): string
{
    $t = [];
    foreach ($verificacoes as $x) {
        if (!$x['ok']) {
            $t[] = $x['mensagem'];
        }
    }
    return implode(' ', $t);
}

/**
 * @param array $imovel  cidade, uf, hsp_manual, consumo_manual_kwh, consumo_estimado_kwh
 * @param array $entrada f, eta, D, tmin_c, modulo_id, inversor_id, bateria_id, armazenamento, autonomia_h, outros_custos
 * @param array $ds      resultado de fv_carregar_datasets()
 */
function fv_dimensionar(array $imovel, array $entrada, array $ds, ?array $cfg = null): array
{
    $cfg = $cfg ?? fv_config();
    $params = fv_validar_parametros($entrada, $cfg);
    $consumo = fv_resolver_consumo($imovel['consumo_estimado_kwh'] ?? null, $imovel['consumo_manual_kwh'] ?? null);
    $hsp = fv_resolver_hsp($imovel['cidade'] ?? null, $imovel['uf'] ?? null, $imovel['hsp_manual'] ?? null, $ds['hsp'], $cfg);
    $armaz = !empty($entrada['armazenamento']) && $entrada['armazenamento'] !== 'false';
    $autonomia = fv_validar_autonomia($entrada['autonomia_h'] ?? null, $armaz, $cfg);
    $outros = fv_validar_outros_custos($entrada['outros_custos'] ?? [], $cfg);

    $efv = fv_energia_fv($consumo['valor'], $params['f']);
    $pfv = fv_potencia_fv($efv, $hsp['hsp'], $params['D'], $params['eta']);

    $res = [
        'consumo' => ['origem' => $consumo['origem'], 'valor_kwh_mes' => $consumo['valor']],
        'parametros' => $params, 'hsp' => $hsp, 'e_fv_kwh_mes' => $efv, 'p_fv_kwp' => $pfv,
        'armazenamento' => ['habilitado' => $armaz, 'autonomia_h' => $autonomia, 'e_d_kwh' => null, 'e_autonomia_kwh' => null, 'c_bat_kwh' => null],
        'modulos' => ['opcoes' => [], 'escolhido' => null],
        'inversores' => ['opcoes' => [], 'descartados' => [], 'escolhido' => null],
        'baterias' => ['opcoes' => [], 'descartadas' => [], 'escolhida' => null],
        'sistema' => ['modulo' => '', 'n_modulos' => 0, 'p_instalada_kwp' => 0.0, 'inversor' => '', 'bateria' => null],
        'orcamento' => null, 'geracao' => null, 'completa' => false, 'bloqueios' => [],
        'dados_sinteticos' => (bool) ($ds['sinteticos'] ?? false), 'aviso_limitacoes' => $cfg['aviso_limitacoes'],
    ];

    // ---- módulos (US22)
    $rank = fv_ranking_modulos($pfv, $ds['modulos']);
    if (!$rank) {
        $res['bloqueios'][] = 'Nenhum módulo com potência e preço cadastrados no dataset (modulos.csv).';
        return $res;
    }
    $res['modulos']['opcoes'] = array_map('fv_item_modulo', $rank);
    $modId = $entrada['modulo_id'] ?? null;
    $invId = $entrada['inversor_id'] ?? null;
    $mod = $rank[0];
    $filtro = null;
    if ($modId !== null && $modId !== '') {
        $mod = null;
        foreach ($rank as $m) {
            if ($m['id'] === $modId) {
                $mod = $m;
            }
        }
        if ($mod === null) {
            throw new FvErro("O módulo '$modId' não está entre os módulos disponíveis.");
        }
    } elseif ($invId === null || $invId === '') {
        // recomendado = menor custo; se não tiver inversor compatível, cai para a próxima alternativa
        foreach ($rank as $i => $m) {
            $f = fv_filtrar_inversores($m, $m['n'], $ds['inversores'], $params['tmin_c'], $armaz, $cfg);
            if ($i === 0) {
                $mod = $m;
                $filtro = $f;
            }
            if ($f['validos']) {
                $mod = $m;
                $filtro = $f;
                break;
            }
        }
    }
    $filtro = $filtro ?? fv_filtrar_inversores($mod, $mod['n'], $ds['inversores'], $params['tmin_c'], $armaz, $cfg);
    $res['modulos']['escolhido'] = $mod['id'];
    $res['sistema']['modulo'] = $mod['fabricante'] . ' ' . $mod['modelo'];
    $res['sistema']['n_modulos'] = $mod['n'];
    $res['sistema']['p_instalada_kwp'] = $mod['p_instalada_kwp'];
    $res['geracao'] = [
        'p_instalada_kwp' => $mod['p_instalada_kwp'],
        'geracao_mensal_kwh' => $mod['p_instalada_kwp'] * $hsp['hsp'] * $params['D'] * $params['eta'],
    ];
    $res['geracao']['cobertura_consumo_pct'] = $res['geracao']['geracao_mensal_kwh'] / $consumo['valor'] * 100.0;

    // ---- inversor (US24)
    $res['inversores']['opcoes'] = $filtro['validos'];
    $res['inversores']['descartados'] = $filtro['descartados'];
    $inv = null;
    if ($invId !== null && $invId !== '') {
        foreach ($ds['inversores'] as $i) {
            if ($i['id'] === $invId) {
                $inv = $i;
            }
        }
        if ($inv === null) {
            throw new FvErro("O inversor '$invId' não está entre os inversores disponíveis.");
        }
        $ver = fv_verificar_inversor($mod, $mod['n'], $inv, $params['tmin_c'], $armaz, $cfg);
        if (!$ver['compativel']) {
            throw new FvErro("O inversor '$invId' é incompatível: " . fv_falhas_texto($ver['verificacoes']));
        }
    } elseif ($filtro['validos']) {
        foreach ($ds['inversores'] as $i) {
            if ($i['id'] === $filtro['validos'][0]['id']) {
                $inv = $i;
            }
        }
    }
    if ($inv === null) {
        $res['bloqueios'][] = $ds['inversores']
            ? ($armaz ? 'Nenhum inversor HÍBRIDO compatível com o arranjo de módulos foi encontrado nos datasets.'
                      : 'Nenhum inversor compatível com o arranjo de módulos foi encontrado nos datasets.')
            : 'O dataset de inversores (inversores.csv) está vazio.';
        return $res;
    }
    $res['inversores']['escolhido'] = $inv['id'];
    $res['sistema']['inversor'] = $inv['fabricante'] . ' ' . $inv['modelo'];
    $invOrc = ['id' => $inv['id'], 'fabricante' => $inv['fabricante'], 'modelo' => $inv['modelo'], 'preco_unitario' => (float) $inv['preco_brl']];

    // ---- baterias (US25/US27/US28)
    $bancoOrc = null;
    if ($armaz) {
        $ed = fv_energia_diaria($consumo['valor']);
        $ea = fv_energia_autonomia($ed, $autonomia);
        $res['armazenamento']['e_d_kwh'] = $ed;
        $res['armazenamento']['e_autonomia_kwh'] = $ea;
        if (!$ds['baterias']) {
            $res['bloqueios'][] = 'O dataset de baterias (baterias.csv) está vazio.';
            return $res;
        }
        // C_bat depende do DoD e da eficiência de CADA modelo
        $opcoes = [];
        $descartadas = [];
        $todas = [];
        foreach ($ds['baterias'] as $b) {
            $c = fv_capacidade_bateria($ea, (float) $b['dod_pct'], (float) $b['eficiencia_pct']);
            $o = fv_opcoes_baterias($c, [$b], $inv);
            $item = $o['opcoes'] ? $o['opcoes'][0] : $o['descartadas'][0];
            $item['c_bat_kwh'] = $c;
            $todas[$b['id']] = $item;
            if ($item['compativel']) {
                $opcoes[] = $item;
            } else {
                $descartadas[] = $item;
            }
        }
        usort($opcoes, function ($a, $b) { return [$a['custo_banco'], $a['n_bat'], $a['id']] <=> [$b['custo_banco'], $b['n_bat'], $b['id']]; });
        $res['baterias']['opcoes'] = $opcoes;
        $res['baterias']['descartadas'] = $descartadas;
        $batId = $entrada['bateria_id'] ?? null;
        $sel = null;
        if ($batId !== null && $batId !== '') {
            if (!isset($todas[$batId])) {
                throw new FvErro("A bateria '$batId' não está entre as baterias disponíveis.");
            }
            if (!$todas[$batId]['compativel']) {
                throw new FvErro("A bateria '$batId' é incompatível com o inversor: " . fv_falhas_texto($todas[$batId]['verificacoes']));
            }
            $sel = $todas[$batId];
        } elseif ($opcoes) {
            $sel = $opcoes[0];
        }
        if ($sel === null) {
            $res['bloqueios'][] = 'Nenhuma bateria do dataset é compatível com o inversor selecionado.';
            return $res;
        }
        $res['armazenamento']['c_bat_kwh'] = $sel['c_bat_kwh'];
        $res['baterias']['escolhida'] = $sel['id'];
        $res['sistema']['bateria'] = ['descricao' => $sel['fabricante'] . ' ' . $sel['modelo'], 'n_bat' => $sel['n_bat'],
            'capacidade_nominal_total_kwh' => $sel['capacidade_nominal_total_kwh'], 'capacidade_util_total_kwh' => $sel['capacidade_util_total_kwh'],
            'verificacoes' => $sel['verificacoes']];
        $bancoOrc = ['id' => $sel['id'], 'fabricante' => $sel['fabricante'], 'modelo' => $sel['modelo'], 'n_bat' => $sel['n_bat'], 'preco_unitario' => $sel['preco_unitario']];
    }

    $res['orcamento'] = fv_orcamento($mod, $invOrc, $bancoOrc, $outros, $cfg);
    $res['completa'] = true;
    return $res;
}
