package com.gist.recording;

import com.gist.recording.dto.EmailSummaryRequest;
import com.gist.recording.dto.RecordingListItem;
import com.gist.recording.dto.RecordingResponse;
import com.gist.recording.dto.RenameRecordingRequest;
import com.gist.recording.dto.UpdateTranscriptRequest;
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
import org.springframework.web.bind.annotation.PatchMapping;
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

    /** Rename. The title is the only field the user edits directly. */
    @PatchMapping("/{id}")
    public RecordingResponse rename(@AuthenticationPrincipal GistPrincipal user,
                                    @PathVariable UUID id,
                                    @RequestBody RenameRecordingRequest body) {
        return RecordingResponse.from(service.rename(user.uid(), id, body.title()));
    }

    /** Replace the transcript with the user's corrected text. Marks any summary stale. */
    @PatchMapping("/{id}/transcript")
    public RecordingResponse updateTranscript(@AuthenticationPrincipal GistPrincipal user,
                                              @PathVariable UUID id,
                                              @RequestBody UpdateTranscriptRequest body) {
        return RecordingResponse.from(service.updateTranscript(user.uid(), id, body.transcript()));
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
     * Mail the summary and/or the full transcript. With no recipients given it
     * goes to the signed-in address, which is the common case.
     */
    @PostMapping("/{id}/email")
    public Map<String, Object> email(@AuthenticationPrincipal GistPrincipal user,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody(required = false) EmailSummaryRequest body) {
        EmailSummaryRequest request = body == null ? new EmailSummaryRequest(null, null, null) : body;
        List<String> sentTo = service.emailRecording(user, id, request.to(),
                request.wantsSummary(), request.wantsTranscript());
        return Map.of("sent", true, "recipients", sentTo);
    }
}
