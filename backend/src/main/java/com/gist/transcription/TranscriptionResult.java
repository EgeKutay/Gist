package com.gist.transcription;

/**
 * @param text            the plain transcript
 * @param durationSeconds audio length as reported by the provider, or null if
 *                        it didn't say
 */
public record TranscriptionResult(String text, Double durationSeconds) {
}
