# Field classification for field-level permissions (draft for owner review, 2026-11-08)

Source: the local DB `information_schema.columns` (public base tables, 645 columns), spec `2026-11-03-moesa-panel-modules-design.md` (K8, M1–M3, M7, M8, M10, M15, §7), and `docs/superpowers/research/field-permissions/`.

**Result: 81 sensitive columns in 9 field groups.** Per group: cost 17, internal_note 20, supplier_terms 13, personal_data 8, contract 6, supplier_identity 5, finance 5, supplier_contact 4, sell_price 3.

## Classes

- `system`: ids, tenant_id, timestamps, FK ids, created_by. Readable whenever the row is. FK columns that reveal a sensitive relation are marked in the note; they are classified as sensitive where the FK itself is the leak (`product.supplier_id`, `purchase_order.supplier_id`, `purchase_order.pi_document_id`).
- `public-to-tenant`: anyone who may read the row.
- `sensitive`: hidden behind a field-group toggle per role.

## Field groups (fixed list) and default per role

R = read, W = write, — = hidden. "Portal" = M15 `customer_viewer`, already limited to its own `customer_id` rows. A group can only matter for the portal where the portal has table access at all (shown in each table heading). Supplier, PO, PO lines, PO payments, incident_log, transfer, setting and audit tables are table-level hidden from the portal.

| group | what it protects | owner | management | coordinator | portal |
|---|---|---|---|---|---|
| `cost` | purchase prices, landed cost, PO line prices, PI figures (supplier-side money) | RW | RW | RW | — |
| `sell_price` | MOESA's price to the customer, target price, price list version (cost + this = margin) | RW | RW | R | R |
| `supplier_identity` | references that name or identify the supplier outside the supplier table | RW | RW | RW | — |
| `supplier_contact` | supplier contact people | RW | RW | RW | — |
| `supplier_terms` | supplier commercial terms: deposit, payment terms, penalties, buy-side Incoterm and place | RW | RW | R | — |
| `contract` | customer contract terms (the six `CONTRACT_FIELDS`) | RW | RW | R | — |
| `finance` | payment amounts, incident cost items | RW | RW | R | — |
| `internal_note` | free-text notes and post-mortems, supplier evaluation | RW | RW | RW | — |
| `personal_data` | names, e-mails, phones of people (K8) | RW | RW | RW | R (own customer only) |

The coordinator defaults keep today's operational work (entering POs, PI check, supplier contact) and move only terms, contract and payment amounts to read-only. See §3 for the margin question this raises.

## 1. Per-table columns

### customer (portal table access: R own row)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| code | char | public-to-tenant | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| country | text | public-to-tenant | | | | | |  |
| website | text | public-to-tenant | | | | | |  |
| commercial_model | enum | public-to-tenant | | | | | | portal R ok (their own contract model) |
| packages | ARRAY | public-to-tenant | | | | | | service scope; portal R ok |
| status | enum | public-to-tenant | | | | | |  |
| contract_accepted_on | date | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| contract_document_id | uuid | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| start_on | date | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| deposit_rate | numeric | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| extra_cost_rule | text | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| eu_responsible_person | text | public-to-tenant | | | | | | company/IOR name, not personal |
| restricted_drive_url | text | **sensitive** | `contract` | RW | RW | R | — | write already guarded by customer_contract_guard; reads open today |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### customer_brand (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| name | text | public-to-tenant | | | | | |  |
| registration_status | text | public-to-tenant | | | | | |  |
| brand_program_status | text | public-to-tenant | | | | | |  |
| gs1_prefix_owner | text | public-to-tenant | | | | | |  |

### customer_contact (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| name | text | **sensitive** | `personal_data` | RW | RW | RW | R | portal R = own customer contacts only |
| role | text | public-to-tenant | | | | | |  |
| email | text | **sensitive** | `personal_data` | RW | RW | RW | R | portal R = own customer contacts only |
| phone | text | **sensitive** | `personal_data` | RW | RW | RW | R | portal R = own customer contacts only |
| can_approve | boolean | public-to-tenant | | | | | |  |

### customer_platform_account (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| platform_id | text | system | | | | | | FK |
| countries | ARRAY | public-to-tenant | | | | | |  |
| account_holder | text | **sensitive** | `personal_data` | RW | RW | RW | R | often a person name |
| access | enum | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| api_connection | enum | public-to-tenant | | | | | |  |
| authorized_at | timestamptz | public-to-tenant | | | | | |  |
| seller_id | text | system | | | | | | FK |

