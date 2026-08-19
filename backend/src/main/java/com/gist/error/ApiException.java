package com.gist.error;

import org.springframework.http.HttpStatus;

/**
 * An error the client should see verbatim. Messages are written for a person
 * reading them in the app, not for a log file.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public ApiException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
