package com.gist.recording;

import com.gist.recording.dto.EmailSummaryRequest;
import com.gist.recording.dto.RecordingListItem;
import com.gist.recording.dto.RecordingResponse;
import com.gist.security.GistPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/recordings")
public class RecordingController {

    private final RecordingService service;

    public RecordingController(RecordingService service) {
        this.service = service;
    }

    /** Upload, convert, transcribe. Synchronous -- the client shows a spinner. */
    @PostMapping
    public ResponseEntity<RecordingResponse> create(@AuthenticationPrincipal GistPrincipal user,
                                                    @RequestParam("file") MultipartFile file) {
        RecordingResponse body = RecordingResponse.from(service.create(user.uid(), file));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @GetMapping
    public List<RecordingListItem> list(@AuthenticationPrincipal GistPrincipal user) {
        return service.list(user.uid()).stream().map(RecordingListItem::from).toList();
    }

    @GetMapping("/{id}")
    public RecordingResponse get(@AuthenticationPrincipal GistPrincipal user,
                                 @PathVariable UUID id) {
        return RecordingResponse.from(service.get(user.uid(), id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal GistPrincipal user,
                                       @PathVariable UUID id) {
        service.delete(user.uid(), id);
        return ResponseEntity.noContent().build();
    }

    /** Summarize the current stored transcript. Synchronous, same as create. */
    @PostMapping("/{id}/summarize")
    public RecordingResponse summarize(@AuthenticationPrincipal GistPrincipal user,
                                       @PathVariable UUID id) {
        return RecordingResponse.from(service.summarize(user.uid(), id));
    }

    /**
     * Mail the summary. With no recipients given it goes to the signed-in
     * address, which is the common case.
     */
    @PostMapping("/{id}/email")
    public Map<String, Object> email(@AuthenticationPrincipal GistPrincipal user,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody(required = false) EmailSummaryRequest body) {
        List<String> sentTo = service.emailSummary(user, id, body == null ? null : body.to());
        return Map.of("sent", true, "recipients", sentTo);
    }
}
