package com.gist.transcription;

import java.nio.file.Path;

/** Speech to text. One implementation today; the model is configuration. */
public interface TranscriptionProvider {

    /**
     * @param audio a file already converted to something the provider accepts
     *              and under its size limit
     */
    TranscriptionResult transcribe(Path audio);
}
