package com.gist.auth.dto;

/** Body of both sign-up and sign-in. */
public record Credentials(String email, String password) {
}
