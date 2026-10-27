package com.gist.recording;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecordingRepository extends JpaRepository<Recording, UUID> {

    /** The list screen shows this user's recordings, newest first. */
    List<Recording> findAllByUserUidOrderByCreatedAtDesc(UUID userUid);

    /**
     * Ownership is enforced in the query rather than by a check afterwards, so
     * another user's id is indistinguishable from one that does not exist.
     */
    Optional<Recording> findByIdAndUserUid(UUID id, UUID userUid);
}
