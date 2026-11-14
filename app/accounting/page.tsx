import Demo from "../Demo";
import { loadData, loadChat } from "../../lib/data";
export default async function Page() {
  const data = await loadData();
  const supplierChats = await Promise.all(
    data.suppliers.map(async (s) => ({
      supplier: s.name,
      text: await loadChat("suppliers", s.name),
    })),
  );
  return (
    <Demo
      initialPage="Accounting & Documents"
      initialOperations={{ ...data, supplierChats }}
    />
  );
}
