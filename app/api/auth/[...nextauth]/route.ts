// app/api/auth/[...nextauth]/route.ts
export const dynamic = "force-dynamic";
export { handlers as GET, handlers as POST } from "@/auth";
