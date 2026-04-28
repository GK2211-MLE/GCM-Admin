import type { FastifyInstance } from 'fastify';
import { eq, ne, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  orders,
  orderItems,
  carts,
  cartItems,
  wishlistItems,
  productReviews,
  notifications,
  pushSubscriptions,
  savedAddresses,
  passwordResets,
  newsletterSubs,
  contactMessages,
  purchaseOrders,
  purchaseOrderItems,
  conversationStates,
  promotions,
  auditLog,
  productLocations,
  storeInventory,
  products,
  customers,
  appUsers,
  adminUsers,
} from '../db/schema.js';
import { adminGuard } from '../middleware/auth.js';
import { getTenantId } from '../middleware/tenant.js';

/* ────────────────────────────────────────────────────────────────
   Factory reset — wipe every transactional / user-data row in the
   tenant while preserving structural rows (locations, categories,
   tenants, vendors, role permissions, CMS pages, recipes) and ONE
   admin login (admin@farm2cook.com).

   Wipes (data only — no DROP / no TRUNCATE schema changes):
     • orders + order_items
     • carts + cart_items
     • wishlist_items
     • product_reviews
     • notifications
     • push_subscriptions
     • saved_addresses
     • password_resets
     • newsletter_subs
     • contact_messages
     • purchase_orders + purchase_order_items
     • conversation_states
     • promotions
     • audit_log
     • product_locations + store_inventory
     • products
     • customers (legacy)
     • app_users (every customer login)
     • admin_users EXCEPT admin@farm2cook.com

   Preserves:
     • tenants
     • locations           ← strict rule, NEVER touch
     • categories          ← updated separately
     • vendors
     • role_permissions
     • cms_pages
     • recipes
     • the primary admin login

   Runs inside a single transaction so it's all-or-nothing. Returns
   per-table delete counts so the caller can verify what happened.
   ──────────────────────────────────────────────────────────────── */

const PRESERVED_ADMIN_EMAIL = 'admin@farm2cook.com';

export async function factoryResetRoutes(app: FastifyInstance) {
  app.post(
    '/factory-reset',
    { preHandler: [adminGuard] },
    async (request, reply) => {
      const tenantId = getTenantId(request);

      // Require an explicit confirmation flag in the body. This is
      // catastrophically destructive — never let a stray click trigger it.
      const body = (request.body ?? {}) as { confirm?: string };
      if (body.confirm !== 'WIPE-ALL-DATA') {
        return reply.code(400).send({
          error: 'Missing confirm token',
          hint: 'POST { "confirm": "WIPE-ALL-DATA" } to proceed',
        });
      }

      const counts = await db.transaction(async (tx) => {
        // Order matters: child tables before parents to avoid FK violations.

        // 1. Tables referencing orders
        const oi = await tx.delete(orderItems).returning({ id: orderItems.id });
        const ord = await tx
          .delete(orders)
          .where(eq(orders.tenantId, tenantId))
          .returning({ id: orders.id });

        // 2. Cart contents → carts
        const ci = await tx.delete(cartItems).returning({ id: cartItems.id });
        // carts has no tenantId column; cascades via app_users delete anyway,
        // but we wipe explicitly here so the order is deterministic.
        const c = await tx.delete(carts).returning({ id: carts.id });

        // 3. Per-customer collections + activity
        const wi = await tx.delete(wishlistItems).returning({ id: wishlistItems.id });
        const pr = await tx.delete(productReviews).returning({ id: productReviews.id });
        const nt = await tx
          .delete(notifications)
          .where(eq(notifications.tenantId, tenantId))
          .returning({ id: notifications.id });
        const ps = await tx
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.tenantId, tenantId))
          .returning({ id: pushSubscriptions.id });
        const sa = await tx.delete(savedAddresses).returning({ id: savedAddresses.id });
        const pwr = await tx.delete(passwordResets).returning({ id: passwordResets.id });

        // 4. Marketing + comms
        const ns = await tx.delete(newsletterSubs).returning({ id: newsletterSubs.id });
        const cm = await tx
          .delete(contactMessages)
          .where(eq(contactMessages.tenantId, tenantId))
          .returning({ id: contactMessages.id });

        // 5. Procurement
        const poi = await tx.delete(purchaseOrderItems).returning({ id: purchaseOrderItems.id });
        const po = await tx
          .delete(purchaseOrders)
          .where(eq(purchaseOrders.tenantId, tenantId))
          .returning({ id: purchaseOrders.id });

        // 6. Bot state + audit + promo codes
        const cs = await tx
          .delete(conversationStates)
          .where(eq(conversationStates.tenantId, tenantId))
          .returning({ id: conversationStates.id });
        const al = await tx
          .delete(auditLog)
          .where(eq(auditLog.tenantId, tenantId))
          .returning({ id: auditLog.id });
        const promo = await tx
          .delete(promotions)
          .where(eq(promotions.tenantId, tenantId))
          .returning({ id: promotions.id });

        // 7. Product join tables, then products themselves
        const pl = await tx.delete(productLocations).returning({ id: productLocations.id });
        const si = await tx.delete(storeInventory).returning({ id: storeInventory.id });
        const prod = await tx
          .delete(products)
          .where(eq(products.tenantId, tenantId))
          .returning({ id: products.id });

        // 8. Customers and customer accounts
        const cust = await tx
          .delete(customers)
          .where(eq(customers.tenantId, tenantId))
          .returning({ id: customers.id });
        const au = await tx
          .delete(appUsers)
          .where(eq(appUsers.tenantId, tenantId))
          .returning({ id: appUsers.id });

        // 9. Admin staff EXCEPT the primary admin login
        const stm = await tx
          .delete(adminUsers)
          .where(and(
            eq(adminUsers.tenantId, tenantId),
            ne(adminUsers.email, PRESERVED_ADMIN_EMAIL),
          ))
          .returning({ id: adminUsers.id });

        return {
          orderItems: oi.length,
          orders: ord.length,
          cartItems: ci.length,
          carts: c.length,
          wishlistItems: wi.length,
          productReviews: pr.length,
          notifications: nt.length,
          pushSubscriptions: ps.length,
          savedAddresses: sa.length,
          passwordResets: pwr.length,
          newsletterSubs: ns.length,
          contactMessages: cm.length,
          purchaseOrderItems: poi.length,
          purchaseOrders: po.length,
          conversationStates: cs.length,
          auditLog: al.length,
          promotions: promo.length,
          productLocations: pl.length,
          storeInventory: si.length,
          products: prod.length,
          customers: cust.length,
          appUsers: au.length,
          adminUsersRemoved: stm.length,
        };
      });

      return {
        success: true,
        preservedAdmin: PRESERVED_ADMIN_EMAIL,
        deleted: counts,
      };
    },
  );
}
