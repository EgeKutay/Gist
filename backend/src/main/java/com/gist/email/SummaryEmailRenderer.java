package com.gist.email;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Renders a summary as HTML with a plain-text alternative.
 *
 * <p>Section order and the rule that empty sections vanish entirely both match
 * the detail screen, so the mail and the app never disagree about what a
 * summary contains.
 */
@Component
public class SummaryEmailRenderer {

    /** Same order the detail screen uses. */
    private static final List<Section> SECTIONS = List.of(
            new Section("completed", "Completed"),
            new Section("blockers", "Blockers"),
            new Section("pending_confirmation", "Pending confirmation"),
            new Section("open_questions", "Open questions"),
            new Section("action_items", "Action items"),
            new Section("next_steps", "Next steps"));

    private record Section(String key, String label) {
    }

    public String subject(String title) {
        return "Summary: " + title;
    }

    public String html(String title, Map<String, Object> summary) {
        StringBuilder b = new StringBuilder();
        b.append("<div style=\"font-family:-apple-system,Segoe UI,sans-serif;")
                .append("max-width:640px;margin:0 auto;padding:24px;color:#1C1A17;")
                .append("background:#FBFAF8;\">");
        b.append("<h1 style=\"font-size:20px;margin:0 0 20px;\">")
                .append(HtmlUtils.htmlEscape(title)).append("</h1>");

        String outcomes = asString(summary.get("key_outcomes"));
        if (!outcomes.isBlank()) {
            b.append(heading("Key outcomes"));
            b.append("<p style=\"font-size:15px;line-height:1.6;color:#3A362F;margin:0 0 20px;\">")
                    .append(HtmlUtils.htmlEscape(outcomes)).append("</p>");
        }

        List<Map<String, Object>> decisions = asMapList(summary.get("decisions_made"));
        if (!decisions.isEmpty()) {
            b.append(heading("Decisions made"));
            for (Map<String, Object> d : decisions) {
                b.append("<div style=\"margin:0 0 12px;\">")
                        .append("<div style=\"font-size:15px;font-weight:600;\">")
                        .append(HtmlUtils.htmlEscape(asString(d.get("title")))).append("</div>")
                        .append("<div style=\"font-size:14px;line-height:1.5;color:#6B655C;\">")
                        .append(HtmlUtils.htmlEscape(asString(d.get("detail")))).append("</div>")
                        .append("</div>");
            }
            b.append("<div style=\"height:8px;\"></div>");
        }

        for (Section section : SECTIONS) {
            List<String> items = asStringList(summary.get(section.key()));
            if (items.isEmpty()) {
                continue;   // empty sections are absent, exactly as on screen
            }
            b.append(heading(section.label()));
            b.append("<ul style=\"margin:0 0 20px;padding-left:20px;\">");
            for (String item : items) {
                b.append("<li style=\"font-size:15px;line-height:1.5;color:#3A362F;margin:0 0 6px;\">")
                        .append(HtmlUtils.htmlEscape(item)).append("</li>");
            }
            b.append("</ul>");
        }

        b.append("<p style=\"font-size:12px;color:#9A938A;border-top:1px solid #E8E4DE;")
                .append("padding-top:14px;margin-top:8px;\">Sent from Gist.</p>");
        b.append("</div>");
        return b.toString();
    }

    public String text(String title, Map<String, Object> summary) {
        StringBuilder b = new StringBuilder();
        b.append(title).append("\n\n");

        String outcomes = asString(summary.get("key_outcomes"));
        if (!outcomes.isBlank()) {
            b.append("KEY OUTCOMES\n").append(outcomes).append("\n\n");
        }

        List<Map<String, Object>> decisions = asMapList(summary.get("decisions_made"));
        if (!decisions.isEmpty()) {
            b.append("DECISIONS MADE\n");
            for (Map<String, Object> d : decisions) {
                b.append("  - ").append(asString(d.get("title"))).append("\n");
                String detail = asString(d.get("detail"));
                if (!detail.isBlank()) {
                    b.append("    ").append(detail).append("\n");
                }
            }
            b.append("\n");
        }

        for (Section section : SECTIONS) {
            List<String> items = asStringList(summary.get(section.key()));
            if (items.isEmpty()) {
                continue;
            }
            b.append(section.label().toUpperCase()).append("\n");
            for (String item : items) {
                b.append("  - ").append(item).append("\n");
            }
            b.append("\n");
        }
        return b.toString();
    }

    private String heading(String label) {
        return "<div style=\"font-size:11px;letter-spacing:1.2px;text-transform:uppercase;"
                + "color:#6B655C;margin:0 0 8px;\">" + HtmlUtils.htmlEscape(label) + "</div>";
    }

    private String asString(Object value) {
        return value == null ? "" : value.toString().strip();
    }

    private List<String> asStringList(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                String s = asString(item);
                if (!s.isBlank()) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asMapList(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    out.add((Map<String, Object>) map);
                }
            }
        }
        return out;
    }
}
