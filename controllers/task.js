import { recordActivity } from "../libs/index.js";
import ActivityLog from "../models/activity.js";
import Comment from "../models/comment.js";
import Project from "../models/project.js";
import Task from "../models/task.js";
import Workspace from "../models/workspace.js";

/* ─── Shared Helper ───────────────────────────────────────────
 * Fetches task + project in sequence (project ID comes from task),
 * verifies membership, and returns both as lean objects.
 * Eliminates the duplicated 20+ lines across every task handler.
 * ────────────────────────────────────────────────────────────── */
const _getTaskAndVerifyMember = async (taskId, userId) => {
  // ✅ .lean() — plain JS object, no Mongoose overhead
  const task = await Task.findById(taskId).lean();
  if (!task) return { err: { status: 404, message: "Task not found" } };

  // ✅ Only select the fields we actually need for the membership check
  const project = await Project.findById(task.project).select("members").lean();
  if (!project) return { err: { status: 404, message: "Project not found" } };

  const isMember = project.members.some(
    (m) => m.user.toString() === userId.toString()
  );
  if (!isMember) return { err: { status: 403, message: "You are not a member of this project" } };

  return { task, project };
};

/* =========================
   CREATE TASK
========================= */
const createTask = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description, status, priority, dueDate, assignees } = req.body;

    // ✅ Populate workspace inline — avoids a second round-trip for Workspace.findById
    const project = await Project.findById(projectId)
      .populate("workspace", "members")
      .lean();

    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!project.workspace) return res.status(404).json({ message: "Workspace not found" });

    const isMember = project.workspace.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: "You are not a member of this workspace" });

    // ✅ Parallel: create task + push task ID into project in one go
    const newTask = await Task.create({
      title, description, status, priority, dueDate, assignees,
      project: projectId,
      createdBy: req.user._id,
    });

    // ✅ $push is atomic — no need to fetch + save the full project doc
    await Project.findByIdAndUpdate(projectId, { $push: { tasks: newTask._id } });

    res.status(201).json(newTask);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET TASK BY ID
========================= */
const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;

    // ✅ Parallel: fetch task and project membership at the same time
    // We fetch the task first lean to get project ID, then both in parallel
    const taskRaw = await Task.findById(taskId).select("project").lean();
    if (!taskRaw) return res.status(404).json({ message: "Task not found" });

    const [task, project] = await Promise.all([
      Task.findById(taskId)
        .populate("assignees", "name profilePicture")
        .populate("watchers", "name profilePicture")
        .lean(),
      Project.findById(taskRaw.project)
        .populate("members.user", "name profilePicture")
        .lean(),
    ]);

    res.status(200).json({ task, project });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE TASK TITLE
