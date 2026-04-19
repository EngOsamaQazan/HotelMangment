import ReservationDetailClient from "./ReservationDetailClient";

export default async function ReservationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <ReservationDetailClient id={id} />;
}
