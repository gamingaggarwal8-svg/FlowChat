# FlowChat demo dataset v2: customers + suppliers + inventory (as of 2026-11-14)

All data is synthetic and consistent across segments (stock = opening + supplier receipts - customer sales).

## Segment map
| Segment | Where | What |
|---|---|---|
| Customers (sales side) | chats/, invoices.csv, order_lines.csv, payments.csv, quotes.csv, bargain_history.csv, customers.csv, expected_extraction.json | 12 customers, receivables, payment promises |
| Suppliers (purchase side) | suppliers/ | 7 suppliers, chats, purchase orders, supplier invoices, payments made, rate history, expected_extraction_suppliers.json |
| Inventory | inventory/ | stock_movements.csv (opening, IN from supplier receipts, OUT from customer invoices), inventory_snapshot.csv (stock, reorder level, weeks cover, status) |
| Master | products.csv | list and floor price (cost price is in inventory_snapshot.csv) |
| Answers | expected_metrics.json | verified numbers across all segments |

Customer files are unchanged from v1, so existing code keeps working. Add the new folders next to them.

## Supplier side (suppliers/)
- chats/*.txt: owner Rakesh buys from mills. Contains purchase negotiation, supplier delivery promises ("Saturday tak maal pahunch jayega"), late delivery follow-ups, supplier invoices, and the OWNER's own payment promises to suppliers
- purchase_orders.csv: status received / open / delayed. purchase_lines.csv: items and final rate
- supplier_invoices.csv and supplier_payments.csv: payments are not linked to invoices, reconcile supplier-wise oldest first
- supplier_rate_history.csv: quoted vs asked vs final rate
- Two promise types to track: supplier delivery promises (on_time / late / delayed / pending) and owner payment promises to suppliers (kept / partial / missed / pending)

## Inventory (inventory/)
- Status rules: LOW if stock < reorder level (3 weeks of average sales); OVERSTOCK if weeks of cover >= 12
- open_po_qty shows stock already on order

## Expected numbers (verified by script)
- Receivables outstanding (customers owe): Rs 631,417
- Payables outstanding (owner owes suppliers): Rs 416,265; overdue Rs 253,394
- Net position (receivables - payables): Rs 215,152
- Payables falling due in next 14 days: Rs 162,871 vs expected inflow from pending customer promises: Rs 96,243
- Payables by supplier: Panipat Garments Unit Rs 101,415, Surat Weave Mills Rs 93,516, Ahmedabad Linen Co Rs 71,958, Jaipur Print House Rs 49,770, Delhi Lining and Trims Rs 43,212, Silk Route Sarees Rs 36,654, Ludhiana Denim Works Rs 19,740
- LOW stock: P01, P03, P05, P07; OVERSTOCK: P08, P09
- Delayed PO: PO-S01-4; open POs: PO-S03-4, PO-S04-4, PO-S05-4; late deliveries: PO-S01-2, PO-S03-2, PO-S05-3
- Inventory value at cost: Rs 374,395
- Owner payment promises to suppliers: {"Surat Weave Mills": ["missed"], "Ludhiana Denim Works": ["pending"], "Silk Route Sarees": ["partial"], "Panipat Garments Unit": ["kept"], "Ahmedabad Linen Co": ["partial"]}

## Cross-segment insights the data supports
1. Cash crunch: supplier dues in 14 days exceed expected customer promise inflow
2. Blue Cotton Shirting (P01) is LOW with only 1.2 weeks of cover, and its restock PO from Surat Weave Mills is delayed, while Sharma and Agarwal are big buyers of it
3. Lining (P08) is overstocked: Rs 94,620 of cash is locked in 18 weeks of stock
4. Surat Weave Mills is chasing a missed owner payment AND is the late supplier

---


Owner: Rakesh (textile distributor). 12 customers, Aug to Nov 2026. All data is synthetic.

## Files
- chats/*.txt: WhatsApp export format `DD/MM/YYYY, HH:MM - Name: message` (Hinglish, bargaining, "woh wala" ambiguity, voice note transcripts, Diwali noise)
- invoices.csv, order_lines.csv: 36 invoices with GST (5%), credit days per customer
- payments.csv: 27 bank-style payments (NOT linked to invoices, reconcile customer-wise FIFO)
- quotes.csv: open quotations, never confirmed
- products.csv: list price, floor price (for bargaining rules)
- bargain_history.csv: past asks vs final rates, some asks below floor
- customers.csv: city, credit days
- expected_extraction.json: ground truth orders, promises (with expected_status) and open quotes, use it to test the LLM extraction

## Expected numbers (verified by script)
- Total outstanding: Rs 631,417
- Overdue (due date passed, FIFO): Rs 217,892
- Highest outstanding: Sharma Textiles Rs 91,803 (then Jain Sarees Rs 90,763)
- Promises: 13 total
  - missed: 4 (promised Rs 75,000)
  - partial: 3 (promised Rs 100,000)
  - kept: 3
  - pending: 3
- Open quotations (taxable value): Rs 275,000
- Verma Garments has Rs 0 outstanding (good payer story)

## Promise status rule used
Payment by same customer between made_on and promised_date + 2 days: >= 95% of amount = kept, some but less = partial, none and date passed = potentially missed, date not passed = pending.


## Additional demo catalog metadata

`product_attributes.csv` was added for category/fabric/colour/audience segmentation. It does not change the supplied financial, stock or extraction truth. Known colours/material names come from product names; absent information stays Unspecified. Gender labels for ready-made garments are synthetic owner classifications, editable in the demo, not facts extracted from chats. Raw fabric uses Not applicable for gender.
