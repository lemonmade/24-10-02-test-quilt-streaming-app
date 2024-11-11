import '@quilted/quilt/globals';
import {RequestRouter} from '@quilted/quilt/request-router';
import {
  renderAppToHTMLResponse,
  HTML,
  HTMLStreamBoundary,
  HTMLPlaceholderContent,
  HTMLPlaceholderEntryAssets,
  HTMLPlaceholderAsyncAssets,
  HTMLPlaceholderSerializations,
  HTMLPlaceholderPreloadAssets,
  StyleAssets,
  useBrowserAssetsManifest,
} from '@quilted/quilt/server';
import {Router} from '@quilted/quilt/navigation';
import {BrowserAssets} from 'quilt:module/assets';

import type {AppContext} from '~/shared/context.ts';

import {App} from './App.tsx';

const router = new RequestRouter();
const assets = new BrowserAssets();

// For all GET requests, render our React application.
router.get(async (request) => {
  const response = await renderAppToHTMLResponse(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      const context = {
        router: new Router(request.url),
      } satisfies AppContext;

      return <App context={context} />;
    },
    {
      assets,
      request,
      stream: true,
      headers: {
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
      serializations: new Map([['test', 'test']]),
      template: <AppHTML />,
    },
  );

  return response;
});

export default router;

const INLINE_STYLE = `
#skeleton {
  width: 100%;
  height: 100%;
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  opacity: 1;
  background: white;
  transition: opacity 0.3s ease-in-out;
}

#skeleton:has(~ #app) {
  opacity: 0;
}
`.trim();

function AppHTML() {
  return (
    <HTML title="My App">
      <Skeleton />

      <HTMLPlaceholderSerializations />
      <HTMLPlaceholderEntryAssets />

      <HTMLStreamBoundary />

      <div id="app">
        <HTMLPlaceholderContent />
      </div>

      {/* problem: styles added after the HTML, but no way to lift them up given how the
        streaming works... Also, this adds unnecessary references to already-sent assets */}
      <HTMLPlaceholderAsyncAssets />
      <HTMLPlaceholderPreloadAssets />
    </HTML>
  );
}

function Skeleton() {
  const manifest = useBrowserAssetsManifest();
  const style = manifest.entry({id: './skeleton.css'}).styles.at(0);
  console.log(manifest.entry({id: './skeleton.css'}));

  return (
    <>
      {style?.content ? (
        <style dangerouslySetInnerHTML={{__html: style.content}} />
      ) : null}
      <div id="skeleton">
        <div>Loading skeleton goes here...</div>
      </div>
    </>
  );
}
