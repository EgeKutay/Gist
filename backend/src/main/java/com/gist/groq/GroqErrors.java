package com.gist.groq;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gist.error.ApiException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

/**
 * Turns a Groq error response into something worth showing a user.
 *
 * <p>Shared by both providers: the failure modes are identical whichever
 * endpoint was called.
 */
public final class GroqErrors {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GroqErrors() {
    }

    public static ApiException map(HttpStatusCode status, HttpHeaders headers, String body, String model) {
        String detail = extractMessage(body);

        if (status.value() == 429) {
            String retryAfter = headers.getFirst("retry-after");
            String when = retryAfter != null
                    ? " Try again in " + retryAfter + " seconds."
                    : " Try again shortly.";
            return new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Groq rate limit reached." + when + (detail.isBlank() ? "" : " (" + detail + ")"));
        }
        if (status.value() == 404) {
            return new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq does not have a model called '" + model + "' on this key. "
                            + "Run `python prototype/models.py` to see what's available, "
                            + "then set GIST_TRANSCRIPTION_MODEL or GIST_SUMMARIZATION_MODEL.");
        }
        if (status.value() == 401 || status.value() == 403) {
            return new ApiException(HttpStatus.BAD_GATEWAY,
                    "Groq rejected the API key. Check GROQ_API_KEY. "
                            + (detail.isBlank() ? "" : "(" + detail + ")"));
        }
        if (status.value() == 413) {
            return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "Groq rejected the upload as too large. " + detail);
        }
        return new ApiException(HttpStatus.BAD_GATEWAY,
                "Groq returned " + status.value() + ". "
                        + (detail.isBlank() ? "No detail was provided." : detail));
    }

    /** Groq wraps failures as {"error": {"message": "..."}}. */
    private static String extractMessage(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode node = MAPPER.readTree(body);
            JsonNode message = node.path("error").path("message");
            return message.isTextual() ? message.asText() : body.strip();
        } catch (Exception e) {
            return body.strip();
        }
    }
}
