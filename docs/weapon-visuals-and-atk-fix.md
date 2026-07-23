# Weapon Visuals, ATK Bonus & Abilities — Implementation Guide

Three connected changes:
1. **ATK bonus fix** — wire equipped weapon's `attack` stat into the combat damage formula
2. **Visual weapon switching** — swap the character sprite when a different weapon is equipped
3. **Ability system** — one active ability slot, distinct effects per ability, locked mid-run

---

## Part 1 — ATK Bonus Fix

### The problem

`CombatScene.ts:98–100` calculates damage from `strength` only:

```ts
this.playerDmgMin = 24 + Math.floor(str * 2.5);
this.playerDmgMax = 40 + Math.floor(str * 4);
```

The equipped weapon's `attack` stat (defined in `lib/nft.ts`) is never used.

### Weapon ATK values (from `GD_ITEMS` in `lib/nft.ts:97–99`)

| Weapon | ID | ATK |
|---|---|---|
| Bamboo Stick | `bamboo_stick` | 5 (starter, not in GD_ITEMS — hardcode) |
| Iron Sword | `iron_sword` | 12 |
| Ember Blade | `ember_blade` | 15 |
| Obsidian Greatsword | `obsidian_greatsword` | 60 |

### Fix

**Step 1** — Include `equippedWeapon` in the `sync_player_data` event payload sent from React (in `HUD.tsx` where `sync_player_data` is emitted).

**Step 2** — In `CombatScene.ts`, add `equippedWeaponAtk` to the class and update the `sync_player_data` handler:

```ts
// class field
protected equippedWeaponAtk = 5; // default: bamboo stick

// inside sync_player_data handler (after line 100)
const weaponAtk = data.weaponAtk ?? 5;
this.equippedWeaponAtk = weaponAtk;
this.playerDmgMin = 24 + Math.floor(str * 2.5) + weaponAtk;
this.playerDmgMax = 40 + Math.floor(str * 4)   + weaponAtk;
```

**Step 3** — Resolve `weaponAtk` in React before emitting. Look up the equipped weapon slug in `GD_ITEMS` to get its `attack` value, then include it in the event.

### How damage changes per weapon

| Weapon | ATK bonus | Base dmg range | Effective dmg range (str = 0) |
|---|---|---|---|
| Bamboo Stick | +5 | 24–40 | **29–45** |
| Iron Sword | +12 | 24–40 | **36–52** |
| Ember Blade | +15 | 24–40 | **39–55** |
| Obsidian Greatsword | +60 | 24–40 | **84–100** |

The Obsidian Greatsword is a significant power spike — deliberate, since it's the most expensive NFT (6,579 G$).

---

## Part 2 — Visual Weapon Switching

### How the player sprite works

The player character is procedurally drawn in `BootScene.ts:45–105` using Phaser's Graphics API at 32×48 pixels. The bamboo stick is painted directly onto the `'player'` texture — it's not a separate layer. There is only one texture key right now.

### Approach: multiple player textures

Generate four texture keys in `BootScene.createTextures()`:

```
'player_bamboo'          ← current 'player' texture, renamed
'player_iron_sword'      ← same body, iron sword in right hand
'player_ember_blade'     ← same body, ember blade in right hand
'player_obsidian_gs'     ← same body, obsidian greatsword in right hand
```

Keep `'player'` as an alias pointing to `'player_bamboo'` so existing scene references don't break.

When the player equips a weapon, emit a `weapon_changed` event over `GameBridge`. The active combat or town scene listens and calls:

```ts
this.player.setTexture('player_iron_sword');
```

### What each weapon looks like (pixel art, right hand, 32×48 canvas)

The weapon occupies the right-hand column of the sprite (roughly x: 25–29, y: 6–32). The character body is untouched.

---

#### Bamboo Stick (existing, `x:25, y:6, w:4, h:26`)

- Main shaft: `0x4A8A1A` (mid green), 4px wide, 26px tall
- Two node rings: `0x3A6A0A` (dark green), 4px wide × 2px tall at y:12 and y:20
- Left-edge highlight: `0x6AB830` (bright green), 1px wide × 24px tall at x:26

Extends from the shoulder up past the head. Looks like a walking staff.

---

#### Iron Sword (`'player_iron_sword'`)

Position: blade `x:26, y:2, w:2, h:28` | crossguard `x:23, y:16, w:8, h:2` | grip `x:26, y:18, w:2, h:8`

