import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isUiLang, setLanguage } from './core/i18n';
import { loadUiCatalog } from './core/i18n/keyed';

export const getRouter = async () => {
  // Bootstrap before hydration, never a render-time browser read.
  if (typeof document !== 'undefined') {
    const initial = document.documentElement.lang;
    if (isUiLang(initial)) { await loadUiCatalog(initial); setLanguage(initial); }
  }
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
