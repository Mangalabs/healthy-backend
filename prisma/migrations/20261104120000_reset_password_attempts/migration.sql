-- AlterTable
ALTER TABLE "users" ADD COLUMN "reset_password_attempts" INTEGER NOT NULL DEFAULT 0;
