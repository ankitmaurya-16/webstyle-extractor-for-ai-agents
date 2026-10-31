import { afterEach, describe, expect, it } from 'vitest';
import { exportFiles } from '../../../src/export/index.js';
import { MARK_END, MARK_START } from '../../../src/export/agents.js';
import { FILE_MAP, isValidRelativePath } from '../../../src/export/files.js';
import {
  defaultFileMap,
  ensurePermission,
  fileMapErrors,
  fileSystemSupported,
  mapFiles,
  planWrites,
  writeToProject,
} from '../../../src/project/index.js';
import { VERSION, richDesign } from '../export/designs.js';
import { FakeDirectory } from './fake-fs.js';

const design = richDesign();
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const shots = [{ recipeId: 'component:button:primary', mode: 'light', bytes: PNG }];
const projectFiles = (fileMap = defaultFileMap(), options = {}) =>
  mapFiles(
    exportFiles(design, VERSION, {
      ctx: { screenshots: shots },
      includeScreenshots: true,
      ...options,
    }),
    fileMap,
  );

describe('file maps (F37)', () => {
  it('AC-F37.2 the default file map follows spec 9.2', () => {
    const map = defaultFileMap();
    for (const [format, paths] of Object.entries(FILE_MAP)) expect(map[format]).toBe(paths[0]);
    expect(map.screenshots).toBe('design/screenshots/');
    expect(fileMapErrors(map)).toEqual([]);
  });

  it('AC-F37.2 paths must be relative and free of `..`', () => {
    for (const ok of [
      'DESIGN.md',
      'docs/DESIGN.md',
      '.cursor/rules/x.mdc',
      'design/screenshots/',
      'a\\b.md',
    ]) {
      expect(isValidRelativePath(ok), ok).toBe(true);
    }
    for (const bad of [
      '',
      '   ',
      '/etc/passwd',
      '\\share',
      'C:/x.md',
      '../x.md',
      'docs/../../x.md',
      'a//b.md',
      null,
      undefined,
    ]) {
      expect(isValidRelativePath(bad), String(bad)).toBe(false);
    }
    const map = { ...defaultFileMap(), 'design-md': '../DESIGN.md', prompt: '/tmp/prompt.md' };
    expect(fileMapErrors(map)).toEqual(['design-md', 'prompt']);
  });

  it('mapFiles moves each format to its mapped path; extra files keep their names beside it', () => {
    const map = {
      ...defaultFileMap(),
      'design-md': 'docs/DESIGN.md',
      dtcg: 'tokens/base.json',
      figma: 'figma/p.json',
      screenshots: 'docs/shots',
    };
    const paths = projectFiles(map).map((f) => f.path);
    expect(paths).toContain('docs/DESIGN.md');
    expect(paths).toContain('tokens/base.json');
    expect(paths).toContain('tokens/tokens.dark.json');
    expect(paths).toContain('figma/p.json');
    expect(paths).toContain('figma/Semantic.Dark.tokens.json');
    expect(paths).toContain('docs/shots/button-primary.png');
    expect(projectFiles(map).find((f) => f.path === 'docs/DESIGN.md').format).toBe('design-md');
  });

  it('AC-F37.6 the Tailwind v3 output is always design/tailwind.webstyle.js', () => {
    const map = { ...defaultFileMap(), 'tailwind-v3': 'tailwind.config.js' };
    const files = projectFiles(map);
    expect(files.find((f) => f.format === 'tailwind-v3').path).toBe('design/tailwind.webstyle.js');
    expect(files.some((f) => f.path === 'tailwind.config.js')).toBe(false);
  });
});

