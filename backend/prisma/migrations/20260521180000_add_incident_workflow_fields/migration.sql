-- Add incident workflow fields to damage_incidents
-- Additive-only migration: all new columns are nullable, no existing data affected.

-- Add damageDate: when the damage actually occurred (user-selected in wizard)
ALTER TABLE "damage_incidents" ADD COLUMN "damageDate" TIMESTAMP(3);

-- Add intent: 'accidental' | 'intentional'
ALTER TABLE "damage_incidents" ADD COLUMN "intent" VARCHAR(20);

-- Add workflowStep: current position in the unified incident state machine
ALTER TABLE "damage_incidents" ADD COLUMN "workflowStep" VARCHAR(30);

-- Make equipmentId nullable so user-only incidents (no device) are supported
ALTER TABLE "damage_incidents" ALTER COLUMN "equipmentId" DROP NOT NULL;

-- Indexes for dashboard and list queries
CREATE INDEX "damage_incidents_damageDate_idx" ON "damage_incidents"("damageDate");
CREATE INDEX "damage_incidents_intent_idx" ON "damage_incidents"("intent");
CREATE INDEX "damage_incidents_workflowStep_idx" ON "damage_incidents"("workflowStep");
