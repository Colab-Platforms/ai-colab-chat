-- Run AFTER `prisma db push`. Idempotent. Re-run after any later db push,
-- which may drop indexes Prisma does not know about.

CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw
  ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunk_tsv_gin
  ON "KnowledgeChunk" USING gin (tsv);

CREATE INDEX IF NOT EXISTS knowledge_chunk_metadata_gin
  ON "KnowledgeChunk" USING gin (metadata jsonb_path_ops);
