package com.gist.recording.dto;

import com.gist.recording.Recording;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** A recording with everything derived from it. */
public record RecordingResponse(
        UUID id,
        String title,
        OffsetDateTime createdAt,
        BigDecimal durationSec,
        String transcript,
        Map<String, Object> summary,
        boolean summaryStale) {

    public static RecordingResponse from(Recording r) {
        return new RecordingResponse(
                r.getId(),
                r.getTitle(),
                r.getCreatedAt(),
                r.getDurationSec(),
                r.getTranscript(),
                r.getSummary(),
                r.isSummaryStale());
    }
}
