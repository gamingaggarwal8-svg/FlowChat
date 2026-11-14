"use client";
import { useState } from "react";
import {
  attributeSchema,
  type CatalogFilters,
  type ProductAttributes,
} from "../lib/catalog";
import { z } from "zod";
export default function CatalogControls({
  attributes,
  filters,
  onFilter,
  onSave,
  shown,
  total,
}: {
  attributes: ProductAttributes[];
  filters: CatalogFilters;
  onFilter: (filters: CatalogFilters) => void;
  onSave: (attributes: ProductAttributes[]) => void;
  shown: number;
  total: number;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<ProductAttributes[]>([]),
    [error, setError] = useState("");
  const choices = (field: "category" | "fabric" | "color") => [
    "All",
    ...new Set(attributes.map((a) => a[field])),
  ];
  function update(index: number, key: keyof ProductAttributes, value: string) {
    setDraft((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)),
    );
  }
  function save() {
    const parsed = z.array(attributeSchema).safeParse(draft);
    if (!parsed.success) {
      setError(
        "Every attribute must have a value. Use Unspecified for unknown information.",
      );
      return;
    }
    onSave(
      parsed.data.map((a) => ({
        ...a,
        provenance: "Owner classification in this browser",
      })),
    );
    setEditing(false);
    setError("");
  }
  return (
    <section className="panel catalog-controls">
      <div className="section-head">
        <div>
          <h2>Find the right stock, not just more stock.</h2>
          <p>
            {shown} of {total} products match. Every graph and row below uses
            these filters.
          </p>
        </div>
        <button
          className="text-btn"
          onClick={() => {
            setDraft(attributes.map((a) => ({ ...a })));
            setEditing(!editing);
            setError("");
          }}
        >
          {editing ? "Close editor" : "Edit catalog attributes"}
        </button>
      </div>
      <div className="catalog-filter-grid">
        <label>
          Search
          <input
            aria-label="Search inventory"
            placeholder="Product or SKU…"
            value={filters.search}
            onChange={(e) => onFilter({ ...filters, search: e.target.value })}
          />
        </label>
        {(
          ["category", "fabric", "color", "gender", "band", "unit"] as const
        ).map((key) => (
          <label key={key}>
            {
              {
                category: "Product type",
                fabric: "Fabric",
                color: "Colour",
                gender: "Gender / audience",
                band: "Available quantity",
                unit: "Unit",
              }[key]
            }
            <select
              value={filters[key]}
              onChange={(e) => onFilter({ ...filters, [key]: e.target.value })}
            >
              {(key === "gender"
                ? [
                    "All",
                    "Men",
                    "Women",
                    "Unisex",
                    "Kids",
                    "Not applicable",
                    "Unspecified",
                  ]
                : key === "band"
                  ? [
                      "All",
                      "Out of stock",
                      "Critical",
                      "Low",
                      "Adequate",
                      "Excess",
                      "Unverified",
                    ]
                  : key === "unit"
                    ? ["All", "mtr", "pc"]
                    : choices(key)
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="catalog-filter-footer">
        <span>
          Colour and fabric gaps stay Unspecified. Raw fabric has no gender;
          garment gender labels are editable demo owner classifications.
        </span>
        <button
          className="text-btn"
          onClick={() =>
            onFilter({
              search: "",
              category: "All",
              fabric: "All",
              color: "All",
              gender: "All",
              band: "All",
              unit: "All",
            })
          }
        >
          Reset filters
        </button>
      </div>
      {editing && (
        <div className="catalog-editor">
          <h3>Owner’s catalog sheet</h3>
          <p>
            Changes are saved in this browser. Quantities, costs and original
            chats are never changed by classification.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {["SKU", "TYPE", "FABRIC", "COLOUR", "GENDER / AUDIENCE"].map(
                    (h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {draft.map((a, index) => (
                  <tr key={a.sku}>
                    <td>{a.sku}</td>
                    <td>
                      <select
                        aria-label={`${a.sku} type`}
                        value={a.category}
                        onChange={(e) =>
                          update(index, "category", e.target.value)
                        }
                      >
                        {[
                          "Fabric",
                          "Ready-made",
                          "Accessories",
                          "Unspecified",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${a.sku} fabric`}
                        value={a.fabric}
                        onChange={(e) =>
                          update(index, "fabric", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${a.sku} colour`}
                        value={a.color}
                        onChange={(e) => update(index, "color", e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${a.sku} gender`}
                        value={a.gender}
                        onChange={(e) =>
                          update(index, "gender", e.target.value)
                        }
                      >
                        {[
                          "Men",
                          "Women",
                          "Unisex",
                          "Kids",
                          "Not applicable",
                          "Unspecified",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="catalog-editor-actions">
            <button className="text-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="primary" onClick={save}>
              Save classifications
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
