import User from "../models/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Verification from "../models/verification.js";
import { sendEmail } from "../libs/send-email.js";
import aj from "../libs/arcjet.js";

const BCRYPT_ROUNDS = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/* ─── Email Templates ─────────────────────────────────────── */

const verificationEmailHtml = (link, name = "") => `
<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
  <h2 style="color:#2563eb;">Welcome to TaskNest</h2>
  <p>Hello${name ? ` ${name}` : ""},</p>
  <p>Thank you for signing up. Please verify your email address to activate your account.</p>
  <p style="margin:20px 0;">
    <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:5px;">
      Verify Email Address
    </a>
  </p>
  <p>If you did not create a TaskNest account, you can safely ignore this email.</p>
  <br/><p>Best regards,<br/><strong>TaskNest Team</strong></p>
  <hr/><p style="font-size:12px;color:#777;">This is an automated email. Please do not reply.</p>
</div>`;

const resetPasswordEmailHtml = (link, name = "") => `
<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
  <h2 style="color:#2563eb;">TaskNest Password Reset</h2>
  <p>Hello ${name},</p>
  <p>We received a request to reset your password. This link expires in <strong>15 minutes</strong>.</p>
  <p style="margin:20px 0;">
    <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">
      Reset Password
    </a>
  </p>
  <p>If you did not request this, please ignore this email.</p>
  <br/><p>Best regards,<br/><strong>TaskNest Team</strong></p>
  <hr/><p style="font-size:12px;color:#777;">This email was sent automatically by TaskNest.</p>
</div>`;

/* ─── Helpers ─────────────────────────────────────────────── */

const createVerificationToken = (userId, purpose, expiresIn) =>
  jwt.sign({ userId, purpose }, process.env.JWT_SECRET, { expiresIn });

const saveVerificationRecord = (userId, token, expiresInMs) =>
  Verification.create({
    userId,
    token,
    expiresAt: new Date(Date.now() + expiresInMs),
  });

/* =========================
   REGISTER USER
========================= */
const registerUser = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    const decision = await aj.protect(req, { email });
    if (decision.isDenied()) {
      return res.status(403).json({ message: "Invalid email address" });
    }

    // ✅ .lean() — skip Mongoose document hydration, just need the boolean check
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(400).json({ message: "Email address already in use" });
    }

    // ✅ bcrypt.hash directly (skip separate genSalt round-trip)
    const hashPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = await User.create({ email, password: hashPassword, name });

    const verificationToken = createVerificationToken(newUser._id, "email-verification", "1h");
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // ✅ Parallel: save token record + fire-and-forget email
    await saveVerificationRecord(newUser._id, verificationToken, ONE_HOUR_MS);

    sendEmail(email, "Verify Your Email Address - TaskNest", verificationEmailHtml(verificationLink))
      .catch((err) => console.error("Verification email failed:", err.message));

    return res.status(201).json({
      message: "Account created successfully. Please check your email to verify your account.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   LOGIN USER
========================= */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ .lean() + select password in one query
    const user = await User.findOne({ email }).select("+password").lean();
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isEmailVerified) {
      // ✅ Check + refresh verification token
      const verification = await Verification.findOne({ userId: user._id }).lean();

      if (!verification || verification.expiresAt < new Date()) {
        // ✅ Parallel: delete old + create new token
        const verificationToken = createVerificationToken(user._id, "email-verification", "1h");
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

        await Promise.all([
          verification ? Verification.deleteOne({ _id: verification._id }) : Promise.resolve(),
          saveVerificationRecord(user._id, verificationToken, ONE_HOUR_MS),
        ]);

        sendEmail(email, "Verify Your Email Address - TaskNest", verificationEmailHtml(verificationLink, user.name))
          .catch((err) => console.error("Verification email failed:", err.message));
      }

      return res.status(403).json({ message: "Email not verified. Please check your email." });
    }

    const token = jwt.sign({ userId: user._id, purpose: "login" }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // ✅ findByIdAndUpdate instead of doc.save() — single atomic DB operation
    User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).catch(() => {});

    const { password: _pw, ...userData } = user;

    return res.status(200).json({ message: "Login successful", token, user: userData });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   VERIFY EMAIL
========================= */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || payload.purpose !== "email-verification") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Parallel: fetch user + verification record at the same time
    const [user, verification] = await Promise.all([
      User.findById(payload.userId),
      Verification.findOne({ userId: payload.userId, token }).lean(),
    ]);

    if (!verification || verification.expiresAt < new Date()) {
      return res.status(401).json({ message: "Token expired or invalid" });
    }
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    // ✅ Parallel: mark verified + delete verification record
    await Promise.all([
      User.findByIdAndUpdate(payload.userId, { isEmailVerified: true }),
      Verification.deleteOne({ _id: verification._id }),
    ]);

    return res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   RESET PASSWORD REQUEST
========================= */
const resetPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email }).lean();
    if (!user || !user.isEmailVerified) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const existing = await Verification.findOne({ userId: user._id }).lean();
    if (existing && existing.expiresAt > new Date()) {
      return res.status(400).json({ message: "Reset request already sent" });
    }

    const resetToken = createVerificationToken(user._id, "reset-password", "15m");
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // ✅ Parallel: delete old record (if any) + create new one
    await Promise.all([
      existing ? Verification.deleteOne({ _id: existing._id }) : Promise.resolve(),
      saveVerificationRecord(user._id, resetToken, FIFTEEN_MIN_MS),
    ]);

    sendEmail(email, "Reset Your Password - TaskNest", resetPasswordEmailHtml(resetLink, user.name))
      .catch((err) => console.error("Reset email failed:", err.message));

    return res.status(200).json({ message: "Reset password email sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   VERIFY RESET TOKEN & RESET PASSWORD
========================= */
const verifyResetPasswordTokenAndResetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || payload.purpose !== "reset-password") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Parallel: fetch user + verification record
    const [user, verification] = await Promise.all([
      User.findById(payload.userId),
      Verification.findOne({ userId: payload.userId, token }).lean(),
    ]);

    if (!verification || verification.expiresAt < new Date()) {
      return res.status(401).json({ message: "Token expired or invalid" });
    }
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ bcrypt.hash directly (skip separate genSalt)
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // ✅ Parallel: update password + delete verification record
    await Promise.all([
      User.findByIdAndUpdate(payload.userId, { password: hashedPassword }),
      Verification.deleteOne({ _id: verification._id }),
    ]);

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export {
  registerUser,
  loginUser,
  verifyEmail,
  resetPasswordRequest,
  verifyResetPasswordTokenAndResetPassword,
};