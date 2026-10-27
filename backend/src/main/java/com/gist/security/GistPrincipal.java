package com.gist.security;

import java.util.UUID;

/**
 * The authenticated caller, taken straight from a verified session token.
 *
 * <p>Built from the token's claims alone, so authenticating a request costs no
 * database read.
 *
 * @param uid   users.id; the ownership key on every recording
 * @param email the account's address, used as the default mail recipient
 */
public record GistPrincipal(UUID uid, String email) {
}
