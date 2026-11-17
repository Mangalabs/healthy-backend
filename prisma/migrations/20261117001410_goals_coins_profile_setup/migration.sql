-- CreateEnum
CREATE TYPE "BodyGoal" AS ENUM ('LOSE', 'DEFINE', 'GAIN', 'MAINTAIN', 'RECOVER');

-- CreateEnum
CREATE TYPE "TrackedModule" AS ENUM ('MEDICATION', 'HYDRATION', 'EXERCISE', 'WEIGHT', 'MEALS');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('WEIGHT', 'WEEKLY_WORKOUTS');

-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('LOSE', 'GAIN', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "body_goal" "BodyGoal",
ADD COLUMN     "body_mirror" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "health_floor_bmi" DECIMAL(3,1) NOT NULL DEFAULT 18.5,
ADD COLUMN     "height_cm" INTEGER,
ADD COLUMN     "setup_completed_at" TIMESTAMPTZ,
ADD COLUMN     "target_weight_kg" DECIMAL(5,2),
ADD COLUMN     "tracked_modules" "TrackedModule"[];

-- CreateTable
CREATE TABLE "coin_events" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "ref_id" VARCHAR(80) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rest_days" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "day_key" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rest_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "type" "GoalType" NOT NULL,
    "direction" "GoalDirection" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_value" DECIMAL(6,2) NOT NULL,
    "target_value" DECIMAL(6,2) NOT NULL,
    "reward_target" DECIMAL(6,2) NOT NULL,
    "checkpoints" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "achieved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_events_profile_id_created_at_idx" ON "coin_events"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "coin_events_profile_id_reason_ref_id_key" ON "coin_events"("profile_id", "reason", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "rest_days_profile_id_day_key_key" ON "rest_days"("profile_id", "day_key");

-- CreateIndex
CREATE INDEX "goals_profile_id_status_idx" ON "goals"("profile_id", "status");

-- AddForeignKey
ALTER TABLE "coin_events" ADD CONSTRAINT "coin_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rest_days" ADD CONSTRAINT "rest_days_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
