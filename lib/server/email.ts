import type { AppEnv } from "./db";

export type EmailProviderKind = "brevo" | "resend";

export type EmailConfig = {
  provider: EmailProviderKind;
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

function envString(env: AppEnv, key: string): string {
  const fromBinding = env[key];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  const fromProcess = process.env[key];
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}

export function readEmailConfig(env: AppEnv): EmailConfig | null {
  const brevoKey = envString(env, "BREVO_API_KEY");
  const resendKey = envString(env, "RESEND_API_KEY");
  const fromEmail = envString(env, "EMAIL_FROM");
  const fromName = envString(env, "EMAIL_FROM_NAME") || "LabelLab 3D";
  if (brevoKey && fromEmail) {
    return { provider: "brevo", apiKey: brevoKey, fromEmail, fromName };
  }
  if (resendKey && fromEmail) {
    return { provider: "resend", apiKey: resendKey, fromEmail, fromName };
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function buildVerificationEmail(purpose: "register" | "reset", code: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const isReset = purpose === "reset";
  const subject = isReset
    ? `[LabelLab 3D] Mã đặt lại mật khẩu: ${code}`
    : `[LabelLab 3D] Mã xác thực đăng ký: ${code}`;
  const heading = isReset ? "Đặt lại mật khẩu LabelLab 3D" : "Xác thực email đăng ký LabelLab 3D";
  const lead = isReset
    ? "Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản LabelLab 3D. Nhập mã xác thực 6 số bên dưới để tiếp tục:"
    : "Cảm ơn bạn đã đăng ký LabelLab 3D. Nhập mã xác thực 6 số bên dưới để hoàn tất tạo tài khoản:";
  const text = `${heading}\n\n${lead}\n\nMã xác thực: ${code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.`;
  const html = `<!doctype html>
<html lang="vi">
<body style="margin:0;padding:24px;background:#fff5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#3d1e2e;">
  <div style="max-width:480px;margin:0 auto;padding:28px 26px;background:#ffffff;border:1px solid #f2d5e0;border-radius:20px;">
    <p style="margin:0 0 8px;color:#b83160;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">LABELLAB 3D</p>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#2b1622;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#664656;">${escapeHtml(lead)}</p>
    <div style="margin:0 0 22px;padding:18px 16px;border-radius:14px;background:#fff4f8;border:1px dashed #d7638b;text-align:center;">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:800;letter-spacing:.22em;color:#9e2350;">${escapeHtml(spaced)}</span>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#856776;">Mã có hiệu lực trong <strong>10 phút</strong> và chỉ dùng một lần. Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email này.</p>
  </div>
</body>
</html>`;
  return { subject, text, html };
}

export async function sendVerificationEmail(
  env: AppEnv,
  input: { to: string; purpose: "register" | "reset"; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ provider: EmailProviderKind }> {
  const config = readEmailConfig(env);
  if (!config) throw new Error("EMAIL_NOT_CONFIGURED");
  const content = buildVerificationEmail(input.purpose, input.code);

  if (config.provider === "brevo") {
    const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.fromName, email: config.fromEmail },
        to: [{ email: input.to }],
        subject: content.subject,
        htmlContent: content.html,
        textContent: content.text,
      }),
    });
    if (!response.ok) throw new Error("EMAIL_SEND_FAILED");
    return { provider: "brevo" };
  }

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [input.to],
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
  });
  if (!response.ok) throw new Error("EMAIL_SEND_FAILED");
  return { provider: "resend" };
}
