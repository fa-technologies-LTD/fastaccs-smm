declare module 'paystack-node' {
	interface InitializeTransactionParams {
		email: string;
		amount: number;
		reference?: string;
		callback_url?: string;
		metadata?: Record<string, unknown>;
		channels?: string[];
	}

	interface InitializeTransactionResponse {
		status: boolean;
		message: string;
		data?: {
			authorization_url: string;
			access_code: string;
			reference: string;
		};
	}

	interface VerifyTransactionResponse {
		status: boolean;
		message: string;
		data?: {
			reference: string;
			amount: number;
			currency: string;
			status: string;
			paid_at: string | null;
			channel: string;
			metadata?: Record<string, unknown>;
		};
	}

	class Transaction {
		initialize(params: InitializeTransactionParams): Promise<InitializeTransactionResponse>;
		verify(reference: string): Promise<VerifyTransactionResponse>;
	}

	class Paystack {
		constructor(secretKey: string);
		transaction: Transaction;
	}

	export = Paystack;
}
