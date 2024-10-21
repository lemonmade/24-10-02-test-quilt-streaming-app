import '@quilted/quilt/globals';
import {RequestRouter} from '@quilted/quilt/request-router';
import {
  Title,
  Meta,
  Link,
  Serialization,
  BrowserAssetsEntry,
  BrowserResponse,
  renderToString,
  ServerContext,
  useBrowserResponse,
  BrowserEffectsAreActiveContext,
  styleAssetPreloadAttributes,
  scriptAssetPreloadAttributes,
} from '@quilted/quilt/server';
import {Router} from '@quilted/quilt/navigation';
import {BrowserAssets} from 'quilt:module/assets';

import type {AppContext} from '~/shared/context.ts';

import {App} from './App.tsx';

const router = new RequestRouter();
const assets = new BrowserAssets();

// For all GET requests, render our React application.
router.get(async (request) => {
  const response = await renderToHTMLResponse(<MyHTML />, {
    assets,
    request,
    headers: {
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    serializations: new Map([['test', 'test']]),
    async app() {
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      const context = {
        router: new Router(request.url),
      } satisfies AppContext;

      return <App context={context} />;
    },
  });

  return response;
});

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

function MyHTML() {
  return (
    <HTML>
      <style dangerouslySetInnerHTML={{__html: INLINE_STYLE}} />

      <div id="skeleton">
        <div>Loading skeleton goes here...</div>
      </div>

      <ResponsePlaceholderSerializations />
      <ResponsePlaceholderEntryAssets />

      <ResponseStreamBoundary />

      <div id="app">
        <ResponsePlaceholderApp />
      </div>

      <ResponsePlaceholderAsyncAssets />
    </HTML>
  );
}

// Library

import type {RenderableProps, VNode, JSX} from 'preact';
import {renderToStringAsync} from '@quilted/quilt/server';
import {EnhancedResponse} from '@quilted/quilt/request-router';

const STREAM_BOUNDARY_ELEMENT_REGEX =
  /<browser-response-stream-boundary.+?<\/browser-response-stream-boundary>/gim;

const PLACEHOLDER_ELEMENT_REGEX =
  /<browser-response-placeholder-(?<name>[\w-]+)/gim;

const CONTENT_TYPE_HEADER = 'Content-Type';
const CONTENT_TYPE_DEFAULT_VALUE = 'text/html; charset=utf-8';
const CONTENT_TYPE_OPTIONS_HEADER = 'X-Content-Type-Options';
const CONTENT_TYPE_OPTIONS_DEFAULT_VALUE = 'nosniff';

export interface HTMLProps extends JSX.HTMLAttributes<HTMLHtmlElement> {
  head?: VNode<any>;
  body?: VNode<any>;
}

export function HTML({
  head,
  body,
  children,
  ...rest
}: RenderableProps<HTMLProps>) {
  const browserResponse = useBrowserResponse();

  return (
    <html {...browserResponse.htmlAttributes.value} {...rest}>
      {head ?? <HTMLHead />}
      {body ?? <HTMLBody>{children}</HTMLBody>}
    </html>
  );
}

export interface HTMLHeadProps {}

export function HTMLHead(_: HTMLHeadProps) {
  const browserResponse = useBrowserResponse();

  return (
    <head>
      <Title>{browserResponse.title.value}</Title>
      {browserResponse.links.value.map((link) => (
        <Link {...link} />
      ))}
      {browserResponse.metas.value.map((meta) => (
        <Meta {...meta} />
      ))}
    </head>
  );
}

const DEFAULT_APP_ID = 'app';

export interface HTMLBodyProps extends JSX.HTMLAttributes<HTMLBodyElement> {
  app?: {id: string};
}

export function HTMLBody({
  children,
  app,
  ...rest
}: RenderableProps<HTMLBodyProps>) {
  const browserResponse = useBrowserResponse();

  const content = children ?? (
    <>
      <ResponsePlaceholderSerializations />
      <ResponsePlaceholderEntryAssets />

      <div id={app?.id ?? DEFAULT_APP_ID}>
        <ResponsePlaceholderApp />
      </div>

      <ResponsePlaceholderAsyncAssets />
    </>
  );

  return (
    <body {...browserResponse.bodyAttributes.value} {...rest}>
      {content}
    </body>
  );
}

type RenderAppValue =
  | string
  | VNode<any>
  | (() => string | VNode<any> | Promise<string | VNode<any>>);

async function renderToHTMLResponse(
  html: string | VNode<any>,
  {
    assets,
    request,
    headers,
    serializations,
    app: renderApp,
    stream: shouldStream = true,
  }: {
    assets: InstanceType<typeof BrowserAssets>;
    request: Request;
    serializations?: Iterable<[string, unknown]>;
    headers?: HeadersInit;
    app?: RenderAppValue;
    stream?: boolean;
  },
) {
  const resolvedHeaders = new Headers(headers);
  if (!resolvedHeaders.has(CONTENT_TYPE_HEADER)) {
    resolvedHeaders.set(CONTENT_TYPE_HEADER, CONTENT_TYPE_DEFAULT_VALUE);
  }

  if (!resolvedHeaders.has(CONTENT_TYPE_OPTIONS_HEADER)) {
    resolvedHeaders.set(
      CONTENT_TYPE_OPTIONS_HEADER,
      CONTENT_TYPE_OPTIONS_DEFAULT_VALUE,
    );
  }

  const browser = new BrowserResponse({
    request,
    serializations,
    headers: resolvedHeaders,
  });

  const entryAssets = assets.entry({request: browser.request});

  resolvedHeaders.append(
    'Link',
    [
      ...entryAssets.styles.map((style) =>
        preloadHeader(styleAssetPreloadAttributes(style)),
      ),
      ...entryAssets.scripts.map((script) =>
        preloadHeader(scriptAssetPreloadAttributes(script)),
      ),
    ].join(', '),
  );

  let appContent: string | undefined =
    renderApp == null || shouldStream
      ? undefined
      : await renderAppToString(renderApp, {browser, assets});

  const {firstChunk, remainingChunks} = await renderHTMLTemplateToChunks(html, {
    browser,
    assets,
  });

  const renderChunkOptions = {
    browser,
    assets,
    app: async () => {
      appContent ??= await renderAppToString(renderApp!, {browser, assets});
      return appContent;
    },
  };

  const normalizedFirstChunk = shouldStream
    ? firstChunk
    : `${firstChunk}${remainingChunks.join('')}`;

  const renderedFirstChunk = await renderHTMLChunk(
    normalizedFirstChunk,
    renderChunkOptions,
  );

  if (remainingChunks.length === 0 || !shouldStream) {
    return new EnhancedResponse(renderedFirstChunk, {
      status: browser.status.value,
      headers: browser.headers,
    });
  }

  const stream = new TextEncoderStream();
  const writer = stream.writable.getWriter();
  writer.write(renderedFirstChunk);

  (async () => {
    try {
      for (const chunk of remainingChunks) {
        const renderedChunk = await renderHTMLChunk(chunk, renderChunkOptions);
        writer.write(renderedChunk);
      }
    } catch {
      // TODO: handle error
    } finally {
      writer.close();
    }
  })();

  return new EnhancedResponse(stream.readable, {
    status: browser.status.value,
    headers: browser.headers,
  });
}

export async function renderToHTMLString(
  html: string | VNode<any>,
  {
    assets,
    request,
    headers,
    app,
  }: {
    assets: InstanceType<typeof BrowserAssets>;
    request: Request;
    headers?: HeadersInit;
    app?: RenderAppValue;
  },
) {
  const browser = new BrowserResponse({
    request,
    headers: headers ? new Headers(headers) : undefined,
  });

  const appContent = app
    ? await renderAppToString(app, {browser, assets})
    : undefined;

  const {firstChunk, remainingChunks} = await renderHTMLTemplateToChunks(html, {
    assets,
    browser,
  });

  const fullContent = `${firstChunk}${remainingChunks.join('')}`;

  const rendered = await renderHTMLChunk(fullContent, {
    browser,
    assets,
    app: appContent,
  });

  return rendered;
}

export async function renderHTMLTemplate(
  html: VNode<any>,
  {
    browser,
    assets,
  }: {
    browser?: BrowserResponse;
    assets?: InstanceType<typeof BrowserAssets>;
  } = {},
) {
  const rendered = await renderToStringAsync(
    <BrowserEffectsAreActiveContext.Provider value={false}>
      <ServerContext assets={assets} browser={browser}>
        {html}
      </ServerContext>
    </BrowserEffectsAreActiveContext.Provider>,
  );

  return normalizeHTMLContent(rendered);
}

async function renderHTMLTemplateToChunks(
  html: string | VNode<any>,
  {
    browser,
    assets,
  }: {
    browser?: BrowserResponse;
    assets?: InstanceType<typeof BrowserAssets>;
  } = {},
) {
  let template =
    typeof html === 'string'
      ? html
      : await renderHTMLTemplate(html, {browser, assets});

  template = normalizeHTMLContent(template);

  const [firstChunk = '', ...remainingChunks] = template.split(
    STREAM_BOUNDARY_ELEMENT_REGEX,
  );

  return {firstChunk, remainingChunks};
}

async function renderHTMLChunk(
  content: string,
  {
    browser,
    assets,
    app: renderApp,
  }: {
    browser: BrowserResponse;
    assets?: InstanceType<typeof BrowserAssets>;
    app?: string | (() => Promise<string>);
  },
) {
  let result = content;
  let match: RegExpExecArray | null;

  const placeholderRegex = new RegExp(PLACEHOLDER_ELEMENT_REGEX, 'mig');

  while ((match = placeholderRegex.exec(result)) != null) {
    if (match.groups && 'name' in match.groups) {
      const {name} = match.groups;
      const startIndex = match.index;
      const closingTag = `</browser-response-placeholder-${name}>`;
      const closingTagIndex = result.indexOf(closingTag, startIndex);

      if (closingTagIndex === -1) continue;

      let replacement = '';

      switch (name) {
        case 'app': {
          if (renderApp == null) {
            throw new Error(
              `Found the app placeholder, but no app element was provided while rendering`,
            );
          }

          replacement =
            typeof renderApp === 'string' ? renderApp : await renderApp();

          break;
        }
        case 'serializations': {
          const serializations = [...browser.serializations];

          replacement =
            serializations.length > 0
              ? renderToString(
                  <BrowserEffectsAreActiveContext.Provider value={false}>
                    {serializations.map(([name, content]) => (
                      <Serialization name={name} content={content} />
                    ))}
                  </BrowserEffectsAreActiveContext.Provider>,
                )
              : '';

          break;
        }
        case 'entry-assets': {
          if (assets == null) {
            throw new Error(
              `Found the async-assets placeholder, but no assets were provided while rendering`,
            );
          }

          const asyncAssets = assets.entry({request: browser.request});

          replacement = renderToString(<ServerAssetTags entry={asyncAssets} />);

          break;
        }
        case 'async-assets': {
          if (assets == null) {
            throw new Error(
              `Found the async-assets placeholder, but no assets were provided while rendering`,
            );
          }

          const asyncAssets = assets.modules(
            browser.assets.get({timing: 'load'}),
            {request: browser.request},
          );

          replacement = renderToString(<ServerAssetTags entry={asyncAssets} />);

          break;
        }
        // Add more cases for other placeholder types if needed
        default: {
          throw new Error(
            `Unknown placeholder element: <browser-response-placeholder-${name}>`,
          );
        }
      }

      placeholderRegex.lastIndex = startIndex;
      result =
        result.slice(0, startIndex) +
        replacement +
        result.slice(closingTagIndex + closingTag.length);
    }
  }

  return result;
}

async function renderAppToString(
  renderApp: RenderAppValue,
  {
    browser,
    assets,
  }: {browser: BrowserResponse; assets: InstanceType<typeof BrowserAssets>},
) {
  if (typeof renderApp === 'string') return renderApp;

  const renderResult =
    typeof renderApp === 'function' ? await renderApp() : renderApp!;

  if (typeof renderResult === 'string') {
    return renderResult;
  } else {
    return await renderToStringAsync(
      <ServerContext assets={assets} browser={browser}>
        {renderResult}
      </ServerContext>,
    );
  }
}

function normalizeHTMLContent(content: string) {
  return content.startsWith('<!DOCTYPE ')
    ? content
    : `<!DOCTYPE html>${content}`;
}

function ResponseStreamBoundary() {
  // @ts-expect-error Just used as a placeholder
  return <browser-response-stream-boundary />;
}

function ResponsePlaceholderApp() {
  // @ts-expect-error Just used as a placeholder
  return <browser-response-placeholder-app />;
}

function ResponsePlaceholderEntryAssets() {
  // @ts-expect-error Just used as a placeholder
  return <browser-response-placeholder-entry-assets />;
}

function ResponsePlaceholderSerializations() {
  // @ts-expect-error Just used as a placeholder
  return <browser-response-placeholder-serializations />;
}

function ResponsePlaceholderAsyncAssets() {
  // @ts-expect-error Just used as a placeholder
  return <browser-response-placeholder-async-assets />;
}

// TODO: handle crossorigin
function ServerAssetTags({entry}: {entry: BrowserAssetsEntry}) {
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

function preloadHeader(attributes: Partial<HTMLLinkElement>) {
  const {
    as,
    rel = 'preload',
    href,
    crossOrigin,
    crossorigin,
  } = attributes as any;

  // Support both property and attribute versions of the casing
  const finalCrossOrigin = crossOrigin ?? crossorigin;

  let header = `<${href}>; rel="${rel}"; as="${as}"`;

  if (finalCrossOrigin === '' || finalCrossOrigin === true) {
    header += `; crossorigin`;
  } else if (typeof finalCrossOrigin === 'string') {
    header += `; crossorigin="${finalCrossOrigin}"`;
  }

  return header;
}

export default router;
