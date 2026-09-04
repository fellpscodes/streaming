package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.repository.MediaItemRepository;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.*;

@Service
public class MediaCatalogService {
    private final MediaItemRepository mediaItemRepository;
    private final PosterService posterService;
    private final PosterImageService posterImageService;

    public MediaCatalogService(MediaItemRepository mediaItemRepository, PosterService posterService, PosterImageService posterImageService) {
        this.mediaItemRepository = mediaItemRepository;
        this.posterService = posterService;
        this.posterImageService = posterImageService;
    }

    public List<MediaItem> listAll(){
        return mediaItemRepository.findAll();
    }

    public Optional<MediaItem> findById(String id){
        return mediaItemRepository.findById(id);
    }

    public void updateProgress(String id, double positionSeconds, double durationSeconds) {
        MediaItem item = mediaItemRepository.findById(id).orElseThrow();
        item.updateProgress(positionSeconds, durationSeconds);
        mediaItemRepository.save(item);
    }

    public void clearProgress(String id) {
        MediaItem item = mediaItemRepository.findById(id).orElseThrow();
        item.clearProgress();
        mediaItemRepository.save(item);
    }

    public void updateTitle(String id, String displayName) {
        MediaItem item = mediaItemRepository.findById(id).orElseThrow();
        item.setDisplayName(displayName);
        mediaItemRepository.save(item);
    }

    public List<MediaItem> listContinueWatching() {
        List<MediaItem> items = new ArrayList<>();
        for (MediaItem item : listAll()) {
            if (item.isInProgress()) {
                items.add(item);
            }
        }
        items.sort(Comparator.comparing(MediaItem::getLastWatchedAt).reversed());
        return items;
    }

    public Map<String, List<MediaItem>> listBySeries() {
        Map<String, List<MediaItem>> groups = new LinkedHashMap<>();
        for (MediaItem item : listAll()) {
            String seriesName = seriesNameOf(item);
            List<MediaItem> list = groups.get(seriesName);
            if (list == null) {
                list = new ArrayList<>();
                groups.put(seriesName, list);
            }
            list.add(item);
        }
        return groups;
    }

    public String seriesNameOf(MediaItem item) {
        return Path.of(item.getPath()).getParent().getFileName().toString();
    }

    public List<MediaItem> listEpisodesInSeries(String seriesName) {
        List<MediaItem> episodes = listBySeries().getOrDefault(seriesName, new ArrayList<>());
        episodes.sort(Comparator.comparing(MediaItem::getDisplayName));
        return episodes;
    }

    public boolean isSeries(MediaItem item) {
        return countAvailable(listBySeries().getOrDefault(seriesNameOf(item), List.of())) > 1;
    }

    public Map<String, List<MediaItem>> listMovies() {
        Map<String, List<MediaItem>> movies = new LinkedHashMap<>();
        for (Map.Entry<String, List<MediaItem>> group : listBySeries().entrySet()) {
            if (countAvailable(group.getValue()) <= 1) {
                movies.put(group.getKey(), group.getValue());
            }
        }
        return movies;
    }

    public Map<String, List<MediaItem>> listAnimes() {
        Map<String, List<MediaItem>> animes = new LinkedHashMap<>();
        for (Map.Entry<String, List<MediaItem>> group : listBySeries().entrySet()) {
            if (countAvailable(group.getValue()) > 1) {
                animes.put(group.getKey(), group.getValue());
            }
        }
        return animes;
    }

    private long countAvailable(List<MediaItem> items) {
        return items.stream().filter(MediaItem::isAvailable).count();
    }

    public Optional<MediaItem> findNextEpisode(MediaItem item) {
        List<MediaItem> episodes = listEpisodesInSeries(seriesNameOf(item));
        int index = -1;
        for (int i = 0; i < episodes.size(); i++) {
            if (episodes.get(i).getId().equals(item.getId())) {
                index = i;
                break;
            }
        }
        if (index < 0 || index + 1 >= episodes.size()) {
            return Optional.empty();
        }
        return Optional.of(episodes.get(index + 1));
    }

    public boolean fetchPoster(String seriesName) {
        List<MediaItem> items = listEpisodesInSeries(seriesName);
        if (items.isEmpty()) {
            return false;
        }

        boolean isMovie = countAvailable(items) <= 1;
        MediaItem representative = items.stream()
                .filter(MediaItem::isAvailable)
                .findFirst()
                .orElse(items.get(0));

        Optional<String> posterUrl = isMovie
                ? posterService.fetchMoviePoster(representative.getDisplayName())
                : posterService.fetchAnimePoster(seriesName);

        if (posterUrl.isEmpty()) {
            return false;
        }

        posterImageService.downloadAndCache(seriesName, posterUrl.get());
        String localPosterUrl = "/api/series/" + seriesName + "/poster-image";

        for (MediaItem item : items) {
            item.setPosterUrl(localPosterUrl);
            mediaItemRepository.save(item);
        }

        return true;
    }

    public int deleteSeries(String seriesName) {
        List<MediaItem> episodes = listEpisodesInSeries(seriesName);
        for (MediaItem episode : episodes) {
            mediaItemRepository.deleteById(episode.getId());
        }
        return episodes.size();
    }
}
