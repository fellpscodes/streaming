package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.repository.MediaItemRepository;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.*;

@Service
public class MediaCatalogService {
    private final MediaItemRepository mediaItemRepository;

    public MediaCatalogService(MediaItemRepository mediaItemRepository) {
        this.mediaItemRepository = mediaItemRepository;
    }

    public List<MediaItem> listAll(){
        return mediaItemRepository.findAll();
    }

    public Optional<MediaItem> findById(String id){
        return mediaItemRepository.findById(id);
    }

    public Map<String, List<MediaItem>> listBySeries() {
        Map<String, List<MediaItem>> groups = new LinkedHashMap<>();
        for (MediaItem item : listAll()) {
            String seriesName = Path.of(item.getPath()).getParent().getFileName().toString();
            List<MediaItem> list = groups.get(seriesName);
            if (list == null) {
                list = new ArrayList<>();
                groups.put(seriesName, list);
            }
            list.add(item);
        }
        return groups;
    }
}
