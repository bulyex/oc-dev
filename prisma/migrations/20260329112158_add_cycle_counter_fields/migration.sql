/*
  Warnings:

  - You are about to drop the column `weekProgress` on the `Cycle` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cycleLengthInWeeks" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'active',
    "visionText" TEXT NOT NULL,
    "goalsText" TEXT NOT NULL,
    "planText" TEXT,
    "currentWeek" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "activeStartedAt" DATETIME,
    "dayCount" INTEGER NOT NULL DEFAULT 0,
    "weekCount" INTEGER NOT NULL DEFAULT 0,
    "cycleCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Cycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Cycle" ("activeStartedAt", "completedAt", "currentWeek", "cycleCount", "dayCount", "goalsText", "id", "planText", "startedAt", "status", "userId", "visionText", "weekCount") SELECT "activeStartedAt", "completedAt", "currentWeek", "cycleCount", "dayCount", "goalsText", "id", "planText", "startedAt", "status", "userId", "visionText", "weekCount" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE INDEX "Cycle_userId_idx" ON "Cycle"("userId");
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
