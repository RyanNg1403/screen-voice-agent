# Group B Manual Test

Use this after `npm run electron:dev`.

## Progress tracking

1. Start Husky and ask for guidance in a Codex session.
2. Confirm the progress strip stays visible below the character stage.
3. Confirm proactive nudges increment the `nudges` counter when they fire.

## Session report

1. Have at least one user/assistant exchange.
2. End the session with the hang-up button or let the app go back to sleep.
3. Confirm the session report sheet appears.
4. Dismiss it with the close button.

## Proactive help

1. Enable Settings -> Privacy -> Screen Watch.
2. Open a Codex screen with a visible failed test or stack trace for at least
   30 seconds.
3. Confirm Husky sends exactly one short nudge and does not repeat it during
   the cooldown.
4. Show an approval dialog for a risky command such as deleting files.
5. Confirm Husky warns directly before approval.
