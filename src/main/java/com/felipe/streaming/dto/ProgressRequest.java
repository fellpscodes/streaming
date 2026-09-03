package com.felipe.streaming.dto;

public record ProgressRequest(
        double positionSeconds,
        double durationSeconds
) {
}