describe('planning writes (F37)', () => {
  const block = `${MARK_START}\n## Design system\n\nnew\n${MARK_END}\n`;
  const files = [
    { path: 'AGENTS.md', format: 'agents-md', text: block },
    { path: 'CLAUDE.md', format: 'claude-md', text: block },
    { path: 'DESIGN.md', format: 'design-md', text: 'design\n' },
    { path: 'design/prompt.md', format: 'prompt', text: 'prompt\n' },
  ];

  it('AC-F37.5 AGENTS.md and CLAUDE.md change only inside the markers', () => {
    const agents = `# Agents\n\nKeep me.\n\n${MARK_START}\nold\n${MARK_END}\n\n## After\n`;
    const plan = planWrites(files, {
      'AGENTS.md': agents,
      'CLAUDE.md': '# Project\n\nUse pnpm.\n',
    });
    expect(plan[0].next).toBe(`# Agents\n\nKeep me.\n\n${block.trimEnd()}\n\n## After\n`);
    expect(plan[1].next).toBe(`# Project\n\nUse pnpm.\n\n${block}`);
    expect(plan.slice(0, 2).map((p) => p.status)).toEqual(['updated', 'updated']);
  });

  it('AC-F37.7 marks files new, updated or unchanged by comparing content', () => {
    const plan = planWrites(files, {
      'AGENTS.md': `intro\n\n${block}`,
      'DESIGN.md': 'design\n',
      'design/prompt.md': 'old\n',
    });
    expect(plan.map((p) => [p.path, p.status])).toEqual([
      ['AGENTS.md', 'unchanged'],
      ['CLAUDE.md', 'new'],
      ['DESIGN.md', 'unchanged'],
      ['design/prompt.md', 'updated'],
    ]);
    const png = [{ path: 'design/screenshots/a.png', format: 'screenshots', bytes: PNG }];
    expect(planWrites(png, {})[0].status).toBe('new');
    expect(planWrites(png, { 'design/screenshots/a.png': PNG.slice() })[0].status).toBe(
      'unchanged',
    );
    expect(planWrites(png, { 'design/screenshots/a.png': new Uint8Array([1]) })[0].status).toBe(
      'updated',
    );
  });
});