### customer_warehouse (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| display_name | text | public-to-tenant | | | | | |  |
| type | enum | public-to-tenant | | | | | |  |
| country | text | public-to-tenant | | | | | |  |
| city | text | public-to-tenant | | | | | |  |
| address | text | public-to-tenant | | | | | |  |
| postal_code | text | public-to-tenant | | | | | |  |
| dock_hours | text | public-to-tenant | | | | | |  |
| appointment_rule | text | public-to-tenant | | | | | |  |
| pallet_standard | text | public-to-tenant | | | | | |  |
| receiving_person | text | **sensitive** | `personal_data` | RW | RW | RW | R |  |
| is_default | boolean | public-to-tenant | | | | | |  |

### supplier (portal table access: none (D3-3))

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| code | text | public-to-tenant | | | | | |  |
| display_name | text | public-to-tenant | | | | | | supplier table is table-level hidden from portal (D3-3); identity fields of the table itself need no toggle |
| country | text | public-to-tenant | | | | | |  |
| city | text | public-to-tenant | | | | | |  |
| website | text | public-to-tenant | | | | | |  |
| product_groups | ARRAY | public-to-tenant | | | | | |  |
| capacity_note | text | public-to-tenant | | | | | | operational, internal-public |
| default_incoterm | text | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| deposit_rate | numeric | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| payment_terms | text | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| damage_notice_hours | integer | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| storage_fee_rule | text | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| late_payment_penalty | text | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| cancellation_rule | text | **sensitive** | `supplier_terms` | RW | RW | R | — |  |
| rating | smallint | **sensitive** | `internal_note` | RW | RW | RW | — | supplier evaluation |
| last_audit_on | date | **sensitive** | `internal_note` | RW | RW | RW | — | supplier evaluation |
| status | enum | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — | supplier evaluation |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### supplier_contact (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| supplier_id | uuid | system | | | | | | FK |
| name | text | **sensitive** | `supplier_contact` | RW | RW | RW | — | also personal data (K8) |
| role | text | **sensitive** | `supplier_contact` | RW | RW | RW | — | also personal data (K8) |
| email | text | **sensitive** | `supplier_contact` | RW | RW | RW | — | also personal data (K8) |
| phone | text | **sensitive** | `supplier_contact` | RW | RW | RW | — | also personal data (K8) |
| is_primary | boolean | public-to-tenant | | | | | |  |

### product (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| parent_id | uuid | system | | | | | | FK |
| sku | text | public-to-tenant | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| variant_label | text | public-to-tenant | | | | | |  |
| category | text | public-to-tenant | | | | | |  |
| brand | text | public-to-tenant | | | | | |  |
| gtin | text | public-to-tenant | | | | | |  |
| gs1_prefix_owner | text | public-to-tenant | | | | | | customer or MOESA, not supplier |
| supplier_id | uuid | **sensitive** | `supplier_identity` | RW | RW | RW | — | FK reveals supplier |
| supplier_product_code | text | **sensitive** | `supplier_identity` | RW | RW | RW | — | searchable on supplier sites / B2B portals = supplier identity |
| manufacturer_art_no | text | **sensitive** | `supplier_identity` | RW | RW | RW | — | searchable on supplier sites / B2B portals = supplier identity |
| status | enum | public-to-tenant | | | | | |  |
| golden_sample_on | date | public-to-tenant | | | | | |  |
| golden_sample_locations | text | public-to-tenant | | | | | | may say "at supplier X" (§3) |
| is_hazmat | boolean | public-to-tenant | | | | | |  |
| compliance_status | enum | public-to-tenant | | | | | |  |
| eu_responsible_person | text | public-to-tenant | | | | | |  |
| hs_code | text | public-to-tenant | | | | | |  |
| origin_country | text | public-to-tenant | | | | | | public: customs/compliance need it; the only supplier hint the portal gets |
| unit_dims_mm | text | public-to-tenant | | | | | |  |
| unit_net_g | numeric | public-to-tenant | | | | | |  |
| pack_qty | integer | public-to-tenant | | | | | |  |
| pack_dims_mm | text | public-to-tenant | | | | | |  |
| pack_gross_g | numeric | public-to-tenant | | | | | |  |
| carton_pack_qty | integer | public-to-tenant | | | | | |  |
| carton_dims_mm | text | public-to-tenant | | | | | |  |
| carton_net_kg | numeric | public-to-tenant | | | | | |  |
| carton_gross_kg | numeric | public-to-tenant | | | | | |  |
| pallet_carton_qty | integer | public-to-tenant | | | | | |  |
| pallet_type | text | public-to-tenant | | | | | |  |
| lot_rule | text | public-to-tenant | | | | | |  |
| purchase_price | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| purchase_currency | char | **sensitive** | `cost` | RW | RW | RW | — |  |
| purchase_incoterm | text | **sensitive** | `cost` | RW | RW | RW | — |  |
| landed_cost_eur | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| landed_cost_on | date | **sensitive** | `cost` | RW | RW | RW | — |  |
| target_price_eur | numeric | **sensitive** | `sell_price` | RW | RW | R | R | with cost gives the margin |
| company_price_eur | numeric | **sensitive** | `sell_price` | RW | RW | R | R | with cost gives the margin |
| price_list_version | text | **sensitive** | `sell_price` | RW | RW | R | R | with cost gives the margin |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |
| amazon_product_type | text | public-to-tenant | | | | | |  |
| amazon_schema_version | text | public-to-tenant | | | | | |  |
| listing_attributes | jsonb | public-to-tenant | | | | | |  |

