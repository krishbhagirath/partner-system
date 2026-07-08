-- Supabase exposes tables in the public schema through its API roles unless access is
-- restricted. The app uses Prisma/Auth.js from trusted server code, so browser-facing
-- Supabase roles should not be able to read or mutate these tables directly.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoverableSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerRequest" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "User", "Account", "Session", "VerificationToken", "ImportJob", "Section", "DiscoverableSection", "PartnerRequest" FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;