describe('writing to a project folder (F37)', () => {
  it('AC-F37.3 creates missing folders and writes every selected format to its path', async () => {
    const root = new FakeDirectory();
    const files = projectFiles();
    const results = await writeToProject(root, files);
    expect(results.every((r) => r.status === 'new')).toBe(true);
    expect(root.paths()).toEqual(files.map((f) => f.path).sort());
    expect(root.paths()).toEqual(
      expect.arrayContaining([
        'DESIGN.md',
        'AGENTS.md',
        'CLAUDE.md',
        '.cursor/rules/design-system.mdc',
        'design/theme.css',
        'design/screenshots/button-primary.png',
      ]),
    );
    expect(root.fileAt('DESIGN.md').text).toBe(files.find((f) => f.path === 'DESIGN.md').text);
    expect([...root.fileAt('design/screenshots/button-primary.png').bytes]).toEqual([...PNG]);
  });

  it('AC-F37.3 writes only the selected formats', async () => {
    const root = new FakeDirectory();
    await writeToProject(
      root,
      projectFiles(defaultFileMap(), {
        formats: ['design-md', 'claude-md'],
        includeScreenshots: false,
      }),
    );
    expect(root.paths()).toEqual(['CLAUDE.md', 'DESIGN.md']);
  });

  it('AC-F37.5 AGENTS.md and CLAUDE.md keep everything outside the markers', async () => {
    const root = new FakeDirectory();
    const agents = `# Agents\n\nRun pnpm test.\n\n${MARK_START}\nold block\n${MARK_END}\n\nTrailing notes.\n`;
    root.seed('AGENTS.md', agents);
    root.seed('CLAUDE.md', '# Claude\n\nNo markers here.');
    const files = projectFiles(defaultFileMap(), {
      formats: ['agents-md', 'claude-md'],
      includeScreenshots: false,
    });
    await writeToProject(root, files);
    const written = root.fileAt('AGENTS.md').text;
    expect(
      written.startsWith('# Agents\n\nRun pnpm test.\n\n<!-- webstyle:start -->\n## Design system'),
    ).toBe(true);
    expect(written.endsWith(`${MARK_END}\n\nTrailing notes.\n`)).toBe(true);
    expect(written).not.toContain('old block');
    const claude = root.fileAt('CLAUDE.md').text;
    expect(claude).toBe(
      `# Claude\n\nNo markers here.\n\n${files.find((f) => f.format === 'claude-md').text}`,
    );
  });

  it('AC-F37.7 unchanged files are not rewritten and the summary lists each status', async () => {
    const root = new FakeDirectory();
    const files = projectFiles();
    await writeToProject(root, files);
    root.writes.length = 0;
    const again = await writeToProject(root, files);
    expect(again.every((r) => r.status === 'unchanged')).toBe(true);
    expect(root.writes).toEqual([]);
    root.seed('design/prompt.md', 'edited by hand\n');
    const third = await writeToProject(root, files);
    expect(third.find((r) => r.path === 'design/prompt.md').status).toBe('updated');
    expect(third.filter((r) => r.status === 'updated')).toHaveLength(1);
    expect(root.writes).toEqual(['prompt.md']);
  });

  it('AC-F37.8 no file is ever deleted', async () => {
    const root = new FakeDirectory();
    root.seed('design/old-theme.css', 'keep');
    root.seed('src/app.jsx', 'keep');
    root.seed('tailwind.config.js', 'module.exports = {};');
    await writeToProject(root, projectFiles());
    expect(root.removed).toEqual([]);
    expect(root.fileAt('design/old-theme.css').text).toBe('keep');
    expect(root.fileAt('src/app.jsx').text).toBe('keep');
    expect(root.fileAt('tailwind.config.js').text).toBe('module.exports = {};');
  });

  it('AC-F37.9 failures are listed with FS_WRITE_FAILED or FS_PERMISSION_DENIED; other files still land', async () => {
    const root = new FakeDirectory();
    root.failures.set('theme.css', 'InvalidStateError');
    root.failures.set('prompt.md', 'NotAllowedError');
    const results = await writeToProject(root, projectFiles());
    const failed = results.filter((r) => r.status === 'failed');
    expect(failed.map((r) => [r.path, r.code])).toEqual([
      ['design/prompt.md', 'FS_PERMISSION_DENIED'],
      ['design/theme.css', 'FS_WRITE_FAILED'],
    ]);
    expect(failed[0].error).toMatch(/NotAllowedError/);
    expect(root.fileAt('DESIGN.md')).toBeDefined();
  });

  it('AC-F37.9 a path blocked by a file where a folder should be fails with FS_WRITE_FAILED', async () => {
    const root = new FakeDirectory();
    root.seed('design', 'not a folder');
    const results = await writeToProject(
      root,
      projectFiles(defaultFileMap(), {
        formats: ['design-md', 'prompt'],
        includeScreenshots: false,
      }),
    );
    expect(results).toEqual([
      { path: 'DESIGN.md', status: 'new' },
      {
        path: 'design/prompt.md',
        status: 'failed',
        code: 'FS_WRITE_FAILED',
        error: expect.any(String),
      },
    ]);
  });
});

describe('permission and support (F37)', () => {
  afterEach(() => delete globalThis.showDirectoryPicker);

  it('AC-F37.4 checks permission first and requests it only when needed', async () => {
    const root = new FakeDirectory();
    expect(await ensurePermission(root)).toBe(true);
    expect(root.requests).toBe(0);
    root.permission = 'prompt';
    root.grantOnRequest = 'granted';
    expect(await ensurePermission(root)).toBe(true);
    expect(root.requests).toBe(1);
    root.grantOnRequest = 'denied';
    expect(await ensurePermission(root)).toBe(false);
  });

  it('AC-F37.10 the feature is available only with showDirectoryPicker', () => {
    delete globalThis.showDirectoryPicker;
    expect(fileSystemSupported()).toBe(false);
    globalThis.showDirectoryPicker = async () => new FakeDirectory();
    expect(fileSystemSupported()).toBe(true);
  });
});
