-- AlterTable
ALTER TABLE "affiliate_programs" ADD COLUMN     "total_paid" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "commission_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "affiliate_program_id" UUID NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "payout_method" TEXT NOT NULL,
    "payout_reference" TEXT,
    "payout_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "processed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_affiliate_program_id_fkey" FOREIGN KEY ("affiliate_program_id") REFERENCES "affiliate_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
