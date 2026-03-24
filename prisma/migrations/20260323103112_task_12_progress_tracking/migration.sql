-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "fsmState" TEXT NOT NULL DEFAULT 'hello',
    "vision" TEXT,
    "goals" TEXT,
    "plan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekCount" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'active',
    "visionText" TEXT NOT NULL,
    "goalsText" TEXT NOT NULL,
    "planText" TEXT NOT NULL,
    "currentWeek" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Cycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "metric" TEXT,
    "targetValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Goal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "focus" TEXT,
    "rhythm" TEXT,
    "planText" TEXT,
    "score" INTEGER,
    "reviewText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Week_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "when" TEXT,
    "metric" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeekAction_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "dailyPlanText" TEXT,
    "checkinText" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Day_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActionCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "dayId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionCompletion_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "WeekAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActionCompletion_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "Cycle_userId_idx" ON "Cycle"("userId");

-- CreateIndex
CREATE INDEX "Cycle_status_idx" ON "Cycle"("status");

-- CreateIndex
CREATE INDEX "Goal_cycleId_idx" ON "Goal"("cycleId");

-- CreateIndex
CREATE INDEX "Week_cycleId_idx" ON "Week"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "Week_cycleId_weekNumber_key" ON "Week"("cycleId", "weekNumber");

-- CreateIndex
CREATE INDEX "WeekAction_weekId_idx" ON "WeekAction"("weekId");

-- CreateIndex
CREATE INDEX "Day_weekId_idx" ON "Day"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "Day_weekId_dayNumber_key" ON "Day"("weekId", "dayNumber");

-- CreateIndex
CREATE INDEX "ActionCompletion_actionId_idx" ON "ActionCompletion"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionCompletion_actionId_dayId_key" ON "ActionCompletion"("actionId", "dayId");
