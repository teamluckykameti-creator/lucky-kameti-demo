import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import csrf from "csrf";
import { db } from "./server/db.js";
import { entries, winners, emailLogs, inquiries, withdrawalRequests } from "./shared/schema.js";
import { eq, sql, and, gt } from "drizzle-orm";
import { sendEmail, verifyEmailService } from "./services/emailService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// CORS configuration for Vercel deployment
const allowedOrigins = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  /\.vercel\.app$/,
  /localhost:\d+$/,
  'https://localhost:3000',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  credentials: true
}));

// Simple CSRF protection for serverless (stateless)
const CSRF_SECRET = process.env.CSRF_SECRET || 'serverless-csrf-secret-key';

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// CSRF protection setup
const tokens = csrf();

// Database storage now handled by PostgreSQL

// ---- ADMIN PANEL ROUTES ----
// Security headers for admin panel
app.use('/admin', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none';");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get("/admin", verifyAdminToken, (req, res) => {
  res.redirect("/admin/dashboard.html");
});

app.get("/admin/login", (req, res) => {
  res.redirect("/admin/login.html");
});

app.get("/admin/dashboard", verifyAdminToken, (req, res) => {
  res.redirect("/admin/dashboard.html");
});

// ---- CONFIG ENDPOINT ----
app.get("/config", (req, res) => {
  if (!validatePayPalCredentials()) {
    return res.status(503).json({ 
      error: "PayPal service temporarily unavailable. Please contact support.",
      paypalClientId: null
    });
  }
  
  res.json({
    paypalClientId: PAYPAL_CLIENT
  });
});

// CSRF token endpoint for admin operations (stateless)
app.get('/admin/csrf-token', verifyAdminToken, (req, res) => {
  const token = tokens.create(CSRF_SECRET);
  res.json({ csrfToken: token });
});

// ---- PAYPAL CONFIG ----
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || "";
const PAYPAL_API = "https://api-m.sandbox.paypal.com";

// Helper function to validate PayPal credentials per endpoint
function validatePayPalCredentials() {
  if (!PAYPAL_CLIENT || !PAYPAL_SECRET) {
    console.error("❌ PayPal credentials missing. Please set PAYPAL_CLIENT_ID and PAYPAL_SECRET environment variables.");
    return false;
  }
  return true;
}

async function generateAccessToken() {
  const auth = Buffer.from(PAYPAL_CLIENT + ":" + PAYPAL_SECRET).toString("base64");
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json();
  return data.access_token;
}

