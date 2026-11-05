import nodemailer from 'nodemailer';

let pooledTransporter: nodemailer.Transporter | null = null;

/**
 * Returns a pooled Nodemailer transporter to reuse authenticated SMTP connections
 * and prevent Google's "454 Too many login attempts" and "421 Temporary System Problem" errors.
 */
export function getMailTransporter(): nodemailer.Transporter {
  const gmailUser = (process.env.GMAIL_USER || 'resume.ai2026@gmail.com').trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (!gmailPass) {
    throw new Error('GMAIL_APP_PASSWORD is not configured in environment variables');
  }

  if (!pooledTransporter) {
    pooledTransporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1, // Strictly 1 connection at a time to prevent Google concurrent connection limits
      maxMessages: 100,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });
  }

  return pooledTransporter;
}

/**
 * Sends an email with automatic retry and exponential backoff if Google SMTP throttles.
 */
export async function sendEmailWithRetry(
  mailOptions: nodemailer.SendMailOptions,
  maxRetries = 3
): Promise<nodemailer.SentMessageInfo> {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const transporter = getMailTransporter();
      return await transporter.sendMail(mailOptions);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isThrottled =
        errMsg.includes('421') ||
        errMsg.includes('454') ||
        errMsg.includes('Too many login attempts') ||
        errMsg.includes('Temporary System Problem') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('Greeting never received');

      // Reset pooled transporter on connection/auth errors so next attempt gets a clean connection
      if (pooledTransporter) {
        try {
          pooledTransporter.close();
        } catch (_) {}
        pooledTransporter = null;
      }

      if (isThrottled && attempt < maxRetries) {
        // Backoff: 3s on attempt 1, 6s on attempt 2
        const waitMs = attempt * 3000;
        console.warn(`[Gmail SMTP Throttled] ${errMsg}. Retrying (attempt ${attempt + 1}/${maxRetries}) after ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw err;
      }
    }
  }

  throw new Error('Failed to dispatch email after maximum retries');
}
