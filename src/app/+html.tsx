import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

import {
  APP_BACKGROUND_COLOR,
  APP_NAME,
  APP_SEO_DESCRIPTION,
  APP_SEO_KEYWORDS,
  APP_SEO_TITLE,
  APP_THEME_COLOR,
} from '@/constants/branding';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <title>{APP_SEO_TITLE}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="application-name" content={APP_NAME} />
        <meta name="description" content={APP_SEO_DESCRIPTION} />
        <meta name="keywords" content={APP_SEO_KEYWORDS} />
        <meta
          name="google-adsense-account"
          content="ca-pub-1836203364600133"
        />
        <meta name="google-site-verification" content="iqs1LjYqRCmgOtKD5H7lJcWmQYE1woickTauhjOMsBs" />
        <meta name="theme-color" content={APP_THEME_COLOR} />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={APP_SEO_TITLE} />
        <meta property="og:description" content={APP_SEO_DESCRIPTION} />
        <meta property="og:site_name" content={APP_NAME} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={APP_SEO_TITLE} />
        <meta name="twitter:description" content={APP_SEO_DESCRIPTION} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                color-scheme: dark;
                background: ${APP_BACKGROUND_COLOR};
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
                background: ${APP_BACKGROUND_COLOR};
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

              ins.adsbygoogle[data-ad-status="unfilled"] {
                display: none !important;
              }

              [data-appboca-ad-wrapper="true"][data-ad-visibility="hidden"] {
                display: none !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
