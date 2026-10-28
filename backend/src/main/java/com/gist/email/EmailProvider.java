package com.gist.email;

import java.util.List;

/** Outbound mail. Resend or SMTP, picked by {@code gist.mail.provider}. */
public interface EmailProvider {

    void send(List<String> to, String subject, String html, String text);
}