### project (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| code | text | public-to-tenant | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| type | enum | public-to-tenant | | | | | |  |
| path | enum | public-to-tenant | | | | | |  |
| packages | ARRAY | public-to-tenant | | | | | |  |
| current_phase | enum | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| target_delivery_on | date | public-to-tenant | | | | | |  |
| target_live_on | date | public-to-tenant | | | | | |  |
| coordinator_id | uuid | system | | | | | | FK to staff user |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### project_gate (portal table access: R own + approve (M) gates)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| project_id | uuid | system | | | | | | FK |
| code | enum | public-to-tenant | | | | | |  |
| position | integer | system | | | | | |  |
| needs_customer_approval | boolean | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| passed_at | timestamptz | public-to-tenant | | | | | |  |
| decided_by_role | text | public-to-tenant | | | | | |  |
| customer_approved_on | date | public-to-tenant | | | | | |  |
| approval_document_id | uuid | system | | | | | | FK |
| evidence_document_ids | ARRAY | system | | | | | | FK |
| note | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| rolled_back_reason | text | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| rolled_back_incident_id | uuid | system | | | | | | FK |

### project_product (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| project_id | uuid | system | | | | | | FK |
| product_id | uuid | system | | | | | | FK |
| tenant_id | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |

### project_task (portal table access: none (internal checklist))

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| project_id | uuid | system | | | | | | FK |
| phase | enum | public-to-tenant | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| role | text | public-to-tenant | | | | | |  |
| assignee_id | uuid | system | | | | | | FK to staff user |
| due_on | date | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| blocks_gate | boolean | public-to-tenant | | | | | |  |
| position | integer | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |

