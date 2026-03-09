import mongoose, { Schema } from "mongoose";

const workspaceModel = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    color: { type: String, default: "#FF5733" },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        role: {
          type: String,
          enum: ["owner", "member", "admin", "viewer"],
          default: "member",
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    projects: [{ type: Schema.Types.ObjectId, ref: "Project" }],
  },
  { timestamps: true }
);

// ✅ Fast "getWorkspaces" query — finds all workspaces a user is a member of
workspaceModel.index({ "members.user": 1 });
// ✅ Fast owner lookups
workspaceModel.index({ owner: 1 });

const Workspace = mongoose.model("Workspace", workspaceModel);
export default Workspace;