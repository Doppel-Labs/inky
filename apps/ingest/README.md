# @inky/ingest

The telemetry sink: a tiny, boring endpoint that receives Inky's **anonymous,
opt-in** usage events and writes them to Postgres. It is the server side of the
contract in [`docs/planning/telemetry-design.md`](../../docs/planning/telemetry-design.md);
the client lives in `@inky/core` (`telemetry.ts`).

## What it does

`handleTelemetry(body, db)` validates a request body against the shared wire
contract (`@inky/core`'s `TelemetryEventSchema`) and inserts one row into the
`telemetry_events` table. The contract is enforced **server-side too**: an
unknown event name, a missing field, or a non-scalar `props` value is a `400`
and writes nothing. Rows are never tenant-linked — a self-host event carries
only a random install id.

- `204` — event accepted and stored
- `400` — malformed JSON or an event that fails the schema
- `413` — body over the 16 KB cap (an envelope is tiny)
- `500` — the write failed (logged server-side, terse to the client)

## Run it

Two ways — pick one:

**1. The bundled Node service** (simplest; deploy as one always-on web service):

```bash
DATABASE_URL=postgres://… pnpm --filter @inky/ingest start
# POST /t   record an event
# GET  /    health check
```

Override the port with `PORT` and the path with `INGEST_PATH`.

**2. A serverless function** — skip `server.ts` and wrap the handler:

```ts
import { createDb } from '@inky/db';
import { handleTelemetry } from '@inky/ingest/handler';

const { db } = createDb(); // reuse across invocations where the runtime allows

export default async function (req, res) {
  const { status, body } = await handleTelemetry(req.body, db);
  res.status(status).json(status === 204 ? undefined : body);
}
```

## Point the client at it

In a self-host `inky.config.json`:

```jsonc
{
  "telemetry": { "enabled": true, "endpoint": "https://your-ingest.example/t" }
}
```

Telemetry is **off by default**; nothing is sent until the operator opts in. See
the root README's "Telemetry" section for exactly what is and isn't collected.

## Schema & migrations

The `telemetry_events` table and its migration live in `@inky/db`
(`packages/db/drizzle`). Apply migrations there (`pnpm --filter @inky/db
db:migrate`) against the same `DATABASE_URL` before serving.
