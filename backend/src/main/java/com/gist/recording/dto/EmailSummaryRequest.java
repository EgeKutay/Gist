package com.gist.recording.dto;

import java.util.List;

/**
 * @param to explicit recipients; null or empty means "send it to me"
 * @param includeSummary whether to include the summary; null means yes, which
 *                       is what clients that predate this field expect
 * @param includeTranscript whether to include the full transcript; null means no
 */
public record EmailSummaryRequest(List<String> to, Boolean includeSummary, Boolean includeTranscript) {

    public boolean wantsSummary() {
        return includeSummary == null || includeSummary;
    }

    public boolean wantsTranscript() {
        return includeTranscript != null && includeTranscript;
    }
}
