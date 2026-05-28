-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';
