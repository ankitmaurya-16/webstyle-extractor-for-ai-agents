# webstyle-extractor

Extract a website's design system into a DESIGN.md and token files for AI coding agents, from the command line. It is the headless version of the [WebStyle Extractor for AI Agents](https://github.com/ankitmaurya-16/webstyle-extractor-for-ai-agents) browser extension and uses the same collector, analysis and exporters, so the output matches the extension's.

An agent can run it by itself, with no browser window and no human in the loop:

```bash
npx webstyle-extractor extract https://example.com --out .
```

## Requirements

- Node.js 20 or newer.
- Playwright's Chromium. If it is missing, the command prints the line below and exits with code 1:

  ```bash
  npx playwright install chromium
  ```

  Set `CHROMIUM_PATH` to use another Chromium or Chrome binary.

## Install

Run it with `npx`, or install it to get the `webstyle` command:

```bash
npm install --global webstyle-extractor
webstyle extract https://example.com
```

## Commands

```text
webstyle extract <url...> [options]
webstyle diff <a.webstyle.json> <b.webstyle.json> [--out diff.md]
webstyle map <snapshot.webstyle.json> --tokens <file> [--out mapping.md]
webstyle --version | --help
```

### extract

Loads each URL in headless Chromium, waits for it to load (and up to 5 s for the network to go quiet), reads its styles and writes the export files plus `snapshot.webstyle.json`. URLs can be `http:`, `https:` or `file:`. Without `--merge`, each URL becomes its own snapshot.

| Option                             | What it does                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--out <dir>`                      | Output folder. Default `./webstyle-output/<hostname>`. With several separate URLs, each gets a subfolder named after its host inside `--out`        |
| `--formats <list\|all>`            | Comma-separated format ids. Default `design-md,prompt,dtcg,tailwind-v4,css-vars,shadcn,agents-md,cursor-rules,claude-md`. `all` writes every format |
| `--merge`                          | Merge all URLs into one site snapshot. URLs must be on the same site (same host, or the same last two host labels)                                  |
| `--allow-cross-site`               | Allow `--merge` across sites                                                                                                                        |
| `--dark` / `--no-dark`             | Capture the other theme when the site uses `prefers-color-scheme` (default on). Class- or attribute-based themes come from the site's stylesheets   |
| `--states`                         | Force hover, focus and active states on sample components                                                                                           |
| `--deep`                           | Read the text of every stylesheet, including cross-origin ones                                                                                      |
| `--widths <list>`                  | Extra widths for the responsive table, for example `375,768,1280`; at most 4, each from 320 to 1920                                                 |
| `--scroll`                         | Auto-scroll to load lazy content before collecting                                                                                                  |
| `--screenshots`                    | Take component screenshots and write them to `design/screenshots/`                                                                                  |
| `--site-names` / `--no-site-names` | Use the site's CSS variable names as token names (default on)                                                                                       |
| `--shadcn-format <oklch\|hsl>`     | Format of `shadcn-theme.css` (default `oklch`)                                                                                                      |
| `--wait <ms>`                      | Extra wait after load, up to 120000 (default 0)                                                                                                     |
| `--timeout <ms>`                   | Page load timeout, 1000 to 600000 (default 30000)                                                                                                   |
| `--json`                           | Print the snapshot JSON to stdout instead of writing files                                                                                          |

Progress goes to stderr, so stdout stays clean for `--json`. Failed Advanced stages (dark, states, deep scan, widths) are printed as warnings and the rest of the result is kept.

### diff

Compares two snapshot files (from the CLI or exported from the extension) and writes `diff.md`: added, removed, changed and renamed tokens, role changes per theme, recipe changes and stack changes. The older snapshot is A. Prints to stdout unless `--out` is given.

### map

Matches a snapshot's tokens to your own token file and writes `mapping.md` with exact, close and unmatched tokens. `--tokens` takes a DTCG JSON file, a CSS file with custom properties, or a Tailwind v4 `@theme` file. Prints to stdout unless `--out` is given.

## Output

Files land inside `--out` at these paths, the same as the extension's zip and project writes:

| Format id      | Path                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `design-md`    | `DESIGN.md`                                                                                                                |
| `prompt`       | `design/prompt.md`                                                                                                         |
| `dtcg`         | `design/tokens.json`, and `design/tokens.dark.json` when the site has a dark theme                                         |
| `tailwind-v4`  | `design/theme.css`                                                                                                         |
| `tailwind-v3`  | `design/tailwind.webstyle.js`                                                                                              |
| `css-vars`     | `design/variables.css`                                                                                                     |
| `shadcn`       | `design/shadcn-theme.css`                                                                                                  |
| `styleguide`   | `design/styleguide.html`                                                                                                   |
| `agents-md`    | `AGENTS.md`                                                                                                                |
| `cursor-rules` | `.cursor/rules/design-system.mdc`                                                                                          |
| `claude-md`    | `CLAUDE.md`                                                                                                                |
| `figma`        | `design/figma/Primitives.tokens.json`, `design/figma/Semantic.Light.tokens.json`, `design/figma/Semantic.Dark.tokens.json` |
| `audit`        | `design/audit.md`                                                                                                          |
| `screenshots`  | `design/screenshots/<kind>-<variant>[-dark].png`                                                                           |
| (always)       | `snapshot.webstyle.json`                                                                                                   |

`snapshot.webstyle.json` uses the extension's snapshot format, so it imports into the extension's History, and files exported from the extension work with `diff` and `map`.

Note: the CLI writes whole files. With `--out .` in an existing project, `AGENTS.md` and `CLAUDE.md` are replaced, not merged; leave out `agents-md` and `claude-md` from `--formats`, or write to another folder, if those files already have content you want to keep.

## Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | Success (failed Advanced stages are warnings on stderr)    |
| 1    | Usage error, or Chromium or Playwright is missing          |
| 2    | A page failed to load, returned an HTTP error or timed out |
| 3    | Too little to read (fewer than 30 elements)                |
| 4    | Internal error                                             |

## Limits

- The CLI sees what a signed-out browser sees; pages behind a login are not read.
- Sites with bot protection may refuse to load (exit code 2).
- Pages drawn on a canvas cannot be read (exit code 3).

## Privacy

The CLI loads only the URLs you give it, plus the resources those pages load, as any browser does. It sends nothing anywhere else and has no telemetry or analytics. It never reads page text or stores font files; output is written only to `--out` or stdout.

## License

MIT