- Blade: `0xB0B8C0` (cool silver-grey), 2px wide, tip starts at y:2 (above head)
- Blade edge highlight: `0xE8EEF0` (near white), 1px × 14px at x:27, y:2 — left edge shimmer
- Crossguard: `0x707880` (darker grey), 8px wide × 2px tall at y:16
- Grip: `0x5C3A1E` (brown leather), 2px wide × 8px tall below crossguard

**Look:** Clean, straight, symmetrical. Clearly a sword but nothing fancy. The silver blade against the character's cream shirt reads immediately as a real weapon upgrade from the bamboo stick.

---

#### Ember Blade (`'player_ember_blade'`)

Same dimensions as Iron Sword but colour-shifted and with a hot-edge glow.

- Blade base: `0x8B2200` (deep red), 2px wide, y:2 to y:16
- Blade mid: `0xD45000` (burnt orange), 2px wide, y:8 to y:16 overlapping — gives a gradient feel
- Hot edge: `0xFFAA00` (amber), 1px × 14px at x:27, y:2 — the "live" edge
- Tip accent: `0xFFEE44` (yellow-white), 2px × 2px at the very tip (y:2) — blade tip glow
- Crossguard: `0x6E3010` (dark ember-brown), 8px × 2px at y:16
- Grip: `0x3A1A08` (very dark brown, charred), 2px × 8px

**Look:** The yellow tip and amber edge make it look like a blade pulled from a forge. Even at 32×48 the colour gradient (dark red → orange → amber tip) is visible and makes it clearly different from the plain iron sword.

---

#### Obsidian Greatsword (`'player_obsidian_gs'`)

Wider blade (3px) and taller overall — tip sits 4px higher above the head than the other swords.

- Blade: `0x1A1020` (near-black with purple tint), 3px wide, y:0 to y:20 (taller reach)
- Edge shimmer: `0x6644AA` (muted violet), 1px × 20px at x:27 — volcanic mineral sheen
- Blade face crack: `0x3A2060` (dark violet), 1px × 6px at x:26, y:6 — single vertical vein suggesting obsidian fracture
- Crossguard: `0x0E0A14` (very dark), 10px wide × 3px tall at y:20 — wider and thicker than other swords
- Grip wrap: `0x2A1808` (dark leather), 2px × 10px, with a single `0x6644AA` pixel at centre for a gemstone hint

**Look:** The sheer width (3px vs 2px), extra height, and near-black colour with violet shimmer make it feel heavy and volcanic. Next to the bamboo stick or iron sword the size difference is immediately obvious even at this resolution.

---

### GameBridge event flow

```
HUD.tsx (React)
  └─ equipWeapon(slug)
       └─ gameBridge.emit('weapon_changed', { slug, textureKey })

CombatScene.ts / TownScene.ts (Phaser)
  └─ gameBridge.on('weapon_changed', ({ textureKey }) => {
       this.player.setTexture(textureKey);
     })
```

Subscribe in `create()`, unsubscribe in the `destroy` listener alongside the other bridge unsubs (`unsubL`, `unsubR`, etc.).

### Texture key map

```ts
const WEAPON_TEXTURE: Record<string, string> = {
  bamboo_stick:          'player_bamboo',
  iron_sword:            'player_iron_sword',
  ember_blade:           'player_ember_blade',
  obsidian_greatsword:   'player_obsidian_gs',
};
```

---

---

## Part 3 — Ability System

### Current state

`CombatScene.ts:290–306` has one hardcoded ability (`triggerActiveAbility`) that always fires 8 projectiles in a ring with a 4s cooldown — regardless of which ability the player owns. Fire Nova, Poison Cloak, and Stone Shield all trigger the exact same code. Poison Cloak and Stone Shield do nothing unique.

### Design rules (from product decision)

- Player picks **one active ability** — it slots into the single ability button in HUD
- Ability selection is **locked during a run** — the player can only swap after clearing a level
- Owning an ability NFT is required to equip it

### Ability slot state

Add `activeAbility` to player data (Supabase + localStorage):

```ts
activeAbility: string | null  // e.g. 'fire_nova', 'poison_cloak', 'stone_shield', or null
```

Default `null` (no ability equipped). The HUD ability button is greyed out when `null`.

Ability selection is allowed only when `levelCleared === true` or the player is in TownScene. Gate the selection UI behind that check.

---

### The three abilities

#### Fire Nova
**What it does:** Fires 8 projectiles outward in a full circle, each dealing normal player damage. Clears a crowd around the player instantly.

**Cooldown:** 4s

