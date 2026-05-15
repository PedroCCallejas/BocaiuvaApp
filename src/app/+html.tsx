import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const APP_NAME = 'Bocaiuva APP';
const APP_DESCRIPTION =
  'Aplicativo para organizar times de futebol amador, jogos, presenca, escalacao e estatisticas.';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="application-name" content={APP_NAME} />
        <meta name="description" content={APP_DESCRIPTION} />
        <meta name="theme-color" content="#051108" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                color-scheme: dark;
                background: #051108;
              }

              * {
                box-sizing: border-box;
                -webkit-tap-highlight-color: transparent;
              }

              html,
              body {
                margin: 0;
                padding: 0;
                min-height: 100%;
                background: #051108;
                overscroll-behavior-y: none;
              }

              body {
                min-height: 100vh;
                min-height: 100dvh;
              }

              #root {
                display: flex;
                min-height: 100vh;
                min-height: 100dvh;
              }

              input,
              textarea,
              select {
                font-size: 16px;
              }

              a {
                color: inherit;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
