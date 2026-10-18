# Manual input checks: Telegram Desktop and Telegram Web (V6-INP-06)

Automated coverage stops at Chromium: `scripts/keyboard-smoke.mjs` (run by `node scripts/regression/run.mjs <url> --all`)
plays keys, keycaps, the shortcuts sheet, a Russian layout, touch and a hybrid device at 1280x800 and 1920x1080 in a
plain browser and inside a fake Telegram WebApp. What it cannot see is whether a real Telegram client takes a key
before the game does (decision V6-016: "QA must check that Telegram Desktop and Web don't intercept Esc, Tab or
Space"). Run these by hand before v6 ships, on the build at play.pixelarrow.app opened as the Mini App.

Record each run as a row in the table at the end (client, version, OS, result, notes). A FAIL names the step.

## Clients

| Client | OS | How to open |
| --- | --- | --- |
| Telegram Desktop | Windows 10 or 11 | the bot's menu button, or a `t.me/<bot>/play` link |
| Telegram Desktop | macOS (the Qt client, `tdesktop`) | the same |
| Telegram for macOS (the native client, `macos`) | macOS | the same |
| Telegram Web A | Chrome or Edge, Windows or macOS | web.telegram.org/a, the same bot |
| Telegram Web K | Chrome or Safari | web.telegram.org/k, the same bot |

## Steps (each client)

1. **Keyboard noticed.** Open the game and press Shift once. Start a skirmish: the battle controls show keycaps
   (FIGHT `Enter`, Shape `S`, Groups `A`, ⋯ `M`, zoom `=`). Desktop clients may show them before any key: that is
   expected (`InputHints.keyboard()` is true on `tdesktop`, `macos` and `weba`).
2. **Esc.** Open Settings (the ⋯ menu or the header's Settings): Esc closes the sheet and Telegram does **not**
   close the Mini App or leave the chat. In battle with nothing open, Esc opens the ⋯ battle menu; Esc again closes
   it. On the Campaign hub with nothing open, Esc does nothing (the Mini App stays open).
3. **Tab.** On the Campaign hub press Tab: a two-tone focus ring appears on a control and moves on each Tab;
   Shift+Tab goes back. Focus never leaves the game for Telegram's own UI (the chat input, the header) while the
   game has a control to focus.
4. **Space.** In a fight, Space pauses and plays; the page does **not** scroll and Telegram does not take it.
   With a control focused, Space activates that control instead.
5. **? and F1.** `?` (Shift+/) opens the Keyboard shortcuts sheet listing the current keys; F1 too. In an offline
   fight the battle pauses while it is open and runs on after Esc. F1 must not open the client's own help.
6. **Right click.** On the battle field, right click on the ground moves the selected group and shows **no**
   context menu (neither the browser's nor Telegram's); right-drag moves and faces. Right click on a DOM text
   field (the clan name prompt) still shows the normal context menu.
7. **Ctrl/Cmd+Z.** In a fight after an order, Ctrl+Z (Windows) or Cmd+Z (macOS) undoes it, the Undo keycap reads
   `U`, and the shortcuts sheet lists Undo as `U · Ctrl+Z` on Windows and `U · Cmd+Z` on macOS.
8. **Layout.** Switch the OS keyboard to Russian (ЙЦУКЕН) and reload: in Chromium-based clients (Telegram Web in
   Chrome/Edge) the order keycaps read `Й Ц У К Е`; in clients without a Keyboard Layout Map (Safari, Telegram
   Desktop) they read `Q W E R T`. The physical keys work the same either way.
9. **Typing.** In the clan name prompt, type `qwer 1 ?`: no order fires, no group is selected, the sheet does not
   open.
10. **Show key hints.** Settings → Controls → Show key hints off: the keycaps go (on the next battle screen); the
    hover tip still names the key ("Charge (W)"). Turn it back on.

## Results

| Date | Client and version | OS | Result | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