// ---- CREATE ORDER ----
app.post("/create-order", async (req, res) => {
  try {
    if (!validatePayPalCredentials()) {
      return res.status(503).json({ 
        error: "Payment service temporarily unavailable. Please try again later or contact support." 
      });
    }
    
    const accessToken = await generateAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: "50.00" }
        }]
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- CHECK EMAIL STATUS ----
app.post("/check-email", async (req, res) => {
  const { email } = req.body;
  
  try {
    // Check if email exists in entries
    const [existingEntry] = await db.select().from(entries).where(eq(entries.email, email));
    
    if (existingEntry) {
      const status = existingEntry.status;
      
      if (status === 'active') {
        return res.json({ 
          exists: true, 
          status: 'active', 
          message: 'You are already registered and active for this month.' 
        });
      } else if (status === 'expired') {
        return res.json({ 
          exists: true, 
          status: 'expired', 
          message: 'Your membership has expired. Please renew to participate.' 
        });
      } else if (status === 'winner_paid') {
        return res.json({ 
          exists: true, 
          status: 'winner_paid', 
          message: 'You were a previous winner. You can register again for new draws.' 
        });
      }
    }
    
    return res.json({ exists: false, message: 'Email available for registration.' });
  } catch (error) {
    console.error("❌ Error checking email:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- VALIDATE REFERRAL CODE ----
app.post("/validate-referral", async (req, res) => {
  const { referralCode } = req.body;
  
  try {
    if (!referralCode || referralCode.trim() === '') {
      return res.json({ valid: false, message: 'Please enter a referral code.' });
    }
    
    // Find entry with this reference code (active entries only)
    const [referrer] = await db.select()
      .from(entries)
      .where(eq(entries.ref, referralCode.trim()));
    
    if (referrer && referrer.status === 'active') {
      return res.json({ 
        valid: true, 
        referrerName: referrer.name,
        referrerId: referrer.id,
        message: `Valid referral from ${referrer.name}` 
      });
    } else if (referrer && referrer.status !== 'active') {
      return res.json({ 
        valid: false, 
        message: 'This referral code belongs to an inactive member.' 
      });
    } else {
      return res.json({ 
        valid: false, 
        message: 'Invalid referral code. Please check and try again.' 
      });
    }
  } catch (error) {
    console.error("❌ Error validating referral:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- CAPTURE ORDER ----
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID, name, email, referralCode, termsAccepted } = req.body;
    
    // Validate PayPal credentials first
    if (!validatePayPalCredentials()) {
      return res.status(503).json({ 
        error: "Payment service temporarily unavailable. Please try again later or contact support." 
      });
    }
    
    // Enforce terms acceptance requirement
    if (!termsAccepted) {
      console.error("❌ Terms and conditions not accepted");
      return res.status(400).json({ error: "Terms and conditions must be accepted" });
    }
    
    // First check if email already exists
    const [existingEntry] = await db.select().from(entries).where(eq(entries.email, email));
    
    if (existingEntry && existingEntry.status === 'active') {
      return res.status(400).json({ error: "This email is already registered and active." });
    }

    const accessToken = await generateAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    
    // Verify PayPal capture was successful
    if (!response.ok || data.status !== "COMPLETED") {
      console.error("❌ Payment capture failed:", data);
      return res.status(400).json({ 
        error: "Payment capture failed", 
        details: data.details || data 
      });
    }

    // Verify payment amount matches expected
    const capturedAmount = data.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    if (!capturedAmount || capturedAmount.value !== "50.00" || capturedAmount.currency_code !== "USD") {
      console.error("❌ Payment amount mismatch:", capturedAmount);
      return res.status(400).json({ error: "Payment amount verification failed" });
    }

    // ✅ Generate unique reference number and save entry to database
    let ref;
    let attempts = 0;
    const maxAttempts = 5;
    
    // Try to generate unique reference and save entry
    while (attempts < maxAttempts) {
      ref = existingEntry ? existingEntry.ref : "DW" + Math.floor(Math.random() * 90000 + 10000);
      attempts++;
      
      try {
        // Validate referral code server-side if provided
        let validatedReferrer = null;
        if (referralCode) {
          const [referrer] = await db.select().from(entries)
            .where(eq(entries.ref, referralCode));
          
          if (!referrer) {
            console.error("❌ Invalid referral code:", referralCode);
            return res.status(400).json({ error: "Invalid referral code" });
          }
          
          if (referrer.status !== 'active') {
            console.error("❌ Inactive referrer:", referralCode);
            return res.status(400).json({ error: "Referrer is not active" });
          }
          
          // Prevent self-referral
          if (referrer.email === email) {
            console.error("❌ Self-referral attempt:", email);
            return res.status(400).json({ error: "Self-referral is not allowed" });
          }
          
          validatedReferrer = referrer;
        }

        // Check if this is a renewal or new entry
        if (existingEntry) {
          // Update existing entry for renewal
          const renewalData = {
            name,
            status: 'active',
            paid: true,
            paypalOrderId: data.id, // Store captured order ID, not client order ID
            lastPaymentDate: new Date(),
            renewalDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            entryCount: sql`entry_count + 1` // Increment entry count for renewal
          };
          
          // For renewals, don't allow changing referrer (preserve data integrity)
          // Only allow setting referrer if none exists
          if (validatedReferrer && !existingEntry.referredBy) {
            renewalData.referralCode = referralCode;
            renewalData.referredBy = validatedReferrer.id;
          }
          
          // Store terms acceptance for renewal
          if (termsAccepted) {
            renewalData.termsAccepted = termsAccepted;
            renewalData.termsAcceptedAt = new Date();
          }
          
          const [updatedEntry] = await db.update(entries)
            .set(renewalData)
            .where(eq(entries.email, email))
            .returning();
            
          // Increment referral count for referrer if this is a new referral
          if (validatedReferrer && !existingEntry.referredBy) {
            await db.update(entries)
              .set({ referralCount: sql`referral_count + 1` })
              .where(eq(entries.id, validatedReferrer.id));
          }
            
          console.log("✅ Payment Captured:", data.id);
          console.log("✅ Membership Renewed:", { name, email, ref: existingEntry.ref, referral: referralCode || 'none' });
          
          // Send automated renewal confirmation email
          await sendAutomatedEmail(email, 'payment_confirmation_renewal', {
            name: name,
            ref: existingEntry.ref
          });
          
          return res.json({ success: true, ref: existingEntry.ref, renewed: true });
        } else {
          // Create new entry
          const newEntryData = {
            name,
            email,
            ref,
            paid: true,
            status: 'active',
            paypalOrderId: data.id, // Store captured order ID, not client order ID
            lastPaymentDate: new Date(),
            renewalDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
          };
          
          // Add referral info if validated
          if (validatedReferrer) {
            newEntryData.referralCode = referralCode;
            newEntryData.referredBy = validatedReferrer.id;
          }
          
          // Store terms acceptance for new entry
          if (termsAccepted) {
            newEntryData.termsAccepted = termsAccepted;
            newEntryData.termsAcceptedAt = new Date();
          }
          
          const [newEntry] = await db.insert(entries).values(newEntryData).returning();

          // Increment referral count for referrer
          if (validatedReferrer) {
            await db.update(entries)
              .set({ referralCount: sql`referral_count + 1` })
              .where(eq(entries.id, validatedReferrer.id));
          }

          console.log("✅ Payment Captured:", data.id);
          console.log("✅ New Entry Added to Database:", { name, email, ref, referral: referralCode || 'none' });

          // Send automated payment confirmation email for new entry
          await sendAutomatedEmail(email, 'payment_confirmation_new', {
            name: name,
            ref: ref
          });

          return res.json({ success: true, ref, renewed: false });
        }
      } catch (dbError) {
        if (dbError.code === '23505' && attempts < maxAttempts && !existingEntry) {
          // Unique constraint violation on ref, try again (only for new entries)
          console.log(`⚠️ Ref collision, retrying... (${attempts}/${maxAttempts})`);
          continue;
        }
        console.error("❌ Database Error:", dbError);
        return res.status(500).json({ error: "Failed to save entry to database" });
      }
    }
    
    return res.status(500).json({ error: "Failed to generate unique reference after multiple attempts" });
  } catch (error) {
    console.error("❌ Capture Order Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- ADMIN API ROUTES ----
// Helper function to verify admin token and CSRF
function verifyAdminToken(req, res, next) {
  const adminToken = req.headers['x-admin-token'] || req.query.token;
  const expectedToken = process.env.ADMIN_TOKEN;
  
  console.log('🔑 Admin token verification:', {
    hasExpectedToken: !!expectedToken,
    hasAdminToken: !!adminToken,
    tokensMatch: adminToken === expectedToken
  });
  
  if (!expectedToken) {
    console.log('❌ No ADMIN_TOKEN environment variable found');
    return res.status(500).json({ error: "Server configuration error: Admin token not configured." });
  }
  
  if (!adminToken || adminToken !== expectedToken) {
    console.log('❌ Admin token mismatch or missing');
    return res.status(401).json({ error: "Unauthorized. Admin token required." });
  }
  
  console.log('✅ Admin token verified successfully');
  next();
}

// CSRF protection middleware for admin operations (stateless)
function verifyCSRF(req, res, next) {
  // Skip CSRF for GET requests
  if (req.method === 'GET') {
    return next();
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!token) {
    return res.status(403).json({ error: 'CSRF token required.' });
  }
  
  if (!tokens.verify(CSRF_SECRET, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }
  
  next();
}

// Combined admin authentication middleware
function verifyAdminAuth(req, res, next) {
  verifyAdminToken(req, res, (err) => {
    if (err) return next(err);
    verifyCSRF(req, res, next);
  });
}

// Get all entries (admin only)
app.get("/admin/entries", verifyAdminToken, async (req, res) => {
  try {
    const allEntries = await db.select().from(entries).orderBy(entries.timestamp);
    res.json(allEntries);
  } catch (dbError) {
    console.error("❌ Database Error:", dbError);
    res.status(500).json({ error: "Failed to retrieve entries from database" });
  }
});

// Select winner manually (admin only)
app.post("/admin/select-winner", verifyAdminAuth, async (req, res) => {
  try {
    const { entryId } = req.body;
    
    if (!entryId) {
      return res.status(400).json({ error: "Entry ID is required" });
    }
    
    // Get the entry details
    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
    
    if (!entry) {
      return res.status(404).json({ error: "Entry not found" });
    }
    
    // Check if the entry is active
    if (entry.status !== 'active') {
      return res.status(400).json({ error: "Cannot select winner from inactive member. Only active members are eligible." });
    }
    
    // Check if there's already a pending winner
    const [existingPendingWinner] = await db.select().from(winners)
      .where(eq(winners.paymentStatus, 'pending'))
      .limit(1);
    
    if (existingPendingWinner) {
      return res.status(400).json({ error: "There is already a pending winner. Complete payment first." });
    }
    
    // Create new winner entry
    const [newWinner] = await db.insert(winners).values({
      name: entry.name,
      email: entry.email,
      ref: entry.ref,
      entryId: entry.id,
      paymentStatus: 'pending',
      winningAmount: '1000'
    }).returning();
    
    console.log("✅ New Winner Selected:", { name: entry.name, ref: entry.ref });
    res.json({ success: true, winner: newWinner });
  } catch (error) {
    console.error("❌ Error selecting winner:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete entry (admin only)
app.delete("/admin/entry/:id", verifyAdminAuth, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    
    if (!entryId) {
      return res.status(400).json({ error: "Valid entry ID is required" });
    }
    
    // Check if this entry is referenced by any winner
    const [referencedWinner] = await db.select().from(winners)
      .where(eq(winners.entryId, entryId))
      .limit(1);
    
    if (referencedWinner) {
      return res.status(409).json({ 
        error: `Cannot delete entry: it is referenced by a winner (${referencedWinner.paymentStatus}). Complete winner payment process first.` 
      });
    }
    
    // Delete the entry
    const deletedEntries = await db.delete(entries).where(eq(entries.id, entryId)).returning();
    
    if (deletedEntries.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }
    
    console.log("✅ Entry Deleted:", deletedEntries[0]);
    res.json({ success: true, deletedEntry: deletedEntries[0] });
  } catch (error) {
    console.error("❌ Error deleting entry:", error);
    res.status(500).json({ error: error.message });
  }
});


// Send email to member (admin only)
app.post('/admin/send-email', verifyAdminAuth, async (req, res) => {
  try {
    const { email, type, memberName, amount, ref, dueDate } = req.body;
    const allowed = ['paymentVerification','winnerNotification','duePaymentReminder','renewalNotification'];
    if (!email || !type || !allowed.includes(type)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    let templateData;
    switch (type) {
      case 'paymentVerification': templateData = [memberName, amount, ref]; break;
      case 'winnerNotification': templateData = [memberName, '1000', ref]; break;
      case 'duePaymentReminder': templateData = [memberName, dueDate]; break;
      case 'renewalNotification': templateData = [memberName]; break;
    }
    const result = await sendEmail(email, type, templateData);
    if (result.success) return res.json({ success: true });
    return res.status(500).json({ error: result.error || 'Failed to send email' });
  } catch (e) {
    console.error('❌ /admin/send-email error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get email logs (admin only)
app.get('/admin/email-logs', verifyAdminToken, async (req, res) => {
  try {
    const logs = await db.select().from(emailLogs).orderBy(emailLogs.sentAt);
    res.json({ success: true, logs });
  } catch (e) {
    console.error('❌ /admin/email-logs error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get current winner (public)
app.get("/current-winner", async (req, res) => {
  try {
    // First check for pending winners
    let [currentWinner] = await db.select().from(winners)
      .where(eq(winners.paymentStatus, 'pending'))
      .orderBy(winners.announceDate)
      .limit(1);
    
    // If no pending winner, check for recently paid winners (within last 5 minutes for popup display)
    if (!currentWinner) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      [currentWinner] = await db.select().from(winners)
        .where(and(
          eq(winners.paymentStatus, 'paid'),
          gt(winners.paidAt, fiveMinutesAgo)
        ))
        .orderBy(winners.paidAt)
        .limit(1);
    }
    
    if (!currentWinner) {
      return res.json({ name: null });
    }
    
    // Return winner with all details for popup display including id and paidAt
    res.json({ 
      id: currentWinner.id,
      name: currentWinner.name,
      email: currentWinner.email,
      ref: currentWinner.ref,
      announceDate: currentWinner.announceDate,
      winningAmount: currentWinner.winningAmount,
      paymentStatus: currentWinner.paymentStatus,
      paidAt: currentWinner.paidAt
    });
  } catch (error) {
    console.error("❌ Error getting current winner:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- CONTACT FORM ROUTES ----
// Submit contact inquiry (public)
app.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const [newInquiry] = await db.insert(inquiries).values({
      name,
      email,
      subject,
      message
    }).returning();
    
    console.log('✅ New inquiry received:', { name, email, subject });
    res.json({ success: true, inquiry: newInquiry });
  } catch (error) {
    console.error('❌ Error saving inquiry:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---- WITHDRAWAL CHECK ROUTES ----
// Check withdrawal eligibility based on entry count
app.post('/check-withdrawal-eligibility', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Find member by email
    const [member] = await db.select().from(entries)
      .where(eq(entries.email, email))
      .limit(1);
    
    if (!member) {
      return res.json({ 
        success: false,
        message: 'Member not found with this email address. Please make sure you are registered in the lottery first.' 
      });
    }
    
    // Check if member has existing withdrawal request
    const [existingRequest] = await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.entryId, member.id))
      .limit(1);
    
    if (existingRequest) {
      return res.json({
        success: false,
        message: `You already have a withdrawal request with status: ${existingRequest.status}. Please contact admin for updates.`,
        hasExistingRequest: true,
        requestStatus: existingRequest.status
      });
    }
    
    const entryCount = member.entryCount || 1;
    const eligible = entryCount >= 10;
    
    if (eligible) {
      // Calculate withdrawal amounts
      const totalPaid = entryCount * 50; // $50 per entry
      const serviceCharge = Math.round(totalPaid * 0.07 * 100) / 100; // 7% service charge
      const refundAmount = Math.round((totalPaid - serviceCharge) * 100) / 100; // 93% refund
      
      return res.json({
        success: true,
        eligible: true,
        member: {
          name: member.name,
          email: member.email,
          ref: member.ref,
          entryCount: entryCount,
          totalPaid: totalPaid,
          serviceCharge: serviceCharge,
          refundAmount: refundAmount
        },
        message: `Congratulations! You are eligible for withdrawal. You have ${entryCount} entries and can receive $${refundAmount} after 7% service charge.`
      });
    } else {
      return res.json({
        success: true,
        eligible: false,
        member: {
          name: member.name,
          entryCount: entryCount,
          entriesNeeded: 10 - entryCount
        },
        message: `You currently have ${entryCount} entries. You need ${10 - entryCount} more entries to be eligible for withdrawal.`
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking withdrawal eligibility:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit withdrawal request
app.post('/submit-withdrawal-request', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Find member by email and verify eligibility again
    const [member] = await db.select().from(entries)
      .where(eq(entries.email, email))
      .limit(1);
    
    if (!member || member.entryCount < 10) {
      return res.status(400).json({ error: 'Not eligible for withdrawal' });
    }
    
    // Check for existing request again
    const [existingRequest] = await db.select().from(withdrawalRequests)
      .where(eq(withdrawalRequests.entryId, member.id))
      .limit(1);
    
    if (existingRequest) {
      return res.status(400).json({ error: 'Withdrawal request already exists' });
    }
    
    // Calculate amounts
    const totalPaid = member.entryCount * 50;
    const serviceCharge = Math.round(totalPaid * 0.07 * 100) / 100;
    const refundAmount = Math.round((totalPaid - serviceCharge) * 100) / 100;
    
    // Create withdrawal request
    const [newRequest] = await db.insert(withdrawalRequests).values({
      entryId: member.id,
      memberEmail: member.email,
      memberName: member.name,
      entryCount: member.entryCount,
      totalPaid: totalPaid.toString(),
      serviceChargeAmount: serviceCharge.toString(),
      refundAmount: refundAmount.toString(),
      status: 'pending'
    }).returning();
    
    console.log('✅ New withdrawal request submitted:', { 
      memberName: member.name, 
      email: member.email, 
      refundAmount: refundAmount 
    });
    
    res.json({ 
      success: true, 
      message: 'Withdrawal request submitted successfully. Admin will review within 5-10 business days.',
      request: {
        id: newRequest.id,
        refundAmount: refundAmount,
        status: 'pending'
      }
    });
    
  } catch (error) {
    console.error('❌ Error submitting withdrawal request:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---- REFERRAL PROGRAM ROUTES ----
// Check if email exists in database for referral purposes
app.post('/referrals/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // First find the referrer by email
    const [referrer] = await db.select().from(entries)
      .where(eq(entries.email, email))
      .limit(1);
    
    if (!referrer) {
      return res.json({ 
        success: false,
        message: 'Member not found with this email address' 
      });
    }
    
    // Now find all people who were referred by this person
    const referredMembers = await db.select({
      id: entries.id,
      name: entries.name,
      email: entries.email,
      ref: entries.ref,
      status: entries.status,
      timestamp: entries.timestamp
    }).from(entries)
    .where(eq(entries.referredBy, referrer.id));
    
    res.json({
      success: true,
      referrer: {
        name: referrer.name,
        ref: referrer.ref,
        totalReferrals: referredMembers.length
      },
      referrals: referredMembers.map(member => ({
        name: member.name,
        email: member.email.substring(0, 3) + '***@' + member.email.split('@')[1], // Hide email for privacy
        ref: member.ref,
        status: member.status,
        joinDate: new Date(member.timestamp).toLocaleDateString()
      }))
    });
    
  } catch (error) {
    console.error('❌ Error getting referrals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate referral link for user
app.post('/get-referral-link', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const [userEntry] = await db.select().from(entries)
      .where(eq(entries.email, email))
      .limit(1);
    
    if (!userEntry) {
      return res.json({ 
        success: false, 
        error: 'Email not found. Please make sure you are registered in the kameti first.' 
      });
    }
    
    // Get the domain from environment or request
    const domain = process.env.REPL_SLUG ? 
      `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 
      `${req.protocol}://${req.get('host')}`;
    
    const shareLink = `${domain}/?referral=${userEntry.ref}`;
    
    res.json({ 
      success: true,
      shareLink,
      yourRef: userEntry.ref,
      yourName: userEntry.name
    });
  } catch (error) {
    console.error('❌ Error generating referral link:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---- ENHANCED WINNER MANAGEMENT ROUTES ----
// Mark winner as paid (admin only)
app.post("/admin/winner-paid", verifyAdminToken, async (req, res) => {
  try {
    const { winnerId } = req.body;
    
    if (!winnerId) {
      return res.status(400).json({ error: "Winner ID is required" });
    }
    
    // Update winner status to paid
    const [updatedWinner] = await db.update(winners)
      .set({ 
        paymentStatus: 'paid',
        paidAt: new Date()
      })
      .where(eq(winners.id, winnerId))
      .returning();
    
    if (!updatedWinner) {
      return res.status(404).json({ error: "Winner not found" });
    }
    
    // Update entry status to winner_paid
    await db.update(entries)
      .set({ status: 'winner_paid' })
      .where(eq(entries.id, updatedWinner.entryId));
    
    console.log("✅ Winner marked as paid:", updatedWinner);
    res.json({ success: true, winner: updatedWinner });
  } catch (error) {
    console.error("❌ Error processing winner payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete winner (admin only)
app.delete("/admin/winner/:id", verifyAdminAuth, async (req, res) => {
  try {
    const winnerId = parseInt(req.params.id);
    
    if (!winnerId) {
      return res.status(400).json({ error: "Valid winner ID is required" });
    }
    
    // Delete the winner
    const deletedWinners = await db.delete(winners).where(eq(winners.id, winnerId)).returning();
    
    if (deletedWinners.length === 0) {
      return res.status(404).json({ error: "Winner not found" });
    }
    
    console.log("✅ Winner Deleted:", deletedWinners[0]);
    res.json({ success: true, deletedWinner: deletedWinners[0] });
  } catch (error) {
    console.error("❌ Error deleting winner:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all winners (admin only)
app.get("/admin/winners", verifyAdminToken, async (req, res) => {
  try {
    const allWinners = await db.select().from(winners).orderBy(winners.announceDate);
    res.json(allWinners);
  } catch (error) {
    console.error("❌ Error getting winners:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---- INQUIRY MANAGEMENT ROUTES ----
// Get all inquiries (admin only)
app.get('/admin/inquiries', verifyAdminToken, async (req, res) => {
  try {
    const allInquiries = await db.select().from(inquiries).orderBy(inquiries.createdAt);
    res.json({ success: true, inquiries: allInquiries });
  } catch (error) {
    console.error('❌ Error getting inquiries:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reply to inquiry (admin only)
app.post('/admin/inquiry-reply', verifyAdminAuth, async (req, res) => {
  try {
    const { inquiryId, adminReply } = req.body;
    
    if (!inquiryId || !adminReply) {
      return res.status(400).json({ error: 'Inquiry ID and reply are required' });
    }
    
    // Update inquiry with admin reply
    const [updatedInquiry] = await db.update(inquiries)
      .set({ 
        adminReply, 
        status: 'replied',
        repliedAt: new Date()
      })
      .where(eq(inquiries.id, inquiryId))
      .returning();
    
    if (!updatedInquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    
    // Send reply email to user
    try {
      const emailResult = await sendEmail(
        updatedInquiry.email,
        'inquiryReply',
        [updatedInquiry.name, updatedInquiry.subject, adminReply]
      );
      
      if (emailResult.success) {
        console.log('✅ Inquiry reply sent successfully to:', updatedInquiry.email);
      } else {
        console.error('❌ Failed to send inquiry reply email:', emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending inquiry reply email:', emailError);
    }
    
    console.log('✅ Inquiry replied to:', updatedInquiry);
    res.json({ success: true, inquiry: updatedInquiry });
  } catch (error) {
    console.error('❌ Error replying to inquiry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark inquiry as resolved (admin only)
app.post('/admin/inquiry-resolve', verifyAdminAuth, async (req, res) => {
  try {
    const { inquiryId } = req.body;
    
    if (!inquiryId) {
      return res.status(400).json({ error: 'Inquiry ID is required' });
    }
    
    const [updatedInquiry] = await db.update(inquiries)
      .set({ status: 'resolved' })
      .where(eq(inquiries.id, inquiryId))
      .returning();
    
    if (!updatedInquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    
    res.json({ success: true, inquiry: updatedInquiry });
  } catch (error) {
    console.error('❌ Error resolving inquiry:', error);
    res.status(500).json({ error: error.message });
  }
});


// Monthly status reset function
async function monthlyStatusReset() {
  try {
    console.log('🗓️ Running monthly status reset on 28th...');
    
    // Get all active entries
    const activeEntries = await db.select().from(entries).where(eq(entries.status, 'active'));
    
    if (activeEntries.length === 0) {
      console.log('✅ No active entries to reset');
      return;
    }
    
    // Set all entries to inactive
    await db.update(entries)
      .set({ status: 'expired' })
      .where(eq(entries.status, 'active'));
    
    console.log(`✅ Monthly reset complete: ${activeEntries.length} entries set to expired status`);
    
    // Send renewal reminder emails to all affected members
    for (const entry of activeEntries) {
      await sendAutomatedEmail(entry.email, 'renewal_reminder', {
        name: entry.name,
        dueDate: '28th of every month'
      });
    }
    
    console.log(`✅ Sent renewal reminder emails to ${activeEntries.length} members`);
    
  } catch (error) {
    console.error('❌ Error during monthly status reset:', error);
  }
}

// Manual monthly reset endpoint for admin (replaces background scheduler)
app.post('/admin/monthly-reset', verifyAdminAuth, async (req, res) => {
  try {
    await monthlyStatusReset();
    res.json({ success: true, message: 'Monthly reset completed successfully' });
  } catch (error) {
    console.error('❌ Error during manual monthly reset:', error);
    res.status(500).json({ error: error.message });
  }
});

// Automated email function
async function sendAutomatedEmail(email, type, data) {
  try {
    let templateData;
    
    switch (type) {
      case 'payment_confirmation_new':
        templateData = [data.name, '50.00', data.ref];
        await sendEmail(email, 'paymentVerification', templateData);
        break;
      
      case 'payment_confirmation_renewal':
        templateData = [data.name, '50.00', data.ref];
        await sendEmail(email, 'renewalNotification', templateData);
        break;
      
      case 'status_active':
        // Send active status confirmation
        templateData = [data.name, data.ref || 'N/A'];
        await sendEmail(email, 'paymentVerification', templateData);
        break;
      
      case 'renewal_reminder':
        templateData = [data.name, data.dueDate || '28th of every month'];
        await sendEmail(email, 'duePaymentReminder', templateData);
        break;
      
      default:
        console.log(`⚠️ Unknown email type: ${type}`);
        return;
    }
    
    console.log(`✅ Automated email sent: ${type} to ${email}`);
    
  } catch (error) {
    console.error(`❌ Failed to send automated email (${type}) to ${email}:`, error);
  }
}

// Initialize email service verification
(async () => {
  try {
    await verifyEmailService();
    console.log('✅ Email service verified for serverless deployment');
  } catch (error) {
    console.error('❌ Email service verification failed:', error);
  }
})();

// For local development - start server if running directly
if (process.env.NODE_ENV !== 'production' && import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Local development server running on port ${PORT}`);
  });
}

// Export the Express app for Vercel serverless
export default app;
