import '@quilted/quilt/globals';
import {RequestRouter} from '@quilted/quilt/request-router';
import {
  BrowserAssetsEntry,
  BrowserResponse,
  renderToString,
  renderToStringWithServerContext,
} from '@quilted/quilt/server';
import {Router} from '@quilted/quilt/navigation';
import {BrowserAssets} from 'quilt:module/assets';

import type {AppContext} from '~/shared/context.ts';

import {App} from './App.tsx';

const router = new RequestRouter();
const assets = new BrowserAssets();

// For all GET requests, render our React application.
router.get(async (request) => {
  const browserResponse = new BrowserResponse({
    request,
    headers: new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    }),
  });

  const {readable, writable} = new TextEncoderStream();
  const writer = writable.getWriter();

  // Should just be `assets.entry({request})` (not async)
  const cacheKey = await assets.cacheKey?.(request);
  const entryAssets = await assets.entry({cacheKey});

  const template = renderToString(<HTML entryAssets={entryAssets} />);

  const [firstChunk, secondChunk] = template.split(
    /<quilt-server-placeholder-app><\/.*?>/,
  ) as [string, string];

  writer.write(`<!DOCTYPE html>${firstChunk}`);

  streamRemainingAsynchronously();

  return new Response(readable, {
    headers: browserResponse.headers,
    status: browserResponse.status.value,
  });

  async function streamRemainingAsynchronously() {
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    try {
      const context = {
        router: new Router(request.url),
      } satisfies AppContext;

      const appContent = await renderToStringWithServerContext(
        <App context={context} />,
        {browser: browserResponse},
      );

      const asyncAssets = await assets.modules(
        browserResponse.assets.get({timing: 'load'}),
      );

      const secondChunkWithAsyncAssets = secondChunk.replace(
        /<quilt-server-placeholder-async-assets><\/.*?>/,
        () => renderToString(<BrowserAssetsEntryTags entry={asyncAssets} />),
      );

      writer.write(`<div id="app">${appContent}</div>${secondChunkWithAsyncAssets}`);
    } catch {
    } finally {
      writer.close();
    }
  }
});

function HTML({entryAssets}: {entryAssets: BrowserAssetsEntry}) {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <style
          dangerouslySetInnerHTML={{
            __html: `
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
`.trim(),
          }}
        />

        <div id="skeleton">
          <div>Loading skeleton goes here...</div>
        </div>

        <BrowserAssetsEntryTags entry={entryAssets} />

        <ServerRenderPlaceholderAppContent />
        <ServerRenderPlaceholderAsyncAssets />
      </body>
    </html>
  );
}

function ServerRenderPlaceholderAppContent() {
  // @ts-expect-error Just used as a placeholder
  return <quilt-server-placeholder-app />;
}

// function ServerRenderPlaceholderEntryAssets() {
//   return <meta name="quilt:placeholder:entry-assets" />;
// }

function ServerRenderPlaceholderAsyncAssets() {
  // @ts-expect-error Just used as a placeholder
  return <quilt-server-placeholder-async-assets />;
}

// TODO: handle crossorigin
function BrowserAssetsEntryTags({entry}: {entry: BrowserAssetsEntry}) {
  return (
    <>
      {entry.scripts.map((script) => (
        <script src={script.source} async {...script.attributes} />
      ))}
      {entry.styles.map((style) => (
        <link rel="stylesheet" href={style.source} {...style.attributes} />
      ))}
    </>
  );
}

// function renderBrowserAssetsEntryToString(entry: BrowserAssetsEntry) {
//   let content = '';

//   for (const script of entry.scripts) {
//     content += `<script src="${script.source}"`;

//     if (script.attributes) {
//       for (const [key, value] of Object.entries(script.attributes)) {
//         content += ` ${key}="${value}"`;
//       }
//     }

//     content += `></script>`;
//   }

//   for (const style of entry.styles) {
//     content += `<link rel="stylesheet" href="${style.source}"`;

//     if (style.attributes) {
//       for (const [key, value] of Object.entries(style.attributes)) {
//         content += ` ${key}="${value}"`;
//       }
//     }

//     content += ` />`;
//   }

//   return content;
// }

export default router;
