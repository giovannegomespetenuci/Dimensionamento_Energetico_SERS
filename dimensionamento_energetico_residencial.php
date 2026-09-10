<?php
declare(strict_types=1);

session_start();

function responderJson(array $dados, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function banco(): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conexao = new mysqli('127.0.0.1', 'root', '', 'dimensionamento_energetico');
    $conexao->set_charset('utf8mb4');
    return $conexao;
}

function exigirUsuario(): int
{
    if (empty($_SESSION['usuario_id'])) {
        responderJson(['erro' => 'Sessão expirada. Entre novamente.'], 401);
    }
    return (int) $_SESSION['usuario_id'];
}

function carregarEstadoBanco(mysqli $db, int $usuarioId): array
{
    $categorias = [];
    $consulta = $db->prepare('SELECT id, nome FROM categorias WHERE usuario_id = ? ORDER BY id');
    $consulta->bind_param('i', $usuarioId);
    $consulta->execute();
    $resultado = $consulta->get_result();
    while ($linha = $resultado->fetch_assoc()) {
        $categorias[] = ['id' => (int) $linha['id'], 'nome' => $linha['nome']];
    }

    $referencias = [];
    $resultado = $db->query('SELECT id, nome, categoria, potencia_w FROM equipamentos_referencia WHERE usuario_id IS NULL ORDER BY id');
    while ($linha = $resultado->fetch_assoc()) {
        $referencias[] = [
            'id' => (int) $linha['id'],
            'nome' => $linha['nome'],
            'categoria' => $linha['categoria'],
            'potencia' => (float) $linha['potencia_w']
        ];
    }

    $imoveis = [];
    $consulta = $db->prepare(
        'SELECT im.id, im.nome, im.endereco, im.tarifa, im.limite_consumo_kwh,
                COALESCE(v.consumo_total_kwh, 0) AS consumo_total_kwh,
                COALESCE(v.custo_estimado_reais, 0) AS custo_estimado_reais
         FROM imoveis im
         LEFT JOIN vw_consumo_imovel v ON v.imovel_id = im.id
         WHERE im.usuario_id = ? ORDER BY im.id'
    );
    $consulta->bind_param('i', $usuarioId);
    $consulta->execute();
    $resultado = $consulta->get_result();
    while ($imovel = $resultado->fetch_assoc()) {
        $item = [
            'id' => (int) $imovel['id'],
            'nome' => $imovel['nome'],
            'endereco' => $imovel['endereco'],
            'tarifa' => $imovel['tarifa'] === null ? null : (float) $imovel['tarifa'],
            'limiteConsumo' => $imovel['limite_consumo_kwh'] === null ? null : (float) $imovel['limite_consumo_kwh'],
            'consumoTotalKwh' => (float) $imovel['consumo_total_kwh'],
            'custoEstimadoReais' => (float) $imovel['custo_estimado_reais'],
            'equipamentos' => []
        ];
        $equipamentos = $db->prepare(
            'SELECT equipamento_id AS id, nome, categoria, potencia_w, quantidade,
                    horas_uso_semana, horas_uso_fim_semana, consumo_mensal_kwh
             FROM vw_consumo_equipamento WHERE imovel_id = ? ORDER BY equipamento_id'
        );
        $equipamentos->bind_param('i', $imovel['id']);
        $equipamentos->execute();
        $equipResultado = $equipamentos->get_result();
        while ($equipamento = $equipResultado->fetch_assoc()) {
            $item['equipamentos'][] = [
                'id' => (int) $equipamento['id'],
                'nome' => $equipamento['nome'],
                'categoria' => $equipamento['categoria'],
                'potencia' => (float) $equipamento['potencia_w'],
                'quantidade' => (int) $equipamento['quantidade'],
                'horasSemana' => (float) $equipamento['horas_uso_semana'],
                'horasFimSemana' => (float) $equipamento['horas_uso_fim_semana'],
                'consumoMensalKwh' => (float) $equipamento['consumo_mensal_kwh']
            ];
        }
        $imoveis[] = $item;
    }

    return ['usuarios' => [], 'categorias' => $categorias, 'equipReferencia' => $referencias, 'imoveis' => $imoveis];
}

