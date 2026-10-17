// Writes public/_locales/en/messages.json from scripts/messages-source.js.
import { mkdirSync, writeFileSync } from 'node:fs';
import { MESSAGES } from './messages-source.js';

const out = {};
for (const [key, [message, description]] of Object.entries(MESSAGES)) {
  const placeholders = {};
  for (const m of message.matchAll(/\$(\d)/g)) placeholders[`p${m[1]}`] = { content: `$${m[1]}` };
  // Chrome's format: $NAME$ placeholders mapped to positional $1..$9.
  const text = message.replace(/\$(\d)/g, '$p$1$');
  out[key] = { message: text, description, ...(Object.keys(placeholders).length ? { placeholders } : {}) };
}
const dir = new URL('../public/_locales/en/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('messages.json', dir), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${Object.keys(out).length} messages`);
