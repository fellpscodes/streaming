package com.felipe.streaming.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Service
public class PosterImageService {
    private static final Logger log = LoggerFactory.getLogger(PosterImageService.class);

    private final RestClient restClient = RestClient.create();
    private final Path storagePath;

    public PosterImageService(@Value("${poster.storage-path}") String storagePath) {
        this.storagePath = Path.of(storagePath);
    }

    private String keyFor(String seriesName) {
        return UUID.nameUUIDFromBytes(seriesName.getBytes(StandardCharsets.UTF_8)).toString();
    }

    public Path localFile(String seriesName) {
        return storagePath.resolve(keyFor(seriesName) + ".jpg");
    }

    public void downloadAndCache(String seriesName, String remoteUrl) {
        try {
            Files.createDirectories(storagePath);
            byte[] bytes = restClient.get()
                    .uri(remoteUrl)
                    .retrieve()
                    .body(byte[].class);

            if (bytes == null || bytes.length == 0) {
                log.warn("Download da capa retornou vazio para '{}' ({})", seriesName, remoteUrl);
                return;
            }

            Files.write(localFile(seriesName), bytes);
        } catch (IOException | RuntimeException e) {
            log.warn("Falha ao baixar e guardar capa localmente para '{}' ({})", seriesName, remoteUrl, e);
        }
    }
}
