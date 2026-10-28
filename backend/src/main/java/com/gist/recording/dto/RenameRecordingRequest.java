package com.gist.recording.dto;

/**
 * @param title the new meeting name; trimmed and checked by the service
 */
public record RenameRecordingRequest(String title) {
}
