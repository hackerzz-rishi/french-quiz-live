# French Quiz Live
Express + WebSocket server for the French verb quiz.

**Play with friends:** open the "Play with friends" tab, type your name and press **Create a new game**.
Send the 5-letter code (or the invite link) to your friends. They enter it and press **Join game**.
You see each friend appear in the lobby; the **Start quiz** button unlocks once at least one friend has joined.
Live scoreboard, highest score wins, and the next round pulls everyone in automatically.

Run: `npm install && npm start` (PORT env var supported). Health check: /healthz. Tests: `npm test`.
