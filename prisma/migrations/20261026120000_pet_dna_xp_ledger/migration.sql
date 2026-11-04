-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "last_active_date" VARCHAR(10),
ADD COLUMN     "max_streak_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pet_dna" JSONB,
ADD COLUMN     "pet_species" VARCHAR(30) NOT NULL DEFAULT 'CAT';

-- CreateTable
CREATE TABLE "xp_events" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "ref_id" VARCHAR(64) NOT NULL DEFAULT '',
    "day_key" VARCHAR(10) NOT NULL,
    "xp" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xp_events_profile_id_day_key_action_idx" ON "xp_events"("profile_id", "day_key", "action");

-- AddForeignKey
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
