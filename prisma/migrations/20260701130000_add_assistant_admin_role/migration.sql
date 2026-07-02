-- Add ASSISTANT sub-admin role (restricted: no revenue/analytics, no catalog/tier or offload).
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'ASSISTANT';
