package com.gist.recording.dto;

import java.util.List;

/**
 * @param to explicit recipients; null or empty means "send it to me"
 */
public record EmailSummaryRequest(List<String> to) {
}
