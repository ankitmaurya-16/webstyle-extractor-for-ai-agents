import { collect } from '../src/collect/index.js';
import { recipeStyles } from '../src/collect/components.js';

// Installs the page API once per frame; the service worker then calls it through
// executeScript({ func, args }) with options (AC-F23.2).
export default defineUnlistedScript(() => {
  if (!self.__webstyle) {
    self.__webstyle = {
      collect: (options) => collect(options ?? {}),
      readRecipe: (selector) => {
        const el = document.querySelector(selector);
        return el ? recipeStyles(getComputedStyle(el)) : null;
      },
    };
  }
  return true;
});