**Visual:** An orange-red expanding ring (not blue like the current placeholder). The ring starts small at the player position, expands to ~120px radius, and fades out over 500ms. Colour: `0xFF6600` fill, alpha 0.5 → 0.

**Projectile size:** Fire Nova uses **larger projectiles** than normal player shots. Normal projectiles are 8×8px (`'projectile'` texture, `BootScene.ts:385`). Add a second texture `'projectile_nova'` at **14×14px** — same blue→white fill style but bigger — and use it exclusively for Fire Nova bursts. This makes Fire Nova visually read as a heavy AoE blast vs the pinpoint normal shots. In `useFireNova()`, call `this.playerProjectiles.create(x, y, 'projectile_nova')` instead of `'projectile'`.

**In `triggerActiveAbility`:** Keep the existing 8-projectile burst, change the ring colour from `0x4488FF` to `0xFF6600`, swap projectile key to `'projectile_nova'`.

---

#### Poison Cloak
**What it does:** Emits a poison cloud. All enemies within ~100px of the player have their movement speed reduced by 50% for 8 seconds. Does not deal damage directly — pure crowd control. Works best when surrounded and kiting.

**Cooldown:** 10s (longer because it affects all enemies simultaneously)

**Visual:** An expanding green-purple mist ring (`0x44AA44`, alpha 0.45) that grows to ~120px and fades over 800ms. Slower expansion than Fire Nova so it feels heavy and gaseous. Enemies affected briefly flash purple (`0x9933CC` tint, 200ms) to confirm the debuff landed.

**Implementation:**
1. On trigger, collect all active enemies within 100px of player
2. Store each enemy's original speed in `getData('baseSpeed')` if not already set
3. Halve `setVelocity` scaling (done in the enemy AI movement block in `update()` — needs an `isSlowed` flag per enemy)
4. After 8s, restore speed — use `this.time.delayedCall(8000, restoreEnemySpeeds)`
5. The slowed state needs to survive enemy respawns — track by reference, not by position

---

#### Stone Shield
**What it does:** The player becomes **invincible for 5 seconds**. All incoming damage (projectiles, melee, boss hits) is ignored during this window.

**Cooldown:** 15s (longest because invincibility is the strongest defensive tool)

**Duration:** 5 seconds

**Visual:** A small filled brown circle drawn as a `Phaser.GameObjects.Arc` around the player — radius ~20px (slightly larger than the player sprite at zoom), colour `0x6B3A1F` (earthy brown), alpha 0.55. The circle follows the player every frame during the 5s window, then disappears. No expanding animation — it just appears and holds, reinforcing the "solid stone wall" feel.

**Implementation:**
```ts
private shieldActive = false;
private shieldCircle: Phaser.GameObjects.Arc | null = null;

// in triggerActiveAbility when activeAbility === 'stone_shield':
this.shieldActive = true;
this.shieldCircle = this.add.circle(this.player.x, this.player.y, 20, 0x6B3A1F, 0.55).setDepth(5);

this.time.delayedCall(5000, () => {
  this.shieldActive = false;
  this.shieldCircle?.destroy();
  this.shieldCircle = null;
});
```

In the `update()` loop, sync the circle to the player position each frame:
```ts
if (this.shieldCircle) {
  this.shieldCircle.setPosition(this.player.x, this.player.y);
}
```

In `damagePlayer()` and `collidePlayerEnemy()`, gate damage behind `!this.shieldActive`.

---

### Routing ability triggers

`triggerActiveAbility()` currently has no branching. Replace the body with a switch on `activeAbility`:

```ts
private activeAbility: string | null = null;

private triggerActiveAbility() {
  if (this.abilityCooldownActive || this.playerHP <= 0) return;

  switch (this.activeAbility) {
    case 'fire_nova':    this.useFireNova();    break;
    case 'poison_cloak': this.usePoisonCloak(); break;
    case 'stone_shield': this.useStoneShield(); break;
    default: return; // no ability equipped — do nothing
  }
}
```

Each `use*()` method sets its own cooldown duration before calling:
```ts
gameBridge.emit('ability_cooldown_started', { duration: cooldownMs });
this.abilityCooldownActive = true;
this.time.delayedCall(cooldownMs, () => { this.abilityCooldownActive = false; });
```

`activeAbility` is synced from React via `sync_player_data` the same way `equippedWeaponAtk` is.

---

### Ability selection UI (HUD)

The existing Bag tab in HUD already lists owned abilities (`playerData.abilities`). Add a simple "Set Active" button next to each ability. It is only enabled when `levelCleared` is true or the player is in TownScene.