### purchase_order (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| supplier_id | uuid | **sensitive** | `supplier_identity` | RW | RW | RW | — | FK reveals supplier |
| project_id | uuid | system | | | | | | FK |
| code | text | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| currency | char | public-to-tenant | | | | | | currency alone reveals nothing |
| incoterm | text | **sensitive** | `supplier_terms` | RW | RW | R | — | incoterm_place often = supplier city/port |
| incoterm_place | text | **sensitive** | `supplier_terms` | RW | RW | R | — | incoterm_place often = supplier city/port |
| deposit_rate | numeric | **sensitive** | `supplier_terms` | RW | RW | R | — | incoterm_place often = supplier city/port |
| ready_on | date | public-to-tenant | | | | | |  |
| tolerance_pct | numeric | **sensitive** | `supplier_terms` | RW | RW | R | — | incoterm_place often = supplier city/port |
| penalty_rule | text | **sensitive** | `supplier_terms` | RW | RW | R | — | incoterm_place often = supplier city/port |
| packing_instruction_document_id | uuid | system | | | | | | FK |
| pi_document_id | uuid | **sensitive** | `cost` | RW | RW | RW | — | FK to the supplier PI document (prices + supplier letterhead) |
| pi_number | text | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_subtotal | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_total | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_deposit_amount | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_balance_amount | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_extra_amount | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_discount_amount | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_check | jsonb | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_checked_by | uuid | public-to-tenant | | | | | |  |
| pi_checked_at | timestamptz | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### purchase_order_line (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| purchase_order_id | uuid | system | | | | | | FK |
| customer_id | uuid | system | | | | | | FK |
| position | integer | system | | | | | |  |
| product_id | uuid | system | | | | | | FK |
| quantity | integer | public-to-tenant | | | | | |  |
| unit_price | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| line_total | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| pi_line_total | numeric | **sensitive** | `cost` | RW | RW | RW | — |  |
| spec_document_id | uuid | system | | | | | | FK |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### purchase_order_payment (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| purchase_order_id | uuid | system | | | | | | FK |
| kind | enum | public-to-tenant | | | | | |  |
| amount | numeric | **sensitive** | `finance` | RW | RW | R | — |  |
| currency | char | **sensitive** | `finance` | RW | RW | R | — |  |
| planned_on | date | public-to-tenant | | | | | | dates stay public: dashboards and G4 warnings use them |
| paid_on | date | public-to-tenant | | | | | |  |
| paid_by | enum | public-to-tenant | | | | | | MOESA vs customer; operational |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### purchase_order_update (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| purchase_order_id | uuid | system | | | | | | FK |
| happened_on | date | public-to-tenant | | | | | |  |
| note | text | public-to-tenant | | | | | |  |
| created_by | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### shipment (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| code | text | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| mode | enum | public-to-tenant | | | | | |  |
| delivery_warehouse_id | uuid | system | | | | | | FK |
| forwarder | text | public-to-tenant | | | | | | public: portal tracks shipments (§3) |
| customs_broker | text | public-to-tenant | | | | | | public (§3) |
| carrier | text | public-to-tenant | | | | | |  |
| incoterm_buy | text | **sensitive** | `supplier_terms` | RW | RW | R | — | buy-side term; incoterm_sell stays public |
| incoterm_sell | text | public-to-tenant | | | | | |  |
| is_insured | boolean | public-to-tenant | | | | | |  |
| ready_on | date | public-to-tenant | | | | | |  |
| booking_confirmed_on | date | public-to-tenant | | | | | |  |
| etd | date | public-to-tenant | | | | | |  |
| eta | date | public-to-tenant | | | | | |  |
| customs_cleared_on | date | public-to-tenant | | | | | |  |
| planned_delivery_on | date | public-to-tenant | | | | | |  |
| delivered_at | timestamptz | public-to-tenant | | | | | |  |
| container_no | text | public-to-tenant | | | | | | public: customer tracks the container |
| seal_no | text | public-to-tenant | | | | | |  |
| free_days_port | integer | public-to-tenant | | | | | |  |
| free_days_detention | integer | public-to-tenant | | | | | |  |
| demurrage_note | text | public-to-tenant | | | | | |  |
| carton_count | integer | public-to-tenant | | | | | |  |
| pallet_count | integer | public-to-tenant | | | | | |  |
| volume_m3 | numeric | public-to-tenant | | | | | |  |
| gross_kg | numeric | public-to-tenant | | | | | |  |
| accepted_by | text | public-to-tenant | | | | | |  |
| accepted_on | date | public-to-tenant | | | | | |  |
| quantity_matches | boolean | public-to-tenant | | | | | |  |
| has_damage | boolean | public-to-tenant | | | | | |  |
| dispute_deadline_at | timestamptz | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### shipment_event (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| shipment_id | uuid | system | | | | | | FK |
| happened_at | timestamptz | public-to-tenant | | | | | |  |
| step | smallint | public-to-tenant | | | | | |  |
| from_party | text | public-to-tenant | | | | | | free text, may name the supplier (§3) |
| to_party | text | public-to-tenant | | | | | | free text (§3) |
| channel | text | public-to-tenant | | | | | |  |
| note | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_by | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### shipment_line (portal table access: R own (see FK notes))

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| shipment_id | uuid | system | | | | | | FK |
| purchase_order_id | uuid | system | | | | | | FK reveals PO (and via PO the supplier) |
| purchase_order_line_id | uuid | system | | | | | | FK reveals PO line (cost) |
| quantity | integer | public-to-tenant | | | | | |  |
| carton_count | integer | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### shipment_purchase_order (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| shipment_id | uuid | system | | | | | | FK |
| purchase_order_id | uuid | system | | | | | | FK reveals PO (and via PO the supplier) |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| created_at | timestamptz | system | | | | | |  |

### market_cell (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| product_id | uuid | system | | | | | | FK |
| project_id | uuid | system | | | | | | FK |
| platform_id | text | system | | | | | | FK |
| country | text | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| priority | smallint | public-to-tenant | | | | | |  |
| compliance | enum | public-to-tenant | | | | | |  |
| compliance_note | text | public-to-tenant | | | | | |  |
| platform_product_id | text | system | | | | | | FK |
| platform_sku | text | public-to-tenant | | | | | |  |
| price | numeric | public-to-tenant | | | | | | public: the live marketplace price |
| currency | char | public-to-tenant | | | | | |  |
| stock_source | enum | public-to-tenant | | | | | |  |
| content_status | enum | public-to-tenant | | | | | |  |
| target_launch_on | date | public-to-tenant | | | | | |  |
| launched_on | date | public-to-tenant | | | | | |  |
| last_checked_on | date | public-to-tenant | | | | | |  |
| open_issue | text | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |
| listing_state | enum | public-to-tenant | | | | | |  |
| listing_checked_at | timestamptz | public-to-tenant | | | | | |  |
| listing_language | text | public-to-tenant | | | | | |  |
| fulfillment_channel | text | public-to-tenant | | | | | |  |
| listing_match | jsonb | public-to-tenant | | | | | |  |

