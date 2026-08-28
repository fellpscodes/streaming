package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaFile;
import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.repository.MediaItemRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class LibrarySyncService {
    private final MediaLibraryService mediaLibraryService;
    private final MediaItemRepository mediaItemRepository;

    public LibrarySyncService(MediaLibraryService mediaLibraryService, MediaItemRepository mediaItemRepository) {
        this.mediaLibraryService = mediaLibraryService;
        this.mediaItemRepository = mediaItemRepository;
    }

    public int sync(){
        int count = 0;
        for (MediaFile file : mediaLibraryService.listAll()) {
            String path = file.path().toString();
            if (mediaItemRepository.findByPath(path).isEmpty()) {
                MediaItem mediaItem = new MediaItem(UUID.randomUUID().toString(), path, file.displayName(), file.bytes());
                mediaItemRepository.save(mediaItem);
                count++;
            }
        }
        return count;
    }
}
