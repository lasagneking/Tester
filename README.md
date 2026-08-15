CholScore v1.0.2 - Diagnostic for the "Total Weight Lifted" showing "—" bug

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

## v1.0.2 volume-zero diagnostic (temporary)
- Reported: "Total Weight Lifted" sometimes shows "—" on the completion screen even
  though every exercise had a weight entered, all came from the saved routine, and
  the workout duration is correct.
- Code review + isolated testing of `workoutVolume`/`exerciseVolume`/
  `resolvedWorkoutWeight` against realistic and deliberately-corrupted data could not
  reproduce a zero total under those conditions — the weight-resolution and
  reps-completion logic is deterministic, so if weight displays correctly mid-workout
  it must resolve the same way at the finish screen.
- Hardened `resolvedWorkoutWeight`/`exerciseVolume`/`workoutVolume` with explicit
  `Number.isFinite` guards throughout (defensive, doesn't rely on NaN comparisons
  quietly working) and fixed `completeCurrentExercise` calling `exerciseVolume`
  without the workout context (a real, separate inconsistency).
- Added a **temporary on-screen diagnostic**: `#finishVolumeDebug`. If the total is
  ever 0 while the workout has exercises, a small dashed box appears under the stat
  cards printing each exercise's exact weight, timed flag, and per-set
  completed/actual values — no browser dev tools needed. Screenshot it next time this
  happens and that'll pinpoint the exact cause. Safe to delete once resolved.
- `index.html`, `styles.css`, and the image cache-busting query strings bumped to `v102`.
- service-worker cache version bumped to `cholscore-v102`.

## v1.0.1 continuous confetti loop
- The v1.0.0 burst only ran once (~2s) and then stopped. Confetti now trickles
  continuously — 4 new pieces every 220ms — for as long as the completion screen
  is open.
- Each piece removes itself from the DOM right after its own fall animation
  finishes, so the piece count stays small and constant rather than growing forever.
- The loop is tied to the dialog's native `close` event, so it stops the instant the
  screen closes however that happens (Done button, cancel workout, Esc key) — nothing
  keeps running in the background.
- `index.html`, `styles.css`, and the image cache-busting query strings bumped to `v101`.
- service-worker cache version bumped to `cholscore-v101`.

## v1.0.0 fully animated confetti burst
- Removed the confetti diamond and star shapes that were baked into
  `workout-victory-silhouette.png` (cleaned out with inpainting) — the artwork is now
  a plain silhouette with no static decoration on it.
- Removed the old static, non-animated `.premium-confetti` dots that sat behind the
  title.
- Replaced both with a single animated confetti burst (`#confettiBurst` /
  `spawnConfetti()` in app.js): ~34 randomly coloured, sized, and timed pieces are
  generated fresh each time `showWorkoutCelebration()` runs, and fall/rotate/fade via
  a `confettiFall` CSS keyframe.
- Palette matches the app's existing purple/gold/pink/cream/cyan accents.
- Respects `prefers-reduced-motion`: confetti pieces stay invisible instead of animating.
- `index.html`, `styles.css`, and the image cache-busting query strings bumped to `v100`.
- service-worker cache version bumped to `cholscore-v100`.
