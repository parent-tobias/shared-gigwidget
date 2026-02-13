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

-- Anyone can read public song sets
CREATE POLICY "Anyone can read public song sets"
  ON song_sets
  FOR SELECT
  USING (visibility = 'public');

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
  default_instrument TEXT, -- Renderer instrument name (e.g., "Standard Guitar") or custom instrument ID
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
-- Custom Instruments Table (for multi-device sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_type TEXT NOT NULL CHECK (base_type IN ('guitar', 'bass', 'ukulele', 'banjo', 'mandolin', 'drums', 'keys', 'vocals', 'other')),
  strings TEXT[] NOT NULL, -- Tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
  frets INTEGER NOT NULL DEFAULT 12,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_instruments_user_id_idx ON custom_instruments(user_id);

ALTER TABLE custom_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own custom instruments"
  ON custom_instruments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_custom_instruments_updated_at
  BEFORE UPDATE ON custom_instruments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- System Chords Table (Moderator-created overrides)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_chords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chord identity
  chord_name TEXT NOT NULL,
  instrument_id TEXT NOT NULL, -- Can be built-in instrument name or custom instrument ID

  -- Chord data (matches chord-component format)
  positions INTEGER[] NOT NULL, -- Fret positions per string (-1 = muted, 0 = open)
  fingers INTEGER[], -- Which finger on each string (1-4, 0 = none)
  barres JSONB, -- Array of barre objects: [{ fret, fromString, toString }]
  base_fret INTEGER DEFAULT 1, -- Starting fret position

  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL, -- Cached display name for UI
  description TEXT, -- Optional note about this chord variation

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate chord definitions per instrument
  CONSTRAINT unique_chord_per_instrument UNIQUE (chord_name, instrument_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS system_chords_chord_name_idx ON system_chords(chord_name);
CREATE INDEX IF NOT EXISTS system_chords_instrument_idx ON system_chords(instrument_id);
CREATE INDEX IF NOT EXISTS system_chords_created_by_idx ON system_chords(created_by);

-- Row Level Security
ALTER TABLE system_chords ENABLE ROW LEVEL SECURITY;

-- Anyone can read system chords
CREATE POLICY "Anyone can read system chords"
  ON system_chords
  FOR SELECT
  USING (true);

-- Only moderators can manage system chords
CREATE POLICY "Moderators can manage system chords"
  ON system_chords
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.subscription_tier = 'mod'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.subscription_tier = 'mod'
    )
  );

-- Triggers
CREATE TRIGGER update_system_chords_updated_at
  BEFORE UPDATE ON system_chords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable real-time (optional - for live updates when mods create chords)
ALTER PUBLICATION supabase_realtime ADD TABLE system_chords;

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
