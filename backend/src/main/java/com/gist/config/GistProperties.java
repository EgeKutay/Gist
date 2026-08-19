package com.gist.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Everything under `gist.*` in application.yml. */
@ConfigurationProperties(prefix = "gist")
public class GistProperties {

    private final Storage storage = new Storage();
    private final Ffmpeg ffmpeg = new Ffmpeg();
    private final Audio audio = new Audio();
    private final Groq groq = new Groq();

    public Storage getStorage() {
        return storage;
    }

    public Ffmpeg getFfmpeg() {
        return ffmpeg;
    }

    public Audio getAudio() {
        return audio;
    }

    public Groq getGroq() {
        return groq;
    }

    public static class Storage {
        private String dir = "./storage";

        public String getDir() {
            return dir;
        }

        public void setDir(String dir) {
            this.dir = dir;
        }
    }

    public static class Ffmpeg {
        private String path = "ffmpeg";
        private String probePath = "ffprobe";

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public String getProbePath() {
            return probePath;
        }

        public void setProbePath(String probePath) {
            this.probePath = probePath;
        }
    }

    public static class Audio {
        private int maxDurationMinutes = 110;

        public int getMaxDurationMinutes() {
            return maxDurationMinutes;
        }

        public void setMaxDurationMinutes(int maxDurationMinutes) {
            this.maxDurationMinutes = maxDurationMinutes;
        }
    }

    public static class Groq {
        private String apiKey = "";
        private String baseUrl = "https://api.groq.com/openai/v1";
        private String transcriptionModel = "whisper-large-v3-turbo";
        private String summarizationModel = "openai/gpt-oss-120b";

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getTranscriptionModel() {
            return transcriptionModel;
        }

        public void setTranscriptionModel(String transcriptionModel) {
            this.transcriptionModel = transcriptionModel;
        }

        public String getSummarizationModel() {
            return summarizationModel;
        }

        public void setSummarizationModel(String summarizationModel) {
            this.summarizationModel = summarizationModel;
        }
    }
}
