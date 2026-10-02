-- =========================================================================
-- Dimensionamento Energético Residencial — Schema do banco de dados
-- CP1 (imóveis, equipamentos, consumo) + CP2 (dimensionamento fotovoltaico)
-- Motor: MySQL 8 / MariaDB 10.4+ (padrão do Laragon)
--
-- ESTE ARQUIVO PODE SER EXECUTADO QUANTAS VEZES QUISER (idempotente):
--   * banco novo ............ cria tudo do zero (CP1 + CP2);
--   * banco da CP1 já existente: só acrescenta o que falta da CP2, sem apagar
--     nenhum usuário, imóvel, equipamento ou categoria.
--
-- COMO EXECUTAR NO HEIDISQL (rodando via Laragon):
--   1. Abra o Laragon e clique em "Start All" para subir o MySQL/MariaDB.
--   2. Abra o HeidiSQL (Host: 127.0.0.1  Usuário: root  Senha: em branco  Porta: 3306).
--   3. Conecte, abra uma aba de "Consulta" (Query), cole este arquivo
--      inteiro (ou Arquivo > Carregar dados SQL...) e rode tudo com F9.
--   4. O banco "dimensionamento_energetico" terá 10 tabelas, 2 views e
--      1 stored procedure.
--
-- Observação: os CHECK CONSTRAINTS exigem MySQL >= 8.0.16 ou MariaDB >= 10.2.1.
-- Para conferir a versão: SELECT VERSION();
-- Em versão mais antiga o CHECK é aceito mas ignorado; as mesmas validações
-- existem também no PHP (nunca confiar só no banco nem só no navegador).
--
-- O QUE A CP2 ACRESCENTA
--   imoveis (4 colunas novas) : cidade, uf, hsp_manual, consumo_manual_kwh
--   fv_modulos, fv_inversores, fv_baterias : catálogos de equipamentos
--   hsp_cidades               : Horas de Sol Pleno por capital
--   propostas_fv              : propostas salvas (US32, "Could")
-- Os catálogos nascem VAZIOS: o conteúdo vem dos arquivos dados/*.csv
-- (que o PHP valida linha a linha antes de aceitar).
-- =========================================================================

CREATE DATABASE IF NOT EXISTS dimensionamento_energetico
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE dimensionamento_energetico;

-- =========================================================================
-- PARTE 1 — CP1 (sem alterações de estrutura; só "IF NOT EXISTS")
-- =========================================================================

-- 1. usuarios — US07 (conta com autenticação) / US16 (recuperar senha)
CREATE TABLE IF NOT EXISTS usuarios (
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

-- 2. categorias — US13 (gerenciar categorias de equipamentos)
CREATE TABLE IF NOT EXISTS categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nome        VARCHAR(100) NOT NULL,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categorias_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT uk_categoria_por_usuario UNIQUE (usuario_id, nome)
    -- a colação utf8mb4_unicode_ci é "case-insensitive": "Cozinha" e
    -- "cozinha" colidem aqui (critério de aceite da US13).
) ENGINE=InnoDB;

-- 3. equipamentos_referencia — US12 (base de potências sugeridas)
CREATE TABLE IF NOT EXISTS equipamentos_referencia (
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

-- 4. imoveis — US01 (cadastro de imóvel) / US06 (salvar projetos)
CREATE TABLE IF NOT EXISTS imoveis (
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
  CONSTRAINT ck_imoveis_limite  CHECK (limite_consumo_kwh IS NULL OR limite_consumo_kwh > 0),
  INDEX idx_imoveis_usuario (usuario_id)
) ENGINE=InnoDB;

-- 5. equipamentos — US02/US03 (cadastro e uso) / US17 (perfis semana x fds)
CREATE TABLE IF NOT EXISTS equipamentos (
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
    -- RESTRICT implementa a regra da US13: impedir exclusão de categoria em uso.
  CONSTRAINT ck_equip_potencia     CHECK (potencia_w > 0),
  CONSTRAINT ck_equip_quantidade   CHECK (quantidade > 0),
  CONSTRAINT ck_equip_horas_semana CHECK (horas_uso_semana BETWEEN 0 AND 24),
  CONSTRAINT ck_equip_horas_fds    CHECK (horas_uso_fim_semana BETWEEN 0 AND 24),
  INDEX idx_equipamentos_imovel (imovel_id),
  INDEX idx_equipamentos_categoria (categoria_id)
) ENGINE=InnoDB;

-- VIEWS — cálculo automático de consumo e custo (US04, US05, US08, US14)
-- Fórmula: (P × Q × (H_semana × 30×5/7 + H_fds × 30×2/7)) / 1000
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

-- STORED PROCEDURE — categorias padrão para um novo usuário
DROP PROCEDURE IF EXISTS sp_criar_categorias_padrao;
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

-- SEED — catálogo global de potências de referência (US12).
-- Só insere se o catálogo estiver vazio (não duplica ao rodar de novo).
DROP PROCEDURE IF EXISTS sp_seed_equipamentos_referencia;
DELIMITER $$
CREATE PROCEDURE sp_seed_equipamentos_referencia()
BEGIN
  IF (SELECT COUNT(*) FROM equipamentos_referencia WHERE usuario_id IS NULL) = 0 THEN
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
  END IF;
END$$
DELIMITER ;
CALL sp_seed_equipamentos_referencia();
DROP PROCEDURE sp_seed_equipamentos_referencia;

-- =========================================================================
-- PARTE 2 — CP2: dimensionamento fotovoltaico
-- =========================================================================

-- Auxiliar: adiciona uma coluna só se ela ainda não existir
-- (MySQL não tem "ADD COLUMN IF NOT EXISTS"; assim funciona em MySQL e MariaDB).
DROP PROCEDURE IF EXISTS sp_migracao_add_coluna;
DELIMITER $$
CREATE PROCEDURE sp_migracao_add_coluna(
  IN p_tabela VARCHAR(64), IN p_coluna VARCHAR(64), IN p_definicao VARCHAR(500))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabela AND COLUMN_NAME = p_coluna
  ) THEN
    SET @sql_migracao = CONCAT('ALTER TABLE `', p_tabela, '` ADD COLUMN `', p_coluna, '` ', p_definicao);
    PREPARE stmt_migracao FROM @sql_migracao;
    EXECUTE stmt_migracao;
    DEALLOCATE PREPARE stmt_migracao;
  END IF;
END$$
DELIMITER ;

-- 6. imoveis — dados de localização e consumo para o dimensionamento (US18/US19)
CALL sp_migracao_add_coluna('imoveis', 'cidade',
  'VARCHAR(100) NULL COMMENT ''cidade do imovel, usada para buscar o HSP (US18)''');
CALL sp_migracao_add_coluna('imoveis', 'uf',
  'CHAR(2) NULL COMMENT ''sigla do estado, ex.: SP''');
CALL sp_migracao_add_coluna('imoveis', 'hsp_manual',
  'DECIMAL(5,3) NULL COMMENT ''HSP informado pelo usuario (kWh/m2.dia); vale mais que cidade/UF'' CHECK (hsp_manual IS NULL OR hsp_manual BETWEEN 1 AND 9)');
CALL sp_migracao_add_coluna('imoveis', 'consumo_manual_kwh',
  'DECIMAL(10,2) NULL COMMENT ''consumo mensal informado pelo usuario (kWh/mes); vale mais que o estimado (US19)'' CHECK (consumo_manual_kwh IS NULL OR consumo_manual_kwh > 0)');

DROP PROCEDURE sp_migracao_add_coluna;

-- 7. hsp_cidades — Horas de Sol Pleno por capital (US18). Fonte: dados/hsp_cidades.csv
CREATE TABLE IF NOT EXISTS hsp_cidades (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cidade          VARCHAR(100)  NOT NULL,
  uf              CHAR(2)       NOT NULL,
  latitude        DECIMAL(9,6)  NOT NULL,
  longitude       DECIMAL(9,6)  NOT NULL,
  hsp_kwh_m2_dia  DECIMAL(6,3)  NOT NULL,
  tipo            VARCHAR(60)   NULL,
  fonte           VARCHAR(255)  NOT NULL,
  url_fonte       VARCHAR(500)  NOT NULL,
  data_dado       VARCHAR(60)   NULL,
  data_consulta   DATE          NULL,
  observacoes     TEXT          NULL,
  CONSTRAINT uk_hsp_cidade_uf UNIQUE (cidade, uf),
  CONSTRAINT ck_hsp_faixa CHECK (hsp_kwh_m2_dia BETWEEN 1 AND 9),
  INDEX idx_hsp_uf (uf)
) ENGINE=InnoDB;

-- 8. fv_modulos — módulos fotovoltaicos (US21). Fonte: dados/modulos.csv
CREATE TABLE IF NOT EXISTS fv_modulos (
  id                  VARCHAR(30)   NOT NULL PRIMARY KEY,
  fabricante          VARCHAR(100)  NOT NULL,
  modelo              VARCHAR(150)  NOT NULL,
  potencia_wp         DECIMAL(8,2)  NOT NULL,
  voc_v               DECIMAL(7,3)  NOT NULL,
  isc_a               DECIMAL(7,3)  NOT NULL,
  vmp_v               DECIMAL(7,3)  NOT NULL,
  imp_a               DECIMAL(7,3)  NOT NULL,
  eficiencia_pct      DECIMAL(5,2)  NOT NULL,
  preco_brl           DECIMAL(12,2) NOT NULL,
  fornecedor          VARCHAR(150)  NOT NULL,
  data_coleta         DATE          NOT NULL,
  url_fonte           VARCHAR(500)  NOT NULL,
  coef_voc_pct_c      DECIMAL(6,3)  NOT NULL COMMENT '%/°C — usado para a Voc a frio',
  coef_pmax_pct_c     DECIMAL(6,3)  NOT NULL,
  comprimento_mm      INT UNSIGNED  NULL,
  largura_mm          INT UNSIGNED  NULL,
  espessura_mm        INT UNSIGNED  NULL,
  peso_kg             DECIMAL(6,2)  NULL,
  url_preco           VARCHAR(500)  NULL,
  url_especificacoes  VARCHAR(500)  NULL,
  observacoes         TEXT          NULL,
  atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_fvmod_potencia   CHECK (potencia_wp > 0),
  CONSTRAINT ck_fvmod_preco      CHECK (preco_brl > 0),
  CONSTRAINT ck_fvmod_eficiencia CHECK (eficiencia_pct > 0 AND eficiencia_pct <= 100),
  CONSTRAINT ck_fvmod_eletrico   CHECK (voc_v > 0 AND isc_a > 0 AND vmp_v > 0 AND imp_a > 0),
  CONSTRAINT ck_fvmod_real       CHECK (fornecedor <> 'SINTETICO-TESTE')
) ENGINE=InnoDB;

-- 9. fv_inversores — inversores (US23). Fonte: dados/inversores.csv
CREATE TABLE IF NOT EXISTS fv_inversores (
  id                       VARCHAR(30)   NOT NULL PRIMARY KEY,
  fabricante               VARCHAR(100)  NOT NULL,
  modelo                   VARCHAR(150)  NOT NULL,
  tipo                     ENUM('on-grid','hibrido') NOT NULL,
  potencia_nominal_w       INT UNSIGNED  NOT NULL,
  potencia_max_fv_w        INT UNSIGNED  NOT NULL,
  tensao_max_entrada_v     DECIMAL(7,2)  NOT NULL,
  faixa_mppt_min_v         DECIMAL(7,2)  NOT NULL,
  faixa_mppt_max_v         DECIMAL(7,2)  NOT NULL,
  corrente_max_entrada_a   DECIMAL(7,2)  NOT NULL,
  numero_mppt              TINYINT UNSIGNED NOT NULL,
  compativel_bateria       ENUM('sim','nao') NOT NULL,
  preco_brl                DECIMAL(12,2) NOT NULL,
  fornecedor               VARCHAR(150)  NOT NULL,
  data_coleta              DATE          NOT NULL,
  url_fonte                VARCHAR(500)  NOT NULL,
  strings_por_mppt         TINYINT UNSIGNED NOT NULL,
  corrente_curto_mppt_a    DECIMAL(7,2)  NULL,
  fases                    TINYINT UNSIGNED NULL,
  tensao_bat_min_v         DECIMAL(7,2)  NULL,
  tensao_bat_max_v         DECIMAL(7,2)  NULL,
  corrente_carga_max_a     DECIMAL(7,2)  NULL,
  corrente_descarga_max_a  DECIMAL(7,2)  NULL,
  url_preco                VARCHAR(500)  NULL,
  url_especificacoes       VARCHAR(500)  NULL,
  observacoes              TEXT          NULL,
  atualizado_em            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_fvinv_potencias CHECK (potencia_nominal_w > 0 AND potencia_max_fv_w > 0),
  CONSTRAINT ck_fvinv_preco     CHECK (preco_brl > 0),
  CONSTRAINT ck_fvinv_mppt      CHECK (faixa_mppt_min_v < faixa_mppt_max_v AND numero_mppt >= 1 AND strings_por_mppt >= 1),
  CONSTRAINT ck_fvinv_bateria   CHECK (
       (tipo = 'on-grid' AND compativel_bateria = 'nao')
    OR (tipo = 'hibrido' AND compativel_bateria = 'sim'
        AND tensao_bat_min_v IS NOT NULL AND tensao_bat_max_v IS NOT NULL
        AND tensao_bat_min_v < tensao_bat_max_v
        AND corrente_carga_max_a IS NOT NULL AND corrente_descarga_max_a IS NOT NULL)),
  CONSTRAINT ck_fvinv_real      CHECK (fornecedor <> 'SINTETICO-TESTE'),
  INDEX idx_fvinv_tipo (tipo)
) ENGINE=InnoDB;

-- 10. fv_baterias — baterias (US26). Fonte: dados/baterias.csv
CREATE TABLE IF NOT EXISTS fv_baterias (
  id                       VARCHAR(30)   NOT NULL PRIMARY KEY,
  fabricante               VARCHAR(100)  NOT NULL,
  modelo                   VARCHAR(150)  NOT NULL,
  tecnologia               VARCHAR(50)   NOT NULL,
  tensao_nominal_v         DECIMAL(7,2)  NOT NULL,
  capacidade_ah            DECIMAL(8,2)  NOT NULL,
  capacidade_kwh           DECIMAL(7,3)  NOT NULL,
  dod_pct                  DECIMAL(5,2)  NOT NULL,
  ciclos                   INT UNSIGNED  NOT NULL,
  preco_brl                DECIMAL(12,2) NOT NULL,
  fornecedor               VARCHAR(150)  NOT NULL,
  data_coleta              DATE          NOT NULL,
  url_fonte                VARCHAR(500)  NOT NULL,
  corrente_carga_max_a     DECIMAL(7,2)  NOT NULL,
  corrente_descarga_max_a  DECIMAL(7,2)  NOT NULL,
  eficiencia_pct           DECIMAL(5,2)  NOT NULL
    COMMENT 'eficiencia de ida e volta; quando o fabricante nao publica, e premissa do grupo',
  url_preco                VARCHAR(500)  NULL,
  url_especificacoes       VARCHAR(500)  NULL,
  observacoes              TEXT          NULL,
  atualizado_em            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_fvbat_capacidade CHECK (capacidade_kwh > 0 AND capacidade_ah > 0 AND tensao_nominal_v > 0),
  CONSTRAINT ck_fvbat_dod        CHECK (dod_pct > 0 AND dod_pct <= 100),
  CONSTRAINT ck_fvbat_eficiencia CHECK (eficiencia_pct > 0 AND eficiencia_pct <= 100),
  CONSTRAINT ck_fvbat_correntes  CHECK (corrente_carga_max_a > 0 AND corrente_descarga_max_a > 0),
  CONSTRAINT ck_fvbat_preco      CHECK (preco_brl > 0),
  CONSTRAINT ck_fvbat_real       CHECK (fornecedor <> 'SINTETICO-TESTE')
) ENGINE=InnoDB;

-- 11. propostas_fv — propostas salvas (US32, "Could")
-- Guarda uma FOTO da proposta (entrada + resultado em JSON): se um preço do
-- catálogo mudar depois, a proposta antiga continua mostrando o valor da época.
-- Por isso NÃO há chave estrangeira para os catálogos.
CREATE TABLE IF NOT EXISTS propostas_fv (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id              INT UNSIGNED  NOT NULL,
  imovel_id               INT UNSIGNED  NOT NULL,
  titulo                  VARCHAR(150)  NOT NULL,
  consumo_kwh_mes         DECIMAL(10,2) NOT NULL,
  percentual_atendimento  DECIMAL(5,2)  NOT NULL,
  p_fv_kwp                DECIMAL(9,3)  NOT NULL,
  p_instalada_kwp         DECIMAL(9,3)  NOT NULL,
  n_modulos               INT UNSIGNED  NOT NULL,
  com_bateria             TINYINT(1)    NOT NULL DEFAULT 0,
  custo_equipamentos      DECIMAL(12,2) NOT NULL,
  custo_outros            DECIMAL(12,2) NOT NULL DEFAULT 0,
  custo_total             DECIMAL(12,2) NOT NULL,
  entrada_json            LONGTEXT      NOT NULL COMMENT 'dados enviados pelo usuario',
  resultado_json          LONGTEXT      NOT NULL COMMENT 'resultado completo recalculado pelo servidor',
  criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_propostas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_propostas_imovel
    FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE,
  CONSTRAINT ck_propostas_valores CHECK (consumo_kwh_mes > 0 AND percentual_atendimento > 0
    AND p_instalada_kwp > 0 AND n_modulos > 0 AND custo_total >= 0),
  INDEX idx_propostas_usuario_imovel (usuario_id, imovel_id, criado_em)
) ENGINE=InnoDB;

-- Exemplos de uso:
--   SELECT * FROM vw_consumo_imovel WHERE usuario_id = 1;
--   SELECT id, titulo, custo_total, criado_em FROM propostas_fv WHERE usuario_id = 1 ORDER BY criado_em DESC;

-- =========================================================================
-- fim do script
-- =========================================================================
