import ContractClient from "./ContractClient";

export default async function ContractPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <ContractClient id={id} />;
}
