-- RITVIO, Fase 1. PostgreSQL >= 16. Applicare a un database nuovo.
-- Migrazione atomica, non idempotente. Nessun ruolo pubblico/client autorizzato.
BEGIN;

CREATE SCHEMA ritvio;
REVOKE ALL ON SCHEMA ritvio FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ritvio REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ritvio REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ritvio REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TYPE ritvio.provider AS ENUM ('audius', 'youtube');
CREATE TYPE ritvio.media_kind AS ENUM ('track', 'artist', 'album', 'playlist');
CREATE TYPE ritvio.visibility AS ENUM ('private', 'public');
CREATE TYPE ritvio.member_role AS ENUM ('viewer', 'editor');
CREATE TYPE ritvio.repeat_mode AS ENUM ('off', 'playlist', 'track');

CREATE TABLE ritvio.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  email_verified_at timestamptz,
  password_hash text,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  avatar_key text,
  history_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ritvio.identities (
  provider text NOT NULL CHECK (provider IN ('google')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (user_id, provider)
);

CREATE TABLE ritvio.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  device_label text NOT NULL CHECK (length(device_label) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_active_user ON ritvio.sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE ritvio.media_refs (
  id uuid PRIMARY KEY,
  provider ritvio.provider NOT NULL,
  kind ritvio.media_kind NOT NULL,
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, kind, external_id),
  UNIQUE (id, kind)
);

CREATE TABLE ritvio.media_metadata (
  media_id uuid PRIMARY KEY REFERENCES ritvio.media_refs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  creator_name text,
  canonical_url text NOT NULL CHECK (canonical_url LIKE 'https://%'),
  artwork_url text CHECK (artwork_url IS NULL OR artwork_url LIKE 'https://%'),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  license_name text,
  license_url text CHECK (license_url IS NULL OR license_url LIKE 'https://%'),
  attribution text,
  is_streamable boolean NOT NULL DEFAULT false,
  access_restrictions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(access_restrictions) = 'object'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > fetched_at AND expires_at <= fetched_at + interval '30 days')
);
CREATE INDEX metadata_expiry ON ritvio.media_metadata(expires_at);

CREATE TABLE ritvio.playlists (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  visibility ritvio.visibility NOT NULL DEFAULT 'private',
  cover_key text,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playlists_owner ON ritvio.playlists(owner_id, updated_at DESC);
CREATE INDEX playlists_public ON ritvio.playlists(updated_at DESC) WHERE visibility = 'public';

CREATE TABLE ritvio.playlist_members (
  playlist_id uuid NOT NULL REFERENCES ritvio.playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  role ritvio.member_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, user_id)
);
CREATE INDEX playlist_members_user ON ritvio.playlist_members(user_id);

CREATE TABLE ritvio.playlist_items (
  id uuid PRIMARY KEY,
  playlist_id uuid NOT NULL REFERENCES ritvio.playlists(id) ON DELETE CASCADE,
  media_id uuid NOT NULL,
  kind ritvio.media_kind NOT NULL DEFAULT 'track' CHECK (kind = 'track'),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 999),
  added_by uuid REFERENCES ritvio.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (media_id, kind) REFERENCES ritvio.media_refs(id, kind),
  UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE ritvio.liked_tracks (
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  media_id uuid NOT NULL,
  kind ritvio.media_kind NOT NULL DEFAULT 'track' CHECK (kind = 'track'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id),
  FOREIGN KEY (media_id, kind) REFERENCES ritvio.media_refs(id, kind)
);

CREATE TABLE ritvio.followed_resources (
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  media_id uuid NOT NULL,
  kind ritvio.media_kind NOT NULL CHECK (kind IN ('artist', 'album', 'playlist')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id),
  FOREIGN KEY (media_id, kind) REFERENCES ritvio.media_refs(id, kind)
);

CREATE TABLE ritvio.user_follows (
  follower_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX follows_target ON ritvio.user_follows(following_id);

CREATE TABLE ritvio.listen_history (
  event_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  media_id uuid NOT NULL,
  kind ritvio.media_kind NOT NULL DEFAULT 'track' CHECK (kind = 'track'),
  started_at timestamptz NOT NULL,
  listened_seconds integer NOT NULL CHECK (listened_seconds BETWEEN 0 AND 86400),
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (media_id, kind) REFERENCES ritvio.media_refs(id, kind)
);
CREATE INDEX history_user_date ON ritvio.listen_history(user_id, started_at DESC);

CREATE TABLE ritvio.playback_states (
  user_id uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  queue jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(queue) = 'array' AND jsonb_array_length(queue) <= 1000),
  current_item_id uuid,
  position_seconds double precision NOT NULL DEFAULT 0 CHECK (position_seconds >= 0 AND position_seconds < 86400),
  shuffle boolean NOT NULL DEFAULT false,
  repeat ritvio.repeat_mode NOT NULL DEFAULT 'off',
  volume integer NOT NULL DEFAULT 75 CHECK (volume BETWEEN 0 AND 100),
  muted boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE ritvio.share_links (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  playlist_id uuid REFERENCES ritvio.playlists(id) ON DELETE CASCADE,
  media_id uuid REFERENCES ritvio.media_refs(id),
  created_by uuid NOT NULL REFERENCES ritvio.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK ((playlist_id IS NOT NULL)::integer + (media_id IS NOT NULL)::integer = 1),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE ritvio.playlist_events (
  playlist_id uuid NOT NULL REFERENCES ritvio.playlists(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  actor_id uuid REFERENCES ritvio.users(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('update', 'add', 'remove', 'reorder', 'members')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, revision)
);

CREATE TABLE ritvio.search_cache (
  cache_key text PRIMARY KEY CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  provider ritvio.provider NOT NULL,
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > fetched_at AND expires_at <= fetched_at + interval '30 days')
);
CREATE INDEX search_cache_expiry ON ritvio.search_cache(expires_at);

CREATE TABLE ritvio.provider_budgets (
  provider ritvio.provider NOT NULL,
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 100),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  ceiling bigint NOT NULL CHECK (ceiling >= 0),
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  blocked_until timestamptz,
  PRIMARY KEY (provider, bucket, window_start),
  CHECK (window_end > window_start),
  CHECK (used <= ceiling)
);

REVOKE ALL ON ALL TABLES IN SCHEMA ritvio FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ritvio FROM PUBLIC;
COMMENT ON SCHEMA ritvio IS 'Backend-only. Non esporre tramite REST del database o credenziali client.';
COMMENT ON TABLE ritvio.media_metadata IS 'Metadati temporanei. Mai audio, token o URL permanenti di streaming.';
COMMENT ON TABLE ritvio.playback_states IS 'Queue: array {itemId, mediaId}. Validazione referenze e proprietà via API.';
COMMENT ON TABLE ritvio.provider_budgets IS 'Prenotare budget atomicamente in transazione prima della chiamata esterna.';
COMMIT;
