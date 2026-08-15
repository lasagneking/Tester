CholScore v0.9.9 - Animated sparkle overlay on workout completion screen

# CholScore v0.8.5 — Cache + Delete Hotfix

Root cause found:

The HTML update containing the Delete button was reaching Android, but the installed PWA's service worker was still serving the old cached `app.js`.

That meant:
- the button appeared
- but the delete click-handler did not exist in the JavaScript Android was running

v0.8.5 fixes the update mechanism itself.

Changes:
- service-worker cache version bumped to `cholscore-v085`
- old CholScore caches are removed during activation
- `index.html`, `app.js`, `styles.css`, and `manifest.json` are now network-first
- cached copies are used only as an offline fallback
- app.js and styles.css have v0.8.5 cache-busting query strings
- the service worker checks for an update on app launch
- the food-delete fix from v0.8.4 is retained

No new features.

## v0.9 guided workout update
- Added optional weight (kg) and exercise notes to routine exercises.
- Replaced the spreadsheet-style live workout with a guided one-exercise-at-a-time flow.
- Sets are visibly ticked as they are completed; each exercise gets a positive completion screen.
- Final workout celebration shows total weighted training volume and workout duration.
- Existing routine data remains backwards-compatible; missing weight/notes default safely.
- service-worker cache version bumped to `cholscore-v090`.


## v0.9.1 workout cancel hotfix
- Added a clearly visible **Cancel workout** action to the live guided workout screen.
- Cancelling requires confirmation to prevent accidental loss.
- Cancelling discards only the unfinished workout; the saved routine remains unchanged.
- Cancelled workouts are not written to History.
- service-worker cache version bumped to `cholscore-v091`.

## v0.9.9 animated sparkle overlay
- The confetti diamond and stars in `workout-victory-silhouette.png` are baked into the
  flat artwork, so they can't be animated directly — instead a lightweight, purely CSS
  sparkle layer (`.athlete-sparkle-overlay`) sits on top of the image, positioned over
  the artwork's existing diamond and star accents.
- Sparkles twinkle (scale + opacity + a little rotation) on a staggered loop, using
  colours matched to the artwork (pink/magenta diamond, warm gold/white stars).
- Because `<dialog>` is `display:none` while closed, the CSS animation restarts fresh
  every time the workout completion screen is shown — no JS trigger needed.
- Respects `prefers-reduced-motion`: sparkles show statically instead of animating.
- `index.html`, `styles.css`, and the image cache-busting query strings bumped to `v099`.
- service-worker cache version bumped to `cholscore-v099`.
