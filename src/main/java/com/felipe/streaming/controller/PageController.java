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

        model.addAttribute("series", mediaCatalogService.listBySeries());
        return "library";
    }

    @GetMapping("/watch/{id}")
    public String route(@PathVariable String id, Model model) {
        Optional<MediaItem> media = mediaCatalogService.findById(id);

        if (media.isEmpty()) {
            return "redirect:/";
        }

        model.addAttribute("video", media.get());
        return "watch";
    }
}
