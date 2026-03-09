import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// ✅ Fast lookup by userId
verificationSchema.index({ userId: 1 });
// ✅ TTL index — MongoDB auto-deletes expired tokens (no manual cleanup needed)
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Verification = mongoose.model("Verification", verificationSchema);
export default Verification;