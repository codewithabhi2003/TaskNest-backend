import Workspace from "../models/workspace.js";
import Project from "../models/project.js";
import User from "../models/user.js";
import WorkspaceInvite from "../models/workspace-invite.js";
import jwt from "jsonwebtoken";
import { sendEmail } from "../libs/send-email.js";
import { recordActivity } from "../libs/index.js";

/* =========================
   CREATE WORKSPACE
========================= */
const createWorkspace = async (req, res) => {
  try {
    const { name, description, color } = req.body;

    const workspace = await Workspace.create({
      name, description, color,
      owner: req.user._id,
      members: [{ user: req.user._id, role: "owner", joinedAt: new Date() }],
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET WORKSPACES
========================= */
const getWorkspaces = async (req, res) => {
  try {
    // ✅ .lean() — read-only list, no Mongoose document needed
    const workspaces = await Workspace.find({ "members.user": req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(workspaces);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET WORKSPACE DETAILS
========================= */
const getWorkspaceDetails = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId)
      .populate("members.user", "name email profilePicture")
      .lean();

    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    // ✅ Filter null members (deleted users) in-memory — no extra query
    workspace.members = workspace.members.filter((m) => m.user !== null);

    res.status(200).json(workspace);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET WORKSPACE PROJECTS
========================= */
const getWorkspaceProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // ✅ Parallel: verify membership + fetch projects at the same time
    const [workspace, projects] = await Promise.all([
      Workspace.findOne({ _id: workspaceId, "members.user": req.user._id })
        .populate("members.user", "name email profilePicture")
        .lean(),
      Project.find({
        workspace: workspaceId,
        isArchived: false,
        members: { $elemMatch: { user: req.user._id } },
      })
        .populate("tasks", "status")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    res.status(200).json({ projects, workspace });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   GET WORKSPACE STATS
========================= */
const getWorkspaceStats = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // ✅ Parallel: membership check + project count + projects in one shot
    const [workspace, totalProjects, projects] = await Promise.all([
      Workspace.findById(workspaceId).select("members").lean(),
      Project.countDocuments({ workspace: workspaceId }),
      Project.find({ workspace: workspaceId })
        .populate("tasks", "title status dueDate project updatedAt isArchived priority")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const isMember = workspace.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!isMember) return res.status(403).json({ message: "You are not a member of this workspace" });

    // ✅ Single pass over all tasks — compute all stats at once
    const tasks = projects.flatMap((p) => p.tasks);

    let totalTasks = 0, totalTaskCompleted = 0, totalTaskToDo = 0, totalTaskInProgress = 0;

    const taskPriorityMap = { High: 0, Medium: 0, Low: 0 };
    const projectStatusMap = { Completed: 0, "In Progress": 0, Planning: 0 };

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingTasks = [];

    // Build a date→dayName lookup for the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d;
    }).reverse();

    const dayKeyOf = (date) =>
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last7DayKeys = last7Days.map(dayKeyOf);
    const last7DayNames = last7Days.map((d) =>
      d.toLocaleDateString("en-US", { weekday: "short" })
    );

    const taskTrendsData = [
      { name: "Sun", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Mon", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Tue", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Wed", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Thu", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Fri", completed: 0, inProgress: 0, toDo: 0 },
      { name: "Sat", completed: 0, inProgress: 0, toDo: 0 },
    ];
    const trendByName = Object.fromEntries(taskTrendsData.map((d) => [d.name, d]));

    // ✅ FIXED: was `for (const task in project.tasks)` — `in` iterates indices not values!
    // ✅ Single loop over all tasks — O(n) instead of O(projects × tasks)
    for (const task of tasks) {
      totalTasks++;
      if (task.status === "Done") totalTaskCompleted++;
      else if (task.status === "To Do") totalTaskToDo++;
      else if (task.status === "In Progress") totalTaskInProgress++;

      if (task.priority) taskPriorityMap[task.priority] = (taskPriorityMap[task.priority] || 0) + 1;

      // Upcoming tasks (next 7 days)
      if (task.dueDate) {
        const due = new Date(task.dueDate);
        if (due > now && due <= in7Days) upcomingTasks.push(task);
      }

      // Trend data — check if updatedAt falls in last 7 days
      if (task.updatedAt) {
        const taskKey = dayKeyOf(new Date(task.updatedAt));
        const dayIdx = last7DayKeys.indexOf(taskKey);
        if (dayIdx !== -1) {
          const dayData = trendByName[last7DayNames[dayIdx]];
          if (dayData) {
            if (task.status === "Done") dayData.completed++;
            else if (task.status === "In Progress") dayData.inProgress++;
            else if (task.status === "To Do") dayData.toDo++;
          }
        }
      }
    }

    for (const project of projects) {
      if (projectStatusMap[project.status] !== undefined) {
        projectStatusMap[project.status]++;
      }
    }

    const totalProjectInProgress = projectStatusMap["In Progress"];

    const projectStatusData = [
      { name: "Completed", value: projectStatusMap.Completed, color: "#10b981" },
      { name: "In Progress", value: projectStatusMap["In Progress"], color: "#3b82f6" },
      { name: "Planning", value: projectStatusMap.Planning, color: "#f59e0b" },
    ];

    const taskPriorityData = [
      { name: "High", value: taskPriorityMap.High, color: "#ef4444" },
      { name: "Medium", value: taskPriorityMap.Medium, color: "#f59e0b" },
      { name: "Low", value: taskPriorityMap.Low, color: "#6b7280" },
    ];

    // ✅ Build productivity data in one pass
    const tasksByProject = new Map(projects.map((p) => [p._id.toString(), []]));
    for (const task of tasks) {
      tasksByProject.get(task.project?.toString())?.push(task);
    }

    const workspaceProductivityData = projects.map((project) => {
      const projectTasks = tasksByProject.get(project._id.toString()) || [];
      const completed = projectTasks.filter((t) => t.status === "Done" && !t.isArchived).length;
      return { name: project.title, completed, total: projectTasks.length };
    });

    res.status(200).json({
      stats: { totalProjects, totalTasks, totalProjectInProgress, totalTaskCompleted, totalTaskToDo, totalTaskInProgress },
      taskTrendsData,
      projectStatusData,
      taskPriorityData,
      workspaceProductivityData,
      upcomingTasks,
      recentProjects: projects.slice(0, 5),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   INVITE USER TO WORKSPACE
========================= */
const inviteUserToWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;

    // ✅ Parallel: fetch workspace + target user at the same time
    const [workspace, existingUser] = await Promise.all([
      Workspace.findById(workspaceId).lean(),
      User.findOne({ email }).lean(),
    ]);

    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!existingUser) return res.status(400).json({ message: "User not found" });

    const userMemberInfo = workspace.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!userMemberInfo || !["admin", "owner"].includes(userMemberInfo.role)) {
      return res.status(403).json({ message: "You are not authorized to invite members to this workspace" });
    }

    const isAlreadyMember = workspace.members.some(
      (m) => m.user.toString() === existingUser._id.toString()
    );
    if (isAlreadyMember) return res.status(400).json({ message: "User already a member of this workspace" });

    const isInvited = await WorkspaceInvite.findOne({ user: existingUser._id, workspaceId }).lean();
    if (isInvited && isInvited.expiresAt > new Date()) {
      return res.status(400).json({ message: "User already invited to this workspace" });
    }

    const inviteToken = jwt.sign(
      { user: existingUser._id, workspaceId, role: role || "member" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const invitationLink = `${process.env.FRONTEND_URL}/workspace-invite/${workspace._id}?tk=${inviteToken}`;

    // ✅ Parallel: upsert invite record + send email
    await Promise.all([
      WorkspaceInvite.findOneAndUpdate(
        { user: existingUser._id, workspaceId },
        {
          token: inviteToken,
          role: role || "member",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        { upsert: true }
      ),
      sendEmail(
        email,
        `Invitation to join ${workspace.name} on TaskNest`,
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <h2 style="color:#2563eb;">Workspace Invitation - TaskNest</h2>
          <p>You have been invited to collaborate on <strong>${workspace.name}</strong> in <strong>TaskNest</strong>.</p>
          <p style="margin:20px 0;">
            <a href="${invitationLink}" style="background:#2563eb;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Join Workspace</a>
          </p>
          <p>Or copy: <a href="${invitationLink}">${invitationLink}</a></p>
          <br/><p>Best regards,<br/><strong>TaskNest Team</strong></p>
        </div>`
      ),
    ]);

    res.status(200).json({ message: "Invitation sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   ACCEPT GENERATE INVITE
========================= */
const acceptGenerateInvite = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const isMember = workspace.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (isMember) return res.status(200).json({ message: "Already a member", workspaceId });

    workspace.members.push({ user: req.user._id, role: "member", joinedAt: new Date() });

    // ✅ Parallel: save workspace + add user to all projects + record activity
    await Promise.all([
      workspace.save(),
      Project.updateMany({ workspace: workspaceId }, { $addToSet: { members: req.user._id } }),
    ]);

    recordActivity(req.user._id, "joined_workspace", "Workspace", workspaceId, {
      description: `Joined ${workspace.name} workspace`,
    });

    res.status(200).json({ message: "Invitation accepted successfully", workspaceId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   ACCEPT INVITE BY TOKEN
========================= */
const acceptInviteByToken = async (req, res) => {
  try {
    const { token } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { user, workspaceId, role } = decoded;

    // ✅ Parallel: fetch workspace + invite record
    const [workspace, inviteInfo] = await Promise.all([
      Workspace.findById(workspaceId),
      WorkspaceInvite.findOne({ user, workspaceId }).lean(),
    ]);

    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!inviteInfo) return res.status(404).json({ message: "Invitation not found" });
    if (inviteInfo.expiresAt < new Date()) return res.status(400).json({ message: "Invitation has expired" });

    const isMember = workspace.members.some((m) => m.user.toString() === user.toString());
    if (isMember) return res.status(400).json({ message: "User already a member of this workspace" });

    workspace.members.push({ user, role: role || "member", joinedAt: new Date() });

    await Promise.all([
      workspace.save(),
      WorkspaceInvite.deleteOne({ _id: inviteInfo._id }),
    ]);

    recordActivity(user, "joined_workspace", "Workspace", workspaceId, {
      description: `Joined ${workspace.name} workspace`,
    });

    res.status(200).json({ message: "Invitation accepted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   UPDATE WORKSPACE
========================= */
const updateWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, description, color } = req.body;

    // ✅ findByIdAndUpdate — single round-trip, no fetch+save needed
    const workspace = await Workspace.findOneAndUpdate(
      { _id: workspaceId, owner: req.user._id },
      { name, description, color },
      { new: true }
    );

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found or you are not the owner" });
    }

    res.status(200).json(workspace);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   TRANSFER WORKSPACE OWNERSHIP
========================= */
const transferWorkspaceOwnership = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { newOwnerId } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    if (workspace.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only owner can transfer ownership" });
    }

    workspace.members.forEach((m) => {
      if (m.user.toString() === newOwnerId) m.role = "owner";
      else if (m.role === "owner") m.role = "admin";
    });
    workspace.owner = newOwnerId;

    await workspace.save();

    res.status(200).json({ message: "Ownership transferred" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   DELETE WORKSPACE
========================= */
const deleteWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // ✅ findOneAndDelete with owner check — single query
    const workspace = await Workspace.findOneAndDelete({
      _id: workspaceId,
      owner: req.user._id,
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found or you are not the owner" });
    }

    res.status(200).json({ message: "Workspace deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export {
  createWorkspace,
  getWorkspaces,
  getWorkspaceDetails,
  getWorkspaceProjects,
  getWorkspaceStats,
  inviteUserToWorkspace,
  acceptGenerateInvite,
  acceptInviteByToken,
  updateWorkspace,
  transferWorkspaceOwnership,
  deleteWorkspace,
};