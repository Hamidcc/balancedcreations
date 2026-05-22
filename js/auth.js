// js/auth.js — Authentication (ESM)
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  ref, set, get,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

import { auth, db, validatePassword, verifyRecaptcha, initials } from "./config.js";

// ── Auth state ───────────────────────────────────────
let _user = null;

export function getCurrentUser() { return _user; }

export function onAuthReady(cb) {
  return onAuthStateChanged(auth, (u) => { _user = u; cb(u); });
}

export function requireAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      if (u) { resolve(u); }
      else {
        window.location.href = "/auth.html?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
        reject(new Error("Unauthenticated"));
      }
    });
  });
}

export function requireGuest() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      if (u) window.location.href = "/index.html";
      else resolve(null);
    });
  });
}

// ── Username helpers ─────────────────────────────────
function slugify(u) {
  return u.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

export async function isUsernameAvailable(username) {
  const snap = await get(ref(db, `usernames/${username.toLowerCase()}`));
  return !snap.exists();
}

// ── Register ─────────────────────────────────────────
export async function registerUser({ username, email, password, captchaToken }) {
  const captchaOk = await verifyRecaptcha(captchaToken);
  if (!captchaOk) throw new Error("reCAPTCHA verification failed. Please try again.");

  const { valid, checks } = validatePassword(password);
  if (!valid) {
    const m = [];
    if (!checks.length)    m.push("6–64 characters");
    if (!checks.uppercase) m.push("uppercase letter");
    if (!checks.lowercase) m.push("lowercase letter");
    if (!checks.numeric)   m.push("number");
    if (!checks.special)   m.push("special character");
    throw new Error("Password must contain: " + m.join(", "));
  }

  const slug = slugify(username);
  if (slug.length < 3) throw new Error("Username must be at least 3 characters (letters, numbers, underscores).");

  const available = await isUsernameAvailable(slug);
  if (!available) throw new Error("That username is already taken.");

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = cred.user;

  await updateProfile(user, { displayName: slug });

  const now = Date.now();
  await set(ref(db, `users/${user.uid}`), {
    username: slug, email: email.trim().toLowerCase(),
    displayName: slug, bio: "", avatar: "",
    createdAt: now, subscribers: 0, videoCount: 0,
  });

  await set(ref(db, `usernames/${slug}`), { uid: user.uid });

  try { await sendEmailVerification(user); } catch (_) {}

  return user;
}

// ── Login ────────────────────────────────────────────
export async function loginUser({ email, password, captchaToken }) {
  const captchaOk = await verifyRecaptcha(captchaToken);
  if (!captchaOk) throw new Error("reCAPTCHA verification failed. Please try again.");
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

// ── Logout ───────────────────────────────────────────
export async function logoutUser() {
  await signOut(auth);
  window.location.href = "/auth.html";
}

// ── Password reset ───────────────────────────────────
export async function sendReset(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

// ── Profile read/update ───────────────────────────────
export async function getUserProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

export async function updateUserProfile(uid, updates) {
  const current = await getUserProfile(uid);
  if (!current) throw new Error("Profile not found.");
  const allowed = ["bio", "displayName", "avatar"];
  const patch = {};
  for (const k of allowed) { if (updates[k] !== undefined) patch[k] = updates[k]; }
  await set(ref(db, `users/${uid}`), { ...current, ...patch });
  if (updates.displayName && auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: updates.displayName });
  }
}

// ── Update nav UI ────────────────────────────────────
export function updateNavUser(user, profile) {
  const avatarBtn    = document.getElementById("avatarBtn");
  const dropName     = document.getElementById("dropName");
  const dropEmail    = document.getElementById("dropEmail");
  const authEls  = document.querySelectorAll("[data-auth='y']");
  const guestEls = document.querySelectorAll("[data-auth='n']");

  if (user) {
    const name = profile?.username || user.displayName || user.email;
    if (avatarBtn) {
      if (profile?.avatar) {
        avatarBtn.innerHTML = `<img src="${profile.avatar}" alt="">`;
      } else {
        avatarBtn.textContent = initials(name);
      }
    }
    if (dropName)  dropName.textContent  = "@" + (profile?.username || name);
    if (dropEmail) dropEmail.textContent = user.email;
    authEls.forEach(el => el.style.display = "");
    guestEls.forEach(el => el.style.display = "none");
  } else {
    if (avatarBtn) avatarBtn.textContent = "?";
    authEls.forEach(el => el.style.display = "none");
    guestEls.forEach(el => el.style.display = "");
  }
}

// ── Firebase error → human message ───────────────────
export function friendlyError(code) {
  const map = {
    "auth/email-already-in-use":    "An account with this email already exists.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/user-not-found":          "No account found with this email.",
    "auth/wrong-password":          "Incorrect password.",
    "auth/invalid-credential":      "Invalid email or password.",
    "auth/too-many-requests":       "Too many attempts. Please wait and try again.",
    "auth/network-request-failed":  "Network error — check your connection.",
    "auth/weak-password":           "Password must meet complexity requirements.",
    "auth/user-disabled":           "This account has been suspended.",
    "auth/requires-recent-login":   "Please sign out and sign in again.",
    "auth/password-does-not-meet-requirements":
      "Password must have uppercase, lowercase, number, and special character.",
  };
  return map[code] || null;
}
