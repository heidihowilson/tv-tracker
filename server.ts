/**
 * TV Tracker server bootstrap.
 *
 * Seeds the database if empty, then serves the app router over a Node http
 * server. The createRequestListener wrapper passes only the request to
 * router.fetch (the listener's 2nd arg would otherwise be mistaken for RequestInit).
 */
import * as http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";

import { router } from "./app/router.ts";
import { seedIfEmpty } from "./app/data/seed.ts";
import { PORT } from "./app/config.ts";

await seedIfEmpty();

const server = http.createServer(createRequestListener((request) => router.fetch(request)));
server.listen(PORT, () => {
  console.log(`TV Tracker running at http://localhost:${PORT}`);
});
