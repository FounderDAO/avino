-- Owner "smart return": marks a hidden (ARCHIVED) listing whose content was edited
-- while hidden, so REACTIVATE re-enters moderation instead of going straight to ACTIVE.
ALTER TABLE "listings"
  ADD COLUMN "edited_since_hidden" BOOLEAN NOT NULL DEFAULT false;