### listing_submission (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| cell_id | uuid | system | | | | | | FK |
| kind | enum | public-to-tenant | | | | | |  |
| sku | text | public-to-tenant | | | | | |  |
| marketplace_id | text | system | | | | | | FK |
| payload | jsonb | public-to-tenant | | | | | | contains the listing price (public, same as market_cell.price) |
| amazon_submission_id | text | system | | | | | | FK |
| status | enum | public-to-tenant | | | | | |  |
| issues | jsonb | public-to-tenant | | | | | |  |
| created_by | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### incident (portal table access: R own (owner to confirm))

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| code | text | public-to-tenant | | | | | |  |
| family | enum | public-to-tenant | | | | | |  |
| incident_type | text | public-to-tenant | | | | | |  |
| severity | enum | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| owner_id | uuid | system | | | | | | FK to staff user |
| title | text | public-to-tenant | | | | | |  |
| what_happened | text | public-to-tenant | | | | | | customer-facing incident text (§3) |
| reported_by | text | public-to-tenant | | | | | |  |
| current_state | text | public-to-tenant | | | | | |  |
| immediate_action | text | public-to-tenant | | | | | |  |
| entity_type | enum | public-to-tenant | | | | | |  |
| entity_id | uuid | system | | | | | | FK |
| opened_at | timestamptz | public-to-tenant | | | | | |  |
| affected_parties | ARRAY | public-to-tenant | | | | | | may list the supplier as a party (§3) |
| management_notified_at | timestamptz | public-to-tenant | | | | | |  |
| customer_notice_due_at | timestamptz | public-to-tenant | | | | | |  |
| customer_notified_at | timestamptz | public-to-tenant | | | | | |  |
| outcome | enum | public-to-tenant | | | | | |  |
| root_cause | enum | public-to-tenant | | | | | |  |
| root_cause_note | text | **sensitive** | `internal_note` | RW | RW | RW | — | post-mortem text, may name supplier or staff fault |
| impact_note | text | **sensitive** | `internal_note` | RW | RW | RW | — | post-mortem text, may name supplier or staff fault |
| lessons | text | **sensitive** | `internal_note` | RW | RW | RW | — | post-mortem text, may name supplier or staff fault |
| preventive_action | text | public-to-tenant | | | | | |  |
| customer_closure_notified_on | date | public-to-tenant | | | | | |  |
| closed_on | date | public-to-tenant | | | | | |  |
| closed_by | uuid | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### incident_deadline (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| incident_id | uuid | system | | | | | | FK |
| kind | enum | public-to-tenant | | | | | |  |
| label | text | public-to-tenant | | | | | |  |
| due_at | timestamptz | public-to-tenant | | | | | |  |
| met_at | timestamptz | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### incident_log (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| incident_id | uuid | system | | | | | | FK |
| logged_at | timestamptz | public-to-tenant | | | | | |  |
| author_id | uuid | system | | | | | | FK |
| note | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| counterparty | text | **sensitive** | `supplier_identity` | RW | RW | RW | — | often the supplier/forwarder name |
| decision | text | public-to-tenant | | | | | |  |
| cost_amount | numeric | **sensitive** | `finance` | RW | RW | R | — |  |
| cost_currency | char | **sensitive** | `finance` | RW | RW | R | — |  |
| cost_payer | enum | **sensitive** | `finance` | RW | RW | R | — |  |
| customer_approved | boolean | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### change_request (portal table access: R own + approve)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| code | text | public-to-tenant | | | | | |  |
| project_id | uuid | system | | | | | | FK |
| title | text | public-to-tenant | | | | | |  |
| source | enum | public-to-tenant | | | | | |  |
| urgency | enum | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| decision_due_on | date | public-to-tenant | | | | | |  |
| change_kinds | ARRAY | public-to-tenant | | | | | |  |
| current_value | text | public-to-tenant | | | | | |  |
| requested_value | text | public-to-tenant | | | | | |  |
| reason | text | public-to-tenant | | | | | |  |
| affected_gate_code | enum | public-to-tenant | | | | | |  |
| affected_document_id | uuid | system | | | | | | FK |
| other_documents | text | public-to-tenant | | | | | |  |
| cost_impact | text | public-to-tenant | | | | | | public on purpose: customer must see it to approve the CR (§3) |
| cost_payer | enum | public-to-tenant | | | | | | public on purpose (customer approves) |
| delay_days | integer | public-to-tenant | | | | | |  |
| quality_impact | text | public-to-tenant | | | | | |  |
| listing_impact | text | public-to-tenant | | | | | |  |
| decision_note | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| company_approved_by | uuid | public-to-tenant | | | | | |  |
| company_approved_on | date | public-to-tenant | | | | | |  |
| customer_approved_on | date | public-to-tenant | | | | | |  |
| customer_approval_document_id | uuid | system | | | | | | FK |
| result_document_id | uuid | system | | | | | | FK |
| closed_on | date | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### change_request_product (portal table access: R own)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| change_request_id | uuid | system | | | | | | FK |
| product_id | uuid | system | | | | | | FK |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| created_at | timestamptz | system | | | | | |  |

