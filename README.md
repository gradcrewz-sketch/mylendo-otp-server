# MYLENDO – Campus Rentals and Resale

**Live project (AWS):** http://YOUR-EC2-PUBLIC-IP  ← replace with your link
**GitHub:** https://github.com/gradcrewz-sketch/mylendo-otp-server
**Built for:** Catalyst Hack 2026 – Grand Finale

## 1. Project overview and problem statement
Students often buy things they need for only a few weeks (books, calculators, lab coats, electronics) and then never use them again. At the same time, other students nearby are looking for exactly those items. There is no simple, trusted place to **borrow, lend, buy and sell inside a college community**.

**MYLENDO** is a campus marketplace where students rent, lend, buy and sell items with people at their own and nearby colleges. Users verify their email with a one-time code so that listings come from real students.

## 2. Key features
- Email verification with a 6-digit one-time code (OTP): expires in 5 minutes, 5 tries per code, resend limit
- Browse and search items near you, with photos and prices
- Rent, lend, buy and sell flows with a 4-digit pickup code for safe meet-ups
- Wishlist, orders and notifications
- MYLENDO AI shopping helper
- Light and dark theme
- Installable as an app (PWA) with offline start

## 3. Technology stack
| Part | Technology |
|------|-----------|
| Frontend | HTML, CSS, JavaScript (single page app) |
| Backend | Node.js, Express |
| Email | Brevo transactional email API (Nodemailer + Gmail SMTP for local use) |
| Security | Hashed OTPs (SHA-256), expiry, attempt and rate limits |
| App features | Web App Manifest, Service Worker |
| Cloud | **AWS EC2** (Free Tier) |

## 4. Implementation details
- `server.js` serves the website from the `public/` folder and exposes three endpoints:
  - `GET /api/health` – checks that the email service is ready
  - `POST /api/otp/send` – creates a random 6-digit code, stores only its hash, and emails the code
  - `POST /api/otp/verify` – checks the code, counts wrong tries, and blocks expired or reused codes
- The OTP is never stored in plain text, and `server.js` and `.env` are never exposed to the browser.
- `public/lendo_1.html` is the app. It calls the API on the same address when deployed.
- `public/sw.js` and `public/manifest.webmanifest` make the website installable.

## 5. Screenshots
Add your screenshots in a `screenshots/` folder and list them here:

![Home](screenshots/home.png)
![Email code](screenshots/otp.png)
![AWS EC2](screenshots/aws.png)

## 6. AWS deployment details
- Service: **Amazon EC2** (Free Tier, t3.micro / t2.micro, Amazon Linux 2023)
- The instance installs Node.js, clones this repository, runs `npm install`, and starts the server with **pm2** on port 80.
- Security Group: allows HTTP (port 80) from anywhere and SSH (port 22).
- Environment variables (`BREVO_API_KEY`, `SENDER_EMAIL`) are set on the server, never stored in GitHub.
- Live link: http://YOUR-EC2-PUBLIC-IP

## 7. Setup and usage

### Run locally
```bash
git clone https://github.com/gradcrewz-sketch/mylendo-otp-server.git
cd mylendo-otp-server
npm install
```
Create a `.env` file (see `.env.example`):
```
PORT=3000
EMAIL_USER=yourname@gmail.com
EMAIL_PASS=your-16-letter-gmail-app-password
```
Start it and open http://localhost:3000
```bash
node server.js
```

### Deploy on AWS EC2
1. Launch an EC2 instance (Amazon Linux 2023, Free Tier) and allow HTTP (port 80) in the Security Group.
2. Paste the start-up script in **Advanced details → User data** (installs Node, clones this repo, starts the server).
3. Open `http://<public-ip>` in the browser.

### Using the app
1. Open the live link and sign up with your email.
2. Enter the 6-digit code sent to your inbox (check Spam).
3. Browse items, add listings, and use the pickup code when you meet.

## 8. Team
Team name: _add here_ · Members: _add here_
