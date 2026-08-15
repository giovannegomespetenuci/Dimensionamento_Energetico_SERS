# Cadastro do imóvel
print("=== Cadastro do Imóvel ===")

nome_imovel = input("Nome do imóvel: ")
endereco = input("Endereço: ")

# Base de equipamentos
equipamentos = []

quantidade_equip = int(input("\nQuantos equipamentos deseja cadastrar? "))

for i in range(quantidade_equip):
    print(f"\nEquipamento {i + 1}")

    nome = input("Nome: ")
    categoria = input("Categoria: ")

    while True:
        try:
            potencia = float(input("Potência (W): "))

            if potencia > 0:
                break

            print("A potência deve ser maior que zero.")

        except ValueError:
            print("Digite apenas um valor numérico.")

    equipamento = {
        "nome": nome,
        "categoria": categoria,
        "potencia": potencia
    }

    equipamentos.append(equipamento)


# Equipamentos da residência
print("\n=== Equipamentos da Residência ===")

consumo_total = 0

for equipamento in equipamentos:

    print(f"\nEquipamento: {equipamento['nome']}")

    quantidade = int(input("Quantidade: "))
    horas_dia = float(input("Horas de uso por dia: "))

    consumo = (
        equipamento["potencia"]
        * quantidade
        * horas_dia
        * 30
    ) / 1000

    print(f"Consumo mensal: {consumo:.2f} kWh")

    consumo_total += consumo


# Resultado
print("\n==========================")
print("RELATÓRIO DO IMÓVEL")
print("==========================")

print(f"Imóvel: {nome_imovel}")
print(f"Endereço: {endereco}")
print(f"Consumo total: {consumo_total:.2f} kWh/mês")
