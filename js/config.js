// js/config.js — Firebase init + shared utilities (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBVsYyILNgBys0ohQEETI7XfKM9j6h6xE8",
  authDomain:        "clipcraft-8a229.firebaseapp.com",
  databaseURL:       "https://clipcraft-8a229-default-rtdb.firebaseio.com",
  projectId:         "clipcraft-8a229",
  storageBucket:     "clipcraft-8a229.firebasestorage.app",
  messagingSenderId: "180597095737",
  appId:             "1:180597095737:web:2c08ac83bb7d514bce3ce8",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

// ── Site key (public) ────────────────────────────────
export const RECAPTCHA_SITE_KEY = "d8c656ae-b7fc-4db6-b364-827e84ca9b10";

// ── Categories ───────────────────────────────────────
// Adding more is as simple as appending to this array.
export const CATEGORIES = [
  { id: "all",       label: "All Videos" },
  { id: "hardcore",  label: "Hardcore"   },
  { id: "scripted",  label: "Scripted"   },
  { id: "redstone",  label: "Redstone"   },
  { id: "parkour",   label: "Parkour"    },
  { id: "survival",  label: "Survival"   },
  { id: "pvp",       label: "PvP"        },
  { id: "building",  label: "Building"   },
  { id: "smp",       label: "SMP"        },
  { id: "mods",      label: "Mods"       },
  { id: "speedrun",  label: "Speedrun"   },
  { id: "tutorials", label: "Tutorials"  },
  { id: "letsplay",  label: "Let's Play" },
];

// ── Extract YouTube ID from any YT URL ───────────────
export function extractYoutubeId(url) {
  if (!url) return null;
  const re = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const m = url.match(re);
  return m ? m[1] : null;
}

// ── Thumbnail URL ────────────────────────────────────
export function ytThumb(id, q = "hqdefault") {
  return `https://img.youtube.com/vi/${id}/${q}.jpg`;
}

// ── Relative time ────────────────────────────────────
export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `${d}d ago`;
  if (d < 30)   return `${Math.floor(d/7)}w ago`;
  if (d < 365)  return `${Math.floor(d/30)}mo ago`;
  return `${Math.floor(d/365)}y ago`;
}

// ── Format numbers ───────────────────────────────────
export function fmt(n) {
  if (!n || n < 1) return "0";
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"") + "M";
  if (n >= 1_000)     return (n/1_000).toFixed(1).replace(/\.0$/,"") + "K";
  return String(n);
}

// ── Initials from name ───────────────────────────────
export function initials(name = "") { return (name.trim().slice(0,2) || "??").toUpperCase(); }

// ── Sanitize string to prevent XSS ──────────────────
export function sanitize(str = "") {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Toast notifications ──────────────────────────────
export function toast(msg, type = "inf", ms = 3400) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
  const icons = { ok: "✓", err: "✕", inf: "i" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${icons[type] || "i"}</span><span>${sanitize(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 240); }, ms);
}

// ── Theme ────────────────────────────────────────────
export function initTheme() {
  const saved = localStorage.getItem("cc-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  return saved;
}

export function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("cc-theme", next);
  return next;
}

// ── Verify reCAPTCHA via Netlify function ────────────
export async function verifyRecaptcha(token) {
  try {
    const r = await fetch("/.netlify/functions/verify-hcaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await r.json();
    return d.success === true;
  } catch { return false; }
}

// ── Password policy validation ───────────────────────
export function validatePassword(pw) {
  const checks = {
    length:    pw.length >= 6 && pw.length <= 64,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    numeric:   /[0-9]/.test(pw),
    special:   /[^A-Za-z0-9]/.test(pw),
  };
  const strength = Object.values(checks).filter(Boolean).length;
  return { checks, valid: Object.values(checks).every(Boolean), strength };
}

// ── Periodic reCAPTCHA re-challenge (every 25 min) ───
const INTERVAL = 25 * 60 * 1000;
export function needsChallenge() {
  return Date.now() - parseInt(localStorage.getItem("cc-cap") || "0", 10) > INTERVAL;
}
export function markChallenged() { localStorage.setItem("cc-cap", String(Date.now())); }
