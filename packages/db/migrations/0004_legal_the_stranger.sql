ALTER TABLE "attempts" ADD COLUMN "question_order" jsonb;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "randomize_question_order" boolean DEFAULT false NOT NULL;