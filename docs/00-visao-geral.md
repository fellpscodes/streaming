# Visão geral

## O que é

Uma plataforma de streaming pessoal: um servidor que roda no seu próprio
computador, organiza seus arquivos de vídeo locais (filmes, séries, etc.) e
permite assisti-los pelo navegador, com uma interface parecida com a de
serviços de streaming comerciais.

## Como vamos trabalhar

- **Você escreve o código.** Cada classe, cada método — a mão é sua, porque
  o objetivo aqui é aprender Java e Spring de verdade.
- **A IA revisa e corrige.** Eu aponto erros, sugiro melhorias, explico o
  "porquê" das coisas e ajudo a destravar quando você travar — mas não
  escrevo a implementação por você.
- **A organização (pastas, configs, dependências, documentação) é feita em
  conjunto**, para você poder focar a energia de aprendizado no código em
  si, não em configuração de ambiente.

## Stack escolhida e por quê

| Item | Escolha | Motivo |
|---|---|---|
| Linguagem | Java 21 (LTS) | Versão estável, já instalada, com anos de suporte pela frente |
| Framework | Spring Boot 4.1 | Padrão de mercado para apps Java web; muita documentação e comunidade |
| Build tool | Maven | Mais previsível e didático que o Gradle para quem está começando |
| Front-end inicial | Thymeleaf (server-side) | Evita aprender Java e um framework JS ao mesmo tempo; dá para evoluir depois |
| Banco de dados | A definir (Marco 6) | Começamos sem banco, para focar primeiro na lógica de arquivos |

Essas decisões podem mudar — o [diário de decisões](04-notas-e-decisoes.md)
registra quando e por quê.

## Um aviso importante sobre o OneDrive

Este projeto está dentro de `Documents\streaming`, que é sincronizado pelo
OneDrive. Duas recomendações:

1. **Nunca guarde os arquivos de vídeo reais dentro da pasta do projeto.**
   O OneDrive tentaria sincronizar gigabytes de vídeo para a nuvem. A
   aplicação vai *apontar* para uma pasta externa (configurável em
   `application.properties`), não guardar os vídeos dentro de si.
2. Se notar lentidão ao compilar (a pasta `target/` gerada pelo Maven pode
   ficar grande), considere excluir a pasta do projeto da sincronização do
   OneDrive (clique direito na pasta → "Liberar espaço" ou configurar
   exclusão nas configurações do OneDrive).
