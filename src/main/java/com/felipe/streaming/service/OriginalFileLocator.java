package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaItem;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

@Component
public class OriginalFileLocator {
    private static final List<String> ORIGINAL_EXTENSIONS = List.of("mkv", "mp4", "avi", "mov");

    private final Path libraryPath;
    private final Path originalsPath;

    public OriginalFileLocator(
            @Value("${streaming.media.library-path}") String libraryPath,
            @Value("${streaming.media.originals-path:}") String originalsPath
    ) {
        this.libraryPath = Path.of(libraryPath);
        this.originalsPath = originalsPath.isBlank() ? null : Path.of(originalsPath);
    }

    public Optional<Path> findOriginal(MediaItem item) {
        if (originalsPath == null) {
            return Optional.empty();
        }

        Path itemPath = Path.of(item.getPath());
        Path relative;
        try {
            relative = libraryPath.relativize(itemPath);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }

        String fileName = relative.getFileName().toString();
        int lastDot = fileName.lastIndexOf('.');
        String baseName = lastDot >= 0 ? fileName.substring(0, lastDot) : fileName;
        Path relativeDir = relative.getParent();

        for (String extension : ORIGINAL_EXTENSIONS) {
            Path candidate = relativeDir == null
                    ? originalsPath.resolve(baseName + "." + extension)
                    : originalsPath.resolve(relativeDir).resolve(baseName + "." + extension);
            if (Files.exists(candidate)) {
                return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }
}
