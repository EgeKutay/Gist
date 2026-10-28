package com.gist.recipient;

import com.gist.error.ApiException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedRecipientService {

    private final SavedRecipientRepository repository;

    public SavedRecipientService(SavedRecipientRepository repository) {
        this.repository = repository;
    }

    /**
     * Record addresses a meeting was just mailed to. Called only after the send
     * succeeded, so a failed send suggests nothing. The user's own address is
     * always on the list anyway, so it is never saved.
     */
    @Transactional
    public void remember(UUID userUid, String ownEmail, List<String> recipients) {
        String own = normalize(ownEmail);
        for (String raw : recipients) {
            String address = normalize(raw);
            if (address.isEmpty() || address.equals(own)) {
                continue;
            }
            repository.upsert(UUID.randomUUID(), userUid, address);
        }
    }

    @Transactional(readOnly = true)
    public List<SavedRecipient> list(UUID userUid) {
        return repository.findTop20ByUserUidOrderByLastUsedAtDesc(userUid);
    }

    @Transactional
    public void forget(UUID userUid, UUID id) {
        if (repository.deleteByIdAndUserUid(id, userUid) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "That suggestion is already gone.");
        }
    }

    private static String normalize(String address) {
        return address == null ? "" : address.strip().toLowerCase(Locale.ROOT);
    }
}
