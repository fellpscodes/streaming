package com.felipe.streaming.controller;

import com.felipe.streaming.service.MediaLibraryService;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {
    private final MediaLibraryService mediaLibraryService;

    public PageController(MediaLibraryService mediaLibraryService) {
        this.mediaLibraryService = mediaLibraryService;
    }

    @GetMapping("/")
    public String library(Model model) {

        model.addAttribute("videos", mediaLibraryService.listAll());
        return "library";
    }
}
