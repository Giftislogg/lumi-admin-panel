import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
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
import config from "./firebase-config.json" assert { type: "json" };

export const LUMI_FIREBASE_CONFIG = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.projectNumber,
};

export const FIRESTORE_DATABASE_ID = config.firestoreDatabaseId;
export const ADMIN_EMAIL = config.adminEmail;

export function getLumiFirebaseServices() {
  const app = getApps().length ? getApps()[0] : initializeApp(LUMI_FIREBASE_CONFIG);
  const auth = getAuth(app);
  // CRITICAL: Always pass the named database ID (never default database)
  const db = getFirestore(app, FIRESTORE_DATABASE_ID);
  return { app, auth, db };
}

export async function signInAdminWithGoogle() {
  const { auth } = getLumiFirebaseServices();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutAdmin() {
  const { auth } = getLumiFirebaseServices();
  await signOut(auth);
}

export function observeAdminAuth(callback) {
  const { auth } = getLumiFirebaseServices();
  return onAuthStateChanged(auth, callback);
}

export function subscribeBetaControl(onChange, onError) {
  const { db } = getLumiFirebaseServices();
  const ref = doc(db, "app_config", "beta_control");
  return onSnapshot(
    ref,
    (snap) => onChange(snap.exists() ? snap.data() : null),
    (err) => onError?.(err)
  );
}

export async function getBetaControl() {
  const { db } = getLumiFirebaseServices();
  const snap = await getDoc(doc(db, "app_config", "beta_control"));
  return snap.exists() ? snap.data() : null;
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

export async function fetchDailyPings(maxRows = 500) {
  const { db } = getLumiFirebaseServices();
  const q = query(collection(db, "beta_daily_pings"), orderBy("updatedAt", "desc"), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchBetaFeedback(maxRows = 200) {
  const { db } = getLumiFirebaseServices();
  const q = query(collection(db, "beta_feedback"), orderBy("createdAt", "desc"), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteBetaFeedback(feedbackId) {
  const { db } = getLumiFirebaseServices();
  await deleteDoc(doc(db, "beta_feedback", feedbackId));
}

export function computeBetaAnalytics(pings = [], feedbackList = []) {
  const uniqueDevices = new Set();
  const dauByDate = {};
  const deviceCounts = {};
  const osCounts = {};
  let orbEnabledInstalls = new Set();
  let downloadsUsers = new Set();
  let lowEndInstalls = new Set();
  let totalErrors = 0;

  for (const p of pings) {
    if (p.installId) uniqueDevices.add(p.installId);
    if (p.dateKey) {
      dauByDate[p.dateKey] = dauByDate[p.dateKey] || new Set();
      if (p.installId) dauByDate[p.dateKey].add(p.installId);
    }
    const dev = p.deviceName || "Unknown Device";
    deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;

    const os = p.androidVersion || "Unknown Android";
    osCounts[os] = (osCounts[os] || 0) + 1;

    if (p.usedFloatingOrb && p.installId) orbEnabledInstalls.add(p.installId);
    if ((p.downloadsCount || 0) > 0 && p.installId) downloadsUsers.add(p.installId);
    if (p.isLowEndDevice && p.installId) lowEndInstalls.add(p.installId);
    totalErrors += Number(p.streamErrorCount || 0);
  }

  const ratings = feedbackList.map((f) => Number(f.rating || 0)).filter((r) => r >= 1 && r <= 5);
  const avgRating = ratings.length
    ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
    : 0;

  return {
    totalUniqueInstalls: uniqueDevices.size,
    dailyActiveUsers: Object.fromEntries(
      Object.entries(dauByDate).map(([date, set]) => [date, set.size])
    ),
    topDevices: Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]),
    osBreakdown: Object.entries(osCounts).sort((a, b) => b[1] - a[1]),
    orbAdoptionCount: orbEnabledInstalls.size,
    offlineDownloadAdoptionCount: downloadsUsers.size,
    lowEndDeviceCount: lowEndInstalls.size,
    totalStreamErrors: totalErrors,
    feedbackCount: feedbackList.length,
    averageRating: avgRating,
  };
}
