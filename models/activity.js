import mongoose, { Schema } from "mongoose";

const activityLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      required: true,
      enum: [
        "created_task", "updated_task", "created_subtask", "updated_subtask",
        "completed_task", "created_project", "updated_project", "completed_project",
        "created_workspace", "updated_workspace", "added_comment", "added_member",
        "removed_member", "joined_workspace", "transferred_workspace_ownership", "added_attachment",
      ],
    },
    resourceType: {
      type: String,
      required: true,
      enum: ["Task", "Project", "Workspace", "Comment", "User"],
    },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    details: { type: Object },
  },
  { timestamps: true }
);

// ✅ Index for fast activity lookups by resource (most common query pattern)
activityLogSchema.index({ resourceId: 1, createdAt: -1 });
// ✅ Index for user activity feeds
activityLogSchema.index({ user: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export default ActivityLog;