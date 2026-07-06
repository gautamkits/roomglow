import { NextResponse } from "next/server";
import { sendContactMessage } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(request: Request) {
  let body: {
    name?: string;
    email?: string;
    message?: string;
    website?: string; // honeypot — must stay empty
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: bots fill hidden fields. Pretend success so they don't retry.
  if (body.website && body.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Please fill in all fields." }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (name.length > 100 || email.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  }

  // Rate limit: 3 messages per IP per 10 minutes.
  const ip = clientIp(request);
  if (!rateLimit(`contact:ip:${ip}`, 3, 10 * 60 * 1000).ok) {
    return NextResponse.json(
      { error: "You've sent a few messages already — please try again later." },
      { status: 429 }
    );
  }

  const { ok } = await sendContactMessage({ name, email, message });
  if (!ok) {
    return NextResponse.json(
      { error: "Couldn't send right now. Please try again shortly." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
