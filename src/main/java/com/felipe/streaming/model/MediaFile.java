package com.felipe.streaming.model;

import java.nio.file.Path;

public record MediaFile(
        String id,
        String displayName,
        Path path,
        long bytes
) {
    public String humanSize() {
        double gigaBytes = bytes / 1024.0 / 1024.0 / 1024.0;
        return String.format("%.2f GB", gigaBytes);
    }
}

