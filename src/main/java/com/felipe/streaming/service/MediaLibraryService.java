package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;

import static org.springframework.web.servlet.function.RouterFunctionDslKt.plus;

@Service
public class MediaLibraryService {

    private final Path videoPath;
    private final List<String> extensions;
    private static final Duration CACHE_TTL = Duration.ofSeconds(30);
    private List<MediaFile> cache = null;
    private Instant cachedAt;
    private static final Logger log = LoggerFactory.getLogger(MediaLibraryService.class);

    public MediaLibraryService(
            @Value("${streaming.media.library-path}") Path videoPath,
            @Value("${streaming.media.allowed-extensions}") List<String> extensions
    ) {
        this.videoPath = videoPath;
        this.extensions = extensions;
    }

    private List<MediaFile> scan() {
        List<MediaFile> result = new ArrayList<>();
        try (Stream<Path> files = Files.walk(videoPath)) {
            List<Path> allPaths = files.toList();
            for (Path path : allPaths) {
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                String fileName = path.getFileName().toString();
                int lastPoint = fileName.lastIndexOf('.');

                if (lastPoint < 0) {
                    continue;
                }

                String extension = fileName.substring(lastPoint + 1).toLowerCase();

                if (!extensions.contains(extension)) {
                    continue;
                }

                String displayName = fileName.substring(0, lastPoint);
                long bytes = Files.size(path);

                String id = UUID.nameUUIDFromBytes(path.toString().getBytes(StandardCharsets.UTF_8)).toString();

                result.add(new MediaFile(id, displayName, path, bytes));
            }
        } catch (IOException e) {
            log.warn("Error while reading media library file in {}", videoPath, e);
        }
        return result;
    }

    public List<MediaFile> listAll() {
        if (cache != null && Instant.now().isBefore(cachedAt.plus(CACHE_TTL))) {
            return cache;
        }
        cache = scan();
        cachedAt = Instant.now();

        return cache;
    }

    public Optional<MediaFile> findById(String id) {
        for (MediaFile item : listAll()) {
            if (item.id().equals(id)) {
                return Optional.of(item);
            }
        }
        return Optional.empty();
    }

    public Map<String, List<MediaFile>> listBySeries() {
        Map<String, List<MediaFile>> groups = new LinkedHashMap<>();
        for (MediaFile file : listAll()) {
            String seriesName = file.path()
                    .getParent()
                    .getFileName()
                    .toString();

            List<MediaFile> list = groups.get(seriesName);
            if (list == null) {
                list = new ArrayList<>();
                groups.put(seriesName, list);
            }
            list.add(file);
        }

        return groups;
    }
}