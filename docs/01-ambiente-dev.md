# Ambiente de desenvolvimento

## JDKs disponíveis na sua máquina

O IntelliJ já tinha baixado várias versões de JDK. Este projeto foi
configurado para usar:

- **JDK 21 (Microsoft Build OpenJDK 21.0.12)** — `%USERPROFILE%\.jdks\ms-21.0.12`

Java 21 é uma versão LTS (suporte de longo prazo), é a que já estava
instalada e é totalmente compatível com o Spring Boot 4.1 usado no
`pom.xml`.

Outras versões que também estão instaladas na máquina, caso precise no
futuro: JDK 17 (`ms-17.0.19`) e JDK 25 (`openjdk-25.0.1`).

Também existe um `Program Files (x86)\Common Files\Oracle\Java\javapath`
com **Java 8** no PATH do sistema — é antigo e não deve ser usado para este
projeto. O projeto usa o JDK configurado pelo próprio IntelliJ
(`.idea/misc.xml`), então isso não deve causar conflito dentro da IDE.

## Maven

Não há Maven instalado globalmente no terminal ainda — mas **não é um
problema**: o IntelliJ já vem com Maven embutido e gerencia isso sozinho ao
abrir o projeto (ele detecta o `pom.xml` automaticamente).

Se um dia você quiser rodar `mvn` pelo terminal fora da IDE, será
necessário instalar o Maven (por exemplo via `winget install Apache.Maven`)
ou gerar o "Maven Wrapper" (`mvnw`/`mvnw.cmd`) pela própria IDE
(`botão direito no pom.xml → Add as Maven Project`, depois
`View → Tool Windows → Maven → gerar wrapper`). Isso é opcional e pode
ficar para depois.

## Abrindo o projeto

1. Abra o IntelliJ IDEA.
2. Abra a pasta `C:\Users\felip\OneDrive\Documents\streaming`.
3. O IntelliJ deve reconhecer o `pom.xml` e oferecer para importar como
   projeto Maven — aceite.
4. Aguarde o download das dependências (ícone de progresso no canto
   inferior direito).
5. Confirme em `File → Project Structure → Project` que o "SDK" está como
   `ms-21` (21.0.12) — já deixamos isso pré-configurado no
   `.idea/misc.xml`, mas vale conferir.

## Rodando a aplicação

Depois que a classe principal (`@SpringBootApplication`) existir (Marco 1
do [roteiro de aprendizagem](03-roteiro-aprendizagem.md)):

- **Pela IDE:** clique no ▶️ ao lado do método `main`.
- **Pelo terminal (se Maven estiver instalado):** `mvn spring-boot:run`

A aplicação sobe em `http://localhost:8080`.
