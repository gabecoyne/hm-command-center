// Shared htm-bound-to-preact tag. Import { html } from here everywhere.
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
export { h };
