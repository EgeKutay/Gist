package com.gist.recipient;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An address the user has sent a meeting to, offered as a suggestion on the
 * next send. Rows are written by an upsert in the repository, never by save().
 */
@Entity
@Table(name = "saved_recipients")
public class SavedRecipient {

    @Id
    private UUID id;

    /** users.id of the owner. Every query is scoped by this. */
    @Column(name = "user_uid", nullable = false)
    private UUID userUid;

    /** Stored trimmed and lowercased. */
    @Column(nullable = false)
    private String email;

    @Column(name = "last_used_at", nullable = false)
    private OffsetDateTime lastUsedAt;

    protected SavedRecipient() {
        // for JPA
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserUid() {
        return userUid;
    }

    public String getEmail() {
        return email;
    }

    public OffsetDateTime getLastUsedAt() {
        return lastUsedAt;
    }
}
