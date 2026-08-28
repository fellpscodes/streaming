package com.felipe.streaming.repository;

import com.felipe.streaming.model.MediaItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MediaItemRepository extends JpaRepository<MediaItem, String> {
    Optional<MediaItem> findByPath(String path);
}
