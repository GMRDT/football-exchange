import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/',
      '.next/',
      'public/sw.js',
      'next-env.d.ts',
      // Deno entrypoints (Deno.serve, npm: resolution); _shared stays linted.
      'supabase/functions/ingest/',
      'supabase/functions/tick/',
    ],
  },
]

export default config
