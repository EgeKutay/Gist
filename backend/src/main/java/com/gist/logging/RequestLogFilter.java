package com.gist.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * One line when a request arrives and one when it finishes, with the time
 * between them.
 *
 * <p>The start line matters for uploads: it is written once the headers are in,
 * before the body has streamed, so the gap between it and the service's
 * "Converting" line is how long the phone spent uploading. Without it a slow
 * upload is invisible in the logs.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLogFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String what = request.getMethod() + " " + request.getRequestURI();
        long bytes = request.getContentLengthLong();
        if (bytes > 0) {
            log.info("-> {} ({})", what, megabytes(bytes));
        } else {
            log.info("-> {}", what);
        }

        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long ms = (System.nanoTime() - start) / 1_000_000;
            log.info("<- {} {} in {} ms", what, response.getStatus(), ms);
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Health is polled; logging it would bury everything else.
        return request.getRequestURI().equals("/api/health");
    }

    static String megabytes(long bytes) {
        return String.format(Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024.0);
    }
}
