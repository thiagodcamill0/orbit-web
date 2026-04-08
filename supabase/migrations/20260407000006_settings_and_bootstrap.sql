-- supabase/migrations/20260407000006_settings_and_bootstrap.sql
-- Domain 6: User Settings, Workspace Settings, and new-user bootstrap trigger
-- Depends on: 000001 (profiles, workspaces, workspace_members)
--             000002 (ai_integrations — default_integration_id ref)

-- ============================================================
-- TABLE: user_settings
-- ============================================================
-- RLS exception: uses auth.uid() directly (no workspace join).
-- Rows created exclusively by handle_new_user() — no INSERT policy.

CREATE TABLE user_settings (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme          TEXT        NOT NULL DEFAULT 'dark'
                             CHECK (theme IN ('dark', 'light', 'system')),
  language       TEXT        NOT NULL DEFAULT 'en',
  notify_email   BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_settings IS 'Per-user preferences. RLS uses auth.uid() directly — intentional exception to the workspace-membership pattern. Rows created by the handle_new_user trigger.';

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY user_settings_select_own
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_settings_update_own
  ON user_settings FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: workspace_settings
-- ============================================================
-- Rows created exclusively by handle_new_user() — no INSERT policy.

CREATE TABLE workspace_settings (
  workspace_id           UUID        PRIMARY KEY REFERENCES workspaces(id)     ON DELETE CASCADE,
  default_integration_id UUID                 REFERENCES ai_integrations(id)  ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE workspace_settings IS 'Per-workspace configuration. Rows created by the handle_new_user trigger. Role-based write restrictions planned for a future migration.';
COMMENT ON COLUMN workspace_settings.default_integration_id IS 'Optional default AI integration. ON DELETE SET NULL — removing an integration clears the default gracefully.';

CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY workspace_settings_select_own
  ON workspace_settings FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY workspace_settings_update_own
  ON workspace_settings FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

-- ============================================================
-- TRIGGER: workspace_settings — cross-workspace integrity
-- ============================================================

CREATE OR REPLACE FUNCTION validate_workspace_settings_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.default_integration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ai_integrations
      WHERE id = NEW.default_integration_id
        AND workspace_id = NEW.workspace_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'workspace_settings.default_integration_id does not belong to workspace % or integration is deleted', NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_workspace_settings_refs() IS
  'Validates that default_integration_id belongs to the same workspace and is not soft-deleted. SECURITY DEFINER to bypass RLS on ai_integrations.';

CREATE TRIGGER workspace_settings_validate_refs
  BEFORE INSERT OR UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION validate_workspace_settings_refs();

-- ============================================================
-- HELPER: generate_workspace_slug
-- ============================================================

CREATE OR REPLACE FUNCTION generate_workspace_slug(base_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slug      TEXT;
  candidate TEXT;
  suffix    INT := 0;
BEGIN
  slug := lower(regexp_replace(trim(base_name), '[^a-z0-9]+', '-', 'g'));
  slug := trim(both '-' from slug);

  IF slug = '' THEN
    slug := 'workspace';
  END IF;

  slug      := left(slug, 48);
  candidate := slug;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM workspaces WHERE workspaces.slug = candidate
    );
    suffix    := suffix + 1;
    candidate := slug || '-' || suffix;
  END LOOP;

  RETURN candidate;
END;
$$;

COMMENT ON FUNCTION generate_workspace_slug(TEXT) IS
  'Generates a unique, URL-safe workspace slug from a display name. Appends a numeric suffix on collision (my-name, my-name-1, …). Called only by handle_new_user.';

-- ============================================================
-- BOOTSTRAP TRIGGER: handle_new_user
-- ============================================================
-- Fires AFTER INSERT ON auth.users.
-- Insert order respects FK dependencies:
--   1. profiles           (id = auth.users.id)
--   2. workspaces         (owner_id = auth.users.id)
--   3. workspace_members  (workspace_id + user_id)
--   4. user_settings      (user_id)
--   5. workspace_settings (workspace_id)
--
-- Display name priority:
--   raw_user_meta_data->>'full_name'  (Google OAuth)
--   raw_user_meta_data->>'name'       (GitHub OAuth)
--   email prefix before '@'           (email/password)
--   'user'                            (safe fallback, never empty)
--
-- SECURITY DEFINER: runs as postgres to bypass RLS on all tables.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_workspace_id UUID;
  v_slug         TEXT;
BEGIN
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'),      ''),
    NULLIF(trim(split_part(NEW.email, '@', 1)),        ''),
    'user'
  );

  -- 1. profile
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, v_display_name);

  -- 2. workspace
  v_slug := generate_workspace_slug(v_display_name);

  INSERT INTO workspaces (owner_id, name, slug)
  VALUES (
    NEW.id,
    v_display_name || $q$'s Workspace$q$,
    v_slug
  )
  RETURNING id INTO v_workspace_id;

  -- 3. workspace membership (owner)
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');

  -- 4. user settings (defaults)
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id);

  -- 5. workspace settings (defaults)
  INSERT INTO workspace_settings (workspace_id)
  VALUES (v_workspace_id);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_new_user() IS
  'Bootstrap trigger: on new auth.users insert, creates profile (id = auth.users.id), workspace (unique slug), workspace_members (owner role), user_settings, and workspace_settings. SECURITY DEFINER — runs as postgres to bypass RLS. Display name resolved from OAuth metadata, email prefix, or falls back to ''user''.';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_workspace_settings_default_integration
  ON workspace_settings (default_integration_id)
  WHERE default_integration_id IS NOT NULL;
