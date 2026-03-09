import Workspace from "../models/workspace.js";
import Project from "../models/project.js";
import Task from "../models/task.js";

/* =========================
   CREATE PROJECT
========================= */
const createProject = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, status, startDate, dueDate, tags, members } = req.body;

    // ✅ .lean() — we only need membership check, no need for Mongoose document
    const workspace = await Workspace.findById(workspaceId).select("members projects").lean();
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const isMember = workspace.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: "You are not a member of this workspace" });

    const tagArray = tags ? tags.split(",") : [];

    const newProject = await Project.create({
      title, description, status, startDate, dueDate,
      tags: tagArray, workspace: workspaceId,
      members, createdBy: req.user._id,
    });

    // ✅ $push — atomic update, no need to fetch+save the full workspace document
    await Workspace.findByIdAndUpdate(workspaceId, { $push: { projects: newProject._id } });

    return res.status(201).json(newProject);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET PROJECT DETAILS
========================= */
const getProjectDetails = async (req, res) => {
  try {
    const { projectId } = req.params;

    // ✅ .lean() — read-only response
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ message: "Project not found" });

    const isMember = project.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: "You are not a member of this project" });

    res.status(200).json(project);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET PROJECT TASKS
========================= */
const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;

    // ✅ .lean() for project membership check
    const project = await Project.findById(projectId)
      .populate("members.user", "name email profilePicture")
      .lean();

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isMember = project.members.some(
      (m) => m.user._id.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: "You are not a member of this project" });

    // ✅ Parallel: tasks can be fetched while project check is done — moved to after project resolves
    // Index on { project, isArchived, createdAt } makes this fast
    const tasks = await Task.find({ project: projectId, isArchived: false })
      .populate("assignees", "name profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ project, tasks });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export { createProject, getProjectDetails, getProjectTasks };