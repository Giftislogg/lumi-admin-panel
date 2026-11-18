import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import appletConfig from "./firebase-applet-config.json";
import legacyConfig from "./firebase-config.json";

export const LUMI_FIREBASE_CONFIG = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || appletConfig.apiKey || legacyConfig.apiKey,
  authDomain: appletConfig.authDomain || legacyConfig.authDomain,
  projectId: appletConfig.projectId || legacyConfig.projectId,
  storageBucket: appletConfig.storageBucket || legacyConfig.storageBucket,
  messagingSenderId: appletConfig.messagingSenderId || legacyConfig.projectNumber,
  appId: appletConfig.appId,
};

export const FIRESTORE_DATABASE_ID = appletConfig.firestoreDatabaseId || legacyConfig.firestoreDatabaseId;
export const ADMIN_EMAIL = legacyConfig.adminEmail;

export const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
};

export function handleFirestoreError(error, operationType, path) {
  const { auth } = getLumiFirebaseServices();
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId ?? null,
          email: provider.email ?? null,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getLumiFirebaseServices() {
  const app = getApps().length ? getApps()[0] : initializeApp(LUMI_FIREBASE_CONFIG);
  const auth = getAuth(app);
  // CRITICAL: Always pass the named database ID (never default database)
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  return { app, auth, db };
}

export async function testFirestoreConnection() {
  const { db } = getLumiFirebaseServices();
  try {
    await getDocFromServer(doc(db, "app_config", "beta_control"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration — Firestore client is offline.");
    }
  }
}

testFirestoreConnection();

let inFlightSignInPromise = null;

export async function signInAdminWithGoogle() {
  if (inFlightSignInPromise) {
    return inFlightSignInPromise;
  }
  const { auth } = getLumiFirebaseServices();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });

  inFlightSignInPromise = (async () => {
    try {
      await auth.authStateReady();
      try {
        const cred = await signInWithPopup(auth, provider);
        return cred.user;
      } catch (err) {
        if (err?.code === "auth/popup-blocked" && window.self === window.top) {
          await signInWithRedirect(auth, provider);
          return null;
        }
        throw err;
      }
    } finally {
      inFlightSignInPromise = null;
    }
  })();

  return inFlightSignInPromise;
}

export async function signOutAdmin() {
  const { auth } = getLumiFirebaseServices();
  await signOut(auth);
}

export function observeAdminAuth(callback) {
  const { auth } = getLumiFirebaseServices();
  getRedirectResult(auth).catch((err) => {
    console.error("Redirect sign-in error:", err);
  });
  return onAuthStateChanged(auth, callback);
}

export function subscribeBetaControl(onChange, onError) {
  const { db } = getLumiFirebaseServices();
  const path = "app_config/beta_control";
  const ref = doc(db, "app_config", "beta_control");
  return onSnapshot(
    ref,
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped);
      }
    }
  );
}

