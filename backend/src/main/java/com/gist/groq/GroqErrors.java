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

    /** Which call failed; the same Groq status means different things for each. */
    public enum Step {
        TRANSCRIPTION,
        SUMMARIZATION
    }

    private GroqErrors() {
    }

    public static ApiException map(HttpStatusCode status, HttpHeaders headers, String body,
                                   String model, Step step) {
        String detail = extractMessage(body);
        String code = extractCode(body);

        // Checked before 429: Groq may send this as 400 or 413, and it is not
        // something waiting fixes.
        if (step == Step.SUMMARIZATION && isContextLengthExceeded(code, detail)) {
            return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "This meeting is too long for the summarization model to read in one go. "
                            + "Set GIST_SUMMARIZATION_MODEL to a model with a larger context window. "
                            + "(" + detail + ")");
        }

        // "Request too large" can arrive as 413 or 429; either way, retrying won't help.
        boolean tooLarge = status.value() == 413
                || detail.toLowerCase().contains("request too large");
        if (tooLarge) {
            // For chat calls Groq uses 413 when one request needs more tokens
            // than the plan allows per minute, so it fails however long you wait.
            String message = step == Step.SUMMARIZATION
                    ? "This transcript is too long to summarize in one request on your Groq plan. "
                            + "Raise the plan's tokens-per-minute limit, or set "
                            + "GIST_SUMMARIZATION_MODEL to a model with a higher limit."
                    : "Groq rejected the audio as too large to transcribe.";
            return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    message + (detail.isBlank() ? "" : " (" + detail + ")"));
        }
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
        return new ApiException(HttpStatus.BAD_GATEWAY,
                "Groq returned " + status.value() + ". "
                        + (detail.isBlank() ? "No detail was provided." : detail));
    }

    private static boolean isContextLengthExceeded(String code, String detail) {
        if ("context_length_exceeded".equals(code)) {
            return true;
        }
        String lower = detail.toLowerCase();
        return lower.contains("context length") || lower.contains("context window")
                || lower.contains("reduce the length of the messages");
    }

    /** The machine-readable {"error": {"code": "..."}}, or empty. */
    private static String extractCode(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode code = MAPPER.readTree(body).path("error").path("code");
            return code.isTextual() ? code.asText() : "";
        } catch (Exception e) {
            return "";
        }
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
