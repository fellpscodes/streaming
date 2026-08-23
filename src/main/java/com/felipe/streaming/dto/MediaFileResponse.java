package com.felipe.streaming.dto;

public record MediaFileResponse(
        String id,
        String displayName,
        long bytes
) {
}
