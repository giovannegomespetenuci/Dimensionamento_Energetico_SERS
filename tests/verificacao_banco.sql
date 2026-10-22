-- CP3 (US34/US38) — rodar no HeidiSQL depois do schema. Não altera dados.
SELECT VERSION() AS versao_mysql;

-- 1. propostas sem imóvel ou sem usuário (deve retornar 0 linhas)
SELECT p.id FROM propostas_fv p
  LEFT JOIN imoveis i ON i.id = p.imovel_id
  LEFT JOIN usuarios u ON u.id = p.usuario_id
 WHERE i.id IS NULL OR u.id IS NULL;

-- 2. chaves estrangeiras com ON DELETE CASCADE (deve listar imovel_id e usuario_id)
SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r USING (CONSTRAINT_SCHEMA, CONSTRAINT_NAME)
 WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'propostas_fv' AND k.REFERENCED_TABLE_NAME IS NOT NULL;
