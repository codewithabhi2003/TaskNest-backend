import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    // ✅ Removed inline `unique: true` — declared via .index() below to fix duplicate index warning
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    profilePicture: { type: String },
    isEmailVerified: { type: Boolean, default: false },
    lastLogin: { type: Date },
    is2FAEnabled: { type: Boolean, default: false },
    twoFAOtp: { type: String, select: false },
    twoFAOtpExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// ✅ Single source of truth for the unique index — eliminates the Mongoose duplicate index warning
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);
export default User;