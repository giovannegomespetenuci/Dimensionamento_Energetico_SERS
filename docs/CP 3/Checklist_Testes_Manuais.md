# Checklist de testes manuais — CP3 (marque no Laragon)

1. Rodar `schema_dimensionamento_energetico.sql` (F9) em banco novo e de novo em banco da CP2.
2. Rodar `tests/run_tests.php` (`php tests/run_tests.php`) e anotar o resultado.
3. Rodar `tests/verificacao_banco.sql` e anotar a versão do MySQL (item 1 vazio, item 2 com CASCADE).
4. Entrar e sair duas vezes seguidas (confirma o token CSRF após o logout).
5. Errar a senha 5 vezes: deve bloquear por 5 minutos.
6. Esqueci a senha (modo demonstração): código aparece na tela; reutilizar o código deve falhar.
7. Cenários 1 e 2 de `fontes_e_premissas.md` pela aba Solar; conferir os números.
8. Salvar proposta, renomear, duplicar, filtrar, ordenar, comparar duas, excluir.
9. Exportar PDF e CSV e comparar com a tela (custo total, payback, gráfico, rodapé).
10. Desligar a internet e repetir 7–9: gráfico, PDF e importação devem funcionar (bibliotecas em `vendor/`).
11. Excluir um imóvel com propostas: as propostas devem sumir (rodar o item 1 do SQL).
