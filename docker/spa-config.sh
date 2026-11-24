#!/bin/sh
# Generates the SPA's runtime configuration from environment variables.
set -eu

: "${API_URL:?API_URL is required, e.g. https://example.com/api}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${SITE_URL:?SITE_URL is required, e.g. https://example.com}"
: "${STUDENT_URL:?STUDENT_URL is required, e.g. https://student.example.com}"

cat > /usr/share/nginx/html/config.json <<JSON
{
  "apiUrl": "${API_URL}",
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}",
  "siteUrl": "${SITE_URL}",
  "studentUrl": "${STUDENT_URL}"
}
JSON
echo "spa-config: wrote config.json for ${API_URL}"
