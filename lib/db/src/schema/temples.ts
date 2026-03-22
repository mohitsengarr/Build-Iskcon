import { pgTable, serial, text, numeric, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templeStatusEnum = pgEnum("temple_status", [
  "planning",
  "construction",
  "finishing",
  "consecrated",
  "operational",
]);

export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const updateCategoryEnum = pgEnum("update_category", [
  "construction",
  "fundraising",
  "spiritual",
  "logistics",
  "general",
]);

export const templesTable = pgTable("temples", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  deity: text("deity").notNull(),
  description: text("description").notNull(),
  status: templeStatusEnum("status").notNull().default("planning"),
  phase: text("phase").notNull(),
  constructionProgress: numeric("construction_progress", { precision: 5, scale: 2 }).notNull().default("0"),
  fundraisingGoal: numeric("fundraising_goal", { precision: 15, scale: 2 }).notNull().default("0"),
  fundraisingRaised: numeric("fundraising_raised", { precision: 15, scale: 2 }).notNull().default("0"),
  startDate: text("start_date").notNull(),
  expectedCompletion: text("expected_completion").notNull(),
  projectLead: text("project_lead").notNull(),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  templeId: integer("temple_id").notNull().references(() => templesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: milestoneStatusEnum("status").notNull().default("pending"),
  targetDate: text("target_date").notNull(),
  completedDate: text("completed_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectUpdatesTable = pgTable("project_updates", {
  id: serial("id").primaryKey(),
  templeId: integer("temple_id").notNull().references(() => templesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  category: updateCategoryEnum("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contributorsTable = pgTable("contributors", {
  id: serial("id").primaryKey(),
  templeId: integer("temple_id").notNull().references(() => templesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  contribution: text("contribution").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTempleSchema = createInsertSchema(templesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({ id: true, createdAt: true });
export const insertUpdateSchema = createInsertSchema(projectUpdatesTable).omit({ id: true, createdAt: true });
export const insertContributorSchema = createInsertSchema(contributorsTable).omit({ id: true, createdAt: true });

export type Temple = typeof templesTable.$inferSelect;
export type InsertTemple = z.infer<typeof insertTempleSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type ProjectUpdate = typeof projectUpdatesTable.$inferSelect;
export type InsertUpdate = z.infer<typeof insertUpdateSchema>;
export type Contributor = typeof contributorsTable.$inferSelect;
export type InsertContributor = z.infer<typeof insertContributorSchema>;
