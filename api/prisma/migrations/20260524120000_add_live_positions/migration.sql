-- CreateEnum
CREATE TYPE "LivePositionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "live_positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "legs" JSONB NOT NULL,
    "status" "LivePositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "stopLossPct" DOUBLE PRECISION,
    "notes" TEXT,
    "pnlHistory" JSONB NOT NULL DEFAULT '[]',
    "userStrategyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_positions_userId_idx" ON "live_positions"("userId");

-- AddForeignKey
ALTER TABLE "live_positions" ADD CONSTRAINT "live_positions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
