# Roteiro de aprendizagem

Marcos sugeridos, do zero até uma plataforma funcional. Cada marco é
pequeno o suficiente para ser uma sessão de estudo/programação, e cada um
te entrega algo que roda e que dá para ver funcionando.

Não precisa seguir à risca — é um mapa, não uma prisão.

- [x] **Marco 1 — "Hello, servidor"**
  Criar a classe principal (`@SpringBootApplication`) e um primeiro
  endpoint (`GET /health` ou `GET /ola`) que devolve um texto simples.
  Objetivo: entender o que é uma aplicação Spring Boot, como ela sobe, e o
  que é um `@RestController`.

- [ ] **Marco 2 — Primeira página**
  Servir uma página HTML inicial via Thymeleaf (`GET /`), com um
  "esqueleto" visual simples. Objetivo: entender a diferença entre
  devolver JSON e devolver uma view renderizada no servidor.

- [x] **Marco 3 — Ler a pasta de vídeos**
  Um `service` que lê a pasta configurada em
  `streaming.media.library-path` e lista os arquivos de vídeo encontrados
  (usando `java.nio.file`). Objetivo: manipulação de arquivos em Java,
  leitura de configuração customizada (`@ConfigurationProperties` ou
  `@Value`).

- [ ] **Marco 4 — Expor a listagem**
  Um endpoint que devolve essa listagem como JSON, e depois uma versão da
  página inicial que mostra essa lista (nome dos arquivos, por enquanto).
  Objetivo: DTOs, serialização JSON, iteração em templates Thymeleaf.

- [ ] **Marco 5 — Assistir de verdade**
  Servir o conteúdo de um vídeo pelo navegador usando a tag `<video>`,
  implementando suporte a "range requests" (para permitir avançar/voltar
  no vídeo sem baixar o arquivo inteiro de novo). Objetivo: entender
  streaming HTTP na prática — este é o coração de uma "plataforma de
  streaming".

- [ ] **Marco 6 — Guardar metadados**
  Introduzir um banco de dados (começando pelo H2, que roda em arquivo/
  memória, sem precisar instalar nada) para guardar título, ano, capa,
  descrição de cada item. Objetivo: Spring Data JPA, entidades, migrações
  simples.

- [ ] **Marco 7 — Busca e filtros**
  Endpoint e página de busca por título/categoria.

- [ ] **Marco 8 — Organização visual**
  Capas, categorias, "continuar assistindo" — deixar com cara de
  plataforma de streaming de verdade.

- [ ] **Marco 9 (futuro) — Acesso remoto**
  Acesso pela rede local (celular, TV), autenticação básica, múltiplos
  perfis.

Cada marco concluído vale uma entrada no
[diário de decisões](04-notas-e-decisoes.md), mesmo que curta.
