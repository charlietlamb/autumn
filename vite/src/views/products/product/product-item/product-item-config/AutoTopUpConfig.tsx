import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FeaturePrice from "./components/feature-price/FeaturePrice";

export const AutoTopUpConfig = () => {
	return (
		<div className="flex flex-col gap-4">
			<div className="transition-all duration-300 ease-in-out whitespace-nowrap">
				<div className="flex gap-6 flex-2">
					<FeaturePrice />
				</div>
			</div>
			<Alert className="bg-blue-50 border-blue-200 text-blue-800 rounded-sm shadow-sm">
				<Info className="text-blue-600" />
				<AlertDescription>
					The user will configure the threshold and amount to top up on their
					end.
				</AlertDescription>
			</Alert>
		</div>
	);
};
