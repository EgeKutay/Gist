package com.gist.groq;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gist.config.GistProperties;
import com.gist.error.ApiException;
import com.gist.transcription.TranscriptionProvider;
import com.gist.transcription.TranscriptionResult;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * Groq's OpenAI-compatible transcription endpoint.
 *
 * <p>Asks for verbose_json with segment timestamps: the segments aren't stored
 * yet, but the same response carries the audio duration, which saves a second
 * ffprobe call.
 */
@Component
public class GroqTranscriptionProvider implements TranscriptionProvider {

    private static final Logger log = LoggerFactory.getLogger(GroqTranscriptionProvider.class);

    /** A ~2 hour recording is about 156 s of Groq time; this is well clear. */
    private static final Duration READ_TIMEOUT = Duration.ofMinutes(5);

    private final RestClient client;
    private final GistProperties props;
    private final ObjectMapper mapper = new ObjectMapper();

    public GroqTranscriptionProvider(GistProperties props) {
        this.props = props;

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(READ_TIMEOUT);

        this.client = RestClient.builder()
                .baseUrl(props.getGroq().getBaseUrl())
                .requestFactory(factory)
                .build();
    }

    @Override
    public TranscriptionResult transcribe(Path audio) {
        String apiKey = props.getGroq().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "GROQ_API_KEY is not set on the server.");
        }
        String model = props.getGroq().getTranscriptionModel();

        // A plain MultiValueMap, not MultipartBodyBuilder: the builder pulls in
        // reactive-streams, which a servlet-only classpath doesn't carry.
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new FileSystemResource(audio));
        body.add("model", model);
        body.add("response_format", "verbose_json");
        body.add("timestamp_granularities[]", "segment");

        long started = System.nanoTime();
        try {
            TranscriptionResult result = client.post()
                    .uri("/audio/transcriptions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .exchange((request, response) -> {
                        String raw = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw GroqErrors.map(response.getStatusCode(), response.getHeaders(), raw, model);
                        }
                        return parse(raw);
                    });

            log.info("Transcribed {} in {} ms", audio.getFileName(),
                    (System.nanoTime() - started) / 1_000_000);
            return result;

        } catch (ResourceAccessException e) {
            // Connection refused, DNS failure, or the read timeout above.
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT,
                    "Could not reach Groq to transcribe the recording: " + e.getMessage(), e);
        }
    }

    private TranscriptionResult parse(String raw) {
        try {
            JsonNode node = mapper.readTree(raw);
            String text = node.path("text").asText("").strip();
            JsonNode duration = node.path("duration");
            return new TranscriptionResult(text, duration.isNumber() ? duration.asDouble() : null);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq returned a transcription response that could not be read.", e);
        }
    }
}
