package com.gist.recording.dto;

import com.gist.recording.Recording;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** What the list screen needs -- deliberately without the transcript. */
public record RecordingListItem(
        UUID id,
        String title,
        OffsetDateTime createdAt,
        BigDecimal durationSec,
        boolean hasSummary,
        boolean summaryStale) {

    public static RecordingListItem from(Recording r) {
        return new RecordingListItem(
                r.getId(),
                r.getTitle(),
                r.getCreatedAt(),
                r.getDurationSec(),
                r.getSummary() != null,
                r.isSummaryStale());
    }
}
