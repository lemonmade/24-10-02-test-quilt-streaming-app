if (process.env.NODE_ENV === 'development') {
  await import('preact/debug');
}

import '@quilted/quilt/globals';
import {hydrate} from 'preact';
import {Browser, BrowserContext} from '@quilted/quilt/browser';
import {Router} from '@quilted/quilt/navigation';

import type {AppContext} from '~/shared/context.ts';
import {App} from './App.tsx';

if (document.readyState === 'loading') {
  await new Promise((resolve) =>
    document.addEventListener('DOMContentLoaded', resolve),
  );
}

const element = document.querySelector('#app')!;
const browser = new Browser();

const context = {
  router: new Router(browser.request.url),
} satisfies AppContext;

// Makes key parts of the app available in the browser console
Object.assign(globalThis, {app: context});

hydrate(
  <BrowserContext browser={browser}>
    <App context={context} />
  </BrowserContext>,
  element,
);
