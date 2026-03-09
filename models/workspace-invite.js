import mongoose from "mongoose";

const workspaceInviteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: "Workspace", required: true },
    token: { type: String, required: true },
    role: { type: String, enum: ["admin", "member", "viewer"], default: "member" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// ✅ Unique compound index — prevents duplicate invites in a single query
workspaceInviteSchema.index({ user: 1, workspaceId: 1 }, { unique: true });
// ✅ TTL index — MongoDB auto-deletes expired invites (no manual findByIdAndDelete needed)
workspaceInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WorkspaceInvite = mongoose.model("WorkspaceInvite", workspaceInviteSchema);
export default WorkspaceInvite;