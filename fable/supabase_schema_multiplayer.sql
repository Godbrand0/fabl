-- ─────────────────────────────────────────────────────────────────────────────
-- Fable RPG — Multiplayer Schema
-- Run this in the Supabase SQL Editor AFTER supabase_schema.sql — it depends on
-- public.players and the public.set_updated_at() trigger function defined there.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards throughout.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── MULTIPLAYER (co-op lobby + missions) ─────────────────────────────────────
-- Player stats/equipment are NEVER duplicated here — every table below only
-- stores session/coordination state. Combat-relevant reads always go back to
-- public.players (dbService.getPlayer) so multiplayer stays 1:1 with whatever
-- a player has equipped/allocated in single-player.
--
-- mp_party_members / ready-state is the durable fallback for reload/late-join
-- rehydration; the *live* roster while a lobby is open is carried over
-- Supabase Realtime Presence on channel `party:${partyId}`, not by polling
-- this table.

CREATE TABLE IF NOT EXISTS public.mp_parties (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT        NOT NULL UNIQUE,          -- short shareable join code
    host_wallet     TEXT        NOT NULL REFERENCES public.players(wallet_address),
    zone            TEXT                 DEFAULT NULL,     -- scene key, e.g. 'MultiplayerArenaScene'
    max_players     INTEGER     NOT NULL DEFAULT 3 CHECK (max_players BETWEEN 2 AND 3),
    status          TEXT        NOT NULL DEFAULT 'forming'
                                 CHECK (status IN ('forming', 'ready_check', 'in_mission', 'completed', 'abandoned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_mp_parties_updated_at ON public.mp_parties;
CREATE TRIGGER trg_mp_parties_updated_at
    BEFORE UPDATE ON public.mp_parties
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mp_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_parties_select" ON public.mp_parties;
DROP POLICY IF EXISTS "mp_parties_all"    ON public.mp_parties;
CREATE POLICY "mp_parties_select" ON public.mp_parties FOR SELECT USING (true);
CREATE POLICY "mp_parties_all"    ON public.mp_parties FOR ALL   USING (true);

CREATE TABLE IF NOT EXISTS public.mp_party_members (
    party_id        UUID        NOT NULL REFERENCES public.mp_parties(id) ON DELETE CASCADE,
    wallet_address  TEXT        NOT NULL REFERENCES public.players(wallet_address),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_ready        BOOLEAN     NOT NULL DEFAULT false,
    left_at         TIMESTAMPTZ          DEFAULT NULL,

    PRIMARY KEY (party_id, wallet_address)
);

ALTER TABLE public.mp_party_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_party_members_select" ON public.mp_party_members;
DROP POLICY IF EXISTS "mp_party_members_all"    ON public.mp_party_members;
CREATE POLICY "mp_party_members_select" ON public.mp_party_members FOR SELECT USING (true);
CREATE POLICY "mp_party_members_all"    ON public.mp_party_members FOR ALL   USING (true);

-- One started mission attempt per party (created once ready-check completes).
-- Enemy/damage/reward tables (mp_enemy_instances, mp_damage_reports,
-- mp_mission_results) land in a later milestone if kill/damage attribution ever
-- needs server-side validation — for now FABLE rewards flow through the existing
-- FableGameSession.clearZone path (see lib/nft.ts ZONE_LEVEL_IDS.MultiplayerArenaScene),
-- so no additional schema is needed for that yet.
CREATE TABLE IF NOT EXISTS public.mp_missions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id            UUID        NOT NULL REFERENCES public.mp_parties(id) ON DELETE CASCADE,
    zone                TEXT        NOT NULL,
    participant_wallets TEXT[]      NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ          DEFAULT NULL,
    outcome             TEXT                 DEFAULT NULL CHECK (outcome IN ('cleared', 'wiped', 'abandoned'))
);

ALTER TABLE public.mp_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mp_missions_select" ON public.mp_missions;
DROP POLICY IF EXISTS "mp_missions_all"    ON public.mp_missions;
CREATE POLICY "mp_missions_select" ON public.mp_missions FOR SELECT USING (true);
CREATE POLICY "mp_missions_all"    ON public.mp_missions FOR ALL   USING (true);

CREATE INDEX IF NOT EXISTS idx_mp_parties_code           ON public.mp_parties (code);
CREATE INDEX IF NOT EXISTS idx_mp_parties_status         ON public.mp_parties (status);
CREATE INDEX IF NOT EXISTS idx_mp_party_members_wallet   ON public.mp_party_members (wallet_address);
CREATE INDEX IF NOT EXISTS idx_mp_missions_party         ON public.mp_missions (party_id);
