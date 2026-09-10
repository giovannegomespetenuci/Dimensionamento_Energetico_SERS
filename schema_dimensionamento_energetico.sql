-- =========================================================================
-- Dimensionamento Energético Residencial — Schema do banco de dados
-- Motor: MySQL 8 / MariaDB 10.4+ (padrão do Laragon)
--
-- COMO EXECUTAR NO HEIDISQL (rodando via Laragon):
--   1. Abra o Laragon e clique em "Start All" para subir o MySQL/MariaDB.
--   2. Abra o HeidiSQL. Se ainda não tiver uma sessão, crie uma nova:
--        Host: 127.0.0.1   Usuário: root   Senha: (em branco, padrão do Laragon)
--        Porta: 3306
--   3. Conecte, abra uma aba de "Consulta" (Query), cole este arquivo
--      inteiro (ou Arquivo > Carregar dados SQL...) e rode tudo com F9.
--   4. O banco "dimensionamento_energetico" vai aparecer na árvore à
--      esquerda, com 5 tabelas, 2 views e 1 stored procedure.
--
-- Observação: os CHECK CONSTRAINTS abaixo exigem MySQL >= 8.0.16 ou
-- MariaDB >= 10.2.1. Para conferir a versão instalada no Laragon, rode:
--     SELECT VERSION();
-- Se a versão for mais antiga, o CHECK é aceito na sintaxe mas ignorado
-- silenciosamente — nesse caso, mantenha as mesmas validações também no
-- backend (isso já é recomendado de qualquer forma: nunca confiar só na
-- validação do front-end nem só no banco).
-- =========================================================================

CREATE DATABASE IF NOT EXISTS dimensionamento_energetico
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE dimensionamento_energetico;

-- =========================================================================
-- 1. usuarios  — US07 (conta com autenticação) / US16 (recuperar senha)
-- =========================================================================
CREATE TABLE usuarios (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email               VARCHAR(255)  NOT NULL,
  senha_hash          VARCHAR(255)  NOT NULL
    COMMENT 'hash bcrypt/argon2 gerado no backend — nunca gravar senha em texto puro',
  reset_token         VARCHAR(10)   NULL
    COMMENT 'código temporário de redefinição de senha (US16)',
  reset_token_expira  DATETIME      NULL,
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_usuarios_email UNIQUE (email)
) ENGINE=InnoDB;

-- =========================================================================
-- 2. categorias — US13 (gerenciar categorias de equipamentos)
-- =========================================================================
CREATE TABLE categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(100) NOT NULL,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categorias_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT uk_categoria_por_usuario UNIQUE (usuario_id, nome)
    -- a colação utf8mb4_unicode_ci é "case-insensitive", então
    -- "Cozinha" e "cozinha" já colidem aqui: resolve o critério de
    -- aceite "impedir cadastro de categorias com nomes duplicados".
) ENGINE=InnoDB;

-- =========================================================================
-- 3. equipamentos_referencia — US12 (base de potências sugeridas)
-- =========================================================================
CREATE TABLE equipamentos_referencia (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NULL
    COMMENT 'NULL = item padrão do sistema, visível para todos os usuários',
  nome        VARCHAR(150)  NOT NULL,
  categoria   VARCHAR(100)  NOT NULL,
  potencia_w  DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_equip_ref_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT ck_equip_ref_potencia CHECK (potencia_w > 0)
) ENGINE=InnoDB;

