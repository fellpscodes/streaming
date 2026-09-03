package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

@Service
public class ThumbnailService {
    private static final Logger log = LoggerFactory.getLogger(ThumbnailService.class);

    private final String ffmpegPath;
    private final String ffprobePath;
    private final Path storagePath;

    public ThumbnailService(
            @Value("${thumbnail.ffmpeg-path}") String ffmpegPath,
            @Value("${thumbnail.ffprobe-path}") String ffprobePath,
            @Value("${thumbnail.storage-path}") String storagePath
    ) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
        this.storagePath = Path.of(storagePath);
    }

    public Path thumbnailPath(String itemId) {
        return storagePath.resolve(itemId + ".jpg");
    }

    public boolean generateThumbnail(MediaItem item) {
        try {
            Files.createDirectories(storagePath);

            double duration = readDurationSeconds(item.getPath());
            long timestamp = Math.round(duration * 0.25);

            Process process = new ProcessBuilder(
                    ffmpegPath,
                    "-y",
                    "-ss", String.valueOf(timestamp),
                    "-i", item.getPath(),
                    "-frames:v", "1",
                    "-vf", "scale=400:-1",
                    thumbnailPath(item.getId()).toString()
            ).redirectOutput(ProcessBuilder.Redirect.DISCARD)
             .redirectError(ProcessBuilder.Redirect.DISCARD)
             .start();

            boolean finished = process.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                log.warn("Geração de miniatura expirou (30s) para {}", item.getPath());
                process.destroyForcibly();
                return false;
            }
            if (process.exitValue() != 0) {
                log.warn("FFmpeg saiu com código {} ao gerar miniatura para {}", process.exitValue(), item.getPath());
                return false;
            }
            return true;
        } catch (IOException | InterruptedException e) {
            log.warn("Falha ao gerar miniatura para {}", item.getPath(), e);
            return false;
        }
    }

    private double readDurationSeconds(String videoPath) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                ffprobePath,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                videoPath
        ).redirectError(ProcessBuilder.Redirect.DISCARD)
         .start();

        String output;
        try (var reader = process.inputReader()) {
            output = reader.readLine();
        }

        process.waitFor(10, TimeUnit.SECONDS);

        if (output == null || output.isBlank()) {
            return 0;
        }

        return Double.parseDouble(output.trim());
    }
}
