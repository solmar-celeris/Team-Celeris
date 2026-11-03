declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;
  export const createClient: typeof import('@supabase/supabase-js').createClient;
}
