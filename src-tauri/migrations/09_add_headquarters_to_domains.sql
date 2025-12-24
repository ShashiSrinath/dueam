-- Migration: Add headquarters to domains
ALTER TABLE domains ADD COLUMN headquarters TEXT;
