import {
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	varchar,
} from "drizzle-orm/pg-core";
import { customerProducts } from "../../cusProductTable.js";
import { customerEntitlements } from "../cusEntTable.js";

export const autoTopupHistory = pgTable(
	"auto_topup_history",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		customer_entitlement_id: varchar("customer_entitlement_id", {
			length: 255,
		}).notNull(),
		customer_product_id: varchar("customer_product_id", {
			length: 255,
		}).notNull(),
		triggered_at: integer("triggered_at").notNull(),

		credits_added: numeric({ mode: "number" }).notNull(),
		balance_before: numeric({ mode: "number" }).notNull(),
		balance_after: numeric({ mode: "number" }).notNull(),

		amount_charged: numeric({ mode: "number" }).notNull(),
		currency: varchar("currency", { length: 10 }).notNull(),
		invoice_id: varchar("invoice_id", { length: 255 }),
		stripe_invoice_id: varchar("stripe_invoice_id", { length: 255 }),

		threshold_at_trigger: numeric({ mode: "number" }).notNull(),
		topup_amount_config: numeric({ mode: "number" }).notNull(),

		status: varchar("status", { length: 50 }).notNull(),
		error_message: text("error_message"),
	},
	(table) => [
		foreignKey({
			columns: [table.customer_entitlement_id],
			foreignColumns: [customerEntitlements.id],
			name: "auto_topup_history_customer_entitlement_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.customer_product_id],
			foreignColumns: [customerProducts.id],
			name: "auto_topup_history_customer_product_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		index("idx_auto_topup_history_entitlement_id").on(
			table.customer_entitlement_id,
		),
		index("idx_auto_topup_history_product_id").on(table.customer_product_id),
		index("idx_auto_topup_history_triggered_at").on(table.triggered_at),
	],
);
