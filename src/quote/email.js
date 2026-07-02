import { config } from '../config.js';

export function emailConfigurado() {
  return Boolean(config.resendApiKey || config.smtp.host);
}

/**
 * Envía un email con adjuntos.
 * attachments: [{ filename, content: Buffer }]
 */
export async function enviarEmail({ to, subject, html, attachments = [] }) {
  if (config.resendApiKey) return enviarConResend({ to, subject, html, attachments });
  if (config.smtp.host) return enviarConSmtp({ to, subject, html, attachments });
  throw new Error('Email no configurado: define RESEND_API_KEY o SMTP_HOST/USER/PASS');
}

async function enviarConResend({ to, subject, html, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
  return { id: data.id, via: 'resend' };
}

async function enviarConSmtp({ to, subject, html, attachments }) {
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  const info = await transporter.sendMail({
    from: config.emailFrom,
    to,
    subject,
    html,
    attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
  });
  return { id: info.messageId, via: 'smtp' };
}
