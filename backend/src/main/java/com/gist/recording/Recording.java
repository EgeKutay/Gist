package com.gist.recording;

import com.gist.crypto.EncryptedJsonConverter;
import com.gist.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * One recording and everything derived from it.
 *
 * <p>The summary is held as a loose Map rather than a typed record because the
 * model's response is validated against the schema before it ever gets here;
 * see the summarization step.
 *
 * <p>Everything derived from what was said in the room -- title, transcript and
 * both summaries -- is encrypted at rest. Duration, timestamps and ownership
 * stay plaintext: they carry no meeting content and are needed for indexing.
 */
@Entity
@Table(name = "recordings")
public class Recording {

    @Id
    private UUID id;

    /** users.id of the owner. Every query is scoped by this. */
    @Column(name = "user_uid", nullable = false)
    private UUID userUid;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(nullable = false, columnDefinition = "bytea")
    private String title;

    /** Relative to gist.storage.dir, so the storage root can move. */
    @Column(name = "audio_path")
    private String audioPath;

    @Column(name = "duration_sec")
    private BigDecimal durationSec;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(columnDefinition = "bytea")
    private String transcript;

    @Convert(converter = EncryptedJsonConverter.class)
    @Column(columnDefinition = "bytea")
    private Map<String, Object> summary;

    /** The model's untouched output, so a user edit can be reverted. */
    @Convert(converter = EncryptedJsonConverter.class)
    @Column(name = "summary_original", columnDefinition = "bytea")
    private Map<String, Object> summaryOriginal;

    /** True when the transcript changed after the summary was generated. */
    @Column(name = "summary_stale", nullable = false)
    private boolean summaryStale;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Recording() {
        // for JPA
    }

    public Recording(UUID id, UUID userUid, String title, OffsetDateTime createdAt) {
        this.id = id;
        this.userUid = userUid;
        this.title = title;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserUid() {
        return userUid;
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
