package com.gist.security;

import com.gist.config.GistProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * Issues and verifies session tokens: HS256 JWTs carrying the user id and email.
 *
 * <p>Stateless by choice -- there is no session table, so a token stays valid
 * until it expires and signing out is the client discarding it. Rotating
 * GIST_JWT_SECRET is the way to invalidate every session at once.
 */
@Component
public class TokenService {

    private static final String ISSUER = "gist";
    private static final int MIN_SECRET_BYTES = 32;

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final Duration lifetime;
    private final Clock clock;

    @Autowired
    public TokenService(GistProperties props) {
        this(props, Clock.systemUTC());
    }

    /** The clock only affects issuing; verification always uses real time. */
    TokenService(GistProperties props, Clock clock) {
        this.clock = clock;
        SecretKey key = readSecret(props.getAuth().getJwtSecret());
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        // Checks expiry and that we were the issuer.
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER));
        this.decoder = decoder;
        this.lifetime = Duration.ofDays(props.getAuth().getSessionDays());
    }

    public Issued issue(UUID userId, String email) {
        Instant now = clock.instant();
        Instant expiresAt = now.plus(lifetime);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .claim("email", email)
                .issuedAt(now)
                .expiresAt(expiresAt)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new Issued(token, expiresAt);
    }

    /** Empty for anything expired, forged, or malformed. */
    public Optional<GistPrincipal> verify(String token) {
        try {
            Jwt jwt = decoder.decode(token);
            return Optional.of(new GistPrincipal(
                    UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email")));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static SecretKey readSecret(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new IllegalStateException(
                    "GIST_JWT_SECRET is not set. Generate one the same way as GIST_ENCRYPTION_KEY "
                            + "(base64 of 32 random bytes) -- but use a different value.");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("GIST_JWT_SECRET is not valid base64.", e);
        }
        if (bytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("GIST_JWT_SECRET must decode to at least "
                    + MIN_SECRET_BYTES + " bytes, got " + bytes.length + ".");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    public record Issued(String token, Instant expiresAt) {
    }
}
