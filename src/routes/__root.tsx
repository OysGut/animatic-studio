import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useTrackNavigation } from "@/app/shell/back-navigation";
import { LanguageRoot, LANGUAGE_BOOT_SCRIPT, LANGUAGE_PENDING_CLASS, bootUiLanguage, useLanguage } from "@/app/i18n/language";
import { getUiLanguage, onLanguageChange } from "@/core";

import { ErrorDetails } from "@/app/shell/ErrorDetails";
import { ExportQueueStatus } from "@/app/assembly/ExportQueueStatus";
import { t } from "@/core/i18n/keyed";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("routes-root.not-found-component.h2.cc99159dc152")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("routes-root.not-found-component.p.1e497abdd8f7")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("routes-root.not-found-component.link.40ee8c9ed320")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  // ML3: feilsiden kan vises før språket er satt ved første tegning; språket leses derfor synkront.
  const lang = useSyncExternalStore(onLanguageChange, bootUiLanguage, getUiLanguage);
  useEffect(() => {
    const d = document.documentElement;
    d.lang = lang;
    d.classList.remove(LANGUAGE_PENDING_CLASS);
  }, [lang]);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div data-testid="root-error" lang={lang} className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("routes-root.error-component.h1.e30fba673653", {}, lang)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("routes-root.error-component.p.8ff66fea3622", {}, lang)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("routes-root.error-component.button.96f923db4f99", {}, lang)}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("routes-root.error-component.a.6fdb78437197", {}, lang)}
          </a>
        </div>
        <ErrorDetails error={error} language={lang} />
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Animatic Studio" },
      { name: "description", content: "Animatic Studio" },
      { property: "og:title", content: "Animatic Studio" }, // i18n-ignore: metakode
      { property: "og:description", content: "Animatic Studio" }, // i18n-ignore: metakode
      { property: "og:type", content: "website" }, // i18n-ignore: metakode
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="nb" suppressHydrationWarning>
      <head>
        {/* ML2a: skjuler siden til lagret språk er satt, så første tegning ikke lekker norsk */}
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // «Tilbake til …» i toppstripen husker flatene brukeren har vært på (DEC-0063)
  useTrackNavigation();
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <LanguageRoot>
        <Outlet />
        <ExportQueueStatus />
      </LanguageRoot>
    </QueryClientProvider>
  );
}
