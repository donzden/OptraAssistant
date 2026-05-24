-- AlterTable: add exitRules and finalPnl to live_positions
ALTER TABLE "live_positions" ADD COLUMN "exitRules" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "live_positions" ADD COLUMN "finalPnl" DOUBLE PRECISION;

-- CreateTable: exit_signals
CREATE TABLE "exit_signals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "livePositionId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleLabel" TEXT NOT NULL,
    "currentPnl" DOUBLE PRECISION NOT NULL,
    "triggerValue" DOUBLE PRECISION NOT NULL,
    "suggestion" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exit_signals_userId_idx" ON "exit_signals"("userId");
CREATE INDEX "exit_signals_livePositionId_idx" ON "exit_signals"("livePositionId");

-- AddForeignKey
ALTER TABLE "exit_signals" ADD CONSTRAINT "exit_signals_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exit_signals" ADD CONSTRAINT "exit_signals_livePositionId_fkey"
    FOREIGN KEY ("livePositionId") REFERENCES "live_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
