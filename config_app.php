<?php
declare(strict_types=1);

/*
 * CP3 — configuração da aplicação, fora da lógica de negócio.
 * Cada valor pode ser sobrescrito por variável de ambiente (ex.: no Laragon ou no servidor),
 * assim a senha real do banco e do e-mail não precisam ficar no repositório.
 * Os valores padrão são os do Laragon local.
 */

function config_app(string $chave, $padrao = null)
{
    $valor = getenv('SERS_' . strtoupper($chave));
    return ($valor === false || $valor === '') ? $padrao : $valor;
}

return [
    'db_host'   => config_app('db_host', '127.0.0.1'),
    'db_user'   => config_app('db_user', 'root'),
    'db_senha'  => config_app('db_senha', ''),
    'db_nome'   => config_app('db_nome', 'dimensionamento_energetico'),

    // Recuperação de senha (US35). Com 'email_ativo' = '1' o código é enviado por e-mail
    // (função mail() do PHP, configurada no php.ini/sendmail do servidor).
    // Com '0' (padrão local) o código é devolvido na tela, só para demonstração.
    'email_ativo'     => config_app('email_ativo', '0') === '1',
    'email_remetente' => config_app('email_remetente', 'nao-responder@sers.local'),
    'reset_minutos'   => 15,

    // Limite de tentativas de login (US37).
    'login_max_tentativas' => 5,
    'login_bloqueio_seg'   => 300,
];
