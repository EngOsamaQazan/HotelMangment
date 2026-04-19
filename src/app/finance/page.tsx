import { redirect } from "next/navigation";

export default function FinanceRedirectPage() {
  redirect("/accounting/cashbook");
}
