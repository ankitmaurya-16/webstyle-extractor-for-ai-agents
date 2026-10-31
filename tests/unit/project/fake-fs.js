// An in-memory FileSystemDirectoryHandle with the parts of the File System Access API that the
// project writer uses. It records every write and refuses removeEntry so tests can prove
// nothing is deleted.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const domError = (name, message) => Object.assign(new Error(message), { name });

export class FakeFile {
  kind = 'file';

  constructor(name, root, bytes = new Uint8Array()) {
    this.name = name;
    this.root = root;
    this.bytes = bytes;
  }

  async getFile() {
    const bytes = this.bytes;
    return {
      text: async () => decoder.decode(bytes),
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async createWritable() {
    const failure = this.root.failures.get(this.name);
    if (failure) throw domError(failure, `${failure} for ${this.name}`);
    let next = new Uint8Array();
    return {
      write: async (data) => {
        next = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
      },
      close: async () => {
        this.bytes = next;
        this.root.writes.push(this.name);
      },
    };
  }

  get text() {
    return decoder.decode(this.bytes);
  }
}

export class FakeDirectory {
  kind = 'directory';
  entries = new Map();

  constructor(name = 'project', root = null) {
    this.name = name;
    this.root = root ?? this;
    if (!root) {
      this.writes = [];
      this.removed = [];
      this.failures = new Map();
      this.permission = 'granted';
      this.requests = 0;
    }
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const entry = this.entries.get(name);
    if (entry?.kind === 'directory') return entry;
    if (entry) throw domError('TypeMismatchError', `${name} is a file`);
    if (!create) throw domError('NotFoundError', `${name} not found`);
    const dir = new FakeDirectory(name, this.root);
    this.entries.set(name, dir);
    return dir;
  }

  async getFileHandle(name, { create = false } = {}) {
    const entry = this.entries.get(name);
    if (entry?.kind === 'file') return entry;
    if (entry) throw domError('TypeMismatchError', `${name} is a folder`);
    if (!create) throw domError('NotFoundError', `${name} not found`);
    const file = new FakeFile(name, this.root);
    this.entries.set(name, file);
    return file;
  }

  async removeEntry(name) {
    this.root.removed.push(name);
    throw domError('NotAllowedError', 'tests never allow deleting');
  }

  async queryPermission() {
    return this.root.permission;
  }

  async requestPermission() {
    this.root.requests += 1;
    return this.root.grantOnRequest ?? 'denied';
  }

  /** Test helper: the file at a slash path, or undefined. */
  fileAt(path) {
    const parts = path.split('/');
    let node = this;
    for (const part of parts) {
      node = node?.entries?.get(part);
      if (!node) return undefined;
    }
    return node.kind === 'file' ? node : undefined;
  }

  /** Test helper: writes a file at a slash path without counting it as a write. */
  seed(path, content) {
    const parts = path.split('/');
    let dir = this;
    for (const part of parts.slice(0, -1)) {
      if (!dir.entries.has(part)) dir.entries.set(part, new FakeDirectory(part, this.root));
      dir = dir.entries.get(part);
    }
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    dir.entries.set(parts.at(-1), new FakeFile(parts.at(-1), this.root, bytes));
  }

  /** Test helper: every file path under this folder, sorted. */
  paths(prefix = '') {
    const out = [];
    for (const [name, entry] of this.entries) {
      if (entry.kind === 'file') out.push(`${prefix}${name}`);
      else out.push(...entry.paths(`${prefix}${name}/`));
    }
    return out.sort();
  }
}
