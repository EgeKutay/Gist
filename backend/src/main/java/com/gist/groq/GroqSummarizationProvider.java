package com.gist.groq;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gist.config.GistProperties;
import com.gist.error.ApiException;
import com.gist.summarization.SummarizationProvider;
import java.io.IOException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * Groq's OpenAI-compatible chat completions endpoint, prompted to return the
 * summary schema as JSON.
 *
 * <p>The system prompt lives in {@code prompt.txt} on the classpath so it can
 * be edited without a rebuild of the calling code -- same file the prototype
 * uses, copied in rather than shared, since the two are not expected to
 * diverge in packaging.
 */
@Component
public class GroqSummarizationProvider implements SummarizationProvider {

    private static final Logger log = LoggerFactory.getLogger(GroqSummarizationProvider.class);

    /** Chat completions are much faster than transcription; still generous. */
    private static final Duration READ_TIMEOUT = Duration.ofMinutes(3);

    private static final List<String> STRING_LIST_KEYS = List.of(
            "completed", "blockers", "pending_confirmation",
            "open_questions", "action_items", "next_steps");

    private final RestClient client;
    private final GistProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final String systemPrompt;

    public GroqSummarizationProvider(GistProperties props) {
        this.props = props;
        this.systemPrompt = loadPrompt();

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
    public Map<String, Object> summarize(String transcript) {
        String apiKey = props.getGroq().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "GROQ_API_KEY is not set on the server.");
        }
        String model = props.getGroq().getSummarizationModel();

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("model", model);
        requestBody.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", transcript)));
        // Same temperature as the prototype: a given transcript should keep
        // producing the same summary once these runs become eval cases.
        requestBody.put("temperature", 0.2);
        requestBody.put("response_format", Map.of("type", "json_object"));

        long started = System.nanoTime();
        try {
            Map<String, Object> summary = client.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .exchange((request, response) -> {
                        String raw = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw GroqErrors.map(response.getStatusCode(), response.getHeaders(), raw, model,
                                    GroqErrors.Step.SUMMARIZATION);
                        }
                        return parse(raw);
                    });

            log.info("Summarized transcript ({} chars) in {} ms", transcript.length(),
                    (System.nanoTime() - started) / 1_000_000);
            return summary;

        } catch (ResourceAccessException e) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT,
                    "Could not reach Groq to summarize the transcript: " + e.getMessage(), e);
        }
    }

    private String loadPrompt() {
        try {
            return new ClassPathResource("prompt.txt").getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Missing backend/src/main/resources/prompt.txt", e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String raw) {
        String content;
        String finishReason;
        try {
            JsonNode choice = mapper.readTree(raw).path("choices").path(0);
            content = choice.path("message").path("content").asText("");
            finishReason = choice.path("finish_reason").asText("");
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq returned a summarization response that could not be read.", e);
        }
        // Checked before parsing: a cut-off answer is broken JSON, and "invalid
        // JSON" would hide the real reason.
        if ("length".equals(finishReason)) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "The summary was cut off because the model ran out of output length. "
                            + "Try Summarize again, or set GIST_SUMMARIZATION_MODEL to a model "
                            + "that allows longer answers.");
        }
        if (content.isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Groq returned an empty summary.");
        }
        // response_format json_object should make fences impossible, but strip
        // them anyway -- cheaper than debugging it later.
        content = content.strip().replaceAll("^```(?:json)?", "").replaceAll("```$", "").strip();

        Map<String, Object> summary;
        try {
            summary = mapper.readValue(content, Map.class);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq did not return valid JSON for the summary.", e);
        }
        validate(summary);
        return summary;
    }

    /** Fail loudly rather than persist a summary the app can't render. */
    private void validate(Map<String, Object> summary) {
        List<String> problems = new ArrayList<>();

        if (!(summary.get("key_outcomes") instanceof String)) {
            problems.add("key_outcomes must be a string");
        }

        Object decisions = summary.get("decisions_made");
        boolean decisionsOk = decisions instanceof List<?> list && list.stream().allMatch(item ->
                item instanceof Map<?, ?> m
                        && m.get("title") instanceof String
                        && m.get("detail") instanceof String);
        if (!decisionsOk) {
            problems.add("decisions_made must be an array of {title, detail} objects");
        }

        for (String key : STRING_LIST_KEYS) {
            Object value = summary.get(key);
            boolean ok = value instanceof List<?> list && list.stream().allMatch(item -> item instanceof String);
            if (!ok) {
                problems.add(key + " must be an array of strings");
            }
        }

        if (!problems.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq's summary did not match the expected schema: " + String.join("; ", problems));
        }
    }
}