### document (portal table access: R own, row-filtered by type/entity)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| entity_type | enum | public-to-tenant | | | | | | see entity_id |
| entity_id | uuid | system | | | | | | polymorphic FK: a document on a supplier/PO entity is itself sensitive (row rule, §2) |
| type | enum | public-to-tenant | | | | | | PI / supplier contract / price list types must be row-filtered (§2) |
| version | integer | public-to-tenant | | | | | |  |
| issued_on | date | public-to-tenant | | | | | |  |
| status | enum | public-to-tenant | | | | | |  |
| url | text | public-to-tenant | | | | | |  |
| file_name | text | public-to-tenant | | | | | |  |
| sent_from_official_email | boolean | public-to-tenant | | | | | |  |
| is_signed | boolean | public-to-tenant | | | | | |  |
| is_stamped | boolean | public-to-tenant | | | | | |  |
| notes | text | **sensitive** | `internal_note` | RW | RW | RW | — |  |
| created_by | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |
| media_id | uuid | system | | | | | | FK |

### media (portal table access: R own, row-filtered)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| storage_path | text | public-to-tenant | | | | | |  |
| thumbnail_path | text | public-to-tenant | | | | | |  |
| file_name | text | public-to-tenant | | | | | |  |
| mime_type | text | public-to-tenant | | | | | |  |
| size_bytes | bigint | public-to-tenant | | | | | |  |
| width | integer | public-to-tenant | | | | | |  |
| height | integer | public-to-tenant | | | | | |  |
| title | text | public-to-tenant | | | | | |  |
| alt_text | text | public-to-tenant | | | | | |  |
| tags | ARRAY | public-to-tenant | | | | | |  |
| uploaded_by | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### media_link (portal table access: R own, row-filtered)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| media_id | uuid | system | | | | | | FK |
| entity_type | enum | public-to-tenant | | | | | |  |
| entity_id | uuid | system | | | | | | polymorphic FK: media linked to supplier/PO (row rule, §2) |
| role | enum | public-to-tenant | | | | | |  |
| position | integer | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### transfer (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| source_tenant_id | uuid | system | | | | | |  |
| customer_id | uuid | system | | | | | | FK |
| target_customer_id | uuid | system | | | | | | FK |
| product_ids | ARRAY | system | | | | | | FK |
| mode | text | public-to-tenant | | | | | |  |
| path | text | public-to-tenant | | | | | |  |
| started_by | uuid | public-to-tenant | | | | | |  |
| report | jsonb | public-to-tenant | | | | | | copies of moved rows incl. cost; table-level owner/management only (§2) |
| decisions | jsonb | public-to-tenant | | | | | | table-level gated (§2) |
| id_map | jsonb | public-to-tenant | | | | | | table-level gated |
| files | jsonb | public-to-tenant | | | | | | table-level gated |
| files_status | text | public-to-tenant | | | | | |  |
| missing_files | ARRAY | public-to-tenant | | | | | |  |
| audit_transaction_ids | ARRAY | system | | | | | | FK |
| xact_id | xid8 | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| updated_at | timestamptz | system | | | | | |  |

### setting (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |
| key | text | public-to-tenant | | | | | |  |
| value | jsonb | public-to-tenant | | | | | | table-level: read all internal, write management (existing column grant) |
| description | text | public-to-tenant | | | | | |  |
| source_question | text | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |

### tenant (portal table access: display_name only)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| phone | text | public-to-tenant | | | | | | company contact, not personal |
| email | text | public-to-tenant | | | | | | company contact, not personal |
| created_at | timestamptz | system | | | | | |  |
| parent_id | uuid | system | | | | | | FK |
| website | text | public-to-tenant | | | | | |  |
| legal_name | text | public-to-tenant | | | | | |  |
| tax_office | text | public-to-tenant | | | | | |  |
| tax_number | text | public-to-tenant | | | | | | MOESA company data; portal reads only tenant.display_name |
| country | text | public-to-tenant | | | | | |  |
| city | text | public-to-tenant | | | | | |  |
| district | text | public-to-tenant | | | | | |  |
| address | text | public-to-tenant | | | | | |  |
| logo_path | text | public-to-tenant | | | | | |  |

### tenant_user (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| user_id | uuid | system | | | | | | FK |
| tenant_id | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |

### tenant_owner (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| user_id | uuid | system | | | | | | FK |
| tenant_id | uuid | system | | | | | |  |
| created_at | timestamptz | system | | | | | |  |

### user (portal table access: self only)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| user_metadata | jsonb | **sensitive** | `personal_data` | RW(self)/R | R | R | R(self) | others see colleagues via tenant_member; portal = self only |
| email | text | **sensitive** | `personal_data` | RW(self)/R | R | R | R(self) | others see colleagues via tenant_member; portal = self only |
| phone | text | **sensitive** | `personal_data` | RW(self)/R | R | R | R(self) | others see colleagues via tenant_member; portal = self only |
| created_at | timestamptz | system | | | | | |  |

