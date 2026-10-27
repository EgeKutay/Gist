package com.gist.audio;

import com.gist.config.GistProperties;
import com.gist.error.ApiException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Wraps ffmpeg and ffprobe.
 *
 * <p>Audio is downmixed to mono 16 kHz AAC before upload -- Whisper discards
 * everything above 16 kHz anyway. The bitrate is the highest that still fits
 * Groq's 25 MB cap for that recording's length, capped at 64 kbps: measured
 * against the sample, 64 kbps reproduced the original transcript exactly while
 * lower rates introduced sentence-boundary artifacts.
 */
@Component
public class AudioConverter {

    private static final Logger log = LoggerFactory.getLogger(AudioConverter.class);

    /** Long meetings take a while to re-encode; well clear of the worst case. */
    private static final Duration CONVERT_TIMEOUT = Duration.ofMinutes(10);
    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(30);

    /** Groq's transcription upload cap. */
    public static final long GROQ_MAX_BYTES = 25L * 1024 * 1024;

    /** Past this, Whisper showed no measurable gain -- only bigger uploads. */
    private static final int MAX_BITRATE_KBPS = 64;

    /** AAC targets an average bitrate, so leave room for it to overshoot. */
    private static final double SIZE_MARGIN = 0.90;

    private final GistProperties props;

    public AudioConverter(GistProperties props) {
        this.props = props;
    }

    /** Duration in seconds, read without decoding the whole file. */
    public double probeDurationSeconds(Path input) {
        String out = run(
                List.of(props.getFfmpeg().getProbePath(),
                        "-v", "error",
                        "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1",
                        input.toString()),
                PROBE_TIMEOUT,
                "ffprobe");
        try {
            return Double.parseDouble(out.trim());
        } catch (NumberFormatException e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Could not read the duration of that file. Is it really audio?");
        }
    }

    /**
     * Highest bitrate whose output still fits under the Groq cap, capped at
     * {@value #MAX_BITRATE_KBPS} kbps. Chosen once per recording from its total
     * duration, so the whole file is encoded uniformly.
     */
    public int bitrateKbpsFor(double durationSeconds) {
        if (durationSeconds <= 0) {
            return MAX_BITRATE_KBPS;
        }
        double usableBits = GROQ_MAX_BYTES * 8 * SIZE_MARGIN;
        int fits = (int) (usableBits / durationSeconds / 1000);
        return Math.max(1, Math.min(MAX_BITRATE_KBPS, fits));
    }

    /** Re-encode to mono 16 kHz AAC. {@code -vn} drops any video track. */
    public void convertToMono16k(Path input, Path output, int bitrateKbps) {
        run(
                List.of(props.getFfmpeg().getPath(),
                        "-y",
                        "-i", input.toString(),
                        "-vn",
                        "-ac", "1",
                        "-ar", "16000",
                        "-c:a", "aac",
                        "-b:a", bitrateKbps + "k",
                        output.toString()),
                CONVERT_TIMEOUT,
                "ffmpeg");
    }

    /**
     * Runs a process and returns its output. ffmpeg writes progress to
     * stderr, which for a long file can exceed the OS pipe buffer -- merging
     * stderr into stdout (one pipe, drained as it's produced) avoids the
     * deadlock that reading stdout-then-stderr sequentially would cause.
     */
    private String run(List<String> command, Duration timeout, String tool) {
        Process process;
        try {
            process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    tool + " could not be started. Is it installed and on PATH? "
                            + "Override with GIST_FFMPEG_PATH / GIST_FFPROBE_PATH.", e);
        }

        try {
            byte[] output = process.getInputStream().readAllBytes();

            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                throw new ApiException(HttpStatus.GATEWAY_TIMEOUT,
                        tool + " took longer than " + timeout.toMinutes() + " minutes and was stopped.");
            }
            if (process.exitValue() != 0) {
                String detail = new String(output, StandardCharsets.UTF_8).trim();
                log.error("{} failed (exit {}): {}", tool, process.exitValue(), detail);
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                        tool + " could not process that file. It may be corrupt or "
                                + "in an unsupported format.");
            }
            return new String(output, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed while reading output from " + tool + ".", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    tool + " was interrupted.", e);
        }
    }
}
