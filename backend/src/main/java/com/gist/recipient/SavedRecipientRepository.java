package com.gist.recipient;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SavedRecipientRepository extends JpaRepository<SavedRecipient, UUID> {

    /** Most recently used first; the panel shows a short list. */
    List<SavedRecipient> findTop20ByUserUidOrderByLastUsedAtDesc(UUID userUid);

    /**
     * Ownership is enforced in the query, so another user's id deletes nothing
     * and looks the same as one that does not exist.
     */
    @Modifying
    @Query("delete from SavedRecipient r where r.id = :id and r.userUid = :userUid")
    int deleteByIdAndUserUid(@Param("id") UUID id, @Param("userUid") UUID userUid);

    /** Insert, or move an address already saved to the top of the list. */
    @Modifying
    @Query(value = """
            insert into saved_recipients (id, user_uid, email, last_used_at)
            values (:id, :userUid, :email, now())
            on conflict (user_uid, email) do update set last_used_at = now()
            """, nativeQuery = true)
    void upsert(@Param("id") UUID id, @Param("userUid") UUID userUid, @Param("email") String email);
}
