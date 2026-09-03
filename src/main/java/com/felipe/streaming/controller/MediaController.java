package com.felipe.streaming.controller;

import com.felipe.streaming.dto.MediaFileResponse;
import com.felipe.streaming.dto.ProgressRequest;
import com.felipe.streaming.dto.TitleRequest;
import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.service.LibrarySyncService;
import com.felipe.streaming.service.MediaCatalogService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
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

    @GetMapping("/api/media/{id}/subtitles")
    public ResponseEntity<Resource> subtitles(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Path subtitlePath = siblingFile(mediaItem.get(), ".vtt");

        if (!Files.exists(subtitlePath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(subtitlePath);

        return ResponseEntity.ok().contentType(MediaType.valueOf("text/vtt")).body(resource);
    }

    @GetMapping("/api/media/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Path thumbnailPath = siblingFile(mediaItem.get(), ".jpg");

        if (!Files.exists(thumbnailPath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(thumbnailPath);

        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(resource);
    }

    private Path siblingFile(MediaItem item, String extension) {
        Path videoPath = Path.of(item.getPath());
        String fileName = videoPath.getFileName().toString();
        int lastDot = fileName.lastIndexOf('.');
        String baseName = lastDot >= 0 ? fileName.substring(0, lastDot) : fileName;
        return videoPath.resolveSibling(baseName + extension);
    }

    @PostMapping("/api/media/{id}/progress")
    public ResponseEntity<Void> updateProgress(@PathVariable String id, @RequestBody ProgressRequest request) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        mediaCatalogService.updateProgress(id, request.positionSeconds(), request.durationSeconds());

        return ResponseEntity.ok().build();
    }

    @PostMapping("/api/media/{id}/title")
    public ResponseEntity<Void> updateTitle(@PathVariable String id, @RequestBody TitleRequest request) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (request.displayName() == null || request.displayName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        mediaCatalogService.updateTitle(id, request.displayName().trim());

        return ResponseEntity.ok().build();
    }

    @PostMapping("/api/series/{seriesName}/poster")
    public ResponseEntity<Void> fetchPoster(@PathVariable String seriesName) {
        boolean found = mediaCatalogService.fetchPoster(seriesName);
        if (!found) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/api/series/{seriesName}")
    public ResponseEntity<Void> deleteSeries(@PathVariable String seriesName) {
        int deleted = mediaCatalogService.deleteSeries(seriesName);
        if (deleted == 0) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/library/sync")
    public int sync() {
        return librarySyncService.sync();
    }
}
