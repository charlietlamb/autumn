import { relations } from "drizzle-orm";
import { customerProducts } from "../../cusProductTable.js";
import { customerEntitlements } from "../cusEntTable.js";
import { autoTopupHistory } from "./autoTopUpHistoryTable.js";

export const autoTopupHistoryRelations = relations(
	autoTopupHistory,
	({ one }) => ({
		customer_entitlement: one(customerEntitlements, {
			fields: [autoTopupHistory.customer_entitlement_id],
			references: [customerEntitlements.id],
		}),
		customer_product: one(customerProducts, {
			fields: [autoTopupHistory.customer_product_id],
			references: [customerProducts.id],
		}),
	}),
);
