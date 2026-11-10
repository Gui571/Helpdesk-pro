CREATE TYPE "Role" AS ENUM ('ADMIN', 'TECHNICIAN', 'EMPLOYEE');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TABLE "users" (
 "id" UUID NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL,
 "password_hash" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "sessions" (
 "id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "user_id" UUID NOT NULL,
 "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE TABLE "categories" ("id" UUID NOT NULL, "name" TEXT NOT NULL, CONSTRAINT "categories_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE TABLE "tickets" (
 "id" UUID NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
 "priority" "Priority" NOT NULL DEFAULT 'MEDIUM', "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
 "requester_id" UUID NOT NULL, "assignee_id" UUID, "category_id" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tickets_requester_id_created_at_idx" ON "tickets"("requester_id", "created_at");
CREATE INDEX "tickets_status_created_at_idx" ON "tickets"("status", "created_at");
CREATE TABLE "comments" (
 "id" UUID NOT NULL, "content" TEXT NOT NULL, "ticket_id" UUID NOT NULL, "author_id" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comments_ticket_id_created_at_idx" ON "comments"("ticket_id", "created_at");
CREATE TABLE "ticket_history" (
 "id" UUID NOT NULL, "ticket_id" UUID NOT NULL, "actor_id" UUID NOT NULL,
 "action" TEXT NOT NULL, "detail" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_history_ticket_id_created_at_idx" ON "ticket_history"("ticket_id", "created_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
