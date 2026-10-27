package com.gist.auth.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * What the app stores after signing in. {@code token} goes in the
 * Authorization header of every later request.
 */
public record SessionResponse(String token, Instant expiresAt, UserView user) {

    public record UserView(UUID id, String email) {
    }
}
