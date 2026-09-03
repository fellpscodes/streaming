package com.felipe.streaming.service;

import com.felipe.streaming.dto.SkipSegmentResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
public class ChapterService {
    private static final Logger log = LoggerFactory.getLogger(ChapterService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> OPENING_TITLES = Set.of("op", "opening", "intro");
    private static final Set<String> ENDING_TITLES = Set.of("ed", "ending", "outro");

    private final String ffprobePath;

    public ChapterService(@Value("${thumbnail.ffprobe-path}") String ffprobePath) {
        this.ffprobePath = ffprobePath;
    }

    public List<SkipSegmentResponse> listSegments(Path playableFile) {
        String json = runProbe(List.of(
                ffprobePath, "-v", "error",
                "-show_chapters",
                "-of", "json",
                playableFile.toString()
        ));
        if (json == null) {
            return List.of();
        }

        List<SkipSegmentResponse> segments = new ArrayList<>();
        try {
            FfprobeChapters output = JSON.readValue(json, FfprobeChapters.class);
            if (output.chapters() == null) {
                return List.of();
            }
            for (FfprobeChapter chapter : output.chapters()) {
                Map<String, String> tags = chapter.tags() == null ? Map.of() : chapter.tags();
                String title = tags.getOrDefault("title", "").trim().toLowerCase();

                String type = null;
                if (OPENING_TITLES.contains(title)) {
                    type = "opening";
                } else if (ENDING_TITLES.contains(title)) {
                    type = "ending";
                }

                if (type != null) {
                    segments.add(new SkipSegmentResponse(type, Double.parseDouble(chapter.start_time()), Double.parseDouble(chapter.end_time())));
                }
            }
        } catch (JacksonException | NumberFormatException e) {
            log.warn("Falha ao interpretar capitulos de {}", playableFile, e);
        }
        return segments;
    }

    private String runProbe(List<String> command) {
        try {
            Process process = new ProcessBuilder(command)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();

            String output;
            try (var reader = process.inputReader(StandardCharsets.UTF_8)) {
                output = reader.lines().reduce("", (a, b) -> a + b);
            }

            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }
            return output;
        } catch (IOException | InterruptedException e) {
            log.warn("Falha ao rodar ffprobe para capitulos", e);
            return null;
        }
    }

    private record FfprobeChapters(List<FfprobeChapter> chapters) {
    }

    private record FfprobeChapter(String start_time, String end_time, Map<String, String> tags) {
    }
}
