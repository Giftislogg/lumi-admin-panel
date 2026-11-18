# Lumi Final Beta (v0.1.9) — Firestore Database Contract

**CRITICAL:** Always initialize Firestore using the named database ID (NEVER the `(default)` database):
```js
import { getFirestore } from "firebase/firestore";
const db = getFirestore(app, "ai-studio-android-lumi-6c0bf2ea-20fa-41fb-b7da-e89eeb10fc37");
```

---

## 1. Document: `app_config/beta_control`
Remote kill-switch, End-of-Beta redirect lock, or dismissible beta notice.
- **Read access:** Anyone (`allow get: if true`), so the Lumi beta APK works without forcing tester logins.
- **Write access:** Verified Admin Google Sign-In only (`inammdletye1@gmail.com` or UID present in `/admins/{uid}`).

| Field | Type | Constraints / Values | Notes |
| --- | --- | --- | --- |
| `enabled` | `boolean` | Required | Set `false` to disable all remote popups |
| `blocking` | `boolean` | Required | `true` = non-dismissible End-of-Beta blocker; `false` = dismissible notice |
| `minSupportedVersionCode` | `number (int)` | `0 .. 100000` | `0` applies to all versions; `20` locks `< 20` (including beta `v0.1.9` code `19`) |
| `title` | `string` | `1 .. 120` chars | Modal headline |
| `message` | `string` | `1 .. 600` chars | e.g. `"Thank you for using LUMI. This was a beta version test. You can get the final release here."` |
| `buttonText` | `string` | `1 .. 50` chars | CTA button label (e.g. `"Get Final Release"`) |
| `redirectUrl` | `string` | `""` or `^https://.*` (`<= 500` chars) | Browser / website / Play Store link opened on CTA tap |
| `updatedAt` | `Timestamp` | `serverTimestamp()` (`<= request.time`) | Required on every write |

---

## 2. Collection: `beta_daily_pings/{installId}_{dateKey}`
Anonymous daily device & feature heartbeat sent automatically by `v0.1.9` beta APKs.
- **Create / Update access:** App clients write/update only their own day key (`{installId}_{YYYY-MM-DD}`).
- **Read / List access:** Admin only (`isAdmin()`).

| Field | Type | Description |
| --- | --- | --- |
| `installId` | `string` | Random per-install UUID (`inst_...`, immutable) |
| `dateKey` | `string` | UTC `YYYY-MM-DD` (immutable) |
| `deviceName` | `string` | Anonymous manufacturer + model (e.g. `"Samsung SM-A035F"`, `"Google Pixel 8"`) |
| `androidVersion` | `string` | e.g. `"Android 14 (SDK 34)"` |
| `appVersion` | `string` | `"0.1.9"` |
| `appVersionCode` | `number (int)` | `19` |
| `isLowEndDevice` | `boolean` | True if Lumi low-end optimizer activated |
| `sessionCount` | `number (int)` | Total sessions opened on that install (`>= 1`) |
| `tracksPlayedCount` | `number (int)` | Cumulative tracks played on that install |
| `usedFloatingOrb` | `boolean` | True if Floating Lumi Orb enabled or overlay permission granted |
| `usedTripleVolume` | `boolean` | True if 3x Volume trigger enabled |
| `downloadsCount` | `number (int)` | Permanent Vault downloads count |
| `cachedTrackCount` | `number (int)` | Temporary cached tracks count |
| `streamErrorCount` | `number (int)` | Stream resolution errors encountered |
| `createdAt` | `Timestamp` | Server timestamp (immutable after create) |
| `updatedAt` | `Timestamp` | Server timestamp |

---

## 3. Collection: `beta_feedback/{feedbackId}`
Anonymous tester star ratings, usefulness votes, feature tags, and comments.
- **Create access:** App clients (`allow create`).
- **Read / List / Delete access:** Admin only (`isAdmin()`).

| Field | Type | Constraints / Values |
| --- | --- | --- |
| `installId` | `string` | Random anonymous install ID (`inst_...`) |
| `rating` | `number (int)` | `1 .. 5` |
| `usefulness` | `string` | `"very_useful"` \| `"somewhat_useful"` \| `"needs_work"` |
| `tags` | `string[]` | Up to 6 selected tags (`"Floating Orb"`, `"Offline Downloads"`, `"Fast Search"`, `"Cached Playback"`, `"Smooth UI"`, `"Buffering / Lag"`) |
| `comment` | `string` | `0 .. 600` chars |
| `deviceName` | `string` | Anonymous manufacturer + model |
| `androidVersion` | `string` | Android OS version + SDK |
| `appVersion` | `string` | `"0.1.9"` |
| `appVersionCode` | `number (int)` | `19` |
| `createdAt` | `Timestamp` | `serverTimestamp()` |
