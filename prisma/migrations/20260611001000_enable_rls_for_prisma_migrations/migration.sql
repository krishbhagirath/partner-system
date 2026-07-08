-- Prisma's migration history table is not application data, but it still lives in
-- Supabase's exposed public schema, so keep it closed to browser-facing API roles.

ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "_prisma_migrations" FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;
