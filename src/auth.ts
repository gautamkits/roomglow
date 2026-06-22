import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createUser, findUserByGoogleId } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
    async jwt({ token, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        const dbUser = await findUserByGoogleId(account.providerAccountId);
        if (dbUser) {
          token.userId = dbUser.id;
          token.googleId = account.providerAccountId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
});
