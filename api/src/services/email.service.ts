import nodemailer from 'nodemailer'

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

const FROM = process.env.SMTP_FROM ?? 'OptraAssistant <no-reply@optraassistant.com>'

export async function sendEmailVerificationOtp(to: string, name: string, otp: string) {
  const transport = getTransport()
  if (!transport) {
    console.log(`[DEV] Email OTP for ${to}: ${otp}`)
    return
  }
  await transport.sendMail({
    from: FROM,
    to,
    subject: 'Verify your OptraAssistant email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Hi ${name},</h2>
        <p>Enter this code to verify your email address. It expires in 15 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px 0;background:#f1f5f9;border-radius:8px;margin:20px 0">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px">If you didn't create an OptraAssistant account, ignore this email.</p>
      </div>`,
  })
}

export async function sendPasswordResetOtp(to: string, name: string, otp: string) {
  const transport = getTransport()
  if (!transport) {
    console.log(`[DEV] Password reset OTP for ${to}: ${otp}`)
    return
  }
  await transport.sendMail({
    from: FROM,
    to,
    subject: 'Reset your OptraAssistant password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Hi ${name},</h2>
        <p>Use this code to reset your password. It expires in 15 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px 0;background:#f1f5f9;border-radius:8px;margin:20px 0">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:13px">If you didn't request a password reset, ignore this email.</p>
      </div>`,
  })
}
