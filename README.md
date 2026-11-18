# Lumi Beta Admin Panel Integration Bundle

This folder contains everything another Web AI (or developer) needs to build and connect your **Lumi Beta Admin Website** directly to the same live Firebase Firestore database used by **Lumi v0.1.9 Final Beta**.

## Files Included
- `firebase-config.json` — Exact Firebase `projectId`, `apiKey`, `authDomain`, `firestoreDatabaseId`, and authorized `adminEmail` (`inammdletye1@gmail.com`).
- `SCHEMA.md` — Exact Firestore collections (`app_config/beta_control`, `beta_daily_pings`, `beta_feedback`, `admins`), field constraints, and query structure.
- `firestore.rules` — Exact security rules deployed to Firebase.
- `beta_control.default.json` — Copy-ready sample payloads for both a dismissible soft notice and the full **End-of-Beta Blocking Lock**.
- `lumi-admin-sdk.mjs` — Drop-in JavaScript (ESM) module for Google Sign-In, publishing remote popups/locks, and aggregating anonymous DAU, device models, OS breakdown, and star ratings.

---

## Ready-to-Paste Prompt for Your Separate Admin Website AI

Copy and paste this into your Web AI builder alongside the files in this `admin_panel/` folder:

> Build a clean, dark-themed Web Admin Dashboard for **Lumi Music (Beta v0.1.9)** using the attached `firebase-config.json`, `SCHEMA.md`, `firestore.rules`, and `lumi-admin-sdk.mjs`.
>
> **CRITICAL Firebase Requirement:** Connect to the exact named Firestore database ID `ai-studio-android-lumi-6c0bf2ea-20fa-41fb-b7da-e89eeb10fc37` via `getFirestore(app, FIRESTORE_DATABASE_ID)` (never the `(default)` database).
>
> Features to include:
> 1. **Google Sign-In Gate:** Sign in using Google Auth (`inammdletye1@gmail.com`).
> 2. **Remote Update & End-of-Beta Controller (`app_config/beta_control`):**
>    - Toggle `enabled` and `blocking` (Soft Dismissible Notice vs Hard Blocking End-of-Beta Modal).
>    - Edit `title`, `message` (default: `"Thank you for using LUMI. This was a beta version test. You can get the final release here."`), `buttonText`, `redirectUrl` (Website or Play Store link), and `minSupportedVersionCode` (use `20` to target v0.1.9 beta code `19` and below).
>    - Include a live mobile preview card and a one-click **"Publish Live Control"** button.
> 3. **Beta Analytics Dashboard (`beta_daily_pings`):**
>    - Charts/cards for Daily Active Users (DAU), Total Unique Installs, Anonymous Device Models (`deviceName`), Android OS Breakdown, Low-End Device Share, Floating Orb & Offline Download Adoption %, and Stream Error Count.
> 4. **Tester Reviews & Feedback Inbox (`beta_feedback`):**
>    - Average 1–5 star rating, usefulness breakdown (`very_useful`, `somewhat_useful`, `needs_work`), top feedback tags, device + Android OS badge on each review, and delete/archive control.
