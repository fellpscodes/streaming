package com.felipe.streaming.service;

import com.felipe.streaming.model.MediaFile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

@Service
public class MediaLibraryService {

    private final Path videoPath;
    private final List<String> extensions;
    public MediaLibraryService(
            @Value("${streaming.media.library-path}") Path videoPath,
            @Value("${streaming.media.allowed-extensions}") List<String> extensions
    ) {
        this.videoPath = videoPath;
        this.extensions = extensions;
        System.out.println(listAll());
    }

    public List<MediaFile> listAll(){
        List<MediaFile> result = new ArrayList<>();
        try (Stream<Path> files = Files.walk(videoPath)){
            List<Path> allPaths = files.toList();
            for (Path path: allPaths){
                if (!Files.isRegularFile(path)) {
                    continue;
                }
                String fileName = path.getFileName().toString();
                int lastPoint = fileName.lastIndexOf('.');

                if (lastPoint < 0 ){
                    continue;
                }

                String extension = fileName.substring(lastPoint + 1).toLowerCase();

                if (!extensions.contains(extension)) {
                    continue;
                }

                String displayName = fileName.substring(0, lastPoint);
                long bytes = Files.size(path);
                result.add(new MediaFile(displayName, path, bytes));
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
        return result;
    }
}