Tapping "Set Active":
1. Updates `playerData.activeAbility` in React state
2. Persists to Supabase
3. Emits `gameBridge.emit('sync_player_data', ...)` so the Phaser scene picks it up immediately

The ability button in the HUD bottom bar shows the active ability's icon. If `activeAbility` is null, show a greyed-out placeholder.

---

### Ability cooldown comparison

| Ability | Duration | Cooldown | Lock on change |
|---|---|---|---|
| Fire Nova | Instant burst | 4s | After level clear only |
| Poison Cloak | 8s enemy slow | 10s | After level clear only |
| Stone Shield | 5s invincibility | 15s | After level clear only |

---

---

## Part 4 — Enemy & Boss HP Scaling

### The problem

All enemies currently die in one hit with the bamboo stick (Imp: 15 HP, bamboo min damage: 29). Weapon upgrades are invisible in combat — switching from bamboo to Iron Sword changes nothing a player can see. Boss HP also needs to scale to match the stronger weapons being introduced.

### Damage reference (str = 0)

| Weapon | Min | Max | Avg |
|---|---|---|---|
| Bamboo Stick | 29 | 45 | 37 |
| Iron Sword | 36 | 52 | 44 |
| Ember Blade | 39 | 55 | 47 |
| Obsidian Greatsword | 84 | 100 | 92 |

Shoot cooldown: 300ms. Realistic uptime ~60% (player is dodging/moving).

### Regular enemy HP changes

| Zone | Enemy | Current HP | New HP | Hits to kill (bamboo) | Hits to kill (zone weapon) |
|---|---|---|---|---|---|
| Ember Fields | Imp | 15 | **60** | 2–3 | 1–2 (Iron Sword) |
| Ashwater Marsh | Poison Slime | 30 | **120** | 3–5 | 3 (Ember Blade) |
| Obsidian Peak | Obsidian Golem | 60 | **250** | 6–9 | 3 (Obsidian GS) |

Zone 1 imps at 60 HP make the bamboo-to-Iron Sword difference immediately visible. The Obsidian Greatsword three-shotting a 250 HP golem makes it feel like the endgame weapon it is.

### Boss HP changes

| Zone | Boss | Current HP | New HP | Approx fight time at 60% uptime |
|---|---|---|---|---|
| Ember Fields | Lava Pumpkin | 1000 | **1800** | ~20s with Iron Sword |
| Ashwater Marsh | Swamp Hydra | 1800 | **3200** | ~35s with Ember Blade |
| Obsidian Peak | Fire Demon | 2100 | **5500** | ~30s with Obsidian GS |

Boss fights target a 20–35 second window — long enough to feel earned, short enough not to drag.

### Implementation

Six number changes across three files. No logic changes.

- `EmberFieldsScene.ts` — `regularEnemyConfig.hp`: 15 → 60 | `bossConfig.hp`: 1000 → 1800
- `AshwaterMarshScene.ts` — `regularEnemyConfig.hp`: 30 → 120 | `bossConfig.hp`: 1800 → 3200
- `ObsidianPeakScene.ts` — `regularEnemyConfig.hp`: 60 → 250 | `bossConfig.hp`: 2100 → 5500

---

---

## Part 5 — Bank (Claim Rewards Flow)

### Current state

The bank building already exists in `TownScene.ts:234` (`drawBank` at world position `x:200, y:110`). The `bankZone` rectangle is defined and the proximity check already shows "⬆ Enter BANK" when the player walks up. However, walking into the door does nothing — there is no `enter_bank` emit and no React component to handle it.

### Current problem (specific code)

`LevelClearScreen.tsx:49–79` fires a `fetch('/api/claim-level-reward')` call **on mount** (immediately when the screen appears). If GoodDollar verification fails, the player sees `rewardState === 'not_verified'` and a link to leave the app. The Continue button still works, but the G$ is silently lost — they cannot retry. The `claim-level-reward` route at `app/api/claim-level-reward/route.ts:80–82` catches the `'not GoodDollar verified'` contract error and returns `{ notVerified: true }`, which the screen renders as an orange warning with no recovery path.

### New reward flow: earn now, claim later

**Old flow (removed):** Level clear → immediate `fetch('/api/claim-level-reward')` on mount → GD verification checked on-chain → G$ released or player stuck.

**New flow:** Level clear → write to `pendingRewards` in Supabase only → player continues freely → floater nudges them to the bank → player walks into bank in town → taps Claim → verification checked at that point only → G$ released in one batch tx.

