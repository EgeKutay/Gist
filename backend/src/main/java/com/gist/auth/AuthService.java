package com.gist.auth;

import com.gist.auth.dto.SessionResponse;
import com.gist.config.GistProperties;
import com.gist.email.EmailAddresses;
import com.gist.error.ApiException;
import com.gist.security.TokenService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private static final int MIN_PASSWORD = 8;
    /** bcrypt ignores (newer Spring: rejects) anything past 72 bytes. */
    private static final int MAX_PASSWORD_BYTES = 72;
    private static final long THROTTLE_WINDOW_SECONDS = 15 * 60;

    private final UserRepository users;
    private final TokenService tokens;
    private final GistProperties props;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /**
     * Compared against when the email has no account, so an unknown address
     * takes as long to reject as a wrong password and timing does not reveal
     * which accounts exist.
     */
    private final String dummyHash = encoder.encode(UUID.randomUUID().toString());

    /** Failed sign-in timestamps per email. In-memory: one backend, not a cluster. */
    private final Map<String, List<Long>> failures = new ConcurrentHashMap<>();

    public AuthService(UserRepository users, TokenService tokens, GistProperties props) {
        this.users = users;
        this.tokens = tokens;
        this.props = props;
    }

    public SessionResponse register(String rawEmail, String password) {
        String email = normalize(rawEmail);
        if (!EmailAddresses.looksValid(email)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "That does not look like an email address.");
        }
        checkPasswordRules(password);
        if (users.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account. Sign in instead.");
        }
        User user = new User(UUID.randomUUID(), email, encoder.encode(password), OffsetDateTime.now());
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Two sign-ups for the same address raced past the exists check.
            throw new ApiException(HttpStatus.CONFLICT, "That email already has an account. Sign in instead.");
        }
        return session(user);
    }

    public SessionResponse login(String rawEmail, String password) {
        String email = normalize(rawEmail);
        if (password == null) {
            password = "";
        }
        checkNotLockedOut(email);

        User user = users.findByEmail(email).orElse(null);
        boolean ok = encoder.matches(truncate(password), user == null ? dummyHash : user.getPasswordHash());
        if (user == null || !ok) {
            recordFailure(email);
            // One message for both cases, so the form cannot be used to probe for accounts.
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Wrong email or password.");
        }
        failures.remove(email);
        return session(user);
    }

    private SessionResponse session(User user) {
        TokenService.Issued issued = tokens.issue(user.getId(), user.getEmail());
        return new SessionResponse(issued.token(), issued.expiresAt(),
                new SessionResponse.UserView(user.getId(), user.getEmail()));
    }

    private void checkPasswordRules(String password) {
        if (password == null || password.length() < MIN_PASSWORD) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Use at least " + MIN_PASSWORD + " characters for the password.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "That password is too long; keep it under 72 characters.");
        }
    }

    /** Only reached on sign-in, where a too-long password simply cannot match. */
    private String truncate(String password) {
        byte[] bytes = password.getBytes(StandardCharsets.UTF_8);
        return bytes.length <= MAX_PASSWORD_BYTES ? password : "";
    }

    private void checkNotLockedOut(String email) {
        if (recent(failures.get(email)).size() >= props.getAuth().getMaxFailedLogins()) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many wrong passwords. Wait 15 minutes and try again.");
        }
    }

    private void recordFailure(String email) {
        failures.compute(email, (key, previous) -> {
            List<Long> kept = recent(previous);
            kept.add(Instant.now().getEpochSecond());
            return kept;
        });
    }

    private static List<Long> recent(List<Long> timestamps) {
        long now = Instant.now().getEpochSecond();
        List<Long> kept = new ArrayList<>();
        if (timestamps != null) {
            for (Long at : timestamps) {
                if (now - at < THROTTLE_WINDOW_SECONDS) {
                    kept.add(at);
                }
            }
        }
        return kept;
    }

    private static String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }
}
