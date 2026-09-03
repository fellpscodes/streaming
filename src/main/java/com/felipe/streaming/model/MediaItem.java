package com.felipe.streaming.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
public class MediaItem {
    @Id private String id;
    private String path;
    private String displayName;
    private long sizeBytes;
    private boolean available = true;

    @ColumnDefault("0")
    private double lastPositionSeconds = 0;

    @ColumnDefault("0")
    private double durationSeconds = 0;

    private Instant lastWatchedAt;

    private String posterUrl;

    public MediaItem(String id, String path, String displayName, long sizeBytes) {
        this.id = id;
        this.path = path;
        this.displayName = displayName;
        this.sizeBytes = sizeBytes;
    }

    protected MediaItem() {

    }

    public String getId() {
        return id;
    }

    public String getPath() {
        return path;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }

    public double getLastPositionSeconds() {
        return lastPositionSeconds;
    }

    public double getDurationSeconds() {
        return durationSeconds;
    }

    public Instant getLastWatchedAt() {
        return lastWatchedAt;
    }

    public void updateProgress(double positionSeconds, double durationSeconds) {
        this.lastPositionSeconds = positionSeconds;
        this.durationSeconds = durationSeconds;
        this.lastWatchedAt = Instant.now();
    }

    public boolean isInProgress() {
        if (lastPositionSeconds <= 0 || durationSeconds <= 0) {
            return false;
        }
        return lastPositionSeconds / durationSeconds < 0.95;
    }

    public boolean isWatched() {
        if (durationSeconds <= 0) {
            return false;
        }
        return lastPositionSeconds / durationSeconds >= 0.95;
    }

    public String getPosterUrl() {
        return posterUrl;
    }

    public void setPosterUrl(String posterUrl) {
        this.posterUrl = posterUrl;
    }

    public String remainingTime() {
        if (durationSeconds <= 0) {
            return "";
        }
        int minutes = (int) Math.round((durationSeconds - lastPositionSeconds) / 60);
        if (minutes < 1) {
            return "menos de 1m restante";
        }
        return minutes + "m restantes";
    }

    public String humanSize() {
        double gigaBytes = sizeBytes / 1024.0 / 1024.0 / 1024.0;
        return String.format("%.2f GB", gigaBytes);
    }
}
