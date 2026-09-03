package com.felipe.streaming.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PosterService {
    private static final Logger log = LoggerFactory.getLogger(PosterService.class);

    private final RestClient restClient = RestClient.create();
    private final String tmdbApiKey;

    public PosterService(@Value("${tmdb.api-key:}") String tmdbApiKey) {
        this.tmdbApiKey = tmdbApiKey;
    }

    private static final Pattern YEAR_PATTERN = Pattern.compile("\\b(19|20)\\d{2}\\b");
    private static final Pattern HANDLE_TAG_PATTERN = Pattern.compile("@\\S+");

    public Optional<String> fetchMoviePoster(String rawTitle) {
        if (tmdbApiKey.isBlank()) {
            log.warn("tmdb.api-key nao configurada (crie application-local.properties) - busca de capa de filme ignorada");
            return Optional.empty();
        }

        try {
            String year = null;
            Matcher yearMatcher = YEAR_PATTERN.matcher(rawTitle);
            if (yearMatcher.find()) {
                year = yearMatcher.group();
            }

            String cleanedTitle = HANDLE_TAG_PATTERN.matcher(rawTitle).replaceAll("").trim();
            if (year != null) {
                cleanedTitle = cleanedTitle.replace(year, "").trim();
            }

            UriComponentsBuilder uriBuilder = UriComponentsBuilder
                    .fromUriString("https://api.themoviedb.org/3/search/movie")
                    .queryParam("api_key", tmdbApiKey)
                    .queryParam("query", cleanedTitle);

            if (year != null) {
                uriBuilder.queryParam("primary_release_year", year);
            }

            TmdbSearchResponse response = restClient.get()
                    .uri(uriBuilder.build().toUri())
                    .retrieve()
                    .body(TmdbSearchResponse.class);

            if (response == null || response.results() == null || response.results().isEmpty()) {
                return Optional.empty();
            }

            String posterPath = response.results().get(0).posterPath();
            if (posterPath == null) {
                return Optional.empty();
            }

            return Optional.of("https://image.tmdb.org/t/p/w500" + posterPath);
        } catch (Exception e) {
            log.warn("Falha ao buscar capa no TMDB para '{}'", rawTitle, e);
            return Optional.empty();
        }
    }

    public Optional<String> fetchAnimePoster(String title) {
        Optional<String> fromAniList = fetchFromAniList(title);
        if (fromAniList.isPresent()) {
            return fromAniList;
        }

        return fetchFromKitsu(title);
    }

    private Optional<String> fetchFromAniList(String title) {
        try {
            String query = """
                    query ($search: String) {
                      Media(search: $search, type: ANIME) {
                        coverImage {
                          large
                        }
                      }
                    }
                    """;

            AniListRequest requestBody = new AniListRequest(query, Map.of("search", title));

            AniListResponse response = restClient.post()
                    .uri("https://graphql.anilist.co")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(AniListResponse.class);

            if (response == null || response.data() == null || response.data().media() == null) {
                return Optional.empty();
            }

            return Optional.ofNullable(response.data().media().coverImage().large());
        } catch (Exception e) {
            log.warn("Falha ao buscar capa no AniList para '{}'", title, e);
            return Optional.empty();
        }
    }

    private Optional<String> fetchFromKitsu(String title) {
        try {
            KitsuResponse response = restClient.get()
                    .uri("https://kitsu.io/api/edge/anime?filter[text]={query}&page[limit]=1", title)
                    .retrieve()
                    .body(KitsuResponse.class);

            if (response == null || response.data() == null || response.data().isEmpty()) {
                return Optional.empty();
            }

            return Optional.ofNullable(response.data().get(0).attributes().posterImage().large());
        } catch (Exception e) {
            log.warn("Falha ao buscar capa no Kitsu para '{}'", title, e);
            return Optional.empty();
        }
    }

    private record TmdbSearchResponse(List<TmdbMovie> results) {
    }

    private record TmdbMovie(@JsonProperty("poster_path") String posterPath) {
    }

    private record AniListRequest(String query, Map<String, String> variables) {
    }

    private record AniListResponse(AniListData data) {
    }

    private record AniListData(@JsonProperty("Media") AniListMedia media) {
    }

    private record AniListMedia(CoverImage coverImage) {
    }

    private record CoverImage(String large) {
    }

    private record KitsuResponse(List<KitsuAnime> data) {
    }

    private record KitsuAnime(KitsuAttributes attributes) {
    }

    private record KitsuAttributes(@JsonProperty("posterImage") KitsuPosterImage posterImage) {
    }

    private record KitsuPosterImage(String large) {
    }
}
