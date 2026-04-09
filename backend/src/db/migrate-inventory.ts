import { sql } from 'drizzle-orm';
import { db } from './client.js';

async function migrateInventory() {
  console.log('Running inventory migration...');

  // Add stock_quantity column if not exists
  await db.execute(sql`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0
  `);
  console.log('  Added stock_quantity column');

  // Add low_stock_threshold column if not exists
  await db.execute(sql`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 10
  `);
  console.log('  Added low_stock_threshold column');

  // Seed random stock levels (5–54) for all products
  await db.execute(sql`
    UPDATE products SET stock_quantity = floor(random() * 50 + 5)::int
    WHERE stock_quantity = 0
  `);
  console.log('  Seeded random stock levels');

  // Set a few products to out-of-stock (first 2 products by sort order)
  await db.execute(sql`
    UPDATE products SET stock_quantity = 0, in_stock = false
    WHERE id IN (
      SELECT id FROM products ORDER BY sort_order ASC LIMIT 2
    )
  `);
  console.log('  Set 2 products to out-of-stock');

  // Set a few products to low stock (below threshold, next 3 products)
  await db.execute(sql`
    UPDATE products SET stock_quantity = floor(random() * 5 + 2)::int
    WHERE id IN (
      SELECT id FROM products ORDER BY sort_order ASC OFFSET 2 LIMIT 3
    )
  `);
  console.log('  Set 3 products to low stock');

  console.log('Inventory migration complete!');
  process.exit(0);
}

migrateInventory().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
