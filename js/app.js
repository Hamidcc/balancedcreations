// js/app.js — Core platform logic (ESM)
import {
  ref, push, set, get, remove, update,
  query, orderByChild, limitToLast, equalTo,
  runTransaction, onValue,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

import { db, auth, extractYoutubeId, ytThumb, timeAgo, fmt, sanitize, initials, toast } from "./config.js";

// ══════════════════════════════════════════════════════
//  VIDEOS
// ══════════════════════════════════════════════════════

export async function submitVideo({ title, description, youtubeUrl, category, tags }) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");

  const youtubeId = extractYoutubeId(youtubeUrl);
  if (!youtubeId) throw new Error("Invalid YouTube URL.");

  title = title?.trim();
  if (!title || title.length < 3)   throw new Error("Title must be at least 3 characters.");
  if (title.length > 100)            throw new Error("Title must be 100 characters or fewer.");

  description = description?.trim() || "";
  const cleanTags = (tags || []).map(t => t.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean).slice(0, 8);

  const profile = await getAuthorProfile(user.uid);

  const data = {
    title, description, youtubeId, youtubeUrl,
    category: category || "all",
    tags: cleanTags,
    authorId:    user.uid,
    authorName:  profile?.username || user.displayName || "Unknown",
    authorAvatar: profile?.avatar || "",
    createdAt:   Date.now(),
    views: 0, likeCount: 0, commentCount: 0,
    thumbnail: ytThumb(youtubeId, "maxresdefault"),
  };

  const newRef = push(ref(db, "videos"));
  await set(newRef, data);

  await runTransaction(ref(db, `users/${user.uid}/videoCount`), c => (c || 0) + 1);

  // Notify subscribers
  await _notifySubscribers(user.uid, newRef.key, data);

  return newRef.key;
}

