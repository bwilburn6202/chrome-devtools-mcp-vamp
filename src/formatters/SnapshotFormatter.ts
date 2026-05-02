/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {TextSnapshot} from '../TextSnapshot.js';
import type {TextSnapshotNode} from '../types.js';

// SnapshotFormatter only reads a small slice of TextSnapshot. Accept the
// structural shape so tests and other callers can pass plain object literals
// without depending on the full class (in particular, the lazy
// `backendNodeIdToNode` getter added in Phase 1.3).
interface SnapshotInput {
  root: TextSnapshot['root'];
  verbose: TextSnapshot['verbose'];
  hasSelectedElement: TextSnapshot['hasSelectedElement'];
  selectedElementUid?: TextSnapshot['selectedElementUid'];
}

export class SnapshotFormatter {
  #snapshot: SnapshotInput;
  // Phase 1.7: max nodes formatted before truncation. Caps memory blow-ups
  // on giant DOMs. 0 / undefined disables the cap.
  #maxNodes: number | undefined;

  constructor(snapshot: SnapshotInput, options?: {maxNodes?: number}) {
    this.#snapshot = snapshot;
    this.#maxNodes = options?.maxNodes;
  }

  toString(): string {
    const chunks: string[] = [];
    const root = this.#snapshot.root;

    // Top-level content of the snapshot.
    if (
      !this.#snapshot.verbose &&
      this.#snapshot.hasSelectedElement &&
      !this.#snapshot.selectedElementUid
    ) {
      chunks.push(`Note: there is a selected element in the DevTools Elements panel but it is not included into the current a11y tree snapshot.
Get a verbose snapshot to include all elements if you are interested in the selected element.\n\n`);
    }

    const counter = {emitted: 0, truncated: false};
    chunks.push(this.#formatNode(root, 0, counter));
    if (counter.truncated && this.#maxNodes) {
      chunks.push(
        `\n... [snapshot truncated at ${this.#maxNodes} nodes; pass --snapshotMaxNodes to raise the cap]\n`,
      );
    }
    return chunks.join('');
  }

  toJSON(): object {
    const counter = {emitted: 0, truncated: false};
    return this.#nodeToJSON(this.#snapshot.root, counter);
  }

  #formatNode(
    node: TextSnapshotNode,
    depth = 0,
    counter?: {emitted: number; truncated: boolean},
  ): string {
    if (counter && this.#maxNodes && counter.emitted >= this.#maxNodes) {
      counter.truncated = true;
      return '';
    }
    if (counter) {
      counter.emitted++;
    }
    const chunks: string[] = [];
    const attributes = this.#getAttributes(node);
    const line =
      ' '.repeat(depth * 2) +
      attributes.join(' ') +
      (node.id === this.#snapshot.selectedElementUid
        ? ' [selected in the DevTools Elements panel]'
        : '') +
      '\n';
    chunks.push(line);

    for (const child of node.children) {
      chunks.push(this.#formatNode(child, depth + 1, counter));
    }
    return chunks.join('');
  }

  #nodeToJSON(
    node: TextSnapshotNode,
    counter?: {emitted: number; truncated: boolean},
  ): object {
    if (counter && this.#maxNodes && counter.emitted >= this.#maxNodes) {
      counter.truncated = true;
      return {truncated: true};
    }
    if (counter) {
      counter.emitted++;
    }
    const rawAttrs = this.#getAttributesMap(node);
    const children = node.children.map(child =>
      this.#nodeToJSON(child, counter),
    );
    const result: Record<string, unknown> = structuredClone(rawAttrs);
    if (children.length > 0) {
      result.children = children;
    }
    return result;
  }

  #getAttributes(serializedAXNodeRoot: TextSnapshotNode): string[] {
    const attributes = [`uid=${serializedAXNodeRoot.id}`];

    if (serializedAXNodeRoot.role) {
      attributes.push(
        serializedAXNodeRoot.role === 'none'
          ? 'ignored'
          : serializedAXNodeRoot.role,
      );
    }
    if (serializedAXNodeRoot.name) {
      attributes.push(`"${serializedAXNodeRoot.name}"`);
    }

    const simpleAttrs = this.#getAttributesMap(
      serializedAXNodeRoot,
      /* excludeSpecial */ true,
    );

    for (const attr of Object.keys(serializedAXNodeRoot).sort()) {
      if (excludedAttributes.has(attr)) {
        continue;
      }

      const mapped = booleanPropertyMap[attr];
      if (mapped && simpleAttrs[mapped]) {
        attributes.push(mapped);
      }

      const val = simpleAttrs[attr];
      if (val === true) {
        attributes.push(attr);
      } else if (typeof val === 'string' || typeof val === 'number') {
        attributes.push(`${attr}="${val}"`);
      }
    }

    return attributes;
  }

  #getAttributesMap(
    node: TextSnapshotNode,
    excludeSpecial = false,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!excludeSpecial) {
      result.id = node.id;
      if (node.role) {
        result.role = node.role;
      }
      if (node.name) {
        result.name = node.name;
      }
    }

    // Re-implementing the exact logic from original function for #getAttributes to be safe:
    return {
      ...result,
      ...this.#extractedAttributes(node),
    };
  }

  #extractedAttributes(node: TextSnapshotNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of Object.keys(node).sort()) {
      if (excludedAttributes.has(attr)) {
        continue;
      }
      const value = (node as unknown as Record<string, unknown>)[attr];
      if (typeof value === 'boolean') {
        if (booleanPropertyMap[attr]) {
          result[booleanPropertyMap[attr]] = true;
        }
        if (value) {
          result[attr] = true;
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        result[attr] = value;
      }
    }
    return result;
  }
}

const booleanPropertyMap: Record<string, string> = {
  disabled: 'disableable',
  expanded: 'expandable',
  focused: 'focusable',
  selected: 'selectable',
};

const excludedAttributes = new Set([
  'id',
  'role',
  'name',
  'elementHandle',
  'children',
  'backendNodeId',
  'loaderId',
]);
