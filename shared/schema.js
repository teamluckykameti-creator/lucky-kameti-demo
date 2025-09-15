import { pgTable, serial, text, boolean, timestamp, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';

export const entries = pgTable('entries', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(), // Ensure one email per entry
  ref: text('ref').notNull().unique(),
  paid: boolean('paid').notNull().default(false),
  status: text('status').notNull().default('active'), // active, expired, winner_paid
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  paypalOrderId: text('paypal_order_id'),
  lastPaymentDate: timestamp('last_payment_date'),
  renewalDue: timestamp('renewal_due'),
  referralCode: text('referral_code'), // Optional referral code entered by user
  referredBy: integer('referred_by').references(() => entries.id), // ID of the referrer
  referralCount: integer('referral_count').notNull().default(0), // Number of people referred
  entryCount: integer('entry_count').notNull().default(1), // Number of times member has participated (initial + renewals)
  termsAccepted: boolean('terms_accepted').notNull().default(false), // Terms and conditions acceptance
  termsAcceptedAt: timestamp('terms_accepted_at'), // When terms were accepted
});

export const winners = pgTable('winners', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  ref: text('ref').notNull(),
  entryId: integer('entry_id').references(() => entries.id),
  announceDate: timestamp('announce_date').notNull().defaultNow(),
  paymentStatus: text('payment_status').notNull().default('pending'), // pending, paid
  winningAmount: text('winning_amount').notNull().default('1000'),
  emailSent: boolean('email_sent').notNull().default(false),
  adminVerified: boolean('admin_verified').notNull().default(false),
  paidAt: timestamp('paid_at'), // When winner was marked as paid
});

export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  type: text('type').notNull(), // payment_verification, winner_notification, due_payment, renewal
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  success: boolean('success').notNull().default(false),
  errorMessage: text('error_message'),
});

export const inquiries = pgTable('inquiries', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('pending'), // pending, replied, resolved
  createdAt: timestamp('created_at').notNull().defaultNow(),
  repliedAt: timestamp('replied_at'),
  adminReply: text('admin_reply'),
});

export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const withdrawalStatusEnum = pgEnum('withdrawal_status', ['pending', 'approved', 'rejected', 'processed']);

export const withdrawalRequests = pgTable('withdrawal_requests', {
  id: serial('id').primaryKey(),
  entryId: integer('entry_id').notNull().references(() => entries.id), // Foreign key to entries table
  memberEmail: text('member_email').notNull(), // Email snapshot for audit
  memberName: text('member_name').notNull(), // Name snapshot for audit
  entryCount: integer('entry_count').notNull(), // Number of entries member has made
  totalPaid: numeric('total_paid', { precision: 12, scale: 2 }).notNull(), // Total amount paid by member
  serviceChargeAmount: numeric('service_charge_amount', { precision: 12, scale: 2 }).notNull(), // 7% service charge
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }).notNull(), // Amount to be refunded (93% of total)
  status: withdrawalStatusEnum('status').notNull().default('pending'), // Status with enum constraint
  requestDate: timestamp('request_date').notNull().defaultNow(), // When request was submitted
  adminReviewedAt: timestamp('admin_reviewed_at'), // When admin reviewed the request
  adminNotes: text('admin_notes'), // Admin notes/comments
  processedAt: timestamp('processed_at'), // When refund was processed
  paymentMethod: text('payment_method').default('paypal'), // How refund will be processed
  paypalOrderId: text('paypal_order_id'), // PayPal order ID for refund processing
});