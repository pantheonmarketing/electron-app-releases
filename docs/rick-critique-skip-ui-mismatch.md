# Rick critique Skip UI mismatch

Status: Resolved — root cause found and fixed, covered by tests/rick-critique-skip.test.js

Observed: 2026-07-17 at `http://localhost:3456/`

## Summary

Skipping completed critique feedback preserves the script correctly, but the critique UI does not return to its normal post-script state.

The browser tab containing the blocked state was left open and named `🧪 Verify critique skip flow` for inspection.

## Reproduction steps

1. Open an existing Rick session with a finished script.
2. Capture the Hook, Body, Conclusion, Call to action, and Caption text.
3. Select **Ask for Critique**.
4. Choose **1 critic**.
5. Select **Ask 1 critic**.
6. Wait for the independent critique, Rick's merged read, and prioritized improvements to appear.
7. Select **Skip**.
8. Compare all five script sections with the captured text and inspect the critique panel.

## Expected

- The script remains unchanged.
- The critique result panel closes.
- The normal **Ask for Critique** action returns.
- The rest of the script controls remain enabled.

## Observed

- All five script sections remained exactly unchanged.
- The critique result panel stayed open.
- **Skip** remained visible.
- The footer continued to show **Critique again** instead of **Ask for Critique**.
- No visible error message appeared.

## Coordination note

`public/js/scripter.js` and `public/css/scripter.css` were being changed by another process during this verification. Do not attempt a frontend fix until the current frontend owner confirms their changes are settled and the implementation can be inspected without overlap.

No retry or fix was attempted after observing the blocked state.

## Root cause

**Skip was disabled, not broken.** A disabled button swallows the click silently, which is why the script stayed correct and no error appeared.

The sequence, in `scrRunOperation`:

1. `scrSetBusy(true)` marks the app busy for the duration of the turn.
2. The critique returns and `scrRender()` runs **while `busy` is still true**.
3. Every render stamps `disabled = rickState.busy` onto the controls it draws, so the freshly drawn critique panel came out disabled.
4. `scrSetBusy(false)` then revived controls by matching a **hand-maintained selector list**. Any control missing from that list stayed disabled while the app looked idle.

The panel therefore rendered dead. `Skip` did nothing, so `session.critique` was never cleared, so the footer kept showing **Critique again**. All four observations follow from that one cause.

Reproduced by removing `.rick-critique-panel button` from the cleanup list, which restores every reported symptom exactly (`Skip.disabled === true` while `rickState.busy === false`).

The same defect hit the funnel buttons, tracked separately and fixed the same way.

Why it no longer reproduced on the settled code: the critique selector was present by the time the file settled. The reported session almost certainly ran against an older `scripter.js` still held by the long-lived tab, which matches the coordination note above.

## Fix

`scrRunOperation` now clears busy **before** rendering, not after:

```js
await scrRefreshSessions();
scrSetBusy(false);   // was: after scrRender()
scrRender();
```

A finished turn can no longer draw a disabled control in the first place, so reviving them does not depend on remembering a selector. The list still governs disabling at the start of a turn; a control missed there is merely clickable during a turn, which the `rickState.busy` guards already reject. That turns a silent permanent breakage into a harmless one.

## Verification

- `tests/rick-critique-skip.test.js` pins the invariant that a finished turn never renders while busy, plus the Skip round trip. Mutation-checked: restoring the old ordering makes them fail.
- Driven in a browser against the real `/critique/skip` route: Skip closes the panel, restores **Ask for Critique**, and leaves the script untouched. Chooser, Ask critics, and Apply all still behave, with no dead controls.
