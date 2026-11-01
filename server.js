require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");
const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const SENDER = process.env.SENDER_EMAIL || EMAIL_USER;
const useBrevo = !!(BREVO_API_KEY && SENDER);
const useSmtp = !useBrevo && !!(EMAIL_USER && EMAIL_PASS);
const emailReady = useBrevo || useSmtp;

const TTL_SEC = 300;      // code valid for 5 minutes
const RESEND_SEC = 30;    // wait before resend
const MAX_TRIES = 5;      // wrong tries per code
const MAX_SEND_PER_HOUR = 6; // per email address

const transporter = useSmtp
  ? nodemailer.createTransport({ service: "gmail", auth: { user: EMAIL_USER, pass: EMAIL_PASS } })
  : null;

// One function that sends an email, either through Brevo (works on Render, uses https) or Gmail SMTP (works on your own computer).
async function sendEmail(to, subject, text, html) {
  if (useBrevo) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "MYLENDO", email: SENDER }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) throw new Error("Brevo " + r.status + " " + (await r.text()).slice(0, 300));
    return;
  }
  await transporter.sendMail({ from: '"MYLENDO" <' + EMAIL_USER + ">", to, subject, text, html });
}

if (useBrevo) {
  fetch("https://api.brevo.com/v3/account", { headers: { "api-key": BREVO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(15000) }).then(
    (r) => console.log(r.ok ? "Email OK (Brevo): ready to send from " + SENDER : "EMAIL PROBLEM (Brevo): key rejected, status " + r.status + ". Check BREVO_API_KEY."),
    (e) => console.log("EMAIL PROBLEM (Brevo): " + e.message)
  );
} else if (useSmtp) {
  transporter.verify().then(
    () => console.log("Email OK: ready to send from " + EMAIL_USER),
    (e) => console.log("EMAIL PROBLEM: " + e.message + "\nOn your own computer check EMAIL_USER and EMAIL_PASS (Gmail App Password). On Render use BREVO_API_KEY instead, because Render blocks Gmail SMTP.")
  );
} else {
  console.log("EMAIL NOT SET: add BREVO_API_KEY and SENDER_EMAIL (online), or EMAIL_USER and EMAIL_PASS (own computer).");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const codes = new Map();   // requestId -> { email, hash, exp, tries, used }
const sends = new Map();   // email -> [timestamps]
const hash = (rid, otp) => crypto.createHash("sha256").update(rid + ":" + otp).digest("hex");
const validEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp + 600000 < now) codes.delete(k);
}, 60000).unref();

app.get("/api/health", (req, res) => res.json({ ok: true, email: emailReady }));

app.post("/api/otp/send", async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ ok: false, error: "bad_email", message: "Please enter a valid email address." });
  if (!emailReady) return res.status(503).json({ ok: false, error: "email_not_set", message: "The email server is not set up yet." });

  const now = Date.now();
  const list = (sends.get(email) || []).filter((t) => now - t < 3600000);
  const last = list[list.length - 1];
  if (last && now - last < RESEND_SEC * 1000) {
    const wait = Math.ceil((RESEND_SEC * 1000 - (now - last)) / 1000);
    return res.status(429).json({ ok: false, error: "too_fast", message: "Please wait " + wait + " seconds before asking again.", retryAfterSec: wait });
  }
  if (list.length >= MAX_SEND_PER_HOUR) {
    return res.status(429).json({ ok: false, error: "limit", message: "Too many codes requested. Try again in a while.", retryAfterSec: 600 });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const requestId = crypto.randomUUID();
  try {
    await sendEmail(
      email,
      "Your MYLENDO code: " + otp,
      "Your MYLENDO verification code is " + otp + ". It works for 5 minutes. If you did not ask for it, ignore this email.",
      '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px">' +
        '<h2 style="color:#224074">MYLENDO</h2><p>Your verification code is:</p>' +
        '<p style="font-size:34px;letter-spacing:8px;font-weight:bold;color:#35aa80">' + otp + "</p>" +
        '<p style="color:#555">It works for 5 minutes. If you did not ask for it, you can ignore this email.</p></div>'
    );
  } catch (e) {
    console.log("Send error: " + e.message);
    return res.status(502).json({ ok: false, error: "send_failed", message: "Could not send the email. Please try again." });
  }
  list.push(now);
  sends.set(email, list);
  codes.set(requestId, { email, hash: hash(requestId, otp), exp: now + TTL_SEC * 1000, tries: 0, used: false });
  console.log("Code sent to " + email);
  res.json({ ok: true, requestId, expiresInSec: TTL_SEC, resendAfterSec: RESEND_SEC });
});

app.post("/api/otp/verify", (req, res) => {
  const { requestId, otp } = req.body || {};
  const rec = codes.get(String(requestId || ""));
  if (!rec) return res.status(400).json({ ok: false, error: "not_found", message: "This code is not valid any more. Tap Resend code." });
  if (rec.used) return res.status(400).json({ ok: false, error: "otp_used", message: "This code was already used. Tap Resend code." });
  if (Date.now() > rec.exp) return res.status(400).json({ ok: false, error: "otp_expired", message: "This code has expired. Tap Resend code." });
  if (rec.tries >= MAX_TRIES) return res.status(429).json({ ok: false, error: "too_many_attempts", message: "Too many wrong tries. Tap Resend code." });
  rec.tries++;
  const given = hash(String(requestId), String(otp || "").trim());
  const ok = given.length === rec.hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(rec.hash));
  if (!ok) {
    const left = MAX_TRIES - rec.tries;
    return res.status(400).json({ ok: false, error: "wrong_code", message: left > 0 ? "That code is wrong. " + left + " tries left." : "Too many wrong tries. Tap Resend code." });
  }
  rec.used = true;
  res.json({ ok: true });
});

// Website files (only the "public" folder is shared, so server.js and .env stay private)
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, "0.0.0.0", () => console.log("MYLENDO server running: http://localhost:" + PORT));