### role (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| display_name | text | public-to-tenant | | | | | |  |
| created_at | timestamptz | system | | | | | |  |
| tenant_id | uuid | system | | | | | |  |

### user_role (portal table access: none)

| column | type | class | group | owner | mgmt | coord | portal | note |
|---|---|---|---|---|---|---|---|---|
| id | uuid | system | | | | | |  |
| user_id | uuid | system | | | | | | FK |
| role_id | uuid | system | | | | | | FK |
| created_at | timestamptz | system | | | | | |  |

### Catalog and platform tables (no business data, no field groups)

`amazon_product_type_definition`, `code_sequence`, `module`, `permission`, `role_permission`, `plan`, `plan_limit`, `plan_module`, `platform`, `subscription`, `task_template`: all columns `system` or `public-to-tenant`, governed at table level as today. `plan.price` is the SaaS plan price, not MOESA business data. `audit_log` and `audit_transaction` are covered in §2.

## 2. Derived exposures to handle (outside the column toggles)

### Views (all `security_invoker = true`, so they inherit table rights but not field rights)

| view | leaks | groups |
|---|---|---|
| `product_with_evidence` | `p.*`: every product column, incl. purchase/landed cost, sell price, supplier_id, supplier codes, notes | cost, sell_price, supplier_identity, internal_note |
| `purchase_order_overview` | `po.*` (PI figures, terms, notes) + `supplier_code` + `system_subtotal/total/deposit/balance` (computed by `private.purchase_order_figures` from line `unit_price`) | cost, supplier_terms, supplier_identity, internal_note |
| `dashboard_purchase_order` | `supplier_code`, `system_total`, `currency` | supplier_identity, cost |
| `dashboard_notification_feed` | `old_data` / `new_data` straight from the audit log (full row snapshots of any table) + `user_email` | every group |
| `market_cell_overview` | `cell.*` incl. `notes` | internal_note |
| `shipment_overview` | `incoterm_buy`, `notes`, `purchase_order_codes`, `psi_missing_po_codes` (reveal POs to anyone reading shipments, e.g. portal) | supplier_terms, internal_note, (PO relation) |
| `incident_overview` | `inc.*` incl. `root_cause_note`, `impact_note`, `lessons` | internal_note |
| `product_evidence` | `last_po_code` (PO existence only; low) | (PO relation) |
| `tenant_member` | `email`, `phone`, `user_metadata` of colleagues | personal_data |
| `media_library` | `linked_types` / `linked_entities` can reveal media linked to suppliers / POs (supplier invoices, PI scans) | supplier_identity, cost (files) |
| `dashboard_product_evidence`, `dashboard_market`, `dashboard_shipment`, `dashboard_change_request`, `dashboard_gate_pending`, `dashboard_task_due`, `dashboard_incident`, `company_subscription` | no sensitive columns found | — |

### SECURITY DEFINER (and related) functions that return or compute from sensitive fields

- `private.audit_statement` (trigger, definer): writes full old/new rows of every audited table into `audit_log`; the root of the audit leak.
- `public.revert_audit_transaction` (INVOKER, but writes old snapshots back): can rewrite sensitive columns the caller may not write; needs the field write rules applied per column.
- `private.purchase_order_figures` (INVOKER): sums `unit_price × quantity`; whatever reads it (the two PO views) exposes cost totals. Decide whether totals follow `cost` (proposed: yes).
- `public.transfer_customer` + `private.transfer_apply*`, `transfer_write`, `transfer_report`, `transfer_suppliers`, `transfer_collect` (definer): copy every column incl. cost/supplier/contract across tenants and return a JSONB report stored in `transfer.report`. Keep transfer owner/management only and keep values out of the report.
- `public.listing_set_state`, `listing_apply_submission`, `listing_begin_submission`, `listing_settle_removal` (definer): return whole `market_cell` / `listing_submission` rows, so `market_cell.notes` comes back to the caller.
- `public.amazon_account_connect` (definer): returns the whole `customer_platform_account` row (`account_holder`, `notes`).
- `public.amazon_account_token` / `private.amazon_token`: already revoked from `authenticated` (service only); keep.
- No other public definer function (`my_access`, `my_memberships`, `owned_via`, `managed_in`, `next_code`, `create_branch`, `delete_branch`, `transfer_options`, `transfer_check_files`, `audit_transfer_locked`, `is_super_admin`, `media_max_bytes`, `listing_parent_cell`) returns business figures. Guard triggers (`purchase_order_guard`, `customer_contract_guard`, ...) read values but return nothing; `customer_contract_guard` is the pattern to extend for field writes.

