package com.felipe.streaming.controller;

import com.felipe.streaming.model.MediaItem;
import com.felipe.streaming.service.MediaCatalogService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.Optional;

@Controller
public class PageController {
    private final MediaCatalogService mediaCatalogService;

    public PageController(MediaCatalogService mediaCatalogService) {
        this.mediaCatalogService = mediaCatalogService;
    }

    @GetMapping("/")
    public String library(Model model) {

        model.addAttribute("movies", mediaCatalogService.listMovies());
        model.addAttribute("animes", mediaCatalogService.listAnimes());
        model.addAttribute("continueWatching", mediaCatalogService.listContinueWatching());
        return "library";
    }

    @GetMapping("/watch/{id}")
    public String route(@PathVariable String id, Model model) {
        Optional<MediaItem> media = mediaCatalogService.findById(id);

        if (media.isEmpty()) {
            return "redirect:/";
        }

        MediaItem item = media.get();
        boolean isSeries = mediaCatalogService.isSeries(item);

        model.addAttribute("video", item);
        model.addAttribute("isSeries", isSeries);

        if (isSeries) {
            model.addAttribute("seriesName", mediaCatalogService.seriesNameOf(item));
            model.addAttribute("nextEpisode", mediaCatalogService.findNextEpisode(item).orElse(null));
        }

        return "watch";
    }

    @GetMapping("/series/{seriesName}")
    public String series(@PathVariable String seriesName, Model model) {
        model.addAttribute("seriesName", seriesName);
        model.addAttribute("episodes", mediaCatalogService.listEpisodesInSeries(seriesName));
        return "series";
    }
}
