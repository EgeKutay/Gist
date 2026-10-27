package com.gist.email;

public final class EmailAddresses {

    private EmailAddresses() {
    }

    /**
     * Structural check only -- deliverability is the mail service's problem.
     * Rejects the mistakes a person actually makes: no @, two @, no dot in the
     * domain, stray whitespace.
     */
    public static boolean looksValid(String address) {
        int at = address.indexOf('@');
        if (at <= 0 || at != address.lastIndexOf('@') || at == address.length() - 1) {
            return false;
        }
        if (address.chars().anyMatch(Character::isWhitespace)) {
            return false;
        }
        String domain = address.substring(at + 1);
        int dot = domain.indexOf('.');
        return dot > 0 && dot < domain.length() - 1;
    }
}
