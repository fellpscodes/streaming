package com.felipe.streaming.controller;

import com.felipe.streaming.dto.MediaFileResponse;
import com.felipe.streaming.model.MediaFile;
import com.felipe.streaming.service.LibrarySyncService;
import com.felipe.streaming.service.MediaLibraryService;
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
    private final MediaLibraryService mediaLibraryService;
    private final LibrarySyncService librarySyncService;

    public MediaController(MediaLibraryService mediaLibraryService,  LibrarySyncService librarySyncService) {
        this.mediaLibraryService = mediaLibraryService;
        this.librarySyncService = librarySyncService;
    }

    @GetMapping("/api/media")
    public List<MediaFileResponse> listAll() {
        List<MediaFileResponse> response = new ArrayList<>();
        for (MediaFile mediaFile : mediaLibraryService.listAll()) {
            response.add(new MediaFileResponse(mediaFile.id(), mediaFile.displayName(), mediaFile.bytes()));
        }
        return response;
    }

    @GetMapping("/api/media/{id}")
    public ResponseEntity<MediaFileResponse> getById(@PathVariable String id) {
        Optional<MediaFile> mediaFile = mediaLibraryService.findById(id);
        if (mediaFile.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        MediaFile file = mediaFile.get();

        MediaFileResponse mediaFileResponse = new MediaFileResponse(file.id(), file.displayName(), file.bytes());

        return ResponseEntity.ok(mediaFileResponse);
    }

    @GetMapping("/api/media/{id}/stream")
    public ResponseEntity<Resource> stream(@PathVariable String id) {
        Optional<MediaFile> mediaFile = mediaLibraryService.findById(id);
        if (mediaFile.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        MediaFile file = mediaFile.get();

        Resource resource = new FileSystemResource(file.path());

        MediaType mediaType = MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM);

        return ResponseEntity.ok().contentType(mediaType).body(resource);
    }

    @PostMapping("/api/library/sync")
    public int sync() {
        return librarySyncService.sync();
    }
}
