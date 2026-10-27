package com.gist.resend;

import com.gist.config.GistProperties;
import com.gist.email.EmailProvider;
import com.gist.error.ApiException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/** Resend's HTTP API. Same client shape as the Groq providers. */
@Component
public class ResendEmailProvider implements EmailProvider {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailProvider.class);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestClient client;
    private final GistProperties props;

    public ResendEmailProvider(GistProperties props) {
        this.props = props;
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(READ_TIMEOUT);

        this.client = RestClient.builder()
                .baseUrl(props.getMail().getBaseUrl())
                .requestFactory(factory)
                .build();
    }

    @Override
    public void send(List<String> to, String subject, String html, String text) {
        String apiKey = props.getMail().getApiKey();
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email is not configured on the server (RESEND_API_KEY is unset).");
        }

        Map<String, Object> payload = Map.of(
                "from", props.getMail().getFrom(),
                "to", to,
                "subject", subject,
                "html", html,
                "text", text);

        try {
            client.post()
                    .uri("/emails")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .exchange((request, response) -> {
                        String raw = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                        if (!response.getStatusCode().is2xxSuccessful()) {
                            throw mapError(response.getStatusCode().value(), raw);
                        }
                        return null;
                    });
            log.info("Emailed a summary to {} recipient(s)", to.size());
        } catch (ResourceAccessException e) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT,
                    "Could not reach the mail service: " + e.getMessage(), e);
        }
    }

    private ApiException mapError(int status, String body) {
        if (status == 401 || status == 403) {
            return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The mail service rejected the API key. Check RESEND_API_KEY.");
        }
        if (status == 422 || status == 400) {
            // Overwhelmingly the unverified-domain case, which is confusing on
            // first setup because the key and the request are both fine.
            return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "The mail service refused this message. Until a sending domain is verified, "
                            + "Resend only delivers to your own account address. " + body);
        }
        if (status == 429) {
            return new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "The mail service is rate limiting. Try again shortly.");
        }
        return new ApiException(HttpStatus.BAD_GATEWAY,
                "The mail service returned " + status + ". " + body);
    }
}
