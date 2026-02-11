import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// For testing: use onboarding@resend.dev as sender
// For production: use your verified domain (e.g., notifications@yourdomain.com)
const FROM_EMAIL = 'FeedbackLab <onboarding@resend.dev>';

// Check if API key is configured
const hasApiKey = !!process.env.RESEND_API_KEY;
if (!hasApiKey) {
  console.warn('[EMAIL] ⚠️  RESEND_API_KEY not configured - emails will fail');
} else {
  console.log('[EMAIL] ✓ Resend API key configured');
}

interface SendFeedbackEmailParams {
  to: string;
  studentName: string;
  assignmentName: string;
  feedbackUrl: string;
  instructorName?: string;
}

export async function sendFeedbackEmail({
  to,
  studentName,
  assignmentName,
  feedbackUrl,
  instructorName = 'Your Instructor'
}: SendFeedbackEmailParams, retryCount = 0): Promise<{ success: boolean; error?: string }> {
  const MAX_RETRIES = 3;
  const startTime = Date.now();
  const logPrefix = `[EMAIL] [${studentName} <${to}>]`;

  if (retryCount === 0) {
    console.log(`${logPrefix} Sending feedback email for "${assignmentName}"...`);
  } else {
    console.log(`${logPrefix} Retry ${retryCount}/${MAX_RETRIES}...`);
  }

  if (!hasApiKey) {
    console.error(`${logPrefix} ✗ Failed: RESEND_API_KEY not configured`);
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Feedback Ready: ${assignmentName}`,
      html: buildFeedbackEmailHtml({ studentName, assignmentName, feedbackUrl, instructorName })
    });

    const duration = Date.now() - startTime;

    if (error) {
      // Check for rate limit error and retry
      if (error.name === 'rate_limit_exceeded' && retryCount < MAX_RETRIES) {
        const retryDelay = 1000 * (retryCount + 1); // 1s, 2s, 3s
        console.log(`${logPrefix} Rate limited, waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return sendFeedbackEmail({ to, studentName, assignmentName, feedbackUrl, instructorName }, retryCount + 1);
      }

      console.error(`${logPrefix} ✗ Failed after ${duration}ms:`, error.message);
      console.error(`${logPrefix}   Error details:`, JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }

    console.log(`${logPrefix} ✓ Sent successfully in ${duration}ms`);
    console.log(`${logPrefix}   Email ID: ${data?.id}`);
    console.log(`${logPrefix}   Feedback URL: ${feedbackUrl}`);
    return { success: true };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`${logPrefix} ✗ Exception after ${duration}ms:`, err.message);
    if (err.stack) {
      console.error(`${logPrefix}   Stack:`, err.stack);
    }
    return { success: false, error: err.message || 'Failed to send email' };
  }
}

function buildFeedbackEmailHtml({
  studentName,
  assignmentName,
  feedbackUrl,
  instructorName
}: {
  studentName: string;
  assignmentName: string;
  feedbackUrl: string;
  instructorName: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Ready</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                FeedbackLab
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hi ${studentName},
              </p>

              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                Your feedback for <strong>${assignmentName}</strong> is now available. Click the button below to view your personalized feedback, including:
              </p>

              <ul style="margin: 0 0 32px; padding-left: 24px; color: #374151; font-size: 16px; line-height: 1.8;">
                <li>Inline comments on your work</li>
                <li>Feedback for each rubric criterion</li>
                <li>Overall summary with next steps</li>
                <li>AI assistant to answer your questions</li>
              </ul>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${feedbackUrl}"
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
                      View My Feedback
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Or copy this link into your browser:
              </p>
              <p style="margin: 0 0 32px; color: #4f46e5; font-size: 14px; word-break: break-all;">
                ${feedbackUrl}
              </p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong>${instructorName}</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This email was sent by FeedbackLab. If you have questions about your feedback, use the chat feature on the feedback page.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Batch send emails for multiple students
export async function sendBatchFeedbackEmails(
  emails: SendFeedbackEmailParams[]
): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const batchStartTime = Date.now();
  const totalEmails = emails.length;

  console.log('[EMAIL] ════════════════════════════════════════');
  console.log(`[EMAIL] Starting batch send: ${totalEmails} email(s)`);
  console.log('[EMAIL] ════════════════════════════════════════');

  const results = { sent: 0, failed: [] as { email: string; error: string }[] };

  for (let i = 0; i < emails.length; i++) {
    const emailParams = emails[i];
    console.log(`[EMAIL] [${i + 1}/${totalEmails}] Processing...`);

    const result = await sendFeedbackEmail(emailParams);
    if (result.success) {
      results.sent++;
    } else {
      results.failed.push({ email: emailParams.to, error: result.error || 'Unknown error' });
    }

    // Delay between emails to respect Resend rate limit (2 requests/second)
    if (i < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }

  const batchDuration = Date.now() - batchStartTime;

  console.log('[EMAIL] ════════════════════════════════════════');
  console.log(`[EMAIL] Batch complete in ${batchDuration}ms`);
  console.log(`[EMAIL]   ✓ Sent: ${results.sent}`);
  console.log(`[EMAIL]   ✗ Failed: ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log('[EMAIL]   Failed recipients:');
    results.failed.forEach(f => {
      console.log(`[EMAIL]     - ${f.email}: ${f.error}`);
    });
  }
  console.log('[EMAIL] ════════════════════════════════════════');

  return results;
}
