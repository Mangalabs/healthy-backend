-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "pet_loadout" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "pet_items" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "item_id" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_items_profile_id_item_id_key" ON "pet_items"("profile_id", "item_id");

-- AddForeignKey
ALTER TABLE "pet_items" ADD CONSTRAINT "pet_items_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
