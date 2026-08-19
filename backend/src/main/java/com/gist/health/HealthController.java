package com.gist.health;

import com.gist.recording.RecordingRepository;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Confirms the app is up and can actually reach Postgres -- a plain 200 from
 * the servlet layer would pass even with the database down.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final RecordingRepository recordings;

    public HealthController(RecordingRepository recordings) {
        this.recordings = recordings;
    }

    @GetMapping
    public Map<String, Object> health() {
        return Map.of("status", "ok", "recordings", recordings.count());
    }
}
