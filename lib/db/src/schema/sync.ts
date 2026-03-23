import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "completed",
  "failed",
]);

export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  status: syncStatusEnum("status").notNull().default("running"),
  templesUpdated: integer("temples_updated").notNull().default(0),
  templesAdded: integer("temples_added").notNull().default(0),
  updatesCreated: integer("updates_created").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertSyncJobSchema = createInsertSchema(syncJobsTable).omit({ id: true, startedAt: true });
export type SyncJob = typeof syncJobsTable.$inferSelect;
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;
