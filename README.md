# Streaming

Streaming pessoal e self-hosted, no estilo Netflix/Crunchyroll, que cataloga e reproduz os **seus próprios arquivos** de filmes, séries e animes a partir de pastas locais. Um único usuário, sem login.

## O que faz

- **Scanner** recursivo das pastas-mãe: reconhece título, ano, temporada e episódio pelo nome do arquivo/pasta. O que não for reconhecido vai para uma tela de **correção manual**.
- **Metadados e capas** (sinopse, capa e backdrop em alta resolução, nota, gêneros, elenco) via **TMDB** (filmes/séries) e **AniList** (animes, com **Jikan** como fallback), em pt-BR com fallback em inglês. Tudo é **cacheado no SQLite**: as APIs não são consultadas de novo para o mesmo título.
- **Catálogo** por categoria (Filmes, Séries, Animes) com busca e filtro por gênero/ano, e página de detalhes com elenco e lista de episódios.
- **Player** com HTTP Range, **sem perda de qualidade**: MKV é remuxado para MP4 copiando o vídeo bit a bit (só recodifica o que o navegador não decodifica). Legendas **ASS/SSA renderizadas com libass (JASSUB)**, preservando estilo, posição e efeitos, além de `.srt`/`.vtt`. Troca de faixa de áudio, **progresso salvo** e **Continuar assistindo**.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, SQLite (`better-sqlite3` + Drizzle ORM), ffmpeg/ffprobe para o remux e a extração de legendas.

## Requisitos

- Node.js 22+ (desenvolvido no 26)
- `ffmpeg` e `ffprobe` no `PATH`
- Uma chave da API do TMDB (gratuita)

## Como rodar

```bash
npm install
cp .env.example .env.local   # preencha TMDB_API_KEY (ou TMDB_READ_TOKEN)
npm run dev                  # desenvolvimento em http://localhost:3000
# ou, para uso diário:
npm run build && npm start
```

Depois abra **Configurações**, cadastre a pasta-mãe (uma subpasta por título, ex.: `/midia/Breaking Bad/`) e rode o scan.

> O `better-sqlite3` compila um módulo nativo. Se o npm bloquear scripts de instalação, rode `npm install-scripts approve better-sqlite3` e `npm rebuild better-sqlite3`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `TMDB_API_KEY` | Chave da API do TMDB (v3). |
| `TMDB_READ_TOKEN` | Alternativa: token de leitura (Bearer). Tem prioridade se definido. |
| `DATABASE_PATH` | Caminho do SQLite (padrão `./data/streaming.db`). |
| `CACHE_DIR` | Cache de vídeos remuxados e legendas (padrão `./data/cache`). |
| `STREAM_CACHE_GB` | Limite do cache de vídeo em GB (padrão `30`). |

Chaves nunca ficam no código: `.env.local` é ignorado pelo git.

## Testes

```bash
npm test      # vitest: parser, scanner, metadados/cache, range, remux, legendas e progresso
```

Os testes de mídia geram arquivos reais com o ffmpeg, incluindo a verificação de que o vídeo remuxado é idêntico ao original.

## Notas

- O build de produção usa `next build --webpack`: o Turbopack de produção travou com o JASSUB.
- Bitmaps de legenda (PGS/DVD) não são suportados; só legendas de texto.
- Vídeos HDR recodificados não passam por tone mapping.
