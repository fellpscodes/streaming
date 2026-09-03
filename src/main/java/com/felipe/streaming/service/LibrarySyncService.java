package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaFile;
import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.repository.MediaItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class LibrarySyncService {
    private final MediaLibraryService mediaLibraryService;
    private final MediaItemRepository mediaItemRepository;
    private final MediaCatalogService mediaCatalogService;
    private static final Logger log = LoggerFactory.getLogger(LibrarySyncService.class);

    public LibrarySyncService(MediaLibraryService mediaLibraryService, MediaItemRepository mediaItemRepository, MediaCatalogService mediaCatalogService) {
        this.mediaLibraryService = mediaLibraryService;
        this.mediaItemRepository = mediaItemRepository;
        this.mediaCatalogService = mediaCatalogService;
    }

    public int sync(){
        int count = 0;
        Set<String> pathsOnDisk = new HashSet<>();
        Set<String> newSeriesNames = new HashSet<>();

        for (MediaFile file : mediaLibraryService.listAll()) {
            String path = file.path().toString();
            pathsOnDisk.add(path);

            Optional<MediaItem> existing = mediaItemRepository.findByPath(path);
            if (existing.isEmpty()) {
                MediaItem mediaItem = new MediaItem(UUID.randomUUID().toString(), path, file.displayName(), file.bytes());
                mediaItemRepository.save(mediaItem);
                count++;
                newSeriesNames.add(mediaCatalogService.seriesNameOf(mediaItem));
            } else if (!existing.get().isAvailable()) {
                existing.get().setAvailable(true);
                mediaItemRepository.save(existing.get());
            }
        }

        for (MediaItem item : mediaItemRepository.findAll()) {
            if (item.isAvailable() && !pathsOnDisk.contains(item.getPath())) {
                item.setAvailable(false);
                mediaItemRepository.save(item);
            }
        }

        for (String seriesName : newSeriesNames) {
            boolean alreadyHasPoster = mediaCatalogService.listEpisodesInSeries(seriesName).stream()
                    .anyMatch(item -> item.getPosterUrl() != null);
            if (!alreadyHasPoster) {
                mediaCatalogService.fetchPoster(seriesName);
            }
        }

        return count;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void syncOnStartup(){
        int quantidade = sync();
        log.info("Sincronizados {} itens novos", quantidade);
    }
}
