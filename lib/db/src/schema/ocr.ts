import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Enums ───────────────────────────────────────────────────────────────────

export const ocrDocumentStatusEnum = pgEnum("ocr_document_status", [
  "pending",
  "processing",
  "completed",
  "completed_partial",
  "failed",
  "cancelled",
]);

export const ocrFileTypeEnum = pgEnum("ocr_file_type", ["image", "pdf"]);

export const ocrJobTypeEnum = pgEnum("ocr_job_type", ["initial", "reprocess"]);

export const ocrJobStatusEnum = pgEnum("ocr_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const ocrPageStatusEnum = pgEnum("ocr_page_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "skipped",
]);

export const ocrRegionTypeEnum = pgEnum("ocr_region_type", [
  "text_block",
  "verse_block",
  "header",
  "footer",
  "page_number",
  "annotation",
]);

export const ocrLangLabelEnum = pgEnum("ocr_lang_label", [
  "hi_prose",
  "sa_verse",
  "sa_prose",
  "mixed_hi_sa",
  "uncertain",
]);

export const ocrReviewStatusEnum = pgEnum("ocr_review_status", [
  "none",
  "needs_review",
  "reviewed",
  "approved",
]);

export const ocrReviewTaskStatusEnum = pgEnum("ocr_review_task_status", [
  "open",
  "in_progress",
  "completed",
  "skipped",
]);

// ── Tables ──────────────────────────────────────────────────────────────────

export const ocrDocumentsTable = pgTable(
  "ocr_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileName: text("file_name").notNull(),
    fileType: ocrFileTypeEnum("file_type").notNull(),
    sourceFileUrl: text("source_file_url").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    pageCount: integer("page_count").notNull().default(1),
    pagesCompleted: integer("pages_completed").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    status: ocrDocumentStatusEnum("status").notNull().default("pending"),
    overallConfidence: numeric("overall_confidence", { precision: 4, scale: 3 }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_documents_status").on(table.status),
    index("idx_ocr_documents_created").on(table.createdAt),
  ],
);

export const ocrJobsTable = pgTable(
  "ocr_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ocrDocumentsTable.id, { onDelete: "cascade" }),
    jobType: ocrJobTypeEnum("job_type").notNull().default("initial"),
    status: ocrJobStatusEnum("status").notNull().default("queued"),
    pageRangeStart: integer("page_range_start"),
    pageRangeEnd: integer("page_range_end"),
    modelVersion: text("model_version"),
    pipelineVersion: text("pipeline_version"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_jobs_status_created").on(table.status, table.createdAt),
    index("idx_ocr_jobs_document").on(table.documentId),
  ],
);

export const ocrPagesTable = pgTable(
  "ocr_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ocrDocumentsTable.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    status: ocrPageStatusEnum("status").notNull().default("pending"),
    pageImageUrl: text("page_image_url"),
    activeRunId: uuid("active_run_id"),
    retryCount: integer("retry_count").notNull().default(0),
    pageConfidence: numeric("page_confidence", { precision: 4, scale: 3 }),
    regionCount: integer("region_count").notNull().default(0),
    searchableText: text("searchable_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_ocr_pages_doc_page").on(table.documentId, table.pageNumber),
    index("idx_ocr_pages_doc_status").on(table.documentId, table.status),
  ],
);

export const ocrPageRunsTable = pgTable(
  "ocr_page_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => ocrPagesTable.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ocrJobsTable.id, { onDelete: "cascade" }),
    modelVersion: text("model_version").notNull(),
    pipelineVersion: text("pipeline_version").notNull(),
    ocrEngine: text("ocr_engine").notNull().default("sarvam"),
    preprocessingFlags: jsonb("preprocessing_flags").default({}),
    processingTimeMs: integer("processing_time_ms"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_page_runs_page_active").on(table.pageId, table.isActive),
    index("idx_ocr_page_runs_job").on(table.jobId),
  ],
);

