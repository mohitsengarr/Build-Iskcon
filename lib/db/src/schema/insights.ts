import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const componentInsightsTable = pgTable("component_insights", {
  id:             serial("id").primaryKey(),
  componentKey:   text("component_key").notNull(),
  title:          text("title").notNull(),
  subtitle:       text("subtitle").notNull(),
  headline:       text("headline").notNull(),
  summary:        text("summary").notNull(),
  metrics:        text("metrics").notNull(),
  recommendation: text("recommendation").notNull(),
  confidence:     text("confidence").notNull(),
  trend:          text("trend").notNull(),
  generatedAt:    timestamp("generated_at").defaultNow().notNull(),
});

export type ComponentInsight     = typeof componentInsightsTable.$inferSelect;
export type NewComponentInsight  = typeof componentInsightsTable.$inferInsert;