-- =========================================================================
-- 4. imoveis — US01 (cadastro de imóvel) / US06 (salvar projetos)
-- =========================================================================
CREATE TABLE imoveis (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id          INT UNSIGNED  NOT NULL,
  nome                VARCHAR(150)  NOT NULL,
  endereco            VARCHAR(255)  NOT NULL,
  tarifa              DECIMAL(10,4) NULL COMMENT 'R$/kWh — US08',
  limite_consumo_kwh  DECIMAL(10,2) NULL COMMENT 'limite mensal para alerta — US10',
  criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_imoveis_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT ck_imoveis_tarifa  CHECK (tarifa IS NULL OR tarifa > 0),
  CONSTRAINT ck_imoveis_limite  CHECK (limite_consumo_kwh IS NULL OR limite_consumo_kwh > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_imoveis_usuario ON imoveis(usuario_id);

-- =========================================================================
-- 5. equipamentos — US02/US03 (cadastro e uso) / US17 (perfis semana x fds)
-- =========================================================================
CREATE TABLE equipamentos (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  imovel_id             INT UNSIGNED  NOT NULL,
  categoria_id          INT UNSIGNED  NOT NULL,
  nome                  VARCHAR(150)  NOT NULL,
  potencia_w            DECIMAL(10,2) NOT NULL,
  quantidade            INT UNSIGNED  NOT NULL,
  horas_uso_semana      DECIMAL(4,2)  NOT NULL DEFAULT 0,
  horas_uso_fim_semana  DECIMAL(4,2)  NOT NULL DEFAULT 0,
  criado_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipamentos_imovel
    FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE,
  CONSTRAINT fk_equipamentos_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT,
    -- ON DELETE RESTRICT implementa, no próprio banco, a regra da US13:
    -- "impedir exclusão de categoria vinculada a equipamentos cadastrados".
  CONSTRAINT ck_equip_potencia     CHECK (potencia_w > 0),
  CONSTRAINT ck_equip_quantidade   CHECK (quantidade > 0),
  CONSTRAINT ck_equip_horas_semana CHECK (horas_uso_semana BETWEEN 0 AND 24),
  CONSTRAINT ck_equip_horas_fds    CHECK (horas_uso_fim_semana BETWEEN 0 AND 24)
) ENGINE=InnoDB;

CREATE INDEX idx_equipamentos_imovel    ON equipamentos(imovel_id);
CREATE INDEX idx_equipamentos_categoria ON equipamentos(categoria_id);

-- =========================================================================
-- VIEWS — cálculo automático de consumo e custo (US04, US05, US08, US14)
-- =========================================================================

-- Consumo mensal por equipamento, já considerando os dois perfis de uso.
-- Fórmula: (P × Q × (H_semana × dias_semana + H_fds × dias_fds)) / 1000
-- dias_semana ≈ 30 × 5/7   |   dias_fds ≈ 30 × 2/7
CREATE OR REPLACE VIEW vw_consumo_equipamento AS
SELECT
  e.id                    AS equipamento_id,
  e.imovel_id,
  e.nome,
  c.nome                  AS categoria,
  e.potencia_w,
  e.quantidade,
  e.horas_uso_semana,
  e.horas_uso_fim_semana,
  ROUND(
    (e.potencia_w * e.quantidade *
      (e.horas_uso_semana * (30 * 5/7) + e.horas_uso_fim_semana * (30 * 2/7))
    ) / 1000
  , 2) AS consumo_mensal_kwh
FROM equipamentos e
JOIN categorias c ON c.id = e.categoria_id;

-- Consumo total e custo estimado por imóvel (soma de todos os equipamentos).
CREATE OR REPLACE VIEW vw_consumo_imovel AS
SELECT
  i.id AS imovel_id,
  i.usuario_id,
  i.nome,
  i.endereco,
  i.tarifa,
  i.limite_consumo_kwh,
  COALESCE(SUM(v.consumo_mensal_kwh), 0) AS consumo_total_kwh,
  ROUND(COALESCE(SUM(v.consumo_mensal_kwh), 0) * COALESCE(i.tarifa, 0), 2) AS custo_estimado_reais
FROM imoveis i
LEFT JOIN vw_consumo_equipamento v ON v.imovel_id = i.id
GROUP BY i.id, i.usuario_id, i.nome, i.endereco, i.tarifa, i.limite_consumo_kwh;

-- Exemplos de uso:
--   SELECT * FROM vw_consumo_imovel WHERE usuario_id = 1;
--   SELECT * FROM vw_consumo_equipamento WHERE imovel_id = 1 ORDER BY consumo_mensal_kwh DESC;
--   -- Comparar dois cenários (US15):
--   SELECT a.nome AS cenario_a, a.consumo_total_kwh AS kwh_a,
--          b.nome AS cenario_b, b.consumo_total_kwh AS kwh_b,
--          (b.consumo_total_kwh - a.consumo_total_kwh) AS diferenca_kwh
--   FROM vw_consumo_imovel a, vw_consumo_imovel b
--   WHERE a.imovel_id = 1 AND b.imovel_id = 2;
--   -- Agrupar consumo por categoria para o gráfico de pizza (US14):
--   SELECT categoria, SUM(consumo_mensal_kwh) AS total_kwh
--   FROM vw_consumo_equipamento WHERE imovel_id = 1 GROUP BY categoria;

-- =========================================================================
-- STORED PROCEDURE — categorias padrão para um novo usuário
-- Chame logo após inserir a linha em `usuarios` no backend (US13/US07).
-- =========================================================================
DELIMITER $$
CREATE PROCEDURE sp_criar_categorias_padrao(IN p_usuario_id INT UNSIGNED)
BEGIN
  INSERT INTO categorias (usuario_id, nome) VALUES
    (p_usuario_id, 'Cozinha'),
    (p_usuario_id, 'Banheiro'),
    (p_usuario_id, 'Climatização'),
    (p_usuario_id, 'Sala'),
    (p_usuario_id, 'Escritório'),
    (p_usuario_id, 'Iluminação'),
    (p_usuario_id, 'Lavanderia'),
    (p_usuario_id, 'Limpeza'),
    (p_usuario_id, 'Eletrônicos'),
    (p_usuario_id, 'Área externa');
END$$
DELIMITER ;

-- Exemplo de uso após criar um usuário:
--   INSERT INTO usuarios (email, senha_hash) VALUES ('ana@exemplo.com', '<hash>');
--   CALL sp_criar_categorias_padrao(LAST_INSERT_ID());

-- =========================================================================
-- SEED — catálogo global de potências de referência (US12)
-- =========================================================================
INSERT INTO equipamentos_referencia (usuario_id, nome, categoria, potencia_w) VALUES
(NULL, 'Geladeira', 'Cozinha', 150),
(NULL, 'Freezer', 'Cozinha', 200),
(NULL, 'Micro-ondas', 'Cozinha', 1200),
(NULL, 'Forno elétrico', 'Cozinha', 1500),
(NULL, 'Cafeteira', 'Cozinha', 800),
(NULL, 'Liquidificador', 'Cozinha', 400),
(NULL, 'Chuveiro elétrico', 'Banheiro', 5500),
(NULL, 'Secador de cabelo', 'Banheiro', 1200),
(NULL, 'Ar-condicionado (split 9000 BTUs)', 'Climatização', 900),
(NULL, 'Ventilador', 'Climatização', 100),
(NULL, 'Aquecedor elétrico', 'Climatização', 1500),
(NULL, 'TV LED 42 polegadas', 'Sala', 100),
(NULL, 'Home theater', 'Sala', 100),
(NULL, 'Videogame (console)', 'Sala', 150),
(NULL, 'Notebook', 'Escritório', 65),
(NULL, 'Computador desktop', 'Escritório', 200),
(NULL, 'Roteador Wi-Fi', 'Escritório', 10),
(NULL, 'Impressora', 'Escritório', 300),
(NULL, 'Lâmpada LED', 'Iluminação', 9),
(NULL, 'Lâmpada incandescente', 'Iluminação', 60),
(NULL, 'Máquina de lavar roupas', 'Lavanderia', 500),
(NULL, 'Secadora de roupas', 'Lavanderia', 2000),
(NULL, 'Ferro de passar', 'Lavanderia', 1200),
(NULL, 'Aspirador de pó', 'Limpeza', 1400),
(NULL, 'Carregador de celular', 'Eletrônicos', 5),
(NULL, 'Bomba d''água', 'Área externa', 750);

-- =========================================================================
-- fim do script
-- =========================================================================