---

### Supabase schema change (`lib/supabaseClient.ts`)

Add `pendingRewards` to the player row. This replaces the current `level_reward_claims` audit pattern for the user-facing flow (the audit table can stay for admin records):

```ts
pendingRewards: Array<{
  levelId: number;     // 1 = Ember Fields, 2 = Ashwater Marsh, 3 = Obsidian Peak
  zoneName: string;    // 'Ember Fields' | 'Ashwater Marsh' | 'Obsidian Peak'
  amount: number;      // human-readable G$ e.g. 500, 1000, 2000
  earnedAt: string;    // ISO timestamp
}>
```

Default value: `[]`. Written when a zone is cleared. Cleared (set back to `[]`) after a successful batch claim from the bank.

Also remove `alreadyClaimed` guard from the per-level route — deduplication is now handled by checking if the levelId is already in `pendingRewards` before appending.

---

### `LevelClearScreen.tsx` changes

**Remove:** The entire `useEffect` block (lines 49–79) that calls `fetch('/api/claim-level-reward')` on mount. Remove the `RewardState` type and `rewardState` / `rewardTx` state vars.

**Replace the G$ Reward Banner (lines 115–164)** with a simple earned notice — no spinner, no verification prompt, no error states:

```tsx
{zoneReward > 0 && (
  <div className="rounded-xl border-2 border-emerald-600 bg-emerald-950/40 px-4 py-3 flex items-center gap-3">
    <span className="text-2xl shrink-0">💲</span>
    <div>
      <p className="text-[12px] font-extrabold text-emerald-400">
        +{zoneReward.toLocaleString()} G$ earned!
      </p>
      <p className="text-[10px] text-zinc-400">Visit the BANK in town to claim</p>
    </div>
  </div>
)}
```

**Add:** After the zone is cleared, call a new helper `addPendingReward(walletAddress, zone)` that appends to `pendingRewards` in Supabase. This is a simple Supabase update, no blockchain call:

```ts
async function addPendingReward(wallet: string, zone: string) {
  const levelId  = ZONE_LEVEL_IDS[zone];
  const amount   = ZONE_LEVEL_REWARDS[zone] ?? 0;
  const zoneName = ZONE_NAMES[zone] ?? zone;
  // fetch current pendingRewards, append if levelId not already present, upsert
}
```

Call this in `useEffect` on mount (replaces the old claim call). No wallet required — just Supabase write. If wallet is absent, still write the pending reward (user can claim later once wallet is connected).

---

### `app/api/claim-level-reward/route.ts` — rename to `app/api/claim-rewards/route.ts`

Convert from single-zone claim to **batch claim**. New request body:

```ts
{ walletAddress: string }   // no zone — claims everything pending
```

New logic:
1. Load `pendingRewards` from Supabase for this wallet
2. If empty → return `{ success: true, amount: 0, nothingToClaim: true }`
3. Check GoodDollar verification on-chain (same `serverClient.readContract` check, moved here from the contract error catch)
4. If not verified → return `{ success: false, notVerified: true }` — no G$ lost, rewards still pending
5. For each pending reward, call `grantLevelReward(wallet, levelId)` — skip any already claimed on-chain
6. On all success → clear `pendingRewards: []` in Supabase, write audit rows to `level_reward_claims`
7. Return `{ success: true, totalAmount, txHashes[] }`

---

### TownScene changes (`game/scenes/TownScene.ts`)

The bank building (`drawBank` at `cx:200, cy:110`) and `bankZone` (`Rectangle(168, 185, 64, 30)`) already exist. The proximity label already shows "⬆ Enter BANK". Only missing: the entry event.

**Add `bankEntered` flag** alongside `tavernEntered` (line 20):
```ts
private bankEntered = false;
```
Reset in `init()` alongside `tavernEntered = false`.

**In `checkProximity()` (line 560)**, the `nearBank` branch already shows the prompt but does nothing. Add the entry emit inside it:

```ts
if (!this.bankEntered && this.isTouchingZone(this.bankZone)) {
  this.bankEntered = true;
  gameBridge.emit('enter_bank');
}
```

And reset `bankEntered = false` in the `else` branch (same pattern as `tavernEntered`).

---

### Bank modal (React — new `components/BankModal.tsx`)

Opens when `gameBridge.on('enter_bank')` fires. Same open/close pattern as `TavernShop.tsx`.