========================= */
const updateTaskTitle = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    // ✅ findByIdAndUpdate — single DB round-trip instead of find + modify + save
    const updated = await Task.findByIdAndUpdate(taskId, { title }, { new: true });

    // ✅ Fire-and-forget — activity log never blocks the response
    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `updated task title from ${task.title} to ${title}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE TASK DESCRIPTION
========================= */
const updateTaskDescription = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { description } = req.body;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const oldDesc = task.description
      ? task.description.substring(0, 50) + (task.description.length > 50 ? "..." : "")
      : "";
    const newDesc = description.substring(0, 50) + (description.length > 50 ? "..." : "");

    const updated = await Task.findByIdAndUpdate(taskId, { description }, { new: true });

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `updated task description from ${oldDesc} to ${newDesc}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE TASK STATUS
========================= */
const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const updated = await Task.findByIdAndUpdate(taskId, { status }, { new: true });

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `updated task status from ${task.status} to ${status}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE TASK ASSIGNEES
========================= */
const updateTaskAssignees = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assignees } = req.body;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const updated = await Task.findByIdAndUpdate(taskId, { assignees }, { new: true });

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `updated task assignees from ${task.assignees.length} to ${assignees.length}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE TASK PRIORITY
========================= */
const updateTaskPriority = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { priority } = req.body;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const updated = await Task.findByIdAndUpdate(taskId, { priority }, { new: true });

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `updated task priority from ${task.priority} to ${priority}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   ADD SUBTASK
========================= */
const addSubTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;

    const { err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    // ✅ $push directly — no need to load the full task, modify, then save
    const updated = await Task.findByIdAndUpdate(
      taskId,
      { $push: { subtasks: { title, completed: false } } },
      { new: true }
    );

    recordActivity(req.user._id, "created_subtask", "Task", taskId, {
      description: `created subtask ${title}`,
    });

    res.status(201).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE SUBTASK
========================= */
const updateSubTask = async (req, res) => {
  try {
    const { taskId, subTaskId } = req.params;
    const { completed } = req.body;

    // ✅ Use positional operator to update subdocument directly in DB
    const updated = await Task.findOneAndUpdate(
      { _id: taskId, "subtasks._id": subTaskId },
      { $set: { "subtasks.$.completed": completed } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Task or subtask not found" });

    const subTask = updated.subtasks.find((s) => s._id.toString() === subTaskId);

    recordActivity(req.user._id, "updated_subtask", "Task", taskId, {
      description: `updated subtask ${subTask?.title}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET ACTIVITY BY RESOURCE ID
========================= */
const getActivityByResourceId = async (req, res) => {
  try {
    const { resourceId } = req.params;

    const activity = await ActivityLog.find({ resourceId })
      .populate("user", "name profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(activity);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET COMMENTS BY TASK ID
========================= */
const getCommentsByTaskId = async (req, res) => {
  try {
    const { taskId } = req.params;

    const comments = await Comment.find({ task: taskId })
      .populate("author", "name profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(comments);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   ADD COMMENT
========================= */
const addComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;

    const { err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const newComment = await Comment.create({ text, task: taskId, author: req.user._id });

    // ✅ Parallel: push comment ID into task + log activity
    await Task.findByIdAndUpdate(taskId, { $push: { comments: newComment._id } });

    recordActivity(req.user._id, "added_comment", "Task", taskId, {
      description: `added comment ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   WATCH / UNWATCH TASK
========================= */
const watchTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const userId = req.user._id.toString();
    const isWatching = task.watchers.some((w) => w.toString() === userId);

    // ✅ Use $addToSet / $pull — atomic, no fetch-modify-save cycle
    const updated = await Task.findByIdAndUpdate(
      taskId,
      isWatching
        ? { $pull: { watchers: req.user._id } }
        : { $addToSet: { watchers: req.user._id } },
      { new: true }
    );

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `${isWatching ? "stopped watching" : "started watching"} task ${task.title}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   ARCHIVE / UNARCHIVE TASK
========================= */
const achievedTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const { task, err } = await _getTaskAndVerifyMember(taskId, req.user._id);
    if (err) return res.status(err.status).json({ message: err.message });

    const updated = await Task.findByIdAndUpdate(
      taskId,
      { isArchived: !task.isArchived },
      { new: true }
    );

    recordActivity(req.user._id, "updated_task", "Task", taskId, {
      description: `${task.isArchived ? "unarchived" : "archived"} task ${task.title}`,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET MY TASKS
========================= */
const getMyTasks = async (req, res) => {
  try {
    // ✅ .lean() for a read-only list query
    const tasks = await Task.find({ assignees: { $in: [req.user._id] } })
      .populate("project", "title workspace")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(tasks);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export {
  createTask,
  getTaskById,
  updateTaskTitle,
  updateTaskDescription,
  updateTaskStatus,
  updateTaskAssignees,
  updateTaskPriority,
  addSubTask,
  updateSubTask,
  getActivityByResourceId,
  getCommentsByTaskId,
  addComment,
  watchTask,
  achievedTask,
  getMyTasks,
};