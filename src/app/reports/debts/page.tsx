import { redirect } from "next/navigation";

export default function DebtsRedirectPage() {
  redirect("/accounting/reports/guest-debts");
}
