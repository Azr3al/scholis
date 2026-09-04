CREATE TABLE "test_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_tag_assignments" (
	"test_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "test_tag_assignments_test_id_tag_id_pk" PRIMARY KEY("test_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "test_tags" ADD CONSTRAINT "test_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_tag_assignments" ADD CONSTRAINT "test_tag_assignments_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_tag_assignments" ADD CONSTRAINT "test_tag_assignments_tag_id_test_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."test_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_tags_org_id_idx" ON "test_tags" USING btree ("org_id");
