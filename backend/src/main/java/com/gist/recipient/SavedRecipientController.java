package com.gist.recipient;

import com.gist.security.GistPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Suggested recipients for the email panel. Filled in by successful sends. */
@RestController
@RequestMapping("/api/recipients")
public class SavedRecipientController {

    private final SavedRecipientService service;

    public SavedRecipientController(SavedRecipientService service) {
        this.service = service;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal GistPrincipal user) {
        return service.list(user.uid()).stream()
                .map(r -> Map.<String, Object>of("id", r.getId(), "email", r.getEmail()))
                .toList();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> forget(@AuthenticationPrincipal GistPrincipal user,
                                       @PathVariable UUID id) {
        service.forget(user.uid(), id);
        return ResponseEntity.noContent().build();
    }
}
