package com.gist.email;

import java.util.List;

/** Outbound mail. One implementation today, same shape as the Groq providers. */
public interface EmailProvider {

    void send(List<String> to, String subject, String html, String text);
}
