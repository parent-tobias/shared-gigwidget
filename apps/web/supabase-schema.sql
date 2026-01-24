-- Supabase Schema for Gigwidget
-- Run this in the Supabase SQL Editor

-- ============================================================================
-- Songs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  key TEXT,
  tempo INTEGER,
  time_signature INTEGER[] DEFAULT '{4,4}',
  tags TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'space', 'public')),
  content TEXT, -- ChordPro content for the main arrangement
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS songs_user_id_idx ON songs(user_id);
CREATE INDEX IF NOT EXISTS songs_visibility_idx ON songs(visibility);
CREATE INDEX IF NOT EXISTS songs_updated_at_idx ON songs(updated_at DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own songs
CREATE POLICY "Users can manage their own songs"
  ON songs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read public songs
CREATE POLICY "Anyone can read public songs"
  ON songs
  FOR SELECT
  USING (visibility = 'public');

-- ============================================================================
-- Real-time Subscriptions
-- ============================================================================

-- Enable real-time for songs table
ALTER PUBLICATION supabase_realtime ADD TABLE songs;

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Song Sets Table (for future sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  parent_set_id UUID REFERENCES song_sets(id) ON DELETE SET NULL,
  song_ids UUID[] DEFAULT '{}',
  is_setlist BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS song_sets_user_id_idx ON song_sets(user_id);

ALTER TABLE song_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sets"
  ON song_sets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_song_sets_updated_at
  BEFORE UPDATE ON song_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Profiles Table (for multi-device sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'User',
  instruments TEXT[] DEFAULT '{}',
  avatar_url TEXT, -- URL to avatar in Supabase Storage
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'pro', 'mod')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_updated_at_idx ON profiles(updated_at DESC);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile
CREATE POLICY "Users can manage their own profile"
  ON profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION create_profile_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'User'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_new_user();

-- ============================================================================
-- User Preferences Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chord_list_position TEXT DEFAULT 'top' CHECK (chord_list_position IN ('top', 'right', 'bottom')),
  theme TEXT DEFAULT 'auto' CHECK (theme IN ('light', 'dark', 'auto')),
  compact_view BOOLEAN DEFAULT FALSE,
  auto_save_interval INTEGER DEFAULT 5000,
  snapshot_retention INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
  ON user_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Avatar Storage Bucket
-- Run these in Supabase Dashboard > Storage > New Bucket
-- ============================================================================
--
-- 1. Create bucket named 'avatars' with public access
-- 2. Add policy for authenticated users to upload their own avatar:
--
--    CREATE POLICY "Users can upload their own avatar"
--    ON storage.objects
--    FOR INSERT
--    TO authenticated
--    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
--
--    CREATE POLICY "Users can update their own avatar"
--    ON storage.objects
--    FOR UPDATE
--    TO authenticated
--    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
--
--    CREATE POLICY "Anyone can view avatars"
--    ON storage.objects
--    FOR SELECT
--    TO public
--    USING (bucket_id = 'avatars');
