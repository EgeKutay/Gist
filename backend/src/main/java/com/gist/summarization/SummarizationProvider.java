package com.gist.summarization;

import java.util.Map;

/** Transcript to structured summary. One implementation today; the model is configuration. */
public interface SummarizationProvider {

    /** @return the summary, already validated against the schema in prompt.txt */
    Map<String, Object> summarize(String transcript);
}
