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
