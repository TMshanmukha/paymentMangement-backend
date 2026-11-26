import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Sends a clean, simple password reset email featuring the school name,
 * the customized Vedavyas header banner, and the direct reset password link.
 */
export async function sendPasswordResetLinkEmail({ email, resetUrl, minutesValid = 15, schoolName = 'VEDAVYAS E.M SCHOOL' }) {
  const smtpUser = (env.SMTP_USER || process.env.SMTP_USER || '').trim();
  const smtpPass = (env.SMTP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const brevoKey = (env.BREVO_API_KEY || process.env.BREVO_API_KEY || '').trim();
  const brevoSender = (env.BREVO_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || smtpUser || '').trim();
  const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const fromEmail = env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'EduLedger Security <onboarding@resend.dev>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${schoolName} - Password Reset</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    
    <!-- Customized Website Header Banner -->
    <div style="background:#0c0a09;border-radius:8px;padding:20px 16px;text-align:center;margin-bottom:20px;border-bottom:3px solid #f05a3e;">
      <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:8px;color:#ffffff;text-transform:uppercase;margin:0 0 6px 8px;">
        VEDAVYAS
      </div>
      <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:3px;color:#f05a3e;text-transform:uppercase;margin:0 0 0 3px;">
        EDUCATIONAL INSTITUTION
      </div>
    </div>

    <!-- School Name & Subject -->
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">${schoolName}</h2>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Administrator Password Reset</p>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px;text-align:center;">
      A request was received to reset the password for your administrator account. Click the button below to set your new password:
    </p>

    <!-- Direct Reset Link Button -->
    <div style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="background-color:#4f46e5;color:#ffffff;padding:14px 32px;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;display:inline-block;box-shadow:0 4px 12px rgba(79,70,229,0.3);">
        Click Here to Reset Password
      </a>
      <p style="color:#dc2626;font-size:12px;font-weight:600;margin:14px 0 0;">
        Link is valid for ${minutesValid} minutes
      </p>
    </div>

    <div style="border-top:1px solid #f1f5f9;margin-top:24px;padding-top:14px;text-align:center;font-size:11px;color:#94a3b8;">
      If you did not request this, please ignore this email. Your password will remain unchanged.
    </div>

  </div>
</body>
</html>`;

  console.log(`[AUTH] Dispatching password reset email to ${email}: ${resetUrl}`);
  const errors = [];

  // 1. Primary: Gmail / Custom SMTP via Nodemailer (IPv4 forced, tries port 465 then 587)
  if (smtpUser && smtpPass) {
    const portsToTry = Array.from(new Set([Number(env.SMTP_PORT || 465), 587]));
    for (const port of portsToTry) {
      try {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST || 'smtp.gmail.com',
          port,
          secure: port === 465,
          requireTLS: port === 587,
          family: 4, // Force IPv4 to avoid ENETUNREACH on cloud hosts
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: `"${schoolName} Security" <${smtpUser}>`,
          to: email,
          subject: `${schoolName} - Reset Your Admin Password 🔐`,
          html,
        });

        console.log(`[AUTH] Password reset email sent via SMTP (port ${port}) to ${email} (messageId: ${info.messageId})`);
        return { sent: true, provider: 'smtp', messageId: info.messageId };
      } catch (err) {
        console.error(`Failed to send email via SMTP (port ${port}):`, err.message);
        errors.push(`SMTP(${port}): ${err.message}`);
      }
    }
  }

  // 2. Secondary: Brevo HTTP API (port 443, works on all cloud hosts & any verified Gmail sender)
  if (brevoKey && brevoSender) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: `${schoolName} Security`, email: brevoSender },
          to: [{ email }],
          subject: `${schoolName} - Reset Your Admin Password 🔐`,
          htmlContent: html,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Brevo API error:', data);
        throw new Error(data.message || 'Failed to send reset email via Brevo');
      }
      console.log(`[AUTH] Password reset email sent via Brevo to ${email}`);
      return { sent: true, provider: 'brevo', data };
    } catch (err) {
      console.error('Failed to send email via Brevo API:', err.message);
      errors.push(`Brevo: ${err.message}`);
    }
  }

  // 3. Tertiary: Resend API fallback
  if (apiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `${schoolName} - Reset Your Admin Password 🔐`,
          html,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Resend API error:', data);
        throw new Error(data.message || 'Failed to send reset email');
      }
      return data;
    } catch (err) {
      console.error('Failed to send email via Resend API:', err.message);
      errors.push(`Resend: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(502, `Could not deliver password reset email (${errors[0]}). Please check email server configuration.`, 'EMAIL_DELIVERY_FAILED');
    }
    return { fallback: true, error: errors.join(' | '), resetUrl };
  }

  console.log(`[DEV MODE] No SMTP, Brevo, or Resend credentials configured. Reset URL for ${email}: ${resetUrl}`);
  return { mock: true, resetUrl };
}

// Backward compatibility alias
export async function sendPasswordResetOtpEmail(params) {
  return sendPasswordResetLinkEmail(params);
}
