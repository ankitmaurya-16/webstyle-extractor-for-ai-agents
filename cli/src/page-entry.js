// The collector as a page script for the CLI, built as an IIFE string (F41). It installs the same
// API as entrypoints/extractor.js does in the extension.
import { collect } from '../../src/collect/index.js';
import { recipeStyles } from '../../src/collect/components.js';

if (!globalThis.__webstyle) {
  globalThis.__webstyle = {
    collect: (options) => collect(options ?? {}),
    readRecipe: (selector) => {
      const el = document.querySelector(selector);
      return el ? recipeStyles(getComputedStyle(el)) : null;
    },
  };
}
