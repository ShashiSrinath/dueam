-- Add references to emails table
ALTER TABLE emails ADD COLUMN references_header TEXT;

-- Update thread_id heuristic
-- 1. If we have in_reply_to, find the parent's thread_id
-- 2. If no parent found, but we have references, try to find any message in references and use its thread_id
-- 3. Otherwise, use message_id as thread_id
