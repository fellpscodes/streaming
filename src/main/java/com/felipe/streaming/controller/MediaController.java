package com.felipe.streaming.controller;

import com.felipe.streaming.dto.MediaFileResponse;
import com.felipe.streaming.dto.ProgressRequest;
import com.felipe.streaming.dto.SkipSegmentResponse;
import com.felipe.streaming.dto.SubtitleTrackResponse;
import com.felipe.streaming.dto.TitleRequest;
import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.service.ChapterService;
import com.felipe.streaming.service.LibrarySyncService;
import com.felipe.streaming.service.MediaCatalogService;
import com.felipe.streaming.service.SubtitleService;
import com.felipe.streaming.service.ThumbnailService;
import com.felipe.streaming.service.TranscodeService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@RestController
public class MediaController {
    private final MediaCatalogService mediaCatalogService;
    private final LibrarySyncService librarySyncService;
    private final ThumbnailService thumbnailService;
    private final SubtitleService subtitleService;
    private final TranscodeService transcodeService;
    private final ChapterService chapterService;

    public MediaController(MediaCatalogService mediaCatalogService, LibrarySyncService librarySyncService, ThumbnailService thumbnailService, SubtitleService subtitleService, TranscodeService transcodeService, ChapterService chapterService) {
        this.mediaCatalogService = mediaCatalogService;
        this.librarySyncService = librarySyncService;
        this.thumbnailService = thumbnailService;
        this.subtitleService = subtitleService;
        this.transcodeService = transcodeService;
        this.chapterService = chapterService;
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

    @GetMapping("/api/media/{id}/skip-segments")
    public ResponseEntity<List<SkipSegmentResponse>> skipSegments(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(chapterService.listSegments(playablePath(mediaItem.get())));
    }

    private Path playablePath(MediaItem item) {
        return transcodeService.transcodedFile(item.getId()).orElse(Path.of(item.getPath()));
    }

    private static final long STREAM_CHUNK_SIZE = 2 * 1024 * 1024;

    @GetMapping("/api/media/{id}/stream")
    public ResponseEntity<ResourceRegion> stream(@PathVariable String id, @RequestHeader HttpHeaders headers) throws IOException {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        MediaItem item = mediaItem.get();

        Path playablePath = playablePath(item);
        Resource resource = new FileSystemResource(playablePath);
        MediaType mediaType = MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM);
        long contentLength = resource.contentLength();

        List<HttpRange> ranges = headers.getRange();
        ResourceRegion region;
        if (ranges.isEmpty()) {
            long rangeLength = Math.min(STREAM_CHUNK_SIZE, contentLength);
            region = new ResourceRegion(resource, 0, rangeLength);
        } else {
            HttpRange range = ranges.get(0);
            long start = range.getRangeStart(contentLength);
            long end = range.getRangeEnd(contentLength);
            long rangeLength = Math.min(STREAM_CHUNK_SIZE, end - start + 1);
            region = new ResourceRegion(resource, start, rangeLength);
        }

        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .contentType(mediaType)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .body(region);
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

    @GetMapping("/api/media/{id}/subtitle-tracks")
    public ResponseEntity<List<SubtitleTrackResponse>> subtitleTracks(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(subtitleService.listTracks(mediaItem.get()));
    }

    @GetMapping("/api/media/{id}/subtitle-tracks/{index}")
    public ResponseEntity<Resource> subtitleTrackFile(@PathVariable String id, @PathVariable int index) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Path trackPath = subtitleService.trackFile(id, index);
        if (!Files.exists(trackPath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(trackPath);
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(resource);
    }

    @GetMapping("/api/media/{id}/subtitle-fonts")
    public ResponseEntity<List<String>> subtitleFonts(@PathVariable String id) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(subtitleService.fontFileNames(id));
    }

    @GetMapping("/api/media/{id}/subtitle-fonts/{filename}")
    public ResponseEntity<Resource> subtitleFontFile(@PathVariable String id, @PathVariable String filename) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!filename.equals(Path.of(filename).getFileName().toString())) {
            return ResponseEntity.badRequest().build();
        }

        Path fontPath = subtitleService.fontFile(id, filename);
        if (!Files.exists(fontPath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(fontPath);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(resource);
    }

    @GetMapping("/api/media/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable String id) {
        Optional<MediaItem> mediaItem = mediaCatalogService.findById(id);
        if (mediaItem.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Path thumbnailPath = thumbnailService.thumbnailPath(id);
        if (!Files.exists(thumbnailPath)) {
            thumbnailPath = siblingFile(mediaItem.get(), ".jpg");
        }

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

    @DeleteMapping("/api/media/{id}/progress")
    public ResponseEntity<Void> clearProgress(@PathVariable String id) {
        if (mediaCatalogService.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        mediaCatalogService.clearProgress(id);

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