Structure:
- **Header:** "BANK OF FABLE"
- **Pending rewards list:** One row per `pendingRewards` entry — zone name, G$ amount, date earned. Empty state: "No rewards pending — clear a zone to earn G$"
- **Total:** Sum of all `amount` values shown prominently
- **Claim All button:** Calls `POST /api/claim-rewards` with `{ walletAddress }`. Three outcomes:
  - Loading → spinner on button
  - `notVerified` → inline message: "Verify on GoodDollar to unlock your rewards" + external link. Modal stays open. Rewards untouched.
  - `success` → clear `playerData.pendingRewards` in React state, show "💲 {total} G$ sent to your wallet!", then auto-close after 2s
- **Close / Walk Out:** `gameBridge.emit('exit_zone')` equivalent or just unmount

---

### Floating reward indicator (React — in `HUD.tsx`)

Rendered whenever `playerData.pendingRewards?.length > 0`. Small fixed banner, doesn't block joysticks or buttons:

```tsx
{playerData.pendingRewards?.length > 0 && (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40
                  bg-black/80 border border-yellow-600 rounded-full
                  px-3 py-1 text-[10px] font-bold text-yellow-400 pointer-events-none">
    💰 {totalPending.toLocaleString()} G$ unclaimed — visit the BANK
  </div>
)}
```

`totalPending` = sum of `pendingRewards[].amount`. Disappears automatically once `pendingRewards` is cleared after a successful claim.

---

## Part 6 — Marketplace (Coming Soon)

### Approach

Replace the existing farmland at `x:1160, y:200` in `TownScene.ts:158` with a marketplace building. No zone entry, no modal — visual only with a "COMING SOON" flag. The farmland (`drawFarmland`) is removed and replaced with `drawMarketplace`.

### Building design (`drawMarketplace`, same Graphics API style)

- Stone base building, slightly wider than the bank (~140px wide)
- Open-front stall design — archways suggesting a market floor inside
- Wooden sign above reading **"MARKET"** in the same `#FFCC44` monospace style as TAVERN and BANK
- A tall flag pole to the right of the building with a banner reading **"COMING SOON"** in a contrasting colour (`#FF6644`, red-orange) — drawn as a rectangle with text on it
- No `marketZone` rectangle, no proximity prompt, no `enter_market` event

### What it communicates

Players see the marketplace exists as a real place in town — it's just not open yet. The flag is explicit so no one wastes time walking up to it expecting something to happen. When the marketplace is eventually implemented, `drawMarketplace` gets a door zone wired up the same way the bank and tavern are, and the flag comes down.

---

## Files to touch

| File | Change |
|---|---|
| `game/scenes/BootScene.ts` | Add 3 new `draw()` calls for iron/ember/obsidian textures; keep `'player'` as alias; add `'projectile_nova'` 14×14 texture |
| `game/scenes/CombatScene.ts` | Add `equippedWeaponAtk`, `activeAbility`, `shieldActive`, `shieldCircle` fields; refactor `triggerActiveAbility()` into branched `use*()` methods; update `sync_player_data` handler; subscribe to `weapon_changed`; gate `damagePlayer` behind `shieldActive` |
| `game/scenes/TownScene.ts` | Add `bankEntered` flag; wire `enter_bank` emit in `checkProximity()`; replace `drawFarmland` with `drawMarketplace`; subscribe to `weapon_changed` |
| `game/scenes/EmberFieldsScene.ts` | Imp hp: 15 → 60 | Lava Pumpkin hp: 1000 → 1800 |
| `game/scenes/AshwaterMarshScene.ts` | Poison Slime hp: 30 → 120 | Swamp Hydra hp: 1800 → 3200 |
| `game/scenes/ObsidianPeakScene.ts` | Obsidian Golem hp: 60 → 250 | Fire Demon hp: 2100 → 5500 |
| `components/HUD.tsx` | Emit `weapon_changed`; include `weaponAtk` + `activeAbility` in `sync_player_data` payload; add "Set Active" button to ability list (gated on level cleared / in town); show active ability icon on ability button; add floating reward indicator |
| `components/BankModal.tsx` | New component — pending rewards list, claim button, GD verification check on claim |
| `components/LevelClearScreen.tsx` | Write to `pendingRewards` in Supabase instead of triggering immediate G$ claim |
| `app/api/claim-level-reward/route.ts` | Update to batch-claim all pending rewards; verification check moved here from level clear |
| `lib/nft.ts` | No changes needed — ATK values and ability IDs already defined |
| `lib/supabaseClient.ts` | Add `activeAbility: string \| null` and `pendingRewards` array to player schema |
