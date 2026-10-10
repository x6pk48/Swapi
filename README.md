# Swapi

Swap skills, find your study buddy. Teach what you know, learn what you want, and grow into who you could be.

## Run it

Needs **Node 22.13 or newer**. There is nothing to install.

```bash
node server.js        # or: npm start
# open http://localhost:3000
```

The server serves the app (`swapi.html`), exposes a JSON API under `/api`, and stores everything in a SQLite
database file (`swapi.db`, created on first start from `schema.sql`). 14 demo buddies are seeded so a single
user can still match. Open the page in two browsers (or one normal and one private window) to match two real users.

**No server?** If `swapi.html` is opened straight from disk or hosted somewhere without the server, it silently
falls back to local-only mode (profile in `localStorage`, generated buddies), exactly as before.
To point the page at a server on another host, add `<script>window.SWAPI_API="https://your-server"</script>` above the last script.

Environment variables: `PORT` (default 3000), `DB_FILE` (default `./swapi.db`).

## How the pieces fit

```
browser (swapi.html)  --fetch /api/*-->  server.js (Node http)  --SQL-->  swapi.db (SQLite, schema.sql)
   localStorage = offline cache            validates + sanitises            users, swipes, matches,
                                                                            messages, meetings, sessions,
                                                                            journal, skills, ratings
```

- The setup quiz creates a profile on the server and returns a random secret **token**, stored in the browser.
- The deck is loaded from `/api/buddies` (real users first, people who already liked you on top).
- Swipes go to `/api/swipe`. Two real people match only when both like each other. Demo buddies like back at random,
  and the daily Boost always matches a demo buddy. Boosting a real person never forces a match (consent).
- Chat uses `/api/messages` and `/api/inbox` (polled every 5 seconds). You can only message your matches.
- Progress (XP, streak, sessions, meetings, journal, skills, ratings) is saved to `/api/progress` whenever it changes.

## API

| Method and path | Auth | What it does |
|---|---|---|
| `GET /api/health` | no | Is the server up |
| `GET /api/stats` | no | Counts of learners, matches, messages, sessions, reflections |
| `POST /api/profile` | optional | Create a profile (returns a token) or update it |
| `GET /api/buddies[?recycle=1]` | yes | People to swipe on |
| `POST /api/swipe` | yes | `{to, liked, boost}` returns `{matched}` |
| `GET /api/matches` | yes | Your matches |
| `POST /api/messages` | yes | `{to, text}` (matches only) |
| `GET /api/inbox?after=ID` | yes | New messages for you |
| `POST /api/progress`, `GET /api/progress` | yes | Save and load your progress |
| `DELETE /api/me` | yes | Delete your account and all your data |

Auth is `Authorization: Bearer <token>`.

## Known limits (honest list)

- **No passwords or emails yet.** Whoever holds the token is you. Real accounts (email, hashed password, sessions)
  are the next step.
- Names and text are stripped of HTML characters on the server and escaped in the page, but there is no moderation
  or reporting yet.
- Video in the study room is still local (camera preview and recording); it is not streamed between users.
- Polling every 5 seconds instead of WebSockets.
- SQLite is perfect for a demo and small deployments; move to Postgres for scale.

## Files

`swapi.html` frontend · `server.js` backend · `schema.sql` database schema · `swapi-project-image.png/svg` cover image
