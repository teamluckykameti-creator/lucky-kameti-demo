# Lucky Kameti Demo

A comprehensive lottery/kameti system built with Express.js, PostgreSQL, and PayPal integration for secure payment processing.

## 🎯 Features

- **User Registration & Management**: Secure user registration with email verification
- **Payment Processing**: Integrated PayPal payment system for entries
- **Referral System**: Built-in referral program with tracking
- **Winner Selection**: Automated and manual winner selection system
- **Admin Panel**: Complete administrative interface for managing entries and winners
- **Email Notifications**: Automated email system for payment confirmations and notifications
- **Withdrawal Management**: System for handling withdrawal requests with service charges
- **Database Management**: PostgreSQL with Drizzle ORM for type-safe database operations

## 🏗️ Project Structure

```
lucky-kameti-demo/
├── api/                    # API endpoints (Vercel compatibility)
│   └── index.js
├── public/                 # Static files
│   ├── admin/             # Admin panel pages
│   │   ├── dashboard.html
│   │   └── login.html
│   ├── index.html         # Main landing page
│   ├── connect-us.html    # Contact form
│   ├── terms.html         # Terms and conditions
│   ├── robots.txt
│   └── sitemap.xml
├── server/                 # Server configuration
│   └── db.js              # Database connection
├── services/               # Service modules
│   └── emailService.js    # Email handling
├── shared/                 # Shared utilities
│   └── schema.js          # Database schema
├── index.js               # Main server file
├── package.json           # Dependencies
├── drizzle.config.ts      # Database configuration
└── vercel.json           # Vercel deployment config
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- PayPal Developer Account
- Email service credentials (SMTP)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/teamluckykameti-creator/lucky-kameti-demo.git
cd lucky-kameti-demo
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# PayPal (Sandbox)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret

# Admin Access
ADMIN_TOKEN=your_secure_admin_token
CSRF_SECRET=your_csrf_secret_key

# Email Service
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=your_from_email
```

4. Set up the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:5000`

## 📊 Database Schema

The application uses the following main tables:

- **entries**: User registrations and memberships
- **winners**: Winner records and payment tracking
- **email_logs**: Email notification history
- **inquiries**: Contact form submissions
- **withdrawal_requests**: Withdrawal request management
- **settings**: Application configuration

## 🔐 Security Features

- CSRF protection for admin operations
- PayPal payment verification
- Secure admin authentication
- Input validation and sanitization
- SQL injection prevention through ORM

## 🎮 Usage

### For Users
1. Visit the main page
2. Enter your details and referral code (if any)
3. Complete PayPal payment ($50)
4. Receive confirmation email
5. Participate in monthly draws

### For Admins
1. Access admin panel at `/admin`
2. Use admin token for authentication
3. Manage entries, select winners, and handle withdrawals
4. Send notifications and manage settings

## 💰 Payment System

- **Entry Fee**: $50 USD per participation
- **Payment Processor**: PayPal (Sandbox for development)
- **Winner Amount**: $1000 USD
- **Service Charge**: 7% on withdrawals (93% refunded)

## 📧 Email System

Automated emails are sent for:
- Payment confirmations (new entries and renewals)
- Winner notifications
- Withdrawal confirmations
- Due payment reminders

## 🌐 Deployment

### Vercel Deployment
The project is configured for Vercel deployment with:
- Serverless functions in `/api`
- Static file serving from `/public`
- Environment variable management

### Manual Deployment
1. Set up your production database
2. Configure environment variables
3. Run database migrations: `npm run db:push`
4. Start the server: `npm start`

## 🛠️ Development Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server
- `npm run db:push` - Push database schema
- `npm run db:generate` - Generate migrations
- `npm run db:migrate` - Run migrations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📝 API Endpoints

### Public Endpoints
- `GET /` - Main page
- `POST /check-email` - Check email registration status
- `POST /validate-referral` - Validate referral codes
- `POST /create-order` - Create PayPal order
- `POST /capture-order` - Capture PayPal payment
- `GET /current-winner` - Get current winner
- `POST /contact` - Submit contact inquiry

### Admin Endpoints
- `GET /admin/entries` - Get all entries
- `POST /admin/select-winner` - Select winner manually
- `DELETE /admin/entry/:id` - Delete entry
- `POST /admin/send-email` - Send email to member
- `GET /admin/email-logs` - Get email logs

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check DATABASE_URL format
   - Ensure PostgreSQL is running
   - Verify database credentials

2. **PayPal Payment Failures**
   - Verify PayPal credentials
   - Check sandbox vs production settings
   - Ensure proper amount formatting

3. **Email Not Sending**
   - Check SMTP credentials
   - Verify firewall settings
   - Test with different email providers

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

For support, email support@luckykameti.com or create an issue in this repository.

## 🔄 Version History

- **v1.0.0** - Initial release with core functionality
- PayPal integration
- Admin panel
- Email system
- Referral program
- Withdrawal management

---

Made with ❤️ for the Lucky Kameti community