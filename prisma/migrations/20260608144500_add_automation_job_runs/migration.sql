CREATE TABLE "automation_job_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_name" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB NOT NULL DEFAULT '{}',
    "error_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_job_locks" (
    "job_name" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_job_locks_pkey" PRIMARY KEY ("job_name")
);

CREATE UNIQUE INDEX "automation_job_runs_execution_id_key"
ON "automation_job_runs"("execution_id");

CREATE INDEX "automation_job_runs_job_name_started_at_idx"
ON "automation_job_runs"("job_name", "started_at");

CREATE INDEX "automation_job_runs_status_started_at_idx"
ON "automation_job_runs"("status", "started_at");

CREATE INDEX "automation_job_locks_expires_at_idx"
ON "automation_job_locks"("expires_at");
