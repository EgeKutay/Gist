package com.gist.recording;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One recording and everything derived from it.
 *
 * <p>The summary is held as a loose Map rather than a typed record because the
 * model's response is validated against the schema before it ever gets here;
 * see the summarization step.
 */
@Entity
@Table(name = "recordings")
public class Recording {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String title;

    /** Relative to gist.storage.dir, so the storage root can move. */
    @Column(name = "audio_path")
    private String audioPath;

    @Column(name = "duration_sec")
    private BigDecimal durationSec;

    @Column(columnDefinition = "text")
    private String transcript;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> summary;

    /** The model's untouched output, so a user edit can be reverted. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "summary_original", columnDefinition = "jsonb")
    private Map<String, Object> summaryOriginal;

    /** True when the transcript changed after the summary was generated. */
    @Column(name = "summary_stale", nullable = false)
    private boolean summaryStale;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Recording() {
        // for JPA
    }

    public Recording(UUID id, String title, OffsetDateTime createdAt) {
        this.id = id;
        this.title = title;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getAudioPath() {
        return audioPath;
    }

    public void setAudioPath(String audioPath) {
        this.audioPath = audioPath;
    }

    public BigDecimal getDurationSec() {
        return durationSec;
    }

    public void setDurationSec(BigDecimal durationSec) {
        this.durationSec = durationSec;
    }

    public String getTranscript() {
        return transcript;
    }

    public void setTranscript(String transcript) {
        this.transcript = transcript;
    }

    public Map<String, Object> getSummary() {
        return summary;
    }

    public void setSummary(Map<String, Object> summary) {
        this.summary = summary;
    }

    public Map<String, Object> getSummaryOriginal() {
        return summaryOriginal;
    }

    public void setSummaryOriginal(Map<String, Object> summaryOriginal) {
        this.summaryOriginal = summaryOriginal;
    }

    public boolean isSummaryStale() {
        return summaryStale;
    }

    public void setSummaryStale(boolean summaryStale) {
        this.summaryStale = summaryStale;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
