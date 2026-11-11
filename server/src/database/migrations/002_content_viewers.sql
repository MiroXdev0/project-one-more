ALTER TABLE presentations
  ADD COLUMN IF NOT EXISTS slides JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE presentations
SET slides = jsonb_build_array(jsonb_build_object(
  'title', title,
  'content', concat_ws(E'\n\n', NULLIF(description, ''), NULLIF(notes, '')),
  'image_file_id', NULL
))
WHERE slides = '[]'::jsonb;

ALTER TABLE stored_files
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stored_files_assignment_created_idx
  ON stored_files(assignment_id, created_at DESC)
  WHERE assignment_id IS NOT NULL;
