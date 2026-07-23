-- ─────────────────────────────────────────────────────────────────────────────
-- Fable RPG — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS guards throughout
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. PLAYERS ───────────────────────────────────────────────────────────────
-- Primary record for every player. wallet_address is the PK and links to their
-- on-chain identity. All camelCase JS fields are stored as lowercase columns
-- (PostgreSQL folds unquoted identifiers to lowercase).

CREATE TABLE IF NOT EXISTS public.players (
    wallet_address      TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL DEFAULT 'Hero',
    hero_class          TEXT        NOT NULL DEFAULT 'knight',

    -- Core stats
    level               INTEGER     NOT NULL DEFAULT 1,
    xp                  INTEGER     NOT NULL DEFAULT 0,
    gold                INTEGER     NOT NULL DEFAULT 100,
    maxhp               INTEGER     NOT NULL DEFAULT 130,
    hp                  INTEGER     NOT NULL DEFAULT 130,
    statpoints          INTEGER     NOT NULL DEFAULT 0,

    -- RPG sub-stats  { strength, agility, defense, vitality }
    stats               JSONB       NOT NULL DEFAULT '{"strength":12,"agility":8,"defense":12,"vitality":12}'::jsonb,

    -- Progression
    maxunlockedzone     INTEGER     NOT NULL DEFAULT 1,

    -- Equipment
    equippedweapon      TEXT        NOT NULL DEFAULT 'bamboo_stick',
    arsenal             TEXT[]      NOT NULL DEFAULT ARRAY['bamboo_stick'],
    abilities           TEXT[]      NOT NULL DEFAULT '{}',

    -- Inventory  [{ item: string, count: number }]
    inventory           JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- On-chain NFT records  [{ itemId, tokenId, txHash, mintedAt }]
    nftitems            JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- GoodDollar UBI buff
    ubibuffactive       BOOLEAN     NOT NULL DEFAULT false,
    ubibuffexpiresat    BIGINT               DEFAULT NULL,  -- JS Date.now() ms

    -- Web3Auth embedded wallet: tracks whether the wallet has been funded with CELO for gas
    celo_funded         BOOLEAN     NOT NULL DEFAULT false,

    -- Ability/reward state
    activeability       TEXT                 DEFAULT NULL,
    pendingrewards      TEXT[]      NOT NULL DEFAULT '{}',

    -- Last on-chain progress commit
    lastprogresssync    JSONB                DEFAULT NULL,  -- { level, gold, txHash, syncedAt }

    -- Menu system: has this player completed the Guildmaster onboarding walkthrough?
    onboarded           BOOLEAN     NOT NULL DEFAULT false,

    -- Mid-zone save: per-zone kill progress + which zone "Continue" should resume into
    zone_progress       JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- { [sceneKey]: { enemiesDefeated } }
    current_zone        TEXT                 DEFAULT NULL,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for already-existing tables (CREATE TABLE IF NOT EXISTS above won't
-- add columns to a table that already exists — run this against a live DB too)
ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS activeability  TEXT,
    ADD COLUMN IF NOT EXISTS pendingrewards TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS onboarded      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS zone_progress  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS current_zone   TEXT DEFAULT NULL;

-- Back-fill existing players so they don't see the new-player tutorial retroactively
UPDATE public.players SET onboarded = true WHERE level > 1 OR maxunlockedzone > 1;

-- Keep updated_at current on every write
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_players_updated_at ON public.players;
CREATE TRIGGER trg_players_updated_at
    BEFORE UPDATE ON public.players
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players_select" ON public.players;
DROP POLICY IF EXISTS "players_insert" ON public.players;
DROP POLICY IF EXISTS "players_update" ON public.players;

CREATE POLICY "players_select" ON public.players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_update" ON public.players FOR UPDATE USING (true);


-- ── 2. LEADERBOARD ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leaderboard (
    wallet_address  TEXT        PRIMARY KEY REFERENCES public.players(wallet_address) ON DELETE CASCADE,
    player_name     TEXT        NOT NULL,
    zone_clears     INTEGER     NOT NULL DEFAULT 0,
    score           INTEGER     NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaderboard_select" ON public.leaderboard;
DROP POLICY IF EXISTS "leaderboard_all"    ON public.leaderboard;

CREATE POLICY "leaderboard_select" ON public.leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_all"    ON public.leaderboard FOR ALL   USING (true);


-- ── 3. LEVEL REWARD CLAIMS (audit log) ───────────────────────────────────────
-- The smart contract is the source of truth (levelClaimed mapping), but this
-- table gives you a queryable audit trail of every G$ reward paid out.

CREATE TABLE IF NOT EXISTS public.level_reward_claims (
    id              BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    wallet_address  TEXT        NOT NULL REFERENCES public.players(wallet_address) ON DELETE CASCADE,
    level_id        INTEGER     NOT NULL,
    zone            TEXT        NOT NULL,     -- e.g. 'EmberFieldsScene'
    amount_gd       INTEGER     NOT NULL,     -- human-readable G$ amount
    tx_hash         TEXT        NOT NULL,
    claimed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (wallet_address, level_id)         -- mirrors on-chain levelClaimed mapping
);

ALTER TABLE public.level_reward_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_select" ON public.level_reward_claims;
DROP POLICY IF EXISTS "claims_insert" ON public.level_reward_claims;

CREATE POLICY "claims_select" ON public.level_reward_claims FOR SELECT USING (true);
CREATE POLICY "claims_insert" ON public.level_reward_claims FOR INSERT WITH CHECK (true);


-- ── 4. USEFUL INDEXES ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leaderboard_score         ON public.leaderboard (score DESC);
CREATE INDEX IF NOT EXISTS idx_claims_wallet             ON public.level_reward_claims (wallet_address);
CREATE INDEX IF NOT EXISTS idx_players_level             ON public.players (level DESC);
