// Unique CSS paths for representative elements (F26, F12). Nothing is added to the page.

const AUTO_ID =
  /(\d{3,}|[a-f0-9]{8,}|^:|^[a-z]+-[a-z0-9]{6,}$|__|radix|headlessui|react|ember|mui-)/i;

const escape = (s) => (globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

function stableId(el) {
  const id = el.id;
  if (!id || AUTO_ID.test(id)) return null;
  const doc = el.ownerDocument;
  try {
    return doc.querySelectorAll(`#${escape(id)}`).length === 1 ? `#${escape(id)}` : null;
  } catch {
    return null;
  }
}

/**
 * A selector that matches exactly `el`: a stable unique id, or tag:nth-of-type steps up to the
 * nearest such id or body. Returns null for elements inside shadow roots.
 * @param {Element} el
 */
export function uniqueSelector(el) {
  if (!el || el.getRootNode() !== el.ownerDocument) return null;
  const doc = el.ownerDocument;
  const steps = [];
  let node = el;
  while (node && node.nodeType === 1) {
    const id = stableId(node);
    if (id) {
      steps.unshift(id);
      break;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') {
      steps.unshift(tag);
      break;
    }
    const parent = node.parentElement;
    if (!parent) {
      steps.unshift(tag);
      break;
    }
    const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
    steps.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
    node = parent;
  }
  const selector = steps.join(' > ');
  try {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el ? selector : null;
  } catch {
    return null;
  }
}
