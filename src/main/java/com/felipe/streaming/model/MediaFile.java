package com.felipe.streaming.model;

import java.nio.file.Path;

public record MediaFile(
        String displayName,
        Path path,
        long bytes
) {}

