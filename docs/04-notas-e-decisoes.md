# Notas e decisões

Diário de decisões do projeto — o "porquê" por trás das escolhas, para
não esquecermos depois. Entradas novas vão no topo.

---

## 2026-08-20 — Web (servidor local) em vez de app desktop

**Decisão:** Manter a arquitetura de servidor local + navegador, em vez de
um aplicativo desktop JavaFX.

**Contexto:** Surgiu a dúvida: "por ser um projeto que usa meus arquivos
locais, não seria melhor um software em vez de uma aplicação web?"

**Esclarecimento da premissa:** Uma aplicação Spring Boot rodando em
`localhost` **já é** um software local — um processo na própria máquina,
com acesso total ao disco via `java.nio.file`. A escolha não é
"local vs. nuvem"; é apenas onde a interface é desenhada (janela nativa
vs. navegador). Não há perda nenhuma de acesso a arquivos.

**Por quê web venceu:**
1. **Codecs.** O `MediaPlayer` do JavaFX 21 suporta apenas os containers
   MP4, MP3, WAV, AIFF e HLS — **não suporta MKV, AVI nem MOV**
   (verificado na documentação oficial do JavaFX 21). Uma biblioteca
   pessoal de mídia é majoritariamente MKV, então um app JavaFX não
   tocaria a maior parte dela. A saída seria VLCJ (bindings nativos do
   libVLC), um salto grande de complexidade para um projeto de
   aprendizado.
2. **O MKV é um problema para os dois lados**, mas a solução é natural no
   servidor: MKV geralmente contém H.264/AAC — os mesmos codecs que o
   navegador toca. Dá para fazer *remux* com FFmpeg (`-c copy`), quase
   instantâneo e sem perda, direto na resposta HTTP.
3. **É o que define uma "plataforma de streaming":** assistir na TV, no
   celular, no tablet. Um app desktop fica preso a uma máquina.
4. JavaFX não vem no JDK 21 (setup extra no Windows), e HTML/CSS é bem
   mais fácil de estilizar que CSS de JavaFX.

**Não é uma porta de mão única:** a estrutura em camadas mantém `service/`
e `model/` sem nenhum conhecimento de HTTP. Se um dia quisermos uma janela
nativa, essas camadas sobrevivem intactas — troca-se só `controller/` +
`templates/`. E para ter "cara de programa instalado", existe o `jpackage`,
que empacota tudo num `.exe` que sobe o servidor e abre o navegador
sozinho.

---

## 2026-08-20 — Estrutura inicial do projeto

**Decisão:** Spring Boot 4.1.0 + Maven + Java 21 (LTS) + Thymeleaf.

**Contexto:** Ponto de partida do projeto. Nenhuma linha de código Java foi
escrita ainda — só a estrutura de pastas, `pom.xml`, configuração e
documentação.

**Por quê:**
- Java 21 já estava instalado (via IntelliJ) e é LTS.
- Maven é mais didático que Gradle para quem está aprendendo os
  fundamentos de Java/build.
- Thymeleaf evita ter que aprender um framework de front-end junto com
  Spring — as páginas são renderizadas no servidor. Podemos migrar para
  uma API + front-end JS separado mais pra frente, se fizer sentido.
- Versões confirmadas direto em `start.spring.io` em vez de assumidas de
  memória, já que o conhecimento de treinamento tem um corte anterior à
  data atual.

**Próximo passo:** Marco 1 do roteiro — criar a classe principal e o
primeiro endpoint.
