package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaItem;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Service
public class TranscodeService {
    private static final Logger log = LoggerFactory.getLogger(TranscodeService.class);

    private final String ffmpegPath;
    private final Path storagePath;
    private final OriginalFileLocator originalFileLocator;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "video-transcode");
        thread.setDaemon(true);
        return thread;
    });

    private volatile Process currentProcess;
    private volatile Path currentTmpFile;

    public TranscodeService(
            @Value("${thumbnail.ffmpeg-path}") String ffmpegPath,
            @Value("${transcode.storage-path}") String storagePath,
            OriginalFileLocator originalFileLocator
    ) {
        this.ffmpegPath = ffmpegPath;
        this.storagePath = Path.of(storagePath);
        this.originalFileLocator = originalFileLocator;
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();

        Process process = currentProcess;
        if (process != null && process.isAlive()) {
            process.destroyForcibly();
        }

        Path tmp = currentTmpFile;
        if (tmp != null) {
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
            }
        }
    }

    public Optional<Path> transcodedFile(String itemId) {
        Path file = storagePath.resolve(itemId + ".mp4");
        return Files.exists(file) ? Optional.of(file) : Optional.empty();
    }

    public void queueTranscode(MediaItem item) {
        if (transcodedFile(item.getId()).isPresent()) {
            return;
        }

        Optional<Path> original = originalFileLocator.findOriginal(item);
        if (original.isEmpty()) {
            return;
        }

        Path tmp = storagePath.resolve(item.getId() + ".tmp.mp4");
        try {
            Files.createDirectories(storagePath);
            Files.createFile(tmp);
        } catch (FileAlreadyExistsException e) {
            return;
        } catch (IOException e) {
            log.warn("Falha ao reservar arquivo temporario de transcodificacao para {}", item.getId(), e);
            return;
        }

        executor.submit(() -> transcode(item.getId(), original.get()));
    }

    private void transcode(String itemId, Path original) {
        Path tmp = storagePath.resolve(itemId + ".tmp.mp4");
        Path finalFile = storagePath.resolve(itemId + ".mp4");
        currentTmpFile = tmp;

        try {
            Files.createDirectories(storagePath);
        } catch (IOException e) {
            log.warn("Falha ao criar pasta de transcodificacao", e);
            currentTmpFile = null;
            return;
        }

        log.info("Iniciando transcodificacao em qualidade melhor: {}", original);

        boolean ok = runProcess(List.of(
                ffmpegPath, "-y", "-v", "error",
                "-i", original.toString(),
                "-map", "0:v:0", "-map", "0:a:0",
                "-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "18", "-qp_p", "20",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                tmp.toString()
        ));

        currentTmpFile = null;

        if (!ok) {
            log.warn("Falha na transcodificacao de {}", original);
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
            }
            return;
        }

        try {
            Files.move(tmp, finalFile, StandardCopyOption.REPLACE_EXISTING);
            log.info("Transcodificacao concluida: {}", finalFile);
        } catch (IOException e) {
            log.warn("Falha ao mover arquivo transcodificado para {}", finalFile, e);
        }
    }

    private boolean runProcess(List<String> command) {
        try {
            Process process = new ProcessBuilder(command)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
            currentProcess = process;

            boolean finished = process.waitFor(3, TimeUnit.HOURS);
            if (!finished) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (IOException | InterruptedException e) {
            log.warn("Falha ao executar ffmpeg para transcodificacao", e);
            return false;
        } finally {
            currentProcess = null;
        }
    }
}
