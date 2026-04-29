-- AlterTable
ALTER TABLE "accounts"
ADD COLUMN "credential_extras" JSONB NOT NULL DEFAULT '{}'::jsonb;
