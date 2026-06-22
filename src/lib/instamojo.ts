const API_URL = process.env.INSTAMOJO_API_URL || "https://test.instamojo.com/v2";
const CLIENT_ID = process.env.INSTAMOJO_CLIENT_ID!;
const CLIENT_SECRET = process.env.INSTAMOJO_CLIENT_SECRET!;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch(`${API_URL}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) throw new Error("Failed to get Instamojo access token");
  const data = await res.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

export async function createPaymentRequest(params: {
  amount: number;
  purpose: string;
  buyerName: string;
  email: string;
  redirectUrl: string;
  webhookUrl: string;
}): Promise<{ paymentRequestId: string; longUrl: string }> {
  const token = await getAccessToken();

  const res = await fetch(`${API_URL}/payment_requests/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      amount: params.amount.toString(),
      purpose: params.purpose,
      buyer_name: params.buyerName,
      email: params.email,
      redirect_url: params.redirectUrl,
      webhook: params.webhookUrl,
      allow_repeated_payments: "false",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("Instamojo create payment error:", error);
    throw new Error("Failed to create payment request");
  }

  const data = await res.json();
  return {
    paymentRequestId: data.id,
    longUrl: data.longurl,
  };
}

export async function getPaymentStatus(paymentRequestId: string): Promise<{
  status: string;
  payments: Array<{ payment_id: string; status: string }>;
}> {
  const token = await getAccessToken();

  const res = await fetch(`${API_URL}/payment_requests/${paymentRequestId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Failed to get payment status");
  return res.json();
}
