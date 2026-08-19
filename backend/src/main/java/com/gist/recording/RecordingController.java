package com.gist.recording;

import com.gist.recording.dto.RecordingListItem;
import com.gist.recording.dto.RecordingResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
    public ResponseEntity<RecordingResponse> create(@RequestParam("file") MultipartFile file) {
        RecordingResponse body = RecordingResponse.from(service.create(file));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @GetMapping
    public List<RecordingListItem> list() {
        return service.list().stream().map(RecordingListItem::from).toList();
    }

    @GetMapping("/{id}")
    public RecordingResponse get(@PathVariable UUID id) {
        return RecordingResponse.from(service.get(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
