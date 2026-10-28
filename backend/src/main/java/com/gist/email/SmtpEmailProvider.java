package com.gist.email;

import com.gist.error.ApiException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Plain SMTP, meant for Gmail with an app password. Unlike Resend without a
 * verified domain, this delivers to any recipient.
 */
@Component
@ConditionalOnProperty(name = "gist.mail.provider", havingValue = "smtp")
public class SmtpEmailProvider implements EmailProvider {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailProvider.class);

    private final JavaMailSender sender;
    private final MailProperties mail;

    public SmtpEmailProvider(JavaMailSender sender, MailProperties mail) {
        this.sender = sender;
        this.mail = mail;
    }

    @Override
    public void send(List<String> to, String subject, String html, String text) {
        String username = mail.getUsername();
        if (username == null || username.isBlank()
                || mail.getPassword() == null || mail.getPassword().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Email is not configured on the server (GIST_SMTP_USERNAME or GIST_SMTP_PASSWORD is unset).");
        }

        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            // Gmail rewrites any other From to the signed-in account, so send as it.
            helper.setFrom(new InternetAddress(username, "Gist"));
            helper.setTo(to.toArray(String[]::new));
            helper.setSubject(subject);
            helper.setText(text, html);
            sender.send(message);
            log.info("Emailed a summary to {} recipient(s)", to.size());
        } catch (MailAuthenticationException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The mail server rejected the login. Check GIST_SMTP_USERNAME and GIST_SMTP_PASSWORD "
                            + "(for Gmail, the password must be an app password).", e);
        } catch (MailException | MessagingException | UnsupportedEncodingException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Could not send the email: " + e.getMessage(), e);
        }
    }
}
