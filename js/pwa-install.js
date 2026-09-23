// Registers the (no-op) service worker so the site meets Chrome's PWA
// installability criteria, then shows a small custom "Install app" banner
// exactly once — Chrome's own automatic prompt/omnibox icon would otherwise
// keep reappearing every visit until the visitor installs or the browser
// decides to stop offering it. Capturing beforeinstallprompt and driving our
// own banner instead lets us remember "already asked" ourselves.

// localStorage is shared across the whole origin, but /admin/ is now its
// own separately-installable app (own manifest/icons) — without a distinct
// key here, dismissing/installing one app's banner would also permanently
// suppress the other's, since they'd read the same flag.
const DISMISS_KEY = location.pathname.startsWith("/admin/") ? "pwaInstallAskedAdmin" : "pwaInstallAsked";

function hasBeenAsked() {
  try {
    return Boolean(localStorage.getItem(DISMISS_KEY));
  } catch {
    return true; // storage unavailable (private mode etc.) — don't nag every load
  }
}

function markAsked() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore — worst case the banner may reappear next visit
  }
}

function showBanner(deferredPrompt) {
  if (document.querySelector(".pwa-install-banner")) return;

  const banner = document.createElement("div");
  banner.className = "pwa-install-banner";
  banner.innerHTML = `
    <span class="pwa-install-text">Installa l&rsquo;app</span>
    <div class="pwa-install-actions">
      <button type="button" class="btn-primary pwa-install-btn">Installa</button>
      <button type="button" class="pwa-install-dismiss" aria-label="Chiudi">&times;</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector(".pwa-install-btn").addEventListener("click", async () => {
    banner.remove();
    markAsked();
    deferredPrompt.prompt();
  });

  banner.querySelector(".pwa-install-dismiss").addEventListener("click", () => {
    banner.remove();
    markAsked();
  });
}

// Root-relative rather than "sw.js" — this file is now also loaded from
// admin/index.html, where a plain relative path would resolve to the
// (non-existent) admin/sw.js instead of the real one at the site root.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  if (hasBeenAsked()) return;
  showBanner(e);
});

window.addEventListener("appinstalled", markAsked);
