import { z } from "zod";
import { 
  CreateTempleInputStatus, 
  CreateMilestoneInputStatus,
  CreateUpdateInputCategory
} from "@workspace/api-client-react";

export const templeFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  location: z.string().min(2, "Location is required"),
  deity: z.string().min(2, "Deity is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  status: z.nativeEnum(CreateTempleInputStatus),
  phase: z.string().min(2, "Phase is required"),
  constructionProgress: z.coerce.number().min(0).max(100),
  fundraisingGoal: z.coerce.number().min(0),
  fundraisingRaised: z.coerce.number().min(0),
  startDate: z.string().min(1, "Start date is required"),
  expectedCompletion: z.string().min(1, "Expected completion is required"),
  projectLead: z.string().min(2, "Project lead is required"),
  coverImage: z.string().optional(),
});

export const milestoneFormSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().min(5, "Description is required"),
  status: z.nativeEnum(CreateMilestoneInputStatus),
  targetDate: z.string().min(1, "Target date is required"),
  completedDate: z.string().optional(),
});

export const updateFormSchema = z.object({
  title: z.string().min(2, "Title is required"),
  content: z.string().min(10, "Content must be at least 10 characters"),
  author: z.string().min(2, "Author is required"),
  category: z.nativeEnum(CreateUpdateInputCategory),
});

export const contributorFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  role: z.string().min(2, "Role is required"),
  contribution: z.string().min(2, "Contribution detail is required"),
  amount: z.coerce.number().optional(),
  avatar: z.string().optional(),
});
