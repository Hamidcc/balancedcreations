// js/shell.js — Injects sidebar + header, handles mobile, theme, notifications (ESM)
import { initTheme, toggleTheme, CATEGORIES, sanitize, fmt } from "./config.js";
import { onAuthReady, getUserProfile, updateNavUser, logoutUser } from "./auth.js";
import { getNotifications, markNotifRead, clearNotifications, listenNotifications, requestPushPermission, hasPushEnabled } from "./app.js";

// ── SVG icon helpers (no emojis) ────────────────────
const ICONS = {
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  browse:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  upload:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  profile:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  signin:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
  sun:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  bell:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  search:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  menu:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  logoMark: `<svg viewBox="0 0 14 14" fill="white"><path d="M2 0h10L14 7 12 14H2L0 7z"/></svg>`,
  channel:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8"/></svg>`,
  signout:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 17.66l-1.41 1.41M22 12h-2M4 12H2M19.07 19.07l-1.41-1.41M5.34 6.34L3.93 4.93"/></svg>`,
};

export function buildShell(activePage = "home") {
  // Theme
  const theme = initTheme();

  // Sidebar HTML
  const sidebarHTML = `
<aside class="sidebar" id="sidebar">
  <a class="sidebar-logo" href="/index.html">
    <div class="logo-mark">${ICONS.logoMark}</div>
    <span class="logo-text">ClipCraft</span>
  </a>
  <nav class="sidebar-nav">
    <div class="nav-section">Discover</div>
    <a class="nav-item ${activePage==='home'?'active':''}"    href="/index.html">  ${ICONS.home}     <span class="nav-lbl">Home</span></a>
    <a class="nav-item ${activePage==='browse'?'active':''}"  href="/browse.html"> ${ICONS.browse}   <span class="nav-lbl">Browse</span></a>
    <a class="nav-item ${activePage==='trending'?'active':''}" href="/browse.html?sort=views">${ICONS.trending}<span class="nav-lbl">Trending</span></a>

    <div class="nav-section">Categories</div>
    ${CATEGORIES.filter(c => c.id !== "all").slice(0, 6).map(c =>
      `<a class="nav-item" href="/browse.html?cat=${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg><span class="nav-lbl">${sanitize(c.label)}</span></a>`
    ).join("")}

    <div class="nav-section">You</div>
    <a class="nav-item ${activePage==='upload'?'active':''}"  href="/upload.html"  data-auth="y" style="display:none">${ICONS.upload}  <span class="nav-lbl">Upload</span></a>
    <a class="nav-item ${activePage==='profile'?'active':''}" href="/profile.html" data-auth="y" style="display:none">${ICONS.profile} <span class="nav-lbl">Profile</span></a>
    <a class="nav-item" href="/auth.html" data-auth="n">${ICONS.signin} <span class="nav-lbl">Sign In</span></a>
  </nav>
  <div class="sidebar-footer">
    <div class="nav-item" id="themeBtn" onclick="window.__toggleTheme()">
      <span id="themeIc">${ICONS.sun}</span>
      <span class="nav-lbl" id="themeLbl">${theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
    </div>
  </div>
</aside>`;

  // Header HTML
  const headerHTML = `
<header class="top-header">
  <button class="icon-btn mob-btn" onclick="window.__openSidebar()">
    ${ICONS.menu}
  </button>
  <div class="search-bar">
    <span class="search-icon">${ICONS.search}</span>
    <input type="text" id="searchInput" placeholder="Search Minecraft videos&hellip;" onkeydown="if(event.key==='Enter')window.__doSearch()">
  </div>
  <div class="hdr-actions">
    <a href="/upload.html" class="btn btn-primary btn-sm" data-auth="y" style="display:none">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Upload
    </a>
    <div style="position:relative">
      <button class="icon-btn" id="notifBtn" onclick="window.__toggleNotif()" data-auth="y" style="display:none">
        ${ICONS.bell}
        <span class="dot" id="notifDot" style="display:none">0</span>
      </button>
      <div class="notif-panel" id="notifPanel">
        <div class="notif-hdr">
          <span class="notif-hdr-t">Notifications</span>
          <span class="notif-clear" onclick="window.__clearNotif()">Clear all</span>
        </div>
        <div class="notif-list" id="notifList">
          <div class="notif-empty">No notifications yet.</div>
        </div>
        <div class="push-row">
          ${ICONS.bell}
          <span id="pushStatus">Enable push notifications</span>
          <button class="btn btn-sm btn-outline" style="margin-left:auto;padding:4px 10px;font-size:11px" onclick="window.__enablePush()">Enable</button>
        </div>
      </div>
    </div>
    <div class="drop-wrap">
      <button class="avatar-btn" id="avatarBtn" onclick="window.__toggleDrop()">?</button>
      <div class="dropdown" id="userDrop">
        <div class="drop-user">
          <div class="drop-name" id="dropName">Guest</div>
          <div class="drop-email" id="dropEmail"></div>
        </div>
        <a class="drop-item" href="/profile.html" data-auth="y" style="display:none">
          ${ICONS.profile} Profile &amp; Settings
        </a>
        <a class="drop-item" id="myChannelLink" href="/channel.html" data-auth="y" style="display:none">
          ${ICONS.channel} My Channel
        </a>
        <div class="drop-divider"></div>
        <div class="drop-item red" data-auth="y" style="display:none" onclick="window.__logout()">
          ${ICONS.signout} Sign Out
        </div>
        <a class="drop-item" href="/auth.html" data-auth="n">
          ${ICONS.signin} Sign In
        </a>
      </div>
    </div>
  </div>
</header>`;

  // Mobile overlay
  const overlayHTML = `<div class="mob-overlay" id="mobOverlay" onclick="window.__closeSidebar()"></div>`;

  // Inject intro loader
  document.body.insertAdjacentHTML("afterbegin", `
    ${overlayHTML}
    <div class="intro" id="intro">
      <div class="intro-logo">
        <div class="intro-slab"></div>
        <span class="intro-wordmark">ClipCraft</span>
      </div>
      <div class="intro-bar"></div>
    </div>`);

  // Inject sidebar + header into shell
  const shell = document.getElementById("shell");
  if (shell) {
    shell.querySelector(".sidebar-slot").innerHTML = sidebarHTML;
    shell.querySelector(".header-slot").innerHTML  = headerHTML;
  }

  // Dismiss intro after 1s
  setTimeout(() => {
    const intro = document.getElementById("intro");
    if (!intro) return;
    intro.classList.add("out");
    setTimeout(() => intro.classList.add("gone"), 720);
  }, 1050);

  // ── Global event handlers ──────────────────────────
  window.__toggleTheme = function () {
    const t = toggleTheme();
    document.getElementById("themeLbl").textContent = t === "dark" ? "Light Mode" : "Dark Mode";
  };

  window.__openSidebar = function () {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("mobOverlay").classList.add("show");
  };

  window.__closeSidebar = function () {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("mobOverlay").classList.remove("show");
  };

  window.__doSearch = function () {
    const q = document.getElementById("searchInput")?.value.trim();
    if (q) location.href = `/browse.html?q=${encodeURIComponent(q)}`;
  };

  window.__toggleDrop = function () {
    document.getElementById("userDrop").classList.toggle("open");
  };

  window.__toggleNotif = async function () {
    const panel = document.getElementById("notifPanel");
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) await loadNotifications();
  };

  window.__clearNotif = async function () {
    const u = (await import("./auth.js")).getCurrentUser();
    if (!u) return;
    await clearNotifications(u.uid);
    document.getElementById("notifList").innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
    document.getElementById("notifDot").style.display = "none";
  };

  window.__enablePush = async function () {
    const ok = await requestPushPermission();
    if (ok) document.getElementById("pushStatus").textContent = "Push notifications enabled";
  };

  window.__logout = async function () {
    try { await logoutUser(); } catch (e) { console.error(e); }
  };

  // Close dropdowns on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest("#avatarBtn") && !e.target.closest("#userDrop"))
      document.getElementById("userDrop")?.classList.remove("open");
    if (!e.target.closest("#notifBtn") && !e.target.closest("#notifPanel"))
      document.getElementById("notifPanel")?.classList.remove("open");
  });

  // ── Auth state ──────────────────────────────────────
  let currentUid = null;
  onAuthReady(async user => {
    let profile = null;
    if (user) {
      currentUid = user.uid;
      try { profile = await getUserProfile(user.uid); } catch (_) {}
      // Fix channel link
      const cl = document.getElementById("myChannelLink");
      if (cl) cl.href = `/channel.html?uid=${user.uid}`;
      // Listen for unread notifications
      listenNotifications(user.uid, count => {
        const dot = document.getElementById("notifDot");
        if (dot) {
          dot.textContent = count > 9 ? "9+" : String(count);
          dot.style.display = count > 0 ? "flex" : "none";
        }
      });
      // Push status
      if (await hasPushEnabled()) {
        const ps = document.getElementById("pushStatus");
        if (ps) ps.textContent = "Push notifications are enabled";
      }
    }
    updateNavUser(user, profile);
  });

  // ── Load notification panel ──────────────────────────
  async function loadNotifications() {
    const { getCurrentUser } = await import("./auth.js");
    const u = getCurrentUser();
    if (!u) return;
    const list = document.getElementById("notifList");
    const notifs = await getNotifications(u.uid);
    if (!notifs.length) {
      list.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item${n.read ? "" : " unread"}" onclick="window.__openNotif('${n.id}','${n.videoId}')">
        <div class="notif-thumb">
          <img src="${n.thumbnail || ""}" alt="" loading="lazy">
        </div>
        <div class="notif-t">
          <div class="notif-vtitle">${sanitize(n.title)}</div>
          <div class="notif-meta">${sanitize(n.authorName)} &middot; new upload</div>
        </div>
      </div>`).join("");
  }

  window.__openNotif = async function (nid, vid) {
    const { getCurrentUser } = await import("./auth.js");
    const u = getCurrentUser();
    if (u) await markNotifRead(u.uid, nid);
    location.href = `/watch.html?v=${vid}`;
  };

  // Register SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
