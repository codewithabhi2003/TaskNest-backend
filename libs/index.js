import ActivityLog from "../models/activity.js";

// ✅ Non-blocking activity logger — intentionally NOT awaited in controllers
// Errors here never crash or delay a response
const recordActivity = (userId, action, resourceType, resourceId, details) => {
  ActivityLog.create({ user: userId, action, resourceType, resourceId, details }).catch(
    (err) => console.error("Activity log error:", err.message)
  );
};

export { recordActivity };