/**
 * Migration script: Creates the categories table and seeds initial data.
 *
 * Usage:  npx tsx src/db/migrate-categories.ts
 */
import { queryClient } from './client.js';

const INITIAL_CATEGORIES = [
  { name: 'Chicken', slug: 'chicken', sort_order: 0 },
  { name: 'Mutton & Goat', slug: 'mutton', sort_order: 1 },
  { name: 'Seafood', slug: 'seafood', sort_order: 2 },
  { name: 'Farm Fresh Eggs', slug: 'eggs', sort_order: 3 },
  { name: 'Ready to Cook', slug: 'ready_to_cook', sort_order: 4 },
  { name: 'Marinades', slug: 'marinades', sort_order: 5 },
];

async function migrate() {
  console.log('Creating categories table...');

  await queryClient`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await queryClient`
    CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_slug_idx
    ON categories (tenant_id, slug)
  `;

  console.log('Categories table created.');

  // Get tenant id
  const tenants = await queryClient`SELECT id FROM tenants LIMIT 1`;
  if (tenants.length === 0) {
    console.log('No tenant found — skipping seed.');
    await queryClient.end();
    return;
  }

  const tenantId = tenants[0].id;
  console.log(`Seeding categories for tenant ${tenantId}...`);

  for (const cat of INITIAL_CATEGORIES) {
    await queryClient`
      INSERT INTO categories (tenant_id, name, slug, sort_order)
      VALUES (${tenantId}, ${cat.name}, ${cat.slug}, ${cat.sort_order})
      ON CONFLICT (tenant_id, slug) DO NOTHING
    `;
  }

  console.log('Seed complete.');
  await queryClient.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
