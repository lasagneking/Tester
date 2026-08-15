CholScore v0.9.2 - Premium workout completion screen

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
