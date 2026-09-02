package com.felipe.streaming.controller;

import com.felipe.streaming.dto.MediaFileResponse;
import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.service.LibrarySyncService;
import com.felipe.streaming.service.MediaCatalogService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@RestController
public class MediaController {
    private final MediaCatalogService mediaCatalogService;
    private final LibrarySyncService librarySyncService;

    public MediaController(MediaCatalogService mediaCatalogService,  LibrarySyncService librarySyncService) {
        this.mediaCatalogService = mediaCatalogService;
        this.librarySyncService = librarySyncService;
    }

    @GetMapping("/api/media")
    public List<MediaFileResponse> listAll() {
        List<MediaFileResponse> response = new ArrayList<>();
        for (MediaItem mediaItem : mediaCatalogService.listAll()) {
            response.add(new MediaFileResponse(mediaItem.getId(), mediaItem.getDisplayName(), mediaItem.getSizeBytes()));
        }
        return response;
    }

    @GetMapping("/api/media/{id}")
    public ResponseEntity<MediaFileResponse> getById(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        MediaItem item = mediaItem.get();

        MediaFileResponse mediaFileResponse = new MediaFileResponse(item.getId(), item.getDisplayName(), item.getSizeBytes());

        return ResponseEntity.ok(mediaFileResponse);
    }

    @GetMapping("/api/media/{id}/stream")
    public ResponseEntity<Resource> stream(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        MediaItem item = mediaItem.get();

        Resource resource = new FileSystemResource(item.getPath());

        MediaType mediaType = MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM);

        return ResponseEntity.ok().contentType(mediaType).body(resource);
    }

    @PostMapping("/api/library/sync")
    public int sync() {
        return librarySyncService.sync();
    }
}
