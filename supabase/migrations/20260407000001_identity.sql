-- supabase/migrations/20260407000001_identity.sql
-- Domain 1: Extensions, shared helpers, profiles, workspaces, workspace_members

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- SHARED TRIGGER FUNCTION: update_updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_updated_at() IS
  'Generic trigger function: sets updated_at = now() on every UPDATE. Applied to all tables with an updated_at column.';

-- ============================================================
-- TABLE: profiles
-- ============================================================

CREATE TABLE profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE profiles IS 'Public profile data for each user. id mirrors auth.users.id. Created by handle_new_user trigger.';

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: workspaces
-- ============================================================

CREATE TABLE workspaces (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE workspaces IS 'Top-level container for all user data. One workspace per user (owner_id UNIQUE). Cascade-deleted when owner is deleted.';

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: workspace_members
-- ============================================================

CREATE TABLE workspace_members (
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'owner'
                           CHECK (role IN ('owner', 'member', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE workspace_members IS 'Pivot between users and workspaces. Role-based write restrictions planned for a future migration.';

-- ============================================================
-- SHARED HELPER: is_workspace_member
-- ============================================================
-- Created AFTER workspace_members to avoid forward reference.

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION is_workspace_member(UUID) IS
  'Returns true if the currently authenticated user is a member of the given workspace. SECURITY DEFINER — created after workspace_members to avoid forward reference. Used in RLS policies across all content tables.';

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY profiles_select_own
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY workspaces_select_own
  ON workspaces FOR SELECT
  TO authenticated
  USING (is_workspace_member(id));

CREATE POLICY workspaces_update_own
  ON workspaces FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(id))
  WITH CHECK (is_workspace_member(id));

CREATE POLICY workspace_members_select_own
  ON workspace_members FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_workspaces_owner_id            ON workspaces (owner_id);
CREATE INDEX idx_workspaces_slug                ON workspaces (slug);
CREATE INDEX idx_workspace_members_user_id      ON workspace_members (user_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members (workspace_id);
