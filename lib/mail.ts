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
 * Sends an email with automatic retry and exponential backoff for transient errors.
 * Note: If Google returns 454 (Too many login attempts), it indicates an active account security
 * cooldown, so we do NOT retry immediately to avoid prolonging the security lock.
 */
export async function sendEmailWithRetry(
  mailOptions: nodemailer.SendMailOptions,
  maxRetries = 2
): Promise<nodemailer.SentMessageInfo> {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const transporter = getMailTransporter();
      return await transporter.sendMail(mailOptions);
    } catch (err: any) {
      const errMsg = err?.message || String(err);

      // 454 is a Google security cooldown (tempauth) lasting 10-15 minutes.
      // Retrying in seconds will fail and reset Google's lockout timer.
      const isAccountLockout =
        errMsg.includes('454') || errMsg.includes('Too many login attempts');

      if (isAccountLockout) {
        if (pooledTransporter) {
          try { pooledTransporter.close(); } catch (_) {}
          pooledTransporter = null;
        }
        throw new Error(
          `Google SMTP security cool-down in progress (454 Too many login attempts). Please wait ~10 minutes for Google to lift the rate limit.`
        );
      }

      // Transient errors (421 system load, socket drops, timeouts) can be retried
      const isTransient =
        errMsg.includes('421') ||
        errMsg.includes('Temporary System Problem') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('Greeting never received');

      if (pooledTransporter) {
        try { pooledTransporter.close(); } catch (_) {}
        pooledTransporter = null;
      }

      if (isTransient && attempt < maxRetries) {
        const waitMs = attempt * 2500;
        console.warn(`[Gmail SMTP Transient Error] ${errMsg}. Retrying in ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw err;
      }
    }
  }

  throw new Error('Failed to dispatch email after retry attempts');
}
