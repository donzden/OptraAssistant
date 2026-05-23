// Mock nodemailer to avoid real SMTP connections
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' })
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail })

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}))

import { sendEmailVerificationOtp, sendPasswordResetOtp } from '../services/email.service'

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.SMTP_HOST
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  delete process.env.SMTP_PORT
})

describe('sendEmailVerificationOtp', () => {
  it('logs OTP to console when SMTP is not configured (dev mode)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    await sendEmailVerificationOtp('user@example.com', 'Alice', '123456')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('123456')
    )
    consoleSpy.mockRestore()
  })

  it('does not call nodemailer when SMTP is not configured', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    await sendEmailVerificationOtp('user@example.com', 'Alice', '123456')
    expect(mockSendMail).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it('calls nodemailer.sendMail with correct subject when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_USER = 'user@example.com'
    process.env.SMTP_PASS = 'secret'

    await sendEmailVerificationOtp('recipient@example.com', 'Bob', '654321')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: expect.stringContaining('Verify'),
        html: expect.stringContaining('654321'),
      })
    )
  })

  it('includes recipient name in email body', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_USER = 'user@example.com'

    await sendEmailVerificationOtp('recipient@example.com', 'Bob', '654321')

    const htmlBody = mockSendMail.mock.calls[0][0].html as string
    expect(htmlBody).toContain('Bob')
  })
})

describe('sendPasswordResetOtp', () => {
  it('logs OTP to console when SMTP is not configured (dev mode)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    await sendPasswordResetOtp('user@example.com', 'Alice', '999888')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('999888')
    )
    consoleSpy.mockRestore()
  })

  it('calls nodemailer.sendMail with password reset subject when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_USER = 'user@example.com'

    await sendPasswordResetOtp('recipient@example.com', 'Carol', '112233')

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: expect.stringContaining('Reset'),
        html: expect.stringContaining('112233'),
      })
    )
  })
})