export const ocrRegionsTable = pgTable(
  "ocr_regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => ocrPagesTable.id, { onDelete: "cascade" }),
    pageRunId: uuid("page_run_id")
      .notNull()
      .references(() => ocrPageRunsTable.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    pageNumber: integer("page_number").notNull(),
    regionOrder: integer("region_order").notNull(),
    regionType: ocrRegionTypeEnum("region_type").notNull().default("text_block"),
    bboxX: integer("bbox_x").notNull(),
    bboxY: integer("bbox_y").notNull(),
    bboxWidth: integer("bbox_width").notNull(),
    bboxHeight: integer("bbox_height").notNull(),
    rawText: text("raw_text").notNull(),
    correctedText: text("corrected_text"),
    approvedText: text("approved_text"),
    ocrConfidence: numeric("ocr_confidence", { precision: 4, scale: 3 }).notNull(),
    langLabel: ocrLangLabelEnum("lang_label").notNull().default("uncertain"),
    langConfidence: numeric("lang_confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    langSignals: jsonb("lang_signals").default({}),
    reviewStatus: ocrReviewStatusEnum("review_status").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_regions_doc_page").on(table.documentId, table.pageNumber, table.regionOrder),
    index("idx_ocr_regions_page").on(table.pageId),
    index("idx_ocr_regions_run").on(table.pageRunId),
  ],
);

export const ocrReviewTasksTable = pgTable(
  "ocr_review_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => ocrDocumentsTable.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => ocrPagesTable.id, { onDelete: "cascade" }),
    regionId: uuid("region_id").references(() => ocrRegionsTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: ocrReviewTaskStatusEnum("status").notNull().default("open"),
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_ocr_review_tasks_status").on(table.status),
    index("idx_ocr_review_tasks_doc").on(table.documentId, table.status),
  ],
);

export const ocrReviewEditsTable = pgTable(
  "ocr_review_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewTaskId: uuid("review_task_id")
      .notNull()
      .references(() => ocrReviewTasksTable.id, { onDelete: "cascade" }),
    regionId: uuid("region_id")
      .notNull()
      .references(() => ocrRegionsTable.id, { onDelete: "cascade" }),
    originalText: text("original_text").notNull(),
    editedText: text("edited_text").notNull(),
    fieldEdited: text("field_edited").notNull(),
    editedBy: text("edited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_review_edits_region").on(table.regionId),
    index("idx_ocr_review_edits_task").on(table.reviewTaskId),
  ],
);

export const ocrModelVersionsTable = pgTable(
  "ocr_model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engine: text("engine").notNull(),
    modelName: text("model_name").notNull(),
    version: text("version").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ocr_model_versions_default").on(table.engine, table.isDefault),
  ],
);

// ── Types ───────────────────────────────────────────────────────────────────

export type OcrDocument = typeof ocrDocumentsTable.$inferSelect;
export type InsertOcrDocument = typeof ocrDocumentsTable.$inferInsert;

export type OcrJob = typeof ocrJobsTable.$inferSelect;
export type InsertOcrJob = typeof ocrJobsTable.$inferInsert;

export type OcrPage = typeof ocrPagesTable.$inferSelect;
export type InsertOcrPage = typeof ocrPagesTable.$inferInsert;

export type OcrPageRun = typeof ocrPageRunsTable.$inferSelect;
export type InsertOcrPageRun = typeof ocrPageRunsTable.$inferInsert;

export type OcrRegion = typeof ocrRegionsTable.$inferSelect;
export type InsertOcrRegion = typeof ocrRegionsTable.$inferInsert;

export type OcrReviewTask = typeof ocrReviewTasksTable.$inferSelect;
export type InsertOcrReviewTask = typeof ocrReviewTasksTable.$inferInsert;

export type OcrReviewEdit = typeof ocrReviewEditsTable.$inferSelect;
export type InsertOcrReviewEdit = typeof ocrReviewEditsTable.$inferInsert;

export type OcrModelVersion = typeof ocrModelVersionsTable.$inferSelect;
export type InsertOcrModelVersion = typeof ocrModelVersionsTable.$inferInsert;
