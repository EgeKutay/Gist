package com.gist.recording;

import com.gist.audio.AudioConverter;
import com.gist.audio.AudioStorage;
import com.gist.config.GistProperties;
import com.gist.error.ApiException;
import com.gist.transcription.TranscriptionProvider;
import com.gist.transcription.TranscriptionResult;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class RecordingService {

    private static final Logger log = LoggerFactory.getLogger(RecordingService.class);

    /** Placeholder until summarization produces a real one. */
    private static final DateTimeFormatter TITLE_FORMAT =
            DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.ENGLISH);

    private final RecordingRepository repository;
    private final AudioConverter converter;
    private final AudioStorage storage;
    private final TranscriptionProvider transcription;
    private final GistProperties props;

    public RecordingService(RecordingRepository repository,
                            AudioConverter converter,
                            AudioStorage storage,
                            TranscriptionProvider transcription,
                            GistProperties props) {
        this.repository = repository;
        this.converter = converter;
        this.storage = storage;
        this.transcription = transcription;
        this.props = props;
    }

    /**
     * Convert, transcribe, persist.
     *
     * <p>Deliberately not {@code @Transactional}: transcription can take
     * minutes, and holding a database connection open across a network call to
     * Groq would exhaust the pool. Only the final save touches the database.
     */
    public Recording create(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No audio file was uploaded.");
        }

        Path upload = stageUpload(file);
        String storedName = UUID.randomUUID() + ".m4a";
        Path converted = storage.resolve(storedName);

        try {
            double sourceSeconds = converter.probeDurationSeconds(upload);
            rejectIfTooLong(sourceSeconds);

            int bitrate = converter.bitrateKbpsFor(sourceSeconds);
            log.info("Converting {} ({} s) at {} kbps", file.getOriginalFilename(),
                    Math.round(sourceSeconds), bitrate);
            converter.convertToMono16k(upload, converted, bitrate);
            rejectIfStillTooLarge(storage.sizeOf(converted));

            TranscriptionResult result = transcription.transcribe(converted);

            OffsetDateTime now = OffsetDateTime.now();
            Recording recording = new Recording(UUID.randomUUID(),
                    "Meeting — " + TITLE_FORMAT.format(now), now);
            recording.setAudioPath(storedName);
            recording.setTranscript(result.text());
            // Whisper reports duration in the same response; ffprobe is the
            // fallback for the rare case it does not.
            double seconds = result.durationSeconds() != null
                    ? result.durationSeconds()
                    : converter.probeDurationSeconds(converted);
            recording.setDurationSec(BigDecimal.valueOf(seconds).setScale(2, RoundingMode.HALF_UP));

            return repository.save(recording);

        } catch (RuntimeException e) {
            // Do not leave a converted file behind for a recording never saved.
            storage.delete(storedName);
            throw e;
        } finally {
            deleteQuietly(upload);
        }
    }

    @Transactional(readOnly = true)
    public List<Recording> list() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional(readOnly = true)
    public Recording get(UUID id) {
        return repository.findById(id).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "No recording with id " + id + "."));
    }

    @Transactional
    public void delete(UUID id) {
        Recording recording = get(id);
        repository.delete(recording);
        storage.delete(recording.getAudioPath());
    }

    /** ffmpeg needs a real file on disk, not a stream. */
    private Path stageUpload(MultipartFile file) {
        String suffix = extensionOf(file.getOriginalFilename());
        try {
            Path temp = Files.createTempFile("gist-upload-", suffix);
            file.transferTo(temp);
            return temp;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not save the uploaded file for processing.", e);
        }
    }

    private void rejectIfTooLong(double seconds) {
        int maxMinutes = props.getAudio().getMaxDurationMinutes();
        if (seconds > maxMinutes * 60.0) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, String.format(
                    "That recording is %.0f minutes long. The limit is %d minutes, "
                            + "because Groq caps transcription uploads at 25 MB.",
                    seconds / 60.0, maxMinutes));
        }
    }

    private void rejectIfStillTooLarge(long bytes) {
        if (bytes > AudioConverter.GROQ_MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, String.format(
                    "Even after conversion the audio is %.1f MB, over Groq's 25 MB limit. "
                            + "Try a shorter recording.", bytes / 1024.0 / 1024.0));
        }
    }

    private String extensionOf(String originalFilename) {
        if (originalFilename == null) {
            return ".tmp";
        }
        int dot = originalFilename.lastIndexOf('.');
        // Guard against a "filename" that is nothing but an extension.
        return (dot > 0 && dot < originalFilename.length() - 1)
                ? originalFilename.substring(dot)
                : ".tmp";
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("Could not delete temp upload {}: {}", path, e.getMessage());
        }
    }
}
