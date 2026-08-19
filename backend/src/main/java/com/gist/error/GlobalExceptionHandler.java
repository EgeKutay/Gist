package com.gist.error;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        return body(e.getStatus(), e.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleTooLarge(MaxUploadSizeExceededException e) {
        return body(HttpStatus.PAYLOAD_TOO_LARGE,
                "That file is larger than the 200 MB upload limit.");
    }

    /**
     * A request that isn't a well-formed multipart upload. Common enough from a
     * mobile client that it deserves a real message, not a 500.
     */
    @ExceptionHandler({MultipartException.class, MissingServletRequestPartException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<Map<String, Object>> handleBadMultipart(Exception e) {
        return body(HttpStatus.BAD_REQUEST,
                "Send the audio as a multipart form field named 'file'.");
    }

    /** Anything unmapped is a bug: log the detail, tell the client something useful. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception e) {
        log.error("Unhandled exception", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong on the server: " + e.getMessage());
    }

    private ResponseEntity<Map<String, Object>> body(HttpStatus status, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", status.value());
        payload.put("error", message);
        return ResponseEntity.status(status).body(payload);
    }
}
