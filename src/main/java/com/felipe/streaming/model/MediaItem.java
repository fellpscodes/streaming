package com.felipe.streaming.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class MediaItem {
    @Id private String id;
    private String path;
    private String displayName;
    private long sizeBytes;


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

    public long getSizeBytes() {
        return sizeBytes;
    }
}
