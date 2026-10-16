"use client";

// The Listings page's seller picker: choosing a seller shows their cars
// right away (no Apply click).
export default function BrokerSelect({
  value,
  brokers,
}: {
  value: string;
  brokers: { id: string; name: string; count: number }[];
}) {
  return (
    <select
      name="broker"
      defaultValue={value}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="select select-sm mt-1 block"
    >
      <option value="">Choose a seller…</option>
      {brokers.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} ({b.count})
        </option>
      ))}
    </select>
  );
}
