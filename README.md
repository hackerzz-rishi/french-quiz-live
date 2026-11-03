# French Quiz Live
Express + WebSocket server for the French verb quiz.

**Play with friends:** open the "Play with friends" tab, type your name and press **Create a new game**.
Send the 5-letter code (or the invite link) to your friends. They enter it and press **Join game**.
You see each friend appear in the lobby; the **Start quiz** button unlocks once at least one friend has joined.
Live scoreboard, highest score wins, and the next round pulls everyone in automatically.

- **Valid codes only:** the server creates every game code and keeps it in memory. Joining a code it never
  created (a typo or random text) is refused with "No game found". An empty game is forgotten after 1 hour,
  and all games are cleared if the server restarts (for example after a deploy).
- **Timer:** the host picks 10, 15, 20 or 30 seconds per question. The countdown turns red for the last 5 seconds.
- **Sound effects:** countdown, last-seconds ticks, correct, wrong, time up, a friend joining, and win/lose.
  Generated in the browser (no audio files). Use the Sound on/off button to mute; the choice is remembered.

Run: `npm install && npm start` (PORT env var supported). Health check: /healthz. Tests: `npm test`.
