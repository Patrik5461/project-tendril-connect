import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(5).max(2000),
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("RESEND_API_KEY not configured");

    const to = process.env["CONTACT_EMAIL_TO"] ?? "info@tendrik.sk";
    const from = process.env["CONTACT_EMAIL_FROM"] ?? "Tendrik <novinky@tendrik.sk>";

    const html = `<!doctype html><html lang="sk"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border:2px solid #0a0a0a;">
    <tr><td style="padding:18px 22px;border-bottom:2px solid #0a0a0a;font-weight:800;font-size:16px;">
      <span style="display:inline-block;width:12px;height:12px;background:#dc2626;margin-right:8px;"></span>Nová správa z kontaktného formulára
    </td></tr>
    <tr><td style="padding:22px;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 6px 0;"><strong>Meno:</strong> ${escapeHtml(data.name)}</p>
      <p style="margin:0 0 6px 0;"><strong>E-mail:</strong> ${escapeHtml(data.email)}</p>
      <p style="margin:16px 0 6px 0;"><strong>Správa:</strong></p>
      <div style="white-space:pre-wrap;border-left:3px solid #dc2626;padding-left:12px;">${escapeHtml(data.message)}</div>
    </td></tr>
  </table>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: data.email,
        subject: `Kontakt z tendrik.sk – ${data.name}`,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Resend contact error ${res.status}: ${text}`);
      throw new Error("send_failed");
    }

    return { sent: true as const };
  });
