package com.gist.audio;

import com.gist.config.GistProperties;
import com.gist.error.ApiException;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Where converted audio lives on disk. Only the file name is stored in the
 * database, so the storage root can be moved without touching rows.
 */
@Component
public class AudioStorage {

    private static final Logger log = LoggerFactory.getLogger(AudioStorage.class);

    private final Path root;

    public AudioStorage(GistProperties props) {
        this.root = Paths.get(props.getStorage().getDir()).toAbsolutePath().normalize();
    }

    @PostConstruct
    void createRoot() {
        try {
            Files.createDirectories(root);
            log.info("Audio storage: {}", root);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create storage directory " + root, e);
        }
    }

    public Path resolve(String fileName) {
        return root.resolve(fileName);
    }

    /** Best-effort delete; a missing file is not an error worth failing a request over. */
    public void delete(String fileName) {
        if (fileName == null) {
            return;
        }
        try {
            Files.deleteIfExists(resolve(fileName));
        } catch (IOException e) {
            log.warn("Could not delete stored audio {}: {}", fileName, e.getMessage());
        }
    }

    public long sizeOf(Path path) {
        try {
            return Files.size(path);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not read the converted audio file.", e);
        }
    }
}
