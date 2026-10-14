/**
 * DOM helpers.
 *
 * `el()` skips null, undefined, false and empty children. This matters: appending
 * a bare null to the DOM renders the literal text "null", which is exactly the
 * kind of thing the render tests check for.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(node, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') {
      const classes = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      if (classes) node.setAttribute('class', classes);
      continue;
    }
    if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        if (dataValue === null || dataValue === undefined) continue;
        node.dataset[dataKey] = String(dataValue);
      }
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }
    if (key === 'text') {
      node.textContent = String(value);
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key === 'value' && 'value' in node) {
      node.value = value;
      continue;
    }
    if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'multiple') {
      if (value) node.setAttribute(key, '');
      else node.removeAttribute(key);
      if (key === 'checked' || key === 'disabled' || key === 'multiple' || key === 'selected') node[key] = Boolean(value);
      continue;
    }
    if (value === true) {
      node.setAttribute(key, '');
      continue;
    }
    node.setAttribute(key, String(value));
  }
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
      continue;
    }
    if (child instanceof Node) {
      node.appendChild(child);
      continue;
    }
    const text = String(child);
    if (text) node.appendChild(document.createTextNode(text));
  }
}

/**
 * Create an element.
 * @param {string} tag element name, optionally with SVG namespace via `el.svg`
 */
export function el(tag, props = null, ...children) {
  const node = tag === 'svg' || tag.startsWith('svg:')
    ? document.createElementNS(SVG_NS, tag.replace(/^svg:/, ''))
    : document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

export function svg(tag, props = null, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

export function fragment(...children) {
  const node = document.createDocumentFragment();
  appendChildren(node, children);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replace(node, ...children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

/**
 * A horizontally scrollable area.
 *
 * Anything that scrolls must be reachable without a mouse, so these wrappers
 * carry a tab stop, a role and a label. Accessibility tools flag a scrollable
 * region with no keyboard access, and they are right to.
 */
export function scrollArea(label, ...children) {
  return el('div', {
    class: 'table-scroll',
    role: 'region',
    tabindex: '0',
    'aria-label': label
  }, ...children);
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return [...scope.querySelectorAll(selector)];
}

/** Format a number for display without inventing precision. */
export function on(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}
