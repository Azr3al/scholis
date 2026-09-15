CREATE TABLE "teacher_sso_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"external_ref" text,
	"minted_by_client_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_sso_tickets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "teacher_sso_tickets" ADD CONSTRAINT "teacher_sso_tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_sso_tickets" ADD CONSTRAINT "teacher_sso_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_sso_tickets" ADD CONSTRAINT "teacher_sso_tickets_minted_by_client_id_api_clients_id_fk" FOREIGN KEY ("minted_by_client_id") REFERENCES "public"."api_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_sso_tickets_org_idx" ON "teacher_sso_tickets" USING btree ("org_id");