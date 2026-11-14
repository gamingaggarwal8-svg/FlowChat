import { loadData } from '../lib/data';
import { allAnalytics } from '../lib/analytics';
async function main() {
 const r=allAnalytics(await loadData());
 console.log(JSON.stringify({
  receivables:r.customers.receivables,customerOverdue:r.customers.overdue,
  topCustomer:{name:r.customers.topCustomer?.party,outstanding:r.customers.topCustomer?.outstanding},
  promiseCounts:r.customers.promiseCounts,openQuotesTaxable:r.customers.openQuotesTaxable,
  payables:r.suppliers.payables,payablesOverdue:r.suppliers.overdue,dueNext14Days:r.suppliers.dueNext14Days.amount,
  ownerPromises:r.suppliers.ownerPromises.map(p=>({supplier:p.party,status:p.status})),
  lateDeliveries:r.suppliers.lateDeliveries.map(p=>p.id),delayedPOs:r.suppliers.delayedPOs.map(p=>p.id),openPOs:r.suppliers.openPOs.map(p=>p.id),
  lowStock:r.inventory.lowStock.map(i=>i.sku),overstock:r.inventory.overstock.map(i=>i.sku),inventoryValue:r.inventory.valueAtCost,
  negativeRunningBalances:r.inventory.movements.negativeRows.length,netPosition:r.cash.netPosition,
  expectedPromiseInflow:r.cash.expectedPromiseInflow,supplierDuesNext14Days:r.cash.supplierDuesNext14Days,shortfall:r.cash.shortfall,
 },null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
