package com.felipe.streaming.service;

import com.felipe.streaming.dto.SubtitleTrackResponse;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.felipe.streaming.model.MediaItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Service
public class SubtitleService {
    private static final Logger log = LoggerFactory.getLogger(SubtitleService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String ffmpegPath;
    private final String ffprobePath;
    private final Path storagePath;
    private final OriginalFileLocator originalFileLocator;

    public SubtitleService(
            @Value("${thumbnail.ffmpeg-path}") String ffmpegPath,
            @Value("${thumbnail.ffprobe-path}") String ffprobePath,
            @Value("${subtitle.storage-path}") String storagePath,
            OriginalFileLocator originalFileLocator
    ) {
        this.ffmpegPath = ffmpegPath;
        this.ffprobePath = ffprobePath;
        this.storagePath = Path.of(storagePath);
        this.originalFileLocator = originalFileLocator;
    }

    public List<SubtitleTrackResponse> listTracks(MediaItem item) {
        Optional<Path> original = originalFileLocator.findOriginal(item);
        if (original.isEmpty()) {
            return List.of();
        }

        List<AssStream> streams = probeAssStreams(original.get());
        if (streams.isEmpty()) {
            return List.of();
        }

        Path dir = storagePath.resolve(item.getId());
        if (!Files.isDirectory(dir)) {
            extract(item.getId(), original.get(), streams);
        }

        List<SubtitleTrackResponse> tracks = new ArrayList<>();
        for (AssStream stream : streams) {
            tracks.add(new SubtitleTrackResponse(stream.index(), stream.language(), stream.title()));
        }
        return tracks;
    }

    public Path trackFile(String itemId, int index) {
        return storagePath.resolve(itemId).resolve(index + ".ass");
    }

    public List<String> fontFileNames(String itemId) {
        Path fontsDir = storagePath.resolve(itemId).resolve("fonts");
        if (!Files.isDirectory(fontsDir)) {
            return List.of();
        }
        try (var files = Files.list(fontsDir)) {
            return files.map(p -> p.getFileName().toString()).toList();
        } catch (IOException e) {
            log.warn("Falha ao listar fontes em {}", fontsDir, e);
            return List.of();
        }
    }

    public Path fontFile(String itemId, String filename) {
        return storagePath.resolve(itemId).resolve("fonts").resolve(filename);
    }

    private void extract(String itemId, Path original, List<AssStream> streams) {
        Path dir = storagePath.resolve(itemId);
        Path fontsDir = dir.resolve("fonts");

        try {
            Files.createDirectories(fontsDir);
        } catch (IOException e) {
            log.warn("Falha ao criar pasta de legendas para {}", itemId, e);
            return;
        }

        for (AssStream stream : streams) {
            Path out = dir.resolve(stream.index() + ".ass");
            boolean ok = runProcess(List.of(
                    ffmpegPath, "-y", "-v", "error",
                    "-i", original.toString(),
                    "-map", "0:" + stream.index(),
                    "-c", "copy",
                    out.toString()
            ), true);
            if (!ok) {
                log.warn("Falha ao extrair legenda ASS (stream {}) de {}", stream.index(), original);
            }
        }

        List<Attachment> attachments = probeAttachments(original);
        for (int i = 0; i < attachments.size(); i++) {
            String extension = extensionOf(attachments.get(i).filename());
            Path out = fontsDir.resolve("font_" + i + "." + extension);
            runProcess(List.of(
                    ffmpegPath, "-y", "-v", "error",
                    "-dump_attachment:t:" + i, out.toString(),
                    "-i", original.toString()
            ), false);
        }
    }

    private String extensionOf(String filename) {
        if (filename == null) {
            return "ttf";
        }
        int lastDot = filename.lastIndexOf('.');
        if (lastDot < 0) {
            return "ttf";
        }
        String extension = filename.substring(lastDot + 1).toLowerCase();
        return switch (extension) {
            case "ttf", "otf", "ttc" -> extension;
            default -> "ttf";
        };
    }

    private boolean runProcess(List<String> command, boolean requireExitZero) {
        try {
            Process process = new ProcessBuilder(command)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();

            boolean finished = process.waitFor(60, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return false;
            }

            if (requireExitZero && process.exitValue() != 0) {
                return false;
            }
            return true;
        } catch (IOException | InterruptedException e) {
            log.warn("Falha ao executar comando de extração de legenda", e);
            return false;
        }
    }

    private List<AssStream> probeAssStreams(Path original) {
        String json = runProbe(List.of(
                ffprobePath, "-v", "error",
                "-select_streams", "s",
                "-show_entries", "stream=index,codec_name:stream_tags=language,title",
                "-of", "json",
                original.toString()
        ));
        if (json == null) {
            return List.of();
        }

        List<AssStream> result = new ArrayList<>();
        try {
            FfprobeOutput output = JSON.readValue(json, FfprobeOutput.class);
            for (FfprobeStream stream : output.streams()) {
                if (!"ass".equals(stream.codec_name()) && !"ssa".equals(stream.codec_name())) {
                    continue;
                }
                Map<String, String> tags = stream.tags() == null ? Map.of() : stream.tags();
                result.add(new AssStream(stream.index(), tags.getOrDefault("language", "und"), tags.get("title")));
            }
        } catch (JacksonException e) {
            log.warn("Falha ao interpretar streams de legenda de {}", original, e);
        }
        return result;
    }

    private List<Attachment> probeAttachments(Path original) {
        String json = runProbe(List.of(
                ffprobePath, "-v", "error",
                "-select_streams", "t",
                "-show_entries", "stream=index:stream_tags=filename",
                "-of", "json",
                original.toString()
        ));
        if (json == null) {
            return List.of();
        }

        List<Attachment> result = new ArrayList<>();
        try {
            FfprobeOutput output = JSON.readValue(json, FfprobeOutput.class);
            for (FfprobeStream stream : output.streams()) {
                Map<String, String> tags = stream.tags() == null ? Map.of() : stream.tags();
                result.add(new Attachment(tags.get("filename")));
            }
        } catch (JacksonException e) {
            log.warn("Falha ao interpretar anexos (fontes) de {}", original, e);
        }
        return result;
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
            log.warn("Falha ao rodar ffprobe", e);
            return null;
        }
    }

    private record AssStream(int index, String language, String title) {
    }

    private record Attachment(String filename) {
    }

    private record FfprobeOutput(List<FfprobeStream> streams) {
    }

    private record FfprobeStream(int index, String codec_name, Map<String, String> tags) {
    }
}
