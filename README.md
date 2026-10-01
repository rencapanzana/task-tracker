# Task Tracker

Single-page task + client tracker. Static HTML on GitHub Pages, data in Supabase.

## Setup
1. Create a Supabase project. In **SQL Editor**, run `schema.sql`, then (optionally) `seed.sql` to import the old Notion data.
2. **Authentication > Sign In / Providers**: turn off "Allow new users to sign up". **Authentication > Users > Add user**: create your login.
3. **Project Settings > API**: copy the Project URL and anon key into the two constants at the top of the `<script>` in `index.html`. (The anon key is safe to publish; RLS only lets signed-in users through.)
4. Push. GitHub Pages serves `index.html` from `main`.

Upgrading supabase-js: change the version in `index.html` and regenerate the `integrity` hash:
`curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`

Local: open `index.html` directly, or `npx serve .`.
