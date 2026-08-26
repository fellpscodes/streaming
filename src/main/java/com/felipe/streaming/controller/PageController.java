package com.felipe.streaming.controller;

import com.felipe.streaming.model.MediaFile;
import com.felipe.streaming.service.MediaLibraryService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.Optional;

@Controller
public class PageController {
    private final MediaLibraryService mediaLibraryService;

    public PageController(MediaLibraryService mediaLibraryService) {
        this.mediaLibraryService = mediaLibraryService;
    }

    @GetMapping("/")
    public String library(Model model) {

        model.addAttribute("series", mediaLibraryService.listBySeries());
        return "library";
    }

    @GetMapping("/watch/{id}")
    public String route(@PathVariable String id, Model model) {
        Optional<MediaFile> media = mediaLibraryService.findById(id);

        if (media.isEmpty()) {
            return "redirect:/";
        }

        model.addAttribute("video", media.get());
        return "watch";
    }
}
