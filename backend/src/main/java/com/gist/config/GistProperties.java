package com.gist.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Everything under `gist.*` in application.yml. */
@ConfigurationProperties(prefix = "gist")
public class GistProperties {

    private final Storage storage = new Storage();
    private final Ffmpeg ffmpeg = new Ffmpeg();
    private final Audio audio = new Audio();
    private final Groq groq = new Groq();
    private final Encryption encryption = new Encryption();
    private final Auth auth = new Auth();
    private final Mail mail = new Mail();

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

    public Encryption getEncryption() {
        return encryption;
    }

    public Auth getAuth() {
        return auth;
    }

    public Mail getMail() {
        return mail;
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

    public static class Encryption {
        private String key = "";

        public String getKey() {
            return key;
        }

        public void setKey(String key) {
            this.key = key;
        }
    }

    public static class Auth {
        private String jwtSecret = "";
        private int sessionDays = 30;
        private int maxFailedLogins = 10;

        public String getJwtSecret() {
            return jwtSecret;
        }

        public void setJwtSecret(String jwtSecret) {
            this.jwtSecret = jwtSecret;
        }

        public int getSessionDays() {
            return sessionDays;
        }

        public void setSessionDays(int sessionDays) {
            this.sessionDays = sessionDays;
        }

        public int getMaxFailedLogins() {
            return maxFailedLogins;
        }

        public void setMaxFailedLogins(int maxFailedLogins) {
            this.maxFailedLogins = maxFailedLogins;
        }
    }

    public static class Mail {
        private String provider = "resend";
        private String apiKey = "";
        private String from = "Gist <onboarding@resend.dev>";
        private String baseUrl = "https://api.resend.com";
        private int maxRecipients = 10;
        private int sendsPerHour = 20;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getFrom() {
            return from;
        }

        public void setFrom(String from) {
            this.from = from;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public int getMaxRecipients() {
            return maxRecipients;
        }

        public void setMaxRecipients(int maxRecipients) {
            this.maxRecipients = maxRecipients;
        }

        public int getSendsPerHour() {
            return sendsPerHour;
        }

        public void setSendsPerHour(int sendsPerHour) {
            this.sendsPerHour = sendsPerHour;
        }
    }
}
