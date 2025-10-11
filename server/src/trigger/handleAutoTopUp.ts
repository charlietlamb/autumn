import {
	type AppEnv,
	autoTopupHistory,
	type Customer,
	type Feature,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getAmountForQuantity,
	type Organization,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
	getFeatureBalance,
	getRelatedCusPrice,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { generateId } from "@/utils/genUtils.js";

export const handleAutoTopUp = async ({
	cusEnt,
	cusEnts,
	cusProduct,
	cusPrices,
	customer,
	org,
	env,
	db,
	logger,
	feature,
}: {
	cusEnt: FullCustomerEntitlement;
	cusEnts: FullCustomerEntitlement[];
	cusProduct: FullCusProduct;
	cusPrices: FullCustomerPrice[];
	customer: Customer;
	org: Organization;
	env: AppEnv;
	db: DrizzleCli;
	logger: any; //seems we use any to type logger across the codebase
	feature: Feature;
}) => {
	if (!cusEnt.auto_topup_config?.enabled) {
		return;
	}

	const cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
	if (!cusPrice) {
		logger.warn("No related price found for auto top-up");
		return;
	}

	const autoTopUpConfig = cusEnt.auto_topup_config;
	const threshold: number = autoTopUpConfig.threshold;

	// use getFeatureBalance to get the current balance for the feature not just the cusEnt
	const currentBalance: number =
		getFeatureBalance({
			cusEnts,
			internalFeatureId: feature.internal_id!,
		}) ?? 0;

	if (currentBalance >= threshold) {
		return;
	}

	const topupAmount: number = autoTopUpConfig.topup_amount;
	const balanceBefore: number = cusEnt.balance ?? 0;
	const now: number = Date.now();

	const stripeCli = createStripeCli({ org, env });
	let invoiceId: string | null = null;

	try {
		const paymentMethod = await getCusPaymentMethod({
			stripeCli,
			stripeId: customer.processor?.id,
			errorIfNone: false,
		});

		if (!paymentMethod) {
			throw new Error("No payment method found for customer");
		}

		const chargeAmount: number = getAmountForQuantity({
			price: cusPrice.price,
			quantity: topupAmount,
		});

		const invoice = await stripeCli.invoices.create({
			customer: customer.processor?.id!,
			auto_advance: false,
			subscription: cusProduct.processor?.subscription_id || undefined,
			description: `Auto top-up: ${topupAmount} credits for ${cusEnt.feature_id}`,
		});

		if (!invoice.id) {
			throw new Error("Invoice creation failed - no invoice ID returned");
		}

		invoiceId = invoice.id;

		await stripeCli.invoiceItems.create({
			invoice: invoice.id,
			customer: customer.processor?.id!,
			amount: Math.round(chargeAmount * 100), // Convert to cents
			description: `Auto top-up: ${topupAmount} credits`,
			currency: org.default_currency || "usd",
		});

		const finalizedInvoice = await stripeCli.invoices.finalizeInvoice(
			invoice.id,
			{
				auto_advance: false,
			},
		);

		if (!finalizedInvoice.id) {
			throw new Error("Invoice finalization failed - no invoice ID returned");
		}

		const { paid, error } = await payForInvoice({
			stripeCli,
			invoiceId: finalizedInvoice.id,
			paymentMethod,
			logger,
			errorOnFail: false,
			voidIfFailed: false, // We handle voiding ourselves
		});

		if (!paid || error) {
			throw new Error(error?.message || "Payment failed for unknown reason");
		}

		const newBalance: number = new Decimal(cusEnt.balance ?? 0)
			.plus(topupAmount)
			.toNumber();

		await InvoiceService.createInvoiceFromStripe({
			db,
			stripeInvoice: finalizedInvoice,
			internalCustomerId: customer.internal_id,
			internalEntityId: cusProduct.internal_entity_id || null,
			productIds: [cusProduct.product_id],
			internalProductIds: [cusProduct.internal_product_id],
			org,
			sendRevenueEvent: false, // Auto top-up is not new revenue
		});

		const autumnInvoice = await InvoiceService.getByStripeId({
			db,
			stripeId: finalizedInvoice.id,
		});

		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				balance: newBalance,
				auto_topup_config: {
					...autoTopUpConfig,
					last_topup_at: now,
				},
			},
		});

		await db.insert(autoTopupHistory).values({
			id: generateId("auto_topup"),
			customer_entitlement_id: cusEnt.id,
			customer_product_id: cusProduct.id,
			triggered_at: now,
			credits_added: topupAmount,
			balance_before: balanceBefore,
			balance_after: newBalance,
			amount_charged: chargeAmount,
			currency: org.default_currency || "usd",
			invoice_id: autumnInvoice?.id || null,
			stripe_invoice_id: finalizedInvoice.id,
			threshold_at_trigger: threshold,
			topup_amount_config: topupAmount,
			status: "completed",
			error_message: null,
		});

		console.log(
			`Auto top-up successful: Added ${topupAmount} credits, new balance: ${newBalance}`,
		);

		// update in-memory cusEnt for subsequent processing
		cusEnt.balance = newBalance;
		cusEnt.auto_topup_config = {
			...autoTopUpConfig,
			last_topup_at: now,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		logger.error(`Auto top-up failed: ${errorMessage}`);

		// Void the invoice if we created one
		if (invoiceId) {
			try {
				await stripeCli.invoices.voidInvoice(invoiceId);
				logger.info(`Voided failed auto top-up invoice: ${invoiceId}`);
			} catch (voidError) {
				logger.error(`Failed to void invoice ${invoiceId}:`, voidError);
			}
		}

		// Create failure history record
		try {
			const chargeAmount = getAmountForQuantity({
				price: cusPrice.price,
				quantity: topupAmount,
			});

			await db.insert(autoTopupHistory).values({
				id: generateId("auto_topup"),
				customer_entitlement_id: cusEnt.id,
				customer_product_id: cusProduct.id,
				triggered_at: now,
				credits_added: 0,
				balance_before: balanceBefore,
				balance_after: balanceBefore,
				amount_charged: chargeAmount,
				currency: org.default_currency || "usd",
				invoice_id: null,
				stripe_invoice_id: invoiceId,
				threshold_at_trigger: threshold,
				topup_amount_config: topupAmount,
				status: "failed",
				error_message: errorMessage,
			});
		} catch (historyError) {
			logger.error(
				"Failed to create auto top-up history record:",
				historyError,
			);
		}
	}
};
