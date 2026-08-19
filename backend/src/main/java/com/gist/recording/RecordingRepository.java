package com.gist.recording;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecordingRepository extends JpaRepository<Recording, UUID> {

    /** The list screen shows newest first. */
    List<Recording> findAllByOrderByCreatedAtDesc();
}
