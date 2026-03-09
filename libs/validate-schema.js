import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
const verifyEmailSchema = z.object({ token: z.string().min(1, "Token is required") });
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
const emailSchema = z.object({ email: z.string().email("Invalid email address") });
const tokenSchema = z.object({ token: z.string().min(1, "Token is required") });
const workspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  description: z.string().optional(),
  color: z.string().min(1, "Color is required"),
});
const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});
const projectSchema = z.object({
  title: z.string().min(3, "Project title must be at least 3 characters"),
  description: z.string().optional(),
  status: z.enum(["Planning", "In Progress", "On Hold", "Completed", "Cancelled"]),
  startDate: z.string(),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
  members: z.array(z.object({ user: z.string(), role: z.enum(["manager", "contributor", "viewer"]) })).optional(),
});
const taskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  status: z.enum(["To Do", "In Progress", "Done"]),
  priority: z.enum(["Low", "Medium", "High"]),
  dueDate: z.string().min(1, "Due date is required"),
  assignees: z.array(z.string()).min(1, "At least one assignee is required"),
});

export {
  registerSchema, loginSchema, verifyEmailSchema, resetPasswordSchema,
  emailSchema, tokenSchema, workspaceSchema, inviteMemberSchema, projectSchema, taskSchema,
};