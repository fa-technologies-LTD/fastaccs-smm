-- CreateTable
CREATE TABLE "blog_post_likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_post_likes_slug_idx" ON "blog_post_likes"("slug");
