import { z } from "zod/v4";

export enum AutoTopUpStatus {
	Pending = "pending",
	Completed = "completed",
	Failed = "failed",
}

export const AutoTopUpHistorySchema = z.object({
	id: z.string(),
	customer_entitlement_id: z.string(),
	customer_product_id: z.string(),
	triggered_at: z.number(),

	credits_added: z.number(),
	balance_before: z.number(),
	balance_after: z.number(),

	amount_charged: z.number(),
	currency: z.string(),
	invoice_id: z.string().nullable(),
	stripe_invoice_id: z.string().nullable(),

	threshold_at_trigger: z.number(),
	topup_amount_config: z.number(),

	status: z.nativeEnum(AutoTopUpStatus),
	error_message: z.string().nullable(),
});

export type AutoTopUpHistory = z.infer<typeof AutoTopUpHistorySchema>;
