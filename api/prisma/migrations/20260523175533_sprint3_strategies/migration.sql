-- CreateEnum
CREATE TYPE "StrategyCategory" AS ENUM ('DIRECTIONAL', 'NON_DIRECTIONAL', 'VOLATILITY');

-- CreateEnum
CREATE TYPE "StrategyType" AS ENUM ('DEBIT', 'CREDIT', 'VARIES');

-- CreateEnum
CREATE TYPE "IVLevel" AS ENUM ('LOW', 'LOW_NORMAL', 'NORMAL', 'HIGH_NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('CONSERVATIVE', 'MODERATE', 'AGGRESSIVE');

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StrategyCategory" NOT NULL,
    "type" "StrategyType" NOT NULL,
    "description" TEXT NOT NULL,
    "outlook" TEXT[],
    "ivLevels" "IVLevel"[],
    "dteMin" INTEGER,
    "dteMax" INTEGER,
    "riskLevel" "RiskLevel" NOT NULL,
    "legs" JSONB NOT NULL,
    "conditions" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EXCEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_strategy_favourites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_strategy_favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strategies_name_key" ON "strategies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_strategy_favourites_userId_strategyId_key" ON "user_strategy_favourites"("userId", "strategyId");

-- AddForeignKey
ALTER TABLE "user_strategy_favourites" ADD CONSTRAINT "user_strategy_favourites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_strategy_favourites" ADD CONSTRAINT "user_strategy_favourites_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
