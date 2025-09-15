import nodemailer from 'nodemailer';
import { db } from '../server/db.js';
import { emailLogs } from '../shared/schema.js';

// Create Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Email templates
const emailTemplates = {
  paymentVerification: (memberName, amount, ref) => ({
    subject: '✅ Payment Verified - Lucky kameti',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
        <div style="background: #0a1a2f; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; color: #d4af37;">🎉 Payment Verified!</h2>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
          <p>Dear ${memberName},</p>
          <p>Your payment of <strong>$${amount}</strong> has been successfully verified by our admin team.</p>
          <p><strong>Your Reference:</strong> ${ref}</p>
          <p>You are now officially entered into this month's Lucky kameti draw!</p>
          <p>Winner will be announced on the 1st of next month at midnight.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Lucky kameti Team<br>
            <a href="mailto:${process.env.GMAIL_USER}">${process.env.GMAIL_USER}</a>
          </p>
        </div>
      </div>
    `
  }),

  winnerNotification: (memberName, amount, ref) => ({
    subject: '🎊 CONGRATULATIONS! You Won Lucky kameti!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
        <div style="background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%); color: #0a1a2f; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 32px;">🎊 WINNER! 🎊</h1>
          <h2 style="margin: 10px 0;">Lucky kameti</h2>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 18px; color: #2a4f2a;"><strong>Congratulations ${memberName}!</strong></p>
          <p>You have been selected as this month's Lucky kameti winner!</p>
          <div style="background: #2a4f2a; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h3 style="margin: 0;">Your Winning Amount: $${amount}</h3>
            <p style="margin: 5px 0;">Reference: ${ref}</p>
          </div>
          <p><strong>What happens next:</strong></p>
          <ul>
            <li>Our admin team will contact you shortly for payment processing</li>
            <li>You will be removed from the kameti after payment is processed</li>
            <li>You can re-join anytime for future draws</li>
          </ul>
          <p>Thank you for being part of Lucky kameti!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Lucky kameti Team<br>
            <a href="mailto:${process.env.GMAIL_USER}">${process.env.GMAIL_USER}</a>
          </p>
        </div>
      </div>
    `
  }),

  duePaymentReminder: (memberName, dueDate) => ({
    subject: '⏰ Payment Due Reminder - Lucky kameti',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
        <div style="background: #ff6b6b; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0;">⏰ Payment Due Reminder</h2>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
          <p>Dear ${memberName},</p>
          <p>This is a friendly reminder that your Lucky kameti payment is due by <strong>${dueDate}</strong>.</p>
          <p><strong>Amount Due:</strong> $50 USD</p>
          <p><strong>Important:</strong> If payment is not made by the 30th, your entry will be automatically removed.</p>
          <p>You can make your payment by visiting our website and following the PayPal payment process.</p>
          <p>Don't miss your chance to win $1,000!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Lucky kameti Team<br>
            <a href="mailto:${process.env.GMAIL_USER}">${process.env.GMAIL_USER}</a>
          </p>
        </div>
      </div>
    `
  }),

  renewalNotification: (memberName) => ({
    subject: '🔄 Renew Your Lucky kameti Membership',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
        <div style="background: #0a1a2f; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; color: #d4af37;">🔄 Renew Your Membership</h2>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
          <p>Hello ${memberName},</p>
          <p>Welcome back to Lucky kameti! We see you were previously a member.</p>
          <p>To renew your membership for this month's draw:</p>
          <ul>
            <li>Entry Fee: $50 USD</li>
            <li>Winning Prize: $1,000 USD</li>
            <li>Payment Deadline: 30th of the month</li>
          </ul>
          <p>Visit our website to complete your payment and secure your spot in this month's draw!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Lucky kameti Team<br>
            <a href="mailto:${process.env.GMAIL_USER}">${process.env.GMAIL_USER}</a>
          </p>
        </div>
      </div>
    `
  }),

  inquiryReply: (memberName, originalSubject, adminReply) => ({
    subject: `Re: ${originalSubject} - Lucky kameti Support`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
        <div style="background: #0a1a2f; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; color: #d4af37;">💬 Support Response</h2>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
          <p>Dear ${memberName},</p>
          <p>Thank you for contacting Lucky kameti support. Here is our response to your inquiry:</p>
          <div style="background: #f8f9fa; border-left: 4px solid #d4af37; padding: 15px; margin: 20px 0;">
            <h4 style="color: #d4af37; margin-top: 0;">Admin Response:</h4>
            <p style="margin: 0; white-space: pre-line;">${adminReply}</p>
          </div>
          <p>If you have any additional questions or need further assistance, please don't hesitate to contact us.</p>
          <p>Thank you for being part of Lucky kameti!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Lucky kameti Support Team<br>
            <a href="mailto:${process.env.GMAIL_USER}">${process.env.GMAIL_USER}</a>
          </p>
        </div>
      </div>
    `
  })
};

// Send email function
export async function sendEmail(to, templateType, templateData) {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('Gmail credentials not configured');
    }

    const template = emailTemplates[templateType];
    if (!template) {
      throw new Error(`Email template '${templateType}' not found`);
    }

    const emailContent = template(...templateData);
    
    const mailOptions = {
      from: `"Lucky kameti" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: emailContent.subject,
      html: emailContent.html
    };

    const result = await transporter.sendMail(mailOptions);
    
    // Log email
    await db.insert(emailLogs).values({
      email: to,
      subject: emailContent.subject,
      type: templateType,
      success: true
    });

    console.log(`✅ Email sent to ${to}: ${emailContent.subject}`);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error(`❌ Email failed to ${to}:`, error.message);
    
    // Log failed email
    try {
      await db.insert(emailLogs).values({
        email: to,
        subject: emailTemplates[templateType] ? emailTemplates[templateType](...templateData).subject : 'Unknown',
        type: templateType,
        success: false,
        errorMessage: error.message
      });
    } catch (logError) {
      console.error('Failed to log email error:', logError);
    }
    
    return { success: false, error: error.message };
  }
}

// Verify transporter connection
export async function verifyEmailService() {
  try {
    await transporter.verify();
    console.log('✅ Email service is ready');
    return true;
  } catch (error) {
    console.error('❌ Email service error:', error);
    return false;
  }
}