function salvarEstadoBanco(mysqli $db, int $usuarioId, array $estado): array
{
    $categoriasEntrada = $estado['categorias'] ?? null;
    $imoveisEntrada = $estado['imoveis'] ?? null;
    if (!is_array($categoriasEntrada) || !is_array($imoveisEntrada)) {
        throw new InvalidArgumentException('O estado enviado possui uma estrutura inválida.');
    }

    $normalizarId = static function ($valor): ?int {
        return is_int($valor) || (is_string($valor) && ctype_digit($valor))
            ? (int) $valor
            : null;
    };
    $erro = static function (string $mensagem): void {
        throw new InvalidArgumentException($mensagem);
    };

    $categoriasPorNome = [];
    $categoriasIds = [];
    foreach ($categoriasEntrada as $categoria) {
        if (!is_array($categoria)) {
            $erro('Categoria inválida recebida pelo servidor.');
        }
        $nome = trim((string) ($categoria['nome'] ?? ''));
        if ($nome === '' || mb_strlen($nome) > 100) {
            $erro('Toda categoria deve possuir um nome entre 1 e 100 caracteres.');
        }
        $chave = mb_strtolower($nome);
        if (isset($categoriasPorNome[$chave])) {
            $erro('Existem categorias duplicadas no estado enviado.');
        }
        $categoriasPorNome[$chave] = ['id' => $normalizarId($categoria['id'] ?? null), 'nome' => $nome];
        if ($categoriasPorNome[$chave]['id'] !== null) {
            $categoriasIds[] = $categoriasPorNome[$chave]['id'];
        }
    }

    $imoveisIds = [];
    foreach ($imoveisEntrada as $imovel) {
        if (!is_array($imovel)) {
            $erro('Imóvel inválido recebido pelo servidor.');
        }
        $nome = trim((string) ($imovel['nome'] ?? ''));
        $endereco = trim((string) ($imovel['endereco'] ?? ''));
        if ($nome === '' || mb_strlen($nome) > 150 || $endereco === '' || mb_strlen($endereco) > 255) {
            $erro('Todo imóvel deve possuir nome e endereço válidos.');
        }
        $imovelId = $normalizarId($imovel['id'] ?? null);
        if ($imovelId !== null) {
            $imoveisIds[] = $imovelId;
        }
        $tarifa = $imovel['tarifa'] ?? null;
        $limite = $imovel['limiteConsumo'] ?? null;
        if ($tarifa !== null && $tarifa !== '' && (!is_numeric($tarifa) || (float) $tarifa <= 0)) {
            $erro('A tarifa deve ser numérica e maior que zero.');
        }
        if ($limite !== null && $limite !== '' && (!is_numeric($limite) || (float) $limite <= 0)) {
            $erro('O limite de consumo deve ser numérico e maior que zero.');
        }
        if (!isset($imovel['equipamentos']) || !is_array($imovel['equipamentos'])) {
            $erro('A lista de equipamentos do imóvel é inválida.');
        }
        foreach ($imovel['equipamentos'] as $equipamento) {
            if (!is_array($equipamento)) {
                $erro('Equipamento inválido recebido pelo servidor.');
            }
            $equipamentoNome = trim((string) ($equipamento['nome'] ?? ''));
            $categoriaNome = mb_strtolower(trim((string) ($equipamento['categoria'] ?? '')));
            $potencia = $equipamento['potencia'] ?? null;
            $quantidade = $equipamento['quantidade'] ?? null;
            $horasSemana = $equipamento['horasSemana'] ?? null;
            $horasFds = $equipamento['horasFimSemana'] ?? null;
            if ($equipamentoNome === '' || mb_strlen($equipamentoNome) > 150 || !isset($categoriasPorNome[$categoriaNome])) {
                $erro('Todo equipamento deve possuir nome e categoria cadastrados.');
            }
            if (!is_numeric($potencia) || (float) $potencia <= 0 || !is_numeric($quantidade) || (int) $quantidade <= 0 ||
                (string) (int) $quantidade !== (string) $quantidade && !is_int($quantidade) ||
                !is_numeric($horasSemana) || (float) $horasSemana < 0 || (float) $horasSemana > 24 ||
                !is_numeric($horasFds) || (float) $horasFds < 0 || (float) $horasFds > 24) {
                $erro('Equipamento possui potência, quantidade ou horas de uso inválidas.');
            }
        }
    }

    $db->begin_transaction();
    try {
        $categoriasBanco = [];
        $consulta = $db->prepare('SELECT id, nome FROM categorias WHERE usuario_id = ?');
        $consulta->bind_param('i', $usuarioId);
        $consulta->execute();
        foreach ($consulta->get_result()->fetch_all(MYSQLI_ASSOC) as $linha) {
            $categoriasBanco[(int) $linha['id']] = $linha['nome'];
        }
        foreach ($categoriasPorNome as &$categoria) {
            if ($categoria['id'] !== null && !isset($categoriasBanco[$categoria['id']])) {
                $erro('Uma categoria enviada não pertence ao usuário atual.');
            }
            if ($categoria['id'] === null) {
                $stmt = $db->prepare('INSERT INTO categorias (usuario_id, nome) VALUES (?, ?)');
                $stmt->bind_param('is', $usuarioId, $categoria['nome']);
                $stmt->execute();
                $categoria['id'] = $stmt->insert_id;
            } else {
                $stmt = $db->prepare('UPDATE categorias SET nome = ? WHERE id = ? AND usuario_id = ?');
                $stmt->bind_param('sii', $categoria['nome'], $categoria['id'], $usuarioId);
                $stmt->execute();
            }
        }
        unset($categoria);
        $idsCategoriasMantidas = array_column($categoriasPorNome, 'id');
        $idsCategoriasRemover = array_diff(array_keys($categoriasBanco), $idsCategoriasMantidas);

        $imoveisBanco = [];
        $consulta = $db->prepare('SELECT id FROM imoveis WHERE usuario_id = ?');
        $consulta->bind_param('i', $usuarioId);
        $consulta->execute();
        foreach ($consulta->get_result()->fetch_all(MYSQLI_ASSOC) as $linha) {
            $imoveisBanco[(int) $linha['id']] = true;
        }
        $idsImoveis = [];
        foreach ($imoveisEntrada as $imovel) {
            $nome = trim((string) ($imovel['nome'] ?? ''));
            $endereco = trim((string) ($imovel['endereco'] ?? ''));
            $tarifa = ($imovel['tarifa'] ?? null) === null || $imovel['tarifa'] === '' ? null : (float) $imovel['tarifa'];
            $limite = ($imovel['limiteConsumo'] ?? null) === null || $imovel['limiteConsumo'] === '' ? null : (float) $imovel['limiteConsumo'];
            $imovelId = $normalizarId($imovel['id'] ?? null);
            if ($imovelId !== null && !isset($imoveisBanco[$imovelId])) {
                $erro('Um imóvel enviado não pertence ao usuário atual.');
            }
            if ($imovelId === null) {
                $stmt = $db->prepare('INSERT INTO imoveis (usuario_id, nome, endereco, tarifa, limite_consumo_kwh) VALUES (?, ?, ?, ?, ?)');
                $stmt->bind_param('issdd', $usuarioId, $nome, $endereco, $tarifa, $limite);
                $stmt->execute();
                $imovelId = $stmt->insert_id;
            } else {
                $stmt = $db->prepare('UPDATE imoveis SET nome = ?, endereco = ?, tarifa = ?, limite_consumo_kwh = ? WHERE id = ? AND usuario_id = ?');
                $stmt->bind_param('ssddii', $nome, $endereco, $tarifa, $limite, $imovelId, $usuarioId);
                $stmt->execute();
            }
            $idsImoveis[(string) ($imovel['id'] ?? '')] = $imovelId;
            $equipamentosBanco = [];
            $stmt = $db->prepare('SELECT id FROM equipamentos WHERE imovel_id = ?');
            $stmt->bind_param('i', $imovelId);
            $stmt->execute();
            foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $linha) {
                $equipamentosBanco[(int) $linha['id']] = true;
            }
            $equipamentosMantidos = [];
            foreach ($imovel['equipamentos'] as $equipamento) {
                $categoriaNome = mb_strtolower(trim((string) ($equipamento['categoria'] ?? '')));
                $categoriaId = $categoriasPorNome[$categoriaNome]['id'];
                $equipamentoNome = trim((string) ($equipamento['nome'] ?? ''));
                $potencia = (float) ($equipamento['potencia'] ?? 0);
                $quantidade = (int) ($equipamento['quantidade'] ?? 0);
                $horasSemana = (float) ($equipamento['horasSemana'] ?? 0);
                $horasFds = (float) ($equipamento['horasFimSemana'] ?? $horasSemana);
                $equipamentoId = $normalizarId($equipamento['id'] ?? null);
                if ($equipamentoId !== null && !isset($equipamentosBanco[$equipamentoId])) {
                    $erro('Um equipamento enviado não pertence ao imóvel atual.');
                }
                if ($equipamentoId === null) {
                    $stmt = $db->prepare('INSERT INTO equipamentos (imovel_id, categoria_id, nome, potencia_w, quantidade, horas_uso_semana, horas_uso_fim_semana) VALUES (?, ?, ?, ?, ?, ?, ?)');
                    $stmt->bind_param('iisdidd', $imovelId, $categoriaId, $equipamentoNome, $potencia, $quantidade, $horasSemana, $horasFds);
                    $stmt->execute();
                } else {
                    $stmt = $db->prepare('UPDATE equipamentos SET categoria_id = ?, nome = ?, potencia_w = ?, quantidade = ?, horas_uso_semana = ?, horas_uso_fim_semana = ? WHERE id = ? AND imovel_id = ?');
                    $stmt->bind_param('isdiddii', $categoriaId, $equipamentoNome, $potencia, $quantidade, $horasSemana, $horasFds, $equipamentoId, $imovelId);
                    $stmt->execute();
                }
                $equipamentosMantidos[] = $equipamentoId ?? (int) $stmt->insert_id;
            }
            $remover = array_diff(array_keys($equipamentosBanco), $equipamentosMantidos);
            if ($remover) {
                $lista = implode(',', array_map('intval', $remover));
                $db->query("DELETE FROM equipamentos WHERE imovel_id = {$imovelId} AND id IN ({$lista})");
            }
        }
        $removerImoveis = array_diff(array_keys($imoveisBanco), array_values(array_filter($imoveisIds)));
        if ($removerImoveis) {
            $lista = implode(',', array_map('intval', $removerImoveis));
            $db->query("DELETE FROM imoveis WHERE usuario_id = {$usuarioId} AND id IN ({$lista})");
        }
        if ($idsCategoriasRemover) {
            $lista = implode(',', array_map('intval', $idsCategoriasRemover));
            if ($db->query("SELECT 1 FROM equipamentos e JOIN categorias c ON c.id = e.categoria_id WHERE c.usuario_id = {$usuarioId} AND c.id IN ({$lista}) LIMIT 1")->num_rows) {
                $erro('Não é possível excluir categoria vinculada a equipamento.');
            }
            $db->query("DELETE FROM categorias WHERE usuario_id = {$usuarioId} AND id IN ({$lista})");
        }
        $db->commit();
        return ['estado' => carregarEstadoBanco($db, $usuarioId), 'idsImoveis' => $idsImoveis];
    } catch (Throwable $erro) {
        $db->rollback();
        throw $erro;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $entrada = json_decode(file_get_contents('php://input'), true) ?? [];
    $acao = (string) ($entrada['acao'] ?? '');
    try {
        $db = banco();
        if ($acao === 'registrar') {
            $email = strtolower(trim((string) ($entrada['email'] ?? '')));
            $senha = (string) ($entrada['senha'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($senha) < 8) {
                responderJson(['erro' => 'Informe um e-mail válido e uma senha com ao menos 8 caracteres.'], 422);
            }
            $senhaHash = password_hash($senha, PASSWORD_DEFAULT);
            $stmt = $db->prepare('INSERT INTO usuarios (email, senha_hash) VALUES (?, ?)');
            $stmt->bind_param('ss', $email, $senhaHash);
            $stmt->execute();
            $usuarioId = $stmt->insert_id;
            $stmt = $db->prepare('CALL sp_criar_categorias_padrao(?)');
            $stmt->bind_param('i', $usuarioId);
            $stmt->execute();
            responderJson(['ok' => true]);
        }
        if ($acao === 'entrar') {
            $email = strtolower(trim((string) ($entrada['email'] ?? '')));
            $stmt = $db->prepare('SELECT id, senha_hash FROM usuarios WHERE email = ?');
            $stmt->bind_param('s', $email);
            $stmt->execute();
            $usuario = $stmt->get_result()->fetch_assoc();
            if (!$usuario || !password_verify((string) ($entrada['senha'] ?? ''), $usuario['senha_hash'])) {
                responderJson(['erro' => 'E-mail ou senha inválidos.'], 401);
            }
            $_SESSION['usuario_id'] = (int) $usuario['id'];
            $_SESSION['email'] = $email;
            responderJson(['ok' => true, 'email' => $email, 'estado' => carregarEstadoBanco($db, (int) $usuario['id'])]);
        }
        if ($acao === 'sair') {
            session_destroy();
            responderJson(['ok' => true]);
        }
        if ($acao === 'carregar') {
            responderJson(['ok' => true, 'estado' => carregarEstadoBanco($db, exigirUsuario())]);
        }
        if ($acao === 'salvar') {
            $salvo = salvarEstadoBanco($db, exigirUsuario(), (array) ($entrada['estado'] ?? []));
            responderJson(['ok' => true] + $salvo);
        }
        if ($acao === 'solicitar_reset') {
            $email = strtolower(trim((string) ($entrada['email'] ?? '')));
            $codigo = (string) random_int(100000, 999999);
            $expira = date('Y-m-d H:i:s', time() + 900);
            $stmt = $db->prepare('UPDATE usuarios SET reset_token = ?, reset_token_expira = ? WHERE email = ?');
            $stmt->bind_param('sss', $codigo, $expira, $email);
            $stmt->execute();
            if ($stmt->affected_rows === 0) {
                responderJson(['erro' => 'Não encontramos uma conta com este e-mail.'], 404);
            }
            responderJson(['ok' => true, 'codigo' => $codigo]);
        }
        if ($acao === 'resetar_senha') {
            $email = strtolower(trim((string) ($entrada['email'] ?? '')));
            $codigo = trim((string) ($entrada['codigo'] ?? ''));
            $senhaHash = password_hash((string) ($entrada['senha'] ?? ''), PASSWORD_DEFAULT);
            $stmt = $db->prepare(
                'UPDATE usuarios SET senha_hash = ?, reset_token = NULL, reset_token_expira = NULL
                  WHERE email = ? AND reset_token = ? AND reset_token_expira > NOW()'
            );
            $stmt->bind_param('sss', $senhaHash, $email, $codigo);
            $stmt->execute();
            if ($stmt->affected_rows === 0) {
                responderJson(['erro' => 'Código inválido ou expirado.'], 422);
            }
            responderJson(['ok' => true]);
        }
        responderJson(['erro' => 'Ação desconhecida.'], 400);
    } catch (InvalidArgumentException $erro) {
        responderJson(['erro' => $erro->getMessage()], 422);
    } catch (Throwable $erro) {
        responderJson(['erro' => 'Não foi possível concluir a operação no banco de dados.'], 500);
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel &mdash; Dimensionamento Energético Residencial</title>
<link rel="stylesheet" href="style.css" type="text/css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
</head>
<body>
<div id="caixa-toasts"></div>

<!-- ===================== TELA DE AUTENTICAÇÃO ===================== -->
<section id="tela-auth">
  <div class="auth-shell">
    <div class="auth-hero">
      <div class="readout">
        <div class="rotulo">Consumo estimado</div>
        <div class="valor" id="hero-valor">0.0<span>kWh/mês</span></div>
      </div>
      <h1>Dimensionamento energético residencial</h1>
      <p>Cadastre seu imóvel, registre os equipamentos e acompanhe o consumo mensal estimado da sua casa.</p>
    </div>
    <div class="auth-card painel-claro">
      <div class="abas-auth">
        <button data-aba-auth="entrar" class="ativa">Entrar</button>
        <button data-aba-auth="criar">Criar conta</button>
        <button data-aba-auth="esqueci">Esqueci a senha</button>
      </div>

      <!-- Entrar -->
      <form id="form-entrar" class="painel-aba-auth">
        <div class="campo">
          <label for="entrar-email">E-mail</label>
          <input type="email" id="entrar-email" required>
        </div>
        <div class="campo">
          <label for="entrar-senha">Senha</label>
          <input type="password" id="entrar-senha" required>
          <div class="erro-campo" id="erro-entrar"></div>
        </div>
        <button type="submit" class="btn btn-principal" style="width:100%;">Entrar</button>
        <button type="button" class="btn-texto" id="btn-convidado" style="margin-top:10px;">Continuar sem conta (modo convidado)</button>
      </form>

      <!-- Criar conta -->
      <form id="form-criar" class="painel-aba-auth hidden">
        <div class="campo">
          <label for="criar-email">E-mail</label>
          <input type="email" id="criar-email" required>
          <div class="erro-campo" id="erro-criar-email"></div>
        </div>
        <div class="campo">
          <label for="criar-senha">Senha</label>
          <input type="password" id="criar-senha" required>
          <div class="ajuda">Mínimo de 8 caracteres.</div>
          <div class="erro-campo" id="erro-criar-senha"></div>
        </div>
        <button type="submit" class="btn btn-principal" style="width:100%;">Criar conta</button>
      </form>

      <!-- Esqueci a senha -->
      <div id="painel-esqueci" class="painel-aba-auth hidden">
        <div class="mensagem-simulacao">
          Este protótipo não possui servidor de e-mail. O código de redefinição é exibido aqui mesmo, simulando o link que seria enviado por e-mail.
        </div>
        <form id="form-esqueci-email">
          <div class="campo">
            <label for="esqueci-email">E-mail cadastrado</label>
            <input type="email" id="esqueci-email" required>
            <div class="erro-campo" id="erro-esqueci-email"></div>
          </div>
          <button type="submit" class="btn btn-principal" style="width:100%;">Gerar código de redefinição</button>
        </form>
        <form id="form-esqueci-nova" class="hidden" style="margin-top:14px;">
          <div class="campo">
            <label for="esqueci-codigo">Código recebido</label>
            <input type="text" id="esqueci-codigo" required>
          </div>
          <div class="campo">
            <label for="esqueci-nova-senha">Nova senha</label>
            <input type="password" id="esqueci-nova-senha" required>
          </div>
          <div class="campo">
            <label for="esqueci-confirma-senha">Confirmar nova senha</label>
            <input type="password" id="esqueci-confirma-senha" required>
            <div class="erro-campo" id="erro-esqueci-nova"></div>
          </div>
          <button type="submit" class="btn btn-principal" style="width:100%;">Redefinir senha</button>
        </form>
      </div>
    </div>
  </div>
</section>

<!-- ===================== APP PRINCIPAL ===================== -->
<section id="tela-app" class="hidden">
  <nav id="nav-lateral">
    <div class="marca">PAINEL<b>//</b>ENERGIA</div>
    <button class="item-nav ativo" data-vista="dashboard"><span class="chave"></span>Meus imóveis</button>
    <button class="item-nav" data-vista="categorias"><span class="chave"></span>Categorias</button>
    <button class="item-nav" data-vista="comparar"><span class="chave"></span>Comparar cenários</button>
    <button class="item-nav" data-vista="testes"><span class="chave"></span>Testes automatizados</button>
    <div id="rodape-nav">
      <span class="email-usuario" id="rotulo-usuario"></span>
      <button class="btn btn-pequeno" id="btn-sair">Sair</button>
    </div>
  </nav>

  <div id="conteudo">

    <!-- ---------- DASHBOARD ---------- -->
    <div id="vista-dashboard" class="vista">
      <div class="cabecalho-vista">
        <div>
          <h2>Meus imóveis</h2>
          <p>Projetos de dimensionamento salvos.</p>
        </div>
      </div>
      <div class="grade-cartoes" id="grade-imoveis"></div>
    </div>

    <!-- ---------- IMÓVEL (workspace) ---------- -->
    <div id="vista-imovel" class="vista hidden">
      <div class="cabecalho-vista">
        <div>
          <h2 id="titulo-imovel">Novo imóvel</h2>
          <p>Cadastro, equipamentos, relatório e importação de planilha.</p>
        </div>
        <button class="btn" id="btn-voltar-dashboard">&larr; Meus imóveis</button>
      </div>

      <div class="abas-imovel">
        <button data-aba-imovel="dados" class="ativa">Dados do imóvel</button>
        <button data-aba-imovel="equipamentos" disabled>Equipamentos</button>
        <button data-aba-imovel="relatorio" disabled>Relatório</button>
        <button data-aba-imovel="importar" disabled>Importar planilha</button>
      </div>

      <!-- Aba: dados -->
      <div id="aba-dados" class="aba-imovel-conteudo">
        <div class="painel" style="max-width:520px;">
          <div class="campo">
            <label for="input-nome-imovel">Nome do imóvel</label>
            <input type="text" id="input-nome-imovel">
            <div class="erro-campo" id="erro-nome-imovel"></div>
          </div>
          <div class="campo">
            <label for="input-endereco-imovel">Endereço</label>
            <input type="text" id="input-endereco-imovel">
            <div class="erro-campo" id="erro-endereco-imovel"></div>
          </div>
          <button class="btn btn-principal" id="btn-salvar-imovel">Salvar imóvel</button>
          <button class="btn btn-perigo hidden" id="btn-excluir-imovel" style="margin-left:8px;">Excluir imóvel</button>
        </div>
      </div>

      <!-- Aba: equipamentos -->
      <div id="aba-equipamentos" class="aba-imovel-conteudo hidden">
        <div class="painel" style="margin-bottom:18px;">
          <h3 style="margin-bottom:14px;">Novo equipamento</h3>
          <div class="linha-campos">
            <div class="campo">
              <label for="equip-nome">Nome</label>
              <input type="text" id="equip-nome" list="lista-equip-referencia" autocomplete="off">
              <datalist id="lista-equip-referencia"></datalist>
              <div class="ajuda">Selecione um item conhecido para sugerir a potência.</div>
            </div>
            <div class="campo">
              <label for="equip-categoria">Categoria</label>
              <select id="equip-categoria"></select>
            </div>
            <div class="campo">
              <label for="equip-potencia">Potência (W)</label>
              <input type="number" id="equip-potencia" min="0" step="1">
            </div>
          </div>
          <div class="linha-campos">
            <div class="campo">
              <label for="equip-quantidade">Quantidade</label>
              <input type="number" id="equip-quantidade" min="1" step="1" value="1">
            </div>
            <div class="campo">
              <label for="equip-horas-semana">Horas de uso/dia (seg. a sex.)</label>
              <input type="number" id="equip-horas-semana" min="0" max="24" step="0.5" value="0">
            </div>
            <div class="campo">
              <label for="equip-horas-fds">Horas de uso/dia (sáb. e dom.)</label>
              <input type="number" id="equip-horas-fds" min="0" max="24" step="0.5" value="0">
            </div>
          </div>
          <div class="check-linha">
            <input type="checkbox" id="equip-mesmo-fds" checked>
            <label for="equip-mesmo-fds" style="margin:0;color:var(--text-muted);">Usar as mesmas horas no fim de semana</label>
          </div>
          <div class="erro-campo" id="erro-equipamento" style="margin-bottom:10px;"></div>
          <button class="btn btn-principal" id="btn-add-equipamento">Adicionar equipamento</button>
        </div>

        <div class="painel">
          <h3 style="margin-bottom:14px;">Equipamentos cadastrados</h3>
          <div class="tabela-scroll">
            <table id="tabela-equipamentos">
              <thead><tr>
                <th>Nome</th><th>Categoria</th><th class="num">Potência (W)</th><th class="num">Qtd.</th>
                <th class="num">h/dia semana</th><th class="num">h/dia fds</th><th class="num">Consumo (kWh/mês)</th><th></th>
              </tr></thead>
              <tbody id="corpo-tabela-equipamentos"></tbody>
            </table>
          </div>
          <div id="vazio-equipamentos" class="vazio hidden" style="margin-top:14px;">
            <strong>Nenhum equipamento cadastrado</strong>
            Adicione o primeiro equipamento acima para começar a estimar o consumo.
          </div>
        </div>
      </div>

      <!-- Aba: relatório -->
      <div id="aba-relatorio" class="aba-imovel-conteudo hidden">
        <div class="grade-relatorio">
          <div class="readout">
            <div class="rotulo" id="relatorio-nome-endereco">&mdash;</div>
            <div class="valor" id="relatorio-consumo-total">0.0<span>kWh/mês</span></div>
            <span class="status-limite hidden" id="relatorio-status-limite"></span>
            <ul class="lista-sugestoes hidden" id="relatorio-sugestoes"></ul>
          </div>
          <div class="painel">
            <div class="linha-campos">
              <div class="campo">
                <label for="input-tarifa">Tarifa (R$/kWh)</label>
                <input type="number" id="input-tarifa" min="0" step="0.01">
                <div class="erro-campo" id="erro-tarifa"></div>
              </div>
              <div class="campo">
                <label for="input-limite">Limite de consumo mensal (kWh)</label>
                <input type="number" id="input-limite" min="0" step="1">
              </div>
            </div>
            <div class="ajuda" style="margin-bottom:10px;">Custo estimado do mês:</div>
            <div class="valor" style="font-size:30px;color:var(--text-primary);" id="relatorio-custo">R$ 0,00</div>
            <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn" id="btn-exportar-csv">Exportar CSV</button>
              <button class="btn" id="btn-exportar-pdf">Exportar PDF</button>
            </div>
          </div>
        </div>
        <div class="tabela-scroll" style="margin-bottom:20px;">
          <table id="tabela-relatorio">
            <thead><tr><th>Equipamento</th><th>Categoria</th><th class="num">Consumo (kWh/mês)</th></tr></thead>
            <tbody id="corpo-tabela-relatorio"></tbody>
          </table>
        </div>
        <div class="grafico-caixa">
          <canvas id="grafico-pizza"></canvas>
        </div>
      </div>

      <!-- Aba: importar -->
      <div id="aba-importar" class="aba-imovel-conteudo hidden">
        <div class="painel">
          <h3>Importar equipamentos via planilha</h3>
          <p class="ajuda">Formatos aceitos: CSV ou XLSX, com colunas <strong>nome</strong>, <strong>categoria</strong> e <strong>potencia</strong>. Equipamentos importados entram com quantidade 1 e horas de uso zeradas — ajuste-os na aba Equipamentos.</p>
          <div class="zona-upload">
            <input type="file" id="input-arquivo-planilha" accept=".csv,.xlsx,.xls">
          </div>
          <div id="resultado-importacao" style="margin-top:16px;"></div>
          <button class="btn btn-principal hidden" id="btn-confirmar-importacao" style="margin-top:12px;">Confirmar importação</button>
        </div>
      </div>
    </div>

    <!-- ---------- CATEGORIAS ---------- -->
    <div id="vista-categorias" class="vista hidden">
      <div class="cabecalho-vista">
        <div><h2>Categorias de equipamentos</h2><p>Organize os equipamentos por categoria.</p></div>
      </div>
      <div class="painel" style="max-width:460px;margin-bottom:20px;">
        <div class="linha-campos" style="align-items:flex-end;">
          <div class="campo" style="margin-bottom:0;flex:1;">
            <label for="input-nova-categoria">Nova categoria</label>
            <input type="text" id="input-nova-categoria">
          </div>
          <button class="btn btn-principal" id="btn-add-categoria" style="height:38px;">Adicionar</button>
        </div>
        <div class="erro-campo" id="erro-categoria"></div>
      </div>
      <div class="painel" style="max-width:600px;">
        <table>
          <thead><tr><th>Categoria</th><th></th></tr></thead>
          <tbody id="corpo-tabela-categorias"></tbody>
        </table>
      </div>
    </div>

    <!-- ---------- COMPARAR CENÁRIOS ---------- -->
    <div id="vista-comparar" class="vista hidden">
      <div class="cabecalho-vista">
        <div><h2>Comparar cenários</h2><p>Compare o consumo entre dois imóveis salvos.</p></div>
      </div>
      <div id="comparar-vazio" class="vazio hidden">
        <strong>É necessário ao menos 2 imóveis salvos</strong>
        Cadastre outro imóvel para habilitar a comparação.
      </div>
      <div id="comparar-conteudo">
        <div class="grade-comparar">
          <div class="campo">
            <label for="select-cenario-a">Cenário A</label>
            <select id="select-cenario-a"></select>
          </div>
          <div class="campo">
            <label for="select-cenario-b">Cenário B</label>
            <select id="select-cenario-b"></select>
          </div>
        </div>
        <button class="btn btn-principal" id="btn-comparar">Comparar</button>
        <div id="resultado-comparacao" style="margin-top:20px;"></div>
      </div>
    </div>

    <!-- ---------- TESTES ---------- -->
    <div id="vista-testes" class="vista hidden">
      <div class="cabecalho-vista">
        <div><h2>Testes automatizados</h2><p>Validações unitárias das regras de cálculo e cadastro.</p></div>
      </div>
      <button class="btn btn-principal" id="btn-rodar-testes" style="margin-bottom:18px;">Executar testes</button>
      <div class="painel">
        <div id="resumo-testes" class="resumo-testes"></div>
        <div id="lista-testes"></div>
      </div>
    </div>

  </div>
</section>
<script src="script.js"></script>
</body>
</html>