export async function getVideo(vid) {
  const snap = await get(ref(db, `videos/${vid}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

export async function getVideos({ category, limit: lim = 28 } = {}) {
  let q;
  if (category && category !== "all") {
    q = query(ref(db, "videos"), orderByChild("category"), equalTo(category), limitToLast(lim));
  } else {
    q = query(ref(db, "videos"), orderByChild("createdAt"), limitToLast(lim));
  }
  const snap = await get(q);
  const results = [];
  if (snap.exists()) snap.forEach(c => results.unshift({ id: c.key, ...c.val() }));
  return results;
}

export async function getUserVideos(uid, lim = 30) {
  const q = query(ref(db, "videos"), orderByChild("authorId"), equalTo(uid), limitToLast(lim));
  const snap = await get(q);
  const results = [];
  if (snap.exists()) snap.forEach(c => results.unshift({ id: c.key, ...c.val() }));
  return results;
}

export async function deleteVideo(vid) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  const video = await getVideo(vid);
  if (!video) throw new Error("Video not found.");
  if (video.authorId !== user.uid) throw new Error("Not authorized.");
  await remove(ref(db, `videos/${vid}`));
  await runTransaction(ref(db, `users/${user.uid}/videoCount`), c => Math.max(0, (c || 1) - 1));
}

export async function incrementView(vid) {
  await runTransaction(ref(db, `videos/${vid}/views`), c => (c || 0) + 1);
}

// ══════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════

export async function searchVideos(term) {
  const q = query(ref(db, "videos"), orderByChild("createdAt"), limitToLast(120));
  const snap = await get(q);
  const lc = term.toLowerCase();
  const results = [];
  if (snap.exists()) {
    snap.forEach(c => {
      const v = c.val();
      if (
        v.title?.toLowerCase().includes(lc) ||
        v.description?.toLowerCase().includes(lc) ||
        v.authorName?.toLowerCase().includes(lc) ||
        v.tags?.some(t => t.includes(lc))
      ) results.unshift({ id: c.key, ...v });
    });
  }
  return results;
}

// ══════════════════════════════════════════════════════
//  LIKES
// ══════════════════════════════════════════════════════

export async function toggleLike(vid) {
  const user = auth.currentUser;
  if (!user) { toast("Sign in to like videos", "inf"); return null; }
  const r = ref(db, `likes/${user.uid}/${vid}`);
  const snap = await get(r);
  const liked = snap.exists() && snap.val() === true;
  await set(r, !liked);
  await runTransaction(ref(db, `videos/${vid}/likeCount`), c =>
    liked ? Math.max(0, (c || 1) - 1) : (c || 0) + 1
  );
  return !liked;
}

export async function isLiked(vid) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await get(ref(db, `likes/${user.uid}/${vid}`));
  return snap.exists() && snap.val() === true;
}

// ══════════════════════════════════════════════════════
//  SUBSCRIPTIONS
// ══════════════════════════════════════════════════════

export async function toggleSubscribe(channelUid) {
  const user = auth.currentUser;
  if (!user) { toast("Sign in to subscribe", "inf"); return null; }
  if (user.uid === channelUid) { toast("You cannot subscribe to yourself", "inf"); return null; }

  const r = ref(db, `subscriptions/${user.uid}/${channelUid}`);
  const snap = await get(r);
  const subbed = snap.exists() && snap.val() === true;
  await set(r, !subbed);
  await runTransaction(ref(db, `users/${channelUid}/subscribers`), c =>
    subbed ? Math.max(0, (c || 1) - 1) : (c || 0) + 1
  );
  return !subbed;
}

export async function isSubscribed(channelUid) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await get(ref(db, `subscriptions/${user.uid}/${channelUid}`));
  return snap.exists() && snap.val() === true;
}

export async function getSubscribedChannels(uid) {
  const snap = await get(ref(db, `subscriptions/${uid}`));
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).filter(([, v]) => v === true).map(([k]) => k);
}

// ── Toggle bell (notifications for a channel) ────────
export async function toggleBell(channelUid) {
  const user = auth.currentUser;
  if (!user) { toast("Sign in first", "inf"); return null; }
  const r = ref(db, `bells/${user.uid}/${channelUid}`);
  const snap = await get(r);
  const on = snap.exists() && snap.val() === true;
  await set(r, !on);
  return !on;
}

export async function hasBell(channelUid) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await get(ref(db, `bells/${user.uid}/${channelUid}`));
  return snap.exists() && snap.val() === true;
}

// ══════════════════════════════════════════════════════
//  COMMENTS
// ══════════════════════════════════════════════════════

export async function addComment(vid, text) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to comment.");
  const clean = text.trim();
  if (!clean) throw new Error("Comment cannot be empty.");
  if (clean.length > 2000) throw new Error("Comment too long (max 2000 chars).");

  const profile = await getAuthorProfile(user.uid);
  const data = {
    text: clean,
    authorId:   user.uid,
    authorName: profile?.username || user.displayName || "User",
    createdAt:  Date.now(),
  };

  const newRef = push(ref(db, `comments/${vid}`));
  await set(newRef, data);
  await runTransaction(ref(db, `videos/${vid}/commentCount`), c => (c || 0) + 1);
  return { id: newRef.key, ...data };
}

export async function getComments(vid) {
  const q = query(ref(db, `comments/${vid}`), orderByChild("createdAt"), limitToLast(60));
  const snap = await get(q);
  const results = [];
  if (snap.exists()) snap.forEach(c => results.unshift({ id: c.key, ...c.val() }));
  return results;
}

export async function deleteComment(vid, cid) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  const snap = await get(ref(db, `comments/${vid}/${cid}`));
  if (!snap.exists()) throw new Error("Comment not found.");
  if (snap.val().authorId !== user.uid) throw new Error("Not authorized.");
  await remove(ref(db, `comments/${vid}/${cid}`));
  await runTransaction(ref(db, `videos/${vid}/commentCount`), c => Math.max(0, (c || 1) - 1));
}

// ══════════════════════════════════════════════════════
//  USER PROFILES
// ══════════════════════════════════════════════════════

export async function getAuthorProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

// ══════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS (Web Push API + Firebase storage)
// ══════════════════════════════════════════════════════

// VAPID public key — replace with your own from web-push or Firebase Cloud Messaging
const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa40-asB7T1_vTMGSr4xFDPuiNJFCNX3VKiFqEZqbE5RNpxJDExPJjSrz3Q-Q";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function requestPushPermission() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    toast("Push notifications are not supported in this browser.", "inf");
    return false;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    toast("Notification permission denied.", "inf");
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) { await _savePushSub(existing); return true; }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await _savePushSub(sub);
    toast("Push notifications enabled!", "ok");
    return true;
  } catch (e) {
    console.warn("Push subscription failed:", e);
    toast("Could not enable push notifications.", "err");
    return false;
  }
}

async function _savePushSub(sub) {
  const user = auth.currentUser;
  if (!user) return;
  const key = sub.endpoint.replace(/[^a-zA-Z0-9]/g, "").slice(-40);
  await set(ref(db, `pushSubs/${user.uid}/${key}`), JSON.stringify(sub));
}

export async function hasPushEnabled() {
  if (!("Notification" in window)) return false;
  return Notification.permission === "granted";
}

// ── Send in-app notifications to bell-subscribers ────
async function _notifySubscribers(uploaderUid, videoId, videoData) {
  try {
    // Find all users who have bell on for this uploader
    const bellSnap = await get(ref(db, "bells"));
    if (!bellSnap.exists()) return;
    const promises = [];
    bellSnap.forEach(userNode => {
      const channels = userNode.val();
      if (channels && channels[uploaderUid] === true) {
        const recipientUid = userNode.key;
        const notifRef = push(ref(db, `notifications/${recipientUid}`));
        promises.push(set(notifRef, {
          videoId,
          title:      videoData.title,
          thumbnail:  videoData.thumbnail || ytThumb(videoData.youtubeId),
          authorName: videoData.authorName,
          authorId:   uploaderUid,
          createdAt:  Date.now(),
          read: false,
        }));
      }
    });
    await Promise.all(promises);
  } catch (e) {
    console.warn("Notification dispatch failed:", e);
  }
}

// ── Load in-app notifications for current user ────────
export async function getNotifications(uid) {
  const q = query(ref(db, `notifications/${uid}`), orderByChild("createdAt"), limitToLast(30));
  const snap = await get(q);
  const results = [];
  if (snap.exists()) snap.forEach(c => results.unshift({ id: c.key, ...c.val() }));
  return results;
}

export async function markNotifRead(uid, nid) {
  await set(ref(db, `notifications/${uid}/${nid}/read`), true);
}

export async function clearNotifications(uid) {
  await remove(ref(db, `notifications/${uid}`));
}

export function listenNotifications(uid, cb) {
  const r = ref(db, `notifications/${uid}`);
  onValue(r, snap => {
    let unread = 0;
    if (snap.exists()) snap.forEach(c => { if (!c.val().read) unread++; });
    cb(unread);
  });
  return () => {};
}

// ══════════════════════════════════════════════════════
//  RENDER HELPERS
// ══════════════════════════════════════════════════════

export function renderCard(v) {
  const thumb = v.thumbnail || ytThumb(v.youtubeId);
  const init  = initials(v.authorName || "?");
  return `
    <div class="vcard" onclick="location.href='/watch.html?v=${v.id}'">
      <div class="vthumb">
        <img src="${thumb}" alt="${sanitize(v.title)}" loading="lazy"
             onerror="this.src='${ytThumb(v.youtubeId)}'">
        <div class="voverlay">
          <div class="play-circle">
            <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
          </div>
        </div>
      </div>
      <div class="vinfo">
        <a class="vav" href="/channel.html?uid=${v.authorId}" onclick="event.stopPropagation()">${init}</a>
        <div class="vmeta">
          <div class="vtitle">${sanitize(v.title)}</div>
          <div class="vsub">
            <a href="/channel.html?uid=${v.authorId}" onclick="event.stopPropagation()">${sanitize(v.authorName)}</a>
            <span>&middot;</span><span>${fmt(v.views)} views</span>
            <span>&middot;</span><span>${timeAgo(v.createdAt)}</span>
          </div>
          ${v.category && v.category !== "all" ? `<span class="vtag">${sanitize(v.category)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

export function renderSkeletons(n = 8) {
  return Array(n).fill(0).map(() => `
    <div class="vcard">
      <div class="skel skel-thumb"></div>
      <div class="vinfo" style="padding:10px 12px">
        <div class="skel" style="width:31px;height:31px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skel skel-line" style="margin-top:3px"></div>
          <div class="skel skel-line short"></div>
        </div>
      </div>
    </div>`).join("");
}

export function renderRelated(v) {
  return `
    <a class="rel-card" href="/watch.html?v=${v.id}">
      <div class="rel-thumb">
        <img src="${ytThumb(v.youtubeId)}" alt="${sanitize(v.title)}" loading="lazy">
      </div>
      <div class="rel-info">
        <div class="rel-title">${sanitize(v.title)}</div>
        <div class="rel-meta">${sanitize(v.authorName)} &middot; ${fmt(v.views)} views</div>
      </div>
    </a>`;
}
