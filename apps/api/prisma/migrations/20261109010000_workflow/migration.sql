ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "tickets"
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "tickets"
SET "due_at" = "created_at" + CASE "priority"
  WHEN 'CRITICAL' THEN INTERVAL '4 hours'
  WHEN 'HIGH' THEN INTERVAL '12 hours'
  WHEN 'MEDIUM' THEN INTERVAL '24 hours'
  ELSE INTERVAL '72 hours'
END
WHERE "status" IN ('OPEN', 'IN_PROGRESS');
