import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { createHash } from "crypto";
import {
  createUser,
  findUserByGoogleId,
  consumeMagicToken,
  upsertUserByEmail,
} from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Passwordless email link. The /auth/verify page calls signIn("email-link",
    // { token }); we validate + single-use consume the token here and resolve
    // the user by email. Works inside the Instagram in-app browser, where Google
    // OAuth is blocked.
    Credentials({
      id: "email-link",
      name: "Email link",
      credentials: { token: {} },
      async authorize(credentials) {
        const token =
          typeof credentials?.token === "string" ? credentials.token : "";
        if (!token) return null;
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const email = await consumeMagicToken(tokenHash);
        if (!email) return null;
        const fallbackName = email.split("@")[0];
        const dbUser = await upsertUserByEmail(email, fallbackName);
        if (!dbUser) return null;
        return {
          id: String(dbUser.id),
          email: dbUser.email,
          name: dbUser.name || fallbackName,
          image: dbUser.avatar_url || null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        await createUser(
          account.providerAccountId,
          user.email || "",
          user.name || "",
          user.image || ""
        );
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "google" && account.providerAccountId) {
        const dbUser = await findUserByGoogleId(account.providerAccountId);
        if (dbUser) {
          token.userId = dbUser.id;
          token.googleId = account.providerAccountId;
        }
      }
      // Magic-link (Credentials): authorize()'s return arrives as `user` on the
      // first jwt call. Carry its db id onto the token.
      if (user?.id && !token.userId) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      session.user.isAdmin = isAdminEmail(session.user.email);
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
});
