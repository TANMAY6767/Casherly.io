ALTER TABLE "transactions" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE "transactions" ADD COLUMN "category" VARCHAR(50);
ALTER TABLE "reimbursement_claims" ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'INR';

UPDATE "transactions" AS t
SET "currency" = COALESCE(b."currency", 'INR')
FROM "teams" AS tm
LEFT JOIN "budgets" AS b ON b."team_id" = tm."id"
WHERE t."team_id" = tm."id";

UPDATE "reimbursement_claims" AS c
SET "currency" = COALESCE(b."currency", 'INR')
FROM "budgets" AS b
WHERE c."team_id" = b."team_id";
