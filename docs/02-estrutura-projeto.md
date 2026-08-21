# Estrutura do projeto

```
streaming/
├── pom.xml                     # Config do Maven: dependências e build
├── README.md
├── .gitignore
├── docs/                       # Esta documentação
├── src/
│   ├── main/
│   │   ├── java/com/felipe/streaming/
│   │   │   ├── config/         # Classes de configuração do Spring (@Configuration)
│   │   │   ├── controller/     # Recebem requisições HTTP e devolvem respostas
│   │   │   ├── service/        # Regras de negócio (ex: escanear a biblioteca de vídeos)
│   │   │   ├── repository/     # Acesso a dados (quando tivermos banco de dados)
│   │   │   ├── model/          # Entidades/objetos de domínio (ex: classe Filme)
│   │   │   └── dto/            # Objetos de transferência entre camadas/HTTP
│   │   └── resources/
│   │       ├── application.properties   # Configurações da aplicação
│   │       ├── static/         # CSS, JS, imagens servidos diretamente
│   │       └── templates/      # Páginas HTML (Thymeleaf)
│   └── test/
│       └── java/com/felipe/streaming/   # Testes automatizados
```

## Por que essa organização em camadas?

É o padrão mais comum em projetos Spring (arquitetura em camadas / MVC):

- **`controller`** fala com o mundo externo (HTTP). Não deveria ter lógica de
  negócio complexa — só recebe a requisição, chama um `service` e devolve a
  resposta.
- **`service`** tem as regras: "como escaneamos uma pasta em busca de
  vídeos", "como decidimos que um arquivo é um filme válido", etc.
- **`repository`** conversa com a fonte de dados (banco de dados, quando
  existir).
- **`model`** representa os conceitos do domínio (ex.: `Filme`, `Serie`,
  `Episodio`).
- **`dto`** (Data Transfer Object) são objetos "de transporte", geralmente
  usados para não expor o `model` interno diretamente na API.

Você não precisa preencher todas as pastas desde o início — algumas vão
ficar vazias por um bom tempo, e tudo bem. Elas existem para você não
precisar parar no meio do aprendizado para "criar mais uma pasta".

## Pastas vazias e o arquivo `.gitkeep`

O Git não versiona pastas vazias, só arquivos. Por isso cada pasta vazia
tem um arquivinho `.gitkeep` dentro — sem conteúdo, só para a pasta existir
no repositório. Quando você criar a primeira classe de verdade ali dentro,
pode apagar o `.gitkeep` correspondente.
