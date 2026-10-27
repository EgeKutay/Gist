package com.gist.recording;

import com.gist.audio.AudioConverter;
import com.gist.audio.AudioStorage;
import com.gist.config.GistProperties;
import com.gist.email.EmailAddresses;
import com.gist.email.EmailProvider;
import com.gist.email.SummaryEmailRenderer;
import com.gist.security.GistPrincipal;
import com.gist.error.ApiException;
import com.gist.summarization.SummarizationProvider;
import com.gist.transcription.TranscriptionProvider;
import com.gist.transcription.TranscriptionResult;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Locale;
import java.util.Map;
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
    /** Send timestamps per user, for the hourly cap. */
    private final java.util.Map<UUID, List<Long>> sendLog = new ConcurrentHashMap<>();

    private static final DateTimeFormatter TITLE_FORMAT =
            DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.ENGLISH);

    /**
     * Upload formats, by extension. ffmpeg reads far more, but a short list
     * gives a clear error up front instead of a vague one from ffmpeg. Keep in
     * step with frontend/src/audioFormats.ts.
     */
    private static final List<String> ACCEPTED_EXTENSIONS =
            List.of(".m4a", ".mp3", ".wav", ".aac", ".ogg", ".opus", ".flac", ".webm", ".mp4");

    private final RecordingRepository repository;
    private final AudioConverter converter;
    private final AudioStorage storage;
    private final TranscriptionProvider transcription;
    private final SummarizationProvider summarization;
    private final EmailProvider email;
    private final SummaryEmailRenderer emailRenderer;
    private final GistProperties props;

    public RecordingService(RecordingRepository repository,
                            AudioConverter converter,
                            AudioStorage storage,
                            TranscriptionProvider transcription,
                            SummarizationProvider summarization,
                            EmailProvider email,
                            SummaryEmailRenderer emailRenderer,
                            GistProperties props) {
        this.repository = repository;
        this.converter = converter;
        this.storage = storage;
        this.transcription = transcription;
        this.summarization = summarization;
        this.email = email;
        this.emailRenderer = emailRenderer;
        this.props = props;
    }

    /**
     * Convert, transcribe, persist.
     *
     * <p>Deliberately not {@code @Transactional}: transcription can take
     * minutes, and holding a database connection open across a network call to
     * Groq would exhaust the pool. Only the final save touches the database.
     */
    public Recording create(UUID userUid, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No audio file was uploaded.");
        }
        rejectIfUnsupported(file.getOriginalFilename());

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
            Recording recording = new Recording(UUID.randomUUID(), userUid,
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
    public List<Recording> list(UUID userUid) {
        return repository.findAllByUserUidOrderByCreatedAtDesc(userUid);
    }

    @Transactional(readOnly = true)
    public Recording get(UUID userUid, UUID id) {
        return repository.findByIdAndUserUid(id, userUid).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "No recording with id " + id + "."));
    }

    @Transactional
    public void delete(UUID userUid, UUID id) {
        Recording recording = get(userUid, id);
        repository.delete(recording);
        storage.delete(recording.getAudioPath());
    }

    /**
     * Summarize the current stored transcript (the edited version, if edited).
     * Overwrites any previous summary -- summaries are cheap to regenerate and
     * there is no reason to keep a stale one around.
     */
    @Transactional
    public Recording summarize(UUID userUid, UUID id) {
        Recording recording = get(userUid, id);
        String transcript = recording.getTranscript();
        if (transcript == null || transcript.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "This recording has no transcript to summarize.");
        }

        Map<String, Object> summary = summarization.summarize(transcript);
        recording.setSummary(summary);
        recording.setSummaryOriginal(summary);
        recording.setSummaryStale(false);
        return repository.save(recording);
    }

    /**
     * Mail this recording's summary.
     *
     * <p>An endpoint that sends mail to addresses supplied in the request is a
     * spam relay unless it is bounded, so recipients are capped and each user
     * gets a fixed number of sends per hour.
     */
    public List<String> emailSummary(GistPrincipal user, UUID id, List<String> requested) {
        Recording recording = get(user.uid(), id);
        if (recording.getSummary() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "This recording has no summary yet. Summarize it first.");
        }

        List<String> recipients = resolveRecipients(user, requested);
        enforceRateLimit(user.uid());

        String title = recording.getTitle();
        email.send(recipients,
                emailRenderer.subject(title),
                emailRenderer.html(title, recording.getSummary()),
                emailRenderer.text(title, recording.getSummary()));
        return recipients;
    }

    private List<String> resolveRecipients(GistPrincipal user, List<String> requested) {
        // Preserves order and drops duplicates, so asking twice mails once.
        LinkedHashSet<String> addresses = new LinkedHashSet<>();
        if (requested == null || requested.isEmpty()) {
            if (user.email() == null || user.email().isBlank()) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Your account has no email address, so there is nowhere to send this. "
                                + "Add recipients explicitly.");
            }
            addresses.add(user.email().strip());
        } else {
            for (String raw : requested) {
                String address = raw == null ? "" : raw.strip();
                if (address.isEmpty()) {
                    continue;
                }
                if (!EmailAddresses.looksValid(address)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "\"" + address + "\" is not a valid email address.");
                }
                addresses.add(address);
            }
        }
        if (addresses.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No recipients given.");
        }
        int max = props.getMail().getMaxRecipients();
        if (addresses.size() > max) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "That is " + addresses.size() + " recipients; the limit is " + max + " per send.");
        }
        return new ArrayList<>(addresses);
    }

    /** In-memory and per-process: enough for a single backend, not a cluster. */
    private void enforceRateLimit(UUID userUid) {
        long now = Instant.now().getEpochSecond();
        sendLog.compute(userUid, (uid, previous) -> {
            List<Long> recent = new ArrayList<>();
            if (previous != null) {
                for (Long at : previous) {
                    if (now - at < 3600) {
                        recent.add(at);
                    }
                }
            }
            if (recent.size() >= props.getMail().getSendsPerHour()) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                        "You have sent " + recent.size() + " summaries in the last hour, "
                                + "which is the limit. Try again later.");
            }
            recent.add(now);
            return recent;
        });
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

    private void rejectIfUnsupported(String originalFilename) {
        String ext = extensionOf(originalFilename).toLowerCase(Locale.ROOT);
        if (!ACCEPTED_EXTENSIONS.contains(ext)) {
            String accepted = String.join(", ", ACCEPTED_EXTENSIONS.stream()
                    .map(e -> e.substring(1).toUpperCase(Locale.ROOT)).toList());
            String what = ext.equals(".tmp") ? "files without an extension" : ext + " files";
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Gist can't read " + what + ". Upload a " + accepted + " file.");
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
