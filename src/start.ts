import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { installUiLanguageReader } from '@/adapters/auth/ui-language';
import { setResponseHeader } from '@tanstack/react-start/server';

const privateResponseMiddleware = createMiddleware().server(async ({ next }) => {
  setResponseHeader('Cache-Control', 'private, no-store');
  const result = await next();
  result.response.headers.set('Cache-Control', 'private, no-store');
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  // Explicit initialization survives production tree shaking, unlike a module-only side effect.
  installUiLanguageReader();
  return {
    functionMiddleware: [attachSupabaseAuth],
    requestMiddleware: [privateResponseMiddleware, errorMiddleware, csrfMiddleware],
  };
});