### Audit log

- `audit_log.old_data` / `new_data` hold every column of every audited row; `dashboard_notification_feed` exposes them to anyone who reads the feed. Needs masking per group (or a split) before any field rule means anything. Owner question 5 (event without values vs. hidden rows) applies.

### Exports and imports

- Product CSV (`app/src/api/product/csv.ts`): exports `supplier_code`, `supplier_product_code`, `manufacturer_art_no`, `purchase_price`, `landed_cost_eur`, `target_price_eur`, `company_price_eur`, notes. Export must drop columns the reader cannot read; import must refuse (not silently ignore) columns the writer cannot write.
- Transfer result screen (`app/src/views/pages/ops/transfer/ResultStep.vue`) shows the transfer report.
- Future M13 reports / PDFs (`PrintElementButton`): decide per owner question 7.

### Edge Functions (service role bypasses RLS and any field rule)

- `amazon-listing` reads `product` and `market_cell` with `select('*')` (incl. cost and supplier fields) via the service role; responses today return only listing fields. Keep responses projected and add a test that no cost/supplier key appears.
- `_shared/listingStatus.ts` reads `select('*')`; same rule.
- `user`, `create-account`: read `user.email`; personal_data, owner/management flows only.
- `amazon-poll`, `amazon-schema`, `amazon-auth`: no sensitive business fields in responses.

### Files

- `document` rows of type PI, supplier contract, price list, supplier invoice, and `media` linked to `supplier` / `purchase_order` entities carry the same secrets as the `cost` / `supplier_identity` columns. They need a row rule (by `document.type` / `entity_type`) plus storage-path checks in `private.can_read_media_file`.

## 3. Ambiguous calls (choice made, one-line reason)

1. **Coordinator sees `cost` (RW) and `sell_price` (R), so can compute the margin.** Chosen because coordinators enter POs and run the PI check (S09); if the margin must be hidden below management, drop coordinator `sell_price` to — instead (cost is the one they need for work).
2. **Portal reads `sell_price` (`company_price_eur`, `target_price_eur`, `price_list_version`).** It is what the customer pays / agreed; hiding it adds nothing. Margin stays safe because `cost` is hidden. If `target_price_eur` is an internal target, move it to `cost`.
3. **Portal does not read its own `contract` fields** (deposit rate, extra cost rule, restricted Drive URL). The customer knows its contract, but `restricted_drive_url` must stay hidden and a portal has no need for the rest.
4. **`supplier_product_code` and `manufacturer_art_no` are `supplier_identity`, not public.** Both can be searched on supplier sites and B2B portals to find the factory.
5. **`product.origin_country` stays public.** Needed for customs, labels and compliance; it narrows the supplier to a country only.
6. **`shipment.forwarder`, `customs_broker`, `carrier`, `container_no` stay public.** The portal tracks shipments; forwarders are not the bypass risk suppliers are. If logistics partners must also be protected, add a `logistics_partner` group.
7. **`shipment_event.from_party` / `to_party`, `incident.affected_parties`, `product.golden_sample_locations` stay public** although free text may name the supplier. Alternative: a team rule "write the supplier code, never the name", or move them to `supplier_identity`.
8. **`change_request.cost_impact` and `cost_payer` stay public.** The customer approves CRs and must see the cost; MOESA's internal cost breakdown goes into `decision_note` (internal_note).
9. **`incident.what_happened`, `current_state`, `immediate_action`, `root_cause` (enum), `preventive_action` stay public; `root_cause_note`, `impact_note`, `lessons` are internal.** Customers get incident notices (S17), the post-mortem text can name supplier or staff fault.
10. **`purchase_order_payment` dates (`planned_on`, `paid_on`) and `paid_by` stay public, amounts are `finance`.** Dashboards and the G4 "no balance without PSI" warning use the dates.
11. **`supplier.rating`, `last_audit_on`, `notes` are `internal_note`** so a future staff/QC role can see the supplier without its evaluation. Supplier identity fields inside `supplier` itself are not toggled: the whole table is already hidden from the portal (D3-3).
12. **`product.supplier_id`, `purchase_order.supplier_id` and `purchase_order.pi_document_id` are sensitive FKs**, so embeds (`supplier!...(code, display_name, ...)`) and filters on them must be hidden too. `shipment_line.purchase_order_id` and `shipment_purchase_order` stay system FKs, but the portal must not get the PO table (it does not).
13. **`user.email` / `phone`** keep R for management and coordinator (they assign tasks and contact colleagues); portal sees only self.
14. **`tenant` company data (`tax_number`, `legal_name`, address) stays public internally**; portal reads only `tenant.display_name`. K8 forbids storing bank/tax IDs for customers and suppliers, not for MOESA itself.