export async function getBetaControl() {
  const { db } = getLumiFirebaseServices();
  const path = "app_config/beta_control";
  try {
    const snap = await getDoc(doc(db, "app_config", "beta_control"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveBetaControl({
  enabled,
  blocking,
  minSupportedVersionCode = 0,
  title = "Thank You for Beta Testing Lumi",
  message = "Thank you for using LUMI. This was a beta version test. You can get the final release here.",
  buttonText = "Get Final Release",
  redirectUrl = "",
}) {
  const { db } = getLumiFirebaseServices();
  const path = "app_config/beta_control";
  try {
    await setDoc(doc(db, "app_config", "beta_control"), {
      enabled: Boolean(enabled),
      blocking: Boolean(blocking),
      minSupportedVersionCode: Number(minSupportedVersionCode) || 0,
      title: String(title).trim().slice(0, 120) || "Thank You for Beta Testing Lumi",
      message: String(message).trim().slice(0, 600),
      buttonText: String(buttonText).trim().slice(0, 50) || "Get Final Release",
      redirectUrl: String(redirectUrl).trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function triggerEndOfBetaLock({
  redirectUrl,
  message = "Thank you for using LUMI. This was a beta version test. You can get the final release here.",
  title = "Final Release Available",
  buttonText = "Get Final Release",
  minSupportedVersionCode = 20,
}) {
  return saveBetaControl({
    enabled: true,
    blocking: true,
    minSupportedVersionCode,
    title,
    message,
    buttonText,
    redirectUrl,
  });
}

export async function fetchDailyPings(maxRows = 2000) {
  const { db } = getLumiFirebaseServices();
  const path = "beta_daily_pings";
  try {
    const q = query(collection(db, path), orderBy("updatedAt", "desc"), limit(maxRows));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchBetaFeedback(maxRows = 500) {
  const { db } = getLumiFirebaseServices();
  const path = "beta_feedback";
  try {
    const q = query(collection(db, path), orderBy("createdAt", "desc"), limit(maxRows));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function deleteBetaFeedback(feedbackId) {
  const { db } = getLumiFirebaseServices();
  const path = `beta_feedback/${feedbackId}`;
  try {
    await deleteDoc(doc(db, "beta_feedback", feedbackId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

function timestampToMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

export function computeBetaAnalytics(pings = [], feedbackList = []) {
  const dauByDate = {};
  const pingsByDate = {};
  const installMap = new Map();

  for (const p of pings) {
    const installKey = p.installId || p.id || "unknown";
    const dateKey = p.dateKey || "";
    const updatedAtMs = timestampToMs(p.updatedAt) || timestampToMs(p.createdAt);

    if (dateKey) {
      dauByDate[dateKey] = dauByDate[dateKey] || new Set();
      dauByDate[dateKey].add(installKey);
      pingsByDate[dateKey] = (pingsByDate[dateKey] || 0) + 1;
    }

    const existing = installMap.get(installKey);
    if (!existing) {
      installMap.set(installKey, {
        installId: installKey,
        latestPing: p,
        latestUpdatedMs: updatedAtMs,
        latestDateKey: dateKey,
        firstSeenDate: dateKey,
        lastSeenDate: dateKey,
        dates: new Set(dateKey ? [dateKey] : []),
        usedFloatingOrbEver: Boolean(p.usedFloatingOrb),
        usedTripleVolumeEver: Boolean(p.usedTripleVolume),
        isLowEndDevice: Boolean(p.isLowEndDevice),
        maxSessions: Number(p.sessionCount || 0),
        maxTracksPlayed: Number(p.tracksPlayedCount || 0),
        maxDownloads: Number(p.downloadsCount || 0),
        latestCachedTracks: Number(p.cachedTrackCount || 0),
        maxStreamErrors: Number(p.streamErrorCount || 0),
      });
    } else {
      if (dateKey) {
        existing.dates.add(dateKey);
        if (!existing.firstSeenDate || dateKey < existing.firstSeenDate) {
          existing.firstSeenDate = dateKey;
        }
        if (!existing.lastSeenDate || dateKey > existing.lastSeenDate) {
          existing.lastSeenDate = dateKey;
        }
      }
      if (p.usedFloatingOrb) existing.usedFloatingOrbEver = true;
      if (p.usedTripleVolume) existing.usedTripleVolumeEver = true;
      if (p.isLowEndDevice) existing.isLowEndDevice = true;
      existing.maxSessions = Math.max(existing.maxSessions, Number(p.sessionCount || 0));
      existing.maxTracksPlayed = Math.max(existing.maxTracksPlayed, Number(p.tracksPlayedCount || 0));
      existing.maxDownloads = Math.max(existing.maxDownloads, Number(p.downloadsCount || 0));
      existing.maxStreamErrors = Math.max(existing.maxStreamErrors, Number(p.streamErrorCount || 0));

      const isNewer =
        dateKey > existing.latestDateKey ||
        (dateKey === existing.latestDateKey && updatedAtMs >= existing.latestUpdatedMs);
      if (isNewer) {
        existing.latestPing = p;
        existing.latestUpdatedMs = updatedAtMs;
        existing.latestDateKey = dateKey;
        existing.latestCachedTracks = Number(p.cachedTrackCount || 0);
      }
    }
  }

  const deviceInstallCounts = {};
  const deviceStatsMap = {};
  const osInstallCounts = {};
  const versionInstallCounts = {};
  let orbAdoptionCount = 0;
  let tripleVolumeAdoptionCount = 0;
  let offlineDownloadAdoptionCount = 0;
  let lowEndDeviceCount = 0;
  let returningInstallsCount = 0;
  let totalSessions = 0;
  let totalTracksPlayed = 0;
  let totalVaultDownloads = 0;
  let totalCachedTracks = 0;
  let totalStreamErrors = 0;
  let installsWithErrorsCount = 0;

  const installSummaries = [];

  for (const entry of installMap.values()) {
    const p = entry.latestPing;
    const dev = p.deviceName || "Unknown Device";
    const os = p.androidVersion || "Unknown Android";
    const appVer = p.appVersion ? `v${p.appVersion} (${p.appVersionCode ?? "-"})` : "Unknown";

    deviceInstallCounts[dev] = (deviceInstallCounts[dev] || 0) + 1;
    osInstallCounts[os] = (osInstallCounts[os] || 0) + 1;
    versionInstallCounts[appVer] = (versionInstallCounts[appVer] || 0) + 1;

    if (!deviceStatsMap[dev]) {
      deviceStatsMap[dev] = {
        deviceName: dev,
        uniqueInstalls: 0,
        activeDaysTotal: 0,
        sessions: 0,
        tracksPlayed: 0,
        errors: 0,
      };
    }
    deviceStatsMap[dev].uniqueInstalls += 1;
    deviceStatsMap[dev].activeDaysTotal += entry.dates.size;
    deviceStatsMap[dev].sessions += entry.maxSessions;
    deviceStatsMap[dev].tracksPlayed += entry.maxTracksPlayed;
    deviceStatsMap[dev].errors += entry.maxStreamErrors;

    if (entry.dates.size >= 2) returningInstallsCount += 1;
    if (entry.usedFloatingOrbEver) orbAdoptionCount += 1;
    if (entry.usedTripleVolumeEver) tripleVolumeAdoptionCount += 1;
    if (entry.maxDownloads > 0) offlineDownloadAdoptionCount += 1;
    if (entry.isLowEndDevice) lowEndDeviceCount += 1;
    if (entry.maxStreamErrors > 0) installsWithErrorsCount += 1;

    totalSessions += entry.maxSessions;
    totalTracksPlayed += entry.maxTracksPlayed;
    totalVaultDownloads += entry.maxDownloads;
    totalCachedTracks += entry.latestCachedTracks;
    totalStreamErrors += entry.maxStreamErrors;

    installSummaries.push({
      installId: entry.installId,
      deviceName: dev,
      androidVersion: os,
      appVersion: p.appVersion || "-",
      appVersionCode: p.appVersionCode ?? "-",
      isLowEndDevice: entry.isLowEndDevice,
      sessionCount: entry.maxSessions,
      tracksPlayedCount: entry.maxTracksPlayed,
      usedFloatingOrb: entry.usedFloatingOrbEver,
      usedTripleVolume: entry.usedTripleVolumeEver,
      downloadsCount: entry.maxDownloads,
      cachedTrackCount: entry.latestCachedTracks,
      streamErrorCount: entry.maxStreamErrors,
      activeDays: entry.dates.size,
      firstSeenDate: entry.firstSeenDate || "-",
      lastSeenDate: entry.lastSeenDate || "-",
      updatedAtMs: entry.latestUpdatedMs,
    });
  }

  installSummaries.sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const dailyActiveUsers = Object.fromEntries(
    Object.entries(dauByDate).map(([date, set]) => [date, set.size])
  );
  const sortedDates = Object.keys(dailyActiveUsers).sort();
  const latestDauDate = sortedDates.length ? sortedDates[sortedDates.length - 1] : null;
  const latestDauCount = latestDauDate ? dailyActiveUsers[latestDauDate] : 0;
  const todayUtcKey = new Date().toISOString().slice(0, 10);
  const todayDauCount = dailyActiveUsers[todayUtcKey] || 0;

  const totalUniqueInstalls = installMap.size;
  const pct = (count) => (totalUniqueInstalls ? Number(((count / totalUniqueInstalls) * 100).toFixed(1)) : 0);

  const ratings = feedbackList.map((f) => Number(f.rating || 0)).filter((r) => r >= 1 && r <= 5);
  const avgRating = ratings.length
    ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
    : 0;

  const tagCounts = {};
  for (const fb of feedbackList) {
    for (const tag of fb.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return {
    totalUniqueInstalls,
    totalPingsCount: pings.length,
    returningInstallsCount,
    dailyActiveUsers,
    pingsByDate,
    latestDauDate,
    latestDauCount,
    todayUtcKey,
    todayDauCount,
    topDevices: Object.entries(deviceInstallCounts).sort((a, b) => b[1] - a[1]),
    deviceStats: Object.values(deviceStatsMap).sort((a, b) => b.uniqueInstalls - a.uniqueInstalls),
    osBreakdown: Object.entries(osInstallCounts).sort((a, b) => b[1] - a[1]),
    versionBreakdown: Object.entries(versionInstallCounts).sort((a, b) => b[1] - a[1]),
    orbAdoptionCount,
    orbAdoptionRate: pct(orbAdoptionCount),
    tripleVolumeAdoptionCount,
    tripleVolumeAdoptionRate: pct(tripleVolumeAdoptionCount),
    offlineDownloadAdoptionCount,
    offlineDownloadAdoptionRate: pct(offlineDownloadAdoptionCount),
    lowEndDeviceCount,
    lowEndDeviceRate: pct(lowEndDeviceCount),
    totalSessions,
    avgSessionsPerInstall: totalUniqueInstalls ? Number((totalSessions / totalUniqueInstalls).toFixed(1)) : 0,
    totalTracksPlayed,
    avgTracksPerInstall: totalUniqueInstalls ? Number((totalTracksPlayed / totalUniqueInstalls).toFixed(1)) : 0,
    totalVaultDownloads,
    totalCachedTracks,
    totalStreamErrors,
    installsWithErrorsCount,
    feedbackCount: feedbackList.length,
    averageRating: avgRating,
    topFeedbackTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]),
    installSummaries,
  };
}
